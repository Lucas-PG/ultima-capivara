import { describe, expect, it } from 'vitest';
import { terrainMapPixels } from '../src/ui/map-paint';
import { terrainHeight } from '../src/shared/terrain';
import { WATER_LEVEL } from '../src/shared/water';

describe('painted minimap terrain', () => {
  it('keeps ocean blue and inland terrain warm using the actual height field', () => {
    const pixels = 120, world = 300, data = terrainMapPixels(world, pixels);
    let sea = 0, inland = 0;
    for (let y = 0; y < pixels; y += 4) for (let x = 0; x < pixels; x += 4) {
      const h = terrainHeight((x + 2) / pixels * world - world / 2, (y + 2) / pixels * world - world / 2);
      const i = (y * pixels + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (h < WATER_LEVEL - .3) { expect(b).toBeGreaterThan(r); expect(g).toBeGreaterThan(r); sea++; }
      if (h > .85) { expect(r).toBeGreaterThan(b); inland++; }
      expect(data[i + 3]).toBe(255);
    }
    expect(sea).toBeGreaterThan(100); expect(inland).toBeGreaterThan(100);
  });
  it('bakes identical pixels for the same world instead of changing brushwork each frame', () => {
    expect(terrainMapPixels(300, 40)).toEqual(terrainMapPixels(300, 40));
  });
});
