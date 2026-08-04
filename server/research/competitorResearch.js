/**
 * Competitor URL pack → positioning matrix + white-space angles.
 */

import {
    normalizeUrl,
    fetchHtml,
    structureFromHtml,
    structureFromMarkdown,
} from './htmlUtils.js';

function linesToList(value) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    return String(value || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * @param {string|string[]} competitorUrls
 * @param {string[]} competitorNames
 */
export async function researchCompetitors(competitorUrls, competitorNames = []) {
    const urls = linesToList(competitorUrls)
        .map(normalizeUrl)
        .filter(Boolean)
        .slice(0, 7);

    const names = linesToList(competitorNames);
    const entries = [];
    const sources = [];

    // Name-only competitors still appear in matrix
    for (const name of names) {
        if (!entries.find((e) => e.name.toLowerCase() === name.toLowerCase())) {
            entries.push({
                name,
                url: null,
                promise: '',
                ctas: [],
                features: [],
                pricing: [],
                categoryHints: [],
                ok: false,
                source: 'name-only',
            });
        }
    }

    for (const url of urls) {
        const fetched = await fetchHtml(url);
        await sleep(150);
        if (!fetched.ok) {
            sources.push({ type: 'competitor', url, ok: false, error: fetched.error });
            const host = safeHost(url);
            entries.push({
                name: host,
                url,
                promise: '',
                ctas: [],
                features: [],
                pricing: [],
                categoryHints: [],
                ok: false,
                error: fetched.error,
                source: 'url',
            });
            continue;
        }

        const page = fetched.html
            ? structureFromHtml(fetched.html, fetched.finalUrl || url, 'competitor')
            : structureFromMarkdown(fetched.markdown, url, 'competitor', fetched.title);

        const name =
            page.title?.split(/[|\-–—]/)[0]?.trim() ||
            safeHost(url);

        const promise =
            page.description ||
            page.headings?.h1?.[0] ||
            page.headings?.h2?.[0] ||
            '';

        entries.push({
            name,
            url: page.url,
            promise: String(promise).slice(0, 200),
            ctas: (page.ctas || []).slice(0, 6),
            features: (page.bullets || []).slice(0, 12),
            pricing: (page.prices || []).slice(0, 8),
            categoryHints: (page.headings?.h2 || []).slice(0, 6),
            ok: true,
            source: 'url',
            provider: fetched.provider,
        });
        sources.push({
            type: 'competitor',
            url: page.url,
            ok: true,
            title: page.title,
            provider: fetched.provider,
        });
    }

    // Dedupe by host/name
    const deduped = dedupeCompetitors(entries);
    const matrix = buildMatrix(deduped);
    const whiteSpace = suggestWhiteSpace(deduped);

    return {
        ok: deduped.some((e) => e.ok) || deduped.length > 0,
        competitors: deduped,
        matrix,
        whiteSpaceAngles: whiteSpace,
        sources,
        count: deduped.length,
    };
}

function safeHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function dedupeCompetitors(entries) {
    const out = [];
    const seen = new Set();
    for (const e of entries) {
        const key = (e.url ? safeHost(e.url) : e.name).toLowerCase();
        if (seen.has(key)) {
            // prefer ok:true
            const idx = out.findIndex((x) => (x.url ? safeHost(x.url) : x.name).toLowerCase() === key);
            if (idx >= 0 && e.ok && !out[idx].ok) out[idx] = e;
            continue;
        }
        seen.add(key);
        out.push(e);
    }
    return out.slice(0, 10);
}

function buildMatrix(competitors) {
    return competitors.map((c) => ({
        name: c.name,
        url: c.url,
        claim: c.promise || '(not extracted)',
        cta: c.ctas?.[0] || '',
        pricing: c.pricing?.[0] || '',
        topFeatures: (c.features || []).slice(0, 3),
        confidence: c.ok ? 'high' : c.url ? 'low' : 'name-only',
    }));
}

function suggestWhiteSpace(competitors) {
    const angles = [];
    const claims = competitors.map((c) => (c.promise || '').toLowerCase()).filter(Boolean);
    const allFeatures = competitors.flatMap((c) => c.features || []).map((f) => f.toLowerCase());

    if (claims.some((c) => /enterprise|platform|all-in-one/.test(c))) {
        angles.push('Simple & focused — not another bloated all-in-one platform');
    }
    if (claims.some((c) => /ai|automat/.test(c))) {
        angles.push('Human-quality outcomes — AI as copilot, not the product category');
    }
    if (allFeatures.some((f) => /price|cheap|afford/.test(f))) {
        angles.push('Premium practical value — outcome over race-to-bottom pricing');
    }
    angles.push('Own the job-to-be-done the market under-serves');
    angles.push('Peer voice from real customers — not brochure SaaS');
    angles.push('Show the before/after friction competitors gloss over');

    return [...new Set(angles)].slice(0, 8);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
