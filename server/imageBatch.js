/**
 * Still-image batches for posters / social banners.
 * Fully Brand OS–driven: ICP, category, photographyStyle — never a hardcoded client.
 */

import { getBrand, buildImagePrompt } from './brand.js';
import { detectBrandDomain, brandTalkCharacter, inferVisualWorld } from './brandCast.js';

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

/** Soft scene moods — descriptions stay generic; blocks resolve per brand */
export const IMAGE_MOODS = [
  {
    id: 'field',
    label: 'In-world',
    short: 'World',
    description: 'Real environments where the ICP lives',
    ico: 'F',
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    short: 'Lifestyle',
    description: 'Human, everyday ICP life',
    ico: 'L',
  },
  {
    id: 'product',
    label: 'Product-led',
    short: 'Product',
    description: 'Hands + phone / app moment',
    ico: 'P',
  },
  {
    id: 'abstract',
    label: 'Abstract brand',
    short: 'Abstract',
    description: 'Texture, light, no people',
    ico: 'A',
  },
  {
    id: 'auto',
    label: 'Auto mix',
    short: 'Mix',
    description: 'Rotate world / lifestyle / product',
    ico: 'M',
  },
];

const MOOD_ROTATION = ['field', 'lifestyle', 'product', 'field', 'lifestyle', 'product'];

const LIGHT_POOL = [
  'warm golden hour side light',
  'soft overcast daylight, even and honest',
  'bright mid-day sun with natural hard shadows',
  'cool blue-hour exterior, practical practical light',
  'window-lit interior, gentle falloff',
  'late afternoon long shadows',
];

/** Cast pool from Brand OS ICP + visual world (works for any onboarded client) */
function castPoolForBrand(brand) {
  const cast = brandTalkCharacter(brand);
  const world = inferVisualWorld(brand);
  const icp = [...(brand.icp?.primary || []), ...(brand.icp?.secondary || [])].filter(Boolean);
  const icpHint = icp[0] || brand.category || 'everyday person';
  const env = cast.environment || world.environment;
  const wardrobe = cast.wardrobe || world.wardrobe;

  // Always ICP-first variants — no hardcoded client
  const pool = [
    {
      id: 'icp_primary',
      label: 'Primary ICP',
      subject: `${cast.character} — frame hero matches: ${icpHint}`,
      wardrobe,
    },
    {
      id: 'icp_secondary',
      label: 'Secondary ICP',
      subject: `authentic person representing: ${icp[1] || icpHint}, different age/gender presentation from frame 1, peer energy, ${env}`,
      wardrobe: `${wardrobe}, slight variation`,
    },
    {
      id: 'icp_peer',
      label: 'Peer moment',
      subject: `one hero matching ICP (${icpHint}) mid-conversation or candid craft moment, ${env}, not fashion model`,
      wardrobe,
    },
    {
      id: 'icp_detail',
      label: 'Hands / craft detail',
      subject: `close detail of hands using tools of this craft (phone, instrument, laptop, notebook as ICP fits), real skin texture, ${env} soft bokeh`,
      wardrobe: 'simple sleeves, no logos',
    },
    {
      id: 'icp_outcome',
      label: 'Outcome calm',
      subject: `same ICP world (${icpHint}), calmer after-progress expression, ${env}, natural light`,
      wardrobe,
    },
    {
      id: 'icp_community',
      label: 'Community energy',
      subject: `authentic ${icpHint} in a community/collaboration hint (second person soft bokeh OK), culturally real, ${env}`,
      wardrobe,
    },
  ];

  // Trades / music get a bit more specialized variety when world is known
  if (world.id === 'music') {
    pool.push(
      {
        id: 'm_studio',
        label: 'Studio creator',
        subject: `independent creator ICP (${icpHint}) in home studio / writing setup, headphones or notebook, peer UGC`,
        wardrobe,
      },
      {
        id: 'm_city',
        label: 'City creative',
        subject: `independent creator ICP (${icpHint}) city sidewalk or apartment light, candid not glam`,
        wardrobe,
      }
    );
  }
  if (world.id === 'trades') {
    pool.push(
      {
        id: 't_field',
        label: 'Field operator',
        subject: `owner-operator ICP (${icpHint}) on residential site or truck, tired-proud energy`,
        wardrobe,
      },
      {
        id: 't_admin',
        label: 'Admin moment',
        subject: `same ICP (${icpHint}) with phone as business tool, kitchen table or truck cab, real not staged`,
        wardrobe,
      }
    );
  }

  return pool;
}

function settingPoolForBrand(brand) {
  const cast = brandTalkCharacter(brand);
  const world = inferVisualWorld(brand);
  const base = cast.environment || world.environment;
  // Expand one environment string into varied settings
  return [
    base,
    `${base}, golden hour side light`,
    `${base}, soft overcast daylight`,
    `${base}, window-lit interior falloff`,
    `${base}, blue hour practical lights`,
    `quiet moment in the world of: ${base}`,
    `lived-in detail of: ${base}`,
    `wider establishing shot of: ${base}, still room for subject`,
  ];
}

function moodBlockForBrand(brand, moodId, index) {
  const cast = brandTalkCharacter(brand);
  const photo = cast.photo || brand.photographyStyle || 'documentary commercial photography, authentic subjects, natural light';
  const id = moodId === 'auto' ? MOOD_ROTATION[index % MOOD_ROTATION.length] : moodId;

  if (id === 'abstract') {
    return `premium abstract brand still — materials, light, texture. No people. No logos. Clean negative space for later type. Photography style: ${photo}.`;
  }
  if (id === 'product') {
    return `product-led commercial photo, hands using a simple smartphone in context matching ${brand.category || 'the brand'} / ICP ${cast.icpLine}, phone screen soft/generic (no readable UI text or logos), grounded not flashy. Style: ${photo}.`;
  }
  if (id === 'lifestyle') {
    return `authentic lifestyle marketing photo for ${brand.category || 'this brand'}, ICP ${cast.icpLine}, peer-to-peer energy, candid body language, ${cast.environment}. Style: ${photo}.`;
  }
  return `documentary in-world photography: ${cast.environment}, ICP ${cast.icpLine}, real grit, no staged showroom. Style: ${photo}. Forbidden: ${cast.negativesExtra}.`;
}

function pickAspect(id) {
  return IMAGE_ASPECTS.find((a) => a.id === id) || IMAGE_ASPECTS[0];
}

function pickMood(id) {
  return IMAGE_MOODS.find((m) => m.id === id) || IMAGE_MOODS.find((m) => m.id === 'auto');
}

function brandCampaignFallback(brand, angleKey = 'auto') {
  const name = brand.name || 'the brand';
  const cat = brand.category || 'the product';
  const one = brand.oneLiner || brand.promise || '';
  const icp = (brand.icp?.primary || [])[0] || 'the customer';
  const map = {
    pain: `authentic ${icp} mid-friction with the old way of working in ${cat}, natural light, documentary commercial`,
    field: `authentic ${icp} in a real ${cat} context, phone as a tool, natural light, peer energy`,
    outcome: `authentic ${icp} in a calm after-progress moment related to ${one || cat}, clean composition`,
    one_app: `authentic ${icp} with one clear tool or app moment for ${name}, lifestyle commercial`,
    beta: `authentic ${icp} inviting a peer into ${name}, warm candid energy`,
    auto: `authentic documentary commercial subject for ${name} (${cat}): ${one}`.trim(),
  };
  return map[angleKey] || map.auto;
}

function buildSubjectLine({ brand, diversify, index, prompt, moodId }) {
  const moodBlock = moodBlockForBrand(brand, moodId, index);
  const name = brand.name || 'Brand';
  const cat = brand.category || '';
  const one = brand.oneLiner || brand.promise || '';
  const photo = brand.photographyStyle || '';
  const negs = brand.imageNegatives || 'no text, no logos, no fake UI';
  const comp = brand.compositionNotes || 'one hero moment, clean negative space for type';

  if (!diversify) {
    return [
      `Marketing still for ${name}${cat ? ` (${cat})` : ''}.`,
      one ? `Brand promise: ${one}.` : '',
      `Campaign direction (follow): ${prompt}.`,
      `Scene mood: ${moodBlock}.`,
      photo ? `Photography: ${photo}.` : '',
      `Composition: ${comp}.`,
      `Negatives: ${negs}.`,
      `Vary natural composition; do not invent product logos or UI chrome.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  const casts = castPoolForBrand(brand);
  const settings = settingPoolForBrand(brand);
  const cast = casts[index % casts.length];
  const setting = settings[index % settings.length];
  const light = LIGHT_POOL[index % LIGHT_POOL.length];

  const wardrobeTwist =
    index % 3 === 0
      ? cast.wardrobe
      : index % 3 === 1
        ? `${cast.wardrobe}, slightly different layering than stock photos`
        : `${cast.wardrobe}, more end-of-day candid look`;

  return [
    `Photoreal marketing still for ${name}${cat ? ` — ${cat}` : ''}.`,
    one ? `Brand promise (honor, do not contradict): ${one}.` : '',
    `Campaign direction (what the image is about — follow): ${prompt}.`,
    `UNIQUE CAST for this frame only (#${index + 1}): ${cast.subject}.`,
    `Wardrobe (this frame only): ${wardrobeTwist}.`,
    `Setting: ${setting}.`,
    `Light: ${light}.`,
    `Scene mood: ${moodBlock}.`,
    photo ? `Photography system: ${photo}.` : '',
    `Composition: ${comp}.`,
    `Critical diversity rule: do NOT reuse the same face, outfit, or location as other images in this set.`,
    `Critical brand rule: subjects and settings must fit ${name}'s world (${cat || 'brand category'}) — never default to unrelated industries.`,
    `Negatives: ${negs}. No logos, no readable app UI text, no brand marks painted in-scene.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Build N download-ready image ideas (prompts only — client/API generates pixels).
 */
export function generateImageBatch(options = {}) {
  const brand = getBrand();
  let prompt = String(options.prompt || options.batchBrief || options.brief || '').trim();
  if (!prompt) {
    // Brand-native fallback instead of failing when UI omits brief
    prompt = brandCampaignFallback(brand, options.angleId || 'auto');
  }

  const aspect = pickAspect(options.aspectRatio || options.aspect || '1:1');
  const countRaw = Number(options.count || options.n || 4);
  const count = Math.min(Math.max(Number.isFinite(countRaw) ? countRaw : 4, 1), 12);
  const diversify = options.diversify !== false && options.diversity !== false;
  const moodId = options.moodId || options.mood || 'auto';
  const mood = pickMood(moodId);
  const casts = castPoolForBrand(brand);

  const items = [];
  for (let i = 0; i < count; i++) {
    const imageSubject = buildSubjectLine({
      brand,
      diversify,
      index: i,
      prompt,
      moodId,
    });
    const cast = diversify ? casts[i % casts.length] : null;
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
      cta: brand.primaryCta || brand.ctas?.[0] || 'Learn more',
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
        batchBrief: diversify ? null : prompt,
        styleImageBlock: moodBlockForBrand(brand, moodId, i),
      },
      {}
    );

    const aspectLine = `Strict framing aspect ratio ${aspect.id} (${aspect.description}). Compose for that canvas; safe margins for later type.`;
    const brandLock = `Brand lock: ${brand.name} · ${brand.category || ''} · ICP ${(brand.icp?.primary || []).slice(0, 2).join(', ')}. Do not depict unrelated trades/jobsites unless this brand is in that category.`;
    const fullPrompt = `${imagePrompt} ${aspectLine} ${brandLock}`.replace(/\s+/g, ' ').trim();

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
      cta: brand.primaryCta || brand.ctas?.[0] || 'Learn more',
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
      brandId: brand.id || brand.name,
    });
  }

  return {
    packId: 'images',
    packLabel: `Images · ${aspect.short}`,
    generatedAt: new Date().toISOString(),
    brandNote: brand.oneLiner,
    brandId: brand.id || brand.name,
    brandName: brand.name,
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

/** Exported for adBatch brand-native empty briefs */
export function brandNativeCampaignBrief(angleId = 'auto') {
  return brandCampaignFallback(getBrand(), angleId === 'auto' ? 'auto' : angleId);
}
