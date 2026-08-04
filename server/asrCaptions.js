/**
 * ASR captions for diegetic / Grok-native talk reels.
 *
 * Why: script dialogue ≠ what Grok actually speaks. Captions must come from
 * Whisper word timings on the plate audio, not from beat.dialogue text.
 *
 * Uses local openai-whisper (Python) with word_timestamps=True.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, opts);
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
            else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-1500)}`));
        });
    });
}

/** Extract mono 16k wav for Whisper. */
export async function extractWav(videoPath, wavPath, { start = null, duration = null } = {}) {
    const args = ['-y'];
    if (start != null) args.push('-ss', String(start));
    args.push('-i', videoPath);
    if (duration != null) args.push('-t', String(duration));
    args.push(
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        wavPath
    );
    await run('ffmpeg', args);
    return wavPath;
}

/**
 * Transcribe a wav/mp4 with local Whisper → word-level timings.
 * @returns {{ text: string, words: Array<{word,start,end}>, segments: Array }}
 */
export async function transcribeWithWhisper(mediaPath, { model = 'base', language = 'en' } = {}) {
    if (!fs.existsSync(mediaPath)) throw new Error(`ASR media missing: ${mediaPath}`);

    const py = `
import json, sys
import whisper

media = sys.argv[1]
model_name = sys.argv[2]
language = sys.argv[3] if len(sys.argv) > 3 else "en"

model = whisper.load_model(model_name)
result = model.transcribe(
    media,
    language=language or None,
    word_timestamps=True,
    verbose=False,
    condition_on_previous_text=False,
)

words = []
segments_out = []
for seg in result.get("segments") or []:
    seg_words = []
    for w in seg.get("words") or []:
        token = (w.get("word") or "").strip()
        if not token:
            continue
        item = {
            "word": token,
            "start": float(w.get("start") or 0),
            "end": float(w.get("end") or w.get("start") or 0),
        }
        words.append(item)
        seg_words.append(item)
    text = (seg.get("text") or "").strip()
    if text or seg_words:
        segments_out.append({
            "start": float(seg.get("start") or 0),
            "end": float(seg.get("end") or 0),
            "text": text,
            "words": seg_words,
        })

out = {
    "text": (result.get("text") or "").strip(),
    "words": words,
    "segments": segments_out,
}
print(json.dumps(out))
`.trim();

    const { stdout } = await run(
        'python3',
        ['-c', py, mediaPath, model, language || 'en'],
        { env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    );

    // Whisper may print progress on stderr; stdout should be pure JSON (last line)
    const lines = String(stdout)
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    let parsed = null;
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            parsed = JSON.parse(lines[i]);
            break;
        } catch {
            /* keep scanning */
        }
    }
    if (!parsed) {
        throw new Error(`Whisper returned no JSON. stdout tail: ${stdout.slice(-400)}`);
    }
    return parsed;
}

/**
 * Transcribe stitched story plate; return absolute-timed words + segments.
 * Prefer full-plate ASR so timings stay continuous across beats.
 */
export async function asrStoryPlate(stitchedVideoPath, workDir, opts = {}) {
    fs.mkdirSync(workDir, { recursive: true });
    const wav = path.join(workDir, 'plate-asr.wav');
    await extractWav(stitchedVideoPath, wav);
    const result = await transcribeWithWhisper(wav, {
        model: opts.model || process.env.WHISPER_MODEL || 'base',
        language: opts.language || 'en',
    });

    const reportPath = path.join(workDir, 'transcript.json');
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                source: stitchedVideoPath,
                approach: 'whisper_word_timestamps',
                text: result.text,
                words: result.words,
                segments: result.segments,
            },
            null,
            2
        )
    );

    return {
        text: result.text,
        words: result.words || [],
        segments: result.segments || [],
        reportPath,
        wavPath: wav,
    };
}

/**
 * Group ASR words into karaoke windows for graphicsCompose.
 * Each window: full phrase words + activeIndex timing.
 *
 * Returns array of { words: string[], activeIndex, start, end, text }
 * suitable for building word caption plates, OR segment holds.
 */
export function scheduleKaraokeFromAsr(
    words,
    { totalDuration = null, maxWordsPerPhrase = 11 } = {}
) {
    const raw = (words || []).map((w) => ({
        word: String(w.word || '').trim(),
        start: Math.max(0, Number(w.start) || 0),
        end: Math.max(0, Number(w.end) || Number(w.start) || 0),
    }));

    // Merge Whisper mishears: "Task is" / "Task as" / "task iz" → "Taskiz"
    const list = [];
    for (let i = 0; i < raw.length; i++) {
        const cur = raw[i];
        const next = raw[i + 1];
        const curBase = cur.word.replace(/[.,!?…]+$/g, '');
        const nextBase = next ? next.word.replace(/[.,!?…]+$/g, '') : '';
        if (/^task$/i.test(curBase) && next && /^(is|as|iz)$/i.test(nextBase)) {
            const punct =
                next.word.match(/[.,!?…]+$/)?.[0] ||
                cur.word.match(/[.,!?…]+$/)?.[0] ||
                '';
            list.push({ word: `Taskiz${punct}`, start: cur.start, end: next.end });
            i += 1;
            continue;
        }
        if (/^taskis$/i.test(curBase) || /^taskiz$/i.test(curBase)) {
            const punct = cur.word.match(/[.,!?…]+$/)?.[0] || '';
            list.push({ word: `Taskiz${punct}`, start: cur.start, end: cur.end });
            continue;
        }
        list.push(cur);
    }

    const cleaned = list.filter((w) => w.word);
    if (!cleaned.length) return [];

    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i].end <= cleaned[i].start) {
            const nextStart = cleaned[i + 1]?.start;
            cleaned[i].end =
                nextStart != null && nextStart > cleaned[i].start
                    ? nextStart
                    : cleaned[i].start + 0.18;
        }
    }

    // Split: silence gap, punctuation, OR max words (keeps karaoke readable)
    const phrases = [];
    let cur = [];
    for (let i = 0; i < cleaned.length; i++) {
        const w = cleaned[i];
        if (!cur.length) {
            cur.push(w);
            continue;
        }
        const prev = cur[cur.length - 1];
        const gap = w.start - prev.end;
        const punctBreak = /[.!?…,;:]["')\]]*$/.test(prev.word);
        const tooLong = cur.length >= maxWordsPerPhrase;
        if (gap > 0.45 || (punctBreak && gap > 0.12) || tooLong) {
            phrases.push(cur);
            cur = [w];
        } else {
            cur.push(w);
        }
    }
    if (cur.length) phrases.push(cur);

    const layers = [];
    for (const phrase of phrases) {
        const phraseWords = phrase.map((p) => p.word);
        for (let i = 0; i < phrase.length; i++) {
            const start = i === 0 ? phrase[0].start : phrase[i].start;
            let end =
                i < phrase.length - 1
                    ? phrase[i + 1].start
                    : Math.max(phrase[i].end, phrase[i].start + 0.12);
            if (i === phrase.length - 1) end = Math.max(end, phrase[i].end + 0.08);
            if (totalDuration != null) end = Math.min(end, totalDuration);
            if (end <= start) end = start + 0.06;
            layers.push({
                words: phraseWords,
                activeIndex: i,
                start,
                end,
                text: phraseWords.join(' '),
                word: phrase[i].word,
            });
        }
    }

    layers.sort((a, b) => a.start - b.start);
    for (let i = 0; i < layers.length - 1; i++) {
        if (layers[i].end > layers[i + 1].start) {
            layers[i].end = Math.max(layers[i].start + 0.04, layers[i + 1].start);
        }
    }

    return layers;
}

/**
 * Per-beat ASR (when only beat clips are available).
 * Offsets word times by beat cut starts.
 */
export async function asrBeats(beatVideoPaths, cutStarts, workDir, opts = {}) {
    fs.mkdirSync(workDir, { recursive: true });
    const allWords = [];
    const beatsOut = [];

    for (let i = 0; i < beatVideoPaths.length; i++) {
        const src = beatVideoPaths[i];
        if (!src || !fs.existsSync(src)) continue;
        const wav = path.join(workDir, `beat-${i}.wav`);
        await extractWav(src, wav);
        const result = await transcribeWithWhisper(wav, opts);
        const offset = cutStarts[i] || 0;
        const words = (result.words || []).map((w) => ({
            word: w.word,
            start: offset + Number(w.start || 0),
            end: offset + Number(w.end || w.start || 0),
        }));
        allWords.push(...words);
        beatsOut.push({
            beat: i,
            text: result.text,
            words,
            segments: (result.segments || []).map((s) => ({
                ...s,
                start: offset + Number(s.start || 0),
                end: offset + Number(s.end || 0),
                words: (s.words || []).map((w) => ({
                    word: w.word,
                    start: offset + Number(w.start || 0),
                    end: offset + Number(w.end || 0),
                })),
            })),
        });
    }

    const reportPath = path.join(workDir, 'transcript.json');
    fs.writeFileSync(reportPath, JSON.stringify(beatsOut, null, 2));
    return { words: allWords, beats: beatsOut, reportPath };
}

export function hasLocalWhisper() {
    return new Promise((resolve) => {
        const child = spawn('python3', ['-c', 'import whisper; print("ok")']);
        let ok = false;
        child.stdout?.on('data', (d) => {
            if (String(d).includes('ok')) ok = true;
        });
        child.on('close', () => resolve(ok));
        child.on('error', () => resolve(false));
    });
}
