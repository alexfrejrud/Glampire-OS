/**
 * Ad batch factory — same ops loop as Images, plus brand-locked copy + template.
 * Plate prompts stay photo-only; type/logo composed after gen (adCompose).
 */

import { getBrand } from './brand.js';
import { IMAGE_ASPECTS, IMAGE_MOODS, generateImageBatch } from './imageBatch.js';
import { buildAdCopy, listAdCopyOptions, AD_ANGLES, AD_OBJECTIVES } from './adCopy.js';
import { listAdTemplates, pickAdTemplateId, AD_ASPECT_PX } from './adCompose.js';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Prefer ad-friendly aspects */
/**
 * Ad canvas sizes. Plate gen maps unsupported Grok ratios (e.g. 4:5 → 3:4)
 * then compose still exports at the design aspect (cover-crop).
 */
export const AD_ASPECTS = [
  { id: '3:4', label: '3:4 Portrait', short: '3:4', description: 'IG-style portrait (Grok-native)', ico: '▯' },
  { id: '1:1', label: '1:1 Feed', short: '1:1', description: 'Meta / LinkedIn square', ico: '□' },
  { id: '4:5', label: '4:5 Feed', short: '4:5', description: 'IG feed crop · plate 3:4', ico: '▯' },
  { id: '9:16', label: '9:16 Story', short: '9:16', description: 'Stories / Reels cover', ico: '▮' },
  { id: '16:9', label: '16:9 Wide', short: '16:9', description: 'YouTube / web banner', ico: '▭' },
  { id: '2:3', label: '2:3 Poster', short: '2:3', description: 'Pinterest / print', ico: '▯' },
];

export const AD_COUNTS = [
  { id: '4', label: '4 ads', short: '4', description: 'Quick set', ico: '4' },
  { id: '6', label: '6 ads', short: '6', description: 'Small campaign', ico: '6' },
  { id: '8', label: '8 ads', short: '8', description: 'Solid batch', ico: '8' },
];

/** Default campaign when operator leaves brief empty but picks angle */
const DEFAULT_CAMPAIGNS = {
  pain: 'solo contractor overwhelmed by paper notes texts and late invoices at the kitchen table',
  field: 'owner-operator contractor on residential jobsite checking phone between tasks',
  outcome: 'contractor sending a clean invoice from phone in the truck after a job',
  one_app: 'handyman finally using one phone app for customers jobs and estimates',
  beta: 'small general contractor inviting peers to try a simple mobile business app',
  auto: 'authentic US contractor running the business side from a phone in the field',
};

function pickAspect(id) {
  return AD_ASPECTS.find((a) => a.id === id) || IMAGE_ASPECTS.find((a) => a.id === id) || AD_ASPECTS[0];
}

/**
 * Build N finished-ad queue items (plate prompt + copy + template).
 * Pixels: client generates plate then POST /api/ads/compose.
 */
export function generateAdBatch(options = {}) {
  const brand = getBrand();
  const angleId = options.angleId || options.angle || 'auto';
  const objectiveId = options.objectiveId || options.objective || 'conversion';
  const templatePref = options.templateId || options.template || 'auto';
  const aspect = pickAspect(options.aspectRatio || options.aspect || '3:4');
  const countRaw = Number(options.count || options.n || 6);
  const count = Math.min(Math.max(Number.isFinite(countRaw) ? countRaw : 6, 1), 8);
  const diversify = options.diversify !== false && options.diversity !== false;
  const moodId = options.moodId || options.mood || 'auto';

  let campaign = String(options.prompt || options.batchBrief || options.campaign || '').trim();
  if (!campaign) {
    const key = angleId === 'auto' ? 'auto' : angleId;
    campaign = DEFAULT_CAMPAIGNS[key] || DEFAULT_CAMPAIGNS.auto;
  }

  // Reuse image plate factory for diversify / cast / photography rules
  const plateBatch = generateImageBatch({
    prompt: campaign,
    aspectRatio: aspect.id,
    count,
    diversify,
    moodId,
  });

  const items = plateBatch.items.map((plateItem, i) => {
    const copy = buildAdCopy({
      angleId,
      objectiveId,
      campaign,
      index: i,
      cta: options.cta,
    });
    const templateId = pickAdTemplateId(templatePref, i);
    // Prefer story template when aspect is 9:16 and auto
    const finalTemplate =
      templatePref === 'auto' && aspect.id === '9:16' && i % 2 === 0
        ? 'story'
        : templatePref === 'auto' && objectiveId === 'conversion' && i % 4 === 3
          ? 'endcard'
          : templateId;

    const size = AD_ASPECT_PX[aspect.id];
    const sizeLabel = size ? `${size.w}×${size.h}` : aspect.id;

    return {
      ...plateItem,
      id: uid(),
      kind: 'ad_batch',
      batchMode: 'ads',
      format: 'post',
      formatLabel: 'Ad',
      pillar: copy.angleId,
      pillarLabel: AD_ANGLES.find((a) => a.id === copy.angleId)?.label || copy.angleId,
      headline: copy.headline,
      shortHeadline: copy.shortHeadline,
      body: copy.support,
      support: copy.support,
      primaryText: copy.primaryText,
      caption: copy.primaryText,
      cta: copy.cta,
      batchBrief: campaign,
      angleId: copy.angleId,
      objectiveId: copy.objectiveId,
      templateId: finalTemplate,
      templateLabel:
        listAdTemplates().find((t) => t.id === finalTemplate)?.label || finalTemplate,
      aspectRatio: aspect.id,
      size: sizeLabel,
      brandChrome: 'ads_full',
      // plate prompt already brand-safe photo-only
      imagePrompt: plateItem.imagePrompt,
      plateUrl: null,
      adUrl: null,
      imageUrl: null,
      videoUrl: null,
      composedVideoUrl: null,
      // meta for queue UI
      platforms:
        aspect.id === '9:16'
          ? ['instagram', 'facebook', 'tiktok']
          : aspect.id === '16:9'
            ? ['youtube', 'linkedin', 'web']
            : ['instagram', 'facebook', 'linkedin'],
      status: 'idea',
      error: null,
    };
  });

  return {
    packId: 'ads',
    packLabel: `Ads · ${aspect.short}`,
    generatedAt: new Date().toISOString(),
    brandNote: brand.oneLiner,
    batchBrief: campaign,
    batchMode: 'ads',
    aspectRatio: aspect.id,
    count,
    diversify,
    moodId,
    angleId,
    objectiveId,
    templateId: templatePref,
    items,
  };
}

export function listAdBatchOptions() {
  const copy = listAdCopyOptions();
  return {
    aspects: AD_ASPECTS,
    counts: AD_COUNTS,
    moods: IMAGE_MOODS.map(({ id, label, short, description, ico }) => ({
      id,
      label,
      short,
      description,
      ico,
    })),
    templates: listAdTemplates(),
    angles: copy.angles,
    objectives: copy.objectives,
  };
}
