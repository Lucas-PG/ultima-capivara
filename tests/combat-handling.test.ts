import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { moveActor } from '../src/shared/collision';
import { pelletDirection } from '../src/shared/ballistics';
import { terrainHeight } from '../src/shared/terrain';
import { HANDLING, WEAPONS, shotSpread } from '../src/shared/weapons';
import { MELEE_SECONDS } from '../src/shared/weapon-presentation';
import type { ActorState, GameEvent, InputFrame, PlayerProfile, RoomConfig, WeaponId, WorldSpec } from '../src/shared/types';

const world = (): WorldSpec => ({
  version: 'handling', size: 256, objects: [], districts: [], loot: [], chests: [],
  colliders: [{ id: 'backstop', min: { x: -60, y: -20, z: -40.5 }, max: { x: 60, y: 60, z: -40 }, material: 'stone' }],
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 }],
});
const config: RoomConfig = { mode: 'deathmatch', capacity: 1, bots: false, difficulty: 'normal', duration: 300 };
const profile: PlayerProfile = { id: 'a', name: 'A', color: '#111111', ready: true, connected: true };

function setup(match: string, loadout: WeaponId[]) {
  const sim = new Simulation(world(), config, [profile], match, 99);
  for (let i = 0; i < 4 * 60; i++) sim.step(1 / 60);
  const runtime = (sim as any).actors.get('a'), actor: ActorState = runtime.state;
  actor.weapons = loadout.map((id, box) => ({ id, ammo: WEAPONS[id].magazine, reserve: 200, rarity: 0, box }));
  actor.slot = 0; actor.protectionUntil = 0; runtime.nextShot = 0; runtime.readyAt = {};
  sim.drainEvents();
  let seq = 0, action = 0;
  const tick = (extras: Partial<InputFrame> = {}) => {
    sim.input('a', { seq: ++seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false,
      fire: false, ads: false, lean: 0, clientTime: sim.snapshot().time, ...extras });
    sim.step(1 / 60);
  };
  const click = () => sim.action('a', { type: 'trigger', id: ++action, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
  const swap = (slot: number) => sim.action('a', { type: 'slot', id: ++action, slot });
  const shots = () => sim.drainEvents().filter((e): e is Extract<GameEvent, { type: 'shot' }> => e.type === 'shot');
  return { sim, runtime, actor, tick, click, swap, shots };
}

describe('combat handling on the host', () => {
  it('fires a held automatic at its listed rate, not rounded up to whole ticks', () => {
    const { tick, shots } = setup('cadence', ['m4']);
    let fired = 0;
    for (let i = 0; i < 120; i++) { tick({ fire: true }); fired += shots().length; }
    // 2 s at 650 rpm is 21.7 intervals: 22 rounds. Rounding each interval to 6 ticks would give 20.
    expect(fired).toBeGreaterThanOrEqual(22);
    expect(fired).toBeLessThanOrEqual(23);
  });

  it('holds a swapped-in gun until it is drawn, and keeps a bolt cycle across swaps', () => {
    const { tick, click, swap, shots } = setup('draw', ['sniper', 'pistol']);
    click(); tick();
    expect(shots().map(s => s.weapon)).toEqual(['sniper']);
    swap(1);
    // Clicking before the pistol is up does nothing; after its draw time it fires.
    click(); tick();
    expect(shots()).toHaveLength(0);
    for (let i = 0; i < Math.ceil(HANDLING.pistol.draw * 60); i++) tick();
    click(); tick();
    expect(shots().map(s => s.weapon)).toEqual(['pistol']);
    // Back to the sniper half a second after its shot: the bolt still has to finish its 1.2 s cycle.
    swap(0);
    for (let i = 0; i < Math.ceil(HANDLING.sniper.draw * 60) + 2; i++) tick();
    click(); tick();
    expect(shots()).toHaveLength(0);
    for (let i = 0; i < 40; i++) tick();
    click(); tick();
    expect(shots().map(s => s.weapon)).toEqual(['sniper']);
  });

  it('ends a sprint on the trigger and fires that click once the gun is up', () => {
    const { tick, click, actor, shots } = setup('sprint-out', ['m4']);
    for (let i = 0; i < 30; i++) tick({ sprint: true, moveZ: 1 });
    expect(actor.sprint).toBe(true);
    click();
    let firstShotTick = -1, fired = 0;
    // The client holds sprint off for a moment after a click (InputController), then sprints again.
    for (let i = 0; i < 30; i++) {
      tick({ sprint: i >= 20, moveZ: 1, fire: i < 2 });
      const n = shots().length; fired += n;
      if (n && firstShotTick < 0) firstShotTick = i;
    }
    expect(fired).toBe(1);
    expect(actor.sprint).toBe(true);
    const ticks = Math.round(HANDLING.m4.sprintOut * 60);
    expect(firstShotTick).toBeGreaterThanOrEqual(ticks - 1);
    expect(firstShotTick).toBeLessThanOrEqual(ticks + 1);
  });

  it('swings the facão on quick melee without selecting it, then returns to the gun, which is drawn again', () => {
    const { sim, actor, tick, shots } = setup('quick-melee', ['m4', 'pistol', 'machete']);
    for (let i = 0; i < 20; i++) tick({ sprint: true, moveZ: 1 });
    sim.action('a', { type: 'melee', id: 50 }); tick({ sprint: true, moveZ: 1 });
    // Straight out of the run: no sprint-out for the blade.
    expect(shots().map(s => s.weapon)).toEqual(['machete']);
    let back = -1;
    for (let i = 0; i < Math.ceil(MELEE_SECONDS * 60) + 2 && back < 0; i++) { tick(); if (actor.weapons[actor.slot].id === 'm4') back = sim.snapshot().time; }
    expect(back).toBeGreaterThan(0);
    let firstM4 = -1;
    for (let i = 0; i < 40 && firstM4 < 0; i++) { tick({ fire: true }); if (shots().some(s => s.weapon === 'm4')) firstM4 = sim.snapshot().time; }
    expect(firstM4 - back).toBeGreaterThanOrEqual(HANDLING.m4.draw - 1 / 60);
    // The swing has its own cadence: spamming the key does not swing faster than the facão.
    sim.action('a', { type: 'melee', id: 51 }); tick();
    sim.action('a', { type: 'melee', id: 52 }); tick();
    expect(shots().filter(s => s.weapon === 'machete')).toHaveLength(1);
  });

  it('draws the same seeded pellet directions the shooter\'s client predicts', () => {
    for (const id of ['m4', 'shotgun'] as const) {
      const { sim, actor, tick, click, shots } = setup(`seed-${id}`, [id]);
      const seq = actor.shotSeq + 1;
      const spread = shotSpread(id, 0, 0, false, 0);
      click(); tick();
      const fired = shots();
      expect(fired).toHaveLength(1);
      expect(fired[0].seq).toBe(seq);
      // The event carries the first endpoint found; for a single round it is along its one pellet.
      const d = pelletDirection(id, (sim as any).matchId, 'a', seq, 0, 0, 0, spread), o = fired[0].origin, e = fired[0].end;
      const length = Math.hypot(e.x - o.x, e.y - o.y, e.z - o.z);
      if (id === 'm4') {
        expect((e.x - o.x) / length).toBeCloseTo(d.x, 4);
        expect((e.y - o.y) / length).toBeCloseTo(d.y, 4);
      }
      // Pellets stay inside the advertised cone.
      for (let pellet = 0; pellet < (WEAPONS[id].pellets ?? 1); pellet++) {
        const p = pelletDirection(id, 'm', 'a', seq, pellet, 0, 0, spread);
        expect(Math.acos(-p.z) * 180 / Math.PI).toBeLessThanOrEqual(spread + 1e-6);
      }
    }
  });
});

describe('coyote time', () => {
  const ledge: WorldSpec = {
    version: 'ledge', size: 256, objects: [], districts: [], loot: [], chests: [], spawns: [],
    colliders: [{ id: 'deck', min: { x: -5, y: 0, z: -1 }, max: { x: 5, y: 3, z: 5 }, material: 'wood' }],
  };
  const actor = (): ActorState => ({
    id: 'a', name: 'A', color: '#111111', bot: false, connected: true, pos: { x: 0, y: 3, z: -.9 }, velocity: { x: 0, y: 0, z: -3.9 },
    yaw: 0, pitch: 0, lean: 0, hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false,
    swimming: false, wetUntil: 0, emote: null, emoteUntil: 0, soaking: false, bounceSeq: 0, bounceProtected: false, stage: 'ground',
    kills: 0, deaths: 0, damage: 0, weaponLevel: 0, weapons: [{ id: 'pistol', ammo: 17, reserve: 0, rarity: 0, box: 2 }], slot: 0,
    consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }, reloadUntil: 0, useUntil: 0, using: null,
    respawnAt: 0, protectionUntil: 0, lastInput: 0, shotHeat: 0, shotSeq: 0,
  });
  const step = (a: ActorState, extras: Partial<InputFrame> = {}) => moveActor(a, { seq: 0, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, sprint: false, crouch: false,
    jump: false, fire: false, ads: false, lean: 0, clientTime: 0, ...extras }, ledge, 1 / 60);

  it('still jumps a moment after walking off an edge, but never twice in the air', () => {
    const a = actor();
    let ticks = 0;
    while (a.grounded && ticks++ < 60) step(a);
    expect(a.grounded).toBe(false);
    step(a); step(a);
    step(a, { jump: true });
    expect(a.velocity.y).toBeGreaterThan(6);
    // Rising, then at the apex: a second press does nothing.
    for (let i = 0; i < 18; i++) step(a);
    const before = a.velocity.y;
    step(a, { jump: true });
    expect(a.velocity.y).toBeLessThan(before);
  });

  it('does not grant a late jump after a real fall has started', () => {
    const a = actor();
    while (a.grounded) step(a);
    for (let i = 0; i < 12; i++) step(a);
    step(a, { jump: true });
    expect(a.velocity.y).toBeLessThan(0);
  });
});
