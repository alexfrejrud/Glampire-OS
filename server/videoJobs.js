/**
 * Video job registry so we can poll Grok + fal under one requestId.
 * Persists to disk so dev-server restarts don't break in-flight polls.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, 'data', 'video-jobs.json');
const jobs = new Map();

function load() {
    try {
        if (!fs.existsSync(STORE)) return;
        const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
        if (Array.isArray(raw)) {
            for (const j of raw) {
                if (j?.id) jobs.set(j.id, j);
            }
        }
    } catch (e) {
        console.warn('[videoJobs] load failed', e.message);
    }
}

function save() {
    try {
        fs.mkdirSync(path.dirname(STORE), { recursive: true });
        // keep last 80 jobs only
        const all = [...jobs.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const keep = all.slice(0, 80);
        jobs.clear();
        for (const j of keep) jobs.set(j.id, j);
        fs.writeFileSync(STORE, JSON.stringify(keep, null, 2));
    } catch (e) {
        console.warn('[videoJobs] save failed', e.message);
    }
}

load();

export function createJob(partial) {
    const id =
        partial.id ||
        `${partial.provider || 'job'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const job = {
        id,
        provider: partial.provider,
        modelId: partial.modelId,
        status: partial.status || 'pending',
        videoUrl: null,
        error: null,
        createdAt: Date.now(),
        ...partial,
    };
    jobs.set(id, job);
    save();
    return job;
}

export function getJob(id) {
    return jobs.get(id) || null;
}

export function updateJob(id, patch) {
    const job = jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    jobs.set(id, job);
    save();
    return job;
}

export function listJobs() {
    return [...jobs.values()];
}
