/**
 * Brand-locked ad copy for static / social ads.
 * Multi-workspace: Brand OS supplies truth; angle banks add variety when fields collide.
 * Never invent claims — filter do-not-say; never restate headline as support.
 */

import { getBrand } from './brand.js';
import { isNearDuplicate, cleanSupport } from './adLayout.js';

/** Performance angles — generic; copy is filled from active Brand OS */
export const AD_ANGLES = [
  {
    id: 'auto',
    label: 'Auto mix',
    short: 'Mix',
    description: 'Rotate pain / proof / outcome / offer',
    ico: 'M',
  },
  {
    id: 'pain',
    label: 'Pain',
    short: 'Pain',
    description: 'Core friction the ICP feels',
    ico: 'P',
  },
  {
    id: 'field',
    label: 'In-context',
    short: 'Context',
    description: 'Real-world use moment',
    ico: 'F',
  },
  {
    id: 'outcome',
    label: 'Outcome',
    short: 'Outcome',
    description: 'Result after the product',
    ico: 'O',
  },
  {
    id: 'one_app',
    label: 'Offer',
    short: 'Offer',
    description: 'Product / promise clarity',
    ico: '1',
  },
  {
    id: 'beta',
    label: 'Conversion',
    short: 'Convert',
    description: 'Primary CTA push',
    ico: 'B',
  },
];

export const AD_OBJECTIVES = [
  {
    id: 'awareness',
    label: 'Awareness',
    short: 'Aware',
    description: 'Stop the scroll · brand recall',
    ico: 'A',
  },
  {
    id: 'conversion',
    label: 'Conversion',
    short: 'Convert',
    description: 'Primary CTA push',
    ico: 'C',
  },
  {
    id: 'retarget',
    label: 'Retarget',
    short: 'Retarget',
    description: 'Warm traffic · remind + CTA',
    ico: 'R',
  },
];

const ANGLE_ROTATION = ['pain', 'field', 'outcome', 'one_app', 'beta', 'pain'];

/** Generic fallback banks — overridden by brand fields in buildAdCopy */
const BANKS = {
  pain: {
    headlines: [
      'Still doing it the hard way?',
      'The old workflow is costing you',
      'Enough friction. Time for a better path.',
      'Something has to change',
      'Stop fighting your tools',
    ],
    supports: [
      'There is a clearer way to work.',
      'Less chaos. More progress.',
      'Built for how you actually work.',
    ],
    primary: [
      'If the old process is burning time, this is for you.',
      'You deserve tools that match the work.',
    ],
  },
  field: {
    headlines: [
      'Built for real work, not slide decks',
      'Where the work actually happens',
      'In the moment. On the ground.',
      'Context that matches your day',
      'Show up where it matters',
    ],
    supports: [
      'Practical tools for how you already work.',
      'No enterprise bloat. Just the job.',
      'Move work forward faster.',
    ],
    primary: [
      'Designed for people who live in the work.',
      'Capture the moment before it slips.',
    ],
  },
  outcome: {
    headlines: [
      'Get the result without the grind',
      'Finish faster. Look sharper.',
      'Stay organized. Move forward.',
      'Outcomes you can feel',
      'Less thrash. More progress.',
    ],
    supports: [
      'Clearer outcomes. Less late-night cleanup.',
      'One place for the work that used to scatter.',
      'You stay in control.',
    ],
    primary: [
      'Spend less time managing chaos. More time winning.',
      'Faster path from problem to done.',
    ],
  },
  one_app: {
    headlines: [
      'Everything in one place',
      'One home for the work',
      'Stop the tool hop',
      'Simple. Focused. Yours.',
      'One clear system',
    ],
    supports: [
      'Less switching. More shipping.',
      'Simple tools for serious operators.',
      'Clarity without the clutter.',
    ],
    primary: [
      'One place for the work that used to live everywhere else.',
      'From first touch to finished, without the chaos.',
    ],
  },
  beta: {
    headlines: [
      'Get started',
      'Built with people like you',
      'Ready when you are',
      'Come try it',
      'Simple product. Real operators.',
    ],
    supports: [
      'Start with the outcome that matters.',
      'Built with the people who do the work.',
      'Practical, not fluffy marketing.',
    ],
    primary: [
      'Get started and see the difference.',
      'Early access for operators who want less chaos.',
    ],
  },
};

function pick(arr, i) {
  if (!arr?.length) return '';
  return arr[i % arr.length];
}

/**
 * Still ads never use em/en dashes or " - " pause dashes (AI habit).
 * Keeps mid-word hyphens (real-time, owner-operator).
 */
export function scrubAdDashes(text) {
  let t = String(text || '');
  // Em dash, en dash, horizontal bar, minus as punctuation → sentence break
  t = t.replace(/\s*[—–―−]\s*/g, '. ');
  // Spaced hyphen used as a pause: "Practical - not fluffy"
  t = t.replace(/(\S)\s+-\s+(\S)/g, '$1. $2');
  // Cleanup double periods / spacing
  t = t
    .replace(/\.\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .replace(/\.\s+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Capitalize after ". " when we introduced a break mid-line
  t = t.replace(/\. ([a-z])/g, (_, c) => `. ${c.toUpperCase()}`);
  return t;
}

function scrubDoNotSay(text, doNotSay = []) {
  let t = scrubAdDashes(text);
  for (const phrase of doNotSay) {
    if (!phrase) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, '').replace(/\s{2,}/g, ' ').trim();
  }
  // Soft guardrails even if list drifts
  t = t
    .replace(/never miss (a|another) call/gi, '')
    .replace(/AI phone receptionist/gi, '')
    .replace(/AI employee/gi, '')
    .replace(/full field service/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return scrubAdDashes(t);
}

function resolveAngleId(angleId, index) {
  const raw = String(angleId || 'auto').toLowerCase();
  if (raw === 'auto' || raw === 'mix') return ANGLE_ROTATION[index % ANGLE_ROTATION.length];
  if (BANKS[raw]) return raw;
  return ANGLE_ROTATION[index % ANGLE_ROTATION.length];
}

function ctaForObjective(brand, objectiveId, index) {
  const ctas = brand.ctas?.length ? brand.ctas : [brand.primaryCta || 'Learn more'];
  const obj = String(objectiveId || 'conversion').toLowerCase();
  if (obj === 'awareness') {
    return brand.secondaryCta || pick(ctas, 1) || 'Learn more';
  }
  if (obj === 'retarget') {
    return brand.primaryCta || pick(ctas, 0) || 'Learn more';
  }
  const preferred = ctas.find((c) => /start|get|join|try|book|buy|demo/i.test(c));
  return preferred || brand.primaryCta || pick(ctas, index) || 'Learn more';
}

/**
 * Pick a short support line that does NOT restate the headline.
 * Still ads need punchy ≤~56 chars — long Brand OS paragraphs lose to angle banks.
 * Works for any workspace (Taskiz-style near-duplicate promise/oneLiner is common).
 */
function pickDistinctSupport(brand, bank, headline, index) {
  const shortBrand = [brand.adSupport, brand.tagline, brand.supporting, brand.promise]
    .map((s) => scrubDoNotSay(s, brand.doNotSay))
    .filter((s) => s && s.length <= 70);
  const longBrand = [brand.supporting, brand.promise]
    .map((s) => scrubDoNotSay(s, brand.doNotSay))
    .filter((s) => s && s.length > 70);
  const banks = [
    pick(bank.supports, index),
    pick(bank.supports, index + 1),
    pick(bank.primary, index),
  ]
    .map((s) => scrubDoNotSay(s, brand.doNotSay))
    .filter(Boolean);

  // Prefer short brand lines, then banks, then truncated long brand last
  const candidates = [...shortBrand, ...banks, ...longBrand];
  for (const c of candidates) {
    const cleaned = cleanSupport(c, headline, { maxLen: 56, dedupe: true });
    if (cleaned) return cleaned;
  }
  return '';
}

/**
 * Build structured ad copy for one creative.
 * @param {{ angleId?: string, objectiveId?: string, campaign?: string, index?: number, cta?: string }} opts
 */
export function buildAdCopy(opts = {}) {
  const brand = getBrand();
  const index = Number(opts.index) || 0;
  const angleId = resolveAngleId(opts.angleId || opts.angle, index);
  const bank = BANKS[angleId] || BANKS.pain;
  const objectiveId = String(opts.objectiveId || opts.objective || 'conversion').toLowerCase();
  const campaign = String(opts.campaign || opts.prompt || '').trim();

  // Rotate brand truth with angle headlines so a batch isn't 4× the same one-liner
  const brandHead = scrubDoNotSay(brand.oneLiner || brand.promise || '', brand.doNotSay);
  const bankHead = scrubDoNotSay(pick(bank.headlines, index), brand.doNotSay);
  let headline =
    index % 3 === 0 && brandHead
      ? brandHead
      : bankHead || brandHead || scrubDoNotSay(brand.name || 'Learn more', brand.doNotSay);

  if (objectiveId === 'beta' || angleId === 'beta') {
    // Conversion stills: lead with brand promise / one-liner when available
    headline = brandHead || scrubDoNotSay(pick(BANKS.beta.headlines, index), brand.doNotSay);
  }

  let support = pickDistinctSupport(brand, bank, headline, index);
  let primaryText = scrubDoNotSay(
    brand.supporting || brand.promise || pick(bank.primary, index),
    brand.doNotSay
  );
  if (primaryText && isNearDuplicate(primaryText, headline)) {
    primaryText = scrubDoNotSay(pick(bank.primary, index), brand.doNotSay) || support || headline;
  }

  // Campaign only steers Meta/caption primary text lightly
  if (campaign) {
    const steered = scrubDoNotSay(campaign, brand.doNotSay);
    if (steered.length > 12 && steered.length < 100) {
      primaryText = scrubDoNotSay(pick(bank.primary, index), brand.doNotSay) || steered;
    }
  }

  if (support.length > 72) {
    support = support.slice(0, 69).replace(/\s+\S*$/, '').trim();
  }

  const cta =
    scrubDoNotSay(opts.cta || ctaForObjective(brand, objectiveId, index), brand.doNotSay) ||
    brand.primaryCta ||
    'Learn more';

  const shortHeadline =
    headline.length > 42 ? `${headline.slice(0, 39).replace(/\s+\S*$/, '')}…` : headline;

  return {
    angleId,
    objectiveId,
    headline,
    shortHeadline,
    support,
    body: support,
    primaryText,
    caption: primaryText,
    cta,
    oneLiner: brand.oneLiner,
    brandName: brand.name,
    website: brand.website || '',
  };
}

export function listAdCopyOptions() {
  return {
    angles: AD_ANGLES,
    objectives: AD_OBJECTIVES,
  };
}
