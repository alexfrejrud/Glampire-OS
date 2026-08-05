/**
 * Multi-beat story assembly:
 *  1. Download beat videos
 *  2. Concat with ffmpeg
 *  3. Optional title/CTA graphics via HyperFrames project + ffmpeg title burn fallback
 *
 * Title burn is best-effort: if drawtext fails (common with apostrophes / fonts),
 * we still return the clean stitched reel so Build story does not die.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getBrand } from './brand.js';
import { getVideoStyle } from './videoStyles.js';
import { writeHyperframesProject, tryRenderHyperframes } from './hyperframesCompose.js';
import { composeStoryGraphics, normalizeBrandChrome } from './graphicsCompose.js';
import {
    asrStoryPlate,
    scheduleKaraokeFromAsr,
    hasLocalWhisper,
} from './asrCaptions.js';
import { mixAudioBed, mixVoiceAndBed } from './audioBed.js';
import { attachStoryVoice } from './storyScript.js';
import { buildStoryVoiceover, hasElevenLabs } from './elevenLabs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'data', 'renders');
const TMP_DIR = path.join(__dirname, 'data', 'tmp');

function ensureDirs() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { ...opts });
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
            else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-1200)}`));
        });
    });
}

async function downloadToFile(url, dest) {
    // Allow local absolute paths / file:// so we can re-assemble without re-fetching
    if (url && !/^https?:\/\//i.test(url)) {
        const local = String(url).replace(/^file:\/\//, '');
        if (!fs.existsSync(local)) throw new Error(`Local beat file missing: ${local}`);
        fs.copyFileSync(local, dest);
        return dest;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return dest;
}

/** Probe duration in seconds (float). */
async function probeDuration(filePath) {
    try {
        const { stdout } = await run('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            filePath,
        ]);
        const n = parseFloat(String(stdout).trim());
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

/** Probe first video stream width/height */
async function probeVideoSize(filePath) {
    try {
        const { stdout } = await run('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-of',
            'csv=p=0',
            filePath,
        ]);
        const [w, h] = String(stdout)
            .trim()
            .split(',')
            .map((x) => parseInt(x, 10));
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
    } catch {
        /* ignore */
    }
    return null;
}

async function clipHasAudio(filePath) {
    try {
        const { stdout } = await run('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'a',
            '-show_entries',
            'stream=codec_type',
            '-of',
            'csv=p=0',
            filePath,
        ]);
        return /audio/i.test(String(stdout));
    } catch {
        return false;
    }
}

/**
 * Build 9:16 normalize filter.
 * Portrait sources: fill + light crop. Landscape/wide sources: fit + pad (no face-slicing crop).
 */
function portraitNormalizeVf(size) {
    const targetW = 1080;
    const targetH = 1920;
    const isWide = size && size.w > 0 && size.h > 0 && size.w / size.h > 0.72; // wider than ~3:4
    if (isWide) {
        // Letterbox into 9:16 — preserves full frame instead of cropping heads off
        return `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black,fps=30,setsar=1,format=yuv420p`;
    }
    return `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},fps=30,setsar=1,format=yuv420p`;
}

/**
 * Sanitize title for burn: strip characters that break drawtext / ASS.
 * Prefer readable plain ASCII-ish text for overlays.
 */
function sanitizeTitle(text) {
    return String(text || '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[''‛′`]/g, '') // apostrophes break drawtext quoting
        .replace(/[""«»]/g, '')
        .replace(/[:\\%]/g, ' ')
        .replace(/[^\x20-\x7E]/g, (ch) => {
            // keep common punctuation; drop other non-ascii if problematic
            return ch;
        })
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 72);
}

function findFont() {
    const candidates = [
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

/** Homebrew FFmpeg often ships without libfreetype → no drawtext filter. */
let _drawtextAvailable = null;
async function hasDrawtextFilter() {
    if (_drawtextAvailable != null) return _drawtextAvailable;
    try {
        const { stderr, stdout } = await run('ffmpeg', ['-hide_banner', '-filters']);
        const text = `${stdout}\n${stderr}`;
        _drawtextAvailable = /\bdrawtext\b/.test(text);
    } catch {
        _drawtextAvailable = false;
    }
    return _drawtextAvailable;
}

/**
 * Stitch beat video URLs into one vertical MP4, burn titles, write HyperFrames project.
 * Mixes ambient audio bed by default (AI I2V is typically silent).
 *
 * CAPTIONS (studio default):
 *  - If plate has speech audio → Whisper ASR karaoke (exact spoken words)
 *  - Script dialogue is NEVER used for on-screen captions when ASR succeeds
 *  - brandChrome default = organic (no logo / no end card)
 */
export async function assembleStoryReel(
    item,
    { burnTitles = true, mixAudio = true, mixVoice, brandChrome, useAsrCaptions } = {}
) {
    ensureDirs();
    // Ensure keywords + dialogue fields
    const storyBeats = attachStoryVoice(
        (item.beats || []).filter((b) => b.videoUrl),
        item
    );
    const beats = storyBeats;
    if (!beats.length) {
        throw Object.assign(new Error('No beat videos to assemble — animate beats first'), {
            status: 400,
        });
    }

    // Diegetic talk = contractor speaks on camera → NEVER external VO
    const deliveryMode = item.deliveryMode || 'caption_talk';
    const diegetic = deliveryMode === 'diegetic_talk';
    const wantExternalVo =
        mixVoice === true ||
        (mixVoice !== false && !diegetic && item.mixExternalVo === true);

    const id = String(item.id || `story-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const work = path.join(TMP_DIR, id);
    fs.mkdirSync(work, { recursive: true });

    // 1. Download beat clips
    const localClips = [];
    for (let i = 0; i < beats.length; i++) {
        const dest = path.join(work, `beat-${i}.mp4`);
        await downloadToFile(beats[i].videoUrl, dest);
        localClips.push(dest);
    }

    // 2. Normalize to 9:16 — KEEP native speech; pad landscape instead of face-crop;
    //    strip long trailing silence so talk beats don't hang after the last word.
    const normalized = [];
    const actualDurations = [];
    let anySourceAudio = false;
    for (let i = 0; i < localClips.length; i++) {
        const out = path.join(work, `norm-${i}.mp4`);
        const hasA = await clipHasAudio(localClips[i]);
        if (hasA) anySourceAudio = true;
        const size = await probeVideoSize(localClips[i]);
        const vf = portraitNormalizeVf(size);
        const args = [
            '-y',
            '-i',
            localClips[i],
            '-vf',
            vf,
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
        ];
        if (hasA) {
            // Trim trailing silence after speech; keep a tiny natural tail (~0.2s stop_duration)
            args.push(
                '-af',
                'silenceremove=stop_periods=1:stop_duration=0.18:stop_threshold=-38dB:detection=peak',
                '-c:a',
                'aac',
                '-b:a',
                '160k',
                '-ar',
                '48000',
                '-ac',
                '2',
                '-shortest'
            );
        } else {
            // silent plate: drop audio for now; bed/VO mix adds audio later
            args.push('-an');
        }
        args.push(out);
        try {
            await run('ffmpeg', args);
        } catch (e) {
            // Fallback without silence trim if filter fails on odd audio
            console.warn('[storyAssembler] norm with silence-trim failed, retry plain:', e.message);
            const fallback = [
                '-y',
                '-i',
                localClips[i],
                '-vf',
                vf,
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
            ];
            if (hasA) {
                fallback.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2');
            } else {
                fallback.push('-an');
            }
            fallback.push(out);
            await run('ffmpeg', fallback);
        }
        const dur = (await probeDuration(out)) || Number(beats[i].durationSec) || 5;
        actualDurations.push(dur);
        normalized.push(out);
    }

    // 3. Concat — re-encode; keep audio if any beat had it
    const listFile = path.join(work, 'concat.txt');
    fs.writeFileSync(
        listFile,
        normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    );

    const stitched = path.join(work, 'stitched.mp4');
    const concatArgs = [
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
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
    ];
    if (anySourceAudio) {
        concatArgs.push('-c:a', 'aac', '-b:a', '160k');
    } else {
        concatArgs.push('-an');
    }
    concatArgs.push(stitched);
    await run('ffmpeg', concatArgs);

    // 4. HyperFrames project (titles / end card) — always write for inspect
    const brand = getBrand();
    const style = getVideoStyle(item.styleId);
    const hf = writeHyperframesProject({
        item,
        beats: beats.map((b, i) => ({
            ...b,
            durationSec: actualDurations[i] || b.durationSec,
        })),
        brand,
        style,
        stitchedVideoPath: stitched,
    });

    let composed = stitched;
    let graphicsEngine = 'none';
    let titleWarning = null;
    let graphicsMeta = null;

    // Brand chrome: organic (default) vs ads end card. Captions always when burnTitles.
    const chrome = normalizeBrandChrome(
        brandChrome ?? item.brandChrome ?? brand?.defaultBrandChrome ?? 'organic'
    );

    // DEFAULT for ALL studio story builds: Whisper ASR captions when plate has audio.
    // Script dialogue ≠ lips on Grok/Kling native speech — never burn script over spoken audio.
    // Opt-out only: useAsrCaptions === false (or item.useAsrCaptions === false).
    let asrMeta = null;
    let asrKaraokeWindows = null;
    const asrOptOut =
        useAsrCaptions === false ||
        item.useAsrCaptions === false ||
        item.captionsFromScript === true;
    const plateHasAudio = await clipHasAudio(stitched);
    const wantAsrCaptions = burnTitles && plateHasAudio && !asrOptOut;

    if (wantAsrCaptions) {
        try {
            if (await hasLocalWhisper()) {
                console.log('[storyAssembler] Whisper ASR captions (spoken words)…');
                const asr = await asrStoryPlate(stitched, path.join(work, 'asr'));
                const totalDur = actualDurations.reduce((a, b) => a + b, 0);
                asrKaraokeWindows = scheduleKaraokeFromAsr(asr.words, {
                    totalDuration: totalDur,
                    // Active Brand OS name — ASR mishear fixes for any workspace
                    brandName: brand?.name || '',
                });
                asrMeta = {
                    ok: true,
                    wordCount: asr.words?.length || 0,
                    windowCount: asrKaraokeWindows.length,
                    text: asr.text,
                    reportPath: asr.reportPath,
                    source: 'whisper_plate_audio',
                };
                console.log(
                    `[storyAssembler] ASR: ${asrMeta.wordCount} words → ${asrMeta.windowCount} karaoke plates`
                );
                console.log('[storyAssembler] ASR text:', (asr.text || '').slice(0, 200));
            } else {
                asrMeta = { ok: false, reason: 'whisper_not_installed' };
                console.warn(
                    '[storyAssembler] Whisper not available — falling back to script captions (may mismatch lips)'
                );
            }
        } catch (e) {
            asrMeta = { ok: false, reason: e.message };
            console.warn('[storyAssembler] ASR failed, script captions fallback:', e.message);
        }
    } else if (burnTitles && !plateHasAudio) {
        asrMeta = {
            ok: false,
            reason: 'no_plate_audio',
            note: 'Silent plate — using script karaoke (or add native speech / VO then re-assemble)',
        };
        console.warn(
            '[storyAssembler] No speech on plate — script captions (mismatch risk). Prefer Grok/Kling with dialogue in prompt.'
        );
    }

    // BEST PATH: brand SVG → PNG (resvg) → timed ffmpeg overlay (works without drawtext)
    if (burnTitles) {
        try {
            const outPath = path.join(OUT_DIR, `${id}-composed.mp4`);
            const gfx = await composeStoryGraphics({
                workDir: path.join(work, 'gfx'),
                inputVideo: stitched,
                outputVideo: outPath,
                beats,
                actualDurations,
                styleId: item.styleId,
                cta: item.cta || brand.primaryCta,
                brand,
                brandChrome: chrome,
                asrKaraokeWindows,
            });
            composed = gfx.outputVideo;
            graphicsEngine = gfx.graphicsEngine || 'svg_overlay';
            graphicsMeta = {
                layers: gfx.layers,
                layerCount: gfx.layerCount,
                brandChrome: gfx.brandChrome || chrome,
                asr: asrMeta,
            };
        } catch (e) {
            console.warn('[storyAssembler] svg overlay failed:', e.message);
            titleWarning = e.message;

            // Fallback: HyperFrames CLI
            const hfRender = await tryRenderHyperframes(hf.projectDir);
            if (hfRender?.ok && hfRender.outputPath && fs.existsSync(hfRender.outputPath)) {
                composed = hfRender.outputPath;
                graphicsEngine = 'hyperframes';
                titleWarning = null;
            } else if (await hasDrawtextFilter()) {
                try {
                    composed = await burnTitleTrack({
                        workDir: work,
                        input: stitched,
                        output: path.join(OUT_DIR, `${id}-composed.mp4`),
                        beats,
                        actualDurations,
                        brand,
                        style,
                        cta: item.cta || brand.primaryCta,
                    });
                    graphicsEngine = 'ffmpeg_titles';
                    titleWarning = null;
                } catch (e2) {
                    titleWarning = e2.message;
                    composed = stitched;
                    graphicsEngine = 'stitch_only';
                }
            } else {
                composed = stitched;
                graphicsEngine = 'stitch_only';
            }
        }
    }

    // 5. Audio: prefer native contractor speech; light bed under it.
    //    External ElevenLabs VO only when explicitly requested (not diegetic talk).
    let audioMeta = null;
    let voiceMeta = null;
    let withAudio = composed;
    if (mixAudio !== false) {
        try {
            const audioOut = path.join(OUT_DIR, `${id}-with-audio.mp4`);
            const composedHasAudio = await clipHasAudio(composed);
            let voPath = null;

            if (wantExternalVo && hasElevenLabs()) {
                try {
                    const totalDur = actualDurations.reduce((a, b) => a + b, 0);
                    voiceMeta = await buildStoryVoiceover({
                        beats,
                        actualDurations,
                        workDir: path.join(work, 'vo'),
                        voiceId: item.voiceId || process.env.ELEVENLABS_VOICE_ID || null,
                        voiceProfile: item.voiceProfile || null,
                        item,
                        totalDuration: totalDur,
                    });
                    if (voiceMeta?.ok && voiceMeta.voPath) voPath = voiceMeta.voPath;
                } catch (e) {
                    console.warn('[storyAssembler] VO failed:', e.message);
                    voiceMeta = { ok: false, reason: e.message };
                }
            } else if (diegetic) {
                voiceMeta = {
                    ok: false,
                    reason: 'diegetic_talk',
                    note: 'Contractor speaks on camera — external VO skipped',
                };
            }

            if (voPath) {
                audioMeta = await mixVoiceAndBed(composed, audioOut, {
                    voPath,
                    bedVolume: Number(item.audioBedVolume) || 0.12,
                    voVolume: Number(item.voiceVolume) || 1.0,
                    bedPath: item.audioBedPath || null,
                });
                graphicsEngine =
                    graphicsEngine && graphicsEngine !== 'none'
                        ? `${graphicsEngine}+vo+bed`
                        : 'vo+bed';
            } else if (composedHasAudio || anySourceAudio) {
                // Native speech present: soft bed duck under it
                audioMeta = await mixAudioBed(composed, audioOut, {
                    volume: Number(item.audioBedVolume) || 0.12,
                    bedPath: item.audioBedPath || null,
                    preferSourceAudio: true,
                });
                graphicsEngine =
                    graphicsEngine && graphicsEngine !== 'none'
                        ? `${graphicsEngine}+native+bed`
                        : 'native+bed';
                audioMeta.hasVoice = true;
                audioMeta.source = 'diegetic_model';
            } else {
                // Silent plates only: bed so export isn't mute (regenerate with Kling audio next)
                audioMeta = await mixAudioBed(composed, audioOut, {
                    volume: Number(item.audioBedVolume) || 0.22,
                    bedPath: item.audioBedPath || null,
                });
                graphicsEngine =
                    graphicsEngine && graphicsEngine !== 'none'
                        ? `${graphicsEngine}+audio_bed`
                        : 'audio_bed';
            }
            withAudio = audioMeta.outputVideo;
        } catch (e) {
            console.warn('[storyAssembler] audio failed:', e.message);
            titleWarning = titleWarning
                ? `${titleWarning}; audio: ${e.message}`
                : `audio: ${e.message}`;
            withAudio = composed;
        }
    }

    const publicFinal = path.join(OUT_DIR, `${id}-final.mp4`);
    if (path.resolve(withAudio) !== path.resolve(publicFinal)) {
        fs.copyFileSync(withAudio, publicFinal);
    }

    return {
        finalVideoPath: publicFinal,
        finalVideoUrl: `/api/renders/${path.basename(publicFinal)}`,
        stitchedPath: stitched,
        hyperframes: hf,
        graphicsEngine,
        graphicsMeta,
        brandChrome: chrome,
        asrMeta,
        audioMeta,
        voiceMeta,
        hasAudio: Boolean(audioMeta?.hasAudio),
        hasVoice: Boolean(audioMeta?.hasVoice || voiceMeta?.ok),
        storyLines: beats.map((b) => ({
            role: b.role,
            dialogue: b.dialogue || b.voiceLine,
            keyword: b.keyword || b.title,
            title: b.title,
        })),
        spokenCaptions: asrMeta?.ok
            ? { text: asrMeta.text, wordCount: asrMeta.wordCount }
            : null,
        deliveryMode,
        beatCount: beats.length,
        titleWarning,
    };
}

/**
 * Burn titles using textfile= (avoids quote/apostrophe filter breakage).
 */
async function burnTitleTrack({
    workDir,
    input,
    output,
    beats,
    actualDurations,
    brand,
    style,
    cta,
}) {
    const font = findFont();
    const color = (brand.colors?.brand || '#5B5BD6').replace('#', '');
    let t = 0;
    const filters = [];

    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const start = t;
        const dur = actualDurations[i] || Number(beat.durationSec) || 5;
        const end = start + dur;
        const title = sanitizeTitle(beat.title || '');
        if (title) {
            const textFile = path.join(workDir, `title-${i}.txt`);
            fs.writeFileSync(textFile, title, 'utf8');
            const y =
                style.graphics?.titleStyle === 'bold_hook' ||
                    style.graphics?.titleStyle === 'soft_center'
                    ? 'h*0.18'
                    : 'h*0.78';
            const fontsize = style.graphics?.titleStyle === 'bold_hook' ? 48 : 36;
            const fontArg = font ? `:fontfile=${escapeFilterPath(font)}` : '';
            const enableStart = Math.max(0, start + 0.25);
            const enableEnd = Math.max(enableStart + 0.5, end - 0.35);
            // textfile avoids embedded quotes; path must be escaped for filter graph
            filters.push(
                `drawtext=textfile=${escapeFilterPath(textFile)}${fontArg}:fontsize=${fontsize}:fontcolor=white:borderw=3:bordercolor=black@0.7:x=(w-text_w)/2:y=${y}:enable='between(t\\,${enableStart.toFixed(2)}\\,${enableEnd.toFixed(2)})'`
            );
        }
        t = end;
    }

    const total = t;
    const ctaText = sanitizeTitle(cta);
    if (ctaText && total > 2) {
        const textFile = path.join(workDir, 'title-cta.txt');
        fs.writeFileSync(textFile, ctaText, 'utf8');
        const fontArg = font ? `:fontfile=${escapeFilterPath(font)}` : '';
        const enableStart = Math.max(0, total - 2.5);
        filters.push(
            `drawtext=textfile=${escapeFilterPath(textFile)}${fontArg}:fontsize=44:fontcolor=0x${color}:borderw=2:bordercolor=white:x=(w-text_w)/2:y=h*0.55:enable='gte(t\\,${enableStart.toFixed(2)})'`
        );
    }

    if (!filters.length) {
        fs.copyFileSync(input, output);
        return output;
    }

    const vf = filters.join(',');
    await run('ffmpeg', [
        '-y',
        '-i',
        input,
        '-vf',
        vf,
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
        '-an',
        output,
    ]);
    return output;
}

/** Escape a filesystem path for use inside an ffmpeg filtergraph value. */
function escapeFilterPath(p) {
    // ffmpeg filter: escape \ : ' and spaces via backslash
    return String(p)
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/ /g, '\\ ');
}

export function listRenders() {
    ensureDirs();
    return fs
        .readdirSync(OUT_DIR)
        .filter((f) => f.endsWith('.mp4'))
        .map((f) => ({
            file: f,
            url: `/api/renders/${f}`,
            mtime: fs.statSync(path.join(OUT_DIR, f)).mtime.toISOString(),
        }));
}

/**
 * Resolve a render path under server/data/renders.
 * Returns null if missing. Throws with code ICLOUD_OFFLINE when the file is
 * listed but unreadable (common when macOS "Optimize Mac Storage" evicts
 * large MP4s from Documents/iCloud Drive).
 */
export function resolveRenderPath(fileName) {
    ensureDirs();
    const safe = path.basename(fileName);
    const full = path.join(OUT_DIR, safe);
    if (!fs.existsSync(full)) return null;
    try {
        const st = fs.statSync(full);
        if (st.size > 0) {
            const fd = fs.openSync(full, 'r');
            try {
                const buf = Buffer.alloc(16);
                const n = fs.readSync(fd, buf, 0, 16, 0);
                if (n === 0) {
                    const err = new Error(
                        'Video is not on this Mac yet (iCloud offline). Finder → right-click the file → Download Now, or disable Optimize Mac Storage for Documents. Then try Download again.'
                    );
                    err.code = 'ICLOUD_OFFLINE';
                    err.status = 503;
                    throw err;
                }
            } finally {
                fs.closeSync(fd);
            }
        }
    } catch (e) {
        if (e.code === 'ICLOUD_OFFLINE') throw e;
        // Permission / other — still try sendFile
    }
    return full;
}
