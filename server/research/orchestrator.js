/**
 * Parallel Brand Brain research orchestrator.
 * Fuses site + competitors + phrases + social + docs → research bundle + card payloads.
 */

import fs from 'fs';
import path from 'path';
import { researchWebsite } from './siteResearch.js';
import { researchCompetitors } from './competitorResearch.js';
import { buildPhraseBank } from './phraseBank.js';
import { researchSocial } from './socialSnapshot.js';
import { researchDocuments } from './documentExtract.js';
import { confidenceFromSources } from './htmlUtils.js';

/**
 * Run full multi-source research for a workspace.
 * @param {{ answers, assets, workspaceDir, workspaceId }} ctx
 */
export async function runBrandResearch(ctx) {
    const { answers = {}, assets = {}, workspaceDir, workspaceId } = ctx;
    const identity = answers.identity || {};
    const offer = answers.offer || {};
    const market = answers.market || {};
    const social = answers.social || {};
    const icp = answers.icp || {};
    const voice = answers.voice || {};

    const startedAt = new Date().toISOString();
    const jobs = {
        site: { status: 'pending' },
        competitors: { status: 'pending' },
        phrases: { status: 'pending' },
        social: { status: 'pending' },
        documents: { status: 'pending' },
    };

    const [site, competitors, phrases, socialRes, documents] = await Promise.all([
        (async () => {
            jobs.site.status = 'running';
            try {
                const r = await researchWebsite(identity.website, { maxPages: 8 });
                jobs.site = { status: r.ok ? 'done' : 'error', error: r.error, pageCount: r.pageCount };
                return r;
            } catch (e) {
                jobs.site = { status: 'error', error: e.message };
                return { ok: false, error: e.message, structured: null, sources: [], pages: [] };
            }
        })(),
        (async () => {
            jobs.competitors.status = 'running';
            try {
                const r = await researchCompetitors(market.competitorUrls, market.competitors);
                jobs.competitors = {
                    status: r.ok || r.count ? 'done' : 'skipped',
                    count: r.count,
                };
                return r;
            } catch (e) {
                jobs.competitors = { status: 'error', error: e.message };
                return { ok: false, competitors: [], matrix: [], whiteSpaceAngles: [], sources: [] };
            }
        })(),
        (async () => {
            jobs.phrases.status = 'running';
            try {
                // site testimonials filled after site — first pass without, second merge below
                const r = await buildPhraseBank({
                    bestCustomer: market.bestCustomer || icp.bestCustomer || '',
                    valueProp: offer.valueProp || '',
                    proofSources: market.proofSources || '',
                    reviewUrls: market.reviewUrls || '',
                    siteTestimonials: [],
                    rawNotes: answers.rawNotes || '',
                });
                jobs.phrases = { status: r.ok ? 'done' : 'skipped', count: r.count };
                return r;
            } catch (e) {
                jobs.phrases = { status: 'error', error: e.message };
                return { ok: false, phrases: [], pains: [], wins: [], objections: [], sources: [] };
            }
        })(),
        (async () => {
            jobs.social.status = 'running';
            try {
                const r = await researchSocial(social);
                jobs.social = {
                    status: r.count ? (r.ok ? 'done' : 'partial') : 'skipped',
                    count: r.count,
                };
                return r;
            } catch (e) {
                jobs.social = { status: 'error', error: e.message };
                return { ok: false, profiles: [], toneHints: [], formatHints: [], sources: [] };
            }
        })(),
        (async () => {
            jobs.documents.status = 'running';
            try {
                const r = researchDocuments(workspaceDir, assets);
                jobs.documents = {
                    status: r.count ? (r.ok ? 'done' : 'partial') : 'skipped',
                    count: r.count,
                };
                return r;
            } catch (e) {
                jobs.documents = { status: 'error', error: e.message };
                return { ok: false, documents: [], signals: {}, sources: [] };
            }
        })(),
    ]);

    // Merge site testimonials into phrase bank (post-pass, no extra network)
    if (site?.structured?.testimonials?.length) {
        const extra = await buildPhraseBank({
            siteTestimonials: site.structured.testimonials,
            bestCustomer: '',
            valueProp: '',
            proofSources: '',
            reviewUrls: '',
            rawNotes: '',
        });
        phrases.phrases = uniq([...(phrases.phrases || []), ...(extra.phrases || [])]).slice(0, 40);
        phrases.pains = uniq([...(phrases.pains || []), ...(extra.pains || [])]).slice(0, 20);
        phrases.wins = uniq([...(phrases.wins || []), ...(extra.wins || [])]).slice(0, 20);
        phrases.count = phrases.phrases.length;
        if (phrases.count) {
            phrases.ok = true;
            jobs.phrases = { status: 'done', count: phrases.count };
        }
    }

    const sources = [
        ...(site.sources || []),
        ...(competitors.sources || []),
        ...(phrases.sources || []),
        ...(socialRes.sources || []),
        ...(documents.sources || []),
    ];

    const confidence = confidenceFromSources({
        sitePages: site.pageCount || site.pages?.length || 0,
        competitors: competitors.count || 0,
        phrases: phrases.count || 0,
        social: socialRes.count || 0,
        docs: documents.count || 0,
        wizardIcp: Boolean(lines(icp.primary).length),
    });

    const fusion = fuseToBrandHints({
        answers,
        site,
        competitors,
        phrases,
        social: socialRes,
        documents,
        voice,
        offer,
        identity,
        icp,
        market,
    });

    const researchCards = buildResearchCards({
        fusion,
        site,
        competitors,
        phrases,
        social: socialRes,
        documents,
        identity,
        offer,
        market,
        confidence,
    });

    const bundle = {
        version: 2,
        workspaceId,
        startedAt,
        completedAt: new Date().toISOString(),
        jobs,
        confidence,
        sources,
        site: {
            ok: site.ok,
            url: site.site,
            pageCount: site.pageCount,
            structured: site.structured,
            pages: (site.pages || []).map((p) => ({
                url: p.url,
                role: p.role,
                title: p.title,
            })),
        },
        competitors: {
            ok: competitors.ok,
            matrix: competitors.matrix,
            list: competitors.competitors,
            whiteSpaceAngles: competitors.whiteSpaceAngles,
        },
        phrases,
        social: socialRes,
        documents: {
            ok: documents.ok,
            count: documents.count,
            signals: documents.signals,
        },
        fusion,
        researchCards,
    };

    // Persist under clients/<id>/research/
    try {
        const researchDir = path.join(workspaceDir, 'research');
        fs.mkdirSync(researchDir, { recursive: true });
        fs.writeFileSync(
            path.join(researchDir, 'latest.json'),
            JSON.stringify(bundle, null, 2)
        );
        // Keep a compact markdown digest for operators / LLMs
        fs.writeFileSync(path.join(researchDir, 'latest.md'), renderDigestMarkdown(bundle), 'utf8');
    } catch (e) {
        bundle.persistError = e.message;
    }

    return bundle;
}

function fuseToBrandHints(ctx) {
    const {
        answers,
        site,
        competitors,
        phrases,
        social,
        documents,
        voice,
        offer,
        identity,
        icp,
        market,
    } = ctx;

    const siteS = site.structured || {};
    const docS = documents.signals || {};

    const features = uniq([
        ...lines(offer.keyFeatures),
        ...(siteS.features || []).slice(0, 15),
    ]).slice(0, 25);

    const ctas = uniq([
        ...lines(answers.channels?.ctas),
        ...(siteS.ctas || []),
    ]).slice(0, 8);

    const primaryIcp = uniq([
        ...lines(icp.primary),
        ...(siteS.icpHints || []).slice(0, 4),
        ...(docS.icpHints || []).slice(0, 3),
    ]).slice(0, 8);

    const doNotSay = uniq([
        ...lines(voice.doNotSay),
        ...lines(voice.claimsWeCantMake),
        ...(docS.doNotSay || []).slice(0, 8),
    ]).slice(0, 20);

    const oneLiner =
        identity.oneLiner ||
        offer.promise ||
        siteS.oneLinerHints?.[0] ||
        siteS.oneLinerHints?.[1] ||
        '';

    const supporting =
        offer.valueProp ||
        siteS.aboutSnippets?.[0] ||
        siteS.oneLinerHints?.[1] ||
        oneLiner;

    const pricingModel =
        offer.pricingModel ||
        (siteS.pricingSignals || []).slice(0, 3).join(' · ') ||
        '';

    const buyerPhrases = uniq([
        ...(phrases.phrases || []),
        ...(phrases.pains || []).slice(0, 8),
        ...(phrases.wins || []).slice(0, 6),
    ]).slice(0, 30);

    const adAngles = uniq([
        ...(competitors.whiteSpaceAngles || []),
        buyerPhrases[0] ? `Customer language: “${buyerPhrases[0]}”` : null,
        oneLiner ? `Promise: ${oneLiner}` : null,
        features[0] ? `Feature demo: ${features[0]}` : null,
        'Before / after the old workflow',
        'Peer social proof',
        pricingModel ? `Offer clarity: ${pricingModel}` : null,
    ]).slice(0, 10);

    const colorHints = docS.colorHints || [];

    return {
        oneLiner,
        supporting,
        promise: offer.promise || oneLiner,
        features,
        ctas: ctas.length ? ctas : undefined,
        pricingModel,
        icpPrimary: primaryIcp,
        doNotSay,
        buyerPhrases,
        pains: phrases.pains || [],
        wins: phrases.wins || [],
        objections: phrases.objections || [],
        competitorMatrix: competitors.matrix || [],
        whiteSpaceAngles: competitors.whiteSpaceAngles || [],
        socialTone: social.toneHints || [],
        socialFormats: social.formatHints || [],
        adAngles,
        colorHints,
        voiceHints: docS.voiceHints || [],
        communities: lines(market.communities),
        proofSources: lines(market.proofSources),
        siteMarkdown: siteS.combinedMarkdown || '',
        docExcerpt: docS.combinedExcerpt || '',
    };
}

function buildResearchCards({
    fusion,
    site,
    competitors,
    phrases,
    social,
    documents,
    identity,
    offer,
    market,
    confidence,
}) {
    const name = identity.name || 'Brand';
    return {
        brandOverview: {
            title: 'Brand overview',
            description: 'Messaging, category, promise',
            status: 'done',
            summary: `${name} — ${identity.category || 'brand'}. ${fusion.oneLiner || ''}`.trim(),
            confidence: site.ok ? 75 : 45,
            sources: (site.sources || []).filter((s) => s.ok).slice(0, 5),
            data: {
                oneLiner: fusion.oneLiner,
                promise: fusion.promise,
                supporting: fusion.supporting,
                features: fusion.features?.slice(0, 8),
                pricing: fusion.pricingModel,
                ctas: fusion.ctas,
                pagesCrawled: site.pageCount || 0,
            },
            updatedAt: new Date().toISOString(),
        },
        yourBuyer: {
            title: 'Your buyer',
            description: 'ICP language and pains',
            status: 'done',
            summary:
                fusion.icpPrimary?.length
                    ? `Primary: ${fusion.icpPrimary.join(', ')}`
                    : 'ICP from wizard / site hints',
            confidence: phrases.ok || fusion.icpPrimary?.length ? 80 : 40,
            sources: phrases.sources || [],
            data: {
                primary: fusion.icpPrimary,
                phrases: fusion.buyerPhrases?.slice(0, 12),
                pains: fusion.pains?.slice(0, 8),
                wins: fusion.wins?.slice(0, 6),
                objections: fusion.objections?.slice(0, 6),
                bestCustomer: market?.bestCustomer || null,
            },
            updatedAt: new Date().toISOString(),
        },
        competitors: {
            title: 'Competitors',
            description: 'Adjacent players and positioning',
            status: 'done',
            summary:
                competitors.matrix?.length
                    ? `${competitors.matrix.length} mapped · white-space angles ready`
                    : 'No competitors listed yet',
            confidence: competitors.matrix?.some((m) => m.confidence === 'high') ? 75 : 35,
            sources: competitors.sources || [],
            data: {
                matrix: competitors.matrix,
                whiteSpace: fusion.whiteSpaceAngles,
                list: (competitors.list || []).map((c) => c.name),
            },
            updatedAt: new Date().toISOString(),
        },
        marketThemes: {
            title: 'Market themes',
            description: 'Pillars the market already buys',
            status: 'done',
            summary: (fusion.features || []).slice(0, 4).join(' · ') || 'Themes from offer + site',
            confidence: fusion.features?.length ? 70 : 40,
            sources: (site.sources || []).filter((s) => s.role === 'features' || s.role === 'home'),
            data: {
                features: fusion.features,
                communities: fusion.communities,
                proof: fusion.proofSources,
            },
            updatedAt: new Date().toISOString(),
        },
        adAngles: {
            title: 'Ad angles',
            description: 'Hooks worth testing first',
            status: 'done',
            summary: `${(fusion.adAngles || []).length} angles ready to test`,
            confidence: Math.min(90, 40 + (fusion.adAngles?.length || 0) * 8),
            sources: [],
            data: { angles: fusion.adAngles },
            updatedAt: new Date().toISOString(),
        },
        visualIdentity: {
            title: 'Visual identity',
            description: 'Photo rules and palette',
            status: 'done',
            summary: fusion.colorHints?.length
                ? `Brand colors detected · photo rules from kit`
                : 'Photo rules from brand kit',
            confidence: documents.ok ? 70 : 50,
            sources: documents.sources || [],
            data: {
                colorHints: fusion.colorHints,
                voiceHints: fusion.voiceHints,
            },
            updatedAt: new Date().toISOString(),
        },
        strategy: {
            title: 'Strategy',
            description: 'How we win in content',
            status: 'done',
            summary:
                fusion.socialTone?.length || fusion.whiteSpaceAngles?.length
                    ? 'Voice + white space fused into content system'
                    : 'Voice-first content system: pain → demo → trust',
            confidence,
            sources: social.sources || [],
            data: {
                tone: fusion.socialTone,
                formats: fusion.socialFormats,
                whiteSpace: fusion.whiteSpaceAngles,
                doNotSay: fusion.doNotSay?.slice(0, 10),
            },
            updatedAt: new Date().toISOString(),
        },
        marketPosition: {
            title: 'Market position',
            description: 'Where this brand sits',
            status: 'done',
            summary: fusion.oneLiner || fusion.promise || 'Position from promise',
            confidence: fusion.oneLiner ? 70 : 40,
            sources: (site.sources || []).slice(0, 3),
            data: {
                position: fusion.oneLiner,
                pricing: fusion.pricingModel,
                vsCompetitors: (competitors.matrix || []).slice(0, 5),
            },
            updatedAt: new Date().toISOString(),
        },
        socialPulse: {
            title: 'Social pulse',
            description: 'Public handles and format hints',
            status: social.count ? 'done' : 'skipped',
            summary: social.count
                ? `${social.count} handle(s) · ${(social.formatHints || []).join(', ') || 'formats TBD'}`
                : 'No social handles provided',
            confidence: social.ok ? 60 : 0,
            sources: social.sources || [],
            data: {
                profiles: social.profiles,
                toneHints: social.toneHints,
                formatHints: social.formatHints,
            },
            updatedAt: new Date().toISOString(),
        },
        sourceMap: {
            title: 'Source map',
            description: 'What we scraped and confidence',
            status: 'done',
            summary: `Overall confidence ${confidence}% · ${(site.pageCount || 0)} site pages · ${competitors.count || 0} competitors · ${phrases.count || 0} phrases`,
            confidence,
            sources,
            data: {
                confidence,
                sitePages: site.pageCount || 0,
                competitors: competitors.count || 0,
                phrases: phrases.count || 0,
                social: social.count || 0,
                documents: documents.count || 0,
                sources,
            },
            updatedAt: new Date().toISOString(),
        },
    };
}

function renderDigestMarkdown(bundle) {
    const f = bundle.fusion || {};
    const lines = [
        `# Brand Brain research — ${bundle.workspaceId}`,
        ``,
        `Confidence: **${bundle.confidence}%**`,
        `Completed: ${bundle.completedAt}`,
        ``,
        `## Promise`,
        f.oneLiner || '_none_',
        ``,
        `## Supporting`,
        f.supporting || '_none_',
        ``,
        `## ICP`,
        ...(f.icpPrimary || []).map((x) => `- ${x}`),
        ``,
        `## Buyer phrases`,
        ...(f.buyerPhrases || []).slice(0, 15).map((x) => `- ${x}`),
        ``,
        `## Features`,
        ...(f.features || []).slice(0, 12).map((x) => `- ${x}`),
        ``,
        `## Competitor matrix`,
        ...(f.competitorMatrix || []).map(
            (c) => `- **${c.name}**: ${c.claim} ${c.cta ? `· CTA: ${c.cta}` : ''}`
        ),
        ``,
        `## White space / angles`,
        ...(f.adAngles || []).map((x) => `- ${x}`),
        ``,
        `## Do not say`,
        ...(f.doNotSay || []).map((x) => `- ${x}`),
        ``,
        `## Sources`,
        ...(bundle.sources || [])
            .filter((s) => s.ok)
            .slice(0, 30)
            .map((s) => `- ${s.type}: ${s.url || s.path || s.network || ''}`),
    ];
    return lines.join('\n');
}

function lines(value) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    return String(value || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const a of arr || []) {
        if (a == null || a === '') continue;
        const k = String(a).toLowerCase().trim();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(typeof a === 'string' ? a.trim() : a);
    }
    return out;
}
