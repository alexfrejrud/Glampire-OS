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

function profileUsername(p) {
    return p?.username || p?.name || p?.user || null;
}

function profileMatches(p, username) {
    const u = String(username || '').toLowerCase();
    const n = String(profileUsername(p) || '').toLowerCase();
    return Boolean(u && n && u === n);
}

/** Get one profile by username (null if missing) */
export async function getProfile(username) {
    if (!username) return null;
    // Prefer dedicated endpoint when available
    try {
        const res = await fetch(
            `${BASE}/uploadposts/users/${encodeURIComponent(username)}`,
            { headers: authHeaders() }
        );
        if (res.ok) {
            const data = await parseResponse(res);
            return data.profile || data;
        }
        if (res.status === 404) return null;
    } catch {
        /* fall through to list */
    }
    const list = await listProfiles();
    const arr = Array.isArray(list) ? list : [];
    return arr.find((p) => profileMatches(p, username)) || null;
}

/**
 * Ensure an Upload-Post profile exists for a Studio workspace.
 * Creates if missing; returns { username, profile, created, plan, limit }.
 */
export async function ensureProfile(username) {
    const user = String(username || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '');
    if (!user) {
        const err = new Error('username required for Upload-Post profile');
        err.status = 400;
        throw err;
    }

    let plan = null;
    let limit = null;
    try {
        const me = await getMe();
        plan = me.plan || me.preferences?.plan || null;
    } catch {
        /* ignore */
    }

    const existing = await getProfile(user);
    if (existing) {
        return {
            username: user,
            profile: existing,
            created: false,
            plan,
            limit,
            social_accounts: existing.social_accounts || existing.socialAccounts || {},
        };
    }

    try {
        const created = await createProfile(user);
        const profile = created.profile || created;
        return {
            username: user,
            profile,
            created: true,
            plan,
            limit,
            social_accounts: profile.social_accounts || {},
        };
    } catch (e) {
        // 409 = already exists (race) — re-fetch
        if (e.status === 409) {
            const again = await getProfile(user);
            if (again) {
                return {
                    username: user,
                    profile: again,
                    created: false,
                    plan,
                    limit,
                    social_accounts: again.social_accounts || {},
                };
            }
        }
        throw e;
    }
}

/**
 * Generate white-label connect URL so the client can OAuth social accounts
 * for a profile (IG/TikTok/LinkedIn/etc.).
 */
export async function generateConnectUrl({
    username,
    redirectUrl,
    platforms,
    connectTitle,
    connectDescription,
    showCalendar = true,
} = {}) {
    if (!username) {
        const err = new Error('username required');
        err.status = 400;
        throw err;
    }
    // Ensure profile exists first (generate-jwt 404s otherwise)
    await ensureProfile(username);

    const body = {
        username,
        show_calendar: showCalendar !== false,
        connect_title: connectTitle || 'Connect social accounts',
        connect_description:
            connectDescription ||
            'Link Instagram, TikTok, LinkedIn, and more for this Studio workspace.',
    };
    if (redirectUrl) body.redirect_url = redirectUrl;
    if (Array.isArray(platforms) && platforms.length) body.platforms = platforms;

    const res = await fetch(`${BASE}/uploadposts/users/generate-jwt`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
    });
    return parseResponse(res);
}

/** Normalize social_accounts object → list of connected platform ids */
export function connectedPlatformsFromProfile(profile) {
    const sa = profile?.social_accounts || profile?.socialAccounts || {};
    const out = [];
    for (const [platform, val] of Object.entries(sa)) {
        if (val == null || val === '') continue;
        if (typeof val === 'object' && !val.display_name && !val.username && !val.social_images) {
            // empty object / placeholder
            if (!Object.keys(val).length) continue;
        }
        out.push(platform);
    }
    return out;
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
        form.append('photos[]', blob, `studio-${Date.now()}-${i}.${ext}`);
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
    // TikTok AI-generated content flag (studio media is model-generated)
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
    const title = caption || headline || 'Studio';
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
