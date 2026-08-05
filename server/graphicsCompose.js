/**
 * Brand graphics compose — the "best" title path for Creative Studio.
 *
 * Why this exists:
 *  - Homebrew ffmpeg often has NO drawtext (no freetype)
 *  - HyperFrames is great later, but SVG→PNG→overlay works now and looks designed
 *
 * Pipeline:
 *  1. Brand OS colors + fonts → SVG cards (hook / lower-third / CTA end)
 *  2. @resvg/resvg-js → transparent PNG 1080×1920
 *  3. ffmpeg overlay with enable=between(t,start,end)
 *
 * Design rules (Glampire OS · per-workspace Brand OS):
 *  - Outfit for type (not system Arial)
 *  - Active workspace wordmark on end card (never another client's logo)
 *  - No full-frame brand wash — dark neutral scrim only; brand color as thin accent
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { getBrand } from './brand.js';
import { resolveWorkspaceLogoPath } from './brandLoader.js';
import { getVideoStyle } from './videoStyles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1080;
const H = 1920;
const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const FONT_FAMILY = 'Outfit, Arial, Helvetica, sans-serif';

/** Neutral ink for scrims — never brand violet as a full-screen wash */
const SCRIM = '#0B0B0C';

/**
 * Brand chrome modes for story reels.
 *
 *  organic     — captions only (default for TikTok/IG organic volume)
 *  ads         — captions only, same plate as organic (use platform CTA / caption)
 *  ads_endcard — captions + workspace logo end card (paid / conversion cuts)
 *  ads_full    — captions + corner logo + end card (max brand recall)
 */
export const BRAND_CHROME_MODES = {
    organic: {
        id: 'organic',
        label: 'Organic',
        description: 'Captions only — no logo, no end card. Best for TikTok/IG volume.',
        cornerLogo: false,
        endCard: false,
    },
    ads: {
        id: 'ads',
        label: 'Ads (no end card)',
        description: 'Captions only — clean plate for Spark/Meta; CTA in platform card or caption.',
        cornerLogo: false,
        endCard: false,
    },
    ads_endcard: {
        id: 'ads_endcard',
        label: 'Ads + end card',
        description: 'Captions + official logo end card. For paid boosts.',
        cornerLogo: false,
        endCard: true,
    },
    ads_full: {
        id: 'ads_full',
        label: 'Ads full brand',
        description: 'Corner logo + end card. Max brand recall, least native.',
        cornerLogo: true,
        endCard: true,
    },
};

/** Normalize any user/API value to a known chrome mode (default: organic). */
export function normalizeBrandChrome(value) {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, '_');
    // aliases
    if (raw === 'none' || raw === 'organic_only' || raw === 'captions' || raw === 'ugc') {
        return 'organic';
    }
    if (raw === 'endcard' || raw === 'end_card' || raw === 'cta' || raw === 'ads_cta') {
        return 'ads_endcard';
    }
    if (raw === 'full' || raw === 'branded' || raw === 'logo' || raw === 'full_brand') {
        return 'ads_full';
    }
    if (raw === 'ads_no_end' || raw === 'ads_clean' || raw === 'paid') {
        return 'ads';
    }
    if (BRAND_CHROME_MODES[raw]) return raw;
    return 'organic';
}

export function brandChromeFlags(value) {
    const id = normalizeBrandChrome(value);
    return BRAND_CHROME_MODES[id] || BRAND_CHROME_MODES.organic;
}

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, opts);
        let stderr = '';
        child.stderr?.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-1000)}`));
        });
    });
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
 * Word-wrap — NEVER drops words.
 * maxLines is a soft preference; if text is long we keep adding lines
 * rather than truncating (missing words was a production bug).
 */
function wrapText(text, maxChars = 28, maxLines = 8) {
    const words = String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
    if (!words.length) return [];

    const lines = [];
    let cur = '';
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxChars && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = next;
        }
    }
    if (cur) lines.push(cur);

    // If we exceeded soft maxLines, reflow with slightly wider lines instead of dropping
    if (lines.length > maxLines && maxLines > 0) {
        const wider = Math.ceil(
            words.join(' ').length / maxLines + 2
        );
        return wrapText(words.join(' '), Math.max(maxChars, wider), 99);
    }
    return lines;
}

function brandTokens(brand) {
    const c = brand?.colors || {};
    return {
        brand: c.brand || '#5B5BD6',
        brandDeep: c.brandDeep || '#663CF6',
        accent: c.accent || '#ED81FF',
        warm: c.warm || '#E88146',
        dark: SCRIM, // force neutral scrim; keep brand for accents only
        brandInk: c.dark || '#141233',
        ink: c.ink || '#000000',
        surface: c.surface || '#F7F7F7',
        name: brand?.name || 'Brand',
        oneLiner: brand?.oneLiner || brand?.promise || '',
        website: brand?.website || '',
    };
}

/** Active workspace logo only. */
function resolveLogoPath() {
    return resolveWorkspaceLogoPath();
}

/**
 * Load workspace logo as data-URI, recolored for light or dark plate.
 */
function loadBrandLogoDataUri({ color = '#FFFFFF' } = {}) {
    const logoPath = resolveLogoPath();
    if (!logoPath) return null;
    let svg = fs.readFileSync(logoPath, 'utf8');
    // Normalize fills so the mark reads on dark scrims
    svg = svg
        .replace(/fill="#262626"/gi, `fill="${color}"`)
        .replace(/fill="#000000"/gi, `fill="${color}"`)
        .replace(/fill="black"/gi, `fill="${color}"`)
        .replace(/fill="#0[bB]0[bB]0[cC]"/gi, `fill="${color}"`);
    // If paths use currentColor
    if (!/fill=/.test(svg)) {
        svg = svg.replace(/<svg\b/, `<svg fill="${color}"`);
    }
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
}

function outfitFontFiles() {
    const names = ['Outfit-Regular.ttf', 'Outfit-SemiBold.ttf', 'Outfit-Bold.ttf'];
    return names
        .map((n) => path.join(FONT_DIR, n))
        .filter((p) => fs.existsSync(p));
}

/**
 * Full spoken line for on-screen caption.
 * Does NOT truncate mid-sentence — missing words was a critical bug.
 * Only strips a trailing "Join the beta" when the end card will say it.
 * Keeps brand name and every other sentence.
 */
export function captionFromDialogue(raw, { role = 'hook', stripTrailingCta = true } = {}) {
    let t = String(raw || '')
        .replace(/[—–]/g, ' — ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!t) return '';

    if (stripTrailingCta) {
        // Keep brand name in the line — only drop pure CTA tail (end card owns that)
        t = t
            .replace(/\s*[—–-]\s*join the beta\.?$/i, '')
            .replace(/\s*join the beta\.?$/i, '')
            .replace(/\s*come (try|join) it\.?$/i, '')
            .replace(/\s*come try it\.?$/i, '')
            .replace(/\s+/g, ' ')
            .replace(/\.\s*\.$/, '.')
            .trim();
    }

    // Keep EVERY sentence — no maxChars chop, no mid-line ellipsis
    return t;
}

/** Probe media duration (seconds). */
async function probeMediaDuration(filePath) {
    try {
        const { stdout } = await new Promise((resolve, reject) => {
            const child = spawn(
                'ffprobe',
                [
                    '-v',
                    'error',
                    '-show_entries',
                    'format=duration',
                    '-of',
                    'default=noprint_wrappers=1:nokey=1',
                    filePath,
                ],
                {}
            );
            let stdout = '';
            let stderr = '';
            child.stdout?.on('data', (d) => {
                stdout += d.toString();
            });
            child.stderr?.on('data', (d) => {
                stderr += d.toString();
            });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) resolve({ stdout, stderr });
                else reject(new Error(stderr || 'ffprobe failed'));
            });
        });
        const n = parseFloat(String(stdout).trim());
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

/**
 * Force exclusive non-overlapping caption windows.
 * Overlapping enables = stacked double text (the bug you saw).
 * Never extend word layers into each other.
 */
function enforceExclusiveCaptionWindows(layers, { total, ctaStart }) {
    const caps = layers
        .filter((l) =>
            [
                'dialogue_caption',
                'word_caption',
                'spoken_caption',
                'emotion_keyword',
                'hook',
                'lower_third',
            ].includes(l.kind)
        )
        .sort((a, b) => a.start - b.start || a.end - b.end);

    for (let i = 0; i < caps.length; i++) {
        const cur = caps[i];
        const next = caps[i + 1];
        // Hard exclusive end: never overlap next layer
        if (next) {
            const maxEnd = next.start - 0.001;
            if (cur.end > maxEnd) cur.end = Math.max(cur.start + 0.04, maxEnd);
        } else if (ctaStart != null && cur.end > ctaStart) {
            cur.end = Math.max(cur.start + 0.04, ctaStart);
        } else if (cur.end > total) {
            cur.end = total;
        }
    }

    // First caption starts at 0; last holds to CTA if there's a silent hole
    if (caps.length) {
        caps[0].start = 0;
        const last = caps[caps.length - 1];
        const holdUntil = ctaStart != null ? ctaStart : total;
        if (last.end < holdUntil - 0.05) last.end = holdUntil;
    }

    return layers;
}

/**
 * Bake many timed caption PNGs into ONE alpha video track.
 * Prevents 30+ overlay chain (stacking / dropped enables after ~3s).
 */
async function bakeCaptionTrack({ layers, durationSec, workDir }) {
    const dir = path.join(workDir, 'caption-track');
    fs.mkdirSync(dir, { recursive: true });

    const sorted = [...layers].sort((a, b) => a.start - b.start);
    if (!sorted.length) return null;

    const total = Math.max(0.5, Number(durationSec) || 15);

    // 1×1 transparent PNG (reusable gap filler)
    const clearPng = path.join(dir, 'clear.png');
    if (!fs.existsSync(clearPng)) {
        renderSvgToPng(
            `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"></svg>`,
            clearPng
        );
    }

    // Build segment plan first (gaps + word plates), then encode in parallel.
    // Sequential qtrle of 30–50 full-frame plates was hanging assemble for minutes.
    const plan = [];
    let cursor = 0;
    const pushGapPlan = (from, to) => {
        const d = to - from;
        if (d < 0.02) return;
        plan.push({ kind: 'gap', start: from, dur: d, index: plan.length });
        cursor = to;
    };

    for (let i = 0; i < sorted.length; i++) {
        const layer = sorted[i];
        const start = Math.max(0, Number(layer.start) || 0);
        const end = Math.max(start + 0.04, Number(layer.end) || start + 0.04);
        if (start > cursor + 0.02) pushGapPlan(cursor, start);

        const dur = Math.max(0.04, end - Math.max(cursor, start));
        plan.push({
            kind: 'plate',
            start: Math.max(cursor, start),
            dur,
            index: plan.length,
            png: layer.path,
        });
        cursor = Math.max(cursor, start) + dur;
    }
    if (cursor < total - 0.02) pushGapPlan(cursor, total);

    const encodeOne = async (seg) => {
        const segPath = path.join(dir, `${seg.kind}-${seg.index}.mov`);
        const src = seg.kind === 'gap' ? clearPng : seg.png;
        // qtrle keeps alpha (libx264 cannot). Parallelized below for speed.
        await run('ffmpeg', [
            '-y',
            '-loop',
            '1',
            '-t',
            seg.dur.toFixed(3),
            '-i',
            src,
            '-vf',
            'format=rgba,fps=30',
            '-c:v',
            'qtrle',
            '-an',
            segPath,
        ]);
        return { path: segPath, dur: seg.dur };
    };

    // Parallel encode (cap concurrency so we don't fork-bomb)
    const CONCURRENCY = 4;
    const segs = new Array(plan.length);
    let next = 0;
    async function worker() {
        while (next < plan.length) {
            const i = next++;
            segs[i] = await encodeOne(plan[i]);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, plan.length) }, () => worker())
    );

    // All paths relative inside dir; run ffmpeg with cwd=dir
    const listFile = path.join(dir, 'concat.txt');
    fs.writeFileSync(
        listFile,
        segs.map((s) => `file '${path.basename(s.path)}'`).join('\n')
    );

    const outPath = path.join(dir, 'captions.mov');
    await run(
        'ffmpeg',
        ['-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'captions.mov'],
        { cwd: dir }
    );

    if (!fs.existsSync(outPath)) {
        throw new Error(`caption track missing after concat: ${outPath}`);
    }
    return { path: outPath, duration: total };
}

/**
 * Split caption into timed word tokens (keeps punctuation stuck to words).
 */
export function tokenizeCaption(text) {
    return String(text || '')
        .replace(/[—–]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w && !/^[.,;:!?…]+$/.test(w));
}

/**
 * Word schedule aligned to real speech windows.
 *
 * Default: words span most of the beat (not the first 55% only — that was
 * the "captions finish while he's still talking" bug).
 * Optional speechStart/speechEnd (relative 0–1 or absolute seconds) for energy-sync.
 */
export function scheduleWords(text, t0, durationSec, opts = {}) {
    const words = tokenizeCaption(text);
    if (!words.length) return [];

    const beatDur = Math.max(0.8, Number(durationSec) || 4);
    const n = words.length;

    // Resolve speech window inside the beat
    let speechStartRel = opts.speechStartRel;
    let speechEndRel = opts.speechEndRel;
    if (opts.speechStartAbs != null) speechStartRel = (opts.speechStartAbs - t0) / beatDur;
    if (opts.speechEndAbs != null) speechEndRel = (opts.speechEndAbs - t0) / beatDur;

    // Natural talking-head: speech usually 8% → 88% of the plate
    if (speechStartRel == null) speechStartRel = opts.padIn != null ? opts.padIn / beatDur : 0.08;
    if (speechEndRel == null) {
        const ratio = opts.speechWindowRatio ?? 0.88;
        speechEndRel = Math.min(0.95, Math.max(speechStartRel + 0.35, ratio));
    }
    speechStartRel = Math.max(0, Math.min(0.4, speechStartRel));
    speechEndRel = Math.max(speechStartRel + 0.3, Math.min(0.98, speechEndRel));

    const startAt = t0 + beatDur * speechStartRel;
    const endAt = t0 + beatDur * speechEndRel;
    const span = Math.max(0.6, endAt - startAt);

    // Weight longer words slightly longer
    const weights = words.map((w) => Math.max(0.55, Math.min(2.2, w.replace(/[^a-zA-Z']/g, '').length / 4.2)));
    const weightSum = weights.reduce((a, b) => a + b, 0) || n;

    let cursor = startAt;
    return words.map((word, index) => {
        const slot = (span * weights[index]) / weightSum;
        const start = cursor;
        const end =
            index === n - 1
                ? Math.max(start + 0.12, Math.min(t0 + beatDur - 0.04, endAt + beatDur * 0.04))
                : start + slot;
        cursor = end;
        return {
            word,
            index,
            start: Math.max(t0, start),
            end: Math.max(start + 0.08, end),
        };
    });
}

/**
 * Karaoke caption — FULL sentence always on screen (nothing "missing").
 * Classic studio look (restored):
 *  - already spoken  → Brand OS colors.brand (highlight trail)
 *  - current word    → pure white + heavier
 *  - not yet spoken  → soft gray
 *
 * Brand fill is drawn twice (color underlay + black stroke top) so mint/purple
 * survives yuv420p chroma subsampling on thin glyphs.
 */
function svgWordWindow({
    words,
    activeIndex,
    role = 'hook',
    brandPurple = '#5B5BD6',
    mode = 'karaoke',
}) {
    const list = Array.isArray(words) ? words.filter(Boolean) : [];
    if (!list.length) return svgReelCaptionStatic({ text: '', role });

    const n = list.length;
    const fontSize = n >= 14 ? 42 : n >= 10 ? 48 : n >= 7 ? 52 : 58;
    const lineH = Math.round(fontSize * 1.22);
    // Lower third (~80% height) — clear of face/chin, Reels-safe
    const firstLineY = Math.round(H * 0.78);

    // Wrap into lines of ~22–24 chars
    const lines = [];
    let cur = [];
    let curLen = 0;
    for (let i = 0; i < list.length; i++) {
        const w = list[i];
        const add = (cur.length ? 1 : 0) + w.length;
        if (curLen + add > 24 && cur.length) {
            lines.push(cur);
            cur = [{ w, i }];
            curLen = w.length;
        } else {
            cur.push({ w, i });
            curLen += add;
        }
    }
    if (cur.length) lines.push(cur);

    // solid hex only — resvg mishandles rgba() on tspan fills
    const brand = brandPurple || '#5B5BD6';
    const fillActive = '#FFFFFF';
    const fillTrail = brand; // spoken trail = brand highlight (platform rule)
    const fillUpcoming = '#C8C8CC';

    const wordMeta = (i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        if (mode === 'cumulative' && i > activeIndex) return null;
        if (isActive) return { fill: fillActive, weight: 800, brandUnder: true };
        if (isPast || (mode === 'cumulative' && !isActive))
            return { fill: fillTrail, weight: 750, brandUnder: true };
        return { fill: fillUpcoming, weight: 650, brandUnder: false };
    };

    const buildTopTspans = (lineWords) =>
        lineWords
            .map(({ w, i }, j) => {
                const meta = wordMeta(i);
                if (!meta) return '';
                const gap = j === 0 ? '' : ' ';
                return `${gap}<tspan fill="${meta.fill}" font-weight="${meta.weight}">${escapeXml(w)}</tspan>`;
            })
            .join('');

    // Same word spacing as top layer; only past/active get solid brand mass.
    // Upcoming uses opacity 0 so layout matches but no brand paint.
    const buildUnderTspans = (lineWords) =>
        lineWords
            .map(({ w, i }, j) => {
                const meta = wordMeta(i);
                if (!meta) return '';
                const gap = j === 0 ? '' : ' ';
                if (!meta.brandUnder) {
                    return `${gap}<tspan fill="${brand}" fill-opacity="0" stroke-opacity="0" font-weight="${meta.weight}">${escapeXml(w)}</tspan>`;
                }
                return `${gap}<tspan fill="${brand}" font-weight="${meta.weight}">${escapeXml(w)}</tspan>`;
            })
            .join('');

    const lineSvgs = lines
        .map((lineWords, li) => {
            const y = firstLineY + li * lineH;
            const under = buildUnderTspans(lineWords);
            const top = buildTopTspans(lineWords);
            const hasBrand = lineWords.some(({ i }) => wordMeta(i)?.brandUnder);
            // Layer 1: fat brand underlay — color survives yuv420p
            // Layer 2: black stroke + white/brand/gray fills for readability
            const underLayer = hasBrand
                ? `
  <text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="800"
        x="540" y="${y}" text-anchor="middle"
        stroke="${brand}" stroke-width="14" stroke-linejoin="round"
        paint-order="stroke fill" letter-spacing="-0.2"
        filter="url(#capBrandGlow)">${under}</text>`
                : '';
            return `${underLayer}
  <text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700"
        x="540" y="${y}" text-anchor="middle"
        stroke="#000000" stroke-width="11" stroke-linejoin="round" stroke-opacity="0.92"
        paint-order="stroke fill" letter-spacing="-0.2"
        filter="url(#capSoft)">${top}</text>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="capSoft" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
    <filter id="capBrandGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${brand}" flood-opacity="0.85"/>
    </filter>
  </defs>
  ${lineSvgs}
</svg>`;
}

/**
 * Full-beat caption — Outfit, lower third, NO black pill/frame.
 * White fill + thick black stroke + soft drop shadow only (matches organic karaoke look).
 * Every word from dialogue is drawn (no truncation).
 */
function svgBeatCaptionFull({ text, role = 'hook', brandPurple = '#5B5BD6' }) {
    const raw = String(text || '')
        .replace(/[—–]/g, ' — ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!raw) return svgReelCaptionStatic({ text: '', role });

    const words = raw.split(' ').filter(Boolean);
    // Prefer 2–3 lines; NEVER drop words (reflow wider if needed)
    let lines = wrapText(raw, 26, 4);
    let outWords = lines.join(' ').split(/\s+/).filter(Boolean);
    if (outWords.length !== words.length) {
        lines = wrapText(raw, 34, 99);
        outWords = lines.join(' ').split(/\s+/).filter(Boolean);
    }
    // Final guarantee: single-line dump of every word if wrap still mismatches
    if (outWords.length !== words.length) {
        lines = [words.join(' ')];
    }

    const nLines = Math.max(1, lines.length);
    const fontSize =
        nLines >= 5 ? 36 : nLines === 4 ? 40 : nLines === 3 ? 46 : nLines === 2 ? 52 : 58;
    const lineH = Math.round(fontSize * 1.22);
    // Lower third (~78% height) — same as karaoke window
    const firstY = Math.round(H * 0.78);

    const lineSvgs = lines
        .map((line, li) => {
            const y = firstY + li * lineH;
            return `<text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="800"
        x="540" y="${y}" text-anchor="middle"
        stroke="#000000" stroke-width="16" stroke-linejoin="round" stroke-opacity="0.92"
        paint-order="stroke fill" letter-spacing="-0.15"
        fill="#FFFFFF" filter="url(#capSoftFull)">${escapeXml(line)}</text>`;
        })
        .join('\n  ');

    const meta = `<!-- FULL_CAPTION outfit no-pill words=${words.length} text=${escapeXml(raw)} -->`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${meta}
  <defs>
    <filter id="capSoftFull" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.7"/>
    </filter>
  </defs>
  ${lineSvgs}
</svg>`;
}

/** Full-sentence static caption (fallback) — Outfit lower third, no black box. */
function svgReelCaptionStatic({ text, role = 'hook' }) {
    const lines = wrapText(text, 26, 3);
    const long = lines.join(' ').length > 48 || lines.length >= 3;
    const fontSize = long ? 42 : lines.length === 2 ? 48 : 52;
    const lineH = Math.round(fontSize * 1.2);
    // Lower third — match karaoke / organic reels
    const boxY = Math.round(H * 0.78);
    const tspan = lines
        .map((line, i) => {
            const y = boxY + i * lineH;
            return `<tspan x="540" y="${y}">${escapeXml(line)}</tspan>`;
        })
        .join('');
    const fill = role === 'tension' ? '#FFF6EE' : '#FFFFFF';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="capSoft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700"
        fill="${fill}" text-anchor="middle"
        stroke="#000000" stroke-width="15" stroke-linejoin="round" stroke-opacity="0.92"
        paint-order="stroke fill" letter-spacing="-0.2" filter="url(#capSoft)">
    ${tspan}
  </text>
</svg>`;
}

/** @deprecated name kept for callers — routes to static full caption */
function svgReelCaption(opts) {
    return svgReelCaptionStatic(opts);
}

/**
 * Karaoke layers from Whisper ASR (absolute times, exact spoken words).
 * Prefer this over script dialogue for Grok-native / diegetic talk.
 */
export function buildAsrKaraokeLayers({
    workDir,
    asrWindows,
    brandPurple = '#5B5BD6',
    role = 'hook',
}) {
    const layers = [];
    const list = Array.isArray(asrWindows) ? asrWindows : [];
    for (let i = 0; i < list.length; i++) {
        const win = list[i];
        const words = Array.isArray(win.words) ? win.words.filter(Boolean) : [];
        if (!words.length) continue;
        const start = Math.max(0, Number(win.start) || 0);
        const end = Math.max(start + 0.04, Number(win.end) || start + 0.12);
        const activeIndex = Math.max(
            0,
            Math.min(words.length - 1, Number(win.activeIndex) || 0)
        );
        const svg = svgWordWindow({
            words,
            activeIndex,
            role,
            brandPurple,
            mode: 'karaoke',
        });
        const pngPath = path.join(workDir, `gfx-asr-w${i}.png`);
        renderSvgToPng(svg, pngPath);
        layers.push({
            kind: 'word_caption',
            path: pngPath,
            start,
            end,
            index: `asr-${i}`,
            text: words.join(' '),
            word: win.word || words[activeIndex],
            activeIndex,
            source: 'asr',
        });
    }
    return layers;
}

/**
 * Build karaoke word layers for one beat.
 * FULL sentence always visible; active word = white, past = purple, future = soft gray.
 * Times are EXCLUSIVE [start, next) so only ONE plate is ever composited.
 *
 * NOTE: for talk reels with native audio, prefer buildAsrKaraokeLayers (Whisper)
 * — script dialogue often does not match lips.
 */
function buildWordCaptionLayers({
    workDir,
    beatIndex,
    captionText,
    role,
    t0,
    durationSec,
    brandPurple = '#5B5BD6',
    holdUntil = null,
    speechStartRel = null,
    speechEndRel = null,
}) {
    const beatDur = Math.max(0.8, Number(durationSec) || 4);
    const cutStart = Math.max(0, t0);
    // Exclusive cut end — caller must not add micro-overlap
    const cutEnd = holdUntil != null ? holdUntil : t0 + beatDur;

    const schedule = scheduleWords(captionText, cutStart, beatDur, {
        speechWindowRatio: 0.9,
        speechStartRel: speechStartRel ?? 0.05,
        speechEndRel: speechEndRel ?? 0.9,
    });
    if (!schedule.length) return [];

    const allWords = schedule.map((s) => s.word);
    const layers = [];

    // Build exclusive windows: word i lives in [t_i, t_{i+1})
    // First word starts at cutStart so nothing is blank at the cut
    const starts = schedule.map((s) => s.start);
    starts[0] = cutStart;

    for (let i = 0; i < schedule.length; i++) {
        const layerStart = starts[i];
        const layerEnd =
            i < schedule.length - 1
                ? starts[i + 1]
                : cutEnd;
        if (layerEnd <= layerStart + 0.03) continue;

        const svg = svgWordWindow({
            words: allWords,
            activeIndex: i,
            role,
            brandPurple,
            mode: 'karaoke',
        });
        const pngPath = path.join(workDir, `gfx-beat-${beatIndex}-w${i}.png`);
        renderSvgToPng(svg, pngPath);
        layers.push({
            kind: 'word_caption',
            path: pngPath,
            start: layerStart,
            end: layerEnd,
            index: `${beatIndex}-${i}`,
            text: allWords.join(' '),
            word: schedule[i].word,
            activeIndex: i,
        });
    }

    // Guarantee last layer holds all the way to cutEnd with FULL line highlighted
    if (layers.length) {
        layers[layers.length - 1].end = cutEnd;
        // Final plate: all words purple (spoken) / last white — already last activeIndex
    } else {
        const pngPath = path.join(workDir, `gfx-beat-${beatIndex}-full.png`);
        const words = tokenizeCaption(captionText);
        renderSvgToPng(
            svgWordWindow({
                words,
                activeIndex: Math.max(0, words.length - 1),
                role,
                brandPurple,
                mode: 'karaoke',
            }),
            pngPath
        );
        layers.push({
            kind: 'word_caption',
            path: pngPath,
            start: cutStart,
            end: cutEnd,
            index: beatIndex,
            text: captionText,
        });
    }

    return layers;
}

/**
 * Legacy short emotion keyword (opt-in via style titleStyle: emotion_keyword).
 */
function svgEmotionKeyword({ text, tokens, role = 'hook' }) {
    const lines = wrapText(text, 18, 2);
    const fontSize = lines.join(' ').length > 16 ? 42 : 50;
    const lineH = Math.round(fontSize * 1.12);
    const boxY = H - 300;
    const tspan = lines
        .map((line, i) => {
            const y = boxY + 22 + fontSize * 0.82 + i * lineH;
            return `<tspan x="540" y="${y}">${escapeXml(line)}</tspan>`;
        })
        .join('');
    const accent =
        role === 'tension' ? tokens.warm || '#E88146' : '#FFFFFF';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="kwScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${SCRIM}" stop-opacity="0"/>
      <stop offset="40%" stop-color="${SCRIM}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${SCRIM}" stop-opacity="0.72"/>
    </linearGradient>
    <filter id="kwShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect y="${H - 480}" width="${W}" height="480" fill="url(#kwScrim)"/>
  <rect x="${(W - 160) / 2}" y="${boxY - 8}" width="160" height="3" rx="1.5" fill="${accent}" fill-opacity="0.9"/>
  <text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700"
        fill="#FFFFFF" text-anchor="middle" filter="url(#kwShadow)" letter-spacing="-0.4">
    ${tspan}
  </text>
</svg>`;
}

/** Legacy full spoken caption (non face-talk plates only). */
function svgSpokenCaption({ text, tokens, role = 'hook' }) {
    const maxChars = role === 'hook' ? 22 : 24;
    const lines = wrapText(text, maxChars, 3);
    const fontSize = role === 'hook' ? 46 : 40;
    const lineH = Math.round(fontSize * 1.18);
    const boxY = role === 'hook' ? 780 : 920;
    const tspan = lines
        .map((line, i) => {
            const y = boxY + 28 + fontSize * 0.85 + i * lineH;
            return `<tspan x="540" y="${y}">${escapeXml(line)}</tspan>`;
        })
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="capShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.85"/>
    </filter>
  </defs>
  <text font-family="${FONT_FAMILY}"
        font-size="${fontSize}" font-weight="800" fill="#0a0a0f"
        text-anchor="middle" stroke="#0a0a0f" stroke-width="9"
        stroke-linejoin="round" paint-order="stroke fill"
        letter-spacing="-0.6">${tspan}</text>
  <text font-family="${FONT_FAMILY}"
        font-size="${fontSize}" font-weight="800" fill="#FFFFFF"
        text-anchor="middle" filter="url(#capShadow)"
        letter-spacing="-0.6">${tspan}</text>
</svg>`;
}

/**
 * Hook / bold title — top of frame (secondary when spoken caption is primary).
 */
function svgHookTitle({ title, tokens, styleId }) {
    const lines = wrapText(title, 26, 3);
    const ultra = styleId === 'ultra_ugc' || styleId === 'ugc_field';
    const lineH = ultra ? 58 : 52;
    const startY = 220;
    const tspan = lines
        .map((line, i) => {
            const y = startY + i * lineH;
            return `<tspan x="540" y="${y}">${escapeXml(line)}</tspan>`;
        })
        .join('');

    const blockH = lines.length * lineH + 48;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${SCRIM}" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="${SCRIM}" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="${W}" height="520" fill="url(#scrimTop)"/>
  <rect x="48" y="140" width="984" height="${blockH}" rx="20"
        fill="${SCRIM}" fill-opacity="0.55"/>
  <text font-family="${FONT_FAMILY}" font-size="${ultra ? 48 : 42}"
        font-weight="700" fill="#FFFFFF" text-anchor="middle"
        filter="url(#shadow)" letter-spacing="-0.4">
    ${tspan}
  </text>
</svg>`;
}

/**
 * Lower-third — mid/bottom, calmer.
 */
function svgLowerThird({ title, tokens }) {
    const lines = wrapText(title, 32, 2);
    const lineH = 44;
    const boxH = lines.length * lineH + 40;
    const boxY = H - 420;
    const tspan = lines
        .map((line, i) => `<tspan x="80" y="${boxY + 48 + i * lineH}">${escapeXml(line)}</tspan>`)
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="scrimBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${SCRIM}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${SCRIM}" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect y="${H - 560}" width="${W}" height="560" fill="url(#scrimBot)"/>
  <rect x="48" y="${boxY}" width="6" height="${boxH}" rx="3" fill="#FFFFFF" fill-opacity="0.9"/>
  <rect x="60" y="${boxY}" width="920" height="${boxH}" rx="16"
        fill="${SCRIM}" fill-opacity="0.72"/>
  <text font-family="${FONT_FAMILY}" font-size="36" font-weight="600"
        fill="#FFFFFF" letter-spacing="-0.2">
    ${tspan}
  </text>
</svg>`;
}

/**
 * Small corner brand mark (official wordmark) — top of frame during talking head.
 * White logo + soft shadow so it reads on busy backgrounds.
 */
function svgCornerLogo({ opacity = 0.92 } = {}) {
    const logoUri = loadBrandLogoDataUri({ color: '#FFFFFF' });
    const logoW = 196;
    const logoH = 51;
    const logoX = Math.round((W - logoW) / 2);
    const logoY = 72;

    if (!logoUri) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <text x="540" y="110" font-family="${FONT_FAMILY}" font-size="28" font-weight="700"
        fill="#FFFFFF" fill-opacity="${opacity}" text-anchor="middle" letter-spacing="1.5">${escapeXml((getBrand()?.name || 'BRAND').toUpperCase().slice(0, 18))}</text>
</svg>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="logoSoft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <image href="${logoUri}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}"
         preserveAspectRatio="xMidYMid meet" opacity="${opacity}" filter="url(#logoSoft)"/>
</svg>`;
}

/**
 * End card — real logo + CTA + one-liner.
 * Dark neutral glass over the last frame (no purple brand wash).
 * Brand color only as a thin underline under the CTA.
 */
function svgCtaEnd({ cta, tokens, brandName, oneLiner, website }) {
    const lines = wrapText(oneLiner || tokens.oneLiner, 32, 2);
    const subY = 1180;
    const sub = lines
        .map((line, i) => `<tspan x="540" y="${subY + i * 40}">${escapeXml(line)}</tspan>`)
        .join('');
    const logoUri = loadBrandLogoDataUri({ color: '#FFFFFF' });
    const site = String(website || tokens.website || '')
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');

    // Logo box: official mark is 108×28 — scale ~4.2× for 1080 frame
    const logoW = 454;
    const logoH = 118;
    const logoX = (W - logoW) / 2;
    const logoY = 720;

    const logoBlock = logoUri
        ? `<image href="${logoUri}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}"
             preserveAspectRatio="xMidYMid meet"/>`
        : `<text x="540" y="${logoY + 72}" font-family="${FONT_FAMILY}" font-size="52" font-weight="700"
             fill="#FFFFFF" text-anchor="middle" letter-spacing="-0.5">${escapeXml(brandName || getBrand()?.name || 'Brand')}</text>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="endBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${SCRIM}" stop-opacity="0.55"/>
      <stop offset="35%" stop-color="${SCRIM}" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="${SCRIM}" stop-opacity="0.94"/>
    </linearGradient>
    <filter id="endShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <!-- Neutral dark glass — never brand purple full-frame -->
  <rect width="${W}" height="${H}" fill="url(#endBg)"/>

  ${logoBlock}

  <text x="540" y="980" font-family="${FONT_FAMILY}" font-size="58" font-weight="700"
        fill="#FFFFFF" text-anchor="middle" letter-spacing="-0.8" filter="url(#endShadow)">
    ${escapeXml(cta || getBrand()?.primaryCta || 'Learn more')}
  </text>
  <!-- Thin brand accent only under CTA -->
  <rect x="430" y="1010" width="220" height="4" rx="2" fill="${tokens.brand}" fill-opacity="0.95"/>

  <text font-family="${FONT_FAMILY}" font-size="28" font-weight="400"
        fill="#FFFFFF" fill-opacity="0.88" text-anchor="middle">
    ${sub}
  </text>
  ${site
            ? `<text x="540" y="1320" font-family="${FONT_FAMILY}" font-size="24" font-weight="500"
        fill="#FFFFFF" fill-opacity="0.55" text-anchor="middle" letter-spacing="0.5">${escapeXml(site)}</text>`
            : ''
        }
</svg>`;
}

function renderSvgToPng(svg, outPath) {
    const fonts = outfitFontFiles();
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: W },
        background: 'rgba(0,0,0,0)',
        font: {
            fontFiles: fonts,
            loadSystemFonts: true,
            defaultFontFamily: 'Outfit',
        },
    });
    const pngData = resvg.render();
    const png = pngData.asPng();
    fs.writeFileSync(outPath, png);
    return outPath;
}

/**
 * Build timed overlay layers for a story reel.
 * Talk styles → karaoke word captions (full line + purple trail + white active).
 * No black pill containers on talk reels.
 * @returns {{ layers: Array<{png, start, end, path}>, workDir }}
 */
export function buildStoryGraphics({
    workDir,
    beats,
    actualDurations,
    styleId,
    cta,
    brand: brandIn,
    totalDurationOverride = null,
    brandChrome = null,
    /** Whisper karaoke windows: { words, activeIndex, start, end }[] — preferred for talk */
    asrKaraokeWindows = null,
}) {
    fs.mkdirSync(workDir, { recursive: true });
    const brand = brandIn || getBrand();
    const style = getVideoStyle(styleId);
    const tokens = brandTokens(brand);
    const layers = [];
    // Default organic unless explicitly set on call, item brand, or brand OS
    const chrome = brandChromeFlags(
        brandChrome ?? brand?.defaultBrandChrome ?? brand?.brandChrome ?? 'organic'
    );
    const useAsrCaptions = Array.isArray(asrKaraokeWindows) && asrKaraokeWindows.length > 0;

    // Spoken-caption preference is workspace-agnostic.
    // Brand OS / item deliveryMode / ASR success decide — not Taskiz-only style names.
    const titleStyle = style.graphics?.titleStyle || 'word_reveal';
    const brandDelivery = brand?.defaultDeliveryMode || brand?.deliveryMode || '';
    // ASR captions are on unless Brand OS explicitly sets defaultUseAsrCaptions: false
    const brandWantsSpoken =
        brand?.defaultUseAsrCaptions !== false &&
        (brandDelivery === 'caption_talk' ||
            brandDelivery === 'diegetic_talk' ||
            !brandDelivery ||
            brandDelivery === 'auto');
    const talkStyle =
        styleId === 'contractor_talk' ||
        styleId === 'ultra_ugc' ||
        style.deliveryMode === 'caption_talk' ||
        style.deliveryMode === 'diegetic_talk' ||
        brandWantsSpoken ||
        titleStyle === 'word_reveal' ||
        titleStyle === 'dialogue_caption' ||
        titleStyle === 'phrase_per_beat' ||
        style.graphics?.captionStyle === 'karaoke_bottom' ||
        style.graphics?.captionStyle === 'dialogue_bottom' ||
        style.graphics?.motionText === 'word_highlight';
    // Like before: word-reveal karaoke for talk styles (script fallback when no ASR).
    // ASR path (below) still wins when Whisper succeeds — exact spoken words.
    // bakeCaptionTrack is parallelized so this no longer hangs assemble for minutes.
    const useWordReveal =
        talkStyle ||
        titleStyle === 'word_reveal' ||
        titleStyle === 'dialogue_caption' ||
        titleStyle === 'phrase_per_beat' ||
        titleStyle === 'hook_then_lower' ||
        brandWantsSpoken;
    const useDialogueCaptions =
        !useWordReveal &&
        (titleStyle === 'clean_sans' ||
            titleStyle === 'minimal_caption' ||
            titleStyle === 'soft_center' ||
            style.graphics?.captionStyle === 'clean_sans' ||
            brandWantsSpoken);

    // Precompute cut points so every beat owns [cutStart, cutEnd)
    const cutStarts = [];
    {
        let acc = 0;
        for (let i = 0; i < beats.length; i++) {
            cutStarts.push(acc);
            acc += actualDurations[i] || Number(beats[i].durationSec) || 5;
        }
        cutStarts.push(acc); // final end
    }

    // If we know true plate duration, snap last cut to it (avoids trailing gap / early CTA)
    if (
        totalDurationOverride &&
        Number.isFinite(totalDurationOverride) &&
        totalDurationOverride > 1
    ) {
        const sum = cutStarts[cutStarts.length - 1];
        if (Math.abs(sum - totalDurationOverride) > 0.05) {
            // Scale beat cuts proportionally to match real video length
            const scale = totalDurationOverride / Math.max(0.001, sum);
            for (let i = 0; i < cutStarts.length; i++) {
                cutStarts[i] = cutStarts[i] * scale;
            }
            cutStarts[cutStarts.length - 1] = totalDurationOverride;
        }
    }

    // ── ASR path: exact spoken words ALWAYS win when Whisper succeeded ──
    // Do NOT gate on useWordReveal / style titleStyle. Bug (WEPOC msetz59x): documentary_commercial
    // had titleStyle=lower_third so ASR karaoke was computed then thrown away for keyword titles
    // ("The old way" / "The cost") — no real subtitles, nonsense title cards.
    if (useAsrCaptions) {
        const asrLayers = buildAsrKaraokeLayers({
            workDir,
            asrWindows: asrKaraokeWindows,
            brandPurple: tokens.brand || tokens.brandDeep || '#5B5BD6',
            role: 'hook',
        });
        layers.push(...asrLayers);
        console.log(
            `[graphicsCompose] ASR karaoke burned: ${asrLayers.length} plates (style=${styleId}, titleStyle=${titleStyle})`
        );
    }

    let t = 0;
    for (let i = 0; i < beats.length; i++) {
        // When ASR karaoke is active, never also burn script keywords / lower-thirds
        if (useAsrCaptions) {
            t += actualDurations[i] || Number(beats[i].durationSec) || 5;
            continue;
        }

        const beat = beats[i];
        const dur = actualDurations[i] || Number(beat.durationSec) || 5;
        const cutStart = cutStarts[i];
        // EXCLUSIVE end at next cut — never overlap into the next beat (stacking bug)
        const cutEnd = cutStarts[i + 1];
        const start = cutStart;
        const end = cutEnd;

        const dialogue =
            beat.dialogue || beat.voiceLine || beat.spokenCaption || beat.caption || '';
        const keyword =
            beat.keyword ||
            beat.title ||
            (dialogue || '').split(/[.!?]/)[0]?.slice(0, 28) ||
            '';

        // Prefer FULL spoken dialogue over flow keywords ("The old way") on every workspace.
        // Keywords only if there is truly no dialogue (silent B-roll).
        const preferSpoken = useDialogueCaptions || useWordReveal || Boolean(String(dialogue).trim());
        let captionText = preferSpoken
            ? captionFromDialogue(dialogue || keyword || '', {
                role: beat.role || 'hook',
                stripTrailingCta: true,
            })
            : keyword;
        if (!captionText) {
            captionText =
                String(dialogue || keyword || beat.title || beat.headline || '').trim() ||
                (beat.role === 'resolve' ? cta || brand.primaryCta || 'Learn more' : '…');
        }

        // Safety: if dialogue is fuller than a keyword stub, always use dialogue
        if (
            dialogue &&
            String(dialogue).split(/\s+/).length >= 3 &&
            captionText.split(/\s+/).length < 3
        ) {
            captionText = captionFromDialogue(dialogue, {
                role: beat.role || 'hook',
                stripTrailingCta: true,
            });
        }

        if (useWordReveal) {
            // Script karaoke (same look as ASR) when Whisper unavailable / silent plate
            const wordLayers = buildWordCaptionLayers({
                workDir,
                beatIndex: i,
                captionText,
                role: beat.role || 'hook',
                t0: cutStart,
                durationSec: Math.max(0.8, cutEnd - cutStart),
                brandPurple: tokens.brand || '#5B5BD6',
                holdUntil: cutEnd,
                speechStartRel: beat.speechStartRel ?? null,
                speechEndRel: beat.speechEndRel ?? null,
            });
            layers.push(...wordLayers);
        } else if (useDialogueCaptions || titleStyle === 'dialogue_caption') {
            /**
             * Full-line hold for clean_sans / minimal styles.
             */
            const pngPath = path.join(workDir, `gfx-beat-${i}.png`);
            renderSvgToPng(
                svgBeatCaptionFull({
                    text: captionText,
                    role: beat.role || 'hook',
                    brandPurple: tokens.brand || '#5B5BD6',
                }),
                pngPath
            );
            layers.push({
                kind: 'dialogue_caption',
                path: pngPath,
                start: cutStart,
                end: cutEnd,
                index: i,
                text: captionText,
            });
        } else if (titleStyle === 'emotion_keyword') {
            const pngPath = path.join(workDir, `gfx-beat-${i}.png`);
            renderSvgToPng(
                svgEmotionKeyword({
                    text: keyword || captionText,
                    tokens,
                    role: beat.role || 'hook',
                }),
                pngPath
            );
            layers.push({
                kind: 'emotion_keyword',
                path: pngPath,
                start,
                end,
                index: i,
                text: keyword || captionText,
            });
        } else if (titleStyle === 'bold_hook' || beat.role === 'hook') {
            const pngPath = path.join(workDir, `gfx-beat-${i}.png`);
            renderSvgToPng(svgHookTitle({ title: captionText, tokens, styleId }), pngPath);
            layers.push({
                kind: 'hook',
                path: pngPath,
                start,
                end,
                index: i,
                text: captionText,
            });
        } else if (titleStyle === 'big_center') {
            const pngPath = path.join(workDir, `gfx-beat-${i}.png`);
            renderSvgToPng(
                svgSpokenCaption({
                    text: captionText,
                    tokens,
                    role: beat.role || 'hook',
                }),
                pngPath
            );
            layers.push({
                kind: 'spoken_caption',
                path: pngPath,
                start,
                end,
                index: i,
                text: captionText,
            });
        } else {
            const pngPath = path.join(workDir, `gfx-beat-${i}.png`);
            renderSvgToPng(svgLowerThird({ title: captionText, tokens }), pngPath);
            layers.push({
                kind: 'lower_third',
                path: pngPath,
                start,
                end,
                index: i,
                text: captionText,
            });
        }
        t += dur;
    }

    // CTA end card — only for ads_endcard / ads_full (organic keeps captions to the end)
    const total = cutStarts[cutStarts.length - 1] || t;
    let ctaStart = null;
    if (chrome.endCard && total > 2.5) {
        ctaStart = Math.max(0, total - 1.4);
        for (const layer of layers) {
            if (
                layer.kind === 'word_caption' ||
                layer.kind === 'dialogue_caption' ||
                layer.kind === 'spoken_caption' ||
                layer.kind === 'emotion_keyword' ||
                layer.kind === 'hook' ||
                layer.kind === 'lower_third'
            ) {
                if (layer.end > ctaStart && layer.start < ctaStart) {
                    layer.end = ctaStart;
                } else if (layer.start >= ctaStart) {
                    layer.end = layer.start; // drop
                }
            }
        }
        const svg = svgCtaEnd({
            cta: cta || brand.primaryCta || 'Learn more',
            tokens,
            brandName: brand.name,
            oneLiner: brand.oneLiner,
            website: brand.website,
        });
        const pngPath = path.join(workDir, 'gfx-cta.png');
        renderSvgToPng(svg, pngPath);
        layers.push({
            kind: 'cta_end',
            path: pngPath,
            start: ctaStart,
            end: total,
            index: 'cta',
        });
    }

    // Corner logo — ads_full only (organic volume should not watermark)
    if (chrome.cornerLogo) {
        const logoEnd = ctaStart != null ? ctaStart : total;
        if (logoEnd > 0.2) {
            const logoPng = path.join(workDir, 'gfx-corner-logo.png');
            renderSvgToPng(svgCornerLogo({ opacity: 0.92 }), logoPng);
            layers.push({
                kind: 'brand_logo',
                path: logoPng,
                start: 0,
                end: logoEnd,
                index: 'logo',
            });
        }
    }

    // Exclusive windows only — never force-extend word layers into each other
    enforceExclusiveCaptionWindows(layers, { total, ctaStart });

    const cleaned = layers.filter((l) => (l.end || 0) > (l.start || 0) + 0.03);

    // Validate no overlaps (debug)
    const capsOnly = cleaned
        .filter((l) => l.kind !== 'cta_end' && l.kind !== 'brand_logo')
        .sort((a, b) => a.start - b.start);
    for (let i = 0; i < capsOnly.length - 1; i++) {
        if (capsOnly[i].end > capsOnly[i + 1].start + 0.001) {
            console.warn(
                '[graphicsCompose] fixed overlap',
                capsOnly[i].index,
                capsOnly[i].end,
                '→',
                capsOnly[i + 1].start
            );
            capsOnly[i].end = capsOnly[i + 1].start;
        }
    }

    return {
        layers: cleaned,
        workDir,
        totalDuration: total,
        ctaStart,
        brandChrome: chrome.id,
        captionTexts: cleaned
            .filter((l) => l.kind === 'dialogue_caption' || l.kind === 'word_caption')
            .map((l) => ({
                index: l.index,
                text: l.text,
                word: l.word || null,
                start: l.start,
                end: l.end,
            })),
    };
}

/**
 * Overlay graphics onto base video.
 *
 * Word captions (many PNGs) are Baked into ONE alpha track first, then
 * overlaid once — a 30-layer enable chain was stacking text and dropping
 * frames after ~3s on ffmpeg.
 */
export async function composeOverlays({ inputVideo, outputVideo, layers, workDir }) {
    if (!layers?.length) {
        fs.copyFileSync(inputVideo, outputVideo);
        return { outputVideo, graphicsEngine: 'none' };
    }

    let videoDur = (await probeMediaDuration(inputVideo)) || 30;

    const wordLayers = layers
        .filter((l) => l.kind === 'word_caption')
        .map((l) => ({
            ...l,
            start: Math.max(0, Number(l.start) || 0),
            end: Math.min(videoDur, Math.max(0.05, Number(l.end) || 0)),
        }))
        .filter((l) => l.end > l.start + 0.02)
        .sort((a, b) => a.start - b.start);

    const otherLayers = layers
        .filter((l) => l.kind !== 'word_caption')
        .map((l) => ({
            ...l,
            start: Math.max(0, Number(l.start) || 0),
            end: Math.min(videoDur + 0.02, Math.max(0.05, Number(l.end) || videoDur)),
        }));

    // ── 1) Bake karaoke PNGs → single alpha caption track ──────────────
    let captionTrack = null;
    const bakeDir = workDir || path.join(path.dirname(outputVideo), 'gfx-bake');
    if (wordLayers.length) {
        try {
            captionTrack = await bakeCaptionTrack({
                layers: wordLayers,
                durationSec: videoDur,
                workDir: bakeDir,
            });
            console.log(
                `[graphicsCompose] baked ${wordLayers.length} word plates → 1 caption track`
            );
        } catch (e) {
            console.warn('[graphicsCompose] bake failed, falling back to 1 plate/beat:', e.message);
            // Fallback: one full-line plate per beat (no multi-word stack)
            captionTrack = null;
        }
    }

    // ── 2) Build final overlay list: at most captionTrack + CTA etc ────
    const finalLayers = [];
    if (captionTrack?.path) {
        finalLayers.push({
            kind: 'caption_track',
            path: captionTrack.path,
            start: 0,
            end: videoDur,
            isVideo: true,
        });
    } else if (wordLayers.length) {
        // Collapse to one PNG per contiguous beat-ish group (safety)
        // Use last word plate of each ~5s block as full-line hold
        const byBeat = new Map();
        for (const l of wordLayers) {
            const beatKey = String(l.index).split('-')[0];
            byBeat.set(beatKey, l); // last wins → full purple/white line
        }
        // Also need correct start: first word of that beat
        const firstByBeat = new Map();
        for (const l of wordLayers) {
            const beatKey = String(l.index).split('-')[0];
            if (!firstByBeat.has(beatKey)) firstByBeat.set(beatKey, l);
        }
        for (const [k, last] of byBeat) {
            const first = firstByBeat.get(k);
            finalLayers.push({
                kind: 'dialogue_caption',
                path: last.path,
                start: first.start,
                end: last.end,
                isVideo: false,
            });
        }
    }

    for (const l of otherLayers) {
        finalLayers.push({ ...l, isVideo: false });
    }

    if (!finalLayers.length) {
        fs.copyFileSync(inputVideo, outputVideo);
        return { outputVideo, graphicsEngine: 'none', videoDur };
    }

    // ── 3) Overlay (1–3 inputs max) ────────────────────────────────────
    const parts = [];
    let prev = '[0:v]';
    finalLayers.forEach((layer, i) => {
        const inp = `[${i + 1}:v]`;
        const out = i === finalLayers.length - 1 ? '[vout]' : `[v${i}]`;
        if (layer.isVideo || layer.kind === 'caption_track') {
            // format=rgb keeps brand mint/purple chroma; auto→yuv early was washing fills
            parts.push(`${prev}${inp}overlay=0:0:format=rgb:eof_action=pass${out}`);
        } else {
            const s = Math.max(0, Number(layer.start) || 0);
            const e = Math.max(s + 0.05, Number(layer.end) || s + 0.05);
            // half-open: gte start, lt end — no double-enable with next
            const en = `gte(t\\,${s.toFixed(3)})*lt(t\\,${e.toFixed(3)})`;
            parts.push(
                `${prev}${inp}overlay=0:0:format=rgb:eof_action=pass:enable='${en}'${out}`
            );
        }
        prev = out;
    });
    // Final yuv420p only after RGB overlay so brand hex survives compositing
    const filter = `${parts.join(';')};[vout]format=yuv420p[vfinal]`;

    const runOverlay = async (withAudio) => {
        const cmd = ['-y', '-i', inputVideo];
        for (const l of finalLayers) {
            if (l.isVideo || l.kind === 'caption_track') {
                cmd.push('-i', l.path);
            } else {
                cmd.push('-loop', '1', '-t', String(videoDur + 0.5), '-i', l.path);
            }
        }
        cmd.push(
            '-filter_complex',
            filter,
            '-map',
            '[vfinal]',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '16',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            '-t',
            String(videoDur)
        );
        if (withAudio) {
            cmd.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '160k', '-shortest');
        } else {
            cmd.push('-an');
        }
        cmd.push(outputVideo);
        await run('ffmpeg', cmd);
    };

    try {
        await runOverlay(true);
    } catch (e1) {
        console.warn('[graphicsCompose] overlay+audio failed, retry silent:', e1.message);
        await runOverlay(false);
    }

    return {
        outputVideo,
        graphicsEngine: captionTrack ? 'caption_track+overlay' : 'svg_overlay',
        layerCount: finalLayers.length,
        wordPlateCount: wordLayers.length,
        videoDur,
    };
}

/**
 * Full path: build graphics + compose onto stitched story reel.
 */
export async function composeStoryGraphics({
    workDir,
    inputVideo,
    outputVideo,
    beats,
    actualDurations,
    styleId,
    cta,
    brand,
    brandChrome = null,
    asrKaraokeWindows = null,
}) {
    const probed = await probeMediaDuration(inputVideo);
    const { layers, totalDuration, captionTexts, brandChrome: chromeId } = buildStoryGraphics({
        workDir,
        beats,
        actualDurations,
        styleId,
        cta,
        brand,
        totalDurationOverride: probed,
        brandChrome,
        asrKaraokeWindows,
    });

    if (!layers.length) {
        fs.copyFileSync(inputVideo, outputVideo);
        return {
            outputVideo,
            graphicsEngine: 'none',
            layerCount: 0,
            totalDuration,
            captionTexts: [],
            brandChrome: chromeId || normalizeBrandChrome(brandChrome),
        };
    }

    // Log caption coverage for debugging missing-subtitle reports
    console.log(
        `[graphicsCompose] chrome=${chromeId} captions:`,
        captionTexts?.map((c) => `[${c.start?.toFixed?.(2)}-${c.end?.toFixed?.(2)}] ${c.text}`).join(' | ')
    );

    const result = await composeOverlays({
        inputVideo,
        outputVideo,
        layers,
        workDir,
    });

    return {
        ...result,
        brandChrome: chromeId || normalizeBrandChrome(brandChrome),
        totalDuration: probed || totalDuration,
        layers: layers.map((l) => ({
            kind: l.kind,
            start: l.start,
            end: l.end,
            text: l.text || null,
            word: l.word || null,
        })),
        captionTexts,
    };
}
