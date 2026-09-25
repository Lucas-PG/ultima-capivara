// Regenerates the menu cover variants from the approved master (public/assets/cover-v2.png).
// The menu requests one AVIF (or WebP) sized to the screen instead of the 2.5 MB PNG; the loading screen,
// which blurs the art, gets a small soft variant. Requires cwebp (libwebp 1.6) and avifenc (libavif 1.4) on PATH.
// Usage: node scripts/build-cover.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = 'public/assets/cover-v2.png', out = 'public/assets';
const tmp = mkdtempSync(join(tmpdir(), 'cover-'));
// [name, width, extra resize filter]: full desktop art, small screens, and the loading backdrop (pre-blurred).
const variants = [['cover-1672', 1672, ''], ['cover-960', 960, ''], ['cover-blur-480', 480, ',gblur=sigma=3']];
try {
  for (const [name, width, filter] of variants) {
    const png = join(tmp, `${name}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', `scale=${width}:-2:flags=lanczos${filter}`, png]);
    execFileSync('cwebp', ['-quiet', '-q', name.includes('blur') ? '60' : '80', '-m', '6', '-sharp_yuv', png, '-o', join(out, `${name}.webp`)]);
    execFileSync('avifenc', ['-q', name.includes('blur') ? '45' : '60', '-s', '4', '-y', '444', png, join(out, `${name}.avif`)], { stdio: 'ignore' });
    for (const ext of ['avif', 'webp']) console.log(`${name}.${ext}`, `${(statSync(join(out, `${name}.${ext}`)).size / 1024).toFixed(1)} KiB`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
