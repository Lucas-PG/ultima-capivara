// Builds public/textures/vfx-flipbooks.png (1024x512, 8x4 cells of 128 px) from the
// painted original (reviews/final-art/vfx-flipbooks.png, 8x4 cells of ~221.75 px).
// Each subject is recentred and scaled so its farthest visible pixel sits on the
// 104 px safe circle, resampled with 4x4 supersampling in premultiplied alpha,
// and alpha <= 5 is cleared so mipmaps carry no halos. The original is untouched.
// Usage: node tools/vfx/build-flipbooks.mjs <original.png> [out.png]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [source, out = 'public/textures/vfx-flipbooks.png'] = process.argv.slice(2);
if (!source) throw new Error('usage: node tools/vfx/build-flipbooks.mjs <original.png> [out.png]');
const COLUMNS = 8, ROWS = 4, CELL = 128, SAFE = 52, SUBJECTS = 14, SS = 4;
const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', source]).toString().split(' ').map(Number);
const dir = mkdtempSync(join(tmpdir(), 'flipbooks-'));
execFileSync('magick', [source, '-depth', '8', `rgba:${join(dir, 'in.raw')}`]);
const src = readFileSync(join(dir, 'in.raw'));
const cellW = width / COLUMNS, cellH = height / ROWS;
const dst = Buffer.alloc(CELL * COLUMNS * CELL * ROWS * 4);
const at = (x, y) => (y * width + x) * 4;

function sample(x, y) {
  // Bilinear, premultiplied.
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, acc = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx, py = y0 + dy;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const i = at(px, py), a = src[i + 3] / 255;
    acc[0] += src[i] * a * w; acc[1] += src[i + 1] * a * w; acc[2] += src[i + 2] * a * w; acc[3] += a * w;
  }
  return acc;
}

for (let cell = 0; cell < SUBJECTS; cell++) {
  const cx0 = Math.round((cell % COLUMNS) * cellW), cy0 = Math.round(Math.floor(cell / COLUMNS) * cellH);
  const cx1 = Math.round((cell % COLUMNS + 1) * cellW), cy1 = Math.round((Math.floor(cell / COLUMNS) + 1) * cellH);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (src[at(x, y) + 3] > 5) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) throw new Error(`cell ${cell} is empty`);
  const ox = (minX + maxX + 1) / 2, oy = (minY + maxY + 1) / 2;
  let radius = 0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (src[at(x, y) + 3] > 5) radius = Math.max(radius, Math.hypot(x + .5 - ox, y + .5 - oy));
  const scale = radius / SAFE; // source pixels per output pixel
  const dx0 = (cell % COLUMNS) * CELL, dy0 = Math.floor(cell / COLUMNS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = x + (sx + .5) / SS - CELL / 2, v = y + (sy + .5) / SS - CELL / 2;
      const s = sample(ox + u * scale - .5, oy + v * scale - .5);
      for (let k = 0; k < 4; k++) acc[k] += s[k] / (SS * SS);
    }
    const i = ((dy0 + y) * CELL * COLUMNS + dx0 + x) * 4, alpha = Math.round(acc[3] * 255);
    if (alpha <= 5) continue;
    dst[i] = Math.min(255, Math.round(acc[0] / acc[3])); dst[i + 1] = Math.min(255, Math.round(acc[1] / acc[3]));
    dst[i + 2] = Math.min(255, Math.round(acc[2] / acc[3])); dst[i + 3] = alpha;
  }
  console.log(`cell ${cell}: bbox ${minX - cx0},${minY - cy0}..${maxX - cx0},${maxY - cy0} radius ${radius.toFixed(1)} -> ${SAFE}`);
}
writeFileSync(join(dir, 'out.raw'), dst);
execFileSync('magick', ['-size', `${CELL * COLUMNS}x${CELL * ROWS}`, '-depth', '8', `rgba:${join(dir, 'out.raw')}`, '-strip', '-define', 'png:compression-level=9', `PNG32:${out}`]);
rmSync(dir, { recursive: true, force: true });
console.log(out, readFileSync(out).length, 'bytes');
