/**
 * Server-side creative queue backup (per workspace).
 * Survives browser clears / workspace-switch confusion.
 * File: clients/<id>/queue.json
 */

import fs from 'fs';
import path from 'path';
import { getWorkspaceDir, getActiveWorkspaceId } from './brandLoader.js';

function queuePath(workspaceId = getActiveWorkspaceId()) {
    return path.join(getWorkspaceDir(workspaceId), 'queue.json');
}

function empty() {
    return {
        version: 1,
        items: [],
        packLabel: null,
        packId: null,
        generatedAt: null,
        updatedAt: null,
    };
}

export function loadQueue(workspaceId = getActiveWorkspaceId()) {
    const file = queuePath(workspaceId);
    try {
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            return {
                ...empty(),
                ...raw,
                items: Array.isArray(raw.items) ? raw.items : [],
            };
        }
    } catch (e) {
        console.warn('[queueStore] load failed', e.message);
    }
    return empty();
}

export function saveQueue(state, workspaceId = getActiveWorkspaceId()) {
    const file = queuePath(workspaceId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const items = Array.isArray(state?.items) ? state.items : [];

    // Never wipe a non-empty server queue with empty payload
    if (items.length === 0) {
        const existing = loadQueue(workspaceId);
        if (existing.items.length > 0) {
            console.warn(
                '[queueStore] blocked empty overwrite of',
                existing.items.length,
                'items for',
                workspaceId
            );
            return existing;
        }
    }

    const next = {
        version: 1,
        items,
        packLabel: state?.packLabel ?? null,
        packId: state?.packId ?? null,
        generatedAt: state?.generatedAt ?? null,
        styleId: state?.styleId ?? null,
        flowId: state?.flowId ?? null,
        videoModelId: state?.videoModelId ?? null,
        batchBrief: state?.batchBrief ?? null,
        batchMode: state?.batchMode ?? null,
        aspectRatio: state?.aspectRatio ?? null,
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
    return next;
}

/** Prefer the queue with more items; on tie, prefer newer updatedAt/generatedAt. */
export function mergeQueues(local, server) {
    const a = local || empty();
    const b = server || empty();
    const aN = a.items?.length || 0;
    const bN = b.items?.length || 0;
    if (aN === 0 && bN === 0) return empty();
    if (aN === 0) return { ...empty(), ...b };
    if (bN === 0) return { ...empty(), ...a };
    if (aN > bN) return { ...empty(), ...a };
    if (bN > aN) return { ...empty(), ...b };
    const aT = new Date(a.updatedAt || a.generatedAt || 0).getTime();
    const bT = new Date(b.updatedAt || b.generatedAt || 0).getTime();
    return bT >= aT ? { ...empty(), ...b } : { ...empty(), ...a };
}
