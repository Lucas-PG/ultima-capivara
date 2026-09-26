// Mechanical export of the original Codex painting to Cena's fixed GPU atlas contract.
// ImageMagick is the same local encoder used by the existing UI art pipeline.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = 'tools/art/ui-source/foliage-atlas.png', packed = 'tools/art/foliage-atlas-packed.png';
const output = 'public/textures/foliage-atlas.webp';
const names = ['emerald-broadleaf', 'lime-broadleaf', 'mangrove-guava', 'yellow-ipe', 'pink-ipe', 'bougainvillea', 'coconut-frond', 'palm-fan', 'banana', 'monstera', 'clover', 'wildflowers', 'grass', 'fallen-leaves', 'fern', 'shadow-broadleaf'];
const run = args => execFileSync('magick', args, { maxBuffer: 40 * 1024 * 1024 });
const [width, height] = run(['identify', '-format', '%w %h', source]).toString().split(' ').map(Number);
const raw = run([source, '-depth', '8', 'rgba:-']), atlas = Buffer.alloc(2048 * 2048 * 4), tiles = [];
for (let tile = 0; tile < 16; tile++) {
  const x0 = Math.floor(tile % 4 * width / 4), y0 = Math.floor(Math.floor(tile / 4) * height / 4);
  const w = Math.floor((tile % 4 + 1) * width / 4) - x0, h = Math.floor((Math.floor(tile / 4) + 1) * height / 4) - y0;
  const mask = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  // The generator's matte has low-alpha chroma speckles. Use a solid cutout before resampling;
  // antialiasing is then limited to the actual silhouette rather than transparent leaf interiors.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = raw[((y0 + y) * width + x0 + x) * 4 + 3] >= 128 ? 1 : 0;
  for (let at = 0; at < mask.length; at++) {
    if (!mask[at] || seen[at]) continue;
    const component = [at]; seen[at] = 1;
    for (let i = 0; i < component.length; i++) {
      const p = component[i], px = p % w, py = Math.floor(p / w);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = px + dx, y = py + dy, n = y * w + x;
        if (x >= 0 && x < w && y >= 0 && y < h && mask[n] && !seen[n]) { seen[n] = 1; component.push(n); }
      }
    }
    if (component.length < 8) for (const p of component) mask[p] = 0;
  }
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const cw = maxX - minX + 1, ch = maxY - minY + 1, cut = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (mask[(y + minY) * w + x + minX]) {
    const src = ((y0 + y + minY) * width + x0 + x + minX) * 4, dst = (y * cw + x) * 4;
    raw.copy(cut, dst, src, src + 3); cut[dst + 3] = 255;
  }
  const scale = 440 / Math.max(cw, ch), rw = Math.round(cw * scale), rh = Math.round(ch * scale);
  const resized = execFileSync('magick', ['-size', `${cw}x${ch}`, '-depth', '8', 'rgba:-', '-filter', 'Triangle', '-resize', `${rw}x${rh}!`, '-depth', '8', 'rgba:-'], { input: cut, maxBuffer: 4 * 1024 * 1024 });
  const ox = Math.floor((512 - rw) / 2), oy = 476 - rh;
  for (let y = 0; y < rh; y++) resized.copy(atlas, ((Math.floor(tile / 4) * 512 + oy + y) * 2048 + tile % 4 * 512 + ox) * 4, y * rw * 4, (y + 1) * rw * 4);
  tiles.push({ index: tile, name: names[tile], bounds: [ox, oy, ox + rw, oy + rh] });
}
mkdirSync('public/textures', { recursive: true });
execFileSync('magick', ['-size', '2048x2048', '-depth', '8', 'rgba:-', '-strip', `PNG32:${packed}`], { input: atlas });
// WebP stores alpha losslessly. Only the painted RGB uses quality compression.
execFileSync('cwebp', ['-q', '90', '-alpha_q', '100', '-m', '6', '-sharp_yuv', packed, '-o', output]);
const alpha = { transparent: 0, opaque: 0, antialiased: 0 };
for (let at = 3; at < atlas.length; at += 4) alpha[atlas[at] === 0 ? 'transparent' : atlas[at] === 255 ? 'opaque' : 'antialiased']++;
const file = readFileSync(output);
writeFileSync('tools/art/foliage-atlas.metrics.json', JSON.stringify({ source, sourceDimensions: [width, height], sourceBytes: readFileSync(source).length,
  packed, packedBytes: readFileSync(packed).length, packedSha256: createHash('sha256').update(readFileSync(packed)).digest('hex'),
  output, dimensions: [2048, 2048], channels: 'RGBA8', bytes: file.length, sha256: createHash('sha256').update(file).digest('hex'),
  compression: { rgbQuality: 90, losslessAlpha: true, sharpYuv: true }, tileSize: 512, minimumPadding: 36, alpha, tiles }, null, 2) + '\n');
console.log(JSON.stringify({ bytes: file.length, alpha, tiles }));
