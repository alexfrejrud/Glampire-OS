import {
  getBrand,
  getBrandPublic,
  pillars,
  formats,
  buildImagePrompt,
  buildVideoPrompt,
} from './brand.js';
import { getVideoStyle, styleDirectorBrief } from './videoStyles.js';
import { brandTalkSubjects, brandTalkCharacter, brandAdaptStylePack } from './brandCast.js';
import { expandBeats, getFlow, inferFlowId } from './flows.js';
import { getVideoModel, estimateVideoCost } from './videoModels.js';

export { getBrandPublic };
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Generic idea pool from active Brand OS (any client).
 * Client-specific libraries live under clients/<id>/ — never hardcode another brand here.
 */
function buildBrandIdeaPool(brand) {
  const name = brand.name || 'the product';
  const oneLiner = brand.oneLiner || brand.promise || '';
  const cta = brand.primaryCta || brand.ctas?.[0] || 'Learn more';
  const features = brand.keyFeatures || [];
  const icp = (brand.icp?.primary || [])[0] || 'your customer';
  const photo = brand.photographyStyle || 'documentary commercial photography, authentic subjects, natural light';
  const cast = brandTalkCharacter(brand);
  const talk = brandTalkSubjects(brand);

  return [
    {
      pillar: 'pain',
      format: 'post',
      headline: `Still fighting the old way?`,
      body: oneLiner || `There's a clearer path with ${name}.`,
      caption: `${oneLiner}\n\n${brand.supporting || ''}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Photoreal scene for ${name}: ${icp} in ${cast.environment}, moment of friction, ${photo}, intentional negative space`,
      videoMotion: 'Gentle camera push-in, natural light shift',
    },
    {
      pillar: 'demo',
      format: 'post',
      headline: oneLiner || name,
      body: brand.supporting || brand.promise || oneLiner,
      caption: `${brand.supporting || oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Product or outcome moment for ${name} with ${icp}, ${cast.environment}, ${photo}, clean composition for later text`,
      videoMotion: 'Subtle cinematic push-in',
    },
    {
      pillar: 'before_after',
      format: 'carousel',
      headline: `Before ${name} vs after`,
      body: oneLiner,
      caption: `Swipe: the shift →\n\n${cta}`,
      cta,
      slides: [
        {
          headline: 'Before',
          body: 'The old workflow. Friction, scatter, delay.',
          imageSubject: `Before-state friction for ${icp}, ${cast.environment}, ${photo}`,
        },
        {
          headline: 'After',
          body: oneLiner || `Clarity with ${name}`,
          imageSubject: `After-state calm outcome for ${icp}, ${cast.environment}, ${photo}`,
        },
        {
          headline: cta,
          body: brand.promise || brand.supporting || oneLiner,
          imageSubject: `Hero brand moment for ${name} · ${icp}, ${photo}, empty lower third`,
        },
      ],
    },
    {
      pillar: 'education',
      format: 'post',
      headline: features[0] ? `Why ${features[0]} matters` : `What ${icp} should know`,
      body: brand.supporting || oneLiner,
      caption: `${brand.supporting || oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Educational lifestyle still for ${name} · ${icp}, ${cast.environment}, ${photo}`,
      videoMotion: 'Slow parallax, calm commercial energy',
    },
    {
      pillar: 'trust',
      format: 'post',
      headline: `Built for ${icp}`,
      body: brand.promise || oneLiner,
      caption: `${oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Trust-building authentic moment for ${name} · ${icp}, ${photo}`,
      videoMotion: 'Gentle push-in',
    },
    {
      id: 'reel-brand-talk',
      priority: 100,
      pillar: 'pain',
      format: 'reel',
      flowId: brand.defaultFlowId || 'pain_to_cta',
      styleId: brand.defaultVideoStyleId || 'documentary_commercial',
      headline: oneLiner || name,
      body: brand.supporting || '',
      deliveryMode: brand.defaultDeliveryMode || 'caption_talk',
      hookKeyword: 'The old way',
      tensionKeyword: 'The cost',
      resolveKeyword: name,
      hookLine: 'The old way',
      tensionLine: 'The cost',
      resolveLine: oneLiner || name,
      dialogueHook: `I kept doing it the hard way.`,
      dialogueTension: `It was costing me more than I wanted to admit.`,
      dialogueResolve: oneLiner
        ? `${oneLiner} ${cta}.`
        : `${name} changed that. ${cta}.`,
      caption: `${oneLiner}\n\n${cta}`.trim(),
      cta,
      ...talk,
    },
    {
      pillar: 'demo',
      format: 'reel',
      flowId: brand.defaultFlowId || 'pain_to_cta',
      styleId: brand.defaultVideoStyleId || 'documentary_commercial',
      headline: features[0] || name,
      body: oneLiner,
      caption: `${oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Demo-ready vertical still for ${name} · ${icp}, ${cast.environment}, ${photo}`,
      videoMotion: 'Subtle product-in-use motion, commercial pace',
      deliveryMode: brand.defaultDeliveryMode || 'caption_talk',
      ...brandTalkSubjects(
        brand,
        `${cast.environment}, demo energy, mid-speech`,
        `same setting, deeper problem, mid-speech`,
        `calmer resolve, phone optional blank screen, clean lower third`
      ),
    },
  ];
}

/** Taskiz legacy cast helper (only used inside TASKIZ_IDEA_POOL) */
function talkSubjects(hookScene, tensionScene, resolveScene) {
  return brandTalkSubjects(
    {
      name: 'Taskiz',
      category: 'Mobile business app for contractors',
      icp: { primary: ['Solo handyman businesses', 'Small general contractors'] },
      photographyStyle:
        'documentary commercial photography, authentic owner-operator contractor, real job site',
      imageNegatives: 'no hard-hat cliché, no logos',
    },
    hookScene,
    tensionScene,
    resolveScene
  );
}

/**
 * Taskiz-only legacy idea bank (client workspace).
 * Other workspaces use buildBrandIdeaPool(getBrand()) — never this list.
 */
const TASKIZ_IDEA_POOL = [
  // ── PAIN ──────────────────────────────────────────────────────────
  {
    pillar: 'pain',
    format: 'post',
    headline: 'Your work is in the field. Your business is everywhere else.',
    body: 'Customer details in texts. Schedules in Google Calendar. Invoices in QuickBooks. Job notes in your head.',
    caption:
      'If your contracting business lives in five different apps, you are not alone.\n\nTaskiz brings customers, jobs, schedules, estimates, and invoices into one simple mobile app.\n\nRun your business from your phone.\n\n#Taskiz #Contractors #HandymanBusiness',
    cta: 'Join the Beta',
    imageSubject:
      'Solo handyman sitting in his truck between jobs, phone in hand, tools soft in the back seat, late afternoon light, intentional negative space on the right',
    videoMotion: 'Gentle camera push-in on the contractor in the truck, soft natural light shift',
  },
  {
    pillar: 'pain',
    format: 'carousel',
    headline: 'Stop running your business from five apps',
    body: 'One simple mobile workflow for solo contractors.',
    caption:
      'Texts. Notes. Calendar. QuickBooks. Memory.\n\nTaskiz replaces the scatter with one app built for owner-operators.\n\nSwipe to see the shift →',
    cta: 'Join the Beta',
    slides: [
      {
        headline: 'The old way',
        body: 'Texts, notes, calendar, invoices, memory.',
        imageSubject: 'Messy kitchen-table admin: sticky notes, phone, paper invoices, coffee — not a graphic collage',
      },
      {
        headline: 'Lost details',
        body: 'Customer notes live in chats you cannot find later.',
        imageSubject: 'Close-up of a phone with many unread text threads, face of tired contractor soft in background',
      },
      {
        headline: 'Late invoices',
        body: 'You finish the job… then invoice at midnight.',
        imageSubject: 'Tired contractor at kitchen table at night with laptop and paper job notes, warm lamp',
      },
      {
        headline: 'The Taskiz way',
        body: 'Customers, jobs, schedules, estimates, invoices — one phone app.',
        imageSubject:
          'Confident solo contractor on a clean residential job site holding phone, plain white van (no lettering) soft behind, daylight',
      },
      {
        headline: 'Run your contracting business from your phone.',
        body: 'Taskiz helps contractors manage customers, jobs, schedules, estimates, and invoices in one simple mobile app.',
        imageSubject:
          'Premium lifestyle still: contractor and phone by work van at golden hour, calm confident mood, empty lower third',
      },
    ],
  },
  {
    id: 'reel-lost-in-texts',
    priority: 100,
    pillar: 'pain',
    format: 'reel',
    flowId: 'testimonial_talk',
    styleId: 'contractor_talk',
    headline: 'Half my customers lived in my texts',
    body: 'That used to be me.',
    deliveryMode: 'caption_talk',
    hookKeyword: 'Lost in texts',
    tensionKeyword: 'Friday scramble',
    resolveKeyword: 'One phone',
    hookLine: 'Lost in texts',
    tensionLine: 'Friday scramble',
    resolveLine: 'One phone. Whole business.',
    dialogueHook: "Half my customers used to live in my text messages.",
    dialogueTension: "By Friday I couldn't find half of what I promised people.",
    dialogueResolve: "Now customers, jobs, the whole thing — on my phone. Taskiz. Join the beta.",
    caption:
      'If customer info is in texts, notes, and memory — Taskiz is built for you.\n\nA simple mobile app for contractors who work from the field.\n\nCustomers · jobs · schedules · estimates · invoices\n\nJoin the beta →',
    cta: 'Join the Beta',
    ...talkSubjects(
      'driveway residential job site soft bokeh, late afternoon, open confessional expression, mid-speech',
      'same driveway or van cab, heavier frustration in eyes, slight head shake, mid-speech',
      'calmer relieved confidence, soft natural smile possible, golden hour, leave lower third clean for CTA'
    ),
    videoMotion: 'talking to camera, sincere confession, natural mouth movement, peer energy',
  },

  // ── DEMO ──────────────────────────────────────────────────────────
  {
    pillar: 'demo',
    format: 'post',
    headline: 'Create a contractor estimate from your phone.',
    body: 'Send professional estimates before you leave the driveway.',
    caption:
      'Create a contractor estimate from your phone in under a minute.\n\nTaskiz helps you manage customers, jobs, schedules, estimates, and invoices — without complicated software.\n\n#ContractorApp #Estimates',
    cta: 'See How It Works',
    imageSubject:
      'Over-shoulder view of a contractor on-site reviewing a phone (screen blank/blurred), clean modern composition, empty side for type',
    videoMotion: 'Slight camera drift over shoulder, natural daylight, subtle hand motion',
  },
  {
    pillar: 'demo',
    format: 'carousel',
    headline: 'From customer call to paid invoice',
    body: 'The daily contractor workflow, simplified.',
    caption:
      'Customer → estimate → schedule → job → invoice.\n\nThat is the Taskiz loop for solo contractors.\n\nSwipe through the workflow →',
    cta: 'Start Free',
    slides: [
      {
        headline: '1. Save the customer',
        body: 'Name, address, notes — in one place.',
        imageSubject: 'Contractor shaking hands with homeowner at front door, phone in other hand',
      },
      {
        headline: '2. Send the estimate',
        body: 'Professional quote from the field.',
        imageSubject: 'Contractor on job site pausing to check phone (screen unreadable), tools nearby',
      },
      {
        headline: '3. Schedule the job',
        body: 'Keep work and customers connected.',
        imageSubject: 'Contractor in van cab reviewing next jobs on phone, calm between stops',
      },
      {
        headline: '4. Invoice before you leave',
        body: 'Get paid faster with less end-of-day admin.',
        imageSubject: 'Contractor by truck at golden hour sending something on phone, relieved energy',
      },
    ],
  },
  {
    id: 'reel-midnight-invoices',
    priority: 95,
    pillar: 'demo',
    format: 'reel',
    flowId: 'testimonial_talk',
    styleId: 'contractor_talk',
    headline: 'I stopped invoicing at midnight',
    body: 'I invoice before I leave.',
    deliveryMode: 'caption_talk',
    hookKeyword: 'Midnight invoices',
    tensionKeyword: 'Kitchen table tax',
    resolveKeyword: 'Paid faster',
    hookLine: 'Midnight invoices',
    tensionLine: 'Kitchen table tax',
    resolveLine: 'Invoice before you leave',
    dialogueHook: 'I used to wait until midnight to send invoices. Every night.',
    dialogueTension: "Job's done at four… then I'm still at the kitchen table doing the books.",
    dialogueResolve: 'Now I invoice before I leave the driveway. Taskiz — join the beta.',
    caption:
      'Stop waiting until night to send invoices.\n\nTaskiz helps contractors create estimates and invoices from the phone — so you get paid faster.\n\nJoin the beta →',
    cta: 'Join the Beta',
    ...talkSubjects(
      'beside plain white work van at dusk, tired-honest face, mid-speech',
      'same man same wardrobe, kitchen-table energy suggested by tired eyes, heavier frustration, mid-speech',
      'same man by van golden hour, relieved confident face, headroom for end card'
    ),
    videoMotion: 'talking to camera, frustrated then relieved, natural speech motion',
  },

  // ── BEFORE / AFTER ────────────────────────────────────────────────
  {
    pillar: 'before_after',
    format: 'post',
    headline: 'From scattered to sorted.',
    body: 'Texts, notes, calendar, invoices → one simple phone workflow.',
    caption:
      'From scattered to sorted.\n\nTaskiz is the simple mobile business app for contractors who do not want complicated field service software.\n\nRun your contracting business from your phone.',
    cta: 'Join the Beta',
    imageSubject:
      'Calm organized contractor with phone on residential street, plain work van soft behind — photographic not split-screen graphic',
    videoMotion: 'Subtle push-in, soft parallax, calm commercial energy',
  },
  {
    pillar: 'before_after',
    format: 'carousel',
    headline: 'Heavy software vs simple',
    body: 'Contractor software should not feel like another job.',
    caption:
      'Heavy software is built for growing teams.\n\nTaskiz is built for owner-operators who need the basics organized — customers, jobs, schedules, estimates, invoices.\n\nSwipe →',
    cta: 'Join the Beta',
    slides: [
      {
        headline: 'Heavy software',
        body: 'Lots of features. Lots of setup. Lots of clicks.',
        imageSubject: 'Frustrated small-business owner staring at complex desktop software at night',
      },
      {
        headline: 'Solo reality',
        body: 'You need speed between jobs — not a second office.',
        imageSubject: 'Busy handyman walking from truck to house with tools and phone',
      },
      {
        headline: 'Taskiz',
        body: 'Simple mobile app. Practical AI for admin. Built for the field.',
        imageSubject: 'Calm contractor using phone on sunny job site, slight natural smile, empty lower third',
      },
    ],
  },
  {
    id: 'reel-five-apps',
    priority: 90,
    pillar: 'before_after',
    format: 'reel',
    flowId: 'testimonial_talk',
    styleId: 'contractor_talk',
    headline: 'I ran one job on five apps',
    body: 'Now one phone.',
    deliveryMode: 'caption_talk',
    hookKeyword: 'Five apps',
    tensionKeyword: 'Nothing talks',
    resolveKeyword: 'One workflow',
    hookLine: 'Five apps. One job.',
    tensionLine: 'Nothing talked',
    resolveLine: 'One phone workflow',
    dialogueHook: 'How many apps to run one job? Used to be five for me.',
    dialogueTension: 'Contacts. Calendar. Notes. QuickBooks. Camera roll. Nothing talked.',
    dialogueResolve: "One phone workflow now. That's Taskiz. If you're solo — join the beta.",
    caption:
      'Taskiz vs five apps: contacts, calendar, notes, QuickBooks, camera roll.\n\nOne simple mobile app for solo contractors.\n\nJoin the beta →',
    cta: 'Join the Beta',
    ...talkSubjects(
      'van cab soft tools behind, counting on fingers optional, confessional energy, mid-speech',
      'same van cab, tighter frustration, mid-speech',
      'same man, calmer resolve, slight hope, leave lower third open'
    ),
    videoMotion: 'talking-head UGC, light gesture energy, natural mouth movement',
  },

  // ── EDUCATION ─────────────────────────────────────────────────────
  {
    pillar: 'education',
    format: 'post',
    headline: 'What every solo contractor should track',
    body: 'Customers. Jobs. Schedules. Estimates. Invoices.',
    caption:
      'If you only track five things well, track these:\n\n1. Customers\n2. Jobs\n3. Schedules\n4. Estimates\n5. Invoices\n\nTaskiz keeps them together on your phone.',
    cta: 'Start Free',
    imageSubject:
      'Clean flat-lay of contractor essentials: phone (blank screen), tape measure, keys, notebook — commercial photo with empty space',
    videoMotion: 'Slow top-down drift across tools and phone, soft light sweep',
  },
  {
    pillar: 'education',
    format: 'carousel',
    headline: 'Field admin shortcuts',
    body: 'What to do between jobs.',
    caption:
      'Between jobs is when the business falls apart — or gets organized.\n\n3 field admin moves every solo contractor should make →',
    cta: 'See How It Works',
    slides: [
      {
        headline: 'Between job 1 & 2',
        body: 'Log the customer note while it is fresh.',
        imageSubject: 'Contractor in truck cab typing a quick note on phone',
      },
      {
        headline: 'Before you leave site',
        body: 'Send the estimate or invoice immediately.',
        imageSubject: 'Contractor standing by finished work area with phone in hand',
      },
      {
        headline: 'Tonight',
        body: "Know tomorrow's jobs without digging through texts.",
        imageSubject: 'Evening kitchen table, contractor calmly reviewing next-day plan on phone',
      },
    ],
  },
  {
    id: 'reel-notes-app',
    priority: 85,
    pillar: 'education',
    format: 'reel',
    flowId: 'testimonial_talk',
    styleId: 'contractor_talk',
    headline: 'I ran a handyman business from Notes',
    body: 'Owner-operator reality.',
    deliveryMode: 'caption_talk',
    hookKeyword: 'Notes app biz',
    tensionKeyword: 'Scattered',
    resolveKeyword: 'Whole business',
    hookLine: 'Notes-app business',
    tensionLine: 'Everything scattered',
    resolveLine: 'One phone. Whole business.',
    dialogueHook: "Running a handyman business out of the Notes app? Yeah. That was me.",
    dialogueTension: 'Customers, jobs, invoices — all scattered. We deserve simpler than that.',
    dialogueResolve: 'One phone. Whole business. Taskiz beta is open — come join it.',
    caption:
      'A simple app for handyman businesses and small general contractors.\n\nManage customers, jobs, schedules, estimates, and invoices from your phone.\n\nJoin the Taskiz beta →',
    cta: 'Join the Beta',
    ...talkSubjects(
      'outside residential home, tool belt soft, approachable peer energy, mid-speech',
      'same exterior, weight of scatter in face, mid-speech',
      'same man, hopeful confident close, empty lower third for CTA'
    ),
    videoMotion: 'talking to camera, peer energy, natural speech motion',
  },

  // ── TRUST ─────────────────────────────────────────────────────────
  {
    pillar: 'trust',
    format: 'post',
    headline: 'Run your contracting business from your phone.',
    body: 'Join a small group of owner-operators testing Taskiz.',
    caption:
      'Run your contracting business from your phone.\n\nWe are inviting solo contractors and small service businesses into the beta.\n\nHonest feedback welcome. Complicated software not required.\n\nJoin the Beta.',
    cta: 'Join the Beta',
    imageSubject:
      'Premium lifestyle hero still: clean residential street at golden hour, sole contractor with phone by a plain white work van with no lettering, calm confident mood, empty lower third',
    videoMotion: 'Subtle wide-to-close push, commercial launch energy, calm',
  },
  {
    pillar: 'trust',
    format: 'carousel',
    headline: 'Who Taskiz is built for',
    body: 'Owner-operators first.',
    caption:
      'Built for people who work from the field — not behind a desk all day.\n\nSwipe to see if it fits you →',
    cta: 'Join the Beta',
    slides: [
      {
        headline: 'Solo handymen',
        body: 'You wear every hat. Keep the admin light.',
        imageSubject: 'Solo handyman loading tools into a plain white van',
      },
      {
        headline: 'Small GCs',
        body: 'Customers, jobs, estimates, invoices — one place.',
        imageSubject: 'Small general contractor walking a residential remodel site with phone',
      },
      {
        headline: 'Painters & remodelers',
        body: 'Quotes, schedules, and job notes that do not get lost.',
        imageSubject: 'Painter prepping a bright room, phone on ladder shelf, screen unreadable',
      },
      {
        headline: 'Not for… yet',
        body: 'Large multi-crew dispatch platforms. We stay simple on purpose.',
        imageSubject: 'Quiet residential street with one plain work van — small business scale',
      },
    ],
  },
  {
    id: 'reel-field-first',
    priority: 88,
    pillar: 'trust',
    format: 'reel',
    flowId: 'testimonial_talk',
    styleId: 'contractor_talk',
    headline: 'Built for guys like me in the field',
    body: 'Not desk software.',
    deliveryMode: 'caption_talk',
    hookKeyword: 'Not desk software',
    tensionKeyword: 'Between jobs',
    resolveKeyword: 'On your phone',
    hookLine: 'Not desk software',
    tensionLine: 'Works between jobs',
    resolveLine: 'On your phone',
    dialogueHook: "This isn't for people who sit behind a desk all day. That's not my life.",
    dialogueTension: 'I needed something that works between jobs — not another office.',
    dialogueResolve: 'Customers, jobs, invoices — on my phone. Taskiz beta. Come try it.',
    caption:
      'Built for contractors who work from the field, not behind a desk.\n\nTaskiz: customers, jobs, schedules, estimates, invoices — on your phone.\n\nJoin the beta →',
    cta: 'Join the Beta',
    ...talkSubjects(
      'sunrise job site soft, grounded pride, mid-speech',
      'same site, practical field frustration, mid-speech',
      'same man, hopeful confident close, clean lower third'
    ),
    videoMotion: 'talking to camera, grounded pride, natural speech',
  },
];

const PACKS = {
  weekly: {
    id: 'weekly',
    label: 'Weekly content batch',
    description: 'Mixed posts, carousels, and reels across all 5 pillars — ready to approve.',
    // pick by format mix: 3 posts, 2 carousels, 2 reels
    pick: (pool) => {
      const posts = pool.filter((i) => i.format === 'post');
      const carousels = pool.filter((i) => i.format === 'carousel');
      const reels = byPriority(pool.filter((i) => i.format === 'reel'));
      return [
        ...shuffle(posts).slice(0, 3),
        ...shuffle(carousels).slice(0, 2),
        ...reels.slice(0, 2),
      ];
    },
  },
  beta: {
    id: 'beta',
    label: 'Beta launch pack',
    description: 'Acquisition-focused creatives for founder outreach + social.',
    pick: (pool) =>
      byPriority(
        pool.filter((i) => ['pain', 'demo', 'trust'].includes(i.pillar))
      ).slice(0, 6),
  },
  paid: {
    id: 'paid',
    label: 'Paid ad test pack',
    description: '5 message angles as posts + reels for Meta testing.',
    pick: (pool) => {
      const angles = byPriority(
        pool.filter((i) => i.format === 'post' || i.format === 'reel')
      );
      return angles.slice(0, 5);
    },
  },
  reels: {
    id: 'reels',
    label: 'Reels only',
    description: 'Vertical short-form ideas ready to generate + animate.',
    pick: (pool) => byPriority(pool.filter((i) => i.format === 'reel')).slice(0, 5),
  },
  carousels: {
    id: 'carousels',
    label: 'Carousels only',
    description: 'Swipe sequences for education and before/after stories.',
    pick: (pool) => shuffle(pool.filter((i) => i.format === 'carousel')).slice(0, 4),
  },
  stories: {
    id: 'stories',
    label: 'Story reels (multi-beat)',
    description:
      'Best vertical reels first (priority) — expanded into hook → tension → resolve with style packs + titles.',
    pick: (pool) => byPriority(pool.filter((i) => i.format === 'reel')).slice(0, 4),
  },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Stable quality ordering: higher priority first, light shuffle inside equal ranks */
function byPriority(arr) {
  const ranked = [...arr].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  // group by priority band and light-shuffle within band so packs aren't identical every time
  const out = [];
  let i = 0;
  while (i < ranked.length) {
    const p = ranked[i].priority || 0;
    let j = i;
    while (j < ranked.length && (ranked[j].priority || 0) === p) j++;
    out.push(...shuffle(ranked.slice(i, j)));
    i = j;
  }
  return out;
}

function applyStyleFields(item, styleId) {
  const brand = getBrand();
  const raw = getVideoStyle(styleId);
  // Adapt contractor-locked style packs to this brand's ICP
  const style = brandAdaptStylePack(raw, brand);
  item.styleId = style.id;
  item.styleLabel = style.label;
  item.styleDirectorBrief = [
    styleDirectorBrief(style.id),
    `Brand ICP lock: ${(brand.icp?.primary || []).join(', ') || brand.category || brand.name}`,
  ].join('\n');
  item.styleImageBlock = style.imagePromptBlock;
  item.styleVideoBlock = style.videoPromptBlock;
  item.styleCamera = style.camera;
  item.styleLighting = style.lighting;
  item.styleFraming = style.framing;
  item.styleSubjectRules = style.subjectRules;
  item.styleColorGrade = style.colorGrade;
  item.styleNegatives = style.negatives;
  item.graphics = style.graphics;
  return item;
}

function materializeBeatPrompts(item, beat) {
  const plate = {
    ...item,
    format: 'reel',
    aspectRatio: '9:16',
    imageSubject: beat.imageSubject,
    videoMotion: beat.videoMotion,
    headline: beat.title,
    dialogue: beat.dialogue || beat.voiceLine,
    voiceLine: beat.dialogue || beat.voiceLine,
    deliveryMode: item.deliveryMode || 'caption_talk',
    batchBrief: item.batchBrief || null,
  };
  return {
    ...beat,
    dialogue: plate.dialogue,
    imagePrompt: buildImagePrompt(plate, { styleId: item.styleId }),
    videoPrompt: buildVideoPrompt(
      { ...plate, styleVideoBlock: item.styleVideoBlock },
      { styleId: item.styleId, beatRole: beat.role }
    ),
  };
}

function materialize(
  idea,
  { styleId, flowId, storyMode, videoModelId, brandChrome, batchBrief } = {}
) {
  const brand = getBrand();
  const formatMeta = formats[idea.format];
  const resolvedStyle =
    styleId || idea.styleId || brand.defaultVideoStyleId || 'documentary_commercial';
  const resolvedVideoModel = getVideoModel(
    videoModelId || idea.videoModelId || brand.defaultVideoModelId || 'grok'
  );
  // organic default for volume TikTok/IG; ads modes only when operator picks them
  const resolvedChrome =
    brandChrome ||
    idea.brandChrome ||
    brand.defaultBrandChrome ||
    'organic';
  const resolvedBrief = (batchBrief || idea.batchBrief || '').trim() || null;

  let item = {
    id: uid(),
    ideaId: idea.id || null,
    priority: idea.priority || 0,
    status: 'idea', // idea | generating | ready | approved | published | error
    createdAt: new Date().toISOString(),
    pillar: idea.pillar,
    pillarLabel: pillars[idea.pillar]?.label || idea.pillar,
    format: idea.format,
    formatLabel: formatMeta.label,
    aspectRatio: formatMeta.aspectRatio,
    size: formatMeta.size,
    platforms: formatMeta.platforms,
    headline: idea.headline,
    body: idea.body,
    caption: idea.caption,
    cta: idea.cta || brand.primaryCta,
    brandChrome: resolvedChrome,
    batchBrief: resolvedBrief,
    imageSubject: idea.imageSubject,
    tensionSubject: idea.tensionSubject || null,
    resolveSubject: idea.resolveSubject || null,
    videoMotion: idea.videoMotion,
    dialogueHook: idea.dialogueHook || null,
    dialogueTension: idea.dialogueTension || null,
    dialogueResolve: idea.dialogueResolve || null,
    hookKeyword: idea.hookKeyword || null,
    tensionKeyword: idea.tensionKeyword || null,
    resolveKeyword: idea.resolveKeyword || null,
    videoModelId: resolvedVideoModel.id,
    videoModelLabel: resolvedVideoModel.label,
    videoProvider: resolvedVideoModel.provider,
    imagePrompt: null,
    videoPrompt: null,
    imageUrl: null,
    videoUrl: null,
    finalVideoUrl: null,
    composedVideoUrl: null,
    slides: (idea.slides || []).map((s, idx) => ({
      id: `${uid()}-s${idx}`,
      headline: s.headline,
      body: s.body,
      imageSubject: s.imageSubject,
      imagePrompt: null,
      imageUrl: null,
    })),
    beats: [],
    flowId: null,
    flowLabel: null,
    storyMode: false,
    hyperframesProject: null,
    error: null,
    approvedAt: null,
    publishedAt: null,
    uploadPostRequestId: null,
  };

  item = applyStyleFields(item, resolvedStyle);

  // Multi-beat story reels
  const wantsStory =
    storyMode ||
    idea.storyMode ||
    idea.format === 'reel' ||
    false;

  if (idea.format === 'reel' && wantsStory) {
    const resolvedFlow = flowId || idea.flowId || brand.defaultFlowId || inferFlowId(idea);
    const expanded = expandBeats(
      {
        ...idea,
        cta: item.cta,
        oneLiner: brand.oneLiner,
        deliveryMode: idea.deliveryMode || brand.defaultDeliveryMode || 'caption_talk',
      },
      { flowId: resolvedFlow, styleId: item.styleId }
    );
    item.flowId = expanded.flowId;
    item.flowLabel = expanded.flowLabel;
    item.deliveryMode = expanded.deliveryMode || brand.defaultDeliveryMode || 'caption_talk';
    // Kling native audio is paid opt-in. Grok speech is free via dialogue-in-prompt.
    item.generateAudio = idea.generateAudio === true;
    item.mixExternalVo = false;
    // Studio default: captions from Whisper ASR of plate speech (not script)
    item.useAsrCaptions = idea.useAsrCaptions !== false;
    item.storyMode = expanded.beats.length > 1;
    item.formatLabel = item.storyMode ? 'Story reel' : formatMeta.label;
    item.storyScript = expanded.storyScript || null;
    item.beats = expanded.beats.map((b) => materializeBeatPrompts(item, b));
    item.imageSubject = item.beats[0]?.imageSubject || item.imageSubject;
    item.videoMotion = item.beats[0]?.videoMotion || item.videoMotion;

    const avgDur =
      item.beats.reduce((s, b) => s + (Number(b.durationSec) || 5), 0) /
      Math.max(1, item.beats.length) || 5;
    item.costEstimate = estimateVideoCost({
      modelId: item.videoModelId,
      beatCount: item.beats.length,
      durationSec: avgDur,
      generateAudio: item.generateAudio,
    });
  }

  item.imagePrompt = buildImagePrompt(item, { styleId: item.styleId });
  item.videoPrompt = buildVideoPrompt(item, { styleId: item.styleId });
  item.slides = item.slides.map((s) => ({
    ...s,
    imagePrompt: buildImagePrompt(
      {
        ...item,
        headline: s.headline,
        imageSubject: s.imageSubject,
      },
      { styleId: item.styleId }
    ),
  }));

  return item;
}

export function listPacks() {
  return Object.values(PACKS).map(({ id, label, description }) => ({ id, label, description }));
}

/**
 * Generate a content batch.
 * options: { styleId, flowId, storyMode }
 */
function resolveIdeaPool(brand) {
  // Taskiz client keeps its handcrafted GTM bank; everyone else is Brand OS–derived
  if (brand?.id === 'taskiz' || brand?.ideaSource === 'builtin:taskiz') {
    return TASKIZ_IDEA_POOL;
  }
  return buildBrandIdeaPool(brand || getBrand());
}

export function generateBatch(packId = 'weekly', options = {}) {
  const pack = PACKS[packId] || PACKS.weekly;
  const brand = getBrand();
  const selected = pack.pick(resolveIdeaPool(brand));
  const storyMode = options.storyMode ?? (packId === 'stories' || packId === 'reels');
  const videoModelId = options.videoModelId || getBrand().defaultVideoModelId || 'grok';
  const batchBrief = (options.batchBrief || options.brief || '').trim() || null;
  return {
    packId: pack.id,
    packLabel: pack.label,
    generatedAt: new Date().toISOString(),
    brandNote: getBrand().oneLiner,
    styleId: options.styleId || getBrand().defaultVideoStyleId,
    flowId: options.flowId || getBrand().defaultFlowId,
    videoModelId,
    brandChrome: options.brandChrome || getBrand().defaultBrandChrome || 'organic',
    batchBrief,
    batchMode: options.batchMode || (batchBrief ? 'prompt' : 'auto'),
    items: selected.map((idea) =>
      materialize(idea, {
        styleId: options.styleId,
        flowId: options.flowId,
        storyMode,
        videoModelId,
        brandChrome: options.brandChrome,
        batchBrief,
      })
    ),
  };
}

/** Re-apply style/flow to an existing queue item (server helper) */
export function rematerializeItem(item, { styleId, flowId, brandChrome } = {}) {
  const script = item.storyScript || {};
  const idea = {
    pillar: item.pillar,
    format: item.format,
    headline: item.headline,
    body: item.body,
    caption: item.caption,
    cta: item.cta,
    imageSubject: item.imageSubject,
    videoMotion: item.videoMotion,
    slides: item.slides,
    beats: item.beats,
    flowId: flowId || item.flowId,
    styleId: styleId || item.styleId,
    storyMode: true,
    deliveryMode: item.deliveryMode,
    generateAudio: item.generateAudio === true,
    brandChrome: brandChrome || item.brandChrome,
    dialogueHook: script.dialogueHook || item.dialogueHook,
    dialogueTension: script.dialogueTension || item.dialogueTension,
    dialogueResolve: script.dialogueResolve || item.dialogueResolve,
    hookKeyword: item.hookKeyword || item.beats?.[0]?.keyword,
    tensionKeyword: item.tensionKeyword || item.beats?.[1]?.keyword,
    resolveKeyword: item.resolveKeyword || item.beats?.[2]?.keyword,
    tensionSubject: item.tensionSubject || item.beats?.[1]?.imageSubject,
    resolveSubject: item.resolveSubject || item.beats?.[2]?.imageSubject,
  };
  const next = materialize(idea, {
    styleId: styleId || item.styleId,
    flowId: flowId || item.flowId,
    brandChrome: brandChrome || item.brandChrome,
    storyMode: item.format === 'reel',
  });
  // preserve media + ids where possible
  next.id = item.id;
  next.status = item.status;
  next.imageUrl = item.imageUrl;
  next.videoUrl = item.videoUrl;
  next.finalVideoUrl = item.finalVideoUrl;
  next.composedVideoUrl = item.composedVideoUrl;
  next.approvedAt = item.approvedAt;
  next.publishedAt = item.publishedAt;
  if (item.beats?.length && next.beats?.length) {
    next.beats = next.beats.map((b, i) => ({
      ...b,
      imageUrl: item.beats[i]?.imageUrl || null,
      videoUrl: item.beats[i]?.videoUrl || null,
      status: item.beats[i]?.imageUrl ? 'ready' : b.status,
    }));
  }
  return next;
}

export function getFlowMeta(flowId) {
  return getFlow(flowId);
}
