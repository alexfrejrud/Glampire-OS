import { getWorkspaceId } from './workspace';

async function req(path, options = {}) {
    const workspaceId = getWorkspaceId();
    let res;
    try {
        res = await fetch(path, {
            headers: {
                'Content-Type': 'application/json',
                ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
                ...(options.headers || {}),
            },
            ...options,
        });
    } catch (networkErr) {
        throw new Error(
            `API unreachable (${networkErr.message}). Is the server running on :8787? Try npm run dev.`
        );
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
        req('/api/onboarding/research', { method: 'POST', body: JSON.stringify(body) }),
    lockOnboarding: (body = {}) =>
        req('/api/onboarding/lock', { method: 'POST', body: JSON.stringify(body) }),
    reopenOnboarding: () =>
        req('/api/onboarding/reopen', { method: 'POST', body: '{}' }),
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
        }),
    /** Still posters / banners — ideas + prompts; generate pixels separately */
    imageBatch: (body = {}) =>
        req('/api/batch/images', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    imageBatchOptions: () => req('/api/batch/images/options'),
    /** Brand-locked static ads — plate + copy + template; compose after plate gen */
    adBatch: (body = {}) =>
        req('/api/batch/ads', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    adBatchOptions: () => req('/api/batch/ads/options'),
    composeAd: (body = {}) =>
        req('/api/ads/compose', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    rematerializeStory: (body) =>
        req('/api/story/rematerialize', { method: 'POST', body: JSON.stringify(body) }),
    assembleStory: (body) =>
        req('/api/story/assemble', { method: 'POST', body: JSON.stringify(body) }),
    /** Completed story finals on disk — used to re-attach after crash / Bad Gateway */
    listRenders: () => req('/api/renders'),
    generateImage: (body) =>
        req('/api/generate/image', { method: 'POST', body: JSON.stringify(body) }),
    generateCarousel: (body) =>
        req('/api/generate/carousel', { method: 'POST', body: JSON.stringify(body) }),
    startVideo: (body) =>
        req('/api/generate/video', { method: 'POST', body: JSON.stringify(body) }),
    pollVideo: (requestId) => req(`/api/generate/video/${requestId}`),

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
