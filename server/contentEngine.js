import {
  getBrand,
  getBrandPublic,
  pillars,
  formats,
  buildImagePrompt,
  buildVideoPrompt,
} from './brand.js';
import { getVideoStyle, styleDirectorBrief } from './videoStyles.js';
import {
  brandTalkSubjects,
  brandTalkCharacter,
  brandCastVariant,
  brandAdaptStylePack,
} from './brandCast.js';
import { expandBeats, getFlow, inferFlowId } from './flows.js';
import { getVideoModel, estimateVideoCost } from './videoModels.js';

export { getBrandPublic };
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Camera / performance variety — never reuse the same push-in on every reel in a batch.
 * Index into this list per idea so auto batches feel like different creative ideas.
 */
const CAMERA_MOTIONS = [
  'locked-off medium close-up talking head; micro natural sway only; no push-in',
  'slow handheld drift left, peer-to-peer UGC energy, keep face readable',
  'gentle push-in on the face during the key emotional word only',
  'start wider on environment then soft reframe into medium close-up',
  'slight pull-back reveal of workspace then hold on eyes',
  'low angle confident address; subtle upward tilt; strong eye contact',
  'side-window light; slow pan into face; documentary calm',
  'tight crop (eyes/mouth) then pull to medium; energetic confession',
  'over-shoulder start then whip-soft reframe to lens; intimate',
  'static three-quarter angle; subject turns toward camera mid-line',
  'parallax ambient only (hair, fabric, light); body stays rooted',
  'step-in walk-and-talk feel then stop and land the line to camera',
];

/**
 * Multi-angle talk scripts for any Brand OS workspace.
 * EVERY angle has fully unique hook + tension + resolve (never the same brand one-liner for all).
 * body/caption on the card also come from this script — not a shared supporting paragraph.
 */
function buildBrandReelAngles(brand) {
  const name = brand.name || 'this';
  const one = brand.oneLiner || brand.promise || '';
  const cta = brand.primaryCta || brand.ctas?.[0] || 'Learn more';
  const features = brand.keyFeatures || [];
  const phrases = brand.buyerPhrases || [];
  const icpList = [...(brand.icp?.primary || []), ...(brand.icp?.secondary || [])].filter(Boolean);
  const icp0 = icpList[0] || 'people like me';
  const icp1 = icpList[1] || icp0;
  const f0 = features[0] || phrases[1] || 'the real work';
  const f1 = features[1] || phrases[2] || 'clearer next steps';
  const f2 = features[2] || phrases[3] || 'community';
  const promise = brand.promise || one || `a clearer path with ${name}`;
  const price = brand.pricingModel || '';
  // Short spoken brand beat (not a long marketing paragraph)
  const spokenBrand = shortSpokenBrand(one || promise, name);

  const angles = [
    {
      id: 'angle-hard-way',
      pillar: 'pain',
      priority: 100,
      headline: 'I kept doing it the hard way',
      dialogueHook: `I kept doing it the hard way.`,
      dialogueTension: `It was costing me nights, focus, and money I did not have to waste.`,
      dialogueResolve: `I stopped guessing. ${spokenBrand}. ${cta}.`,
      hookKeyword: 'Hard way',
      tensionKeyword: 'Nights and money',
      resolveKeyword: cta,
      scene: 'candid confession, slightly tired but sharp',
    },
    {
      id: 'angle-alone',
      pillar: 'pain',
      priority: 95,
      headline: 'Figured it out alone',
      dialogueHook: `For a long time I figured everything out alone.`,
      dialogueTension: `No map. Just trial and error and a lot of second-guessing.`,
      dialogueResolve: `I do not do this alone anymore. ${spokenBrand}. ${cta}.`,
      hookKeyword: 'Alone',
      tensionKeyword: 'No map',
      resolveKeyword: name,
      scene: 'quiet resolve, peer energy, soft daylight',
    },
    {
      id: 'angle-icp-seen',
      pillar: 'pain',
      priority: 94,
      headline: `Built for ${icp0}`,
      dialogueHook: `If you know what it is like as ${icp0.toLowerCase()}, you know this feeling.`,
      dialogueTension: `Most tools were built for somebody else. Not for how we actually work.`,
      dialogueResolve: `${name} actually feels built for ${icp0.toLowerCase()}. ${cta}.`,
      hookKeyword: 'You know',
      tensionKeyword: "Not for us",
      resolveKeyword: name,
      scene: 'direct address, knowing smile, mid-speech',
    },
    {
      id: 'angle-icp-alt',
      pillar: 'trust',
      priority: 90,
      headline: `For ${icp1}`,
      dialogueHook: `I do not need another generic platform.`,
      dialogueTension: `I need people and guidance that understand ${icp1.toLowerCase()}.`,
      dialogueResolve: `That is why I showed up for ${name}. Real fit. ${cta}.`,
      hookKeyword: 'Not generic',
      tensionKeyword: 'Need fit',
      resolveKeyword: name,
      scene: 'confident peer, creative workspace',
    },
    {
      id: 'angle-feature-0',
      pillar: 'education',
      priority: 88,
      headline: shortClip(f0, 42),
      dialogueHook: `Here is what actually moved the needle for me.`,
      dialogueTension: `Not hype. ${f0}.`,
      dialogueResolve: `I get that inside ${name} now. ${cta}.`,
      hookKeyword: 'What worked',
      tensionKeyword: shortClip(f0, 22),
      resolveKeyword: name,
      scene: 'teaching energy, calm authority',
    },
    {
      id: 'angle-feature-1',
      pillar: 'demo',
      priority: 86,
      headline: shortClip(f1, 42),
      dialogueHook: `I used to wing the decisions that mattered.`,
      dialogueTension: `Then I got ${f1.toLowerCase()}, and the fog lifted.`,
      dialogueResolve: `Clearer calls. Faster moves. That is ${name}. ${cta}.`,
      hookKeyword: 'Winged it',
      tensionKeyword: shortClip(f1, 22),
      resolveKeyword: cta,
      scene: 'aha moment, brighter expression',
    },
    {
      id: 'angle-community',
      pillar: 'trust',
      priority: 85,
      headline: shortClip(f2, 42),
      dialogueHook: `Doing this in isolation will burn you out.`,
      dialogueTension: `I needed ${f2.toLowerCase()}. Real people. Not empty feeds.`,
      dialogueResolve: `I found that room in ${name}. Come see it. ${cta}.`,
      hookKeyword: 'Isolation',
      tensionKeyword: shortClip(f2, 22),
      resolveKeyword: name,
      scene: 'warm peer energy, collaborative vibe',
    },
    {
      id: 'angle-phrase',
      pillar: 'demo',
      priority: 84,
      headline: shortClip(phrases[0] || one || name, 42),
      dialogueHook: phrases[0]
        ? `Three words I keep coming back to: ${phrases[0]}.`
        : `I needed a simpler story for what I do.`,
      dialogueTension: phrases[1]
        ? `${phrases[1]}. Without the fluff.`
        : `Clarity beats hustle theater every time.`,
      dialogueResolve: phrases[2]
        ? `${phrases[2]}. That is ${name}. ${cta}.`
        : `Simple path. Real community. ${name}. ${cta}.`,
      hookKeyword: shortClip(phrases[0] || 'Clarity', 20),
      tensionKeyword: shortClip(phrases[1] || 'No fluff', 20),
      resolveKeyword: name,
      scene: 'slogan energy, crisp delivery',
    },
    {
      id: 'angle-before-after',
      pillar: 'before_after',
      priority: 83,
      headline: 'Before vs after',
      dialogueHook: `Before: scattered. Guessing. Always behind.`,
      dialogueTension: `I was tired of restarting the same problems every month.`,
      dialogueResolve: `After: clearer path, better people, ${name}. ${cta}.`,
      hookKeyword: 'Before',
      tensionKeyword: 'Restarting',
      resolveKeyword: 'After',
      scene: 'contrast energy, heavier then lighter',
    },
    {
      id: 'angle-offer',
      pillar: 'trust',
      priority: 82,
      headline: cta,
      dialogueHook: `I am not here to sell you a fantasy.`,
      dialogueTension: price
        ? `I am here for a real path. ${price}.`
        : `I am here for a real path, not overnight promises.`,
      dialogueResolve: `Come look at ${name} with clear eyes. ${cta}.`,
      hookKeyword: 'No fantasy',
      tensionKeyword: 'Real path',
      resolveKeyword: cta,
      scene: 'honest closer, soft smile, CTA energy',
    },
    {
      id: 'angle-myth',
      pillar: 'education',
      priority: 80,
      headline: 'The myth',
      dialogueHook: `There is a myth that you have to figure this out alone.`,
      dialogueTension: `Or wait until someone discovers you.`,
      dialogueResolve: `${name} is the opposite of that myth. ${cta}.`,
      hookKeyword: 'The myth',
      tensionKeyword: 'Wait around',
      resolveKeyword: name,
      scene: 'myth-busting, slightly confrontational then open',
    },
    {
      id: 'angle-time',
      pillar: 'pain',
      priority: 78,
      headline: 'Time tax',
      dialogueHook: `The hidden tax is time. Nights and weekends.`,
      dialogueTension: `I was paying it without even noticing.`,
      dialogueResolve: `I want my time back. ${spokenBrand}. ${cta}.`,
      hookKeyword: 'Time tax',
      tensionKeyword: 'Paying it',
      resolveKeyword: name,
      scene: 'late-day light, reflective',
    },
  ];

  // Attach unique body/caption from the spoken script (for queue UI)
  return angles.map((a) => ({
    ...a,
    body: [a.dialogueHook, a.dialogueTension, a.dialogueResolve].join(' '),
    caption: [a.dialogueHook, a.dialogueTension, a.dialogueResolve, cta].join('\n\n'),
  }));
}

/** Short first-person brand beat — never dump the full supporting paragraph */
function shortSpokenBrand(oneOrPromise, name) {
  let t = String(oneOrPromise || name || '')
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, ', ')
    .trim();
  if (!t) return name;
  // Keep spoken line short (1 clause)
  if (t.length > 90) {
    t = t.slice(0, 87).replace(/\s+\S*$/, '').trim();
    if (!/[.!?]$/.test(t)) t = `${t}`;
  }
  return t;
}

function shortClip(s, max = 24) {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Generic idea pool from active Brand OS (any client).
 * Many distinct reel angles so auto batches are not 6 copies of one script + push-in.
 */
function buildBrandIdeaPool(brand) {
  const name = brand.name || 'the product';
  const oneLiner = brand.oneLiner || brand.promise || '';
  const cta = brand.primaryCta || brand.ctas?.[0] || 'Learn more';
  const features = brand.keyFeatures || [];
  const icp = (brand.icp?.primary || [])[0] || 'your customer';
  const photo =
    brand.photographyStyle ||
    'documentary commercial photography, authentic subjects, natural light';
  const cast = brandTalkCharacter(brand);
  const flowId = brand.defaultFlowId || 'pain_to_cta';
  const styleId = brand.defaultVideoStyleId || 'documentary_commercial';
  const deliveryMode = brand.defaultDeliveryMode || 'caption_talk';

  const posts = [
    {
      pillar: 'pain',
      format: 'post',
      headline: `Still fighting the old way?`,
      body: oneLiner || `There's a clearer path with ${name}.`,
      caption: `${oneLiner}\n\n${brand.supporting || ''}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Photoreal scene for ${name}: ${icp} in ${cast.environment}, moment of friction, ${photo}, intentional negative space`,
      videoMotion: CAMERA_MOTIONS[0],
    },
    {
      pillar: 'demo',
      format: 'post',
      headline: oneLiner || name,
      body: brand.supporting || brand.promise || oneLiner,
      caption: `${brand.supporting || oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Product or outcome moment for ${name} with ${icp}, ${cast.environment}, ${photo}, clean composition for later text`,
      videoMotion: CAMERA_MOTIONS[2],
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
      videoMotion: CAMERA_MOTIONS[6],
    },
    {
      pillar: 'trust',
      format: 'post',
      headline: `Built for ${icp}`,
      body: brand.promise || oneLiner,
      caption: `${oneLiner}\n\n${cta}`.trim(),
      cta,
      imageSubject: `Trust-building authentic moment for ${name} · ${icp}, ${photo}`,
      videoMotion: CAMERA_MOTIONS[5],
    },
  ];

  const reels = buildBrandReelAngles(brand).map((angle, i) => {
    const motion = CAMERA_MOTIONS[i % CAMERA_MOTIONS.length];
    // Unique person + room per reel (continuity only inside the 3 beats)
    const castV = brandCastVariant(brand, i);
    const talk = brandTalkSubjects(
      brand,
      `${castV.environment}, ${castV.wardrobe}, ${angle.scene}, mid-speech, ${castV.light}`,
      `same exact person and wardrobe as hook beat, heavier emotion, mid-speech, ${castV.environment}`,
      `same exact person and wardrobe as hook beat, calmer resolve, clean lower third, ${castV.environment}`,
      castV
    );
    return {
      id: angle.id,
      priority: angle.priority,
      pillar: angle.pillar,
      format: 'reel',
      flowId,
      styleId,
      deliveryMode,
      headline: angle.headline,
      // Card copy = unique spoken script (never shared brand.supporting for every reel)
      body:
        angle.body ||
        [angle.dialogueHook, angle.dialogueTension, angle.dialogueResolve].join(' '),
      caption:
        angle.caption ||
        [angle.dialogueHook, angle.dialogueTension, angle.dialogueResolve, cta].join('\n\n'),
      cta,
      dialogueHook: angle.dialogueHook,
      dialogueTension: angle.dialogueTension,
      dialogueResolve: angle.dialogueResolve,
      hookKeyword: angle.hookKeyword,
      tensionKeyword: angle.tensionKeyword,
      resolveKeyword: angle.resolveKeyword,
      hookLine: angle.hookKeyword,
      tensionLine: angle.tensionKeyword,
      resolveLine: angle.resolveKeyword,
      videoMotion: motion,
      beatMotions: [
        motion,
        CAMERA_MOTIONS[(i + 3) % CAMERA_MOTIONS.length],
        CAMERA_MOTIONS[(i + 7) % CAMERA_MOTIONS.length],
      ],
      creativeAngle: angle.id,
      castVariantIndex: i,
      castId: castV.castId,
      batchIndex: i,
      ...talk,
    };
  });

  return [...posts, ...reels];
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
      return [
        ...shuffle(posts).slice(0, 3),
        ...shuffle(carousels).slice(0, 2),
        ...pickDistinctReels(pool, 3),
      ];
    },
  },
  beta: {
    id: 'beta',
    label: 'Beta launch pack',
    description: 'Acquisition-focused creatives for founder outreach + social.',
    pick: (pool) => {
      // Prefer distinct reels (message tests) + a couple posts
      const reels = pickDistinctReels(pool, 4);
      const posts = shuffle(
        pool.filter((i) => i.format === 'post' && ['pain', 'demo', 'trust'].includes(i.pillar))
      ).slice(0, 2);
      return [...reels, ...posts].slice(0, 6);
    },
  },
  paid: {
    id: 'paid',
    label: 'Paid ad test pack',
    description: '5 message angles as posts + reels for Meta testing.',
    pick: (pool) => {
      const reels = pickDistinctReels(pool, 4);
      const posts = shuffle(pool.filter((i) => i.format === 'post')).slice(0, 2);
      return [...reels, ...posts].slice(0, 5);
    },
  },
  reels: {
    id: 'reels',
    label: 'Reels only',
    description: 'Vertical short-form ideas ready to generate + animate.',
    // Prefer unique creative angles (not the same script six times)
    pick: (pool) => pickDistinctReels(pool, 6),
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
    pick: (pool) => pickDistinctReels(pool, 6),
  },
};

/**
 * Pick up to n reel ideas with distinct creative angles.
 * Shuffles + rotates so consecutive auto batches are NOT the same 4–6 scripts every time.
 */
function pickDistinctReels(pool, n = 6) {
  const reels = pool.filter((i) => i.format === 'reel');
  if (!reels.length) return [];

  // Deduplicate by angle id
  const byKey = new Map();
  for (const idea of reels) {
    const key = idea.creativeAngle || idea.id || idea.dialogueHook || idea.headline;
    if (!byKey.has(key)) byKey.set(key, idea);
  }
  let unique = [...byKey.values()];

  // Rotate starting point so batch #1 ≠ batch #2 ≠ batch #3
  const rot = nextBatchRotation(unique.length);
  unique = unique.slice(rot).concat(unique.slice(0, rot));

  // Then shuffle so order isn't a fixed priority list every time
  unique = shuffle(unique);

  return unique.slice(0, Math.min(n, unique.length));
}

/** In-memory rotation so each generateBatch call advances the window */
let _reelBatchTick = 0;
function nextBatchRotation(mod) {
  if (!mod || mod < 1) return 0;
  _reelBatchTick = (_reelBatchTick + 1) % 100000;
  // mix tick with time so restarts still feel random
  return (_reelBatchTick + Math.floor(Date.now() / 1000)) % mod;
}

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
    castId: item.castId || beat.castId || null,
    castVariantIndex: item.castVariantIndex ?? beat.castVariantIndex ?? null,
    batchIndex: item.batchIndex ?? null,
  };
  return {
    ...beat,
    dialogue: plate.dialogue,
    castId: plate.castId,
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
    castId: idea.castId || null,
    castVariantIndex: idea.castVariantIndex ?? idea.batchIndex ?? null,
    creativeAngle: idea.creativeAngle || idea.id || null,
    batchIndex: idea.batchIndex ?? options.batchIndex ?? null,
    beatMotions: idea.beatMotions || null,
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
  // Auto-vary is default for platform batches (UI diversify flag can force)
  const diversify = options.diversify !== false;

  const items = selected.map((idea, index) => {
    const varied = diversify ? diversifyIdeaForBatch(idea, index, selected.length) : idea;
    return materialize(varied, {
      styleId: options.styleId,
      flowId: options.flowId,
      storyMode,
      videoModelId,
      brandChrome: options.brandChrome,
      batchBrief,
      batchIndex: index,
    });
  });

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
    diversify,
    items,
  };
}

/**
 * Extra per-item variety: camera, cast/setting, AND spoken line variants
 * so consecutive batches don't recycle identical wording.
 */
function diversifyIdeaForBatch(idea, index, batchSize = 6) {
  if (!idea || idea.format !== 'reel') return idea;
  const brand = getBrand();
  const motion = CAMERA_MOTIONS[index % CAMERA_MOTIONS.length];
  const beatMotions = idea.beatMotions || [
    CAMERA_MOTIONS[index % CAMERA_MOTIONS.length],
    CAMERA_MOTIONS[(index + 4) % CAMERA_MOTIONS.length],
    CAMERA_MOTIONS[(index + 8) % CAMERA_MOTIONS.length],
  ];

  // Cast: offset by batch tick so same angle on next batch can get a new face
  const castSlot = (idea.castVariantIndex ?? index) + _reelBatchTick;
  const castV = brandCastVariant(brand, castSlot);
  const talk = brandTalkSubjects(
    brand,
    `${castV.environment}, ${castV.wardrobe}, mid-speech, ${castV.light}`,
    `same exact person and wardrobe as hook, heavier emotion, ${castV.environment}`,
    `same exact person and wardrobe as hook, calmer resolve, clean lower third, ${castV.environment}`,
    castV
  );

  // Spoken script: pick an alternate wording for this angle (or paraphrase seed)
  const script = pickScriptVariant(idea, brand, index + _reelBatchTick);

  return {
    ...idea,
    ...talk,
    ...script,
    body: script.body,
    caption: script.caption,
    videoMotion: idea.videoMotion || motion,
    beatMotions,
    batchIndex: index,
    batchSize,
    castVariantIndex: castV.variantIndex,
    castId: castV.castId,
    creativeAngle: idea.creativeAngle || idea.id || `batch-${index}`,
    scriptVariant: script.scriptVariant,
  };
}

/**
 * Alternate spoken lines per creative angle.
 * Same angle family can still sound different across batches.
 */
function pickScriptVariant(idea, brand, salt = 0) {
  const name = brand.name || 'this';
  const cta = idea.cta || brand.primaryCta || 'Learn more';
  const one = brand.oneLiner || brand.promise || '';
  const spokenBrand = shortSpokenBrand(one, name);
  const angle = idea.creativeAngle || idea.id || 'default';
  const variants = SCRIPT_VARIANTS[angle] || null;

  let hook = idea.dialogueHook;
  let tension = idea.dialogueTension;
  let resolve = idea.dialogueResolve;

  if (variants?.length) {
    const v = variants[Math.abs(salt) % variants.length];
    hook = fillScript(v.hook, { name, cta, spokenBrand, brand });
    tension = fillScript(v.tension, { name, cta, spokenBrand, brand });
    resolve = fillScript(v.resolve, { name, cta, spokenBrand, brand });
  } else {
    // Generic paraphrase bank when angle has no dedicated variants
    const bank = GENERIC_SCRIPT_SPINS;
    const spin = bank[Math.abs(salt) % bank.length];
    hook = spin.hook(hook, { name, cta });
    tension = spin.tension(tension, { name, cta });
    resolve = spin.resolve(resolve, { name, cta, spokenBrand });
  }

  // Scrub em dashes from spoken copy
  const scrub = (s) =>
    String(s || '')
      .replace(/[—–]/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  hook = scrub(hook);
  tension = scrub(tension);
  resolve = scrub(resolve);

  return {
    dialogueHook: hook,
    dialogueTension: tension,
    dialogueResolve: resolve,
    body: [hook, tension, resolve].join(' '),
    caption: [hook, tension, resolve, cta].join('\n\n'),
    headline: idea.headline || shortClip(hook, 42),
    scriptVariant: Math.abs(salt) % 8,
  };
}

function fillScript(template, ctx) {
  if (typeof template === 'function') return template(ctx);
  return String(template || '')
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{cta\}/g, ctx.cta)
    .replace(/\{spokenBrand\}/g, ctx.spokenBrand)
    .replace(
      /\{icp\}/g,
      String((ctx.brand?.icp?.primary || [])[0] || 'people like me').toLowerCase()
    )
    .replace(
      /\{icp2\}/g,
      String(
        (ctx.brand?.icp?.primary || [])[1] ||
          (ctx.brand?.icp?.primary || [])[0] ||
          'creators'
      ).toLowerCase()
    )
    .replace(
      /\{f0\}/g,
      String((ctx.brand?.keyFeatures || [])[0] || 'the real work').toLowerCase()
    )
    .replace(
      /\{f1\}/g,
      String((ctx.brand?.keyFeatures || [])[1] || 'clearer next steps').toLowerCase()
    )
    .replace(
      /\{f2\}/g,
      String((ctx.brand?.keyFeatures || [])[2] || 'community').toLowerCase()
    )
    .replace(/\{price\}/g, ctx.brand?.pricingModel || 'a fair path');
}

/** Per-angle alternate scripts (3+ variants each) */
const SCRIPT_VARIANTS = {
  'angle-hard-way': [
    {
      hook: 'I kept doing it the hard way.',
      tension: 'It was costing me nights, focus, and money I did not have to waste.',
      resolve: 'I stopped guessing. {spokenBrand}. {cta}.',
    },
    {
      hook: 'I used to make everything harder than it needed to be.',
      tension: 'Every week felt like starting over with half the information.',
      resolve: 'I chose a clearer path with {name}. {cta}.',
    },
    {
      hook: 'Hard mode was my default for years.',
      tension: 'I thought struggle meant I was serious. It just meant I was stuck.',
      resolve: '{name} helped me drop the struggle. {cta}.',
    },
  ],
  'angle-alone': [
    {
      hook: 'For a long time I figured everything out alone.',
      tension: 'No map. Just trial and error and a lot of second-guessing.',
      resolve: 'I do not do this alone anymore. {spokenBrand}. {cta}.',
    },
    {
      hook: 'I was my own entire team. That sounds brave. It was lonely.',
      tension: 'Nobody to ask. Nobody to check my thinking.',
      resolve: 'Now I have a place that actually backs me. {name}. {cta}.',
    },
    {
      hook: 'Solo only works until it does not.',
      tension: 'I hit a wall where advice from random feeds was not enough.',
      resolve: 'I found real guidance inside {name}. {cta}.',
    },
  ],
  'angle-icp-seen': [
    {
      hook: 'If you know what it is like as {icp}, you know this feeling.',
      tension: 'Most tools were built for somebody else. Not for how we actually work.',
      resolve: '{name} actually feels built for {icp}. {cta}.',
    },
    {
      hook: 'I am tired of products that ignore {icp}.',
      tension: 'The industry talks at us, not with us.',
      resolve: '{name} talks to how we really move. {cta}.',
    },
    {
      hook: 'Being {icp} should not mean piecing everything together yourself.',
      tension: 'I needed a room that already understood the path.',
      resolve: 'That room is {name}. {cta}.',
    },
  ],
  'angle-icp-alt': [
    {
      hook: 'I do not need another generic platform.',
      tension: 'I need people and guidance that understand {icp2}.',
      resolve: 'That is why I showed up for {name}. Real fit. {cta}.',
    },
    {
      hook: 'Generic advice made me slower, not smarter.',
      tension: 'I needed something specific to {icp2}.',
      resolve: '{name} is specific. That is the difference. {cta}.',
    },
    {
      hook: 'I outgrew the one-size-fits-all apps.',
      tension: 'My work as {icp2} needs a different kind of support.',
      resolve: 'I get that support in {name}. {cta}.',
    },
  ],
  'angle-feature-0': [
    {
      hook: 'Here is what actually moved the needle for me.',
      tension: 'Not hype. {f0}.',
      resolve: 'I get that inside {name} now. {cta}.',
    },
    {
      hook: 'I stopped chasing shiny objects.',
      tension: 'I focused on {f0}, and things started clicking.',
      resolve: '{name} is where I keep that focus. {cta}.',
    },
    {
      hook: 'The unlock was not more hustle.',
      tension: 'It was {f0}.',
      resolve: 'That is the point of {name}. {cta}.',
    },
  ],
  'angle-feature-1': [
    {
      hook: 'I used to wing the decisions that mattered.',
      tension: 'Then I got {f1}, and the fog lifted.',
      resolve: 'Clearer calls. Faster moves. That is {name}. {cta}.',
    },
    {
      hook: 'Big decisions used to keep me up.',
      tension: '{f1} gave me something solid to lean on.',
      resolve: 'I lean on {name} for that now. {cta}.',
    },
    {
      hook: 'Guesswork is expensive.',
      tension: 'I replaced it with {f1}.',
      resolve: 'You can too inside {name}. {cta}.',
    },
  ],
  'angle-community': [
    {
      hook: 'Doing this in isolation will burn you out.',
      tension: 'I needed {f2}. Real people. Not empty feeds.',
      resolve: 'I found that room in {name}. Come see it. {cta}.',
    },
    {
      hook: 'I thought I could network my way alone.',
      tension: 'Turns out {f2} is the missing layer.',
      resolve: '{name} is where that layer lives. {cta}.',
    },
    {
      hook: 'Talent is not the bottleneck. Isolation is.',
      tension: 'I needed peers and pros in one place.',
      resolve: 'That is {name}. {cta}.',
    },
  ],
  'angle-phrase': [
    {
      hook: 'I needed a simpler story for what I do.',
      tension: 'Clarity beats hustle theater every time.',
      resolve: 'Simple path. Real community. {name}. {cta}.',
    },
    {
      hook: 'My old pitch was messy because my system was messy.',
      tension: 'I cleaned up how I create, consult, and connect.',
      resolve: 'That cleanup started with {name}. {cta}.',
    },
    {
      hook: 'I stopped overcomplicating my path.',
      tension: 'One clear motion. Repeat it.',
      resolve: '{name} keeps me on that motion. {cta}.',
    },
  ],
  'angle-before-after': [
    {
      hook: 'Before: scattered. Guessing. Always behind.',
      tension: 'I was tired of restarting the same problems every month.',
      resolve: 'After: clearer path, better people, {name}. {cta}.',
    },
    {
      hook: 'Before looked busy. It was not progress.',
      tension: 'I kept spinning the same wheels.',
      resolve: 'After looks calmer and moves faster. {name}. {cta}.',
    },
    {
      hook: 'I can show you before and after in one sentence.',
      tension: 'Before: alone and loud. After: supported and clear.',
      resolve: 'The after is {name}. {cta}.',
    },
  ],
  'angle-offer': [
    {
      hook: 'I am not here to sell you a fantasy.',
      tension: 'I am here for a real path. {price}.',
      resolve: 'Come look at {name} with clear eyes. {cta}.',
    },
    {
      hook: 'No overnight promises. I mean that.',
      tension: 'Just a practical next step that respects your craft.',
      resolve: '{name} is that step. {cta}.',
    },
    {
      hook: 'If you want magic tricks, keep scrolling.',
      tension: 'If you want a real system, stay with me.',
      resolve: 'Start with {name}. {cta}.',
    },
  ],
  'angle-myth': [
    {
      hook: 'There is a myth that you have to figure this out alone.',
      tension: 'Or wait until someone discovers you.',
      resolve: '{name} is the opposite of that myth. {cta}.',
    },
    {
      hook: 'Nobody is coming to discover you while you stay invisible and isolated.',
      tension: 'The myth keeps people waiting instead of building.',
      resolve: 'I build in public with {name}. {cta}.',
    },
    {
      hook: 'The lone genius story is a trap.',
      tension: 'Real careers are built with information and people.',
      resolve: '{name} is both. {cta}.',
    },
  ],
  'angle-time': [
    {
      hook: 'The hidden tax is time. Nights and weekends.',
      tension: 'I was paying it without even noticing.',
      resolve: 'I want my time back. {spokenBrand}. {cta}.',
    },
    {
      hook: 'I ran out of hours before I ran out of ambition.',
      tension: 'Something had to get simpler.',
      resolve: '{name} gave me hours back. {cta}.',
    },
    {
      hook: 'Time is the budget nobody tracks until it is gone.',
      tension: 'I started tracking mine. It was ugly.',
      resolve: 'Now I spend it wiser with {name}. {cta}.',
    },
  ],
};

const GENERIC_SCRIPT_SPINS = [
  {
    hook: (h) => h,
    tension: (t) => t,
    resolve: (r) => r,
  },
  {
    hook: (h) => (h.endsWith('.') ? h : `${h}.`),
    tension: (t) => `And it kept stacking up. ${t}`,
    resolve: (r, { name, cta }) => r || `That is when ${name} made sense. ${cta}.`,
  },
  {
    hook: (h) => `Real talk. ${h}`,
    tension: (t) => t,
    resolve: (r, { name, cta }) => `So I chose ${name}. ${cta}.`,
  },
];

/**
 * Regen spoken script on an existing story reel.
 * Keeps stills/videos on beats; clears assembled final so captions can be rebuilt.
 * Optionally rotates to a different creative angle for a totally new message.
 */
export function regenItemScript(item, { rotateAngle = true } = {}) {
  if (!item || item.format !== 'reel') {
    const err = new Error('Regen script is only available for story reels');
    err.status = 400;
    throw err;
  }

  const brand = getBrand();
  const salt = Date.now() + Math.floor(Math.random() * 1000);
  let seed = {
    creativeAngle: item.creativeAngle || item.ideaId || null,
    id: item.creativeAngle || item.id,
    dialogueHook: item.dialogueHook || item.storyScript?.dialogueHook || item.beats?.[0]?.dialogue,
    dialogueTension:
      item.dialogueTension || item.storyScript?.dialogueTension || item.beats?.[1]?.dialogue,
    dialogueResolve:
      item.dialogueResolve || item.storyScript?.dialogueResolve || item.beats?.[2]?.dialogue,
    cta: item.cta || brand.primaryCta,
    headline: item.headline,
  };

  // Prefer a different angle family so regen does not feel like a tiny paraphrase
  if (rotateAngle) {
    const pool = buildBrandReelAngles(brand);
    if (pool.length) {
      const cur = seed.creativeAngle;
      const others = pool.filter((a) => a.id !== cur);
      const pick = (others.length ? others : pool)[salt % (others.length || pool.length)];
      seed = {
        ...seed,
        creativeAngle: pick.id,
        id: pick.id,
        dialogueHook: pick.dialogueHook,
        dialogueTension: pick.dialogueTension,
        dialogueResolve: pick.dialogueResolve,
        headline: pick.headline,
        cta: item.cta || brand.primaryCta,
      };
    }
  }

  const script = pickScriptVariant(seed, brand, salt);
  const roles = ['hook', 'tension', 'resolve'];
  const dialogueByRole = {
    hook: script.dialogueHook,
    tension: script.dialogueTension,
    resolve: script.dialogueResolve,
  };

  const beats = (item.beats || []).map((beat, i) => {
    const role = beat.role || roles[i] || 'hook';
    const dialogue = dialogueByRole[role] || dialogueByRole.hook;
    const nextBeat = {
      ...beat,
      dialogue,
      voiceLine: dialogue,
      spokenCaption: dialogue,
      keyword: shortClip(dialogue, 28),
      title: shortClip(dialogue, 28),
      caption: dialogue,
      // keep stills / animated clips
      imageUrl: beat.imageUrl || null,
      videoUrl: beat.videoUrl || null,
      status: beat.imageUrl ? 'ready' : beat.status || 'idea',
      error: null,
    };
    // Refresh video prompt so animate uses the new line
    const plate = {
      ...item,
      format: 'reel',
      aspectRatio: '9:16',
      imageSubject: nextBeat.imageSubject,
      videoMotion: nextBeat.videoMotion,
      headline: nextBeat.title,
      dialogue,
      voiceLine: dialogue,
      deliveryMode: item.deliveryMode || 'caption_talk',
      batchBrief: item.batchBrief || null,
      castId: item.castId || null,
    };
    nextBeat.videoPrompt = buildVideoPrompt(
      { ...plate, styleVideoBlock: item.styleVideoBlock },
      { styleId: item.styleId, beatRole: role }
    );
    return nextBeat;
  });

  return {
    ...item,
    creativeAngle: seed.creativeAngle || item.creativeAngle,
    dialogueHook: script.dialogueHook,
    dialogueTension: script.dialogueTension,
    dialogueResolve: script.dialogueResolve,
    headline: shortClip(script.dialogueHook, 48) || item.headline,
    body: script.body,
    caption: script.caption,
    scriptVariant: script.scriptVariant,
    storyScript: {
      dialogueHook: script.dialogueHook,
      dialogueTension: script.dialogueTension,
      dialogueResolve: script.dialogueResolve,
      fullNarration: script.body,
    },
    beats,
    // Finals used old captions — force rebuild
    composedVideoUrl: null,
    finalVideoUrl: null,
    hyperframesProject: null,
    status:
      item.status === 'approved' || item.status === 'published'
        ? item.status
        : beats.some((b) => b.imageUrl)
          ? 'ready'
          : item.status || 'idea',
    error: null,
    scriptRegeneratedAt: new Date().toISOString(),
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
