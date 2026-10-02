import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildTemplates } from '../src/render/vegetation/templates';
import { containsCollider } from '../src/shared/collider-shape';
import { colliderGrid } from '../src/shared/collider-grid';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { ROADS } from '../src/shared/layout';
import { terrainHeight } from '../src/shared/terrain';
import { VEGETATION_PIECES, vegetationDressing } from '../src/shared/vegetation-dressing';
import { SPECIES } from '../src/shared/vegetation-species';
import { foliageAt, foliageSpan, walkingSurfaces, type CrownShape } from '../src/shared/vegetation-crowns';
import { createWorld } from '../src/shared/world';

const world = createWorld(), dressing = vegetationDressing(world), grid = colliderGrid(world);
// The two reasons a kit bush may be trimmed or left out: its leaves would show in a room, or fill a spawn point.
const crowded = (foliage: CrownShape) => !!walkingSurfaces(world).inRoom(foliage) || world.spawns.some(spawn => [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]]
  .some(([dx, dz]) => { const span = foliageSpan(foliage, spawn.x + dx, spawn.z + dz); return !!span && span[0] < spawn.y + 2.2 && span[1] > spawn.y + .35; }));
const inside = (x: number, y: number, z: number) => grid.query(x - .01, z - .01, x + .01, z + .01)
  .some(c => containsCollider(c, { x, y, z }));

describe('vegetation dressing', () => {
  it('is derived deterministically from the world, never from runtime state', () => {
    expect(vegetationDressing(createWorld())).toEqual(dressing);
    expect(new Set(dressing.map(p => p.id)).size, 'dressing ids must be unique').toBe(dressing.length);
  });

  it('replaces each foliage-only kit piece one to one, at its place, heading and size', () => {
    const pieces = world.pieces!.filter(p => VEGETATION_PIECES.has(p.piece));
    expect(pieces.length).toBeGreaterThan(50);
    let trimmed = 0;
    for (const piece of pieces) {
      // Skipping these pieces in the kit renderer must not change collision: they have none.
      expect(KIT_PIECES[piece.piece].colliders, piece.piece).toHaveLength(0);
      const plants = dressing.filter(p => p.id === piece.id);
      if (!plants.length) {
        // A patch the layout pressed into a house wall is left out when even trimmed its leaves show indoors.
        trimmed++;
        const species = piece.piece === 'hedge' ? 'hedge' : 'thicket', small = SPECIES[species].height * (piece.scale ?? 1) * .55;
        expect([0, 1, 2, 3].slice(0, SPECIES[species].variants).every(v => crowded(foliageAt(species, v, piece.x, piece.y, piece.z, small)!)), `${piece.id} left out without cause`).toBe(true);
        continue;
      }
      expect(plants, piece.id).toHaveLength(1);
      const [plant] = plants;
      expect(Math.hypot(plant.x - piece.x, plant.z - piece.z), piece.id).toBeLessThan(1e-6);
      expect(plant.yaw).toBeCloseTo(piece.yaw, 6);
      const scale = plant.height / SPECIES[plant.species].height, full = piece.scale ?? 1;
      if (Math.abs(scale - full) < 1e-6) continue;
      // Only a patch set against a house is trimmed, and only as far as keeps its leaves out of the rooms.
      trimmed++;
      expect(scale, piece.id).toBeLessThan(full);
      expect(scale, piece.id).toBeGreaterThanOrEqual(full * .55);
      const foliage = foliageAt(plant.species, plant.variant, plant.x, plant.y, plant.z, SPECIES[plant.species].height * full)!;
      expect(crowded(foliage), `${piece.id} trimmed without cause`).toBe(true);
    }
    expect(trimmed).toBeLessThan(pieces.length * .15);
  });

  it('keeps planted beds and forest floor off roads, out of doorways and out of solids', () => {
    const entrances = world.pieces!.flatMap(p => (KIT_PIECES[p.piece]?.traversal?.entrances ?? []).filter(e => !e.platform).map(e => {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), k = p.scale ?? 1;
      return { x: p.x + (e.point[0] * c + e.point[2] * s) * k, z: p.z + (e.point[2] * c - e.point[0] * s) * k };
    }));
    // Kit replacements and the planting of the kit's own planters and beds stand where the kit put them.
    const planted = dressing.filter(p => p.species !== 'vine' && p.species !== 'pot' && p.species !== 'bed' && p.species !== 'windowbox' &&
      !VEGETATION_PIECES.has(world.pieces!.find(piece => piece.id === p.id)?.piece ?? ''));
    expect(planted.length).toBeGreaterThan(150);
    for (const p of planted) {
      expect(ROADS.some(([x0, z0, x1, z1]) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1), `${p.id} on a road`).toBe(false);
      expect(entrances.some(e => Math.hypot(p.x - e.x, p.z - e.z) < 1.3), `${p.id} blocks a doorway`).toBe(false);
      expect(inside(p.x, p.y + .3, p.z) || inside(p.x, p.y + 1, p.z), `${p.id} grows inside a solid`).toBe(false);
      expect(Math.abs(p.y - terrainHeight(p.x, p.z)), `${p.id} floats or sinks`).toBeLessThan(.1);
    }
  });

  it('plants every kit planter and flower bed exactly on its piece', () => {
    for (const piece of world.pieces!.filter(p => p.piece === 'planter' || p.piece === 'flower_bed')) {
      const plants = dressing.filter(p => p.id === `${piece.id}:planting`);
      expect(plants, piece.id).toHaveLength(1);
      expect(plants[0].species).toBe(piece.piece === 'planter' ? 'pot' : 'bed');
      expect(Math.hypot(plants[0].x - piece.x, plants[0].y - piece.y, plants[0].z - piece.z)).toBeLessThan(1e-6);
      expect(plants[0].height / SPECIES[plants[0].species].height).toBeCloseTo(piece.scale ?? 1, 6);
    }
  });

  it('climbs bougainvillea only up a real corner post, on its outer side', () => {
    const climbers = dressing.filter(p => p.id.includes(':post-vine:'));
    expect(climbers.length).toBeGreaterThan(3);
    for (const vine of climbers) {
      const nx = Math.sin(vine.yaw), nz = Math.cos(vine.yaw);
      // Just behind the origin, half-way down: the post.
      expect(inside(vine.x - nx * .1, vine.y - vine.height * .5, vine.z - nz * .1), `${vine.id} has no post behind it`).toBe(true);
      expect(inside(vine.x + nx * .3, vine.y - vine.height * .5, vine.z + nz * .3), `${vine.id} is buried in a solid`).toBe(false);
    }
  });

  it('hangs bougainvillea only over solid wall, never across a door or off the end of a building', () => {
    const vines = dressing.filter(p => p.species === 'vine' && !p.id.includes(':post-vine:') && !p.id.includes(':drape:')), templates = buildTemplates(new Set(['vine']));
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

  it('never starts a round inside a bush: no drawn leaf fills an arena spawn point', () => {
    // A Corrente round opened with the camera inside a croton patch on the Morro: kit bushes and
    // beds stood on spawn points. Every leaf of every dressing plant is tested against a 0.5 m
    // column over each Correria and Corrente spawn, from the knee to above the head.
    const spawns = world.spawns.filter(spawn => spawn.mode !== 'battle-royale');
    expect(spawns.length).toBeGreaterThan(20);
    const templates = buildTemplates(new Set(dressing.map(p => p.species))), vertex = new THREE.Vector3(), matrix = new THREE.Matrix4(), faults: string[] = [];
    for (const plant of dressing) {
      const near = spawns.filter(spawn => Math.hypot(spawn.x - plant.x, spawn.z - plant.z) < plant.height * 2.5 + 1);
      if (!near.length || plant.species === 'vine') continue;
      const s = plant.height / SPECIES[plant.species].height, position = templates[plant.species][plant.variant][0].getAttribute('position');
      matrix.compose(new THREE.Vector3(plant.x, plant.y, plant.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), plant.yaw), new THREE.Vector3(s * (plant.widthScale ?? 1), s, s));
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
        const hit = near.find(spawn => Math.hypot(vertex.x - spawn.x, vertex.z - spawn.z) < .5 && vertex.y > spawn.y + .35 && vertex.y < spawn.y + 2.2);
        if (hit) { faults.push(`${plant.id} over the spawn at ${hit.x.toFixed(1)},${hit.z.toFixed(1)}`); break; }
      }
    }
    expect(faults).toEqual([]);
  });

  it('hangs the kit-authored drapes over solid wall, clear of every door and window, with variety', () => {
    // The terraced fronts used to bake faceted flower heads into the kit, some across a window.
    // The drapes that replace them must have masonry behind every trail (a balcony drape hangs in
    // front of its railing, so only below the slab), and the fronts must not all look alike.
    const drapes = dressing.filter(p => p.id.includes(':drape:')), templates = buildTemplates(new Set(['vine']));
    expect(drapes.length).toBeGreaterThan(60);
    const faults: string[] = [];
    for (const vine of drapes) {
      const piece = world.pieces!.find(p => vine.id.startsWith(`${p.id}:`))!, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw), k = piece.scale ?? 1;
      const anchor = KIT_PIECES[piece.piece].plantings![Number(vine.id.split(':drape:')[1].split(':')[0])];
      expect(anchor.type).toBe('drape');
      const slab = anchor.type === 'drape' ? anchor.slab : undefined;
      const boxes = KIT_PIECES[piece.piece].colliders.flatMap(b => b.type === 'box' ? [b] : []);
      const solid = (x: number, y: number, z: number) => {
        const dx = x - piece.x, dz = z - piece.z, lx = (dx * c - dz * s) / k, lz = (dx * s + dz * c) / k, ly = (y - piece.y) / k;
        return boxes.some(b => Math.abs(lx - b.x) <= b.width / 2 && Math.abs(lz - b.z) <= b.depth / 2 && Math.abs(ly - b.y) <= b.height / 2);
      };
      // The real extent of this variant's trails, as drawn.
      const position = templates.vine[vine.variant][0].getAttribute('position');
      let reach = 0, low = 0;
      for (let i = 0; i < position.count; i++) if (position.getY(i) < -.45) { reach = Math.max(reach, Math.abs(position.getX(i))); low = Math.min(low, position.getY(i)); }
      const scale = vine.height / SPECIES.vine.height, half = reach * scale * (vine.widthScale ?? 1), bottom = low * scale;
      const nx = Math.sin(vine.yaw), nz = Math.cos(vine.yaw), tx = Math.cos(vine.yaw), tz = -Math.sin(vine.yaw);
      // Only a short way behind the drape: an opening's recess (0.3 m) must never count as wall.
      // The shorter front layer hangs 7 cm further out.
      const front = vine.id.endsWith(':front') ? [.45] : [];
      const depths = slab === undefined ? [.15, .3, ...front] : [.15, .3, .45, .6, .75, .9, 1.05];
      for (let i = 0; i <= 6; i++) for (let j = 1; j <= 6; j++) {
        const across = (i / 3 - 1) * half * .95, y = vine.y + bottom * j / 6;
        // The top 15 cm is the mass resting on the coping or cornice, above the wall itself.
        if (vine.y - y < (front.length ? .2 : .15) || (slab !== undefined && y > piece.y + slab * k)) continue;
        const x = vine.x + tx * across, z = vine.z + tz * across;
        if (y < terrainHeight(x, z) + .2) continue;
        if (!depths.some(d => solid(x - nx * d, y, z - nz * d))) { faults.push(`${vine.id} over an opening at ${across.toFixed(2)}, ${(y - piece.y).toFixed(2)}`); break; }
      }
    }
    expect(faults).toEqual([]);
    // Variety: some fronts carry no drape, and the colours are mixed along a street.
    const rows = world.pieces!.filter(p => KIT_PIECES[p.piece].plantings?.some(a => a.type === 'drape') && !p.piece.startsWith('muro'));
    const draped = rows.filter(p => drapes.some(d => d.id.startsWith(`${p.id}:`)));
    expect(draped.length / rows.length).toBeGreaterThan(.45);
    expect(draped.length / rows.length).toBeLessThan(.85);
    expect(new Set(drapes.map(d => d.variant)).size).toBe(SPECIES.vine.variants);
  });

  it('plants every kit window box and pot where the kit put it', () => {
    for (const piece of world.pieces!) for (const [i, anchor] of (KIT_PIECES[piece.piece].plantings ?? []).entries()) {
      if (anchor.type !== 'box' && anchor.type !== 'pot') continue;
      const plant = dressing.find(p => p.id === `${piece.id}:${anchor.type}:${i}`);
      // A plant is only left out when its leaves would fill a spawn point.
      if (!plant) continue;
      const c = Math.cos(piece.yaw), s = Math.sin(piece.yaw), k = piece.scale ?? 1;
      expect(Math.hypot(plant.x - piece.x - (anchor.x * c + anchor.z * s) * k, plant.z - piece.z - (anchor.z * c - anchor.x * s) * k), plant.id).toBeLessThan(1e-6);
      if (anchor.type === 'box') expect(plant.y, plant.id).toBeCloseTo(piece.y + anchor.y * k, 6);
      // The pot template's rim lands on the kit pot's rim.
      else expect(plant.y + .98 * plant.height / SPECIES.pot.height, plant.id).toBeCloseTo(piece.y + anchor.y * k, 6);
    }
    const boxes = world.pieces!.flatMap(p => (KIT_PIECES[p.piece].plantings ?? []).filter(a => a.type === 'box'));
    expect(dressing.filter(p => p.species === 'windowbox').length).toBeGreaterThan(boxes.length * .9);
  });
});
