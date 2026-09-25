// Dev-only VFX review harness (not part of the build): renders the real island
// with the real renderer and replays hand-made authoritative events at a fixed
// 60 Hz step, so effects can be captured frame by frame and compared.
import { GameRenderer } from '../../src/render/renderer';
import { Simulation } from '../../src/simulation';
import { createWorld } from '../../src/shared/world';
import { terrainHeight } from '../../src/shared/terrain';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { emptyInput } from '../../src/shared/math';
import { raycastWorld } from '../../src/shared/collision';
import { resolveImpact } from '../../src/simulation/surface';
import { WEAPONS } from '../../src/shared/weapons';
import type { ActorState, GameEvent, Settings, WeaponId, WorldSnapshot, ZoneState } from '../../src/shared/types';

type ActorSpec = { id: string; x: number; z: number; y?: number; yaw?: number; weapon?: WeaponId; color?: string; armor?: number; crouch?: boolean; alive?: boolean };
type SceneSpec = {
  x: number; z: number; y?: number; yaw: number; pitch: number; weapon?: WeaponId; ads?: boolean; mode?: 'battle-royale' | 'deathmatch';
  actors?: ActorSpec[]; zone?: Partial<ZoneState>; loot?: { id: string; rarity: number }[]; graphics?: Settings['graphics']; hp?: number; alive?: boolean; spectate?: string | null;
};
type EventSpec = { type: GameEvent['type']; [key: string]: unknown };

const world = createWorld();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const settings: Settings = structuredClone(DEFAULT_SETTINGS);
const fixture = new Simulation(world, { mode: 'battle-royale', capacity: 8, bots: false, difficulty: 'normal', duration: 480 },
  [{ id: 'practice', name: 'Capivara', color: '#1fb5a8', ready: true, connected: true }], 'vfx-review', 0x5eed);
const base = fixture.snapshot();
let renderer: GameRenderer | null = null, snapshot: WorldSnapshot | null = null, spec: SceneSpec | null = null, nextId = 1;
const input = emptyInput();

function actor(from: ActorState, a: ActorSpec): ActorState {
  const s = structuredClone(from), y = a.y ?? terrainHeight(a.x, a.z);
  Object.assign(s, { id: a.id, name: a.id, bot: true, color: a.color || '#ae825e', pos: { x: a.x, y, z: a.z }, yaw: a.yaw ?? 0, pitch: 0,
    stage: 'ground', grounded: true, alive: a.alive ?? true, armor: a.armor ?? 0, crouch: !!a.crouch, ads: false,
    weapons: [{ id: a.weapon || 'm4', ammo: 30, reserve: 90, rarity: 0 }], slot: 0 });
  return s;
}

function frame(dt: number) {
  if (!renderer || !snapshot || !spec) return;
  input.yaw = spec.yaw; input.pitch = spec.pitch; input.ads = !!spec.ads;
  renderer.update({ snapshot, playerId: 'practice', input, dt, playing: true, spectateId: spec.spectate ?? null });
}

const api = {
  async init(graphics: Settings['graphics'] = 'medium') {
    settings.graphics = graphics;
    renderer ||= new GameRenderer(canvas, world, settings);
    await renderer.warmup();
    return true;
  },
  async scene(next: SceneSpec) {
    spec = next;
    const s = structuredClone(base), me = s.actors[0];
    s.phase = 'playing'; s.time = 60; s.countdown = 0; s.config.mode = next.mode || 'battle-royale';
    s.zone = { ...s.zone, x: 0, z: 0, radius: 400, nextRadius: 400, ...next.zone };
    Object.assign(me, { pos: { x: next.x, y: next.y ?? terrainHeight(next.x, next.z), z: next.z }, velocity: { x: 0, y: 0, z: 0 }, stage: 'ground', grounded: true,
      yaw: next.yaw, pitch: next.pitch, ads: !!next.ads, hp: next.hp ?? 100, alive: next.alive ?? true,
      weapons: [{ id: next.weapon || 'm4', ammo: 30, reserve: 90, rarity: 0 }], slot: 0 });
    s.actors = [me, ...(next.actors || []).map(a => actor(me, a))];
    for (const l of next.loot || []) { const item = s.loot.find(x => x.id === l.id); if (item) item.rarity = l.rarity; }
    snapshot = s;
    await renderer?.prepareMatch(s);
    if (next.graphics && next.graphics !== settings.graphics) { settings.graphics = next.graphics; renderer?.setSettings(settings); }
    for (let i = 0; i < 40; i++) frame(1 / 60);
    return renderer?.stats;
  },
  // Updates one actor in place (e.g. to remove it after an elimination).
  loot(id: string, patch: Record<string, unknown>) { const l = snapshot?.loot.find(x => x.id === id); if (l) Object.assign(l, patch); },
  opened(id: string) { snapshot?.openedChests.push(id); },
  actor(id: string, patch: Partial<ActorState>) { const a = snapshot?.actors.find(a => a.id === id); if (a) Object.assign(a, patch); },
  event(e: EventSpec) { renderer?.event({ id: nextId++, ...e } as GameEvent); },
  step(frames: number) { for (let i = 0; i < frames; i++) frame(1 / 60); return renderer?.stats; },
  groundAt(x: number, z: number) { return terrainHeight(x, z); },
  // A real authoritative-style shot from an actor's eye toward `aim`. With `target`
  // it emits the damage event first (as the simulation does) and ends on the aim point.
  shoot(actorId: string, aim: { x: number; y: number; z: number }, opts: { target?: string; head?: boolean; armorBreak?: boolean; amount?: number } = {}) {
    const a = snapshot?.actors.find(a => a.id === actorId);
    if (!a) return null;
    // `aim.y` is a height above the terrain at (aim.x, aim.z).
    aim = { x: aim.x, y: terrainHeight(aim.x, aim.z) + aim.y, z: aim.z };
    const weapon = a.weapons[a.slot].id, origin = { x: a.pos.x, y: a.pos.y + 1.62, z: a.pos.z };
    const d = { x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z }, L = Math.hypot(d.x, d.y, d.z);
    const dir = { x: d.x / L, y: d.y / L, z: d.z / L };
    if (opts.target) {
      const t = snapshot!.actors.find(x => x.id === opts.target)!;
      api.event({ type: 'damage', actor: actorId, target: opts.target, amount: opts.amount ?? 26, head: !!opts.head, pos: { ...t.pos, y: t.pos.y + 1 }, ...(opts.armorBreak ? { armorBreak: true } : {}) });
      api.event({ type: 'shot', actor: actorId, weapon, origin, end: aim, hit: true });
      return aim;
    }
    const range = WEAPONS[weapon].range;
    const impact = resolveImpact(origin, dir, raycastWorld(origin, dir, range, world), range);
    const end = impact?.point || { x: origin.x + dir.x * range, y: origin.y + dir.y * range, z: origin.z + dir.z * range };
    api.event({ type: 'shot', actor: actorId, weapon, origin, end, hit: false, ...(impact ? { surface: impact.surface, normal: impact.normal } : {}) });
    return impact;
  },
  camera() { return renderer?.cameraPosition; },
  glow() { return (window as unknown as { glowState: unknown }).glowState; },
  debug() {
    const fx = (renderer as unknown as { effects: Record<string, { cards?: { life: number; age: number; cell: number; pos: unknown }[] }> }).effects;
    const glow = (fx as unknown as { glow: { mesh: { visible: boolean; geometry: { instanceCount: number } } } }).glow;
    (window as unknown as { glowState: unknown }).glowState = { visible: glow.mesh.visible, count: glow.mesh.geometry.instanceCount };
    return Object.fromEntries(Object.entries(fx).filter(([, v]) => v && v.cards).map(([k, v]) => [k, v.cards!.filter(c => c.life > 0).map(c => ({ cell: c.cell, age: +c.age.toFixed(3), life: c.life, pos: c.pos, size: [(c as unknown as { size0: number }).size0, (c as unknown as { size1: number }).size1] }))]));
  },
};
Object.defineProperty(window, '__vfx', { value: api });
