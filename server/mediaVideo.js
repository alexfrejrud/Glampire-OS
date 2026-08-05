/**
 * Unified video generation — routes to Grok (xAI) or fal (Kling / Seedance / MiniMax).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    startVideo as grokStartVideo,
    getVideoStatus as grokGetVideoStatus,
    generateVideoAndWait as grokGenerateAndWait,
} from './grok.js';
import {
    falQueueSubmit,
    falQueueStatus,
    falQueueResult,
    falGenerateAndWait,
    extractFalVideoUrl,
    hasFalKey,
} from './fal.js';
import { getVideoModel, isModelAvailable } from './videoModels.js';
import { createJob, getJob, updateJob } from './videoJobs.js';
import { resolveStillPath } from './stillReframe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERS_DIR = path.join(__dirname, 'data', 'renders');

/**
 * xAI / fal cannot fetch studio-local paths like `/api/renders/stills/…`.
 * Convert local stills (and other render URLs) to data: base64 for I2V.
 * Pass through https:// and data: URLs unchanged.
 */
export function resolveImageForRemoteProvider(imageUrl) {
    const raw = String(imageUrl || '').trim();
    if (!raw) return raw;
    if (raw.startsWith('data:')) return raw;
    if (/^https?:\/\//i.test(raw)) {
        // localhost / 127.0.0.1 are not reachable by xAI/fal — convert if we can map them
        try {
            const u = new URL(raw);
            if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0') {
                return resolveImageForRemoteProvider(u.pathname + u.search);
            }
        } catch {
            /* keep as-is */
        }
        return raw;
    }

    // /api/renders/stills/<file>
    const stillMatch = raw.match(/^\/api\/renders\/stills\/([^/?#]+)/i);
    if (stillMatch) {
        const full = resolveStillPath(stillMatch[1]);
        if (full) return fileToDataUrl(full);
    }

    // /api/renders/ads/<file> or /api/renders/<file>
    const renderMatch = raw.match(/^\/api\/renders\/(?:ads\/)?([^/?#]+)/i);
    if (renderMatch) {
        const base = path.basename(renderMatch[1]);
        const candidates = [
            path.join(RENDERS_DIR, 'stills', base),
            path.join(RENDERS_DIR, 'ads', base),
            path.join(RENDERS_DIR, base),
        ];
        for (const c of candidates) {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) return fileToDataUrl(c);
        }
    }

    // Absolute path on disk (dev only)
    if (path.isAbsolute(raw) && fs.existsSync(raw) && fs.statSync(raw).isFile()) {
        return fileToDataUrl(raw);
    }

    return raw;
}

function fileToDataUrl(filePath) {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
        ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
}

function clampDuration(model, duration) {
    // Prefer short talk-clip durations when model allows (reduces silent tail after speech)
    const opts = model.durationOptions || [3, 4, 5, 6];
    const n = Number(duration) || model.durationDefault || 5;
    // pick nearest allowed
    let best = opts[0];
    let bestDiff = Math.abs(best - n);
    for (const o of opts) {
        const d = Math.abs(o - n);
        if (d < bestDiff) {
            best = o;
            bestDiff = d;
        }
    }
    return best;
}

/**
 * Build fal input payload for a model registry entry.
 * generateAudio: force native speech/SFX when model supports it (contractor talk reels).
 */
export function buildFalInput(model, { prompt, imageUrl, duration, aspectRatio, generateAudio }) {
    const dur = clampDuration(model, duration);
    const imageField = model.imageField || 'image_url';
    const input = {
        prompt: prompt || 'Subtle natural motion from this still photograph.',
    };

    input[imageField] = imageUrl;

    if (model.durationAsString) {
        input.duration = String(dur);
    } else {
        input.duration = dur;
    }

    const wantAudio =
        generateAudio != null ? Boolean(generateAudio) : Boolean(model.generateAudio);

    // Seedance likes aspect_ratio
    if (model.id === 'seedance_25' || model.falEndpoint?.includes('seedance')) {
        input.aspect_ratio = aspectRatio || model.aspectDefault || '9:16';
        if (model.resolution) input.resolution = model.resolution;
        if (model.supportsNativeAudio || model.generateAudio != null || generateAudio != null) {
            input.generate_audio = wantAudio;
        }
    }

    // MiniMax H3
    if (model.id === 'minimax_h3') {
        if (model.resolution) input.resolution = model.resolution;
    }

    // Kling native audio (Pro / Standard) — only when explicitly requested ($$$)
    if (
        model.id === 'kling' ||
        model.id === 'kling_std' ||
        model.supportsNativeAudio
    ) {
        if (model.generateAudio != null || generateAudio != null) {
            input.generate_audio = wantAudio;
        }
    }

    return input;
}

/**
 * Start async video job. Returns { requestId, modelId, provider, status: 'pending' }
 */
export async function startUnifiedVideo({
    modelId = 'grok',
    prompt,
    imageUrl,
    duration,
    aspectRatio = '9:16',
    generateAudio,
    /** Spoken line for Grok native lip-sync (also usually already in prompt) */
    dialogue = null,
}) {
    if (!imageUrl) {
        const err = new Error('imageUrl is required');
        err.status = 400;
        throw err;
    }

    const model = getVideoModel(modelId);
    if (!isModelAvailable(model.id)) {
        const err = new Error(
            `${model.label} is not available — set ${model.requires} in .env`
        );
        err.status = 400;
        err.code = 'MODEL_UNAVAILABLE';
        throw err;
    }

    // Studio stills are often `/api/renders/stills/…` after 9:16 reframe —
    // remote I2V providers need a public URL or base64 data URI.
    const remoteImageUrl = resolveImageForRemoteProvider(imageUrl);
    if (
        remoteImageUrl &&
        !remoteImageUrl.startsWith('data:') &&
        !/^https?:\/\//i.test(remoteImageUrl)
    ) {
        const err = new Error(
            `Cannot send image to video provider — local path not found: ${String(imageUrl).slice(0, 120)}`
        );
        err.status = 400;
        err.code = 'IMAGE_NOT_REMOTE';
        throw err;
    }

    if (model.provider === 'xai') {
        const started = await grokStartVideo({
            prompt,
            imageUrl: remoteImageUrl,
            duration: clampDuration(model, duration ?? model.durationDefault),
            aspectRatio,
            dialogue: dialogue || null,
        });
        const job = createJob({
            provider: 'xai',
            modelId: model.id,
            modelLabel: model.label,
            grokRequestId: started.requestId,
            status: 'pending',
            prompt,
            // Keep original studio path for debugging; provider got remote/base64
            imageUrl,
            dialogue: dialogue || null,
        });
        return {
            requestId: job.id,
            modelId: model.id,
            modelLabel: model.label,
            provider: 'xai',
            status: 'pending',
            grokRequestId: started.requestId,
        };
    }

    // fal
    const input = buildFalInput(model, {
        prompt,
        imageUrl: remoteImageUrl,
        duration: duration ?? model.durationDefault,
        aspectRatio,
        generateAudio,
    });
    const submitted = await falQueueSubmit(model.falEndpoint, input);
    const job = createJob({
        provider: 'fal',
        modelId: model.id,
        modelLabel: model.label,
        falEndpoint: model.falEndpoint,
        falRequestId: submitted.requestId,
        statusUrl: submitted.statusUrl,
        responseUrl: submitted.responseUrl,
        status: 'pending',
        prompt,
        imageUrl,
        generateAudio: Boolean(generateAudio),
    });

    return {
        requestId: job.id,
        modelId: model.id,
        modelLabel: model.label,
        provider: 'fal',
        status: 'pending',
        falRequestId: submitted.requestId,
        generateAudio: Boolean(generateAudio ?? model.generateAudio),
    };
}

/**
 * Poll unified job.
 */
export async function pollUnifiedVideo(requestId) {
    // Legacy: pure Grok request ids (no job registry) — still support
    const job = getJob(requestId);
    if (!job) {
        // try as raw Grok request id for backward compatibility
        try {
            const result = await grokGetVideoStatus(requestId);
            return {
                status: result.status,
                url: result.url,
                modelId: 'grok',
                provider: 'xai',
                raw: result.raw,
            };
        } catch {
            const err = new Error(`Unknown video job: ${requestId}`);
            err.status = 404;
            throw err;
        }
    }

    if (job.status === 'done' && job.videoUrl) {
        return {
            status: 'done',
            url: job.videoUrl,
            modelId: job.modelId,
            modelLabel: job.modelLabel,
            provider: job.provider,
        };
    }
    if (job.status === 'failed') {
        return {
            status: 'failed',
            url: null,
            modelId: job.modelId,
            error: job.error,
            provider: job.provider,
        };
    }

    if (job.provider === 'xai') {
        const result = await grokGetVideoStatus(job.grokRequestId);
        const status = result.status;
        if (status === 'done' || status === 'completed' || status === 'succeeded') {
            updateJob(job.id, { status: 'done', videoUrl: result.url });
            return {
                status: 'done',
                url: result.url,
                modelId: job.modelId,
                modelLabel: job.modelLabel,
                provider: 'xai',
                raw: result.raw,
            };
        }
        if (status === 'failed' || status === 'expired') {
            const detail =
                result.raw?.error?.message ||
                result.raw?.error?.code ||
                (typeof result.raw?.error === 'string' ? result.raw.error : null) ||
                result.raw?.message ||
                status;
            const error = `Video ${status}: ${detail}`;
            updateJob(job.id, { status: 'failed', error, raw: result.raw || null });
            return {
                status: 'failed',
                url: null,
                modelId: job.modelId,
                modelLabel: job.modelLabel,
                provider: 'xai',
                error,
                raw: result.raw,
            };
        }
        return {
            status: status || 'pending',
            url: null,
            modelId: job.modelId,
            modelLabel: job.modelLabel,
            provider: 'xai',
        };
    }

    // fal — network blips must not hard-fail the studio poll
    let status;
    let raw;
    try {
        ({ status, raw } = await falQueueStatus(job.statusUrl));
    } catch (e) {
        if (e.transient || e.code === 'FAL_NETWORK' || e.status === 502) {
            return {
                status: 'processing',
                url: null,
                modelId: job.modelId,
                modelLabel: job.modelLabel,
                provider: 'fal',
                note: e.message,
                transient: true,
            };
        }
        updateJob(job.id, { status: 'failed', error: e.message });
        return {
            status: 'failed',
            url: null,
            modelId: job.modelId,
            modelLabel: job.modelLabel,
            provider: 'fal',
            error: e.message,
        };
    }

    if (status === 'COMPLETED') {
        try {
            const data = await falQueueResult(job.responseUrl);
            const url = extractFalVideoUrl(data);
            if (!url) {
                // Result not ready / unexpected shape — keep polling
                return {
                    status: 'processing',
                    url: null,
                    modelId: job.modelId,
                    modelLabel: job.modelLabel,
                    provider: 'fal',
                    note: 'fal COMPLETED but video URL not ready yet',
                    transient: true,
                };
            }
            updateJob(job.id, { status: 'done', videoUrl: url });
            return {
                status: 'done',
                url,
                modelId: job.modelId,
                modelLabel: job.modelLabel,
                provider: 'fal',
                raw: data,
            };
        } catch (e) {
            if (e.transient || e.code === 'FAL_NETWORK' || e.status === 502) {
                return {
                    status: 'processing',
                    url: null,
                    modelId: job.modelId,
                    modelLabel: job.modelLabel,
                    provider: 'fal',
                    note: e.message,
                    transient: true,
                };
            }
            updateJob(job.id, { status: 'failed', error: e.message });
            return {
                status: 'failed',
                url: null,
                modelId: job.modelId,
                error: e.message,
                provider: 'fal',
            };
        }
    }
    if (status === 'FAILED' || status === 'CANCELLED') {
        const errMsg = raw?.error || raw?.detail || status;
        const error =
            typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
        updateJob(job.id, { status: 'failed', error });
        return {
            status: 'failed',
            url: null,
            modelId: job.modelId,
            modelLabel: job.modelLabel,
            provider: 'fal',
            error,
        };
    }

    return {
        status: status === 'IN_PROGRESS' ? 'processing' : 'pending',
        url: null,
        modelId: job.modelId,
        modelLabel: job.modelLabel,
        provider: 'fal',
    };
}

/**
 * Blocking generate (server-side convenience).
 */
export async function generateUnifiedVideoAndWait({
    modelId = 'grok',
    prompt,
    imageUrl,
    duration,
    aspectRatio = '9:16',
    generateAudio,
    dialogue = null,
    timeoutMs = 300000,
}) {
    const model = getVideoModel(modelId);
    if (!isModelAvailable(model.id)) {
        const err = new Error(`${model.label} unavailable — set ${model.requires}`);
        err.status = 400;
        throw err;
    }

    if (model.provider === 'xai') {
        return grokGenerateAndWait({
            prompt,
            imageUrl,
            duration: clampDuration(model, duration ?? model.durationDefault),
            aspectRatio,
            dialogue: dialogue || null,
            timeoutMs,
        }).then((r) => ({
            url: r.url,
            requestId: r.requestId,
            modelId: model.id,
            modelLabel: model.label,
            provider: 'xai',
            raw: r.raw,
        }));
    }

    const input = buildFalInput(model, {
        prompt,
        imageUrl,
        duration: duration ?? model.durationDefault,
        aspectRatio,
        generateAudio,
    });
    const result = await falGenerateAndWait({
        endpoint: model.falEndpoint,
        input,
        timeoutMs,
    });
    return {
        url: result.url,
        requestId: result.requestId,
        modelId: model.id,
        modelLabel: model.label,
        provider: 'fal',
        raw: result.raw,
        generateAudio: Boolean(generateAudio ?? model.generateAudio),
    };
}

export { hasFalKey };
