/**
 * Glampire OS — fullscreen Brand OS onboarding wizard
 * Triggered on new workspace create (and resume for draft/review workspaces).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Loader2,
    Sparkles,
    Globe,
    Target,
    Users,
    Megaphone,
    Shield,
    Palette,
    Radio,
    Map as MapIcon,
    Lock,
    Upload,
    Building2,
} from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Banner } from '@astryxdesign/core/Banner';
import { Grid } from '@astryxdesign/core/Grid';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { FileInput } from '@astryxdesign/core/FileInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { api } from '../lib/api';
import { setWorkspaceId } from '../lib/workspace';

const STEP_META = {
    identity: { icon: Building2, title: 'Identity', blurb: 'Who is this client and what do they sell?' },
    offer: { icon: Megaphone, title: 'Offer truth', blurb: 'Value prop, features, and pricing language.' },
    icp: { icon: Users, title: 'Who + not who', blurb: 'ICP priority — and who to ignore for now.' },
    market: {
        icon: Target,
        title: 'Market & signals',
        blurb: 'Competitors, social handles, reviews, and proof — the gold for ICP language.',
    },
    voice: { icon: Shield, title: 'Voice locks', blurb: 'Tone, do-not-say list, and claim limits.' },
    brandkit: { icon: Palette, title: 'Brand kit', blurb: 'Colors, photo rules, logo, and references.' },
    channels: { icon: Radio, title: 'Channels', blurb: 'Platforms, formats, and publish profile.' },
    research: { icon: MapIcon, title: 'Live research', blurb: 'We compile the Brand Brain from your answers.' },
    review: { icon: Lock, title: 'Review & lock', blurb: 'Approve the Brand OS so the studio can generate.' },
};

const PLATFORM_OPTIONS = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'youtube', label: 'YouTube' },
];

const FORMAT_OPTIONS = [
    { id: 'post', label: 'Feed posts' },
    { id: 'carousel', label: 'Carousels' },
    { id: 'reel', label: 'Reels / shorts' },
];

function emptyLocalAnswers() {
    return {
        identity: { name: '', website: '', oneLiner: '', category: '' },
        offer: { valueProp: '', promise: '', keyFeatures: '', pricingModel: '' },
        icp: { primary: '', secondary: '', later: '', exclusions: '' },
        market: {
            competitors: '',
            competitorUrls: '',
            communities: '',
            proofSources: '',
            reviewUrls: '',
            bestCustomer: '',
        },
        social: {
            instagram: '',
            tiktok: '',
            linkedin: '',
            youtube: '',
            x: '',
        },
        voice: {
            tone: 'practical, honest, specific — not fluffy SaaS',
            doNotSay: '',
            claimsWeCantMake: '',
        },
        brandkit: {
            brandColor: '#111111',
            accentColor: '#737373',
            photographyStyle:
                'documentary commercial photography, authentic subjects, natural light, single clear subject, intentional negative space for text overlay',
            imageNegatives:
                'no text of any kind, no logos painted in scene, no fake UI gibberish, no stock-photo clichés',
            compositionNotes: 'One hero moment, clean negative space for later overlay, medium shot preferred.',
            notes: '',
        },
        channels: {
            platforms: ['instagram', 'tiktok', 'facebook', 'linkedin'],
            formats: ['post', 'carousel', 'reel'],
            uploadPostUser: '',
            packIds: ['weekly', 'reels', 'carousels'],
        },
        rawNotes: '',
    };
}

function answersFromServer(serverAnswers) {
    const base = emptyLocalAnswers();
    if (!serverAnswers) return base;
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (key === 'rawNotes') {
            out.rawNotes = serverAnswers.rawNotes || '';
            continue;
        }
        out[key] = { ...base[key], ...(serverAnswers[key] || {}) };
    }
    return out;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function statusVariant(status) {
    if (status === 'done') return 'success';
    if (status === 'researching') return 'accent';
    if (status === 'error') return 'error';
    return 'neutral';
}

function StepRail({ steps, current, completed, score, onSelectStep }) {
    return (
        <VStack gap={3} className="onboarding-step-rail" style={{ minWidth: 200, maxWidth: 240 }}>
            <VStack gap={1}>
                <Text type="label" color="secondary">
                    Completeness
                </Text>
                <ProgressBar
                    label="Brand OS completeness"
                    value={score || 0}
                    max={100}
                    hasValueLabel
                    variant={score >= 80 ? 'success' : 'accent'}
                />
            </VStack>
            <VStack gap={1}>
                {(steps || []).map((s, i) => {
                    const isCurrent = s.id === current;
                    const isDone = (completed || []).includes(s.id);
                    const meta = STEP_META[s.id] || {};
                    const Icon = meta.icon || Sparkles;
                    const clickable = typeof onSelectStep === 'function';
                    return (
                        <HStack
                            key={s.id}
                            gap={2}
                            vAlign="center"
                            padding={2}
                            className={
                                isCurrent
                                    ? 'onboarding-step is-current'
                                    : isDone
                                      ? 'onboarding-step is-done'
                                      : 'onboarding-step'
                            }
                            style={clickable ? { cursor: 'pointer' } : undefined}
                            onClick={() => {
                                if (clickable) onSelectStep(s.id);
                            }}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onKeyDown={(e) => {
                                if (!clickable) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelectStep(s.id);
                                }
                            }}
                        >
                            <StatusDot
                                variant={isDone ? 'success' : isCurrent ? 'accent' : 'neutral'}
                                label={s.label}
                            />
                            <VStack gap={0} style={{ minWidth: 0, flex: 1 }}>
                                <Text size="sm" weight={isCurrent ? 'semibold' : 'regular'}>
                                    {i + 1}. {s.label}
                                </Text>
                            </VStack>
                            <Icon size={14} aria-hidden />
                        </HStack>
                    );
                })}
            </VStack>
        </VStack>
    );
}

function ResearchMap({ research, onRefresh, refreshing }) {
    const cards = research?.cards || {};
    const entries = Object.entries(cards);
    const conf = research?.confidence ?? research?.scraped?.extracted?.confidence;
    const jobs = research?.jobs || {};
    return (
        <VStack gap={4}>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={1}>
                    <Heading level={3}>Brand research map</Heading>
                    <Text type="supporting" color="secondary" as="p">
                        Multi-source Brand Brain: site crawl, competitors, buyer phrases, social, and docs.
                        Inspect cards, then lock when confidence looks solid.
                    </Text>
                </VStack>
                <HStack gap={2} vAlign="center" wrap="wrap">
                    {conf != null && conf > 0 ? (
                        <Badge
                            label={`${conf}% confidence`}
                            variant={conf >= 70 ? 'success' : conf >= 40 ? 'warning' : 'neutral'}
                        />
                    ) : null}
                    <Badge
                        label={
                            research?.status === 'running' || research?.running
                                ? 'Researching…'
                                : research?.status === 'done'
                                  ? 'Research complete'
                                  : research?.status || 'idle'
                        }
                        variant="neutral"
                    />
                    {research?.status === 'done' ? (
                        <Button
                            label={refreshing ? 'Refreshing…' : 'Re-run research'}
                            variant="ghost"
                            size="sm"
                            isDisabled={refreshing}
                            onClick={onRefresh}
                        />
                    ) : null}
                </HStack>
            </HStack>

            {(research?.status === 'running' || research?.running) && (
                <VStack gap={2}>
                    <ProgressBar label="Research progress" isIndeterminate variant="accent" />
                    {Object.keys(jobs).length ? (
                        <HStack gap={2} wrap="wrap">
                            {Object.entries(jobs).map(([k, j]) => (
                                <Badge
                                    key={k}
                                    label={`${k}: ${j?.status || '…'}`}
                                    variant={
                                        j?.status === 'done'
                                            ? 'success'
                                            : j?.status === 'error'
                                              ? 'error'
                                              : 'neutral'
                                    }
                                />
                            ))}
                        </HStack>
                    ) : null}
                </VStack>
            )}

            {research?.error ? (
                <Banner status="warning" title="Research hit a snag" description={research.error} />
            ) : null}

            {research?.scraped?.websiteUrl || research?.scraped?.extracted ? (
                <Text type="supporting" size="sm" color="secondary">
                    {research.scraped.websiteUrl
                        ? `Website: ${research.scraped.websiteUrl}`
                        : 'No website URL'}
                    {research.scraped.extracted?.pageCount != null
                        ? ` · ${research.scraped.extracted.pageCount} pages`
                        : research.scraped.hasMarkdown
                          ? ' · scraped'
                          : ''}
                    {research.scraped.extracted?.phrases != null
                        ? ` · ${research.scraped.extracted.phrases} phrases`
                        : ''}
                    {research.scraped.extracted?.competitors != null
                        ? ` · ${research.scraped.extracted.competitors} competitors`
                        : ''}
                    {research.bundlePath ? ` · saved ${research.bundlePath}` : ''}
                </Text>
            ) : null}

            <Grid columns={{ minWidth: 220, max: 4 }} gap={3}>
                {entries.map(([key, card]) => (
                    <Card key={key} padding={3}>
                        <VStack gap={2}>
                            <HStack gap={2} vAlign="center" hAlign="between">
                                <Text weight="semibold">{card.title || key}</Text>
                                <StatusDot
                                    variant={statusVariant(card.status)}
                                    label={card.status || 'pending'}
                                />
                            </HStack>
                            <Text type="supporting" size="sm" color="secondary" as="p">
                                {card.description}
                            </Text>
                            <Text size="sm" as="p">
                                {card.summary ||
                                    (card.status === 'researching' ? 'Researching…' : 'Waiting…')}
                            </Text>
                            {card.confidence != null ? (
                                <Text type="supporting" size="xsm" color="secondary">
                                    Confidence {card.confidence}%
                                    {Array.isArray(card.sources) && card.sources.length
                                        ? ` · ${card.sources.filter((s) => s.ok !== false).length} sources`
                                        : ''}
                                </Text>
                            ) : null}
                            {Array.isArray(card.data?.angles) ? (
                                <VStack gap={1}>
                                    {card.data.angles.slice(0, 3).map((a) => (
                                        <Text key={a} type="supporting" size="xsm" as="p">
                                            · {a}
                                        </Text>
                                    ))}
                                </VStack>
                            ) : null}
                            {Array.isArray(card.data?.phrases) ? (
                                <VStack gap={1}>
                                    {card.data.phrases.slice(0, 2).map((a) => (
                                        <Text key={a} type="supporting" size="xsm" as="p">
                                            “{a}”
                                        </Text>
                                    ))}
                                </VStack>
                            ) : null}
                            {Array.isArray(card.data?.primary) ? (
                                <Text type="supporting" size="xsm" as="p">
                                    {card.data.primary.join(' · ')}
                                </Text>
                            ) : null}
                            {Array.isArray(card.data?.matrix) ? (
                                <Text type="supporting" size="xsm" as="p">
                                    {card.data.matrix
                                        .slice(0, 3)
                                        .map((m) => m.name)
                                        .join(' · ')}
                                </Text>
                            ) : null}
                        </VStack>
                    </Card>
                ))}
            </Grid>
        </VStack>
    );
}

function ReviewPanel({ onboarding, onJumpStep, onRerunResearch, researchBusy }) {
    const preview = onboarding?.draftPreview;
    const brand = preview;
    const blocks = onboarding?.completeness?.blocks || {};
    const conf = onboarding?.research?.confidence;
    return (
        <VStack gap={4}>
            <Banner
                status="info"
                title="Lock Brand OS before generating packs"
                description="Review the compiled brain. After lock, every pack, still, and reel uses this client’s rules — no freeform re-prompting. You can re-open Brand OS anytime from Settings."
            />
            <HStack gap={2} wrap="wrap">
                <Button
                    label="Edit identity"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('identity')}
                />
                <Button
                    label="Edit offer"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('offer')}
                />
                <Button
                    label="Edit ICP"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('icp')}
                />
                <Button
                    label="Edit market"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('market')}
                />
                <Button
                    label="Edit voice"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('voice')}
                />
                <Button
                    label="Edit brand kit"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('brandkit')}
                />
                <Button
                    label="View research map"
                    variant="secondary"
                    size="sm"
                    onClick={() => onJumpStep?.('research')}
                />
                <Button
                    label={researchBusy ? 'Re-running…' : 'Re-run research'}
                    variant="ghost"
                    size="sm"
                    isDisabled={researchBusy}
                    onClick={onRerunResearch}
                />
            </HStack>
            {conf != null && conf > 0 ? (
                <Text type="supporting" size="sm" color="secondary">
                    Research confidence: {conf}%
                </Text>
            ) : null}
            {!brand ? (
                <EmptyState
                    title="No draft yet"
                    description="Run research to compile brand.json + content pillars."
                />
            ) : (
                <Grid columns={{ minWidth: 280, max: 2 }} gap={3}>
                    <Card padding={4}>
                        <VStack gap={2}>
                            <Text type="label" color="secondary">
                                Brand overview
                            </Text>
                            <Heading level={3}>{brand.name}</Heading>
                            <Text as="p">{brand.oneLiner}</Text>
                            <Text type="supporting" color="secondary" as="p">
                                {brand.category}
                            </Text>
                            <Text size="sm" as="p">
                                Primary CTA: {brand.primaryCta || '—'}
                            </Text>
                        </VStack>
                    </Card>
                    <Card padding={4}>
                        <VStack gap={2}>
                            <Text type="label" color="secondary">
                                ICP (primary)
                            </Text>
                            {(brand.icpPrimary || []).length ? (
                                (brand.icpPrimary || []).map((p) => (
                                    <Text key={p} as="p">
                                        · {p}
                                    </Text>
                                ))
                            ) : (
                                <Text color="secondary">None listed</Text>
                            )}
                        </VStack>
                    </Card>
                    <Card padding={4}>
                        <VStack gap={2}>
                            <Text type="label" color="secondary">
                                Do not say
                            </Text>
                            {(brand.doNotSay || []).length ? (
                                (brand.doNotSay || []).map((p) => (
                                    <Text key={p} size="sm" as="p">
                                        · {p}
                                    </Text>
                                ))
                            ) : (
                                <Text color="secondary">Add guardrails in Voice locks</Text>
                            )}
                        </VStack>
                    </Card>
                    <Card padding={4}>
                        <VStack gap={2}>
                            <Text type="label" color="secondary">
                                Completeness blocks
                            </Text>
                            {Object.entries(blocks).map(([k, b]) => (
                                <HStack key={k} gap={2} vAlign="center" hAlign="between">
                                    <Text size="sm">{b.label}</Text>
                                    <Badge
                                        label={`${b.score}/${b.weight}`}
                                        variant={b.ready ? 'success' : 'neutral'}
                                    />
                                </HStack>
                            ))}
                        </VStack>
                    </Card>
                </Grid>
            )}
        </VStack>
    );
}

export function OnboardingWizard({
    open,
    onClose,
    onComplete,
    onToast,
    workspaceId,
    mode = 'resume', // 'create' | 'resume'
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(null);
    const [onboarding, setOnboarding] = useState(null);
    const [step, setStep] = useState('identity');
    const [answers, setAnswers] = useState(emptyLocalAnswers());
    const [logoFile, setLogoFile] = useState(null);
    const [guideFile, setGuideFile] = useState(null);
    const [refFiles, setRefFiles] = useState(null);
    const [creating, setCreating] = useState(false);
    const [createdId, setCreatedId] = useState(workspaceId || null);
    const [pollError, setPollError] = useState(null);

    const steps = onboarding?.steps || Object.keys(STEP_META).map((id) => ({ id, label: STEP_META[id].title }));

    const load = useCallback(async () => {
        if (mode === 'create') {
            // Fresh create session — never resume a previous draft id from memory
            setCreatedId(null);
            setAnswers(emptyLocalAnswers());
            setLogoFile(null);
            setGuideFile(null);
            setRefFiles(null);
            setBusy(null);
            setLoading(false);
            setStep('identity');
            setOnboarding({
                step: 'identity',
                steps: Object.entries(STEP_META).map(([id, m]) => ({
                    id,
                    label: m.title,
                    description: m.blurb,
                })),
                stepsCompleted: [],
                completeness: { score: 0, blocks: {}, ready: false },
                research: { status: 'idle', cards: {} },
                answers: emptyLocalAnswers(),
            });
            return;
        }
        setLoading(true);
        try {
            const data = await api.onboarding();
            setOnboarding(data.onboarding);
            setAnswers(answersFromServer(data.onboarding?.answers));
            setStep(data.onboarding?.step || 'identity');
            setCreatedId(data.onboarding?.workspaceId || workspaceId);
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setLoading(false);
        }
    }, [mode, workspaceId, onToast]);

    useEffect(() => {
        if (open) load();
        // Only re-bootstrap when dialog opens (not on every load identity change)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode]);

    // Poll while research runs
    useEffect(() => {
        if (!open) return;
        if (step !== 'research' && onboarding?.research?.status !== 'running') return;
        if (!createdId && mode === 'create') return;

        let cancelled = false;
        const tick = async () => {
            try {
                const data = await api.onboarding();
                if (cancelled) return;
                setOnboarding(data.onboarding);
                setPollError(null);
                if (data.onboarding?.research?.status === 'done') {
                    setStep('review');
                }
            } catch (e) {
                if (!cancelled) setPollError(e.message);
            }
        };
        const id = setInterval(tick, 2000);
        tick();
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [open, step, onboarding?.research?.status, createdId, mode]);

    const score = onboarding?.completeness?.score || 0;
    const meta = STEP_META[step] || STEP_META.identity;
    const Icon = meta.icon || Sparkles;

    function patchAnswer(section, field, value) {
        setAnswers((prev) => ({
            ...prev,
            [section]:
                section === 'rawNotes'
                    ? value
                    : { ...(prev[section] || {}), [field]: value },
        }));
    }

    function toggleList(section, field, id) {
        setAnswers((prev) => {
            const cur = prev[section]?.[field] || [];
            const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
            return { ...prev, [section]: { ...prev[section], [field]: next } };
        });
    }

    async function ensureWorkspace() {
        if (createdId) return createdId;
        const name = answers.identity.name?.trim();
        if (!name) throw new Error('Client name is required');
        setCreating(true);
        try {
            const res = await api.createWorkspace({
                name,
                oneLiner: answers.identity.oneLiner || '',
                category: answers.identity.category || '',
                website: answers.identity.website || '',
            });
            const id = res.workspace?.id;
            if (id) {
                setWorkspaceId(id);
                try {
                    await api.setActiveWorkspace(id);
                } catch {
                    /* ignore */
                }
            }
            setCreatedId(id);
            setOnboarding(res.onboarding);
            return id;
        } finally {
            setCreating(false);
        }
    }

    async function persistCurrent({ complete = false } = {}) {
        setSaving(true);
        try {
            await ensureWorkspace();
            const payload = {
                stepId: step,
                answers: { [step]: answers[step], rawNotes: answers.rawNotes },
                complete,
            };
            // For channels, also send full channels object
            if (step === 'identity') {
                payload.answers = { identity: answers.identity, rawNotes: answers.rawNotes };
            }
            const data = await api.onboardingStep(payload);
            setOnboarding(data.onboarding || data);
            return data.onboarding || data;
        } finally {
            setSaving(false);
        }
    }

    async function uploadAssetsIfNeeded() {
        const jobs = [];
        if (logoFile) {
            const dataUrl = await fileToBase64(logoFile);
            jobs.push(
                api.uploadOnboardingAsset({
                    kind: 'logo',
                    filename: logoFile.name,
                    dataBase64: dataUrl,
                    mimeType: logoFile.type,
                })
            );
        }
        if (guideFile) {
            const dataUrl = await fileToBase64(guideFile);
            jobs.push(
                api.uploadOnboardingAsset({
                    kind: 'brandGuide',
                    filename: guideFile.name,
                    dataBase64: dataUrl,
                    mimeType: guideFile.type,
                })
            );
        }
        const refs = Array.isArray(refFiles) ? refFiles : refFiles ? [refFiles] : [];
        for (const f of refs.slice(0, 6)) {
            const dataUrl = await fileToBase64(f);
            jobs.push(
                api.uploadOnboardingAsset({
                    kind: 'ref',
                    filename: f.name,
                    dataBase64: dataUrl,
                    mimeType: f.type,
                })
            );
        }
        if (!jobs.length) return;
        const results = await Promise.all(jobs);
        const last = results[results.length - 1];
        if (last?.onboarding) setOnboarding(last.onboarding);
        setLogoFile(null);
        setGuideFile(null);
        setRefFiles(null);
    }

    async function goNext() {
        try {
            if (step === 'identity' && !answers.identity.name?.trim()) {
                onToast?.('Client name is required');
                return;
            }

            if (step === 'brandkit') {
                await ensureWorkspace();
                setBusy('assets');
                await uploadAssetsIfNeeded();
            }

            if (step === 'channels') {
                setBusy('save');
                await persistCurrent({ complete: true });
                setBusy('research');
                setStep('research');
                const res = await api.runOnboardingResearch({
                    answers: {
                        identity: answers.identity,
                        offer: answers.offer,
                        icp: answers.icp,
                        market: answers.market,
                        social: answers.social,
                        voice: answers.voice,
                        brandkit: answers.brandkit,
                        channels: answers.channels,
                        rawNotes: answers.rawNotes,
                    },
                });
                setOnboarding(res.onboarding);
                if (res.onboarding?.research?.status === 'done') {
                    setStep('review');
                }
                setBusy(null);
                return;
            }

            if (step === 'research') {
                if (onboarding?.research?.status === 'done') {
                    setStep('review');
                } else {
                    onToast?.('Research still running…');
                }
                return;
            }

            if (step === 'review') {
                setBusy('lock');
                const res = await api.lockOnboarding();
                setOnboarding(res.onboarding);
                onToast?.(`Brand OS locked for ${res.workspace?.name || 'client'}`);
                onComplete?.(res);
                setBusy(null);
                return;
            }

            setBusy('save');
            await persistCurrent({ complete: true });
            const order = steps.map((s) => s.id);
            const idx = order.indexOf(step);
            const next = order[idx + 1] || 'research';
            setStep(next);
            setBusy(null);
        } catch (e) {
            onToast?.(e.message);
            setBusy(null);
        }
    }

    async function goBack() {
        const order = steps.map((s) => s.id);
        const idx = order.indexOf(step);
        if (idx <= 0) return;
        setStep(order[idx - 1]);
    }

    async function rerunResearch() {
        try {
            setBusy('research');
            const res = await api.runOnboardingResearch({ force: true });
            setOnboarding(res.onboarding);
            setStep('research');
        } catch (e) {
            onToast?.(e.message);
        } finally {
            setBusy(null);
        }
    }

    const primaryLabel = useMemo(() => {
        if (busy === 'lock') return 'Locking…';
        if (busy === 'research' || creating) return 'Working…';
        if (saving || busy === 'save' || busy === 'assets') return 'Saving…';
        if (step === 'channels') return 'Compile Brand Brain';
        if (step === 'research') return onboarding?.research?.status === 'done' ? 'Continue to review' : 'Researching…';
        if (step === 'review') return 'Lock Brand OS';
        if (step === 'identity' && mode === 'create' && !createdId) return 'Create & continue';
        return 'Continue';
    }, [step, busy, saving, creating, mode, createdId, onboarding?.research?.status]);

    const primaryDisabled =
        Boolean(busy) ||
        saving ||
        creating ||
        loading ||
        (step === 'research' && onboarding?.research?.status !== 'done' && onboarding?.research?.status !== 'error');

    function renderStepBody() {
        if (loading) {
            return (
                <VStack gap={3} hAlign="center" padding={8}>
                    <Loader2 className="spin" size={28} />
                    <Text color="secondary">Loading onboarding…</Text>
                </VStack>
            );
        }

        if (step === 'identity') {
            return (
                <VStack gap={4}>
                    <TextInput
                        label="Client / brand name"
                        value={answers.identity.name}
                        onChange={(v) => patchAnswer('identity', 'name', v)}
                        placeholder="Acme Co"
                        isRequired
                        hasAutoFocus
                        width="100%"
                    />
                    <TextInput
                        label="Website"
                        value={answers.identity.website}
                        onChange={(v) => patchAnswer('identity', 'website', v)}
                        placeholder="https://example.com"
                        description="We scrape this during research to extract messaging."
                        isOptional
                        width="100%"
                    />
                    <TextInput
                        label="Category"
                        value={answers.identity.category}
                        onChange={(v) => patchAnswer('identity', 'category', v)}
                        placeholder="e.g. B2B SaaS · consumer app · local services"
                        width="100%"
                    />
                    <TextInput
                        label="One-liner"
                        value={answers.identity.oneLiner}
                        onChange={(v) => patchAnswer('identity', 'oneLiner', v)}
                        placeholder="What they promise in one sentence."
                        width="100%"
                    />
                </VStack>
            );
        }

        if (step === 'offer') {
            return (
                <VStack gap={4}>
                    <TextArea
                        label="Value proposition"
                        value={answers.offer.valueProp}
                        onChange={(v) => patchAnswer('offer', 'valueProp', v)}
                        placeholder="What pain you remove and how — in plain language."
                        rows={4}
                        width="100%"
                    />
                    <TextArea
                        label="Promise"
                        value={answers.offer.promise}
                        onChange={(v) => patchAnswer('offer', 'promise', v)}
                        placeholder="The outcome the customer gets."
                        rows={2}
                        width="100%"
                    />
                    <TextArea
                        label="Key features"
                        value={answers.offer.keyFeatures}
                        onChange={(v) => patchAnswer('offer', 'keyFeatures', v)}
                        description="One per line."
                        placeholder={'Feature one\nFeature two\nFeature three'}
                        rows={5}
                        width="100%"
                    />
                    <TextInput
                        label="Pricing model"
                        value={answers.offer.pricingModel}
                        onChange={(v) => patchAnswer('offer', 'pricingModel', v)}
                        placeholder="~$29–49/mo · cancel anytime"
                        isOptional
                        width="100%"
                    />
                </VStack>
            );
        }

        if (step === 'icp') {
            return (
                <VStack gap={4}>
                    <TextArea
                        label="Primary ICP"
                        value={answers.icp.primary}
                        onChange={(v) => patchAnswer('icp', 'primary', v)}
                        description="Who we write for first. One per line."
                        placeholder={'Primary buyer segment\nSecondary buyer segment'}
                        rows={3}
                        isRequired
                        width="100%"
                    />
                    <TextArea
                        label="Secondary ICP"
                        value={answers.icp.secondary}
                        onChange={(v) => patchAnswer('icp', 'secondary', v)}
                        placeholder={'Adjacent segment A\nAdjacent segment B'}
                        rows={2}
                        isOptional
                        width="100%"
                    />
                    <TextArea
                        label="Later / not yet"
                        value={answers.icp.later}
                        onChange={(v) => patchAnswer('icp', 'later', v)}
                        placeholder={'Segment to ignore for now'}
                        rows={2}
                        isOptional
                        width="100%"
                    />
                    <TextArea
                        label="Exclusions (who not to target)"
                        value={answers.icp.exclusions}
                        onChange={(v) => patchAnswer('icp', 'exclusions', v)}
                        placeholder={'Wrong-fit buyers\nMarkets you are not ready for'}
                        rows={2}
                        isOptional
                        width="100%"
                    />
                </VStack>
            );
        }

        if (step === 'market') {
            return (
                <VStack gap={4}>
                    <TextArea
                        label="Who is your best customer?"
                        value={answers.market.bestCustomer}
                        onChange={(v) => patchAnswer('market', 'bestCustomer', v)}
                        description="One paragraph in their words — highest ROI for hooks and captions."
                        placeholder="Describe a real customer: role, pain, what they tried before, why they bought."
                        rows={3}
                        width="100%"
                    />
                    <TextArea
                        label="Competitor names"
                        value={answers.market.competitors}
                        onChange={(v) => patchAnswer('market', 'competitors', v)}
                        placeholder={'Competitor A\nCompetitor B\nAdjacent tool'}
                        description="One per line."
                        rows={3}
                        width="100%"
                    />
                    <TextArea
                        label="Competitor URLs"
                        value={answers.market.competitorUrls}
                        onChange={(v) => patchAnswer('market', 'competitorUrls', v)}
                        description="3–7 product URLs we will crawl for positioning (not just names)."
                        placeholder={'https://competitor-a.com\nhttps://competitor-b.com/pricing'}
                        rows={3}
                        width="100%"
                    />
                    <TextArea
                        label="Review / proof URLs"
                        value={answers.market.reviewUrls}
                        onChange={(v) => patchAnswer('market', 'reviewUrls', v)}
                        description="G2, App Store, Trustpilot, Reddit threads, case studies — mined for buyer language."
                        placeholder={'https://www.g2.com/products/…\nhttps://apps.apple.com/…'}
                        rows={3}
                        isOptional
                        width="100%"
                    />
                    <TextArea
                        label="Relevant communities"
                        value={answers.market.communities}
                        onChange={(v) => patchAnswer('market', 'communities', v)}
                        placeholder={'Industry forums\nSocial groups\nNewsletters'}
                        rows={2}
                        isOptional
                        width="100%"
                    />
                    <TextArea
                        label="Proof sources (notes)"
                        value={answers.market.proofSources}
                        onChange={(v) => patchAnswer('market', 'proofSources', v)}
                        placeholder={'Waitlist size\nFounder quotes\nPress'}
                        rows={2}
                        isOptional
                        width="100%"
                    />
                    <Heading level={3}>Social handles (optional)</Heading>
                    <Text type="supporting" color="secondary" size="sm" as="p">
                        Public profiles only — no OAuth required. Used for tone and format hints.
                    </Text>
                    <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                        <TextInput
                            label="Instagram"
                            value={answers.social.instagram}
                            onChange={(v) => patchAnswer('social', 'instagram', v)}
                            placeholder="@brand or URL"
                            isOptional
                            width="100%"
                        />
                        <TextInput
                            label="TikTok"
                            value={answers.social.tiktok}
                            onChange={(v) => patchAnswer('social', 'tiktok', v)}
                            placeholder="@brand or URL"
                            isOptional
                            width="100%"
                        />
                        <TextInput
                            label="LinkedIn"
                            value={answers.social.linkedin}
                            onChange={(v) => patchAnswer('social', 'linkedin', v)}
                            placeholder="company slug or URL"
                            isOptional
                            width="100%"
                        />
                        <TextInput
                            label="YouTube"
                            value={answers.social.youtube}
                            onChange={(v) => patchAnswer('social', 'youtube', v)}
                            placeholder="@channel or URL"
                            isOptional
                            width="100%"
                        />
                        <TextInput
                            label="X / Twitter"
                            value={answers.social.x}
                            onChange={(v) => patchAnswer('social', 'x', v)}
                            placeholder="@brand or URL"
                            isOptional
                            width="100%"
                        />
                    </Grid>
                </VStack>
            );
        }

        if (step === 'voice') {
            return (
                <VStack gap={4}>
                    <TextInput
                        label="Tone"
                        value={answers.voice.tone}
                        onChange={(v) => patchAnswer('voice', 'tone', v)}
                        width="100%"
                    />
                    <TextArea
                        label="Do not say"
                        value={answers.voice.doNotSay}
                        onChange={(v) => patchAnswer('voice', 'doNotSay', v)}
                        description="Claims, phrases, or category words to ban. One per line."
                        placeholder={'Phrase we never use\nOverclaim to avoid\nWrong category word'}
                        rows={5}
                        width="100%"
                    />
                    <TextArea
                        label="Claims we cannot make yet"
                        value={answers.voice.claimsWeCantMake}
                        onChange={(v) => patchAnswer('voice', 'claimsWeCantMake', v)}
                        placeholder={'Feature not live yet\nMarket claim without proof'}
                        rows={3}
                        isOptional
                        width="100%"
                    />
                </VStack>
            );
        }

        if (step === 'brandkit') {
            return (
                <VStack gap={4}>
                    <HStack gap={3} wrap="wrap">
                        <TextInput
                            label="Brand color"
                            value={answers.brandkit.brandColor}
                            onChange={(v) => patchAnswer('brandkit', 'brandColor', v)}
                            placeholder="#111111"
                            width={200}
                        />
                        <TextInput
                            label="Accent color"
                            value={answers.brandkit.accentColor}
                            onChange={(v) => patchAnswer('brandkit', 'accentColor', v)}
                            placeholder="#737373"
                            width={200}
                        />
                    </HStack>
                    <TextArea
                        label="Photography style"
                        value={answers.brandkit.photographyStyle}
                        onChange={(v) => patchAnswer('brandkit', 'photographyStyle', v)}
                        rows={3}
                        width="100%"
                    />
                    <TextArea
                        label="Image negatives"
                        value={answers.brandkit.imageNegatives}
                        onChange={(v) => patchAnswer('brandkit', 'imageNegatives', v)}
                        rows={3}
                        width="100%"
                    />
                    <TextArea
                        label="Composition notes"
                        value={answers.brandkit.compositionNotes}
                        onChange={(v) => patchAnswer('brandkit', 'compositionNotes', v)}
                        rows={2}
                        width="100%"
                    />
                    <FileInput
                        label="Logo"
                        value={logoFile}
                        onChange={setLogoFile}
                        accept="image/*,.svg"
                        mode="dropzone"
                        description="SVG or PNG preferred. Used on end cards and ad chrome."
                        isOptional
                        width="100%"
                    />
                    <FileInput
                        label="Brand guide / GTM PDF"
                        value={guideFile}
                        onChange={setGuideFile}
                        accept=".pdf,image/*"
                        mode="input"
                        isOptional
                        width="100%"
                    />
                    <FileInput
                        label="Reference images"
                        value={refFiles}
                        onChange={setRefFiles}
                        accept="image/*"
                        isMultiple
                        maxFiles={6}
                        mode="dropzone"
                        description="Product screens, lifestyle refs, competitive ads."
                        isOptional
                        width="100%"
                    />
                    {onboarding?.assets?.logo ? (
                        <Text type="supporting" size="sm" color="secondary">
                            Logo on file: {onboarding.assets.logo.filename}
                        </Text>
                    ) : null}
                </VStack>
            );
        }

        if (step === 'channels') {
            return (
                <VStack gap={4}>
                    <VStack gap={2}>
                        <Text weight="semibold">Platforms</Text>
                        <Grid columns={{ minWidth: 140, max: 3 }} gap={2}>
                            {PLATFORM_OPTIONS.map((p) => (
                                <SelectableCard
                                    key={p.id}
                                    label={p.label}
                                    isSelected={(answers.channels.platforms || []).includes(p.id)}
                                    onChange={(on) => {
                                        if (on || (answers.channels.platforms || []).includes(p.id)) {
                                            toggleList('channels', 'platforms', p.id);
                                        }
                                    }}
                                    padding={3}
                                >
                                    <Text weight="semibold">{p.label}</Text>
                                </SelectableCard>
                            ))}
                        </Grid>
                    </VStack>
                    <VStack gap={2}>
                        <Text weight="semibold">Formats</Text>
                        <Grid columns={{ minWidth: 140, max: 3 }} gap={2}>
                            {FORMAT_OPTIONS.map((p) => (
                                <SelectableCard
                                    key={p.id}
                                    label={p.label}
                                    isSelected={(answers.channels.formats || []).includes(p.id)}
                                    onChange={() => toggleList('channels', 'formats', p.id)}
                                    padding={3}
                                >
                                    <Text weight="semibold">{p.label}</Text>
                                </SelectableCard>
                            ))}
                        </Grid>
                    </VStack>
                    <TextInput
                        label="Upload-Post profile user"
                        value={answers.channels.uploadPostUser}
                        onChange={(v) => patchAnswer('channels', 'uploadPostUser', v)}
                        placeholder="CLIENTPROFILE"
                        description="Must match an Upload-Post username if you publish from the studio."
                        isOptional
                        width="100%"
                    />
                    <TextArea
                        label="Extra notes for the Brand Compiler"
                        value={answers.rawNotes}
                        onChange={(v) => setAnswers((prev) => ({ ...prev, rawNotes: v }))}
                        rows={3}
                        isOptional
                        width="100%"
                    />
                </VStack>
            );
        }

        if (step === 'research') {
            return (
                <ResearchMap
                    research={onboarding?.research}
                    onRefresh={rerunResearch}
                    refreshing={busy === 'research'}
                />
            );
        }

        if (step === 'review') {
            return (
                <ReviewPanel
                    onboarding={onboarding}
                    onJumpStep={(id) => setStep(id)}
                    onRerunResearch={rerunResearch}
                    researchBusy={busy === 'research'}
                />
            );
        }

        return null;
    }

    async function jumpToStep(stepId) {
        if (!stepId || stepId === step) return;
        // Persist current form answers before leaving a data step
        try {
            if (step !== 'research' && step !== 'review' && createdId) {
                await persistCurrent({ complete: false });
            }
        } catch {
            /* still allow jump */
        }
        setStep(stepId);
        try {
            if (createdId) await api.onboardingStep({ stepId, complete: false });
        } catch {
            /* local step is enough */
        }
    }

    return (
        <Dialog
            isOpen={!!open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose?.();
            }}
            variant="fullscreen"
            purpose="form"
            className="onboarding-dialog"
        >
            <Layout
                height="fill"
                header={
                    <DialogHeader
                        title={
                            mode === 'create'
                                ? 'New workspace · Brand OS'
                                : onboarding?.lockedAt || onboarding?.status === 'ready'
                                  ? 'Edit Brand OS'
                                  : 'Brand OS onboarding'
                        }
                        subtitle="Capture vision and brand rules so every creative is client-true. Re-open anytime from Settings."
                        onOpenChange={(isOpen) => {
                            if (!isOpen) onClose?.();
                        }}
                        hasDivider
                    />
                }
                content={
                    <LayoutContent padding={5} isScrollable className="onboarding-dialog-content">
                        <HStack
                            gap={0}
                            hAlign="center"
                            vAlign="start"
                            className="onboarding-board-outer"
                            style={{ width: '100%' }}
                        >
                            <HStack
                                gap={6}
                                vAlign="start"
                                wrap="wrap"
                                className="onboarding-board"
                                style={{
                                    width: '100%',
                                    maxWidth: 960,
                                    marginInline: 'auto',
                                }}
                            >
                                <StepRail
                                    steps={steps}
                                    current={step}
                                    completed={onboarding?.stepsCompleted}
                                    score={score}
                                    onSelectStep={jumpToStep}
                                />
                                <VStack
                                    gap={4}
                                    className="onboarding-step-body"
                                    style={{ flex: '1 1 420px', minWidth: 0, maxWidth: 560 }}
                                >
                                    <HStack gap={3} vAlign="center">
                                        <Icon size={22} />
                                        <VStack gap={0}>
                                            <Heading level={2}>{meta.title}</Heading>
                                            <Text type="supporting" color="secondary" as="p">
                                                {meta.blurb}
                                            </Text>
                                        </VStack>
                                    </HStack>
                                    {pollError ? (
                                        <Banner status="warning" title="Sync issue" description={pollError} />
                                    ) : null}
                                    {renderStepBody()}
                                </VStack>
                            </HStack>
                        </HStack>
                    </LayoutContent>
                }
                footer={
                    <LayoutFooter hasDivider>
                        <HStack
                            gap={3}
                            vAlign="center"
                            hAlign="between"
                            padding={3}
                            wrap="wrap"
                            className="onboarding-footer"
                            style={{ width: '100%', maxWidth: 960, marginInline: 'auto' }}
                        >
                            <HStack gap={2} vAlign="center">
                                <Globe size={14} />
                                <Text type="supporting" size="sm" color="secondary">
                                    {createdId
                                        ? `Workspace · ${createdId}`
                                        : 'Workspace will be created on continue'}
                                    {score != null ? ` · ${score}% complete` : ''}
                                </Text>
                            </HStack>
                            <HStack gap={2} wrap="wrap">
                                <Button
                                    label="Save & close"
                                    variant="ghost"
                                    isDisabled={Boolean(busy) || saving}
                                    onClick={async () => {
                                        try {
                                            if (step !== 'research' && step !== 'review') {
                                                await persistCurrent({ complete: false });
                                            }
                                            onClose?.();
                                        } catch (e) {
                                            onToast?.(e.message);
                                        }
                                    }}
                                />
                                <Button
                                    label="Back"
                                    variant="secondary"
                                    icon={<ArrowLeft size={16} />}
                                    isDisabled={step === 'identity' || Boolean(busy)}
                                    onClick={goBack}
                                />
                                <Button
                                    label={primaryLabel}
                                    variant="primary"
                                    className="onboarding-primary-btn"
                                    icon={
                                        busy || saving || creating ? (
                                            <Loader2 className="spin" size={16} />
                                        ) : step === 'review' ? (
                                            <Lock size={16} />
                                        ) : step === 'channels' ? (
                                            <Sparkles size={16} />
                                        ) : (
                                            <ArrowRight size={16} />
                                        )
                                    }
                                    isDisabled={primaryDisabled}
                                    onClick={goNext}
                                />
                            </HStack>
                        </HStack>
                    </LayoutFooter>
                }
            />
        </Dialog>
    );
}

export default OnboardingWizard;
