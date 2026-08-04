import { getWorkspaceId } from './workspace';

/**
 * @param {string} path
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * timeoutMs: default 20s so a wedged API can't freeze workspace switch / bootstrap forever.
 * Long jobs (batch, video, research) pass a higher timeoutMs.
 */
async function req(path, options = {}) {
    const workspaceId = getWorkspaceId();
    const { timeoutMs = 20000, headers: optHeaders, ...fetchOpts } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // If caller already passed a signal, abort ours when theirs aborts
    if (fetchOpts.signal) {
        if (fetchOpts.signal.aborted) controller.abort();
        else fetchOpts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    let res;
    try {
        res = await fetch(path, {
            ...fetchOpts,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
                ...(optHeaders || {}),
            },
        });
    } catch (networkErr) {
        const aborted = networkErr?.name === 'AbortError';
        throw new Error(
            aborted
                ? `API timed out after ${Math.round(timeoutMs / 1000)}s (${path}). Is the server healthy on :8787?`
                : `API unreachable (${networkErr.message}). Is the server running on :8787? Try npm run dev.`
        );
    } finally {
        clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail =
            typeof data.details === 'string'
                ? data.details
                : data.details?.error?.message || data.details?.error || data.details?.message;
        const msg = [data.error || res.statusText || 'Request failed', detail]
            .filter(Boolean)
            .join(' — ');
        const err = new Error(msg);
        err.status = res.status;
        err.code = data.code;
        err.details = data.details;
        throw err;
    }
    return data;
}

export const api = {
    health: () => req('/api/health'),

    // Workspaces
    workspaces: () => req('/api/workspaces'),
    activeWorkspace: () => req('/api/workspaces/active'),
    setActiveWorkspace: (id) =>
        req('/api/workspaces/active', { method: 'POST', body: JSON.stringify({ id }) }),
    createWorkspace: (body) =>
        req('/api/workspaces', { method: 'POST', body: JSON.stringify(body) }),
    publishConfig: () => req('/api/publish-config'),

    // Brand OS onboarding
    onboarding: () => req('/api/onboarding'),
    saveOnboarding: (body) =>
        req('/api/onboarding', { method: 'PUT', body: JSON.stringify(body) }),
    onboardingStep: (body) =>
        req('/api/onboarding/step', { method: 'POST', body: JSON.stringify(body) }),
    runOnboardingResearch: (body = {}) =>
        req('/api/onboarding/research', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 300000,
        }),
    lockOnboarding: (body = {}) =>
        req('/api/onboarding/lock', { method: 'POST', body: JSON.stringify(body) }),
    reopenOnboarding: (body = {}) =>
        req('/api/onboarding/reopen', { method: 'POST', body: JSON.stringify(body) }),
    uploadOnboardingAsset: (body) =>
        req('/api/onboarding/assets', { method: 'POST', body: JSON.stringify(body) }),
    onboardingDrafts: () => req('/api/onboarding/drafts'),

    brand: () => req('/api/brand'),
    saveBrand: (body) => req('/api/brand', { method: 'PUT', body: JSON.stringify(body) }),
    resetBrand: () => req('/api/brand/reset', { method: 'POST', body: '{}' }),
    packs: () => req('/api/packs'),
    styles: () => req('/api/styles'),
    style: (id) => req(`/api/styles/${id}`),
    flows: () => req('/api/flows'),
    flow: (id) => req(`/api/flows/${id}`),
    videoModels: () => req('/api/video-models'),
    benchmarks: () => req('/api/benchmarks'),
    batch: (packId, options = {}) =>
        req('/api/batch', {
            method: 'POST',
            body: JSON.stringify({ packId, ...options }),
            timeoutMs: 120000,
        }),
    /** Still posters / banners — ideas + prompts; generate pixels separately */
    imageBatch: (body = {}) =>
        req('/api/batch/images', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 120000,
        }),
    imageBatchOptions: () => req('/api/batch/images/options'),
    /** Brand-locked static ads — plate + copy + template; compose after plate gen */
    adBatch: (body = {}) =>
        req('/api/batch/ads', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 120000,
        }),
    adBatchOptions: () => req('/api/batch/ads/options'),
    composeAd: (body = {}) =>
        req('/api/ads/compose', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 120000,
        }),
    rematerializeStory: (body) =>
        req('/api/story/rematerialize', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 300000,
        }),
    /** New spoken lines for a story reel — keeps stills; clears assembled final */
    regenStoryScript: (body) =>
        req('/api/story/regen-script', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 30000,
        }),
    assembleStory: (body) =>
        req('/api/story/assemble', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 300000,
        }),
    /** Completed story finals on disk — used to re-attach after crash / Bad Gateway */
    listRenders: () => req('/api/renders'),
    generateImage: (body) =>
        req('/api/generate/image', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 180000,
        }),
    generateCarousel: (body) =>
        req('/api/generate/carousel', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 300000,
        }),
    startVideo: (body) =>
        req('/api/generate/video', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 120000,
        }),
    pollVideo: (requestId) => req(`/api/generate/video/${requestId}`, { timeoutMs: 30000 }),

    uploadPostMe: () => req('/api/upload-post/me'),
    uploadPostProfiles: () => req('/api/upload-post/profiles'),
    publish: (body) =>
        req('/api/upload-post/publish', { method: 'POST', body: JSON.stringify(body) }),
    publishStatus: (requestId) => req(`/api/upload-post/status/${requestId}`),

    listRefs: () => req('/api/refs'),
    addRef: (body) => req('/api/refs', { method: 'POST', body: JSON.stringify(body) }),
    updateRef: (id, body) =>
        req(`/api/refs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteRef: (id) => req(`/api/refs/${id}`, { method: 'DELETE' }),
    refPromptSnippet: (ids) =>
        req('/api/refs/prompt-snippet', { method: 'POST', body: JSON.stringify({ ids }) }),
    analyzeCharacter: (body) =>
        req('/api/refs/analyze', { method: 'POST', body: JSON.stringify(body) }),
    cloneScript: (body) =>
        req('/api/scripts/clone', { method: 'POST', body: JSON.stringify(body) }),

    // Creative tools (Grok/fal only — Arcads playbook port)
    creativeFormulas: () => req('/api/tools/formulas'),
    dialogueCheck: (body) =>
        req('/api/tools/dialogue-check', { method: 'POST', body: JSON.stringify(body) }),
    ugcStillPrompt: (body) =>
        req('/api/tools/ugc-still-prompt', { method: 'POST', body: JSON.stringify(body) }),
    castSheet: (body) =>
        req('/api/tools/cast-sheet', { method: 'POST', body: JSON.stringify(body) }),
    characterSheetPreview: (body) =>
        req('/api/tools/character-sheet/preview', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    characterSheetHero: (body) =>
        req('/api/tools/character-sheet/hero', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 180000,
        }),
    characterSheetAngles: (body) =>
        req('/api/tools/character-sheet/angles', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 600000,
        }),
    characterSheetFull: (body) =>
        req('/api/tools/character-sheet/full', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 900000,
        }),
    cloneAdImage: (body) =>
        req('/api/tools/clone/ad-image', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 180000,
        }),
    cloneVideoStructure: (body) =>
        req('/api/tools/clone/video', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 180000,
        }),
    listNativeUiTemplates: () => req('/api/tools/native-ui'),
    previewNativeUi: (body) =>
        req('/api/tools/native-ui/preview', { method: 'POST', body: JSON.stringify(body) }),
    generateNativeUi: (body) =>
        req('/api/tools/native-ui/generate', {
            method: 'POST',
            body: JSON.stringify(body),
            timeoutMs: 180000,
        }),
    genAudit: (params = {}) => {
        const q = new URLSearchParams();
        if (params.limit) q.set('limit', String(params.limit));
        if (params.kind) q.set('kind', params.kind);
        const qs = q.toString();
        return req(`/api/tools/audit${qs ? `?${qs}` : ''}`);
    },
};

/** Poll unified video job (Grok or fal) until done */
export async function waitForVideo(requestId, { timeoutMs = 420000, intervalMs = 5000 } = {}) {
    const start = Date.now();
    let consecutiveNetwork = 0;
    while (Date.now() - start < timeoutMs) {
        let result;
        try {
            result = await api.pollVideo(requestId);
            consecutiveNetwork = 0;
        } catch (e) {
            consecutiveNetwork += 1;
            if (consecutiveNetwork > 12) {
                throw new Error(
                    e.message || 'Video poll failed repeatedly (network). Check FAL_KEY / connection.'
                );
            }
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
        }
        const status = (result.status || '').toLowerCase();
        if (status === 'done' || status === 'completed' || status === 'succeeded') {
            if (!result.url) throw new Error('Video ready but no URL');
            return result;
        }
        if (status === 'failed' || status === 'expired' || status === 'cancelled') {
            throw new Error(result.error || `Video ${status}`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Video timed out — fal may be slow; try Animate beats again');
}
