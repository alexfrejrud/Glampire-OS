/**
 * Video model registry — selectable engines for I2V / story beats.
 *
 * COST RULE (Taskiz studio):
 *  - Default = Grok (draft / volume) — do not burn fal $ on every experiment
 *  - Kling Standard = cheap polish when needed
 *  - Kling Pro + audio = hero / paid ads only (expensive)
 *
 * fal Kling v3 Pro I2V ≈ $0.112/s audio off, $0.168/s audio on
 * → 3 beats × 5s × audio on ≈ $2.50–$3+ (retries push toward $4)
 */

export const VIDEO_MODELS = {
    grok: {
        id: 'grok',
        label: 'Grok Video',
        provider: 'xai',
        description:
            'Default for weekly packs. Fast I2V on xAI — use this for almost all drafts and story tests.',
        bestFor: 'Draft reels, volume, story structure tests, low cost',
        requires: 'XAI_API_KEY',
        supportsI2V: true,
        durationDefault: 5,
        durationOptions: [5, 6, 8, 10],
        aspectDefault: '9:16',
        /** Rough $ for UI — xAI is usage-based, treat as draft budget */
        costPerSec: 0,
        costPerSecAudio: 0,
        costHint: '~$0 extra on fal (xAI plan)',
        costLabel: 'Draft · cheap',
        tier: 'draft',
        supportsNativeAudio: false,
        generateAudio: false,
    },
    kling_std: {
        id: 'kling_std',
        label: 'Kling 3.0 Standard',
        provider: 'fal',
        falEndpoint: 'fal-ai/kling-video/v3/standard/image-to-video',
        description:
            'Cheaper Kling I2V for polish. Prefer this over Pro for multi-beat stories.',
        bestFor: 'UGC polish without Pro prices',
        requires: 'FAL_KEY',
        supportsI2V: true,
        imageField: 'start_image_url',
        durationDefault: 5,
        durationOptions: [5, 6, 8, 10],
        durationAsString: true,
        aspectDefault: '9:16',
        // Standard is lower than Pro; approximate fal rates
        costPerSec: 0.084,
        costPerSecAudio: 0.112,
        costHint: '~$0.08–0.11/s (fal Standard)',
        costLabel: 'Polish · mid',
        tier: 'standard',
        generateAudio: false,
        supportsNativeAudio: true,
    },
    kling: {
        id: 'kling',
        label: 'Kling 3.0 Pro',
        provider: 'fal',
        falEndpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
        description:
            'HERO only. Cinematic + optional native speech. Expensive on multi-beat — confirm cost first.',
        bestFor: 'Paid ad heroes, final takes only',
        requires: 'FAL_KEY',
        supportsI2V: true,
        imageField: 'start_image_url',
        durationDefault: 5,
        durationOptions: [5, 6, 8, 10],
        durationAsString: true,
        aspectDefault: '9:16',
        costPerSec: 0.112,
        costPerSecAudio: 0.168,
        costHint: '~$0.11–0.17/s (fal Pro) — 3×5s audio ≈ $2.5+',
        costLabel: 'Hero · expensive',
        tier: 'hero',
        generateAudio: false,
        supportsNativeAudio: true,
    },
    seedance_25: {
        id: 'seedance_25',
        label: 'Seedance 2.5',
        provider: 'fal',
        falEndpoint: 'bytedance/seedance-2.0/image-to-video',
        falEndpointNote: 'fal: bytedance/seedance-2.0/image-to-video (latest Seedance I2V on fal)',
        description: 'Identity / continuity hero. Premium cost — product continuity only.',
        bestFor: 'Hero demos, product continuity',
        requires: 'FAL_KEY',
        supportsI2V: true,
        imageField: 'image_url',
        durationDefault: 5,
        durationOptions: [5, 6, 8, 10],
        durationAsString: true,
        aspectDefault: '9:16',
        resolution: '720p',
        costPerSec: 0.12,
        costPerSecAudio: 0.12,
        costHint: 'Premium /s (fal Seedance)',
        costLabel: 'Hero · expensive',
        tier: 'hero',
        generateAudio: false,
        supportsNativeAudio: false,
    },
    minimax_h3: {
        id: 'minimax_h3',
        label: 'MiniMax H3',
        provider: 'fal',
        falEndpoint: 'minimax/h3/image-to-video',
        description: 'Frontier MiniMax H3 — high fidelity, premium cost.',
        bestFor: 'High-end alternate look',
        requires: 'FAL_KEY',
        supportsI2V: true,
        imageField: 'image_url',
        durationDefault: 5,
        durationOptions: [5, 6, 8, 10, 12, 15],
        durationAsString: false,
        aspectDefault: '9:16',
        resolution: '768P',
        costPerSec: 0.12,
        costPerSecAudio: 0.12,
        costHint: 'Premium (fal MiniMax)',
        costLabel: 'Hero · expensive',
        tier: 'hero',
        generateAudio: false,
        supportsNativeAudio: false,
    },
};

/**
 * Estimate $ for animating N beats (or total seconds).
 */
export function estimateVideoCost({
    modelId = 'grok',
    beatCount = 1,
    durationSec = 5,
    generateAudio = false,
} = {}) {
    const m = getVideoModel(modelId);
    const rate =
        generateAudio && m.supportsNativeAudio
            ? Number(m.costPerSecAudio ?? m.costPerSec) || 0
            : Number(m.costPerSec) || 0;
    const seconds = Math.max(1, Number(beatCount) || 1) * Math.max(1, Number(durationSec) || 5);
    const usd = rate * seconds;
    return {
        modelId: m.id,
        modelLabel: m.label,
        tier: m.tier,
        beatCount: Math.max(1, Number(beatCount) || 1),
        durationSec: Math.max(1, Number(durationSec) || 5),
        totalSeconds: seconds,
        generateAudio: Boolean(generateAudio && m.supportsNativeAudio),
        ratePerSec: rate,
        estimatedUsd: Math.round(usd * 100) / 100,
        costHint: m.costHint,
        costLabel: m.costLabel,
        warning:
            usd >= 2
                ? 'High cost — use Grok for drafts; Kling Pro+audio for final hero only.'
                : usd >= 0.8
                    ? 'Mid cost — ok for polish, not for every experiment.'
                    : null,
    };
}

export function listVideoModels() {
    return Object.values(VIDEO_MODELS).map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        description: m.description,
        bestFor: m.bestFor,
        requires: m.requires,
        durationDefault: m.durationDefault,
        durationOptions: m.durationOptions,
        costHint: m.costHint,
        costLabel: m.costLabel,
        costPerSec: m.costPerSec,
        costPerSecAudio: m.costPerSecAudio,
        tier: m.tier,
        supportsNativeAudio: Boolean(m.supportsNativeAudio),
        falEndpoint: m.falEndpoint || null,
        falEndpointNote: m.falEndpointNote || null,
        /** Sample: 3 beats × 5s, audio off */
        sampleStoryCostUsd: estimateVideoCost({
            modelId: m.id,
            beatCount: 3,
            durationSec: 5,
            generateAudio: false,
        }).estimatedUsd,
        sampleStoryCostAudioUsd: m.supportsNativeAudio
            ? estimateVideoCost({
                modelId: m.id,
                beatCount: 3,
                durationSec: 5,
                generateAudio: true,
            }).estimatedUsd
            : null,
    }));
}

export function getVideoModel(modelId) {
    if (modelId && VIDEO_MODELS[modelId]) return VIDEO_MODELS[modelId];
    return VIDEO_MODELS.grok;
}

export function isModelAvailable(modelId, env = process.env) {
    const m = getVideoModel(modelId);
    if (m.provider === 'xai') return Boolean(env.XAI_API_KEY);
    if (m.provider === 'fal') return Boolean(env.FAL_KEY || env.FAL_API_KEY);
    return false;
}

export function listVideoModelsWithAvailability(env = process.env) {
    return listVideoModels().map((m) => ({
        ...m,
        available: isModelAvailable(m.id, env),
    }));
}
