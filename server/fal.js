/**
 * fal.ai queue client — Kling, Seedance, MiniMax, etc.
 * Docs: https://docs.fal.ai/model-apis/model-endpoints/queue
 *
 * Auth: Authorization: Key $FAL_KEY
 *
 * Network: queue.fal.run can timeout — retries + soft failures so studio polls
 * don't hard-500 on a single ConnectTimeout ("fetch failed").
 */

function falKey() {
    const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!key) {
        const err = new Error('FAL_KEY is not set. Add it to .env (https://fal.ai/dashboard/keys)');
        err.code = 'NO_FAL_KEY';
        err.status = 400;
        throw err;
    }
    return key;
}

export function hasFalKey() {
    return Boolean(process.env.FAL_KEY || process.env.FAL_API_KEY);
}

function headers() {
    return {
        Authorization: `Key ${falKey()}`,
        'Content-Type': 'application/json',
    };
}

function isTransientNetworkError(err) {
    const msg = String(err?.message || err || '');
    const causeMsg = String(err?.cause?.message || err?.cause?.code || '');
    const code = String(err?.cause?.code || err?.code || '');
    return (
        /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Connect Timeout|UND_ERR|aborted|timeout/i.test(
            msg + ' ' + causeMsg
        ) || /UND_ERR|TIMEOUT|ECONN|ENETUNREACH|ABORT/i.test(code)
    );
}

function abortSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
}

async function falFetch(url, options = {}, { retries = 3, timeoutMs = 90_000 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...headers(),
                    ...(options.headers || {}),
                },
                signal: options.signal || abortSignal(timeoutMs),
            });
            return res;
        } catch (err) {
            lastErr = err;
            if (!isTransientNetworkError(err) || attempt === retries) {
                const wrapped = new Error(
                    `Cannot reach fal.ai (${err.cause?.message || err.message})`
                );
                wrapped.status = 502;
                wrapped.code = 'FAL_NETWORK';
                wrapped.cause = err;
                wrapped.transient = true;
                throw wrapped;
            }
            await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
    }
    throw lastErr;
}

async function readJson(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

function formatFalError(data, fallback) {
    const d = data?.detail ?? data?.error ?? data?.message ?? fallback;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
        return d.map((x) => x?.msg || x?.message || JSON.stringify(x)).join('; ');
    }
    try {
        return JSON.stringify(d);
    } catch {
        return fallback;
    }
}

/**
 * Submit job to fal queue.
 * @returns {{ requestId, statusUrl, responseUrl, endpoint, raw }}
 */
export async function falQueueSubmit(endpoint, input) {
    if (!endpoint) throw new Error('fal endpoint is required');

    const res = await falFetch(
        `https://queue.fal.run/${endpoint}`,
        {
            method: 'POST',
            body: JSON.stringify(input),
        },
        { retries: 3, timeoutMs: 90_000 }
    );

    const data = await readJson(res);
    if (!res.ok) {
        const msg = formatFalError(data, `HTTP ${res.status}`);
        const err = new Error(`fal submit failed: ${msg}`);
        err.status = res.status >= 500 ? 502 : res.status;
        err.details = data;
        err.code = 'FAL_SUBMIT';
        throw err;
    }

    const requestId = data.request_id || data.requestId;
    const statusUrl = data.status_url || data.statusUrl;
    const responseUrl = data.response_url || data.responseUrl;

    if (!requestId && !statusUrl) {
        const err = new Error('fal submit returned no request_id');
        err.details = data;
        throw err;
    }

    return {
        requestId,
        statusUrl:
            statusUrl ||
            `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
        responseUrl:
            responseUrl ||
            `https://queue.fal.run/${endpoint}/requests/${requestId}`,
        endpoint,
        raw: data,
    };
}

/**
 * Poll fal status URL.
 * status: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELLED
 */
export async function falQueueStatus(statusUrl) {
    const res = await falFetch(statusUrl, { method: 'GET' }, { retries: 3, timeoutMs: 60_000 });
    const data = await readJson(res);
    if (!res.ok) {
        const err = new Error(formatFalError(data, 'fal status failed'));
        err.status = res.status >= 500 ? 502 : res.status;
        err.details = data;
        err.code = 'FAL_STATUS';
        err.transient = res.status === 404 || res.status >= 500;
        throw err;
    }
    return {
        status: data.status || 'UNKNOWN',
        raw: data,
    };
}

export async function falQueueResult(responseUrl) {
    const res = await falFetch(responseUrl, { method: 'GET' }, { retries: 3, timeoutMs: 90_000 });
    const data = await readJson(res);
    if (!res.ok) {
        const err = new Error(formatFalError(data, 'fal result failed'));
        err.status = res.status >= 500 ? 502 : res.status;
        err.details = data;
        err.code = 'FAL_RESULT';
        err.transient = res.status === 404 || res.status === 409 || res.status >= 500;
        throw err;
    }
    return data;
}

/** Extract video URL from various fal response shapes */
export function extractFalVideoUrl(data) {
    if (!data) return null;
    if (data.video?.url) return data.video.url;
    if (data.video_url) return data.video_url;
    if (typeof data.video === 'string') return data.video;
    if (data.output?.video?.url) return data.output.video.url;
    if (data.output?.url && /\.mp4|\.webm/i.test(data.output.url)) return data.output.url;
    if (Array.isArray(data.videos) && data.videos[0]?.url) return data.videos[0].url;
    if (data.data) return extractFalVideoUrl(data.data);
    if (data.response) return extractFalVideoUrl(data.response);
    return null;
}

/**
 * Submit + poll until done.
 */
export async function falGenerateAndWait({
    endpoint,
    input,
    timeoutMs = 300000,
    intervalMs = 4000,
}) {
    const submitted = await falQueueSubmit(endpoint, input);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        let status;
        let raw;
        try {
            ({ status, raw } = await falQueueStatus(submitted.statusUrl));
        } catch (e) {
            if (e.transient || e.code === 'FAL_NETWORK') {
                await new Promise((r) => setTimeout(r, intervalMs));
                continue;
            }
            throw e;
        }
        if (status === 'COMPLETED') {
            try {
                const result = await falQueueResult(submitted.responseUrl);
                const url = extractFalVideoUrl(result);
                if (!url) {
                    const err = new Error('fal completed but no video URL in response');
                    err.details = result;
                    throw err;
                }
                return {
                    url,
                    requestId: submitted.requestId,
                    raw: result,
                    endpoint,
                };
            } catch (e) {
                if (e.transient || e.code === 'FAL_NETWORK') {
                    await new Promise((r) => setTimeout(r, intervalMs));
                    continue;
                }
                throw e;
            }
        }
        if (status === 'FAILED' || status === 'CANCELLED') {
            const detail = raw?.error || raw?.detail || status;
            throw new Error(
                `fal video ${status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
            );
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error('fal video generation timed out');
}
