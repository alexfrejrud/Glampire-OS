/**
 * Creative Studio Tools — character sheet, cast lock, clone, native UI ads, audit.
 * All generation routes use XAI / fal keys (never Arcads).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    WandSparkles,
    Loader2,
    Copy,
    Bookmark,
    Image as ImageIcon,
    X,
    Users,
    Clapperboard,
    LayoutTemplate,
    ScrollText,
    Activity,
    Sparkles,
    Check,
} from 'lucide-react';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { api } from '../lib/api';

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

async function copyText(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fallthrough */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    document.body.removeChild(ta);
    return ok;
}

function PageHeader({ eyebrow, title, description }) {
    return (
        <VStack gap={2}>
            {eyebrow ? (
                <Text type="label" color="secondary">
                    {eyebrow}
                </Text>
            ) : null}
            <Heading level={2}>{title}</Heading>
            {description ? (
                <Text type="supporting" color="secondary" as="p">
                    {description}
                </Text>
            ) : null}
        </VStack>
    );
}

function DropImage({ preview, onFile, onClear, label = 'Upload image' }) {
    const inputRef = useRef(null);
    const [drag, setDrag] = useState(false);
    return (
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
                if (file) onFile(file);
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                className="sr-only"
                onChange={(e) => {
                    if (e.target.files?.[0]) onFile(e.target.files[0]);
                }}
            />
            {preview ? (
                <>
                    <img src={preview} alt={label} />
                    <button
                        type="button"
                        className="icon-btn tool-drop-clear"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear?.();
                        }}
                        title="Remove"
                    >
                        <X size={16} />
                    </button>
                </>
            ) : (
                <>
                    <ImageIcon size={28} />
                    <Text weight="semibold">{label}</Text>
                    <Text type="supporting" color="secondary" size="sm">
                        PNG / JPG / WEBP
                    </Text>
                </>
            )}
        </div>
    );
}

/* ── Character sheet ── */

export function CharacterSheetView({ onToast }) {
    const [description, setDescription] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [hero, setHero] = useState(null);
    const [angles, setAngles] = useState([]);
    const [savedRefs, setSavedRefs] = useState([]);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [lockBrand, setLockBrand] = useState(true);

    async function preview() {
        setBusy('preview');
        setError(null);
        try {
            const data = await api.characterSheetPreview({ description });
            setExpanded(data);
            onToast?.('Prompt expanded — review before generating');
        } catch (e) {
            setError(e.message);
            onToast?.(e.message);
        } finally {
            setBusy(null);
        }
    }

    async function genHero() {
        setBusy('hero');
        setError(null);
        setAngles([]);
        try {
            const data = await api.characterSheetHero({ description });
            setHero(data);
            setExpanded(data.expanded);
            onToast?.('Hero ready — approve then generate angles');
        } catch (e) {
            setError(e.message);
            onToast?.(e.message);
        } finally {
            setBusy(null);
        }
    }

    async function genAngles() {
        if (!hero?.imageUrl) {
            onToast?.('Generate hero first');
            return;
        }
        setBusy('angles');
        setError(null);
        try {
            const data = await api.characterSheetAngles({
                heroImageUrl: hero.imageUrl,
                basePrompt: hero.expanded?.prompt || expanded?.prompt,
                castName: hero.expanded?.folderHint || expanded?.folderHint || 'cast',
                tags: hero.expanded?.tags || expanded?.tags || [],
                saveToLibrary: true,
            });
            setAngles(data.angles || []);
            setSavedRefs(data.savedRefs || []);
            if (lockBrand && (hero.expanded?.prompt || expanded?.prompt)) {
                await api.castSheet({
                    extra: hero.expanded?.prompt || expanded?.prompt,
                    saveToBrand: true,
                });
                onToast?.('Angles saved · cast locked on Brand OS');
            } else {
                onToast?.('Angles generated · saved to Ref library');
            }
        } catch (e) {
            setError(e.message);
            onToast?.(e.message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Cast continuity"
                title="Character sheet"
                description="Build a multi-angle ICP cast on Grok Imagine. Hero first, then identity-locked angles. Saves to Ref library and can lock brand.castBrief for multi-beat stories."
            />
            <Banner
                status="info"
                title="Uses XAI_API_KEY only"
                description="No Arcads. Each angle is a Grok call — hero + ~5 angles. Approve the hero before spending on the pack."
            />
            {error ? <Banner status="error" title="Error" description={error} /> : null}

            <Card padding={4}>
                <VStack gap={3}>
                    <Heading level={3}>01 · Describe the cast</Heading>
                    <TextArea
                        label="Plain-English description"
                        value={description}
                        onChange={(v) => setDescription(v)}
                        placeholder="e.g. mid-40s male handyman, short dark hair, stubble, weathered, friendly eyes, dusty work hoodie"
                        rows={3}
                    />
                    <HStack gap={2} wrap="wrap">
                        <Button
                            label={busy === 'preview' ? 'Expanding…' : 'Expand prompt'}
                            variant="secondary"
                            icon={
                                busy === 'preview' ? (
                                    <Loader2 className="spin" size={16} />
                                ) : (
                                    <WandSparkles size={16} />
                                )
                            }
                            isDisabled={!description.trim() || Boolean(busy)}
                            isLoading={busy === 'preview'}
                            onClick={preview}
                        />
                        <Button
                            label={busy === 'hero' ? 'Generating hero…' : 'Generate hero'}
                            icon={
                                busy === 'hero' ? (
                                    <Loader2 className="spin" size={16} />
                                ) : (
                                    <Sparkles size={16} />
                                )
                            }
                            isDisabled={!description.trim() || Boolean(busy)}
                            isLoading={busy === 'hero'}
                            onClick={genHero}
                        />
                    </HStack>
                    {expanded?.prompt ? (
                        <VStack gap={2}>
                            <Text type="label">Expanded prompt</Text>
                            <div className="tool-output has-content">{expanded.prompt}</div>
                            <HStack gap={2}>
                                <Badge label={expanded.folderHint || expanded.name} variant="neutral" />
                                <Button
                                    label="Copy"
                                    variant="secondary"
                                    size="sm"
                                    icon={<Copy size={14} />}
                                    onClick={async () => {
                                        const ok = await copyText(expanded.prompt);
                                        onToast?.(ok ? 'Copied' : 'Copy failed');
                                    }}
                                />
                            </HStack>
                        </VStack>
                    ) : null}
                </VStack>
            </Card>

            {hero?.imageUrl ? (
                <Card padding={4}>
                    <VStack gap={3}>
                        <HStack gap={2} hAlign="between" wrap="wrap">
                            <Heading level={3}>02 · Hero (approve before angles)</Heading>
                            <Badge label={hero.model || 'grok'} variant="neutral" />
                        </HStack>
                        <img
                            src={hero.imageUrl}
                            alt="Cast hero"
                            style={{
                                width: '100%',
                                maxWidth: 320,
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border-primary)',
                            }}
                        />
                        <HStack gap={3} vAlign="center" wrap="wrap">
                            <Switch
                                label="Lock cast on Brand OS after angles"
                                value={lockBrand}
                                onChange={(v) => setLockBrand(v)}
                            />
                            <Button
                                label={busy === 'angles' ? 'Generating angles…' : 'Generate angles → library'}
                                icon={
                                    busy === 'angles' ? (
                                        <Loader2 className="spin" size={16} />
                                    ) : (
                                        <Users size={16} />
                                    )
                                }
                                isDisabled={Boolean(busy)}
                                isLoading={busy === 'angles'}
                                onClick={genAngles}
                            />
                        </HStack>
                    </VStack>
                </Card>
            ) : null}

            {angles.length ? (
                <Card padding={4}>
                    <VStack gap={3}>
                        <Heading level={3}>03 · Angle pack</Heading>
                        <HStack gap={2} wrap="wrap">
                            {angles.map((a) => (
                                <VStack key={a.angleId} gap={1} style={{ width: 140 }}>
                                    {a.imageUrl ? (
                                        <img
                                            src={a.imageUrl}
                                            alt={a.label}
                                            style={{
                                                width: 140,
                                                height: 180,
                                                objectFit: 'cover',
                                                borderRadius: 'var(--radius-sm)',
                                            }}
                                        />
                                    ) : (
                                        <Text size="sm" color="secondary">
                                            {a.error || a.label}
                                        </Text>
                                    )}
                                    <Text size="sm" weight="semibold">
                                        {a.label}
                                    </Text>
                                </VStack>
                            ))}
                        </HStack>
                        {savedRefs.length ? (
                            <Text type="supporting" size="sm">
                                Saved {savedRefs.length} refs to library with tags character-sheet + cast.
                            </Text>
                        ) : null}
                    </VStack>
                </Card>
            ) : null}
        </VStack>
    );
}

/* ── Cast lock (text-only, no gen $) ── */

export function CastLockView({ brand, onToast }) {
    const [form, setForm] = useState({
        name: '',
        ageRange: '',
        hair: '',
        skin: '',
        eyes: '',
        wardrobe: '',
        setting: '',
        personality: '',
        extra: '',
    });
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);

    function setField(k, v) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    async function build(saveToBrand) {
        setBusy(true);
        try {
            const data = await api.castSheet({ ...form, saveToBrand });
            setResult(data);
            onToast?.(saveToBrand ? 'Cast locked on Brand OS' : 'Cast sheet built');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Continuity"
                title="Cast lock"
                description="Write a continuity brief for multi-beat reels. Saving updates brand.castBrief so every batch uses the same person/world."
            />
            {brand?.castBrief ? (
                <Banner
                    status="info"
                    title="Current Brand OS cast"
                    description={String(brand.castBrief).slice(0, 280)}
                />
            ) : null}
            <Card padding={4}>
                <VStack gap={3}>
                    <HStack gap={3} wrap="wrap">
                        <TextInput label="Name / role" value={form.name} onChange={(v) => setField('name', v)} placeholder="Marcus · owner-operator" />
                        <TextInput label="Age range" value={form.ageRange} onChange={(v) => setField('ageRange', v)} placeholder="30s–40s" />
                    </HStack>
                    <TextInput label="Hair" value={form.hair} onChange={(v) => setField('hair', v)} />
                    <TextInput label="Skin / features" value={form.skin} onChange={(v) => setField('skin', v)} placeholder="visible texture, freckles…" />
                    <TextInput label="Eyes" value={form.eyes} onChange={(v) => setField('eyes', v)} />
                    <TextInput label="Wardrobe" value={form.wardrobe} onChange={(v) => setField('wardrobe', v)} />
                    <TextInput label="Setting" value={form.setting} onChange={(v) => setField('setting', v)} />
                    <TextArea label="Personality / energy" value={form.personality} onChange={(v) => setField('personality', v)} rows={2} />
                    <TextArea label="Extra locks" value={form.extra} onChange={(v) => setField('extra', v)} rows={2} />
                    <HStack gap={2} wrap="wrap">
                        <Button
                            label={busy ? 'Building…' : 'Preview sheet'}
                            variant="secondary"
                            isDisabled={busy}
                            onClick={() => build(false)}
                        />
                        <Button
                            label={busy ? 'Saving…' : 'Lock on Brand OS'}
                            icon={<Check size={16} />}
                            isDisabled={busy}
                            isLoading={busy}
                            onClick={() => build(true)}
                        />
                    </HStack>
                </VStack>
            </Card>
            {result?.briefLine ? (
                <Card padding={4}>
                    <VStack gap={2}>
                        <Heading level={3}>Brief line (injected into prompts)</Heading>
                        <div className="tool-output has-content">{result.briefLine}</div>
                        <Button
                            label="Copy"
                            variant="secondary"
                            icon={<Copy size={14} />}
                            onClick={async () => {
                                const ok = await copyText(result.briefLine);
                                onToast?.(ok ? 'Copied' : 'Copy failed');
                            }}
                        />
                    </VStack>
                </Card>
            ) : null}
        </VStack>
    );
}

/* ── Creative clone ── */

export function CreativeCloneView({ onToast }) {
    const [mode, setMode] = useState('ad');
    const [preview, setPreview] = useState(null);
    const [dataUrl, setDataUrl] = useState(null);
    const [description, setDescription] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [meta, setMeta] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function handleFile(file) {
        if (!file?.type?.startsWith('image/')) {
            onToast?.('Image only');
            return;
        }
        const url = await fileToDataUrl(file);
        setPreview(url);
        setDataUrl(url);
        setAnalysis(null);
    }

    async function run() {
        setBusy(true);
        setError(null);
        setAnalysis(null);
        try {
            const result =
                mode === 'ad'
                    ? await api.cloneAdImage({ dataUrl })
                    : await api.cloneVideoStructure({ dataUrl, description });
            setAnalysis(result.analysis);
            setMeta({ model: result.model, provider: result.provider });
            onToast?.('Template ready');
        } catch (e) {
            setError(e.message);
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Reverse engineer"
                title="Creative clone"
                description="Turn a winning ad still or frame into a reusable Grok/fal template (structure + prompts). Does not call Arcads."
            />
            <HStack gap={2} wrap="wrap">
                <Button
                    label="Static ad → template"
                    variant={mode === 'ad' ? 'primary' : 'secondary'}
                    icon={<LayoutTemplate size={16} />}
                    onClick={() => setMode('ad')}
                />
                <Button
                    label="Video frame → beat map"
                    variant={mode === 'video' ? 'primary' : 'secondary'}
                    icon={<Clapperboard size={16} />}
                    onClick={() => setMode('video')}
                />
            </HStack>
            <HStack gap={4} wrap="wrap" vAlign="start">
                <Card padding={4} style={{ flex: '1 1 280px' }}>
                    <VStack gap={3}>
                        <Heading level={3}>Source</Heading>
                        <DropImage
                            preview={preview}
                            onFile={handleFile}
                            onClear={() => {
                                setPreview(null);
                                setDataUrl(null);
                            }}
                            label={mode === 'ad' ? 'Upload ad image' : 'Upload frame grab'}
                        />
                        {mode === 'video' ? (
                            <TextArea
                                label="Optional notes / transcript sketch"
                                value={description}
                                onChange={(v) => setDescription(v)}
                                rows={3}
                                placeholder="Hook type, spoken lines sketch, pacing…"
                            />
                        ) : null}
                        <Button
                            label={busy ? 'Analyzing…' : 'Clone structure'}
                            icon={
                                busy ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />
                            }
                            isDisabled={busy || (!dataUrl && !(mode === 'video' && description.trim()))}
                            isLoading={busy}
                            width="100%"
                            onClick={run}
                        />
                    </VStack>
                </Card>
                <Card padding={4} style={{ flex: '1 1 320px' }}>
                    <VStack gap={3}>
                        <HStack gap={2} hAlign="between">
                            <Heading level={3}>Reusable template</Heading>
                            {meta ? (
                                <Badge label={`${meta.provider} · ${meta.model}`} variant="neutral" />
                            ) : null}
                        </HStack>
                        {error ? (
                            <Banner status="error" title="Error" description={error} />
                        ) : (
                            <div
                                className={`tool-output${analysis ? ' has-content' : ''}`}
                                style={{ whiteSpace: 'pre-wrap', maxHeight: 480, overflow: 'auto' }}
                            >
                                {analysis ||
                                    (busy
                                        ? 'Analyzing…'
                                        : 'Upload a creative and run clone to get a parameterizable template.')}
                            </div>
                        )}
                        <Button
                            label="Copy markdown"
                            variant="secondary"
                            icon={<Copy size={14} />}
                            isDisabled={!analysis}
                            onClick={async () => {
                                const ok = await copyText(analysis);
                                onToast?.(ok ? 'Copied' : 'Copy failed');
                            }}
                        />
                    </VStack>
                </Card>
            </HStack>
        </VStack>
    );
}

/* ── Native UI ads ── */

export function NativeUiAdsView({ onToast }) {
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState(null);
    const [overrides, setOverrides] = useState({ headline: '', cta: '', bullets: '' });
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api.listNativeUiTemplates();
                if (cancelled) return;
                setTemplates(data.templates || []);
                if (data.templates?.[0]) setTemplateId(data.templates[0].id);
            } catch (e) {
                onToast?.(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [onToast]);

    const selected = useMemo(
        () => templates.find((t) => t.id === templateId) || null,
        [templates, templateId]
    );

    async function runPreview() {
        if (!templateId) return;
        setBusy(true);
        try {
            const data = await api.previewNativeUi({ templateId, overrides });
            setPreview(data);
            onToast?.('Prompt ready');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function generate() {
        if (!templateId) return;
        setBusy(true);
        setResult(null);
        try {
            const data = await api.generateNativeUi({ templateId, overrides, n: 1 });
            setResult(data);
            setPreview(data);
            onToast?.('Native UI ad generated');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function saveToLibrary() {
        if (!result?.imageUrl?.startsWith('data:')) {
            onToast?.('Generate first (data URL required to save)');
            return;
        }
        try {
            await api.addRef({
                name: `Native UI · ${result.label || templateId}`,
                role: 'composition',
                notes: result.prompt || '',
                tags: ['native-ui', templateId, 'static-ad'],
                dataUrl: result.imageUrl,
            });
            onToast?.('Saved to Ref library');
        } catch (e) {
            onToast?.(e.message);
        }
    }

    if (loading) {
        return (
            <VStack gap={3} padding={4}>
                <Loader2 className="spin" size={20} />
                <Text>Loading templates…</Text>
            </VStack>
        );
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Static performance"
                title="Native UI ads"
                description="Model paints the UI/type (Notes, search, chat, comparison…). Separate from Brand OS plate+compose. Uses Grok Imagine."
            />
            <Banner
                status="info"
                title="When to use"
                description="Pick this for UI-mimic Meta tests. For branded photo ads with logo/CTA overlays, stay on Create batch → Ads (adCompose)."
            />
            <HStack gap={3} wrap="wrap">
                {templates.map((t) => (
                    <SelectableCard
                        key={t.id}
                        label={t.label}
                        isSelected={templateId === t.id}
                        onChange={(on) => {
                            if (on) {
                                setTemplateId(t.id);
                                setResult(null);
                                setPreview(null);
                            }
                        }}
                        padding={3}
                        width={220}
                    >
                        <VStack gap={1}>
                            <Text weight="semibold">{t.label}</Text>
                            <Text type="supporting" size="sm" color="secondary">
                                {t.when}
                            </Text>
                            <Badge label={t.aspectDefault} variant="neutral" />
                        </VStack>
                    </SelectableCard>
                ))}
            </HStack>
            {selected ? (
                <Card padding={4}>
                    <VStack gap={3}>
                        <Heading level={3}>{selected.label}</Heading>
                        <TextInput
                            label="Headline"
                            value={overrides.headline}
                            onChange={(v) => setOverrides((o) => ({ ...o, headline: v }))}
                            placeholder="Uses Brand OS one-liner if empty"
                        />
                        <TextArea
                            label="Bullets / body extras"
                            value={overrides.bullets}
                            onChange={(v) => setOverrides((o) => ({ ...o, bullets: v }))}
                            rows={3}
                            placeholder="Optional overrides for list templates"
                        />
                        <TextInput
                            label="CTA"
                            value={overrides.cta}
                            onChange={(v) => setOverrides((o) => ({ ...o, cta: v }))}
                        />
                        <HStack gap={2} wrap="wrap">
                            <Button
                                label="Preview prompt"
                                variant="secondary"
                                isDisabled={busy}
                                onClick={runPreview}
                            />
                            <Button
                                label={busy ? 'Generating…' : 'Generate with Grok'}
                                icon={
                                    busy ? (
                                        <Loader2 className="spin" size={16} />
                                    ) : (
                                        <Sparkles size={16} />
                                    )
                                }
                                isDisabled={busy}
                                isLoading={busy}
                                onClick={generate}
                            />
                            <Button
                                label="Save to library"
                                variant="secondary"
                                icon={<Bookmark size={16} />}
                                isDisabled={!result?.imageUrl}
                                onClick={saveToLibrary}
                            />
                        </HStack>
                    </VStack>
                </Card>
            ) : (
                <EmptyState title="No templates" description="Server returned no native UI templates." />
            )}
            {preview?.prompt ? (
                <Card padding={4}>
                    <VStack gap={2}>
                        <Heading level={3}>Prompt</Heading>
                        <div className="tool-output has-content" style={{ whiteSpace: 'pre-wrap' }}>
                            {preview.prompt}
                        </div>
                    </VStack>
                </Card>
            ) : null}
            {result?.imageUrl ? (
                <Card padding={4}>
                    <VStack gap={2}>
                        <Heading level={3}>Output</Heading>
                        <img
                            src={result.imageUrl}
                            alt={result.label || 'Native UI ad'}
                            style={{
                                width: '100%',
                                maxWidth: 420,
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border-primary)',
                            }}
                        />
                    </VStack>
                </Card>
            ) : null}
        </VStack>
    );
}

/* ── UGC formula helper ── */

export function UgcFormulaView({ onToast }) {
    const [subject, setSubject] = useState('');
    const [dialogueHint, setDialogueHint] = useState('');
    const [prompt, setPrompt] = useState('');
    const [dialogue, setDialogue] = useState('');
    const [durationSec, setDurationSec] = useState('5');
    const [fit, setFit] = useState(null);
    const [layers, setLayers] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.creativeFormulas()
            .then((d) => setLayers(d.ugcLayers || []))
            .catch(() => {});
    }, []);

    async function buildStill() {
        setBusy(true);
        try {
            const data = await api.ugcStillPrompt({ subject, dialogueHint });
            setPrompt(data.prompt);
            onToast?.('UGC still prompt ready');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function checkDialogue() {
        try {
            const data = await api.dialogueCheck({
                dialogue,
                durationSec: Number(durationSec) || 5,
            });
            setFit(data);
        } catch (e) {
            onToast?.(e.message);
        }
    }

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Prompt craft"
                title="UGC 9-layer formula"
                description="Authenticity stack auto-applies to ultra_ugc / contractor_talk / ugc_field in the main pipeline. Use this tool to draft plates and check dialogue length."
            />
            {layers.length ? (
                <HStack gap={2} wrap="wrap">
                    {layers.map((l) => (
                        <Badge key={l.id} label={`${l.id}. ${l.name}`} variant="neutral" />
                    ))}
                </HStack>
            ) : null}
            <Card padding={4}>
                <VStack gap={3}>
                    <Heading level={3}>Still plate prompt</Heading>
                    <TextArea
                        label="Scene / subject"
                        value={subject}
                        onChange={(v) => setSubject(v)}
                        rows={2}
                        placeholder="Peer mid-conversation on driveway, phone in hand blank screen…"
                    />
                    <TextInput
                        label="Dialogue energy (optional)"
                        value={dialogueHint}
                        onChange={(v) => setDialogueHint(v)}
                    />
                    <Button
                        label={busy ? 'Building…' : 'Build UGC still prompt'}
                        isDisabled={busy}
                        isLoading={busy}
                        onClick={buildStill}
                    />
                    {prompt ? (
                        <>
                            <div className="tool-output has-content" style={{ whiteSpace: 'pre-wrap' }}>
                                {prompt}
                            </div>
                            <Button
                                label="Copy"
                                variant="secondary"
                                icon={<Copy size={14} />}
                                onClick={async () => {
                                    const ok = await copyText(prompt);
                                    onToast?.(ok ? 'Copied' : 'Copy failed');
                                }}
                            />
                        </>
                    ) : null}
                </VStack>
            </Card>
            <Card padding={4}>
                <VStack gap={3}>
                    <Heading level={3}>Dialogue duration check</Heading>
                    <TextArea
                        label="Spoken line"
                        value={dialogue}
                        onChange={(v) => setDialogue(v)}
                        rows={2}
                    />
                    <TextInput
                        label="Beat seconds"
                        value={durationSec}
                        onChange={(v) => setDurationSec(v)}
                    />
                    <Button label="Check fit" variant="secondary" onClick={checkDialogue} />
                    {fit ? (
                        <Banner
                            status={fit.ok ? 'success' : 'warning'}
                            title={fit.ok ? 'Fits natural pace' : 'Too long'}
                            description={`${fit.words} words · ~${fit.estSec}s spoken · budget ${fit.maxWords} words. ${fit.advice}`}
                        />
                    ) : null}
                </VStack>
            </Card>
        </VStack>
    );
}

/* ── Gen audit ── */

export function GenAuditView({ onToast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await api.genAudit({ limit: 50 });
            setData(d);
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading && !data) {
        return (
            <VStack gap={3} padding={4}>
                <Loader2 className="spin" size={20} />
            </VStack>
        );
    }

    const stats = data?.stats || {};
    const entries = data?.entries || [];

    return (
        <VStack gap={5} as="main">
            <PageHeader
                eyebrow="Ops"
                title="Generation audit"
                description="Recent image/video/tool generations (local JSONL). Helps track spend and model mix — no Arcads credits."
            />
            <HStack gap={3} wrap="wrap">
                <Card padding={3}>
                    <Text type="label">Recent rows</Text>
                    <Heading level={3}>{stats.total ?? 0}</Heading>
                </Card>
                <Card padding={3}>
                    <Text type="label">Est. $ (logged)</Text>
                    <Heading level={3}>${stats.estUsdRecent ?? 0}</Heading>
                </Card>
                <Button label="Refresh" variant="secondary" icon={<Activity size={16} />} onClick={load} />
            </HStack>
            {entries.length ? (
                <VStack gap={2}>
                    {entries.map((e, i) => (
                        <Card key={`${e.ts}-${i}`} padding={3}>
                            <HStack gap={2} wrap="wrap" vAlign="center">
                                <Badge label={e.kind || 'gen'} variant="neutral" />
                                <Text size="sm">{e.model || e.modelId || e.provider || '—'}</Text>
                                <Text type="supporting" size="sm" color="secondary">
                                    {e.ts}
                                </Text>
                                {e.estUsd != null ? (
                                    <Text size="sm">~${e.estUsd}</Text>
                                ) : null}
                            </HStack>
                        </Card>
                    ))}
                </VStack>
            ) : (
                <EmptyState
                    title="No generations logged yet"
                    description="Image, video, character sheet, and native UI runs will appear here."
                />
            )}
        </VStack>
    );
}

// silence unused import warning for ScrollText if tree-shaken elsewhere
void ScrollText;
