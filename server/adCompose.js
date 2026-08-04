/**
 * Still-ad compose — plate photo + Brand OS type/logo (never AI-painted marks).
 *
 * Design system (Taskiz Brand Guide):
 *  - Colors: #9563FF brand · #663CF6 brandDeep · #141233 dark · white / ink
 *  - Type: Outfit Bold / SemiBold (bundled fonts)
 *  - Logo: official SVG recolored for plate
 *  - No full-frame purple wash; scrims for legibility; CTA = brandDeep
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { getBrand } from './brand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const ADS_DIR = path.join(__dirname, 'data', 'renders', 'ads');

export const AD_TEMPLATES = [
  {
    id: 'hero',
    label: 'Hero + type',
    short: 'Hero',
    description: 'Photo + bottom scrim, headline, CTA, logo',
    ico: 'H',
  },
  {
    id: 'panel',
    label: 'Brand panel',
    short: 'Panel',
    description: 'Photo upper · dark brand panel lower',
    ico: 'P',
  },
  {
    id: 'story',
    label: 'Story full',
    short: 'Story',
    description: 'Vertical ad · top logo · mid hook · CTA bar',
    ico: 'S',
  },
  {
    id: 'endcard',
    label: 'End card',
    short: 'End card',
    description: 'Dark conversion unit · logo + CTA (plate optional fade)',
    ico: 'E',
  },
];

const TEMPLATE_ROTATION = ['hero', 'panel', 'story', 'endcard'];

/** Pixel sizes for social exports */
export const AD_ASPECT_PX = {
  '1:1': { w: 1080, h: 1080 },
  '3:4': { w: 1080, h: 1440 },
  '4:5': { w: 1080, h: 1350 },
  '2:3': { w: 1080, h: 1620 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '3:2': { w: 1620, h: 1080 },
  '4:3': { w: 1440, h: 1080 },
  '2.35:1': { w: 1920, h: 817 },
};

function ensureAdsDir() {
  fs.mkdirSync(ADS_DIR, { recursive: true });
  return ADS_DIR;
}

function outfitFontFiles() {
  return ['Outfit-Regular.ttf', 'Outfit-SemiBold.ttf', 'Outfit-Bold.ttf']
    .map((n) => path.join(FONT_DIR, n))
    .filter((p) => fs.existsSync(p));
}

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, '../clients/taskiz/assets/taskiz-logo.svg'),
    path.join(__dirname, '../clients/taskiz/assets/Logo.svg'),
    path.join(__dirname, '../public/assets/taskiz-logo.svg'),
    path.join(__dirname, '../Brand/Brand Logo/Logo.svg'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function loadBrandLogoDataUri({ color = '#FFFFFF' } = {}) {
  const logoPath = resolveLogoPath();
  if (!logoPath) return null;
  let svg = fs.readFileSync(logoPath, 'utf8');
  svg = svg
    .replace(/fill="#262626"/gi, `fill="${color}"`)
    .replace(/fill="#000000"/gi, `fill="${color}"`)
    .replace(/fill="black"/gi, `fill="${color}"`)
    .replace(/fill="#0[bB]0[bB]0[cC]"/gi, `fill="${color}"`);
  if (!/fill=/.test(svg)) {
    svg = svg.replace(/<svg\b/, `<svg fill="${color}"`);
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Word-wrap for Outfit. maxChars is conservative — Outfit Bold is wide.
 * Prefer under-fill over edge clipping.
 */
function wrapLines(text, maxChars, maxLines = 3) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return [];
  const limit = Math.max(8, Math.floor(maxChars));
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > limit && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) {
        cur = '';
        break;
      }
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const joined = words.join(' ');
  const used = lines.join(' ');
  if (joined.length > used.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[.,;:!?]+$/, '');
    if (last.length > 3) last = `${last}…`;
    else last = `${last}…`;
    lines[lines.length - 1] = last;
  }
  return lines;
}

/**
 * Max chars for a line at fontSize in textWidth.
 * Bold Outfit ~0.58em avg; Regular ~0.52em — we use safer (wider) factors.
 */
function charsFor(textWidth, fontSize, { bold = false } = {}) {
  const factor = bold ? 0.6 : 0.55;
  return Math.max(10, Math.floor(textWidth / (fontSize * factor)));
}

/**
 * One <text> per line — resvg handles this far more reliably than tspan dy stacks.
 * Weights: only 400 / 600 / 700 (maps to Outfit Regular / SemiBold / Bold files).
 */
function linesText(lines, {
  x,
  y,
  fontSize,
  lineHeight,
  weight = 700,
  fill = '#FFFFFF',
  anchor = 'start',
  tracking = 0,
  stroke = null,
  strokeWidth = 0,
} = {}) {
  const lh = lineHeight || fontSize * 1.2;
  // normalize weight to available faces
  const w =
    weight >= 700 ? 700 : weight >= 500 ? 600 : 400;
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const trackAttr =
    tracking !== 0 ? ` letter-spacing="${tracking}"` : '';
  // Soft dark stroke = legibility without feDropShadow blur on small type
  const strokeAttrs =
    stroke && strokeWidth
      ? ` stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round"`
      : '';
  return lines
    .map((line, i) => {
      const ly = Math.round(y + i * lh);
      return `<text x="${x}" y="${ly}"${anchorAttr} font-family="Outfit" font-size="${fontSize}" font-weight="${w}" fill="${fill}"${trackAttr}${strokeAttrs}>${escapeXml(line)}</text>`;
    })
    .join('\n  ');
}

function pickTemplate(id, index = 0) {
  const raw = String(id || 'auto').toLowerCase();
  if (raw === 'auto' || raw === 'mix') {
    return AD_TEMPLATES.find((t) => t.id === TEMPLATE_ROTATION[index % TEMPLATE_ROTATION.length]);
  }
  return AD_TEMPLATES.find((t) => t.id === raw) || AD_TEMPLATES[0];
}

function sizeForAspect(aspectId) {
  return AD_ASPECT_PX[aspectId] || AD_ASPECT_PX['1:1'];
}

async function plateToDataUri(plateUrl) {
  if (!plateUrl) return null;
  if (String(plateUrl).startsWith('data:')) return plateUrl;

  // Local /api/renders path
  if (String(plateUrl).startsWith('/api/') || String(plateUrl).startsWith('/')) {
    // Not a file on disk we know — try fetch via localhost if absolute path fails
  }

  try {
    const res = await fetch(plateUrl);
    if (!res.ok) throw new Error(`plate fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mime = ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    throw new Error(`Could not load plate image: ${err.message}`);
  }
}

function brandColors(brand) {
  const c = brand.colors || {};
  return {
    brand: c.brand || '#9563FF',
    brandDeep: c.brandDeep || '#663CF6',
    accent: c.accent || '#ED81FF',
    dark: c.dark || '#141233',
    ink: c.ink || '#000000',
    surface: c.surface || '#F7F7F7',
    muted: c.muted || '#5E5F5C',
    white: '#FFFFFF',
  };
}

/**
 * Premium still-ad design system (Taskiz Brand Guide).
 * Spacing on an 8pt grid · optical CTA centering · generous safe zone.
 */
function designTokens(w, h) {
  const s = Math.min(w, h);
  const pad = Math.max(64, Math.round(s * 0.078)); // ~8% safe
  return {
    pad,
    // 8pt scale
    space2: 8,
    space3: 12,
    space4: 16,
    space5: 20,
    space6: 24,
    space7: 28,
    space8: 32,
    space10: 40,
    space12: 48,
    // Type
    h1: s >= 1080 ? 52 : 44,
    h1Sm: s >= 1080 ? 46 : 40,
    h1Story: Math.round(s * 0.05),
    body: 22,
    bodySm: 20,
    ctaLabel: 20,
    ctaLabelLg: 21,
    meta: 15,
    // CTA button
    ctaH: 60,
    ctaHLg: 64,
    ctaMinW: 220,
    ctaPadX: 40,
    ctaRadius: 999, // pill
    // Logo
    logoW: Math.round(Math.min(w * 0.22, 200)),
    logoH: 0, // set below
    // Colors
    white: '#FFFFFF',
    support: 'rgba(255,255,255,0.88)',
    supportSolid: '#E8E6F4',
    metaColor: 'rgba(255,255,255,0.48)',
    scrim: '#0B0B12',
  };
}

/** CTA width from label length (min/max clamped). */
function ctaWidthFor(label, tokens, maxW) {
  const approx = Math.round(label.length * tokens.ctaLabel * 0.58 + tokens.ctaPadX * 2);
  return Math.min(maxW, Math.max(tokens.ctaMinW, approx));
}

/** Optical vertical center for Outfit text in a button */
function ctaTextY(ctaY, ctaH, fontSize) {
  return Math.round(ctaY + ctaH / 2 + fontSize * 0.35);
}

function svgCta({ x, y, width, height, radius, fill, label, fontSize, textColor = '#FFFFFF' }) {
  const ty = ctaTextY(y, height, fontSize);
  // SemiBold only (600) — we ship Outfit-SemiBold.ttf
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>
  <text x="${x + width / 2}" y="${ty}" text-anchor="middle" font-family="Outfit" font-size="${fontSize}" font-weight="600" fill="${textColor}" letter-spacing="0.3">${escapeXml(label)}</text>`;
}

function svgDefs(colors) {
  return `
  <defs>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colors.brandDeep}"/>
      <stop offset="55%" stop-color="${colors.brand}"/>
      <stop offset="100%" stop-color="${colors.accent}"/>
    </linearGradient>
    <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B0B12" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0B0B12" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrimBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B0B12" stop-opacity="0"/>
      <stop offset="18%" stop-color="#0B0B12" stop-opacity="0.45"/>
      <stop offset="48%" stop-color="#0B0B12" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#0B0B12" stop-opacity="0.98"/>
    </linearGradient>
  </defs>`;
}

function buildSvg({ w, h, templateId, plateDataUri, copy, colors, logoUri }) {
  const headline = copy.headline || copy.shortHeadline || '';
  let support = copy.support || '';
  // Keep support short — long body lines look broken on stills
  if (support.length > 72) support = support.slice(0, 70).replace(/\s+\S*$/, '');
  if (/authentic (US )?contractor|running the business side/i.test(support)) {
    support = '';
  }
  const cta = copy.cta || 'Join the Beta';
  const site = (copy.website || 'taskiz.ai').replace(/^https?:\/\//, '');

  const t = designTokens(w, h);
  t.logoH = Math.round(t.logoW * (28 / 108));
  const textW = w - t.pad * 2;
  const isWide = w > h * 1.15;
  const isTall = h > w * 1.15;

  const plate = plateDataUri
    ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${w}" height="${h}" fill="${colors.dark}"/>`;

  // ── END CARD ──
  if (templateId === 'endcard') {
    const hSize = isWide ? t.h1Sm : isTall ? t.h1 : 48;
    const sSize = 22;
    const contentMax = Math.min(textW, 680);
    const hLines = wrapLines(headline, charsFor(contentMax, hSize, { bold: true }), 3);
    const sLines = wrapLines(support, charsFor(contentMax, sSize, { bold: false }), 2);
    const ctaH = t.ctaHLg;
    const ctaW = ctaWidthFor(cta, t, Math.min(400, contentMax));
    const siteY = h - t.pad;
    const ctaY = siteY - t.space10 - ctaH;
    const hLineH = Math.round(hSize * 1.18);
    const sLineH = Math.round(sSize * 1.35);
    const logoY = t.pad + t.space4;
    const typeZoneTop = logoY + t.logoH + t.space12;
    const typeZoneBot = ctaY - t.space10;
    const typeH =
      hLines.length * hLineH + (sLines.length ? t.space5 + sLines.length * sLineH : 0);
    const typeStart = typeZoneTop + Math.max(0, (typeZoneBot - typeZoneTop - typeH) / 2);
    const hY = Math.round(typeStart + hSize * 0.78);
    const sY = Math.round(hY + (hLines.length - 1) * hLineH + t.space5 + sSize * 0.75);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${svgDefs(colors)}
  <rect width="${w}" height="${h}" fill="${colors.dark}"/>
  ${
    plateDataUri
      ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.1"/>
  <rect width="${w}" height="${h}" fill="${colors.dark}" opacity="0.6"/>`
      : ''
  }
  <rect x="0" y="0" width="${w}" height="5" fill="url(#gAccent)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${(w - t.logoW) / 2}" y="${logoY}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${linesText(hLines, {
    x: w / 2,
    y: hY,
    fontSize: hSize,
    lineHeight: hLineH,
    weight: 700,
    fill: t.white,
    anchor: 'middle',
    tracking: -0.6,
  })}
  ${
    sLines.length
      ? linesText(sLines, {
          x: w / 2,
          y: sY,
          fontSize: sSize,
          lineHeight: sLineH,
          weight: 400,
          fill: t.supportSolid,
          anchor: 'middle',
        })
      : ''
  }
  ${svgCta({
    x: (w - ctaW) / 2,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    radius: t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    fontSize: t.ctaLabelLg,
  })}
  ${linesText([site], {
    x: w / 2,
    y: siteY,
    fontSize: t.meta,
    weight: 400,
    fill: t.metaColor,
    anchor: 'middle',
    tracking: 0.5,
  })}
</svg>`;
  }

  // ── PANEL ──
  if (templateId === 'panel') {
    const hSize = isWide ? 40 : 46;
    const sSize = 21;
    const ctaH = t.ctaH;
    const ctaW = ctaWidthFor(cta, t, Math.min(320, textW));
    const inner = t.pad;
    const hLines = wrapLines(headline, charsFor(textW, hSize, { bold: true }), 3);
    const sLines = wrapLines(support, charsFor(textW, sSize, { bold: false }), 2);
    const hLineH = Math.round(hSize * 1.18);
    const sLineH = Math.round(sSize * 1.35);
    const stackH =
      (logoUri ? t.logoH + t.space6 : 0) +
      hLines.length * hLineH +
      (sLines.length ? t.space4 + sLines.length * sLineH : 0) +
      t.space8 +
      ctaH;
    const panelH = Math.min(
      Math.round(h * 0.52),
      Math.max(Math.round(h * 0.36), stackH + inner * 2)
    );
    const panelY = h - panelH;
    let cursor = panelY + inner;

    const logoSvg = logoUri
      ? `<image href="${logoUri}" x="${inner}" y="${cursor}" width="${t.logoW}" height="${t.logoH}"/>`
      : '';
    if (logoUri) cursor += t.logoH + t.space6;

    const hY = Math.round(cursor + hSize * 0.78);
    cursor = hY + (hLines.length - 1) * hLineH + t.space4;
    const sY = sLines.length ? Math.round(cursor + sSize * 0.78) : cursor;
    if (sLines.length) cursor = sY + (sLines.length - 1) * sLineH;
    cursor += t.space8;
    const ctaY = Math.min(h - inner - ctaH, cursor);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${svgDefs(colors)}
  ${plate}
  <rect x="0" y="${panelY}" width="${w}" height="${panelH}" fill="${colors.dark}"/>
  <rect x="0" y="${panelY}" width="${w}" height="4" fill="url(#gAccent)"/>
  ${logoSvg}
  ${linesText(hLines, {
    x: inner,
    y: hY,
    fontSize: hSize,
    lineHeight: hLineH,
    weight: 700,
    fill: t.white,
    tracking: -0.5,
  })}
  ${
    sLines.length
      ? linesText(sLines, {
          x: inner,
          y: sY,
          fontSize: sSize,
          lineHeight: sLineH,
          weight: 400,
          fill: t.supportSolid,
        })
      : ''
  }
  ${svgCta({
    x: inner,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    radius: t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    fontSize: t.ctaLabel,
  })}
</svg>`;
  }

  // ── HERO + STORY ──
  {
    const isStory = templateId === 'story';
    const hSize = isStory ? Math.max(44, t.h1Story) : isWide ? 42 : isTall ? 50 : 48;
    const sSize = 22;
    const ctaH = isStory ? t.ctaHLg : t.ctaH;
    const ctaFull = isStory;
    const ctaW = ctaFull
      ? textW
      : ctaWidthFor(cta, t, Math.min(340, Math.round(textW * 0.72)));
    const hLines = wrapLines(
      headline,
      charsFor(textW, hSize, { bold: true }),
      isStory ? 4 : 3
    );
    const sLines = wrapLines(support, charsFor(textW, sSize, { bold: false }), 2);
    const hLineH = Math.round(hSize * 1.16);
    const sLineH = Math.round(sSize * 1.35);

    // Bottom-up with generous gaps (support never kisses CTA)
    const ctaY = h - t.pad - ctaH;
    const sY = sLines.length
      ? Math.round(ctaY - t.space8 - (sLines.length - 1) * sLineH - sSize * 0.1)
      : ctaY;
    const hY = Math.round(
      (sLines.length ? sY - t.space6 : ctaY - t.space8) - (hLines.length - 1) * hLineH
    );

    const typeTop = hY - hSize * 0.35;
    const scrimTop = Math.max(h * 0.3, typeTop - t.space12);
    const logoY = t.pad;
    const logoX = t.pad;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${svgDefs(colors)}
  ${plate}
  <rect width="${w}" height="${Math.round(h * 0.18)}" fill="url(#scrimTop)"/>
  <rect y="${scrimTop}" width="${w}" height="${h - scrimTop}" fill="url(#scrimBot)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${logoX}" y="${logoY}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${linesText(hLines, {
    x: t.pad,
    y: hY,
    fontSize: hSize,
    lineHeight: hLineH,
    weight: 700,
    fill: t.white,
    tracking: -0.55,
  })}
  ${
    sLines.length
      ? linesText(sLines, {
          x: t.pad,
          y: sY,
          fontSize: sSize,
          lineHeight: sLineH,
          weight: 400,
          fill: '#F2F0FA',
        })
      : ''
  }
  ${svgCta({
    x: t.pad,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    radius: ctaFull ? 18 : t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    fontSize: isStory ? t.ctaLabelLg : t.ctaLabel,
  })}
</svg>`;
  }
}

function renderSvgToPng(svg, outPath, width) {
  const fonts = outfitFontFiles();
  if (!fonts.length) {
    console.warn('[adCompose] Outfit font files missing — type will fallback poorly');
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: {
      fontFiles: fonts,
      // Only use bundled Outfit — system fallbacks looked wrong / mixed
      loadSystemFonts: false,
      defaultFontFamily: 'Outfit',
      defaultFontWeight: 400,
    },
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
  return outPath;
}

/**
 * Compose a finished ad PNG from plate + brand copy + template.
 * @returns {{ adUrl: string, fileName: string, width: number, height: number, templateId: string }}
 */
export async function composeAd(options = {}) {
  const brand = getBrand();
  const colors = brandColors(brand);
  const aspectId = options.aspectRatio || options.aspect || '1:1';
  const { w, h } = sizeForAspect(aspectId);
  const index = Number(options.index) || 0;
  const template = pickTemplate(options.templateId || options.template || 'hero', index);
  const templateId = template.id;

  const copy = {
    headline: options.headline || options.copy?.headline,
    shortHeadline: options.shortHeadline || options.copy?.shortHeadline,
    support: options.support || options.body || options.copy?.support || options.copy?.body,
    body: options.body || options.copy?.body,
    cta: options.cta || options.copy?.cta || brand.primaryCta || 'Join the Beta',
    website: options.website || options.copy?.website || brand.website || 'taskiz.ai',
  };

  let plateDataUri = null;
  if (options.plateUrl || options.imageUrl || options.plateDataUri) {
    plateDataUri = options.plateDataUri || (await plateToDataUri(options.plateUrl || options.imageUrl));
  }

  // endcard can run without plate; others need plate
  if (!plateDataUri && templateId !== 'endcard') {
    const err = new Error('plateUrl is required for this ad template');
    err.status = 400;
    throw err;
  }

  const logoUri = loadBrandLogoDataUri({
    color: templateId === 'endcard' || templateId === 'panel' ? '#FFFFFF' : '#FFFFFF',
  });

  const svg = buildSvg({
    w,
    h,
    templateId,
    plateDataUri,
    copy,
    colors,
    logoUri,
  });

  ensureAdsDir();
  const id =
    options.id ||
    options.itemId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fileName = `ad-${id}.png`;
  const outPath = path.join(ADS_DIR, fileName);
  renderSvgToPng(svg, outPath, w);

  return {
    adUrl: `/api/renders/ads/${fileName}`,
    fileName,
    width: w,
    height: h,
    templateId,
    aspectRatio: aspectId,
  };
}

export function resolveAdRenderPath(fileName) {
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  if (!/^ad-[\w.-]+\.png$/i.test(fileName)) return null;
  const full = path.join(ADS_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function listAdTemplates() {
  return AD_TEMPLATES;
}

export function pickAdTemplateId(id, index = 0) {
  return pickTemplate(id, index).id;
}
