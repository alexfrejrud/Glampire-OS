/**
 * Public social handle snapshot (no OAuth required for v1 research).
 * Best-effort HTML/meta extract; incomplete pages still produce useful stubs.
 */

import { normalizeUrl, fetchHtml, extractTitle, extractMetaDescription, htmlToRoughMarkdown } from './htmlUtils.js';

const NETWORKS = [
    {
        id: 'instagram',
        buildUrl: (h) => `https://www.instagram.com/${cleanHandle(h)}/`,
    },
    {
        id: 'tiktok',
        buildUrl: (h) => `https://www.tiktok.com/@${cleanHandle(h)}`,
    },
    {
        id: 'linkedin',
        buildUrl: (h) =>
            String(h).includes('linkedin.com')
                ? normalizeUrl(h)
                : `https://www.linkedin.com/company/${cleanHandle(h)}/`,
    },
    {
        id: 'youtube',
        buildUrl: (h) =>
            String(h).includes('youtube.com') || String(h).includes('youtu.be')
                ? normalizeUrl(h)
                : `https://www.youtube.com/@${cleanHandle(h)}`,
    },
    {
        id: 'x',
        buildUrl: (h) =>
            String(h).includes('x.com') || String(h).includes('twitter.com')
                ? normalizeUrl(h)
                : `https://x.com/${cleanHandle(h)}`,
    },
];

function cleanHandle(h) {
    return String(h || '')
        .trim()
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?/, '')
        .replace(/\/$/, '')
        .split('/')
        .pop();
}

/**
 * @param {object} social answers.social { instagram, tiktok, linkedin, youtube, x }
 */
export async function researchSocial(social = {}) {
    const profiles = [];
    const sources = [];

    for (const net of NETWORKS) {
        const raw = social[net.id];
        if (!raw || !String(raw).trim()) continue;
        const url = net.buildUrl(raw);
        if (!url) continue;

        const fetched = await fetchHtml(url, { timeoutMs: 10000, useJinaFallback: true });
        await sleep(200);

        if (!fetched.ok) {
            profiles.push({
                network: net.id,
                handle: cleanHandle(raw),
                url,
                ok: false,
                error: fetched.error,
                bio: '',
                title: '',
            });
            sources.push({ type: 'social', network: net.id, url, ok: false, error: fetched.error });
            continue;
        }

        const title = fetched.title || extractTitle(fetched.html || '');
        const bio =
            extractMetaDescription(fetched.html || '') ||
            firstMeaningfulLine(fetched.markdown || htmlToRoughMarkdown(fetched.html || ''));

        profiles.push({
            network: net.id,
            handle: cleanHandle(raw),
            url: fetched.finalUrl || url,
            ok: true,
            title: title.slice(0, 120),
            bio: String(bio || '').slice(0, 280),
            provider: fetched.provider,
        });
        sources.push({
            type: 'social',
            network: net.id,
            url: fetched.finalUrl || url,
            ok: true,
            provider: fetched.provider,
        });
    }

    const toneHints = deriveTone(profiles);
    const formatHints = deriveFormats(profiles);

    return {
        ok: profiles.some((p) => p.ok),
        profiles,
        toneHints,
        formatHints,
        sources,
        count: profiles.length,
    };
}

function firstMeaningfulLine(md) {
    return (
        String(md || '')
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length > 40 && !/^#/.test(l) && !/^http/.test(l)) || ''
    );
}

function deriveTone(profiles) {
    const blob = profiles
        .map((p) => `${p.title} ${p.bio}`)
        .join(' ')
        .toLowerCase();
    const hints = [];
    if (/founder|build|ship|behind the scenes/.test(blob)) hints.push('founder-led');
    if (/tip|how to|learn|guide/.test(blob)) hints.push('educational');
    if (/join|beta|waitlist|launch/.test(blob)) hints.push('launch / conversion');
    if (/community|together|crew/.test(blob)) hints.push('community peer');
    if (!hints.length) hints.push('practical brand voice (from handles)');
    return hints;
}

function deriveFormats(profiles) {
    const nets = new Set(profiles.map((p) => p.network));
    const formats = [];
    if (nets.has('tiktok') || nets.has('instagram')) formats.push('short-form vertical (reels/tiktok)');
    if (nets.has('linkedin')) formats.push('professional feed posts / carousels');
    if (nets.has('youtube')) formats.push('long-form + shorts');
    if (nets.has('x')) formats.push('short text hooks / threads');
    return formats;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
