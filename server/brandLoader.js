/**
 * Glampire OS — multi-workspace Brand OS loader
 *
 * clients/<id>/
 *   workspace.json   # meta (name, status)
 *   brand.json       # Brand OS defaults (content gen only — never dashboard chrome)
 *   brand.overrides.json  # optional operator edits
 *   content.json     # pillars / idea source / pack ids
 *   publish.json     # Upload-Post profile + defaults
 *   assets/          # logo, product screens, refs
 *
 * Dashboard UI stays Glampire (Astryx theme). Client colors only affect creatives.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLIENTS_ROOT = path.join(__dirname, '..', 'clients');
const ACTIVE_STATE_PATH = path.join(__dirname, 'data', 'active-workspace.json');

/** Per-request workspace context (Express middleware sets this). */
export const workspaceContext = new AsyncLocalStorage();

let fallbackActiveId = loadPersistedActiveId() || null;

function loadPersistedActiveId() {
    try {
        if (fs.existsSync(ACTIVE_STATE_PATH)) {
            const j = JSON.parse(fs.readFileSync(ACTIVE_STATE_PATH, 'utf8'));
            if (j?.id) return j.id;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function persistActiveId(id) {
    try {
        fs.mkdirSync(path.dirname(ACTIVE_STATE_PATH), { recursive: true });
        fs.writeFileSync(ACTIVE_STATE_PATH, JSON.stringify({ id, updatedAt: new Date().toISOString() }, null, 2));
    } catch (e) {
        console.warn('[workspace] could not persist active id', e.message);
    }
}

export function ensureClientsRoot() {
    fs.mkdirSync(CLIENTS_ROOT, { recursive: true });
}

export function getWorkspaceDir(id) {
    const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new Error('Invalid workspace id');
    return path.join(CLIENTS_ROOT, safe);
}

export function workspaceExists(id) {
    try {
        const dir = getWorkspaceDir(id);
        return fs.existsSync(path.join(dir, 'workspace.json')) || fs.existsSync(path.join(dir, 'brand.json'));
    } catch {
        return false;
    }
}

function readJson(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.warn('[workspace] bad json', filePath, e.message);
    }
    return fallback;
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function listWorkspaces() {
    ensureClientsRoot();
    if (!fs.existsSync(CLIENTS_ROOT)) return [];
    const dirs = fs.readdirSync(CLIENTS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
    const list = [];
    for (const d of dirs) {
        const dir = path.join(CLIENTS_ROOT, d.name);
        const meta =
            readJson(path.join(dir, 'workspace.json')) ||
            readJson(path.join(dir, 'brand.json'), {});
        const status = meta.status || 'active';
        list.push({
            id: meta.id || d.name,
            name: meta.name || d.name,
            slug: meta.slug || d.name,
            oneLiner: meta.oneLiner || '',
            category: meta.category || '',
            status,
            createdAt: meta.createdAt || null,
            lockedAt: meta.lockedAt || null,
            // Needs full Brand OS onboarding when not ready/active
            needsOnboarding: ['draft', 'researching', 'review'].includes(status),
        });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveWorkspaceId() {
    const fromCtx = workspaceContext.getStore()?.workspaceId;
    if (fromCtx && workspaceExists(fromCtx)) return fromCtx;
    if (fallbackActiveId && workspaceExists(fallbackActiveId)) return fallbackActiveId;
    const all = listWorkspaces();
    return all[0]?.id || null;
}

export function setActiveWorkspace(id) {
    if (!workspaceExists(id)) {
        const err = new Error(`Unknown workspace: ${id}`);
        err.code = 'UNKNOWN_WORKSPACE';
        throw err;
    }
    fallbackActiveId = id;
    persistActiveId(id);
    return getWorkspacePublic(id);
}

export function getWorkspacePublic(id = getActiveWorkspaceId()) {
    const dir = getWorkspaceDir(id);
    const meta =
        readJson(path.join(dir, 'workspace.json')) || {
            id,
            name: id,
            slug: id,
            status: 'active',
        };
    const brand = loadBrandFile(id);
    const publish = loadPublish(id);
    const status = meta.status || 'active';
    return {
        id: meta.id || id,
        name: meta.name || brand.name || id,
        slug: meta.slug || id,
        oneLiner: meta.oneLiner || brand.oneLiner || '',
        category: meta.category || brand.category || '',
        status,
        createdAt: meta.createdAt || null,
        lockedAt: meta.lockedAt || null,
        needsOnboarding: ['draft', 'researching', 'review'].includes(status),
        publishUser: publish.uploadPostUser || null,
        defaultPlatforms: publish.defaultPlatforms || [],
        website: brand.website || '',
    };
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
        } else {
            out[k] = v;
        }
    }
    return out;
}

function loadBrandFile(id) {
    const dir = getWorkspaceDir(id);
    const base = readJson(path.join(dir, 'brand.json'), {});
    const overrides = readJson(path.join(dir, 'brand.overrides.json'), {});
    return deepMerge(base, overrides || {});
}

/**
 * Platform defaults applied to every workspace Brand OS at read time.
 * Client fields win when set; missing keys get Glampire OS studio defaults.
 * Never Taskiz- or WEPOC-specific — same for all clients.
 */
export const PLATFORM_BRAND_DEFAULTS = {
    defaultVideoStyleId: 'documentary_commercial',
    defaultFlowId: 'pain_to_cta',
    defaultVideoModelId: 'grok',
    defaultDeliveryMode: 'caption_talk',
    defaultGenerateAudio: false,
    defaultUseAsrCaptions: true,
    defaultBrandChrome: 'organic',
};

/** Live brand for active (or given) workspace */
export function getBrand(id = getActiveWorkspaceId()) {
    const b = loadBrandFile(id);
    if (!b || !b.name) {
        // Fallback minimal so prompts don't crash
        return {
            id,
            name: id,
            oneLiner: '',
            ctas: ['Learn more'],
            primaryCta: 'Learn more',
            colors: {},
            fonts: {},
            icp: { primary: [], secondary: [], later: [] },
            doNotSay: [],
            photographyStyle: '',
            imageNegatives: '',
            compositionNotes: '',
            ...PLATFORM_BRAND_DEFAULTS,
        };
    }
    // Fill only missing platform keys (do not overwrite client choices)
    const merged = { id, ...PLATFORM_BRAND_DEFAULTS, ...b };
    // Explicit false/null for booleans must win over defaults when set on brand
    if (Object.prototype.hasOwnProperty.call(b, 'defaultUseAsrCaptions')) {
        merged.defaultUseAsrCaptions = b.defaultUseAsrCaptions;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'defaultGenerateAudio')) {
        merged.defaultGenerateAudio = b.defaultGenerateAudio;
    }
    return merged;
}

export function saveBrandOverrides(partial, id = getActiveWorkspaceId()) {
    const dir = getWorkspaceDir(id);
    const pathOver = path.join(dir, 'brand.overrides.json');
    const current = readJson(pathOver, {}) || {};
    const next = deepMerge(current, partial);
    writeJson(pathOver, next);
    // Keep workspace meta name/oneLiner in sync when brand name changes
    if (partial.name || partial.oneLiner || partial.category) {
        const metaPath = path.join(dir, 'workspace.json');
        const meta = readJson(metaPath, { id, name: id, slug: id, status: 'active' });
        if (partial.name) meta.name = partial.name;
        if (partial.oneLiner) meta.oneLiner = partial.oneLiner;
        if (partial.category) meta.category = partial.category;
        writeJson(metaPath, meta);
    }
    return getBrand(id);
}

export function resetBrandOverrides(id = getActiveWorkspaceId()) {
    const pathOver = path.join(getWorkspaceDir(id), 'brand.overrides.json');
    if (fs.existsSync(pathOver)) fs.unlinkSync(pathOver);
    return getBrand(id);
}

export function loadPublish(id = getActiveWorkspaceId()) {
    const dir = getWorkspaceDir(id);
    return (
        readJson(path.join(dir, 'publish.json'), {
            uploadPostUser: process.env.UPLOAD_POST_DEFAULT_USER || null,
            defaultPlatforms: ['instagram', 'tiktok', 'facebook', 'linkedin'],
        }) || {}
    );
}

export function savePublish(partial, id = getActiveWorkspaceId()) {
    const current = loadPublish(id);
    const next = { ...current, ...partial };
    writeJson(path.join(getWorkspaceDir(id), 'publish.json'), next);
    return next;
}

export function loadContentMeta(id = getActiveWorkspaceId()) {
    const dir = getWorkspaceDir(id);
    return (
        readJson(path.join(dir, 'content.json'), {
            pillars: [],
            formats: [],
            packIds: ['weekly'],
            ideaSource: `builtin:${id}`,
        }) || {}
    );
}

/**
 * Express middleware: resolve workspace from header / query / body, bind AsyncLocalStorage.
 * Header: X-Workspace-Id
 */
export function workspaceMiddleware(req, res, next) {
    const headerId = req.get('x-workspace-id') || req.get('X-Workspace-Id');
    const queryId = req.query?.workspaceId;
    const bodyId = req.body && typeof req.body === 'object' ? req.body.workspaceId : null;
    const requested = headerId || queryId || bodyId || getActiveWorkspaceId();

    if (requested && !workspaceExists(requested)) {
        // Don't hard-fail health; fall back to active
        if (req.path === '/api/health') {
            return workspaceContext.run({ workspaceId: getActiveWorkspaceId() }, next);
        }
        return res.status(404).json({ error: `Unknown workspace: ${requested}`, code: 'UNKNOWN_WORKSPACE' });
    }

    const workspaceId = requested || getActiveWorkspaceId();
    workspaceContext.run({ workspaceId }, () => next());
}

/** Create a new workspace shell (empty brand OS for onboarding) */
export function createWorkspace({ id, name, oneLiner = '', category = '' }) {
    const safe = String(id || name || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '');
    if (!safe) throw new Error('Workspace id/name required');
    if (workspaceExists(safe)) throw new Error(`Workspace already exists: ${safe}`);

    const dir = getWorkspaceDir(safe);
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

    const workspace = {
        id: safe,
        name: name || safe,
        slug: safe,
        oneLiner,
        category,
        status: 'draft', // Brand OS onboarding required before ready
        createdAt: new Date().toISOString(),
        lockedAt: null,
    };
    writeJson(path.join(dir, 'workspace.json'), workspace);

    const brand = {
        id: safe,
        name: name || safe,
        website: '',
        category: category || '',
        oneLiner: oneLiner || '',
        supporting: '',
        promise: oneLiner || '',
        primaryCta: 'Learn more',
        secondaryCta: 'Get started',
        ctas: ['Learn more', 'Get started'],
        colors: {
            ink: '#111111',
            brand: '#5B5BD6',
            accent: '#A5A5F0',
            surface: '#F7F7F7',
            bg: '#FFFFFF',
            muted: '#5E5F5C',
            dark: '#141414',
        },
        fonts: {
            sans: 'system-ui, sans-serif',
            mono: 'ui-monospace, monospace',
        },
        icp: { primary: [], secondary: [], later: [] },
        doNotSay: [],
        // Filled for real by Brand OS onboarding compile (visual world + ICP cast)
        photographyStyle:
            'documentary commercial photography, authentic subjects matching brand ICP, natural light — complete onboarding to lock visual world',
        imageNegatives:
            'no text of any kind, no logos, no brand names painted in scene, no fake UI gibberish, no wrong-industry clichés',
        compositionNotes:
            'One hero moment matching brand ICP, clean negative space for later text overlay, medium shot preferred.',
        visualWorld: null,
        castBrief: '',
        environment: '',
        wardrobe: '',
        ...PLATFORM_BRAND_DEFAULTS,
    };
    writeJson(path.join(dir, 'brand.json'), brand);

    writeJson(path.join(dir, 'content.json'), {
        pillars: [
            { id: 'pain', label: 'Pain', description: 'Problem / friction' },
            { id: 'demo', label: 'Demo', description: 'Product in action' },
            { id: 'trust', label: 'Trust', description: 'Proof and launch' },
        ],
        packIds: ['weekly', 'reels', 'carousels'],
        ideaSource: 'content.json',
        ideas: [],
    });

    writeJson(path.join(dir, 'publish.json'), {
        uploadPostUser: safe.toUpperCase().replace(/-/g, ''),
        defaultPlatforms: ['instagram', 'tiktok', 'facebook', 'linkedin'],
    });

    return getWorkspacePublic(safe);
}

/**
 * Resolve logo for the active (or given) workspace only.
 * Never falls back to another client's assets — Glampire OS is multi-client.
 */
export function resolveWorkspaceLogoPath(id = getActiveWorkspaceId()) {
    if (!id || !workspaceExists(id)) return null;
    const dir = getWorkspaceDir(id);
    const assetsDir = path.join(dir, 'assets');
    const candidates = [];
    try {
        if (fs.existsSync(assetsDir)) {
            const files = fs.readdirSync(assetsDir);
            for (const f of files) {
                if (/\.(svg|png|webp|jpg|jpeg)$/i.test(f)) {
                    // Prefer names that look like logos
                    const p = path.join(assetsDir, f);
                    if (/logo/i.test(f)) candidates.unshift(p);
                    else candidates.push(p);
                }
            }
            // onboarding logo path
            const onboard = path.join(assetsDir, 'onboarding');
            if (fs.existsSync(onboard)) {
                for (const f of fs.readdirSync(onboard)) {
                    if (/\.(svg|png|webp|jpg|jpeg)$/i.test(f) && /logo/i.test(f)) {
                        candidates.unshift(path.join(onboard, f));
                    }
                }
            }
        }
    } catch {
        /* ignore */
    }
    return candidates.find((p) => fs.existsSync(p)) || null;
}
