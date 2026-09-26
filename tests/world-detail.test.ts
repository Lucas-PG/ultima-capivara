import { describe, expect, it } from 'vitest';
import { clearSpawn, hasLineOfSight, moveActor, raycastWorld, SWIM_DRAFT, TRAMPOLINE_IMPULSE } from '../src/shared/collision';
import { boundaryFeedback } from '../src/shared/bounds';
import { emptyInput } from '../src/shared/math';
import { Simulation } from '../src/simulation';
import type { Mode, SpawnPoint } from '../src/shared/types';
import { ARENA, BRIDGES, CHURCH, DISTRICT_ARRIVALS, FORTE, HOUSES, MERCADAO, MORRO_LOTS, NAV_ROUTES, PLAZA, RIVER, ROADS, inArena, riverSample, routeDistance } from '../src/shared/layout';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';
import { navigationWaypoint, walkableHeight, walkableSegment } from '../src/shared/navigation';
import { WORLD_PALETTE, terrainColor, terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { waterAt } from '../src/shared/water';

const world = createWorld();
const spawnActor = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
  [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'spawn-escape', 1).snapshot().actors[0];
function walkFrom(spawn: SpawnPoint, yaw: number, mode: Mode) {
  const actor = structuredClone(spawnActor);
  actor.pos = { x: spawn.x, y: spawn.y, z: spawn.z }; actor.yaw = yaw;
  actor.velocity = { x: 0, y: 0, z: 0 }; actor.stage = 'ground'; actor.grounded = true;
  for (let seq = 1; seq <= 60; seq++) moveActor(actor, { ...emptyInput(), seq, moveZ: 1, yaw }, world, 1 / 60, 1, mode);
  return Math.hypot(actor.pos.x - spawn.x, actor.pos.z - spawn.z);
}
describe('river island gameplay integrity', () => {
  it('keeps the familiar districts while moving the hero fort north and the beach south', () => {
    expect(new Set(world.districts.map(d => d.id))).toEqual(new Set(['forte', 'vila', 'centro', 'morro', 'cachoeira', 'porto', 'praia', 'farol', 'mangue', 'fazenda', 'posto', 'lagoa']));
    expect(world.size).toBe(260);
    const district = (id: string) => world.districts.find(d => d.id === id)!;
    expect(district('forte').z).toBeLessThan(district('vila').z - 50);
    expect(district('praia').z).toBeGreaterThan(district('vila').z + 70);
    expect(district('morro').x).toBeLessThan(-60);
    expect(district('porto').x).toBeGreaterThan(70);
    expect(terrainHeight(...FORTE)).toBeGreaterThan(12);
  });

  it('derives every solid from a visible kit instance and its exported geometry', () => {
    const pieces = new Map(world.pieces!.map(piece => [piece.id, piece]));
    expect(pieces.size).toBeGreaterThan(120);
    expect(new Set(world.colliders.map(c => c.id)).size).toBe(world.colliders.length);
    for (const collider of world.colliders) {
      expect(collider.pieceId, `unowned collider ${collider.id}`).toBeDefined();
      expect(pieces.has(collider.pieceId!)).toBe(true);
    }
    for (const piece of pieces.values()) {
      expect(KIT_PIECES[piece.piece], `missing mesh contract ${piece.piece}`).toBeDefined();
      expect(world.colliders.filter(c => c.pieceId === piece.id)).toEqual(kitColliders(piece));
    }
  });

  it('keeps all spawn, loot and chest points clear on dry, supported ground', () => {
    expect(world.spawns.length).toBeGreaterThanOrEqual(65);
    expect(world.loot.length).toBeGreaterThanOrEqual(175);
    expect(world.loot.length).toBeLessThanOrEqual(210);
    expect(world.chests.length).toBeGreaterThanOrEqual(50);
    for (const point of [...world.spawns, ...world.loot, ...world.chests]) {
      expect(clearSpawn(point, world), JSON.stringify(point)).toBe(true);
      expect(point.y).toBeCloseTo(walkableHeight(point.x, point.z, world), 3);
      expect(point.y).toBeGreaterThan(.5);
    }
    for (const spawn of world.spawns.filter(s => s.mode === 'deathmatch')) expect(inArena(spawn.x, spawn.z, 3)).toBe(true);
  });

  it('allows the rendered multiplayer guest spawn to walk forward for one second', () => {
    const spawn: SpawnPoint = { x: 52.62707957951352, y: 2.200000047683716, z: 42.44404777279124, yaw: 0, mode: 'deathmatch' };
    expect(clearSpawn(spawn, world)).toBe(true);
    expect(boundaryFeedback(spawn, world, 'deathmatch')).toBeNull();
    expect(walkFrom(spawn, 0, 'deathmatch')).toBeGreaterThan(.5);
  });

  it('gives every spawn a clear walking exit in at least one direction', () => {
    for (const spawn of world.spawns) {
      const modes: Mode[] = spawn.mode === 'both' ? ['deathmatch', 'battle-royale'] : [spawn.mode];
      for (const mode of modes) expect([0, Math.PI / 2, Math.PI, Math.PI * 1.5]
        .some(turn => walkFrom(spawn, spawn.yaw + turn, mode) > .5), `trapped ${mode} spawn ${JSON.stringify(spawn)}`).toBe(true);
    }
  });

  it('gives each district an arrival with an open view down its approach', () => {
    for (const district of world.districts) {
      const spawn = world.spawns.find(point => point.mode === 'battle-royale' && point.district === district.id)!;
      expect(spawn, `${district.id} needs a composed arrival`).toBeDefined();
      const [x, z] = DISTRICT_ARRIVALS[district.id];
      expect(Math.hypot(spawn.x - x, spawn.z - z), `${district.id} lost its authored approach`).toBeLessThanOrEqual(6.001);
      const nearest = world.districts.reduce((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z) < Math.hypot(b.x - spawn.x, b.z - spawn.z) ? a : b);
      expect(nearest.id, `${district.id} arrival must announce the district being entered`).toBe(district.id);
      const eye = { x: spawn.x, y: spawn.y + 1.62, z: spawn.z };
      expect(hasLineOfSight(eye, { x: eye.x - Math.sin(spawn.yaw) * 5, y: eye.y, z: eye.z - Math.cos(spawn.yaw) * 5 }, world),
        `${district.id} opens against a wall or a bare terrace`).toBe(true);
      expect(walkFrom(spawn, spawn.yaw, 'battle-royale'), `${district.id} must open onto a usable approach`).toBeGreaterThan(.5);
    }
  });

  it('orients seats toward the fountain, a river walk or the interior aisle', () => {
    const benches = world.pieces!.filter(piece => piece.piece === 'bench');
    expect(benches.length).toBeGreaterThan(10);
    for (const bench of benches) {
      const house = [...HOUSES, ...MORRO_LOTS].find(h => Math.abs(bench.x - h.x) < h.w / 2 && Math.abs(bench.z - h.z) < h.d / 2);
      const target = house ? house : Math.hypot(bench.x - PLAZA[0], bench.z - PLAZA[1]) < 12 ? { x: PLAZA[0], z: PLAZA[1] } :
        Math.hypot(bench.x - MERCADAO[0], bench.z - MERCADAO[1]) < 14 ? { x: bench.x, z: MERCADAO[1] } : riverSample(bench.x, bench.z);
      const dx = target.x - bench.x, dz = target.z - bench.z;
      expect((Math.sin(bench.yaw) * dx + Math.cos(bench.yaw) * dz) / Math.hypot(dx, dz),
        `bench ${bench.id} turns its back on its view or walkway`).toBeGreaterThanOrEqual(Math.SQRT1_2);
    }
  });

  it('turns serving fronts toward their customer aisle and keeps lamps on path edges', () => {
    for (const piece of world.pieces!) {
      let target: { x: number; z: number } | undefined;
      if (piece.piece === 'market_stall') target = { x: piece.x, z: piece.z < 0 ? MERCADAO[1] : 33 };
      if (piece.piece === 'beach_kiosk') target = { x: piece.x, z: 100 };
      if (piece.piece === 'interior_counter') target = [...HOUSES, ...MORRO_LOTS]
        .find(h => Math.abs(piece.x - h.x) < h.w / 2 && Math.abs(piece.z - h.z) < h.d / 2);
      if (target) {
        const dx = target.x - piece.x, dz = target.z - piece.z;
        expect((Math.sin(piece.yaw) * dx + Math.cos(piece.yaw) * dz) / Math.hypot(dx, dz),
          `${piece.piece} ${piece.id} faces away from customers`).toBeGreaterThanOrEqual(Math.SQRT1_2);
      }
      if (piece.piece === 'lamp_post') {
        const courts = world.objects.filter(o => o.detail === 'courtyard').map(o =>
          [o.pos.x - o.scale.x / 2, o.pos.z - o.scale.z / 2, o.pos.x + o.scale.x / 2, o.pos.z + o.scale.z / 2]);
        expect([...ROADS, ...courts].some(([x0, z0, x1, z1]) => {
          const dx = Math.max(x0 - piece.x, 0, piece.x - x1), dz = Math.max(z0 - piece.z, 0, piece.z - z1);
          return Math.hypot(dx, dz) <= 3.5 && (piece.x <= x0 + .1 || piece.x >= x1 - .1 || piece.z <= z0 + .1 || piece.z >= z1 - .1);
        }), `lamp ${piece.id} must line an edge, not obstruct a route`).toBe(true);
      }
    }
  });

  it('faces district signs toward a public approach', () => {
    const routes = [...NAV_ROUTES, ...ROADS.map(([x0, z0, x1, z1]) => x1 - x0 > z1 - z0 ?
      [[x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]] : [[(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]])];
    for (const sign of world.objects.filter(object => object.kind === 'sign')) {
      let nearest = Infinity, alignment = -1;
      for (const route of routes) for (let i = 1; i < route.length; i++) {
        const [ax, az] = route[i - 1], [bx, bz] = route[i], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((sign.pos.x - ax) * dx + (sign.pos.z - az) * dz) / (dx * dx + dz * dz)));
        const x = ax + dx * t - sign.pos.x, z = az + dz * t - sign.pos.z, distance = Math.hypot(x, z);
        if (distance < nearest) { nearest = distance; alignment = (Math.sin(sign.rotation ?? 0) * x + Math.cos(sign.rotation ?? 0) * z) / distance; }
      }
      expect(alignment, `sign ${sign.detail} faces away from its approach`).toBeGreaterThanOrEqual(Math.SQRT1_2);
    }
  });

  it('supports level house floors and leaves both doorways and the centre aisle open', () => {
    const houses = [...HOUSES, ...MORRO_LOTS];
    expect(houses.length).toBeGreaterThanOrEqual(35);
    for (const h of houses) {
      const reach = (h.piece === 'house_tall' ? 7 : 6) / 2 + .8, dx = Math.sin(h.yaw ?? 0) * reach, dz = Math.cos(h.yaw ?? 0) * reach;
      expect(walkableSegment(world, { x: h.x - dx, z: h.z - dz }, { x: h.x + dx, z: h.z + dz }),
        `${h.role} at ${h.x},${h.z} blocks its two-exit route`).toBe(true);
      const floor = terrainHeight(h.x, h.z);
      for (let z = h.z - h.d / 2; z <= h.z + h.d / 2; z++) for (let x = h.x - h.w / 2; x <= h.x + h.w / 2; x++)
        expect(Math.abs(terrainHeight(x, z) - floor), `uneven house floor at ${x},${z}`).toBeLessThan(.15);
    }
    expect(world.pieces!.some(p => p.piece === 'church' && p.x === CHURCH[0] && p.z === CHURCH[1])).toBe(true);
  });

  it('faces each house frontage toward the street serving its lot', () => {
    for (const h of [...HOUSES, ...MORRO_LOTS]) {
      let distance = Infinity, alignment = -1;
      for (const [x0, z0, x1, z1] of ROADS) {
        const horizontal = x1 - x0 > z1 - z0;
        const x = (horizontal ? Math.max(x0, Math.min(x1, h.x)) : (x0 + x1) / 2) - h.x;
        const z = (horizontal ? (z0 + z1) / 2 : Math.max(z0, Math.min(z1, h.z))) - h.z;
        const gap = Math.hypot(x, z);
        if (gap < distance) { distance = gap; alignment = (Math.sin(h.yaw ?? 0) * x + Math.cos(h.yaw ?? 0) * z) / gap; }
      }
      expect(alignment, `house at ${h.x},${h.z} turns its front doorway away from the street`).toBeGreaterThanOrEqual(Math.SQRT1_2 - 1e-6);
    }
  });

  it('layers canopy and undergrowth across the western hills without closing paths', () => {
    expect(world.objects.filter(object => object.kind === 'tree' || object.kind === 'palm').length,
      'redistribute the canopy budget rather than growing the island draw cost').toBeLessThanOrEqual(360);
    const canopies = world.objects.filter(object => object.kind === 'tree' && object.scale.y > 4 && object.pos.x < -42 && object.pos.z < -26);
    const shrubs = world.pieces!.filter(piece => piece.id.startsWith('kit-undergrowth-'));
    expect(canopies.length).toBeGreaterThanOrEqual(50);
    expect(shrubs.filter(piece => piece.x < -42 && piece.z < -26).length).toBeGreaterThanOrEqual(40);
    for (const district of world.districts) expect(shrubs.filter(piece => Math.hypot(piece.x - district.x, piece.z - district.z) < district.radius * 1.1).length,
      `${district.id} needs an undergrowth layer`).toBeGreaterThanOrEqual(2);
    for (const piece of shrubs) expect(KIT_PIECES[piece.piece].colliders, 'low foliage must not add hidden blockers').toHaveLength(0);
  });

  it('carves one continuous river and provides three usable crossings', () => {
    for (let i = 1; i < RIVER.length; i++) {
      const a = RIVER[i - 1], b = RIVER[i];
      for (let n = 0; n <= 8; n++) expect(terrainHeight(a[0] + (b[0] - a[0]) * n / 8, a[1] + (b[1] - a[1]) * n / 8)).toBeLessThan(-.1);
    }
    expect(world.pieces!.filter(p => p.piece === 'bridge_stone')).toHaveLength(3);
    for (const [x, z] of BRIDGES) {
      expect(walkableHeight(x, z, world)).toBeGreaterThan(terrainHeight(x, z) + 2);
      expect(walkableSegment(world, { x, z: z - 9.5 }, { x, z: z + 9.5 }), `bridge at ${x}`).toBe(true);
    }
  });

  it('provides visible stair exits from swimming depth to both town banks', () => {
    const steps = world.pieces!.filter(piece => piece.piece === 'river_steps');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some(piece => Math.cos(piece.yaw) > .9)).toBe(true);
    expect(steps.some(piece => Math.cos(piece.yaw) < -.9)).toBe(true);
    for (const piece of steps) {
      const along = KIT_PIECES[piece.piece].footprint[1] * (piece.scale ?? 1) / 2;
      const x = piece.x - Math.sin(piece.yaw) * (along + .7), z = piece.z - Math.cos(piece.yaw) * (along + .7);
      const actor = structuredClone(spawnActor);
      actor.pos = { x, y: waterAt(x, z)!.surfaceY - SWIM_DRAFT, z }; actor.yaw = piece.yaw + Math.PI;
      actor.velocity = { x: 0, y: 0, z: 0 }; actor.stage = 'ground'; actor.grounded = false; actor.swimming = true;
      moveActor(actor, emptyInput(), world, 1 / 60, 1, 'deathmatch');
      expect(actor.swimming).toBe(true); expect(actor.grounded).toBe(false);
      for (let seq = 1; seq <= 360; seq++) moveActor(actor, { ...emptyInput(), seq, moveZ: 1, yaw: actor.yaw }, world, 1 / 60, 1, 'deathmatch');
      const progress = (actor.pos.x - piece.x) * Math.sin(piece.yaw) + (actor.pos.z - piece.z) * Math.cos(piece.yaw);
      expect(progress, `${piece.id} must lead all the way onto the quay`).toBeGreaterThan(along);
      expect(actor.pos.y, `${piece.id} must leave the water`).toBeGreaterThan(1.8);
      expect(actor.swimming).toBe(false); expect(actor.grounded).toBe(true);
    }
  });

  it('keeps the six play spots accessible, clear overhead and tied to visible contact surfaces', () => {
    for (const [piece, sites] of [['mud_bath', world.mudBaths ?? []], ['trampoline', world.trampolines ?? []]] as const) {
      const interaction = KIT_PIECES[piece]?.interaction;
      expect(sites.length).toBe(interaction ? 3 : 0);
      if (!interaction) continue;
      for (const site of sites) {
        const placed = world.pieces!.find(instance => instance.id === site.id)!;
        expect(placed.piece).toBe(piece);
        expect(site.y).toBeCloseTo(placed.y + interaction.surfaceY * (placed.scale ?? 1), 5);
        expect(site.radius).toBeCloseTo(interaction.radius * (placed.scale ?? 1), 5);
        expect(walkableHeight(site.x, site.z, world)).toBeCloseTo(site.y, 3);
        const reach = Math.max(...KIT_PIECES[piece].footprint) * (placed.scale ?? 1) / 2 + .9;
        const from = { x: site.x + Math.sin(placed.yaw) * reach, z: site.z + Math.cos(placed.yaw) * reach };
        const actor = structuredClone(spawnActor);
        actor.pos = { ...from, y: walkableHeight(from.x, from.z, world) }; actor.yaw = placed.yaw;
        actor.velocity = { x: 0, y: 0, z: 0 }; actor.stage = 'ground'; actor.grounded = true;
        // The shared round actor footprint steps over the low pad rim. A
        // navigation-cell square can conservatively reject its outer corners.
        for (let tick = 0; tick < 180 && Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z) >= site.radius - .1; tick++)
          moveActor(actor, { ...emptyInput(), moveZ: 1, yaw: actor.yaw }, world, 1 / 60, 1, 'battle-royale');
        expect(Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z), `${site.id} must have a walk-in entrance`).toBeLessThan(site.radius - .1);
        expect(actor.pos.y).toBeGreaterThanOrEqual(site.y - .05);
        expect(hasLineOfSight({ x: site.x, y: site.y + .5, z: site.z },
          { x: site.x, y: site.y + 8, z: site.z }, world), `${site.id} needs open sky`).toBe(true);
        for (const point of [...world.spawns, ...world.loot, ...world.chests])
          expect(Math.hypot(point.x - site.x, point.z - site.z), `${site.id} must remain free of spawns and pickups`).toBeGreaterThan(site.radius + .5);
      }
    }
    for (const pad of world.trampolines ?? []) expect(pad.impulse).toBe(TRAMPOLINE_IMPULSE);
  });

  it('supports the full fort foundations so beach paths cannot cut under the towers', () => {
    const fort = world.pieces!.filter(p => /^fort_(wall|tower)$/.test(p.piece) && Math.hypot(p.x - FORTE[0], p.z - FORTE[1]) < 23);
    expect(fort.length).toBeGreaterThanOrEqual(12);
    for (const piece of fort) {
      const [width, depth] = KIT_PIECES[piece.piece].footprint;
      for (const dx of [-.5, 0, .5]) for (const dz of [-.5, 0, .5]) {
        const x = piece.x + dx * width * Math.cos(piece.yaw) + dz * depth * Math.sin(piece.yaw);
        const z = piece.z + dz * depth * Math.cos(piece.yaw) - dx * width * Math.sin(piece.yaw);
        expect(Math.abs(terrainHeight(x, z) - piece.y), `floating foundation ${piece.id} at ${x},${z}`).toBeLessThan(.2);
      }
    }
    for (const [from, to] of [[{ x: 4, z: -70 }, { x: 4, z: -92 }], [{ x: 4, z: -118 }, { x: 4, z: -106 }]])
      expect(walkableSegment(world, from, to), 'cliff dressing must preserve the two fort gate approaches').toBe(true);
  });

  it('exposes the fort stone faces instead of burying their geometry inside the smooth skirt', () => {
    const pieces = new Set(world.pieces!.filter(piece => piece.piece.startsWith('cliff_')).map(piece => piece.id));
    const stone = { ...world, colliders: world.colliders.filter(collider => pieces.has(collider.pieceId!)) };
    const origin = { x: FORTE[0], y: terrainHeight(FORTE[0], FORTE[1] + 49) + 1.62, z: FORTE[1] + 49 };
    let samples = 0, covered = 0;
    for (let z = FORTE[1] + 20; z <= FORTE[1] + 29; z++) for (let x = FORTE[0] - 20; x <= FORTE[0] + 20; x++) {
      const y = terrainHeight(x, z);
      const slope = Math.hypot(terrainHeight(x + 1, z) - terrainHeight(x - 1, z), terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
      if (y < 3 || y > 14.8 || slope < .9 || routeDistance(x, z) < 2.6) continue;
      const direction = { x: x - origin.x, y: y + .1 - origin.y, z: z - origin.z };
      const distance = Math.hypot(direction.x, direction.y, direction.z);
      direction.x /= distance; direction.y /= distance; direction.z /= distance;
      const hit = raycastWorld(origin, direction, distance + .1, stone);
      samples++; if (hit && hit.collider.id !== 'terrain') covered++;
    }
    // Inscribed collision is smaller than rendered stone, so this is a
    // conservative visibility floor. The formerly buried skins covered 7%.
    expect(samples).toBeGreaterThan(100);
    expect(covered / samples).toBeGreaterThan(.4);
  });

  it('marks each arena edge with real pieces while leaving its gates traversable', () => {
    const boundaries = world.pieces!.filter(p => world.arenaBoundary!.includes(p.id));
    expect(boundaries.length).toBeGreaterThanOrEqual(12);
    for (const [axis, value] of [['x', ARENA.minX], ['x', ARENA.maxX], ['z', ARENA.minZ], ['z', ARENA.maxZ]] as const)
      expect(boundaries.filter(p => p[axis] === value).length).toBeGreaterThanOrEqual(2);
    for (const [x, z, dx, dz] of [[ARENA.minX, -38, 3, 0], [ARENA.maxX, -38, 3, 0], [4, ARENA.minZ, 0, 3], [-30, ARENA.maxZ, 0, 3]])
      expect(walkableSegment(world, { x: x - dx, z: z - dz }, { x: x + dx, z: z + dz }), `gate at ${x},${z}`).toBe(true);
  });

  it('connects every district through clear bot routes with more than one approach', () => {
    const graph = world.navigation!, seen = new Set<number>(), components: number[][] = [];
    for (let start = 0; start < graph.points.length; start++) {
      if (seen.has(start)) continue;
      const queue = [start]; seen.add(start);
      for (let i = 0; i < queue.length; i++) for (const next of graph.links[queue[i]]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      components.push(queue);
    }
    components.sort((a, b) => b.length - a.length);
    const connected = new Set(components[0]);
    for (const point of [...world.spawns, ...world.loot, ...world.chests])
      expect(components[0].some(index => Math.hypot(graph.points[index].x - point.x, graph.points[index].z - point.z) < 10 &&
        walkableSegment(world, point, graph.points[index])), `unreachable point ${JSON.stringify(point)}`).toBe(true);
    for (const district of world.districts) {
      const approaches = graph.points.filter((point, i) => connected.has(i) &&
        Math.hypot(point.x - district.x, point.z - district.z) < district.radius * .8);
      expect(approaches.length, `isolated district ${district.id}`).toBeGreaterThan(8);
      expect(approaches.some(a => approaches.some(b => Math.hypot(a.x - b.x, a.z - b.z) > district.radius)),
        `${district.id} needs separated approaches`).toBe(true);
    }
    for (const [i, links] of graph.links.entries()) for (const next of links) if (next > i)
      expect(walkableSegment(world, graph.points[i], graph.points[next])).toBe(true);
    const from = { x: -10, y: terrainHeight(-10, -2), z: -2 }, to = { x: -10, y: terrainHeight(-10, 20), z: 20 };
    const via = navigationWaypoint(world, from, to, true);
    expect(via, 'bots must route around the river instead of attempting to wade across').not.toBeNull();
    expect(walkableSegment(world, from, via!, true)).toBe(true);
  });

  it('breaks opening sightlines with physical cover', () => {
    const spawns = world.spawns.filter(spawn => spawn.mode === 'deathmatch');
    expect(spawns.length).toBeGreaterThanOrEqual(20);
    for (const spawn of spawns) expect(spawns.filter(other => other !== spawn && !hasLineOfSight(
      { x: spawn.x, y: spawn.y + 1.62, z: spawn.z }, { x: other.x, y: other.y + 1.62, z: other.z }, world)).length).toBeGreaterThanOrEqual(4);
  });

  it('connects town spawns and pickups without sending Correria bots outside the arena', () => {
    const graph = world.navigation!;
    const start = graph.points.findIndex(p => Math.hypot(p.x, p.z + 20) < 3);
    expect(start).toBeGreaterThanOrEqual(0);
    const queue = [start], connected = new Set(queue);
    for (let i = 0; i < queue.length; i++) for (const next of graph.links[queue[i]]) {
      const point = graph.points[next];
      if (connected.has(next) || !inArena(point.x, point.z, .5)) continue;
      connected.add(next); queue.push(next);
    }
    const points = [...world.spawns.filter(p => p.mode === 'deathmatch'),
      ...world.loot.filter(p => inArena(p.x, p.z, .5)), ...world.chests.filter(p => inArena(p.x, p.z, .5))];
    for (const point of points) expect(queue.some(index => Math.hypot(graph.points[index].x - point.x, graph.points[index].z - point.z) < 10 &&
      walkableSegment(world, point, graph.points[index], true)), `town route leaves arena at ${JSON.stringify(point)}`).toBe(true);
  });

  it('places the market sign outside its frontage and central doorway', () => {
    const sign = world.objects.find(o => o.kind === 'sign' && o.detail === 'MERCADÃO')!;
    expect(sign.pos.z).toBeGreaterThan(MERCADAO[1] + 8);
    expect(Math.abs(sign.pos.x - MERCADAO[0])).toBeGreaterThan(3);
    const centre = sign.pos.y + .4 - terrainHeight(sign.pos.x, sign.pos.z);
    expect(centre - sign.scale.y * .31).toBeGreaterThan(1.5);
    expect(centre + sign.scale.y * .31).toBeLessThan(2.7);
  });
});

describe('painted terrain regions', () => {
  it('keeps bright grass, distinct roads, sandy beaches and rocky relief', () => {
    const brightness = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).reduce((n, c, i) => n + c * [.2126, .7152, .0722][i], 0);
    for (const color of [WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass]) expect(brightness(color)).toBeGreaterThan(145);
    const road = ROADS[0], x = (road[0] + road[2]) / 2, z = (road[1] + road[3]) / 2;
    expect(terrainColor(x, z, terrainHeight(x, z), 0)).toBe(WORLD_PALETTE.road);
    expect([WORLD_PALETTE.sand, WORLD_PALETTE.sandLight, WORLD_PALETTE.sandWet]).toContain(terrainColor(-22, 111, terrainHeight(-22, 111), 0));
    expect(terrainColor(0, 8, -1, 0)).toBe(WORLD_PALETTE.mud);
    expect(terrainColor(-105, -50, 15, 1.2)).toBe(WORLD_PALETTE.rock);
    expect(brightness(WORLD_PALETTE.road)).toBeLessThan(brightness(WORLD_PALETTE.grass) - 20);
  });
  it('retains a green tropical island while making room for cliffs and beaches', () => {
    let land = 0, grass = 0, dry = 0, high = -Infinity, low = Infinity;
    for (let z = -120; z <= 120; z += 4) for (let x = -120; x <= 120; x += 4) {
      const y = terrainHeight(x, z); if (y < .5) continue;
      const slope = Math.hypot(terrainHeight(x + 2, z) - terrainHeight(x - 2, z), terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) / 4;
      const color = terrainColor(x, z, y, slope); land++; high = Math.max(high, y); low = Math.min(low, y);
      if ([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass].some(c => c === color)) grass++;
      if (color === WORLD_PALETTE.dryGrass) dry++;
    }
    expect(grass / land).toBeGreaterThan(.6);
    expect(dry / land).toBeLessThan(.15);
    expect(high - low).toBeGreaterThan(23);
  });
});
