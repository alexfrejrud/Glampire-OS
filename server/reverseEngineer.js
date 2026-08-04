/**
 * Character Reverse-Engineer
 * Same feature as 10Xin Toolkit:
 *   upload a character screenshot → one detailed raw-iPhone UGC prompt
 *   ready to paste into an image model to generate similar images.
 *
 * Backend: Grok vision (XAI_API_KEY). Output tuned for Grok Imagine.
 */

const SYSTEM_PROMPT = `You are a specialist at reverse-engineering character screenshots into AI image-generation prompts.

You will be given an image of a character (usually a still from a video, e.g. a UGC-style talking-head clip). Your job is to look closely at everything visible and convert it into ONE detailed, ready-to-use text prompt, written for photoreal image models (especially xAI Grok Imagine / grok-imagine-image-quality). The prompt must be good enough that generating from it produces an image as close as possible to the reference.

The output must ALWAYS follow this exact style and structure, regardless of what the image actually contains:

- Ultra-realistic vertical smartphone photo, 9:16 aspect ratio, raw amateur UGC footage style (adjust lighting description to match the actual image — daylight, indoor lamp light, golden hour, etc.)
- Describe the subject in detail: apparent age, ethnicity/skin tone, hair, facial features, distinguishing details, exact clothing/wardrobe, and body position/framing relative to camera.
- Describe their expression and what they appear to be doing (e.g. mid-sentence, talking to camera, gesturing) — infer a natural mid-action moment even if the source is a still.
- Describe any foreground objects/props visible on a table or in frame, with material and placement detail (left/right/center).
- Describe the background in detail: setting, architecture or environment, colors, textures, objects, depth cues, anything visible through doors/windows, plants, lighting on the environment.
- Describe the lighting explicitly: direction, quality (soft/harsh), time of day, how it falls on the subject and the environment, shadows.
- ALWAYS end with a "Photo style:" clause that locks in: raw, unpolished iPhone-style vertical video screenshot, natural skin texture and imperfections, NOT studio lit, NOT retouched, realistic depth of field with soft background blur, no text overlays, no captions, no logos, no watermarks, no UI elements.

Rules:
- Base every detail strictly on what is actually visible in the uploaded image. Never reuse details from any example — invent nothing that contradicts the image, but you may reasonably infer natural mid-action expression/pose if the source is a static frame.
- If something is unclear or partially obscured, describe it plausibly and briefly rather than guessing wildly or leaving gaps.
- Write in flowing descriptive prose paragraphs (not bullet points), matching the density and tone of a professional AI-art prompt.
- Output ONLY the final prompt text. No preamble, no headers, no explanation, no markdown formatting, no quotation marks around it.`;

const USER_TEXT =
    'Reverse-engineer this character screenshot into the detailed raw-iPhone-style UGC prompt as instructed.';

/** Models that accept image input via chat/completions (tried in order) */
const DEFAULT_VISION_MODELS = [
    process.env.GROK_VISION_MODEL,
    'grok-2-vision-latest',
    'grok-2-vision-1212',
    'grok-4-latest',
    'grok-4.5',
    'grok-2-latest',
].filter(Boolean);

export function hasVisionKey() {
    return Boolean(process.env.XAI_API_KEY);
}

export function visionProvider() {
    return process.env.XAI_API_KEY ? 'grok' : null;
}

/**
 * @param {{ base64: string, mediaType?: string }} input
 * @returns {Promise<{ prompt: string, provider: string, model: string, targetImageModel: string }>}
 */
export async function reverseEngineerCharacter({ base64, mediaType }) {
    if (!base64) {
        const err = new Error('base64 image is required');
        err.status = 400;
        throw err;
    }

    if (!process.env.XAI_API_KEY) {
        const err = new Error(
            'XAI_API_KEY is not set. Add your xAI/Grok key to .env and restart the server.'
        );
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }

    const mime = mediaType || 'image/jpeg';
    const pureBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const dataUrl = base64.startsWith('data:')
        ? base64
        : `data:${mime};base64,${pureBase64}`;

    return analyzeWithGrok({ pureBase64, mime, dataUrl });
}

async function analyzeWithGrok({ pureBase64, mime, dataUrl }) {
    const modelsToTry = [...new Set(DEFAULT_VISION_MODELS)];

    const imageUrl = dataUrl.startsWith('data:')
        ? dataUrl
        : `data:${mime};base64,${pureBase64}`;

    let lastErr;

    for (const model of modelsToTry) {
        try {
            const res = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 1200,
                    temperature: 0.3,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageUrl,
                                        detail: 'high',
                                    },
                                },
                                { type: 'text', text: USER_TEXT },
                            ],
                        },
                    ],
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg =
                    data.error?.message ||
                    data.error ||
                    (typeof data.message === 'string' ? data.message : null) ||
                    `Grok vision failed (${res.status})`;
                lastErr = new Error(String(msg));
                lastErr.status = res.status;
                lastErr.details = data;
                lastErr.model = model;
                console.warn(`[reverseEngineer] model ${model} failed:`, msg);
                continue;
            }

            let text = data.choices?.[0]?.message?.content;
            if (Array.isArray(text)) {
                text = text
                    .map((p) => (typeof p === 'string' ? p : p?.text || ''))
                    .join('\n');
            }
            if (!text || !String(text).trim()) {
                lastErr = new Error(`Grok (${model}) returned empty prompt`);
                continue;
            }

            return {
                prompt: String(text).trim(),
                provider: 'grok',
                model,
                targetImageModel:
                    process.env.GROK_IMAGE_MODEL || 'grok-imagine-image-quality',
            };
        } catch (e) {
            lastErr = e;
            lastErr.model = model;
            console.warn(`[reverseEngineer] model ${model} error:`, e.message);
        }
    }

    const err =
        lastErr ||
        new Error(`Grok vision failed (tried: ${modelsToTry.join(', ')})`);
    if (!err.status) err.status = 502;
    err.code = 'GROK_VISION_FAILED';
    throw err;
}
