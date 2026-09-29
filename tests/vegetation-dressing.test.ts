import { describe, expect, it } from 'vitest';
import { buildTemplates } from '../src/render/vegetation/templates';
import { colliderGrid } from '../src/shared/collider-grid';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { ROADS } from '../src/shared/layout';
import { terrainHeight } from '../src/shared/terrain';
import { VEGETATION_PIECES, vegetationDressing } from '../src/shared/vegetation-dressing';
import { SPECIES } from '../src/shared/vegetation-species';
import { createWorld } from '../src/shared/world';

const world = createWorld(), dressing = vegetationDressing(world), grid = colliderGrid(world);
const inside = (x: number, y: number, z: number) => grid.query(x - .01, z - .01, x + .01, z + .01)
  .some(c => x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && y >= c.min.y && y <= c.max.y);

describe('vegetation dressing', () => {
  it('is derived deterministically from the world, never from runtime state', () => {
    expect(vegetationDressing(createWorld())).toEqual(dressing);
    expect(new Set(dressing.map(p => p.id)).size, 'dressing ids must be unique').toBe(dressing.length);
  });

  it('replaces each foliage-only kit piece one to one, at its place, heading and size', () => {
    const pieces = world.pieces!.filter(p => VEGETATION_PIECES.has(p.piece));
    expect(pieces.length).toBeGreaterThan(50);
    for (const piece of pieces) {
      // Skipping these pieces in the kit renderer must not change collision: they have none.
      expect(KIT_PIECES[piece.piece].colliders, piece.piece).toHaveLength(0);
      const plants = dressing.filter(p => p.id === piece.id);
      expect(plants, piece.id).toHaveLength(1);
      const [plant] = plants;
      expect(Math.hypot(plant.x - piece.x, plant.z - piece.z), piece.id).toBeLessThan(1e-6);
      expect(plant.yaw).toBeCloseTo(piece.yaw, 6);
      expect(plant.height / SPECIES[plant.species].height).toBeCloseTo(piece.scale ?? 1, 6);
    }
  });

  it('keeps planted beds and forest floor off roads, out of doorways and out of solids', () => {
    const entrances = world.pieces!.flatMap(p => (KIT_PIECES[p.piece]?.traversal?.entrances ?? []).filter(e => !e.platform).map(e => {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), k = p.scale ?? 1;
      return { x: p.x + (e.point[0] * c + e.point[2] * s) * k, z: p.z + (e.point[2] * c - e.point[0] * s) * k };
    }));
    const planted = dressing.filter(p => p.species !== 'vine' && !VEGETATION_PIECES.has(world.pieces!.find(piece => piece.id === p.id)?.piece ?? ''));
    expect(planted.length).toBeGreaterThan(150);
    for (const p of planted) {
      expect(ROADS.some(([x0, z0, x1, z1]) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1), `${p.id} on a road`).toBe(false);
      expect(entrances.some(e => Math.hypot(p.x - e.x, p.z - e.z) < 1.3), `${p.id} blocks a doorway`).toBe(false);
      expect(inside(p.x, p.y + .3, p.z) || inside(p.x, p.y + 1, p.z), `${p.id} grows inside a solid`).toBe(false);
      expect(Math.abs(p.y - terrainHeight(p.x, p.z)), `${p.id} floats or sinks`).toBeLessThan(.1);
    }
  });

  it('hangs bougainvillea only over solid wall, never across a door or off the end of a building', () => {
    const vines = dressing.filter(p => p.species === 'vine'), templates = buildTemplates(new Set(['vine']));
    expect(vines.length).toBeGreaterThan(40);
    // World colliders approximate rotated walls with strips; test against the piece's own solids.
    const solidOf = (id: string) => {
      const piece = world.pieces!.find(p => id.startsWith(`${p.id}:`))!, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw), k = piece.scale ?? 1;
      const boxes = KIT_PIECES[piece.piece].colliders.flatMap(b => b.type === 'box' ? [b] : []);
      return (x: number, y: number, z: number) => {
        const dx = x - piece.x, dz = z - piece.z, lx = (dx * c - dz * s) / k, lz = (dx * s + dz * c) / k, ly = (y - piece.y) / k;
        return boxes.some(b => Math.abs(lx - b.x) <= b.width / 2 + .01 && Math.abs(lz - b.z) <= b.depth / 2 + .01 && Math.abs(ly - b.y) <= b.height / 2 + .01);
      };
    };
    for (const vine of vines) {
      const wall = solidOf(vine.id);
      // Width of the hanging trails (the mass along the top may reach round the corner).
      const position = templates.vine[vine.variant][0].getAttribute('position');
      let reach = 0;
      for (let i = 0; i < position.count; i++) if (position.getY(i) < -.45) reach = Math.max(reach, Math.abs(position.getX(i)));
      const s = vine.height / SPECIES.vine.height, half = reach * s * (vine.widthScale ?? 1) * .9;
      const nx = Math.sin(vine.yaw), nz = Math.cos(vine.yaw), tx = Math.cos(vine.yaw), tz = -Math.sin(vine.yaw);
      for (const across of [-1, 0, 1]) for (const down of [.3, .5, .85]) {
        // Just behind the face, where the wall must be.
        const x = vine.x + tx * across * half - nx * .15, z = vine.z + tz * across * half - nz * .15, y = vine.y - vine.height * down;
        if (y < terrainHeight(x, z) + .2) continue;
        expect(wall(x, y, z), `${vine.id} hangs over empty space at ${across},${down}`).toBe(true);
      }
      // And in front of it, within reach of the leaves, nothing solid.
      expect(wall(vine.x + nx * .3, vine.y - vine.height * .5, vine.z + nz * .3), `${vine.id} is buried in its wall`).toBe(false);
      expect(inside(vine.x + nx * .3, vine.y - vine.height * .5, vine.z + nz * .3), `${vine.id} is buried in a solid`).toBe(false);
    }
  });
});
