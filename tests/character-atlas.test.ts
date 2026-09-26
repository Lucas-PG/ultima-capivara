import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import palette from '../src/render/capybara-palette.json';
import { createPaintedCharacterAtlas } from '../src/render/character-atlas';

describe('painted character cosmetic atlas', () => {
  it('retains fur paint and surface tiles when bandana colour and print change', () => {
    const colors = palette.map(hex => parseInt(hex, 16));
    const base = createPaintedCharacterAtlas(colors);
    const alternateColors = [...colors]; alternateColors[5] = 0xE76F51; alternateColors[6] = 0xAB493A;
    const alternate = createPaintedCharacterAtlas(alternateColors, 'diamonds');
    const a = base.image.data!, b = alternate.image.data!;
    expect(base.image.width).toBe(1024); expect(base.image.height).toBe(1024);
    expect(base.colorSpace).toBe(THREE.SRGBColorSpace); expect(base.generateMipmaps).toBe(true);
    const furValues = new Set<number>(); let bandanaChanges = 0, unrelatedChanges = 0;
    for (let y = 4; y < 1024; y += 8) for (let x = 4; x < 1024; x += 8) {
      const tile = Math.floor(x / 256) + Math.floor(y / 256) * 4, i = (y * 1024 + x) * 4;
      const changed = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
      if (tile === 5 || tile === 6) bandanaChanges += Number(changed);
      else unrelatedChanges += Number(changed);
      if (tile === 0) furValues.add(a[i]);
    }
    expect(furValues.size).toBeGreaterThan(15);
    expect(bandanaChanges).toBeGreaterThan(1000); expect(unrelatedChanges).toBe(0);
    base.dispose(); alternate.dispose();
  });
});
