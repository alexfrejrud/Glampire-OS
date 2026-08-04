/**
 * Clean story reel compose — Grok talking-head rules.
 *
 * CORRECT for Grok Imagine Video (native audio + lip-sync in one pass):
 * 1. KEEP Grok plate audio — do NOT mute, do NOT mix ElevenLabs on top
 * 2. Captions = words actually spoken (ASR) OR dialogue embedded in Grok prompt
 * 3. One full-line caption per speech segment (no multi-layer karaoke stack)
 * 4. Soft music bed UNDER native only (normalize=0)
 * 5. 48 kHz AAC out
 *
 * WRONG (what burned hours): strip Grok audio + ElevenLabs VO + script captions
 * that don't match lips or spoken words.
 *
 * Usage (node):
 *   import { composeCleanStory } from './cleanStoryCompose.js'
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { synthesizeLine, hasElevenLabs, pickVoice } from './elevenLabs.js';
import { getBrand } from './brand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1080;
const H = 1920;
const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const OUT_DIR = path.join(__dirname, 'data', 'renders');
const TMP_ROOT = path.join(__dirname, 'data', 'tmp');

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
            else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-1200)}`));
        });
    });
}

function probe(p) {
    return new Promise((resolve) => {
        const child = spawn('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            p,
        ]);
        let o = '';
        child.stdout.on('data', (d) => {
            o += d;
        });
        child.on('close', () => resolve(parseFloat(o) || 0));
    });
}

function escapeXml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars = 28) {
    const words = String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxChars && cur) {
            lines.push(cur);
            cur = w;
        } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
}

function captionSvg(text, { brandPurple = '#9563FF' } = {}) {
    const lines = wrapText(
        String(text || '')
            .replace(/[—–]/g, ' — ')
            .replace(/\s+/g, ' ')
            .trim(),
        26
    );
    const fontSize = lines.length >= 3 ? 44 : lines.length === 2 ? 50 : 56;
    const lineH = Math.round(fontSize * 1.22);
    // Lower third (~80% height) — clear of face, Reels-safe
    const startY = Math.round(H * 0.78);
    const fonts = ['Outfit-Bold.ttf', 'Outfit-SemiBold.ttf', 'Outfit-Regular.ttf']
        .map((n) => path.join(FONT_DIR, n))
        .filter((p) => fs.existsSync(p));

    // Simple: first line purple accent, rest white — full sentence always, NO multi-layer
    const textEls = lines
        .map((line, i) => {
            const y = startY + i * lineH;
            const fill = i === 0 ? brandPurple : '#FFFFFF';
            return `<text font-family="Outfit, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800"
      x="540" y="${y}" text-anchor="middle" fill="${fill}"
      stroke="#000000" stroke-width="16" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(line)}</text>`;
        })
        .join('\n  ');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${textEls}
</svg>`;
    return { svg, fonts };
}

function renderSvgToPng(svg, fonts, outPath) {
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: W },
        background: 'rgba(0,0,0,0)',
        font: {
            fontFiles: fonts,
            loadSystemFonts: true,
            defaultFontFamily: 'Outfit',
        },
    });
    fs.writeFileSync(outPath, resvg.render().asPng());
    return outPath;
}

function loadBrandLogoDataUri({ color = '#FFFFFF' } = {}) {
    const candidates = [
        path.join(__dirname, '../clients/taskiz/assets/taskiz-logo.svg'),
        path.join(__dirname, '../clients/taskiz/assets/Logo.svg'),
        path.join(__dirname, '../public/assets/taskiz-logo.svg'),
        path.join(__dirname, '../Brand/Brand Logo/Logo.svg'),
    ];
    const logoPath = candidates.find((p) => fs.existsSync(p));
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

function ctaSvg(brand) {
    const cta = brand.primaryCta || 'Join the Beta';
    const one = brand.oneLiner || 'Run your contracting business from your phone.';
    const name = brand.name || 'Taskiz';
    const brandPurple = brand?.colors?.brand || '#9563FF';
    const logoUri = loadBrandLogoDataUri({ color: '#FFFFFF' });
    const logoW = 454;
    const logoH = 118;
    const logoX = (W - logoW) / 2;
    const logoY = 720;
    const logoBlock = logoUri
        ? `<image href="${logoUri}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}"
             preserveAspectRatio="xMidYMid meet"/>`
        : `<text font-family="Outfit, Arial, Helvetica, sans-serif" font-size="72" font-weight="800"
        x="540" y="${logoY + 72}" text-anchor="middle" fill="#FFFFFF">${escapeXml(name.toUpperCase())}</text>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000" fill-opacity="0.72"/>
  ${logoBlock}
  <text font-family="Outfit, Arial, Helvetica, sans-serif" font-size="56" font-weight="700"
        x="540" y="980" text-anchor="middle" fill="#FFFFFF">${escapeXml(cta)}</text>
  <rect x="440" y="1000" width="200" height="6" rx="3" fill="${brandPurple}"/>
  <text font-family="Outfit, Arial, Helvetica, sans-serif" font-size="28" font-weight="500"
        x="540" y="1100" text-anchor="middle" fill="#FFFFFF">${escapeXml(one)}</text>
</svg>`;
}

/** Small centered top wordmark for talking-head reels. */
function cornerLogoSvg() {
    const logoUri = loadBrandLogoDataUri({ color: '#FFFFFF' });
    const logoW = 196;
    const logoH = 51;
    const logoX = Math.round((W - logoW) / 2);
    const logoY = 72;
    if (!logoUri) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <text font-family="Outfit, Arial, Helvetica, sans-serif" font-size="28" font-weight="700"
        x="540" y="110" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.92" letter-spacing="1.5">TASKIZ</text>
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
         preserveAspectRatio="xMidYMid meet" opacity="0.92" filter="url(#logoSoft)"/>
</svg>`;
}

/**
 * @param {object} opts
 * @param {string[]} opts.beatVideos - local paths to beat mp4s (audio will be stripped)
 * @param {string[]} opts.dialogues - one line per beat (VO + caption)
 * @param {string} [opts.id]
 * @param {string} [opts.cta]
 * @param {number} [opts.bedVolume]
 * @param {number} [opts.voVolume]
 */
export async function composeCleanStory({
    beatVideos,
    dialogues,
    id = `clean-${Date.now().toString(36)}`,
    cta,
    bedVolume = 0.18,
    voVolume = 1.5,
} = {}) {
    if (!beatVideos?.length) throw new Error('beatVideos required');
    if (!dialogues?.length || dialogues.length !== beatVideos.length) {
        throw new Error('dialogues must match beatVideos length');
    }
    if (!hasElevenLabs()) throw new Error('ELEVENLABS_API_KEY required for clean VO');

    const brand = getBrand();
    const work = path.join(TMP_ROOT, id);
    fs.mkdirSync(work, { recursive: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const report = { id, steps: [], warnings: [] };

    // ── 1) Normalize video ONLY (strip audio completely) ─────────────
    const norms = [];
    const durs = [];
    for (let i = 0; i < beatVideos.length; i++) {
        const src = beatVideos[i];
        if (!fs.existsSync(src)) throw new Error(`Missing beat: ${src}`);
        const out = path.join(work, `norm-silent-${i}.mp4`);
        await run('ffmpeg', [
            '-y',
            '-i',
            src,
            '-vf',
            'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p',
            '-an', // CRITICAL: mute plate forever
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            out,
        ]);
        norms.push(out);
        durs.push(await probe(out));
    }
    report.steps.push({ normalize: durs });

    // ── 2) Stitch silent plate ───────────────────────────────────────
    const listFile = path.join(work, 'concat.txt');
    fs.writeFileSync(
        listFile,
        norms.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join('\n')
    );
    const stitched = path.join(work, 'stitched-silent.mp4');
    await run('ffmpeg', [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-an',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        stitched,
    ]);
    const total = await probe(stitched);
    report.steps.push({ stitched: total, silent: true });

    // ── 3) ONE voice — ElevenLabs only ───────────────────────────────
    const voice = await pickVoice({ profile: 'peer_male' });
    const linePaths = [];
    for (let i = 0; i < dialogues.length; i++) {
        const mp3 = path.join(work, `vo-line-${i}.mp3`);
        await synthesizeLine(dialogues[i], { outPath: mp3, voiceId: voice.voiceId });
        linePaths.push(mp3);
        report.steps.push({ voLine: i, text: dialogues[i], dur: await probe(mp3) });
    }

    // Place each line at beat start (natural speed — do NOT stretch)
    let t = 0;
    const cutStarts = [0];
    for (const d of durs) {
        t += d;
        cutStarts.push(t);
    }
    const voWav = path.join(work, 'vo-only.wav');
    const delayArgs = [];
    const inputs = ['-y', '-f', 'lavfi', '-t', String(total.toFixed(3)), '-i', 'anullsrc=r=48000:cl=stereo'];
    const filters = ['[0:a]volume=0[base]'];
    const labels = ['[base]'];
    for (let i = 0; i < linePaths.length; i++) {
        inputs.push('-i', linePaths[i]);
        const ms = Math.round(cutStarts[i] * 1000 + 80); // tiny pad-in
        filters.push(
            `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${voVolume},adelay=${ms}|${ms}[v${i}]`
        );
        labels.push(`[v${i}]`);
    }
    filters.push(
        `${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[vo]`
    );
    await run('ffmpeg', [
        ...inputs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[vo]',
        '-t',
        String(total.toFixed(3)),
        voWav,
    ]);
    report.steps.push({ voice: voice.name || voice.voiceId, singleVoice: true });

    // ── 4) Captions: ONE png per beat, exclusive windows ─────────────
    const brandPurple = brand?.colors?.brand || '#9563FF';
    const fonts = ['Outfit-Bold.ttf', 'Outfit-SemiBold.ttf', 'Outfit-Regular.ttf']
        .map((n) => path.join(FONT_DIR, n))
        .filter((p) => fs.existsSync(p));
    const capDir = path.join(work, 'caps');
    fs.mkdirSync(capDir, { recursive: true });

    const ctaStart = Math.max(0, total - 1.4);
    const capLayers = [];
    for (let i = 0; i < dialogues.length; i++) {
        let text = dialogues[i]
            .replace(/\s*[—–-]\s*join the beta\.?$/i, '')
            .replace(/\s*join the beta\.?$/i, '')
            .trim();
        const { svg } = captionSvg(text, { brandPurple });
        const png = path.join(capDir, `cap-${i}.png`);
        renderSvgToPng(svg, fonts, png);
        const start = cutStarts[i];
        let end = cutStarts[i + 1];
        if (i === dialogues.length - 1) end = Math.min(end, ctaStart);
        capLayers.push({ png, start, end, text });
    }
    // CTA with official Taskiz logo (not fake caps text)
    const ctaPng = path.join(capDir, 'cta.png');
    renderSvgToPng(ctaSvg({ ...brand, primaryCta: cta || brand.primaryCta }), fonts, ctaPng);

    // Corner brand mark for talking-head window
    const logoPng = path.join(capDir, 'corner-logo.png');
    renderSvgToPng(cornerLogoSvg(), fonts, logoPng);

    // Overlay: silent video + exclusive caption enables + logo + CTA
    const withCaps = path.join(work, 'with-caps.mp4');
    const overlayInputs = ['-y', '-i', stitched];
    for (const layer of capLayers) {
        overlayInputs.push('-loop', '1', '-t', String(total + 0.5), '-i', layer.png);
    }
    overlayInputs.push('-loop', '1', '-t', String(total + 0.5), '-i', logoPng);
    overlayInputs.push('-loop', '1', '-t', String(total + 0.5), '-i', ctaPng);

    const parts = [];
    let prev = '[0:v]';
    capLayers.forEach((layer, i) => {
        const inp = `[${i + 1}:v]`;
        const out = `[v${i}]`;
        const s = layer.start.toFixed(3);
        const e = layer.end.toFixed(3);
        // exclusive end: lt not lte
        parts.push(`${prev}${inp}overlay=0:0:format=auto:enable='gte(t\\,${s})*lt(t\\,${e})'${out}`);
        prev = out;
    });
    const logoIdx = capLayers.length + 1;
    const ctaIdx = capLayers.length + 2;
    parts.push(
        `${prev}[${logoIdx}:v]overlay=0:0:format=auto:enable='gte(t\\,0)*lt(t\\,${ctaStart.toFixed(3)})'[vlogo]`
    );
    parts.push(
        `[vlogo][${ctaIdx}:v]overlay=0:0:format=auto:enable='gte(t\\,${ctaStart.toFixed(3)})'[vout]`
    );

    await run('ffmpeg', [
        ...overlayInputs,
        '-filter_complex',
        parts.join(';'),
        '-map',
        '[vout]',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-t',
        String(total.toFixed(3)),
        '-movflags',
        '+faststart',
        withCaps,
    ]);
    report.steps.push({ captions: capLayers.map((l) => ({ text: l.text, start: l.start, end: l.end })) });

    // ── 5) Mix: VO only + soft bed (never plate audio) ───────────────
    const bedSrc = path.join(__dirname, 'data', 'audio', 'taskiz-ambient-bed.m4a');
    let bedPath = bedSrc;
    if (!fs.existsSync(bedPath)) {
        bedPath = path.join(work, 'bed.wav');
        await run('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `anoisesrc=color=pink:amplitude=0.02:duration=${total.toFixed(3)}`,
            '-af',
            'lowpass=f=400,volume=0.4,aformat=sample_rates=48000:channel_layouts=stereo',
            bedPath,
        ]);
    }

    const finalPath = path.join(OUT_DIR, `${id}-final.mp4`);
    const fadeOut = Math.max(0, total - 0.7).toFixed(2);
    await run('ffmpeg', [
        '-y',
        '-i',
        withCaps,
        '-i',
        voWav,
        '-stream_loop',
        '-1',
        '-i',
        bedPath,
        '-filter_complex',
        [
            `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${voVolume}[vo]`,
            `;[2:a]volume=${bedVolume},atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,`,
            `afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOut}:d=0.6,`,
            `aformat=sample_rates=48000:channel_layouts=stereo[bed]`,
            `;[vo][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,`,
            `alimiter=limit=0.94,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
        ].join(''),
        '-map',
        '0:v:0',
        '-map',
        '[a]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-t',
        String(total.toFixed(3)),
        '-movflags',
        '+faststart',
        finalPath,
    ]);

    // ── 6) Verify ────────────────────────────────────────────────────
    const hasPlateAudio = await new Promise((resolve) => {
        const child = spawn('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'a',
            '-show_entries',
            'stream=index',
            '-of',
            'csv=p=0',
            stitched,
        ]);
        let o = '';
        child.stdout.on('data', (d) => {
            o += d;
        });
        child.on('close', () => resolve(o.trim().length > 0));
    });

    report.finalVideoUrl = `/api/renders/${path.basename(finalPath)}`;
    report.finalVideoPath = finalPath;
    report.duration = await probe(finalPath);
    report.plateAudioMuted = !hasPlateAudio;
    report.voiceCount = 1;
    report.ok = true;

    fs.writeFileSync(path.join(work, 'clean-report.json'), JSON.stringify(report, null, 2));
    return report;
}

// CLI
const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const beatDir = process.argv[2];
    if (!beatDir) {
        console.error('Usage: node server/cleanStoryCompose.js <beatDir> [id]');
        process.exit(1);
    }
    const id = process.argv[3] || `clean-${Date.now().toString(36)}`;
    const beatVideos = [0, 1, 2].map((i) => path.join(beatDir, `beat-${i}.mp4`));
    const dialogues = [
        'I used to wait until midnight to send invoices. Every night.',
        "Job's done at four… then I'm still at the kitchen table doing the books.",
        'Now I invoice before I leave the driveway. Taskiz — join the beta.',
    ];
    composeCleanStory({ beatVideos, dialogues, id })
        .then((r) => {
            console.log(JSON.stringify(r, null, 2));
            console.log('PLAY http://127.0.0.1:8787' + r.finalVideoUrl);
        })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
