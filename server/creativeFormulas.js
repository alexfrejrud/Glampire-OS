/**
 * Creative prompt formulas — ported from arcads-claude-code playbooks
 * but rewired for Glampire Creative Studio (Grok + fal only — never Arcads).
 *
 * Core ideas:
 *  - 9-layer UGC still/video prompts (authenticity stack)
 *  - Cast lock sheets for multi-beat continuity
 *  - Seedance/Kling-safe negatives (no empty hype words)
 *  - Dialogue duration checks for spoken beats
 */

import { brandTalkCharacter, inferVisualWorld } from './brandCast.js';
import { getBrand } from './brandLoader.js';

/** Words that pull AI video models into fake “ad polish” */
export const FORBIDDEN_HYPE = [
    'cinematic',
    'professional',
    'stunning',
    '8k',
    'studio',
    'perfect',
    'masterpiece',
    'ultra HD',
    'award-winning',
];

export const SKIN_REALITY_CUES = [
    'natural skin with visible texture',
    'visible pores across nose and cheeks',
    'slight unevenness in skin tone',
    'minor undereye shadows',
    'a hint of shine on forehead from natural oils',
    'slight pinkness on cheeks and nose',
    'a few expression lines when smiling',
];

export const UGC_TECHNICAL_FLAWS = {
    light: 'no ring light, no beauty filters, real available light only',
    camera: 'natural phone quality, not color graded, soft focus OK, mild grain in shadows, slight motion blur on fast moves',
    audio: 'direct phone mic energy — natural voice, room ambience, no music bed under dialogue',
};

/** UGC style ids that get the full 9-layer authenticity stack */
export const UGC_STYLE_IDS = new Set([
    'contractor_talk',
    'ultra_ugc',
    'ugc_field',
    'pain_to_cta',
]);

export function isUgcStyle(styleId) {
    return UGC_STYLE_IDS.has(String(styleId || ''));
}

export function stripForbiddenHype(text) {
    let t = String(text || '');
    for (const w of FORBIDDEN_HYPE) {
        const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        t = t.replace(re, '');
    }
    return t.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Rough dialogue fit check (~2.5 words/sec comfortable).
 * @returns {{ ok: boolean, words: number, estSec: number, maxWords: number, advice: string }}
 */
export function checkDialogueDuration(dialogue, durationSec = 5) {
    const words = String(dialogue || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    const dur = Math.max(1, Number(durationSec) || 5);
    const maxWords = Math.floor(dur * 2.5);
    const estSec = words ? words / 2.55 + 0.35 : 0;
    const ok = words <= maxWords;
    return {
        ok,
        words,
        estSec: Math.round(estSec * 10) / 10,
        maxWords,
        advice: ok
            ? 'Dialogue fits a natural pace.'
            : `Too long for ${dur}s (~${words} words, budget ~${maxWords}). Cut filler or split across beats.`,
    };
}

/**
 * Build a cast lock sheet for multi-beat continuity.
 * Saved to brand.castBrief or used per-batch as batchBrief.
 */
export function buildCastSheet({
    brand = getBrand(),
    name = '',
    ageRange = '',
    hair = '',
    skin = '',
    eyes = '',
    wardrobe = '',
    setting = '',
    personality = '',
    extra = '',
} = {}) {
    const cast = brandTalkCharacter(brand);
    const world = inferVisualWorld(brand);
    const sheet = {
        version: 1,
        createdAt: new Date().toISOString(),
        domain: cast.domain,
        icp: cast.icp,
        protagonist: {
            name: name || 'ICP peer',
            ageRange: ageRange || world.characterAge,
            appearance: [hair, skin, eyes].filter(Boolean).join(', ') || cast.character,
            wardrobe: wardrobe || cast.wardrobe || world.wardrobe,
            personality: personality || 'honest peer-to-peer, slightly tired between jobs, never model polish',
        },
        setting: setting || cast.environment || world.environment,
        photo: cast.photo || world.photoHint,
        negativesExtra: cast.negativesExtra || world.negativesExtra,
        continuityRules: [
            'Same face, hair, wardrobe across every beat',
            'Same primary environment family (do not jump industries)',
            'Natural skin texture — never airbrushed',
            'Phone screens unreadable / blank',
            'No brand logos painted into the scene',
        ],
        extra: extra || '',
    };

    const briefLine = [
        `CAST LOCK — same person every beat: ${sheet.protagonist.name}, ${sheet.protagonist.ageRange}`,
        sheet.protagonist.appearance,
        `wardrobe: ${sheet.protagonist.wardrobe}`,
        `setting: ${sheet.setting}`,
        `energy: ${sheet.protagonist.personality}`,
        sheet.extra,
        'Continuity: identical face/hair/outfit; natural skin texture; peer UGC not fashion model.',
    ]
        .filter(Boolean)
        .join('. ');

    return { sheet, briefLine: stripForbiddenHype(briefLine) };
}

/**
 * 9-layer UGC still prompt (for plate generation).
 * Layers: format → person → setting → product/phone → action freeze → tone → flaws → vibe
 */
export function buildUgcStillPrompt({
    brand = getBrand(),
    subject = '',
    dialogueHint = '',
    contentType = 'honest review / peer confession',
    lightingSource = 'available jobsite or van light, cool overcast preferred',
    cameraAngle = 'casual handheld selfie / front camera at chest height',
    durationLabel = 'frame grab from a vertical phone video',
    castBrief = '',
} = {}) {
    const cast = brandTalkCharacter(brand);
    const world = inferVisualWorld(brand);
    const skin = SKIN_REALITY_CUES.slice(0, 3).join(', ');
    const person = castBrief || cast.character;
    const setting = cast.environment || world.environment;
    const scene = subject || 'peer talking to camera mid-conversation';

    const prompt = [
        // 1 format
        `${durationLabel}, vertical 9:16 UGC style ${contentType}, filmed on smartphone, ${lightingSource}, ${cameraAngle}.`,
        // 2 person
        `Subject: ${person}, ${skin}, authentic peer not fashion model.`,
        // 3 setting
        `Setting: ${setting} — lived-in clutter details, real not stock-empty.`,
        // 4 product / tool
        `If a phone appears, screen is blank or unreadable — never paint app UI or brand logos.`,
        // 5 freeze moment
        `Moment: ${scene}. Face toward lens, mid-conversation expression (not frozen stock smile).`,
        dialogueHint ? `Implied spoken energy: "${dialogueHint}"` : '',
        // 6 tone
        `Tone: honest, slightly imperfect, peer-to-peer — pauses and real energy, never announcer polish.`,
        // 7 edit feel (still)
        `Looks like a selected frame from multi-take UGC, slightly imperfect crop OK.`,
        // 8 technical flaws
        `Lighting: ${UGC_TECHNICAL_FLAWS.light}. Image: ${UGC_TECHNICAL_FLAWS.camera}.`,
        // 9 vibe
        `Overall feel: trustworthy, relatable, real — a friend venting then recommending a fix.`,
        `Strict negatives: no text, no logos, no captions, no UI chrome, no ring light beauty, no hard-hat hero poster pose, ${cast.negativesExtra || ''}.`,
        `Photo plate only — typography added later in compose / captions.`,
    ]
        .filter(Boolean)
        .join(' ');

    return stripForbiddenHype(prompt);
}

/**
 * UGC motion / talking-head video prompt layers (I2V).
 */
export function buildUgcVideoPrompt({
    brand = getBrand(),
    styleVideoBlock = '',
    dialogue = '',
    beatRole = '',
    beatMotion = '',
    generateAudio = false,
    durationSec = 5,
} = {}) {
    const cast = brandTalkCharacter(brand);
    const fit = checkDialogueDuration(dialogue, durationSec);
    const roleHint =
        beatRole === 'hook'
            ? 'HOOK beat — pattern interrupt / confession in first second.'
            : beatRole === 'tension'
              ? 'TENSION beat — cost of chaos; do not resolve yet.'
              : beatRole === 'resolve'
                ? 'RESOLVE beat — relief + soft sell, still speaking sincerely.'
                : '';

    const speechBlock = dialogue
        ? generateAudio
            ? `DIALOGUE (speak clearly, first person, natural pace): "${dialogue}" Lip sync + native speech audio. ${fit.advice}`
            : `Subject is mid-conversation to camera (natural mouth movement). Caption story line: "${dialogue}". Perfect lip-sync not required.`
        : 'Natural talking-head micro-motion; expressive face, not frozen mannequin.';

    const prompt = [
        styleVideoBlock ||
            'Animate as authentic UGC talking-head from a smartphone selfie still.',
        `Same person continuity: ${cast.character}.`,
        speechBlock,
        roleHint,
        beatMotion ? `Beat motion: ${beatMotion}.` : '',
        'Handheld micro-shake only — no steadicam, no cinematic dolly, no orbit.',
        `Pacing: relaxed, unhurried, pauses between thoughts. ${UGC_TECHNICAL_FLAWS.audio}.`,
        `Lighting continuity: available light only — ${UGC_TECHNICAL_FLAWS.light}.`,
        'No text, logos, captions, title cards, or UI burned into the video.',
        `Negatives: frozen face, silent phone-stare hero, fashion polish, ${cast.negativesExtra || ''}.`,
        `Avoid hype words: never describe as cinematic, professional, stunning, 8k, studio, or perfect.`,
    ]
        .filter(Boolean)
        .join(' ');

    return {
        prompt: stripForbiddenHype(prompt),
        dialogueFit: fit,
    };
}

/**
 * Append authenticity stack fragments onto an existing style pack for UGC lanes.
 */
export function ugcAuthenticitySuffix(styleId) {
    if (!isUgcStyle(styleId)) return '';
    return [
        'Authenticity stack: natural skin texture + pores, imperfect phone framing, cool/available light, lived-in background clutter',
        UGC_TECHNICAL_FLAWS.camera,
        UGC_TECHNICAL_FLAWS.light,
        'never airbrushed model skin, never empty stock backgrounds',
    ].join('; ');
}

/**
 * Public catalog for Tools UI / API.
 */
export function listCreativeFormulas() {
    return {
        ugcLayers: [
            { id: 1, name: 'Format header', desc: 'Duration, device, lighting source, camera angle' },
            { id: 2, name: 'Person', desc: 'ICP peer + skin reality cues' },
            { id: 3, name: 'Setting', desc: 'Lived-in environment + clutter' },
            { id: 4, name: 'Product / tool', desc: 'How phone/product enters frame (UI unreadable)' },
            { id: 5, name: 'Script beats', desc: 'Jump-cut dialogue + silent action beats' },
            { id: 6, name: 'Tone', desc: 'Emotion + unhurried pacing cues' },
            { id: 7, name: 'Edit style', desc: 'Multi-take jump-cut feel' },
            { id: 8, name: 'Technical flaws', desc: 'Phone grain, light flaws, mic sound' },
            { id: 9, name: 'Vibe', desc: 'One-line emotional north star' },
        ],
        ugcStyleIds: [...UGC_STYLE_IDS],
        forbiddenHype: FORBIDDEN_HYPE,
        characterAngles: CHARACTER_SHEET_ANGLES.map((a) => ({
            id: a.id,
            file: a.file,
            label: a.label,
        })),
    };
}

/** Character sheet angle pack (subset of Arcads 10 — cost-aware for Grok) */
export const CHARACTER_SHEET_ANGLES = [
    {
        id: 'hero',
        file: '01-hero-front',
        label: 'Hero front',
        prefix: 'Full body front view, head to toe when possible, or medium full portrait.',
        pose: 'Looks directly at camera with a warm, confident peer expression. Relaxed stance. Soft even natural light.',
    },
    {
        id: '3q_left',
        file: '02-3q-left',
        label: '3/4 left',
        prefix: 'Three-quarter view from the left.',
        pose: 'Angled 45° to camera-left, looking toward lens, soft directional light from camera-right.',
    },
    {
        id: '3q_right',
        file: '03-3q-right',
        label: '3/4 right',
        prefix: 'Three-quarter view from the right.',
        pose: 'Angled 45° to camera-right, looking toward lens, soft directional light from camera-left.',
    },
    {
        id: 'profile_left',
        file: '04-profile-left',
        label: 'Profile left',
        prefix: 'Left profile view.',
        pose: 'Full side profile facing camera-left, natural hair fall, soft rim light.',
    },
    {
        id: 'face_closeup',
        file: '05-face-closeup',
        label: 'Face close-up',
        prefix: 'Face close-up, tight crop forehead to chin.',
        pose: 'Every facial detail readable, soft beauty-available light, catchlights in eyes — still natural skin texture.',
    },
    {
        id: 'medium',
        file: '06-medium-portrait',
        label: 'Medium portrait',
        prefix: 'Front-facing medium portrait, waist up.',
        pose: 'Direct eye contact, warm expression, soft even lighting.',
    },
];

export function expandCharacterDescription(plain, brand = getBrand()) {
    const world = inferVisualWorld(brand);
    const cast = brandTalkCharacter(brand);
    const raw = String(plain || '').trim();
    if (!raw) {
        return {
            name: 'peer',
            prompt: stripForbiddenHype(
                `Authentic person representing ICP (${cast.icp}), ${world.characterAge}, ${world.wardrobe}, natural skin with visible texture, ${world.environment}, peer UGC energy not fashion model.`
            ),
            tags: ['cast', cast.domain],
        };
    }

    // Keep user intent; fill photoreal defaults
    const prompt = stripForbiddenHype(
        [
            raw,
            'Photorealistic person, visible skin texture, individual hair strands, natural pores',
            `Wardrobe fits: ${world.wardrobe}`,
            `World/environment cues: ${world.environment}`,
            'Not a fashion model, not airbrushed, no celebrity likeness',
            'Clean soft neutral background for character sheet OR simple real environment — no logos, no text',
        ].join('. ')
    );

    const slugBits = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6);
    const name = slugBits[0] || 'cast';

    return {
        name,
        prompt,
        tags: ['cast', 'character-sheet', cast.domain, ...slugBits.slice(0, 4)],
        folderHint: slugBits.join('-') || 'cast-sheet',
    };
}

export function anglePrompt(basePrompt, angle, continuityLine) {
    const a = angle;
    return stripForbiddenHype(
        [
            a.prefix,
            continuityLine || 'The exact same person as the reference — same face, hair, skin, build, wardrobe.',
            a.pose,
            basePrompt,
            'Photorealistic, natural skin texture, no text, no logos, no watermarks.',
        ].join(' ')
    );
}
