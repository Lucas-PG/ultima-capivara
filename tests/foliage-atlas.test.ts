import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import foliage from '../tools/art/foliage-atlas.metrics.json';
import ground from '../tools/art/ground-atlas.metrics.json';

interface Metrics { size: number; bytes: number; sha256: string; guard: number; tiles: Record<string, { x: number; y: number; w: number; h: number }> }
// Download budgets. The foliage atlas carries palm fronds, bougainvillea trails and the garden
// flowers besides the leaf clusters (28 tiles); the ground atlas the lawn, wild and dune grasses.
const LIMITS = { foliage: 1_200_000, ground: 330_000 };

// Tiles are alpha-tested cards: a guard band that is not transparent would let mip levels smear one
// painting into its neighbour, and a translucent interior would punch holes in every crown.
for (const [name, metrics] of [['foliage', foliage as Metrics], ['ground', ground as Metrics]] as const) {
  describe(`${name} atlas sampling contract`, async () => {
    const file = readFileSync(`public/textures/${name}-atlas.webp`);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];

    it('ships the file the builder recorded, square and below the download budget', () => {
      expect(file.toString('ascii', 0, 4)).toBe('RIFF');
      expect([info.width, info.height]).toEqual([metrics.size, metrics.size]);
      expect(file.length).toBe(metrics.bytes);
      expect(file.length).toBeLessThan(LIMITS[name]);
      expect(createHash('sha256').update(file).digest('hex')).toBe(metrics.sha256);
    });

    it('keeps every tile inside the sheet with a fully transparent guard band around it', () => {
      const rects = Object.entries(metrics.tiles);
      expect(rects.length).toBeGreaterThan(3);
      for (const [tile, r] of rects) {
        expect(r.x, tile).toBeGreaterThanOrEqual(metrics.guard);
        expect(r.y, tile).toBeGreaterThanOrEqual(metrics.guard);
        expect(r.x + r.w + metrics.guard, tile).toBeLessThanOrEqual(metrics.size);
        expect(r.y + r.h + metrics.guard, tile).toBeLessThanOrEqual(metrics.size);
        let bleeding = 0;
        for (let y = r.y - metrics.guard; y < r.y + r.h + metrics.guard; y++) for (let x = r.x - metrics.guard; x < r.x + r.w + metrics.guard; x++) {
          const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
          if (!inside && alphaAt(x, y) > 0) bleeding++;
        }
        expect(bleeding, `${tile} paints into its guard band`).toBe(0);
        for (const [other, o] of rects) if (other !== tile)
          expect(r.x + r.w + 2 * metrics.guard <= o.x || o.x + o.w + 2 * metrics.guard <= r.x || r.y + r.h + 2 * metrics.guard <= o.y || o.y + o.h + 2 * metrics.guard <= r.y,
            `${tile} overlaps ${other}`).toBe(true);
      }
    });

    it('paints solid leaf interiors with antialiased silhouettes', () => {
      // A translucent pixel with solid paint all around it is a hole in the leaf, not an antialiased edge.
      const deep = (x: number, y: number) => {
        let solid = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (alphaAt(x + dx, y + dy) === 255) solid++;
        return solid >= 21;
      };
      for (const [tile, r] of Object.entries(metrics.tiles)) {
        let solid = 0, edge = 0, holes = 0;
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          const a = alphaAt(x, y);
          if (a === 255) solid++; else if (a > 0) { edge++; if (deep(x, y)) holes++; }
        }
        expect(solid / (r.w * r.h), `${tile} has too little opaque paint`).toBeGreaterThan(.12);
        expect(edge, `${tile} silhouette is not antialiased`).toBeGreaterThan(80);
        expect(holes / solid, `${tile} has translucent leaf interiors`).toBeLessThan(.01);
      }
    });

    it('bleeds leaf colour into the transparent margin so mip edges keep the leaf hue', () => {
      // A black or grey halo under alpha 0 would darken every silhouette once the GPU averages mips.
      const nearOpaque = (x: number, y: number) => {
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (alphaAt(x + dx, y + dy) > 200) return true;
        return false;
      };
      for (const [tile, r] of Object.entries(metrics.tiles)) {
        let sum = 0, samples = 0;
        const sample = (x: number, y: number) => {
          const at = (y * info.width + x) * 4;
          if (data[at + 3] === 0 && nearOpaque(x, y)) { sum += data[at] + data[at + 1] + data[at + 2]; samples++; }
        };
        for (let x = r.x; x < r.x + r.w; x += 2) { sample(x, r.y - 1); sample(x, r.y + r.h); }
        for (let y = r.y; y < r.y + r.h; y += 2) { sample(r.x - 1, y); sample(r.x + r.w, y); }
        expect(samples, `${tile} has no silhouette pixels on its border`).toBeGreaterThan(0);
        // Painted leaf outlines are dark, so the bleed is dark green rather than bright; black would read below 5.
        expect(sum / samples / 3, `${tile} margin is not leaf coloured`).toBeGreaterThan(9);
      }
    });
  });
}
