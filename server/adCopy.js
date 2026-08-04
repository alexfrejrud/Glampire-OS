/**
 * Brand-locked ad copy for static / social ads.
 * Uses Brand OS + GTM hero bank — no invented claims, filters do-not-say.
 */

import { getBrand } from './brand.js';

/** Performance angles (marketingskills-style) mapped to Taskiz truth */
export const AD_ANGLES = [
  {
    id: 'auto',
    label: 'Auto mix',
    short: 'Mix',
    description: 'Rotate pain / field / outcome / beta',
    ico: 'M',
  },
  {
    id: 'pain',
    label: 'Pain',
    short: 'Pain',
    description: 'Scattered admin, late invoices, five apps',
    ico: 'P',
  },
  {
    id: 'field',
    label: 'Field',
    short: 'Field',
    description: 'Truck, jobsite, phone-as-tool',
    ico: 'F',
  },
  {
    id: 'outcome',
    label: 'Outcome',
    short: 'Outcome',
    description: 'Get paid / stay organized from phone',
    ico: 'O',
  },
  {
    id: 'one_app',
    label: 'One app',
    short: 'One app',
    description: 'Customers → jobs → estimates → invoices',
    ico: '1',
  },
  {
    id: 'beta',
    label: 'Beta invite',
    short: 'Beta',
    description: 'Join the Beta conversion',
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
    description: 'Beta / Start Free push',
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

/** Verbatim / near-verbatim heroes from Taskiz Brand Guide + GTM */
const BANKS = {
  pain: {
    headlines: [
      'Stop running your business from five apps',
      'Paper notes. Midnight invoices. Enough.',
      'Admin chaos is costing you jobs',
      'Still juggling texts, notes, and invoices?',
      'Your business lives in too many places',
    ],
    supports: [
      'Customers, jobs, estimates & invoices — one simple app.',
      'Less admin. More money-making time.',
      'Built for the field, not a desk.',
    ],
    primary: [
      'Solo contractors deserve better than sticky notes and late nights.',
      'If your business runs from five different apps, this is for you.',
    ],
  },
  field: {
    headlines: [
      'Built for the field, not a desk',
      'Run your business from your phone',
      'Between jobs. In the truck. On site.',
      'Business side. Handled from the field.',
      'Phone out. Business in order.',
    ],
    supports: [
      'Customers, jobs, estimates & invoices from your phone.',
      'Practical tools — not enterprise bloat.',
      'Talk or type. Move work forward faster.',
    ],
    primary: [
      'Field-first software for handymen and small GCs.',
      'Capture the job while it’s still hot — from your phone.',
    ],
  },
  outcome: {
    headlines: [
      'Get paid faster — from your phone',
      'Professional invoices without the late night',
      'Stay organized. Move jobs forward.',
      'Estimates while the lead is still warm',
      'Look professional without heavy software',
    ],
    supports: [
      'Clean estimates & invoices — no midnight rebuild.',
      'One place for customers, schedule & history.',
      'AI Copilot for admin. You stay in control.',
    ],
    primary: [
      'Spend less time managing the business. More time making money.',
      'Same-day estimates. Faster invoices. From your phone.',
    ],
  },
  one_app: {
    headlines: [
      'Customers. Jobs. Invoices. One app.',
      'Everything in one place',
      'One simple app for the business side',
      'Stop the app hop',
      'Your contracting business. One home.',
    ],
    supports: [
      'Customers · jobs · estimates · invoices — not five apps.',
      'Simple mobile app for solo contractors.',
      'Run the business side from your phone.',
    ],
    primary: [
      'Taskiz: one mobile app for the work that used to live everywhere else.',
      'From customer to estimate to job to invoice — without the chaos.',
    ],
  },
  beta: {
    headlines: [
      'Join the Beta',
      'Built with contractors like you',
      'Beta open for field crews',
      'Come try Taskiz',
      'Simple app. Real contractors. Beta.',
    ],
    supports: [
      'Run your contracting business from your phone.',
      'Built with handymen & small GCs first.',
      'Practical tools between jobs — not fluffy SaaS.',
    ],
    primary: [
      'Join the Beta and run customers, jobs, and invoices from your phone.',
      'Early access for contractors who want less admin chaos.',
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
  const ctas = brand.ctas?.length ? brand.ctas : [brand.primaryCta || 'Join the Beta'];
  const obj = String(objectiveId || 'conversion').toLowerCase();
  if (obj === 'awareness') {
    return brand.secondaryCta || pick(ctas, 1) || 'See How It Works';
  }
  if (obj === 'retarget') {
    return brand.primaryCta || pick(ctas, 0) || 'Join the Beta';
  }
  // conversion — prefer Join the Beta / Start Free
  const preferred = ctas.find((c) => /beta|start free|get started/i.test(c));
  return preferred || brand.primaryCta || pick(ctas, index);
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

  let headline = scrubDoNotSay(pick(bank.headlines, index), brand.doNotSay);
  // On-ad support stays short brand lines — never paste campaign/plate brief onto creative
  let support = scrubDoNotSay(pick(bank.supports, index), brand.doNotSay);
  let primaryText = scrubDoNotSay(pick(bank.primary, index), brand.doNotSay);

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

  // Awareness: softer CTA framing; conversion: punchy headline can be beta
  if (objectiveId === 'beta' || angleId === 'beta') {
    headline = scrubDoNotSay(pick(BANKS.beta.headlines, index), brand.doNotSay);
  }

  const cta =
    scrubDoNotSay(opts.cta || ctaForObjective(brand, objectiveId, index), brand.doNotSay) ||
    brand.primaryCta ||
    'Join the Beta';

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
    website: brand.website || 'https://taskiz.ai',
  };
}

export function listAdCopyOptions() {
  return {
    angles: AD_ANGLES,
    objectives: AD_OBJECTIVES,
  };
}
