import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Send,
    Loader2,
    X,
    Film,
    Image as ImageIcon,
    Layers,
    AlertCircle,
    Check,
    Trash2,
    Clock,
    Wand2,
    Undo2,
    RefreshCw,
    GripVertical,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { TextArea } from '@astryxdesign/core/TextArea';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { api } from '../lib/api';
import {
    creativeToSnapshot,
    hasSchedulableMedia,
    CALENDAR_PLATFORMS,
} from '../lib/creativeSnapshot';

/* ─── date helpers ─── */

function startOfWeek(d) {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
}

function startOfMonth(d) {
    const x = new Date(d);
    x.setDate(1);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function ymd(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function sameDay(a, b) {
    return ymd(a) === ymd(b);
}

function formatDayHeader(d) {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatMonthTitle(d) {
    return new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function isToday(d) {
    return sameDay(d, new Date());
}

/* ─── format icon ─── */

function FormatIcon({ format, size = 14 }) {
    if (format === 'reel') return <Film size={size} />;
    if (format === 'carousel') return <Layers size={size} />;
    return <ImageIcon size={size} />;
}

const STATUS_META = {
    draft: { label: 'Draft', variant: 'neutral' },
    scheduled: { label: 'Scheduled', variant: 'neutral' },
    publishing: { label: 'Sending…', variant: 'warning' },
    published: { label: 'Live', variant: 'success' },
    failed: { label: 'Failed', variant: 'warning' },
};

/* ─── Auto-plan wizard ─── */

function AutoPlanWizard({ open, approved, onClose, onDone, busy }) {
    const [horizon, setHorizon] = useState('week');
    const [postsPerDay, setPostsPerDay] = useState(2);
    const [everyNDays, setEveryNDays] = useState(1);
    const [mix, setMix] = useState('balanced');
    const [weekends, setWeekends] = useState('lighter');
    const [useReels, setUseReels] = useState(true);
    const [usePosts, setUsePosts] = useState(true);
    const [useCarousels, setUseCarousels] = useState(true);
    const [emptyOnly, setEmptyOnly] = useState(true);

    const schedulable = useMemo(
        () => approved.filter((i) => hasSchedulableMedia(i)),
        [approved]
    );

    if (!open) return null;

    const formats = [];
    if (useReels) formats.push('reel');
    if (usePosts) formats.push('post');
    if (useCarousels) formats.push('carousel');

    async function run() {
        const creatives = schedulable
            .map(creativeToSnapshot)
            .filter((c) => {
                if (!formats.length) return true;
                return formats.includes(c.format);
            });
        await onDone({
            creatives,
            horizon,
            postsPerDay: Number(postsPerDay) || 2,
            everyNDays: Number(everyNDays) || 1,
            mix,
            weekends,
            emptyOnly,
            formats: formats.length ? formats : null,
        });
    }

    return (
        <div className="modal-backdrop cal-modal-backdrop" onClick={onClose}>
            <div className="modal cal-autoplan-modal" onClick={(e) => e.stopPropagation()}>
                <HStack gap={2} vAlign="center" className="cal-modal-head">
                    <Wand2 size={20} />
                    <Heading level={2}>Auto-plan calendar</Heading>
                    <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </HStack>
                <Text type="supporting" color="secondary" size="sm" as="p">
                    Distribute {schedulable.length} approved creative
                    {schedulable.length === 1 ? '' : 's'} with public media across open slots. Starts as{' '}
                    <strong>drafts</strong> — review, then Schedule.
                </Text>

                <div className="cal-wizard-grid">
                    <label className="cal-field">
                        <span>Horizon</span>
                        <select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                            <option value="day">Today</option>
                            <option value="week">This week (7 days)</option>
                            <option value="month">This month (~30 days)</option>
                        </select>
                    </label>
                    <label className="cal-field">
                        <span>Posts per active day</span>
                        <select
                            value={postsPerDay}
                            onChange={(e) => setPostsPerDay(Number(e.target.value))}
                        >
                            {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                    {n}× per day
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="cal-field">
                        <span>Every N days</span>
                        <select
                            value={everyNDays}
                            onChange={(e) => setEveryNDays(Number(e.target.value))}
                        >
                            <option value={1}>Every day</option>
                            <option value={2}>Every 2 days</option>
                            <option value={3}>Every 3 days</option>
                        </select>
                    </label>
                    <label className="cal-field">
                        <span>Mix</span>
                        <select value={mix} onChange={(e) => setMix(e.target.value)}>
                            <option value="balanced">Balanced types</option>
                            <option value="random">Randomized</option>
                            <option value="reels_first">Reels first</option>
                        </select>
                    </label>
                    <label className="cal-field">
                        <span>Weekends</span>
                        <select value={weekends} onChange={(e) => setWeekends(e.target.value)}>
                            <option value="lighter">Lighter</option>
                            <option value="full">Same as weekdays</option>
                            <option value="skip">Skip</option>
                        </select>
                    </label>
                </div>

                <div className="cal-format-toggles">
                    <Text type="label" size="sm">
                        Content types
                    </Text>
                    <HStack gap={3} wrap="wrap">
                        <label className="platform-check">
                            <input
                                type="checkbox"
                                checked={useReels}
                                onChange={(e) => setUseReels(e.target.checked)}
                            />
                            Reels
                        </label>
                        <label className="platform-check">
                            <input
                                type="checkbox"
                                checked={usePosts}
                                onChange={(e) => setUsePosts(e.target.checked)}
                            />
                            Posts
                        </label>
                        <label className="platform-check">
                            <input
                                type="checkbox"
                                checked={useCarousels}
                                onChange={(e) => setUseCarousels(e.target.checked)}
                            />
                            Carousels
                        </label>
                    </HStack>
                </div>

                <label className="platform-check cal-empty-only">
                    <input
                        type="checkbox"
                        checked={emptyOnly}
                        onChange={(e) => setEmptyOnly(e.target.checked)}
                    />
                    Only fill empty slots (don&apos;t stack on existing)
                </label>

                <div className="modal-actions">
                    <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="primary"
                        disabled={busy || !schedulable.length || !formats.length}
                        onClick={run}
                    >
                        {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                        Fill calendar
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Slot drawer ─── */

function SlotDrawer({
    slot,
    onClose,
    onSave,
    onFire,
    onDelete,
    busy,
}) {
    const [caption, setCaption] = useState(slot?.caption || '');
    const [platforms, setPlatforms] = useState(slot?.platforms || ['instagram']);
    const [scheduledLocal, setScheduledLocal] = useState(() => {
        if (!slot?.scheduledAt) return '';
        const d = new Date(slot.scheduledAt);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });

    useEffect(() => {
        if (!slot) return;
        setCaption(slot.caption || '');
        setPlatforms(slot.platforms || ['instagram']);
        if (slot.scheduledAt) {
            const d = new Date(slot.scheduledAt);
            const pad = (n) => String(n).padStart(2, '0');
            setScheduledLocal(
                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
            );
        }
    }, [slot?.id]);

    if (!slot) return null;

    function togglePlatform(id) {
        setPlatforms((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    const pf = slot.preflight;
    const st = STATUS_META[slot.status] || STATUS_META.draft;

    return (
        <aside className="cal-drawer">
            <HStack gap={2} vAlign="center" className="cal-drawer-head">
                <Heading level={3}>Schedule</Heading>
                <Badge label={st.label} variant={st.variant || 'neutral'} />
                <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Close">
                    <X size={18} />
                </button>
            </HStack>

            <div className="cal-drawer-thumb">
                {slot.thumbUrl ? (
                    slot.videoUrl || slot.format === 'reel' ? (
                        <video src={slot.videoUrl || slot.thumbUrl} muted playsInline poster={slot.thumbUrl} />
                    ) : (
                        <img src={slot.thumbUrl} alt="" />
                    )
                ) : (
                    <div className="cal-thumb-empty">
                        <FormatIcon format={slot.format} size={28} />
                    </div>
                )}
            </div>

            <Text weight="semibold" as="p" className="cal-drawer-title">
                {slot.headline || 'Untitled'}
            </Text>
            <Text type="supporting" size="xsm" color="secondary" as="p">
                {slot.formatLabel || slot.format} · {slot.creativeId?.slice(0, 12)}
            </Text>

            {pf && !pf.ok && (
                <Banner variant="danger" className="cal-banner">
                    {pf.issues.map((i) => i.message).join(' · ')}
                </Banner>
            )}
            {pf?.warnings?.length > 0 && pf.ok && (
                <Banner variant="warning" className="cal-banner">
                    {pf.warnings.map((w) => w.message).join(' · ')}
                </Banner>
            )}
            {slot.uploadPost?.error && (
                <Banner variant="danger" className="cal-banner">
                    {slot.uploadPost.error}
                </Banner>
            )}

            <label className="cal-field">
                <span>When</span>
                <input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                />
            </label>

            <label className="cal-field">
                <span>Caption</span>
                <TextArea
                    value={caption}
                    onChange={(v) => setCaption(typeof v === 'string' ? v : v?.target?.value || '')}
                    rows={4}
                    width="100%"
                />
            </label>

            <div className="cal-field">
                <span>Platforms</span>
                <div className="platform-grid">
                    {CALENDAR_PLATFORMS.map((p) => (
                        <label key={p.id} className="platform-check">
                            <input
                                type="checkbox"
                                checked={platforms.includes(p.id)}
                                onChange={() => togglePlatform(p.id)}
                            />
                            {p.label}
                        </label>
                    ))}
                </div>
            </div>

            <div className="cal-drawer-actions">
                <Button
                    label="Save draft"
                    variant="secondary"
                    isDisabled={busy}
                    onClick={() =>
                        onSave({
                            id: slot.id,
                            caption,
                            platforms,
                            scheduledAt: scheduledLocal
                                ? new Date(scheduledLocal).toISOString()
                                : slot.scheduledAt,
                            status: 'draft',
                        })
                    }
                />
                <Button
                    label={busy ? 'Sending…' : 'Schedule via Upload-Post'}
                    variant="primary"
                    icon={busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                    isDisabled={busy || platforms.length === 0}
                    isLoading={busy}
                    onClick={async () => {
                        await onSave({
                            id: slot.id,
                            caption,
                            platforms,
                            scheduledAt: scheduledLocal
                                ? new Date(scheduledLocal).toISOString()
                                : slot.scheduledAt,
                        });
                        await onFire(slot.id, 'schedule');
                    }}
                />
                <Button
                    label="Publish now"
                    variant="secondary"
                    isDisabled={busy}
                    onClick={async () => {
                        await onSave({
                            id: slot.id,
                            caption,
                            platforms,
                            scheduledAt: scheduledLocal
                                ? new Date(scheduledLocal).toISOString()
                                : new Date().toISOString(),
                        });
                        await onFire(slot.id, 'now');
                    }}
                />
                <Button
                    label="Remove"
                    variant="secondary"
                    icon={<Trash2 size={16} />}
                    isDisabled={busy}
                    onClick={() => onDelete(slot.id)}
                />
            </div>
        </aside>
    );
}

/* ─── Main Calendar View ─── */

export function CalendarView({
    items = [],
    publishUser,
    defaultPlatforms = [],
    onToast,
    workspaceName,
}) {
    const [viewMode, setViewMode] = useState('week'); // week | month
    const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
    const [slots, setSlots] = useState([]);
    const [settings, setSettings] = useState(null);
    const [stats, setStats] = useState(null);
    const [lastAutoPlan, setLastAutoPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [drawerSlot, setDrawerSlot] = useState(null);
    const [autoPlanOpen, setAutoPlanOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [dragCreativeId, setDragCreativeId] = useState(null);

    // Stable toast ref — parent often passes inline onToast which would retrigger load forever
    const toastRef = useRef(onToast);
    useEffect(() => {
        toastRef.current = onToast;
    }, [onToast]);

    const approved = useMemo(
        () =>
            items.filter(
                (i) =>
                    (i.status === 'approved' || i.status === 'published') &&
                    hasSchedulableMedia(i)
            ),
        [items]
    );

    const scheduledCreativeIds = useMemo(() => {
        const s = new Set();
        for (const slot of slots) {
            if (['draft', 'scheduled', 'publishing', 'published'].includes(slot.status)) {
                if (slot.creativeId) s.add(slot.creativeId);
            }
        }
        return s;
    }, [slots]);

    const unusedApproved = useMemo(
        () => approved.filter((i) => !scheduledCreativeIds.has(i.id)),
        [approved, scheduledCreativeIds]
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.calendar();
            setSlots(data.slots || []);
            setSettings(data.settings || null);
            setStats(data.stats || null);
            setLastAutoPlan(data.lastAutoPlan || null);
        } catch (e) {
            toastRef.current?.(e.message || 'Failed to load calendar');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load once on mount (and when workspace changes via remount from parent key)
    useEffect(() => {
        load();
    }, [load]);

    const days = useMemo(() => {
        if (viewMode === 'month') {
            const start = startOfMonth(anchor);
            const gridStart = startOfWeek(start);
            return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
        }
        const start = startOfWeek(anchor);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [anchor, viewMode]);

    const slotsByDay = useMemo(() => {
        const map = {};
        for (const s of slots) {
            if (!s.scheduledAt) continue;
            if (filterStatus !== 'all' && s.status !== filterStatus) continue;
            const key = ymd(s.scheduledAt);
            if (!map[key]) map[key] = [];
            map[key].push(s);
        }
        for (const k of Object.keys(map)) {
            map[k].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        }
        return map;
    }, [slots, filterStatus]);

    function shift(dir) {
        if (viewMode === 'month') {
            const x = new Date(anchor);
            x.setMonth(x.getMonth() + dir);
            setAnchor(startOfMonth(x));
        } else {
            setAnchor(addDays(anchor, dir * 7));
        }
    }

    function goToday() {
        setAnchor(viewMode === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date()));
    }

    async function handleAutoPlan(opts) {
        setBusy(true);
        try {
            const data = await api.calendarAutoPlan(opts);
            setSlots(data.slots || []);
            setLastAutoPlan(data.lastAutoPlan || null);
            setAutoPlanOpen(false);
            onToast?.(data.message || `Placed ${data.created?.length || 0} drafts`);
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleUndoAutoPlan() {
        setBusy(true);
        try {
            const data = await api.calendarUndoAutoPlan();
            setSlots(data.slots || []);
            setLastAutoPlan(null);
            onToast?.(data.message || `Removed ${data.removed} drafts`);
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function addCreativeToDay(item, day, hour = 11) {
        const snap = creativeToSnapshot(item);
        if (!snap) return;
        const dt = new Date(day);
        dt.setHours(hour, 0, 0, 0);
        if (dt.getTime() < Date.now()) {
            // next free-ish hour today
            dt.setTime(Date.now() + 60 * 60 * 1000);
        }
        const platforms =
            defaultPlatforms?.length
                ? defaultPlatforms
                : snap.format === 'reel'
                  ? ['instagram', 'tiktok']
                  : ['instagram'];
        setBusy(true);
        try {
            const { slot } = await api.calendarCreateSlot({
                creative: snap,
                platforms,
                scheduledAt: dt.toISOString(),
                status: 'draft',
                source: 'drag',
            });
            setSlots((prev) => [...prev, slot]);
            onToast?.('Added to calendar as draft');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
            setDragCreativeId(null);
        }
    }

    async function handleDropOnDay(e, day) {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/creative-id') || dragCreativeId;
        if (!id) return;
        const item = approved.find((i) => i.id === id);
        if (!item) return;
        await addCreativeToDay(item, day);
    }

    async function saveSlot(patch) {
        setBusy(true);
        try {
            const { slot } = await api.calendarUpdateSlot(patch.id, patch);
            setSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)));
            setDrawerSlot(slot);
            onToast?.('Saved');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function fireOne(id, mode = 'schedule') {
        setBusy(true);
        try {
            const { slot } = await api.calendarFireSlot(id, {
                mode,
                user: publishUser || undefined,
            });
            setSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)));
            setDrawerSlot(slot);
            onToast?.(mode === 'now' ? 'Published via Upload-Post' : 'Scheduled via Upload-Post');
        } catch (e) {
            onToast?.(e.message);
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function deleteOne(id) {
        if (!confirm('Remove this calendar slot?')) return;
        setBusy(true);
        try {
            await api.calendarDeleteSlot(id);
            setSlots((prev) => prev.filter((s) => s.id !== id));
            if (drawerSlot?.id === id) setDrawerSlot(null);
            setSelectedIds((prev) => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
            onToast?.('Removed');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function fireSelected() {
        const ids = [...selectedIds];
        if (!ids.length) {
            onToast?.('Select draft/failed slots first');
            return;
        }
        setBusy(true);
        try {
            const data = await api.calendarFireBatch({
                ids,
                mode: 'schedule',
                user: publishUser || undefined,
            });
            setSlots(data.slots || []);
            const ok = (data.results || []).filter((r) => r.ok).length;
            const fail = (data.results || []).filter((r) => !r.ok).length;
            onToast?.(`Scheduled ${ok}${fail ? ` · ${fail} failed` : ''}`);
            setSelectedIds(new Set());
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function fireAllDrafts() {
        const ids = slots.filter((s) => s.status === 'draft' || s.status === 'failed').map((s) => s.id);
        if (!ids.length) {
            onToast?.('No drafts to schedule');
            return;
        }
        if (!confirm(`Schedule ${ids.length} draft(s) via Upload-Post?`)) return;
        setSelectedIds(new Set(ids));
        setBusy(true);
        try {
            const data = await api.calendarFireBatch({
                ids,
                mode: 'schedule',
                user: publishUser || undefined,
            });
            setSlots(data.slots || []);
            const ok = (data.results || []).filter((r) => r.ok).length;
            const fail = (data.results || []).filter((r) => !r.ok).length;
            onToast?.(`Scheduled ${ok}${fail ? ` · ${fail} failed` : ''}`);
            setSelectedIds(new Set());
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    function toggleSelect(id, e) {
        e?.stopPropagation();
        setSelectedIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    }

    const draftCount = slots.filter((s) => s.status === 'draft').length;
    const failedCount = slots.filter((s) => s.status === 'failed').length;
    const scheduledCount = slots.filter((s) => s.status === 'scheduled').length;

    const title =
        viewMode === 'month'
            ? formatMonthTitle(anchor)
            : `${formatDayHeader(days[0])} – ${formatDayHeader(days[6])}`;

    return (
        <div className="cal-root">
            <header className="cal-header">
                <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                        <CalendarIcon size={22} />
                        <Heading level={1}>Calendar</Heading>
                        {workspaceName ? (
                            <Badge label={workspaceName} variant="neutral" />
                        ) : null}
                    </HStack>
                    <Text type="supporting" color="secondary" size="sm" as="p">
                        Plan approved creatives · Upload-Post delivers ·{' '}
                        {publishUser ? `profile ${publishUser}` : 'set publish profile in Settings'}
                    </Text>
                </VStack>

                <HStack gap={2} wrap="wrap" vAlign="center" className="cal-header-actions">
                    <SegmentedControl
                        label="View"
                        value={viewMode}
                        onChange={(v) => {
                            setViewMode(v);
                            setAnchor(v === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date()));
                        }}
                        size="sm"
                    >
                        <SegmentedControlItem value="week" label="Week" />
                        <SegmentedControlItem value="month" label="Month" />
                    </SegmentedControl>

                    <HStack gap={1} vAlign="center" className="cal-nav">
                        <button type="button" className="ghost icon-btn" onClick={() => shift(-1)}>
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" className="ghost cal-today-btn" onClick={goToday}>
                            Today
                        </button>
                        <button type="button" className="ghost icon-btn" onClick={() => shift(1)}>
                            <ChevronRight size={18} />
                        </button>
                        <Text weight="semibold" className="cal-range-label">
                            {title}
                        </Text>
                    </HStack>

                    <Button
                        label="Auto-plan"
                        variant="primary"
                        icon={<Wand2 size={16} />}
                        onClick={() => setAutoPlanOpen(true)}
                        isDisabled={!approved.length}
                    />
                    {lastAutoPlan ? (
                        <Button
                            label="Undo plan"
                            variant="secondary"
                            icon={<Undo2 size={16} />}
                            onClick={handleUndoAutoPlan}
                            isDisabled={busy}
                        />
                    ) : null}
                    <Button
                        label={busy ? 'Working…' : `Schedule drafts (${draftCount})`}
                        variant="secondary"
                        icon={busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                        onClick={fireAllDrafts}
                        isDisabled={busy || draftCount === 0}
                        isLoading={busy && draftCount > 0}
                    />
                    {selectedIds.size > 0 ? (
                        <Button
                            label={`Schedule selected (${selectedIds.size})`}
                            variant="secondary"
                            onClick={fireSelected}
                            isDisabled={busy}
                        />
                    ) : null}
                    <button
                        type="button"
                        className="ghost icon-btn"
                        onClick={load}
                        title="Refresh"
                        aria-label="Refresh"
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    </button>
                </HStack>
            </header>

            <HStack gap={2} wrap="wrap" className="cal-stats-row">
                <Badge label={`${unusedApproved.length} ready to place`} variant="neutral" />
                <Badge label={`${draftCount} drafts`} variant="neutral" />
                <Badge label={`${scheduledCount} scheduled`} variant="neutral" />
                {failedCount > 0 ? (
                    <Badge label={`${failedCount} failed`} variant="warning" />
                ) : null}
                <select
                    className="cal-filter-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">All statuses</option>
                    <option value="draft">Drafts</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Live</option>
                    <option value="failed">Failed</option>
                </select>
            </HStack>

            {!approved.length && !slots.length && !loading ? (
                <EmptyState
                    title="No approved creatives yet"
                    description="Approve posts and reels in the queue — then Auto-plan a week or drag them onto the calendar."
                />
            ) : (
                <div className={`cal-body ${drawerSlot ? 'cal-body--drawer' : ''}`}>
                    <div className="cal-rail">
                        <HStack gap={2} vAlign="center" className="cal-rail-head">
                            <Heading level={3}>Approved</Heading>
                            <Badge label={String(unusedApproved.length)} variant="neutral" />
                        </HStack>
                        <Text type="supporting" size="xsm" color="secondary" as="p">
                            Drag onto a day · public media only
                        </Text>
                        <div className="cal-rail-list">
                            {unusedApproved.length === 0 ? (
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    All schedulable approved items are already on the calendar.
                                </Text>
                            ) : (
                                unusedApproved.map((item) => (
                                    <div
                                        key={item.id}
                                        className="cal-rail-card"
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/creative-id', item.id);
                                            e.dataTransfer.effectAllowed = 'copy';
                                            setDragCreativeId(item.id);
                                        }}
                                        onDragEnd={() => setDragCreativeId(null)}
                                        onDoubleClick={() => addCreativeToDay(item, new Date())}
                                    >
                                        <GripVertical size={14} className="cal-grip" />
                                        <div className="cal-rail-thumb">
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt="" />
                                            ) : (
                                                <FormatIcon format={item.format} />
                                            )}
                                        </div>
                                        <div className="cal-rail-meta">
                                            <Text size="sm" weight="semibold" maxLines={2}>
                                                {item.headline || 'Untitled'}
                                            </Text>
                                            <HStack gap={1} vAlign="center">
                                                <FormatIcon format={item.format} size={12} />
                                                <Text type="supporting" size="xsm" color="secondary">
                                                    {item.formatLabel || item.format}
                                                </Text>
                                            </HStack>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div
                        className={`cal-grid cal-grid--${viewMode}`}
                        data-days={viewMode === 'week' ? 7 : 7}
                    >
                        {loading ? (
                            <div className="cal-loading">
                                <Loader2 className="spin" size={24} />
                                <Text>Loading calendar…</Text>
                            </div>
                        ) : (
                            days.map((day) => {
                                const key = ymd(day);
                                const daySlots = slotsByDay[key] || [];
                                const inMonth =
                                    viewMode === 'week' ||
                                    day.getMonth() === startOfMonth(anchor).getMonth();
                                return (
                                    <div
                                        key={key}
                                        className={[
                                            'cal-day',
                                            isToday(day) ? 'cal-day--today' : '',
                                            !inMonth ? 'cal-day--muted' : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'copy';
                                        }}
                                        onDrop={(e) => handleDropOnDay(e, day)}
                                    >
                                        <div className="cal-day-head">
                                            <span className="cal-day-num">{day.getDate()}</span>
                                            <span className="cal-day-wd">
                                                {day.toLocaleDateString(undefined, {
                                                    weekday: 'short',
                                                })}
                                            </span>
                                            {daySlots.length > 0 ? (
                                                <span className="cal-day-count">{daySlots.length}</span>
                                            ) : null}
                                        </div>
                                        <div className="cal-day-slots">
                                            {daySlots.map((slot) => {
                                                const st = STATUS_META[slot.status] || STATUS_META.draft;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={slot.id}
                                                        className={`cal-chip cal-chip--${slot.status} ${
                                                            selectedIds.has(slot.id)
                                                                ? 'cal-chip--selected'
                                                                : ''
                                                        }`}
                                                        onClick={() => setDrawerSlot(slot)}
                                                    >
                                                        <span
                                                            className="cal-chip-check"
                                                            onClick={(e) => toggleSelect(slot.id, e)}
                                                        >
                                                            {selectedIds.has(slot.id) ? (
                                                                <Check size={12} />
                                                            ) : (
                                                                <span className="cal-chip-box" />
                                                            )}
                                                        </span>
                                                        <span className="cal-chip-time">
                                                            <Clock size={10} /> {formatTime(slot.scheduledAt)}
                                                        </span>
                                                        <span className="cal-chip-title">
                                                            <FormatIcon format={slot.format} size={12} />{' '}
                                                            {slot.headline || slot.format}
                                                        </span>
                                                        <span className="cal-chip-platforms">
                                                            {(slot.platforms || [])
                                                                .map(
                                                                    (p) =>
                                                                        CALENDAR_PLATFORMS.find(
                                                                            (x) => x.id === p
                                                                        )?.short || p
                                                                )
                                                                .join(' · ')}
                                                        </span>
                                                        <span className={`cal-chip-status cal-chip-status--${slot.status}`}>
                                                            {st.label}
                                                        </span>
                                                        {slot.preflight && !slot.preflight.ok ? (
                                                            <AlertCircle
                                                                size={12}
                                                                className="cal-chip-warn"
                                                            />
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                            {!daySlots.length ? (
                                                <div className="cal-day-empty">Drop here</div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {drawerSlot ? (
                        <SlotDrawer
                            slot={drawerSlot}
                            onClose={() => setDrawerSlot(null)}
                            onSave={saveSlot}
                            onFire={fireOne}
                            onDelete={deleteOne}
                            busy={busy}
                        />
                    ) : null}
                </div>
            )}

            {unusedApproved.length >= 3 && !slots.length ? (
                <div className="cal-empty-cta">
                    <Card padding={4}>
                        <HStack gap={3} vAlign="center" wrap="wrap">
                            <Sparkles size={20} />
                            <VStack gap={1} style={{ flex: 1 }}>
                                <Text weight="semibold">
                                    {unusedApproved.length} approved creatives ready
                                </Text>
                                <Text type="supporting" size="sm" color="secondary">
                                    Auto-plan will distribute them across the week as drafts — then
                                    one click schedules via Upload-Post.
                                </Text>
                            </VStack>
                            <Button
                                label="Auto-plan this week"
                                variant="primary"
                                icon={<Wand2 size={16} />}
                                onClick={() => setAutoPlanOpen(true)}
                                isDisabled={busy}
                            />
                        </HStack>
                    </Card>
                </div>
            ) : null}

            <AutoPlanWizard
                open={autoPlanOpen}
                approved={approved}
                onClose={() => setAutoPlanOpen(false)}
                onDone={handleAutoPlan}
                busy={busy}
            />
        </div>
    );
}

export default CalendarView;
