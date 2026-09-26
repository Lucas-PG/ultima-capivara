import { describe, expect, it } from 'vitest';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';

describe('kit collision matches its visible source geometry', () => {
  it('never inflates rotated merlons or round towers into invisible corners', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const piece = { id: 'tower', piece: 'fort_tower', x: 13, y: 4, z: -17, yaw, scale: 1.3 };
      const shapes = KIT_PIECES.fort_tower.colliders;
      const colliders = kitColliders(piece);
      expect(colliders.length).toBeGreaterThan(shapes.length);
      for (const collider of colliders) {
        const shape = shapes[Number(collider.id.split(':')[1])];
        expect(collider.pieceId).toBe(piece.id);
        for (const x of [collider.min.x, collider.max.x]) for (const z of [collider.min.z, collider.max.z]) {
          const dx = (x - piece.x) / piece.scale, dz = (z - piece.z) / piece.scale;
          const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw) - shape.x;
          const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw) - shape.z;
          if (shape.type === 'cylinder') expect(Math.hypot(lx, lz)).toBeLessThanOrEqual(shape.radius + 1e-6);
          else {
            const angle = shape.yaw ?? 0;
            expect(Math.abs(lx * Math.cos(angle) - lz * Math.sin(angle))).toBeLessThanOrEqual(shape.width / 2 + 1e-6);
            expect(Math.abs(lx * Math.sin(angle) + lz * Math.cos(angle))).toBeLessThanOrEqual(shape.depth / 2 + 1e-6);
          }
        }
      }
    }
  });
  it('preserves exact cardinal box dimensions, base and material', () => {
    const piece = { id: 'cargo', piece: 'container', x: 12, y: 6, z: 19, yaw: Math.PI / 2, scale: 2 };
    const box = kitColliders(piece)[0];
    expect(box.max.x - box.min.x).toBeCloseTo(5.6);
    expect(box.max.z - box.min.z).toBeCloseTo(12);
    expect(box.min.y).toBeCloseTo(6);
    expect(box.max.y).toBeCloseTo(11.6);
    expect(box.material).toBe('metal');
  });
  it('rejects missing geometry and invalid scale rather than making an invisible solid', () => {
    expect(() => kitColliders({ id: 'unknown', piece: 'missing', x: 0, y: 0, z: 0, yaw: 0 })).toThrow('Unknown kit piece');
    expect(() => kitColliders({ id: 'bad', piece: 'crate', x: 0, y: 0, z: 0, yaw: 0, scale: -1 })).toThrow('Invalid kit transform');
  });
});
