// Adds painted VFX subjects to the empty cells of public/textures/vfx-flipbooks.png.
// The source is a Codex-painted sheet of equal cells on flat magenta (#FF00FF):
// magenta is keyed to alpha with the colour spill removed, each subject is cropped
// to its bounding box and fitted into a 128 px cell (4 px margin), resampled with
// 4x4 supersampling in premultiplied alpha; alpha <= 5 is cleared so mipmaps
// carry no halos. Existing cells are untouched.
// Usage: node tools/vfx/add-flipbook-cells.mjs <sheet.png> <columns> <rows> <firstCell> [atlas.png]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [source, columns, rows, first, atlas = 'public/textures/vfx-flipbooks.png'] = process.argv.slice(2);
if (!source || !columns || !rows || first === undefined) throw new Error('usage: add-flipbook-cells.mjs <sheet.png> <columns> <rows> <firstCell> [atlas.png]');
const COLS = Number(columns), ROWS = Number(rows), FIRST = Number(first);
const ATLAS_COLUMNS = 8, ATLAS_ROWS = 4, CELL = 128, MARGIN = 4, SS = 4;
const dir = mkdtempSync(join(tmpdir(), 'flipcells-'));
const size = file => execFileSync('magick', ['identify', '-format', '%w %h', file]).toString().split(' ').map(Number);
const raw = (file, out) => { execFileSync('magick', [file, '-depth', '8', `rgba:${out}`]); return readFileSync(out); };

const [width, height] = size(source);
const src = raw(source, join(dir, 'src.raw'));
// Key magenta: how far a pixel's red and blue exceed its green says how much magenta is mixed in.
const keyed = new Float32Array(width * height * 4);
for (let i = 0; i < width * height; i++) {
  const r = src[i * 4] / 255, g = src[i * 4 + 1] / 255, b = src[i * 4 + 2] / 255;
  const spill = Math.min(r, b) - g, alpha = 1 - Math.min(1, Math.max(0, (spill - .12) / (.8 - .12)));
  // Remove the magenta share: c = (p - (1 - a) * M) / a with M = (1, 0, 1).
  const a = Math.max(alpha, 1e-3);
  keyed[i * 4] = Math.min(1, Math.max(0, (r - (1 - alpha)) / a)); keyed[i * 4 + 1] = Math.min(1, Math.max(0, g / a));
  keyed[i * 4 + 2] = Math.min(1, Math.max(0, (b - (1 - alpha)) / a)); keyed[i * 4 + 3] = alpha;
}
const [aw, ah] = size(atlas);
if (aw !== CELL * ATLAS_COLUMNS || ah !== CELL * ATLAS_ROWS) throw new Error(`atlas must be ${CELL * ATLAS_COLUMNS}x${CELL * ATLAS_ROWS}`);
const dst = raw(atlas, join(dir, 'atlas.raw'));

function sample(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, acc = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx, py = y0 + dy;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const i = (py * width + px) * 4, a = keyed[i + 3];
    acc[0] += keyed[i] * a * w; acc[1] += keyed[i + 1] * a * w; acc[2] += keyed[i + 2] * a * w; acc[3] += a * w;
  }
  return acc;
}

const cellW = width / COLS, cellH = height / ROWS;
for (let n = 0; n < COLS * ROWS; n++) {
  const target = FIRST + n;
  if (target >= ATLAS_COLUMNS * ATLAS_ROWS) throw new Error('atlas is full');
  const x0 = Math.round((n % COLS) * cellW), y0 = Math.round(Math.floor(n / COLS) * cellH);
  const x1 = Math.round((n % COLS + 1) * cellW), y1 = Math.round((Math.floor(n / COLS) + 1) * cellH);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (keyed[(y * width + x) * 4 + 3] > .05) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) throw new Error(`subject ${n} is empty`);
  const ox = (minX + maxX + 1) / 2, oy = (minY + maxY + 1) / 2;
  const scale = Math.max(maxX - minX + 1, maxY - minY + 1) / (CELL - 2 * MARGIN);
  const dx0 = (target % ATLAS_COLUMNS) * CELL, dy0 = Math.floor(target / ATLAS_COLUMNS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const s = sample(ox + (x + (sx + .5) / SS - CELL / 2) * scale - .5, oy + (y + (sy + .5) / SS - CELL / 2) * scale - .5);
      for (let k = 0; k < 4; k++) acc[k] += s[k] / (SS * SS);
    }
    const i = ((dy0 + y) * CELL * ATLAS_COLUMNS + dx0 + x) * 4, alpha = Math.round(acc[3] * 255);
    if (alpha <= 5) { dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0; continue; }
    dst[i] = Math.round(Math.min(1, acc[0] / acc[3]) * 255); dst[i + 1] = Math.round(Math.min(1, acc[1] / acc[3]) * 255);
    dst[i + 2] = Math.round(Math.min(1, acc[2] / acc[3]) * 255); dst[i + 3] = alpha;
  }
  console.log(`subject ${n} -> cell ${target}: bbox ${minX - x0},${minY - y0}..${maxX - x0},${maxY - y0}`);
}
writeFileSync(join(dir, 'out.raw'), dst);
execFileSync('magick', ['-size', `${aw}x${ah}`, '-depth', '8', `rgba:${join(dir, 'out.raw')}`, '-define', 'png:compression-level=9', atlas]);
rmSync(dir, { recursive: true, force: true });
