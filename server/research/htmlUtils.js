/**
 * Shared HTML → structured text helpers for Brand Brain research.
 * No external scrape deps — pure Node fetch + heuristics.
 */

export function normalizeUrl(url) {
    if (!url || !String(url).trim()) return null;
    let t = String(url).trim();
    if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
    try {
        const u = new URL(t);
        u.hash = '';
        return u.toString().replace(/\/$/, '') || u.origin;
    } catch {
        return null;
    }
}

export function decodeEntities(s) {
    return String(s || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function stripScriptsStyles(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}

export function extractTitle(html) {
    const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? decodeEntities(m[1].trim()) : '';
}

export function extractMetaDescription(html) {
    const m =
        String(html).match(
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
        ) ||
        String(html).match(
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
        );
    return m ? decodeEntities(m[1].trim()) : '';
}

export function extractHeadings(html) {
    const out = { h1: [], h2: [], h3: [] };
    for (const level of [1, 2, 3]) {
        const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'gi');
        let m;
        while ((m = re.exec(html))) {
            const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
            if (t && t.length < 200) out[`h${level}`].push(t);
        }
    }
    return out;
}

export function extractCtas(html) {
    const ctas = [];
    const buttonish =
        /<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi;
    let m;
    while ((m = buttonish.exec(html))) {
        const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        if (
            t &&
            t.length >= 2 &&
            t.length <= 48 &&
            /start|get|try|join|book|buy|demo|learn|sign|free|beta|contact|pricing|see how/i.test(
                t
            )
        ) {
            ctas.push(t);
        }
    }
    return [...new Set(ctas)].slice(0, 12);
}

export function extractListItems(html) {
    const items = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(html))) {
        const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        if (t && t.length >= 8 && t.length <= 160) items.push(t);
    }
    return [...new Set(items)].slice(0, 40);
}

export function extractQuotes(html) {
    const quotes = [];
    // blockquote
    const bq = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    let m;
    while ((m = bq.exec(html))) {
        const t = decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        if (t && t.length >= 20 && t.length <= 280) quotes.push(t);
    }
    // "..." patterns in text
    const plain = htmlToRoughMarkdown(html);
    const qm = plain.match(/[""]([^""]{20,200})[""]/g) || [];
    for (const q of qm.slice(0, 15)) {
        quotes.push(q.replace(/^[""]|[""]$/g, '').trim());
    }
    return [...new Set(quotes)].slice(0, 20);
}

export function extractPriceSignals(text) {
    const s = String(text || '');
    const hits = s.match(
        /\$\s?\d+(?:[.,]\d+)?(?:\s*\/\s*(?:mo|month|yr|year|wk|week))?|\bfree\b|\bfreemium\b|\bper month\b|\bcancel anytime\b|\bstarting at\b/gi
    );
    return [...new Set((hits || []).map((x) => x.trim()))].slice(0, 15);
}

export function htmlToRoughMarkdown(html) {
    let s = stripScriptsStyles(html);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|h1|h2|h3|h4|li|section|article|tr)>/gi, '\n');
    s = s.replace(/<h1[^>]*>/gi, '\n# ');
    s = s.replace(/<h2[^>]*>/gi, '\n## ');
    s = s.replace(/<h3[^>]*>/gi, '\n### ');
    s = s.replace(/<li[^>]*>/gi, '\n- ');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s);
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]{2,}/g, ' ');
    return s.trim();
}

/** Same-origin links prioritized for crawl */
export function extractSameOriginLinks(html, baseUrl) {
    let origin;
    let base;
    try {
        base = new URL(baseUrl);
        origin = base.origin;
    } catch {
        return [];
    }
    const hrefs = [];
    const re = /href=["']([^"'#]+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
        try {
            const u = new URL(m[1], base);
            if (u.origin !== origin) continue;
            if (/\.(pdf|png|jpe?g|gif|svg|zip|mp4|css|js)$/i.test(u.pathname)) continue;
            u.hash = '';
            hrefs.push(u.toString().replace(/\/$/, '') || u.origin);
        } catch {
            /* skip */
        }
    }
    return [...new Set(hrefs)];
}

const PAGE_PRIORITY = [
    { re: /\/(pricing|plans|bid)(\/|$)/i, score: 100, role: 'pricing' },
    { re: /\/(features|product|platform|solutions?)(\/|$)/i, score: 90, role: 'features' },
    { re: /\/(about|company|story)(\/|$)/i, score: 80, role: 'about' },
    { re: /\/(faq|help|support)(\/|$)/i, score: 75, role: 'faq' },
    { re: /\/(customers?|stories|case-stud|testimonials?)(\/|$)/i, score: 85, role: 'proof' },
    { re: /\/(blog|resources|learn)(\/|$)/i, score: 40, role: 'content' },
    { re: /\/(compare|vs|versus)(\/|$)/i, score: 70, role: 'compare' },
    { re: /\/?$/i, score: 95, role: 'home' },
];

export function scorePageUrl(url) {
    try {
        const path = new URL(url).pathname || '/';
        let best = { score: 10, role: 'other' };
        for (const p of PAGE_PRIORITY) {
            if (p.re.test(path) && p.score >= best.score) best = { score: p.score, role: p.role };
        }
        return best;
    } catch {
        return { score: 0, role: 'other' };
    }
}

export function pickCrawlTargets(homeUrl, links, maxPages = 8) {
    const home = normalizeUrl(homeUrl);
    const scored = [];
    if (home) scored.push({ url: home, ...scorePageUrl(home) });
    for (const link of links || []) {
        const n = normalizeUrl(link);
        if (!n || n === home) continue;
        scored.push({ url: n, ...scorePageUrl(n) });
    }
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const out = [];
    for (const s of scored) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        out.push(s);
        if (out.length >= maxPages) break;
    }
    return out;
}

export async function fetchHtml(url, { timeoutMs = 12000, useJinaFallback = true } = {}) {
    const target = normalizeUrl(url);
    if (!target) return { ok: false, url, error: 'Invalid URL', html: '', markdown: '' };

    const headers = {
        'User-Agent': 'GlampireOS-Research/1.0 (+agency brand research; respectful bot)',
        Accept: 'text/html,application/xhtml+xml',
    };

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(target, {
            signal: controller.signal,
            headers,
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (res.ok) {
            const html = await res.text();
            if (html && html.length > 200 && /<html|<body|<div/i.test(html)) {
                return {
                    ok: true,
                    url: target,
                    finalUrl: res.url || target,
                    html,
                    markdown: htmlToRoughMarkdown(html).slice(0, 28000),
                    title: extractTitle(html),
                    provider: 'native',
                };
            }
        }
    } catch (e) {
        if (!useJinaFallback) {
            return { ok: false, url: target, error: e.message, html: '', markdown: '' };
        }
    }

    // Optional free reader fallback (public Jina reader endpoint)
    if (useJinaFallback && process.env.RESEARCH_JINA_FALLBACK !== '0') {
        try {
            const jinaUrl = `https://r.jina.ai/${target}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs + 5000);
            const res = await fetch(jinaUrl, {
                signal: controller.signal,
                headers: { Accept: 'text/plain', 'User-Agent': headers['User-Agent'] },
            });
            clearTimeout(timer);
            if (res.ok) {
                const markdown = (await res.text()).slice(0, 28000);
                return {
                    ok: true,
                    url: target,
                    html: '',
                    markdown,
                    title: markdown.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '') || '',
                    provider: 'jina',
                };
            }
        } catch (e) {
            return { ok: false, url: target, error: e.message, html: '', markdown: '' };
        }
    }

    return { ok: false, url: target, error: 'Fetch failed', html: '', markdown: '' };
}

export function structureFromHtml(html, url, role = 'other') {
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const headings = extractHeadings(html);
    const ctas = extractCtas(html);
    const bullets = extractListItems(html);
    const quotes = extractQuotes(html);
    const markdown = htmlToRoughMarkdown(html);
    const prices = extractPriceSignals(markdown);
    return {
        url,
        role,
        title,
        description,
        headings,
        ctas,
        bullets,
        quotes,
        prices,
        markdown: markdown.slice(0, 12000),
        fetchedAt: new Date().toISOString(),
    };
}

export function structureFromMarkdown(markdown, url, role = 'other', title = '') {
    const lines = String(markdown || '').split('\n');
    const h1 = lines.filter((l) => /^#\s+/.test(l)).map((l) => l.replace(/^#\s+/, '').trim());
    const h2 = lines.filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, '').trim());
    const bullets = lines
        .filter((l) => /^[-*•]\s+/.test(l))
        .map((l) => l.replace(/^[-*•]\s+/, '').trim())
        .filter((t) => t.length >= 8 && t.length <= 160)
        .slice(0, 40);
    return {
        url,
        role,
        title: title || h1[0] || '',
        description: '',
        headings: { h1, h2, h3: [] },
        ctas: [],
        bullets,
        quotes: [],
        prices: extractPriceSignals(markdown),
        markdown: String(markdown || '').slice(0, 12000),
        fetchedAt: new Date().toISOString(),
    };
}

export function confidenceFromSources(parts = {}) {
    let score = 0;
    if (parts.sitePages >= 1) score += 15;
    if (parts.sitePages >= 3) score += 15;
    if (parts.competitors >= 1) score += 15;
    if (parts.competitors >= 3) score += 10;
    if (parts.phrases >= 5) score += 20;
    if (parts.social >= 1) score += 10;
    if (parts.docs >= 1) score += 10;
    if (parts.wizardIcp) score += 5;
    return Math.min(100, score);
}
