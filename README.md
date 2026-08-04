# Glampire OS · Creative Studio

Multi-workspace GTM creative system:

**workspace Brand OS → auto packs → Grok/fal media → approve → Upload-Post**

Same dashboard UI for every client. Client brand colors apply to **creatives only**, never the chrome.

Built with [Astryx](https://astryx.atmeta.com) (light / dark / system). Responsive layout (mobile nav ready for later app packaging).

> Full product goal & roadmap: [`GOAL.md`](./GOAL.md)

## Run

```bash
cp .env.example .env
# XAI_API_KEY, UPLOAD_POST_API_KEY, optional FAL_KEY
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

## Workspaces

Each client lives under `clients/<id>/`:

| File | Purpose |
|------|---------|
| `workspace.json` | Name, status (`draft` → `researching` → `review` → `ready`), meta |
| `brand.json` | Brand OS (messaging, ICP, creative palette) |
| `content.json` | Pillars / idea source |
| `publish.json` | Upload-Post `user` + default platforms |
| `onboarding.json` | Wizard answers, research cards, completeness |
| `brand.draft.json` / `content.draft.json` | Pre-lock Brand Brain |
| `assets/` | Logo, screens, refs |

Taskiz ships as the first **ready** workspace: `clients/taskiz/`.

### New client onboarding

1. Sidebar → **New workspace…** opens the fullscreen Brand OS wizard  
2. Capture identity → offer → ICP → market → voice → brand kit → channels  
3. **Compile Brand Brain** scrapes the site (if URL), runs rules + Grok compiler, fills research map  
4. **Lock Brand OS** writes final `brand.json` / `content.json` and sets status `ready`  
5. Studio generate/approve/publish uses that locked brain  

Resume incomplete onboarding from **Finish onboarding** in the sidebar, or the warning banner.

Switch workspaces from the **Glampire OS** menu. API scopes Brand OS via `X-Workspace-Id`.

## Flow

1. Select (or onboard) workspace  
2. Generate a pack (weekly / reels / stories / …)  
3. Review queue — stills, animate, build story  
4. Approve  
5. Publish via Upload-Post under the workspace profile  

## Stack

| Layer | Path |
|-------|------|
| UI | `src/main.jsx` + Astryx `AppShell` / `SideNav` / `Theme` |
| Theme | `src/theme.js` (neutral-based Glampire chrome) |
| Workspaces | `server/brandLoader.js` + `clients/` |
| Content | `server/contentEngine.js` |
| Media | `server/grok.js`, `server/fal.js`, `server/mediaVideo.js` |
| Publish | `server/uploadPost.js` |

## Env

| Variable | Purpose |
|----------|---------|
| `XAI_API_KEY` | Grok image + video |
| `UPLOAD_POST_API_KEY` | Social publishing |
| `UPLOAD_POST_DEFAULT_USER` | Fallback profile if workspace has none |
| `FAL_KEY` | Optional Kling / Seedance / MiniMax |
| `PORT` | API port (default `8787`) |

## Security

Keys only in `.env` (gitignored). Never commit API keys or put them in client code.
