/**
 * Brand OS casting + visual world — shared by stills, reels, story beats, ads.
 *
 * Source of truth: active workspace brand.json (filled by onboarding).
 * Prefer explicit brand.visualWorld / castBrief / environment when present;
 * otherwise infer from category + ICP + features (fits ANY new client).
 */

import { getBrand } from './brandLoader.js';

/** Expandable domain catalog — keyword match on onboarding fields */
const DOMAIN_RULES = [
    {
        id: 'music',
        re: /music|artist|songwriter|producer|hip.?hop|r&b|studio|label|band|dj|entertainer|creator of color|podcast|singer|rapper|beat/,
        environment: 'home studio, creative apartment, city creative life, headphones/writing context — never construction jobsites',
        wardrobe: 'creative streetwear, headphones optional, no luxury logos',
        characterAge: 'mid-20s to mid-30s',
        negativesExtra:
            'no contractors, no plumbers, no hard hats, no jobsite trucks as hero, no tool belts, no construction',
        photoHint:
            'documentary commercial of creators in music/creative life, candid peer energy, natural light',
    },
    {
        id: 'trades',
        re: /contract|plumb|hvac|electric|handyman|trades?|jobsite|field service|roofer|painter|landscap|remodel|invoic|owner.?operator/,
        environment: 'residential jobsite, driveway, truck, or van interior — field context',
        wardrobe: 'practical workwear, dusty OK, no logos',
        characterAge: '30s–50s',
        negativesExtra: 'no fashion editorial, no hard-hat hero cliché pose, no fake luxury',
        photoHint:
            'documentary commercial of owner-operators in the field, real job sites, natural light',
    },
    // Specific verticals before generic SaaS (so "fitness app" ≠ saas)
    {
        id: 'fitness',
        re: /fitness|wellness|gym|coach|yoga|nutrition|athlete|workout|personal train/,
        environment: 'home gym, studio, outdoor park path, lived-in training space',
        wardrobe: 'athletic casual, no logos',
        characterAge: '20s–40s',
        negativesExtra: 'no construction, no corporate boardroom clichés',
        photoHint: 'active lifestyle documentary, authentic movement, natural light',
    },
    {
        id: 'food',
        re: /food|restaurant|chef|cafe|kitchen|hospitality|culinary|dining/,
        environment: 'kitchen, dining table, market, restaurant pass — no brand signage',
        wardrobe: 'apron or kitchen casual, no logos',
        characterAge: 'mid-career',
        negativesExtra: 'no construction, no tech-bro stock poses',
        photoHint: 'food/hospitality documentary commercial, warm practical light',
    },
    {
        id: 'fashion',
        re: /fashion|apparel|clothing|streetwear|beauty|skincare|cosmetic/,
        environment: 'city street, loft, fitting context, soft daylight interiors',
        wardrobe: 'on-brand fashion without readable logos',
        characterAge: '20s–30s',
        negativesExtra: 'no construction, no tool belts',
        photoHint: 'editorial-leaning commercial, authentic models not plastic stock',
    },
    {
        id: 'education',
        re: /educat|course|learn|school|student|tutor|academy|e-?learning/,
        environment: 'desk, classroom soft, home study, library light',
        wardrobe: 'casual student/professional, no logos',
        characterAge: 'teens to 30s as ICP dictates',
        negativesExtra: 'no construction jobsite',
        photoHint: 'warm educational lifestyle documentary',
    },
    {
        id: 'healthcare',
        re: /health.?care|clinic|dental|medical|patient|nurse|doctor|therapy|dentist/,
        environment: 'bright clinic-adjacent or home care context, calm and clean',
        wardrobe: 'scrubs or calm professional casual as ICP fits, no logos',
        characterAge: 'as ICP dictates',
        negativesExtra: 'no construction, no gore, no fearmongering imagery',
        photoHint: 'clean caring documentary commercial, soft daylight',
    },
    {
        id: 'finance',
        re: /finance|bank|invest|insurance|fintech|credit|wealth management/,
        environment: 'clean home office, city soft bokeh, calm desk',
        wardrobe: 'smart casual professional, no logos',
        characterAge: '30s–50s',
        negativesExtra: 'no construction, no casino flash',
        photoHint: 'trustworthy calm commercial documentary',
    },
    {
        id: 'saas',
        re: /saas|b2b software|software platform|product team|project management|crm|analytics dashboard|developer tool|martech/,
        environment: 'home office, café, modern workspace, laptop/phone as tools',
        wardrobe: 'smart casual, no luxury logos',
        characterAge: 'late 20s–30s',
        negativesExtra: 'no construction workers, no hard hats, no medical scrubs unless healthcare brand',
        photoHint: 'documentary commercial of product professionals, peer energy, natural window light',
    },
];

/**
 * Infer visual world from Brand OS / onboarding fields.
 * @returns {{ id, environment, wardrobe, characterAge, negativesExtra, photoHint, confidence }}
 */
export function inferVisualWorld(brand = getBrand()) {
    // Explicit from onboarding/compiler wins
    if (brand.visualWorld && typeof brand.visualWorld === 'object' && brand.visualWorld.id) {
        return {
            confidence: 'explicit',
            ...defaultWorldShell(),
            ...brand.visualWorld,
        };
    }
    if (typeof brand.visualWorld === 'string' && brand.visualWorld.trim()) {
        const id = brand.visualWorld.trim().toLowerCase();
        const rule = DOMAIN_RULES.find((d) => d.id === id);
        if (rule) return { ...rule, confidence: 'explicit-id' };
    }

    const blob = [
        brand.category,
        brand.oneLiner,
        brand.supporting,
        brand.promise,
        brand.photographyStyle,
        brand.voice,
        ...(brand.icp?.primary || []),
        ...(brand.icp?.secondary || []),
        ...(brand.keyFeatures || []),
        ...(brand.communities || []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    for (const rule of DOMAIN_RULES) {
        if (rule.re.test(blob)) {
            return { ...rule, confidence: 'inferred' };
        }
    }

    // Build a fully custom world from ICP text alone
    const icp = (brand.icp?.primary || [])[0] || brand.category || 'the customer';
    return {
        id: 'general',
        environment: `real environments where ${icp} actually live and work — specific, not stock generic`,
        wardrobe: `everyday clothes fitting ${icp}, no brand logos`,
        characterAge: 'age-appropriate to ICP',
        negativesExtra: 'no wrong-industry clichés, no stock-photo fake smiles',
        photoHint: `documentary commercial photography of ${icp}, authentic, natural light`,
        confidence: 'icp-fallback',
    };
}

function defaultWorldShell() {
    return {
        environment: 'real environment matching this brand’s world',
        wardrobe: 'everyday clothes, no logos',
        characterAge: 'mid-20s to mid-40s',
        negativesExtra: 'no wrong-industry clichés',
        photoHint: 'documentary commercial, authentic subjects, natural light',
    };
}

export function detectBrandDomain(brand = getBrand()) {
    return inferVisualWorld(brand).id;
}

/**
 * Full casting package for media engines.
 */
export function brandTalkCharacter(brand = getBrand()) {
    const world = inferVisualWorld(brand);
    const icpList = brand.icp?.primary || [];
    const icp = icpList[0] || brand.category || 'everyday peer';
    const icpLine = icpList.slice(0, 3).join(', ') || icp;

    // Explicit cast brief from onboarding/compiler
    if (brand.castBrief && String(brand.castBrief).trim()) {
        return {
            domain: world.id,
            icp,
            icpLine,
            character: String(brand.castBrief).trim(),
            photo: brand.photographyStyle || world.photoHint,
            environment: brand.environment || world.environment,
            wardrobe: brand.wardrobe || world.wardrobe,
            negativesExtra: brand.visualNegativesExtra || world.negativesExtra,
            world,
        };
    }

    const character =
        brand.castTemplate ||
        `the same authentic person representing ICP (${icpLine}), ${world.characterAge}, peer UGC energy not fashion model, natural skin texture, continuity face/wardrobe across beats`;

    return {
        domain: world.id,
        icp,
        icpLine,
        character,
        photo: brand.photographyStyle || world.photoHint,
        environment: brand.environment || world.environment,
        wardrobe: brand.wardrobe || world.wardrobe,
        negativesExtra: brand.visualNegativesExtra || world.negativesExtra,
        world,
    };
}

/** Vertical talk subjects for hook/tension/resolve */
export function brandTalkSubjects(brand, hookScene, tensionScene, resolveScene) {
    const { character, environment } = brandTalkCharacter(brand);
    const hook =
        hookScene ||
        `${environment}, open confessional expression, mid-speech, soft bokeh`;
    const tension =
        tensionScene || `same setting as hook, heavier frustration in eyes, mid-speech`;
    const resolve =
        resolveScene ||
        `same wardrobe same face, calmer relieved confidence, leave lower third clean for CTA`;

    return {
        imageSubject: `Vertical 9:16 medium close-up of ${character}, looking at camera mid-conversation, ${hook}`,
        tensionSubject: `Vertical 9:16 medium close-up of ${character}, same wardrobe same face, looking at camera, ${tension}`,
        resolveSubject: `Vertical 9:16 medium close-up of ${character}, same wardrobe same face, looking at camera, ${resolve}`,
    };
}

/** Continuity subjects for expandBeats when idea lacks them */
export function brandDefaultBeatSubjects(brand, idea = {}, deliveryMode = 'caption_talk') {
    const cast = brandTalkCharacter(brand);
    const base =
        idea.imageSubject ||
        `vertical 9:16 selfie of ${cast.character}, looking at camera mid-conversation, ${cast.environment}, face readable`;

    if (deliveryMode === 'diegetic_talk' || deliveryMode === 'caption_talk') {
        return [
            base,
            idea.tensionSubject ||
                `Same person as previous beat (ICP: ${cast.icpLine}), same wardrobe, talking to camera with heavier frustrated emotion, ${cast.environment}, face readable`,
            idea.resolveSubject ||
                `Same person as previous beat (ICP: ${cast.icpLine}), same wardrobe, talking to camera with calmer relieved confidence, face readable`,
        ];
    }

    return [
        base,
        idea.tensionSubject || `Same world as: ${base} — tighter on friction, still photoreal`,
        idea.resolveSubject || `Same world as: ${base} — calmer resolve, room for CTA`,
    ];
}

/** Inject into every image/video prompt so models don't drift to wrong ICP */
export function brandIcpPromptLock(brand = getBrand()) {
    const cast = brandTalkCharacter(brand);
    const name = brand.name || 'Brand';
    const cat = brand.category || '';
    return [
        `Brand lock: ${name}${cat ? ` (${cat})` : ''}.`,
        `ICP (on-camera people MUST match): ${cast.icpLine}.`,
        `Visual world: ${cast.world?.id || 'general'} — ${cast.environment}.`,
        `Photography: ${cast.photo}.`,
        cast.wardrobe ? `Wardrobe: ${cast.wardrobe}.` : '',
        cast.negativesExtra ? `Forbidden industry drift: ${cast.negativesExtra}.` : '',
        brand.imageNegatives ? `Negatives: ${brand.imageNegatives}.` : '',
    ]
        .filter(Boolean)
        .join(' ');
}

/**
 * Soften contractor-locked style packs when brand is not trades.
 */
export function brandAdaptStylePack(style, brand = getBrand()) {
    if (!style) return style;
    const world = inferVisualWorld(brand);
    if (world.id === 'trades') return style;

    const cast = brandTalkCharacter(brand);
    const adapted = { ...style };

    adapted.subjectRules = `${cast.character}; continuity of wardrobe across beats; face is hero; ${cast.environment}`;
    adapted.energy =
        world.id === 'music'
            ? 'peer creator energy — confident, real, never corporate stock polish'
            : style.energy?.replace(/contractor/gi, 'subject') || style.energy;

    if (style.imagePromptBlock && /contractor|handyman|jobsite|job site/i.test(style.imagePromptBlock)) {
        adapted.imagePromptBlock = [
            `Photoreal vertical UGC / commercial still for ${brand.name}`,
            cast.character,
            cast.environment,
            cast.photo,
            '9:16 medium close-up face readable, leave lower third clean for captions',
            'no text, no logos, no fake UI',
        ].join(', ');
    }

    if (style.videoPromptBlock && /contractor|handyman|jobsite|job site/i.test(style.videoPromptBlock)) {
        adapted.videoPromptBlock = [
            'Animate as authentic UGC talking-head: subject SPEAKS directly to camera',
            `Person matches ICP: ${cast.icpLine}`,
            'natural mouth movement, peer energy, continuous identity across beats',
            'no text, no logos burned in',
        ].join('. ');
    }

    return adapted;
}

/**
 * Build visual OS fields to stamp onto brand.json during onboarding compile.
 * Call with answers + optional existing brandkit so every new workspace is media-ready.
 */
export function buildVisualOsFromOnboarding({
    category = '',
    oneLiner = '',
    supporting = '',
    promise = '',
    primaryIcp = [],
    secondaryIcp = [],
    keyFeatures = [],
    photographyStyle = '',
    imageNegatives = '',
    compositionNotes = '',
    communities = [],
} = {}) {
    const probe = {
        category,
        oneLiner,
        supporting,
        promise,
        photographyStyle,
        icp: { primary: primaryIcp, secondary: secondaryIcp },
        keyFeatures,
        communities,
    };
    const world = inferVisualWorld(probe);
    const icpLine = (primaryIcp || []).slice(0, 3).join(', ') || category || 'the customer';

    const photo =
        (photographyStyle && photographyStyle.trim()) ||
        `${world.photoHint}, single clear subject matching ICP (${icpLine}), intentional negative space for text overlay`;

    const baseNeg =
        (imageNegatives && imageNegatives.trim()) ||
        'no text of any kind, no logos painted in scene, no fake UI gibberish, no stock-photo clichés';

    const driftNeg = world.negativesExtra || '';
    const negatives = driftNeg && !baseNeg.toLowerCase().includes(driftNeg.slice(0, 20).toLowerCase())
        ? `${baseNeg}, ${driftNeg}`
        : baseNeg;

    const composition =
        (compositionNotes && compositionNotes.trim()) ||
        `One hero moment featuring ${icpLine}, clean negative space for overlay, medium shot preferred.`;

    const castBrief = `the same authentic person representing ICP (${icpLine}), ${world.characterAge}, peer UGC energy not fashion model, natural skin texture, ${world.wardrobe}, continuity face/wardrobe across beats`;

    return {
        visualWorld: {
            id: world.id,
            environment: world.environment,
            wardrobe: world.wardrobe,
            characterAge: world.characterAge,
            negativesExtra: world.negativesExtra,
            photoHint: world.photoHint,
            confidence: world.confidence,
        },
        photographyStyle: photo,
        imageNegatives: negatives,
        compositionNotes: composition,
        castBrief,
        environment: world.environment,
        wardrobe: world.wardrobe,
        visualNegativesExtra: world.negativesExtra,
        // Never default new clients to contractor_talk unless trades
        defaultVideoStyleId: world.id === 'trades' ? 'contractor_talk' : 'documentary_commercial',
        defaultFlowId: 'pain_to_cta',
        defaultDeliveryMode: 'caption_talk',
    };
}
