/**
 * Customer language bank — reviews, wizard notes, proof text.
 * Highest ROI signal for ICP hooks and captions.
 */

import { fetchHtml, htmlToRoughMarkdown, normalizeUrl } from './htmlUtils.js';

function linesToList(value) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    return String(value || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Build phrase bank from wizard free text + optional review URLs.
 */
export async function buildPhraseBank({
    bestCustomer = '',
    valueProp = '',
    proofSources = '',
    reviewUrls = '',
    siteTestimonials = [],
    rawNotes = '',
} = {}) {
    const phrases = [];
    const pains = [];
    const wins = [];
    const objections = [];
    const sources = [];

    const seedTexts = [
        bestCustomer,
        valueProp,
        proofSources,
        rawNotes,
        ...(siteTestimonials || []),
    ].filter(Boolean);

    for (const t of seedTexts) {
        extractFromText(t, { phrases, pains, wins, objections });
    }
    if (seedTexts.length) {
        sources.push({ type: 'wizard_text', ok: true, count: seedTexts.length });
    }

    const urls = linesToList(reviewUrls).map(normalizeUrl).filter(Boolean).slice(0, 5);
    for (const url of urls) {
        const fetched = await fetchHtml(url);
        await sleep(150);
        if (!fetched.ok) {
            sources.push({ type: 'review_url', url, ok: false, error: fetched.error });
            continue;
        }
        const text = fetched.markdown || htmlToRoughMarkdown(fetched.html || '');
        extractFromText(text, { phrases, pains, wins, objections });
        sources.push({
            type: 'review_url',
            url,
            ok: true,
            provider: fetched.provider,
            chars: text.length,
        });
    }

    return {
        ok: phrases.length + pains.length + wins.length > 0,
        phrases: uniq(phrases).slice(0, 40),
        pains: uniq(pains).slice(0, 20),
        wins: uniq(wins).slice(0, 20),
        objections: uniq(objections).slice(0, 15),
        sources,
        count: uniq(phrases).length,
    };
}

function extractFromText(text, bags) {
    const s = String(text || '');
    if (!s.trim()) return;

    // Quoted lines
    const quotes = s.match(/[""']([^""']{16,180})[""']/g) || [];
    for (const q of quotes) {
        bags.phrases.push(q.replace(/^[""']|[""']$/g, '').trim());
    }

    const sentences = s
        .split(/(?<=[.!?])\s+|\n+/)
        .map((x) => x.replace(/\s+/g, ' ').trim())
        .filter((x) => x.length >= 20 && x.length <= 200);

    for (const sent of sentences) {
        const lower = sent.toLowerCase();
        if (
            /i (used to|was|couldn't|could not|hate|struggled|wasted)|before |always |never |sick of|tired of|finally |now i |game.?changer|saved me|used to live in/i.test(
                lower
            )
        ) {
            bags.phrases.push(sent);
        }
        if (
            /pain|chaos|overwhelm|late|lost|scatter|manual|busywork|friction|expensive|slow|confus/i.test(
                lower
            )
        ) {
            bags.pains.push(sent);
        }
        if (/finally|now i|love|saved|faster|simple|easy|worth|recommend/i.test(lower)) {
            bags.wins.push(sent);
        }
        if (/but |however |worried|expensive|switch|learn|integrat|support/i.test(lower)) {
            bags.objections.push(sent);
        }
    }

    // Bullet-like lines
    for (const line of s.split('\n')) {
        const t = line.replace(/^[-*•\d.)\s]+/, '').trim();
        if (t.length >= 16 && t.length <= 140) bags.phrases.push(t);
    }
}

function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const a of arr || []) {
        const k = String(a).toLowerCase().trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(String(a).trim());
    }
    return out;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
