import { describe, expect, it } from 'vitest';
import { clearSpawn, hasLineOfSight } from '../src/shared/collision';
import { ARENA, BRIDGES, CHURCH, FORTE, HOUSES, MERCADAO, MORRO_LOTS, RIVER, ROADS, inArena } from '../src/shared/layout';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';
import { navigationWaypoint, walkableHeight, walkableSegment } from '../src/shared/navigation';
import { WORLD_PALETTE, terrainColor, terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';

const world = createWorld();
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

  it('supports level house floors and leaves both doorways and the centre aisle open', () => {
    const houses = [...HOUSES, ...MORRO_LOTS];
    expect(houses.length).toBeGreaterThanOrEqual(35);
    for (const h of houses) {
      expect(walkableSegment(world, { x: h.x, z: h.z - h.d / 2 - .8 }, { x: h.x, z: h.z + h.d / 2 + .8 }),
        `${h.role} at ${h.x},${h.z} blocks its two-exit route`).toBe(true);
      const floor = terrainHeight(h.x, h.z);
      for (let z = h.z - h.d / 2; z <= h.z + h.d / 2; z++) for (let x = h.x - h.w / 2; x <= h.x + h.w / 2; x++)
        expect(Math.abs(terrainHeight(x, z) - floor), `uneven house floor at ${x},${z}`).toBeLessThan(.15);
    }
    expect(world.pieces!.some(p => p.piece === 'church' && p.x === CHURCH[0] && p.z === CHURCH[1])).toBe(true);
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
