/**
 * ElevenLabs TTS for story-reel voiceover.
 *
 * Voice selection:
 *  - ELEVENLABS_VOICE_ID if set (manual override)
 *  - otherwise AI/heuristic pick from account voices for brand profile
 *    (contractor peer UGC — calm, conversational, not radio announcer)
 *
 * Env:
 *   ELEVENLABS_API_KEY     required for VO
 *   ELEVENLABS_VOICE_ID    optional override
 *   ELEVENLABS_MODEL_ID    default eleven_turbo_v2_5
 *   ELEVENLABS_VOICE_PROFILE  optional: peer_male | peer_female | narrator
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VO_DIR = path.join(__dirname, 'data', 'audio', 'vo');
const CACHE_PATH = path.join(__dirname, 'data', 'audio', 'voice-pick.json');

const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';

/** Hardcoded public previews as last resort if list fails (Adam). */
const FALLBACK_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

let _voicesCache = null;
let _voicesCacheAt = 0;
const VOICES_TTL_MS = 10 * 60 * 1000;

export function hasElevenLabs(env = process.env) {
    return Boolean(env.ELEVENLABS_API_KEY);
}

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
            else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-800)}`));
        });
    });
}

function apiHeaders(key = process.env.ELEVENLABS_API_KEY) {
    return {
        'xi-api-key': key,
        Accept: 'application/json',
    };
}

/**
 * List available voices for this API key (premade + cloned).
 */
export async function listVoices({ force = false } = {}) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
        const err = new Error('ELEVENLABS_API_KEY not set');
        err.code = 'NO_ELEVENLABS';
        throw err;
    }

    if (!force && _voicesCache && Date.now() - _voicesCacheAt < VOICES_TTL_MS) {
        return _voicesCache;
    }

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: apiHeaders(key),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`ElevenLabs list voices ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const voices = (data.voices || []).map(normalizeVoice);
    _voicesCache = voices;
    _voicesCacheAt = Date.now();
    return voices;
}

function normalizeVoice(v) {
    const labels = v.labels || {};
    return {
        voiceId: v.voice_id,
        name: v.name || 'Unknown',
        category: v.category || labels.use_case || '',
        description: v.description || '',
        labels: {
            accent: String(labels.accent || '').toLowerCase(),
            age: String(labels.age || '').toLowerCase(),
            gender: String(labels.gender || '').toLowerCase(),
            useCase: String(labels.use_case || labels.usecase || '').toLowerCase(),
            descriptive: String(labels.descriptive || labels.description || '').toLowerCase(),
            ...Object.fromEntries(
                Object.entries(labels).map(([k, val]) => [k, String(val).toLowerCase()])
            ),
        },
        previewUrl: v.preview_url || null,
    };
}

/**
 * Score a voice for story reels — peer talking to ICP, not ad VO.
 * profile: peer_male | peer_female | narrator
 */
export function scoreVoiceForProfile(voice, profile = 'peer_male') {
    const blob = [
        voice.name,
        voice.description,
        voice.category,
        ...Object.values(voice.labels || {}),
    ]
        .join(' ')
        .toLowerCase();

    let score = 0;

    // Gender preference
    const wantFemale = profile === 'peer_female';
    const gender = voice.labels?.gender || '';
    if (wantFemale) {
        if (gender === 'female') score += 25;
        if (gender === 'male') score -= 20;
    } else {
        if (gender === 'male') score += 25;
        if (gender === 'female') score -= 8; // still usable
    }

    // Accent — US / american preferred default (override via Brand OS voice prefs later)
    const accent = voice.labels?.accent || '';
    if (/american|us|usa|neutral/.test(accent) || /american|us english/.test(blob)) score += 18;
    if (/british|australian|irish|scottish|indian|spanish/.test(accent)) score -= 10;

    // Age — middle-aged peer, not teen / elderly character
    const age = voice.labels?.age || '';
    if (/middle|adult|young/.test(age)) score += 12;
    if (/old|child|teen/.test(age)) score -= 15;

    // Use case / vibe
    if (/narrat|convers|social|explainer|informative/.test(blob)) score += 14;
    if (/casual|friendly|warm|natural|calm|grounded|confident/.test(blob)) score += 12;
    if (/deep|raspy|gravel/.test(blob)) score += 4; // field energy ok

    // Penalize bad fits for contractor UGC
    if (/news|broadcast|radio|announcer|commercial|promo/.test(blob)) score -= 22;
    if (/character|cartoon|whisper|scream|seduc|anime|robot|child|kid/.test(blob)) score -= 30;
    if (/british|posh|aristocrat/.test(blob)) score -= 12;

    // Known solid premade names (boost if present in library)
    if (/\b(adam|antoni|josh|sam|chris|daniel|brian|eric|george|callum|liam)\b/.test(blob) && !wantFemale) {
        score += 8;
    }
    if (/\b(rachel|domi|bella|elli|nicole|sarah|matilda|charlotte)\b/.test(blob) && wantFemale) {
        score += 8;
    }

    // Narrator profile: allow more polished
    if (profile === 'narrator') {
        if (/narrat|documentary|story/.test(blob)) score += 10;
        if (/casual|slang/.test(blob)) score -= 4;
    }

    return score;
}

/**
 * Pick best voice for brand / style profile. Caches choice to disk for consistency
 * across a session of reels (same voice week over week until cache cleared).
 */
export async function pickVoice({
    profile = null,
    force = false,
    voiceId = null,
} = {}) {
    // Manual override always wins
    if (voiceId || process.env.ELEVENLABS_VOICE_ID) {
        const id = voiceId || process.env.ELEVENLABS_VOICE_ID;
        return {
            voiceId: id,
            name: process.env.ELEVENLABS_VOICE_NAME || 'configured',
            source: 'env_or_override',
            profile: profile || process.env.ELEVENLABS_VOICE_PROFILE || 'peer_male',
        };
    }

    const resolvedProfile =
        profile || process.env.ELEVENLABS_VOICE_PROFILE || 'peer_male';

    // Stable cache so a weekly pack keeps one voice
    if (!force && fs.existsSync(CACHE_PATH)) {
        try {
            const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            if (
                cached?.voiceId &&
                cached.profile === resolvedProfile &&
                Date.now() - (cached.at || 0) < 7 * 24 * 60 * 60 * 1000
            ) {
                return { ...cached, source: 'cache' };
            }
        } catch {
            /* ignore */
        }
    }

    let voices = [];
    try {
        voices = await listVoices({ force });
    } catch (e) {
        console.warn('[elevenLabs] list voices failed, using fallback:', e.message);
        return {
            voiceId: FALLBACK_VOICE_ID,
            name: 'Adam (fallback)',
            source: 'fallback',
            profile: resolvedProfile,
            score: 0,
        };
    }

    if (!voices.length) {
        return {
            voiceId: FALLBACK_VOICE_ID,
            name: 'Adam (fallback)',
            source: 'fallback_empty',
            profile: resolvedProfile,
        };
    }

    const ranked = voices
        .map((v) => ({ ...v, score: scoreVoiceForProfile(v, resolvedProfile) }))
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const pick = {
        voiceId: best.voiceId,
        name: best.name,
        source: 'auto',
        profile: resolvedProfile,
        score: best.score,
        labels: best.labels,
        at: Date.now(),
        alternatives: ranked.slice(1, 4).map((v) => ({
            voiceId: v.voiceId,
            name: v.name,
            score: v.score,
        })),
    };

    try {
        fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(pick, null, 2));
    } catch {
        /* non-fatal */
    }

    console.log(
        `[elevenLabs] auto voice: ${pick.name} (${pick.voiceId}) score=${pick.score} profile=${pick.profile}`
    );
    return pick;
}

/**
 * Infer voice profile from item style / brand (still no human pick required).
 */
export function inferVoiceProfile(item = {}) {
    const style = String(item.styleId || item.graphics?.caption || '').toLowerCase();
    if (style.includes('premium') || style.includes('documentary')) return 'narrator';
    if (item.voiceProfile) return item.voiceProfile;
    if (process.env.ELEVENLABS_VOICE_PROFILE) return process.env.ELEVENLABS_VOICE_PROFILE;
    // Default: peer male for contractor field UGC
    return 'peer_male';
}

/**
 * Synthesize one line → mp3 path.
 */
export async function synthesizeLine(text, { outPath, voiceId, modelId } = {}) {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
        const err = new Error('ELEVENLABS_API_KEY not set');
        err.code = 'NO_ELEVENLABS';
        throw err;
    }

    let voice = voiceId;
    if (!voice) {
        const picked = await pickVoice();
        voice = picked.voiceId;
    }

    const model = modelId || DEFAULT_MODEL;
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Empty voice line');

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
            text: clean,
            model_id: model,
            voice_settings: {
                stability: 0.42,
                similarity_boost: 0.75,
                style: 0.35,
                use_speaker_boost: true,
            },
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 400)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    return { outPath, voiceId: voice };
}

/**
 * Build timed VO track for multi-beat story.
 * Auto-picks voice unless voiceId provided.
 */
export async function buildStoryVoiceover({
    beats,
    actualDurations,
    workDir,
    voiceId,
    totalDuration,
    voiceProfile,
    item,
}) {
    if (!hasElevenLabs()) {
        return { ok: false, reason: 'no_api_key', voPath: null };
    }

    const profile = voiceProfile || inferVoiceProfile(item || {});
    const picked = await pickVoice({ profile, voiceId });

    const dir = workDir || path.join(VO_DIR, `vo-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });

    const segments = [];
    let t = 0;
    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const dur = actualDurations[i] || Number(beat.durationSec) || 5;
        // Prefer full dialogue (what captions show) so VO matches on-screen words
        const line = String(
            beat.dialogue || beat.voiceLine || beat.spokenCaption || beat.title || ''
        )
            .replace(/\s+/g, ' ')
            .trim();
        if (!line) {
            t += dur;
            continue;
        }
        const mp3 = path.join(dir, `line-${i}.mp3`);
        await synthesizeLine(line, { outPath: mp3, voiceId: picked.voiceId });
        // Align VO start with caption speech window (~8% into beat)
        const padIn = Math.min(0.25, Math.max(0.08, dur * 0.08));
        segments.push({ path: mp3, start: t + padIn, beatDur: dur, index: i, line });
        t += dur;
    }

    if (!segments.length) {
        return { ok: false, reason: 'no_lines', voPath: null, voice: picked };
    }

    const total = totalDuration || t;
    const voOut = path.join(dir, 'vo-track.m4a');

    const args = [
        '-y',
        '-f',
        'lavfi',
        '-t',
        String(total.toFixed(3)),
        '-i',
        'anullsrc=r=44100:cl=mono',
    ];
    for (const seg of segments) {
        args.push('-i', seg.path);
    }

    const parts = [];
    const labels = ['[base]'];
    parts.push('[0:a]volume=0[base]');
    segments.forEach((seg, i) => {
        const delayMs = Math.round(seg.start * 1000);
        parts.push(
            `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=mono,volume=1.0,adelay=${delayMs}|${delayMs}[v${i}]`
        );
        labels.push(`[v${i}]`);
    });
    const n = labels.length;
    parts.push(
        `${labels.join('')}amix=inputs=${n}:duration=longest:dropout_transition=0,alimiter=limit=0.95,atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS[vo]`
    );

    args.push(
        '-filter_complex',
        parts.join(';'),
        '-map',
        '[vo]',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        voOut
    );

    await run('ffmpeg', args);

    return {
        ok: true,
        voPath: voOut,
        segmentCount: segments.length,
        totalDuration: total,
        workDir: dir,
        voice: picked,
    };
}
