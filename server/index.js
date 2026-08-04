import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBatch, listPacks, getBrandPublic, rematerializeItem } from './contentEngine.js';
import { generateImageBatch, listImageBatchOptions } from './imageBatch.js';
import { generateAdBatch, listAdBatchOptions } from './adBatch.js';
import { composeAd, resolveAdRenderPath } from './adCompose.js';
import { saveBrandOverrides, resetBrandOverrides } from './brand.js';
import {
  listWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspace,
  getWorkspacePublic,
  createWorkspace,
  loadPublish,
  workspaceMiddleware,
  ensureClientsRoot,
} from './brandLoader.js';
import {
  getOnboardingPublic,
  saveStepAnswers,
  markStepComplete,
  setOnboardingStep,
  runResearch,
  lockBrandOs,
  reopenOnboarding,
  saveOnboardingAsset,
  initOnboardingForNewWorkspace,
  loadDrafts,
  ONBOARDING_STEPS,
} from './onboarding.js';
import {
  generateImage,
  aspectForFormat,
  hasGrokKey,
} from './grok.js';
import {
  startUnifiedVideo,
  pollUnifiedVideo,
  generateUnifiedVideoAndWait,
  hasFalKey,
} from './mediaVideo.js';
import {
  listVideoModelsWithAvailability,
  getVideoModel,
  estimateVideoCost,
} from './videoModels.js';
import {
  hasUploadPostKey,
  getMe,
  listProfiles,
  createProfile,
  publishCreative,
  getUploadStatus,
} from './uploadPost.js';
import {
  REF_ROLES,
  listRefs,
  addRef,
  updateRef,
  deleteRef,
  resolveFilePath,
  buildRefPromptSnippet,
} from './refs.js';
import {
  reverseEngineerCharacter,
  hasVisionKey,
  visionProvider,
} from './reverseEngineer.js';
import { cloneScriptFormula, hasScriptCloneKey } from './scriptCloner.js';
import {
  listVideoStyles,
  getVideoStyle,
  styleDirectorBrief,
  listQualityLanes,
} from './videoStyles.js';
import { listBenchmarks, getBenchmark, SCORECARD_RUBRIC } from './benchmarks.js';
import { listFlows, getFlow } from './flows.js';
import { assembleStoryReel, resolveRenderPath } from './storyAssembler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
// Character RE sends full data-URL screenshots; keep headroom for large phone photos
app.use(express.json({ limit: '25mb' }));

ensureClientsRoot();
// Bind active workspace for every /api request (header X-Workspace-Id)
app.use('/api', workspaceMiddleware);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'Glampire OS',
    workspaceId: getActiveWorkspaceId(),
    grok: hasGrokKey(),
    fal: hasFalKey(),
    uploadPost: hasUploadPostKey(),
    vision: hasVisionKey(),
    visionProvider: visionProvider(),
    scriptClone: hasScriptCloneKey(),
    story: true,
    videoModels: listVideoModelsWithAvailability().map((m) => ({
      id: m.id,
      available: m.available,
    })),
    // keep alias so older UI bits don't break
    blotato: false,
  });
});

/* ── Workspaces (clients as accounts) ── */
app.get('/api/workspaces', (_req, res) => {
  res.json({
    workspaces: listWorkspaces(),
    activeId: getActiveWorkspaceId(),
  });
});

app.get('/api/workspaces/active', (_req, res) => {
  res.json({ workspace: getWorkspacePublic() });
});

app.post('/api/workspaces/active', (req, res) => {
  try {
    const id = req.body?.id || req.body?.workspaceId;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const workspace = setActiveWorkspace(id);
    res.json({ workspace, activeId: id });
  } catch (err) {
    res.status(err.code === 'UNKNOWN_WORKSPACE' ? 404 : 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

app.post('/api/workspaces', (req, res) => {
  try {
    const { id, name, oneLiner, category, website } = req.body || {};
    const workspace = createWorkspace({ id, name, oneLiner, category });
    setActiveWorkspace(workspace.id);
    const onboarding = initOnboardingForNewWorkspace(workspace.id, {
      name: name || workspace.name,
      oneLiner: oneLiner || '',
      category: category || '',
      website: website || '',
    });
    res.status(201).json({
      workspace: getWorkspacePublic(workspace.id),
      onboarding,
      openOnboarding: true,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/publish-config', (_req, res) => {
  res.json({ publish: loadPublish(), workspaceId: getActiveWorkspaceId() });
});

/* ── Onboarding / Brand Brain ── */
app.get('/api/onboarding', (req, res) => {
  try {
    const id = req.query?.workspaceId || getActiveWorkspaceId();
    res.json({ onboarding: getOnboardingPublic(id), steps: ONBOARDING_STEPS });
  } catch (err) {
    res.status(err.code === 'UNKNOWN_WORKSPACE' ? 404 : 500).json({
      error: err.message,
      code: err.code,
    });
  }
});

app.put('/api/onboarding', (req, res) => {
  try {
    const stepId = req.body?.stepId || req.body?.step;
    const answers = req.body?.answers || req.body?.data || req.body;
    // strip control keys if whole body used
    const clean = { ...answers };
    delete clean.stepId;
    delete clean.step;
    delete clean.answers;
    delete clean.data;
    delete clean.workspaceId;
    delete clean.complete;
    let onboarding = saveStepAnswers(
      stepId || getOnboardingPublic().step,
      clean.answers || clean
    );
    if (req.body?.complete && stepId) {
      onboarding = markStepComplete(stepId);
    }
    res.json({ onboarding, workspace: getWorkspacePublic() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

app.post('/api/onboarding/step', (req, res) => {
  try {
    const { stepId, answers, complete } = req.body || {};
    if (!stepId) return res.status(400).json({ error: 'stepId is required' });
    if (answers) saveStepAnswers(stepId, answers);
    const onboarding = complete ? markStepComplete(stepId) : setOnboardingStep(stepId);
    res.json({ onboarding, workspace: getWorkspacePublic() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/onboarding/research', async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    // Persist latest answers before research
    if (req.body?.answers) {
      saveStepAnswers(req.body.stepId || 'channels', req.body.answers);
    }
    // Kick off async; if already running, return current state
    const onboarding = await runResearch(getActiveWorkspaceId(), { force });
    res.json({ onboarding, workspace: getWorkspacePublic() });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Research failed',
      onboarding: getOnboardingPublic(),
    });
  }
});

app.get('/api/onboarding/drafts', (_req, res) => {
  res.json({ drafts: loadDrafts() });
});

app.post('/api/onboarding/lock', (req, res) => {
  try {
    const result = lockBrandOs(getActiveWorkspaceId(), {
      brandOverrides: req.body?.brand || null,
      contentOverrides: req.body?.content || null,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/onboarding/reopen', (req, res) => {
  try {
    const step = req.body?.step || req.body?.stepId || null;
    const onboarding = reopenOnboarding(getActiveWorkspaceId(), { step });
    res.json({ onboarding, workspace: getWorkspacePublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/onboarding/assets', (req, res) => {
  try {
    const { kind, filename, dataBase64, mimeType } = req.body || {};
    const result = saveOnboardingAsset({ kind, filename, dataBase64, mimeType });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ── Video styles + story flows (programmable creative direction) ── */
app.get('/api/styles', (_req, res) => {
  res.json({ styles: listVideoStyles(), qualityLanes: listQualityLanes() });
});

/** Benchmark / test workflows for quality A/B */
app.get('/api/benchmarks', (_req, res) => {
  res.json({ workflows: listBenchmarks(), rubric: SCORECARD_RUBRIC });
});

app.get('/api/benchmarks/:id', (req, res) => {
  const wf = getBenchmark(req.params.id);
  if (!wf) return res.status(404).json({ error: 'Unknown benchmark' });
  res.json({ workflow: wf, rubric: SCORECARD_RUBRIC });
});

app.get('/api/styles/:id', (req, res) => {
  const style = getVideoStyle(req.params.id);
  res.json({
    style,
    directorBrief: styleDirectorBrief(style.id),
  });
});

app.get('/api/flows', (_req, res) => {
  res.json({ flows: listFlows() });
});

app.get('/api/flows/:id', (req, res) => {
  res.json({ flow: getFlow(req.params.id) });
});

/* ── Video models (Grok / Kling / Seedance / MiniMax) ── */
app.get('/api/video-models', (_req, res) => {
  res.json({
    models: listVideoModelsWithAvailability(),
    costGuide: {
      note: '3-beat story cost estimates (5s/beat). Use Grok for drafts.',
      grok_3x5s: '~$0 fal',
      kling_std_3x5s: '~$1.3',
      kling_pro_3x5s: '~$1.7',
      kling_pro_audio_3x5s: '~$2.5+',
    },
  });
});

/** Quick cost estimate before animate / build story */
app.post('/api/video-cost', (req, res) => {
  try {
    const {
      modelId = 'grok',
      beatCount = 3,
      durationSec = 5,
      generateAudio = false,
    } = req.body || {};
    res.json(
      estimateVideoCost({
        modelId,
        beatCount,
        durationSec,
        generateAudio,
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/video-models/:id', (req, res) => {
  const model = getVideoModel(req.params.id);
  res.json({
    model,
    available: listVideoModelsWithAvailability().find((m) => m.id === model.id)?.available,
  });
});

/* ── Voice (ElevenLabs — auto-pick peer voice for story reels) ── */
app.get('/api/voice', async (req, res) => {
  try {
    const { hasElevenLabs, pickVoice, listVoices } = await import('./elevenLabs.js');
    if (!hasElevenLabs()) {
      return res.json({
        available: false,
        reason: 'Set ELEVENLABS_API_KEY — voice is auto-picked (no Voice ID required)',
      });
    }
    const profile = req.query.profile || 'peer_male';
    const force = req.query.force === '1' || req.query.force === 'true';
    const pick = await pickVoice({ profile, force });
    let top = [];
    try {
      const voices = await listVoices();
      const { scoreVoiceForProfile } = await import('./elevenLabs.js');
      top = voices
        .map((v) => ({ name: v.name, voiceId: v.voiceId, score: scoreVoiceForProfile(v, profile) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    } catch {
      /* optional */
    }
    res.json({ available: true, pick, top, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List completed story finals so the UI can re-attach videos after a crash / Bad Gateway.
 * Returns map: itemId → { finalVideoUrl, composedVideoUrl, mtime }
 */
app.get('/api/renders', (_req, res) => {
  try {
    const dir = path.join(__dirname, 'data', 'renders');
    if (!fs.existsSync(dir)) return res.json({ finals: {}, items: [] });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('-final.mp4'));
    const finals = {};
    const items = [];
    for (const f of files) {
      const id = f.replace(/-final\.mp4$/, '');
      if (!id) continue;
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      const url = `/api/renders/${f}`;
      const entry = {
        id,
        fileName: f,
        finalVideoUrl: url,
        composedVideoUrl: url,
        mtime: st.mtimeMs,
        size: st.size,
      };
      finals[id] = entry;
      items.push(entry);
    }
    items.sort((a, b) => b.mtime - a.mtime);
    res.json({ finals, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Serve assembled story renders */
app.get('/api/renders/:fileName', (req, res) => {
  const filePath = resolveRenderPath(req.params.fileName);
  if (!filePath) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

/* ── Image reference library ── */
app.get('/api/refs', (_req, res) => {
  res.json({ refs: listRefs(), roles: REF_ROLES });
});

app.get('/api/refs/file/:fileName', (req, res) => {
  const filePath = resolveFilePath(req.params.fileName);
  if (!filePath) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

app.post('/api/refs', (req, res) => {
  try {
    const ref = addRef(req.body || {});
    res.status(201).json(ref);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/refs/:id', (req, res) => {
  const next = updateRef(req.params.id, req.body || {});
  if (!next) return res.status(404).json({ error: 'Not found' });
  res.json(next);
});

app.delete('/api/refs/:id', (req, res) => {
  const ok = deleteRef(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.post('/api/refs/prompt-snippet', (req, res) => {
  const ids = req.body?.ids || [];
  res.json({ snippet: buildRefPromptSnippet(ids) });
});

/** Character Reverse-Engineer — image → raw UGC prompt */
app.post('/api/refs/analyze', async (req, res) => {
  try {
    const { base64, mediaType, dataUrl } = req.body || {};
    let b64 = base64;
    let mime = mediaType || 'image/jpeg';
    if (!b64 && dataUrl?.startsWith('data:')) {
      const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'Invalid dataUrl' });
      mime = m[1];
      b64 = m[2];
    }
    if (!b64) return res.status(400).json({ error: 'base64 or dataUrl is required' });

    const result = await reverseEngineerCharacter({ base64: b64, mediaType: mime });
    res.json(result);
  } catch (err) {
    console.error('[refs/analyze]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

/** Script Formula Cloner — original script + new idea → Grok writes new script */
app.post('/api/scripts/clone', async (req, res) => {
  try {
    const { originalScript, newIdea, brandContext } = req.body || {};
    const result = await cloneScriptFormula({ originalScript, newIdea, brandContext });
    res.json(result);
  } catch (err) {
    console.error('[scripts/clone]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

app.get('/api/brand', (_req, res) => {
  res.json(getBrandPublic());
});

/** Save brand kit edits (colors, copy, visual rules) */
app.put('/api/brand', (req, res) => {
  try {
    const allowed = [
      'name',
      'website',
      'category',
      'oneLiner',
      'supporting',
      'promise',
      'primaryCta',
      'secondaryCta',
      'ctas',
      'colors',
      'fonts',
      'icp',
      'doNotSay',
      'photographyStyle',
      'imageNegatives',
      'compositionNotes',
      'defaultVideoStyleId',
      'defaultFlowId',
      'defaultVideoModelId',
    ];
    const body = req.body || {};
    const partial = {};
    for (const k of allowed) {
      if (body[k] !== undefined) partial[k] = body[k];
    }
    const brand = saveBrandOverrides(partial);
    res.json(getBrandPublic());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/brand/reset', (_req, res) => {
  try {
    resetBrandOverrides();
    res.json(getBrandPublic());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/packs', (_req, res) => {
  res.json({ packs: listPacks() });
});

/** Auto-generate a content batch — no freeform prompt required */
app.post('/api/batch', (req, res) => {
  const packId = req.body?.packId || 'weekly';
  const {
    styleId,
    flowId,
    storyMode,
    videoModelId,
    brandChrome,
    batchBrief,
    brief,
    batchMode,
  } = req.body || {};
  const batch = generateBatch(packId, {
    styleId,
    flowId,
    storyMode,
    videoModelId,
    brandChrome,
    batchBrief: batchBrief || brief || null,
    batchMode,
  });
  res.json(batch);
});

/** Still-image batch options (aspects, counts, moods) */
app.get('/api/batch/images/options', (_req, res) => {
  res.json(listImageBatchOptions());
});

/**
 * Still-image batch for posters / social banners.
 * body: { prompt, aspectRatio, count, diversify, moodId }
 * Returns queue items with imagePrompt ready — client generates pixels.
 */
app.post('/api/batch/images', (req, res) => {
  try {
    const batch = generateImageBatch(req.body || {});
    res.json(batch);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Brand-locked static ads — plate prompts + copy + template ids */
app.get('/api/batch/ads/options', (_req, res) => {
  res.json(listAdBatchOptions());
});

/**
 * Ad batch: same diversify plate factory as images + ad copy + template.
 * body: { prompt?, aspectRatio, count, diversify, moodId, angleId, objectiveId, templateId }
 */
app.post('/api/batch/ads', (req, res) => {
  try {
    const batch = generateAdBatch(req.body || {});
    res.json(batch);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * Compose finished ad PNG (logo + type + CTA) over a plate.
 * body: { plateUrl|imageUrl, headline, support, cta, templateId, aspectRatio, id }
 */
app.post('/api/ads/compose', async (req, res) => {
  try {
    const result = await composeAd(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[ads/compose]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Serve composed ad PNGs */
app.get('/api/renders/ads/:fileName', (req, res) => {
  const filePath = resolveAdRenderPath(req.params.fileName);
  if (!filePath) return res.status(404).json({ error: 'Not found' });
  res.type('png').sendFile(filePath);
});

/** Re-apply style/flow prompts on an existing item (client sends item, gets updated prompts/beats) */
app.post('/api/story/rematerialize', (req, res) => {
  try {
    const { item, styleId, flowId } = req.body || {};
    if (!item) return res.status(400).json({ error: 'item is required' });
    const next = rematerializeItem(item, { styleId, flowId });
    res.json({ item: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Assemble multi-beat videos into one story reel + titles/graphics.
 * body: { item }  — item.beats[].videoUrl required
 *
 * Captions (default): Whisper ASR of plate audio when speech is present.
 * brandChrome: organic (default) | ads | ads_endcard | ads_full
 */
app.post('/api/story/assemble', async (req, res) => {
  try {
    const item = req.body?.item;
    if (!item) return res.status(400).json({ error: 'item is required' });
    const brandChrome = req.body?.brandChrome || item?.brandChrome || 'organic';
    // Studio default: always ASR when audio exists (opt-out: useAsrCaptions: false)
    const useAsrCaptions =
      req.body?.useAsrCaptions !== false && item?.useAsrCaptions !== false;
    const result = await assembleStoryReel(item, {
      burnTitles: req.body?.burnTitles !== false,
      mixAudio: req.body?.mixAudio !== false,
      brandChrome,
      useAsrCaptions,
    });
    res.json({
      ok: true,
      videoUrl: result.finalVideoUrl,
      graphicsEngine: result.graphicsEngine,
      brandChrome: result.brandChrome || brandChrome,
      graphicsMeta: result.graphicsMeta || null,
      asrMeta: result.asrMeta || null,
      spokenCaptions: result.spokenCaptions || null,
      hasAudio: result.hasAudio || false,
      hasVoice: result.hasVoice || false,
      storyLines: result.storyLines || null,
      voiceMeta: result.voiceMeta
        ? {
          ok: result.voiceMeta.ok,
          reason: result.voiceMeta.reason || null,
          voice: result.voiceMeta.voice
            ? {
              name: result.voiceMeta.voice.name,
              voiceId: result.voiceMeta.voice.voiceId,
              source: result.voiceMeta.voice.source,
              profile: result.voiceMeta.voice.profile,
              score: result.voiceMeta.voice.score,
            }
            : null,
        }
        : null,
      audioMeta: result.audioMeta
        ? {
          volume: result.audioMeta.volume,
          duration: result.audioMeta.duration,
          hasVoice: result.audioMeta.hasVoice || false,
        }
        : null,
      beatCount: result.beatCount,
      titleWarning: result.titleWarning || null,
      hyperframes: {
        projectDir: result.hyperframes?.projectDir,
        id: result.hyperframes?.id,
      },
    });
  } catch (err) {
    console.error('[story/assemble]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Generate static image(s) for an idea via Grok Imagine.
 *  Pass referenceImage / referenceImages (data URI or https URL) to lock look via /images/edits.
 */
app.post('/api/generate/image', async (req, res) => {
  try {
    const {
      prompt,
      format = 'post',
      aspectRatio,
      n = 1,
      referenceImage,
      referenceImages,
      matchReference = false,
    } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const ratio = aspectRatio || aspectForFormat(format);
    const refs = [];
    if (referenceImage) refs.push(referenceImage);
    if (Array.isArray(referenceImages)) refs.push(...referenceImages);

    // When matchReference is true but no refs provided, still pure generate
    const result = await generateImage({
      prompt,
      aspectRatio: ratio,
      n,
      referenceImage: matchReference || refs.length ? refs[0] || null : null,
      referenceImages: refs.length > 1 ? refs.slice(1) : null,
    });
    res.json({
      imageUrl: result.urls[0],
      imageUrls: result.urls,
      model: result.model,
      mode: result.mode || 'generate',
      aspectRatio: ratio,
    });
  } catch (err) {
    console.error('[image]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

/**
 * Start animating a static into a Reel (async).
 * body.modelId | videoModelId: grok | kling | seedance_25 | minimax_h3
 */
app.post('/api/generate/video', async (req, res) => {
  try {
    const {
      prompt,
      imageUrl,
      duration,
      format = 'reel',
      aspectRatio,
      wait = false,
      modelId,
      videoModelId,
      generateAudio,
      deliveryMode,
      dialogue,
    } = req.body || {};

    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const ratio = aspectRatio || aspectForFormat(format);
    const resolvedModel = videoModelId || modelId || 'grok';
    // Kling native audio is paid — opt-in only. Grok speech comes free via dialogue-in-prompt.
    const wantAudio = generateAudio === true;
    const spokenLine = dialogue || null;

    if (wait) {
      const result = await generateUnifiedVideoAndWait({
        modelId: resolvedModel,
        prompt,
        imageUrl,
        duration: duration != null ? Number(duration) : undefined,
        aspectRatio: ratio,
        generateAudio: wantAudio,
        dialogue: spokenLine,
      });
      return res.json({
        status: 'done',
        videoUrl: result.url,
        requestId: result.requestId,
        modelId: result.modelId,
        modelLabel: result.modelLabel,
        provider: result.provider,
        generateAudio: wantAudio,
      });
    }

    const started = await startUnifiedVideo({
      modelId: resolvedModel,
      prompt,
      imageUrl,
      duration: duration != null ? Number(duration) : undefined,
      aspectRatio: ratio,
      generateAudio: wantAudio,
      dialogue: spokenLine,
    });
    res.json({
      status: 'pending',
      requestId: started.requestId,
      modelId: started.modelId,
      modelLabel: started.modelLabel,
      provider: started.provider,
      generateAudio: wantAudio,
    });
  } catch (err) {
    console.error('[video]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

/** Poll video job (Grok or fal, via unified job id) */
app.get('/api/generate/video/:requestId', async (req, res) => {
  try {
    const result = await pollUnifiedVideo(req.params.requestId);
    res.json(result);
  } catch (err) {
    console.error('[video-poll]', err.message);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

/** Generate images for all slides in a carousel */
app.post('/api/generate/carousel', async (req, res) => {
  try {
    const { slides = [], format = 'carousel' } = req.body || {};
    if (!slides.length) return res.status(400).json({ error: 'slides required' });

    const ratio = aspectForFormat(format);
    const results = [];

    for (const slide of slides) {
      const prompt = slide.imagePrompt || slide.prompt;
      if (!prompt) {
        results.push({ id: slide.id, error: 'missing prompt' });
        continue;
      }
      try {
        const out = await generateImage({ prompt, aspectRatio: ratio, n: 1 });
        results.push({ id: slide.id, imageUrl: out.urls[0] });
      } catch (e) {
        results.push({ id: slide.id, error: e.message });
      }
    }

    res.json({ slides: results });
  } catch (err) {
    console.error('[carousel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ───── Upload-Post ───── */

app.get('/api/upload-post/me', async (_req, res) => {
  try {
    const data = await getMe();
    res.json(data);
  } catch (err) {
    res.status(err.code === 'NO_UPLOAD_POST_KEY' ? 400 : err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

app.get('/api/upload-post/profiles', async (_req, res) => {
  try {
    const profiles = await listProfiles();
    res.json({ profiles });
  } catch (err) {
    res.status(err.code === 'NO_UPLOAD_POST_KEY' ? 400 : err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

app.post('/api/upload-post/profiles', async (req, res) => {
  try {
    const username = req.body?.username;
    if (!username) return res.status(400).json({ error: 'username required' });
    const data = await createProfile(username);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

/**
 * Publish approved creative via Upload-Post
 * body: {
 *   format, user, platforms[], caption, headline,
 *   mediaUrls[], videoUrl?, scheduledDate?, addToQueue?, facebookPageId?
 * }
 */
app.post('/api/upload-post/publish', async (req, res) => {
  try {
    const body = req.body || {};
    const publishCfg = loadPublish();
    const user = body.user || publishCfg.uploadPostUser || process.env.UPLOAD_POST_DEFAULT_USER;
    if (!user) return res.status(400).json({ error: 'user (Upload-Post profile) is required' });
    if (!body.platforms?.length) {
      return res.status(400).json({ error: 'platforms[] is required' });
    }

    const data = await publishCreative({ ...body, user });
    res.json({ ok: true, data, workspaceId: getActiveWorkspaceId(), user });
  } catch (err) {
    console.error('[upload-post publish]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
});

app.get('/api/upload-post/status/:requestId', async (req, res) => {
  try {
    const data = await getUploadStatus(req.params.requestId);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// Legacy Blotato routes → clear migration message
app.get('/api/blotato/accounts', (_req, res) => {
  res.status(410).json({
    error: 'Blotato was replaced by Upload-Post. Use /api/upload-post/profiles',
  });
});
app.post('/api/blotato/publish', (_req, res) => {
  res.status(410).json({
    error: 'Blotato was replaced by Upload-Post. Use /api/upload-post/publish',
  });
});

// Keep API alive on async errors (long Whisper/ffmpeg jobs should not take down the process)
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.stack || err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.stack || err);
});

// Bind IPv4 explicitly so proxy + curl http://127.0.0.1:8787 always work
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Glampire OS API → http://127.0.0.1:${PORT}`);
  console.log(`  Workspace:    ${getActiveWorkspaceId()}`);
  console.log(`  Workspaces:   ${listWorkspaces().map((w) => w.id).join(', ') || '(none)'}`);
  console.log(`  Grok:         ${hasGrokKey() ? 'ready' : 'MISSING (XAI_API_KEY)'}`);
  console.log(
    `  Upload-Post:  ${hasUploadPostKey() ? 'ready' : 'optional (UPLOAD_POST_API_KEY)'}`
  );
});

