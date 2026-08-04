/**
 * Glampire OS — Client onboarding + Brand Brain compiler
 *
 * Flow: draft → (wizard answers) → researching → review → ready
 * Artifacts live under clients/<id>/:
 *   onboarding.json       answers + research + completeness
 *   brand.draft.json      AI/rule compiled Brand OS (pre-lock)
 *   content.draft.json    pillars + pack seed (pre-lock)
 *   brand.json / content.json  locked sources of truth
 */

import fs from 'fs';
import path from 'path';
import {
    getActiveWorkspaceId,
    getWorkspaceDir,
    workspaceExists,
    getBrand,
    getWorkspacePublic,
    loadContentMeta,
    CLIENTS_ROOT,
} from './brandLoader.js';
import { runBrandResearch } from './research/orchestrator.js';

const ONBOARDING_FILE = 'onboarding.json';
const BRAND_DRAFT = 'brand.draft.json';
const CONTENT_DRAFT = 'content.draft.json';

export const WORKSPACE_STATUSES = ['draft', 'researching', 'review', 'ready', 'paused', 'active'];

export const ONBOARDING_STEPS = [
    {
        id: 'identity',
        label: 'Identity',
        description: 'Name, site, category, one-liner',
        weight: 12,
    },
    {
        id: 'offer',
        label: 'Offer truth',
        description: 'Value prop, features, pricing',
        weight: 14,
    },
    {
        id: 'icp',
        label: 'Who + not who',
        description: 'ICP priority and exclusions',
        weight: 14,
    },
    {
        id: 'market',
        label: 'Market & signals',
        description: 'Competitors, social, reviews, proof',
        weight: 12,
    },
    {
        id: 'voice',
        label: 'Voice locks',
        description: 'Tone, do-not-say, claim limits',
        weight: 14,
    },
    {
        id: 'brandkit',
        label: 'Brand kit',
        description: 'Colors, photo style, assets',
        weight: 16,
    },
    {
        id: 'channels',
        label: 'Channels',
        description: 'Platforms, formats, publish profile',
        weight: 10,
    },
    {
        id: 'research',
        label: 'Research',
        description: 'Brand brain + market map',
        weight: 5,
    },
    {
        id: 'review',
        label: 'Review & lock',
        description: 'Approve Brand OS for production',
        weight: 5,
    },
];

const STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);

const DEFAULT_TEXT_MODELS = [
    'grok-4-latest',
    'grok-4.5',
    'grok-3-latest',
    'grok-2-latest',
    'grok-3-mini-fast',
];

function readJson(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.warn('[onboarding] bad json', filePath, e.message);
    }
    return fallback;
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function linesToList(value) {
    if (Array.isArray(value)) {
        return value.map((s) => String(s).trim()).filter(Boolean);
    }
    return String(value || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function emptyAnswers(seed = {}) {
    return {
        identity: {
            name: seed.name || '',
            website: seed.website || '',
            oneLiner: seed.oneLiner || '',
            category: seed.category || '',
        },
        offer: {
            valueProp: seed.valueProp || '',
            promise: seed.promise || seed.oneLiner || '',
            keyFeatures: seed.keyFeatures || '',
            pricingModel: seed.pricingModel || '',
        },
        icp: {
            primary: seed.primary || '',
            secondary: seed.secondary || '',
            later: seed.later || '',
            exclusions: seed.exclusions || '',
        },
        market: {
            competitors: seed.competitors || '',
            competitorUrls: seed.competitorUrls || '',
            communities: seed.communities || '',
            proofSources: seed.proofSources || '',
            reviewUrls: seed.reviewUrls || '',
            bestCustomer: seed.bestCustomer || '',
        },
        social: {
            instagram: seed.instagram || '',
            tiktok: seed.tiktok || '',
            linkedin: seed.linkedin || '',
            youtube: seed.youtube || '',
            x: seed.x || '',
        },
        voice: {
            tone: seed.tone || 'practical, honest, specific — not fluffy SaaS',
            doNotSay: seed.doNotSay || '',
            claimsWeCantMake: seed.claimsWeCantMake || '',
        },
        brandkit: {
            brandColor: seed.brandColor || '#111111',
            accentColor: seed.accentColor || '#737373',
            photographyStyle:
                seed.photographyStyle ||
                'documentary commercial photography, authentic subjects, natural light, single clear subject, intentional negative space for text overlay',
            imageNegatives:
                seed.imageNegatives ||
                'no text of any kind, no logos painted in scene, no fake UI gibberish, no stock-photo clichés',
            compositionNotes:
                seed.compositionNotes ||
                'One hero moment, clean negative space for later overlay, medium shot preferred.',
            notes: seed.visualNotes || '',
        },
        channels: {
            platforms: seed.platforms || ['instagram', 'tiktok', 'facebook', 'linkedin'],
            formats: seed.formats || ['post', 'carousel', 'reel'],
            uploadPostUser: seed.uploadPostUser || '',
            packIds: seed.packIds || ['weekly', 'reels', 'carousels'],
        },
        rawNotes: seed.rawNotes || '',
    };
}

function emptyResearch() {
    return {
        status: 'idle',
        startedAt: null,
        completedAt: null,
        error: null,
        confidence: 0,
        jobs: null,
        cards: {
            brandOverview: cardShell('Brand overview', 'Messaging, category, promise'),
            yourBuyer: cardShell('Your buyer', 'ICP language and pains'),
            competitors: cardShell('Competitors', 'Adjacent players and positioning'),
            marketThemes: cardShell('Market themes', 'Pillars the market already buys'),
            adAngles: cardShell('Ad angles', 'Hooks worth testing first'),
            visualIdentity: cardShell('Visual identity', 'Photo rules and palette'),
            strategy: cardShell('Strategy', 'How we win in content'),
            marketPosition: cardShell('Market position', 'Where this brand sits'),
            socialPulse: cardShell('Social pulse', 'Public handles and format hints'),
            sourceMap: cardShell('Source map', 'What we scraped and confidence'),
        },
        scraped: {
            websiteUrl: null,
            websiteMarkdown: '',
            extracted: null,
        },
        bundlePath: null,
    };
}

function cardShell(title, description) {
    return {
        title,
        description,
        status: 'pending', // pending | researching | done | error | skipped
        summary: '',
        data: null,
        sources: [],
        confidence: null,
        updatedAt: null,
    };
}

export function emptyOnboardingState(seed = {}) {
    return {
        version: 1,
        step: 'identity',
        stepsCompleted: [],
        answers: emptyAnswers(seed),
        assets: {
            logo: null,
            brandGuide: null,
            screens: [],
            refs: [],
        },
        research: emptyResearch(),
        completeness: { score: 0, blocks: {}, ready: false, locked: false },
        compiledAt: null,
        lockedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

export function onboardingPath(id = getActiveWorkspaceId()) {
    return path.join(getWorkspaceDir(id), ONBOARDING_FILE);
}

export function ensureOnboarding(id = getActiveWorkspaceId(), seed = {}) {
    if (!workspaceExists(id)) {
        const err = new Error(`Unknown workspace: ${id}`);
        err.code = 'UNKNOWN_WORKSPACE';
        throw err;
    }
    const file = onboardingPath(id);
    let state = readJson(file, null);
    if (!state) {
        const brand = getBrand(id);
        state = emptyOnboardingState({
            name: brand.name || seed.name || id,
            website: brand.website || seed.website || '',
            oneLiner: brand.oneLiner || seed.oneLiner || '',
            category: brand.category || seed.category || '',
            ...seed,
        });
        // Seed identity from workspace meta if present
        const meta = readJson(path.join(getWorkspaceDir(id), 'workspace.json'), {});
        if (meta?.name) state.answers.identity.name = meta.name;
        if (meta?.oneLiner) state.answers.identity.oneLiner = meta.oneLiner;
        if (meta?.category) state.answers.identity.category = meta.category;
        state.completeness = scoreCompleteness(state);
        writeJson(file, state);
    } else {
        // Migrate missing answer sections / research cards
        const fresh = emptyAnswers();
        state.answers = state.answers || {};
        for (const key of Object.keys(fresh)) {
            if (key === 'rawNotes') {
                if (state.answers.rawNotes == null) state.answers.rawNotes = '';
                continue;
            }
            state.answers[key] = { ...fresh[key], ...(state.answers[key] || {}) };
        }
        const baseCards = emptyResearch().cards;
        state.research = state.research || emptyResearch();
        state.research.cards = { ...baseCards, ...(state.research.cards || {}) };
    }
    return state;
}

export function loadOnboarding(id = getActiveWorkspaceId()) {
    return ensureOnboarding(id);
}

export function saveOnboarding(state, id = getActiveWorkspaceId()) {
    state.updatedAt = new Date().toISOString();
    state.completeness = scoreCompleteness(state);
    writeJson(onboardingPath(id), state);
    return state;
}

export function updateWorkspaceMeta(partial, id = getActiveWorkspaceId()) {
    const dir = getWorkspaceDir(id);
    const metaPath = path.join(dir, 'workspace.json');
    const meta = readJson(metaPath, {
        id,
        name: id,
        slug: id,
        status: 'draft',
        createdAt: new Date().toISOString(),
    });
    const next = { ...meta, ...partial, id: meta.id || id };
    writeJson(metaPath, next);
    return next;
}

export function getWorkspaceStatus(id = getActiveWorkspaceId()) {
    const meta = readJson(path.join(getWorkspaceDir(id), 'workspace.json'), {});
    return meta.status || 'active';
}

/** Completeness scoring — must hit ~80 to lock comfortably */
export function scoreCompleteness(state) {
    const a = state?.answers || emptyAnswers();
    const assets = state?.assets || {};
    const blocks = {};

    const messagingOk =
        Boolean(a.identity?.name?.trim()) &&
        Boolean(a.identity?.oneLiner?.trim() || a.offer?.promise?.trim()) &&
        Boolean(a.identity?.category?.trim() || a.offer?.valueProp?.trim());
    blocks.messaging = {
        label: 'Messaging',
        weight: 20,
        score: messagingOk ? 20 : a.identity?.name ? 8 : 0,
        ready: messagingOk,
    };

    const primary = linesToList(a.icp?.primary);
    const icpOk = primary.length >= 1;
    blocks.icp = {
        label: 'ICP',
        weight: 15,
        score: icpOk ? (linesToList(a.icp?.exclusions).length ? 15 : 12) : 0,
        ready: icpOk,
    };

    const doNot = linesToList(a.voice?.doNotSay);
    const claims = linesToList(a.voice?.claimsWeCantMake);
    const guardOk = doNot.length + claims.length >= 3;
    blocks.guardrails = {
        label: 'Guardrails',
        weight: 15,
        score: guardOk ? 15 : doNot.length || claims.length ? 7 : 0,
        ready: guardOk,
    };

    const hasColors = Boolean(a.brandkit?.brandColor);
    const hasPhoto = Boolean(a.brandkit?.photographyStyle?.trim());
    const hasLogo = Boolean(assets.logo);
    let visualScore = 0;
    if (hasColors) visualScore += 6;
    if (hasPhoto) visualScore += 8;
    if (hasLogo) visualScore += 6;
    blocks.visual = {
        label: 'Visual system',
        weight: 20,
        score: visualScore,
        ready: hasColors && hasPhoto,
    };

    const features = linesToList(a.offer?.keyFeatures);
    const pillarsReady =
        Boolean(a.offer?.valueProp?.trim() || a.offer?.promise?.trim()) && features.length >= 1;
    blocks.content = {
        label: 'Content system',
        weight: 15,
        score: pillarsReady ? 15 : a.offer?.valueProp ? 6 : 0,
        ready: pillarsReady,
    };

    const platforms = a.channels?.platforms || [];
    blocks.publish = {
        label: 'Publish',
        weight: 10,
        score: platforms.length ? 10 : 0,
        ready: platforms.length > 0,
    };

    const proofCount =
        (assets.screens?.length || 0) + (assets.refs?.length || 0) + (assets.brandGuide ? 1 : 0);
    blocks.proof = {
        label: 'Proof assets',
        weight: 5,
        score: proofCount >= 1 ? 5 : 0,
        ready: proofCount >= 1,
    };

    const score = Object.values(blocks).reduce((sum, b) => sum + (b.score || 0), 0);
    const locked = Boolean(state?.lockedAt);
    const ready = locked || score >= 80;

    return { score, blocks, ready, locked, threshold: 80 };
}

export function mergeAnswers(state, partialAnswers = {}) {
    const next = { ...state, answers: { ...state.answers } };
    for (const [key, value] of Object.entries(partialAnswers)) {
        if (key === 'rawNotes') {
            next.answers.rawNotes = value;
            continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            next.answers[key] = { ...(next.answers[key] || {}), ...value };
        } else {
            next.answers[key] = value;
        }
    }
    return next;
}

export function saveStepAnswers(stepId, answersPartial, id = getActiveWorkspaceId()) {
    let state = loadOnboarding(id);
    if (answersPartial && typeof answersPartial === 'object') {
        // Allow { identity: {...} } or flat step payload
        if (answersPartial[stepId] || Object.keys(answersPartial).some((k) => STEP_IDS.includes(k))) {
            state = mergeAnswers(state, answersPartial);
        } else {
            state = mergeAnswers(state, { [stepId]: answersPartial });
        }
    }
    if (stepId && STEP_IDS.includes(stepId)) {
        state.step = stepId;
        if (!state.stepsCompleted.includes(stepId) && stepId !== 'research' && stepId !== 'review') {
            // mark prior steps complete when advancing past them later
        }
    }

    // Sync identity into workspace meta early
    const identity = state.answers.identity || {};
    if (identity.name || identity.oneLiner || identity.category) {
        updateWorkspaceMeta(
            {
                name: identity.name || undefined,
                oneLiner: identity.oneLiner || undefined,
                category: identity.category || undefined,
            },
            id
        );
        // Light brand.json sync so kit UI isn't empty
        patchBrandLive(
            {
                name: identity.name || undefined,
                website: identity.website || undefined,
                oneLiner: identity.oneLiner || undefined,
                category: identity.category || undefined,
                promise: state.answers.offer?.promise || identity.oneLiner || undefined,
            },
            id
        );
    }

    // Publish profile
    const ch = state.answers.channels || {};
    if (ch.uploadPostUser || ch.platforms) {
        const pubPath = path.join(getWorkspaceDir(id), 'publish.json');
        const pub = readJson(pubPath, {}) || {};
        writeJson(pubPath, {
            ...pub,
            uploadPostUser:
                ch.uploadPostUser ||
                pub.uploadPostUser ||
                String(identity.name || id)
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, ''),
            defaultPlatforms: ch.platforms || pub.defaultPlatforms,
        });
    }

    state = saveOnboarding(state, id);
    return getOnboardingPublic(id);
}

export function markStepComplete(stepId, id = getActiveWorkspaceId()) {
    const state = loadOnboarding(id);
    if (!state.stepsCompleted.includes(stepId)) {
        state.stepsCompleted = [...state.stepsCompleted, stepId];
    }
    const idx = STEP_IDS.indexOf(stepId);
    if (idx >= 0 && idx < STEP_IDS.length - 1) {
        state.step = STEP_IDS[idx + 1];
    }
    saveOnboarding(state, id);
    return getOnboardingPublic(id);
}

export function setOnboardingStep(stepId, id = getActiveWorkspaceId()) {
    if (!STEP_IDS.includes(stepId)) {
        const err = new Error(`Unknown step: ${stepId}`);
        err.status = 400;
        throw err;
    }
    const state = loadOnboarding(id);
    state.step = stepId;
    saveOnboarding(state, id);
    return getOnboardingPublic(id);
}

function patchBrandLive(partial, id) {
    const brandPath = path.join(getWorkspaceDir(id), 'brand.json');
    const brand = readJson(brandPath, { id, name: id }) || { id, name: id };
    const next = { ...brand };
    for (const [k, v] of Object.entries(partial || {})) {
        if (v !== undefined && v !== null && v !== '') next[k] = v;
    }
    writeJson(brandPath, next);
    return next;
}

function writeBrandFull(brand, id) {
    writeJson(path.join(getWorkspaceDir(id), 'brand.json'), brand);
}

function writeContentFull(content, id) {
    writeJson(path.join(getWorkspaceDir(id), 'content.json'), content);
}

function writeDrafts(brandDraft, contentDraft, id) {
    writeJson(path.join(getWorkspaceDir(id), BRAND_DRAFT), brandDraft);
    writeJson(path.join(getWorkspaceDir(id), CONTENT_DRAFT), contentDraft);
}

export function loadDrafts(id = getActiveWorkspaceId()) {
    return {
        brand: readJson(path.join(getWorkspaceDir(id), BRAND_DRAFT), null),
        content: readJson(path.join(getWorkspaceDir(id), CONTENT_DRAFT), null),
    };
}

/* ─── Asset intake (base64) ─── */

export function saveOnboardingAsset(
    { kind = 'ref', filename, dataBase64, mimeType },
    id = getActiveWorkspaceId()
) {
    if (!dataBase64) {
        const err = new Error('dataBase64 is required');
        err.status = 400;
        throw err;
    }
    const dir = getWorkspaceDir(id);
    const assetsDir = path.join(dir, 'assets', 'onboarding');
    fs.mkdirSync(assetsDir, { recursive: true });

    const safeName = String(filename || `${kind}-${Date.now()}`)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
    const raw = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length > 12 * 1024 * 1024) {
        const err = new Error('File too large (max 12MB)');
        err.status = 400;
        throw err;
    }
    const ext =
        path.extname(safeName) ||
        (mimeType?.includes('png')
            ? '.png'
            : mimeType?.includes('svg')
              ? '.svg'
              : mimeType?.includes('pdf')
                ? '.pdf'
                : mimeType?.includes('jpeg') || mimeType?.includes('jpg')
                  ? '.jpg'
                  : '.bin');
    const finalName = safeName.includes('.') ? safeName : `${safeName}${ext}`;
    const rel = path.join('assets', 'onboarding', finalName);
    fs.writeFileSync(path.join(dir, rel), buf);

    const state = loadOnboarding(id);
    const entry = {
        path: rel,
        filename: finalName,
        mimeType: mimeType || null,
        bytes: buf.length,
        uploadedAt: new Date().toISOString(),
    };

    if (kind === 'logo') {
        state.assets.logo = entry;
        // Also copy as primary logo for compose
        try {
            fs.copyFileSync(path.join(dir, rel), path.join(dir, 'assets', finalName));
        } catch {
            /* ignore */
        }
    } else if (kind === 'brandGuide') {
        state.assets.brandGuide = entry;
    } else if (kind === 'screen') {
        state.assets.screens = [...(state.assets.screens || []), entry];
    } else {
        state.assets.refs = [...(state.assets.refs || []), entry];
    }

    saveOnboarding(state, id);
    return { asset: entry, onboarding: getOnboardingPublic(id) };
}

/* ─── Website scrape (no external deps) ─── */

export async function scrapeWebsite(url) {
    if (!url || !String(url).trim()) {
        return { ok: false, markdown: '', error: 'No URL' };
    }
    let target = String(url).trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(target, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'GlampireOS-Onboarding/1.0 (+agency brand research)',
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!res.ok) {
            return { ok: false, markdown: '', error: `HTTP ${res.status}`, url: target };
        }
        const html = await res.text();
        const markdown = htmlToRoughMarkdown(html).slice(0, 24000);
        return { ok: true, markdown, url: target, title: extractTitle(html) };
    } catch (e) {
        return { ok: false, markdown: '', error: e.message || 'Scrape failed', url: target };
    }
}

function extractTitle(html) {
    const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? decodeEntities(m[1].trim()) : '';
}

function htmlToRoughMarkdown(html) {
    let s = String(html || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
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

function decodeEntities(s) {
    return String(s)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/* ─── Brand compiler (rules + optional Grok) ─── */

export function compileBrandFromAnswers(state, id, scrape = null) {
    const a = state.answers || emptyAnswers();
    const identity = a.identity || {};
    const offer = a.offer || {};
    const icp = a.icp || {};
    const voice = a.voice || {};
    const brandkit = a.brandkit || {};
    const channels = a.channels || {};
    const market = a.market || {};

    const name = identity.name?.trim() || id;
    const oneLiner = (identity.oneLiner || offer.promise || '').trim();
    const features = linesToList(offer.keyFeatures);
    const primary = linesToList(icp.primary);
    const secondary = linesToList(icp.secondary);
    const later = linesToList(icp.later);
    const exclusions = linesToList(icp.exclusions);
    const doNotSay = [
        ...linesToList(voice.doNotSay),
        ...linesToList(voice.claimsWeCantMake),
        ...exclusions.map((e) => `not for: ${e}`),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    const ctas = deriveCtas(offer, oneLiner);
    const pillars = derivePillars(features, offer, market);

    const brand = {
        id,
        name,
        website: identity.website || '',
        category: identity.category || '',
        oneLiner,
        supporting: (offer.valueProp || '').trim() || oneLiner,
        promise: (offer.promise || oneLiner).trim(),
        primaryCta: ctas[0] || 'Learn more',
        secondaryCta: ctas[1] || 'Get started',
        ctas,
        colors: {
            ink: '#111111',
            inkSoft: '#262424',
            brand: brandkit.brandColor || '#111111',
            brandDeep: brandkit.brandColor || '#000000',
            accent: brandkit.accentColor || '#737373',
            accentSoft: '#F0F0F0',
            surface: '#F7F7F7',
            bg: '#FFFFFF',
            muted: '#5E5F5C',
            dark: '#141414',
        },
        fonts: {
            sans: 'system-ui, sans-serif',
            mono: 'ui-monospace, monospace',
        },
        icp: { primary, secondary, later },
        doNotSay,
        photographyStyle: brandkit.photographyStyle || '',
        imageNegatives: brandkit.imageNegatives || '',
        compositionNotes: brandkit.compositionNotes || '',
        voice: voice.tone || '',
        pricingModel: offer.pricingModel || '',
        keyFeatures: features,
        competitors: linesToList(market.competitors),
        communities: linesToList(market.communities),
        defaultVideoStyleId: 'documentary_commercial',
        defaultFlowId: 'pain_to_cta',
        defaultVideoModelId: 'grok',
        defaultDeliveryMode: 'caption_talk',
        defaultGenerateAudio: false,
        defaultBrandChrome: 'organic',
        defaultUseAsrCaptions: true,
        onboardingCompiledAt: new Date().toISOString(),
        scrapeTitle: scrape?.title || null,
    };

    const content = {
        pillars,
        formats: defaultFormats(channels.formats || ['post', 'carousel', 'reel']),
        packIds: channels.packIds || ['weekly', 'reels', 'carousels'],
        ideaSource: 'content.json',
        ideas: [],
        storyDefaults: {
            flowId: 'pain_to_cta',
            styleId: 'documentary_commercial',
            videoModelId: 'grok',
        },
    };

    return { brand, content };
}

function deriveCtas(offer, oneLiner) {
    const base = [];
    const text = `${offer.valueProp || ''} ${offer.promise || ''} ${oneLiner || ''}`.toLowerCase();
    if (text.includes('beta')) base.push('Join the Beta');
    if (text.includes('free')) base.push('Start Free');
    base.push('See How It Works', 'Get Started', 'Learn more');
    return [...new Set(base)].slice(0, 5);
}

function derivePillars(features, offer, market) {
    const pillars = [
        {
            id: 'pain',
            label: 'Pain',
            description: 'Core friction the ICP feels before the product',
        },
        {
            id: 'demo',
            label: 'Product demo',
            description:
                features.slice(0, 3).join(' · ') ||
                offer.valueProp ||
                'Show the product solving the job',
        },
        {
            id: 'before_after',
            label: 'Before / after',
            description: 'Chaos without the product vs clarity with it',
        },
        {
            id: 'education',
            label: 'Education',
            description: 'Practical tips the ICP should already know',
        },
        {
            id: 'trust',
            label: 'Trust & proof',
            description:
                linesToList(market?.proofSources).slice(0, 2).join(' · ') ||
                'Social proof, launch honesty, fit',
        },
    ];
    return pillars;
}

function defaultFormats(ids) {
    const all = {
        post: {
            id: 'post',
            label: 'Post',
            aspectRatio: '1:1',
            size: '1080×1080',
            platforms: ['instagram', 'facebook', 'linkedin'],
            description: 'Single-image feed post',
        },
        carousel: {
            id: 'carousel',
            label: 'Carousel',
            aspectRatio: '1:1',
            size: '1080×1080',
            platforms: ['instagram', 'facebook', 'linkedin'],
            description: '3–6 slide story sequence',
        },
        reel: {
            id: 'reel',
            label: 'Reel',
            aspectRatio: '9:16',
            size: '1080×1920',
            platforms: ['instagram', 'facebook', 'tiktok', 'youtube'],
            description: 'Vertical short video',
        },
    };
    return (ids || ['post', 'carousel', 'reel']).map((id) => all[id] || all.post);
}

async function grokCompileEnhancement({ brand, content, state, scrapeMarkdown, researchBundle }) {
    if (!process.env.XAI_API_KEY) {
        return { brand, content, provider: 'rules', model: null };
    }

    const system = `You are Glampire OS Brand Compiler for an agency GTM creative studio.
You receive: wizard answers + multi-source research fusion (site crawl, competitors, buyer phrases, social, docs).
Improve Brand OS JSON. Prefer customer language from phrases over marketing fluff.
Return ONLY valid JSON with shape:
{
  "brand": { partial brand fields to merge },
  "content": { "pillars": [...], "packIds": [...] },
  "researchCards": {
     "brandOverview": { "summary": "...", "data": {} },
     "yourBuyer": { "summary": "...", "data": {} },
     "competitors": { "summary": "...", "data": {} },
     "marketThemes": { "summary": "...", "data": {} },
     "adAngles": { "summary": "...", "data": {} },
     "visualIdentity": { "summary": "...", "data": {} },
     "strategy": { "summary": "...", "data": {} },
     "marketPosition": { "summary": "...", "data": {} }
  }
}
Rules:
- Preserve client truth. Do not invent medical/financial claims.
- Strengthen oneLiner, supporting, promise, doNotSay, photographyStyle, icp.
- Pillars: 4–6 with id, label, description.
- Ad angles: 3–6 concrete hooks in researchCards.adAngles.data.angles (array of strings).
- Buyer language: quotes/phrases in researchCards.yourBuyer.data.phrases.
- Keep colors if provided.
- Use competitor white space when present.
- Never output markdown fences.`;

    const user = JSON.stringify(
        {
            answers: state.answers,
            currentBrand: brand,
            currentContent: content,
            websiteScrape: scrapeMarkdown ? scrapeMarkdown.slice(0, 10000) : null,
            research: researchBundle || null,
        },
        null,
        2
    );

    const preferred = process.env.GROK_TEXT_MODEL || process.env.GROK_SCRIPT_MODEL;
    const models = [...new Set([preferred, ...DEFAULT_TEXT_MODELS].filter(Boolean))];

    let lastErr;
    for (const model of models) {
        try {
            const res = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 3500,
                    temperature: 0.35,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user },
                    ],
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                lastErr = new Error(data.error?.message || `Grok ${res.status}`);
                continue;
            }
            let text = data.choices?.[0]?.message?.content;
            if (Array.isArray(text)) {
                text = text.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
            }
            const parsed = extractJson(text);
            if (!parsed) {
                lastErr = new Error('Could not parse Brand Compiler JSON');
                continue;
            }
            const mergedBrand = deepMerge(brand, parsed.brand || {});
            const mergedContent = deepMerge(content, parsed.content || {});
            return {
                brand: mergedBrand,
                content: mergedContent,
                researchCards: parsed.researchCards || null,
                provider: 'grok',
                model,
            };
        } catch (e) {
            lastErr = e;
        }
    }
    console.warn('[onboarding] Grok compile fallback to rules:', lastErr?.message);
    return { brand, content, provider: 'rules', model: null, error: lastErr?.message };
}

function extractJson(text) {
    if (!text) return null;
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
        return JSON.parse(s);
    } catch {
        const start = s.indexOf('{');
        const end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(s.slice(start, end + 1));
            } catch {
                return null;
            }
        }
    }
    return null;
}

function deepMerge(base, over) {
    if (!over || typeof over !== 'object') return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(over)) {
        if (
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            typeof base?.[k] === 'object' &&
            !Array.isArray(base[k])
        ) {
            out[k] = deepMerge(base[k] || {}, v);
        } else if (v !== undefined) {
            out[k] = v;
        }
    }
    return out;
}

function rulesResearchCards(state, brand) {
    const a = state.answers;
    const angles = [
        `Problem/solution: ${brand.oneLiner || 'fix the main friction'}`,
        `Before/after: life without ${brand.name} vs with it`,
        `Social proof / peer: what ${linesToList(a.icp?.primary)[0] || 'your ICP'} already say`,
        ...(brand.keyFeatures || []).slice(0, 2).map((f) => `Feature demo: ${f}`),
    ];
    return {
        brandOverview: {
            summary: `${brand.name} — ${brand.category || 'brand'}. ${brand.oneLiner || ''}`.trim(),
            data: {
                oneLiner: brand.oneLiner,
                promise: brand.promise,
                ctas: brand.ctas,
            },
        },
        yourBuyer: {
            summary: `Primary: ${(brand.icp?.primary || []).join(', ') || 'TBD'}`,
            data: {
                primary: brand.icp?.primary || [],
                secondary: brand.icp?.secondary || [],
                later: brand.icp?.later || [],
                phrases: linesToList(a.offer?.valueProp).slice(0, 5),
            },
        },
        competitors: {
            summary: linesToList(a.market?.competitors).join(', ') || 'No competitors listed yet',
            data: { list: linesToList(a.market?.competitors) },
        },
        marketThemes: {
            summary: (brand.keyFeatures || []).slice(0, 4).join(' · ') || 'Themes from offer truth',
            data: { features: brand.keyFeatures || [] },
        },
        adAngles: {
            summary: `${angles.length} angles ready to test`,
            data: { angles },
        },
        visualIdentity: {
            summary: `Brand ${brand.colors?.brand || ''} · photo rules locked`,
            data: {
                colors: brand.colors,
                photographyStyle: brand.photographyStyle,
                imageNegatives: brand.imageNegatives,
            },
        },
        strategy: {
            summary: 'Voice-first content system: pain → demo → trust, never freeform prompting',
            data: {
                tone: brand.voice,
                doNotSay: brand.doNotSay,
                pillars: true,
            },
        },
        marketPosition: {
            summary: brand.promise || brand.oneLiner || 'Position from promise',
            data: {
                position: brand.oneLiner,
                pricing: brand.pricingModel || null,
            },
        },
    };
}

/* ─── Research orchestration ─── */

const researchJobs = new Map(); // id -> promise

export async function runResearch(id = getActiveWorkspaceId(), { force = false } = {}) {
    if (researchJobs.has(id) && !force) {
        return getOnboardingPublic(id);
    }

    const run = (async () => {
        let state = loadOnboarding(id);
        state.research = { ...emptyResearch(), ...(state.research || {}) };
        // Ensure new cards exist on older onboarding.json
        const baseCards = emptyResearch().cards;
        state.research.cards = { ...baseCards, ...(state.research.cards || {}) };
        state.research.status = 'running';
        state.research.startedAt = new Date().toISOString();
        state.research.error = null;
        state.research.confidence = 0;
        state.step = 'research';
        for (const key of Object.keys(state.research.cards)) {
            state.research.cards[key].status = 'researching';
            state.research.cards[key].summary = 'Researching…';
            state.research.cards[key].sources = [];
        }
        updateWorkspaceMeta({ status: 'researching' }, id);
        saveOnboarding(state, id);

        try {
            const dir = getWorkspaceDir(id);
            const bundle = await runBrandResearch({
                answers: state.answers,
                assets: state.assets,
                workspaceDir: dir,
                workspaceId: id,
            });

            state = loadOnboarding(id);
            state.research.jobs = bundle.jobs;
            state.research.confidence = bundle.confidence;
            state.research.bundlePath = `research/latest.json`;
            state.research.scraped = {
                websiteUrl: bundle.site?.url || state.answers?.identity?.website || null,
                websiteMarkdown: (bundle.fusion?.siteMarkdown || '').slice(0, 8000),
                extracted: {
                    pageCount: bundle.site?.pageCount || 0,
                    confidence: bundle.confidence,
                    ok: bundle.site?.ok,
                    competitors: bundle.competitors?.list?.length || 0,
                    phrases: bundle.phrases?.count || 0,
                    social: bundle.social?.count || 0,
                    documents: bundle.documents?.count || 0,
                },
            };

            // Apply fusion into answers-adjacent brand compile
            const compiled = compileBrandFromAnswers(state, id, {
                title: bundle.site?.structured?.oneLinerHints?.[0],
                markdown: bundle.fusion?.siteMarkdown || '',
                fusion: bundle.fusion,
            });
            // Merge fusion fields into brand draft
            if (bundle.fusion) {
                const f = bundle.fusion;
                if (f.oneLiner && !compiled.brand.oneLiner) compiled.brand.oneLiner = f.oneLiner;
                if (f.supporting) compiled.brand.supporting = f.supporting;
                if (f.promise) compiled.brand.promise = f.promise;
                if (f.features?.length) compiled.brand.keyFeatures = f.features;
                if (f.pricingModel) compiled.brand.pricingModel = f.pricingModel;
                if (f.icpPrimary?.length) {
                    compiled.brand.icp = {
                        ...compiled.brand.icp,
                        primary: [...new Set([...(compiled.brand.icp?.primary || []), ...f.icpPrimary])],
                    };
                }
                if (f.doNotSay?.length) {
                    compiled.brand.doNotSay = [
                        ...new Set([...(compiled.brand.doNotSay || []), ...f.doNotSay]),
                    ];
                }
                if (f.ctas?.length) {
                    compiled.brand.ctas = [...new Set([...(compiled.brand.ctas || []), ...f.ctas])].slice(
                        0,
                        6
                    );
                    if (!compiled.brand.primaryCta) compiled.brand.primaryCta = f.ctas[0];
                }
                if (f.colorHints?.[0] && compiled.brand.colors) {
                    compiled.brand.colors.brand = f.colorHints[0];
                }
                if (f.buyerPhrases?.length) {
                    compiled.brand.buyerPhrases = f.buyerPhrases.slice(0, 20);
                }
                if (f.competitorMatrix?.length) {
                    compiled.brand.competitorMatrix = f.competitorMatrix;
                }
                if (f.adAngles?.length) {
                    compiled.brand.adAngles = f.adAngles;
                }
            }

            const enhanced = await grokCompileEnhancement({
                brand: compiled.brand,
                content: compiled.content,
                state,
                scrapeMarkdown: bundle.fusion?.siteMarkdown || '',
                researchBundle: {
                    confidence: bundle.confidence,
                    fusion: bundle.fusion,
                    competitors: bundle.competitors,
                    phrases: {
                        phrases: bundle.phrases?.phrases,
                        pains: bundle.phrases?.pains,
                        wins: bundle.phrases?.wins,
                    },
                    social: {
                        profiles: bundle.social?.profiles,
                        toneHints: bundle.social?.toneHints,
                        formatHints: bundle.social?.formatHints,
                    },
                    documents: bundle.documents?.signals,
                },
            });

            writeDrafts(enhanced.brand, enhanced.content, id);

            // Prefer orchestrator cards (source-backed); merge Grok card enhancements when present
            const cards = { ...(bundle.researchCards || {}) };
            if (enhanced.researchCards) {
                for (const [key, payload] of Object.entries(enhanced.researchCards)) {
                    if (!cards[key]) {
                        cards[key] = payload;
                        continue;
                    }
                    // Keep sources/confidence from orchestrator; enrich summary/data from Grok
                    cards[key] = {
                        ...cards[key],
                        summary: payload.summary || cards[key].summary,
                        data: { ...(cards[key].data || {}), ...(payload.data || {}) },
                    };
                }
            }

            state = loadOnboarding(id);
            for (const [key, payload] of Object.entries(cards)) {
                const shell = state.research.cards[key] || cardShell(payload.title || key, payload.description || '');
                state.research.cards[key] = {
                    ...shell,
                    title: payload.title || shell.title,
                    description: payload.description || shell.description,
                    status: payload.status || 'done',
                    summary: payload.summary || shell.summary,
                    data: payload.data || payload,
                    sources: payload.sources || [],
                    confidence: payload.confidence ?? null,
                    updatedAt: payload.updatedAt || new Date().toISOString(),
                };
            }
            for (const key of Object.keys(state.research.cards)) {
                if (state.research.cards[key].status === 'researching') {
                    state.research.cards[key].status = 'done';
                    state.research.cards[key].summary =
                        state.research.cards[key].summary || 'Compiled from multi-source research';
                    state.research.cards[key].updatedAt = new Date().toISOString();
                }
            }

            state.research.status = 'done';
            state.research.completedAt = new Date().toISOString();
            state.research.confidence = bundle.confidence;
            state.compiledAt = new Date().toISOString();
            state.step = 'review';
            if (!state.stepsCompleted.includes('research')) {
                state.stepsCompleted = [...state.stepsCompleted, 'research'];
            }
            writeBrandFull(enhanced.brand, id);
            writeContentFull(enhanced.content, id);
            updateWorkspaceMeta(
                {
                    status: 'review',
                    name: enhanced.brand.name,
                    oneLiner: enhanced.brand.oneLiner,
                    category: enhanced.brand.category,
                },
                id
            );
            saveOnboarding(state, id);
            return getOnboardingPublic(id);
        } catch (e) {
            console.error('[onboarding] research failed', e);
            state = loadOnboarding(id);
            state.research.status = 'error';
            state.research.error = e.message || 'Research failed';
            for (const key of Object.keys(state.research.cards || {})) {
                if (state.research.cards[key].status === 'researching') {
                    state.research.cards[key].status = 'error';
                    state.research.cards[key].summary = e.message || 'Failed';
                }
            }
            updateWorkspaceMeta({ status: 'draft' }, id);
            saveOnboarding(state, id);
            throw e;
        } finally {
            researchJobs.delete(id);
        }
    })();

    researchJobs.set(id, run);
    return run;
}

export function isResearchRunning(id = getActiveWorkspaceId()) {
    return researchJobs.has(id);
}

/* ─── Lock Brand OS ─── */

export function lockBrandOs(id = getActiveWorkspaceId(), { brandOverrides = null, contentOverrides = null } = {}) {
    const state = loadOnboarding(id);
    const drafts = loadDrafts(id);
    let brand = drafts.brand || getBrand(id);
    let content = drafts.content || loadContentMeta(id);

    if (brandOverrides) brand = deepMerge(brand, brandOverrides);
    if (contentOverrides) content = deepMerge(content, contentOverrides);

    // Ensure id
    brand.id = id;
    brand.name = brand.name || state.answers?.identity?.name || id;

    writeBrandFull(brand, id);
    writeContentFull(content, id);
    writeDrafts(brand, content, id);

    // Clear overrides so locked brand is source of truth
    const overPath = path.join(getWorkspaceDir(id), 'brand.overrides.json');
    if (fs.existsSync(overPath)) fs.unlinkSync(overPath);

    state.lockedAt = new Date().toISOString();
    state.step = 'review';
    if (!state.stepsCompleted.includes('review')) {
        state.stepsCompleted = [...state.stepsCompleted, 'review'];
    }
    state.completeness = scoreCompleteness(state);
    state.completeness.locked = true;
    state.completeness.ready = true;
    saveOnboarding(state, id);

    updateWorkspaceMeta(
        {
            status: 'ready',
            name: brand.name,
            oneLiner: brand.oneLiner,
            category: brand.category,
            lockedAt: state.lockedAt,
        },
        id
    );

    return {
        workspace: getWorkspacePublic(id),
        onboarding: getOnboardingPublic(id),
        brand: getBrand(id),
    };
}

export function reopenOnboarding(id = getActiveWorkspaceId()) {
    updateWorkspaceMeta({ status: 'draft', lockedAt: null }, id);
    const state = loadOnboarding(id);
    state.lockedAt = null;
    state.step = state.step === 'review' ? 'identity' : state.step;
    saveOnboarding(state, id);
    return getOnboardingPublic(id);
}

/* ─── Public DTO ─── */

export function getOnboardingPublic(id = getActiveWorkspaceId()) {
    const state = loadOnboarding(id);
    const meta = readJson(path.join(getWorkspaceDir(id), 'workspace.json'), {});
    const drafts = loadDrafts(id);
    const completeness = scoreCompleteness(state);

    return {
        workspaceId: id,
        status: meta.status || 'draft',
        step: state.step,
        steps: ONBOARDING_STEPS,
        stepsCompleted: state.stepsCompleted || [],
        answers: state.answers,
        assets: state.assets,
        research: {
            status: state.research?.status || 'idle',
            startedAt: state.research?.startedAt,
            completedAt: state.research?.completedAt,
            error: state.research?.error || null,
            confidence: state.research?.confidence ?? 0,
            jobs: state.research?.jobs || null,
            bundlePath: state.research?.bundlePath || null,
            cards: state.research?.cards || {},
            scraped: {
                websiteUrl: state.research?.scraped?.websiteUrl || null,
                hasMarkdown: Boolean(state.research?.scraped?.websiteMarkdown),
                extracted: state.research?.scraped?.extracted || null,
            },
            running: isResearchRunning(id),
        },
        completeness,
        compiledAt: state.compiledAt,
        lockedAt: state.lockedAt,
        hasDrafts: Boolean(drafts.brand),
        draftPreview: drafts.brand
            ? {
                  name: drafts.brand.name,
                  oneLiner: drafts.brand.oneLiner,
                  category: drafts.brand.category,
                  primaryCta: drafts.brand.primaryCta,
                  icpPrimary: drafts.brand.icp?.primary || [],
                  doNotSay: (drafts.brand.doNotSay || []).slice(0, 8),
                  pillars: drafts.content?.pillars || [],
              }
            : null,
        updatedAt: state.updatedAt,
    };
}

/** Enrich list/public workspace with onboarding status */
export function enrichWorkspacePublic(id) {
    if (!workspaceExists(id)) return null;
    const base = getWorkspacePublic(id);
    try {
        const onboardingFile = onboardingPath(id);
        if (!fs.existsSync(onboardingFile) && (base.status === 'active' || base.status === 'ready')) {
            return {
                ...base,
                status: base.status === 'active' ? 'ready' : base.status,
                needsOnboarding: false,
                completenessScore: 100,
            };
        }
        const state = loadOnboarding(id);
        const c = scoreCompleteness(state);
        const status = base.status || 'draft';
        const needsOnboarding = !['ready', 'active', 'paused'].includes(status) || !state.lockedAt;
        // Taskiz-style: if status ready/active and locked or no incomplete, don't force
        const force =
            status === 'draft' ||
            status === 'researching' ||
            status === 'review' ||
            (status !== 'ready' && status !== 'active' && c.score < 80);
        return {
            ...base,
            status,
            needsOnboarding: force,
            completenessScore: c.score,
            onboardingStep: state.step,
            lockedAt: state.lockedAt || base.lockedAt || null,
        };
    } catch {
        return { ...base, needsOnboarding: false, completenessScore: null };
    }
}

export function initOnboardingForNewWorkspace(id, seed = {}) {
    const state = emptyOnboardingState(seed);
    if (seed.name) state.answers.identity.name = seed.name;
    if (seed.oneLiner) state.answers.identity.oneLiner = seed.oneLiner;
    if (seed.category) state.answers.identity.category = seed.category;
    if (seed.website) state.answers.identity.website = seed.website;
    state.completeness = scoreCompleteness(state);
    writeJson(onboardingPath(id), state);
    updateWorkspaceMeta({ status: 'draft' }, id);
    return getOnboardingPublic(id);
}
