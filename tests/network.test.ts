import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { DEFAULT_CONFIG, PLAYER_COLORS, PROTOCOL_VERSION, WORLD_VERSION, type ActorState, type WorldSnapshot } from '../src/shared/types';
import { decodeFastFrame, encodeFastFrame, fastPart, gearPart, MAX_COMPRESSED_FRAME_BYTES, MAX_FRAME_BYTES, packet, parseWire, rebuildFrame, worldPart } from '../src/network/codec';
import { RoomSession, validAction, validConfig, validInput } from '../src/network/session';

const actor: ActorState = {
  id: 'p-1', name: 'Capivara', color: PLAYER_COLORS[0], bot: false, connected: true,
  pos: { x: 12.345, y: 0, z: -8.765 }, velocity: { x: .1, y: 0, z: -.2 }, yaw: 1.23456,
  pitch: .2, lean: 0, hp: 100, armor: 25, helmet: 10, alive: true, grounded: true,
  crouch: false, sprint: true, ads: false, stage: 'ground', kills: 0, deaths: 0, damage: 0,
  weapons: [{ id: 'pistol', ammo: 12, reserve: 36, rarity: 0 }], slot: 0,
  consumables: { bandage: 1, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }, reloadUntil: 0,
  useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 4, shotHeat: .32, swimming: false, wetUntil: 0,
  emote: null, emoteUntil: 0, weaponLevel: 0,
};
const snapshot: WorldSnapshot = {
  protocol: PROTOCOL_VERSION, world: WORLD_VERSION, matchId: 'a'.repeat(48), tick: 5, time: 1.2,
  phase: 'playing', config: DEFAULT_CONFIG, countdown: 0, remaining: 478,
  actors: [actor], loot: [], openedChests: [],
  zone: { x: 0, z: 0, radius: 100, nextRadius: 90, nextX: 0, nextZ: 0,
    phase: 1, shrinking: false, timeLeft: 60, damage: 1 }, results: [], plane: { x: 0, y: 30, z: 0 },
};

describe('network protocol', () => {
  it('rebuilds a playable snapshot from reliable world/gear and compact motion', () => {
    const restored = rebuildFrame(fastPart(snapshot), worldPart(snapshot), gearPart(snapshot));
    expect(restored?.actors[0].pos).toEqual({ x: 12.35, y: 0, z: -8.76 });
    expect(restored?.actors[0].velocity).toEqual({ x: .1, y: 0, z: -.2 });
    expect(restored?.actors[0].weapons).toEqual(actor.weapons);
    expect(restored?.actors[0].consumables).toEqual(actor.consumables);
    expect(restored?.actors[0].shotHeat).toBe(.32);
    expect(restored?.loot).toEqual(snapshot.loot);
    expect(restored?.phase).toBe('playing');
  });

  it('carries chest drops (with their origin) through the reliable world part', () => {
    const drop = { id: 'drop-1', kind: 'weapon' as const, weapon: 'm4' as const, x: 1, y: 2, z: 3, active: true, rarity: 2, respawnAt: 0,
      from: { x: 0, y: 2.6, z: 3 }, spawnedAt: 12.5 };
    const withDrop = { ...snapshot, loot: [drop] };
    const world = JSON.parse(JSON.stringify(worldPart(withDrop)));
    const restored = rebuildFrame(fastPart(withDrop), world, gearPart(withDrop));
    expect(restored?.loot).toEqual([drop]);
  });

  it('keeps ammo changes out of reliable gear and rebuilds each weapon slot from fast frames', () => {
    const weapons: ActorState['weapons'] = [
      { id: 'smg', ammo: 25, reserve: 75, rarity: 0 },
      { id: 'shotgun', ammo: 2, reserve: 12, rarity: 2 },
      { id: 'machete', ammo: 0, reserve: 0, rarity: 0 },
    ];
    const before = { ...snapshot, actors: [{ ...actor, weapons, slot: 1 }] };
    const after = { ...snapshot, actors: [{ ...actor, weapons: weapons.map((w, i) =>
      i === 0 ? { ...w, ammo: 24, reserve: 74 } : i === 1 ? { ...w, ammo: 3, reserve: 11 } : w), slot: 1 }] };
    const baseline = gearPart(before);
    expect(gearPart(after)).toEqual(baseline);
    expect(JSON.stringify(fastPart(after))).not.toBe(JSON.stringify(fastPart(before)));
    expect(rebuildFrame(fastPart(after), worldPart(before), baseline)?.actors[0].weapons).toEqual(after.actors[0].weapons);
  });

  it('bounds combined traffic for 21 actors and 15 guests at 20 Hz', () => {
    const many = { ...snapshot, actors: Array.from({ length: 21 }, (_, n) => ({ ...actor, id: `p-${String(n).padStart(12, '0')}`,
      weapons: [{ id: 'smg' as const, ammo: 19, reserve: 68, rarity: 0 },
        { id: 'pistol' as const, ammo: 12, reserve: 31, rarity: 0 },
        { id: 'machete' as const, ammo: 0, reserve: 0, rarity: 0 }],
      lastInput: 18_000, kills: 3, deaths: 2, damage: 300 })) };
    const wire = JSON.stringify(packet('frame', { wr: 1, gr: 1, data: fastPart(many) }));
    const baseline = JSON.stringify(packet('gear', { rev: 1, data: gearPart(many) })) +
      JSON.stringify(packet('world', { rev: 1, data: worldPart(many) }));
    expect(wire.length).toBeLessThan(MAX_FRAME_BYTES);
    // One baseline each minute, plus fast frames; host outbound, before transport overhead.
    expect((wire.length * 20 + baseline.length / 60) * 15 * 8).toBeLessThan(8_000_000);
  });

  it('round trips compressed fast frames and supports plain-string fallback', async () => {
    const frame = packet('frame', { wr: 1, gr: 1, data: fastPart(snapshot) });
    const wire = JSON.stringify(frame);
    const compressed = await encodeFastFrame(wire);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect((compressed as Uint8Array).byteLength).toBeLessThan(wire.length);
    expect(await decodeFastFrame(compressed)).toEqual(frame);
    const bytes = (compressed as Uint8Array).slice().buffer;
    expect(await decodeFastFrame(bytes)).toEqual(frame);
    vi.stubGlobal('CompressionStream', undefined);
    try { expect(await encodeFastFrame(wire)).toBe(wire); }
    finally { vi.unstubAllGlobals(); }
    expect(await decodeFastFrame(wire)).toEqual(frame);
  });

  it('rejects corrupt, truncated, or oversized compressed frames', async () => {
    const wire = JSON.stringify(packet('frame', { wr: 1, gr: 1, data: fastPart(snapshot) }));
    const compressed = await encodeFastFrame(wire) as Uint8Array;
    expect(await decodeFastFrame(compressed.slice(0, -4))).toBeNull();
    expect(await decodeFastFrame(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(await decodeFastFrame(new Uint8Array(MAX_COMPRESSED_FRAME_BYTES + 1))).toBeNull();
    expect(await encodeFastFrame('x'.repeat(MAX_FRAME_BYTES + 1))).toBeNull();
    const bomb = JSON.stringify(packet('frame', { data: 'x'.repeat(MAX_FRAME_BYTES) }));
    const compressedBomb = await new Response(new Blob([bomb]).stream()
      .pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    expect(await decodeFastFrame(compressedBomb)).toBeNull();
  });

  it('compresses once for ready guests and drops an encoded frame after the match ends', async () => {
    const session = new RoomSession({ room: () => {}, start: () => {}, input: () => {}, action: () => {},
      player: () => {}, snapshot: () => {}, events: () => {}, error: () => {}, closed: () => {} });
    const runtime = session as any;
    runtime.roomValue = { isHost: true, phase: 'playing' };
    runtime.matchId = snapshot.matchId;
    const sent: ArrayBuffer[][] = [[], []];
    const plain: string[] = [];
    for (let i = 0; i < 2; i++) {
      const conn = { open: true, send: () => {} };
      const game = { readyState: 'open', bufferedAmount: 0, send: (data: ArrayBuffer) => sent[i].push(data) };
      runtime.guests.set(`guest-${i}`, { conn, game, gameReady: true, gameCompression: true });
    }
    runtime.guests.set('legacy', { conn: { open: true, send: () => {} },
      game: { readyState: 'open', bufferedAmount: 0, send: (data: string) => plain.push(data) },
      gameReady: true, gameCompression: false });
    session.publish(snapshot, []);
    await vi.waitFor(() => expect(sent[0]).toHaveLength(1));
    expect(sent[1][0]).toBe(sent[0][0]);
    expect((await decodeFastFrame(sent[0][0]))?.t).toBe('frame');
    expect(plain).toHaveLength(1);
    expect((await decodeFastFrame(plain[0]))?.t).toBe('frame');
    session.publish({ ...snapshot, tick: snapshot.tick + 1 }, []);
    runtime.matchId = '';
    runtime.current = null;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(sent[0]).toHaveLength(1);
  });

  it('rejects inconsistent or invalid weapon counts in compact frames', () => {
    const fast = fastPart(snapshot), world = worldPart(snapshot), gear = gearPart(snapshot);
    const tampered = (change: (frame: ReturnType<typeof fastPart>, kit: ReturnType<typeof gearPart>) => void) => {
      const f = structuredClone(fast), g = structuredClone(gear);
      change(f, g);
      expect(rebuildFrame(f, world, g)).toBeNull();
    };
    tampered(f => { f.actors[0].pop(); });
    tampered(f => { f.actors[0][0] = 1; });
    tampered(f => { f.actors.pop(); });
    tampered(f => { f.actors[0][25] = 121; });
    tampered(f => { f.actors[0][26] = -1; });
    tampered(f => { f.actors[0][26] = 1.5; });
    tampered(f => { f.actors[0][27] = -2; });
    tampered(f => { f.actors[0][27] = 1.5; });
    tampered(f => { f.actors[0][27] = 100; });
    tampered(f => { f.actors[0][28] = -1; });
    tampered(f => { f.actors[0][29] = -1; });
    tampered(f => { f.actors[0][29] = 1.5; });
    tampered(f => { f.actors[0][29] = 8; });
    tampered(f => { f.actors[0][30] = -1; });
    tampered(f => { f.actors[0][30] = 1.5; });
    tampered(f => { f.actors[0][30] = 100; });
    tampered(f => { f.actors[0][31] = 10_001; });
    tampered((_, g) => { g[0].weapons[0].id = 'unknown' as any; });
  });

  it('rejects mismatched or malformed packets before using them', () => {
    expect(parseWire(JSON.stringify(packet('input')))?.t).toBe('input');
    expect(parseWire(JSON.stringify({ ...packet('input'), v: PROTOCOL_VERSION + 1 }))).toBeNull();
    expect(parseWire(JSON.stringify({ ...packet('input'), w: 'other-world' }))).toBeNull();
    expect(parseWire('{broken')).toBeNull();
    expect(parseWire({ ...packet('input'), data: { x: Infinity } })).toBeNull();
  });

  it('bounds room settings, inputs and reliable actions', () => {
    expect(validConfig({ ...DEFAULT_CONFIG, capacity: 17 })).toBe(false);
    expect(validConfig(DEFAULT_CONFIG)).toBe(true);
    const input = { seq: 1, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, sprint: false, crouch: false,
      jump: false, fire: false, ads: false, lean: 0, clientTime: 0 };
    expect(validInput(input)).toBe(true);
    expect(validInput({ ...input, fire: true, firePressId: 4 })).toBe(true);
    expect(validInput({ ...input, fire: true, firePressId: -1 })).toBe(false);
    expect(validInput({ ...input, moveX: 100 })).toBe(false);
    expect(validInput({ ...input, yaw: Infinity })).toBe(false);
    expect(validAction({ type: 'slot', id: 2, slot: 2 })).toBe(true);
    expect(validAction({ type: 'slot', id: 2, slot: 20 })).toBe(false);
    expect(validAction({ type: 'interact', id: 2, target: 'x'.repeat(1000) })).toBe(false);
    const trigger = { type: 'trigger', id: 3, yaw: 1, pitch: .2, lean: -.5, ads: true, clientTime: 12 };
    expect(validAction(trigger)).toBe(true);
    expect(validAction({ ...trigger, id: 1.5 })).toBe(false);
    expect(validAction({ ...trigger, yaw: Infinity })).toBe(false);
    expect(validAction({ ...trigger, pitch: 2 })).toBe(false);
    expect(validAction({ ...trigger, lean: 2 })).toBe(false);
    expect(validAction({ ...trigger, ads: 'true' })).toBe(false);
    expect(validAction({ ...trigger, clientTime: NaN })).toBe(false);
  });
});

describe('connection recovery and latency', () => {
  function makeSession() {
    const callbacks = { room: vi.fn(), start: vi.fn(), input: vi.fn(), action: vi.fn(), player: vi.fn(),
      snapshot: vi.fn(), events: vi.fn(), error: vi.fn(), closed: vi.fn(), status: vi.fn() };
    const session = new RoomSession(callbacks);
    return { session, runtime: session as any, callbacks };
  }

  function connection() {
    const conn = Object.assign(new EventEmitter(), { open: true, peer: 'cap2-ABCDEF', send: vi.fn(), close: vi.fn() });
    conn.close.mockImplementation(() => { if (conn.open) { conn.open = false; conn.emit('close'); } });
    return conn;
  }

  it('waits for each guest to receive host closure, without closing a replacement room', async () => {
    vi.useFakeTimers();
    try {
      const { session, runtime } = makeSession();
      const oldPeer = { destroy: vi.fn() }, nextPeer = { destroy: vi.fn() };
      const one = connection(), two = connection();
      runtime.peer = oldPeer; runtime.roomValue = { isHost: true };
      runtime.guests.set('one', { conn: one }); runtime.guests.set('two', { conn: two });
      session.leave();
      expect(session.state).toBeNull();
      expect(one.send).toHaveBeenCalledWith(packet('closed', { reason: 'O anfitrião fechou a sala.' }));
      runtime.peer = nextPeer; runtime.roomValue = { isHost: true, code: 'NEWNEW' }; runtime.closing = false;
      await vi.advanceTimersByTimeAsync(600);
      // Delayed reliable delivery beyond the old 250 ms cutoff must remain possible.
      expect(one.open).toBe(true); expect(two.open).toBe(true); expect(oldPeer.destroy).not.toHaveBeenCalled();
      one.emit('data', packet('closed-ack'));
      expect(oldPeer.destroy).not.toHaveBeenCalled();
      two.close(); // Older guests close themselves on receipt without an explicit ack.
      expect(oldPeer.destroy).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(nextPeer.destroy).not.toHaveBeenCalled(); expect(session.state?.code).toBe('NEWNEW');
      expect(one.listenerCount('data')).toBe(0); expect(two.listenerCount('close')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('caps host close acknowledgment waits when a guest does not respond', async () => {
    vi.useFakeTimers();
    try {
      const { session, runtime } = makeSession();
      const peer = { destroy: vi.fn() }, conn = connection();
      runtime.peer = peer; runtime.roomValue = { isHost: true }; runtime.guests.set('guest', { conn });
      session.leave();
      await vi.advanceTimersByTimeAsync(999); expect(peer.destroy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); expect(peer.destroy).toHaveBeenCalledOnce();
      expect(conn.open).toBe(false); expect(conn.listenerCount('data')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it.each(['peer-unavailable', 'network'] as const)('probes after a lost closed packet and transport drop: %s', async errorType => {
    vi.useFakeTimers();
    try {
      const { session, runtime, callbacks } = makeSession();
      const connections: ReturnType<typeof connection>[] = [];
      const peer = Object.assign(new EventEmitter(), { destroyed: false, disconnected: false, destroy: vi.fn(),
        connect: vi.fn(() => { const conn = connection(); connections.push(conn); return conn; }) });
      runtime.peer = peer; runtime.watchGuestPeer(peer);
      const profile = { name: 'Guest', color: PLAYER_COLORS[0] };
      const room = { code: 'ABCDEF', hostId: 'host', myId: 'host', isHost: true, phase: 'playing', config: DEFAULT_CONFIG,
        players: [{ ...profile, id: 'host', ready: true, connected: true }, { ...profile, id: 'guest', ready: true, connected: true }] };
      const welcome = packet('welcome', { room, id: 'guest', token: 'a'.repeat(48), resumed: true });
      const joined = runtime.connectGuest('ABCDEF', profile);
      connections[0].emit('data', welcome); await joined;
      // No closed control packet arrives. The actual connection close starts recovery.
      connections[0].close();
      expect(session.connectionStatus).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(500); expect(peer.connect).toHaveBeenCalledTimes(2);
      peer.emit('error', Object.assign(new Error(errorType), { type: errorType }));
      await vi.advanceTimersByTimeAsync(0);
      if (errorType === 'peer-unavailable') {
        expect(session.state).toBeNull(); expect(session.connectionStatus).toBe('closed');
        expect(callbacks.closed).toHaveBeenCalledExactlyOnceWith('O anfitrião fechou a sala.');
        await vi.advanceTimersByTimeAsync(30_000); expect(peer.connect).toHaveBeenCalledTimes(2);
      } else {
        expect(session.state?.myId).toBe('guest'); expect(callbacks.closed).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000); expect(peer.connect).toHaveBeenCalledTimes(3);
        connections[2].emit('data', welcome); await vi.advanceTimersByTimeAsync(0);
        expect(session.connectionStatus).toBe('connected'); expect(session.state?.myId).toBe('guest');
        await vi.advanceTimersByTimeAsync(30_000); expect(callbacks.closed).not.toHaveBeenCalled();
        session.leave();
      }
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('measures each guest independently, ignores unsolicited pongs and shares the RTT table', () => {
    const { session, runtime } = makeSession();
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    try {
      runtime.roomValue = { hostId: 'host', isHost: true };
      const one = { conn: { open: true, send: vi.fn() }, profile: { id: 'one' }, pingAt: null };
      const two = { conn: { open: true, send: vi.fn() }, profile: { id: 'two' }, pingAt: null };
      runtime.guests.set('one', one); runtime.guests.set('two', two);
      runtime.pingGuests(); now.mockReturnValue(125);
      runtime.onHostControl(one.conn, packet('pong', { at: 99 }));
      expect(session.latencies).toEqual({});
      runtime.onHostControl(one.conn, packet('pong', { at: 100 })); now.mockReturnValue(180);
      runtime.onHostControl(two.conn, packet('pong', { at: 100 }));
      expect(session.latencies).toEqual({ host: 0, one: 25, two: 80 });
      expect(two.conn.send).toHaveBeenLastCalledWith(packet('latency', { data: { host: 0, one: 25, two: 80 } }));
      runtime.onHostControl(one.conn, packet('pong', { at: 100 }));
      expect(session.latencies.one).toBe(25);
    } finally { now.mockRestore(); }
  });

  it('reports a TURN route only from the selected ICE candidate pair', async () => {
    const { session, runtime } = makeSession();
    const stats = new Map([
      ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
      ['pair', { type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote' }],
      ['local', { type: 'local-candidate', candidateType: 'relay' }],
      ['remote', { type: 'remote-candidate', candidateType: 'host' }],
    ]);
    const conn = { open: true, peerConnection: { getStats: async () => stats } };
    runtime.hostConn = conn; await runtime.inspectRoute(conn);
    expect(session.connectionStatus).toBe('relay');
    stats.set('local', { type: 'local-candidate', candidateType: 'host' });
    await runtime.inspectRoute(conn); expect(session.connectionStatus).toBe('connected');
    runtime.reconnecting = true; stats.set('local', { type: 'local-candidate', candidateType: 'relay' });
    await runtime.inspectRoute(conn); expect(session.connectionStatus).toBe('connected');
  });

  it('settles a silent join after ten seconds with a retry message', async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = makeSession();
      const conn = { on: vi.fn(), close: vi.fn() };
      runtime.peer = { destroyed: false, connect: () => conn };
      const joined = runtime.connectGuest('ABCDEF', { name: 'Guest', color: PLAYER_COLORS[0] }).catch((error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await joined).toBe('A sala demorou a responder. Tente novamente.');
      expect(conn.close).toHaveBeenCalledOnce(); expect(runtime.joining).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('runs one recovery loop, stops at 30 seconds, and cleans state for another room', async () => {
    vi.useFakeTimers();
    try {
      const { session, runtime, callbacks } = makeSession();
      runtime.peer = { destroyed: false, disconnected: false, destroy: vi.fn() };
      runtime.roomValue = { isHost: false };
      runtime.connectGuest = vi.fn().mockRejectedValue(new Error('offline'));
      runtime.lastTick = 5000; runtime.worldRev = 20; runtime.gearRev = 8;
      runtime.scheduleReconnect('ABCDEF', { name: 'Guest', color: PLAYER_COLORS[0] });
      runtime.scheduleReconnect('ABCDEF', { name: 'Guest', color: PLAYER_COLORS[0] });
      expect(session.connectionStatus).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(2500); expect(runtime.connectGuest).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(27_500);
      expect(callbacks.closed).toHaveBeenCalledOnce(); expect(session.connectionStatus).toBe('closed');
      const attempts = runtime.connectGuest.mock.calls.length;
      await vi.advanceTimersByTimeAsync(40_000); expect(runtime.connectGuest).toHaveBeenCalledTimes(attempts);
      expect(runtime.retryTimer).toBeNull(); expect(runtime.heartbeat).toBeNull();
      expect(runtime.lastTick).toBe(-1); expect(runtime.worldRev).toBe(0); expect(runtime.gearRev).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('delivers hit feedback immediately even when no motion snapshot is available', () => {
    const { runtime, callbacks } = makeSession();
    const conn = { close: vi.fn() }; runtime.hostConn = conn; runtime.matchId = snapshot.matchId;
    const events = [{ type: 'damage', id: 1, actor: 'guest', target: 'host', amount: 25, head: false, pos: { x: 0, y: 0, z: 0 } }];
    runtime.onGuestControl(conn, packet('events', { matchId: snapshot.matchId, data: events }));
    expect(callbacks.events).toHaveBeenCalledWith(events);
    expect(callbacks.snapshot).not.toHaveBeenCalled();
  });
});
