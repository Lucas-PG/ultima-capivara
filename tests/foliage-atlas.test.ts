import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const png = readFileSync('tools/art/foliage-atlas-packed.png');
const webp = readFileSync('public/textures/foliage-atlas.webp');
const metrics = JSON.parse(readFileSync('tools/art/foliage-atlas.metrics.json', 'utf8'));

describe('painted foliage atlas sampling contract', () => {
  it('ships the complete 2048-square alpha atlas below the download budget', () => {
    expect(webp.toString('ascii', 0, 4)).toBe('RIFF');
    expect(webp.toString('ascii', 8, 16)).toBe('WEBPVP8X');
    expect(webp[20] & 16).toBe(16);
    expect(webp.readUIntLE(24, 3) + 1).toBe(2048);
    expect(webp.readUIntLE(27, 3) + 1).toBe(2048);
    expect(webp.length).toBeLessThan(800000);
    expect(metrics.sha256).toBe(createHash('sha256').update(webp).digest('hex'));
    expect(metrics.bytes).toBe(webp.length);
    expect(png.readUInt32BE(16)).toBe(2048); expect(png.readUInt32BE(20)).toBe(2048);
    expect(png[24]).toBe(8); expect(png[25]).toBe(6); expect(png[28]).toBe(0);
    expect(metrics.packedSha256).toBe(createHash('sha256').update(png).digest('hex'));
    expect(metrics.packedBytes).toBe(png.length);
    expect(metrics.tiles.map((t: { name: string }) => t.name)).toEqual(['emerald-broadleaf', 'lime-broadleaf', 'mangrove-guava', 'yellow-ipe', 'pink-ipe', 'bougainvillea', 'coconut-frond', 'palm-fan', 'banana', 'monstera', 'clover', 'wildflowers', 'grass', 'fallen-leaves', 'fern', 'shadow-broadleaf']);
  });
  it('keeps every tile guard transparent and painted interiors opaque, with antialiased edges', () => {
    const chunks: Buffer[] = [];
    for (let at = 8; at < png.length;) {
      const length = png.readUInt32BE(at);
      if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
      at += length + 12;
    }
    const data = inflateSync(Buffer.concat(chunks)), stride = 2048 * 4, pixels = new Uint8Array(stride * 2048);
    for (let y = 0; y < 2048; y++) {
      const filter = data[y * (stride + 1)];
      for (let x = 0; x < stride; x++) {
        const left = x < 4 ? 0 : pixels[y * stride + x - 4], up = y ? pixels[(y - 1) * stride + x] : 0;
        const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
        const prediction = left + up - corner, dl = Math.abs(prediction - left), du = Math.abs(prediction - up), dc = Math.abs(prediction - corner);
        const paeth = dl <= du && dl <= dc ? left : du <= dc ? up : corner;
        const add = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth : 0;
        pixels[y * stride + x] = (data[y * (stride + 1) + 1 + x] + add) & 255;
      }
    }
    for (let tile = 0; tile < 16; tile++) {
      let solid = 0, transparent = 0, edges = 0, guardPixels = 0;
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const a = pixels[((Math.floor(tile / 4) * 512 + y) * 2048 + tile % 4 * 512 + x) * 4 + 3];
        if ((x < 32 || x >= 480 || y < 32 || y >= 480) && a) guardPixels++;
        if (a === 255) solid++; else if (!a) transparent++; else edges++;
      }
      expect(guardPixels, `tile ${tile} bleeding into adjacent UV cells`).toBe(0);
      expect(solid, `tile ${tile} has no opaque leaf interior`).toBeGreaterThan(40000);
      expect(transparent).toBeGreaterThan(70000); expect(edges).toBeGreaterThan(100);
      expect(edges / solid, `tile ${tile} has translucent leaf interiors`).toBeLessThan(.15);
    }
  });
});
