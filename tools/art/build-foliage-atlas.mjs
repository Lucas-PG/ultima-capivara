// Builds the runtime foliage atlases from the Codex-painted source sheets (see docs/assets.md).
//   node tools/art/build-foliage-atlas.mjs            builds both atlases
//   node tools/art/build-foliage-atlas.mjs foliage    only the plants atlas
// Outputs public/textures/<name>-atlas.webp and tools/art/<name>-atlas.metrics.json.
// Tiles are shelf-packed with transparent guard bands, and colour is bled into
// the transparent pixels so mip-mapped edges never pick up a dark or grey halo.
// sharp comes from @gltf-transform/functions; cwebp must be installed (brew install webp).
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSheet } from './prepare-foliage-sheet.mjs';

const SOURCE = 'tools/art/foliage-codex-source.png';
const source = JSON.parse(readFileSync('tools/art/foliage-codex-source.metrics.json', 'utf8'));
const codex = Object.fromEntries(source.tiles.map(t => [t.name, t]));
const GUARD = 6;      // transparent pixels around every tile
const BLEED = 10;     // transparent margin kept around each tile (edge colour, then mean paint)

// `codex` tiles are cut out of the first Codex painting (fixed 512 cells, bounds in its metrics).
// `sheet` tiles are cut out of a later Codex painting, cleaned by prepare-foliage-sheet.mjs.
// `cluster` tiles compose several cut tiles into one leafy mass.
// `grade` follows sharp.modulate; `close` fills the gaps between leaflets (pixels) for distant cards.
const SHEETS = {
  garden: { file: 'tools/art/foliage-garden-codex.png', grid: [4, 4], names: ['palm-frond', 'palm-frond-old', 'bougainvillea-trail^',
    'bougainvillea-mound', 'bougainvillea-coral^', 'hibiscus', 'heliconia', 'strelitzia', 'croton', 'taro', 'lawn-grass', 'wild-grass',
    'dune-grass', 'impatiens', 'mango-leaves', 'bromeliad'] },
  fronds: { file: 'tools/art/foliage-fronds-codex.png', grid: [2, 1], names: ['frond', 'frond-old'] },
  vines: { file: 'tools/art/foliage-vines-codex.png', grid: [4, 1], names: ['trail-magenta^', 'trail-pink^', 'trail-coral^', 'trail-leafy^'] },
  blooms: { file: 'tools/art/foliage-blooms-codex.png', grid: [2, 2], names: ['ipe-yellow-bloom', 'ipe-pink-bloom', 'flamboyant-bloom', 'flamboyant-leaves'] },
};
const ATLASES = {
  foliage: {
    size: 2048,
    tiles: [
      // Sources for the clusters below; not packed themselves.
      { name: 'emerald', codex: 'emerald-broadleaf', scale: .82, grade: { brightness: 1.16, saturation: 1.02, hue: -4 }, hidden: true },
      { name: 'lime', codex: 'lime-broadleaf', scale: .82, grade: { brightness: 1.12, saturation: 1.02, hue: -3 }, hidden: true },
      { name: 'guava', codex: 'mangrove-guava', scale: .82, grade: { brightness: 1.16, saturation: 1.02, hue: -3 }, hidden: true },
      { name: 'teal', codex: 'shadow-broadleaf', scale: .82, grade: { brightness: 1.2, saturation: 1.0, hue: 6 }, hidden: true },
      { name: 'bougainvillea', codex: 'bougainvillea', scale: .82, hidden: true },
      { name: 'mango', sheet: 'garden', tile: 'mango-leaves', scale: 1.2, grade: { brightness: 1.08, saturation: 1.0, hue: -2 }, hidden: true },
      { name: 'hibiscus-sprig', sheet: 'garden', tile: 'hibiscus', scale: 1.1, hidden: true },
      // Leafy masses: many sprigs composed into one card, so a large card carries 20 to 30 cm leaves.
      { name: 'cluster-lime', cluster: { from: ['lime', 'emerald', 'lime'], count: 8, size: 352, seed: 1 } },
      { name: 'cluster-emerald', cluster: { from: ['emerald', 'guava', 'lime'], count: 8, size: 352, seed: 2 } },
      { name: 'cluster-guava', cluster: { from: ['guava', 'emerald', 'teal'], count: 8, size: 352, seed: 3 } },
      { name: 'cluster-teal', cluster: { from: ['teal', 'emerald', 'guava'], count: 8, size: 320, seed: 4 } },
      { name: 'cluster-mango', cluster: { from: ['mango', 'emerald', 'mango'], count: 8, size: 352, seed: 10, scale: [.46, .7] } },
      // Trees in bloom: whole painted flower clusters from the blooms sheet.
      { name: 'cluster-ipe-yellow', sheet: 'blooms', tile: 'ipe-yellow-bloom', scale: .52 },
      { name: 'cluster-ipe-pink', sheet: 'blooms', tile: 'ipe-pink-bloom', scale: .52 },
      { name: 'cluster-flame', sheet: 'blooms', tile: 'flamboyant-bloom', scale: .52 },
      { name: 'flamboyant-leaves', sheet: 'blooms', tile: 'flamboyant-leaves', scale: .52 },
      { name: 'cluster-hibiscus', cluster: { from: ['hibiscus-sprig', 'emerald', 'lime'], count: 7, size: 320, seed: 9, scale: [.42, .62] } },
      { name: 'cluster-bougainvillea', cluster: { from: ['bougainvillea', 'emerald', 'bougainvillea'], count: 8, size: 320, seed: 8, scale: [.5, .78] } },
      // Coconut fronds: the painted frond is split along its midrib onto the two folded halves of a blade.
      { name: 'frond', sheet: 'fronds', tile: 'frond', scale: .66 },
      { name: 'frond-old', sheet: 'fronds', tile: 'frond-old', scale: .5 },
      { name: 'frond-far', sheet: 'fronds', tile: 'frond', scale: .3, close: 5 },
      // Bougainvillea trails hang from their root at the top of the tile.
      { name: 'trail-magenta', sheet: 'vines', tile: 'trail-magenta', scale: .62 },
      { name: 'trail-pink', sheet: 'vines', tile: 'trail-pink', scale: .62 },
      { name: 'trail-coral', sheet: 'vines', tile: 'trail-coral', scale: .62 },
      { name: 'trail-leafy', sheet: 'vines', tile: 'trail-leafy', scale: .62 },
      { name: 'bougainvillea-mound', sheet: 'garden', tile: 'bougainvillea-mound', scale: 1 },
      // Garden and understory plants.
      { name: 'hibiscus', sheet: 'garden', tile: 'hibiscus', scale: 1 },
      { name: 'heliconia', sheet: 'garden', tile: 'heliconia', scale: 1.1 },
      { name: 'strelitzia', sheet: 'garden', tile: 'strelitzia', scale: 1 },
      { name: 'croton', sheet: 'garden', tile: 'croton', scale: 1 },
      { name: 'taro', sheet: 'garden', tile: 'taro', scale: 1 },
      { name: 'bromeliad', sheet: 'garden', tile: 'bromeliad', scale: .9 },
      { name: 'impatiens', sheet: 'garden', tile: 'impatiens', scale: .78 },
      // Meadow patches in the open fields (drawn by the plant batch, so they reach past the lawn).
      { name: 'wild-grass', sheet: 'garden', tile: 'wild-grass', scale: .66, grade: { brightness: 1.12, saturation: .86 } },
      { name: 'palm-fan', codex: 'palm-fan', scale: .7, grade: { brightness: 1.12, saturation: 1.05, hue: -3 } },
      { name: 'banana-leaf', codex: 'banana', scale: .9, grade: { brightness: 1.08, saturation: 1.05, hue: -2 } },
      { name: 'monstera', codex: 'monstera', scale: .8, grade: { brightness: 1.12, saturation: 1.0, hue: -3 } },
      { name: 'fern', codex: 'fern', scale: .8, grade: { brightness: 1.14, saturation: 1.0, hue: -4 } },
    ],
  },
  ground: {
    size: 1024,
    tiles: [
      { name: 'clover', codex: 'clover', scale: .5 },
      { name: 'wildflowers', codex: 'wildflowers', scale: .5 },
      { name: 'grass', codex: 'grass', scale: .5, grade: { brightness: 1.2, saturation: 1.02, hue: -6 } },
      { name: 'fallen-leaves', codex: 'fallen-leaves', scale: .5 },
      { name: 'fern', codex: 'fern', scale: .5, grade: { brightness: 1.14, saturation: 1.0, hue: -4 } },
      { name: 'monstera', codex: 'monstera', scale: .5, grade: { brightness: 1.12, saturation: 1.0, hue: -3 } },
      // Lawn tufts are graded toward the terrain's grass paint; runtime tints finish the match per spot.
      { name: 'lawn', sheet: 'garden', tile: 'lawn-grass', scale: .9, grade: { brightness: 1.32, saturation: .74, hue: 6 } },
      { name: 'wild-grass', sheet: 'garden', tile: 'wild-grass', scale: .9, grade: { brightness: 1.12, saturation: .86 } },
      { name: 'dune-grass', sheet: 'garden', tile: 'dune-grass', scale: .9 },
      { name: 'impatiens', sheet: 'garden', tile: 'impatiens', scale: .8 },
    ],
  },
};

const sheets = new Map();
async function sheet(name) {
  if (!sheets.has(name)) {
    const { file, grid, names } = SHEETS[name];
    sheets.set(name, await prepareSheet(file, grid[0], grid[1], names));
  }
  return sheets.get(name);
}

/** Fills the colour of transparent pixels from painted neighbours (alpha untouched). */
function fillColour(data, w, h, passes) {
  let known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const next = known.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!known[j]) continue;
        r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
      }
      if (n) { data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; next[i] = 1; }
    }
    known = next;
  }
}

/** Morphological closing of the alpha channel: gaps narrower than 2 * radius fill in. */
function closeAlpha(data, w, h, radius) {
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
  const pass = (src, pick) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = pick === 'max' ? 0 : 255;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const xx = x + dx, yy = y + dy;
        const a = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
        v = pick === 'max' ? Math.max(v, a) : Math.min(v, a);
      }
      out[y * w + x] = v;
    }
    return out;
  };
  const closed = pass(pass(alpha, 'max'), 'min');
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = Math.max(alpha[i], closed[i]);
}

async function graded(image, w, h, grade) {
  // Grade only the colour: split alpha, modulate, rejoin.
  const rgba = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!grade) return rgba.data;
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = rgba.data[i * 4 + 3];
  const rgb = await sharp(rgba.data, { raw: { width: w, height: h, channels: 4 } }).removeAlpha().modulate(grade).raw().toBuffer();
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = rgb[i * 3]; out[i * 4 + 1] = rgb[i * 3 + 1]; out[i * 4 + 2] = rgb[i * 3 + 2]; out[i * 4 + 3] = alpha[i]; }
  return out;
}

async function cut(spec) {
  let image, bw, bh, root;
  if (spec.sheet) {
    const s = await sheet(spec.sheet), t = s.tiles[spec.tile];
    if (!t) throw new Error(`No tile ${spec.tile} in sheet ${spec.sheet}`);
    const [x0, y0, x1, y1] = t.rect;
    // Colour under transparent pixels is whatever the painting left; bleed it before any filtering.
    const region = Buffer.alloc((x1 - x0) * (y1 - y0) * 4);
    for (let y = y0; y < y1; y++) s.data.copy(region, (y - y0) * (x1 - x0) * 4, (y * s.width + x0) * 4, (y * s.width + x1) * 4);
    fillColour(region, x1 - x0, y1 - y0, 6);
    image = sharp(region, { raw: { width: x1 - x0, height: y1 - y0, channels: 4 } });
    bw = x1 - x0; bh = y1 - y0; root = t.root;
  } else {
    const t = codex[spec.codex], [bx0, by0, bx1, by1] = t.bounds;
    const cellX = t.index % 4 * 512, cellY = Math.floor(t.index / 4) * 512;
    image = sharp(SOURCE).extract({ left: cellX + bx0, top: cellY + by0, width: bx1 - bx0, height: by1 - by0 });
    bw = bx1 - bx0; bh = by1 - by0; root = [(t.root[0] * 512 - bx0) / bw, (t.root[1] * 512 - by0) / bh];
  }
  const w = Math.round(bw * spec.scale), h = Math.round(bh * spec.scale);
  const data = await graded(image.resize(w, h, { kernel: 'lanczos3' }), w, h, spec.grade);
  if (spec.close) { fillColour(data, w, h, spec.close + 2); closeAlpha(data, w, h, spec.close); }
  return { data, w, h, root };
}

// Composes one leafy mass from several already-cut tiles: rotated, mirrored and tone-varied copies
// scattered in a disc, back layers darker. Deterministic per seed.
async function composeCluster(spec, cut) {
  const { from, count, size, seed, scale = [.5, .74], tint, tintOnly } = spec.cluster;
  let a = seed * 2654435761 >>> 0;
  const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const layers = [];
  for (let i = 0; i < count; i++) {
    const name = from[i % from.length], src = cut.get(name);
    const w = Math.round(size * (scale[0] + rand() * (scale[1] - scale[0]))), h = Math.round(w * src.h / src.w);
    let image = sharp(src.data, { raw: { width: src.w, height: src.h, channels: 4 } }).resize(w, h, { kernel: 'lanczos3' });
    if (rand() < .5) image = image.flop();
    const shadeIn = .74 + .32 * (i / (count - 1));
    const opts = { brightness: shadeIn };
    if (tint && (!tintOnly || tintOnly.includes(name))) Object.assign(opts, tint, { brightness: shadeIn * (tint.brightness ?? 1) });
    // modulate ignores alpha, so flatten it out and back in.
    const rgba = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = Buffer.alloc(rgba.info.width * rgba.info.height);
    for (let p = 0; p < alpha.length; p++) alpha[p] = rgba.data[p * 4 + 3];
    const rgb = await sharp(rgba.data, { raw: { width: rgba.info.width, height: rgba.info.height, channels: 4 } }).removeAlpha().modulate(opts).raw().toBuffer();
    const merged = Buffer.alloc(alpha.length * 4);
    for (let p = 0; p < alpha.length; p++) { merged[p * 4] = rgb[p * 3]; merged[p * 4 + 1] = rgb[p * 3 + 1]; merged[p * 4 + 2] = rgb[p * 3 + 2]; merged[p * 4 + 3] = alpha[p]; }
    const rotated = await sharp(merged, { raw: { width: rgba.info.width, height: rgba.info.height, channels: 4 } })
      .rotate((rand() - .5) * 150, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
    const radius = size * .27 * Math.sqrt(rand()), theta = rand() * Math.PI * 2;
    layers.push({ input: rotated.data, left: Math.round(size / 2 + Math.cos(theta) * radius - rotated.info.width / 2),
      top: Math.round(size / 2 + Math.sin(theta) * radius * .9 - rotated.info.height / 2) });
  }
  // Composite on a canvas large enough for every layer, then trim to the disc.
  const pad = Math.round(size * .3), canvas = size + pad * 2;
  const shifted = layers.map(l => ({ input: l.input, left: l.left + pad, top: l.top + pad })).filter(l => l.left >= 0 && l.top >= 0);
  const out = await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(shifted).raw().toBuffer({ resolveWithObject: true });
  // Trim transparent margins, keep the result inside `size`.
  const trimmed = await sharp(out.data, { raw: { width: canvas, height: canvas, channels: 4 } }).trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
  let { data, info } = trimmed;
  if (Math.max(info.width, info.height) > size) {
    const k = size / Math.max(info.width, info.height), rw = Math.round(info.width * k), rh = Math.round(info.height * k);
    data = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(rw, rh, { kernel: 'lanczos3' }).raw().toBuffer();
    info = { width: rw, height: rh };
  }
  return { data, w: info.width, h: info.height, root: [.5, .5] };
}

/** Mean straight RGB of a tile's opaque paint. */
function opaqueMean(data, w, h) {
  const sum = [0, 0, 0]; let n = 0;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 200) { sum[0] += data[i * 4]; sum[1] += data[i * 4 + 1]; sum[2] += data[i * 4 + 2]; n++; }
  return sum.map(v => v / Math.max(1, n));
}

// Colour under transparent pixels decides what the GPU's mips average to. The first EDGE pixels
// around the paint take its edge colour (clean magnified silhouettes); everything else transparent,
// holes between leaves included, takes the tile's mean paint, so distant crowns keep their
// brightness instead of averaging toward dark outlines and black background.
const EDGE = 3;
function bleed(tile, extra) {
  const W = tile.w + extra * 2, H = tile.h + extra * 2, data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < tile.h; y++) tile.data.copy(data, ((y + extra) * W + extra) * 4, y * tile.w * 4, (y + 1) * tile.w * 4);
  let known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < EDGE; pass++) {
    const next = known.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!known[j]) continue;
        r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
      }
      if (n) { data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; next[i] = 1; }
    }
    known = next;
  }
  const mean = opaqueMean(tile.data, tile.w, tile.h);
  for (let i = 0; i < W * H; i++) if (!known[i]) { data[i * 4] = mean[0]; data[i * 4 + 1] = mean[1]; data[i * 4 + 2] = mean[2]; }
  return { data, w: W, h: H, mean };
}

function pack(tiles, size) {
  // MaxRects, best short side fit, biggest tiles first. Every placement splits all free rectangles
  // it overlaps, so short tiles fill the gaps beside tall ones.
  const order = tiles.map((t, i) => i).sort((a, b) => Math.max(tiles[b].w, tiles[b].h) * 1e4 + tiles[b].w * tiles[b].h - Math.max(tiles[a].w, tiles[a].h) * 1e4 - tiles[a].w * tiles[a].h);
  let free = [{ x: GUARD, y: GUARD, w: size - GUARD * 2, h: size - GUARD * 2 }];
  const placed = new Array(tiles.length);
  let used = 0;
  for (const i of order) {
    const t = tiles[i], w = t.w + GUARD, h = t.h + GUARD;
    let best = null, shortSide = Infinity, longSide = Infinity;
    for (const r of free) if (r.w >= w && r.h >= h) {
      const a = Math.min(r.w - w, r.h - h), b = Math.max(r.w - w, r.h - h);
      if (a < shortSide || (a === shortSide && b < longSide)) { best = r; shortSide = a; longSide = b; }
    }
    if (!best) throw new Error(`Atlas overflow at ${t.name}`);
    const p = { x: best.x, y: best.y, w, h };
    placed[i] = { x: p.x, y: p.y }; used = Math.max(used, p.y + h);
    const next = [];
    for (const r of free) {
      if (p.x >= r.x + r.w || p.x + p.w <= r.x || p.y >= r.y + r.h || p.y + p.h <= r.y) { next.push(r); continue; }
      if (p.x > r.x) next.push({ x: r.x, y: r.y, w: p.x - r.x, h: r.h });
      if (p.x + p.w < r.x + r.w) next.push({ x: p.x + p.w, y: r.y, w: r.x + r.w - p.x - p.w, h: r.h });
      if (p.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: p.y - r.y });
      if (p.y + p.h < r.y + r.h) next.push({ x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - p.y - p.h });
    }
    // Drop rectangles fully inside another.
    free = next.filter((a, ia) => !next.some((b, ib) => ia !== ib && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (ia > ib || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
  }
  return { placed, used };
}

async function build(name) {
  const { size, tiles: roster } = ATLASES[name];
  const cutTiles = [], cache = new Map();
  for (const spec of roster) {
    const raw = spec.cluster ? await composeCluster(spec, cache) : await cut(spec);
    cache.set(spec.name, raw);
    if (spec.hidden) continue;
    const grown = bleed(raw, BLEED);
    cutTiles.push({ name: spec.name, ...grown, contentW: raw.w, contentH: raw.h, root: raw.root,
      source: spec.cluster ? 'cluster' : spec.sheet ? `sheet:${spec.sheet}` : 'codex' });
  }
  const { placed, used } = pack(cutTiles, size);
  const atlas = Buffer.alloc(size * size * 4);
  // Between tiles, the transparent sheet carries the mean of every tile, for the deepest mips.
  const area = cutTiles.reduce((n, t) => n + t.contentW * t.contentH, 0);
  const global = [0, 1, 2].map(c => cutTiles.reduce((sum, t) => sum + t.mean[c] * t.contentW * t.contentH, 0) / area);
  for (let i = 0; i < size * size; i++) { atlas[i * 4] = global[0]; atlas[i * 4 + 1] = global[1]; atlas[i * 4 + 2] = global[2]; }
  const rects = {};
  cutTiles.forEach((t, i) => {
    const { x, y } = placed[i];
    for (let row = 0; row < t.h; row++) t.data.copy(atlas, ((y + row) * size + x) * 4, row * t.w * 4, (row + 1) * t.w * 4);
    // The rect is the painted content; the BLEED margin around it holds coloured, transparent pixels.
    // Mean sRGB of the painted pixels, so runtime tints can match a tile to the ground it grows from.
    rects[t.name] = { x: x + BLEED, y: y + BLEED, w: t.contentW, h: t.contentH, root: t.root.map(v => Math.round(v * 1000) / 1000), source: t.source,
      mean: t.mean.map(v => Math.round(v / 255 * 1000) / 1000) };
  });
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  const png = join(dir, `${name}.png`), webp = `public/textures/${name}-atlas.webp`;
  await sharp(atlas, { raw: { width: size, height: size, channels: 4 } }).png().toFile(png);
  // WebP keeps alpha losslessly; only the painted RGB uses quality compression (q80: q90 cost 30 percent more bytes for no visible gain on these brush paintings).
  execFileSync('cwebp', ['-q', '80', '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-exact', png, '-o', webp], { stdio: 'ignore' });
  const file = readFileSync(webp), stats = { transparent: 0, opaque: 0, antialiased: 0 };
  for (let i = 3; i < atlas.length; i += 4) stats[atlas[i] === 0 ? 'transparent' : atlas[i] === 255 ? 'opaque' : 'antialiased']++;
  writeFileSync(`tools/art/${name}-atlas.metrics.json`, JSON.stringify({
    generator: 'tools/art/build-foliage-atlas.mjs', sources: [SOURCE, ...Object.values(SHEETS).map(sheet => sheet.file)].map(file =>
      ({ file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') })), size, usedRows: used, guard: GUARD,
    output: webp, bytes: file.length, sha256: createHash('sha256').update(file).digest('hex'), alpha: stats, tiles: rects,
  }, null, 2) + '\n');
  console.log(name, `${size}px`, `${file.length} bytes`, `rows ${used}/${size}`, Object.keys(rects).length, 'tiles');
}

const which = process.argv[2];
for (const name of Object.keys(ATLASES)) if (!which || which === name) await build(name);
