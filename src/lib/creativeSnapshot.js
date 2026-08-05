/**
 * Build a calendar/publish snapshot from a Studio queue item.
 * Only public https media works with Upload-Post.
 */

export function resolvePublicVideo(item) {
    if (!item) return null;
    const candidates = [
        item.composedVideoUrl,
        item.finalVideoUrl,
        item.videoUrl,
        ...(item.beats || []).map((b) => b.videoUrl),
    ].filter(Boolean);
    return candidates.find((u) => /^https?:\/\//i.test(u)) || null;
}

export function resolvePublicImages(item) {
    if (!item) return [];
    if (item.format === 'carousel') {
        return (item.slides || []).map((s) => s.imageUrl).filter((u) => /^https?:\/\//i.test(u));
    }
    if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) return [item.imageUrl];
    return [];
}

export function creativeToSnapshot(item) {
    if (!item) return null;
    const videoUrl = resolvePublicVideo(item);
    const mediaUrls = videoUrl ? [] : resolvePublicImages(item);
    return {
        id: item.id,
        creativeId: item.id,
        format: item.format || 'post',
        formatLabel: item.formatLabel || item.format,
        headline: item.headline || '',
        caption: item.caption || item.headline || '',
        cta: item.cta || null,
        mediaUrls,
        videoUrl,
        thumbUrl: item.imageUrl || mediaUrls[0] || videoUrl || null,
        pillar: item.pillar || null,
        status: item.status || null,
    };
}

export function hasSchedulableMedia(item) {
    const s = creativeToSnapshot(item);
    if (!s) return false;
    if (s.videoUrl) return true;
    return (s.mediaUrls || []).length > 0;
}

export const CALENDAR_PLATFORMS = [
    { id: 'instagram', label: 'Instagram', short: 'IG' },
    { id: 'tiktok', label: 'TikTok', short: 'TT' },
    { id: 'facebook', label: 'Facebook', short: 'FB' },
    { id: 'linkedin', label: 'LinkedIn', short: 'LI' },
    { id: 'x', label: 'X', short: 'X' },
    { id: 'threads', label: 'Threads', short: 'Th' },
    { id: 'youtube', label: 'YouTube', short: 'YT' },
];
