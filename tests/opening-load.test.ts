import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpeningLoadGate, OPENING_LOAD_CAP_MS } from '../src/simulation/opening-load';
import { emptyInput } from '../src/shared/math';
import { BUY_SECONDS, ROUND_BREAK_SECONDS } from '../src/shared/round-modes';
import { PLAYER_COLORS, WORLD_VERSION, type PlayerProfile, type RoomConfig, type WorldSnapshot, type WorldSpec } from '../src/shared/types';

const matchId = 'a'.repeat(48), nextMatchId = 'b'.repeat(48);
const profile = (id: string): PlayerProfile => ({ id, name: id, color: PLAYER_COLORS[0], ready: true, connected: true });

describe('host-owned opening load gate', () => {
  it('requires the host and every current human, ignores stale/unknown acks, and excludes generated bots', () => {
    const gate = new OpeningLoadGate(matchId, [profile('host'), profile('guest')], 100);
    gate.loaded(matchId, 'host'); gate.loaded(nextMatchId, 'guest'); gate.loaded(matchId, 'bot-2');
    expect(gate.waiting(8_100)).toBe(true);
    gate.loaded(matchId, 'guest');
    expect(gate.waiting(8_100)).toBe(false);
  });

  it('removes a disconnected or expired blocker, while a reconnect must prepare again', () => {
    const gate = new OpeningLoadGate(matchId, [profile('host'), profile('guest')], 0);
    gate.loaded(matchId, 'guest');
    gate.player({ ...profile('guest'), connected: false }, 'disconnect');
    gate.loaded(matchId, 'guest'); // A stale ack from a closed connection cannot mark the reconnect ready.
    gate.player(profile('guest'), 'reconnect'); gate.loaded(matchId, 'host');
    expect(gate.waiting(1_000)).toBe(true);
    gate.player({ ...profile('guest'), connected: false }, 'expired');
    expect(gate.waiting(1_000)).toBe(false);
  });

  it('includes a late arrival before release and never restarts after release', () => {
    const gate = new OpeningLoadGate(matchId, [profile('host')], 0);
    gate.player(profile('late'), 'join'); gate.loaded(matchId, 'host');
    expect(gate.waiting(2_000)).toBe(true);
    gate.loaded(matchId, 'late'); expect(gate.waiting(2_000)).toBe(false);
    gate.player(profile('another'), 'join'); gate.player(profile('late'), 'reconnect');
    expect(gate.waiting(3_000)).toBe(false);
  });

  it('has one finite deadline that late joins, reconnects and duplicate acks cannot extend', () => {
    const gate = new OpeningLoadGate(matchId, [profile('host'), profile('stuck')], 500);
    for (const at of [1_000, 10_000, 29_000]) {
      gate.loaded(matchId, 'host'); gate.loaded(nextMatchId, 'stuck');
      gate.player({ ...profile('stuck'), connected: false }, 'disconnect');
      gate.player(profile('stuck'), 'reconnect'); gate.player(profile(`late-${at}`), 'join');
      expect(gate.waiting(at)).toBe(true);
    }
    expect(gate.waiting(500 + OPENING_LOAD_CAP_MS - 1)).toBe(true);
    expect(gate.waiting(500 + OPENING_LOAD_CAP_MS)).toBe(false);
    gate.player(profile('still-stuck'), 'join');
    expect(gate.waiting(500 + OPENING_LOAD_CAP_MS + 1)).toBe(false);
  });
});

const world: WorldSpec = { version: WORLD_VERSION, size: 260, colliders: [], objects: [], districts: [],
  spawns: [-35, -25, 25, 35].map(x => ({ x, y: 0, z: -20, yaw: 0, mode: 'deathmatch' })), loot: [], chests: [] };
const config: RoomConfig = { mode: 'squads', capacity: 4, teamSize: 2, bots: true, difficulty: 'normal', duration: 300 };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function workerFixture() {
  vi.resetModules(); vi.stubEnv('VITE_QA', '1');
  let now = 0, pulse = () => {};
  const snapshots: WorldSnapshot[] = [];
  const surface = { onmessage: null as null | ((event: { data: any }) => void), postMessage(message: any) {
    if (message.type === 'snapshot') snapshots.push(message.snapshot);
    if (message.type === 'error') throw new Error(message.message);
  } };
  vi.stubGlobal('self', surface);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setInterval').mockImplementation(handler => {
    pulse = handler as () => void;
    return 1 as unknown as ReturnType<typeof setInterval>;
  });
  await import('../src/simulation/host.worker');
  const send = (data: Record<string, unknown>) => surface.onmessage!({ data });
  const init = (id = matchId, matchConfig = config) => send({ type: 'init', world, config: matchConfig,
    players: [profile('host'), profile('guest')], matchId: id });
  const elapse = (milliseconds: number) => {
    const end = now + milliseconds;
    while (now + 10 <= end) { now += 10; pulse(); }
    if (now < end) { now = end; pulse(); }
  };
  const loaded = (id: string, match = matchId) => send({ type: 'match-loaded', matchId: match, id });
  const latest = () => snapshots.at(-1)!;
  return { init, send, elapse, loaded, latest, snapshots };
}

describe('real worker startup and round clocks', () => {
  it('keeps sending fresh snapshots without timer, movement or shot debt while a guest loads', async () => {
    const worker = await workerFixture(); worker.init();
    const initial = worker.latest(); worker.loaded('host');
    worker.send({ type: 'input', id: 'host', input: { ...emptyInput(), seq: 1, moveZ: 1, fire: true } });
    worker.elapse(8_000);
    const waiting = worker.latest();
    expect(waiting.tick).toBeGreaterThan(initial.tick);
    expect(waiting.time).toBe(0); expect(waiting.countdown).toBe(3);
    const bodyAndKit = ({ lastInput: _ack, ...state }: WorldSnapshot['actors'][number]) => state;
    expect(waiting.actors.map(bodyAndKit)).toEqual(initial.actors.map(bodyAndKit));
    expect(waiting.round).toEqual(initial.round);
    worker.loaded('guest'); worker.elapse(3_100);
    const buying = worker.latest();
    expect(buying.phase).toBe('playing'); expect(buying.round?.phase).toBe('buy');
    expect(buying.round!.endsAt - buying.time).toBeGreaterThan(BUY_SECONDS - .2);
    expect(buying.actors.every(actor => actor.shotSeq === 0)).toBe(true);
  });

  it('starts after the fixed stuck-client cap with a complete first buy window', async () => {
    const worker = await workerFixture(); worker.init(); worker.loaded('host');
    worker.elapse(OPENING_LOAD_CAP_MS - 100);
    expect(worker.latest().time).toBe(0);
    worker.loaded('guest', nextMatchId); worker.elapse(3_200);
    const buying = worker.latest();
    expect(buying.phase).toBe('playing'); expect(buying.round?.phase).toBe('buy');
    expect(buying.round!.endsAt - buying.time).toBeGreaterThan(BUY_SECONDS - .2);
  });

  it('unblocks a departing guest and transmits its disconnection while waiting', async () => {
    const worker = await workerFixture(); worker.init();
    worker.send({ type: 'player', profile: { ...profile('guest'), connected: false }, status: 'disconnect' });
    worker.elapse(1_000);
    expect(worker.latest().actors.find(actor => actor.id === 'guest')?.connected).toBe(false);
    expect(worker.latest().time).toBe(0);
    worker.loaded('host'); worker.elapse(3_100);
    expect(worker.latest().phase).toBe('playing');
  });

  it('includes a human arriving during loading and gives that guest a current actor snapshot', async () => {
    const worker = await workerFixture(); worker.init(); worker.loaded('host');
    worker.send({ type: 'player', profile: profile('late'), status: 'join' }); worker.loaded('guest'); worker.elapse(5_000);
    expect(worker.latest().time).toBe(0);
    expect(worker.latest().actors.find(actor => actor.id === 'late')).toMatchObject({ connected: true, bot: false });
    worker.loaded('late'); worker.elapse(3_100);
    expect(worker.latest().phase).toBe('playing');
  });

  it('resets readiness and the cap on rematch, discards stale acks, and tears down on stop', async () => {
    const worker = await workerFixture(); worker.init(); worker.loaded('host'); worker.loaded('guest'); worker.elapse(4_000);
    worker.init(nextMatchId); worker.loaded('host'); worker.loaded('guest'); worker.elapse(8_000);
    expect(worker.latest().matchId).toBe(nextMatchId); expect(worker.latest().time).toBe(0);
    worker.loaded('host', nextMatchId); worker.loaded('guest', nextMatchId); worker.elapse(3_100);
    expect(worker.latest().phase).toBe('playing');
    worker.send({ type: 'stop' }); const count = worker.snapshots.length;
    worker.elapse(OPENING_LOAD_CAP_MS + 1_000); expect(worker.snapshots).toHaveLength(count);
  });

  it('never adds a load wait to round two or changes legacy mode startup', async () => {
    const worker = await workerFixture(); worker.init(); worker.loaded('host'); worker.loaded('guest'); worker.elapse(15_200);
    expect(worker.latest().round?.phase).toBe('live');
    const attacker = worker.latest().actors.find(actor => actor.id === 'host')!;
    for (const actor of worker.latest().actors) if (actor.team !== attacker.team) {
      worker.send({ type: 'qa-damage', target: actor.id, attacker: attacker.id, amount: 1000, weapon: 'pistol' });
    }
    worker.elapse(100); expect(worker.latest().round?.phase).toBe('over');
    worker.elapse(ROUND_BREAK_SECONDS * 1000);
    const next = worker.latest();
    expect(next.round).toMatchObject({ number: 2, phase: 'buy' });
    expect(next.round!.endsAt - next.time).toBeGreaterThan(BUY_SECONDS - .2);
    worker.send({ type: 'player', profile: profile('late'), status: 'join' });
    worker.loaded('late', nextMatchId); worker.elapse(BUY_SECONDS * 1000 + 100);
    expect(worker.latest().round).toMatchObject({ number: 2, phase: 'live' });
    for (const mode of ['battle-royale', 'deathmatch', 'corrente'] as const) {
      worker.init(nextMatchId, { ...config, mode }); worker.elapse(3_100);
      expect(worker.latest().phase).toBe('playing'); expect(worker.latest().time).toBeGreaterThan(3);
    }
  });
});
