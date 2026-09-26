import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { closestInteraction } from '../src/shared/interaction';
import { rng } from '../src/shared/math';
import { walkableSegment } from '../src/shared/navigation';
import { chooseSupplyLanding, clearSupplyLanding, SUPPLY_CANOPY_HEIGHT, SUPPLY_RELEASE_HEIGHT, supplyDropPhase, supplyDropPosition } from '../src/shared/supply-drops';
import { terrainHeight } from '../src/shared/terrain';
import { waterAt } from '../src/shared/water';
import { createWorld } from '../src/shared/world';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import type { ActorState, Mode, SupplyDropState, Vec3, WorldSpec, ZoneState } from '../src/shared/types';

const ground = (x: number, z = -20): Vec3 => ({ x, y: terrainHeight(x, z), z });
function fixture(mode: Mode = 'battle-royale', seed = 41) {
  const points = [0, 4, 28, 32].map(x => ground(x));
  const world: WorldSpec = { version: 'supply-test', size: 260, objects: [], colliders: [], chests: [], loot: [],
    spawns: points.slice(0, 2).map(pos => ({ ...pos, mode: 'both', yaw: 0 })),
    districts: [{ id: 'porto', name: 'Porto', x: 0, z: -20, radius: 50, color: '#f7cb50' }],
    navigation: { points, links: [[1], [0, 2], [1, 3], [2]] } };
  const sim = new Simulation(world, { mode, capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    ['a', 'b'].map(id => ({ id, name: id, color: '#e76f51', ready: true, connected: true })), 'a'.repeat(48), seed);
  until(sim, 3.1);
  const actors = [...(sim as any).actors.values()].map((runtime: any) => runtime.state) as ActorState[];
  actors.forEach((actor, i) => { actor.pos = ground(i * 4); actor.stage = 'ground'; actor.grounded = true; actor.velocity = { x: 0, y: 0, z: 0 }; actor.protectionUntil = 1000; });
  return { sim, world, actors };
}
function until(sim: Simulation, time: number) {
  while (sim.snapshot().time + 1e-7 < time) sim.step(Math.min(.25, time - sim.snapshot().time));
}
function delivered(seed = 41) {
  const fixtureValue = fixture('battle-royale', seed);
  until(fixtureValue.sim, 65.2);
  return { ...fixtureValue, drop: fixtureValue.sim.snapshot().supplyDrops[0] };
}

describe('Entrega do Tucano authority', () => {
  it('schedules at most two seeded BR deliveries with one incoming and landing event each', () => {
    const a = fixture(), b = fixture();
    until(a.sim, 48); expect(a.sim.snapshot().supplyDrops).toEqual([]);
    until(a.sim, 160); until(b.sim, 160);
    const drops = a.sim.snapshot().supplyDrops;
    expect(drops).toHaveLength(2); expect(drops).toEqual(b.sim.snapshot().supplyDrops);
    const events = a.sim.drainEvents().filter(event => event.type === 'supply');
    expect(events.map(event => event.stage)).toEqual(['incoming', 'landed', 'incoming', 'landed']);
    for (const drop of drops) {
      expect(drop.releaseAt - drop.announcedAt).toBeCloseTo(5, 10);
      expect(drop.landsAt - drop.releaseAt).toBeCloseTo(12, 10);
    }
    until(a.sim, 190); expect(a.sim.snapshot().supplyDrops).toHaveLength(2);
  });

  it.each(['deathmatch', 'corrente'] as const)('never adds deliveries to %s', mode => {
    const { sim } = fixture(mode); until(sim, 150);
    expect(sim.snapshot().supplyDrops).toEqual([]);
    expect(sim.drainEvents().some(event => event.type === 'supply')).toBe(false);
  });

  it('cannot open early or remotely and gives a contested crate exactly one loot spill', () => {
    const { sim, world, actors } = fixture();
    until(sim, 49); const drop = sim.snapshot().supplyDrops[0];
    actors[0].pos = { ...drop.pos };
    sim.action('a', { type: 'interact', id: 1, target: drop.id });
    expect(sim.snapshot().loot).toHaveLength(0);
    expect(closestInteraction(world, sim.snapshot(), actors[0], { id: '', name: '' })).toBeNull();
    until(sim, drop.landsAt + .1);
    actors[0].pos.x += 8;
    sim.action('a', { type: 'interact', id: 2, target: drop.id });
    expect(sim.snapshot().supplyDrops[0].opened).toBe(false);
    actors.forEach(actor => { actor.pos = { ...drop.pos }; });
    expect(closestInteraction(world, sim.snapshot(), actors[0], { id: '', name: '' })).toEqual({ id: drop.id, name: 'Abrir entrega do Tucano' });
    const inventory = structuredClone(actors[0].weapons);
    sim.action('a', { type: 'interact', id: 3, target: drop.id });
    sim.action('b', { type: 'interact', id: 1, target: drop.id });
    sim.action('a', { type: 'interact', id: 4, target: drop.id });
    const loot = sim.snapshot().loot;
    expect(loot).toHaveLength(3); expect(actors[0].weapons).toEqual(inventory);
    expect(loot.map(item => item.kind)).toEqual(['weapon', 'armor', 'ammo']);
    expect([2, 3]).toContain(loot[0].rarity);
    expect(loot.every(item => item.active && item.respawnAt === 0 && !waterAt(item.x, item.z) && walkableSegment(world, drop.pos, item))).toBe(true);
    expect(sim.drainEvents().filter(event => event.type === 'supply' && event.stage === 'opened')).toHaveLength(1);
    actors[1].pos = { x: loot[0].x, y: loot[0].y, z: loot[0].z };
    sim.action('b', { type: 'interact', id: 2, target: loot[0].id });
    expect(actors[1].weapons.some(weapon => weapon.id === loot[0].weapon && weapon.rarity === loot[0].rarity)).toBe(true);
  });

  it('does not open through a wall even when the target ID and range are valid', () => {
    const { sim, world, actors, drop } = delivered();
    actors[0].pos = { ...drop.pos, x: drop.pos.x + 2 };
    world.colliders.push({ id: 'wall', material: 'stone', min: { x: drop.pos.x + .8, y: drop.pos.y, z: drop.pos.z - 2 },
      max: { x: drop.pos.x + 1.2, y: drop.pos.y + 3, z: drop.pos.z + 2 } });
    sim.action('a', { type: 'interact', id: 1, target: drop.id });
    expect(sim.snapshot().loot).toHaveLength(0); expect(sim.snapshot().supplyDrops[0].opened).toBe(false);
    expect(closestInteraction(world, sim.snapshot(), actors[0], { id: '', name: '' })).toBeNull();
  });

  it('reconstructs identical descent and claim state from a reliable reconnect baseline', () => {
    const { sim, actors, drop } = delivered();
    const snapshot = sim.snapshot(), reliable = JSON.parse(JSON.stringify(worldPart(snapshot)));
    const restored = rebuildFrame(fastPart(snapshot), reliable, gearPart(snapshot));
    expect(restored?.supplyDrops).toEqual([drop]);
    expect(supplyDropPhase(drop, drop.releaseAt - .1)).toBe('incoming');
    expect(supplyDropPhase(drop, drop.releaseAt + 1)).toBe('descending');
    expect(supplyDropPosition(drop, drop.releaseAt).y).toBe(drop.pos.y + SUPPLY_RELEASE_HEIGHT);
    expect(supplyDropPosition(drop, drop.releaseAt + 6).y).toBeCloseTo(drop.pos.y + SUPPLY_RELEASE_HEIGHT / 2, 10);
    expect(supplyDropPosition(drop, drop.landsAt + 100)).toEqual(drop.pos);
    actors[0].pos = { ...drop.pos }; sim.action('a', { type: 'interact', id: 1, target: drop.id });
    const claimed = sim.snapshot();
    expect(rebuildFrame(fastPart(claimed), worldPart(claimed), gearPart(claimed))?.supplyDrops[0].opened).toBe(true);
    expect(rebuildFrame(fastPart(snapshot), { ...reliable, supplyDrops: [drop, drop] }, gearPart(snapshot))).toBeNull();
    expect(rebuildFrame(fastPart(snapshot), { ...reliable, supplyDrops: [{ ...drop, landsAt: drop.releaseAt }] }, gearPart(snapshot))).toBeNull();
  });
});

describe('reachable supply landing sites', () => {
  it('places seeded island drops on dry terrain in the next zone with clear descent and multiple walk-ins', () => {
    const world = createWorld(), graph = world.navigation!, zone: ZoneState = { x: 0, z: 0, radius: 95, nextX: -12, nextZ: 10, nextRadius: 55, phase: 1, shrinking: false, timeLeft: 30, damage: 2 };
    const found = new Set<string>();
    for (let seed = 0; seed < 16; seed++) {
      const point = chooseSupplyLanding(world, zone, rng(seed));
      expect(point).not.toBeNull(); if (!point) continue;
      found.add(`${point.x},${point.z}`);
      expect(graph.points.some(node => node.x === point.x && node.z === point.z && node.y === point.y)).toBe(true);
      expect(Math.hypot(point.x - zone.nextX, point.z - zone.nextZ)).toBeLessThanOrEqual(zone.nextRadius - 8);
      expect(point.y).toBeCloseTo(terrainHeight(point.x, point.z));
      for (const dx of [-.65, 0, .65]) for (const dz of [-.65, 0, .65]) {
        expect(waterAt(point.x + dx, point.z + dz)).toBeNull();
        expect(Math.abs(terrainHeight(point.x + dx, point.z + dz) - point.y)).toBeLessThanOrEqual(.1);
      }
      expect(world.colliders.some(c => c.min.x < point.x + 1.25 && c.max.x > point.x - 1.25 &&
        c.min.z < point.z + 1.25 && c.max.z > point.z - 1.25 && c.max.y > point.y + .03 && c.min.y < point.y + SUPPLY_RELEASE_HEIGHT + SUPPLY_CANOPY_HEIGHT)).toBe(false);
      expect([[3, 0], [-3, 0], [0, 3], [0, -3]].filter(([x, z]) => walkableSegment(world, point, { x: point.x + x, z: point.z + z })).length).toBeGreaterThanOrEqual(2);
    }
    expect(found.size).toBeGreaterThan(8);
  });

  it('rejects water, roofs, recreation sites and an isolated navigation island', () => {
    const { world } = fixture();
    expect(clearSupplyLanding(world, { x: -60, y: -1.15, z: 2 })).toBe(false);
    const pos = ground(0);
    world.colliders.push({ id: 'roof', material: 'wood', min: { x: -.9, y: pos.y + 8, z: -21 }, max: { x: .9, y: pos.y + 8.3, z: -19 } });
    expect(clearSupplyLanding(world, pos)).toBe(false);
    world.colliders.pop(); world.mudBaths = [{ id: 'bath', ...pos, radius: 1.45 }];
    expect(clearSupplyLanding(world, pos)).toBe(false);
    world.mudBaths = []; world.navigation!.points.push(ground(80)); world.navigation!.links.push([]);
    const zone = { nextX: 80, nextZ: -20, nextRadius: 12 } as ZoneState;
    expect(chooseSupplyLanding(world, zone, rng(1))).toBeNull();
  });

  it('keeps the full authored canopy clear of overhead geometry at release', () => {
    const { world } = fixture(), point = ground(0);
    expect(clearSupplyLanding(world, point)).toBe(true);
    world.colliders = [{ id: 'overhead', material: 'wood',
      min: { x: -.5, y: point.y + SUPPLY_RELEASE_HEIGHT + 3.25, z: -20.5 },
      max: { x: .5, y: point.y + SUPPLY_RELEASE_HEIGHT + 3.4, z: -19.5 } }];
    expect(clearSupplyLanding(world, point)).toBe(false);
    world.colliders = world.colliders.map(c => ({ ...c, min: { ...c.min, y: point.y + SUPPLY_RELEASE_HEIGHT + 3.6 },
      max: { ...c.max, y: point.y + SUPPLY_RELEASE_HEIGHT + 3.8 } }));
    expect(clearSupplyLanding(world, point)).toBe(true);
  });
});
