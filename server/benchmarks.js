/**
 * Taskiz benchmark workflows — fixed combos to A/B quality without inventing freeform prompts.
 * Use from Create UI presets or GET /api/benchmarks.
 */

export const BENCHMARK_WORKFLOWS = [
    {
        id: 'w1_ultra_real',
        name: 'W1 · Ultra-real UGC (flagship realism)',
        goal: 'Does it look like a real contractor’s phone camera roll?',
        packId: 'stories',
        styleId: 'ultra_ugc',
        videoModelId: 'kling',
        flowId: 'pain_to_cta',
        storyMode: true,
        build: 'full_story', // stills + animate all beats + assemble
        itemLimit: 1,
        estimatedMinutes: '8–15',
        costHint: 'Higher (Kling × 3 beats)',
        scoreFocus: [
            'Skin/texture realism (not plastic)',
            'Overcast / flat light (not beauty ad)',
            'Imperfect framing / UGC energy',
            'Handheld motion without chaos',
            'Titles don’t kill the UGC feel',
        ],
        passBar: 'Would you believe this was shot on a job site phone?',
    },
    {
        id: 'w2_weekly_doc',
        name: 'W2 · Weekly documentary (volume baseline)',
        goal: 'Clean brand look for weekly organic — cheap and on-message.',
        packId: 'weekly',
        styleId: 'documentary_commercial',
        videoModelId: 'grok',
        flowId: 'single_moment',
        storyMode: true,
        build: 'one_reel', // one reel: still + animate (no multi-beat required)
        itemLimit: 1,
        estimatedMinutes: '3–6',
        costHint: 'Low (Grok only)',
        scoreFocus: [
            'On-ICP (handyman / small GC)',
            'No Taskiz baked into scene',
            'Space for titles',
            'Acceptable motion for organic',
        ],
        passBar: 'Approve-ready without rewrite?',
    },
    {
        id: 'w3_product_hero',
        name: 'W3 · Product phone hero',
        goal: 'Hands + phone continuity for demo energy.',
        packId: 'stories',
        styleId: 'premium_product',
        videoModelId: 'seedance_25',
        flowId: 'demo_loop',
        storyMode: true,
        build: 'full_story',
        itemLimit: 1,
        estimatedMinutes: '10–18',
        costHint: 'Premium (Seedance × beats)',
        scoreFocus: [
            'Phone readable as a prop (screen blank)',
            'Hands/product stable across beats',
            'Not sci-fi SaaS gloss',
            'CTA end card clean',
        ],
        passBar: 'Feels like field product demo, not stock AI phone?',
    },
    {
        id: 'w4_model_bakeoff',
        name: 'W4 · Model bake-off (same still → 4 engines)',
        goal: 'Same plate, different I2V models — pick default for Taskiz.',
        packId: 'reels',
        styleId: 'ultra_ugc',
        videoModelId: 'grok', // start; operator switches model per run
        flowId: 'single_moment',
        storyMode: true,
        build: 'still_once_animate_each_model',
        modelsToCompare: ['grok', 'kling', 'seedance_25', 'minimax_h3'],
        itemLimit: 1,
        estimatedMinutes: '15–25',
        costHint: 'Medium–high (4× I2V)',
        scoreFocus: [
            'Motion naturalness',
            'Identity/plate consistency',
            'Speed',
            'Cost vs quality',
            'Best for UGC vs product',
        ],
        passBar: 'Which model becomes Taskiz default for ultra_ugc?',
    },
    {
        id: 'w5_ugc_vs_ultra',
        name: 'W5 · UGC field vs Ultra-real (style A/B)',
        goal: 'Is ultra_ugc worth it vs balanced ugc_field?',
        packId: 'stories',
        styleId: 'ugc_field', // run twice: ugc_field then ultra_ugc
        videoModelId: 'kling',
        flowId: 'ugc_field',
        storyMode: true,
        build: 'style_ab',
        stylesToCompare: ['ugc_field', 'ultra_ugc'],
        itemLimit: 1,
        estimatedMinutes: '12–20',
        costHint: '2× full story on Kling',
        scoreFocus: [
            'Which looks more “real”?',
            'Which feels more “on brand”?',
            'Caption readability',
            'Would you run paid on either?',
        ],
        passBar: 'Pick default style for paid Taskiz reels.',
    },
    {
        id: 'w6_soft_trust',
        name: 'W6 · Soft trust / beta invite',
        goal: 'Quiet human energy for beta — not hype UGC.',
        packId: 'beta',
        styleId: 'soft_founder',
        videoModelId: 'grok',
        flowId: 'single_moment',
        storyMode: true,
        build: 'one_reel',
        itemLimit: 1,
        estimatedMinutes: '3–6',
        costHint: 'Low',
        scoreFocus: [
            'Warmth / trust',
            'Not hard-sell',
            'LinkedIn-safe',
            'Brand CTA fit',
        ],
        passBar: 'Would you send this in a founder outreach pack?',
    },
];

export function listBenchmarks() {
    return BENCHMARK_WORKFLOWS.map(
        ({
            id,
            name,
            goal,
            packId,
            styleId,
            videoModelId,
            flowId,
            storyMode,
            build,
            itemLimit,
            estimatedMinutes,
            costHint,
            scoreFocus,
            passBar,
            modelsToCompare,
            stylesToCompare,
        }) => ({
            id,
            name,
            goal,
            packId,
            styleId,
            videoModelId,
            flowId,
            storyMode,
            build,
            itemLimit,
            estimatedMinutes,
            costHint,
            scoreFocus,
            passBar,
            modelsToCompare: modelsToCompare || null,
            stylesToCompare: stylesToCompare || null,
        })
    );
}

export function getBenchmark(id) {
    return BENCHMARK_WORKFLOWS.find((b) => b.id === id) || null;
}

/** Scorecard fields for operator notes (1–5) */
export const SCORECARD_RUBRIC = [
    { id: 'realism', label: 'Photoreal / not AI-slop', weight: 1.2 },
    { id: 'icp', label: 'On-ICP (contractor field, not generic SaaS)', weight: 1.2 },
    { id: 'motion', label: 'Motion quality (natural, not warpy)', weight: 1.0 },
    { id: 'story', label: 'Story clarity (hook → resolve)', weight: 1.0 },
    { id: 'brand_safe', label: 'Brand-safe (no do-not-say, no baked logos)', weight: 1.1 },
    { id: 'titles', label: 'Titles/CTA readable without killing plate', weight: 0.8 },
    { id: 'approve', label: 'Approve in one pass?', weight: 1.0 },
];
