// Offline bake for the deterministic island colour map. Run after editing
// terrain.ts: npx tsx scripts/generate-terrain-colors.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { beachDistance, fbm, terrainColor, terrainHeight, WORLD_PALETTE } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';

const resolution = 1024;
const size = createWorld().size;
const texel = size / resolution;
const pixels = new Uint8ClampedArray(resolution * resolution * 4);
const shoreline = new Uint16Array(resolution * resolution);
const sandy = new Uint8Array(resolution * resolution);
shoreline.fill(65535);
const rgb = new Map<string, [number, number, number]>();
function channelsFor(hex: string): [number, number, number] {
  let channels = rgb.get(hex);
  if (!channels) {
    channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    rgb.set(hex, channels);
  }
  return channels;
}
const soften = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function paintedChannels(hex: string, x: number, z: number): number[] {
  let channels: readonly number[] = channelsFor(hex);
  if ([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass].some(color => color === hex)) {
    const shade = channelsFor(WORLD_PALETTE.grass), light = channelsFor(WORLD_PALETTE.grassLight), dry = channelsFor(WORLD_PALETTE.dryGrass);
    const greenMix = soften((fbm(x / 36 + 7, z / 36 + 3) + .2) / .4);
    const dryMix = soften((fbm(x / 48 - 4, z / 48 + 9) - .18) / .24);
    channels = shade.map((value, i) => (value + (light[i] - value) * greenMix) * (1 - dryMix) + dry[i] * dryMix);
  }
  // Quiet overlapping washes read as paint at walking distance, with no grain
  // or baked lighting that would fight the scene's moving sun and shadows.
  const wash = 1 + fbm(x / 17 + 8, z / 21 - 3) * .075 + fbm(x / 2.7 - 5, z / 6.8 + 4) * .018;
  return channels.map(value => Math.max(0, Math.min(255, value * wash)));
}

for (let row = 0; row < resolution; row++) for (let col = 0; col < resolution; col++) {
  const x = (col + .5) * texel - size / 2;
  const z = size / 2 - (row + .5) * texel;
  const y = terrainHeight(x, z);
  const slope = Math.hypot(terrainHeight(x + 2, z) - terrainHeight(x - 2, z),
    terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) / 4;
  const hex = terrainColor(x, z, y, slope, false, true, false);
  const channels = paintedChannels(hex, x, z);
  const cell = row * resolution + col;
  const index = cell * 4;
  if (y <= .05) shoreline[cell] = 0;
  sandy[cell] = hex === WORLD_PALETTE.sand || hex === WORLD_PALETTE.sandLight ? 1 : 0;
  pixels[index] = channels[0]; pixels[index + 1] = channels[1];
  pixels[index + 2] = channels[2]; pixels[index + 3] = 255;
  const border = beachDistance(x, z);
  if (y >= .8 && Math.abs(border) < 1) {
    const grass = paintedChannels(terrainColor(x, z, y, slope, false, false, false), x, z);
    const sand = paintedChannels(terrainColor(x, z, y, slope, false, true, false), x, z);
    const t = Math.max(0, Math.min(1, (border + 1) / 2));
    const mix = t * t * (3 - 2 * t);
    for (let channel = 0; channel < 3; channel++)
      pixels[index + channel] = grass[channel] * (1 - mix) + sand[channel] * mix;
  }
}

// Approximate Euclidean distance to the actual waterline, in tenths of a
// pixel. The 3 m damp band is continuous even where the 2 m height mesh bends.
for (let row = 1; row < resolution; row++) for (let col = 1; col < resolution - 1; col++) {
  const i = row * resolution + col;
  shoreline[i] = Math.min(shoreline[i], shoreline[i - 1] + 10, shoreline[i - resolution] + 10,
    shoreline[i - resolution - 1] + 14, shoreline[i - resolution + 1] + 14);
}
for (let row = resolution - 2; row >= 0; row--) for (let col = resolution - 2; col >= 1; col--) {
  const i = row * resolution + col;
  shoreline[i] = Math.min(shoreline[i], shoreline[i + 1] + 10, shoreline[i + resolution] + 10,
    shoreline[i + resolution - 1] + 14, shoreline[i + resolution + 1] + 14);
}
const wet = channelsFor(WORLD_PALETTE.sandWet);
for (let row = 0; row < resolution; row++) for (let col = 0; col < resolution; col++) {
  const cell = row * resolution + col;
  if (!sandy[cell]) continue;
  const x = (col + .5) * texel - size / 2;
  const z = size / 2 - (row + .5) * texel;
  const width = 3 + fbm(x / 12 + 51, z / 12 - 7) * 3;
  const distance = shoreline[cell] * texel / 10;
  const t = Math.max(0, Math.min(1, width + .5 - distance));
  const mix = t * t * (3 - 2 * t);
  const index = cell * 4;
  for (let channel = 0; channel < 3; channel++)
    pixels[index + channel] = pixels[index + channel] * (1 - mix) + wet[channel] * mix;
}

// One pixel of feathering softens the colour-region edge without adding grain.
const base = pixels.slice();
for (let row = 1; row < resolution - 1; row++) for (let col = 1; col < resolution - 1; col++) {
  const index = (row * resolution + col) * 4;
  for (let channel = 0; channel < 3; channel++) {
    pixels[index + channel] = (base[index + channel] * 4 +
      base[index - 4 + channel] + base[index + 4 + channel] +
      base[index - resolution * 4 + channel] + base[index + resolution * 4 + channel]) / 8;
  }
}

mkdirSync('public/textures', { recursive: true });
const output = 'public/textures/terrain-color.png';
const result = spawnSync('magick', ['-size', `${resolution}x${resolution}`, '-depth', '8', 'RGBA:-', output],
  { input: Buffer.from(pixels), encoding: 'utf8' });
if (result.status !== 0) throw new Error(`ImageMagick failed: ${result.stderr}`);
console.log(`Baked ${output} (${resolution}x${resolution}, ${size} m island)`);
