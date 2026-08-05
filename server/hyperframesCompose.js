/**
 * HyperFrames compose scaffold for Creative Studio.
 *
 * Role: titles, lower-thirds, CTA end cards over stitched beat footage.
 * Writes a self-contained HTML composition + DESIGN tokens from Brand OS.
 * Attempts `npx hyperframes render` when CLI is available; otherwise
 * storyAssembler falls back to ffmpeg title burns.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(__dirname, 'data', 'hyperframes');

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

/**
 * Write HyperFrames-style project for a story reel.
 */
export function writeHyperframesProject({ item, beats, brand, style, stitchedVideoPath }) {
    const id = item.id || `hf-${Date.now()}`;
    const projectDir = path.join(PROJECTS_DIR, id);
    ensureDir(projectDir);
    ensureDir(path.join(projectDir, 'assets'));

    // Copy stitched plate into project assets if present
    let videoRel = null;
    if (stitchedVideoPath && fs.existsSync(stitchedVideoPath)) {
        const dest = path.join(projectDir, 'assets', 'plate.mp4');
        fs.copyFileSync(stitchedVideoPath, dest);
        videoRel = 'assets/plate.mp4';
    }

    const colors = brand.colors || {};
    const totalDur = beats.reduce((s, b) => s + (Number(b.durationSec) || 5), 0);

    const designMd = `# DESIGN — ${brand.name}

## Brand
- Name: ${brand.name}
- One-liner: ${brand.oneLiner}
- Primary CTA: ${item.cta || brand.primaryCta}

## Tokens
- ink: ${colors.ink || '#000'}
- brand: ${colors.brand || '#5B5BD6'}
- brandDeep: ${colors.brandDeep || colors.brand || '#4A4AC0'}
- accent: ${colors.accent || '#A5A5F0'}
- dark: ${colors.dark || '#141414'}
- surface: ${colors.surface || '#F7F7F7'}
- font: ${brand.fonts?.sans || 'system-ui, sans-serif'}

## Video style
- Pack: ${style?.label || item.styleLabel}
- Graphics density: ${style?.graphics?.density || 'medium'}
- Title style: ${style?.graphics?.titleStyle || 'lower_third'}
- Caption: ${style?.graphics?.captionStyle || 'clean_sans'}

## Rules
- Never invent product UI text on the phone screen.
- Titles are design chrome — keep photo plate free of baked-in words from the model.
- End card uses brand CTA + wordmark colors only.
`;

    fs.writeFileSync(path.join(projectDir, 'DESIGN.md'), designMd);

    // Timeline of title clips
    let t = 0;
    const titleClips = beats
        .map((beat, i) => {
            const start = t;
            const dur = Number(beat.durationSec) || 5;
            t += dur;
            const isHook = beat.role === 'hook';
            const isResolve = beat.role === 'resolve' || beat.endCard;
            const y = isHook && style?.graphics?.titleStyle === 'bold_hook' ? '18%' : '78%';
            const size = isHook ? '42px' : '32px';
            return `
    <div class="clip title-clip role-${beat.role}"
         data-start="${start}"
         data-duration="${Math.max(1, dur - 0.4)}"
         data-track-index="2"
         style="position:absolute;left:0;right:0;top:${y};padding:0 48px;text-align:center;">
      <div class="title-card ${isResolve ? 'resolve' : ''}" style="
        display:inline-block;
        max-width:920px;
        padding:14px 22px;
        border-radius:14px;
        background: rgba(20,18,51,0.55);
        backdrop-filter: blur(6px);
        color: #fff;
        font-family: Outfit, Inter, system-ui, sans-serif;
        font-size: ${size};
        font-weight: 650;
        line-height: 1.2;
        letter-spacing: -0.02em;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      ">${escapeHtml(beat.title || '')}</div>
    </div>`;
        })
        .join('\n');

    const endStart = Math.max(0, totalDur - 2.6);
    const cta = escapeHtml(item.cta || brand.primaryCta || brand.ctas?.[0] || 'Learn more');
    const brandName = escapeHtml(brand.name || 'Brand');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${brandName} — ${escapeHtml(item.headline || 'Story reel')}</title>
  <style>
    :root {
      --ink: ${colors.ink || '#000'};
      --brand: ${colors.brand || '#5B5BD6'};
      --brand-deep: ${colors.brandDeep || colors.brand || '#4A4AC0'};
      --accent: ${colors.accent || '#A5A5F0'};
      --dark: ${colors.dark || '#141414'};
      --surface: ${colors.surface || '#F7F7F7'};
      --font: ${brand.fonts?.sans || 'system-ui, sans-serif'};
    }
    html, body {
      margin: 0; padding: 0;
      width: 1080px; height: 1920px;
      overflow: hidden;
      background: #000;
      font-family: var(--font);
    }
    #stage {
      position: relative;
      width: 1080px; height: 1920px;
      overflow: hidden;
      background: #0a0a0f;
    }
    .plate-wrap {
      position: absolute; inset: 0;
      overflow: hidden;
    }
    .plate-wrap video {
      width: 100%; height: 100%;
      object-fit: cover;
    }
    .scrim {
      position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
      background: linear-gradient(to top, rgba(10,8,24,0.72), transparent);
      pointer-events: none;
    }
    .end-card {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 18px;
      background: linear-gradient(160deg, rgba(20,18,51,0.82), rgba(102,60,246,0.55));
      color: #fff;
      text-align: center;
      padding: 48px;
    }
    .end-card .brand {
      font-size: 28px; font-weight: 600; letter-spacing: 0.04em;
      text-transform: uppercase; opacity: 0.9;
    }
    .end-card .cta {
      font-size: 56px; font-weight: 700; letter-spacing: -0.03em;
      color: #fff;
      text-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }
    .end-card .sub {
      font-size: 28px; opacity: 0.85; max-width: 760px; line-height: 1.35;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="story-reel" data-duration="${totalDur}">
    <div class="plate-wrap clip" data-start="0" data-duration="${totalDur}" data-track-index="0">
      ${videoRel
            ? `<video src="${videoRel}" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
            : `<div style="width:100%;height:100%;background:#141233;"></div>`
        }
    </div>
    <div class="scrim clip" data-start="0" data-duration="${totalDur}" data-track-index="1"></div>
    ${titleClips}
    <div class="clip end-card"
         data-start="${endStart}"
         data-duration="2.6"
         data-track-index="3">
      <div class="brand">${brandName}</div>
      <div class="cta">${cta}</div>
      <div class="sub">${escapeHtml(brand.oneLiner || '')}</div>
    </div>
  </div>
  <script>
    // HyperFrames-compatible timeline registry (seekable, bounded)
    window.__timelines = window.__timelines || {};
    window.__timelines['story-reel'] = { duration: ${totalDur} };
  </script>
</body>
</html>
`;

    fs.writeFileSync(path.join(projectDir, 'index.html'), html);

    const meta = {
        id,
        projectDir,
        indexHtml: path.join(projectDir, 'index.html'),
        designMd: path.join(projectDir, 'DESIGN.md'),
        totalDuration: totalDur,
        videoRel,
        styleId: style?.id || item.styleId,
        createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(projectDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // Manifest for HyperFrames CLI if present
    fs.writeFileSync(
        path.join(projectDir, 'hyperframes.json'),
        JSON.stringify(
            {
                name: `creative-studio-${id}`,
                width: 1080,
                height: 1920,
                fps: 30,
            },
            null,
            2
        )
    );

    return meta;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Attempt HyperFrames CLI render. Non-fatal if missing.
 */
export async function tryRenderHyperframes(projectDir) {
    if (!projectDir || !fs.existsSync(path.join(projectDir, 'index.html'))) {
        return { ok: false, reason: 'no_project' };
    }

    const outPath = path.join(projectDir, 'render.mp4');

    // Prefer local npx hyperframes; timeout short so we don't block forever
    const tryCmds = [
        ['npx', ['--yes', 'hyperframes', 'render', projectDir, '--output', outPath, '--quality', 'draft']],
    ];

    for (const [cmd, args] of tryCmds) {
        try {
            await runWithTimeout(cmd, args, 45000);
            if (fs.existsSync(outPath)) {
                return { ok: true, outputPath: outPath, engine: 'hyperframes' };
            }
        } catch (e) {
            return { ok: false, reason: e.message || 'render_failed' };
        }
    }
    return { ok: false, reason: 'cli_unavailable' };
}

function runWithTimeout(cmd, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(stderr.slice(-500) || `exit ${code}`));
        });
    });
}

export function hasHyperframesProject(itemId) {
    const dir = path.join(PROJECTS_DIR, itemId);
    return fs.existsSync(path.join(dir, 'index.html'));
}
