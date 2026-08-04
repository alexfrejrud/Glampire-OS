/**
 * Unified video generation — routes to Grok (xAI) or fal (Kling / Seedance / MiniMax).
 */

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

function clampDuration(model, duration) {
    const opts = model.durationOptions || [5, 6];
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

    if (model.provider === 'xai') {
        const started = await grokStartVideo({
            prompt,
            imageUrl,
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
        imageUrl,
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
            updateJob(job.id, { status: 'failed', error: `Video ${status}` });
            return { status: 'failed', url: null, modelId: job.modelId, provider: 'xai' };
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
