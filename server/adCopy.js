/**
 * Brand-locked ad copy for static / social ads.
 * Uses Brand OS + GTM hero bank — no invented claims, filters do-not-say.
 */

import { getBrand } from './brand.js';

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
      'No enterprise bloat — just the job.',
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
      'From first touch to finished — without the chaos.',
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
      'Practical — not fluffy marketing.',
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

function scrubDoNotSay(text, doNotSay = []) {
  let t = String(text || '');
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
  return t;
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

  // Prefer Brand OS truth over generic banks
  let headline = scrubDoNotSay(
    brand.oneLiner || pick(bank.headlines, index),
    brand.doNotSay
  );
  let support = scrubDoNotSay(
    brand.promise || brand.supporting || pick(bank.supports, index),
    brand.doNotSay
  );
  let primaryText = scrubDoNotSay(
    brand.supporting || brand.promise || pick(bank.primary, index),
    brand.doNotSay
  );

  // Campaign only steers Meta/caption primary text lightly — not the designed support line
  if (campaign) {
    const steered = scrubDoNotSay(campaign, brand.doNotSay);
    // Prefer short support for design (≤72 chars reads clean on stills)
    if (support.length > 90) {
      support = support.slice(0, 87).replace(/\s+\S*$/, '') + '…';
    }
    if (steered.length > 12 && steered.length < 100) {
      primaryText = scrubDoNotSay(pick(bank.primary, index), brand.doNotSay);
    }
  } else if (support.length > 90) {
    support = support.slice(0, 87).replace(/\s+\S*$/, '') + '…';
  }

  if (objectiveId === 'beta' || angleId === 'beta') {
    headline = scrubDoNotSay(
      brand.primaryCta || brand.oneLiner || pick(BANKS.beta.headlines, index),
      brand.doNotSay
    );
  }

  const cta =
    scrubDoNotSay(opts.cta || ctaForObjective(brand, objectiveId, index), brand.doNotSay) ||
    brand.primaryCta ||
    'Learn more';

  // Meta-ish short headline (under ~40 recommended)
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
