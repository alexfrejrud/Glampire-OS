/**
 * Image reference library for Creative Studio.
 * Stores metadata in data/refs.json and image files under data/refs/files/.
 * Used as visual anchors for better Grok / fal generations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const REFS_JSON = path.join(DATA_DIR, 'refs.json');
const FILES_DIR = path.join(DATA_DIR, 'refs', 'files');

export const REF_ROLES = [
    { id: 'person', label: 'Person / talent' },
    { id: 'product', label: 'Product / phone UI' },
    { id: 'style', label: 'Style / grade' },
    { id: 'lighting', label: 'Lighting' },
    { id: 'job_site', label: 'Job site' },
    { id: 'vehicle', label: 'Vehicle / van' },
    { id: 'composition', label: 'Composition' },
    { id: 'competitor', label: 'Competitor / inspo' },
    { id: 'other', label: 'Other' },
];

function ensureDirs() {
    fs.mkdirSync(FILES_DIR, { recursive: true });
    if (!fs.existsSync(REFS_JSON)) {
        fs.writeFileSync(REFS_JSON, JSON.stringify({ refs: [] }, null, 2));
    }
}

function readAll() {
    ensureDirs();
    try {
        const raw = JSON.parse(fs.readFileSync(REFS_JSON, 'utf8'));
        return Array.isArray(raw.refs) ? raw.refs : [];
    } catch {
        return [];
    }
}

function writeAll(refs) {
    ensureDirs();
    fs.writeFileSync(REFS_JSON, JSON.stringify({ refs, updatedAt: new Date().toISOString() }, null, 2));
}

function extFromMime(mime) {
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'png';
}

/**
 * Save a data-URL or remote URL as a reference asset.
 */
export function addRef({ name, role = 'other', notes = '', tags = [], dataUrl, sourceUrl }) {
    ensureDirs();
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    let fileName = null;
    let mime = null;
    let url = sourceUrl || null;

    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) throw new Error('Invalid image data URL');
        mime = m[1];
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 12 * 1024 * 1024) throw new Error('Image too large (max 12MB)');
        fileName = `${id}.${extFromMime(mime)}`;
        fs.writeFileSync(path.join(FILES_DIR, fileName), buf);
        url = `/api/refs/file/${fileName}`;
    } else if (sourceUrl) {
        url = sourceUrl;
    } else {
        throw new Error('Provide dataUrl or sourceUrl');
    }

    const ref = {
        id,
        name: name || fileName || 'Reference',
        role,
        notes: notes || '',
        tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
        mime,
        fileName,
        url,
        createdAt: new Date().toISOString(),
    };

    const refs = readAll();
    refs.unshift(ref);
    writeAll(refs);
    return ref;
}

export function listRefs() {
    return readAll();
}

export function getRef(id) {
    return readAll().find((r) => r.id === id) || null;
}

export function updateRef(id, patch) {
    const refs = readAll();
    const i = refs.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const allowed = ['name', 'role', 'notes', 'tags'];
    const next = { ...refs[i] };
    for (const k of allowed) {
        if (patch[k] !== undefined) next[k] = patch[k];
    }
    next.updatedAt = new Date().toISOString();
    refs[i] = next;
    writeAll(refs);
    return next;
}

export function deleteRef(id) {
    const refs = readAll();
    const found = refs.find((r) => r.id === id);
    if (!found) return false;
    if (found.fileName) {
        const p = path.join(FILES_DIR, found.fileName);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    writeAll(refs.filter((r) => r.id !== id));
    return true;
}

export function resolveFilePath(fileName) {
    if (!fileName || fileName.includes('..') || fileName.includes('/')) return null;
    const p = path.join(FILES_DIR, fileName);
    if (!fs.existsSync(p)) return null;
    return p;
}

/** Prompt fragment describing selected refs for image generators */
export function buildRefPromptSnippet(ids = []) {
    const all = readAll();
    const picked = ids.map((id) => all.find((r) => r.id === id)).filter(Boolean);
    if (!picked.length) return '';
    return picked
        .map((r, i) => {
            const bits = [
                `Reference ${i + 1} (${r.role}): ${r.name}`,
                r.notes ? `notes: ${r.notes}` : null,
                r.tags?.length ? `tags: ${r.tags.join(', ')}` : null,
            ].filter(Boolean);
            return bits.join(' — ');
        })
        .join('\n');
}
