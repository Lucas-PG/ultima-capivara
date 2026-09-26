import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { paintKitPlacement } from '../src/render/kit-interior';
import { KIT_PIECES } from '../src/shared/kit-collision';

const placement = { x: 0, y: 0, z: 0, yaw: 0 };
function surface(points: number[], normals: number[], tile: number, colors: number[]) {
  const geometry = new THREE.BufferGeometry(), count = points.length / 3;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: count }, () =>
    [(tile % 4 + .5) / 4, (Math.floor(tile / 4) + .5) / 4]).flat(), 2));
  return geometry;
}

describe('per-placement interior paint', () => {
  it('keeps legacy artwork unchanged when appearance fields are absent', () => {
    const geometry = surface([0, .01, 0], [0, 1, 0], 11, [.8, .8, .8]);
    const before = geometry.clone();
    paintKitPlacement(geometry, { ...placement, piece: 'rug' });
    for (const name of Object.keys(geometry.attributes))
      expect(geometry.getAttribute(name).array).toEqual(before.getAttribute(name).array);
    geometry.dispose(); before.dispose();
  });

  it('varies the cloth palette while preserving baked contact contrast and source geometry', () => {
    const source = surface([0, .01, 0, 1, .01, 0], [0, 1, 0, 0, 1, 0], 11, [.8, .8, .8, .4, .4, .4]);
    const colors = [];
    for (const paintVariant of [0, 1, 2] as const) {
      const geometry = source.clone();
      paintKitPlacement(geometry, { ...placement, piece: 'rug', paintVariant });
      const color = geometry.getAttribute('color'); colors.push(Array.from(color.array).join(','));
      for (let axis = 0; axis < 3; axis++) expect(color.getComponent(0, axis) / color.getComponent(1, axis)).toBeCloseTo(2);
      for (const name of ['position', 'normal', 'uv']) expect(geometry.getAttribute(name).array).toEqual(source.getAttribute(name).array);
      geometry.dispose();
    }
    expect(new Set(colors).size).toBe(3);
    expect(source.getAttribute('color').getX(0)).toBeCloseTo(.8); source.dispose();
  });

  it('changes only actual floor tops, preserving walls, ceilings and unsupported space', () => {
    const floor = KIT_PIECES.house_tall.traversal!.floors.find(floor => floor.id === 'upper-room')!;
    const points = [1, floor.y, 0, 1, floor.y, 0, -10, floor.y, 0, 1, floor.y - .18, 0];
    const geometry = surface(points, [0, 1, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0], 14, Array(12).fill(.8));
    const before = geometry.clone();
    paintKitPlacement(geometry, { ...placement, piece: 'house_tall', interiorFloor: 'wood' });
    const uv = geometry.getAttribute('uv');
    const tiles = Array.from({ length: uv.count }, (_, i) => Math.floor(uv.getX(i) * 4) + Math.floor(uv.getY(i) * 4) * 4);
    expect(tiles).toEqual([5, 14, 14, 14]);
    for (const name of ['position', 'normal', 'color']) expect(geometry.getAttribute(name).array).toEqual(before.getAttribute(name).array);
    geometry.dispose(); before.dispose();
  });
});
