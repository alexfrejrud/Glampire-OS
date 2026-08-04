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

## Multi-workspace story captions (platform rule)

Spoken captions are **workspace-agnostic**. Same pipeline for Taskiz, WEPOC, and every new client.

| Rule | Behavior |
|---|---|
| Whisper ASR succeeds | Burn **spoken words** karaoke (always). Never gate on style `titleStyle`. |
| ASR fails / silent plate | Fall back to **full beat dialogue**, not flow keywords |
| Never on speech reels | Keyword title cards like “The old way” / “The cost” |
| Highlight color | Active Brand OS `colors.brand` (e.g. Taskiz purple, WEPOC mint) |
| Brand OS defaults | `defaultUseAsrCaptions: true`, `defaultDeliveryMode: caption_talk` |
| Opt-out | Brand or item `useAsrCaptions: false` only |

Code: `storyAssembler` (ASR) → `graphicsCompose.buildStoryGraphics` (burn).  
Do not reintroduce style packs that skip ASR when `asrKaraokeWindows` is present.
