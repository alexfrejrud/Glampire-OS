/**
 * Storytelling layer for story reels.
 *
 * Problem we solve:
 *  Great plate footage of "guy looking at phone" still dies without a spoken story.
 *  Reels need a peer talking TO the viewer — hook → pain → payoff — on captions + VO.
 *
 * voiceLine  = what is SAID (first person / direct address)
 * title      = short on-screen punch (can match or compress voiceLine)
 * caption    = platform post caption (longer)
 */

/** Short on-screen punch from a spoken line (avoid importing flows — circular risk). */
function shortTitle(text, maxLen = 46) {
    let t = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!t) return t;
    // Prefer first sentence / clause
    const sentence = t.split(/(?<=[.!?])\s+/)[0] || t;
    t = sentence.length <= maxLen + 8 ? sentence : t;
    if (t.length > maxLen) {
        const cut = t.slice(0, maxLen + 1);
        const at = cut.lastIndexOf(' ');
        t = (at > 16 ? cut.slice(0, at) : cut.slice(0, maxLen)).trim().replace(/[,:;]+$/, '');
        if (!/[.!?…]$/.test(t)) t += '…';
    }
    return t;
}

/** Rough VO timing so lines fit beat windows (~2.6 wps comfortable). */
export function estimateVoiceSec(text) {
    const words = String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
    if (!words) return 0;
    return Math.min(12, Math.max(1.4, words / 2.55 + 0.35));
}

/**
 * Role-aware spoken defaults if idea has no voice lines.
 * Direct address, contractor peer tone — not brochure.
 */
function defaultVoiceForRole(role, idea = {}) {
    const cta = idea.cta || 'Join the Beta';
    if (role === 'hook') {
        return (
            idea.voiceHook ||
            idea.hookLine ||
            'Be honest — where do your customer notes live right now?'
        );
    }
    if (role === 'tension') {
        return (
            idea.voiceTension ||
            idea.tensionLine ||
            'Texts. Sticky notes. Your head. Then you invoice at midnight.'
        );
    }
    if (role === 'resolve') {
        return (
            idea.voiceResolve ||
            idea.resolveLine ||
            `One phone for customers, jobs, estimates, invoices. ${cta}.`
        );
    }
    return idea.hookLine || idea.headline || 'Run the business from your phone.';
}

/**
 * Normalize a spoken line: conversational, not marketing deck.
 */
export function polishVoiceLine(text, { maxLen = 110 } = {}) {
    let t = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!t) return t;
    // Kill corporate openers
    t = t
        .replace(/^(introducing|welcome to|meet|discover)\s+/i, '')
        .replace(/\btaskiz\s+is\s+a\s+simple\s+mobile\s+app\b/gi, 'this app')
        .trim();
    if (t.length > maxLen) {
        const cut = t.slice(0, maxLen + 1);
        const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('.'), cut.lastIndexOf(','));
        t = (at > 24 ? cut.slice(0, at) : cut.slice(0, maxLen)).trim().replace(/[,:;]+$/, '');
        if (!/[.!?]$/.test(t)) t += '.';
    }
    return t;
}

/**
 * Attach storytelling fields to expanded beats.
 * Prefer on-beat dialogue first (never lose caption source text).
 * Fallbacks: voiceLine → spokenCaption → idea.dialogue* → role defaults.
 */
export function attachStoryVoice(beats, idea = {}) {
    const roleVoice = {
        hook: polishVoiceLine(
            idea.dialogueHook ||
                idea.voiceHook ||
                defaultVoiceForRole('hook', idea)
        ),
        tension: polishVoiceLine(
            idea.dialogueTension ||
                idea.voiceTension ||
                defaultVoiceForRole('tension', idea)
        ),
        resolve: polishVoiceLine(
            idea.dialogueResolve ||
                idea.voiceResolve ||
                defaultVoiceForRole('resolve', idea)
        ),
    };

    return (beats || []).map((beat) => {
        const role = beat.role || 'hook';
        // Dialogue is the caption source of truth — do not polish away words.
        const raw =
            beat.dialogue ||
            beat.voiceLine ||
            beat.spokenCaption ||
            roleVoice[role] ||
            roleVoice.hook;
        const dialogue = String(raw || '')
            .replace(/\s+/g, ' ')
            .trim();
        // voiceLine may still get light polish for TTS, but keep dialogue intact
        const voiceLine = polishVoiceLine(dialogue, { maxLen: 160 });
        const title = shortTitle(
            beat.title || beat.keyword || dialogue,
            role === 'hook' ? 48 : 44
        );
        return {
            ...beat,
            dialogue,
            voiceLine,
            title,
            spokenCaption: dialogue,
            voiceSec: estimateVoiceSec(dialogue),
        };
    });
}

/**
 * Full story script object for UI / VO / assemble.
 */
export function buildStoryScript(item) {
    const beats = attachStoryVoice(item.beats || [], item);
    const fullNarration = beats
        .map((b) => b.voiceLine)
        .filter(Boolean)
        .join(' ');
    return {
        beats,
        fullNarration,
        cta: item.cta || 'Join the Beta',
        style: 'peer_ugc', // direct address, not announcer
        estimatedVoSec: beats.reduce((s, b) => s + (b.voiceSec || 0), 0),
    };
}
