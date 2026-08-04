/**
 * Upload-Post client
 * Docs: https://docs.upload-post.com/
 * Base: https://api.upload-post.com/api
 * Auth: Authorization: Apikey <key>
 *
 * Studio mapping:
 *  - Post / Carousel stills → POST /upload_photos
 *  - Reel video              → POST /upload
 *  - Profile "user"          → Upload-Post profile username (dashboard)
 */

const BASE = 'https://api.upload-post.com/api';

function apiKey() {
    const key = process.env.UPLOAD_POST_API_KEY;
    if (!key) {
        const err = new Error(
            'UPLOAD_POST_API_KEY is not set. Add it to .env (from app.upload-post.com → API Keys).'
        );
        err.code = 'NO_UPLOAD_POST_KEY';
        throw err;
    }
    return key;
}

export function hasUploadPostKey() {
    return Boolean(process.env.UPLOAD_POST_API_KEY);
}

function authHeaders(extra = {}) {
    return {
        Authorization: `Apikey ${apiKey()}`,
        ...extra,
    };
}

async function parseResponse(res) {
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!res.ok) {
        const msg =
            data.message || data.error || data.detail || text || `HTTP ${res.status}`;
        const err = new Error(`Upload-Post failed: ${msg}`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data;
}

/** Validate API key + plan */
export async function getMe() {
    const res = await fetch(`${BASE}/uploadposts/me`, {
        headers: authHeaders(),
    });
    return parseResponse(res);
}

/** List profiles (each profile holds connected social accounts) */
export async function listProfiles() {
    const res = await fetch(`${BASE}/uploadposts/users`, {
        headers: authHeaders(),
    });
    const data = await parseResponse(res);
    // Response shapes vary: array | { profiles } | { users } | { data }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.profiles)) return data.profiles;
    if (Array.isArray(data.users)) return data.users;
    if (Array.isArray(data.data)) return data.data;
    return data;
}

/** Create a profile if needed */
export async function createProfile(username) {
    const res = await fetch(`${BASE}/uploadposts/users`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username }),
    });
    return parseResponse(res);
}

/** Download remote media into a Buffer for multipart re-upload */
async function fetchMediaBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download media: ${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';
    return { buf, contentType };
}

function guessExt(contentType, fallback) {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('mp4')) return 'mp4';
    if (contentType.includes('quicktime') || contentType.includes('mov')) return 'mov';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    return fallback;
}

/**
 * Publish photos / carousel.
 * mediaUrls: public image URLs (e.g. Grok CDN)
 */
export async function uploadPhotos({
    user,
    platforms,
    mediaUrls = [],
    title,
    description,
    scheduledDate,
    timezone,
    asyncUpload = true,
    addToQueue = false,
    facebookPageId,
    firstComment,
}) {
    if (!user) throw new Error('Upload-Post profile "user" is required');
    if (!platforms?.length) throw new Error('At least one platform is required');
    if (!mediaUrls.length) throw new Error('At least one media URL is required');

    const form = new FormData();
    form.append('user', user);
    for (const p of platforms) form.append('platform[]', p);
    if (title) form.append('title', title);
    if (description) form.append('description', description);
    if (scheduledDate) form.append('scheduled_date', scheduledDate);
    if (timezone) form.append('timezone', timezone);
    if (asyncUpload) form.append('async_upload', 'true');
    if (addToQueue) form.append('add_to_queue', 'true');
    if (facebookPageId) form.append('facebook_page_id', facebookPageId);
    if (firstComment) form.append('first_comment', firstComment);

    // Download Grok assets and attach as photos[]
    let i = 0;
    for (const url of mediaUrls) {
        const { buf, contentType } = await fetchMediaBuffer(url);
        const ext = guessExt(contentType, 'jpg');
        const blob = new Blob([buf], { type: contentType || 'image/jpeg' });
        form.append('photos[]', blob, `taskiz-${Date.now()}-${i}.${ext}`);
        i += 1;
    }

    const res = await fetch(`${BASE}/upload_photos`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
    });
    return parseResponse(res);
}

/**
 * Publish video / reel.
 * Prefers public video URL (Grok); falls back to binary download.
 */
export async function uploadVideo({
    user,
    platforms,
    videoUrl,
    title,
    description,
    scheduledDate,
    timezone,
    asyncUpload = true,
    addToQueue = false,
    facebookPageId,
    firstComment,
    isAigc = true,
}) {
    if (!user) throw new Error('Upload-Post profile "user" is required');
    if (!platforms?.length) throw new Error('At least one platform is required');
    if (!videoUrl) throw new Error('videoUrl is required');

    const form = new FormData();
    form.append('user', user);
    for (const p of platforms) form.append('platform[]', p);
    // Public URL is supported for video field
    form.append('video', videoUrl);
    if (title) form.append('title', title);
    if (description) form.append('description', description);
    if (scheduledDate) form.append('scheduled_date', scheduledDate);
    if (timezone) form.append('timezone', timezone);
    if (asyncUpload) form.append('async_upload', 'true');
    if (addToQueue) form.append('add_to_queue', 'true');
    if (facebookPageId) form.append('facebook_page_id', facebookPageId);
    if (firstComment) form.append('first_comment', firstComment);
    // TikTok AI-generated content flag (Taskiz media is Grok-generated)
    if (isAigc) form.append('is_aigc', 'true');

    const res = await fetch(`${BASE}/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
    });
    return parseResponse(res);
}

/** Poll async upload status */
export async function getUploadStatus(requestId) {
    const res = await fetch(
        `${BASE}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`,
        { headers: authHeaders() }
    );
    return parseResponse(res);
}

/**
 * Smart publish from a studio creative.
 * format: post | carousel | reel
 */
export async function publishCreative({
    format,
    user,
    platforms,
    caption,
    headline,
    mediaUrls = [],
    videoUrl,
    scheduledDate,
    timezone,
    addToQueue,
    facebookPageId,
}) {
    const title = caption || headline || 'Taskiz';
    const description = caption || headline || '';

    if (format === 'reel' || videoUrl) {
        return uploadVideo({
            user,
            platforms,
            videoUrl: videoUrl || mediaUrls[0],
            title,
            description,
            scheduledDate,
            timezone,
            addToQueue,
            facebookPageId,
            asyncUpload: true,
        });
    }

    return uploadPhotos({
        user,
        platforms,
        mediaUrls,
        title,
        description,
        scheduledDate,
        timezone,
        addToQueue,
        facebookPageId,
        asyncUpload: true,
    });
}
