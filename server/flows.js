/**
 * Story flow recipes — multi-beat structures for reels.
 * Each flow defines beat roles + default durations + default style affinity.
 * Dialogue + cast defaults pull from active Brand OS (never hardcode Taskiz).
 */

import { getBrand } from './brandLoader.js';
import { brandDefaultBeatSubjects, brandTalkCharacter } from './brandCast.js';

export const FLOWS = {
    single_moment: {
        id: 'single_moment',
        label: 'Single moment',
        description: 'One still → one short motion clip. Fast draft.',
        beatCount: 1,
        defaultStyleId: 'documentary_commercial',
        defaultDurationSec: 6,
        beats: [
            {
                role: 'hook',
                label: 'Moment',
                durationSec: 6,
                titleFrom: 'headline',
                captionFrom: 'body',
            },
        ],
    },

    pain_to_cta: {
        id: 'pain_to_cta',
        label: 'Pain → CTA',
        description: 'Hook pain → deepen → resolve with CTA. Best story ROI.',
        beatCount: 3,
        defaultStyleId: 'pain_to_cta',
        defaultDurationSec: 5,
        beats: [
            {
                role: 'hook',
                label: 'Hook',
                durationSec: 5,
                titleFrom: 'headline',
                captionFrom: 'hookLine',
                motionHint: 'heavier mood push-in on the friction moment',
            },
            {
                role: 'tension',
                label: 'Build',
                durationSec: 5,
                titleFrom: 'tensionLine',
                captionFrom: 'tensionLine',
                motionHint: 'slightly tighter framing energy, still natural',
            },
            {
                role: 'resolve',
                label: 'Resolve + CTA',
                durationSec: 6,
                titleFrom: 'resolveLine',
                captionFrom: 'cta',
                motionHint: 'calmer brighter motion, leave headroom for end card',
                endCard: true,
            },
        ],
    },

    ugc_field: {
        id: 'ugc_field',
        label: 'UGC field story',
        description: 'Creator-native 3-beat field story for Reels/TikTok.',
        beatCount: 3,
        defaultStyleId: 'ugc_field',
        defaultDurationSec: 4,
        beats: [
            {
                role: 'hook',
                label: 'Hook',
                durationSec: 4,
                titleFrom: 'headline',
                captionFrom: 'hookLine',
                motionHint: 'handheld UGC drift, fast recognition of the problem',
            },
            {
                role: 'tension',
                label: 'Proof / day-in-life',
                durationSec: 5,
                titleFrom: 'tensionLine',
                captionFrom: 'tensionLine',
                motionHint: 'between-jobs energy, authentic movement',
            },
            {
                role: 'resolve',
                label: 'Soft CTA',
                durationSec: 5,
                titleFrom: 'resolveLine',
                captionFrom: 'cta',
                motionHint: 'steady enough for bold caption + CTA',
                endCard: true,
            },
        ],
    },

    demo_loop: {
        id: 'demo_loop',
        label: 'Demo loop',
        description: 'Field action → phone moment → done / paid energy.',
        beatCount: 3,
        defaultStyleId: 'premium_product',
        defaultDurationSec: 5,
        beats: [
            {
                role: 'hook',
                label: 'On the job',
                durationSec: 5,
                titleFrom: 'headline',
                captionFrom: 'hookLine',
                motionHint: 'job-site context establish',
            },
            {
                role: 'tension',
                label: 'On the phone',
                durationSec: 5,
                titleFrom: 'tensionLine',
                captionFrom: 'tensionLine',
                motionHint: 'product/hands focus, controlled motion',
            },
            {
                role: 'resolve',
                label: 'Done',
                durationSec: 5,
                titleFrom: 'resolveLine',
                captionFrom: 'cta',
                motionHint: 'closing van / leave-site calm resolve',
                endCard: true,
            },
        ],
    },

    /**
     * Contractor speaks to camera — first-person sell + emotion.
     * Dialogue goes into I2V prompt; model audio is native (no external VO).
     */
    testimonial_talk: {
        id: 'testimonial_talk',
        label: 'Contractor talks (sell)',
        description:
            'Same contractor talks to camera: pain → cost → relief + sell. Cheap path = Grok + captions; native speech = hero Kling only.',
        beatCount: 3,
        defaultStyleId: 'contractor_talk',
        defaultDurationSec: 4,
        /** caption_talk by default — diegetic audio is opt-in (expensive) */
        deliveryMode: 'caption_talk',
        generateAudio: false,
        mixExternalVo: false,
        beats: [
            {
                role: 'hook',
                label: 'Confession',
                durationSec: 4,
                titleFrom: 'hookLine',
                captionFrom: 'hookLine',
                keywordFrom: 'hookKeyword',
                motionHint:
                    'talking to camera, emotional open, slight nod, sincere eye contact, speaking motion',
            },
            {
                role: 'tension',
                label: 'The cost',
                durationSec: 4,
                titleFrom: 'tensionLine',
                captionFrom: 'tensionLine',
                keywordFrom: 'tensionKeyword',
                motionHint:
                    'still talking to camera, frustration / weight in face, small hand gesture, speaking motion',
            },
            {
                role: 'resolve',
                label: 'Relief + sell',
                durationSec: 5,
                titleFrom: 'resolveLine',
                captionFrom: 'resolveLine',
                keywordFrom: 'resolveKeyword',
                motionHint:
                    'calmer relieved energy while still speaking to camera, soft smile possible, recommend fix',
                endCard: true,
            },
        ],
    },
};

export function listFlows() {
    return Object.values(FLOWS).map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        beatCount: f.beatCount,
        defaultStyleId: f.defaultStyleId,
    }));
}

export function getFlow(flowId) {
    if (flowId && FLOWS[flowId]) return FLOWS[flowId];
    return FLOWS.pain_to_cta;
}

/**
 * Pick a flow for a reel idea when none specified.
 */
export function inferFlowId(idea) {
    if (idea.flowId && FLOWS[idea.flowId]) return idea.flowId;
    // Selling reels → contractor talks (emotion via captions / optional speech)
    if (idea.format === 'reel') {
        if (idea.pillar === 'demo') return 'demo_loop';
        return 'testimonial_talk';
    }
    if (idea.pillar === 'demo') return 'demo_loop';
    if (idea.pillar === 'pain' || idea.pillar === 'before_after') return 'pain_to_cta';
    if (idea.pillar === 'education') return 'testimonial_talk';
    if (idea.pillar === 'trust') return 'testimonial_talk';
    return 'testimonial_talk';
}

/**
 * Social overlay titles: short, specific, scroll-stopping.
 * Prefer explicit hook/tension/resolve lines over brochure headlines.
 */
export function socialTitle(text, { maxLen = 48, role = 'hook' } = {}) {
    let t = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!t) return roleDefaults(role);

    // Drop soft marketing openers
    t = t
        .replace(/^(a simple app for|introducing|welcome to|meet)\s+/i, '')
        .replace(/\s*[—–-]\s*taskiz\.?$/i, '')
        .trim();

    // Prefer first clause if long
    if (t.length > maxLen) {
        const cut = t.slice(0, maxLen + 1);
        const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('…'), cut.lastIndexOf('.'));
        t = (at > 18 ? cut.slice(0, at) : cut.slice(0, maxLen)).trim();
        t = t.replace(/[,:;]+$/, '') + (t.endsWith('?') || t.endsWith('!') ? '' : '');
        if (!/[.!?…]$/.test(t) && t.length >= maxLen - 2) t = `${t}…`;
    }

    // Title-case only if all-lowercase brochure line; keep natural case otherwise
    return t;
}

function roleDefaults(role) {
    if (role === 'tension') return 'The admin still waits until tonight.';
    if (role === 'resolve') return 'One phone. Whole business.';
    return 'Still running the business from texts?';
}

/**
 * Expand a reel idea into concrete beats with first-person peer dialogue.
 * Defaults are Brand OS–aware (ICP + brand name) — Taskiz only if that workspace is active
 * and the idea still carries Taskiz-specific dialogue.
 */
export function expandBeats(idea, { flowId, styleId } = {}) {
    const brand = getBrand();
    const flow = getFlow(flowId || inferFlowId(idea));
    const style = styleId || idea.styleId || flow.defaultStyleId || brand.defaultVideoStyleId;

    const seedBeats = Array.isArray(idea.beats) && idea.beats.length ? idea.beats : null;
    const cta = idea.cta || brand.primaryCta || brand.ctas?.[0] || 'Learn more';
    const name = brand.name || 'this';
    const one = brand.oneLiner || brand.promise || '';
    const icp = (brand.icp?.primary || [])[0] || 'people like me';

    // First-person monologue — brand-native fallbacks (not Taskiz)
    const dialogueHook =
        idea.dialogueHook ||
        idea.voiceHook ||
        idea.hookLine ||
        `I kept doing it the hard way. ${icp ? `As ${icp.toLowerCase()}, ` : ''}it was messy.`;
    const dialogueTension =
        idea.dialogueTension ||
        idea.voiceTension ||
        idea.tensionLine ||
        "I was losing time and opportunities I couldn't get back.";
    const dialogueResolve =
        idea.dialogueResolve ||
        idea.voiceResolve ||
        idea.resolveLine ||
        (one ? `${one} ${cta}.` : `${name} changed that for me. ${cta}.`);

    const hookKeyword = idea.hookKeyword || shortKeyword(dialogueHook, 'The old way');
    const tensionKeyword =
        idea.tensionKeyword || shortKeyword(dialogueTension, 'The cost');
    const resolveKeyword =
        idea.resolveKeyword || shortKeyword(dialogueResolve, name.slice(0, 20) || 'Better path');

    const hookLine = socialTitle(idea.hookLine || hookKeyword, { maxLen: 36, role: 'hook' });
    const tensionLine = socialTitle(idea.tensionLine || tensionKeyword, {
        maxLen: 34,
        role: 'tension',
    });
    const resolveLine = socialTitle(idea.resolveLine || resolveKeyword, {
        maxLen: 32,
        role: 'resolve',
    });

    const dialogueByRole = {
        hook: dialogueHook,
        tension: dialogueTension,
        resolve: dialogueResolve,
    };
    const keywordByRole = {
        hook: hookKeyword,
        tension: tensionKeyword,
        resolve: resolveKeyword,
    };
    const titleByKey = {
        headline: hookLine,
        body: tensionLine,
        hookLine,
        tensionLine,
        resolveLine,
        cta,
    };

    // caption_talk = cheap (Grok + keywords). diegetic_talk = native speech $ (opt-in)
    const deliveryMode =
        idea.deliveryMode ||
        flow.deliveryMode ||
        brand.defaultDeliveryMode ||
        'caption_talk';

    const defaultSubjects = defaultSubjectsForIdea(idea, deliveryMode, brand);

    const beats = flow.beats.map((tpl, idx) => {
        const seeded = seedBeats?.[idx] || {};
        const titleKey = tpl.titleFrom;
        const role = tpl.role || 'hook';
        const dialogue = String(
            seeded.dialogue || seeded.voiceLine || dialogueByRole[role] || dialogueHook
        )
            .replace(/\s+/g, ' ')
            .trim();
        const keyword = String(
            seeded.keyword || keywordByRole[role] || titleByKey[titleKey] || hookKeyword
        )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 28);
        // Prefer per-beat motions (batch variety) over a single idea-wide push-in
        const beatMotionList = Array.isArray(idea.beatMotions) ? idea.beatMotions : null;
        const videoMotion =
            seeded.videoMotion ||
            beatMotionList?.[idx] ||
            tpl.motionHint ||
            idea.videoMotion ||
            null;

        return {
            id: seeded.id || `beat-${idx + 1}`,
            index: idx,
            role,
            label: tpl.label,
            durationSec: seeded.durationSec || tpl.durationSec || flow.defaultDurationSec,
            dialogue,
            voiceLine: dialogue,
            spokenCaption: dialogue,
            keyword,
            title: socialTitle(keyword || titleByKey[titleKey] || hookLine, {
                maxLen: 28,
                role,
            }),
            caption: seeded.caption || idea.caption || dialogue,
            imageSubject: seeded.imageSubject || defaultSubjects[idx] || idea.imageSubject,
            videoMotion,
            endCard: Boolean(tpl.endCard),
            imageUrl: seeded.imageUrl || null,
            videoUrl: seeded.videoUrl || null,
            imagePrompt: null,
            videoPrompt: null,
            status: seeded.imageUrl ? 'ready' : 'idea',
            error: null,
        };
    });

    return {
        flowId: flow.id,
        flowLabel: flow.label,
        styleId: style,
        deliveryMode,
        generateAudio: deliveryMode === 'diegetic_talk' && idea.generateAudio === true,
        mixExternalVo: false,
        beats,
        storyScript: {
            dialogueHook,
            dialogueTension,
            dialogueResolve,
            fullNarration: [dialogueHook, dialogueTension, dialogueResolve].join(' '),
            deliveryMode,
        },
    };
}

/** 2–4 word emotional keyword for face-safe overlay */
function shortKeyword(dialogue, fallback) {
    const t = String(dialogue || '').trim();
    if (!t) return fallback;
    if (t.length <= 26 && !/[.!?].+/.test(t)) return t.replace(/[.!?]+$/, '');
    const first = t.split(/[.!?]/)[0] || t;
    const words = first.replace(/["""']/g, '').split(/\s+/).filter(Boolean);
    if (words.length <= 4) return words.join(' ');
    return words.slice(0, 4).join(' ').replace(/[,;:]+$/, '');
}

function defaultSubjectsForIdea(idea, deliveryMode = 'caption_talk', brand = getBrand()) {
    return brandDefaultBeatSubjects(brand, idea, deliveryMode);
}
