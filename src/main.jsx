import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Sparkles,
    Plus,
    LayoutGrid,
    Check,
    Image as ImageIcon,
    Film,
    Layers,
    Square,
    RefreshCw,
    WandSparkles,
    Download,
    Send,
    Settings,
    ChevronRight,
    Loader2,
    X,
    Clapperboard,
    ShieldCheck,
    AlertCircle,
    Play,
    Copy,
    Trash2,
    CircleDot,
    Images,
    Bookmark,
    Upload,
    ExternalLink,
    Library,
    ScrollText,
    Moon,
    Sun,
    Monitor,
    Building2,
    Wrench,
} from 'lucide-react';
import { Theme } from '@astryxdesign/core/theme';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { NavHeadingMenu, NavHeadingMenuItem } from '@astryxdesign/core/NavMenu';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { api, waitForVideo } from './lib/api';
import { loadStore, saveStore, upsertItem } from './lib/store';
import { getWorkspaceId, setWorkspaceId } from './lib/workspace';
import { glampireTheme, loadThemeMode, saveThemeMode } from './theme';
import { OnboardingWizard } from './components/OnboardingWizard';
import './styles.css';
import './story-styles.css';

/* ───────────────── helpers ───────────────── */

function statusLabel(s) {
    return (
        {
            idea: 'Idea',
            generating: 'Generating…',
            ready: 'Ready',
            approved: 'Approved',
            published: 'Published',
            error: 'Error',
        }[s] || s
    );
}

function FormatIcon({ format }) {
    if (format === 'reel') return <Film size={14} />;
    if (format === 'carousel') return <Layers size={14} />;
    return <Square size={14} />;
}

/** Best media URL for download (story final → reel → composed ad → still). */
function mediaDownloadUrl(item) {
    if (!item) return null;
    if (item.format === 'reel') {
        return item.composedVideoUrl || item.finalVideoUrl || item.videoUrl || null;
    }
    if (item.format === 'carousel') {
        return item.slides?.find((s) => s.imageUrl)?.imageUrl || item.imageUrl || null;
    }
    // Finished ads prefer composed PNG (logo + type)
    return item.adUrl || item.imageUrl || item.plateUrl || null;
}

function mediaDownloadName(item, url) {
    const base = String(item?.headline || item?.id || 'taskiz')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
    const fromUrl = String(url || '').split('?')[0].split('/').pop() || '';
    if (fromUrl.endsWith('.mp4')) return fromUrl;
    if (fromUrl.match(/\.(jpg|jpeg|png|webp)$/i)) return `${base}${fromUrl.slice(fromUrl.lastIndexOf('.'))}`;
    if (item?.format === 'reel') return `${base || item.id || 'reel'}.mp4`;
    return `${base || item?.id || 'image'}.jpg`;
}

/** Force-download media (works for /api/renders/* same-origin). */
async function downloadMedia(url, filename) {
    if (!url) throw new Error('No media to download');
    // data: / blob: can open directly
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/** Shared page header — Astryx hierarchy */
function PageHeader({ eyebrow, title, description, actions }) {
    return (
        <HStack gap={4} vAlign="start" hAlign="between" wrap="wrap" style={{ marginBottom: 20 }}>
            <VStack gap={1} style={{ flex: '1 1 280px', minWidth: 0 }}>
                {eyebrow ? (
                    <Text type="label" color="secondary">
                        {eyebrow}
                    </Text>
                ) : null}
                <Heading level={1}>{title}</Heading>
                {description ? (
                    <Text type="supporting" color="secondary" as="p">
                        {description}
                    </Text>
                ) : null}
            </VStack>
            {actions ? (
                <HStack gap={2} wrap="wrap" vAlign="center">
                    {actions}
                </HStack>
            ) : null}
        </HStack>
    );
}

function SectionTitle({ title, description }) {
    return (
        <VStack gap={1} style={{ marginBottom: 12 }}>
            <Heading level={3}>{title}</Heading>
            {description ? (
                <Text type="supporting" color="secondary" as="p">
                    {description}
                </Text>
            ) : null}
        </VStack>
    );
}

function ChoiceCard({ label, description, meta, selected, disabled, onSelect }) {
    return (
        <SelectableCard
            label={label}
            isSelected={!!selected}
            isDisabled={!!disabled}
            onChange={(on) => {
                if (on) onSelect?.();
            }}
            padding={3}
        >
            <VStack gap={1}>
                <Text weight="semibold">{label}</Text>
                {description ? (
                    <Text type="supporting" color="secondary" size="sm" as="p">
                        {description}
                    </Text>
                ) : null}
                {meta ? (
                    <Text type="supporting" color="secondary" size="xsm" as="p">
                        {meta}
                    </Text>
                ) : null}
            </VStack>
        </SelectableCard>
    );
}

function GlampireMark() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="6" fill="currentColor" opacity="0.15" />
            <path
                d="M8 15.5V8.5L12 13l4-4.5v7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* ───────────────── sidebar (Astryx) ───────────────── */

function StudioSideNav({
    view,
    setView,
    counts,
    health,
    workspaces,
    activeWorkspace,
    onSwitchWorkspace,
    onCreateWorkspace,
    onOpenOnboarding,
    themeMode,
    onThemeMode,
}) {
    // Core workflow stays top-level; utilities live under Tools
    const studioNav = [
        { id: 'create', label: 'Create batch', icon: Plus },
        { id: 'queue', label: 'Review queue', icon: LayoutGrid, badge: counts.total },
        { id: 'approved', label: 'Approved', icon: ShieldCheck, badge: counts.approved },
    ];
    const needsOnboarding = Boolean(activeWorkspace?.needsOnboarding);
    const workspaceNav = [
        ...(needsOnboarding
            ? [{ id: 'onboarding', label: 'Finish onboarding', icon: WandSparkles, badge: '!' }]
            : []),
        { id: 'brand', label: 'Brand kit', icon: CircleDot },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];
    const toolsActive =
        view === 'tools' || view === 'character' || view === 'scripts' || view === 'library';

    const wsName = activeWorkspace?.name || 'Workspace';

    return (
        <SideNav
            collapsible
            resizable={{ defaultWidth: 260, minWidth: 200, maxWidth: 360, autoSaveId: 'glampire-sidenav' }}
            header={
                <SideNavHeading
                    heading="Glampire OS"
                    superheading="Creative Studio"
                    subheading={wsName}
                    icon={<GlampireMark />}
                    menu={
                        <NavHeadingMenu size="lg" minWidth={260}>
                            {(workspaces || []).map((w) => (
                                <NavHeadingMenuItem
                                    key={w.id}
                                    label={w.name}
                                    onClick={() => onSwitchWorkspace(w.id)}
                                />
                            ))}
                            <NavHeadingMenuItem
                                label="New workspace…"
                                onClick={() => onCreateWorkspace()}
                            />
                        </NavHeadingMenu>
                    }
                />
            }
            topContent={
                <VStack gap={2} padding={2}>
                    <Button
                        label="Generate content"
                        icon={<Sparkles size={16} />}
                        onClick={() => setView('create')}
                        width="100%"
                    />
                </VStack>
            }
            footer={
                <VStack gap={2} padding={2}>
                    <Text type="label" color="secondary">
                        Appearance
                    </Text>
                    <SegmentedControl
                        label="Theme mode"
                        value={themeMode}
                        onChange={onThemeMode}
                        size="sm"
                        layout="fill"
                    >
                        <SegmentedControlItem value="light" label="Light" icon={<Sun size={14} />} />
                        <SegmentedControlItem value="dark" label="Dark" icon={<Moon size={14} />} />
                        <SegmentedControlItem value="system" label="Auto" icon={<Monitor size={14} />} />
                    </SegmentedControl>
                    <HStack gap={1} vAlign="center">
                        <StatusDot
                            variant="neutral"
                            label={health?.grok ? 'Grok ready' : 'Grok missing key'}
                        />
                        <Text type="supporting" size="xsm">
                            Grok {health?.grok ? 'ready' : 'key'}
                        </Text>
                    </HStack>
                    <HStack gap={1} vAlign="center">
                        <StatusDot
                            variant="neutral"
                            label={health?.uploadPost ? 'Upload-Post ready' : 'Upload-Post optional'}
                        />
                        <Text type="supporting" size="xsm">
                            Publish {health?.uploadPost ? 'ready' : 'optional'}
                        </Text>
                    </HStack>
                    <HStack gap={1} vAlign="center">
                        <Building2 size={14} />
                        <Text type="supporting" size="xsm" maxLines={1}>
                            {wsName}
                        </Text>
                    </HStack>
                </VStack>
            }
        >
            <SideNavSection title="Studio">
                {studioNav.map(({ id, label, icon: Icon, badge }) => (
                    <SideNavItem
                        key={id}
                        label={label}
                        icon={<Icon size={18} />}
                        isSelected={view === id}
                        onClick={() => setView(id)}
                        endContent={
                            badge != null && badge > 0 ? (
                                <Badge label={String(badge)} variant="neutral" />
                            ) : null
                        }
                    />
                ))}
            </SideNavSection>
            <SideNavSection title="Tools">
                <SideNavItem
                    label="Tools"
                    icon={<Wrench size={18} />}
                    isSelected={toolsActive}
                    onClick={() => setView('tools')}
                />
            </SideNavSection>
            <SideNavSection title="Workspace">
                {workspaceNav.map(({ id, label, icon: Icon, badge }) => (
                    <SideNavItem
                        key={id}
                        label={label}
                        icon={<Icon size={18} />}
                        isSelected={view === id}
                        onClick={() => {
                            if (id === 'onboarding') {
                                onOpenOnboarding?.();
                                return;
                            }
                            setView(id);
                        }}
                        endContent={
                            badge ? <Badge label={String(badge)} variant="neutral" /> : null
                        }
                    />
                ))}
            </SideNavSection>
        </SideNav>
    );
}

/** Character RE + Script cloner + Ref library under one Tools area */
function ToolsView({ brand, onToast, initialTool = 'character' }) {
    const [tool, setTool] = useState(() => {
        if (['character', 'scripts', 'library'].includes(initialTool)) return initialTool;
        return 'character';
    });

    useEffect(() => {
        if (['character', 'scripts', 'library'].includes(initialTool)) {
            setTool(initialTool);
        }
    }, [initialTool]);

    return (
        <VStack gap={4} as="main">
            <TabList value={tool} onChange={setTool} hasDivider>
                <Tab value="character" label="Character RE" />
                <Tab value="scripts" label="Script cloner" />
                <Tab value="library" label="Ref library" />
            </TabList>
            {tool === 'character' && <CharacterView onToast={onToast} />}
            {tool === 'scripts' && <ScriptClonerView brand={brand} onToast={onToast} />}
            {tool === 'library' && <LibraryView onToast={onToast} />}
        </VStack>
    );
}

/* ───────────────── create ───────────────── */

const CHROME_OPTIONS = [
    {
        id: 'organic',
        label: 'Organic',
        short: 'Organic',
        description: 'Captions only. No logo, no end card. Best for volume.',
        ico: 'O',
    },
    {
        id: 'ads_endcard',
        label: 'Ads + end card',
        short: 'Ads + end card',
        description: 'Official logo end card for paid boosts.',
        ico: 'A',
    },
    {
        id: 'ads_full',
        label: 'Ads full brand',
        short: 'Ads full brand',
        description: 'Corner logo + end card. Max brand recall.',
        ico: 'F',
    },
    {
        id: 'ads',
        label: 'Ads (no end card)',
        short: 'Ads clean',
        description: 'Captions only plate for platform CTA cards.',
        ico: 'C',
    },
];

function CreateChipMenu({ label, title, options, value, onChange, open, onToggle, onClose }) {
    const selected = options.find((o) => o.id === value) || options[0];
    return (
        <button
            type="button"
            className={`create-chip${open ? ' open' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
        >
            <span>{selected?.short || selected?.label || label}</span>
            <span className="caret">▾</span>
            {open && (
                <div
                    className="create-chip-pop"
                    role="listbox"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="create-pop-head">{title}</div>
                    <div className="create-pop-list">
                        {options.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`create-pop-option${opt.id === value ? ' on' : ''}`}
                                disabled={opt.disabled}
                                onClick={() => {
                                    if (opt.disabled) return;
                                    onChange(opt.id);
                                    onClose();
                                }}
                            >
                                <span className="ico">{opt.ico || opt.label?.slice(0, 1) || '?'}</span>
                                <span className="body">
                                    <span className="name">{opt.label}</span>
                                    {opt.description ? (
                                        <span className="desc">{opt.description}</span>
                                    ) : null}
                                </span>
                                <span className="check" aria-hidden>
                                    {opt.id === value ? (
                                        <Check size={16} strokeWidth={2.5} />
                                    ) : null}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </button>
    );
}

const DEFAULT_IMAGE_ASPECTS = [
    { id: '1:1', label: '1:1 Square', short: '1:1', description: 'Feed / square poster', ico: '□' },
    { id: '4:5', label: '4:5 Portrait', short: '4:5', description: 'IG portrait', ico: '▯' },
    { id: '2:3', label: '2:3 Poster', short: '2:3', description: 'Print poster', ico: '▯' },
    { id: '9:16', label: '9:16 Story', short: '9:16', description: 'Stories cover', ico: '▮' },
    { id: '16:9', label: '16:9 Wide', short: '16:9', description: 'Banner / YouTube', ico: '▭' },
    { id: '3:2', label: '3:2 Landscape', short: '3:2', description: 'Photo landscape', ico: '▭' },
    { id: '4:3', label: '4:3 Classic', short: '4:3', description: 'Slide', ico: '▭' },
    { id: '2.35:1', label: '2.35:1 Cinema', short: '2.35:1', description: 'Wide banner', ico: '▬' },
];

const DEFAULT_IMAGE_COUNTS = [
    { id: '4', label: '4 images', short: '4', description: 'Quick set', ico: '4' },
    { id: '6', label: '6 images', short: '6', description: 'Small campaign', ico: '6' },
    { id: '8', label: '8 images', short: '8', description: 'Solid batch', ico: '8' },
    { id: '12', label: '12 images', short: '12', description: 'Volume pack', ico: '12' },
];

const DEFAULT_IMAGE_MOODS = [
    { id: 'auto', label: 'Auto mix', short: 'Mix', description: 'Rotate field / lifestyle / product', ico: 'M' },
    { id: 'field', label: 'Field', short: 'Field', description: 'Jobsite / truck / driveway', ico: 'F' },
    { id: 'lifestyle', label: 'Lifestyle', short: 'Lifestyle', description: 'Human everyday moments', ico: 'L' },
    { id: 'product', label: 'Product-led', short: 'Product', description: 'Hands + phone in context', ico: 'P' },
    { id: 'abstract', label: 'Abstract brand', short: 'Abstract', description: 'Texture & light, no people', ico: 'A' },
];

const DEFAULT_AD_ASPECTS = [
    { id: '3:4', label: '3:4 Portrait', short: '3:4', description: 'IG-style portrait', ico: '▯' },
    { id: '1:1', label: '1:1 Feed', short: '1:1', description: 'Meta / LinkedIn square', ico: '□' },
    { id: '4:5', label: '4:5 Feed', short: '4:5', description: 'IG feed · plate 3:4', ico: '▯' },
    { id: '9:16', label: '9:16 Story', short: '9:16', description: 'Stories / Reels cover', ico: '▮' },
    { id: '16:9', label: '16:9 Wide', short: '16:9', description: 'YouTube / web', ico: '▭' },
    { id: '2:3', label: '2:3 Poster', short: '2:3', description: 'Pinterest / print', ico: '▯' },
];

const DEFAULT_AD_COUNTS = [
    { id: '4', label: '4 ads', short: '4', description: 'Quick set', ico: '4' },
    { id: '6', label: '6 ads', short: '6', description: 'Small campaign', ico: '6' },
    { id: '8', label: '8 ads', short: '8', description: 'Solid batch', ico: '8' },
];

const DEFAULT_AD_TEMPLATES = [
    { id: 'auto', label: 'Auto mix', short: 'Mix', description: 'Rotate hero / panel / story / end card', ico: 'M' },
    { id: 'hero', label: 'Hero + type', short: 'Hero', description: 'Photo + scrim + headline + CTA', ico: 'H' },
    { id: 'panel', label: 'Brand panel', short: 'Panel', description: 'Photo upper · dark panel lower', ico: 'P' },
    { id: 'story', label: 'Story full', short: 'Story', description: 'Vertical full-bleed ad', ico: 'S' },
    { id: 'endcard', label: 'End card', short: 'End card', description: 'Dark conversion unit', ico: 'E' },
];

const DEFAULT_AD_ANGLES = [
    { id: 'auto', label: 'Auto mix', short: 'Mix', description: 'Rotate pain / field / outcome / beta', ico: 'M' },
    { id: 'pain', label: 'Pain', short: 'Pain', description: 'Admin chaos · five apps', ico: 'P' },
    { id: 'field', label: 'Field', short: 'Field', description: 'Truck · jobsite · phone', ico: 'F' },
    { id: 'outcome', label: 'Outcome', short: 'Outcome', description: 'Get paid · stay organized', ico: 'O' },
    { id: 'one_app', label: 'One app', short: 'One app', description: 'Customers → invoices', ico: '1' },
    { id: 'beta', label: 'Beta invite', short: 'Beta', description: 'Join the Beta', ico: 'B' },
];

const DEFAULT_AD_OBJECTIVES = [
    { id: 'conversion', label: 'Conversion', short: 'Convert', description: 'Beta / Start Free', ico: 'C' },
    { id: 'awareness', label: 'Awareness', short: 'Aware', description: 'Stop scroll · recall', ico: 'A' },
    { id: 'retarget', label: 'Retarget', short: 'Retarget', description: 'Warm traffic CTA', ico: 'R' },
];

function CreateView({
    packs,
    styles,
    flows,
    videoModels,
    onGenerate,
    onGenerateImages,
    onGenerateAds,
    loading,
    health,
    brand,
    workspace,
}) {
    const [mode, setMode] = useState('auto'); // auto | prompt | images | ads
    const [brief, setBrief] = useState('');
    const [packId, setPackId] = useState('stories');
    const [styleId, setStyleId] = useState(brand?.defaultVideoStyleId || 'contractor_talk');
    const [flowId, setFlowId] = useState(brand?.defaultFlowId || 'testimonial_talk');
    const [videoModelId, setVideoModelId] = useState(brand?.defaultVideoModelId || 'grok');
    const [brandChrome, setBrandChrome] = useState(brand?.defaultBrandChrome || 'organic');
    const [openChip, setOpenChip] = useState(null); // pack | model | chrome | aspect | count | mood | template | angle | objective
    const [showAdvanced, setShowAdvanced] = useState(false);
    // Images mode
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [imageCount, setImageCount] = useState('6');
    const [moodId, setMoodId] = useState('auto');
    const [diversify, setDiversify] = useState(true);
    const [imageAspects, setImageAspects] = useState(DEFAULT_IMAGE_ASPECTS);
    const [imageCounts, setImageCounts] = useState(DEFAULT_IMAGE_COUNTS);
    const [imageMoods, setImageMoods] = useState(DEFAULT_IMAGE_MOODS);
    // Ads mode
    const [adAspectRatio, setAdAspectRatio] = useState('3:4');
    const [adCount, setAdCount] = useState('6');
    const [adMoodId, setAdMoodId] = useState('auto');
    const [adTemplateId, setAdTemplateId] = useState('auto');
    const [adAngleId, setAdAngleId] = useState('auto');
    const [adObjectiveId, setAdObjectiveId] = useState('conversion');
    const [adDiversify, setAdDiversify] = useState(true);
    const [adAspects, setAdAspects] = useState(DEFAULT_AD_ASPECTS);
    const [adCounts, setAdCounts] = useState(DEFAULT_AD_COUNTS);
    const [adTemplates, setAdTemplates] = useState(DEFAULT_AD_TEMPLATES);
    const [adAngles, setAdAngles] = useState(DEFAULT_AD_ANGLES);
    const [adObjectives, setAdObjectives] = useState(DEFAULT_AD_OBJECTIVES);
    const briefRef = useRef(null);

    useEffect(() => {
        if (brand?.defaultVideoStyleId) setStyleId(brand.defaultVideoStyleId);
        if (brand?.defaultFlowId) setFlowId(brand.defaultFlowId);
        if (brand?.defaultVideoModelId) setVideoModelId(brand.defaultVideoModelId);
        if (brand?.defaultBrandChrome) setBrandChrome(brand.defaultBrandChrome);
    }, [
        brand?.defaultVideoStyleId,
        brand?.defaultFlowId,
        brand?.defaultVideoModelId,
        brand?.defaultBrandChrome,
    ]);

    useEffect(() => {
        const s = (styles || []).find((x) => x.id === styleId);
        const rec = s?.recommendedVideoModelId;
        if (!rec) return;
        const m = (videoModels || []).find((x) => x.id === rec);
        if (m?.available !== false && (styleId === 'ultra_ugc' || styleId === 'premium_product')) {
            setVideoModelId(rec);
        }
    }, [styleId, styles, videoModels]);

    useEffect(() => {
        api.imageBatchOptions()
            .then((opts) => {
                if (opts?.aspects?.length) setImageAspects(opts.aspects);
                if (opts?.counts?.length) setImageCounts(opts.counts);
                if (opts?.moods?.length) setImageMoods(opts.moods);
            })
            .catch(() => {});
        api.adBatchOptions()
            .then((opts) => {
                if (opts?.aspects?.length) setAdAspects(opts.aspects);
                if (opts?.counts?.length) setAdCounts(opts.counts);
                if (opts?.moods?.length) {
                    /* moods shared with images — keep imageMoods for images */
                }
                if (opts?.templates?.length) {
                    setAdTemplates([
                        {
                            id: 'auto',
                            label: 'Auto mix',
                            short: 'Mix',
                            description: 'Rotate layouts',
                            ico: 'M',
                        },
                        ...opts.templates,
                    ]);
                }
                if (opts?.angles?.length) setAdAngles(opts.angles);
                if (opts?.objectives?.length) setAdObjectives(opts.objectives);
            })
            .catch(() => {});
    }, []);

    // Close chip menus on outside click
    useEffect(() => {
        if (!openChip) return;
        const close = () => setOpenChip(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [openChip]);

    const packOptions = useMemo(() => {
        const list = packs || [];
        if (!list.length) {
            return [
                {
                    id: 'stories',
                    label: 'Story reels',
                    short: 'Story reels',
                    description: 'Multi-beat hook → resolve',
                    ico: 'SR',
                },
            ];
        }
        return list.map((p) => ({
            id: p.id,
            label: p.label,
            short: p.label?.replace(/\s*\(.*\)\s*$/, '') || p.id,
            description: p.description || '',
            ico: (p.label || p.id).slice(0, 2).toUpperCase(),
        }));
    }, [packs]);

    const modelOptions = useMemo(() => {
        return (videoModels || []).map((m) => ({
            id: m.id,
            label: m.label,
            short: m.label?.replace(/\s*Video\s*$/i, '') || m.id,
            description: m.description || m.costLabel || m.tier || '',
            ico: (m.label || m.id).slice(0, 1).toUpperCase(),
            disabled: m.available === false,
        }));
    }, [videoModels]);

    const isImages = mode === 'images';
    const isAds = mode === 'ads';
    const needsBrief = mode === 'prompt' || mode === 'images'; // ads: brief optional

    const packLabel =
        packOptions.find((p) => p.id === packId)?.short ||
        packOptions.find((p) => p.id === packId)?.label ||
        packId;
    const modelLabel =
        modelOptions.find((m) => m.id === videoModelId)?.short ||
        modelOptions.find((m) => m.id === videoModelId)?.label ||
        videoModelId;
    const chromeLabel =
        CHROME_OPTIONS.find((c) => c.id === brandChrome)?.short || brandChrome;
    const aspectLabel =
        imageAspects.find((a) => a.id === aspectRatio)?.short || aspectRatio;
    const countLabel = imageCounts.find((c) => c.id === imageCount)?.short || imageCount;
    const moodLabel = imageMoods.find((m) => m.id === moodId)?.short || moodId;
    const adAspectLabel =
        adAspects.find((a) => a.id === adAspectRatio)?.short || adAspectRatio;
    const adCountLabel = adCounts.find((c) => c.id === adCount)?.short || adCount;
    const adMoodLabel = imageMoods.find((m) => m.id === adMoodId)?.short || adMoodId;
    const adTemplateLabel =
        adTemplates.find((t) => t.id === adTemplateId)?.short || adTemplateId;
    const adAngleLabel = adAngles.find((a) => a.id === adAngleId)?.short || adAngleId;
    const adObjectiveLabel =
        adObjectives.find((o) => o.id === adObjectiveId)?.short || adObjectiveId;

    function runGenerate() {
        if (loading) return;
        if (needsBrief && !brief.trim()) {
            briefRef.current?.focus();
            return;
        }
        if (isAds) {
            onGenerateAds?.({
                prompt: brief.trim() || undefined,
                aspectRatio: adAspectRatio,
                count: Number(adCount) || 6,
                diversify: adDiversify,
                moodId: adMoodId,
                templateId: adTemplateId,
                angleId: adAngleId,
                objectiveId: adObjectiveId,
                generateNow: true,
            });
            return;
        }
        if (isImages) {
            onGenerateImages?.({
                prompt: brief.trim(),
                aspectRatio,
                count: Number(imageCount) || 6,
                diversify,
                moodId,
                generateNow: true,
            });
            return;
        }
        onGenerate(packId, {
            styleId,
            flowId,
            videoModelId,
            brandChrome,
            storyMode: true,
            batchBrief: mode === 'prompt' ? brief.trim() : null,
            batchMode: mode,
        });
    }

    const heroTitle = isAds
        ? 'Generate ads'
        : isImages
          ? 'Generate images'
          : 'Generate content';
    const heroBody = isAds
        ? 'Finished ads with Taskiz logo, type, and CTA. Brand guide locked — plates stay photo-only; design is composed after.'
        : isImages
          ? 'Posters & social banners. Brand ICP stays locked — your prompt steers the campaign; auto-vary keeps faces and outfits different.'
          : 'Auto runs the factory on brand defaults. Prompt steers casting, vibe, and angle for this batch only.';

    return (
        <div className="create-canvas" as="main">
            <div className="create-hero">
                <Text type="label" color="secondary" as="p" style={{ marginBottom: 8 }}>
                    {workspace?.name || brand?.name || 'Workspace'}
                </Text>
                <h1>{heroTitle}</h1>
                <p>{heroBody}</p>
            </div>

            <div className="create-mode-switch" role="tablist" aria-label="Batch mode">
                <button
                    type="button"
                    className={mode === 'auto' ? 'on' : ''}
                    onClick={() => setMode('auto')}
                >
                    Auto
                </button>
                <button
                    type="button"
                    className={mode === 'prompt' ? 'on' : ''}
                    onClick={() => {
                        setMode('prompt');
                        setTimeout(() => briefRef.current?.focus(), 0);
                    }}
                >
                    Prompt
                </button>
                <button
                    type="button"
                    className={mode === 'images' ? 'on' : ''}
                    onClick={() => {
                        setMode('images');
                        setTimeout(() => briefRef.current?.focus(), 0);
                    }}
                >
                    Images
                </button>
                <button
                    type="button"
                    className={mode === 'ads' ? 'on' : ''}
                    onClick={() => {
                        setMode('ads');
                        setTimeout(() => briefRef.current?.focus(), 0);
                    }}
                >
                    Ads
                </button>
            </div>

            <div className="create-composer-wrap">
                <div className="create-composer">
                    <div className="create-composer-main">
                        <div className="create-field">
                            <span className="create-field-label">
                                {mode === 'auto'
                                    ? 'Auto mode'
                                    : mode === 'images'
                                      ? 'Image brief'
                                      : mode === 'ads'
                                        ? 'Campaign (optional)'
                                        : 'Batch brief'}
                            </span>
                            {mode === 'auto' ? (
                                <div className="create-auto-copy">
                                    Ready to generate from Brand OS · <strong>{packLabel}</strong> ·{' '}
                                    {modelLabel} · {chromeLabel}
                                </div>
                            ) : (
                                <textarea
                                    ref={briefRef}
                                    className="create-brief"
                                    rows={2}
                                    value={brief}
                                    onChange={(e) => {
                                        setBrief(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            runGenerate();
                                        }
                                    }}
                                    placeholder={
                                        isAds
                                            ? 'Optional campaign steer… e.g. Sunday night invoicing pain for solo handymen — or leave blank for Brand OS angles'
                                            : isImages
                                              ? 'What to show… e.g. summer promo — contractors finally getting paid faster, warm outdoor energy'
                                              : 'Steer this batch… e.g. Mexican American solo GCs, San Antonio driveways, tired-but-hopeful, invoicing pain'
                                    }
                                />
                            )}
                        </div>
                        <button
                            type="button"
                            className="create-submit"
                            disabled={loading || (needsBrief && !brief.trim())}
                            onClick={runGenerate}
                            title={
                                isAds
                                    ? 'Generate ads'
                                    : isImages
                                      ? 'Generate images'
                                      : 'Generate ideas'
                            }
                            aria-label={
                                isAds
                                    ? 'Generate ads'
                                    : isImages
                                      ? 'Generate images'
                                      : 'Generate ideas'
                            }
                        >
                            {loading ? (
                                <Loader2 className="spin" size={20} />
                            ) : (
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    aria-hidden
                                >
                                    <path
                                        d="M5 12h14M13 6l6 6-6 6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>

                    <div className="create-chips">
                        {isAds ? (
                            <>
                                <CreateChipMenu
                                    label="Format"
                                    title="Ad aspect ratio"
                                    options={adAspects}
                                    value={adAspectRatio}
                                    onChange={setAdAspectRatio}
                                    open={openChip === 'adAspect'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'adAspect' ? null : 'adAspect')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Count"
                                    title="How many ads"
                                    options={adCounts}
                                    value={adCount}
                                    onChange={setAdCount}
                                    open={openChip === 'adCount'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'adCount' ? null : 'adCount')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Angle"
                                    title="Message angle"
                                    options={adAngles}
                                    value={adAngleId}
                                    onChange={setAdAngleId}
                                    open={openChip === 'angle'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'angle' ? null : 'angle')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Goal"
                                    title="Ad objective"
                                    options={adObjectives}
                                    value={adObjectiveId}
                                    onChange={setAdObjectiveId}
                                    open={openChip === 'objective'}
                                    onToggle={() =>
                                        setOpenChip(
                                            openChip === 'objective' ? null : 'objective'
                                        )
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Layout"
                                    title="Ad template"
                                    options={adTemplates}
                                    value={adTemplateId}
                                    onChange={setAdTemplateId}
                                    open={openChip === 'template'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'template' ? null : 'template')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Mood"
                                    title="Photo mood"
                                    options={imageMoods}
                                    value={adMoodId}
                                    onChange={setAdMoodId}
                                    open={openChip === 'adMood'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'adMood' ? null : 'adMood')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <button
                                    type="button"
                                    className={`create-chip${adDiversify ? ' on-toggle' : ''}`}
                                    title={
                                        adDiversify
                                            ? 'Each ad plate gets a different person, wardrobe, and setting'
                                            : 'Less cast auto-variation'
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAdDiversify((v) => !v);
                                    }}
                                >
                                    <span>{adDiversify ? 'Auto-vary on' : 'Auto-vary off'}</span>
                                </button>
                            </>
                        ) : isImages ? (
                            <>
                                <CreateChipMenu
                                    label="Format"
                                    title="Aspect ratio"
                                    options={imageAspects}
                                    value={aspectRatio}
                                    onChange={setAspectRatio}
                                    open={openChip === 'aspect'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'aspect' ? null : 'aspect')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Count"
                                    title="How many"
                                    options={imageCounts}
                                    value={imageCount}
                                    onChange={setImageCount}
                                    open={openChip === 'count'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'count' ? null : 'count')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Mood"
                                    title="Scene mood"
                                    options={imageMoods}
                                    value={moodId}
                                    onChange={setMoodId}
                                    open={openChip === 'mood'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'mood' ? null : 'mood')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <button
                                    type="button"
                                    className={`create-chip${diversify ? ' on-toggle' : ''}`}
                                    title={
                                        diversify
                                            ? 'Each image gets a different person, wardrobe, and setting'
                                            : 'Prompt alone drives look — less auto-variation'
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDiversify((v) => !v);
                                    }}
                                >
                                    <span>{diversify ? 'Auto-vary on' : 'Auto-vary off'}</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <CreateChipMenu
                                    label="Pack"
                                    title="Content pack"
                                    options={packOptions}
                                    value={packId}
                                    onChange={setPackId}
                                    open={openChip === 'pack'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'pack' ? null : 'pack')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Model"
                                    title="Video model"
                                    options={modelOptions}
                                    value={videoModelId}
                                    onChange={setVideoModelId}
                                    open={openChip === 'model'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'model' ? null : 'model')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <CreateChipMenu
                                    label="Chrome"
                                    title="Export chrome"
                                    options={CHROME_OPTIONS}
                                    value={brandChrome}
                                    onChange={setBrandChrome}
                                    open={openChip === 'chrome'}
                                    onToggle={() =>
                                        setOpenChip(openChip === 'chrome' ? null : 'chrome')
                                    }
                                    onClose={() => setOpenChip(null)}
                                />
                                <button
                                    type="button"
                                    className="create-advanced-toggle"
                                    onClick={() => setShowAdvanced((v) => !v)}
                                >
                                    {showAdvanced ? 'Hide advanced' : 'Advanced'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showAdvanced && !isImages && !isAds && (
                <div className="create-advanced">
                    <div className="create-advanced-row">
                        <span>Video style</span>
                        <div className="create-advanced-pills">
                            {(styles || []).map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    className={`create-adv-pill${styleId === s.id ? ' on' : ''}`}
                                    onClick={() => setStyleId(s.id)}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="create-advanced-row">
                        <span>Story flow</span>
                        <div className="create-advanced-pills">
                            {(flows || []).map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={`create-adv-pill${flowId === f.id ? ' on' : ''}`}
                                    onClick={() => setFlowId(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <p className="create-foot-note">
                {mode === 'auto'
                    ? 'Ideas → stills → animate → assemble (Whisper captions) → approve'
                    : mode === 'images'
                      ? `Stills only · ${countLabel} × ${aspectLabel} · ${moodLabel}${diversify ? ' · unique cast each frame' : ''} · download from queue`
                      : mode === 'ads'
                        ? `Brand ads · ${adCountLabel} × ${adAspectLabel} · ${adAngleLabel} · ${adObjectiveLabel} · ${adTemplateLabel} · ${adMoodLabel}${adDiversify ? ' · unique cast' : ''} · plate → compose → download`
                        : 'Brief steers casting & vibe for this batch only · brand rules still locked'}
                {loading
                    ? isAds
                        ? ' · Generating ads…'
                        : isImages
                          ? ' · Generating images…'
                          : ' · Building batch…'
                    : ''}
            </p>

            {!health?.grok && (
                <Banner
                    status="warning"
                    title="Grok key missing"
                    description="Ideas still work. Add XAI_API_KEY to .env for images and video."
                />
            )}
        </div>
    );
}

/* ───────────────── card ───────────────── */

function MediaPreview({ item }) {
    const finalVid = item.composedVideoUrl || item.finalVideoUrl || item.videoUrl;
    if (finalVid) {
        return (
            <div className={`media-frame ratio-${item.format === 'reel' ? '916' : '11'}`}>
                <video
                    src={finalVid}
                    controls
                    playsInline
                    poster={item.imageUrl || item.beats?.[0]?.imageUrl || undefined}
                />
            </div>
        );
    }
    if (item.format === 'reel' && item.beats?.some((b) => b.imageUrl)) {
        return (
            <div className="beats-preview">
                {item.beats.map((b, i) => (
                    <div key={b.id || i} className="beat-thumb">
                        {b.videoUrl ? (
                            <video src={b.videoUrl} muted playsInline />
                        ) : b.imageUrl ? (
                            <img src={b.imageUrl} alt={b.title} />
                        ) : (
                            <div className="ph">{i + 1}</div>
                        )}
                        <span>
                            {b.label || b.role}
                            {b.videoUrl ? ' · vid' : b.imageUrl ? ' · still' : ''}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    if (item.format === 'carousel' && item.slides?.some((s) => s.imageUrl)) {
        return (
            <div className="carousel-preview">
                {item.slides.map((s, i) => (
                    <div key={s.id || i} className="carousel-slide">
                        {s.imageUrl ? (
                            <img src={s.imageUrl} alt={s.headline} />
                        ) : (
                            <div className="ph">{i + 1}</div>
                        )}
                        <span>{s.headline}</span>
                    </div>
                ))}
            </div>
        );
    }
    if (item.imageUrl) {
        return (
            <div className={`media-frame ratio-${item.format === 'reel' ? '916' : '11'}`}>
                <img src={item.imageUrl} alt={item.headline} />
            </div>
        );
    }
    return (
        <div className={`media-frame ratio-${item.format === 'reel' ? '916' : '11'} empty`}>
            <ImageIcon size={28} />
            <span>No media yet</span>
        </div>
    );
}

function ItemCard({
    item,
    selected,
    onSelect,
    onGenerateImage,
    onAnimate,
    onBuildStory,
    onApprove,
    onUnapprove,
    onPublish,
    onDownload,
    onRemove,
    onChangeVideoModel,
    videoModels,
    busy,
}) {
    const isBusy = busy === item.id;
    const isStoryReel = item.format === 'reel' && item.beats?.length > 0;
    const canImage =
        item.status !== 'generating' &&
        (item.format === 'carousel'
            ? item.slides?.some((s) => !s.imageUrl)
            : isStoryReel
                ? item.beats.some((b) => !b.imageUrl)
                : !item.imageUrl);
    const beatsReady = isStoryReel && item.beats.every((b) => b.imageUrl);
    const beatsAnimated = isStoryReel && item.beats.every((b) => b.videoUrl);
    const canAnimate =
        item.format === 'reel' &&
        !item.composedVideoUrl &&
        (isStoryReel ? beatsReady && !beatsAnimated : item.imageUrl && !item.videoUrl);
    const canAssemble = isStoryReel && beatsAnimated && !item.composedVideoUrl;
    const canApprove =
        item.status !== 'approved' &&
        item.status !== 'published' &&
        (item.composedVideoUrl ||
            item.videoUrl ||
            item.imageUrl ||
            item.slides?.every((s) => s.imageUrl) ||
            (isStoryReel && item.beats?.some((b) => b.imageUrl)));
    const canPublish = item.status === 'approved' || item.status === 'published';
    const downloadUrl = mediaDownloadUrl(item);
    const canDownload = Boolean(downloadUrl);
    const isApprovedView = item.status === 'approved' || item.status === 'published';

    return (
        <article
            className={`item-card status-${item.status}${selected ? ' selected' : ''}`}
            onClick={() => onSelect(item.id)}
        >
            <div className="item-top">
                <div className="tags">
                    <span className="tag format">
                        <FormatIcon format={item.format} /> {item.formatLabel}
                    </span>
                    <span className="tag pillar">{item.pillarLabel}</span>
                    {item.styleLabel && <span className="tag style">{item.styleLabel}</span>}
                    {item.templateLabel && (
                        <span className="tag style">{item.templateLabel}</span>
                    )}
                    {item.angleId && item.batchMode === 'ads' && (
                        <span className="tag pillar">{item.angleId}</span>
                    )}
                    {item.videoModelLabel && (
                        <span className="tag model">{item.videoModelLabel}</span>
                    )}
                    {item.flowLabel && item.beats?.length > 1 && (
                        <span className="tag flow">{item.beats.length} beats</span>
                    )}
                    <span className={`tag status s-${item.status}`}>{statusLabel(item.status)}</span>
                </div>
                <span className="size">{item.size}</span>
            </div>

            <MediaPreview item={item} />

            <div className="item-copy">
                <h3>{item.headline}</h3>
                <p>{item.body}</p>
                <div className="cta-pill">{item.cta}</div>
                {item.format === 'reel' && videoModels?.length > 0 && (
                    <div
                        className="inline-model-pick"
                        onClick={(e) => e.stopPropagation()}
                        role="group"
                        aria-label="Video model"
                    >
                        <span>Video model</span>
                        <div className="model-pills">
                            {videoModels.map((m) => {
                                const active = (item.videoModelId || 'grok') === m.id;
                                const offline = m.available === false;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        className={`model-pill${active ? ' on' : ''}`}
                                        disabled={isBusy || offline}
                                        title={
                                            offline
                                                ? `${m.label} offline`
                                                : m.costLabel || m.description || m.label
                                        }
                                        onClick={() => onChangeVideoModel?.(item, m.id)}
                                    >
                                        {m.label}
                                        {offline ? ' · offline' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {item.error && (
                <div className="item-error">
                    <AlertCircle size={14} /> {item.error}
                </div>
            )}

            <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                    className="ghost"
                    disabled={isBusy}
                    onClick={() => onGenerateImage(item)}
                >
                    {isBusy ? <Loader2 className="spin" size={14} /> : <ImageIcon size={14} />}
                    {isStoryReel
                        ? beatsReady
                            ? 'Regen beat stills'
                            : 'Generate beat stills'
                        : item.imageUrl || item.slides?.some((s) => s.imageUrl)
                            ? 'Regen stills'
                            : 'Generate stills'}
                </button>

                {item.format === 'reel' && (
                    <button className="ghost" disabled={isBusy || !canAnimate} onClick={() => onAnimate(item)}>
                        {isBusy ? <Loader2 className="spin" size={14} /> : <Clapperboard size={14} />}
                        {isStoryReel ? 'Animate beats' : 'Animate reel'}
                    </button>
                )}

                {isStoryReel && (
                    <button
                        className="primary"
                        disabled={isBusy || (!canAssemble && !beatsReady)}
                        onClick={() => onBuildStory(item)}
                        title="Stills → animate → stitch → titles"
                    >
                        {isBusy ? <Loader2 className="spin" size={14} /> : <Film size={14} />}
                        Build story
                    </button>
                )}

                {item.status === 'approved' || item.status === 'published' ? (
                    <button className="ghost" onClick={() => onUnapprove(item)}>
                        Unapprove
                    </button>
                ) : (
                    <button className="primary" disabled={!canApprove || isBusy} onClick={() => onApprove(item)}>
                        <Check size={14} /> Approve
                    </button>
                )}

                {/* Download: always when media ready; primary style on approved for visibility */}
                {canDownload && (
                    <button
                        className={isApprovedView ? 'primary' : 'ghost'}
                        disabled={isBusy}
                        onClick={() => onDownload?.(item)}
                        title={
                            item.format === 'reel'
                                ? 'Download final video (MP4)'
                                : 'Download image'
                        }
                    >
                        <Download size={14} /> Download
                    </button>
                )}

                <button
                    className="ghost"
                    disabled={!canPublish || isBusy}
                    onClick={() => onPublish(item)}
                    title="Publish via Upload-Post"
                >
                    <Send size={14} /> Publish
                </button>

                <button className="icon-btn" title="Remove" onClick={() => onRemove(item.id)}>
                    <Trash2 size={14} />
                </button>
            </div>
        </article>
    );
}

/* ───────────────── detail drawer ───────────────── */

function DetailDrawer({ item, onClose, onCopy, onDownload }) {
    if (!item) return null;
    const dlUrl = mediaDownloadUrl(item);
    return (
        <div className="drawer">
            <div className="drawer-head">
                <div>
                    <div className="tags">
                        <span className="tag format">
                            <FormatIcon format={item.format} /> {item.formatLabel}
                        </span>
                        <span className="tag pillar">{item.pillarLabel}</span>
                        {item.styleLabel && <span className="tag style">{item.styleLabel}</span>}
                        {item.videoModelLabel && (
                            <span className="tag model">{item.videoModelLabel}</span>
                        )}
                        {item.flowLabel && <span className="tag flow">{item.flowLabel}</span>}
                    </div>
                    <h2>{item.headline}</h2>
                </div>
                <button className="icon-btn" onClick={onClose}>
                    <X size={18} />
                </button>
            </div>

            <MediaPreview item={item} />

            {dlUrl && (
                <button
                    className="primary"
                    type="button"
                    onClick={() => onDownload?.(item)}
                    title="Download final media"
                >
                    <Download size={14} /> Download{' '}
                    {item.format === 'reel' ? 'video' : 'image'}
                </button>
            )}

            {item.videoModelId && (
                <>
                    <label>Video model</label>
                    <input
                        readOnly
                        value={`${item.videoModelLabel || item.videoModelId} (${item.videoProvider || '?'})`}
                    />
                </>
            )}

            <label>Caption (for publish)</label>
            <textarea readOnly value={item.caption} rows={6} />
            <button className="ghost" onClick={() => onCopy(item.caption)}>
                <Copy size={14} /> Copy caption
            </button>

            <label>CTA</label>
            <input readOnly value={item.cta} />

            {item.styleDirectorBrief && (
                <>
                    <label>Style director brief (injected into prompts)</label>
                    <textarea readOnly value={item.styleDirectorBrief} rows={8} />
                </>
            )}

            {item.beats?.length > 0 && (
                <>
                    <h4>Story beats</h4>
                    {item.beats.map((b, i) => (
                        <div key={b.id || i} className="slide-block beat-block">
                            <b>
                                {i + 1}. {b.label || b.role} · {b.durationSec || 5}s
                            </b>
                            <p>
                                <strong>Title:</strong> {b.title}
                            </p>
                            <p>{b.imageSubject}</p>
                            {b.imageUrl && (
                                <img src={b.imageUrl} alt={b.title} className="beat-inline-img" />
                            )}
                            <details>
                                <summary>Prompts</summary>
                                <label>Image</label>
                                <textarea readOnly value={b.imagePrompt || ''} rows={3} />
                                <label>Video</label>
                                <textarea readOnly value={b.videoPrompt || ''} rows={3} />
                            </details>
                        </div>
                    ))}
                </>
            )}

            <label>Image prompt (brand-locked)</label>
            <textarea readOnly value={item.imagePrompt || ''} rows={4} />

            {item.format === 'reel' && !item.beats?.length && (
                <>
                    <label>Video motion prompt</label>
                    <textarea readOnly value={item.videoPrompt || ''} rows={3} />
                </>
            )}

            {item.format === 'carousel' && (
                <>
                    <h4>Slides</h4>
                    {item.slides?.map((s, i) => (
                        <div key={s.id || i} className="slide-block">
                            <b>
                                {i + 1}. {s.headline}
                            </b>
                            <p>{s.body}</p>
                        </div>
                    ))}
                </>
            )}

            {item.graphicsEngine && (
                <p className="hint">Graphics engine: {item.graphicsEngine}</p>
            )}

            <label>Platforms</label>
            <div className="tags">
                {item.platforms?.map((p) => (
                    <span className="tag" key={p}>
                        {p}
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ───────────────── queue ───────────────── */

const QUEUE_PAGE_SIZE = 12;

function isKeptCreative(item) {
    return item?.status === 'approved' || item?.status === 'published';
}

function QueueView({
    items,
    packLabel,
    filter,
    setFilter,
    selectedId,
    setSelectedId,
    onGenerateImage,
    onAnimate,
    onBuildStory,
    onApprove,
    onUnapprove,
    onPublish,
    onDownload,
    onRemove,
    onGenerateAll,
    onChangeVideoModel,
    videoModels,
    busy,
    generatingAll,
}) {
    const [visibleCount, setVisibleCount] = useState(QUEUE_PAGE_SIZE);
    const loadMoreRef = useRef(null);

    const filtered = useMemo(() => {
        if (filter === 'all') return items;
        if (filter === 'post' || filter === 'carousel' || filter === 'reel') {
            return items.filter((i) => i.format === filter);
        }
        return items.filter((i) => i.status === filter);
    }, [items, filter]);

    // Reset page when filter changes or queue shrinks below current window.
    useEffect(() => {
        setVisibleCount(QUEUE_PAGE_SIZE);
    }, [filter]);

    useEffect(() => {
        setVisibleCount((n) => Math.min(Math.max(n, QUEUE_PAGE_SIZE), Math.max(filtered.length, QUEUE_PAGE_SIZE)));
    }, [filtered.length]);

    const visible = useMemo(
        () => filtered.slice(0, visibleCount),
        [filtered, visibleCount]
    );
    const hasMore = visibleCount < filtered.length;
    const keptCount = useMemo(
        () => items.filter(isKeptCreative).length,
        [items]
    );

    // Infinite scroll: load next page when sentinel enters viewport.
    useEffect(() => {
        if (!hasMore) return undefined;
        const el = loadMoreRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisibleCount((n) =>
                        Math.min(n + QUEUE_PAGE_SIZE, filtered.length)
                    );
                }
            },
            { root: null, rootMargin: '240px', threshold: 0 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasMore, filtered.length]);

    const selected = items.find((i) => i.id === selectedId) || null;

    if (!items.length) {
        return (
            <VStack gap={4} as="main">
                <EmptyState
                    title="No content in the queue yet"
                    description="Generate a pack from Create batch — ideas draft from this workspace Brand OS."
                    icon={<LayoutGrid size={32} />}
                />
            </VStack>
        );
    }

    const descParts = [
        `${items.length} in queue`,
        keptCount ? `${keptCount} approved kept` : null,
        `showing ${visible.length} of ${filtered.length}`,
    ].filter(Boolean);

    return (
        <VStack gap={4} as="main">
            <PageHeader
                title={packLabel || 'Review queue'}
                description={`${descParts.join(' · ')} · approve only what you ship`}
                actions={
                    <Button
                        label={generatingAll ? 'Generating all stills…' : 'Generate all stills'}
                        icon={
                            generatingAll ? (
                                <Loader2 className="spin" size={16} />
                            ) : (
                                <WandSparkles size={16} />
                            )
                        }
                        isLoading={generatingAll}
                        isDisabled={generatingAll}
                        onClick={onGenerateAll}
                    />
                }
            />

            <TabList value={filter} onChange={setFilter} hasDivider>
                <Tab value="all" label="All" />
                <Tab value="post" label="Posts" />
                <Tab value="carousel" label="Carousels" />
                <Tab value="reel" label="Reels" />
                <Tab value="ready" label="Ready" />
                <Tab value="approved" label="Approved" />
            </TabList>

            <div className="media-grid">
                {visible.map((item) => (
                    <ItemCard
                        key={item.id}
                        item={item}
                        selected={selectedId === item.id}
                        onSelect={setSelectedId}
                        onGenerateImage={onGenerateImage}
                        onAnimate={onAnimate}
                        onBuildStory={onBuildStory}
                        onApprove={onApprove}
                        onUnapprove={onUnapprove}
                        onPublish={onPublish}
                        onDownload={onDownload}
                        onRemove={onRemove}
                        onChangeVideoModel={onChangeVideoModel}
                        videoModels={videoModels}
                        busy={busy}
                    />
                ))}
            </div>

            {hasMore ? (
                <VStack gap={2} hAlign="center" padding={4} ref={loadMoreRef}>
                    <Text type="supporting" color="secondary">
                        Showing {visible.length} of {filtered.length}
                    </Text>
                    <Button
                        label={`Load ${Math.min(QUEUE_PAGE_SIZE, filtered.length - visibleCount)} more`}
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                            setVisibleCount((n) =>
                                Math.min(n + QUEUE_PAGE_SIZE, filtered.length)
                            )
                        }
                    />
                </VStack>
            ) : filtered.length > QUEUE_PAGE_SIZE ? (
                <VStack gap={2} hAlign="center" padding={4}>
                    <Text type="supporting" color="secondary">
                        All {filtered.length} shown
                    </Text>
                </VStack>
            ) : null}

            {selected && (
                <DetailDrawer
                    item={selected}
                    onClose={() => setSelectedId(null)}
                    onCopy={(text) => navigator.clipboard?.writeText(text)}
                    onDownload={onDownload}
                />
            )}
        </VStack>
    );
}

/* ───────────────── brand (editable) ───────────────── */

function BrandView({ brand, onSaved, onToast }) {
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState('positioning'); // positioning | colors | visual | icp

    useEffect(() => {
        if (brand) {
            setDraft({
                oneLiner: brand.oneLiner || '',
                supporting: brand.supporting || '',
                category: brand.category || '',
                primaryCta: brand.primaryCta || '',
                website: brand.website || '',
                colors: { ...(brand.colors || {}) },
                photographyStyle: brand.photographyStyle || '',
                imageNegatives: brand.imageNegatives || '',
                compositionNotes: brand.compositionNotes || '',
                doNotSay: (brand.doNotSay || []).join('\n'),
                icpPrimary: (brand.icp?.primary || []).join('\n'),
                icpSecondary: (brand.icp?.secondary || []).join('\n'),
            });
        }
    }, [brand]);

    if (!brand || !draft) {
        return (
            <VStack gap={3} as="main" padding={4}>
                <Text color="secondary">Loading brand kit…</Text>
            </VStack>
        );
    }

    function setField(key, value) {
        setDraft((d) => ({ ...d, [key]: value }));
    }

    function setColor(key, value) {
        setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
    }

    async function save() {
        setSaving(true);
        try {
            const payload = {
                oneLiner: draft.oneLiner,
                supporting: draft.supporting,
                category: draft.category,
                primaryCta: draft.primaryCta,
                website: draft.website,
                colors: draft.colors,
                photographyStyle: draft.photographyStyle,
                imageNegatives: draft.imageNegatives,
                compositionNotes: draft.compositionNotes,
                doNotSay: draft.doNotSay
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                icp: {
                    primary: draft.icpPrimary
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    secondary: draft.icpSecondary
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                },
            };
            const next = await api.saveBrand(payload);
            onSaved?.(next);
            onToast?.('Brand kit saved — new stills will use these rules');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function reset() {
        if (!confirm('Reset brand kit to workspace defaults?')) return;
        setSaving(true);
        try {
            const next = await api.resetBrand();
            onSaved?.(next);
            onToast?.('Brand kit reset to defaults');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setSaving(false);
        }
    }

    const colorKeys = Object.keys(draft.colors || {});

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Workspace brand OS · creatives only"
                title="Brand kit"
                description={
                    brand.website
                        ? `Source of truth for copy, creative palette, and image rules. ${brand.website}`
                        : 'Source of truth for copy, creative palette, and image rules used in every prompt.'
                }
                actions={
                    <>
                        <Button
                            label="Reset defaults"
                            variant="ghost"
                            isDisabled={saving}
                            onClick={reset}
                        />
                        <Button
                            label={saving ? 'Saving…' : 'Save brand kit'}
                            icon={saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                            isLoading={saving}
                            isDisabled={saving}
                            onClick={save}
                        />
                    </>
                }
            />

            <TabList value={tab} onChange={setTab} hasDivider layout="hug">
                <Tab value="positioning" label="Positioning" />
                <Tab value="colors" label="Colors" />
                <Tab value="visual" label="Image rules" />
                <Tab value="icp" label="ICP & guardrails" />
            </TabList>

            {tab === 'positioning' && (
                <Card padding={4}>
                    <VStack gap={4}>
                        <TextInput
                            label="One-liner"
                            value={draft.oneLiner}
                            onChange={(v) => setField('oneLiner', v)}
                            width="100%"
                        />
                        <TextArea
                            label="Supporting"
                            value={draft.supporting}
                            onChange={(v) => setField('supporting', v)}
                            rows={3}
                            width="100%"
                        />
                        <HStack gap={3} wrap="wrap">
                            <div style={{ flex: '1 1 200px' }}>
                                <TextInput
                                    label="Category"
                                    value={draft.category}
                                    onChange={(v) => setField('category', v)}
                                    width="100%"
                                />
                            </div>
                            <div style={{ flex: '1 1 160px' }}>
                                <TextInput
                                    label="Primary CTA"
                                    value={draft.primaryCta}
                                    onChange={(v) => setField('primaryCta', v)}
                                    width="100%"
                                />
                            </div>
                        </HStack>
                        <TextInput
                            label="Website"
                            value={draft.website}
                            onChange={(v) => setField('website', v)}
                            width="100%"
                        />
                    </VStack>
                </Card>
            )}

            {tab === 'colors' && (
                <Card padding={4}>
                    <VStack gap={3}>
                        <Banner
                            status="info"
                            title="Creative palette only"
                            description="These colors grade Grok stills and compose titles. They do not recolor the Glampire OS dashboard."
                        />
                        <div className="color-edit-grid">
                            {colorKeys.map((key) => (
                                <label key={key} className="color-edit">
                                    <span>{key}</span>
                                    <div>
                                        <input
                                            type="color"
                                            value={
                                                /^#[0-9A-Fa-f]{6}$/.test(draft.colors[key])
                                                    ? draft.colors[key]
                                                    : '#000000'
                                            }
                                            onChange={(e) => setColor(key, e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            value={draft.colors[key] || ''}
                                            onChange={(e) => setColor(key, e.target.value)}
                                        />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </VStack>
                </Card>
            )}

            {tab === 'visual' && (
                <Card padding={4}>
                    <VStack gap={4}>
                        <Text type="supporting" color="secondary" as="p">
                            Injected into every still/reel prompt. Keep brand names out of the scene —
                            logo/type are added later as design overlay.
                        </Text>
                        <TextArea
                            label="Photography style"
                            value={draft.photographyStyle}
                            onChange={(v) => setField('photographyStyle', v)}
                            rows={4}
                            width="100%"
                        />
                        <TextArea
                            label="Composition notes"
                            value={draft.compositionNotes}
                            onChange={(v) => setField('compositionNotes', v)}
                            rows={3}
                            width="100%"
                        />
                        <TextArea
                            label="Strict negatives"
                            description="No text on cars, no logos in scene…"
                            value={draft.imageNegatives}
                            onChange={(v) => setField('imageNegatives', v)}
                            rows={5}
                            width="100%"
                        />
                    </VStack>
                </Card>
            )}

            {tab === 'icp' && (
                <VStack gap={4}>
                    <Card padding={4}>
                        <VStack gap={4}>
                            <TextArea
                                label="Primary ICP"
                                description="One audience per line"
                                value={draft.icpPrimary}
                                onChange={(v) => setField('icpPrimary', v)}
                                rows={4}
                                width="100%"
                            />
                            <TextArea
                                label="Secondary ICP"
                                description="One audience per line"
                                value={draft.icpSecondary}
                                onChange={(v) => setField('icpSecondary', v)}
                                rows={3}
                                width="100%"
                            />
                            <TextArea
                                label="Do not say"
                                description="One phrase per line — blocked in copy"
                                value={draft.doNotSay}
                                onChange={(v) => setField('doNotSay', v)}
                                rows={5}
                                width="100%"
                            />
                        </VStack>
                    </Card>
                    {(brand.pillars || []).length > 0 && (
                        <VStack gap={3}>
                            <SectionTitle title="Content pillars" />
                            <div className="choice-grid dense">
                                {brand.pillars.map((p) => (
                                    <Card key={p.id} padding={3} variant="muted">
                                        <VStack gap={1}>
                                            <Text weight="semibold">{p.label}</Text>
                                            <Text type="supporting" color="secondary" size="sm" as="p">
                                                {p.description}
                                            </Text>
                                        </VStack>
                                    </Card>
                                ))}
                            </div>
                        </VStack>
                    )}
                </VStack>
            )}
        </VStack>
    );
}

/** Client brand palette is for creatives only — never recolor Glampire OS chrome. */
function applyBrandCss(_brand) {
    /* intentionally empty */
}

/* ───────────────── references: Character Reverse-Engineer + library ───────────────── */

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
}

/** Character Reverse-Engineer — 10Xin feature: image → detailed UGC prompt to generate similar images */
function CharacterReverseEngineer({ onToast, onSaveToLibrary }) {
    const [preview, setPreview] = useState(null);
    const [dataUrl, setDataUrl] = useState(null);
    const [mediaType, setMediaType] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [prompt, setPrompt] = useState(null);
    const [error, setError] = useState(null);
    const [copyLabel, setCopyLabel] = useState('Copy prompt');
    const [meta, setMeta] = useState(null);
    const [drag, setDrag] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    function clearImage() {
        setPreview(null);
        setDataUrl(null);
        setMediaType(null);
        setPrompt(null);
        setError(null);
        setMeta(null);
        if (inputRef.current) inputRef.current.value = '';
    }

    async function handleFile(file) {
        if (!file) return;
        if (!file.type?.startsWith('image/')) {
            onToast?.('Please upload an image (PNG, JPG, or WEBP)');
            return;
        }
        try {
            const url = await fileToDataUrl(file);
            setPreview(url);
            setDataUrl(url);
            setMediaType(file.type || 'image/jpeg');
            setPrompt(null);
            setError(null);
            setMeta(null);
        } catch (e) {
            setError(e.message || 'Failed to read image file');
            onToast?.(e.message);
        }
    }

    async function analyze() {
        if (!dataUrl) {
            setError('Upload a screenshot first.');
            return;
        }
        setAnalyzing(true);
        setError(null);
        setPrompt(null);
        try {
            const result = await api.analyzeCharacter({ dataUrl, mediaType });
            const text = (result?.prompt || '').trim();
            if (!text) {
                throw new Error('No prompt was returned. Try a clearer screenshot.');
            }
            setPrompt(text);
            setMeta({ provider: result.provider, model: result.model });
            onToast?.('Prompt ready — copy and use to generate similar images');
        } catch (e) {
            const msg = e.message || 'Something went wrong analyzing this image.';
            setError(msg);
            onToast?.(msg);
        } finally {
            setAnalyzing(false);
        }
    }

    async function copyPrompt() {
        if (!prompt) return;
        let success = false;
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(prompt);
                success = true;
            } catch {
                success = false;
            }
        }
        if (!success) success = fallbackCopy(prompt);
        setCopyLabel(success ? 'Copied' : 'Select text & copy');
        setTimeout(() => setCopyLabel('Copy prompt'), 1600);
        if (success) onToast?.('Prompt copied');
    }

    return (
        <VStack gap={4}>
            <HStack gap={4} wrap="wrap" vAlign="start" style={{ width: '100%' }}>
                <Card padding={4} style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between">
                            <Heading level={3}>01 · Upload screenshot</Heading>
                            <Badge label="Source" variant="neutral" />
                        </HStack>
                        <div
                            className={`tool-drop${preview ? ' has-image' : ''}${drag ? ' drag' : ''}`}
                            onClick={() => !preview && inputRef.current?.click()}
                            onDragEnter={(e) => {
                                e.preventDefault();
                                setDrag(true);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDrag(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                setDrag(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDrag(false);
                                const file = e.dataTransfer.files?.[0];
                                if (file) handleFile(file);
                            }}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/*"
                                className="sr-only"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                                }}
                            />
                            {preview ? (
                                <>
                                    <img src={preview} alt="Uploaded character screenshot" />
                                    <button
                                        type="button"
                                        className="icon-btn tool-drop-clear"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            clearImage();
                                        }}
                                        title="Remove"
                                    >
                                        <X size={16} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <ImageIcon size={28} />
                                    <Text weight="semibold">Click to upload</Text>
                                    <Text type="supporting" color="secondary" size="sm">
                                        or drag PNG / JPG / WEBP
                                    </Text>
                                </>
                            )}
                        </div>
                        <Button
                            label={analyzing ? 'Analyzing…' : 'Analyze'}
                            icon={
                                analyzing ? (
                                    <Loader2 className="spin" size={16} />
                                ) : (
                                    <WandSparkles size={16} />
                                )
                            }
                            width="100%"
                            isLoading={analyzing}
                            isDisabled={!preview || analyzing}
                            onClick={analyze}
                        />
                    </VStack>
                </Card>

                <Card padding={4} style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                            <Heading level={3}>02 · Generated prompt</Heading>
                            {meta ? (
                                <Badge
                                    label={`${meta.provider} · ${meta.model}`}
                                    variant="neutral"
                                />
                            ) : null}
                        </HStack>
                        <div
                            className={`tool-output${error ? ' is-error' : ''}${prompt ? ' has-content' : ''}`}
                        >
                            {error
                                ? error
                                : prompt ||
                                (analyzing
                                    ? 'Analyzing the image…'
                                    : 'Your reverse-engineered prompt will appear here.')}
                        </div>
                        <HStack gap={2} wrap="wrap">
                            <Button
                                label={copyLabel}
                                icon={<Copy size={14} />}
                                isDisabled={!prompt}
                                onClick={copyPrompt}
                            />
                            <Button
                                label={saving ? 'Saving…' : 'Save to Ref library'}
                                variant="secondary"
                                icon={
                                    saving ? (
                                        <Loader2 className="spin" size={14} />
                                    ) : (
                                        <Bookmark size={14} />
                                    )
                                }
                                isDisabled={!prompt || !dataUrl || saving}
                                isLoading={saving}
                                onClick={async () => {
                                    if (!onSaveToLibrary || !prompt || !dataUrl) return;
                                    setSaving(true);
                                    try {
                                        await onSaveToLibrary(dataUrl, prompt);
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                            />
                        </HStack>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            Copy to generate similar images, or save photo + prompt into Ref library.
                        </Text>
                    </VStack>
                </Card>
            </HStack>
            <HStack gap={2} wrap="wrap">
                <Badge label="Raw iPhone UGC" variant="neutral" />
                <Badge label="Ultra-realistic" variant="neutral" />
                <Badge label="Grok Imagine" variant="neutral" />
                <Badge label="9:16" variant="neutral" />
            </HStack>
        </VStack>
    );
}

function CharacterView({ onToast }) {
    async function saveToLibrary(dataUrl, promptText) {
        try {
            await api.addRef({
                name: 'Character reference',
                role: 'person',
                notes: promptText || '',
                tags: ['ugc', 'reverse-engineer', 'character'],
                dataUrl,
            });
            onToast?.('Saved to Ref library');
        } catch (e) {
            onToast?.(e.message || 'Failed to save to library');
            throw e;
        }
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Character tooling"
                title="Character Reverse-Engineer"
                description="Upload a screenshot of any character. Get back an ultra-realistic, raw-iPhone-style UGC prompt — ready to paste and generate similar images. Optionally save the image + prompt to Ref library."
            />
            <CharacterReverseEngineer onToast={onToast} onSaveToLibrary={saveToLibrary} />
        </VStack>
    );
}

/** Studio image reference library (saved plates + reverse-engineer exports) */
function LibraryView({ onToast }) {
    const [refs, setRefs] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [roleFilter, setRoleFilter] = useState('all');
    const [selected, setSelected] = useState([]);
    const [form, setForm] = useState({
        name: '',
        role: 'person',
        notes: '',
        tags: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.listRefs();
            setRefs(data.refs || []);
            setRoles(data.roles || []);
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        if (roleFilter === 'all') return refs;
        return refs.filter((r) => r.role === roleFilter);
    }, [refs, roleFilter]);

    function toggleSelect(id) {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    async function handleUpload(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                const dataUrl = await fileToDataUrl(file);
                await api.addRef({
                    name: form.name || file.name.replace(/\.[^.]+$/, ''),
                    role: form.role,
                    notes: form.notes,
                    tags: form.tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    dataUrl,
                });
            }
            setForm((f) => ({ ...f, name: '', notes: '', tags: '' }));
            await load();
            onToast?.(`Saved ${files.length} reference${files.length > 1 ? 's' : ''}`);
        } catch (err) {
            onToast?.(err.message);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    }

    async function handleDelete(id) {
        if (!confirm('Remove this reference?')) return;
        try {
            await api.deleteRef(id);
            setSelected((s) => s.filter((x) => x !== id));
            await load();
            onToast?.('Reference removed');
        } catch (e) {
            onToast?.(e.message);
        }
    }

    async function copySnippet() {
        if (!selected.length) {
            onToast?.('Select one or more references first');
            return;
        }
        try {
            const { snippet } = await api.refPromptSnippet(selected);
            await navigator.clipboard?.writeText(snippet);
            onToast?.('Reference prompt snippet copied');
        } catch (e) {
            onToast?.(e.message);
        }
    }

    const roleOptions = roles.length
        ? roles
        : [
            { id: 'person', label: 'Person / talent' },
            { id: 'style', label: 'Style / grade' },
            { id: 'product', label: 'Product / phone UI' },
            { id: 'job_site', label: 'Job site' },
            { id: 'vehicle', label: 'Vehicle / van' },
            { id: 'other', label: 'Other' },
        ];

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Visual truth"
                title="Ref library"
                description="Store character plates, product UI, and style refs. Save from Character RE or upload here."
                actions={
                    <>
                        <Button
                            label="Copy prompt snippet"
                            variant="secondary"
                            icon={<Copy size={14} />}
                            isDisabled={!selected.length}
                            onClick={copySnippet}
                        />
                        <Button
                            label="Refresh"
                            variant="ghost"
                            icon={<RefreshCw size={14} className={loading ? 'spin' : undefined} />}
                            isDisabled={loading}
                            onClick={load}
                        />
                    </>
                }
            />

            <Card padding={4}>
                <VStack gap={4}>
                    <SectionTitle
                        title="Add reference images"
                        description="Contractor / product / style plates for prompts and multi-image edits."
                    />
                    <HStack gap={3} wrap="wrap">
                        <div style={{ flex: '1 1 200px' }}>
                            <TextInput
                                label="Name"
                                value={form.name}
                                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                                placeholder="e.g. Solo GC mid-30s daylight"
                                width="100%"
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <Text type="label" as="p" style={{ marginBottom: 6 }}>
                                Role
                            </Text>
                            <select
                                className="native-select"
                                value={form.role}
                                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                            >
                                {roleOptions.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </HStack>
                    <TextArea
                        label="Notes"
                        value={form.notes}
                        onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                        placeholder="What must carry into generations…"
                        rows={2}
                        width="100%"
                    />
                    <TextInput
                        label="Tags"
                        description="Comma-separated"
                        value={form.tags}
                        onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
                        placeholder="handyman, driveway, natural"
                        width="100%"
                    />
                    <label className="tool-drop" style={{ minHeight: 100 }}>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploading}
                            onChange={handleUpload}
                            className="sr-only"
                        />
                        {uploading ? (
                            <>
                                <Loader2 className="spin" size={18} />
                                <Text>Uploading…</Text>
                            </>
                        ) : (
                            <>
                                <Upload size={18} />
                                <Text weight="semibold">Drop or choose images</Text>
                            </>
                        )}
                    </label>
                </VStack>
            </Card>

            <TabList
                value={roleFilter}
                onChange={setRoleFilter}
                hasDivider
            >
                <Tab value="all" label="All" />
                {roleOptions.slice(0, 6).map((r) => (
                    <Tab key={r.id} value={r.id} label={r.label.split(' / ')[0]} />
                ))}
            </TabList>

            {loading && !refs.length ? (
                <Text color="secondary">Loading library…</Text>
            ) : !filtered.length ? (
                <EmptyState
                    title="No references yet"
                    description="Upload brand truth images or use Character RE → Save to library."
                    icon={<Images size={32} />}
                />
            ) : (
                <div className="ref-grid">
                    {filtered.map((r) => (
                        <article
                            key={r.id}
                            className={`ref-card${selected.includes(r.id) ? ' selected' : ''}`}
                            onClick={() => toggleSelect(r.id)}
                        >
                            <img src={r.url} alt={r.name} loading="lazy" />
                            <div className="ref-card-meta">
                                <div className="tags">
                                    <span className="tag format">{r.role}</span>
                                </div>
                                <Text weight="semibold" size="sm" as="p">
                                    {r.name}
                                </Text>
                                {r.notes ? (
                                    <Text type="supporting" color="secondary" size="xsm" maxLines={2} as="p">
                                        {r.notes}
                                    </Text>
                                ) : null}
                                <HStack gap={2} style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                                    <a className="ghost" href={r.url} target="_blank" rel="noreferrer">
                                        Open
                                    </a>
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title="Delete"
                                        onClick={() => handleDelete(r.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </HStack>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </VStack>
    );
}

/* ───────────────── Script Formula Cloner (Grok) ───────────────── */

const CLONE_STATUS_MSGS = [
    'Reading the original script…',
    'Mapping hook, pacing & structure…',
    'Identifying persuasion patterns…',
    'Drafting the new script…',
    'Finalizing…',
];

function ScriptClonerView({ brand, onToast }) {
    const [original, setOriginal] = useState('');
    const [idea, setIdea] = useState('');
    const [useBrand, setUseBrand] = useState(true);
    const [cloning, setCloning] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState(null);
    const [script, setScript] = useState(null);
    const [meta, setMeta] = useState(null);
    const [copyLabel, setCopyLabel] = useState('Copy script');
    const resultRef = useRef(null);
    const ideaRef = useRef(null);

    const canClone = Boolean(original.trim() && idea.trim());

    useEffect(() => {
        if (!cloning) return undefined;
        let msgIndex = 0;
        setStatus(CLONE_STATUS_MSGS[0]);
        const t = setInterval(() => {
            msgIndex = (msgIndex + 1) % CLONE_STATUS_MSGS.length;
            setStatus(CLONE_STATUS_MSGS[msgIndex]);
        }, 2200);
        return () => clearInterval(t);
    }, [cloning]);

    function brandContext() {
        if (!useBrand || !brand) return '';
        return [
            brand.name && `Brand: ${brand.name}`,
            brand.oneLiner && `One-liner: ${brand.oneLiner}`,
            brand.category && `Category: ${brand.category}`,
            brand.primaryCta && `Primary CTA: ${brand.primaryCta}`,
            brand.icp?.primary?.length && `Primary ICP: ${brand.icp.primary.join('; ')}`,
            brand.doNotSay?.length && `Do not say: ${brand.doNotSay.join('; ')}`,
            'Tone: practical, field-first, honest. Avoid fluffy SaaS jargon.',
        ]
            .filter(Boolean)
            .join('\n');
    }

    async function clone() {
        const o = original.trim();
        const n = idea.trim();
        setError(null);

        if (!o && !n) {
            setError('Step 1: paste the original script. Step 2: describe the new video idea. Then clone.');
            return;
        }
        if (!o) {
            setError('Left box is empty — paste the original winning script first.');
            return;
        }
        if (!n) {
            setError('Right box is empty — describe the NEW video idea (topic / product / angle).');
            ideaRef.current?.focus();
            return;
        }

        setCloning(true);
        setScript(null);
        setMeta(null);
        try {
            const result = await api.cloneScript({
                originalScript: o,
                newIdea: n,
                brandContext: brandContext() || undefined,
            });
            const text = (result?.script || '').trim();
            if (!text) {
                throw new Error('Grok returned an empty script. Try again.');
            }
            setScript(text);
            setMeta({ provider: result.provider, model: result.model });
            onToast?.('New script ready — scroll down to copy');
            // scroll result into view after paint
            requestAnimationFrame(() => {
                resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        } catch (e) {
            const msg = e.message || 'Something went wrong generating the script.';
            setError(msg);
            onToast?.(msg);
        } finally {
            setCloning(false);
            setStatus('');
        }
    }

    async function copyScript() {
        if (!script) return;
        let ok = false;
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(script);
                ok = true;
            } catch {
                ok = false;
            }
        }
        if (!ok) ok = fallbackCopy(script);
        setCopyLabel(ok ? 'Copied!' : 'Select & copy');
        setTimeout(() => setCopyLabel('Copy script'), 1800);
        if (ok) onToast?.('Script copied');
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Scripts · Grok"
                title="Script Formula Cloner"
                description="Both boxes required. Left = winning script (formula). Right = new idea. Grok copies structure & psychology — not a word-swap."
            />

            {error ? (
                <Banner status="error" title="Couldn’t clone" description={error} />
            ) : null}

            <HStack gap={4} wrap="wrap" vAlign="start" style={{ width: '100%' }}>
                <Card padding={4} style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between">
                            <Heading level={3}>1 · Original script</Heading>
                            <Badge label="Source" variant="neutral" />
                        </HStack>
                        <TextArea
                            label="Original script"
                            isLabelHidden
                            value={original}
                            onChange={(v) => {
                                setOriginal(v);
                                if (error) setError(null);
                            }}
                            placeholder="Paste the full original video script / transcript here…"
                            rows={12}
                            width="100%"
                        />
                        <Text type="supporting" color="secondary" size="xsm">
                            {original.trim()
                                ? `${original.length} characters`
                                : 'Required — paste source script'}
                        </Text>
                    </VStack>
                </Card>
                <Card padding={4} style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between">
                            <Heading level={3}>2 · New video idea</Heading>
                            <Badge label="Target" variant="teal" />
                        </HStack>
                        <TextArea
                            label="New video idea"
                            isLabelHidden
                            value={idea}
                            onChange={(v) => {
                                setIdea(v);
                                if (error) setError(null);
                            }}
                            placeholder="What should the NEW script be about? Topic, product, angle, CTA…"
                            rows={12}
                            width="100%"
                        />
                        <Text type="supporting" color="secondary" size="xsm">
                            {idea.trim()
                                ? `${idea.length} characters`
                                : 'Required — describe the new topic / product / angle'}
                        </Text>
                    </VStack>
                </Card>
            </HStack>

            <Card padding={4}>
                <VStack gap={3}>
                    <Switch
                        label="Apply workspace brand guardrails"
                        description="One-liner, ICP, do-not-say, CTA from Brand OS"
                        value={useBrand}
                        onChange={(checked) => setUseBrand(checked)}
                    />
                    <HStack gap={3} wrap="wrap" vAlign="center">
                        <Button
                            label={
                                cloning
                                    ? 'Cloning formula… (10–30s)'
                                    : 'Clone the formula'
                            }
                            icon={
                                cloning ? (
                                    <Loader2 className="spin" size={16} />
                                ) : (
                                    <WandSparkles size={16} />
                                )
                            }
                            isLoading={cloning}
                            isDisabled={cloning || !canClone}
                            onClick={clone}
                        />
                        <Text type="supporting" color="secondary" size="sm">
                            {cloning
                                ? status || 'Working…'
                                : canClone
                                    ? 'Ready — structure from left, fresh copy for the right idea'
                                    : 'Fill both boxes to unlock'}
                        </Text>
                    </HStack>
                </VStack>
            </Card>

            <div ref={resultRef}>
                <Card padding={4}>
                    <VStack gap={3}>
                        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                            <Heading level={3}>
                                3 · New script
                                {meta ? ` · ${meta.provider} · ${meta.model}` : ''}
                            </Heading>
                            <Button
                                label={copyLabel}
                                variant="secondary"
                                icon={<Copy size={14} />}
                                isDisabled={!script}
                                onClick={copyScript}
                            />
                        </HStack>
                        <div
                            className={`tool-output${script ? ' has-content' : ''}${error && !script ? ' is-error' : ''}`}
                        >
                            {cloning
                                ? status || 'Cloning…'
                                : script ||
                                'Your cloned script will appear here after you click Clone the formula.'}
                        </div>
                    </VStack>
                </Card>
            </div>
        </VStack>
    );
}

/* ───────────────── settings / publish modal ───────────────── */

function SettingsView({
    health,
    workspace,
    workspaces,
    publishUser,
    themeMode,
    onThemeMode,
}) {
    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Glampire OS"
                title="Settings"
                description="Shared product chrome. Workspaces hold Brand OS + publish profile. API keys stay in .env on the server."
            />
            <div className="choice-grid">
                <Card padding={4}>
                    <VStack gap={2}>
                        <Heading level={3}>Active workspace</Heading>
                        <Text weight="semibold">
                            {workspace?.name || '—'}
                            {workspace?.id ? ` · ${workspace.id}` : ''}
                        </Text>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            {workspace?.oneLiner || workspace?.category || 'No one-liner set'}
                        </Text>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            Upload-Post user: {publishUser || '—'}
                        </Text>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            {(workspaces || []).length} workspace
                            {(workspaces || []).length === 1 ? '' : 's'} — switch from the sidebar menu.
                        </Text>
                    </VStack>
                </Card>
                <Card padding={4}>
                    <VStack gap={3}>
                        <Heading level={3}>Appearance</Heading>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            Same UI for every client. Light / dark / system.
                        </Text>
                        <SegmentedControl
                            label="Theme mode"
                            value={themeMode || 'system'}
                            onChange={onThemeMode}
                            size="md"
                            layout="fill"
                        >
                            <SegmentedControlItem value="light" label="Light" />
                            <SegmentedControlItem value="dark" label="Dark" />
                            <SegmentedControlItem value="system" label="System" />
                        </SegmentedControl>
                    </VStack>
                </Card>
                <Card padding={4}>
                    <VStack gap={2}>
                        <HStack gap={2} vAlign="center">
                            <StatusDot
                                variant="neutral"
                                label={health?.grok ? 'Grok connected' : 'Grok missing'}
                            />
                            <Heading level={3}>Grok (xAI)</Heading>
                        </HStack>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            {health?.grok
                                ? `Connected · vision ${health?.visionProvider || 'ready'}`
                                : 'Missing XAI_API_KEY'}
                        </Text>
                    </VStack>
                </Card>
                <Card padding={4}>
                    <VStack gap={2}>
                        <HStack gap={2} vAlign="center">
                            <StatusDot
                                variant="neutral"
                                label="Upload-Post"
                            />
                            <Heading level={3}>Upload-Post</Heading>
                        </HStack>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            {health?.uploadPost
                                ? `Connected · profile ${publishUser || '—'}`
                                : 'Missing UPLOAD_POST_API_KEY'}
                        </Text>
                    </VStack>
                </Card>
                <Card padding={4}>
                    <VStack gap={2}>
                        <HStack gap={2} vAlign="center">
                            <StatusDot
                                variant="neutral"
                                label="fal"
                            />
                            <Heading level={3}>fal.ai</Heading>
                        </HStack>
                        <Text type="supporting" color="secondary" size="sm" as="p">
                            {health?.fal
                                ? 'Connected (Kling / Seedance / MiniMax)'
                                : 'Optional FAL_KEY for premium models'}
                        </Text>
                    </VStack>
                </Card>
            </div>
        </VStack>
    );
}

const UPLOAD_PLATFORMS = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X (Twitter)' },
    { id: 'threads', label: 'Threads' },
    { id: 'youtube', label: 'YouTube' },
];

function PublishModal({ item, profiles, defaultUser, onClose, onConfirm, loading }) {
    const profileNames = useMemo(() => {
        const list = (profiles || [])
            .map((p) => p.username || p.name || p.user)
            .filter(Boolean);
        if (defaultUser && !list.includes(defaultUser)) list.unshift(defaultUser);
        if (!list.length) list.push(defaultUser || 'TASKIZ');
        return list;
    }, [profiles, defaultUser]);

    const [user, setUser] = useState(defaultUser || profileNames[0] || 'TASKIZ');
    const [selected, setSelected] = useState(() => {
        // Prefer platforms already connected on the profile when available
        const profile = (profiles || []).find(
            (p) => (p.username || p.name) === (defaultUser || 'TASKIZ')
        );
        const connected = Object.entries(profile?.social_accounts || {})
            .filter(([, v]) => v !== '' && v != null)
            .map(([k]) => k);
        if (connected.length) return connected;
        // Reels → video platforms; stills → photo platforms
        if (item?.format === 'reel' || item?.videoUrl) return ['instagram', 'tiktok'];
        return ['instagram'];
    });
    const [scheduleMode, setScheduleMode] = useState('now'); // now | queue
    const [facebookPageId, setFacebookPageId] = useState('');

    const resolvedVideo = useMemo(() => {
        if (!item) return null;
        const candidates = [
            item.composedVideoUrl,
            item.finalVideoUrl,
            item.videoUrl,
            ...(item.beats || []).map((b) => b.videoUrl),
        ].filter(Boolean);
        // Upload-Post needs a public https URL (local /api/renders won't work remotely)
        return candidates.find((u) => /^https?:\/\//i.test(u)) || null;
    }, [item]);

    const mediaUrls = useMemo(() => {
        if (!item) return [];
        if (resolvedVideo) return [resolvedVideo];
        if (item.format === 'carousel') {
            return (item.slides || []).map((s) => s.imageUrl).filter(Boolean);
        }
        return item.imageUrl ? [item.imageUrl] : [];
    }, [item, resolvedVideo]);

    function togglePlatform(id) {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    if (!item) return null;

    const isVideo = Boolean(resolvedVideo) || item.format === 'reel';
    const canPublish = selected.length > 0 && mediaUrls.length > 0 && user;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Publish via Upload-Post</h2>
                <p className="muted">
                    {item.headline} · {isVideo ? 'Video / Reel' : item.formatLabel}
                </p>

                <label>Upload-Post profile</label>
                <select value={user} onChange={(e) => setUser(e.target.value)}>
                    {profileNames.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>

                <label>Platforms</label>
                <div className="platform-grid">
                    {UPLOAD_PLATFORMS.map((p) => (
                        <label key={p.id} className="platform-check">
                            <input
                                type="checkbox"
                                checked={selected.includes(p.id)}
                                onChange={() => togglePlatform(p.id)}
                            />
                            {p.label}
                        </label>
                    ))}
                </div>

                {selected.includes('facebook') && (
                    <>
                        <label>Facebook Page ID (if multiple pages)</label>
                        <input
                            value={facebookPageId}
                            onChange={(e) => setFacebookPageId(e.target.value)}
                            placeholder="Optional if only one page connected"
                        />
                    </>
                )}

                <label>When</label>
                <div className="filters" style={{ marginBottom: 0 }}>
                    <button
                        type="button"
                        className={scheduleMode === 'now' ? 'active' : ''}
                        onClick={() => setScheduleMode('now')}
                    >
                        Publish now
                    </button>
                    <button
                        type="button"
                        className={scheduleMode === 'queue' ? 'active' : ''}
                        onClick={() => setScheduleMode('queue')}
                    >
                        Add to queue
                    </button>
                </div>

                <label>Caption</label>
                <textarea readOnly value={item.caption || ''} rows={4} />

                <label>Media ({mediaUrls.length})</label>
                <ul className="media-urls">
                    {mediaUrls.map((u) => (
                        <li key={u}>
                            <a href={u} target="_blank" rel="noreferrer">
                                {u.slice(0, 72)}…
                            </a>
                        </li>
                    ))}
                </ul>

                <div className="modal-actions">
                    <button className="ghost" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="primary"
                        disabled={loading || !canPublish}
                        onClick={() =>
                            onConfirm({
                                format: item.format,
                                user,
                                platforms: selected,
                                caption: item.caption,
                                headline: item.headline,
                                mediaUrls: resolvedVideo ? [] : mediaUrls,
                                videoUrl: resolvedVideo || null,
                                addToQueue: scheduleMode === 'queue',
                                facebookPageId: facebookPageId || undefined,
                            })
                        }
                    >
                        {loading ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                        {scheduleMode === 'queue' ? 'Queue post' : 'Publish now'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ───────────────── toast ───────────────── */

function Toast({ message, onDone }) {
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(onDone, 2800);
        return () => clearTimeout(t);
    }, [message, onDone]);
    if (!message) return null;
    return (
        <div className="toast">
            <Check size={16} /> {message}
        </div>
    );
}

/* ───────────────── app ───────────────── */

function App() {
    const [view, setView] = useState('create');
    const [health, setHealth] = useState(null);
    const [brand, setBrand] = useState(null);
    const [packs, setPacks] = useState([]);
    const [styles, setStyles] = useState([]);
    const [flows, setFlows] = useState([]);
    const [videoModels, setVideoModels] = useState([]);

    const [store, setStore] = useState(() => loadStore());
    const [loadingBatch, setLoadingBatch] = useState(false);
    const [busy, setBusy] = useState(null);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [filter, setFilter] = useState('all');
    const [selectedId, setSelectedId] = useState(null);
    const [toast, setToast] = useState('');
    const [publishItem, setPublishItem] = useState(null);
    const [profiles, setProfiles] = useState([]);
    const [publishing, setPublishing] = useState(false);
    const [workspaces, setWorkspaces] = useState([]);
    const [activeWorkspace, setActiveWorkspace] = useState(null);
    const [publishUser, setPublishUser] = useState('TASKIZ');
    const [themeMode, setThemeMode] = useState(() => loadThemeMode());
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [onboardingMode, setOnboardingMode] = useState('resume'); // create | resume
    const [bootstrapped, setBootstrapped] = useState(false);

    const updateStore = useCallback((patch) => {
        setStore((prev) => {
            const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
            saveStore(next);
            return next;
        });
    }, []);

    const loadWorkspaceData = useCallback(async () => {
        const [healthRes, brandRes, packsRes, stylesRes, flowsRes, modelsRes, pubRes] =
            await Promise.all([
                api.health().catch(() => ({ ok: false, grok: false, uploadPost: false })),
                api.brand().catch(() => null),
                api.packs().catch(() => ({ packs: [] })),
                api.styles().catch(() => ({ styles: [] })),
                api.flows().catch(() => ({ flows: [] })),
                api.videoModels().catch(() => ({ models: [] })),
                api.publishConfig().catch(() => ({ publish: {} })),
            ]);
        setHealth(healthRes);
        if (brandRes) setBrand(brandRes);
        setPacks(packsRes.packs || []);
        setStyles(stylesRes.styles || []);
        setFlows(flowsRes.flows || []);
        setVideoModels(modelsRes.models || []);
        setPublishUser(pubRes?.publish?.uploadPostUser || brandRes?.name?.toUpperCase() || 'TASKIZ');
        // Load queue, then re-attach any finished finals missing from the UI (e.g. after Bad Gateway)
        const local = loadStore();
        try {
            const renderIndex = await api.listRenders().catch(() => null);
            const finals = renderIndex?.finals || {};
            if (Object.keys(finals).length && Array.isArray(local.items)) {
                let changed = false;
                const nextItems = local.items.map((item) => {
                    const hit = finals[item.id];
                    if (!hit?.finalVideoUrl) return item;
                    // Attach / refresh completed video even if card is stuck on Error
                    const needs =
                        item.status === 'error' ||
                        item.status === 'generating' ||
                        !item.composedVideoUrl ||
                        !item.finalVideoUrl ||
                        item.composedVideoUrl !== hit.finalVideoUrl;
                    if (!needs) return item;
                    changed = true;
                    return {
                        ...item,
                        composedVideoUrl: hit.finalVideoUrl,
                        finalVideoUrl: hit.finalVideoUrl,
                        status: 'ready',
                        error: null,
                        graphicsEngine: item.graphicsEngine || 'caption_track+overlay',
                    };
                });
                if (changed) {
                    const next = { ...local, items: nextItems };
                    saveStore(next);
                    setStore(next);
                    setToast('Updated queue with completed story videos');
                } else {
                    setStore(local);
                }
            } else {
                setStore(local);
            }
        } catch {
            setStore(local);
        }
        setSelectedId(null);
        setFilter('all');
    }, []);

    useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            try {
                const wsData = await api.workspaces();
                if (cancelled) return;
                const list = wsData.workspaces || [];
                setWorkspaces(list);
                let activeId = getWorkspaceId() || wsData.activeId || list[0]?.id;
                if (activeId && list.some((w) => w.id === activeId)) {
                    setWorkspaceId(activeId);
                    try {
                        await api.setActiveWorkspace(activeId);
                    } catch {
                        /* ignore */
                    }
                } else if (list[0]) {
                    activeId = list[0].id;
                    setWorkspaceId(activeId);
                }
                const active = list.find((w) => w.id === activeId) || list[0] || null;
                setActiveWorkspace(active);
                await loadWorkspaceData();
            } catch (e) {
                console.error('[Glampire OS] bootstrap', e);
                setToast(
                    e.message?.includes('unreachable')
                        ? 'API offline — start with npm run dev (needs :8787). UI still opens.'
                        : e.message || 'Bootstrap failed'
                );
                try {
                    await loadWorkspaceData();
                } catch {
                    /* ignore */
                }
            } finally {
                if (!cancelled) setBootstrapped(true);
            }
        };
        // Don't hang forever if API is wedged
        const timer = setTimeout(() => {
            if (!cancelled) setBootstrapped(true);
        }, 8000);
        boot().finally(() => clearTimeout(timer));
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [loadWorkspaceData]);

    function handleThemeMode(mode) {
        setThemeMode(mode);
        saveThemeMode(mode);
    }

    async function handleSwitchWorkspace(id) {
        if (!id || id === getWorkspaceId()) return;
        try {
            setWorkspaceId(id);
            const res = await api.setActiveWorkspace(id);
            const ws = res.workspace || workspaces.find((w) => w.id === id);
            setActiveWorkspace(ws);
            const wsData = await api.workspaces();
            setWorkspaces(wsData.workspaces || []);
            await loadWorkspaceData();
            setView('create');
            setToast(`Switched to ${ws?.name || id}`);
            if (ws?.needsOnboarding) {
                setOnboardingMode('resume');
                setOnboardingOpen(true);
            }
        } catch (e) {
            setToast(e.message);
        }
    }

    function handleStartCreateWorkspace() {
        setOnboardingMode('create');
        setOnboardingOpen(true);
    }

    function handleOpenOnboarding() {
        setOnboardingMode('resume');
        setOnboardingOpen(true);
    }

    async function handleOnboardingComplete(result) {
        try {
            const id = result?.workspace?.id || getWorkspaceId();
            if (id) setWorkspaceId(id);
            setActiveWorkspace(result?.workspace || null);
            const wsData = await api.workspaces();
            setWorkspaces(wsData.workspaces || []);
            if (result?.workspace) setActiveWorkspace(result.workspace);
            await loadWorkspaceData();
            setOnboardingOpen(false);
            setView('create');
            setToast(
                `Brand OS locked for ${result?.workspace?.name || 'client'} — ready to generate`
            );
        } catch (e) {
            setToast(e.message);
            setOnboardingOpen(false);
        }
    }

    async function handleOnboardingClose() {
        setOnboardingOpen(false);
        try {
            const wsData = await api.workspaces();
            setWorkspaces(wsData.workspaces || []);
            const activeId = getWorkspaceId() || wsData.activeId;
            const active = (wsData.workspaces || []).find((w) => w.id === activeId);
            if (active) setActiveWorkspace(active);
            await loadWorkspaceData();
        } catch {
            /* ignore */
        }
    }

    const counts = useMemo(() => {
        const items = store.items || [];
        return {
            total: items.length,
            approved: items.filter((i) => i.status === 'approved' || i.status === 'published').length,
        };
    }, [store.items]);

    function mergeBatchIntoStore(batch, options = {}) {
        const newItems = batch.items || [];
        const newIds = new Set(newItems.map((i) => i.id));
        let keptCount = 0;
        updateStore((prev) => {
            const kept = (prev.items || []).filter(
                (i) => isKeptCreative(i) && !newIds.has(i.id)
            );
            keptCount = kept.length;
            return {
                ...prev,
                items: [...newItems, ...kept],
                packId: batch.packId,
                packLabel: batch.packLabel,
                generatedAt: batch.generatedAt,
                styleId: batch.styleId,
                flowId: batch.flowId,
                videoModelId: batch.videoModelId,
                batchBrief: batch.batchBrief || options.batchBrief || options.prompt || null,
                batchMode: batch.batchMode || options.batchMode || 'auto',
                aspectRatio: batch.aspectRatio || options.aspectRatio || null,
            };
        });
        return { newItems, keptCount };
    }

    async function handleGenerateBatch(packId, options = {}) {
        setLoadingBatch(true);
        try {
            const batch = await api.batch(packId, options);
            const { newItems, keptCount } = mergeBatchIntoStore(batch, options);
            setView('queue');
            const briefNote = batch.batchBrief ? ' · brief on' : '';
            const keptNote = keptCount ? ` · kept ${keptCount} approved` : '';
            setToast(
                `${newItems.length} new ideas · ${batch.videoModelId || 'grok'}${briefNote}${keptNote}`
            );
        } catch (e) {
            setToast(e.message);
        } finally {
            setLoadingBatch(false);
        }
    }

    /** Images mode: build varied still prompts, then generate pixels immediately. */
    async function handleGenerateImages(options = {}) {
        setLoadingBatch(true);
        try {
            const batch = await api.imageBatch({
                prompt: options.prompt,
                aspectRatio: options.aspectRatio || '1:1',
                count: options.count || 6,
                diversify: options.diversify !== false,
                moodId: options.moodId || 'auto',
            });
            const { newItems, keptCount } = mergeBatchIntoStore(batch, {
                ...options,
                batchMode: 'images',
            });
            setView('queue');
            const keptNote = keptCount ? ` · kept ${keptCount} approved` : '';
            setToast(
                `${newItems.length} stills queued · ${batch.aspectRatio}${batch.diversify ? ' · auto-vary' : ''}${keptNote}`
            );

            if (options.generateNow !== false) {
                setLoadingBatch(false);
                setGeneratingAll(true);
                for (const item of newItems) {
                    await handleGenerateImage(item);
                }
                setGeneratingAll(false);
                setToast(
                    `${newItems.length} images ready · download from queue${keptNote}`
                );
            }
        } catch (e) {
            setToast(e.message);
            setGeneratingAll(false);
        } finally {
            setLoadingBatch(false);
        }
    }

    /**
     * Ads mode: brand-locked copy + plate stills + SVG compose (logo/type/CTA).
     */
    async function handleGenerateAds(options = {}) {
        setLoadingBatch(true);
        try {
            const batch = await api.adBatch({
                prompt: options.prompt,
                aspectRatio: options.aspectRatio || '3:4',
                count: options.count || 6,
                diversify: options.diversify !== false,
                moodId: options.moodId || 'auto',
                templateId: options.templateId || 'auto',
                angleId: options.angleId || 'auto',
                objectiveId: options.objectiveId || 'conversion',
            });
            const { newItems, keptCount } = mergeBatchIntoStore(batch, {
                ...options,
                batchMode: 'ads',
            });
            setView('queue');
            const keptNote = keptCount ? ` · kept ${keptCount} approved` : '';
            setToast(
                `${newItems.length} ads queued · ${batch.aspectRatio} · composing…${keptNote}`
            );

            if (options.generateNow !== false) {
                setLoadingBatch(false);
                setGeneratingAll(true);
                for (const item of newItems) {
                    await handleGenerateImage(item);
                }
                setGeneratingAll(false);
                setToast(
                    `${newItems.length} ads processed · download finished ads from queue${keptNote}`
                );
            }
        } catch (e) {
            setToast(e.message);
            setGeneratingAll(false);
        } finally {
            setLoadingBatch(false);
        }
    }

    function patchItem(id, patch) {
        updateStore((prev) => ({
            ...prev,
            items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        }));
    }

    async function handleGenerateImage(item) {
        setBusy(item.id);
        patchItem(item.id, { status: 'generating', error: null });
        try {
            if (item.format === 'carousel') {
                const result = await api.generateCarousel({
                    slides: item.slides.map((s) => ({
                        id: s.id,
                        imagePrompt: s.imagePrompt,
                    })),
                    format: 'carousel',
                });
                const byId = Object.fromEntries(result.slides.map((s) => [s.id, s]));
                const slides = item.slides.map((s) => ({
                    ...s,
                    imageUrl: byId[s.id]?.imageUrl || s.imageUrl,
                    error: byId[s.id]?.error,
                }));
                const allOk = slides.every((s) => s.imageUrl);
                const first = slides.find((s) => s.imageUrl)?.imageUrl || null;
                patchItem(item.id, {
                    slides,
                    imageUrl: first,
                    status: allOk ? 'ready' : 'error',
                    error: allOk ? null : 'Some carousel slides failed',
                });
                setToast(allOk ? 'Carousel stills ready' : 'Carousel partially failed');
            } else if (item.format === 'reel' && item.beats?.length) {
                // Multi-beat stills
                const beats = [];
                for (const beat of item.beats) {
                    setToast(`Still for ${beat.label || beat.role}…`);
                    const result = await api.generateImage({
                        prompt: beat.imagePrompt || item.imagePrompt,
                        format: 'reel',
                        aspectRatio: '9:16',
                    });
                    beats.push({
                        ...beat,
                        imageUrl: result.imageUrl,
                        status: 'ready',
                        error: null,
                    });
                }
                patchItem(item.id, {
                    beats,
                    imageUrl: beats[0]?.imageUrl || null,
                    status: 'ready',
                    error: null,
                });
                setToast(`${beats.length} beat stills ready`);
            } else {
                const isAd = item.kind === 'ad_batch' || item.batchMode === 'ads';
                const useRef =
                    item.matchReference &&
                    (item.referenceImage || item.referenceDataUrl);
                const result = await api.generateImage({
                    prompt: useRef
                        ? item.matchPrompt || item.imagePrompt
                        : item.imagePrompt,
                    format: item.format,
                    aspectRatio: item.aspectRatio,
                    matchReference: Boolean(useRef),
                    referenceImage: useRef
                        ? item.referenceImage || item.referenceDataUrl
                        : undefined,
                });
                const plateUrl = result.imageUrl;

                if (isAd && plateUrl) {
                    setToast('Composing brand ad…');
                    try {
                        const composed = await api.composeAd({
                            id: item.id,
                            plateUrl,
                            aspectRatio: item.aspectRatio || '3:4',
                            templateId: item.templateId || 'hero',
                            headline: item.headline,
                            shortHeadline: item.shortHeadline,
                            support: item.support || item.body,
                            body: item.body,
                            cta: item.cta,
                        });
                        patchItem(item.id, {
                            plateUrl,
                            adUrl: composed.adUrl,
                            imageUrl: composed.adUrl,
                            status: 'ready',
                            error: null,
                            genMode: result.mode || 'generate',
                            templateId: composed.templateId || item.templateId,
                        });
                        setToast('Ad ready · logo + type composed');
                    } catch (composeErr) {
                        // Plate still usable if compose fails
                        patchItem(item.id, {
                            plateUrl,
                            imageUrl: plateUrl,
                            status: 'ready',
                            error: `Compose failed: ${composeErr.message}`,
                            genMode: result.mode || 'generate',
                        });
                        setToast(`Plate ready · compose failed: ${composeErr.message}`);
                    }
                } else {
                    patchItem(item.id, {
                        imageUrl: plateUrl,
                        status: 'ready',
                        error: null,
                        genMode: result.mode || (useRef ? 'edit' : 'generate'),
                    });
                    setToast(
                        useRef
                            ? 'Similar still ready (reference-locked)'
                            : 'Still generated'
                    );
                }
            }
        } catch (e) {
            patchItem(item.id, { status: 'error', error: e.message });
            setToast(e.message);
        } finally {
            setBusy(null);
        }
    }

    async function handleAnimate(item) {
        setBusy(item.id);
        patchItem(item.id, { status: 'generating', error: null });
        try {
            if (item.beats?.length) {
                const beats = [];
                for (const beat of item.beats) {
                    if (!beat.imageUrl) {
                        throw new Error(`Beat "${beat.label || beat.role}" needs a still first`);
                    }
                    if (beat.videoUrl) {
                        beats.push(beat);
                        continue;
                    }
                    setToast(
                        `Animating ${beat.label || beat.role} · ${item.videoModelLabel || item.videoModelId || 'grok'}…`
                    );
                    const started = await api.startVideo({
                        prompt: beat.videoPrompt || item.videoPrompt,
                        imageUrl: beat.imageUrl,
                        format: 'reel',
                        duration: beat.durationSec || 5,
                        modelId: item.videoModelId || 'grok',
                        deliveryMode: item.deliveryMode || 'caption_talk',
                        generateAudio: item.generateAudio === true,
                        dialogue:
                            beat.dialogue || beat.voiceLine || beat.spokenCaption || null,
                    });
                    const done = await waitForVideo(started.requestId, { timeoutMs: 360000 });
                    beats.push({
                        ...beat,
                        videoUrl: done.url,
                        status: 'ready',
                        videoModelId: started.modelId || item.videoModelId,
                    });
                }
                patchItem(item.id, {
                    beats,
                    videoUrl: beats[0]?.videoUrl || null,
                    status: 'ready',
                    error: null,
                });
                setToast('All beats animated — assemble story next');
            } else {
                if (!item.imageUrl) {
                    setToast('Generate a still first');
                    setBusy(null);
                    return;
                }
                const started = await api.startVideo({
                    prompt: item.videoPrompt,
                    imageUrl: item.imageUrl,
                    format: 'reel',
                    duration: 6,
                    modelId: item.videoModelId || 'grok',
                    deliveryMode: item.deliveryMode || 'caption_talk',
                    generateAudio: item.generateAudio === true,
                    dialogue:
                        item.dialogueHook ||
                        item.beats?.[0]?.dialogue ||
                        item.beats?.[0]?.voiceLine ||
                        null,
                });
                setToast(
                    `Animating with ${started.modelLabel || item.videoModelLabel || 'Grok'}…`
                );
                const done = await waitForVideo(started.requestId, { timeoutMs: 360000 });
                patchItem(item.id, {
                    videoUrl: done.url,
                    status: 'ready',
                    error: null,
                    videoModelId: started.modelId || item.videoModelId,
                });
                setToast('Reel ready');
            }
        } catch (e) {
            patchItem(item.id, { status: 'error', error: e.message });
            setToast(e.message);
        } finally {
            setBusy(null);
        }
    }

    /**
     * Full story pipeline: stills (if needed) → animate beats → stitch + titles.
     */
    async function handleBuildStory(item) {
        setBusy(item.id);
        patchItem(item.id, { status: 'generating', error: null });
        try {
            let current = { ...item, beats: (item.beats || []).map((b) => ({ ...b })) };
            if (!current.beats?.length) {
                throw new Error('This reel has no story beats — regenerate with a story flow');
            }

            // 1. Stills
            for (let i = 0; i < current.beats.length; i++) {
                const beat = current.beats[i];
                if (beat.imageUrl) continue;
                setToast(`Beat ${i + 1}/${current.beats.length}: still…`);
                const result = await api.generateImage({
                    prompt: beat.imagePrompt || current.imagePrompt,
                    format: 'reel',
                    aspectRatio: '9:16',
                });
                current.beats[i] = { ...beat, imageUrl: result.imageUrl, status: 'ready' };
                patchItem(item.id, {
                    beats: [...current.beats],
                    imageUrl: current.beats[0]?.imageUrl,
                });
            }

            // 2. Animate
            for (let i = 0; i < current.beats.length; i++) {
                const beat = current.beats[i];
                if (beat.videoUrl) continue;
                setToast(
                    `Beat ${i + 1}/${current.beats.length}: animate (${current.videoModelLabel || current.videoModelId || 'grok'})…`
                );
                const spoken =
                    beat.dialogue || beat.voiceLine || beat.spokenCaption || null;
                const started = await api.startVideo({
                    prompt: beat.videoPrompt || current.videoPrompt,
                    imageUrl: beat.imageUrl,
                    format: 'reel',
                    duration: beat.durationSec || 5,
                    modelId: current.videoModelId || 'grok',
                    deliveryMode: current.deliveryMode || 'caption_talk',
                    // Kling paid audio only when explicitly on; Grok speech via dialogue
                    generateAudio: current.generateAudio === true,
                    dialogue: spoken,
                });
                const done = await waitForVideo(started.requestId, { timeoutMs: 360000 });
                current.beats[i] = {
                    ...beat,
                    videoUrl: done.url,
                    status: 'ready',
                    videoModelId: started.modelId || current.videoModelId,
                };
                patchItem(item.id, {
                    beats: [...current.beats],
                    videoUrl: current.beats[0]?.videoUrl,
                });
            }

            // 3. Assemble: Whisper ASR captions (spoken) + organic chrome by default
            const chrome = current.brandChrome || 'organic';
            setToast('Assembling · Whisper captions from spoken audio…');
            const assembled = await api.assembleStory({
                item: {
                    ...current,
                    useAsrCaptions: current.useAsrCaptions !== false,
                    brandChrome: chrome,
                },
                burnTitles: true,
                brandChrome: chrome,
                useAsrCaptions: current.useAsrCaptions !== false,
            });
            patchItem(item.id, {
                beats: current.beats,
                imageUrl: current.beats[0]?.imageUrl,
                videoUrl: current.beats[0]?.videoUrl,
                composedVideoUrl: assembled.videoUrl,
                finalVideoUrl: assembled.videoUrl,
                graphicsEngine: assembled.graphicsEngine,
                brandChrome: assembled.brandChrome || chrome,
                hasVoice: assembled.hasVoice,
                storyLines: assembled.storyLines,
                asrMeta: assembled.asrMeta || null,
                spokenCaptions: assembled.spokenCaptions || null,
                hyperframes: assembled.hyperframes,
                status: 'ready',
                error: null,
            });
            const asrNote = assembled.asrMeta?.ok
                ? ` · ASR ${assembled.asrMeta.wordCount || 0} words`
                : assembled.asrMeta?.reason
                  ? ` · captions fallback (${assembled.asrMeta.reason})`
                  : '';
            const chromeNote =
                assembled.brandChrome === 'ads_endcard'
                    ? ' · end card'
                    : assembled.brandChrome === 'ads_full'
                      ? ' · full brand'
                      : ' · organic';
            setToast(
                assembled.titleWarning
                    ? `Story stitched (${assembled.beatCount} beats) — graphics fallback: ${assembled.graphicsEngine || 'stitch'}`
                    : `Story ready · ${assembled.graphicsEngine || 'assembled'}${chromeNote}${asrNote} · ${assembled.beatCount} beats`
            );
        } catch (e) {
            patchItem(item.id, { status: 'error', error: e.message });
            setToast(e.message);
        } finally {
            setBusy(null);
        }
    }

    async function handleGenerateAll() {
        setGeneratingAll(true);
        const list = store.items.filter(
            (i) =>
                !i.imageUrl ||
                (i.format === 'carousel' && i.slides?.some((s) => !s.imageUrl))
        );
        for (const item of list) {
            await handleGenerateImage(item);
        }
        setGeneratingAll(false);
        setToast('Batch stills finished');
    }

    function handleApprove(item) {
        patchItem(item.id, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
        });
        setToast('Approved');
    }

    function handleUnapprove(item) {
        patchItem(item.id, {
            status: item.imageUrl || item.videoUrl || item.composedVideoUrl ? 'ready' : 'idea',
            approvedAt: null,
        });
    }

    async function handleDownload(item) {
        const url = mediaDownloadUrl(item);
        if (!url) {
            setToast('No media ready to download yet');
            return;
        }
        const name = mediaDownloadName(item, url);
        try {
            setToast(`Downloading ${name}…`);
            await downloadMedia(url, name);
            setToast(`Downloaded ${name}`);
        } catch (e) {
            setToast(e.message || 'Download failed');
        }
    }

    function handleRemove(id) {
        updateStore((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i.id !== id),
        }));
        if (selectedId === id) setSelectedId(null);
    }

    function handleChangeVideoModel(item, modelId) {
        const meta = videoModels.find((m) => m.id === modelId);
        patchItem(item.id, {
            videoModelId: modelId,
            videoModelLabel: meta?.label || modelId,
            videoProvider: meta?.provider || null,
            // clear composed so rebuild uses new engine
            composedVideoUrl: null,
            finalVideoUrl: null,
            graphicsEngine: null,
        });
        setToast(`Video model → ${meta?.label || modelId}`);
    }

    async function openPublish(item) {
        setPublishItem(item);
        try {
            const data = await api.uploadPostProfiles();
            const list = data.profiles || [];
            setProfiles(Array.isArray(list) ? list : []);
        } catch (e) {
            setProfiles([{ username: publishUser || 'TASKIZ' }]);
            setToast(e.message);
        }
    }

    async function confirmPublish(payload) {
        setPublishing(true);
        try {
            const result = await api.publish(payload);
            const requestId =
                result?.data?.request_id ||
                result?.data?.requestId ||
                result?.data?.job_id ||
                null;
            patchItem(publishItem.id, {
                status: 'published',
                publishedAt: new Date().toISOString(),
                uploadPostRequestId: requestId,
                uploadPostResult: result?.data || null,
            });
            setPublishItem(null);
            setToast(payload.addToQueue ? 'Queued via Upload-Post' : 'Published via Upload-Post');
        } catch (e) {
            setToast(e.message);
        } finally {
            setPublishing(false);
        }
    }

    const queueItems =
        view === 'approved'
            ? store.items.filter((i) => i.status === 'approved' || i.status === 'published')
            : store.items;

    const sideNav = (
        <StudioSideNav
            view={view}
            setView={setView}
            counts={counts}
            health={health}
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSwitchWorkspace={handleSwitchWorkspace}
            onCreateWorkspace={handleStartCreateWorkspace}
            onOpenOnboarding={handleOpenOnboarding}
            themeMode={themeMode}
            onThemeMode={handleThemeMode}
        />
    );

    return (
        <Theme theme={glampireTheme} mode={themeMode}>
            <div className="studio-root">
                <AppShell
                    height="fill"
                    variant="elevated"
                    contentPadding={0}
                    sideNav={sideNav}
                    mobileNav={{ content: sideNav, breakpoint: 'md' }}
                >
                    <div
                        className={`studio-main${view === 'create' ? ' studio-main--create' : ''}`}
                    >
                        {!bootstrapped ? (
                            <VStack gap={2} padding={4} hAlign="center">
                                <Loader2 className="spin" size={24} />
                                <Text color="secondary">Loading Glampire OS…</Text>
                            </VStack>
                        ) : (
                            <>
                                {activeWorkspace?.needsOnboarding ? (
                                    <VStack gap={3} style={{ marginBottom: 16 }}>
                                        <Banner
                                            status="warning"
                                            title="Brand OS onboarding incomplete"
                                            description={`${activeWorkspace.name || 'This workspace'} is still in ${activeWorkspace.status || 'draft'}. Finish the wizard so packs use a locked client brain — not generic defaults.`}
                                            endContent={
                                                <Button
                                                    label="Continue onboarding"
                                                    variant="primary"
                                                    size="sm"
                                                    icon={<WandSparkles size={14} />}
                                                    onClick={handleOpenOnboarding}
                                                />
                                            }
                                        />
                                    </VStack>
                                ) : null}
                                {view === 'create' && (
                                    <CreateView
                                        packs={packs}
                                        styles={styles}
                                        flows={flows}
                                        videoModels={videoModels}
                                        brand={brand}
                                        onGenerate={handleGenerateBatch}
                                        onGenerateImages={handleGenerateImages}
                                        onGenerateAds={handleGenerateAds}
                                        loading={loadingBatch || generatingAll}
                                        health={health}
                                        workspace={activeWorkspace}
                                    />
                                )}
                                {(view === 'queue' || view === 'approved') && (
                                    <QueueView
                                        items={queueItems}
                                        packLabel={
                                            view === 'approved'
                                                ? 'Approved creatives'
                                                : store.packLabel
                                        }
                                        filter={filter}
                                        setFilter={setFilter}
                                        selectedId={selectedId}
                                        setSelectedId={setSelectedId}
                                        onGenerateImage={handleGenerateImage}
                                        onAnimate={handleAnimate}
                                        onBuildStory={handleBuildStory}
                                        onApprove={handleApprove}
                                        onUnapprove={handleUnapprove}
                                        onPublish={openPublish}
                                        onDownload={handleDownload}
                                        onRemove={handleRemove}
                                        onGenerateAll={handleGenerateAll}
                                        onChangeVideoModel={handleChangeVideoModel}
                                        videoModels={videoModels}
                                        busy={busy}
                                        generatingAll={generatingAll}
                                    />
                                )}
                                {(view === 'tools' ||
                                    view === 'character' ||
                                    view === 'scripts' ||
                                    view === 'library') && (
                                    <ToolsView
                                        brand={brand}
                                        onToast={setToast}
                                        initialTool={
                                            view === 'tools'
                                                ? 'character'
                                                : view
                                        }
                                    />
                                )}
                                {view === 'brand' && (
                                    <BrandView
                                        brand={brand}
                                        onSaved={(b) => setBrand(b)}
                                        onToast={setToast}
                                    />
                                )}
                                {view === 'settings' && (
                                    <SettingsView
                                        health={health}
                                        workspace={activeWorkspace}
                                        workspaces={workspaces}
                                        publishUser={publishUser}
                                        themeMode={themeMode}
                                        onThemeMode={handleThemeMode}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </AppShell>

                {publishItem && (
                    <PublishModal
                        item={publishItem}
                        profiles={profiles}
                        defaultUser={publishUser || 'TASKIZ'}
                        onClose={() => setPublishItem(null)}
                        onConfirm={confirmPublish}
                        loading={publishing}
                    />
                )}
                <OnboardingWizard
                    open={onboardingOpen}
                    mode={onboardingMode}
                    workspaceId={
                        onboardingMode === 'create' ? null : activeWorkspace?.id || getWorkspaceId()
                    }
                    onClose={handleOnboardingClose}
                    onComplete={handleOnboardingComplete}
                    onToast={setToast}
                />
                <Toast message={toast} onDone={() => setToast('')} />
            </div>
        </Theme>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[Glampire OS] render error', error, info);
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640 }}>
                    <h1 style={{ fontSize: 20 }}>Glampire OS failed to render</h1>
                    <pre
                        style={{
                            whiteSpace: 'pre-wrap',
                            background: '#111',
                            color: '#f66',
                            padding: 12,
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                    >
                        {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
                    </pre>
                    <p style={{ color: '#555' }}>
                        Open DevTools → Console for details. Try hard-refresh. Ensure{' '}
                        <code>npm run dev</code> is running (UI :5173 + API :8787).
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
    document.body.innerHTML = '<p style="padding:24px;font-family:system-ui">Missing #root</p>';
} else {
    createRoot(rootEl).render(
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    );
}
