// Builds the runtime foliage atlases from the Codex-painted source tiles plus procedural tiles.
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
import * as procedural from './foliage-tiles.mjs';

const SOURCE = 'tools/art/foliage-codex-source.png';
const source = JSON.parse(readFileSync('tools/art/foliage-codex-source.metrics.json', 'utf8'));
const codex = Object.fromEntries(source.tiles.map(t => [t.name, t]));
const GUARD = 6;      // transparent pixels around every tile
const BLEED = 10;     // colour bleed into transparent pixels

// `codex` tiles are cut out of the Codex painting at `scale`, optionally regraded.
// `make` tiles come from foliage-tiles.mjs. `grade` follows sharp.modulate.
const ATLASES = {
  foliage: {
    size: 2048,
    tiles: [
      // Sources for the clusters below; not packed themselves.
      { name: 'emerald', codex: 'emerald-broadleaf', scale: .82, grade: { brightness: 1.16, saturation: 1.02, hue: -4 }, hidden: true },
      { name: 'lime', codex: 'lime-broadleaf', scale: .82, grade: { brightness: 1.12, saturation: 1.02, hue: -3 }, hidden: true },
      { name: 'guava', codex: 'mangrove-guava', scale: .82, grade: { brightness: 1.16, saturation: 1.02, hue: -3 }, hidden: true },
      { name: 'teal', codex: 'shadow-broadleaf', scale: .82, grade: { brightness: 1.2, saturation: 1.0, hue: 6 }, hidden: true },
      { name: 'ipe-yellow', codex: 'yellow-ipe', scale: .82, hidden: true },
      { name: 'ipe-pink', codex: 'pink-ipe', scale: .82, hidden: true },
      { name: 'bougainvillea', codex: 'bougainvillea', scale: .82, hidden: true },
      // Leafy masses: many sprigs composed into one card, so a large card carries 20 to 30 cm leaves.
      { name: 'cluster-lime', cluster: { from: ['lime', 'emerald', 'lime'], count: 8, size: 384, seed: 1 } },
      { name: 'cluster-emerald', cluster: { from: ['emerald', 'guava', 'lime'], count: 8, size: 384, seed: 2 } },
      { name: 'cluster-guava', cluster: { from: ['guava', 'emerald', 'teal'], count: 8, size: 384, seed: 3 } },
      { name: 'cluster-teal', cluster: { from: ['teal', 'emerald', 'guava'], count: 8, size: 384, seed: 4 } },
      { name: 'cluster-ipe-yellow', cluster: { from: ['ipe-yellow', 'ipe-yellow', 'lime'], count: 7, size: 384, seed: 5, scale: [.5, .78] } },
      { name: 'cluster-ipe-pink', cluster: { from: ['ipe-pink', 'ipe-pink', 'lime'], count: 7, size: 384, seed: 6, scale: [.5, .78] } },
      { name: 'cluster-flame', cluster: { from: ['bougainvillea', 'lime', 'bougainvillea'], count: 7, size: 384, seed: 7, scale: [.5, .78], tint: { hue: 52, saturation: 1.2, brightness: 1.05 }, tintOnly: ['bougainvillea'] } },
      { name: 'cluster-bougainvillea', cluster: { from: ['bougainvillea', 'emerald', 'bougainvillea'], count: 8, size: 384, seed: 8, scale: [.5, .78] } },
      { name: 'palm-fan', codex: 'palm-fan', scale: .8, grade: { brightness: 1.12, saturation: 1.05, hue: -3 } },
      { name: 'banana-leaf', codex: 'banana', scale: .9, grade: { brightness: 1.08, saturation: 1.05, hue: -2 } },
      { name: 'monstera', codex: 'monstera', scale: .8, grade: { brightness: 1.12, saturation: 1.0, hue: -3 } },
      { name: 'fern', codex: 'fern', scale: .8, grade: { brightness: 1.14, saturation: 1.0, hue: -4 } },
      { name: 'frond', make: ['frondHalf', { seed: 7 }] },
      { name: 'frond-solid', make: ['frondHalf', { solid: true, seed: 11 }] },
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
    ],
  },
};

async function cut(spec) {
  if (spec.make) {
    const tile = procedural[spec.make[0]](spec.make[1]);
    const { data, info } = await sharp(Buffer.from(tile.svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height, root: tile.root };
  }
  const t = codex[spec.codex], [bx0, by0, bx1, by1] = t.bounds;
  const cellX = t.index % 4 * 512, cellY = Math.floor(t.index / 4) * 512;
  let image = sharp(SOURCE).extract({ left: cellX + bx0, top: cellY + by0, width: bx1 - bx0, height: by1 - by0 });
  const w = Math.round((bx1 - bx0) * spec.scale), h = Math.round((by1 - by0) * spec.scale);
  image = image.resize(w, h, { kernel: 'lanczos3' });
  if (spec.grade) {
    // Grade only the colour: split alpha, modulate, rejoin.
    const rgba = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = rgba.data[i * 4 + 3];
    const graded = await sharp(rgba.data, { raw: { width: w, height: h, channels: 4 } }).removeAlpha().modulate(spec.grade).raw().toBuffer();
    const out = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { out[i * 4] = graded[i * 3]; out[i * 4 + 1] = graded[i * 3 + 1]; out[i * 4 + 2] = graded[i * 3 + 2]; out[i * 4 + 3] = alpha[i]; }
    return { data: out, w, h, root: [(t.root[0] * 512 - bx0) / (bx1 - bx0), (t.root[1] * 512 - by0) / (by1 - by0)] };
  }
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w, h, root: [(t.root[0] * 512 - bx0) / (bx1 - bx0), (t.root[1] * 512 - by0) / (by1 - by0)] };
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

// Flatten antialiasing on the way in: keep the painted alpha, but bleed colour outward.
function bleed(tile, extra) {
  const W = tile.w + extra * 2, H = tile.h + extra * 2, data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < tile.h; y++) tile.data.copy(data, ((y + extra) * W + extra) * 4, y * tile.w * 4, (y + 1) * tile.w * 4);
  let known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < BLEED; pass++) {
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
  return { data, w: W, h: H };
}

function pack(tiles, size) {
  // Shelf packer, tallest first.
  const order = tiles.map((t, i) => i).sort((a, b) => tiles[b].h - tiles[a].h);
  const placed = new Array(tiles.length);
  let x = GUARD, y = GUARD, row = 0;
  for (const i of order) {
    const t = tiles[i], w = t.w + GUARD, h = t.h + GUARD;
    if (x + w > size) { x = GUARD; y += row + GUARD; row = 0; }
    if (y + h > size) throw new Error(`Atlas overflow at ${t.name}: ${x},${y}`);
    placed[i] = { x, y }; x += w; row = Math.max(row, h);
  }
  return { placed, used: y + row };
}

async function build(name) {
  const { size, tiles: roster } = ATLASES[name];
  const cutTiles = [], cache = new Map();
  for (const spec of roster) {
    const raw = spec.cluster ? await composeCluster(spec, cache) : await cut(spec);
    cache.set(spec.name, raw);
    if (spec.hidden) continue;
    const grown = bleed(raw, BLEED);
    cutTiles.push({ name: spec.name, ...grown, contentW: raw.w, contentH: raw.h, root: raw.root, source: spec.make ? 'procedural' : spec.cluster ? 'cluster' : 'codex' });
  }
  const { placed, used } = pack(cutTiles, size);
  const atlas = Buffer.alloc(size * size * 4);
  const rects = {};
  cutTiles.forEach((t, i) => {
    const { x, y } = placed[i];
    for (let row = 0; row < t.h; row++) t.data.copy(atlas, ((y + row) * size + x) * 4, row * t.w * 4, (row + 1) * t.w * 4);
    // The rect is the painted content; the BLEED margin around it holds coloured, transparent pixels.
    rects[t.name] = { x: x + BLEED, y: y + BLEED, w: t.contentW, h: t.contentH, root: t.root.map(v => Math.round(v * 1000) / 1000), source: t.source };
  });
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  const png = join(dir, `${name}.png`), webp = `public/textures/${name}-atlas.webp`;
  await sharp(atlas, { raw: { width: size, height: size, channels: 4 } }).png().toFile(png);
  // WebP keeps alpha losslessly; only the painted RGB uses quality compression.
  execFileSync('cwebp', ['-q', '90', '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-exact', png, '-o', webp], { stdio: 'ignore' });
  const file = readFileSync(webp), stats = { transparent: 0, opaque: 0, antialiased: 0 };
  for (let i = 3; i < atlas.length; i += 4) stats[atlas[i] === 0 ? 'transparent' : atlas[i] === 255 ? 'opaque' : 'antialiased']++;
  writeFileSync(`tools/art/${name}-atlas.metrics.json`, JSON.stringify({
    generator: 'tools/art/build-foliage-atlas.mjs', source: SOURCE, size, usedRows: used, guard: GUARD,
    output: webp, bytes: file.length, sha256: createHash('sha256').update(file).digest('hex'), alpha: stats, tiles: rects,
  }, null, 2) + '\n');
  console.log(name, `${size}px`, `${file.length} bytes`, `rows ${used}/${size}`, Object.keys(rects).length, 'tiles');
}

const which = process.argv[2];
for (const name of Object.keys(ATLASES)) if (!which || which === name) await build(name);
