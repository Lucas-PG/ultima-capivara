import { PROTOCOL_VERSION, WORLD_VERSION, type ActorState, type WorldSnapshot } from '../shared/types';
import { WEAPONS } from '../shared/weapons';

export const MAX_CONTROL_BYTES = 512_000;
export const MAX_FRAME_BYTES = 128_000;
export const MAX_COMPRESSED_FRAME_BYTES = 64_000;
const q = (n: number, scale = 100) => Math.round(n * scale) / scale;
const qi = (n: number, scale = 100) => Math.round(n * scale);
const stages = ['plane', 'falling', 'parachute', 'ground'] as const;
const items = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'] as const;

export function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 16_384;
  if (value === null || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length <= 10_000 && value.every(v => finiteTree(v, depth + 1));
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length <= 1000 && entries.every(([k, v]) => k.length <= 100 && finiteTree(v, depth + 1));
  }
  return false;
}

export function plainTextTree(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (typeof value === 'string') return value.length <= 200 && !/[<>\x00-\x1f\x7f]/.test(value);
  if (Array.isArray(value)) return value.every(v => plainTextTree(v, depth + 1));
  if (value && typeof value === 'object') return Object.values(value).every(v => plainTextTree(v, depth + 1));
  return true;
}

export function parseWire(data: unknown, limit = MAX_CONTROL_BYTES): Record<string, unknown> | null {
  let value: unknown = data;
  try { if (typeof data === 'string') { if (data.length > limit) return null; value = JSON.parse(data); } }
  catch { return null; }
  if (!value || Array.isArray(value) || typeof value !== 'object' || !finiteTree(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.v !== PROTOCOL_VERSION || message.w !== WORLD_VERSION || typeof message.t !== 'string') return null;
  if (JSON.stringify(message).length > limit) return null;
  return message;
}

export function packet(t: string, data: Record<string, unknown> = {}) { return { v: PROTOCOL_VERSION, w: WORLD_VERSION, t, ...data }; }

export async function encodeFastFrame(wire: string): Promise<Uint8Array | string | null> {
  const bytes = new TextEncoder().encode(wire);
  if (bytes.byteLength > MAX_FRAME_BYTES) return null;
  if (typeof CompressionStream !== 'function') return wire;
  try {
    const compressed = new Uint8Array(await new Response(
      new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    return compressed.byteLength <= MAX_COMPRESSED_FRAME_BYTES ? compressed : wire;
  } catch { return wire; }
}

export async function decodeFastFrame(raw: unknown): Promise<Record<string, unknown> | null> {
  if (typeof raw === 'string') {
    const message = parseWire(raw, MAX_FRAME_BYTES);
    return message?.t === 'frame' ? message : null;
  }
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) :
    ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) : null;
  if (!bytes || bytes.byteLength > MAX_COMPRESSED_FRAME_BYTES || typeof DecompressionStream !== 'function') return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const input = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    input.set(bytes);
    const reader = new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_FRAME_BYTES) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const decoded = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { decoded.set(chunk, offset); offset += chunk.byteLength; }
    const message = parseWire(new TextDecoder('utf-8', { fatal: true }).decode(decoded), MAX_FRAME_BYTES);
    return message?.t === 'frame' ? message : null;
  } catch { return null; }
}

export function worldPart(snapshot: WorldSnapshot) {
  return {
    config: snapshot.config, loot: snapshot.loot, openedChests: snapshot.openedChests, results: snapshot.results,
    actors: snapshot.actors.map(a => ({ id: a.id, name: a.name, color: a.color, bot: a.bot })),
  };
}

export function gearPart(snapshot: WorldSnapshot) {
  return snapshot.actors.map(a => ({ id: a.id, weapons: a.weapons.map(w => ({ id: w.id, rarity: w.rarity })), consumables: a.consumables }));
}

// The fixed-order tuple keeps fast frames small. Names, loot and weapon identities travel reliably on change.
export function actorFrame(a: ActorState, index: number): number[] {
  const flags = (a.connected ? 1 : 0) | (a.alive ? 2 : 0) | (a.grounded ? 4 : 0) |
    (a.crouch ? 8 : 0) | (a.sprint ? 16 : 0) | (a.ads ? 32 : 0);
  return [index, qi(a.pos.x), qi(a.pos.y), qi(a.pos.z), qi(a.velocity.x), qi(a.velocity.y), qi(a.velocity.z),
    qi(a.yaw, 1000), qi(a.pitch, 1000), qi(a.lean), qi(a.hp), qi(a.armor), qi(a.helmet), flags,
    stages.indexOf(a.stage), a.kills, a.deaths, qi(a.damage), a.slot, qi(a.reloadUntil), qi(a.useUntil),
    a.using ? items.indexOf(a.using) : -1, qi(a.respawnAt), qi(a.protectionUntil), a.lastInput, qi(a.shotHeat),
    ...a.weapons.flatMap(w => [w.ammo, w.reserve])];
}

export function fastPart(snapshot: WorldSnapshot) {
  return { matchId: snapshot.matchId, tick: snapshot.tick, time: q(snapshot.time, 1000), phase: snapshot.phase,
    countdown: q(snapshot.countdown), remaining: q(snapshot.remaining), zone: snapshot.zone,
    plane: snapshot.plane, actors: snapshot.actors.map(actorFrame) };
}

export function rebuildFrame(fast: any, world: any, gear: any): WorldSnapshot | null {
  if (!fast || !world || !Array.isArray(fast.actors) || !Array.isArray(world.actors) || !Array.isArray(gear)) return null;
  if (fast.actors.length !== world.actors.length || gear.length !== world.actors.length) return null;
  if (typeof fast.matchId !== 'string' || !/^[a-f0-9]{48}$/.test(fast.matchId) ||
    !Number.isSafeInteger(fast.tick) || fast.tick < 0 || !Number.isFinite(fast.time) ||
    !['lobby', 'countdown', 'playing', 'results'].includes(fast.phase) ||
    !Number.isFinite(fast.countdown) || !Number.isFinite(fast.remaining) ||
    !fast.zone || typeof fast.zone !== 'object' || typeof fast.zone.shrinking !== 'boolean' ||
    !['x', 'z', 'radius', 'nextRadius', 'nextX', 'nextZ', 'phase', 'timeLeft', 'damage'].every(k => Number.isFinite(fast.zone[k])) ||
    !fast.plane || !['x', 'y', 'z'].every(k => Number.isFinite(fast.plane[k])) ||
    !world.config || !['battle-royale', 'deathmatch'].includes(world.config.mode) ||
    !Number.isInteger(world.config.capacity) || world.config.capacity < 1 || world.config.capacity > 16 ||
    !plainTextTree(world) || !plainTextTree(gear)) return null;
  const actors: ActorState[] = [];
  for (const tuple of fast.actors) {
    if (!Array.isArray(tuple) || !tuple.every(Number.isFinite)) return null;
    const [index, px, py, pz, vx, vy, vz, yaw, pitch, lean, hp, armor, helmet, flags, stage, kills, deaths,
      damage, slot, reloadUntil, useUntil, using, respawnAt, protectionUntil, lastInput, shotHeat] = tuple;
    if (!Number.isSafeInteger(index) || index !== actors.length) return null;
    const profile = world.actors[index], kit = gear[index];
    if (!profile || !kit || profile.id !== kit.id || !stages[stage] || (using !== -1 && !items[using])) return null;
    if (typeof profile.name !== 'string' || profile.name.length > 28 || /[<>\x00-\x1f]/.test(profile.name) ||
      typeof profile.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(profile.color) ||
      typeof profile.bot !== 'boolean' || !Array.isArray(kit.weapons) || kit.weapons.length < 1 || kit.weapons.length > 4 ||
      tuple.length !== 26 + kit.weapons.length * 2 ||
      !kit.weapons.every((w: any) => w && typeof w.id === 'string' && Object.hasOwn(WEAPONS, w.id) &&
        Number.isSafeInteger(w.rarity) && w.rarity >= 0 && w.rarity <= 3) ||
      !kit.consumables || typeof kit.consumables !== 'object' || !Number.isInteger(flags) || flags < 0 || flags > 63 ||
      !Number.isInteger(stage) || !Number.isInteger(using) || hp < 0 || hp > 100_000 || armor < 0 || armor > 100_000 ||
      helmet < 0 || helmet > 100_000 || Math.max(Math.abs(px), Math.abs(py), Math.abs(pz)) > 100_000 ||
      !Number.isSafeInteger(slot) || slot < 0 || slot >= kit.weapons.length ||
      ![kills, deaths, lastInput, shotHeat].every(n => Number.isSafeInteger(n) && n >= 0) || shotHeat > 120 ||
      !kit.weapons.every((w: any, i: number) => Number.isSafeInteger(tuple[26 + i * 2]) &&
        tuple[26 + i * 2] >= 0 && tuple[26 + i * 2] <= WEAPONS[w.id as keyof typeof WEAPONS].magazine &&
        Number.isSafeInteger(tuple[27 + i * 2]) && tuple[27 + i * 2] >= 0 && tuple[27 + i * 2] <= 10_000)) return null;
    const weapons = kit.weapons.map((w: any, i: number) => ({ id: w.id, rarity: w.rarity,
      ammo: tuple[26 + i * 2], reserve: tuple[27 + i * 2] }));
    actors.push({ ...profile, pos: { x: px / 100, y: py / 100, z: pz / 100 },
      velocity: { x: vx / 100, y: vy / 100, z: vz / 100 }, yaw: yaw / 1000, pitch: pitch / 1000, lean: lean / 100,
      hp: hp / 100, armor: armor / 100, helmet: helmet / 100,
      connected: !!(flags & 1), alive: !!(flags & 2), grounded: !!(flags & 4),
      crouch: !!(flags & 8), sprint: !!(flags & 16), ads: !!(flags & 32), stage: stages[stage],
      kills, deaths, damage: damage / 100, slot, weapons, consumables: kit.consumables,
      reloadUntil: reloadUntil / 100, useUntil: useUntil / 100, using: using === -1 ? null : items[using],
      respawnAt: respawnAt / 100, protectionUntil: protectionUntil / 100, lastInput, shotHeat: shotHeat / 100 });
  }
  const snapshot = { protocol: PROTOCOL_VERSION, world: WORLD_VERSION, ...fast, config: world.config,
    loot: world.loot, openedChests: world.openedChests, results: world.results, actors } as WorldSnapshot;
  return finiteTree(snapshot) && snapshot.actors.length <= 64 && Array.isArray(snapshot.loot) &&
    snapshot.loot.length <= 3000 && Array.isArray(snapshot.openedChests) &&
    Array.isArray(snapshot.results) && snapshot.results.every(r => typeof r.name === 'string' &&
      r.name.length <= 28 && !/[<>\x00-\x1f]/.test(r.name) && /^#[0-9a-fA-F]{6}$/.test(r.color)) ? snapshot : null;
}
