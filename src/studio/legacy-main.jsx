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
} from 'lucide-react';
import { api, waitForVideo } from './lib/api';
import { loadStore, saveStore, upsertItem } from './lib/store';
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

function Logo({ white }) {
    return (
        <div className={`logo${white ? ' white' : ''}`}>
            <img src="/assets/taskiz-logo.svg" alt="Taskiz" />
            <span>Creative Studio</span>
        </div>
    );
}

/* ───────────────── sidebar ───────────────── */

function Sidebar({ view, setView, counts, health }) {
    const nav = [
        { id: 'create', label: 'Create batch', icon: Plus },
        { id: 'queue', label: 'Review queue', icon: LayoutGrid, badge: counts.total },
        { id: 'approved', label: 'Approved', icon: ShieldCheck, badge: counts.approved },
        { id: 'character', label: 'Character RE', icon: Images },
        { id: 'scripts', label: 'Script cloner', icon: ScrollText },
        { id: 'library', label: 'Ref library', icon: Library },
        { id: 'brand', label: 'Brand kit', icon: CircleDot },
    ];

    return (
        <aside>
            <Logo white />
            <button className="new" onClick={() => setView('create')}>
                <Sparkles size={18} /> Generate content
            </button>
            <nav>
                {nav.map(({ id, label, icon: Icon, badge }) => (
                    <button
                        key={id}
                        className={view === id ? 'active' : ''}
                        onClick={() => setView(id)}
                    >
                        <Icon size={18} />
                        <span className="nav-label">{label}</span>
                        {badge != null && badge > 0 && <b className="nav-badge">{badge}</b>}
                    </button>
                ))}
            </nav>
            <div className="side-bottom">
                <div className="usage">
                    <span>
                        <Sparkles size={14} /> Connections
                    </span>
                    <ul className="conn-list">
                        <li className={health?.grok ? 'ok' : 'off'}>
                            Grok Imagine {health?.grok ? 'ready' : 'add key'}
                        </li>
                        <li className={health?.fal ? 'ok' : 'off'}>
                            fal.ai {health?.fal ? 'ready' : 'add key'}
                        </li>
                        <li className={health?.uploadPost ? 'ok' : 'off'}>
                            Upload-Post {health?.uploadPost ? 'ready' : 'add key'}
                        </li>
                    </ul>
                </div>
                <button onClick={() => setView('settings')}>
                    <Settings size={18} /> Settings
                </button>
                <div className="profile">
                    <span>TZ</span>
                    <div>
                        <b>Taskiz team</b>
                        <small>Brand studio</small>
                    </div>
                </div>
            </div>
        </aside>
    );
}

/* ───────────────── create ───────────────── */

function CreateView({
    packs,
    styles,
    flows,
    videoModels,
    benchmarks,
    onGenerate,
    loading,
    health,
    brand,
}) {
    const [packId, setPackId] = useState('stories');
    const [styleId, setStyleId] = useState(brand?.defaultVideoStyleId || 'documentary_commercial');
    const [flowId, setFlowId] = useState(brand?.defaultFlowId || 'pain_to_cta');
    const [videoModelId, setVideoModelId] = useState(brand?.defaultVideoModelId || 'grok');
    const [activeBenchmark, setActiveBenchmark] = useState(null);

    useEffect(() => {
        if (brand?.defaultVideoStyleId) setStyleId(brand.defaultVideoStyleId);
        if (brand?.defaultFlowId) setFlowId(brand.defaultFlowId);
        if (brand?.defaultVideoModelId) setVideoModelId(brand.defaultVideoModelId);
    }, [brand?.defaultVideoStyleId, brand?.defaultFlowId, brand?.defaultVideoModelId]);

    // When style changes, gently suggest its recommended model (only if that model is available)
    useEffect(() => {
        const s = (styles || []).find((x) => x.id === styleId);
        const rec = s?.recommendedVideoModelId;
        if (!rec) return;
        const m = (videoModels || []).find((x) => x.id === rec);
        if (m?.available !== false) {
            // Don't override if user already picked a non-default custom combo mid-session
            // Only auto-suggest when switching into ultra_ugc / product styles from defaults
            if (styleId === 'ultra_ugc' || styleId === 'premium_product') {
                setVideoModelId(rec);
            }
        }
    }, [styleId, styles, videoModels]);

    const selectedStyle = (styles || []).find((s) => s.id === styleId);
    const selectedModel = (videoModels || []).find((m) => m.id === videoModelId);

    function applyBenchmark(wf) {
        setActiveBenchmark(wf.id);
        if (wf.packId) setPackId(wf.packId);
        if (wf.styleId) setStyleId(wf.styleId);
        if (wf.flowId) setFlowId(wf.flowId);
        if (wf.videoModelId) setVideoModelId(wf.videoModelId);
    }

    return (
        <main className="page create-page">
            <header className="page-header">
                <div>
                    <div className="eyebrow">
                        <Sparkles size={14} /> No freeform prompting
                    </div>
                    <h1>Generate Taskiz content</h1>
                    <p>
                        Pick a pack, a <strong>video model</strong>, a <strong>style</strong> (look &amp; motion),
                        and a <strong>story flow</strong> (beats). Prompts stay brand-locked — you choose the engine.
                    </p>
                </div>
            </header>

            {(benchmarks || []).length > 0 && (
                <section className="benchmark-panel">
                    <h3>Test &amp; benchmark workflows</h3>
                    <p className="muted-sm">
                        One-click presets for quality A/B. Apply → Generate ideas → run the steps on one reel.
                        Score with the rubric (1–5) after each run.
                    </p>
                    <div className="benchmark-grid">
                        {(benchmarks || []).map((wf) => (
                            <button
                                key={wf.id}
                                type="button"
                                className={`benchmark-card${activeBenchmark === wf.id ? ' selected' : ''}`}
                                onClick={() => applyBenchmark(wf)}
                            >
                                <b>{wf.name}</b>
                                <span>{wf.goal}</span>
                                <em>
                                    ~{wf.estimatedMinutes} · {wf.costHint}
                                </em>
                                <code>
                                    {wf.styleId} · {wf.videoModelId} · {wf.flowId}
                                </code>
                            </button>
                        ))}
                    </div>
                    {activeBenchmark && (
                        <div className="benchmark-detail">
                            {(() => {
                                const wf = benchmarks.find((b) => b.id === activeBenchmark);
                                if (!wf) return null;
                                return (
                                    <>
                                        <p>
                                            <strong>Pass bar:</strong> {wf.passBar}
                                        </p>
                                        <p>
                                            <strong>Score focus:</strong> {wf.scoreFocus?.join(' · ')}
                                        </p>
                                        <p className="muted-sm">
                                            Settings applied below. Click <strong>Generate ideas</strong>, open one
                                            reel, then follow the build step for this workflow.
                                        </p>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </section>
            )}

            <section className="pack-grid">
                {(packs || []).map((p) => (
                    <button
                        key={p.id}
                        className={`pack-card${packId === p.id ? ' selected' : ''}`}
                        onClick={() => setPackId(p.id)}
                    >
                        <h3>{p.label}</h3>
                        <p>{p.description}</p>
                    </button>
                ))}
            </section>

            <section className="model-panel">
                <h3>Video model (I2V engine)</h3>
                <p className="muted-sm">
                    <strong>Default = Grok (cheap).</strong> Kling Pro + audio ≈ $2.50–$4 per 3-beat story — hero
                    only. Stills stay on Grok Imagine.
                </p>
                <div className="chip-grid model-grid">
                    {(videoModels || []).map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            className={`chip-card${videoModelId === m.id ? ' selected' : ''}${m.available === false ? ' disabled' : ''
                                }`}
                            disabled={m.available === false}
                            onClick={() => setVideoModelId(m.id)}
                            title={
                                m.available === false
                                    ? `Needs ${m.requires} in .env`
                                    : m.falEndpointNote || m.costHint || ''
                            }
                        >
                            <b>{m.label}</b>
                            <span>{m.description}</span>
                            <em>
                                {m.costLabel || m.tier}
                                {m.sampleStoryCostUsd != null
                                    ? ` · ~$${m.sampleStoryCostUsd}/story`
                                    : ''}
                                {m.available === false ? ' · offline' : ''}
                            </em>
                        </button>
                    ))}
                </div>
                {selectedModel && (
                    <div className="style-meta">
                        <span>Best for: {selectedModel.bestFor}</span>
                        {selectedModel.falEndpointNote && (
                            <span>{selectedModel.falEndpointNote}</span>
                        )}
                    </div>
                )}
            </section>

            <section className="style-flow-panel">
                <div>
                    <h3>Video style</h3>
                    <p className="muted-sm">
                        Injects camera, lighting, energy, and motion language into every still + I2V prompt.
                    </p>
                    <div className="chip-grid">
                        {(styles || []).map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                className={`chip-card${styleId === s.id ? ' selected' : ''}`}
                                onClick={() => setStyleId(s.id)}
                            >
                                <b>{s.label}</b>
                                <span>{s.description}</span>
                                <em>{s.energy}</em>
                            </button>
                        ))}
                    </div>
                    {selectedStyle && (
                        <div className="style-meta">
                            <span>Pacing: {selectedStyle.pacing}</span>
                            <span>
                                Graphics: {selectedStyle.graphics?.titleStyle} · density{' '}
                                {selectedStyle.graphics?.density}
                            </span>
                            {selectedStyle.recommendedVideoModelId && (
                                <span>
                                    Pairs well with model:{' '}
                                    <strong>{selectedStyle.recommendedVideoModelId}</strong> (optional)
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div>
                    <h3>Story flow (reels)</h3>
                    <p className="muted-sm">
                        Multi-beat structure. HyperFrames / titles sit on top after stitch.
                    </p>
                    <div className="chip-grid">
                        {(flows || []).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                className={`chip-card${flowId === f.id ? ' selected' : ''}`}
                                onClick={() => setFlowId(f.id)}
                            >
                                <b>{f.label}</b>
                                <span>{f.description}</span>
                                <em>{f.beatCount} beat{f.beatCount === 1 ? '' : 's'}</em>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <div className="create-actions">
                <button
                    className="primary lg"
                    disabled={loading}
                    onClick={() =>
                        onGenerate(packId, {
                            styleId,
                            flowId,
                            videoModelId,
                            storyMode: true,
                        })
                    }
                >
                    {loading ? (
                        <>
                            <Loader2 className="spin" size={18} /> Building batch…
                        </>
                    ) : (
                        <>
                            <WandSparkles size={18} /> Generate ideas
                        </>
                    )}
                </button>
                {!health?.grok && (
                    <p className="hint warn">
                        <AlertCircle size={14} /> Ideas work now. To generate images/videos, add{' '}
                        <code>XAI_API_KEY</code> to <code>.env</code> and restart the server.
                    </p>
                )}
                <p className="hint">
                    Flow: ideas → stills per beat → animate beats → assemble story + titles → approve →
                    Upload-Post.
                </p>
            </div>

            <section className="flow-strip">
                <div>
                    <b>1</b>
                    <span>Ideas + style</span>
                </div>
                <ChevronRight size={16} />
                <div>
                    <b>2</b>
                    <span>Beat stills</span>
                </div>
                <ChevronRight size={16} />
                <div>
                    <b>3</b>
                    <span>Animate</span>
                </div>
                <ChevronRight size={16} />
                <div>
                    <b>4</b>
                    <span>Assemble + titles</span>
                </div>
                <ChevronRight size={16} />
                <div>
                    <b>5</b>
                    <span>Approve</span>
                </div>
            </section>
        </main>
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
                    <label className="inline-model-pick" onClick={(e) => e.stopPropagation()}>
                        <span>Video model</span>
                        <select
                            value={item.videoModelId || 'grok'}
                            disabled={isBusy}
                            onChange={(e) => onChangeVideoModel?.(item, e.target.value)}
                        >
                            {videoModels.map((m) => (
                                <option key={m.id} value={m.id} disabled={m.available === false}>
                                    {m.label}
                                    {m.available === false ? ' (offline)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
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

function DetailDrawer({ item, onClose, onCopy }) {
    if (!item) return null;
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
    onRemove,
    onGenerateAll,
    onChangeVideoModel,
    videoModels,
    busy,
    generatingAll,
}) {
    const filtered = useMemo(() => {
        if (filter === 'all') return items;
        if (filter === 'post' || filter === 'carousel' || filter === 'reel') {
            return items.filter((i) => i.format === filter);
        }
        return items.filter((i) => i.status === filter);
    }, [items, filter]);

    const selected = items.find((i) => i.id === selectedId) || null;

    if (!items.length) {
        return (
            <main className="page">
                <div className="empty-state">
                    <LayoutGrid size={40} />
                    <h2>No content in the queue yet</h2>
                    <p>Generate a weekly batch or launch pack — AI drafts ideas from the Taskiz brand system.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="page queue-page">
            <header className="page-header row">
                <div>
                    <h1>{packLabel || 'Review queue'}</h1>
                    <p>
                        {items.length} ideas · approve only what you want to ship · stills via Grok · reels via
                        image→video
                    </p>
                </div>
                <button className="primary" disabled={generatingAll} onClick={onGenerateAll}>
                    {generatingAll ? (
                        <>
                            <Loader2 className="spin" size={16} /> Generating all stills…
                        </>
                    ) : (
                        <>
                            <WandSparkles size={16} /> Generate all stills
                        </>
                    )}
                </button>
            </header>

            <div className="filters">
                {[
                    ['all', 'All'],
                    ['post', 'Posts'],
                    ['carousel', 'Carousels'],
                    ['reel', 'Reels'],
                    ['ready', 'Ready'],
                    ['approved', 'Approved'],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        className={filter === id ? 'active' : ''}
                        onClick={() => setFilter(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className={`queue-layout${selected ? ' with-drawer' : ''}`}>
                <section className="item-grid">
                    {filtered.map((item) => (
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
                            onRemove={onRemove}
                            onChangeVideoModel={onChangeVideoModel}
                            videoModels={videoModels}
                            busy={busy}
                        />
                    ))}
                </section>
                {selected && (
                    <DetailDrawer
                        item={selected}
                        onClose={() => setSelectedId(null)}
                        onCopy={(text) => navigator.clipboard?.writeText(text)}
                    />
                )}
            </div>
        </main>
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
            <main className="page">
                <p className="hint">Loading brand kit…</p>
            </main>
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
        if (!confirm('Reset brand kit to defaults from taskiz.ai + GTM?')) return;
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
        <main className="page brand-page">
            <header className="page-header row">
                <div>
                    <h1>Brand kit</h1>
                    <p>
                        Editable source of truth for copy + colors + image rules. Saved to the server
                        and used on every Grok prompt.
                        {brand.website && (
                            <>
                                {' '}
                                Source site:{' '}
                                <a href={brand.website} target="_blank" rel="noreferrer">
                                    {brand.website}
                                </a>
                            </>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="ghost" disabled={saving} onClick={reset}>
                        Reset defaults
                    </button>
                    <button className="primary" disabled={saving} onClick={save}>
                        {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                        Save brand kit
                    </button>
                </div>
            </header>

            <div className="filters">
                {[
                    ['positioning', 'Positioning'],
                    ['colors', 'Colors'],
                    ['visual', 'Image rules'],
                    ['icp', 'ICP & guardrails'],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        className={tab === id ? 'active' : ''}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'positioning' && (
                <div className="brand-edit">
                    <label>One-liner</label>
                    <input
                        value={draft.oneLiner}
                        onChange={(e) => setField('oneLiner', e.target.value)}
                    />
                    <label>Supporting</label>
                    <textarea
                        rows={3}
                        value={draft.supporting}
                        onChange={(e) => setField('supporting', e.target.value)}
                    />
                    <label>Category</label>
                    <input
                        value={draft.category}
                        onChange={(e) => setField('category', e.target.value)}
                    />
                    <label>Primary CTA</label>
                    <input
                        value={draft.primaryCta}
                        onChange={(e) => setField('primaryCta', e.target.value)}
                    />
                    <label>Website</label>
                    <input
                        value={draft.website}
                        onChange={(e) => setField('website', e.target.value)}
                    />
                </div>
            )}

            {tab === 'colors' && (
                <div className="brand-edit">
                    <p className="hint" style={{ marginTop: 0 }}>
                        Defaults extracted from taskiz.ai Framer tokens (violet #9563FF, magenta
                        #ED81FF, neutrals, orange accent). Edit any swatch — studio UI + image color
                        grade follow these.
                    </p>
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
                                        value={draft.colors[key]}
                                        onChange={(e) => setColor(key, e.target.value)}
                                    />
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'visual' && (
                <div className="brand-edit">
                    <p className="hint" style={{ marginTop: 0 }}>
                        These rules go into every Grok still/reel prompt. Keep brand names out of the
                        scene — add logo/type later as design overlay.
                    </p>
                    <label>Photography style</label>
                    <textarea
                        rows={4}
                        value={draft.photographyStyle}
                        onChange={(e) => setField('photographyStyle', e.target.value)}
                    />
                    <label>Composition notes</label>
                    <textarea
                        rows={3}
                        value={draft.compositionNotes}
                        onChange={(e) => setField('compositionNotes', e.target.value)}
                    />
                    <label>Strict negatives (no text on cars, no logos in scene…)</label>
                    <textarea
                        rows={5}
                        value={draft.imageNegatives}
                        onChange={(e) => setField('imageNegatives', e.target.value)}
                    />
                </div>
            )}

            {tab === 'icp' && (
                <div className="brand-edit">
                    <label>Primary ICP (one per line)</label>
                    <textarea
                        rows={4}
                        value={draft.icpPrimary}
                        onChange={(e) => setField('icpPrimary', e.target.value)}
                    />
                    <label>Secondary ICP (one per line)</label>
                    <textarea
                        rows={3}
                        value={draft.icpSecondary}
                        onChange={(e) => setField('icpSecondary', e.target.value)}
                    />
                    <label>Do not say (one per line)</label>
                    <textarea
                        rows={5}
                        value={draft.doNotSay}
                        onChange={(e) => setField('doNotSay', e.target.value)}
                    />
                    <section className="brand-card" style={{ marginTop: 16 }}>
                        <h3>Content pillars</h3>
                        <div className="pill-row">
                            {brand.pillars?.map((p) => (
                                <div key={p.id} className="pill-card">
                                    <b>{p.label}</b>
                                    <span>{p.description}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}

function applyBrandCss(brand) {
    if (!brand?.colors) return;
    const c = brand.colors;
    const root = document.documentElement;
    if (c.ink) root.style.setProperty('--ink', c.ink);
    if (c.brand) root.style.setProperty('--brand', c.brand);
    if (c.brandDeep) root.style.setProperty('--brand-deep', c.brandDeep);
    if (c.accent) root.style.setProperty('--accent-hot', c.accent);
    if (c.accentSoft) root.style.setProperty('--accent', c.accentSoft);
    if (c.surface) root.style.setProperty('--bg', c.surface);
    if (c.bg) root.style.setProperty('--card', c.bg);
    if (c.muted) root.style.setProperty('--muted', c.muted);
    if (c.dark) {
        root.style.setProperty('--side', c.dark);
        root.style.setProperty('--side-2', c.dark);
    }
    if (c.brand) root.style.setProperty('--blue', c.brand);
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
        <div className="tool-body">
            <div className="tool-grid">
                <section className="brand-card tool-card">
                    <div className="tool-card-head">
                        <h3>01 · Upload screenshot</h3>
                        <span className="tag format">Source</span>
                    </div>
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
                            style={{ display: 'none' }}
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
                                <strong>Click to upload</strong>
                                <span className="muted">or drag PNG / JPG / WEBP</span>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        className="primary"
                        style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                        disabled={!preview || analyzing}
                        onClick={analyze}
                    >
                        {analyzing ? (
                            <>
                                <Loader2 className="spin" size={16} /> Analyzing…
                            </>
                        ) : (
                            <>
                                <WandSparkles size={16} /> Analyze
                            </>
                        )}
                    </button>
                </section>

                <section className="brand-card tool-card">
                    <div className="tool-card-head">
                        <h3>02 · Generated prompt</h3>
                        {meta && (
                            <span className="tag pillar">
                                {meta.provider} · {meta.model}
                            </span>
                        )}
                    </div>
                    <div
                        className={`tool-output${error ? ' is-error' : ''}${prompt ? ' has-content' : ''}${!prompt && !error ? ' is-empty' : ''
                            }`}
                    >
                        {error
                            ? error
                            : prompt ||
                            (analyzing
                                ? 'Analyzing the image…'
                                : 'Your reverse-engineered prompt will appear here.')}
                    </div>
                    <div className="tool-actions">
                        <button
                            type="button"
                            className="primary"
                            disabled={!prompt}
                            onClick={copyPrompt}
                        >
                            <Copy size={14} /> {copyLabel}
                        </button>
                        <button
                            type="button"
                            className="ghost"
                            disabled={!prompt || !dataUrl || saving}
                            onClick={async () => {
                                if (!onSaveToLibrary || !prompt || !dataUrl) return;
                                setSaving(true);
                                try {
                                    await onSaveToLibrary(dataUrl, prompt);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="spin" size={14} /> Saving…
                                </>
                            ) : (
                                <>
                                    <Bookmark size={14} /> Save to Ref library
                                </>
                            )}
                        </button>
                    </div>
                    <p className="hint" style={{ marginBottom: 0 }}>
                        Copy the prompt to generate similar images, or save the photo + prompt into{' '}
                        <strong>Ref library</strong> for later.
                    </p>
                </section>
            </div>
            <div className="tags" style={{ marginTop: 16 }}>
                <span className="tag">Raw iPhone UGC</span>
                <span className="tag">Ultra-realistic</span>
                <span className="tag">Grok Imagine</span>
                <span className="tag">9:16</span>
            </div>
        </div>
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
        <main className="page">
            <header className="page-header">
                <div className="eyebrow">
                    <Images size={14} /> Character tooling
                </div>
                <h1>
                    Character <span className="title-accent">Reverse-Engineer</span>
                </h1>
                <p>
                    Upload a screenshot of any character. Get back an ultra-realistic, raw-iPhone-style
                    UGC prompt — ready to paste and generate similar images. Optionally save the image +
                    prompt to Ref library.
                </p>
            </header>
            <CharacterReverseEngineer onToast={onToast} onSaveToLibrary={saveToLibrary} />
        </main>
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

    return (
        <main className="page refs-page">
            <header className="page-header">
                <div className="eyebrow">
                    <Library size={14} /> Visual truth
                </div>
                <h1>Ref library</h1>
                <p>
                    Store character plates, product UI, style refs. Save from Character RE or upload
                    here for consistent generation.
                </p>
            </header>

            <section className="refs-library">
                <div className="refs-upload-card">
                    <h3>
                        <Upload size={16} /> Add reference images
                    </h3>
                    <p className="muted">
                        Contractor / product / style plates used as visual truth for prompts and multi-image
                        edits.
                    </p>
                    <div className="refs-form-grid">
                        <label>
                            Name
                            <input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Solo GC mid-30s daylight"
                            />
                        </label>
                        <label>
                            Role
                            <select
                                value={form.role}
                                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                            >
                                {(roles.length
                                    ? roles
                                    : [
                                        { id: 'person', label: 'Person / talent' },
                                        { id: 'style', label: 'Style / grade' },
                                        { id: 'product', label: 'Product / phone UI' },
                                        { id: 'job_site', label: 'Job site' },
                                        { id: 'vehicle', label: 'Vehicle / van' },
                                        { id: 'other', label: 'Other' },
                                    ]
                                ).map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="span-2">
                            Notes
                            <textarea
                                rows={2}
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                placeholder="What must carry into generations…"
                            />
                        </label>
                        <label className="span-2">
                            Tags (comma-separated)
                            <input
                                value={form.tags}
                                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                                placeholder="handyman, driveway, natural"
                            />
                        </label>
                    </div>
                    <label className="refs-drop">
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={uploading}
                            onChange={handleUpload}
                        />
                        {uploading ? (
                            <>
                                <Loader2 className="spin" size={18} /> Uploading…
                            </>
                        ) : (
                            <>
                                <Upload size={18} /> Drop or choose images
                            </>
                        )}
                    </label>
                </div>

                <div className="refs-toolbar">
                    <div className="filters" style={{ margin: 0 }}>
                        <button
                            className={roleFilter === 'all' ? 'active' : ''}
                            onClick={() => setRoleFilter('all')}
                        >
                            All
                        </button>
                        {(roles.length
                            ? roles
                            : [
                                { id: 'person', label: 'Person' },
                                { id: 'product', label: 'Product' },
                                { id: 'style', label: 'Style' },
                                { id: 'job_site', label: 'Job site' },
                            ]
                        ).map((r) => (
                            <button
                                key={r.id}
                                className={roleFilter === r.id ? 'active' : ''}
                                onClick={() => setRoleFilter(r.id)}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <div className="refs-toolbar-actions">
                        <button className="ghost" disabled={!selected.length} onClick={copySnippet}>
                            <Copy size={14} /> Copy prompt snippet
                        </button>
                        <button className="ghost" onClick={load} disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
                        </button>
                    </div>
                </div>

                {loading && !refs.length ? (
                    <p className="hint">Loading library…</p>
                ) : !filtered.length ? (
                    <div className="empty-state refs-empty">
                        <Images size={40} />
                        <h2>No references yet</h2>
                        <p>
                            Upload brand truth images or use <strong>Character RE → Save to library</strong>.
                        </p>
                    </div>
                ) : (
                    <div className="refs-grid">
                        {filtered.map((r) => (
                            <article
                                key={r.id}
                                className={`ref-card${selected.includes(r.id) ? ' selected' : ''}`}
                                onClick={() => toggleSelect(r.id)}
                            >
                                <div className="ref-thumb">
                                    <img src={r.url} alt={r.name} loading="lazy" />
                                </div>
                                <div className="ref-meta">
                                    <div className="tags">
                                        <span className="tag format">{r.role}</span>
                                        {r.tags?.slice(0, 3).map((t) => (
                                            <span className="tag" key={t}>
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                    <h3>{r.name}</h3>
                                    {r.notes && <p>{r.notes}</p>}
                                </div>
                                <div className="ref-actions" onClick={(e) => e.stopPropagation()}>
                                    <a className="ghost" href={r.url} target="_blank" rel="noreferrer">
                                        Open
                                    </a>
                                    <button
                                        className="icon-btn"
                                        title="Delete"
                                        onClick={() => handleDelete(r.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
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
        <main className="page">
            <header className="page-header">
                <div className="eyebrow">
                    <ScrollText size={14} /> Scripts · Grok
                </div>
                <h1>Script Formula Cloner</h1>
                <p>
                    <strong>Both boxes required.</strong> Left = winning script (formula). Right = your
                    new idea. Grok copies structure &amp; psychology, writes fresh copy — not a word-swap.
                </p>
            </header>

            <div className="tool-body">
                {error && (
                    <div className="item-error" style={{ marginBottom: 16 }}>
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                <div className="tool-grid">
                    <section className="brand-card tool-card">
                        <div className="tool-card-head">
                            <h3>1 · Original script (required)</h3>
                            <span className="tag format">Source</span>
                        </div>
                        <textarea
                            className={`tool-textarea${!original.trim() && error ? ' is-missing' : ''}`}
                            value={original}
                            onChange={(e) => {
                                setOriginal(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder="Paste the full original video script / transcript here…"
                            rows={12}
                        />
                        <div className="tool-count">
                            {original.trim() ? `${original.length} characters` : 'Required — paste source script'}
                        </div>
                    </section>

                    <section className="brand-card tool-card">
                        <div className="tool-card-head">
                            <h3>2 · New video idea (required)</h3>
                            <span className="tag pillar">Target</span>
                        </div>
                        <textarea
                            ref={ideaRef}
                            className={`tool-textarea${!idea.trim() && error ? ' is-missing' : ''}`}
                            value={idea}
                            onChange={(e) => {
                                setIdea(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder={
                                'What should the NEW script be about?\n\nExample:\nTaskiz for solo handymen — run quotes, schedule, and invoices from the phone. Pain of lost leads on the job site. CTA: Join the Beta.'
                            }
                            rows={12}
                        />
                        <div className="tool-count">
                            {idea.trim()
                                ? `${idea.length} characters`
                                : 'Required — describe the new topic / product / angle'}
                        </div>
                    </section>
                </div>

                <label className="tool-check">
                    <input
                        type="checkbox"
                        checked={useBrand}
                        onChange={(e) => setUseBrand(e.target.checked)}
                    />
                    Apply Taskiz brand guardrails (one-liner, ICP, do-not-say, CTA)
                </label>

                <div className="tool-cta-row">
                    <button
                        type="button"
                        className="primary lg"
                        disabled={cloning || !canClone}
                        onClick={clone}
                        title={
                            !canClone
                                ? 'Fill both original script and new video idea first'
                                : 'Clone structure into a new script'
                        }
                    >
                        {cloning ? (
                            <>
                                <Loader2 className="spin" size={18} /> Cloning formula… (10–30s)
                            </>
                        ) : (
                            <>
                                <WandSparkles size={18} /> Clone the formula
                            </>
                        )}
                    </button>
                    {cloning && status && <p className="hint">{status}</p>}
                    {!cloning && !canClone && (
                        <p className="hint warn-text">
                            Fill <strong>both</strong> boxes above — button unlocks when ready.
                        </p>
                    )}
                    {!cloning && canClone && (
                        <p className="hint">
                            Ready · structure &amp; persuasion from left → fresh copy for the idea on the right
                        </p>
                    )}
                </div>

                <section
                    ref={resultRef}
                    className="brand-card tool-card"
                    style={{ marginTop: 8 }}
                >
                    <div className="tool-card-head">
                        <h3>
                            3 · New script
                            {meta && (
                                <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>
                                    {meta.provider} · {meta.model}
                                </span>
                            )}
                        </h3>
                        <button
                            type="button"
                            className="ghost"
                            disabled={!script}
                            onClick={copyScript}
                        >
                            <Copy size={14} /> {copyLabel}
                        </button>
                    </div>
                    <div
                        className={`tool-output${script ? ' has-content' : ''}${error && !script ? ' is-error' : ''
                            }${!script && !cloning && !error ? ' is-empty' : ''}`}
                    >
                        {cloning
                            ? status || 'Cloning…'
                            : script ||
                            (error
                                ? error
                                : 'Your cloned script will appear here after you click Clone the formula.')}
                    </div>
                </section>
            </div>
        </main>
    );
}

/* ───────────────── settings / publish modal ───────────────── */

function SettingsView({ health }) {
    return (
        <main className="page">
            <header className="page-header">
                <h1>Settings</h1>
                <p>API keys live in <code>.env</code> on the server — never in the browser.</p>
            </header>
            <div className="brand-grid">
                <section className="brand-card">
                    <h3>Grok (xAI)</h3>
                    <p className={health?.grok ? 'ok-text' : 'warn-text'}>
                        {health?.grok ? 'Connected' : 'Missing XAI_API_KEY'}
                    </p>
                    <p className="muted">
                        <strong>Imagine:</strong> stills (<code>grok-imagine-image-quality</code>) + reels
                        (image→video).
                        <br />
                        <strong>Vision:</strong> References → Reverse-Engineer (
                        {health?.vision
                            ? `ready · ${health.visionProvider || 'grok'}`
                            : 'needs XAI_API_KEY'}
                        ).
                    </p>
                    <ol className="steps-list">
                        <li>
                            Copy <code>.env.example</code> → <code>.env</code>
                        </li>
                        <li>
                            Paste key as <code>XAI_API_KEY=...</code>
                        </li>
                        <li>
                            Optional: <code>GROK_VISION_MODEL=grok-2-vision-latest</code>
                        </li>
                        <li>
                            Restart with <code>npm run dev</code>
                        </li>
                    </ol>
                </section>
                <section className="brand-card">
                    <h3>Upload-Post</h3>
                    <p className={health?.uploadPost ? 'ok-text' : 'warn-text'}>
                        {health?.uploadPost ? 'Connected · profile TASKIZ' : 'Missing UPLOAD_POST_API_KEY'}
                    </p>
                    <p className="muted">
                        Publishes approved posts, carousels, and reels to social accounts connected under the{' '}
                        <strong>TASKIZ</strong> profile at{' '}
                        <a href="https://app.upload-post.com" target="_blank" rel="noreferrer">
                            app.upload-post.com
                        </a>
                        . Docs:{' '}
                        <a href="https://docs.upload-post.com/" target="_blank" rel="noreferrer">
                            docs.upload-post.com
                        </a>
                        .
                    </p>
                    <ol className="steps-list">
                        <li>Connect Instagram, TikTok, Facebook, LinkedIn, X under profile TASKIZ</li>
                        <li>Approve creatives in the studio queue</li>
                        <li>Publish → choose platforms → Upload-Post posts for you</li>
                    </ol>
                </section>
            </div>
        </main>
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
    const [benchmarks, setBenchmarks] = useState([]);
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

    const updateStore = useCallback((patch) => {
        setStore((prev) => {
            const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
            saveStore(next);
            return next;
        });
    }, []);

    useEffect(() => {
        api.health()
            .then(setHealth)
            .catch(() => setHealth({ ok: false, grok: false, uploadPost: false }));
        api.brand()
            .then((b) => {
                setBrand(b);
                applyBrandCss(b);
            })
            .catch(console.error);
        api.packs()
            .then((d) => setPacks(d.packs || []))
            .catch(console.error);
        api.styles()
            .then((d) => setStyles(d.styles || []))
            .catch(console.error);
        api.flows()
            .then((d) => setFlows(d.flows || []))
            .catch(console.error);
        api.videoModels()
            .then((d) => setVideoModels(d.models || []))
            .catch(console.error);
        api.benchmarks()
            .then((d) => setBenchmarks(d.workflows || []))
            .catch(console.error);
    }, []);

    const counts = useMemo(() => {
        const items = store.items || [];
        return {
            total: items.length,
            approved: items.filter((i) => i.status === 'approved' || i.status === 'published').length,
        };
    }, [store.items]);

    async function handleGenerateBatch(packId, options = {}) {
        setLoadingBatch(true);
        try {
            const batch = await api.batch(packId, options);
            updateStore({
                items: batch.items,
                packId: batch.packId,
                packLabel: batch.packLabel,
                generatedAt: batch.generatedAt,
                styleId: batch.styleId,
                flowId: batch.flowId,
                videoModelId: batch.videoModelId,
            });
            setView('queue');
            setToast(
                `${batch.items.length} ideas · ${batch.videoModelId || 'grok'} · style locked`
            );
        } catch (e) {
            setToast(e.message);
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
                patchItem(item.id, {
                    imageUrl: result.imageUrl,
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
                const started = await api.startVideo({
                    prompt: beat.videoPrompt || current.videoPrompt,
                    imageUrl: beat.imageUrl,
                    format: 'reel',
                    duration: beat.durationSec || 5,
                    modelId: current.videoModelId || 'grok',
                    deliveryMode: current.deliveryMode || 'caption_talk',
                    generateAudio: current.generateAudio === true,
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

            // 3. Assemble + titles / HyperFrames project
            setToast('Assembling story + titles…');
            const assembled = await api.assembleStory({ item: current, burnTitles: true });
            patchItem(item.id, {
                beats: current.beats,
                imageUrl: current.beats[0]?.imageUrl,
                videoUrl: current.beats[0]?.videoUrl,
                composedVideoUrl: assembled.videoUrl,
                finalVideoUrl: assembled.videoUrl,
                graphicsEngine: assembled.graphicsEngine,
                hasVoice: assembled.hasVoice,
                storyLines: assembled.storyLines,
                hyperframes: assembled.hyperframes,
                status: 'ready',
                error: null,
            });
            const voiceNote = assembled.hasVoice
                ? ' · VO on'
                : assembled.voiceMeta?.reason === 'no_api_key'
                    ? ' · captions only (add ElevenLabs for voice)'
                    : '';
            setToast(
                assembled.titleWarning
                    ? `Story stitched (${assembled.beatCount} beats) — graphics fallback: ${assembled.graphicsEngine || 'stitch'}`
                    : `Story ready · ${assembled.graphicsEngine || 'assembled'} · ${assembled.beatCount} beats${voiceNote}`
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
            status: item.imageUrl || item.videoUrl ? 'ready' : 'idea',
            approvedAt: null,
        });
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
            setProfiles([{ username: 'TASKIZ' }]);
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

    return (
        <div className="app">
            <Sidebar view={view} setView={setView} counts={counts} health={health} />
            {view === 'create' && (
                <CreateView
                    packs={packs}
                    styles={styles}
                    flows={flows}
                    videoModels={videoModels}
                    benchmarks={benchmarks}
                    brand={brand}
                    onGenerate={handleGenerateBatch}
                    loading={loadingBatch}
                    health={health}
                />
            )}
            {(view === 'queue' || view === 'approved') && (
                <QueueView
                    items={queueItems}
                    packLabel={view === 'approved' ? 'Approved creatives' : store.packLabel}
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
                    onRemove={handleRemove}
                    onGenerateAll={handleGenerateAll}
                    onChangeVideoModel={handleChangeVideoModel}
                    videoModels={videoModels}
                    busy={busy}
                    generatingAll={generatingAll}
                />
            )}
            {view === 'character' && <CharacterView onToast={setToast} />}
            {view === 'scripts' && <ScriptClonerView brand={brand} onToast={setToast} />}
            {view === 'library' && <LibraryView onToast={setToast} />}
            {view === 'brand' && (
                <BrandView
                    brand={brand}
                    onSaved={(b) => {
                        setBrand(b);
                        applyBrandCss(b);
                    }}
                    onToast={setToast}
                />
            )}
            {view === 'settings' && <SettingsView health={health} />}

            {publishItem && (
                <PublishModal
                    item={publishItem}
                    profiles={profiles}
                    defaultUser="TASKIZ"
                    onClose={() => setPublishItem(null)}
                    onConfirm={confirmPublish}
                    loading={publishing}
                />
            )}
            <Toast message={toast} onDone={() => setToast('')} />
        </div>
    );
}

createRoot(document.getElementById('root')).render(<App />);
