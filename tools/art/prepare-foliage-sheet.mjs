// Cleans one Codex-painted foliage sheet so the atlas builder can cut tiles from it.
// Library: prepareSheet(rawPath, columns, rows, names) -> { data, width, height, tiles, dropped }
// CLI (review): node tools/art/prepare-foliage-sheet.mjs <raw.png> <columns>x<rows> <name,...> [preview.png]
// A name ending in ^ is rooted at the top (hanging vines); '-' skips a cell.
// The painting is not an exact grid, so each subject is the set of opaque components whose centre
// lies in its cell. Alpha is regraded (faint matte to 0, near-opaque paint to 255) and specks smaller
// than MIN_SPECK pixels are dropped. No colour is repainted.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const LOW = 28, HIGH = 196, MIN_SPECK = 24;

export async function prepareSheet(raw, columns, rows, names) {
  const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3];
    data[i * 4 + 3] = a <= LOW ? 0 : a >= HIGH ? 255 : Math.round((a - LOW) / (HIGH - LOW) * 255);
  }
  // Connected components of painted pixels (8-neighbour).
  const label = new Int32Array(W * H).fill(-1), comps = [], stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (label[start] >= 0 || data[start * 4 + 3] === 0) continue;
    const id = comps.length, c = { n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0 };
    let top = 0; stack[top++] = start; label[start] = id;
    while (top) {
      const p = stack[--top], x = p % W, y = (p - x) / W;
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (label[q] < 0 && data[q * 4 + 3] > 0) { label[q] = id; stack[top++] = q; }
      }
    }
    comps.push(c);
  }
  const cellOf = c => Math.min(rows - 1, Math.floor(c.sy / c.n / H * rows)) * columns + Math.min(columns - 1, Math.floor(c.sx / c.n / W * columns));
  let dropped = 0;
  for (const c of comps) { c.cell = c.n < MIN_SPECK ? -1 : cellOf(c); if (c.cell < 0 || names[c.cell] === '-' || names[c.cell] === undefined) { dropped += c.n; c.cell = -1; } }
  for (let p = 0; p < W * H; p++) if (label[p] >= 0 && comps[label[p]].cell < 0) data[p * 4 + 3] = 0;
  const tiles = {};
  names.forEach((entry, cell) => {
    if (entry === '-') return;
    const hanging = entry.endsWith('^'), name = hanging ? entry.slice(0, -1) : entry;
    const own = comps.filter(c => c.cell === cell);
    if (!own.length) throw new Error(`No painting in cell ${cell} (${name})`);
    const x0 = Math.min(...own.map(c => c.x0)), y0 = Math.min(...own.map(c => c.y0));
    const x1 = Math.max(...own.map(c => c.x1)) + 1, y1 = Math.max(...own.map(c => c.y1)) + 1;
    // Another cell's paint inside this rect would be cut along with it.
    for (const c of comps) if (c.cell >= 0 && c.cell !== cell && c.x1 >= x0 && c.x0 < x1 && c.y1 >= y0 && c.y0 < y1)
      throw new Error(`${name} overlaps the painting of cell ${c.cell}`);
    // Root: mean column of the opaque pixels in the band nearest the base (the top, for vines).
    const band = Math.max(2, Math.round((y1 - y0) * .03));
    let sum = 0, n = 0;
    for (let y = hanging ? y0 : y1 - band; y < (hanging ? y0 + band : y1); y++) for (let x = x0; x < x1; x++)
      if (data[(y * W + x) * 4 + 3] > 128) { sum += x; n++; }
    tiles[name] = { cell, rect: [x0, y0, x1, y1], root: [((n ? sum / n : (x0 + x1) / 2) - x0) / (x1 - x0), hanging ? 0 : 1] };
  });
  return { data, width: W, height: H, tiles, dropped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [raw, grid, names, preview] = process.argv.slice(2);
  const [columns, rows] = grid.split('x').map(Number);
  const sheet = await prepareSheet(raw, columns, rows, names.split(','));
  for (const [name, t] of Object.entries(sheet.tiles)) console.log(name.padEnd(22), `${t.rect[2] - t.rect[0]}x${t.rect[3] - t.rect[1]}`, 'at', t.rect.slice(0, 2).join(','), 'root', t.root.map(v => v.toFixed(2)).join(','));
  console.log(`${sheet.width}x${sheet.height}, dropped ${sheet.dropped} speck pixels`);
  if (preview) await sharp(sheet.data, { raw: { width: sheet.width, height: sheet.height, channels: 4 } }).flatten({ background: '#5a6b8a' }).png().toFile(preview);
}
