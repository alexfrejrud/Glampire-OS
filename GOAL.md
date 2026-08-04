# Creative Studio — Product Goal & Build Spec

**Status:** Active · **Glampire OS** multi-workspace live · Taskiz = first workspace  
**Last updated:** 2026-08-03  
**Owner intent:** Keep this studio as a repeatable GTM creative system for every client. Provide a detailed GTM doc + strategy → studio becomes client-specific and produces the best possible social outcomes with minimal prompting.

When resuming work, say: *“Build from GOAL.md”* or *“Continue Glampire OS.”*

---

## 1. Vision (what we’re building)

A **GTM Creative OS** — not a generic AI image toy.

```
Client GTM package (docs + strategy)
        ↓
   Brand OS (locked)
        ↓
Auto content packs (posts · carousels · reels)
        ↓
Grok Imagine (stills + image→video)
        ↓
Human approve
        ↓
Upload-Post publish (per client profile)
```

**User experience principle:**  
No freeform prompting every time. AI already understands the brand, ICP, pillars, CTAs, and do-not-say list. Operator only: **pick pack → generate media → approve → publish.**

**Agency model:**  
One codebase. Many clients. Each client = Brand OS + content bank + Upload-Post profile. Glampire provides GTM; studio is the always-on creative factory.

---

## 2. What works today (Taskiz pilot)

### Pipeline
1. Generate pack (weekly / beta / paid / reels / carousels)
2. Review queue
3. Generate stills (Grok Imagine)
4. Animate reels (Grok image→video)
5. Approve
6. Publish via Upload-Post (`user=TASKIZ`)

### Stack
| Layer | Path | Notes |
|---|---|---|
| Product UI | `src/main.jsx` + Astryx | Glampire OS chrome; light/dark; workspace switcher |
| Workspaces | `server/brandLoader.js` · `clients/` | Multi-client Brand OS + publish config |
| Brand OS | `server/brand.js` | Prompt builders; loads active workspace brand |
| Content engine | `server/contentEngine.js` | Pillars, idea library, packs |
| Grok client | `server/grok.js` | Image + video |
| Publish | `server/uploadPost.js` | Upload-Post API |
| API | `server/index.js` | Express on `:8787` |
| UI | `src/main.jsx` | Approve-first workflow |
| Secrets | `.env` | `XAI_API_KEY`, `UPLOAD_POST_API_KEY`, `UPLOAD_POST_DEFAULT_USER` |
| Brand source docs | `Brand/` | GTM master HTML + decks + logo |

### Formats
| Format | Size | Media path |
|---|---|---|
| Post | 1080×1080 | Grok still |
| Carousel | 1080×1080 × N | Grok stills per slide |
| Reel | 1080×1920 | Still → Grok video |

### Publish mapping (Upload-Post)
| Studio | Endpoint | Payload |
|---|---|---|
| Post / Carousel | `POST /api/upload_photos` | `photos[]` + title/caption |
| Reel | `POST /api/upload` | video URL + title |
| Auth | Header | `Authorization: Apikey <key>` |
| Profile | `user` | `TASKIZ` (default) |

Docs: https://docs.upload-post.com/

### Taskiz brand truth (locked for pilot)
- **Category:** Mobile business app for contractors  
- **One-liner:** Run your contracting business from your phone.  
- **Primary ICP:** Solo handyman businesses + small general contractors  
- **Secondary:** Painters, remodelers, landscapers  
- **AI role:** Supporting Copilot layer — not the category  
- **Do not say:** AI phone receptionist, never miss a call, AI employee, full field service platform, SMS/email inbox claims  
- **CTAs:** Join the Beta · Start Free · See How It Works  
- **Pillars:** pain · demo · before/after · education · trust  
- **Tone:** Practical, field-first, honest — not fluffy SaaS  

### GTM alignment (pilot assessment)
| Area | Alignment |
|---|---|
| Messaging / positioning / ICP priority | Strong (~85–90%) |
| Content system (pillars + formats + approve) | Strong for 90-day pilot |
| Pixel brand + product UI proof | Medium (needs logo/UI overlays, real screens) |
| Multi-client productization | Early (~30% — still Taskiz-hardcoded) |

---

## 3. North-star product architecture

```
clients/
  <clientId>/
    brand.json          # Brand OS
    content.json        # Pillars, idea bank, packs, CTAs
    assets/             # Logo, product screens, refs
    publish.json        # Upload-Post profile user, default platforms

server/
  brandLoader.js        # Load client Brand OS
  contentEngine.js      # Generate packs from client content
  grok.js               # Shared media engine
  uploadPost.js         # Shared publish engine
  index.js

src/                    # Client switcher + same UX flow
```

### Brand OS schema (target)
```json
{
  "id": "taskiz",
  "name": "Taskiz",
  "category": "Mobile business app for contractors",
  "oneLiner": "Run your contracting business from your phone.",
  "supporting": "...",
  "primaryCta": "Join the Beta",
  "ctas": ["Join the Beta", "Start Free", "See How It Works"],
  "colors": { "ink": "#10202e", "brand": "#1c425c", "accent": "#dff0f7" },
  "icp": {
    "primary": ["Solo handyman", "Small GC"],
    "secondary": ["Painters", "Remodelers"],
    "later": ["Electricians", "Plumbers", "HVAC"]
  },
  "doNotSay": ["AI phone receptionist", "never miss a call", "..."],
  "photographyStyle": "...",
  "voice": "practical, field-first, honest"
}
```

### Content system schema (target)
```json
{
  "pillars": [
    { "id": "pain", "label": "…", "description": "…" }
  ],
  "ideas": [
    {
      "pillar": "pain",
      "format": "post|carousel|reel",
      "headline": "…",
      "body": "…",
      "caption": "…",
      "cta": "…",
      "imageSubject": "…",
      "videoMotion": "…",
      "slides": []
    }
  ],
  "packs": {
    "weekly": { "label": "…", "pickRules": "…" }
  }
}
```

### Required GTM intake (every new client)
1. Category + one-liner + supporting promise  
2. Primary ICP + who *not* to target yet  
3. Do-not-say / not ready to market  
4. Content pillars (or map to defaults)  
5. CTA set  
6. Channel + format priorities  
7. Optional: 90-day volume targets  
8. Proof assets: logo, product screens, 3–5 brand references  

**Operator flow stays identical for every client.**

### Brand OS onboarding (shipped)
Fullscreen wizard on **New workspace…** (Astryx Dialog + Layout):

`draft → researching → review → ready`

| Layer | Path |
|-------|------|
| Wizard UI | `src/components/OnboardingWizard.jsx` |
| Engine | `server/onboarding.js` |
| State | `clients/<id>/onboarding.json` |
| Draft brain | `brand.draft.json` + `content.draft.json` |
| Lock | `POST /api/onboarding/lock` → final Brand OS |

Completeness score (messaging, ICP, guardrails, visual, content, publish, proof) gates quality. Website scrape + rules compiler always run; Grok text enhances when `XAI_API_KEY` is set.

---

## 4. Story + media architecture (locked intent)

Steal **patterns** from RebelBox / HyperFrames — not the full agent pipeline.

```
Brand OS (per client)
        ↓
Pack + flow recipe (pain_to_cta · ugc_field · carousel_story · single_moment)
        ↓
mediaEngine
  draft:    Grok stills + short I2V
  standard: fal Kling (volume reels)
  hero:     fal Seedance (identity / product continuity)
        ↓
story assembly (multi-beat)
        ↓
HyperFrames compose  ← graphics, titles, lower-thirds, CTA cards, logo chrome
        ↓
Approve → Upload-Post
```

### Layer roles (do not collapse these)

| Layer | Owns | Does not own |
|--------|------|----------------|
| **Grok / fal video** | Realistic footage & motion per beat | Burned titles, brand type, layout |
| **Content engine** | Beats, copy, CTA, flow recipe | Pixel-perfect type animation |
| **HyperFrames** | Kinetic titles, stat/callout cards, lower-thirds, logo lockups, end cards, caption chrome | Generating photoreal field footage |
| **FFmpeg** | Fast concat / trim / fallback burn when HF not needed | Fancy brand motion design |

**Rule:** AI video = world. HyperFrames = design system on top of the world.

### HyperFrames usage in Creative Studio

Use HyperFrames as a **local compose runtime** (HTML + GSAP, `$0` API, brand tokens from Brand OS):

- **Title cards** — open hook type, beat headlines  
- **Lower-thirds / callouts** — pain line, price, feature hit  
- **CTA end cards** — Join the Beta / Start Free (brand colors + logo)  
- **Carousel-adjacent motion** — kinetic type over stills when no full AI reel  
- **Caption track** — designed captions (not plain hard-sub only)  
- **Templates** — `kinetic-type`, product promo, Swiss-grid style packs mapped to client tokens  

Do **not** use HyperFrames as the photoreal generator. Do **not** re-home the whole RebelBox agent loop — only templates + render CLI + brand CSS bridge.

Reference (local): `/Users/glampirelabs/Dev/RebelBox` HyperFrames skills + compose bridge.

---

## 5. Build roadmap (when resuming)

### Phase 0 — Done (Taskiz pilot)
- [x] Brand-locked idea packs  
- [x] Grok stills + reel animation  
- [x] Multi-format: post / carousel / reel  
- [x] Approve queue + local persistence  
- [x] Upload-Post publish (replaced Blotato)  
- [x] Brand kit UI + settings  
- [x] Ref reverse-engineer + script cloner tabs (stabilize as needed)  

### Phase 1 — Story flows + HyperFrames graphics (highest ROI next)
- [x] **Video style packs** (`server/videoStyles.js`) — camera/lighting/energy/motion injected into prompts  
- [x] Flow recipes: `single_moment` · `pain_to_cta` · `ugc_field` · `demo_loop`  
- [x] Reel ideas carry `beats[]` (hook / tension / resolve) with per-beat copy + imageSubject  
- [x] Multi-beat generate UI: beat stills → animate beats → **Build story**  
- [x] Stitch beats (ffmpeg) into one reel  
- [x] Titles/CTA: **brand SVG→PNG→ffmpeg overlay** (best path; no drawtext needed)  
- [x] HyperFrames project write + legacy drawtext as fallbacks  
- [x] Brand tokens → HyperFrames CSS in compose scaffold  
- [x] Create UI: pick pack + style + flow before generating  
- [x] Approve one full story reel end-to-end in live Grok run  
  - Flagship `reel-lost-in-texts` (2026-08-03): 3 stills → Grok I2V → svg_overlay + audio bed  
  - Final: `/api/renders/msdu26lk-4niv88-final.mp4` · report `server/data/e2e-story-last.json`  
  - Fixed `storyAssembler` ffmpeg (missing output path on normalize/concat)  
- [ ] Optional: richer HyperFrames registry templates (`stat_callout`, kinetic type)  

### Phase 2 — Selectable video models (done)
- [x] `server/videoModels.js` — Grok · Kling 3 · Seedance 2.5 (fal 2.0) · MiniMax H3  
- [x] `server/fal.js` + `server/mediaVideo.js` — unified start/poll  
- [x] API: `GET /api/video-models`, `POST /api/generate/video` with `modelId`  
- [x] UI: model picker on Create + per-reel override in queue  
- [x] Story Build / Animate beats use selected model  
- [ ] Optional: auto-tier map (ugc→Kling, hero→Seedance) as defaults only  

### Phase 3 — Multi-client Brand OS (Glampire OS)
- [x] `clients/<id>/brand.json` + `content.json` + `publish.json` + `workspace.json`  
- [x] Workspace switcher in UI (Astryx SideNav heading menu) + create workspace  
- [x] Load Brand OS dynamically (`brandLoader` + `X-Workspace-Id`)  
- [x] Per-client Upload-Post `user` from `publish.json`  
- [x] Migrate Taskiz into `clients/taskiz/`  
- [x] Shared dashboard UI (no per-client chrome colors) · light / dark / system  
- [x] Astryx AppShell + responsive mobile nav  
- [ ] Externalize Taskiz idea pool fully into `content.json` (still builtin engine for Taskiz packs)  
- [ ] Auth / multi-operator accounts (later)  

### Phase 4 — GTM → Brand OS assist
- [ ] Upload/paste GTM (HTML/PDF/MD)  
- [ ] Extract positioning, ICP, do-not-say, pillars, CTAs  
- [ ] Human confirm step → write client config  
- [ ] Seed first idea bank from extracted strategy  

### Phase 5 — Quality ceiling + polish
- [ ] Logo safe zones + product UI screenshots in demos  
- [ ] Format-true export packs  
- [ ] Pre-approve compliance: do-not-say scan on copy  
- [ ] Stronger reference-locked image prompts (refs tab → beat stills)  
- [ ] HyperFrames registry blocks only if templates outgrown  
- [ ] Cost estimate before generate  

### Phase 6 — Ops & scale
- [ ] Weekly auto-batch generation  
- [ ] Upload-Post status polling + history  
- [ ] Simple performance notes back into queue  
- [ ] Scheduled publish UI (`scheduled_date`)  
- [ ] Client-ready zip export (creatives + captions)  

---

## 6. Quality bar (definition of “best outcome”)

A pack is successful when:

1. **On-message** — passes do-not-say; matches category + promise  
2. **On-ICP** — primary beachhead first (for Taskiz: handyman / small GC)  
3. **Multi-format** — post + carousel + reel coverage as needed  
4. **Story-shaped** — reels read as hook → tension → resolve, not one push-in  
5. **Designed, not raw** — HyperFrames titles/CTA/captions look brand-native  
6. **Approveable in one pass** — operator doesn’t rewrite strategy  
7. **Publishable** — Upload-Post profile connected; media public/valid  
8. **Repeatable weekly** — same flow every client, every week  

During Taskiz test runs, evaluate:
- Still quality (authenticity, field realism, text-space for overlays)
- Reel motion (subtle commercial vs chaotic)
- Title/graphic legibility over footage (scrim + contrast)
- Caption fit to GTM tone
- Whether outputs feel contractor-native vs generic SaaS AI
---

## 7. How to run (local)

```bash
cd creative-studio
# .env must include:
#   XAI_API_KEY=...
#   UPLOAD_POST_API_KEY=...
#   UPLOAD_POST_DEFAULT_USER=TASKIZ
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

**Upload-Post dashboard:** connect socials under profile **TASKIZ** before live publish tests.  
https://app.upload-post.com  

---

## 8. Resume prompts (for future sessions)

Use any of these:

- “Build Phase 1 — story beats + HyperFrames titles/graphics.”  
- “Read `GOAL.md` and continue Phase 1 story + compose.”  
- “Wire fal quality tiers under the beat API (Phase 2).”  
- “Continue multi-client Brand OS (Phase 3).”  
- “Ingest this new client GTM and create a client profile like Taskiz.”  
- “Improve image/video quality against the quality bar in `GOAL.md`.”  

---

## 9. Non-goals (for now)

- Replacing a full ads manager / bidding platform  
- Fully autonomous publish without approve (human-in-the-loop is intentional)  
- Marketing dormant product claims that GTM forbids  
- Hard-forking the app per client (config, not code forks)  
- Running full RebelBox agent stages for weekly social packs  
- Using HyperFrames to invent photoreal footage (use Grok/fal for that)

---

## 10. Success vision (one sentence)

**Drop in a client GTM strategy → get a brand-locked studio that generates on-ICP posts, carousels, and reels with Grok/fal, composes titles and graphics in HyperFrames, lets us approve, and publishes through Upload-Post — at the quality of a focused creative team, every week, for every client.**
