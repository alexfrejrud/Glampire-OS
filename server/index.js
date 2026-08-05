import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateBatch,
  listPacks,
  getBrandPublic,
  rematerializeItem,
  regenItemScript,
} from './contentEngine.js';
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
  loadCalendar,
  saveCalendar,
  updateSettings as updateCalendarSettings,
  listSlotsInRange,
  upsertSlot,
  deleteSlot,
  deleteSlots,
  rescheduleSlot,
  autoPlan,
  fireSlot,
  fireSlots,
  refreshSlotStatus,
  calendarStats,
  preflightSlot,
  normalizeCreativeSnapshot,
} from './calendar.js';
import { loadQueue, saveQueue, mergeQueues } from './queueStore.js';
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
import { ensurePortraitStill, resolveStillPath } from './stillReframe.js';
import {
  listCreativeFormulas,
  buildCastSheet,
  buildUgcStillPrompt,
  checkDialogueDuration,
} from './creativeFormulas.js';
import {
  previewCharacterSheet,
  generateHeroStill,
  generateCastAngles,
  generateFullCharacterSheet,
  hasCharacterSheetKey,
} from './characterSheet.js';
import {
  cloneAdImage,
  cloneVideoStructure,
  hasCreativeCloneKey,
} from './creativeClone.js';
import {
  listNativeUiTemplates,
  getNativeUiTemplate,
  buildNativeUiPrompt,
  generateNativeUiAd,
} from './nativeUiAds.js';
import { logGeneration, listGenerations, auditStats } from './genAudit.js';
import { getBrand } from './brand.js';

dotenv.config();

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
    characterSheet: hasCharacterSheetKey(),
    creativeClone: hasCreativeCloneKey(),
    creativeTools: true,
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

/** Serve reframed still plates (exact 9:16 jpgs) */
app.get('/api/renders/stills/:fileName', (req, res) => {
  const filePath = resolveStillPath(req.params.fileName);
  if (!filePath) return res.status(404).json({ error: 'Not found' });
  res.type('jpg').sendFile(filePath);
});

/** Serve assembled story renders (?download=1 → attachment for Save As) */
app.get('/api/renders/:fileName', (req, res) => {
  try {
    const filePath = resolveRenderPath(req.params.fileName);
    if (!filePath) return res.status(404).json({ error: 'Not found' });
    const base = path.basename(filePath);
    const asDownload =
      req.query.download === '1' ||
      req.query.download === 'true' ||
      String(req.query.disposition || '').toLowerCase() === 'attachment';
    if (asDownload) {
      res.download(filePath, base);
      return;
    }
    res.type('video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  } catch (err) {
    const status = err.status || (err.code === 'ICLOUD_OFFLINE' ? 503 : 500);
    res.status(status).json({ error: err.message, code: err.code || 'RENDER_ERROR' });
  }
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

/* ── Creative Studio tools (Arcads playbook → our Grok/fal keys) ── */

app.get('/api/tools/formulas', (_req, res) => {
  res.json(listCreativeFormulas());
});

app.post('/api/tools/dialogue-check', (req, res) => {
  const { dialogue, durationSec } = req.body || {};
  res.json(checkDialogueDuration(dialogue, durationSec));
});

app.post('/api/tools/ugc-still-prompt', (req, res) => {
  try {
    const prompt = buildUgcStillPrompt({ brand: getBrand(), ...(req.body || {}) });
    res.json({ prompt });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Cast lock sheet — optional save to brand.castBrief */
app.post('/api/tools/cast-sheet', (req, res) => {
  try {
    const body = req.body || {};
    const result = buildCastSheet({ brand: getBrand(), ...body });
    if (body.saveToBrand) {
      saveBrandOverrides({ castBrief: result.briefLine });
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/tools/character-sheet/preview', (req, res) => {
  try {
    const expanded = previewCharacterSheet(req.body?.description, getBrand());
    res.json(expanded);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/tools/character-sheet/hero', async (req, res) => {
  try {
    const result = await generateHeroStill({
      description: req.body?.description,
      aspectRatio: req.body?.aspectRatio || '9:16',
      brand: getBrand(),
    });
    res.json(result);
  } catch (err) {
    console.error('[character-sheet/hero]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code, details: err.details });
  }
});

app.post('/api/tools/character-sheet/angles', async (req, res) => {
  try {
    const result = await generateCastAngles({
      heroImageUrl: req.body?.heroImageUrl,
      basePrompt: req.body?.basePrompt,
      angleIds: req.body?.angleIds,
      aspectRatio: req.body?.aspectRatio || '9:16',
      saveToLibrary: req.body?.saveToLibrary !== false,
      castName: req.body?.castName || 'cast',
      tags: req.body?.tags || [],
    });
    res.json(result);
  } catch (err) {
    console.error('[character-sheet/angles]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code, details: err.details });
  }
});

app.post('/api/tools/character-sheet/full', async (req, res) => {
  try {
    const result = await generateFullCharacterSheet({
      description: req.body?.description,
      aspectRatio: req.body?.aspectRatio || '9:16',
      brand: getBrand(),
      saveToLibrary: req.body?.saveToLibrary !== false,
    });
    res.json(result);
  } catch (err) {
    console.error('[character-sheet/full]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code, details: err.details });
  }
});

app.post('/api/tools/clone/ad-image', async (req, res) => {
  try {
    const { dataUrl, base64, mediaType } = req.body || {};
    const result = await cloneAdImage({ dataUrl, base64, mediaType, brand: getBrand() });
    logGeneration({ kind: 'clone_ad_image', model: result.model, provider: result.provider });
    res.json(result);
  } catch (err) {
    console.error('[clone/ad-image]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

app.post('/api/tools/clone/video', async (req, res) => {
  try {
    const { dataUrl, base64, mediaType, description } = req.body || {};
    const result = await cloneVideoStructure({
      dataUrl,
      base64,
      mediaType,
      description,
      brand: getBrand(),
    });
    logGeneration({ kind: 'clone_video', model: result.model, provider: result.provider });
    res.json(result);
  } catch (err) {
    console.error('[clone/video]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

app.get('/api/tools/native-ui', (_req, res) => {
  res.json({ templates: listNativeUiTemplates() });
});

app.get('/api/tools/native-ui/:id', (req, res) => {
  const t = getNativeUiTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  try {
    const built = buildNativeUiPrompt(req.params.id, req.query || {}, getBrand());
    res.json({ template: listNativeUiTemplates().find((x) => x.id === t.id), built });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/tools/native-ui/preview', (req, res) => {
  try {
    const { templateId, overrides } = req.body || {};
    const built = buildNativeUiPrompt(templateId, overrides || {}, getBrand());
    res.json(built);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/tools/native-ui/generate', async (req, res) => {
  try {
    const { templateId, overrides, n } = req.body || {};
    const result = await generateNativeUiAd({
      templateId,
      overrides: overrides || {},
      brand: getBrand(),
      n,
    });
    res.json(result);
  } catch (err) {
    console.error('[native-ui/generate]', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code, details: err.details });
  }
});

app.get('/api/tools/audit', (req, res) => {
  const limit = Number(req.query.limit) || 40;
  res.json({
    stats: auditStats(),
    entries: listGenerations({ limit, kind: req.query.kind || undefined }),
  });
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
      'castBrief',
      'environment',
      'wardrobe',
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
 * Regen spoken script on a story reel (keep stills/beat videos; clear final for re-assemble).
 * body: { item, rotateAngle?: boolean }
 */
app.post('/api/story/regen-script', (req, res) => {
  try {
    const { item, rotateAngle } = req.body || {};
    if (!item) return res.status(400).json({ error: 'item is required' });
    const next = regenItemScript(item, {
      rotateAngle: rotateAngle !== false,
    });
    res.json({ item: next });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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

    // Story reels / vertical always 9:16 — never trust a stray 16:9 from the client
    const isVertical = format === 'reel' || format === 'story';
    const ratio = isVertical ? '9:16' : aspectRatio || aspectForFormat(format);
    const refs = [];
    if (referenceImage) refs.push(referenceImage);
    if (Array.isArray(referenceImages)) refs.push(...referenceImages);

    // Reinforce portrait + composition so models don't ignore aspect_ratio or clip faces
    let finalPrompt = String(prompt || '');
    if (isVertical || ratio === '9:16') {
      finalPrompt = `${finalPrompt} STRICT FRAME: vertical portrait 9:16 only (1080x1920), tall phone frame, NOT landscape, NOT 16:9, NOT horizontal, NOT square. COMPOSITION LOCK — TALKING HEAD: medium close-up only; face fills 40-55% of frame height (subject LARGE, close to camera); FULL head inside frame (forehead + chin + hair not cut off); eyes in the upper third; both shoulders when possible; lower third empty/clean for captions; background soft bokeh. FORBIDDEN: wide establishing office shot; tiny person far from camera; desk/table filling bottom half; laptop/monitors as heroes; landscape phone; face cut by edges; empty wall dominating. Upright phone selfie / interview distance only.`;
    }

    // When matchReference is true but no refs provided, still pure generate
    const result = await generateImage({
      prompt: finalPrompt,
      aspectRatio: ratio,
      n,
      referenceImage: matchReference || refs.length ? refs[0] || null : null,
      referenceImages: refs.length > 1 ? refs.slice(1) : null,
    });
    logGeneration({
      kind: 'image',
      model: result.model || 'grok-imagine',
      mode: result.mode || 'generate',
      aspectRatio: ratio,
      n: result.urls?.length || 1,
      provider: 'xai',
      workspaceId: getActiveWorkspaceId(),
    });

    // Reels: always reframe to exact 1080x1920 (pad, never crop) so i2v/UI never face-cut
    let imageUrl = result.urls[0];
    let imageUrls = result.urls;
    let reframed = false;
    if (isVertical && imageUrl) {
      try {
        const framed = await ensurePortraitStill(imageUrl, {
          w: 1080,
          h: 1920,
          id: Date.now().toString(36),
        });
        imageUrl = framed.publicUrl;
        imageUrls = [framed.publicUrl];
        reframed = true;
      } catch (e) {
        console.warn('[image] portrait reframe failed, using raw URL:', e.message);
      }
    }

    res.json({
      imageUrl,
      imageUrls,
      model: result.model,
      mode: result.mode || 'generate',
      aspectRatio: isVertical ? '9:16' : result.aspectRatio || ratio,
      reframed,
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
    const cost = estimateVideoCost({
      modelId: resolvedModel,
      beatCount: 1,
      durationSec: duration != null ? Number(duration) : 5,
      generateAudio: wantAudio,
    });
    logGeneration({
      kind: 'video_start',
      modelId: started.modelId,
      provider: started.provider,
      generateAudio: wantAudio,
      aspectRatio: ratio,
      estUsd: cost.estimatedUsd,
      workspaceId: getActiveWorkspaceId(),
    });
    res.json({
      status: 'pending',
      requestId: started.requestId,
      modelId: started.modelId,
      modelLabel: started.modelLabel,
      provider: started.provider,
      generateAudio: wantAudio,
      costEstimate: cost,
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

/* ───── Creative queue (server backup — survives browser localStorage loss) ───── */

app.get('/api/queue', (_req, res) => {
  try {
    const queue = loadQueue();
    res.json({
      ok: true,
      workspaceId: getActiveWorkspaceId(),
      ...queue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Peek queue sizes for every workspace (recovery UI) */
app.get('/api/queue/all', (_req, res) => {
  try {
    const list = listWorkspaces().map((w) => {
      const q = loadQueue(w.id);
      return {
        workspaceId: w.id,
        name: w.name,
        itemCount: q.items?.length || 0,
        packLabel: q.packLabel || null,
        updatedAt: q.updatedAt || null,
      };
    });
    res.json({ ok: true, queues: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/queue', (req, res) => {
  try {
    const body = req.body || {};
    const saved = saveQueue(body);
    res.json({
      ok: true,
      workspaceId: getActiveWorkspaceId(),
      itemCount: saved.items.length,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Merge client local queue with server; returns winner and persists if server was empty/stale */
app.post('/api/queue/sync', (req, res) => {
  try {
    const local = req.body || {};
    const server = loadQueue();
    const merged = mergeQueues(local, server);
    // Persist merged if it has items (and may update server from local)
    if ((merged.items || []).length > 0) {
      saveQueue(merged);
    }
    res.json({
      ok: true,
      workspaceId: getActiveWorkspaceId(),
      ...merged,
      itemCount: merged.items?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ───── Studio Calendar (Upload-Post send engine) ───── */

app.get('/api/calendar', (req, res) => {
  try {
    const { from, to } = req.query || {};
    const doc = listSlotsInRange({ from, to });
    const stats = calendarStats();
    res.json({
      ok: true,
      workspaceId: getActiveWorkspaceId(),
      settings: doc.settings,
      slots: doc.slots,
      updatedAt: doc.updatedAt,
      lastAutoPlan: doc.lastAutoPlan,
      stats: stats.counts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calendar/stats', (_req, res) => {
  try {
    res.json({ ok: true, workspaceId: getActiveWorkspaceId(), ...calendarStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calendar/settings', (req, res) => {
  try {
    const doc = updateCalendarSettings(req.body || {});
    res.json({ ok: true, settings: doc.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/slots', (req, res) => {
  try {
    const body = req.body || {};
    const slot = upsertSlot(body);
    res.status(201).json({ ok: true, slot });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/calendar/slots/:id', (req, res) => {
  try {
    const slot = upsertSlot({ ...req.body, id: req.params.id });
    res.json({ ok: true, slot });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/calendar/slots/:id/reschedule', (req, res) => {
  try {
    const { scheduledAt } = req.body || {};
    if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });
    const slot = rescheduleSlot(req.params.id, scheduledAt);
    res.json({ ok: true, slot });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/calendar/slots/:id', (req, res) => {
  try {
    deleteSlot(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/calendar/slots/delete-many', (req, res) => {
  try {
    const ids = req.body?.ids || [];
    const out = deleteSlots(ids);
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/preflight', (req, res) => {
  try {
    const body = req.body || {};
    const snap = body.creative
      ? { ...normalizeCreativeSnapshot(body.creative), ...body }
      : body;
    const doc = loadCalendar();
    const result = preflightSlot(snap, doc.settings);
    res.json({ ok: true, preflight: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Auto-plan approved creatives onto the calendar as drafts.
 * body: { creatives[], horizon, postsPerDay, everyNDays, formats, mix, weekends, emptyOnly, platforms }
 */
app.post('/api/calendar/auto-plan', (req, res) => {
  try {
    const body = req.body || {};
    const result = autoPlan({
      creatives: body.creatives || [],
      horizon: body.horizon || 'week',
      postsPerDay: body.postsPerDay ?? 2,
      everyNDays: body.everyNDays ?? 1,
      startDate: body.startDate || null,
      formats: body.formats || null,
      mix: body.mix || 'balanced',
      weekends: body.weekends || null,
      emptyOnly: body.emptyOnly !== false,
      platformsOverride: body.platforms || null,
    });
    res.json({
      ok: true,
      workspaceId: getActiveWorkspaceId(),
      created: result.created,
      message: result.message,
      slots: result.doc.slots,
      lastAutoPlan: result.doc.lastAutoPlan,
      settings: result.doc.settings,
    });
  } catch (err) {
    console.error('[calendar auto-plan]', err);
    res.status(500).json({ error: err.message });
  }
});

/** Fire one slot via Upload-Post: mode = schedule | now | queue */
app.post('/api/calendar/slots/:id/fire', async (req, res) => {
  try {
    const mode = req.body?.mode || 'schedule';
    const user = req.body?.user;
    const { slot, data } = await fireSlot(req.params.id, { mode, user });
    res.json({ ok: true, slot, data });
  } catch (err) {
    console.error('[calendar fire]', err.message);
    res.status(err.status || 500).json({
      error: err.message,
      preflight: err.preflight,
      details: err.details,
    });
  }
});

/** Bulk fire: { ids[], mode, user } */
app.post('/api/calendar/fire-batch', async (req, res) => {
  try {
    const ids = req.body?.ids || [];
    if (!ids.length) return res.status(400).json({ error: 'ids[] required' });
    const out = await fireSlots(ids, {
      mode: req.body?.mode || 'schedule',
      user: req.body?.user,
    });
    res.json({
      ok: true,
      results: out.results,
      slots: out.calendar.slots,
      stats: calendarStats().counts,
    });
  } catch (err) {
    console.error('[calendar fire-batch]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calendar/slots/:id/status', async (req, res) => {
  try {
    const out = await refreshSlotStatus(req.params.id);
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/calendar/undo-auto-plan', (req, res) => {
  try {
    const doc = loadCalendar();
    const last = doc.lastAutoPlan;
    if (!last?.at) {
      return res.status(400).json({ error: 'Nothing to undo' });
    }
    const cutoff = new Date(last.at).getTime();
    const before = doc.slots.length;
    // Remove draft slots from the last auto-plan window (not yet sent to Upload-Post)
    doc.slots = doc.slots.filter((s) => {
      if (s.source !== 'auto-plan' || s.status !== 'draft') return true;
      const t = new Date(s.createdAt || 0).getTime();
      return Math.abs(t - cutoff) >= 120_000;
    });
    doc.lastAutoPlan = null;
    saveCalendar(doc);
    res.json({
      ok: true,
      removed: before - doc.slots.length,
      slots: doc.slots,
      message: 'Auto-plan drafts removed',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

