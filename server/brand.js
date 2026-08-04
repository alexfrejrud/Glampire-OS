/**
 * Brand OS helpers (workspace-scoped via brandLoader).
 * Client brand data drives creative prompts only — never dashboard chrome colors.
 */

import {
  getBrand as loadBrand,
  saveBrandOverrides as saveWorkspaceBrandOverrides,
  resetBrandOverrides as resetWorkspaceBrandOverrides,
  loadContentMeta,
} from './brandLoader.js';

/** Live brand for the active workspace (AsyncLocalStorage or persisted active). */
export function getBrand() {
  return loadBrand();
}

/** @deprecated Use getBrand() — never hardcode a client; loads active workspace only */
export const defaultBrand = getBrand();

/** Mutable export for legacy callers — prefer getBrand() */
export let brand = getBrand();

export function refreshBrand() {
  brand = getBrand();
  return brand;
}

export function saveBrandOverrides(partial) {
  const next = saveWorkspaceBrandOverrides(partial);
  brand = next;
  return next;
}

export function resetBrandOverrides() {
  const next = resetWorkspaceBrandOverrides();
  brand = next;
  return next;
}

/** Generic pillar defaults when a workspace has no content.json pillars yet */
export const pillars = {
  pain: {
    id: 'pain',
    label: 'Pain',
    description: 'Core friction the customer feels before the product',
  },
  demo: {
    id: 'demo',
    label: 'Product demo',
    description: 'Product or service in action',
  },
  before_after: {
    id: 'before_after',
    label: 'Before / after',
    description: 'Life without vs with the brand',
  },
  education: {
    id: 'education',
    label: 'Education',
    description: 'Practical tips the ICP should know',
  },
  trust: {
    id: 'trust',
    label: 'Trust & proof',
    description: 'Social proof, launch honesty, fit',
  },
};

export const formats = {
  post: {
    id: 'post',
    label: 'Post',
    aspectRatio: '1:1',
    size: '1080×1080',
    platforms: ['instagram', 'facebook', 'linkedin'],
    description: 'Single-image feed post',
  },
  carousel: {
    id: 'carousel',
    label: 'Carousel',
    aspectRatio: '1:1',
    size: '1080×1080',
    platforms: ['instagram', 'facebook', 'linkedin'],
    description: '3–6 slide story sequence',
  },
  reel: {
    id: 'reel',
    label: 'Reel',
    aspectRatio: '9:16',
    size: '1080×1920',
    platforms: ['instagram', 'facebook', 'tiktok', 'youtube'],
    description: 'Vertical short video (static → animate)',
  },
};

/**
 * Brand-safe Grok image prompt.
 * Critical: never ask the model to paint the brand name into the scene.
 * Optional styleId injects a video style pack (camera/lighting/energy).
 */
export function buildImagePrompt(idea, { styleId } = {}) {
  const b = getBrand();
  const subject = idea.imageSubject || idea.headline;
  const c = b.colors || {};
  const sid = styleId || idea.styleId || b.defaultVideoStyleId;

  // Lazy import avoided — style fragments inlined via dynamic require pattern not ideal in ESM.
  // Callers that have style should pass styleImageBlock; otherwise we use brand photography only.
  const styleBlock = idea.styleImageBlock || null;
  const styleNeg = idea.styleNegatives || null;

  const brief = idea.batchBrief || idea.brief || null;

  return [
    `Photorealistic marketing photograph (not an illustration, not a graphic design mockup).`,
    `Scene: ${subject}.`,
    styleBlock
      ? `Video style pack: ${styleBlock}.`
      : `Style: ${b.photographyStyle}.`,
    brief
      ? `Batch casting / direction brief (follow closely for subject identity, setting, energy): ${brief}.`
      : '',
    idea.styleCamera ? `Camera: ${idea.styleCamera}.` : '',
    idea.styleLighting ? `Lighting: ${idea.styleLighting}.` : '',
    idea.styleFraming ? `Framing: ${idea.styleFraming}.` : '',
    idea.styleSubjectRules ? `Subject rules: ${idea.styleSubjectRules}.` : '',
    `Composition: ${b.compositionNotes}`,
    `Color grade: ${idea.styleColorGrade || `natural daylight with subtle brand-inspired tones (${c.brand || '#111111'}, deep ${c.dark || '#141414'}, clean neutrals)`}. Do not paint logos or color blocks as graphics.`,
    `Aspect: ${formats[idea.format]?.aspectRatio || idea.aspectRatio || '1:1'} framing.`,
    `Strict negatives: ${b.imageNegatives}${styleNeg ? `; ${styleNeg}` : ''}.`,
    `Output must be a clean photo plate only — typography and logo will be added later in HyperFrames / design overlay.`,
    sid ? `Style id: ${sid}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildVideoPrompt(idea, { styleId, beatRole } = {}) {
  const b = getBrand();
  if (idea.videoPrompt) return idea.videoPrompt;

  const sid = styleId || idea.styleId || b.defaultVideoStyleId;
  const motion = idea.videoMotion;
  const styleBlock = idea.styleVideoBlock;
  const dialogue = idea.dialogue || idea.voiceLine || idea.spokenCaption || null;
  const talkFraming =
    idea.deliveryMode === 'diegetic_talk' ||
    idea.deliveryMode === 'caption_talk' ||
    sid === 'contractor_talk' ||
    sid === 'ultra_ugc';
  // Native speech costs $ — only when explicitly diegetic + generateAudio
  const wantNativeSpeech =
    idea.deliveryMode === 'diegetic_talk' && idea.generateAudio === true;

  const roleHint =
    beatRole === 'hook'
      ? 'HOOK — emotional confession / pattern interrupt. Viewer must feel seen in 1 second.'
      : beatRole === 'tension'
        ? 'TENSION — the cost of the chaos (time, money, stress). Do not resolve yet.'
        : beatRole === 'resolve'
          ? 'RESOLVE — relief + soft product sell. Calmer face, still speaking sincerely.'
          : '';

  const brief = idea.batchBrief || idea.brief || null;

  if (talkFraming && dialogue) {
    return [
      styleBlock ||
      'Authentic vertical UGC talking-head. Subject faces camera mid-conversation.',
      motion ? `Performance: ${motion}.` : '',
      roleHint,
      brief
        ? `Casting / performance brief for this batch: ${brief}. Match subject identity and energy.`
        : '',
      wantNativeSpeech
        ? `DIALOGUE (speak this line clearly in first person as the on-camera subject): "${dialogue}" Lip sync + native speech audio.`
        : `The subject is mid-conversation to camera (natural mouth movement, expressive face). Caption story line: "${dialogue}". Perfect lip-sync audio not required.`,
      'Eye contact with the lens. Peer-to-peer energy — not a radio announcer.',
      'No text, logos, captions, title cards, or UI burned into the video.',
      `Negatives: ${b.imageNegatives}. No silent staring at phone as the main action.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (styleBlock) {
    return [
      styleBlock,
      motion ? `Beat motion: ${motion}.` : '',
      roleHint,
      `Negatives: ${b.imageNegatives}. No text, logos, title cards, or UI in the generated video.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    motion ||
    [
      'Subtle cinematic motion from this still photograph.',
      'Slow camera push-in or gentle parallax; natural ambient movement only (fabric, light, dust, leaves).',
      'Keep people and environment stable and realistic.',
      'No text, no logos, no title cards, no logo morphs, no UI overlays, no sci-fi effects.',
      'Premium commercial energy, calm and grounded.',
      `Negatives: ${b.imageNegatives}`,
      sid ? `(style ${sid})` : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function brandSystemNote() {
  const b = getBrand();
  const category = b.category || 'brand';
  const tone = b.voice || 'practical, honest, specific — not fluffy marketing jargon';
  const doNot = (b.doNotSay || []).join('; ') || '(none listed)';
  const ctas = (b.ctas || []).join(', ') || b.primaryCta || 'Learn more';
  return `You write marketing content for ${b.name} (${category}).
Primary message: "${b.oneLiner || b.promise || ''}"
Supporting: ${b.supporting || b.promise || ''}
Never claim / avoid: ${doNot}.
Tone: ${tone}.
CTA options: ${ctas}.
ICP primary: ${(b.icp?.primary || []).join(', ') || 'see brand kit'}.`;
}

export function getBrandPublic() {
  const b = getBrand();
  const content = loadContentMeta();
  const pillarList =
    Array.isArray(content.pillars) && content.pillars.length
      ? content.pillars
      : Object.values(pillars);
  return {
    id: b.id,
    name: b.name,
    website: b.website,
    category: b.category,
    oneLiner: b.oneLiner,
    supporting: b.supporting,
    promise: b.promise,
    primaryCta: b.primaryCta,
    secondaryCta: b.secondaryCta,
    ctas: b.ctas,
    /** Creative palette only — do not apply to Glampire OS dashboard UI */
    colors: b.colors,
    fonts: b.fonts,
    icp: b.icp,
    doNotSay: b.doNotSay,
    photographyStyle: b.photographyStyle,
    imageNegatives: b.imageNegatives,
    compositionNotes: b.compositionNotes,
    defaultVideoStyleId: b.defaultVideoStyleId || 'documentary_commercial',
    defaultFlowId: b.defaultFlowId || 'pain_to_cta',
    defaultBrandChrome: b.defaultBrandChrome || 'organic',
    defaultVideoModelId: b.defaultVideoModelId || 'grok',
    pillars: pillarList,
    formats: Object.values(formats),
  };
}
