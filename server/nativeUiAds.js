/**
 * Native UI static ad templates — model paints type/UI (exception to Brand OS compose).
 * Inspired by arcads image-ad library; runs on Grok Imagine with our keys only.
 *
 * Use when the creative IS the UI chrome (Notes, search, chat, comparison).
 * Do NOT use for branded photo ads — those stay plate + adCompose.
 */

import { generateImage, hasGrokKey } from './grok.js';
import { getBrand } from './brandLoader.js';
import { logGeneration } from './genAudit.js';

/** Always-on safety suffixes (from Arcads playbook, adapted) */
export const SAFETY = {
    noChrome:
        'Standalone ad creative only — no iOS status bar, no Sponsored badge, no like/comment/share row, no story chrome, no tab bars, no feed chrome.',
    safeZone: 'Keep all text and focal subjects inside the central 84% of the canvas; nothing critical near edges.',
    glyphSafety:
        'No emoji in body text blocks. No random unicode glyphs. Exact counts of list/chat items as specified.',
};

/**
 * High-value subset of native UI formats for Meta/TikTok static tests.
 * Variables use {name} placeholders filled from Brand OS + operator overrides.
 */
export const NATIVE_UI_TEMPLATES = [
    {
        id: 'apple_notes',
        label: 'Apple Notes list',
        modelLane: 'ui_type',
        aspectDefault: '1:1',
        when: 'Simple checklist pain → product benefit list',
        variables: ['brand.name', 'headline', 'bullets', 'cta'],
        prompt: `Photoreal top-down photo of an iPhone Notes app screen on a real wooden desk, slight phone shadow, natural window light.
The Notes title is "{headline}".
Body is a clean bullet list:
{bullets}
Last line is a subtle CTA: "{cta}"
App looks like real iOS Notes (yellow accent, SF-like sans). Brand name "{brand.name}" may appear once in the note footer.
No browser chrome, no Instagram UI. {SAFE}`,
    },
    {
        id: 'fake_google',
        label: 'Fake Google search',
        modelLane: 'ui_type',
        aspectDefault: '1:1',
        when: 'Search intent / comparison framing',
        variables: ['brand.name', 'query', 'result_title', 'result_snippet', 'cta'],
        prompt: `Clean UI mock of a mobile Google search results page, white background, authentic blue link styling.
Search query bar shows: "{query}"
Top organic result title: "{result_title}"
Snippet: "{result_snippet}"
Small brand chip: "{brand.name}" — "{cta}"
No real Google logo trademark lockups if avoidable; generic search UI is OK. No feed chrome. {SAFE}`,
    },
    {
        id: 'imessage',
        label: 'iMessage thread',
        modelLane: 'ui_type',
        aspectDefault: '9:16',
        when: 'Peer recommendation social proof',
        variables: ['brand.name', 'line1', 'line2', 'line3', 'cta'],
        prompt: `Vertical iMessage conversation UI on iPhone, light mode, authentic bubble layout.
Messages:
1 (gray received): "{line1}"
2 (blue sent): "{line2}"
3 (gray received): "{line3}"
Optional last blue: "{cta}" — mention "{brand.name}" once max.
No status bar spam, no contact photo faces that look celebrity. {SAFE}`,
    },
    {
        id: 'comparison_table',
        label: 'Comparison table',
        modelLane: 'ui_type',
        aspectDefault: '1:1',
        when: 'Us vs old way / vs chaos',
        variables: ['brand.name', 'headline', 'left_title', 'right_title', 'left_items', 'right_items', 'cta'],
        prompt: `Clean modern comparison graphic, soft paper texture background, not a screenshot of a website.
Headline: "{headline}"
Two columns: "{left_title}" vs "{right_title}" (right is "{brand.name}").
Left bullets (muted red X marks): {left_items}
Right bullets (green checks): {right_items}
Footer CTA button style: "{cta}"
Crisp typography, high legibility. {SAFE}`,
    },
    {
        id: 'sticky_flatlay',
        label: 'Sticky notes flatlay',
        modelLane: 'photo_type',
        aspectDefault: '1:1',
        when: 'Handwritten pain / messy ops',
        variables: ['brand.name', 'note1', 'note2', 'note3', 'cta'],
        prompt: `Overhead photoreal flatlay: desk with tools/phone, three physical sticky notes with readable handwriting.
Note 1: "{note1}"
Note 2: "{note2}"
Note 3: "{note3}"
Small typed label or stamp: "{brand.name}" — "{cta}"
Real paper texture, natural shadow, no fake UI. {SAFE}`,
    },
    {
        id: 'reddit_style',
        label: 'Forum post card',
        modelLane: 'ui_type',
        aspectDefault: '4:5',
        when: 'Confession / community voice',
        variables: ['brand.name', 'username', 'title', 'body', 'cta'],
        prompt: `Mobile forum/post card UI (Reddit-like, generic — not exact trademark clone), white card on subtle gray.
Username: u/{username}
Post title: "{title}"
Body: "{body}"
Comment teaser mentions trying "{brand.name}". Soft CTA: "{cta}"
{SAFE}`,
    },
    {
        id: 'chatgpt_thread',
        label: 'AI chat thread',
        modelLane: 'ui_type',
        aspectDefault: '1:1',
        when: 'Explain pain → recommend product',
        variables: ['brand.name', 'user_q', 'assistant_a', 'cta'],
        prompt: `Clean ChatGPT-style conversation UI (generic AI chat, not exact OpenAI branding).
User bubble: "{user_q}"
Assistant bubble: "{assistant_a}" ending with try {brand.name}.
Subtle CTA line: "{cta}"
{SAFE}`,
    },
    {
        id: 'before_after_split',
        label: 'Before / after split',
        modelLane: 'photo_type',
        aspectDefault: '1:1',
        when: 'Chaos → control visual',
        variables: ['brand.name', 'before_label', 'after_label', 'before_scene', 'after_scene', 'cta'],
        prompt: `Vertical split composite photograph, left BEFORE / right AFTER.
Left labeled "{before_label}": {before_scene}
Right labeled "{after_label}": {after_scene}
Thin center divider. Small brand word "{brand.name}" bottom center + "{cta}".
Photoreal, authentic environments. {SAFE}`,
    },
    {
        id: 'receipt_list',
        label: 'Receipt / invoice irony',
        modelLane: 'ui_type',
        aspectDefault: '4:5',
        when: 'Cost of chaos / money pain',
        variables: ['brand.name', 'headline', 'line_items', 'total', 'cta'],
        prompt: `Photoreal paper receipt on dark desk, thermal print look.
Header: "{headline}"
Line items: {line_items}
Total: {total}
Footer stamp: switch to {brand.name} — {cta}
{SAFE}`,
    },
    {
        id: 'calendar_blocked',
        label: 'Calendar chaos',
        modelLane: 'ui_type',
        aspectDefault: '1:1',
        when: 'Time / schedule pain',
        variables: ['brand.name', 'headline', 'events', 'cta'],
        prompt: `Mobile calendar week UI mock, authentic density.
Title: "{headline}"
Events: {events}
One clean event or banner: {brand.name} — {cta}
{SAFE}`,
    },
    {
        id: 'whiteboard_sign',
        label: 'Handheld whiteboard',
        modelLane: 'photo_type',
        aspectDefault: '1:1',
        when: 'UGC testimonial still',
        variables: ['brand.name', 'sign_text', 'person_desc', 'cta'],
        prompt: `Photoreal UGC photo: {person_desc} holding a small whiteboard with handwritten text "{sign_text}".
Natural skin texture, available light, peer energy.
Tiny caption space bottom: {brand.name} · {cta}
No logos on clothing. {SAFE}`,
    },
    {
        id: 'founder_letter',
        label: 'Founder letter',
        modelLane: 'ui_type',
        aspectDefault: '4:5',
        when: 'Trust / beta invite soft sell',
        variables: ['brand.name', 'salutation', 'body', 'signoff', 'cta'],
        prompt: `Editorial letter on warm paper texture, serif body type, generous margins.
"{salutation}"
{body}
— {signoff}, {brand.name}
CTA line: {cta}
{SAFE}`,
    },
];

function fillTemplate(str, vars = {}) {
    return String(str || '').replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key) => {
        if (key === 'SAFE') {
            return [SAFETY.noChrome, SAFETY.safeZone, SAFETY.glyphSafety].join(' ');
        }
        const v = vars[key];
        return v != null && String(v).trim() ? String(v) : `{${key}}`;
    });
}

export function listNativeUiTemplates() {
    return NATIVE_UI_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        modelLane: t.modelLane,
        aspectDefault: t.aspectDefault,
        when: t.when,
        variables: t.variables,
    }));
}

export function getNativeUiTemplate(id) {
    return NATIVE_UI_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Fill defaults from Brand OS + operator overrides.
 */
export function resolveNativeUiVars(templateId, overrides = {}, brand = getBrand()) {
    const t = getNativeUiTemplate(templateId);
    if (!t) return {};
    const name = brand.name || 'Brand';
    const cta = overrides.cta || brand.ctas?.[0] || 'Learn more';
    const pain = brand.painPoints?.[0] || brand.promise || 'the old way is chaos';
    const defaults = {
        'brand.name': name,
        headline: overrides.headline || brand.oneLiner || name,
        bullets: overrides.bullets || `• Stop the chaos\n• Run jobs from your phone\n• ${cta}`,
        cta,
        query: overrides.query || `best app for ${brand.category || 'my business'}`,
        result_title: overrides.result_title || `${name} — ${brand.oneLiner || 'the simple fix'}`,
        result_snippet: overrides.result_snippet || brand.supporting || brand.promise || '',
        line1: overrides.line1 || `bro how do you keep track of jobs`,
        line2: overrides.line2 || `switched to ${name}`,
        line3: overrides.line3 || `wait it's actually good?`,
        left_title: overrides.left_title || 'Old way',
        right_title: overrides.right_title || name,
        left_items: overrides.left_items || pain,
        right_items: overrides.right_items || brand.promise || 'One place that works',
        note1: overrides.note1 || 'call back???',
        note2: overrides.note2 || 'invoice??',
        note3: overrides.note3 || `try ${name}`,
        username: overrides.username || 'field_ops',
        title: overrides.title || `Anyone else drowning in ${pain}?`,
        body: overrides.body || brand.supporting || '',
        user_q: overrides.user_q || `How do I fix ${pain}?`,
        assistant_a: overrides.assistant_a || `Try ${name}: ${brand.oneLiner || brand.promise || ''}`,
        before_label: overrides.before_label || 'Before',
        after_label: overrides.after_label || 'After',
        before_scene: overrides.before_scene || 'messy notes, stressed peer, cluttered desk',
        after_scene: overrides.after_scene || 'calm peer, one phone, clean moment',
        line_items: overrides.line_items || 'Missed follow-ups, late invoices, lost notes',
        total: overrides.total || 'Too much',
        events: overrides.events || 'Double-booked, no buffer, chaos',
        sign_text: overrides.sign_text || brand.oneLiner || name,
        person_desc: overrides.person_desc || `authentic ${brand.icp?.primary?.[0] || 'customer'} peer`,
        salutation: overrides.salutation || 'Hey —',
        signoff: overrides.signoff || 'The team',
        ...overrides,
    };
    // Allow brand.name style keys from UI flat form
    if (overrides.brandName) defaults['brand.name'] = overrides.brandName;
    return defaults;
}

export function buildNativeUiPrompt(templateId, overrides = {}, brand = getBrand()) {
    const t = getNativeUiTemplate(templateId);
    if (!t) {
        const err = new Error(`Unknown native UI template: ${templateId}`);
        err.status = 404;
        throw err;
    }
    const vars = resolveNativeUiVars(templateId, overrides, brand);
    const prompt = fillTemplate(t.prompt, vars);
    return {
        templateId: t.id,
        label: t.label,
        aspectRatio: overrides.aspectRatio || t.aspectDefault || '1:1',
        prompt,
        variables: vars,
        modelLane: t.modelLane,
        note:
            t.modelLane === 'ui_type'
                ? 'Model paints type/UI — this is the finished static ad (not Brand OS compose).'
                : 'Photo-forward template; light type may be painted in-frame.',
    };
}

export async function generateNativeUiAd({
    templateId,
    overrides = {},
    brand = getBrand(),
    n = 1,
} = {}) {
    if (!hasGrokKey()) {
        const err = new Error('XAI_API_KEY is required for native UI ads');
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }
    const built = buildNativeUiPrompt(templateId, overrides, brand);
    const result = await generateImage({
        prompt: built.prompt,
        aspectRatio: built.aspectRatio,
        n: Math.min(Math.max(n, 1), 4),
    });

    logGeneration({
        kind: 'native_ui_ad',
        templateId,
        model: result.model || 'grok-imagine',
        aspectRatio: built.aspectRatio,
        provider: 'xai',
        n: result.urls?.length || 1,
    });

    return {
        ...built,
        imageUrl: result.urls[0],
        imageUrls: result.urls,
        model: result.model,
        mode: result.mode,
    };
}
