import { describe, expect, it } from 'vitest';
import { RemoteInterpolation } from '../src/network/interpolation';
import { DEFAULT_CONFIG, PROTOCOL_VERSION, WORLD_VERSION, type ActorState, type WorldSnapshot } from '../src/shared/types';

const actor: ActorState = {
  id: 'remote', name: 'Capivara', color: '#1fb5a8', bot: false, connected: true,
  pos: { x: 0, y: 0, z: 0 }, velocity: { x: 4, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
  hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false,
  stage: 'ground', kills: 0, deaths: 0, damage: 0, weapons: [{ id: 'pistol', ammo: 12, reserve: 36, rarity: 0 }],
  slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }, reloadUntil: 0,
  useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, shotHeat: 0, swimming: false, wetUntil: 0,
  emote: null, emoteUntil: 0, weaponLevel: 0, soaking: false, bounceSeq: 0, bounceProtected: false,
};
function snapshot(time: number, patch: Partial<ActorState> = {}): WorldSnapshot {
  return { protocol: PROTOCOL_VERSION, world: WORLD_VERSION, matchId: 'a'.repeat(48), tick: Math.round(time * 60), time,
    phase: 'playing', config: DEFAULT_CONFIG, countdown: 0, remaining: 300, actors: [
      { ...actor, pos: { x: time * 4, y: 0, z: 0 }, ...patch }, { ...actor, id: 'local' }],
    loot: [], openedChests: [], results: [], plane: { x: 0, y: 30, z: 0 },
    zone: { x: 0, z: 0, radius: 100, nextRadius: 90, nextX: 0, nextZ: 0, phase: 1, shrinking: false, timeLeft: 60, damage: 1 } };
}

describe('remote interpolation', () => {
  it('interpolates position, pitch and shortest-path yaw without touching local state', () => {
    const buffer = new RemoteInterpolation();
    const first = snapshot(0, { yaw: Math.PI - .1, pitch: -.4 });
    buffer.push(first, 'local', 0);
    buffer.push(snapshot(.05, { yaw: -Math.PI + .1, pitch: .4 }), 'local', 50);
    const poses = buffer.sample(125);
    expect(poses.get('remote')!.pos.x).toBeCloseTo(.1);
    expect(poses.get('remote')!.yaw).toBeCloseTo(Math.PI);
    expect(poses.get('remote')!.pitch).toBeCloseTo(0);
    expect(poses.has('local')).toBe(false);
    expect(first.actors[0].pos.x).toBe(0);
  });

  it('accepts shuffled and duplicate samples without reversing playback', () => {
    const buffer = new RemoteInterpolation();
    buffer.push(snapshot(0), 'local', 0);
    buffer.push(snapshot(.1), 'local', 100);
    buffer.push(snapshot(.05), 'local', 110);
    buffer.push(snapshot(.05, { pos: { x: 50, y: 0, z: 0 } }), 'local', 111);
    let before = -Infinity;
    for (let now = 120; now <= 190; now += 10) {
      const x = buffer.sample(now).get('remote')!.pos.x;
      expect(x).toBeGreaterThanOrEqual(before);
      expect(x).toBeCloseTo(buffer.time! * 4);
      before = x;
    }
  });

  it('extrapolates no more than 100 ms, then holds until new samples arrive', () => {
    const buffer = new RemoteInterpolation();
    buffer.push(snapshot(1), 'local', 1000);
    expect(buffer.sample(1150).get('remote')!.pos.x).toBeCloseTo(4.2);
    expect(buffer.sample(1300).get('remote')!.pos.x).toBeCloseTo(4.4);
    expect(buffer.sample(10000).get('remote')!.pos.x).toBeCloseTo(4.4);
  });

  it('recovers from a long gap smoothly without carrying seconds of stale playback', () => {
    const buffer = new RemoteInterpolation();
    buffer.push(snapshot(0), 'local', 0); buffer.sample(0);
    const held = buffer.sample(1000).get('remote')!.pos.x;
    expect(held).toBeCloseTo(.4);
    buffer.push(snapshot(1), 'local', 1000);
    expect(buffer.sample(1000).get('remote')!.pos.x).toBeCloseTo(held);
    const middle = buffer.sample(1050).get('remote')!.pos.x;
    expect(middle).toBeGreaterThan(held); expect(middle).toBeLessThan(3.6);
    buffer.push(snapshot(1.1), 'local', 1100);
    expect(buffer.sample(1100).get('remote')!.pos.x).toBeGreaterThan(3.5);
    expect(buffer.time).toBeGreaterThan(.9);
  });

  it('snaps across respawns, lost death snapshots, and teleports, never reintroducing an old life', () => {
    for (const patch of [{ alive: false, deaths: 1 }, { deaths: 1 }, {}]) {
      const buffer = new RemoteInterpolation();
      buffer.push(snapshot(0), 'local', 0); buffer.sample(0);
      buffer.push(snapshot(.1, { ...patch, pos: { x: 40, y: 2, z: 0 } }), 'local', 100);
      expect(buffer.sample(100).get('remote')!.pos.x).toBe(40);
      buffer.push(snapshot(.05), 'local', 110);
      expect(buffer.sample(110).get('remote')!.pos.x).toBe(40);
    }
    const buffer = new RemoteInterpolation();
    buffer.push(snapshot(0, { alive: false, deaths: 1 }), 'local', 0);
    buffer.push(snapshot(.05, { alive: true, deaths: 1 }), 'local', 50);
    expect(buffer.sample(50).get('remote')!.alive).toBe(true);
    expect(buffer.sample(50).get('remote')!.pos.x).toBe(.2);
  });

  it('clears removed actors and match history and bounds adaptive delay', () => {
    const buffer = new RemoteInterpolation();
    buffer.push(snapshot(0), 'local', 0);
    for (let i = 1; i <= 30; i++) buffer.push(snapshot(i * .05), 'local', i * 200);
    expect(buffer.delay).toBeGreaterThan(.1); expect(buffer.delay).toBeLessThanOrEqual(.2);
    buffer.push({ ...snapshot(2), actors: [] }, 'local', 6100);
    expect(buffer.sample(6100).size).toBe(0);
    buffer.push({ ...snapshot(0), matchId: 'b'.repeat(48) }, 'local', 6200);
    expect(buffer.sample(6200).get('remote')!.pos.x).toBe(0);
    buffer.reset(); expect(buffer.sample(6300).size).toBe(0);
  });

  it('reduces velocity jitter under 20 Hz delivery with delay, loss and reordering', () => {
    const buffer = new RemoteInterpolation();
    const packets = Array.from({ length: 200 }, (_, i) => ({ time: i * .05,
      arrival: i * 50 + 40 + [0, 18, 4, 55, 8, 30, 2, 12][i % 8] }))
      .filter((_, i) => i % 17 !== 9).sort((a, b) => a.arrival - b.arrival);
    let packet = 0, latestTick = -1, target = 0, old = 0, previousOld = 0, previousNew = 0;
    const beforeVelocity: number[] = [], afterVelocity: number[] = [], beforeError: number[] = [], afterError: number[] = [];
    for (let frame = 0; frame < 600; frame++) {
      const now = frame * 1000 / 60;
      while (packet < packets.length && packets[packet].arrival <= now) {
        const p = packets[packet++], s = snapshot(p.time);
        // This is the existing transport contract: late world frames are dropped.
        if (s.tick <= latestTick) continue;
        latestTick = s.tick; target = p.time * 4; buffer.push(s, 'local', p.arrival);
      }
      old += (target - old) * 14 / 60;
      const pose = buffer.sample(now).get('remote');
      if (!pose) continue;
      if (frame > 120) {
        beforeVelocity.push((old - previousOld) * 60 - 4); afterVelocity.push((pose.pos.x - previousNew) * 60 - 4);
        // Both errors use the same intended delayed trajectory, not current time.
        const reference = (now / 1000 - .04 - .1) * 4;
        beforeError.push(old - reference); afterError.push(pose.pos.x - reference);
      }
      previousOld = old; previousNew = pose.pos.x;
    }
    const rms = (values: number[]) => Math.sqrt(values.reduce((sum, n) => sum + n * n, 0) / values.length);
    const metrics = { beforePositionRmsM: rms(beforeError), afterPositionRmsM: rms(afterError),
      beforeVelocityJitterRmsMps: rms(beforeVelocity), afterVelocityJitterRmsMps: rms(afterVelocity), delayMs: buffer.delay * 1000 };
    console.log('Interpolation evidence:', JSON.stringify(metrics));
    expect(metrics.afterVelocityJitterRmsMps).toBeLessThan(metrics.beforeVelocityJitterRmsMps * .5);
    expect(metrics.afterPositionRmsM).toBeLessThan(.12);
  });
});
