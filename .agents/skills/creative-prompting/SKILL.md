# Creative prompting & tools (Grok / fal only)

Port of the [arcads-claude-code](https://github.com/krusemediallc/arcads-claude-code) **creative playbook** into Creative Studio. **Never call Arcads.** All generation uses `XAI_API_KEY`, `FAL_KEY`, ElevenLabs, HyperFrames.

## What improved in the pipeline (automatic)

| Layer | Behavior |
|---|---|
| UGC styles | `contractor_talk`, `ultra_ugc`, `ugc_field`, `pain_to_cta` inject the authenticity stack (skin texture, phone flaws, no hype words) |
| Video prompts | `buildStyledVideoPrompt` + `buildVideoPrompt` use 9-layer UGC speech stack when dialogue is present |
| Still prompts | `buildImagePrompt` appends UGC authenticity for those style ids |
| Audit | `/api/generate/image` + video start log to `server/data/gen-audit.jsonl` |

## Tools tab (UI)

| Tab | Purpose | Keys |
|---|---|---|
| Character RE | Image → identity prompt (existing) | XAI vision |
| **Cast sheet** | Multi-angle Grok character pack → Ref library | XAI |
| **Cast lock** | Write `brand.castBrief` for multi-beat continuity | none |
| **UGC formula** | Draft 9-layer still prompts + dialogue fit check | none / light |
| **Clone creative** | Ad still or frame → reusable template markdown | XAI |
| **Native UI ads** | Notes / search / chat / comparison (model paints type) | XAI |
| Script cloner | Existing | XAI |
| Ref library | Existing | — |
| **Gen audit** | Recent generations + est. $ | — |

## Server modules

- `server/creativeFormulas.js` — UGC layers, cast sheet, dialogue check, hype strip
- `server/characterSheet.js` — hero + angles via Grok Imagine
- `server/creativeClone.js` — ad/video reverse-engineer
- `server/nativeUiAds.js` — 12 native UI templates
- `server/genAudit.js` — JSONL audit log

## Brand OS rules (still true)

- **Photo plates** for branded ads: no painted logos/type → `adCompose` + Brand OS.
- **Native UI lane**: exception — the creative *is* the UI chrome; type is in-model.
- Spoken reels: ASR karaoke when Whisper succeeds; never keyword title cards on speech reels.

## API (quick)

```
GET  /api/tools/formulas
POST /api/tools/cast-sheet { saveToBrand? }
POST /api/tools/character-sheet/hero | /angles | /full
POST /api/tools/clone/ad-image | /video
GET  /api/tools/native-ui
POST /api/tools/native-ui/generate
GET  /api/tools/audit
```

## Operator playbook

1. **Lock cast** (Cast lock or Cast sheet) before multi-beat stories.
2. Prefer **Grok** video for drafts; Kling/Seedance for hero only (see `videoModels.js`).
3. Run **dialogue check** so spoken lines fit beat duration.
4. Clone winners with **Clone creative** → paste templates into style packs / briefs.
5. Use **Native UI** for performance tests; use **Ads batch + compose** for brand kits.
