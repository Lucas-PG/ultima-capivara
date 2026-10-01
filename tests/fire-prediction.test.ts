import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { FirePredictor, type ShotEvent } from '../src/fire-prediction';
import { terrainHeight } from '../src/shared/terrain';
import { moveActor } from '../src/shared/collision';
import { HANDLING, WEAPONS } from '../src/shared/weapons';
import type { ActorState, GameEvent, InputFrame, PlayerProfile, RoomConfig, WeaponId, WorldSpec } from '../src/shared/types';

// The predictor must show the rounds the host will fire, where it fires them,
// and nothing the host refuses; otherwise the local feedback lies.
const world = (): WorldSpec => ({
  version: 'predict', size: 256, objects: [], districts: [], loot: [], chests: [],
  colliders: [{ id: 'wall', min: { x: -60, y: -20, z: -30.5 }, max: { x: 60, y: 60, z: -30 }, material: 'wood' }],
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 }],
});
const config: RoomConfig = { mode: 'deathmatch', capacity: 1, bots: false, difficulty: 'normal', duration: 300 };
const profile: PlayerProfile = { id: 'a', name: 'A', color: '#111111', ready: true, connected: true };

function rig(match: string, loadout: WeaponId[]) {
  const sim = new Simulation(world(), config, [profile], match, 5);
  for (let i = 0; i < 4 * 60; i++) sim.step(1 / 60);
  const runtime = (sim as any).actors.get('a'), actor: ActorState = runtime.state;
  actor.weapons = loadout.map((id, box) => ({ id, ammo: WEAPONS[id].magazine, reserve: 200, rarity: 0, box }));
  actor.slot = 0; actor.protectionUntil = 0; runtime.nextShot = 0; runtime.readyAt = {};
  sim.drainEvents();
  const predictor = new FirePredictor();
  const w = world();
  let seq = 0, action = 0;
  const host: ShotEvent[] = [], local: ShotEvent[] = [];
  const view = () => structuredClone(sim.snapshot().actors[0]);
  predictor.sync(view(), sim.snapshot().time);
  const tick = (extras: Partial<InputFrame> = {}) => {
    const frame: InputFrame = { seq: ++seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false,
      fire: false, ads: false, lean: 0, clientTime: sim.snapshot().time, ...extras };
    sim.input('a', frame);
    // Like the client: the frame is predicted first (moveActor), then its round, ahead of the host.
    const mine = view(), now = sim.snapshot().time + 1 / 60;
    moveActor(mine, frame, w, 1 / 60, 1, config.mode);
    const shot = predictor.tick(mine, frame, now, now, match, w, []);
    if (shot) local.push(shot);
    sim.step(1 / 60);
    for (const event of sim.drainEvents() as GameEvent[]) if (event.type === 'shot') host.push(event);
    predictor.sync(view(), sim.snapshot().time);
  };
  const click = () => {
    const id = ++action, time = sim.snapshot().time;
    sim.action('a', { type: 'trigger', id, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: time });
    const shot = predictor.press(view(), id, 0, 0, 0, time, time, match, w, []);
    if (shot) local.push(shot);
  };
  const swap = (slot: number) => sim.action('a', { type: 'slot', id: ++action, slot });
  return { sim, actor, predictor, tick, click, swap, host, local };
}

describe('own-shot prediction', () => {
  it('predicts the same rounds, in the same order and direction, as the host fires for a held automatic', () => {
    const { tick, host, local } = rig('predict-auto', ['m4']);
    for (let i = 0; i < 90; i++) tick({ fire: true });
    expect(local.length).toBeGreaterThan(10);
    expect(Math.abs(local.length - host.length)).toBeLessThanOrEqual(1);
    for (let i = 0; i < Math.min(local.length, host.length); i++) {
      expect(local[i].seq).toBe(host[i].seq);
      // Same seeded pellet: both rounds strike the wall at nearly the same point.
      expect(Math.hypot(local[i].end.x - host[i].end.x, local[i].end.y - host[i].end.y)).toBeLessThan(.25);
      expect(local[i].surface).toBe('wood');
    }
  });

  it('predicts a click at once and nothing the host refuses: draw, sprint, dry magazine', () => {
    const { tick, click, swap, host, local, actor } = rig('predict-gates', ['m4', 'pistol']);
    click(); tick();
    expect(local.map(s => s.weapon)).toEqual(['m4']);
    expect(host.map(s => s.weapon)).toEqual(['m4']);
    swap(1); tick();
    click(); tick();
    expect(local).toHaveLength(1); expect(host).toHaveLength(1);
    for (let i = 0; i < Math.ceil(HANDLING.pistol.draw * 60); i++) tick();
    click(); tick();
    expect(local.map(s => s.weapon)).toEqual(['m4', 'pistol']);
    expect(host.map(s => s.weapon)).toEqual(['m4', 'pistol']);
    // Sprinting: the press waits on the host, so the client must not show it early.
    for (let i = 0; i < 30; i++) tick({ sprint: true, moveZ: 1 });
    click();
    expect(local).toHaveLength(2);
    // ...and shows it on the same tick the host fires it, once the gun is up.
    for (let i = 0; i < 30; i++) tick({ moveZ: 1 });
    expect(local).toHaveLength(3); expect(host).toHaveLength(3);
    expect(local[2].seq).toBe(host[2].seq);
    // A dry gun shows nothing.
    actor.weapons[actor.slot].ammo = 0; tick();
    const before = local.length;
    click(); tick();
    expect(local).toHaveLength(before);
  });

  it('skips each host event it already showed exactly once', () => {
    const { tick, predictor, host, local } = rig('predict-consume', ['smg']);
    for (let i = 0; i < 30; i++) tick({ fire: true });
    const shown = new Set(local.map(s => s.seq));
    let skipped = 0;
    for (const event of host) if (predictor.consume(event)) { skipped++; expect(shown.has(event.seq!)).toBe(true); }
    expect(skipped).toBeGreaterThanOrEqual(host.length - 1);
    for (const event of host) expect(predictor.consume(event)).toBe(false);
  });
});
