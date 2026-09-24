import { describe, expect, it, vi } from 'vitest';
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
  useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 4,
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
    expect(restored?.loot).toEqual(snapshot.loot);
    expect(restored?.phase).toBe('playing');
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
    tampered(f => { f.actors[0][25] = -1; });
    tampered(f => { f.actors[0][25] = 1.5; });
    tampered(f => { f.actors[0][25] = 100; });
    tampered(f => { f.actors[0][26] = 10_001; });
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
