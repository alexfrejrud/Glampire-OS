import React, { useCallback, useEffect, useState } from 'react';
import {
    X,
    User,
    Palette,
    Share2,
    CircleDot,
    WandSparkles,
    CreditCard,
    BarChart3,
    Database,
    ExternalLink,
    Loader2,
    RefreshCw,
    Link2,
    Building2,
    Sun,
    Moon,
    Monitor,
    Check,
    AlertCircle,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Badge } from '@astryxdesign/core/Badge';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { api } from '../lib/api';

const NAV = [
    { id: 'workspace', label: 'Workspace', icon: Building2, group: 'General' },
    { id: 'appearance', label: 'Appearance', icon: Palette, group: 'General' },
    { id: 'channels', label: 'Channels', icon: Share2, group: 'Publish' },
    { id: 'brand', label: 'Brand kit', icon: CircleDot, group: 'Publish' },
    { id: 'billing', label: 'Billing', icon: CreditCard, group: 'Payments' },
    { id: 'usage', label: 'Usage', icon: BarChart3, group: 'Payments' },
    { id: 'data', label: 'Data', icon: Database, group: 'Data' },
];

const PLATFORM_LABELS = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    x: 'X',
    threads: 'Threads',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
};

/**
 * Settings modal inspired by product account panels:
 * left nav sections · right detail · no clutter in sidebar.
 */
export function SettingsModal({
    open,
    onClose,
    workspace,
    workspaces,
    health,
    publishUser,
    themeMode,
    onThemeMode,
    onOpenBrandOs,
    onOpenBrandKit,
    onToast,
}) {
    const [section, setSection] = useState('workspace');
    const [upBusy, setUpBusy] = useState(false);
    const [upProfile, setUpProfile] = useState(null);

    const loadProfile = useCallback(async () => {
        if (!open) return;
        setUpBusy(true);
        try {
            const data = await api.workspaceUploadPostProfile();
            setUpProfile(data);
        } catch (e) {
            setUpProfile({
                ok: false,
                error: e.message,
                username: publishUser || null,
                connectedPlatforms: [],
            });
        } finally {
            setUpBusy(false);
        }
    }, [open, publishUser]);

    useEffect(() => {
        if (open) loadProfile();
    }, [open, loadProfile]);

    if (!open) return null;

    async function ensureProfile() {
        setUpBusy(true);
        try {
            const data = await api.ensureUploadPostProfile({});
            setUpProfile({
                ...data,
                hasKey: true,
            });
            onToast?.(
                data.created
                    ? `Created Upload-Post profile “${data.username}”`
                    : `Profile “${data.username}” ready`
            );
        } catch (e) {
            onToast?.(e.message || 'Could not create profile — check plan limits');
        } finally {
            setUpBusy(false);
        }
    }

    async function openConnect() {
        setUpBusy(true);
        try {
            const data = await api.uploadPostConnectUrl({
                redirectUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
                showCalendar: true,
            });
            const url = data.accessUrl;
            if (!url) throw new Error('No connect URL returned');
            window.open(url, '_blank', 'noopener,noreferrer');
            onToast?.('Connect page opened — link social accounts, then return and refresh');
        } catch (e) {
            onToast?.(e.message || 'Connect URL failed');
        } finally {
            setUpBusy(false);
        }
    }

    const groups = [];
    for (const item of NAV) {
        const last = groups[groups.length - 1];
        if (!last || last.title !== item.group) {
            groups.push({ title: item.group, items: [item] });
        } else {
            last.items.push(item);
        }
    }

    const connected = upProfile?.connectedPlatforms || [];
    const defaults = upProfile?.defaultPlatforms || workspace?.defaultPlatforms || [];
    const username = upProfile?.username || publishUser || '—';

    return (
        <div className="settings-backdrop" onClick={onClose} role="presentation">
            <div
                className="settings-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
            >
                <aside className="settings-nav">
                    {groups.map((g) => (
                        <div key={g.title} className="settings-nav-group">
                            <Text type="label" size="xsm" color="secondary" className="settings-nav-label">
                                {g.title}
                            </Text>
                            {g.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`settings-nav-item ${
                                            section === item.id ? 'is-active' : ''
                                        }`}
                                        onClick={() => setSection(item.id)}
                                    >
                                        <Icon size={16} />
                                        <span>{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </aside>

                <div className="settings-panel">
                    <header className="settings-panel-head">
                        <Heading level={2}>
                            {NAV.find((n) => n.id === section)?.label || 'Settings'}
                        </Heading>
                        <button
                            type="button"
                            className="ghost icon-btn"
                            onClick={onClose}
                            aria-label="Close settings"
                        >
                            <X size={18} />
                        </button>
                    </header>

                    <div className="settings-panel-body">
                        {section === 'workspace' && (
                            <VStack gap={4}>
                                <div className="settings-row">
                                    <HStack gap={3} vAlign="center">
                                        <div className="settings-avatar">
                                            {(workspace?.name || 'G').slice(0, 2).toUpperCase()}
                                        </div>
                                        <VStack gap={0}>
                                            <Text weight="semibold">
                                                {workspace?.name || 'Workspace'}
                                            </Text>
                                            <Text type="supporting" size="sm" color="secondary">
                                                {workspace?.id || '—'}
                                                {workspace?.status ? ` · ${workspace.status}` : ''}
                                            </Text>
                                        </VStack>
                                    </HStack>
                                    <Badge
                                        label={
                                            workspace?.needsOnboarding
                                                ? 'Onboarding'
                                                : workspace?.status || 'Active'
                                        }
                                        variant={
                                            workspace?.needsOnboarding ? 'warning' : 'success'
                                        }
                                    />
                                </div>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    {(workspaces || []).length} workspace
                                    {(workspaces || []).length === 1 ? '' : 's'} · switch from the
                                    sidebar menu. Glampire OS chrome is shared; Brand OS is per
                                    client.
                                </Text>
                                {workspace?.oneLiner ? (
                                    <Text size="sm" as="p">
                                        {workspace.oneLiner}
                                    </Text>
                                ) : null}
                                <HStack gap={2} wrap="wrap">
                                    <Button
                                        label="Edit Brand OS"
                                        variant="secondary"
                                        icon={<WandSparkles size={16} />}
                                        onClick={() => {
                                            onClose();
                                            onOpenBrandOs?.();
                                        }}
                                    />
                                    <Button
                                        label="Brand kit"
                                        variant="secondary"
                                        icon={<CircleDot size={16} />}
                                        onClick={() => {
                                            onClose();
                                            onOpenBrandKit?.();
                                        }}
                                    />
                                </HStack>
                            </VStack>
                        )}

                        {section === 'appearance' && (
                            <VStack gap={4}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Studio chrome only. Client brand colors stay in Brand OS /
                                    creatives — never the dashboard.
                                </Text>
                                <div className="settings-field">
                                    <Text type="label" size="sm">
                                        Theme
                                    </Text>
                                    <SegmentedControl
                                        label="Theme mode"
                                        value={themeMode || 'system'}
                                        onChange={onThemeMode}
                                        size="md"
                                        layout="fill"
                                    >
                                        <SegmentedControlItem
                                            value="light"
                                            label="Light"
                                            icon={<Sun size={14} />}
                                        />
                                        <SegmentedControlItem
                                            value="dark"
                                            label="Dark"
                                            icon={<Moon size={14} />}
                                        />
                                        <SegmentedControlItem
                                            value="system"
                                            label="System"
                                            icon={<Monitor size={14} />}
                                        />
                                    </SegmentedControl>
                                </div>
                            </VStack>
                        )}

                        {section === 'channels' && (
                            <VStack gap={4}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Each workspace maps to one Upload-Post <strong>profile</strong>.
                                    Social logins (IG, TikTok, …) attach to that profile — not to
                                    Glampire OS passwords.
                                </Text>

                                <div className="settings-row">
                                    <VStack gap={1}>
                                        <Text type="label" size="sm">
                                            Upload-Post profile
                                        </Text>
                                        <Text weight="semibold">{username}</Text>
                                        <HStack gap={2} vAlign="center">
                                            <StatusDot
                                                variant="neutral"
                                                label={
                                                    health?.uploadPost
                                                        ? 'API key ready'
                                                        : 'API key missing'
                                                }
                                            />
                                            <Text type="supporting" size="xsm" color="secondary">
                                                {health?.uploadPost
                                                    ? 'API connected'
                                                    : 'Set UPLOAD_POST_API_KEY in server .env'}
                                            </Text>
                                        </HStack>
                                    </VStack>
                                    <Button
                                        label={upBusy ? 'Working…' : 'Ensure profile'}
                                        variant="secondary"
                                        icon={
                                            upBusy ? (
                                                <Loader2 className="spin" size={16} />
                                            ) : (
                                                <User size={16} />
                                            )
                                        }
                                        isDisabled={upBusy || !health?.uploadPost}
                                        onClick={ensureProfile}
                                    />
                                </div>

                                <div className="settings-field">
                                    <HStack gap={2} vAlign="center">
                                        <Text type="label" size="sm">
                                            Connected channels
                                        </Text>
                                        <button
                                            type="button"
                                            className="ghost icon-btn"
                                            onClick={loadProfile}
                                            title="Refresh"
                                            aria-label="Refresh connections"
                                        >
                                            <RefreshCw size={14} className={upBusy ? 'spin' : ''} />
                                        </button>
                                    </HStack>
                                    {upBusy && !upProfile ? (
                                        <Text type="supporting" size="sm" color="secondary">
                                            Loading…
                                        </Text>
                                    ) : (
                                        <div className="settings-channel-grid">
                                            {(defaults.length
                                                ? defaults
                                                : Object.keys(PLATFORM_LABELS)
                                            ).map((p) => {
                                                const ok = connected.includes(p);
                                                return (
                                                    <div
                                                        key={p}
                                                        className={`settings-channel-chip ${
                                                            ok ? 'is-on' : ''
                                                        }`}
                                                    >
                                                        {ok ? (
                                                            <Check size={14} />
                                                        ) : (
                                                            <AlertCircle size={14} />
                                                        )}
                                                        <span>
                                                            {PLATFORM_LABELS[p] || p}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {upProfile?.error ? (
                                        <Text type="supporting" size="sm" color="secondary" as="p">
                                            {upProfile.error}
                                        </Text>
                                    ) : null}
                                </div>

                                <HStack gap={2} wrap="wrap">
                                    <Button
                                        label={upBusy ? 'Opening…' : 'Connect social accounts'}
                                        variant="primary"
                                        icon={
                                            upBusy ? (
                                                <Loader2 className="spin" size={16} />
                                            ) : (
                                                <Link2 size={16} />
                                            )
                                        }
                                        isDisabled={upBusy || !health?.uploadPost}
                                        onClick={openConnect}
                                    />
                                    <Button
                                        label="Upload-Post dashboard"
                                        variant="secondary"
                                        icon={<ExternalLink size={16} />}
                                        onClick={() =>
                                            window.open(
                                                'https://app.upload-post.com',
                                                '_blank',
                                                'noopener,noreferrer'
                                            )
                                        }
                                    />
                                </HStack>
                                <Text type="supporting" size="xsm" color="secondary" as="p">
                                    Connect opens Upload-Post&apos;s secure link page (OAuth). After
                                    linking, click refresh on connected channels.
                                </Text>
                            </VStack>
                        )}

                        {section === 'brand' && (
                            <VStack gap={4}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Brand OS powers generation. Brand kit holds colors, type, and
                                    positioning for compose.
                                </Text>
                                <div className="settings-row">
                                    <VStack gap={1}>
                                        <Text weight="semibold">Brand OS</Text>
                                        <Text type="supporting" size="sm" color="secondary">
                                            Vision, research, lock — client brain for packs
                                        </Text>
                                    </VStack>
                                    <Button
                                        label="Open Brand OS"
                                        variant="primary"
                                        icon={<WandSparkles size={16} />}
                                        onClick={() => {
                                            onClose();
                                            onOpenBrandOs?.();
                                        }}
                                    />
                                </div>
                                <div className="settings-row">
                                    <VStack gap={1}>
                                        <Text weight="semibold">Brand kit</Text>
                                        <Text type="supporting" size="sm" color="secondary">
                                            Colors, fonts, ICP notes for this workspace
                                        </Text>
                                    </VStack>
                                    <Button
                                        label="Open brand kit"
                                        variant="secondary"
                                        icon={<CircleDot size={16} />}
                                        onClick={() => {
                                            onClose();
                                            onOpenBrandKit?.();
                                        }}
                                    />
                                </div>
                            </VStack>
                        )}

                        {section === 'billing' && (
                            <VStack gap={3}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Studio billing and seat plans will live here. Today, pay
                                    providers directly (xAI, Upload-Post, fal).
                                </Text>
                                <Badge label="Coming soon" variant="neutral" />
                                <Button
                                    label="Upload-Post plans"
                                    variant="secondary"
                                    icon={<ExternalLink size={16} />}
                                    onClick={() =>
                                        window.open(
                                            'https://www.upload-post.com/pricing',
                                            '_blank',
                                            'noopener,noreferrer'
                                        )
                                    }
                                />
                            </VStack>
                        )}

                        {section === 'usage' && (
                            <VStack gap={3}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Keys and services for this Studio instance.
                                </Text>
                                <div className="settings-usage-list">
                                    <div className="settings-row compact">
                                        <Text>Grok (xAI)</Text>
                                        <Badge
                                            label={health?.grok ? 'Ready' : 'Missing key'}
                                            variant={health?.grok ? 'success' : 'warning'}
                                        />
                                    </div>
                                    <div className="settings-row compact">
                                        <Text>Upload-Post</Text>
                                        <Badge
                                            label={health?.uploadPost ? 'Ready' : 'Missing key'}
                                            variant={health?.uploadPost ? 'success' : 'warning'}
                                        />
                                    </div>
                                    <div className="settings-row compact">
                                        <Text>fal.ai</Text>
                                        <Badge
                                            label={health?.fal ? 'Ready' : 'Optional'}
                                            variant={health?.fal ? 'success' : 'neutral'}
                                        />
                                    </div>
                                </div>
                                <Text type="supporting" size="xsm" color="secondary" as="p">
                                    Detailed usage meters (generations / posts) will land here later.
                                </Text>
                            </VStack>
                        )}

                        {section === 'data' && (
                            <VStack gap={3}>
                                <Text type="supporting" size="sm" color="secondary" as="p">
                                    Creative queue and calendar are stored per workspace (browser +
                                    server backup under <code>clients/&lt;id&gt;/</code>).
                                </Text>
                                <div className="settings-row compact">
                                    <Text>Active workspace</Text>
                                    <Text weight="semibold">{workspace?.id || '—'}</Text>
                                </div>
                                <div className="settings-row compact">
                                    <Text>Upload-Post user</Text>
                                    <Text weight="semibold">{username}</Text>
                                </div>
                                <Text type="supporting" size="xsm" color="secondary" as="p">
                                    Clearing browser storage no longer wipes the server queue backup.
                                </Text>
                            </VStack>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;
