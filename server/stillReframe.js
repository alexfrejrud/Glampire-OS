/**
 * Force still images to a target portrait frame (default 9:16 / 1080x1920).
 * If Grok returns landscape or square, we letterbox-pad instead of cropping faces.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STILLS_DIR = path.join(__dirname, 'data', 'renders', 'stills');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d.toString();
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-500) || `${cmd} exited ${code}`));
    });
  });
}

function ensureDir() {
  fs.mkdirSync(STILLS_DIR, { recursive: true });
  return STILLS_DIR;
}

async function probeSize(filePath) {
  try {
    const { spawnSync } = await import('child_process');
    const r = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        filePath,
      ],
      { encoding: 'utf8' }
    );
    const [w, h] = String(r.stdout || '')
      .trim()
      .split(',')
      .map((x) => parseInt(x, 10));
    if (w > 0 && h > 0) return { w, h };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Download remote/data image and pad/scale into exact 1080x1920 portrait.
 * @returns {{ localPath: string, publicUrl: string, width: number, height: number, reframed: boolean }}
 */
export async function ensurePortraitStill(imageUrl, { w = 1080, h = 1920, id = '' } = {}) {
  if (!imageUrl) throw new Error('imageUrl required');
  ensureDir();
  const base = `still-${id || Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const srcPath = path.join(STILLS_DIR, `${base}-src`);
  const outPath = path.join(STILLS_DIR, `${base}.jpg`);

  // Fetch bytes
  let buf;
  if (String(imageUrl).startsWith('data:')) {
    const m = String(imageUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('invalid data URI');
    buf = Buffer.from(m[2], 'base64');
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`still fetch failed ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  // sniff extension
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const srcFile = `${srcPath}${isPng ? '.png' : '.jpg'}`;
  fs.writeFileSync(srcFile, buf);

  const size = await probeSize(srcFile);
  const alreadyPortrait =
    size && size.h > size.w && Math.abs(size.w / size.h - w / h) < 0.04;

  if (alreadyPortrait && size.w >= w * 0.9) {
    // Close enough — still normalize to exact canvas for i2v consistency
  }

  // scale to fit inside 9:16, pad black (never crop)
  await run('ffmpeg', [
    '-y',
    '-i',
    srcFile,
    '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    outPath,
  ]);

  try {
    fs.unlinkSync(srcFile);
  } catch {
    /* ignore */
  }

  const finalSize = (await probeSize(outPath)) || { w, h };
  return {
    localPath: outPath,
    publicUrl: `/api/renders/stills/${path.basename(outPath)}`,
    width: finalSize.w,
    height: finalSize.h,
    reframed: !alreadyPortrait,
  };
}

export function resolveStillPath(fileName) {
  const base = path.basename(String(fileName || '').split('?')[0]);
  if (!base || base.includes('..')) return null;
  if (!/^still-[\w.-]+\.(jpg|jpeg|png)$/i.test(base)) return null;
  const full = path.join(STILLS_DIR, base);
  return fs.existsSync(full) ? full : null;
}
