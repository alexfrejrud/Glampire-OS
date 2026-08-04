/**
 * Still-ad compose — plate photo + active workspace Brand OS type/logo.
 *
 * Design system:
 *  - Fonts: Outfit Regular/SemiBold/Bold (bundled) — same as graphicsCompose
 *  - Layout: 1080-base scale, fixed px rhythm (not fuzzy %)
 *  - Type: large headline, readable support, full-width CTA bar
 *  - Logo: active workspace SVG only (never another client's mark)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { getBrand } from './brand.js';
import { resolveWorkspaceLogoPath } from './brandLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const ADS_DIR = path.join(__dirname, 'data', 'renders', 'ads');

/** Match graphicsCompose — Outfit first, safe fallbacks if face missing */
const FONT = 'Outfit, Arial, Helvetica, sans-serif';

export const AD_TEMPLATES = [
  {
    id: 'hero',
    label: 'Hero + type',
    short: 'Hero',
    description: 'Photo + bottom scrim, headline, CTA bar',
    ico: 'H',
  },
  {
    id: 'panel',
    label: 'Brand panel',
    short: 'Panel',
    description: 'Photo upper · dark type dock lower',
    ico: 'P',
  },
  {
    id: 'story',
    label: 'Story full',
    short: 'Story',
    description: 'Vertical full-bleed ad',
    ico: 'S',
  },
  {
    id: 'endcard',
    label: 'End card',
    short: 'End card',
    description: 'Dark conversion unit',
    ico: 'E',
  },
];

const TEMPLATE_ROTATION = ['hero', 'panel', 'story', 'endcard'];

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
  return resolveWorkspaceLogoPath();
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

/** Word wrap — conservative for Outfit Bold width */
function wrapText(text, maxChars, maxLines = 3) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return [];
  const limit = Math.max(8, maxChars);
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
  const full = words.join(' ');
  if (full.length > lines.join(' ').length && lines.length) {
    const last = lines[lines.length - 1].replace(/[.,;:!?]+$/, '');
    lines[lines.length - 1] = last.length > 2 ? `${last}…` : `${last}…`;
  }
  return lines;
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
  try {
    const res = await fetch(plateUrl);
    if (!res.ok) throw new Error(`plate fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mime = ct.includes('png')
      ? 'image/png'
      : ct.includes('webp')
        ? 'image/webp'
        : 'image/jpeg';
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
    white: '#FFFFFF',
  };
}

/**
 * 1080-base design tokens, scaled to canvas width.
 * This is the UI direction — same rhythm every ad.
 */
function scale(w) {
  const s = w / 1080;
  const px = (n) => Math.round(n * s);
  return {
    s,
    px,
    pad: px(72),
    gapXs: px(12),
    gapSm: px(16),
    gapMd: px(24),
    gapLg: px(32),
    gapXl: px(40),
    // Type — sized so it still reads in a ~300px queue card AND full export
    h1: px(60),
    h1Sm: px(52),
    body: px(28),
    ctaLabel: px(24),
    meta: px(18),
    // CTA bar — full width, product-grade height
    ctaH: px(76),
    ctaRadius: px(18),
    logoW: px(210),
    logoH: px(Math.round(210 * (28 / 108))),
    scrim: '#0B0B12',
  };
}

/** Absolute-positioned lines — one <text> each (reliable in resvg) */
function textLines(lines, { x, y0, size, leading, weight, fill, anchor = 'start', opacity = 1 }) {
  const lh = leading || Math.round(size * 1.15);
  const a = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
  // Only 400 / 600 / 700 — maps to our three TTF files
  const w = weight >= 700 ? 700 : weight >= 600 ? 600 : 400;
  return lines
    .map((line, i) => {
      const y = y0 + i * lh;
      return `<text x="${x}" y="${y}"${a} font-family="${FONT}" font-size="${size}" font-weight="${w}" fill="${fill}"${op}>${escapeXml(line)}</text>`;
    })
    .join('\n  ');
}

/** Full-width primary CTA bar (not a tiny pill) */
function ctaBar({ x, y, width, height, radius, fill, label, labelSize }) {
  const ty = Math.round(y + height / 2 + labelSize * 0.35);
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>
  <text x="${x + width / 2}" y="${ty}" text-anchor="middle" font-family="${FONT}" font-size="${labelSize}" font-weight="600" fill="#FFFFFF">${escapeXml(label)}</text>`;
}

function cleanSupport(raw) {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  // Prefer short on-ad lines
  if (s.length > 68) s = s.slice(0, 66).replace(/\s+\S*$/, '');
  return s;
}

function buildSvg({ w, h, templateId, plateDataUri, copy, colors, logoUri }) {
  const t = scale(w);
  const headline = String(copy.headline || copy.shortHeadline || '').trim();
  const support = cleanSupport(copy.support || copy.body);
  const cta = String(copy.cta || 'Learn more').trim();
  const site = String(copy.website || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  const textW = w - t.pad * 2;
  // ~ chars: Outfit Bold ~0.55em, Regular ~0.5em at our sizes
  const hChars = Math.max(12, Math.floor(textW / (t.h1 * 0.58)));
  const bChars = Math.max(16, Math.floor(textW / (t.body * 0.52)));

  const plate = plateDataUri
    ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${w}" height="${h}" fill="${colors.dark}"/>`;

  const logo = logoUri
    ? `<image href="${logoUri}" x="${t.pad}" y="${t.pad}" width="${t.logoW}" height="${t.logoH}" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  // ═══════════ END CARD ═══════════
  if (templateId === 'endcard') {
    const hLines = wrapText(headline, hChars, 3);
    const sLines = wrapText(support, bChars, 2);
    const hLead = Math.round(t.h1 * 1.12);
    const bLead = Math.round(t.body * 1.3);
    const ctaY = h - t.pad - t.ctaH - t.gapLg - t.meta;
    const siteY = h - t.pad;
    // Center type block between top logo area and CTA
    const logoBlockH = t.pad + t.logoH + t.gapXl;
    const typeH =
      hLines.length * hLead + (sLines.length ? t.gapMd + sLines.length * bLead : 0);
    const zoneTop = logoBlockH + t.gapLg;
    const zoneBot = ctaY - t.gapXl;
    const typeStart = zoneTop + Math.max(0, (zoneBot - zoneTop - typeH) / 2);
    const hY0 = typeStart + Math.round(t.h1 * 0.85);
    const sY0 = hY0 + (hLines.length - 1) * hLead + t.gapMd + Math.round(t.body * 0.85);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colors.brandDeep}"/>
      <stop offset="100%" stop-color="${colors.accent}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${colors.dark}"/>
  ${
    plateDataUri
      ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.1"/>
  <rect width="${w}" height="${h}" fill="${colors.dark}" opacity="0.65"/>`
      : ''
  }
  <rect x="0" y="0" width="${w}" height="${t.px(5)}" fill="url(#gAccent)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${(w - t.logoW) / 2}" y="${t.pad + t.gapSm}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${textLines(hLines, {
    x: w / 2,
    y0: hY0,
    size: t.h1,
    leading: hLead,
    weight: 700,
    fill: '#FFFFFF',
    anchor: 'middle',
  })}
  ${
    sLines.length
      ? textLines(sLines, {
          x: w / 2,
          y0: sY0,
          size: t.body,
          leading: bLead,
          weight: 400,
          fill: '#FFFFFF',
          anchor: 'middle',
          opacity: 0.78,
        })
      : ''
  }
  ${ctaBar({
    x: t.pad,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
  })}
  ${textLines([site], {
    x: w / 2,
    y0: siteY,
    size: t.meta,
    weight: 400,
    fill: '#FFFFFF',
    anchor: 'middle',
    opacity: 0.45,
  })}
</svg>`;
  }

  // ═══════════ PANEL ═══════════
  if (templateId === 'panel') {
    const hLines = wrapText(headline, hChars, 3);
    const sLines = wrapText(support, bChars, 2);
    const hLead = Math.round(t.h1Sm * 1.12);
    const bLead = Math.round(t.body * 1.28);
    const hSize = t.h1Sm;

    const stackH =
      (logoUri ? t.logoH + t.gapMd : 0) +
      hLines.length * hLead +
      (sLines.length ? t.gapSm + sLines.length * bLead : 0) +
      t.gapLg +
      t.ctaH;

    const panelH = Math.min(
      Math.round(h * 0.5),
      Math.max(Math.round(h * 0.38), stackH + t.pad * 2)
    );
    const panelY = h - panelH;
    let cursor = panelY + t.pad;

    const logoBlock = logoUri
      ? `<image href="${logoUri}" x="${t.pad}" y="${cursor}" width="${t.logoW}" height="${t.logoH}"/>`
      : '';
    if (logoUri) cursor += t.logoH + t.gapMd;

    const hY0 = cursor + Math.round(hSize * 0.85);
    cursor = hY0 + (hLines.length - 1) * hLead + t.gapSm;
    const sY0 = sLines.length ? cursor + Math.round(t.body * 0.85) : cursor;
    if (sLines.length) cursor = sY0 + (sLines.length - 1) * bLead;
    cursor += t.gapLg;
    const ctaY = Math.min(h - t.pad - t.ctaH, cursor);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colors.brandDeep}"/>
      <stop offset="100%" stop-color="${colors.accent}"/>
    </linearGradient>
  </defs>
  ${plate}
  <rect x="0" y="${panelY}" width="${w}" height="${panelH}" fill="${colors.dark}"/>
  <rect x="0" y="${panelY}" width="${w}" height="${t.px(4)}" fill="url(#gAccent)"/>
  ${logoBlock}
  ${textLines(hLines, {
    x: t.pad,
    y0: hY0,
    size: hSize,
    leading: hLead,
    weight: 700,
    fill: '#FFFFFF',
  })}
  ${
    sLines.length
      ? textLines(sLines, {
          x: t.pad,
          y0: sY0,
          size: t.body,
          leading: bLead,
          weight: 400,
          fill: '#FFFFFF',
          opacity: 0.78,
        })
      : ''
  }
  ${ctaBar({
    x: t.pad,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
  })}
</svg>`;
  }

  // ═══════════ HERO + STORY (photo + bottom type) ═══════════
  {
    const isStory = templateId === 'story';
    const hSize = isStory ? Math.round(t.h1 * 1.05) : t.h1;
    const hLines = wrapText(headline, Math.floor(hChars * (isStory ? 0.95 : 1)), isStory ? 4 : 3);
    const sLines = wrapText(support, bChars, 2);
    const hLead = Math.round(hSize * 1.1);
    const bLead = Math.round(t.body * 1.28);

    // Bottom-up stack — generous gaps, full-width CTA
    const ctaY = h - t.pad - t.ctaH;
    const sY0 = sLines.length
      ? ctaY - t.gapLg - (sLines.length - 1) * bLead - Math.round(t.body * 0.15)
      : ctaY;
    const hY0 =
      (sLines.length ? sY0 - t.gapMd : ctaY - t.gapLg) - (hLines.length - 1) * hLead;

    // Scrim covers entire type stack with room above
    const typeTop = hY0 - hSize;
    const scrimY = Math.max(Math.round(h * 0.35), typeTop - t.gapXl);
    const topScrimH = Math.round(h * 0.14);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.scrim}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${t.scrim}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrimBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.scrim}" stop-opacity="0"/>
      <stop offset="20%" stop-color="${t.scrim}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${t.scrim}" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="${t.scrim}" stop-opacity="0.97"/>
    </linearGradient>
  </defs>
  ${plate}
  <rect width="${w}" height="${topScrimH}" fill="url(#scrimTop)"/>
  <rect y="${scrimY}" width="${w}" height="${h - scrimY}" fill="url(#scrimBot)"/>
  ${logo}
  ${textLines(hLines, {
    x: t.pad,
    y0: hY0,
    size: hSize,
    leading: hLead,
    weight: 700,
    fill: '#FFFFFF',
  })}
  ${
    sLines.length
      ? textLines(sLines, {
          x: t.pad,
          y0: sY0,
          size: t.body,
          leading: bLead,
          weight: 400,
          fill: '#FFFFFF',
          opacity: 0.88,
        })
      : ''
  }
  ${ctaBar({
    x: t.pad,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: colors.brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
  })}
</svg>`;
  }
}

function renderSvgToPng(svg, outPath, width) {
  const fonts = outfitFontFiles();
  if (fonts.length < 3) {
    console.warn(
      '[adCompose] Expected 3 Outfit faces, found',
      fonts.length,
      '— type quality will suffer'
    );
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: {
      fontFiles: fonts,
      // Same as graphicsCompose video cards
      loadSystemFonts: true,
      defaultFontFamily: 'Outfit',
      defaultFontWeight: 400,
    },
  });
  fs.writeFileSync(outPath, resvg.render().asPng());
  return outPath;
}

/**
 * Compose a finished ad PNG from plate + brand copy + template.
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
    cta: options.cta || options.copy?.cta || brand.primaryCta || 'Learn more',
    website: options.website || options.copy?.website || brand.website || '',
  };

  let plateDataUri = null;
  if (options.plateUrl || options.imageUrl || options.plateDataUri) {
    const src = options.plateDataUri || options.plateUrl || options.imageUrl;
    // Prefer plate over composed ad if both exist
    plateDataUri = await plateToDataUri(src);
  }

  if (!plateDataUri && templateId !== 'endcard') {
    const err = new Error('plateUrl is required for this ad template');
    err.status = 400;
    throw err;
  }

  const logoUri = loadBrandLogoDataUri({ color: '#FFFFFF' });
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
    adUrl: `/api/renders/ads/${fileName}?t=${Date.now()}`,
    fileName,
    width: w,
    height: h,
    templateId,
    aspectRatio: aspectId,
  };
}

export function resolveAdRenderPath(fileName) {
  // strip query
  const base = String(fileName || '').split('?')[0];
  if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
    return null;
  }
  if (!/^ad-[\w.-]+\.png$/i.test(base)) return null;
  const full = path.join(ADS_DIR, base);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function listAdTemplates() {
  return AD_TEMPLATES;
}

export function pickAdTemplateId(id, index = 0) {
  return pickTemplate(id, index).id;
}
