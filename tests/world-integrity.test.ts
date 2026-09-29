import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/shared/world';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { terrainHeight } from '../src/shared/terrain';
import { WATER_LEVEL } from '../src/shared/water';
import { walkableHeight } from '../src/shared/navigation';
import { BRIDGE_PLANS, LOT_RECTS, QUAYS, QUAY_X, ROADS, STREETS, quayFaceAt } from '../src/shared/layout';
import type { Collider, KitPlacement } from '../src/shared/types';

// Physical integrity of the built island, the class of defect players notice
// first: hovering stairs, docks on sand, gaps in quay walls, sunken props.
const world = createWorld();
const solids = new Map<string, Collider[]>();
for (const collider of world.colliders) {
  const list = solids.get(collider.pieceId!) ?? [];
  list.push(collider); solids.set(collider.pieceId!, list);
}
const centre = (c: Collider) => ({ x: (c.min.x + c.max.x) / 2, z: (c.min.z + c.max.z) / 2 });
// What an object resting at (x, z) with its base at y would stand on: the
// terrain, or the top of another solid just under it (a crate on a crate).
function support(x: number, z: number, y: number, own: string) {
  let top = terrainHeight(x, z);
  for (const c of world.colliders) if (c.pieceId !== own && c.max.y <= y + .05 && c.max.y > top &&
    x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) top = c.max.y;
  return top;
}
// Standing in water by design: their piles or footings reach the bed, tested below.
const WATERSIDE = /^(quay_|bridge_|dock_wood$|boat$|passarela|palafita|bar_mare$)/;
// Deliberately rooted in the ground: rock skins and the soft planting beds.
// The Capela's stair is cut into its hillside, tested below.
const ROOTED = /^(cliff_|flower_bed$|bush_cluster$|hedge$|mud_bath$|trampoline$|escadaria$)/;
const interior = (piece: KitPlacement) => piece.id.includes(':interior:');
const at = (piece: KitPlacement, x: number, z: number) => {
  const scale = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
  return { x: piece.x + (x * c + z * s) * scale, z: piece.z + (z * c - x * s) * scale };
};

describe('island physical integrity', () => {
  it('stands every ground piece on the ground or on the solid below it, never hovering or half sunk', () => {
    const faults: string[] = [];
    for (const piece of world.pieces!) {
      if (WATERSIDE.test(piece.piece) || ROOTED.test(piece.piece) || interior(piece)) continue;
      const definition = KIT_PIECES[piece.piece];
      // Kit pieces are bottom-centred: the placement height is the visual base.
      const [width, depth] = definition.footprint, base = piece.y, height = definition.height * (piece.scale ?? 1);
      const samples = [[0, 0], [-.4, -.4], [.4, -.4], [.4, .4], [-.4, .4]].map(([u, v]) => at(piece, u * width, v * depth));
      const gaps = samples.map(p => base - support(p.x, p.z, base, piece.id));
      if (Math.min(...gaps) > .15) faults.push(`${piece.id} hovers ${Math.min(...gaps).toFixed(2)} m`);
      if (Math.max(...gaps) < -Math.max(.45, height * .35)) faults.push(`${piece.id} is sunk ${(-Math.max(...gaps)).toFixed(2)} m`);
    }
    expect(faults).toEqual([]);
  });

  it('starts every stair flight one step above the surface it climbs from', () => {
    const faults: string[] = [];
    for (const piece of world.pieces!) {
      const stairs = KIT_PIECES[piece.piece]?.traversal?.stairs ?? [];
      for (const flight of stairs) {
        const own = new Set(flight.colliderIndices.map(index => `${piece.id}:${index}`));
        const treads = world.colliders.filter(c => own.has(c.id) || own.has(c.id.split(':').slice(0, 2).join(':')));
        const first = treads.reduce((a, b) => (a.max.y <= b.max.y ? a : b));
        const p = centre(first);
        // The floor it rises from: terrain, the bed, or a slab of any piece (itself included) below the tread.
        let floor = terrainHeight(p.x, p.z);
        for (const c of world.colliders) if (!treads.includes(c) && c.max.y <= first.max.y - .05 && c.max.y > floor &&
          p.x >= c.min.x && p.x <= c.max.x && p.z >= c.min.z && p.z <= c.max.z) floor = c.max.y;
        const rise = first.max.y - floor;
        if (rise > .47 || rise < 0) faults.push(`${piece.id}/${flight.id} starts ${rise.toFixed(2)} m above its floor`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('stands the Capela stair on the hillside cut to it, every tread on the ground from foot to adro', () => {
    const stair = world.pieces!.find(piece => piece.piece === 'escadaria')!;
    expect(stair, 'the hill chapel needs its stair').toBeDefined();
    const definition = KIT_PIECES.escadaria, flight = definition.traversal!.stairs[0];
    const treads = flight.colliderIndices.map(index => world.colliders.find(c => c.id === `${stair.id}:${index}`)!);
    expect(treads.every(Boolean)).toBe(true);
    for (const tread of treads) {
      const p = centre(tread), top = tread.max.y;
      // Ground under the tread: never above it, never more than one step below it.
      for (const [dx, dz] of [[0, 0], [-.2, 0], [.2, 0], [0, -1.2], [0, 1.2]]) {
        const ground = terrainHeight(p.x + dx, p.z + dz);
        expect(ground, `${tread.id} is buried at ${(p.x + dx).toFixed(1)},${(p.z + dz).toFixed(1)}`).toBeLessThanOrEqual(top - .02);
        expect(top - ground, `${tread.id} floats over the hillside`).toBeLessThanOrEqual(.45);
      }
      expect(walkableHeight(p.x, p.z, world), `${tread.id} is not the walking surface`).toBeCloseTo(top, 3);
    }
    // The top tread is the adro: the chapel door is a level walk from the stair head.
    const head = treads.reduce((a, b) => (a.max.y > b.max.y ? a : b)), door = world.pieces!.find(piece => piece.id.includes('capela-morro'))!;
    expect(Math.abs(head.max.y - door.y)).toBeLessThan(.05);
  });

  it('grows nothing and moors nothing under the roof of an open-floored building', () => {
    const hollow = world.pieces!.filter(piece => /^(church|market_hall|warehouse|engenho|beach_kiosk|lighthouse|bar_mare|palafita)/.test(piece.piece));
    const under = (x: number, z: number) => hollow.find(piece => {
      const local = { x: (x - piece.x) * Math.cos(piece.yaw) - (z - piece.z) * Math.sin(piece.yaw), z: (x - piece.x) * Math.sin(piece.yaw) + (z - piece.z) * Math.cos(piece.yaw) };
      const [width, depth] = KIT_PIECES[piece.piece].footprint;
      return Math.abs(local.x) < width / 2 - .3 && Math.abs(local.z) < depth / 2 - .3;
    });
    const faults = [
      ...world.objects.filter(o => ['tree', 'palm'].includes(o.kind) && under(o.pos.x, o.pos.z)).map(o => `${o.kind} ${o.id}`),
      ...world.pieces!.filter(p => ['bush_cluster', 'hedge', 'boat'].includes(p.piece) && under(p.x, p.z)).map(p => p.id),
    ].map(id => `${id} stands inside a building`);
    expect(faults).toEqual([]);
  });

  it('stands street props in the open: no laundry across a street, no bike or line post inside a wall', () => {
    const inRect = (rects: readonly (readonly number[])[], x: number, z: number, inset: number) =>
      rects.some(([x0, z0, x1, z1]) => x > x0 + inset && x < x1 - inset && z > z0 + inset && z < z1 - inset);
    const inWall = (x: number, z: number) => inRect(LOT_RECTS, x, z, .2) || world.colliders.some(c => c.max.y - c.min.y > 1.2 &&
      x > c.min.x + .05 && x < c.max.x - .05 && z > c.min.z + .05 && z < c.max.z - .05);
    const faults: string[] = [];
    for (const object of world.objects) {
      const kind = object.detail?.startsWith('prop:street-') ? object.detail.slice(12).split(':')[0] : '';
      // Wall-mounted signs and spans anchor on facades by design.
      if (!kind || ['panel', 'shop', 'wire', 'line'].includes(kind)) continue;
      if (inWall(object.pos.x, object.pos.z)) faults.push(`${object.id} stands inside a wall`);
      if (kind !== 'laundry') continue;
      const r = object.rotation ?? 0;
      for (const offset of [-2.8, 2.8]) {
        const x = object.pos.x + Math.cos(r) * offset, z = object.pos.z - Math.sin(r) * offset;
        if (inWall(x, z)) faults.push(`${object.id} has a post inside a wall`);
        if (inRect(STREETS, x, z, 0)) faults.push(`${object.id} hangs across a street`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps every pier over water on piles that reach the bed', () => {
    const docks = world.pieces!.filter(piece => piece.piece === 'dock_wood');
    expect(docks.length).toBeGreaterThanOrEqual(3);
    for (const dock of docks) {
      const [, depth] = KIT_PIECES.dock_wood.footprint;
      let wet = 0, samples = 0;
      for (let z = -depth / 2 + .5; z <= depth / 2 - .5; z += 1) {
        const p = at(dock, 0, z); samples++;
        if (terrainHeight(p.x, p.z) < WATER_LEVEL - .25) wet++;
      }
      expect(wet / samples, `${dock.id} must stand over water, not on sand`).toBeGreaterThanOrEqual(.6);
      for (const pile of (solids.get(dock.id) ?? []).filter(c => c.max.y - c.min.y > 3)) {
        const p = centre(pile);
        expect(pile.min.y, `${dock.id} has a pile hanging above the bed`).toBeLessThanOrEqual(terrainHeight(p.x, p.z) + .05);
      }
    }
  });

  it('walls both banks of the town reach without a gap, level with the promenade behind', () => {
    const waterside = new Set(world.pieces!.filter(piece => /^(quay_|bridge_)/.test(piece.piece)).map(piece => piece.id));
    // Sample points on a bridge belong to its abutment, tested below.
    const bridges = world.pieces!.filter(piece => piece.piece.startsWith('bridge_'));
    const onBridge = (x: number, z: number) => bridges.some(bridge => Math.abs(x - bridge.x) < KIT_PIECES[bridge.piece].footprint[0] / 2 + .05 &&
      Math.abs(z - bridge.z) < KIT_PIECES[bridge.piece].footprint[1] / 2 + .05);
    const faults: string[] = [];
    for (const side of [-1, 1] as const) for (const [x0, x1] of QUAYS[side]) {
      for (let x = Math.max(x0, QUAY_X[0]) + .5; x <= Math.min(x1, QUAY_X[1]) - .5; x += .5) {
        const face = quayFaceAt(x, side), nx = -face.dirZ * side, nz = face.dirX * side;
        const promenade = terrainHeight(face.x + nx * 6, face.z + nz * 6);
        for (const back of [.6, 2.5, 4.4]) {
          const px = face.x + nx * back, pz = face.z + nz * back;
          if (onBridge(px, pz)) continue;
          // Rotated stones collide as inscribed strips: probe a small disc, as a foot would.
          const stone = world.colliders.filter(c => waterside.has(c.pieceId!) && px >= c.min.x - .12 && px <= c.max.x + .12 && pz >= c.min.z - .12 && pz <= c.max.z + .12);
          if (!stone.length) { faults.push(`gap in the ${side < 0 ? 'north' : 'south'} quay at x ${x.toFixed(1)}, ${back} m behind the face`); continue; }
          // The masonry block is the tallest solid there; bollards stand on it.
          const block = stone.reduce((a, b) => (b.max.y - b.min.y > a.max.y - a.min.y ? b : a));
          if (Math.abs(block.max.y - promenade) > .06) faults.push(`quay top ${block.max.y.toFixed(2)} steps from the promenade ${promenade.toFixed(2)} at x ${x.toFixed(1)}`);
        }
      }
    }
    expect(faults.slice(0, 12)).toEqual([]);
  });

  it('stands bridge piers and abutments on the river bed and lands both deck ends on a street', () => {
    for (const plan of BRIDGE_PLANS) {
      const bridge = world.pieces!.find(piece => piece.piece.startsWith('bridge_') && Math.hypot(piece.x - plan.x, piece.z - plan.z) < .01)!;
      expect(bridge, `bridge at ${plan.x}`).toBeDefined();
      const deck = bridge.y + KIT_PIECES[bridge.piece].traversal!.floors[0].y * (bridge.scale ?? 1);
      for (const footing of (solids.get(bridge.id) ?? []).filter(c => c.max.y < deck - .5)) {
        const p = centre(footing);
        expect(footing.min.y, `${bridge.id} footing hangs above the bed at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeLessThanOrEqual(terrainHeight(p.x, p.z) + .05);
      }
      const half = KIT_PIECES[bridge.piece].footprint[1] / 2;
      for (const end of [-1, 1]) {
        const p = at(bridge, 0, end * (half + .8));
        expect(ROADS.some(([x0, z0, x1, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1), `${bridge.id} ends in the grass at ${p.z.toFixed(1)}`).toBe(true);
        expect(Math.abs(terrainHeight(p.x, p.z) - deck), `${bridge.id} deck steps onto its landing`).toBeLessThan(.3);
      }
    }
  });
});
