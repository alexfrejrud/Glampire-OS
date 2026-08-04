/**
 * AI cast / character sheet — Grok Imagine only (no Arcads).
 * Flow: expand description → hero still → user-approved angles with hero as ref.
 */

import { generateImage, hasGrokKey } from './grok.js';
import { addRef } from './refs.js';
import {
    CHARACTER_SHEET_ANGLES,
    expandCharacterDescription,
    anglePrompt,
    stripForbiddenHype,
} from './creativeFormulas.js';
import { getBrand } from './brandLoader.js';
import { logGeneration } from './genAudit.js';

export function hasCharacterSheetKey() {
    return hasGrokKey();
}

export function previewCharacterSheet(description, brand = getBrand()) {
    return expandCharacterDescription(description, brand);
}

/**
 * Generate hero plate.
 * @returns {{ imageUrl, prompt, expanded, angle }}
 */
export async function generateHeroStill({
    description,
    aspectRatio = '9:16',
    brand = getBrand(),
} = {}) {
    if (!hasGrokKey()) {
        const err = new Error('XAI_API_KEY is required for character sheets');
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }
    const expanded = expandCharacterDescription(description, brand);
    const hero = CHARACTER_SHEET_ANGLES.find((a) => a.id === 'hero');
    const prompt = anglePrompt(expanded.prompt, hero, null);

    const result = await generateImage({
        prompt,
        aspectRatio,
        n: 1,
    });

    logGeneration({
        kind: 'character_sheet_hero',
        model: result.model || 'grok-imagine',
        aspectRatio,
        folderHint: expanded.folderHint,
        provider: 'xai',
    });

    return {
        imageUrl: result.urls[0],
        prompt,
        expanded,
        angle: hero,
        model: result.model,
    };
}

/**
 * Generate remaining angles with hero as identity lock.
 * @param {{ heroImageUrl: string, basePrompt: string, angleIds?: string[], aspectRatio?: string, saveToLibrary?: boolean, castName?: string, tags?: string[] }} opts
 */
export async function generateCastAngles({
    heroImageUrl,
    basePrompt,
    angleIds = null,
    aspectRatio = '9:16',
    saveToLibrary = true,
    castName = 'cast',
    tags = [],
} = {}) {
    if (!hasGrokKey()) {
        const err = new Error('XAI_API_KEY is required for character sheets');
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }
    if (!heroImageUrl) {
        const err = new Error('heroImageUrl is required');
        err.status = 400;
        throw err;
    }

    const angles = CHARACTER_SHEET_ANGLES.filter((a) => a.id !== 'hero').filter((a) =>
        angleIds?.length ? angleIds.includes(a.id) : true
    );

    const continuity = stripForbiddenHype(
        'The exact same person from the reference image — same face, same hair, same skin tone, same distinguishing features, same build, same wardrobe.'
    );

    const outputs = [];
    const savedRefs = [];

    // Sequential to reduce identity drift / rate limits
    for (const angle of angles) {
        const prompt = anglePrompt(basePrompt || '', angle, continuity);
        try {
            const result = await generateImage({
                prompt,
                aspectRatio,
                n: 1,
                referenceImage: heroImageUrl,
            });
            const imageUrl = result.urls[0];
            const item = {
                angleId: angle.id,
                label: angle.label,
                file: angle.file,
                prompt,
                imageUrl,
                model: result.model,
                mode: result.mode,
            };
            outputs.push(item);

            if (saveToLibrary && imageUrl?.startsWith('data:')) {
                const ref = addRef({
                    name: `${castName} · ${angle.label}`,
                    role: 'person',
                    notes: prompt,
                    tags: ['character-sheet', 'cast', castName, angle.id, ...tags].filter(Boolean),
                    dataUrl: imageUrl,
                });
                savedRefs.push(ref);
            }

            logGeneration({
                kind: 'character_sheet_angle',
                angleId: angle.id,
                model: result.model || 'grok-imagine',
                provider: 'xai',
            });
        } catch (err) {
            outputs.push({
                angleId: angle.id,
                label: angle.label,
                file: angle.file,
                error: err.message,
            });
        }
    }

    // Also save hero if data URL
    if (saveToLibrary && heroImageUrl?.startsWith('data:')) {
        try {
            const heroRef = addRef({
                name: `${castName} · Hero front`,
                role: 'person',
                notes: basePrompt || 'Character sheet hero',
                tags: ['character-sheet', 'cast', castName, 'hero', ...tags].filter(Boolean),
                dataUrl: heroImageUrl,
            });
            savedRefs.unshift(heroRef);
        } catch {
            /* ignore */
        }
    }

    return { angles: outputs, savedRefs, castName };
}

/**
 * One-shot: hero + angles (expensive). Prefer step flow in UI.
 */
export async function generateFullCharacterSheet({
    description,
    aspectRatio = '9:16',
    brand = getBrand(),
    saveToLibrary = true,
} = {}) {
    const hero = await generateHeroStill({ description, aspectRatio, brand });
    const rest = await generateCastAngles({
        heroImageUrl: hero.imageUrl,
        basePrompt: hero.expanded.prompt,
        aspectRatio,
        saveToLibrary,
        castName: hero.expanded.folderHint || hero.expanded.name,
        tags: hero.expanded.tags,
    });
    return {
        hero,
        ...rest,
    };
}
