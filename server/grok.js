/**
 * xAI Grok Imagine client — images + video (image-to-video)
 * Docs: https://docs.x.ai/docs/guides/image-generations
 */

const XAI_BASE = 'https://api.x.ai/v1';

function apiKey() {
    const key = process.env.XAI_API_KEY;
    if (!key) {
        const err = new Error('XAI_API_KEY is not set. Add it to .env');
        err.code = 'NO_API_KEY';
        throw err;
    }
    return key;
}

function imageModel() {
    return process.env.GROK_IMAGE_MODEL || 'grok-imagine-image-quality';
}

function videoModel() {
    return process.env.GROK_VIDEO_MODEL || 'grok-imagine-video-1.5';
}

/**
 * Grok Imagine supported aspect ratios (API rejects anything else with 422).
 * @see xAI images/generations
 */
export const GROK_ASPECT_RATIOS = [
    '1:1',
    '3:4',
    '4:3',
    '9:16',
    '16:9',
    '2:3',
    '3:2',
    '9:19.5',
    '19.5:9',
    '9:20',
    '20:9',
    '1:2',
    '2:1',
    'auto',
];

/** Map studio / design ratios → closest Grok-supported plate ratio */
const ASPECT_ALIASES = {
    '4:5': '3:4', // IG portrait → closest supported
    '5:4': '4:3',
    '2.35:1': '2:1',
    '2.39:1': '2:1',
    '21:9': '2:1',
    '18:9': '2:1',
    '9:18': '9:16',
};

/**
 * Normalize any UI aspect to a Grok-accepted value.
 * Unknown ratios fall back to 1:1.
 */
export function normalizeGrokAspect(aspectRatio) {
    const raw = String(aspectRatio || '1:1').trim();
    if (GROK_ASPECT_RATIOS.includes(raw)) return raw;
    if (ASPECT_ALIASES[raw]) return ASPECT_ALIASES[raw];
    // loose match e.g. "4 / 5"
    const compact = raw.replace(/\s+/g, '');
    if (GROK_ASPECT_RATIOS.includes(compact)) return compact;
    if (ASPECT_ALIASES[compact]) return ASPECT_ALIASES[compact];
    return '1:1';
}

/** Map studio formats to Imagine aspect ratios */
export function aspectForFormat(format) {
    if (format === 'reel') return '9:16';
    if (format === 'story') return '9:16';
    return '1:1';
}

/** Parse xAI error bodies (JSON or plain text) into a readable message */
function formatApiError(data, res, fallbackText = '') {
    if (data && typeof data === 'object') {
        const msg =
            data.error?.message ||
            (typeof data.error === 'string' ? data.error : null) ||
            data.message ||
            null;
        if (msg) return msg;
        // empty {} from failed json parse — use raw text
        if (Object.keys(data).length === 0 && fallbackText) return fallbackText.slice(0, 500);
        try {
            const s = JSON.stringify(data);
            if (s && s !== '{}') return s;
        } catch {
            /* ignore */
        }
    }
    if (typeof data === 'string' && data.trim()) return data.slice(0, 500);
    if (fallbackText) return fallbackText.slice(0, 500);
    return `HTTP ${res?.status || '?'} from xAI`;
}

function normalizeImageUrls(data) {
    const items = data.data || data.images || [];
    return items
        .map((item) => item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null))
        .filter(Boolean);
}

function toImageUrlPayload(image) {
    if (!image) return null;
    if (typeof image === 'string') {
        return { url: image, type: 'image_url' };
    }
    if (image.url) {
        return { url: image.url, type: image.type || 'image_url' };
    }
    return null;
}

/**
 * Generate one or more still images from a text prompt.
 * Optional referenceImage (data URL or https URL) uses /images/edits so output
 * stays much closer to the source identity, wardrobe, and scene.
 */
export async function generateImage({
    prompt,
    aspectRatio = '1:1',
    n = 1,
    referenceImage = null,
    referenceImages = null,
}) {
    const grokAspect = normalizeGrokAspect(aspectRatio);
    const refs = [];
    if (referenceImage) refs.push(referenceImage);
    if (Array.isArray(referenceImages)) refs.push(...referenceImages);

    if (refs.length > 0) {
        return editImage({
            prompt,
            images: refs,
            n,
            aspectRatio: grokAspect,
        });
    }

    let res;
    try {
        res = await fetch(`${XAI_BASE}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey()}`,
            },
            body: JSON.stringify({
                model: imageModel(),
                prompt,
                n: Math.min(Math.max(n, 1), 4),
                aspect_ratio: grokAspect,
            }),
        });
    } catch (networkErr) {
        const cause = networkErr.cause?.message || networkErr.cause?.code || networkErr.message;
        const err = new Error(
            `Cannot reach xAI image API (${cause}). Check network and that the API server can access api.x.ai.`
        );
        err.status = 502;
        err.code = 'XAI_NETWORK';
        err.details = { cause: String(cause) };
        throw err;
    }

    const rawText = await res.text();
    let data = {};
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        data = {};
    }
    if (!res.ok) {
        const msg = formatApiError(data, res, rawText);
        const err = new Error(`Grok image failed: ${msg}`);
        err.status = res.status;
        err.details = data && Object.keys(data).length ? data : { raw: rawText?.slice(0, 800) };
        err.requestedAspect = aspectRatio;
        err.grokAspect = grokAspect;
        throw err;
    }

    const urls = normalizeImageUrls(data);
    if (!urls.length) {
        const err = new Error('Grok image returned no URLs — unexpected response shape');
        err.details = data;
        throw err;
    }

    return {
        urls,
        raw: data,
        model: imageModel(),
        mode: 'generate',
        aspectRatio: grokAspect,
        requestedAspect: aspectRatio,
    };
}

/**
 * Reference-locked stills via Grok Imagine image edit.
 * Pass 1–3 source images (public URL or data URI) to keep identity/look close.
 * Docs: POST /v1/images/edits
 */
export async function editImage({ prompt, images = [], n = 1, aspectRatio = null }) {
    if (!prompt) {
        const err = new Error('prompt is required for image edit');
        err.status = 400;
        throw err;
    }

    const list = (Array.isArray(images) ? images : [images])
        .map(toImageUrlPayload)
        .filter(Boolean)
        .slice(0, 3);

    if (!list.length) {
        const err = new Error('At least one reference image is required for edit mode');
        err.status = 400;
        throw err;
    }

    const body = {
        model: imageModel(),
        prompt,
        n: Math.min(Math.max(n, 1), 4),
    };

    // Single image: `image`; multi: `images` (up to 3)
    if (list.length === 1) {
        body.image = list[0];
    } else {
        body.images = list;
    }

    // Single-image edits usually inherit source AR; still allow override when set
    if (aspectRatio) {
        body.aspect_ratio = normalizeGrokAspect(aspectRatio);
    }

    let res;
    try {
        res = await fetch(`${XAI_BASE}/images/edits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey()}`,
            },
            body: JSON.stringify(body),
        });
    } catch (networkErr) {
        const cause = networkErr.cause?.message || networkErr.cause?.code || networkErr.message;
        const err = new Error(
            `Cannot reach xAI image edit API (${cause}). Check network / api.x.ai access.`
        );
        err.status = 502;
        err.code = 'XAI_NETWORK';
        err.details = { cause: String(cause) };
        throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg =
            data.error?.message ||
            data.error ||
            data.message ||
            (typeof data === 'string' ? data : JSON.stringify(data));
        const err = new Error(`Grok image edit failed: ${msg}`);
        err.status = res.status;
        err.details = data;
        throw err;
    }

    const urls = normalizeImageUrls(data);
    if (!urls.length) {
        const err = new Error('Grok image edit returned no URLs');
        err.details = data;
        throw err;
    }

    return { urls, raw: data, model: imageModel(), mode: 'edit', referenceCount: list.length };
}

/**
 * Start image-to-video generation. Returns request_id for polling.
 *
 * Grok Imagine Video generates NATIVE synchronized audio (dialogue + lip-sync)
 * in one pass when the prompt includes spoken lines. Do NOT strip that audio
 * and replace with ElevenLabs — that creates dual-voice / delayed-subtitle hell.
 *
 * For talking-head reels, put the exact dialogue in the prompt, e.g.:
 *   `The contractor looks at camera and says: "I invoice before I leave."`
 */
export async function startVideo({
    prompt,
    imageUrl,
    duration = 6,
    aspectRatio = '9:16',
    /** Optional spoken line to force into prompt for lip-synced dialogue */
    dialogue = null,
} = {}) {
    if (!imageUrl) {
        throw new Error('imageUrl is required to animate a static asset');
    }

    let finalPrompt = prompt || '';
    if (dialogue) {
        const line = String(dialogue).trim();
        finalPrompt = [
            finalPrompt,
            `The person on camera speaks clearly to the lens with natural lip-sync.`,
            `They say exactly: "${line}"`,
            `Native dialogue audio must match mouth movement. No off-camera narrator.`,
        ]
            .filter(Boolean)
            .join(' ');
    }

    const body = {
        model: videoModel(),
        prompt: finalPrompt,
        duration,
        aspect_ratio: aspectRatio,
        image: { url: imageUrl },
    };

    let res;
    try {
        res = await fetch(`${XAI_BASE}/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey()}`,
            },
            body: JSON.stringify(body),
        });
    } catch (networkErr) {
        const cause = networkErr.cause?.message || networkErr.cause?.code || networkErr.message;
        const err = new Error(`Cannot reach xAI video API (${cause})`);
        err.status = 502;
        err.code = 'XAI_NETWORK';
        throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data.error?.message || data.error || data.message || JSON.stringify(data);
        const err = new Error(`Grok video start failed: ${msg}`);
        err.status = res.status;
        err.details = data;
        throw err;
    }

    const requestId = data.request_id || data.id;
    if (!requestId) {
        throw new Error('Grok video did not return request_id');
    }

    return { requestId, raw: data, model: videoModel() };
}

/**
 * Poll video job until done / failed / expired.
 */
export async function getVideoStatus(requestId) {
    const res = await fetch(`${XAI_BASE}/videos/${requestId}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data.error?.message || data.message || JSON.stringify(data);
        const err = new Error(`Grok video poll failed: ${msg}`);
        err.status = res.status;
        err.details = data;
        throw err;
    }

    const status = data.status || 'unknown';
    const url = data.video?.url || data.url || null;

    return { status, url, raw: data };
}

/**
 * Start + poll until complete (server-side convenience).
 */
export async function generateVideoAndWait({
    prompt,
    imageUrl,
    duration = 6,
    aspectRatio = '9:16',
    dialogue = null,
    timeoutMs = 180000,
    intervalMs = 4000,
}) {
    const { requestId } = await startVideo({
        prompt,
        imageUrl,
        duration,
        aspectRatio,
        dialogue,
    });
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const { status, url, raw } = await getVideoStatus(requestId);
        if (status === 'done' || status === 'completed' || status === 'succeeded') {
            if (!url) throw new Error('Video done but no URL returned');
            return { url, requestId, raw };
        }
        if (status === 'failed' || status === 'expired') {
            throw new Error(`Video generation ${status}`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error('Video generation timed out');
}

export function hasGrokKey() {
    return Boolean(process.env.XAI_API_KEY);
}
