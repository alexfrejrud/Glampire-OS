# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- ASTRYX:START -->
Astryx v0.2.0 · 154 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any raw <div>/<span> layout, imported .css/@apply, or hardcoded value (#hex, 16px) with the component or a token (var(--color-*|--spacing-*|…)). If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   154 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

## Multi-workspace ads (Brand OS + layout skill)

Still ads are **not** freeform AI design. Split responsibilities:

| Layer | Source | Per client? |
|---|---|---|
| Photo plate | Grok / image API | Yes (`photographyStyle`, ICP) |
| Type / logo / CTA | `adCompose` + Brand OS | Colors, CTA, logo, fonts |
| Canvas math | `server/adLayout.js` | No — \(S=\min(W,H)\) formulas |

- Skill: `.agents/skills/ad-typography-and-layout/SKILL.md`
- Optional overrides: `clients/<id>/brand.json` → `adDesign`
- Logo: `clients/<id>/assets/*logo*` only (never hardcode another client)
- After layout changes: **Recompose type** (reuse plate)

Do not ask the image model to paint brand type or logos.

## Creative tools (Arcads playbook → our keys)

Do **not** route through Arcads. Creative upgrades live in-studio:

| Area | Location |
|---|---|
| UGC 9-layer + cast formulas | `server/creativeFormulas.js` (auto-injected into UGC styles) |
| Character sheet / cast lock / clone / native UI / audit | Tools tab · `src/components/CreativeTools.jsx` |
| Skill | `.agents/skills/creative-prompting/SKILL.md` |
| Pipes | `XAI_API_KEY` (Grok) · `FAL_KEY` (Kling/Seedance/MiniMax) |

Native UI ads (model-painted type) are a **separate lane** from Brand OS plate + `adCompose`.

## Multi-workspace story captions (platform rule)

Spoken captions are **workspace-agnostic**. Same pipeline for every client.

| Rule | Behavior |
|---|---|
| Whisper ASR succeeds | Burn **spoken words** karaoke (always). Never gate on style `titleStyle`. |
| ASR fails / silent plate | Fall back to **full beat dialogue**, not flow keywords |
| Never on speech reels | Keyword title cards like “The old way” / “The cost” |
| Highlight color | Active Brand OS `colors.brand` |
| Brand OS defaults | `PLATFORM_BRAND_DEFAULTS` in `brandLoader.js` (ASR, caption_talk, organic chrome, documentary default style) |
| Opt-out | Brand or item `useAsrCaptions: false` only |

Code: `storyAssembler` (ASR) → `graphicsCompose.buildStoryGraphics` (burn).  
Do not reintroduce style packs that skip ASR when `asrKaraokeWindows` is present.

## Multi-workspace story reels (platform rule)

Bulk story reels must feel like **different creatives**, not one message × N faces.

| Rule | Behavior |
|---|---|
| Scripts | Distinct hook/tension/resolve per item; rotate across batches (`contentEngine`) |
| Endings | Do **not** slam primary CTA on every resolve; hard CTA only on rare convert angles |
| Cast | Unique person/room per reel; continuity only **within** 3 beats (`brandCastVariant`) |
| Stills | Always **9:16** for reels — API forces ratio + `stillReframe` pad to 1080×1920 |
| UI preview | `object-fit: contain` on reel thumbs — never CSS-crop faces |
| Silence | Beat duration from dialogue length; assemble trims trailing silence |
| Regen script | `/api/story/regen-script` — new lines, keeps stills; all workspaces |
| Regen stills | Images only — **must not** rewrite script |
| Video model | Card uses Selector dropdown; default from Brand OS `defaultVideoModelId` |

Taskiz may keep a handcrafted idea bank (`TASKIZ_IDEA_POOL`); **pipelines** (captions, reframe, regen, diversify, chrome) stay platform-global.

## Platform chrome (Glampire OS)

- Logo / favicon: `public/glampire-mark.png`, `public/favicon.*` — studio brand, not client Brand OS
- Ads compose: `adLayout` + `adCompose` + Brand OS colors/CTA/logo only
- Never hardcode one client’s purple, CTA, or logo path into layout math or video chrome
- New workspaces inherit `PLATFORM_BRAND_DEFAULTS` (ASR, caption_talk, organic chrome, Grok default model)
- Neutral color fallback when Brand OS is incomplete: `#5B5BD6` (not Taskiz violet)
- Publish filenames / titles use studio/brand name — never a single-client slug
- Taskiz may keep `TASKIZ_IDEA_POOL` + ASR “task/is” mishear fix; all **pipelines** stay workspace-agnostic
