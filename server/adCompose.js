/**
 * Still-ad compose — plate photo + active workspace Brand OS type/logo.
 *
 * Multi-workspace rule:
 *  - Layout math → server/adLayout.js (universal, S = min(w,h))
 *  - Colors / CTA / logo / optional adDesign → getBrand() Brand OS
 *  - Never hardcode one client's purple or CTA in layout formulas
 *
 * Skill: .agents/skills/ad-typography-and-layout/SKILL.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { getBrand } from './brand.js';
import { resolveWorkspaceLogoPath, getActiveWorkspaceId, getWorkspaceDir } from './brandLoader.js';
import {
  buildLayoutTokens,
  stackFromBottom,
  cleanSupport,
} from './adLayout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const ADS_DIR = path.join(__dirname, 'data', 'renders', 'ads');

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

/**
 * Font files: workspace assets/fonts first, else studio default Outfit.
 * Expected names: *-Regular.ttf, *-SemiBold.ttf, *-Bold.ttf (or Outfit-*).
 */
function resolveFontFiles(displayFont = 'Outfit') {
  const faces = ['Regular', 'SemiBold', 'Bold'];
  const dirs = [];
  try {
    const ws = getActiveWorkspaceId();
    if (ws) {
      dirs.push(path.join(getWorkspaceDir(ws), 'assets', 'fonts'));
    }
  } catch {
    /* ignore */
  }
  dirs.push(FONT_DIR);

  const found = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const face of faces) {
      const candidates = [
        path.join(dir, `${displayFont}-${face}.ttf`),
        path.join(dir, `${displayFont}-${face}.otf`),
        path.join(dir, `Outfit-${face}.ttf`),
      ];
      const hit = candidates.find((p) => fs.existsSync(p));
      if (hit && !found.includes(hit)) found.push(hit);
    }
    if (found.length >= 3) break;
  }
  // Absolute fallback
  if (found.length < 3) {
    for (const face of faces) {
      const p = path.join(FONT_DIR, `Outfit-${face}.ttf`);
      if (fs.existsSync(p) && !found.includes(p)) found.push(p);
    }
  }
  return found;
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

/** Absolute-positioned lines — one <text> each (reliable in resvg) */
function textLines(
  lines,
  { x, y0, size, leading, weight, fill, anchor = 'start', opacity = 1, fontFamily }
) {
  const lh = leading || Math.round(size * 1.25);
  const a = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
  const fw = weight >= 700 ? 700 : weight >= 600 ? 600 : 400;
  const fam = fontFamily || 'Outfit, Arial, Helvetica, sans-serif';
  return lines
    .map((line, i) => {
      const y = y0 + i * lh;
      return `<text x="${x}" y="${y}"${a} font-family="${fam}" font-size="${size}" font-weight="${fw}" fill="${fill}"${op}>${escapeXml(line)}</text>`;
    })
    .join('\n  ');
}

/** Full-width primary CTA bar */
function ctaBar({ x, y, width, height, radius, fill, label, labelSize, fontFamily }) {
  const ty = Math.round(y + height / 2 + labelSize * 0.35);
  const fam = fontFamily || 'Outfit, Arial, Helvetica, sans-serif';
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>
  <text x="${x + width / 2}" y="${ty}" text-anchor="middle" font-family="${fam}" font-size="${labelSize}" font-weight="600" fill="#FFFFFF">${escapeXml(label)}</text>`;
}

function buildSvg({ w, h, aspectId, templateId, plateDataUri, copy, brand, logoUri }) {
  const colors = brand.colors || {};
  const t = buildLayoutTokens({ w, h, aspectId, brand });
  const fontFamily = `${t.displayFont}, Arial, Helvetica, sans-serif`;
  const brandDeep = t.ctaFill;
  const accent = colors.accent || colors.brand || brandDeep;

  const headline = String(copy.headline || copy.shortHeadline || '').trim();
  const support = cleanSupport(copy.support || copy.body, headline, {
    maxLen: 52,
    dedupe: t.dedupeSupport,
  });
  const cta = String(copy.cta || t.primaryCta || 'Learn more').trim();
  const site = String(copy.website || t.website || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  const padX = t.pad;
  const padBot = t.padBot || t.pad;
  const textW = w - padX * 2;
  const hChars = Math.max(14, Math.floor(textW / (t.h1 * 0.62)));
  const bChars = Math.max(18, Math.floor(textW / (t.body * 0.55)));
  const maxSupport = t.maxSupportLines || 1;

  const plate = plateDataUri
    ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${w}" height="${h}" fill="${t.scrim}"/>`;

  const logo = logoUri
    ? `<image href="${logoUri}" x="${padX}" y="${t.padTop || t.pad}" width="${t.logoW}" height="${t.logoH}" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  // ═══════════ END CARD ═══════════
  if (templateId === 'endcard') {
    const hLines = wrapText(headline, hChars, 3);
    const sLines = wrapText(support, bChars, maxSupport);
    const { ctaY, sY0, hY0 } = stackFromBottom({
      canvasH: h,
      padBot,
      ctaH: t.ctaH,
      hLines,
      hLead: t.h1Lead,
      hSize: t.h1,
      sLines,
      sLead: t.bodyLead,
      sSize: t.body,
      gapH1Body: t.gapH1Body,
      gapBodyCta: t.gapBodyCta,
      reserveMeta: t.gapH1Body + t.meta,
    });
    const siteY = h - padBot;

    const hair = Math.max(3, Math.round(t.S * 0.005));
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${brandDeep}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${t.scrim}"/>
  ${
    plateDataUri
      ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.1"/>
  <rect width="${w}" height="${h}" fill="${t.scrim}" opacity="0.65"/>`
      : ''
  }
  <rect x="0" y="0" width="${w}" height="${hair}" fill="url(#gAccent)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${(w - t.logoW) / 2}" y="${t.padTop || padX}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${textLines(hLines, {
    x: w / 2,
    y0: hY0,
    size: t.h1,
    leading: t.h1Lead,
    weight: 700,
    fill: t.textOnDark,
    anchor: 'middle',
    fontFamily,
  })}
  ${
    sLines.length && sY0 != null
      ? textLines(sLines, {
          x: w / 2,
          y0: sY0,
          size: t.body,
          leading: t.bodyLead,
          weight: 400,
          fill: t.textOnDark,
          anchor: 'middle',
          opacity: 0.92,
          fontFamily,
        })
      : ''
  }
  ${ctaBar({
    x: padX,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
    fontFamily,
  })}
  ${
    site
      ? textLines([site], {
          x: w / 2,
          y0: siteY,
          size: t.meta,
          weight: 400,
          fill: t.textOnDark,
          anchor: 'middle',
          opacity: 0.5,
          fontFamily,
        })
      : ''
  }
</svg>`;
  }

  // ═══════════ PANEL ═══════════
  if (templateId === 'panel') {
    const hSize = t.h1Sm;
    const hLead = t.h1SmLead || Math.round(hSize * 1.22);
    const hLines = wrapText(headline, Math.floor(textW / (hSize * 0.62)), 3);
    const sLines = wrapText(support, bChars, maxSupport);

    const stackH =
      (logoUri ? t.logoH + t.gapLogoH1 : 0) +
      hLines.length * hLead +
      (sLines.length ? t.gapH1Body + t.bodyLead : 0) +
      t.gapBodyCta +
      t.ctaH;

    const panelH = Math.min(
      Math.round(h * 0.55),
      Math.max(Math.round(h * 0.4), stackH + padX * 2)
    );
    const panelY = h - panelH;
    let y = panelY + padX;

    const logoBlock = logoUri
      ? `<image href="${logoUri}" x="${padX}" y="${y}" width="${t.logoW}" height="${t.logoH}"/>`
      : '';
    if (logoUri) y += t.logoH + t.gapLogoH1;

    const hY0 = y + Math.round(hSize * 0.85);
    y = hY0 + (hLines.length - 1) * hLead + t.gapH1Body;
    const sY0 = sLines.length ? y + Math.round(t.body * 0.85) : y;
    if (sLines.length) y = sY0 + t.gapBodyCta;
    else y = hY0 + (hLines.length - 1) * hLead + t.gapBodyCta;
    const ctaY = Math.min(h - padBot - t.ctaH, y);
    const hair = Math.max(3, Math.round(t.S * 0.004));

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${brandDeep}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  ${plate}
  <rect x="0" y="${panelY}" width="${w}" height="${panelH}" fill="${t.scrim}"/>
  <rect x="0" y="${panelY}" width="${w}" height="${hair}" fill="url(#gAccent)"/>
  ${logoBlock}
  ${textLines(hLines, {
    x: padX,
    y0: hY0,
    size: hSize,
    leading: hLead,
    weight: 700,
    fill: t.textOnDark,
    fontFamily,
  })}
  ${
    sLines.length
      ? textLines(sLines, {
          x: padX,
          y0: sY0,
          size: t.body,
          leading: t.bodyLead,
          weight: 400,
          fill: t.textOnDark,
          opacity: 0.92,
          fontFamily,
        })
      : ''
  }
  ${ctaBar({
    x: padX,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
    fontFamily,
  })}
</svg>`;
  }

  // ═══════════ HERO + STORY ═══════════
  {
    const isStory = templateId === 'story' || t.profile === 'story';
    const hSize = isStory ? Math.round(t.h1 * 1.04) : t.h1;
    const hLead = Math.round(hSize * 1.22);
    const hLines = wrapText(headline, Math.floor(textW / (hSize * 0.62)), 3);
    const sLines = wrapText(support, bChars, maxSupport);

    const { ctaY, sY0, hY0, typeTop } = stackFromBottom({
      canvasH: h,
      padBot,
      ctaH: t.ctaH,
      hLines,
      hLead,
      hSize,
      sLines,
      sLead: t.bodyLead,
      sSize: t.body,
      gapH1Body: t.gapH1Body,
      gapBodyCta: t.gapBodyCta,
    });

    const scrimY = Math.max(Math.round(h * 0.32), typeTop - padX);
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
      <stop offset="18%" stop-color="${t.scrim}" stop-opacity="0.5"/>
      <stop offset="50%" stop-color="${t.scrim}" stop-opacity="0.93"/>
      <stop offset="100%" stop-color="${t.scrim}" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  ${plate}
  <rect width="${w}" height="${topScrimH}" fill="url(#scrimTop)"/>
  <rect y="${scrimY}" width="${w}" height="${h - scrimY}" fill="url(#scrimBot)"/>
  ${logo}
  ${textLines(hLines, {
    x: padX,
    y0: hY0,
    size: hSize,
    leading: hLead,
    weight: 700,
    fill: t.textOnDark,
    fontFamily,
  })}
  ${
    sLines.length && sY0 != null
      ? textLines(sLines, {
          x: padX,
          y0: sY0,
          size: t.body,
          leading: t.bodyLead,
          weight: 400,
          fill: t.textOnDark,
          opacity: 0.95,
          fontFamily,
        })
      : ''
  }
  ${ctaBar({
    x: padX,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: brandDeep,
    label: cta,
    labelSize: t.ctaLabel,
    fontFamily,
  })}
</svg>`;
  }
}

function renderSvgToPng(svg, outPath, width, displayFont = 'Outfit') {
  const fonts = resolveFontFiles(displayFont);
  if (fonts.length < 3) {
    console.warn(
      '[adCompose] Expected 3 font faces, found',
      fonts.length,
      '— type quality may suffer'
    );
  }
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: {
      fontFiles: fonts,
      loadSystemFonts: true,
      defaultFontFamily: displayFont || 'Outfit',
      defaultFontWeight: 400,
    },
  });
  fs.writeFileSync(outPath, resvg.render().asPng());
  return outPath;
}

/**
 * Compose a finished ad PNG from plate + brand copy + template.
 * Brand OS (active workspace) drives colors, CTA, logo, adDesign.
 */
export async function composeAd(options = {}) {
  const brand = getBrand();
  const aspectId = options.aspectRatio || options.aspect || '1:1';
  const { w, h } = sizeForAspect(aspectId);
  const index = Number(options.index) || 0;
  const template = pickTemplate(options.templateId || options.template || 'hero', index);
  const templateId = template.id;
  const tokens = buildLayoutTokens({ w, h, aspectId, brand });

  const copy = {
    headline: options.headline || options.copy?.headline,
    shortHeadline: options.shortHeadline || options.copy?.shortHeadline,
    support: options.support || options.body || options.copy?.support || options.copy?.body,
    body: options.body || options.copy?.body,
    cta: options.cta || options.copy?.cta || brand.primaryCta || tokens.primaryCta,
    website: options.website || options.copy?.website || brand.website || '',
  };

  let plateDataUri = null;
  if (options.plateUrl || options.imageUrl || options.plateDataUri) {
    const src = options.plateDataUri || options.plateUrl || options.imageUrl;
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
    aspectId,
    templateId,
    plateDataUri,
    copy,
    brand,
    logoUri,
  });

  ensureAdsDir();
  const id =
    options.id ||
    options.itemId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fileName = `ad-${id}.png`;
  const outPath = path.join(ADS_DIR, fileName);
  renderSvgToPng(svg, outPath, w, tokens.displayFont);

  return {
    adUrl: `/api/renders/ads/${fileName}?t=${Date.now()}`,
    fileName,
    width: w,
    height: h,
    templateId,
    aspectRatio: aspectId,
    profile: tokens.profile,
    displayFont: tokens.displayFont,
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
