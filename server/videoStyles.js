/**
 * Video style packs — programmable creative direction for stills + motion + graphics.
 *
 * Operators pick a style (or brand default). The pack injects:
 *  - imagePromptBlock / videoPromptBlock into Grok prompts
 *  - camera, lighting, energy language (consistent across beats)
 *  - graphics hints for HyperFrames / title overlays
 *  - optional recommendedVideoModelId (suggestion only — never forced)
 *
 * Quality is a *lane* you pick per pack — not a global studio lock.
 * Tip (any workspace): ultra_ugc + Kling for paid/Meta realism; documentary + Grok for weekly volume.
 */

import {
    isUgcStyle,
    buildUgcVideoPrompt,
    ugcAuthenticitySuffix,
    stripForbiddenHype,
} from './creativeFormulas.js';

/**
 * Platform quality lanes — guidance only (UI / operator playbook).
 * ICP-specific packs (e.g. contractor_talk) still exist; cast/copy come from Brand OS.
 */
export const QUALITY_LANES = {
    contractor_testimonial: {
        id: 'contractor_testimonial',
        label: 'Peer talks (sell + emotion)',
        when: 'Meta/TikTok ads that convert — real peer speaks TO camera, native speech, sell with feeling',
        styleId: 'contractor_talk',
        videoModelId: 'kling',
        altVideoModelId: 'minimax_h3',
        stills: 'Grok Imagine (selfie / talk-to-camera plate)',
        tip: 'Diegetic speech only — never external VO over silent phone-staring. Enable model audio (Kling).',
        deliveryMode: 'caption_talk',
    },
    ultra_real_ugc: {
        id: 'ultra_real_ugc',
        label: 'Ultra-real UGC',
        when: 'Paid social, TikTok/Reels, pain hooks, “feels like a real phone video”',
        styleId: 'ultra_ugc',
        videoModelId: 'kling',
        altVideoModelId: 'seedance_25',
        stills: 'Grok Imagine (style injects amateur phone realism)',
        tip: 'Cool overcast + imperfect framing reads more real than golden-hour beauty ads.',
    },
    documentary_brand: {
        id: 'documentary_brand',
        label: 'Documentary brand',
        when: 'Weekly organic, trust, website-adjacent, calmer brand presence',
        styleId: 'documentary_commercial',
        videoModelId: 'grok',
        altVideoModelId: 'kling',
        stills: 'Grok Imagine',
        tip: 'Premium-but-real; leave space for titles — not raw amateur.',
    },
    product_hero: {
        id: 'product_hero',
        label: 'Product / phone hero',
        when: 'Demo moments, launch creatives, product-in-hand',
        styleId: 'premium_product',
        videoModelId: 'seedance_25',
        altVideoModelId: 'minimax_h3',
        stills: 'Grok + optional reference lock',
        tip: 'Seedance/MiniMax when hands/phone continuity matters across beats.',
    },
    soft_trust: {
        id: 'soft_trust',
        label: 'Soft trust / invite',
        when: 'Founder notes, beta invites, LinkedIn-friendly',
        styleId: 'soft_founder',
        videoModelId: 'grok',
        altVideoModelId: 'kling',
        stills: 'Grok Imagine',
        tip: 'Lower graphics density; human first, not hard-sell UGC.',
    },
};

export const VIDEO_STYLES = {
    /**
     * Contractor SPEAKS on camera — first-person sell + emotion.
     * Diegetic speech via model audio (Kling generate_audio). NO external VO.
     * On-screen captions = what he says (shortened dialogue), not marketing keywords.
     */
    contractor_talk: {
        id: 'contractor_talk',
        label: 'Contractor talks',
        description:
            'Testimonial UGC: same peer talks to camera beat-by-beat. Sells with real emotion — not B-roll + VO. Cast/copy from Brand OS.',
        bestFor: ['pain', 'trust', 'reels', 'paid', 'education'],
        recommendedVideoModelId: 'kling',
        qualityLane: 'contractor_testimonial',
        deliveryMode: 'caption_talk',
        generateAudio: false,
        mixExternalVo: false,
        aspectDefault: '9:16',
        camera:
            'vertical selfie / front camera at arm length or chest height, slight handheld, eyes toward lens, face readable in upper half',
        motion:
            'natural talking-head motion: micro head nods, blinks, subtle hand gesture, phone-held shake — person is SPEAKING not posing',
        lighting:
            'available light on job site or van — overcast driveway or truck cab — real, not studio beauty',
        energy:
            'honest peer-to-peer confession → frustration → relief; sell the feeling of getting control back',
        framing:
            '9:16 medium close-up of contractor face (shoulders up); leave lower 22% clean for dialogue captions; do NOT cover mouth',
        subjectRules:
            'same real-looking solo handyman/GC 30s–50s across beats if possible; work clothes; dust OK; talking expression (not frozen smile); phone optional in hand but face is hero',
        pacing: '4–6s per spoken beat; one clear emotional sentence per beat',
        colorGrade: 'phone-camera natural, slightly cool, authentic UGC — not cinema grade',
        graphics: {
            density: 'medium',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
            faceSafe: true,
        },
        imagePromptBlock: [
            'Ultra-realistic vertical 9:16 smartphone selfie / front-camera still',
            'solo contractor looking toward the camera mid-conversation, about to speak or speaking',
            'medium close-up face and shoulders, authentic work clothes, residential job site or work van background soft',
            'natural expression with slight mouth movement readiness — NOT a frozen stock smile, NOT looking down at phone as hero',
            'raw UGC lighting, cool overcast or cab light, imperfect but face sharp and readable',
            'leave lower fifth of frame relatively clean for dialogue caption overlays later',
        ].join(', '),
        videoPromptBlock: [
            'Animate as authentic UGC talking-head: the contractor SPEAKS directly to camera',
            'clear natural mouth movement and lip motion matching speech, subtle head movement, eye contact with lens',
            'handheld smartphone selfie energy, micro shake only',
            'emotional and sincere — like a real tradesman venting then recommending a fix to a buddy',
            'native dialogue audio if the model supports it',
            'no text, logos, captions, or UI burned into the video',
        ].join('. '),
        negatives: [
            'no silent staring at phone as the main action',
            'no external radio announcer energy',
            'no frozen mannequin face',
            'no cinematic steadicam beauty ad',
            'no readable phone UI',
            'no text or logos in frame',
            'no hard-hat hero poster pose',
        ].join(', '),
    },

    /**
     * Maximum realism — raw smartphone UGC (example direction from operator).
     * Pick when you want “could be a real handyman’s camera roll.”
     */
    ultra_ugc: {
        id: 'ultra_ugc',
        label: 'Ultra-real UGC',
        description:
            'Maximum realism — raw amateur smartphone look. Cool overcast light, imperfect frame, not an ad.',
        bestFor: ['pain', 'reels', 'paid', 'education'],
        recommendedVideoModelId: 'kling',
        qualityLane: 'ultra_real_ugc',
        aspectDefault: '9:16',
        camera:
            'vertical smartphone held at chest/eye height, slight tilt OK, autofocus hunting feel, no tripod, no gimbal',
        motion:
            'raw handheld micro-shake and drift only; occasional soft reframe; no cinematic push-ins or orbit',
        lighting:
            'cool overcast daylight outdoors, flat diffused natural light, no golden hour glow, no studio softboxes, no rim light',
        energy: 'unposed, between-jobs, slightly tired real contractor energy — never model polish',
        framing:
            '9:16 vertical; imperfect amateur crop; subject slightly off-center; room for big captions; phone/tools partially cut by frame OK',
        subjectRules:
            'real solo handyman or small GC, 30s–50s, work clothes with dust/wear, residential driveway/job site/van interior, phone as tool with blank/unreadable screen, no hard-hat hero pose',
        pacing: 'short beats 4–5s; cut on real action; avoid beauty holds',
        colorGrade:
            'phone-camera raw: slightly cool, flat contrast, mild noise/grain OK, no teal-orange cinema grade, no HDR punch',
        deliveryMode: 'caption_talk',
        generateAudio: false,
        mixExternalVo: false,
        graphics: {
            density: 'medium',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
            faceSafe: true,
        },
        imagePromptBlock: [
            'Ultra-realistic vertical smartphone photo, 9:16 aspect ratio',
            'raw amateur UGC talking-to-camera still, contractor face toward lens mid-conversation',
            'filmed outdoors in cool overcast daylight with flat, diffused natural light',
            'authentic owner-operator on residential job site or work van — not staring down at phone as hero',
            'slightly imperfect framing, natural skin texture, real fabric and tool wear',
            'no beauty retouching, no fashion lighting, no stock-photo polish',
            'face readable in upper half; lower fifth relatively clean for dialogue captions later',
        ].join(', '),
        videoPromptBlock: [
            'Animate as raw amateur UGC talking-head from a smartphone',
            'contractor SPEAKS to camera with natural mouth and lip movement, emotional sincerity',
            'subtle handheld shake only — no steadicam, no cinematic dolly',
            'preserve cool overcast light; native speech audio when supported',
            'no color grade shift, no VFX, no text, no logos, no UI overlays',
        ].join('. '),
        negatives: [
            'no cinematic color grade',
            'no golden hour beauty light',
            'no studio softbox look',
            'no perfect symmetry or model posing',
            'no hard-hat cliché stare-into-lens ads',
            'no anamorphic flares',
            'no glossy SaaS product render',
            'no fake UI on phone',
            'no text or logos in frame',
            'no drone, no orbit, no whip pan',
        ].join(', '),
    },

    documentary_commercial: {
        id: 'documentary_commercial',
        label: 'Documentary commercial',
        description:
            'Premium but real — multi-workspace default. Clean lifestyle ads; spoken lines get ASR captions, not keyword title cards.',
        bestFor: ['weekly', 'trust', 'demo'],
        recommendedVideoModelId: 'grok',
        // When plate has speech, storyAssembler ASR + caption_talk brand default burn karaoke.
        deliveryMode: 'caption_talk',
        qualityLane: 'documentary_brand',
        aspectDefault: '9:16',
        camera: 'stable tripod or smooth gimbal, medium shots, intentional push-in',
        motion: 'slow cinematic push-in or gentle parallax; minimal handheld shake',
        lighting: 'natural daylight or golden hour, soft realistic shadows, no neon',
        energy: 'calm, premium, grounded confidence',
        framing:
            'rule of thirds, leave lower-third or side negative space for titles; one hero subject',
        subjectRules:
            'authentic subject matching Brand OS ICP, real environment, phone as a tool (screen unreadable)',
        pacing: 'deliberate; 4–6s per beat; no whip pans',
        colorGrade: 'natural brand-neutral grade; clean neutrals',
        graphics: {
            density: 'medium',
            // word_reveal so script fallback is dialogue karaoke, not "The old way" keywords
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
        },
        imagePromptBlock:
            'Photoreal documentary commercial photograph, authentic field lifestyle, premium but practical, natural skin texture, real job site, shallow depth of field, intentional negative space for text overlay later, clean modern composition, not stock-photo cliché, not amateur phone grain',
        videoPromptBlock:
            'Subtle cinematic commercial motion from the still: slow push-in or gentle parallax only. Natural ambient movement (fabric, light, leaves). Keep faces and hands stable. Premium calm energy. No text, logos, UI, or VFX.',
        negatives:
            'no shaky phone footage, no meme zooms, no hard flash, no sci-fi, no text overlays in-camera, no logo on van, no fake UI on phone',
    },

    ugc_field: {
        id: 'ugc_field',
        label: 'UGC field',
        description: 'Creator-style authenticity — balanced social UGC (less raw than Ultra-real).',
        bestFor: ['pain', 'education', 'reels'],
        recommendedVideoModelId: 'kling',
        qualityLane: 'ultra_real_ugc',
        aspectDefault: '9:16',
        camera: 'slight handheld, eye-level, closer framing, occasional reframe',
        motion: 'subtle handheld drift and micro-shake; keep readable, not chaotic',
        lighting: 'available light only — driveway, garage, truck cab, overcast preferred',
        energy: 'honest, slightly imperfect, “shot between jobs”',
        framing: 'vertical selfie or over-shoulder; face or hands + phone; room for captions',
        subjectRules:
            'solo handyman or small GC mid-workday; dusty tools welcome; real sweat/dirt OK; no fashion styling',
        pacing: 'punchy; 3–5s per beat; cut on action',
        colorGrade: 'phone-camera natural, slightly cool-neutral, not color-graded cinema',
        graphics: {
            density: 'high',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
        },
        imagePromptBlock:
            'Authentic vertical UGC smartphone still, 9:16, phone-shot feel, real contractor on a job site between tasks, casual and unposed, natural available or overcast light, slightly imperfect framing, relatable social-first look, real skin and fabric texture',
        videoPromptBlock:
            'Animate as authentic UGC: subtle handheld camera drift, natural micro-movement, soft ambient life in frame. Not cinematic steadicam. Keep subject recognizable. No text, logos, filters, or effects.',
        negatives:
            'no glossy ad lighting, no perfect studio setup, no model poses, no cinematic anamorphic flares, no text in frame',
    },

    pain_to_cta: {
        id: 'pain_to_cta',
        label: 'Pain → CTA story',
        description: 'Story arc energy: tension in early beats, relief/resolution at the end.',
        bestFor: ['pain', 'before_after', 'paid'],
        recommendedVideoModelId: 'kling',
        qualityLane: 'ultra_real_ugc',
        aspectDefault: '9:16',
        camera: 'start tighter/heavier, open up on resolve; motivated push-ins',
        motion: 'beat 1–2 slightly heavier mood; final beat calmer and brighter motion',
        lighting: 'early beats cooler/dimmer (end of day, cab light); final beat cleaner daylight',
        energy: 'problem recognition → breath of relief',
        framing: 'tight on friction (phone chaos, papers); open on resolve (clean phone moment)',
        subjectRules: 'same type of contractor across beats; continuity of wardrobe when possible',
        pacing: '3 beats: hook tension → deepen → resolve + CTA space',
        colorGrade: 'subtle cool→warm progression across the arc',
        graphics: {
            density: 'high',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
        },
        imagePromptBlock:
            'Narrative commercial still for a problem-solution arc: clear emotional beat, documentary realism, leave space for headline overlay, contractor-native environment',
        videoPromptBlock:
            'Story-driven motion matched to the emotional beat: early beats slower heavier push, resolve beat softer brighter motion. Natural only. No text or logos in frame.',
        negatives:
            'no comedy meme timing, no horror lighting, no rapid crash zooms, no text baked into image',
    },

    premium_product: {
        id: 'premium_product',
        label: 'Premium product',
        description: 'Phone-as-hero product moments — estimates, invoices, “from the field.”',
        bestFor: ['demo', 'trust'],
        recommendedVideoModelId: 'seedance_25',
        qualityLane: 'product_hero',
        aspectDefault: '9:16',
        camera: 'controlled product framing, over-shoulder or table-top + hands',
        motion: 'slow orbit or drift around phone/hands; crisp and premium',
        lighting: 'soft key + clean highlights on phone edge; realistic outdoor/indoor mix',
        energy: 'confident product demo without SaaS gloss overload',
        framing: 'phone prominent but screen unreadable/blank; tools or job site bokeh behind',
        subjectRules: 'hands of working contractor; no fake detailed UI; no brand wordmarks in scene',
        pacing: 'smooth 5–6s holds; demo clarity over chaos',
        colorGrade: 'clean commercial with brand-violet ambient reflection optional, subtle',
        graphics: {
            density: 'medium',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
        },
        imagePromptBlock:
            'Premium product lifestyle photograph, contractor hands using smartphone on site, screen blank or unreadable, soft bokeh job-site background, commercial polish without fashion editorial feel',
        videoPromptBlock:
            'Premium product motion: slow controlled drift or gentle orbit around the phone and hands. Stable, sharp, commercial. No text, UI overlays, or logo reveals.',
        negatives:
            'no readable app UI, no fake screenshots, no floating 3D phones, no neon tech grids, no text',
    },

    soft_founder: {
        id: 'soft_founder',
        label: 'Soft founder / trust',
        description: 'Quiet confidence for beta invite and trust posts — less hype, more human.',
        bestFor: ['trust', 'beta'],
        recommendedVideoModelId: 'grok',
        qualityLane: 'soft_trust',
        aspectDefault: '9:16',
        camera: 'gentle medium portraits and environmental portraits',
        motion: 'very slow push-in; breathing room; almost still',
        lighting: 'sunrise/golden hour or soft overcast; flattering natural light',
        energy: 'warm, honest, invite-not-hard-sell',
        framing: 'space for soft headline; contractor looking slightly off-camera or at phone calmly',
        subjectRules: 'approachable owner-operator; no hard-hat cliché stare-into-lens ads',
        pacing: 'unhurried; long holds',
        colorGrade: 'warm natural filmic, low contrast',
        graphics: {
            density: 'low',
            titleStyle: 'word_reveal',
            endCard: true,
            captionStyle: 'karaoke_bottom',
            motionText: 'word_highlight',
        },
        imagePromptBlock:
            'Warm documentary portrait of a contractor in a calm moment, natural golden or soft light, human and trustworthy, premium quiet commercial still',
        videoPromptBlock:
            'Very subtle motion only: slow breathing push-in, soft ambient life. Intimate and calm. No text or logos.',
        negatives: 'no aggressive sales energy, no crowded sites, no text, no logos, no heavy grade',
    },
};

export function listVideoStyles() {
    return Object.values(VIDEO_STYLES).map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        bestFor: s.bestFor,
        energy: s.energy,
        graphics: s.graphics,
        pacing: s.pacing,
        recommendedVideoModelId: s.recommendedVideoModelId || null,
        qualityLane: s.qualityLane || null,
    }));
}

export function listQualityLanes() {
    return Object.values(QUALITY_LANES);
}

export function getVideoStyle(styleId) {
    if (styleId && VIDEO_STYLES[styleId]) return VIDEO_STYLES[styleId];
    return VIDEO_STYLES.documentary_commercial;
}

/** Human-readable director brief (UI + debugging) */
export function styleDirectorBrief(styleId) {
    const s = getVideoStyle(styleId);
    return [
        `Style: ${s.label}`,
        `Camera: ${s.camera}`,
        `Motion: ${s.motion}`,
        `Lighting: ${s.lighting}`,
        `Energy: ${s.energy}`,
        `Framing: ${s.framing}`,
        `Subject: ${s.subjectRules}`,
        `Pacing: ${s.pacing}`,
        `Grade: ${s.colorGrade}`,
        s.recommendedVideoModelId
            ? `Suggested model: ${s.recommendedVideoModelId} (optional)`
            : '',
        `Graphics: density ${s.graphics.density}, titles ${s.graphics.titleStyle}, end card ${s.graphics.endCard}`,
    ]
        .filter(Boolean)
        .join('\n');
}

/**
 * Build still prompt fragments from a style pack.
 */
export function styleImageFragments(styleId) {
    const s = getVideoStyle(styleId);
    return {
        styleBlock: s.imagePromptBlock,
        camera: s.camera,
        lighting: s.lighting,
        framing: s.framing,
        subjectRules: s.subjectRules,
        colorGrade: s.colorGrade,
        negatives: s.negatives,
    };
}

/**
 * Build motion prompt from style + optional beat-level motion.
 * UGC styles with dialogue get the full authenticity / speech stack.
 */
export function buildStyledVideoPrompt({
    styleId,
    beatMotion,
    beatRole,
    dialogue,
    generateAudio = false,
    durationSec = 5,
    brand = null,
} = {}) {
    const s = getVideoStyle(styleId);
    const roleHint =
        beatRole === 'hook'
            ? 'This is the HOOK beat — establish tension or curiosity in the first second.'
            : beatRole === 'tension'
              ? 'This is the TENSION / build beat — deepen the problem without resolving it.'
              : beatRole === 'resolve'
                ? 'This is the RESOLVE beat — calmer, clearer, room for CTA energy.'
                : '';

    if (isUgcStyle(styleId) && (dialogue || generateAudio)) {
        const { prompt } = buildUgcVideoPrompt({
            brand: brand || undefined,
            styleVideoBlock: s.videoPromptBlock,
            dialogue,
            beatRole,
            beatMotion,
            generateAudio,
            durationSec,
        });
        return prompt;
    }

    const auth = ugcAuthenticitySuffix(styleId);
    return stripForbiddenHype(
        [
            s.videoPromptBlock,
            beatMotion ? `Beat-specific motion: ${beatMotion}.` : '',
            roleHint,
            `Camera language: ${s.camera}.`,
            `Lighting continuity: ${s.lighting}.`,
            `Energy: ${s.energy}.`,
            auth ? `Authenticity: ${auth}.` : '',
            `Strict negatives: ${s.negatives}. No text, no logos, no title cards in the generated video.`,
            'Avoid empty hype: never rely on cinematic, professional, stunning, 8k, studio, perfect.',
        ]
            .filter(Boolean)
            .join(' ')
    );
}
