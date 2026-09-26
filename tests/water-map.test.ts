import { describe, expect, it } from 'vitest';
import { BRIDGES, DISTRICT_ARRIVALS, LAKE, PLAZA } from '../src/shared/layout';
import { terrainHeight } from '../src/shared/terrain';
import { WATER_HALF_SIZE, WATER_LEVEL, waterAt } from '../src/shared/water';

describe('shared island water', () => {
  it('uses one surface for the feeder lagoon, river and open ocean', () => {
    for (const [x, z, kind] of [[LAKE[0], LAKE[1], 'lagoon'], [-20, 8, 'river'], [140, -70, 'ocean']] as const) {
      const water = waterAt(x, z);
      expect(water?.kind).toBe(kind);
      expect(water?.surfaceY).toBe(WATER_LEVEL);
      expect(water!.depth).toBeGreaterThan(1);
      expect(water!.depth + terrainHeight(x, z)).toBeCloseTo(WATER_LEVEL, 10);
    }
    expect(waterAt(...PLAZA)).toBeNull();
    for (const [x, z] of Object.values(DISTRICT_ARRIVALS)) expect(waterAt(x, z), `arrival at ${x},${z} must be dry`).toBeNull();
  });

  it('matches the wet terrain everywhere, including fractional bank positions', () => {
    let wet = 0, dry = 0, shallows = 0;
    for (let z = -130.3; z <= 130; z += 2) for (let x = -130.7; x <= 130; x += 2) {
      const floor = terrainHeight(x, z), sample = waterAt(x, z);
      if (floor >= WATER_LEVEL) { expect(sample).toBeNull(); dry++; }
      else {
        expect(sample?.surfaceY).toBe(WATER_LEVEL);
        expect(sample?.depth).toBeCloseTo(WATER_LEVEL - floor, 10);
        wet++; if (sample!.depth < .5) shallows++;
      }
    }
    expect(wet).toBeGreaterThan(1000); expect(dry).toBeGreaterThan(1000); expect(shallows).toBeGreaterThan(50);
  });

  it('keeps water beneath bridges for swimmers while leaving deck support to movement', () => {
    for (const [x, z] of BRIDGES) expect(waterAt(x, z)?.depth).toBeGreaterThan(1);
    expect(waterAt(WATER_HALF_SIZE + 1, 0)).toBeNull();
    expect(waterAt(0, -WATER_HALF_SIZE - 1)).toBeNull();
    expect(waterAt(NaN, 0)).toBeNull(); expect(waterAt(0, Infinity)).toBeNull();
  });
});
