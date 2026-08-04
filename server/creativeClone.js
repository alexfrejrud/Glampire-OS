/**
 * Creative clone / reverse-engineer tools — Grok vision + text.
 * Produces reusable templates for OUR pipes (Grok/fal), never Arcads endpoints.
 */

import { getBrand } from './brandLoader.js';
import { brandIcpPromptLock } from './brandCast.js';

const DEFAULT_VISION = [
    process.env.GROK_VISION_MODEL,
    'grok-2-vision-latest',
    'grok-4-latest',
    'grok-2-latest',
].filter(Boolean);

const DEFAULT_TEXT = [
    process.env.GROK_TEXT_MODEL,
    'grok-4-latest',
    'grok-4.5',
    'grok-3-latest',
    'grok-2-latest',
].filter(Boolean);

function xaiKey() {
    const key = process.env.XAI_API_KEY;
    if (!key) {
        const err = new Error('XAI_API_KEY is not set');
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }
    return key;
}

export function hasCreativeCloneKey() {
    return Boolean(process.env.XAI_API_KEY);
}

async function chat({ system, user, images = [], models = DEFAULT_TEXT, max_tokens = 1800, temperature = 0.4 }) {
    const key = xaiKey();
    let lastErr;
    for (const model of models) {
        try {
            const content = [];
            if (images.length) {
                for (const img of images) {
                    const url = img.startsWith('data:') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`;
                    content.push({
                        type: 'image_url',
                        image_url: { url, detail: 'high' },
                    });
                }
            }
            content.push({ type: 'text', text: user });

            const res = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens,
                    temperature,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content },
                    ],
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                lastErr = new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
                lastErr.status = res.status;
                continue;
            }
            const text = data.choices?.[0]?.message?.content?.trim();
            if (!text) {
                lastErr = new Error('Empty model response');
                continue;
            }
            return { text, model, provider: 'xai' };
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Clone analysis failed');
}

const AD_CLONE_SYSTEM = `You reverse-engineer static Meta/social ads into REUSABLE prompt templates for photoreal or UI-mimic image models (xAI Grok Imagine).

Output STRICT markdown with these sections:

## Structure
(what layout / format this is — e.g. comparison table, fake notes app, lifestyle + headline space)

## Visual formula
(composition, hierarchy, colors, type treatment, photo vs UI)

## Variables
List placeholders as {brand.name}, {headline}, {support}, {cta}, {product}, {icp}, {color.brand}

## Template prompt
A single fenced code block with the FULL drop-in generation prompt using those {placeholders}.
Rules:
- If this is a UI-mimic ad (Notes, Slack, search, chat), the model SHOULD paint the type/UI.
- If this is a photoreal lifestyle plate for brand compose, say PHOTO PLATE ONLY and forbid painted logos/brand wordmarks.
- Never copy the original brand's trademarked claims.

## Model notes
- Grok Imagine: strengths/risks on this template
- When to use Brand OS compose vs bake type in-model

## QA checklist
Bullet list of failure modes to reject.`;

/**
 * Reverse-engineer a static ad image into a reusable template.
 */
export async function cloneAdImage({ dataUrl, base64, mediaType = 'image/jpeg', brand = getBrand() } = {}) {
    let image = dataUrl;
    if (!image && base64) {
        image = `data:${mediaType};base64,${base64}`;
    }
    if (!image) {
        const err = new Error('dataUrl or base64 required');
        err.status = 400;
        throw err;
    }

    const brandHint = [
        brand.name && `Active brand: ${brand.name}`,
        brand.category && `Category: ${brand.category}`,
        brand.oneLiner && `One-liner: ${brand.oneLiner}`,
        brandIcpPromptLock(brand),
    ]
        .filter(Boolean)
        .join('\n');

    const result = await chat({
        system: AD_CLONE_SYSTEM,
        user: `Analyze this ad image and produce a reusable template for our studio.\n\n${brandHint}`,
        images: [image],
        models: DEFAULT_VISION,
        max_tokens: 2200,
        temperature: 0.35,
    });

    return {
        kind: 'ad_image_clone',
        analysis: result.text,
        model: result.model,
        provider: result.provider,
    };
}

const VIDEO_CLONE_SYSTEM = `You reverse-engineer short-form video ads (UGC, talking-head, product demo) into a reusable STRUCTURE TEMPLATE for image-to-video pipelines (Grok Video / Kling / Seedance via fal).

You may receive:
- a single frame grab, OR
- a text description of the video, OR
- both.

Output STRICT markdown:

## Hook type
## Beat map
Numbered beats with: role (hook|tension|demo|resolve|cta), ~seconds, visual, spoken line pattern (abstract, not stolen copy)

## Camera / lighting / energy
## Continuity locks
## Still plate prompt (Grok Imagine)
Fenced code block — photoreal plate, no painted text/logos.

## Motion prompt (I2V)
Fenced code block — animate from still; no burned captions.

## Caption / VO notes
When to use diegetic speech vs external VO + ASR karaoke.

## Style pack suggestion
One of: contractor_talk | ultra_ugc | ugc_field | documentary_commercial | premium_product | soft_founder | pain_to_cta

## Variables
{icp}, {pain}, {product_moment}, {cta}, {setting}

Do NOT copy word-for-word dialogue from the source. Abstract the formula only.`;

/**
 * Reverse-engineer video structure into reusable beat template.
 */
export async function cloneVideoStructure({
    dataUrl,
    base64,
    mediaType = 'image/jpeg',
    description = '',
    brand = getBrand(),
} = {}) {
    const images = [];
    if (dataUrl) images.push(dataUrl);
    else if (base64) images.push(`data:${mediaType};base64,${base64}`);

    if (!images.length && !String(description || '').trim()) {
        const err = new Error('Provide a frame image and/or video description');
        err.status = 400;
        throw err;
    }

    const brandHint = [
        brand.name && `Active brand: ${brand.name}`,
        brand.category && `Category: ${brand.category}`,
        brandIcpPromptLock(brand),
    ]
        .filter(Boolean)
        .join('\n');

    const user = [
        'Produce a reusable short-form video template for our Grok/fal studio.',
        brandHint,
        description ? `\nOperator notes / transcript sketch:\n${description}` : '',
        images.length ? '\n(Frame grab attached.)' : '',
    ]
        .filter(Boolean)
        .join('\n');

    const result = await chat({
        system: VIDEO_CLONE_SYSTEM,
        user,
        images,
        models: images.length ? DEFAULT_VISION : DEFAULT_TEXT,
        max_tokens: 2200,
        temperature: 0.4,
    });

    return {
        kind: 'video_structure_clone',
        analysis: result.text,
        model: result.model,
        provider: result.provider,
    };
}
