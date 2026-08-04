/**
 * Universal ad layout engine (workspace-agnostic).
 *
 * Brand OS supplies: colors, CTA copy, logo, optional adDesign overrides.
 * This module supplies: canvas math, type scale, safe zones, stack rhythm.
 *
 * S = min(W, H)  → all type/spacing is a fraction of S (not hardcoded 1080).
 * Aspect profiles: square | portrait | story | landscape
 *
 * See: .agents/skills/ad-typography-and-layout/SKILL.md
 */

/** Default type scale as fraction of S = min(w,h) — from ad-typography skill */
export const DEFAULT_TYPE_SCALE = {
  /** Primary headline 6.5–8.5% of S — we use mid-high for feed readability */
  headline: 0.072,
  headlineSm: 0.062,
  /** Sub / support ~3.2–3.5% (skill body is 2.2–2.8%; we floor higher for still ads) */
  body: 0.032,
  /** CTA label ~2.8–3.5% */
  ctaLabel: 0.03,
  meta: 0.017,
  /** Line-height multipliers */
  headlineLeading: 1.18,
  bodyLeading: 1.35,
};

/** Spacing as fraction of S */
export const DEFAULT_SPACING = {
  pad: 0.074, // ~6–8% skill inner padding
  gapH1Body: 0.026,
  gapBodyCta: 0.034,
  gapLogoH1: 0.026,
  ctaH: 0.074,
  ctaRadius: 0.017,
  logoW: 0.185,
};

/**
 * Safe-zone insets as fraction of canvas H (skill: 9:16 top 10% / bottom 20%).
 * Applied to story / tall vertical only for critical chrome.
 */
export const SAFE_ZONES = {
  story: { top: 0.1, bottom: 0.12 }, // bottom slightly less than 20% — CTA needs room; platform UI still safe with pad
  portrait: { top: 0.05, bottom: 0.05 },
  square: { top: 0.06, bottom: 0.06 },
  landscape: { top: 0.06, bottom: 0.06 },
};

/**
 * Classify aspect into a layout profile.
 * @param {number} w
 * @param {number} h
 * @param {string} [aspectId] e.g. "9:16"
 */
export function layoutProfile(w, h, aspectId = '') {
  const id = String(aspectId || '');
  if (id === '9:16' || id === '9:19.5' || id === '9:20' || h / w >= 1.7) return 'story';
  if (id === '16:9' || id === '3:2' || id === '2.35:1' || w / h >= 1.4) return 'landscape';
  if (id === '1:1' || Math.abs(w - h) < 8) return 'square';
  if (h > w) return 'portrait';
  return 'square';
}

/**
 * Merge brand.adDesign overrides into defaults.
 * @param {object} brand getBrand() / brand.json
 */
export function resolveAdDesign(brand = {}) {
  const d = brand.adDesign || brand.adLayout || {};
  const fonts = brand.fonts || {};
  // First family name from "Outfit, Inter, system-ui"
  const displayFont = String(d.displayFont || fonts.display || fonts.sans || 'Outfit')
    .split(',')[0]
    .trim()
    .replace(/['"]/g, '') || 'Outfit';

  const type = { ...DEFAULT_TYPE_SCALE, ...(d.typeScale || {}) };
  const space = { ...DEFAULT_SPACING, ...(d.spacing || {}) };

  // Allow top-level shorthand overrides
  if (d.headlineScale != null) type.headline = Number(d.headlineScale);
  if (d.bodyScale != null) type.body = Number(d.bodyScale);
  if (d.ctaHeightScale != null) space.ctaH = Number(d.ctaHeightScale);
  if (d.padScale != null) space.pad = Number(d.padScale);

  return {
    displayFont,
    type,
    space,
    /** When true, story profile uses vertical safe zones */
    safeZoneVertical: d.safeZoneVertical !== false,
    /** Max support lines on still ads */
    maxSupportLines: d.maxSupportLines != null ? Number(d.maxSupportLines) : 1,
    /** Drop support if it repeats headline */
    dedupeSupport: d.dedupeSupport !== false,
  };
}

/**
 * Build pixel tokens for a canvas from brand + dimensions.
 * @param {{ w: number, h: number, aspectId?: string, brand?: object }} opts
 */
export function buildLayoutTokens({ w, h, aspectId = '', brand = {} } = {}) {
  const S = Math.min(w, h);
  const px = (frac) => Math.max(1, Math.round(S * frac));
  const design = resolveAdDesign(brand);
  const profile = layoutProfile(w, h, aspectId);
  const safe = SAFE_ZONES[profile] || SAFE_ZONES.square;

  // Story: larger bottom pad so CTA clears platform chrome
  let padTop = px(design.space.pad);
  let padBot = px(design.space.pad);
  if (design.safeZoneVertical && profile === 'story') {
    padTop = Math.max(padTop, Math.round(h * safe.top));
    padBot = Math.max(padBot, Math.round(h * safe.bottom * 0.55)); // keep CTA usable; full 20% is often too much for ads
  }

  const h1 = px(design.type.headline);
  const h1Sm = px(design.type.headlineSm);
  const body = Math.max(px(design.type.body), Math.round(S * 0.028)); // floor ~2.8% of S
  const ctaLabel = px(design.type.ctaLabel);
  const meta = px(design.type.meta);

  const colors = brand.colors || {};
  const ctaFill =
    colors.brandDeep || colors.brand || colors.primary || colors.accent || '#663CF6';
  const dark = colors.dark || colors.ink || '#141233';
  const textOnDark = colors.textOnDark || '#FFFFFF';

  return {
    S,
    w,
    h,
    profile,
    displayFont: design.displayFont,
    maxSupportLines: design.maxSupportLines,
    dedupeSupport: design.dedupeSupport,
    pad: Math.max(padTop, padBot) === padTop && padTop === padBot ? padTop : Math.max(padTop, padBot),
    padTop,
    padBot,
    gapH1Body: px(design.space.gapH1Body),
    gapBodyCta: px(design.space.gapBodyCta),
    gapLogoH1: px(design.space.gapLogoH1),
    h1,
    h1Sm,
    body,
    ctaLabel,
    meta,
    h1Lead: Math.round(h1 * design.type.headlineLeading),
    h1SmLead: Math.round(h1Sm * design.type.headlineLeading),
    bodyLead: Math.round(body * design.type.bodyLeading),
    ctaH: px(design.space.ctaH),
    ctaRadius: px(design.space.ctaRadius),
    logoW: px(design.space.logoW),
    logoH: Math.round(px(design.space.logoW) * (28 / 108)),
    scrim: dark,
    ctaFill,
    textOnDark,
    brandName: brand.name || '',
    primaryCta: brand.primaryCta || (brand.ctas && brand.ctas[0]) || 'Learn more',
    website: brand.website || '',
    /** For landscape future: text column width fraction */
    landscapeTextCol: 0.45,
  };
}

/**
 * Bottom-up stack: CTA → support → headline.
 * Guarantees no overlapping baselines between blocks.
 */
export function stackFromBottom({
  canvasH,
  padBot,
  ctaH,
  hLines,
  hLead,
  hSize,
  sLines,
  sLead,
  sSize,
  gapH1Body,
  gapBodyCta,
  reserveMeta = 0,
}) {
  const ctaY = canvasH - padBot - ctaH - reserveMeta;

  let sY0 = null;
  let cursorTop;

  if (sLines?.length) {
    const sLastY = ctaY - gapBodyCta - Math.round(sSize * 0.2);
    sY0 = sLastY - (sLines.length - 1) * sLead;
    cursorTop = sY0 - Math.round(sSize * 0.9);
  } else {
    cursorTop = ctaY - gapBodyCta;
  }

  const hLastY = cursorTop - gapH1Body - Math.round(hSize * 0.15);
  const hY0 = hLastY - (hLines.length - 1) * hLead;
  const typeTop = hY0 - Math.round(hSize * 0.95);

  return { ctaY, sY0, hY0, typeTop };
}

/**
 * Drop support that repeats the headline (multi-client copy safety).
 */
export function cleanSupport(raw, headline = '', { maxLen = 52, dedupe = true } = {}) {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  if (dedupe && headline) {
    const norm = (t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const nh = norm(headline);
    const ns = norm(s);
    if (nh && (ns === nh || nh.includes(ns) || ns.includes(nh))) return '';
    if (nh && ns) {
      const hw = new Set(nh.split(' ').filter((w) => w.length > 3));
      const sw = ns.split(' ').filter((w) => w.length > 3);
      const hit = sw.filter((w) => hw.has(w)).length;
      if (sw.length && hit / sw.length >= 0.55) return '';
    }
  }

  if (s.length > maxLen) s = s.slice(0, maxLen - 2).replace(/\s+\S*$/, '');
  return s;
}

/** Self-check hooks for generators / QA (skill checklist) */
export function layoutSelfCheck({ w, h, profile, typeTop, ctaY, ctaH, padTop, padBot }) {
  const issues = [];
  if (profile === 'story') {
    if (typeTop < h * 0.08) issues.push('type too close to top (story safe zone)');
    if (ctaY + ctaH > h - h * 0.08) issues.push('CTA may collide with bottom platform UI');
  }
  if (padTop < 40 || padBot < 40) issues.push('padding under 40px — risk of edge clip');
  return { ok: issues.length === 0, issues };
}
