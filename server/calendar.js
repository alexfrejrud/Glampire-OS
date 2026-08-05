/**
 * Studio Calendar — plan approved creatives, fire via Upload-Post.
 * Storage: clients/<workspaceId>/calendar.json
 */

import fs from 'fs';
import path from 'path';
import {
    getWorkspaceDir,
    getActiveWorkspaceId,
    loadPublish,
} from './brandLoader.js';
import { publishCreative, getUploadStatus } from './uploadPost.js';

const CAPTION_LIMITS = {
    instagram: 2200,
    tiktok: 2200,
    facebook: 63206,
    linkedin: 3000,
    x: 280,
    threads: 500,
    youtube: 5000,
    pinterest: 500,
    default: 2200,
};

const DEFAULT_SETTINGS = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    defaultTimes: {
        instagram: ['11:00', '18:00'],
        tiktok: ['12:00', '19:00'],
        facebook: ['10:00', '15:00'],
        linkedin: ['09:00', '12:00'],
        x: ['10:00', '16:00'],
        threads: ['11:00', '17:00'],
        youtube: ['14:00'],
        default: ['11:00', '15:00', '18:00'],
    },
    maxPerDay: {
        instagram: 3,
        tiktok: 3,
        facebook: 2,
        linkedin: 2,
        x: 5,
        threads: 3,
        youtube: 1,
        default: 3,
    },
    weekends: 'lighter', // full | lighter | skip
    defaultPlatformsByFormat: {
        reel: ['instagram', 'tiktok'],
        post: ['instagram', 'facebook', 'linkedin'],
        carousel: ['instagram', 'linkedin'],
        ad: ['instagram', 'facebook'],
        image: ['instagram'],
        default: ['instagram'],
    },
};

function uid() {
    return `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function calendarPath(workspaceId = getActiveWorkspaceId()) {
    return path.join(getWorkspaceDir(workspaceId), 'calendar.json');
}

function emptyDoc() {
    return {
        version: 1,
        settings: { ...DEFAULT_SETTINGS },
        slots: [],
        updatedAt: new Date().toISOString(),
        lastAutoPlan: null,
    };
}

export function loadCalendar(workspaceId = getActiveWorkspaceId()) {
    const file = calendarPath(workspaceId);
    try {
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            return {
                ...emptyDoc(),
                ...raw,
                settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
                slots: Array.isArray(raw.slots) ? raw.slots : [],
            };
        }
    } catch (e) {
        console.warn('[calendar] load failed', e.message);
    }
    return emptyDoc();
}

export function saveCalendar(doc, workspaceId = getActiveWorkspaceId()) {
    const file = calendarPath(workspaceId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const next = {
        ...doc,
        updatedAt: new Date().toISOString(),
        settings: { ...DEFAULT_SETTINGS, ...(doc.settings || {}) },
        slots: Array.isArray(doc.slots) ? doc.slots : [],
    };
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
    return next;
}

export function updateSettings(partial, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    doc.settings = { ...doc.settings, ...partial };
    return saveCalendar(doc, workspaceId);
}

/** Snapshot a creative for offline publish (client sends this). */
export function normalizeCreativeSnapshot(raw = {}) {
    const format = raw.format || 'post';
    const videoUrl =
        raw.videoUrl ||
        raw.composedVideoUrl ||
        raw.finalVideoUrl ||
        null;
    const mediaUrls = Array.isArray(raw.mediaUrls)
        ? raw.mediaUrls.filter(Boolean)
        : raw.imageUrl
          ? [raw.imageUrl]
          : (raw.slides || []).map((s) => s.imageUrl).filter(Boolean);

    const publicVideo =
        videoUrl && /^https?:\/\//i.test(videoUrl) ? videoUrl : null;
    const publicMedia = mediaUrls.filter((u) => /^https?:\/\//i.test(u));

    return {
        creativeId: raw.creativeId || raw.id || null,
        format,
        formatLabel: raw.formatLabel || format,
        headline: raw.headline || raw.title || '',
        caption: raw.caption || raw.description || raw.headline || '',
        cta: raw.cta || null,
        mediaUrls: publicVideo ? [] : publicMedia,
        videoUrl: publicVideo,
        thumbUrl:
            raw.thumbUrl ||
            raw.imageUrl ||
            publicMedia[0] ||
            publicVideo ||
            null,
        pillar: raw.pillar || null,
        status: raw.status || null,
    };
}

export function preflightSlot(slot, settings = DEFAULT_SETTINGS) {
    const issues = [];
    const warnings = [];
    const platforms = slot.platforms?.length
        ? slot.platforms
        : settings.defaultPlatformsByFormat?.[slot.format] ||
          settings.defaultPlatformsByFormat?.default ||
          ['instagram'];

    if (!platforms.length) issues.push({ code: 'NO_PLATFORM', message: 'Pick at least one platform' });
    if (!slot.scheduledAt) issues.push({ code: 'NO_TIME', message: 'Schedule time is required' });

    const hasVideo = Boolean(slot.videoUrl && /^https?:\/\//i.test(slot.videoUrl));
    const photos = (slot.mediaUrls || []).filter((u) => /^https?:\/\//i.test(u));
    const isReel = slot.format === 'reel' || hasVideo;

    if (isReel && !hasVideo) {
        issues.push({
            code: 'NO_PUBLIC_VIDEO',
            message: 'Reel needs a public https video URL (Upload-Post cannot fetch local /api/renders)',
        });
    }
    if (!isReel && !photos.length) {
        issues.push({
            code: 'NO_PUBLIC_MEDIA',
            message: 'Post needs public https image URL(s)',
        });
    }

    const caption = slot.caption || slot.headline || '';
    for (const p of platforms) {
        const limit = CAPTION_LIMITS[p] || CAPTION_LIMITS.default;
        const text = slot.captionOverrides?.[p] || caption;
        if (text.length > limit) {
            issues.push({
                code: 'CAPTION_TOO_LONG',
                message: `${p} caption is ${text.length} chars (max ${limit})`,
                platform: p,
            });
        } else if (text.length > limit * 0.9) {
            warnings.push({
                code: 'CAPTION_NEAR_LIMIT',
                message: `${p} caption is near the limit (${text.length}/${limit})`,
                platform: p,
            });
        }
    }

    if (!caption.trim()) {
        warnings.push({ code: 'EMPTY_CAPTION', message: 'Caption is empty' });
    }

    const when = slot.scheduledAt ? new Date(slot.scheduledAt) : null;
    if (when && !Number.isNaN(when.getTime()) && when.getTime() < Date.now() - 60_000) {
        warnings.push({ code: 'PAST_TIME', message: 'Scheduled time is in the past' });
    }

    return {
        ok: issues.length === 0,
        issues,
        warnings,
        platforms,
        isReel,
        readyToSend: issues.length === 0,
    };
}

function parseTimeHHMM(hhmm, fallback = [11, 0]) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { h: fallback[0], min: fallback[1] };
    return { h: Math.min(23, Number(m[1])), min: Math.min(59, Number(m[2])) };
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function isWeekend(d) {
    const day = d.getDay();
    return day === 0 || day === 6;
}

function ymd(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Build candidate datetimes for auto-plan.
 */
export function buildHorizonSlots({
    horizon = 'week',
    postsPerDay = 2,
    everyNDays = 1,
    startDate = null,
    weekends = 'lighter',
    defaultTimes = DEFAULT_SETTINGS.defaultTimes.default,
    existingSlots = [],
    emptyOnly = true,
}) {
    const start = startOfDay(startDate ? new Date(startDate) : new Date());
    let days = 7;
    if (horizon === 'day' || horizon === 'today') days = 1;
    else if (horizon === 'week') days = 7;
    else if (horizon === 'month') days = 30;
    else if (horizon === 'next7') days = 7;
    else if (Number(horizon) > 0) days = Number(horizon);

    const perDay = Math.max(1, Math.min(8, Number(postsPerDay) || 2));
    const step = Math.max(1, Number(everyNDays) || 1);
    const times = (defaultTimes?.length ? defaultTimes : DEFAULT_SETTINGS.defaultTimes.default).slice(
        0,
        perDay
    );
    // pad times if postsPerDay > available defaults
    while (times.length < perDay) {
        const base = 9 + times.length * 3;
        times.push(`${String(Math.min(20, base)).padStart(2, '0')}:00`);
    }

    const occupied = new Set();
    if (emptyOnly) {
        for (const s of existingSlots) {
            if (!s.scheduledAt || s.status === 'failed') continue;
            if (['draft', 'scheduled', 'publishing', 'published'].includes(s.status)) {
                occupied.add(`${ymd(s.scheduledAt)}|${new Date(s.scheduledAt).getHours()}`);
            }
        }
    }

    const candidates = [];
    for (let i = 0; i < days; i += step) {
        const day = addDays(start, i);
        if (weekends === 'skip' && isWeekend(day)) continue;

        let dayTimes = [...times];
        if (weekends === 'lighter' && isWeekend(day)) {
            dayTimes = dayTimes.slice(0, Math.max(1, Math.ceil(perDay / 2)));
        }

        for (const t of dayTimes) {
            const { h, min } = parseTimeHHMM(t);
            const dt = new Date(day);
            dt.setHours(h, min, 0, 0);
            if (dt.getTime() < Date.now() - 30_000) continue;
            const key = `${ymd(dt)}|${h}`;
            if (emptyOnly && occupied.has(key)) continue;
            candidates.push(dt.toISOString());
        }
    }
    return candidates;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function groupByFormat(creatives) {
    const buckets = { reel: [], post: [], carousel: [], ad: [], other: [] };
    for (const c of creatives) {
        const f = c.format || 'post';
        if (buckets[f]) buckets[f].push(c);
        else buckets.other.push(c);
    }
    return buckets;
}

/**
 * Auto-plan: distribute approved creatives into draft slots.
 * creatives[] must be normalizeCreativeSnapshot-ready objects from the client.
 */
export function autoPlan({
    creatives = [],
    horizon = 'week',
    postsPerDay = 2,
    everyNDays = 1,
    startDate = null,
    formats = null, // null = all
    mix = 'balanced', // balanced | random | reels_first
    weekends = null,
    emptyOnly = true,
    platformsOverride = null,
    workspaceId = getActiveWorkspaceId(),
}) {
    const doc = loadCalendar(workspaceId);
    const settings = doc.settings;
    const weekendMode = weekends || settings.weekends || 'lighter';

    let pool = creatives.map(normalizeCreativeSnapshot).filter((c) => c.creativeId);
    if (formats?.length) {
        pool = pool.filter((c) => formats.includes(c.format));
    }

    // Prefer unused creatives (not already on calendar as draft/scheduled)
    const usedIds = new Set(
        doc.slots
            .filter((s) => ['draft', 'scheduled', 'publishing', 'published'].includes(s.status))
            .map((s) => s.creativeId)
            .filter(Boolean)
    );
    const unused = pool.filter((c) => !usedIds.has(c.creativeId));
    const source = unused.length ? unused : pool;

    const times =
        settings.defaultTimes?.default ||
        settings.defaultTimes?.instagram ||
        DEFAULT_SETTINGS.defaultTimes.default;

    const timeSlots = buildHorizonSlots({
        horizon,
        postsPerDay,
        everyNDays,
        startDate,
        weekends: weekendMode,
        defaultTimes: times,
        existingSlots: doc.slots,
        emptyOnly,
    });

    if (!timeSlots.length) {
        return {
            doc,
            created: [],
            message: 'No open time slots in this horizon (try another range or clear conflicts)',
        };
    }
    if (!source.length) {
        return { doc, created: [], message: 'No approved creatives to place' };
    }

    const buckets = groupByFormat(source);
    const order =
        mix === 'reels_first'
            ? ['reel', 'post', 'carousel', 'ad', 'other']
            : ['post', 'reel', 'carousel', 'ad', 'other'];

    // Flatten with round-robin for balanced
    const queues = {};
    for (const k of order) {
        queues[k] = mix === 'random' ? shuffle(buckets[k] || []) : [...(buckets[k] || [])];
    }

    function takeNext() {
        if (mix === 'random') {
            const flat = shuffle(Object.values(queues).flat());
            const c = flat[0];
            if (!c) return null;
            for (const k of Object.keys(queues)) {
                queues[k] = queues[k].filter((x) => x.creativeId !== c.creativeId);
            }
            return c;
        }
        // balanced round-robin
        for (const k of order) {
            if (queues[k]?.length) return queues[k].shift();
        }
        return null;
    }

    const publish = loadPublish(workspaceId);
    const defaultPlatforms = publish.defaultPlatforms || ['instagram', 'tiktok'];
    const created = [];
    const now = new Date().toISOString();
    const n = Math.min(timeSlots.length, source.length);

    for (let i = 0; i < n; i++) {
        const creative = takeNext();
        if (!creative) break;
        const platforms =
            platformsOverride?.length
                ? platformsOverride
                : settings.defaultPlatformsByFormat?.[creative.format] ||
                  settings.defaultPlatformsByFormat?.default ||
                  defaultPlatforms;

        const slot = {
            id: uid(),
            ...creative,
            platforms: [...platforms],
            captionOverrides: {},
            scheduledAt: timeSlots[i],
            timezone: settings.timezone || 'UTC',
            status: 'draft',
            firstComment: null,
            uploadPost: null,
            createdAt: now,
            updatedAt: now,
            source: 'auto-plan',
        };
        const pf = preflightSlot(slot, settings);
        slot.preflight = pf;
        created.push(slot);
        doc.slots.push(slot);
    }

    doc.lastAutoPlan = {
        at: now,
        horizon,
        postsPerDay,
        everyNDays,
        created: created.length,
        mix,
        weekends: weekendMode,
    };
    saveCalendar(doc, workspaceId);

    return {
        doc,
        created,
        message: `Placed ${created.length} creative${created.length === 1 ? '' : 's'} as drafts`,
    };
}

export function upsertSlot(partial, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const now = new Date().toISOString();
    let slot;
    if (partial.id) {
        const i = doc.slots.findIndex((s) => s.id === partial.id);
        if (i === -1) throw Object.assign(new Error('Slot not found'), { status: 404 });
        slot = {
            ...doc.slots[i],
            ...partial,
            updatedAt: now,
        };
        if (partial.creative) {
            Object.assign(slot, normalizeCreativeSnapshot(partial.creative));
        }
        doc.slots[i] = slot;
    } else {
        const snap = normalizeCreativeSnapshot(partial.creative || partial);
        slot = {
            id: uid(),
            ...snap,
            platforms:
                partial.platforms ||
                doc.settings.defaultPlatformsByFormat?.[snap.format] ||
                loadPublish(workspaceId).defaultPlatforms ||
                ['instagram'],
            captionOverrides: partial.captionOverrides || {},
            scheduledAt: partial.scheduledAt || null,
            timezone: partial.timezone || doc.settings.timezone,
            status: partial.status || 'draft',
            firstComment: partial.firstComment || null,
            uploadPost: null,
            createdAt: now,
            updatedAt: now,
            source: partial.source || 'manual',
        };
        doc.slots.push(slot);
    }
    slot.preflight = preflightSlot(slot, doc.settings);
    saveCalendar(doc, workspaceId);
    return slot;
}

export function deleteSlot(slotId, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const before = doc.slots.length;
    doc.slots = doc.slots.filter((s) => s.id !== slotId);
    if (doc.slots.length === before) {
        throw Object.assign(new Error('Slot not found'), { status: 404 });
    }
    saveCalendar(doc, workspaceId);
    return { ok: true };
}

export function deleteSlots(ids = [], workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const set = new Set(ids);
    doc.slots = doc.slots.filter((s) => !set.has(s.id));
    saveCalendar(doc, workspaceId);
    return { ok: true, remaining: doc.slots.length };
}

export function rescheduleSlot(slotId, scheduledAt, workspaceId = getActiveWorkspaceId()) {
    return upsertSlot({ id: slotId, scheduledAt, status: 'draft', uploadPost: null }, workspaceId);
}

/**
 * Fire one slot via Upload-Post (schedule or now).
 */
export async function fireSlot(slotId, { mode = 'schedule', user } = {}, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const slot = doc.slots.find((s) => s.id === slotId);
    if (!slot) throw Object.assign(new Error('Slot not found'), { status: 404 });

    const pf = preflightSlot(slot, doc.settings);
    slot.preflight = pf;
    if (!pf.ok) {
        slot.status = 'failed';
        slot.uploadPost = { error: pf.issues.map((i) => i.message).join('; ') };
        slot.updatedAt = new Date().toISOString();
        saveCalendar(doc, workspaceId);
        const err = new Error(slot.uploadPost.error);
        err.status = 400;
        err.preflight = pf;
        throw err;
    }

    const publishCfg = loadPublish(workspaceId);
    const upUser = user || publishCfg.uploadPostUser || process.env.UPLOAD_POST_DEFAULT_USER;
    if (!upUser) {
        throw Object.assign(new Error('Upload-Post profile user is required'), { status: 400 });
    }

    const caption =
        slot.caption ||
        slot.headline ||
        '';
    // Prefer first platform-specific override if only one platform
    const primaryCaption =
        slot.platforms?.length === 1 && slot.captionOverrides?.[slot.platforms[0]]
            ? slot.captionOverrides[slot.platforms[0]]
            : caption;

    slot.status = 'publishing';
    slot.updatedAt = new Date().toISOString();
    saveCalendar(doc, workspaceId);

    try {
        const payload = {
            format: slot.format === 'reel' || slot.videoUrl ? 'reel' : slot.format,
            user: upUser,
            platforms: slot.platforms,
            caption: primaryCaption,
            headline: slot.headline,
            mediaUrls: slot.mediaUrls || [],
            videoUrl: slot.videoUrl || null,
            firstComment: slot.firstComment || undefined,
            timezone: slot.timezone || doc.settings.timezone,
        };
        if (mode === 'schedule' && slot.scheduledAt) {
            // Upload-Post expects ISO-ish scheduled_date
            payload.scheduledDate = slot.scheduledAt;
        } else if (mode === 'queue') {
            payload.addToQueue = true;
        }

        const data = await publishCreative(payload);
        const requestId =
            data?.request_id || data?.requestId || data?.job_id || data?.id || null;

        slot.status = mode === 'schedule' || mode === 'queue' ? 'scheduled' : 'published';
        if (mode === 'now') {
            slot.publishedAt = new Date().toISOString();
        }
        slot.uploadPost = {
            user: upUser,
            requestId,
            result: data,
            error: null,
            firedAt: new Date().toISOString(),
            mode,
        };
        slot.updatedAt = new Date().toISOString();
        saveCalendar(doc, workspaceId);
        return { slot, data };
    } catch (e) {
        slot.status = 'failed';
        slot.uploadPost = {
            user: upUser,
            requestId: null,
            result: null,
            error: e.message,
            details: e.details || null,
            firedAt: new Date().toISOString(),
            mode,
        };
        slot.updatedAt = new Date().toISOString();
        saveCalendar(doc, workspaceId);
        throw e;
    }
}

export async function fireSlots(slotIds, options = {}, workspaceId = getActiveWorkspaceId()) {
    const results = [];
    for (const id of slotIds) {
        try {
            const r = await fireSlot(id, options, workspaceId);
            results.push({ id, ok: true, slot: r.slot });
        } catch (e) {
            results.push({
                id,
                ok: false,
                error: e.message,
                preflight: e.preflight || null,
            });
        }
    }
    return {
        results,
        calendar: loadCalendar(workspaceId),
    };
}

export async function refreshSlotStatus(slotId, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const slot = doc.slots.find((s) => s.id === slotId);
    if (!slot) throw Object.assign(new Error('Slot not found'), { status: 404 });
    const requestId = slot.uploadPost?.requestId;
    if (!requestId) return { slot, data: null };

    try {
        const data = await getUploadStatus(requestId);
        const st = String(data?.status || data?.state || '').toLowerCase();
        if (['done', 'completed', 'success', 'published'].includes(st)) {
            slot.status = 'published';
            slot.publishedAt = slot.publishedAt || new Date().toISOString();
        } else if (['failed', 'error'].includes(st)) {
            slot.status = 'failed';
            slot.uploadPost = {
                ...slot.uploadPost,
                error: data?.message || data?.error || 'Upload-Post failed',
                result: data,
            };
        }
        slot.uploadPost = { ...slot.uploadPost, result: data };
        slot.updatedAt = new Date().toISOString();
        saveCalendar(doc, workspaceId);
        return { slot, data };
    } catch (e) {
        return { slot, error: e.message };
    }
}

export function listSlotsInRange({ from, to } = {}, workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    let slots = [...doc.slots];
    if (from) {
        const f = new Date(from).getTime();
        slots = slots.filter((s) => s.scheduledAt && new Date(s.scheduledAt).getTime() >= f);
    }
    if (to) {
        const t = new Date(to).getTime();
        slots = slots.filter((s) => s.scheduledAt && new Date(s.scheduledAt).getTime() <= t);
    }
    slots.sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));
    return { ...doc, slots };
}

export function calendarStats(workspaceId = getActiveWorkspaceId()) {
    const doc = loadCalendar(workspaceId);
    const now = Date.now();
    const weekEnd = now + 7 * 86400000;
    const counts = {
        draft: 0,
        scheduled: 0,
        publishing: 0,
        published: 0,
        failed: 0,
        thisWeek: 0,
    };
    for (const s of doc.slots) {
        if (counts[s.status] != null) counts[s.status] += 1;
        const t = s.scheduledAt ? new Date(s.scheduledAt).getTime() : 0;
        if (t >= now && t <= weekEnd) counts.thisWeek += 1;
    }
    return { counts, lastAutoPlan: doc.lastAutoPlan, settings: doc.settings };
}

export { DEFAULT_SETTINGS, CAPTION_LIMITS };
