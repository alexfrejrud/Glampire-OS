/**
 * Still-image batches for posters / social banners.
 * Brand OS stays locked; prompt steers campaign; diversify rotates cast/wardrobe/set.
 */

import { getBrand, buildImagePrompt } from './brand.js';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Krea-style aspect presets for posters & social */
export const IMAGE_ASPECTS = [
  { id: '1:1', label: '1:1 Square', short: '1:1', description: 'Feed posts, square posters', ico: '□' },
  { id: '4:5', label: '4:5 Portrait', short: '4:5', description: 'Instagram portrait feed', ico: '▯' },
  { id: '2:3', label: '2:3 Poster', short: '2:3', description: 'Classic print poster', ico: '▯' },
  { id: '9:16', label: '9:16 Story', short: '9:16', description: 'Stories / Reels cover', ico: '▮' },
  { id: '16:9', label: '16:9 Wide', short: '16:9', description: 'YouTube / web banner', ico: '▭' },
  { id: '3:2', label: '3:2 Landscape', short: '3:2', description: 'Photo landscape', ico: '▭' },
  { id: '4:3', label: '4:3 Classic', short: '4:3', description: 'Slide / presentation', ico: '▭' },
  { id: '2.35:1', label: '2.35:1 Cinema', short: '2.35:1', description: 'Wide cinematic banner', ico: '▬' },
];

export const IMAGE_COUNTS = [
  { id: '4', label: '4 images', short: '4', description: 'Quick set', ico: '4' },
  { id: '6', label: '6 images', short: '6', description: 'Small campaign', ico: '6' },
  { id: '8', label: '8 images', short: '8', description: 'Solid batch', ico: '8' },
  { id: '12', label: '12 images', short: '12', description: 'Volume pack', ico: '12' },
];

/** Soft scene moods — not wardrobe locks; mix with diversify casts */
export const IMAGE_MOODS = [
  {
    id: 'field',
    label: 'Field',
    short: 'Field',
    description: 'Jobsite, truck, driveway, tools',
    ico: 'F',
    block:
      'documentary field photography on active jobsite or driveway, real tools and materials, dust and natural grit, no staged showroom',
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    short: 'Lifestyle',
    description: 'Human, everyday contractor life',
    ico: 'L',
    block:
      'authentic lifestyle marketing photo, peer-to-peer energy, candid body language, lived-in home or neighborhood context',
  },
  {
    id: 'product',
    label: 'Product-led',
    short: 'Product',
    description: 'Hands + phone / app moment',
    ico: 'P',
    block:
      'product-led commercial photo, hands using a simple smartphone app in context, phone screen soft/generic (no readable UI text or logos), grounded not flashy',
  },
  {
    id: 'abstract',
    label: 'Abstract brand',
    short: 'Abstract',
    description: 'Texture, light, no people',
    ico: 'A',
    block:
      'premium abstract brand still — materials, light, texture, architecture or sky. No people. No logos. Clean negative space for later type.',
  },
  {
    id: 'auto',
    label: 'Auto mix',
    short: 'Mix',
    description: 'Rotate field / lifestyle / product',
    ico: 'M',
    block: null,
  },
];

/**
 * Distinct people + wardrobe + place so bulk gens do not clone one face/outfit.
 * Taskiz ICP: solo US contractors / trades — vary ethnicity, age, gender, trade vibe.
 */
const CAST_POOL = [
  {
    id: 'cast_mex_gc',
    label: 'Mexican American GC',
    subject:
      'Mexican American solo general contractor, early 40s, short dark hair, light stubble, warm skin tone, genuine tired-but-proud expression',
    wardrobe: 'faded navy work shirt, no logos, dusty jeans, scuffed work boots',
  },
  {
    id: 'cast_black_elec',
    label: 'Black electrician',
    subject:
      'Black American electrician, mid-30s, close-cropped hair, clean beard, focused calm expression',
    wardrobe: 'charcoal henley under open work vest, cargo pants, practical boots, no brand logos',
  },
  {
    id: 'cast_white_plumb',
    label: 'White plumber',
    subject:
      'white American plumber, late 40s, salt-and-pepper hair, weathered hands, honest half-smile',
    wardrobe: 'heather gray t-shirt, well-worn jeans, tool belt hinted not costume-y, no logos',
  },
  {
    id: 'cast_latina_painter',
    label: 'Latina painter',
    subject:
      'Latina residential painter, early 30s, hair in practical ponytail, confident open expression',
    wardrobe: 'paint-flecked white tee under denim shirt, work pants, no brand logos',
  },
  {
    id: 'cast_asian_hvac',
    label: 'Asian HVAC tech',
    subject:
      'Asian American HVAC tech, mid-30s, neat short hair, practical glasses optional, quiet competent energy',
    wardrobe: 'dark work polo (no logo), khaki work pants, knee pads optional, no brands',
  },
  {
    id: 'cast_woman_gc',
    label: 'Woman GC',
    subject:
      'white woman general contractor, mid-40s, hair pulled back, sun-touched skin, direct eye contact, peer not model',
    wardrobe: 'olive field shirt, jeans, work boots dusty from job, no logos',
  },
  {
    id: 'cast_black_woman',
    label: 'Black woman contractor',
    subject:
      'Black woman contractor, late 30s, natural hair practical, warm professional energy, real not stock-model smile',
    wardrobe: 'navy performance work tee, utility pants, simple boots, no logos',
  },
  {
    id: 'cast_older_roofer',
    label: 'Older roofer',
    subject:
      'older American roofer, mid-50s, sun-creased face, gray at temples, steady trustworthy presence',
    wardrobe: 'sun-faded red flannel over tee, heavy jeans, gloves tucked, no logos',
  },
  {
    id: 'cast_young_land',
    label: 'Young landscaper',
    subject:
      'young Latino landscaper, mid-20s, athletic build, easy smile, early-career energy',
    wardrobe: 'sun-bleached tee, cargo shorts or work pants, ball cap optional (no logo), boots',
  },
  {
    id: 'cast_middle_east',
    label: 'Middle Eastern handyman',
    subject:
      'Middle Eastern American handyman, early 40s, short beard, kind serious eyes',
    wardrobe: 'plain black work shirt, dark jeans, tool bag nearby, no logos',
  },
  {
    id: 'cast_duo_hint',
    label: 'Solo with truck',
    subject:
      'solo contractor mid-career, ambiguous multi-ethnic features, grounded everyday look — not a fashion model',
    wardrobe: 'random practical workwear mix (tee + flannel or hoodie), always no logos',
  },
  {
    id: 'cast_hands_only',
    label: 'Hands detail',
    subject:
      'close detail of weathered working hands (no full face required), age-inclusive, real skin texture',
    wardrobe: 'sleeves rolled, simple work fabric, dirt under nails optional, no logos',
  },
];

const SETTING_POOL = [
  'residential driveway next to a work truck at golden hour',
  'half-finished kitchen remodel interior, natural window light',
  'backyard patio project with materials staged casually',
  'open garage workshop with organized-but-real clutter',
  'front porch of a suburban home, overcast soft light',
  'jobsite lunch break by the truck, thermos and clipboard',
  'vanity mirror / bathroom remodel dust in air, window light',
  'neighborhood street curb with tools laid out neatly',
  'empty dining table at night with phone and paper invoices',
  'early morning coffee in truck cab before first job',
  'sunlit backyard fence repair mid-work',
  'clean but lived-in home office corner with laptop closed',
];

const LIGHT_POOL = [
  'warm golden hour side light',
  'soft overcast daylight, even and honest',
  'bright mid-day sun with natural hard shadows',
  'cool blue-hour exterior, practical work lights',
  'window-lit interior, gentle falloff',
  'late afternoon long shadows across concrete',
];

const MOOD_ROTATION = ['field', 'lifestyle', 'product', 'field', 'lifestyle', 'product'];

function pickAspect(id) {
  return IMAGE_ASPECTS.find((a) => a.id === id) || IMAGE_ASPECTS[0];
}

function pickMood(id) {
  return IMAGE_MOODS.find((m) => m.id === id) || IMAGE_MOODS.find((m) => m.id === 'auto');
}

function resolveMoodBlock(moodId, index) {
  const mood = pickMood(moodId);
  if (mood?.id === 'auto' || !mood?.block) {
    const rot = MOOD_ROTATION[index % MOOD_ROTATION.length];
    return pickMood(rot)?.block || IMAGE_MOODS[0].block;
  }
  return mood.block;
}

function buildSubjectLine({ diversify, index, prompt, moodId }) {
  const moodBlock = resolveMoodBlock(moodId, index);

  if (!diversify) {
    return [
      `Marketing still for a mobile business app for solo contractors.`,
      `Campaign direction (follow): ${prompt}.`,
      `Scene mood: ${moodBlock}.`,
      `Vary natural composition; do not invent product logos or UI chrome.`,
    ].join(' ');
  }

  const cast = CAST_POOL[index % CAST_POOL.length];
  const setting = SETTING_POOL[index % SETTING_POOL.length];
  const light = LIGHT_POOL[index % LIGHT_POOL.length];

  // Offset wardrobe slightly so same cast index on re-run still shifts
  const wardrobeTwist =
    index % 3 === 0
      ? cast.wardrobe
      : index % 3 === 1
        ? `${cast.wardrobe}, slightly different layering than stock photos`
        : `${cast.wardrobe}, more casual end-of-day look`;

  return [
    `Photoreal marketing still for Taskiz (simple contractor business app).`,
    `Campaign direction (what the image is about — follow): ${prompt}.`,
    `UNIQUE CAST for this frame only (#${index + 1}): ${cast.subject}.`,
    `Wardrobe (this frame only): ${wardrobeTwist}.`,
    `Setting: ${setting}.`,
    `Light: ${light}.`,
    `Scene mood: ${moodBlock}.`,
    `Critical diversity rule: do NOT reuse the same face, outfit, or location as other images in this set. This frame must look like a different real person / moment.`,
    `No logos, no readable app UI text, no brand marks painted in-scene.`,
  ].join(' ');
}

/**
 * Build N download-ready image ideas (prompts only — client/API generates pixels).
 */
export function generateImageBatch(options = {}) {
  const brand = getBrand();
  const prompt = String(options.prompt || options.batchBrief || options.brief || '').trim();
  if (!prompt) {
    const err = new Error('prompt is required for image batches');
    err.status = 400;
    throw err;
  }

  const aspect = pickAspect(options.aspectRatio || options.aspect || '1:1');
  const countRaw = Number(options.count || options.n || 4);
  const count = Math.min(Math.max(Number.isFinite(countRaw) ? countRaw : 4, 1), 12);
  const diversify = options.diversify !== false && options.diversity !== false;
  const moodId = options.moodId || options.mood || 'auto';
  const mood = pickMood(moodId);

  const items = [];
  for (let i = 0; i < count; i++) {
    const imageSubject = buildSubjectLine({
      diversify,
      index: i,
      prompt,
      moodId,
    });
    const cast = diversify ? CAST_POOL[i % CAST_POOL.length] : null;
    const headline =
      count === 1
        ? prompt.slice(0, 80)
        : `${prompt.slice(0, 48)}${prompt.length > 48 ? '…' : ''} · ${i + 1}/${count}`;

    const idea = {
      format: 'post',
      pillar: 'proof',
      headline,
      body: prompt,
      caption: prompt,
      cta: brand.primaryCta || 'Start Free',
      imageSubject,
      batchBrief: prompt,
      aspectRatio: aspect.id,
      kind: 'still_batch',
      diversify,
      moodId: mood?.id || 'auto',
      castId: cast?.id || null,
      castLabel: cast?.label || null,
    };

    const imagePrompt = buildImagePrompt(
      {
        ...idea,
        format: 'post',
        aspectRatio: aspect.id,
        batchBrief: diversify
          ? null // diversity already baked into imageSubject; avoid double-locking one cast
          : prompt,
        styleImageBlock: resolveMoodBlock(moodId, i),
      },
      {}
    );

    // Force aspect language (buildImagePrompt defaults to format table 1:1)
    const aspectLine = `Strict framing aspect ratio ${aspect.id} (${aspect.description}). Compose for that canvas; safe margins for later type.`;
    const fullPrompt = `${imagePrompt} ${aspectLine}`.replace(/\s+/g, ' ').trim();

    items.push({
      id: uid(),
      ideaId: null,
      priority: i,
      status: 'idea',
      createdAt: new Date().toISOString(),
      pillar: 'proof',
      pillarLabel: 'Still batch',
      format: 'post',
      formatLabel: 'Image',
      kind: 'still_batch',
      aspectRatio: aspect.id,
      size: aspect.id,
      platforms: ['instagram', 'facebook', 'linkedin', 'web'],
      headline,
      body: prompt,
      caption: prompt,
      cta: brand.primaryCta || 'Start Free',
      brandChrome: 'organic',
      batchBrief: prompt,
      batchMode: 'images',
      imageSubject,
      moodId: mood?.id || 'auto',
      moodLabel: mood?.label || 'Auto mix',
      castId: cast?.id || null,
      castLabel: cast?.label || null,
      diversify,
      imagePrompt: fullPrompt,
      videoPrompt: null,
      imageUrl: null,
      videoUrl: null,
      finalVideoUrl: null,
      composedVideoUrl: null,
      slides: [],
      beats: [],
      storyMode: false,
      error: null,
      approvedAt: null,
      publishedAt: null,
    });
  }

  return {
    packId: 'images',
    packLabel: `Images · ${aspect.short}`,
    generatedAt: new Date().toISOString(),
    brandNote: brand.oneLiner,
    batchBrief: prompt,
    batchMode: 'images',
    aspectRatio: aspect.id,
    count,
    diversify,
    moodId: mood?.id || 'auto',
    items,
  };
}

export function listImageBatchOptions() {
  return {
    aspects: IMAGE_ASPECTS,
    counts: IMAGE_COUNTS,
    moods: IMAGE_MOODS.map(({ id, label, short, description, ico }) => ({
      id,
      label,
      short,
      description,
      ico,
    })),
  };
}
