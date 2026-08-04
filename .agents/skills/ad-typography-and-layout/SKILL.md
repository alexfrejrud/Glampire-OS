---
name: ad-typography-and-layout
description: Universal still-ad type and layout system for multi-workspace Creative Studio. Use when composing ads, fixing font/margin/CTA issues, adding a new client workspace, or changing ad templates. Brand OS supplies colors/CTA/logo; this skill supplies canvas math and hierarchy.
---

# Ad typography & layout (multi-workspace)

## Mental model (do not reverse)

| Layer | Owner | Changes per client? |
|---|---|---|
| **Photo plate** | Image model (Grok) | Yes (ICP / photographyStyle) |
| **Type + logo + CTA** | Code compose (`adCompose` + `adLayout`) | Colors/logo/CTA/fonts only |
| **Canvas math** | Universal (`server/adLayout.js`) | No — same formulas for all workspaces |

**Never** ask the image model to paint brand type, logos, or buttons.  
**Never** hardcode Taskiz purple or “Join the Beta” in layout math — read Brand OS.

---

## Brand OS contract (per workspace)

`clients/<id>/brand.json` (and optional `adDesign`):

```json
{
  "name": "Client",
  "primaryCta": "Start Free",
  "website": "https://example.com",
  "colors": {
    "brand": "#…",
    "brandDeep": "#…",
    "dark": "#…",
    "accent": "#…"
  },
  "fonts": {
    "sans": "Outfit, Inter, system-ui, sans-serif"
  },
  "adDesign": {
    "displayFont": "Outfit",
    "headlineScale": 0.072,
    "bodyScale": 0.032,
    "ctaHeightScale": 0.074,
    "padScale": 0.074,
    "maxSupportLines": 1,
    "dedupeSupport": true,
    "safeZoneVertical": true
  }
}
```

| Field | Role |
|---|---|
| `colors.*` | CTA fill (`brandDeep` → `brand`), scrim/dark, accents |
| `primaryCta` / `ctas` | Button label |
| `fonts.sans` / `adDesign.displayFont` | SVG `font-family` first face |
| `adDesign.*Scale` | Optional tweak of universal % of \(S\) |
| `clients/<id>/assets/*logo*` | Official mark only (SVG preferred) |

Optional fonts: `clients/<id>/assets/fonts/*-{Regular,SemiBold,Bold}.ttf` — else studio default Outfit.

---

## Canvas math (universal)

\[
S = \min(W, H)
\]

All type and major spacing = **fraction of \(S\)** (implemented in `server/adLayout.js`).

| Element | Default % of \(S\) | Intent |
|---|---|---|
| Headline | 7.2% | Readable in &lt;1.5s |
| Support / body | 3.2% (floor 2.8%) | Secondary; never tiny |
| CTA label | 3.0% | Clear action |
| Pad X | 7.4% of \(S\) | Horizontal margins always (never story top/bottom) |
| Pad top/bot | 7.4% of \(S\) | Story profile may raise vertical pads for chrome |
| CTA height | 7.4% | Full-width bar, not a micro-pill |
| Gap H1 → body | 2.6% of \(S\) | No visual collision |
| Gap body → CTA | 3.4% of \(S\) | Clear separation |

**Line-height:** headline ~1.18–1.22; body ~1.35.  
**Support:** max 1 line; drop if it repeats the headline (dedupe).  
**Wrap:** use ~0.5em average char width (Outfit-class sans); auto-shrink headline slightly before ellipsis.  
**Copy:** Brand OS `adSupport` / short `supporting` preferred; never use `promise` when it restates `oneLiner`.  
**No dashes on stills:** never paint em dash (—), en dash (–), or spaced ` - ` pauses. `scrubAdDashes()` in `adCopy` + final pass in `adCompose`. Mid-word hyphens (real-time) OK.

---

## Aspect profiles

| Profile | When | Layout |
|---|---|---|
| **square** | 1:1 | Bottom-third type + full-width CTA; logo top-left |
| **portrait** | 3:4, 4:5, 2:3 | Same as square, more vertical air |
| **story** | 9:16 | Safe top ~10%; bottom pad extra; logo top; CTA above chrome |
| **landscape** | 16:9, 3:2 | Prefer **panel** or future split (text | image) |

Templates: `hero` | `panel` | `story` | `endcard` — structure is universal; **colors/logo/CTA** are workspace.

---

## Readability over photos

1. Dark **scrim** under type (gradient to transparent) — not full brand wash  
2. Or solid **panel** dock (brand dark) for max contrast  
3. Or **endcard** solid dark conversion unit  

Text color: high-contrast on dark (default white). CTA: `brandDeep` / `brand`.

---

## Stack order (bottom-up — required)

```
[pad bottom]
[full-width CTA bar]
[gap body→CTA]
[support — 0–1 lines]
[gap H1→body]
[headline — 1–3 lines]
[scrim covers type zone]
[logo top safe]
```

Use `stackFromBottom()` in code — do not freestyle Y positions.

---

## Multi-workspace checklist

When adding a client or fixing ads:

- [ ] Brand OS has colors + primaryCta + logo asset  
- [ ] No Taskiz-specific hex in `adLayout.js`  
- [ ] Compose uses `getBrand()` + `resolveWorkspaceLogoPath()`  
- [ ] Queue preview uses real `aspectRatio` (no 1:1 crop of 3:4)  
- [ ] Plate gen: no text/logos in prompt; type only in compose  
- [ ] After layout changes: **Recompose type** (reuse plate)

---

## Automated self-check (before shipping a layout)

- [ ] Support not duplicate of headline  
- [ ] Gaps H1→body and body→CTA ≥ token minimums  
- [ ] Story: type/CTA clear of extreme top/bottom chrome  
- [ ] ≤2 font families (prefer one display face + system fallback)  
- [ ] CTA is full-width bar (or intentional wide control), not a ~100px pill  

---

## Code map

| File | Responsibility |
|---|---|
| `server/adLayout.js` | \(S\)-based tokens, profiles, stack, dedupe |
| `server/adCompose.js` | SVG + Resvg render; workspace logo/fonts |
| `server/adCopy.js` | Brand-locked copy banks (extend per content.json later) |
| `server/adBatch.js` | Batch ideas → queue items |
| `clients/<id>/brand.json` | Per-workspace tokens |

---

## Anti-patterns

- Hardcoding one client’s CTA, purple, or logo path in layout math  
- Letting the image model draw type  
- Fixed `font-size: 24px` without knowing canvas \(S\)  
- Queue `object-fit: cover` into 1:1 for portrait ads  
- Support line that restates the headline  
