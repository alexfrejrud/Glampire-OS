/**
 * Story reel audio bed — Grok/fal I2V is usually silent; social reels need a bed.
 *
 * Pipeline:
 *  1. Ensure a default ambient bed (generated once via ffmpeg lavfi)
 *  2. Loop / trim to video length, fade in/out, mix under picture
 *  3. Optional: preserve source audio if present and amix with bed
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, 'data', 'audio');
const DEFAULT_BED = path.join(AUDIO_DIR, 'taskiz-ambient-bed.m4a');
const BED_DURATION_SEC = 45;

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args);
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

async function probeDuration(filePath) {
    return new Promise((resolve) => {
        const child = spawn('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            filePath,
        ]);
        let stdout = '';
        child.stdout?.on('data', (d) => {
            stdout += d.toString();
        });
        child.on('close', () => {
            const n = parseFloat(String(stdout).trim());
            resolve(Number.isFinite(n) && n > 0 ? n : null);
        });
        child.on('error', () => resolve(null));
    });
}

async function hasAudioStream(filePath) {
    return new Promise((resolve) => {
        const child = spawn('ffprobe', [
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
        let stdout = '';
        child.stdout?.on('data', (d) => {
            stdout += d.toString();
        });
        child.on('close', () => resolve(/audio/i.test(stdout)));
        child.on('error', () => resolve(false));
    });
}

/**
 * Soft ambient pad (A minor-ish): low sine stack + pink noise.
 * Not a licensed track — fine for drafts; swap file for production music.
 */
export async function ensureDefaultBed() {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    if (fs.existsSync(DEFAULT_BED) && fs.statSync(DEFAULT_BED).size > 8000) {
        return DEFAULT_BED;
    }

    const d = BED_DURATION_SEC;
    // A2 / C3 / E3 / A3 soft pad + pink dust
    await run('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=110:duration=${d}`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=130.81:duration=${d}`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=164.81:duration=${d}`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=220:duration=${d}`,
        '-f',
        'lavfi',
        '-i',
        `anoisesrc=color=pink:amplitude=0.015:duration=${d}`,
        '-filter_complex',
        [
            `[0:a]volume=0.11,afade=t=in:st=0:d=2,afade=t=out:st=${d - 3}:d=3[a0]`,
            `[1:a]volume=0.07,afade=t=in:st=0:d=2.2,afade=t=out:st=${d - 3}:d=3[a1]`,
            `[2:a]volume=0.06,afade=t=in:st=0:d=2.5,afade=t=out:st=${d - 3}:d=3[a2]`,
            `[3:a]volume=0.045,afade=t=in:st=0:d=3,afade=t=out:st=${d - 3}:d=3[a3]`,
            `[4:a]lowpass=f=450,volume=0.4,afade=t=in:st=0:d=1.5,afade=t=out:st=${d - 3}:d=3[n]`,
            `[a0][a1][a2][a3][n]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=0.4,aresample=48000[out]`,
        ].join(';'),
        '-map',
        '[out]',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        DEFAULT_BED,
    ]);

    return DEFAULT_BED;
}

/**
 * Mix music bed under a silent (or existing-audio) video.
 * @returns {{ outputVideo, hasAudio, bedPath, volume }}
 */
export async function mixAudioBed(
    inputVideo,
    outputVideo,
    { volume = 0.28, bedPath = null, preferSourceAudio = true } = {}
) {
    const bed = bedPath && fs.existsSync(bedPath) ? bedPath : await ensureDefaultBed();
    const duration = (await probeDuration(inputVideo)) || 16;
    const fadeOutStart = Math.max(0, duration - 1.4);
    const sourceHasAudio = preferSourceAudio ? await hasAudioStream(inputVideo) : false;

    if (sourceHasAudio) {
        // Duck bed under native audio (if model ever returns sound)
        await run('ffmpeg', [
            '-y',
            '-i',
            inputVideo,
            '-stream_loop',
            '-1',
            '-i',
            bed,
            '-filter_complex',
            [
                `[1:a]volume=${volume},atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,`,
                `afade=t=in:st=0:d=0.7,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=1.3[bed]`,
                `;[0:a]volume=0.85[src]`,
                `;[src][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,`,
                `alimiter=limit=0.97,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
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
            '160k',
            '-shortest',
            '-movflags',
            '+faststart',
            outputVideo,
        ]);
    } else {
        await run('ffmpeg', [
            '-y',
            '-i',
            inputVideo,
            '-stream_loop',
            '-1',
            '-i',
            bed,
            '-filter_complex',
            [
                `[1:a]volume=${volume},atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,`,
                `afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=1.3,`,
                `aresample=48000[a]`,
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
            '160k',
            '-t',
            String(duration.toFixed(3)),
            '-movflags',
            '+faststart',
            outputVideo,
        ]);
    }

    return {
        outputVideo,
        hasAudio: true,
        bedPath: bed,
        volume,
        sourceHadAudio: sourceHasAudio,
        duration,
    };
}

/**
 * Mix optional VO + music bed under video (storytelling path).
 * VO is foreground; bed ducks under it.
 */
export async function mixVoiceAndBed(
    inputVideo,
    outputVideo,
    {
        voPath = null,
        bedPath = null,
        bedVolume = 0.14,
        voVolume = 1.5,
        loudness = true,
    } = {}
) {
    if (!voPath || !fs.existsSync(voPath)) {
        return mixAudioBed(inputVideo, outputVideo, {
            volume: bedVolume > 0.2 ? bedVolume : 0.28,
            bedPath,
        });
    }

    const bed = bedPath && fs.existsSync(bedPath) ? bedPath : await ensureDefaultBed();
    const duration = (await probeDuration(inputVideo)) || 16;
    const fadeOutStart = Math.max(0, duration - 1.2);

    // CRITICAL: amix normalize=0 — default normalize=1 averages streams and
    // can push speech to ~-40dB (inaudible). Then loudnorm to ~-14 LUFS.
    const loudTail = loudness
        ? ',loudnorm=I=-14:TP=-1.5:LRA=11'
        : '';

    await run('ffmpeg', [
        '-y',
        '-i',
        inputVideo,
        '-i',
        voPath,
        '-stream_loop',
        '-1',
        '-i',
        bed,
        '-filter_complex',
        [
            // VO: boost + pad so amix never shortens early
            `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${voVolume},`,
            `afade=t=in:st=0:d=0.04,apad=whole_dur=${duration.toFixed(3)}[vo]`,
            `;[2:a]volume=${bedVolume},atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,`,
            `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=1.0,`,
            `aformat=sample_rates=48000:channel_layouts=stereo[bed]`,
            `;[vo][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,`,
            `alimiter=limit=0.97${loudTail}[a]`,
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
        '-t',
        String(duration.toFixed(3)),
        '-movflags',
        '+faststart',
        outputVideo,
    ]);

    return {
        outputVideo,
        hasAudio: true,
        hasVoice: true,
        bedPath: bed,
        voPath,
        bedVolume,
        voVolume,
        duration,
    };
}

export function listAudioBeds() {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    return fs
        .readdirSync(AUDIO_DIR)
        .filter((f) => /\.(m4a|mp3|aac|wav|ogg)$/i.test(f))
        .map((f) => ({
            file: f,
            path: path.join(AUDIO_DIR, f),
            url: `/api/audio/${f}`,
        }));
}

export { AUDIO_DIR, DEFAULT_BED };
