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
  charsPerLine,
} from './adLayout.js';
import { scrubAdDashes } from './adCopy.js';

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

/**
 * Word wrap for still ads.
 * @returns {{ lines: string[], complete: boolean }} complete=false if ellipsized
 */
function wrapText(text, maxChars, maxLines = 3) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return { lines: [], complete: true };
  const limit = Math.max(8, maxChars);
  const lines = [];
  let cur = '';
  let overflow = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > limit && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) {
        overflow = true;
        cur = '';
        break;
      }
    } else if (next.length > limit && !cur) {
      // single long token — hard cut
      lines.push(w.slice(0, limit - 1) + '…');
      overflow = true;
      cur = '';
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (cur && lines.length) overflow = true;

  if (overflow && lines.length) {
    const last = lines[lines.length - 1].replace(/[.,;:!?…]+$/, '');
    lines[lines.length - 1] = `${last}…`;
  }
  return { lines, complete: !overflow };
}

/**
 * Fit headline into maxLines by slightly reducing size before ellipsizing.
 * Returns { lines, size, lead }
 */
function fitHeadline(text, textW, baseSize, maxLines = 3, { minScale = 0.82 } = {}) {
  let size = baseSize;
  const floor = Math.max(Math.round(baseSize * minScale), 28);
  let best = wrapText(text, charsPerLine(textW, size, { bold: true }), maxLines);
  while (!best.complete && size > floor) {
    size = Math.max(floor, size - 2);
    best = wrapText(text, charsPerLine(textW, size, { bold: true }), maxLines);
  }
  // Prefer 2 lines when 3-line wrap is sparse single words — already fine
  const lead = Math.round(size * 1.2);
  return { lines: best.lines, size, lead, complete: best.complete };
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
  {
    x,
    y0,
    size,
    leading,
    weight,
    fill,
    anchor = 'start',
    opacity = 1,
    fontFamily,
    shadow = false,
  }
) {
  const lh = leading || Math.round(size * 1.25);
  const a = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
  const fw = weight >= 700 ? 700 : weight >= 600 ? 600 : 400;
  const fam = fontFamily || 'Outfit, Arial, Helvetica, sans-serif';
  const filter = shadow ? ' filter="url(#textShadow)"' : '';
  return lines
    .map((line, i) => {
      const y = y0 + i * lh;
      return `<text x="${x}" y="${y}"${a} font-family="${fam}" font-size="${size}" font-weight="${fw}" fill="${fill}"${op}${filter}>${escapeXml(line)}</text>`;
    })
    .join('\n  ');
}

/**
 * Full-width primary CTA bar (fill = solid or url(#id) from parent defs).
 */
function ctaBar({ x, y, width, height, radius, fill, label, labelSize, fontFamily }) {
  const ty = Math.round(y + height / 2 + labelSize * 0.36);
  const fam = fontFamily || 'Outfit, Arial, Helvetica, sans-serif';
  const ls = labelSize >= 28 ? 0.5 : 0.25;
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>
  <text x="${x + width / 2}" y="${ty}" text-anchor="middle" font-family="${fam}" font-size="${labelSize}" font-weight="600" letter-spacing="${ls}" fill="#FFFFFF">${escapeXml(label)}</text>`;
}

function buildSvg({ w, h, aspectId, templateId, plateDataUri, copy, brand, logoUri }) {
  const colors = brand.colors || {};
  const t = buildLayoutTokens({ w, h, aspectId, brand });
  const fontFamily = `${t.displayFont}, Arial, Helvetica, sans-serif`;
  const brandDeep = t.ctaFill;
  const brandMid = colors.brand || brandDeep;
  const accent = colors.accent || brandMid;

  // Final dash scrub here so queue/recompose/manual copy never paints "—" on ads
  const headline = scrubAdDashes(copy.headline || copy.shortHeadline || '');
  const support = cleanSupport(
    scrubAdDashes(copy.support || copy.body || ''),
    headline,
    {
      maxLen: 56,
      dedupe: t.dedupeSupport,
    }
  );
  const cta = scrubAdDashes(copy.cta || t.primaryCta || 'Learn more');
  const site = String(copy.website || t.website || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  const padX = t.padX || t.pad;
  const padTop = t.padTop || padX;
  const padBot = t.padBot || padX;
  const textW = w - padX * 2;
  const maxSupport = t.maxSupportLines || 1;
  const bChars = charsPerLine(textW, t.body, { bold: false });
  const ctaFill = brandMid !== brandDeep ? 'url(#ctaGrad)' : brandDeep;

  const plate = plateDataUri
    ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${w}" height="${h}" fill="${t.scrim}"/>`;

  const logoTL = logoUri
    ? `<image href="${logoUri}" x="${padX}" y="${padTop}" width="${t.logoW}" height="${t.logoH}" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  const sharedDefs = `
    <linearGradient id="gAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${brandDeep}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${brandDeep}"/>
      <stop offset="100%" stop-color="${brandMid}"/>
    </linearGradient>
    <filter id="textShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.45"/>
    </filter>`;

  // ═══════════ END CARD ═══════════
  if (templateId === 'endcard') {
    const fit = fitHeadline(headline, textW, t.h1, 3);
    const sWrap = wrapText(support, bChars, maxSupport);
    const sLines = sWrap.lines;
    const hLines = fit.lines;

    // Vertically center type block between logo bottom and CTA top
    const logoBottom = padTop + (logoUri ? t.logoH + t.gapLogoH1 : 0);
    const { ctaY, sY0, hY0 } = stackFromBottom({
      canvasH: h,
      padBot,
      ctaH: t.ctaH,
      hLines,
      hLead: fit.lead,
      hSize: fit.size,
      sLines,
      sLead: t.bodyLead,
      sSize: t.body,
      gapH1Body: t.gapH1Body,
      gapBodyCta: t.gapBodyCta,
      reserveMeta: site ? t.meta + Math.round(t.S * 0.02) : 0,
    });

    // Pull stack upward if too much dead air under logo (common on tall canvases)
    const typeBlockH =
      (hLines.length ? (hLines.length - 1) * fit.lead + fit.size : 0) +
      (sLines.length ? t.gapH1Body + t.bodyLead : 0) +
      t.gapBodyCta +
      t.ctaH;
    const available = ctaY + t.ctaH - logoBottom;
    let yShift = 0;
    if (available > typeBlockH + Math.round(h * 0.12)) {
      // Nudge headline block toward optical center of free space
      const idealTop = logoBottom + Math.round((available - typeBlockH) * 0.42);
      yShift = Math.max(0, idealTop - (hY0 - fit.size));
    }
    const hY = hY0 + yShift;
    const sY = sY0 != null ? sY0 + yShift : null;
    // Keep CTA pinned to bottom (do not shift)
    const siteY = h - Math.round(padBot * 0.45);

    const hair = Math.max(3, Math.round(t.S * 0.005));
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${sharedDefs}</defs>
  <rect width="${w}" height="${h}" fill="${t.scrim}"/>
  ${
    plateDataUri
      ? `<image href="${plateDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.12"/>
  <rect width="${w}" height="${h}" fill="${t.scrim}" opacity="0.72"/>`
      : ''
  }
  <rect x="0" y="0" width="${w}" height="${hair}" fill="url(#gAccent)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${(w - t.logoW) / 2}" y="${padTop}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${textLines(hLines, {
    x: w / 2,
    y0: hY,
    size: fit.size,
    leading: fit.lead,
    weight: 700,
    fill: t.textOnDark,
    anchor: 'middle',
    fontFamily,
  })}
  ${
    sLines.length && sY != null
      ? textLines(sLines, {
          x: w / 2,
          y0: sY,
          size: t.body,
          leading: t.bodyLead,
          weight: 400,
          fill: t.textOnDark,
          anchor: 'middle',
          opacity: 0.88,
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
    fill: ctaFill,
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
          opacity: 0.45,
          fontFamily,
        })
      : ''
  }
</svg>`;
  }

  // ═══════════ PANEL ═══════════
  if (templateId === 'panel') {
    const fit = fitHeadline(headline, textW, t.h1Sm, 3);
    const sWrap = wrapText(support, bChars, maxSupport);
    const sLines = sWrap.lines;
    const hLines = fit.lines;
    // Tighter logo→headline in dock (panel is a compact unit)
    const logoGap = Math.round(t.gapLogoH1 * 0.75);

    const { ctaY, sY0, hY0, typeTop } = stackFromBottom({
      canvasH: h,
      padBot,
      ctaH: t.ctaH,
      hLines,
      hLead: fit.lead,
      hSize: fit.size,
      sLines,
      sLead: t.bodyLead,
      sSize: t.body,
      gapH1Body: t.gapH1Body,
      gapBodyCta: t.gapBodyCta,
    });

    const logoBlockH = logoUri ? t.logoH + logoGap : 0;
    // Logo sits immediately above headline; panel hugs that stack (no empty dock air)
    const logoY = typeTop - logoBlockH;
    let panelY = logoY - Math.round(padX * 0.9);
    const minPhotoH = Math.round(h * 0.36);
    if (panelY < minPhotoH) panelY = minPhotoH;
    // Never start panel below the logo (would crop mark)
    if (panelY > logoY - Math.round(padX * 0.5)) {
      panelY = Math.max(minPhotoH * 0.85, logoY - Math.round(padX * 0.9));
    }
    const panelH = h - panelY;
    const logoYClamped = Math.max(panelY + Math.round(padX * 0.65), logoY);
    const hair = Math.max(3, Math.round(t.S * 0.004));

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${sharedDefs}</defs>
  ${plate}
  <rect x="0" y="${panelY}" width="${w}" height="${panelH}" fill="${t.scrim}"/>
  <rect x="0" y="${panelY}" width="${w}" height="${hair}" fill="url(#gAccent)"/>
  ${
    logoUri
      ? `<image href="${logoUri}" x="${padX}" y="${logoYClamped}" width="${t.logoW}" height="${t.logoH}"/>`
      : ''
  }
  ${textLines(hLines, {
    x: padX,
    y0: hY0,
    size: fit.size,
    leading: fit.lead,
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
          opacity: 0.9,
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
    fill: ctaFill,
    label: cta,
    labelSize: t.ctaLabel,
    fontFamily,
  })}
</svg>`;
  }

  // ═══════════ HERO + STORY (+ landscape uses same bottom stack) ═══════════
  {
    const isStory = templateId === 'story' || t.profile === 'story';
    const baseH1 = isStory ? Math.round(t.h1 * 1.06) : t.h1;
    const fit = fitHeadline(headline, textW, baseH1, 3);
    const sWrap = wrapText(support, bChars, maxSupport);
    const sLines = sWrap.lines;
    const hLines = fit.lines;

    const { ctaY, sY0, hY0, typeTop } = stackFromBottom({
      canvasH: h,
      padBot,
      ctaH: t.ctaH,
      hLines,
      hLead: fit.lead,
      hSize: fit.size,
      sLines,
      sLead: t.bodyLead,
      sSize: t.body,
      gapH1Body: t.gapH1Body,
      gapBodyCta: t.gapBodyCta,
    });

    // Scrim starts above type with breathing room; stronger near CTA
    const scrimY = Math.max(Math.round(h * 0.28), typeTop - Math.round(padX * 1.15));
    const topScrimH = Math.round(h * (isStory ? 0.12 : 0.13));

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${sharedDefs}
    <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.scrim}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${t.scrim}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrimBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.scrim}" stop-opacity="0"/>
      <stop offset="22%" stop-color="${t.scrim}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${t.scrim}" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="${t.scrim}" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  ${plate}
  <rect width="${w}" height="${topScrimH}" fill="url(#scrimTop)"/>
  <rect y="${scrimY}" width="${w}" height="${h - scrimY}" fill="url(#scrimBot)"/>
  ${logoTL}
  ${textLines(hLines, {
    x: padX,
    y0: hY0,
    size: fit.size,
    leading: fit.lead,
    weight: 700,
    fill: t.textOnDark,
    fontFamily,
    shadow: true,
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
          opacity: 0.94,
          fontFamily,
          shadow: true,
        })
      : ''
  }
  ${ctaBar({
    x: padX,
    y: ctaY,
    width: textW,
    height: t.ctaH,
    radius: t.ctaRadius,
    fill: ctaFill,
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
