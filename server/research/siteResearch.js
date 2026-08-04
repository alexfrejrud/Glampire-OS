/**
 * Multi-page site research → structured Brand OS signals.
 */

import {
    normalizeUrl,
    fetchHtml,
    extractSameOriginLinks,
    pickCrawlTargets,
    structureFromHtml,
    structureFromMarkdown,
} from './htmlUtils.js';

/**
 * Crawl priority pages on the client website.
 * @returns {{ ok, site, pages, structured, sources, error? }}
 */
export async function researchWebsite(websiteUrl, { maxPages = 8 } = {}) {
    const home = normalizeUrl(websiteUrl);
    if (!home) {
        return {
            ok: false,
            error: 'No website URL',
            pages: [],
            structured: emptySiteStructure(),
            sources: [],
        };
    }

    const homeFetch = await fetchHtml(home);
    if (!homeFetch.ok) {
        return {
            ok: false,
            error: homeFetch.error || 'Homepage fetch failed',
            pages: [],
            structured: emptySiteStructure(),
            sources: [{ type: 'website', url: home, ok: false, error: homeFetch.error }],
        };
    }

    const links = homeFetch.html
        ? extractSameOriginLinks(homeFetch.html, homeFetch.finalUrl || home)
        : [];
    const targets = pickCrawlTargets(homeFetch.finalUrl || home, links, maxPages);

    const pages = [];
    const sources = [];

    // Ensure home first
    for (const t of targets) {
        let pageFetch = t.url === home || t.url === homeFetch.finalUrl ? homeFetch : null;
        if (!pageFetch) {
            pageFetch = await fetchHtml(t.url);
            // polite delay
            await sleep(150);
        }
        if (!pageFetch.ok) {
            sources.push({ type: 'website', url: t.url, role: t.role, ok: false, error: pageFetch.error });
            continue;
        }
        const structured = pageFetch.html
            ? structureFromHtml(pageFetch.html, pageFetch.finalUrl || t.url, t.role)
            : structureFromMarkdown(pageFetch.markdown, t.url, t.role, pageFetch.title);
        pages.push(structured);
        sources.push({
            type: 'website',
            url: structured.url,
            role: t.role,
            ok: true,
            provider: pageFetch.provider,
            title: structured.title,
        });
    }

    const fused = fuseSitePages(pages, home);
    return {
        ok: pages.length > 0,
        site: home,
        pages,
        structured: fused,
        sources,
        pageCount: pages.length,
    };
}

function emptySiteStructure() {
    return {
        nameHints: [],
        oneLinerHints: [],
        categoryHints: [],
        features: [],
        ctas: [],
        pricingSignals: [],
        testimonials: [],
        icpHints: [],
        faqSnippets: [],
        aboutSnippets: [],
        combinedMarkdown: '',
    };
}

function fuseSitePages(pages, home) {
    const out = emptySiteStructure();
    const mdParts = [];

    for (const p of pages) {
        mdParts.push(`\n\n## [${p.role}] ${p.title || p.url}\n${p.markdown || ''}`);
        out.ctas.push(...(p.ctas || []));
        out.features.push(...(p.bullets || []));
        out.pricingSignals.push(...(p.prices || []));
        out.testimonials.push(...(p.quotes || []));
        if (p.description) out.oneLinerHints.push(p.description);
        if (p.headings?.h1?.length) out.oneLinerHints.push(...p.headings.h1.slice(0, 2));
        if (p.role === 'features') {
            out.features.push(...(p.headings?.h2 || []).slice(0, 12));
        }
        if (p.role === 'faq') {
            out.faqSnippets.push(...(p.headings?.h2 || []).slice(0, 10));
            out.faqSnippets.push(...(p.bullets || []).slice(0, 10));
        }
        if (p.role === 'about') {
            out.aboutSnippets.push(...(p.bullets || []).slice(0, 8));
            if (p.description) out.aboutSnippets.push(p.description);
        }
        if (p.role === 'proof') {
            out.testimonials.push(...(p.quotes || []));
            out.testimonials.push(...(p.bullets || []).slice(0, 8));
        }
    }

    // Heuristic ICP from combined text
    const blob = mdParts.join('\n').toLowerCase();
    const icpPatterns = [
        [/solo\s+(?:operators?|founders?|owners?)/g, 'Solo operators'],
        [/small\s+business(?:es)?/g, 'Small businesses'],
        [/enterprise/g, 'Enterprise'],
        [/agenc(?:y|ies)/g, 'Agencies'],
        [/creator/g, 'Creators'],
        [/contractor/g, 'Contractors'],
        [/founder/g, 'Founders'],
        [/marketer/g, 'Marketers'],
        [/developer/g, 'Developers'],
        [/team(s)?\s+of/g, 'Teams'],
        [/ecommerce|e-commerce|shopify/g, 'E-commerce brands'],
        [/saas/g, 'SaaS buyers'],
    ];
    for (const [re, label] of icpPatterns) {
        if (re.test(blob)) out.icpHints.push(label);
    }

    out.ctas = uniq(out.ctas).slice(0, 12);
    out.features = uniq(out.features).slice(0, 30);
    out.pricingSignals = uniq(out.pricingSignals).slice(0, 12);
    out.testimonials = uniq(out.testimonials).slice(0, 20);
    out.oneLinerHints = uniq(out.oneLinerHints).slice(0, 8);
    out.icpHints = uniq(out.icpHints).slice(0, 12);
    out.faqSnippets = uniq(out.faqSnippets).slice(0, 15);
    out.aboutSnippets = uniq(out.aboutSnippets).slice(0, 12);
    out.combinedMarkdown = mdParts.join('\n').slice(0, 40000);
    out.homeUrl = home;

    return out;
}

function uniq(arr) {
    return [...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean))];
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
