// Dev-only VFX review harness (not part of the build): renders the real island
// with the real renderer and replays hand-made authoritative events at a fixed
// 60 Hz step, so effects can be captured frame by frame and compared.
import * as THREE from 'three';
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
let liveSeq = 0;
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
  // Frame time with a GPU sync (1-pixel readback), with or without a firefight's worth
  // of effects: every bot fires at a random nearby spot every 5th frame (12 shots/s each).
  perf(frames: number, firefight: boolean) {
    const gl = (renderer as unknown as { gl: THREE.WebGLRenderer }).gl, ctx = gl.getContext(), pixel = new Uint8Array(4);
    const bots = snapshot!.actors.filter(a => a.id !== 'practice'), times: number[] = [];
    let drawCalls = 0;
    for (let i = 0; i < frames; i++) {
      if (firefight && i % 5 === 0) for (const b of bots) {
        const angle = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
        api.shoot(b.id, { x: b.pos.x + Math.cos(angle) * r, y: Math.random() * 2, z: b.pos.z + Math.sin(angle) * r });
      }
      const start = performance.now();
      frame(1 / 60);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
      times.push(performance.now() - start);
      drawCalls = Math.max(drawCalls, renderer!.stats.drawCalls);
    }
    times.sort((a, b) => a - b);
    const pick = (q: number) => +times[Math.floor((times.length - 1) * q)].toFixed(2);
    return { frames, mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p50: pick(.5), p95: pick(.95), max: pick(1), maxDrawCalls: drawCalls };
  },
  // Live bot clip: the real simulation with one bot against an invulnerable human
  // observer, rendered from the human's eyes. Returns what the bot is doing.
  live(opts: { seed: number; human: { x: number; z: number; yaw: number; pitch: number }; bot: { x: number; z: number }; difficulty?: 'easy' | 'normal' | 'hard' }) {
    const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty: opts.difficulty || 'normal', duration: 300 },
      [{ id: 'practice', name: 'Capivara', color: '#1fb5a8', ready: true, connected: true }], 'vfx-live', opts.seed);
    for (let i = 0; i < 190; i++) sim.step(1 / 60);
    const actors = (sim as unknown as { actors: Map<string, { state: ActorState; brain: Record<string, unknown> | null }> }).actors;
    for (const [id, a] of actors) if (id !== 'practice' && id !== 'bot-1') { a.state.alive = false; a.state.hp = 0; a.state.respawnAt = 0; }
    const me = actors.get('practice')!.state, bot = actors.get('bot-1')!;
    Object.assign(me, { pos: { x: opts.human.x, y: terrainHeight(opts.human.x, opts.human.z), z: opts.human.z }, hp: 1e6, protectionUntil: 0, yaw: opts.human.yaw, pitch: opts.human.pitch });
    Object.assign(bot.state, { pos: { x: opts.bot.x, y: terrainHeight(opts.bot.x, opts.bot.z), z: opts.bot.z }, protectionUntil: 0,
      yaw: Math.atan2(-(opts.human.x - opts.bot.x), -(opts.human.z - opts.bot.z)) });
    Object.assign(bot.brain!, { thinkAt: 0, lastPos: { ...bot.state.pos } });
    spec = { x: opts.human.x, z: opts.human.z, yaw: opts.human.yaw, pitch: opts.human.pitch };
    sim.drainEvents();
    (window as unknown as { liveSim: Simulation }).liveSim = sim;
    snapshot = sim.snapshot();
    return true;
  },
  liveStep(frames: number) {
    const sim = (window as unknown as { liveSim: Simulation }).liveSim;
    for (let i = 0; i < frames; i++) {
      sim.input('practice', { ...emptyInput(), seq: ++liveSeq, yaw: spec!.yaw, pitch: spec!.pitch, clientTime: sim.snapshot().time });
      sim.step(1 / 60);
      snapshot = sim.snapshot();
      for (const e of sim.drainEvents()) renderer?.event(e);
      frame(1 / 60);
    }
    const b = (sim as unknown as { actors: Map<string, { state: ActorState; brain: { mode: string; target: string | null } }> }).actors.get('bot-1')!;
    return { mode: b.brain.mode, target: b.brain.target, reloading: b.state.reloadUntil > 0, ammo: b.state.weapons[b.state.slot].ammo, pos: b.state.pos };
  },
  flashAt(x: number, y: number, z: number, weapon: WeaponId) {
    const fx = (renderer as unknown as { effects: { flash(p: THREE.Vector3, w: WeaponId, fp: boolean, ads: number): void } }).effects;
    fx.flash(new THREE.Vector3(x, y, z), weapon, false, 0);
  },
  impactAt(x: number, y: number, z: number) {
    const fx = (renderer as unknown as { effects: { impact(p: THREE.Vector3, s: string, n: THREE.Vector3, w: WeaponId, k: number): void } }).effects;
    fx.impact(new THREE.Vector3(x, y, z), 'stone', new THREE.Vector3(0, 0, -1), 'm4', 1);
  },
  probeCard(x: number, y: number, z: number, fields: Record<string, number>) {
    const fx = (renderer as unknown as { effects: { cards: { spawn(): Record<string, unknown> & { pos: THREE.Vector3; color: THREE.Color; light: THREE.Color } } } }).effects;
    const c = fx.cards.spawn();
    c.pos.set(x, y, z); c.cell = 4; c.life = 1; c.size0 = .5; c.size1 = .5; c.color.set('#ff0000'); c.light.set('#ffffff');
    Object.assign(c, fields);
  },
  attrs(n: number) {
    const cards = (renderer as unknown as { effects: { cards: { mesh: THREE.Mesh } } }).effects.cards;
    const g = cards.mesh.geometry as THREE.InstancedBufferGeometry, pick = (name: string, size: number) => Array.from((g.getAttribute(name).array as Float32Array).slice(0, n * size)).map(v => +v.toFixed(3));
    return { count: g.instanceCount, visible: cards.mesh.visible, pos: pick('aPos', 3), shape: pick('aShape', 4), misc: pick('aMisc', 4), color: pick('aColor', 3) };
  },
  avatarMaterials(id: string) {
    const visual = (renderer as unknown as { avatars: { get(id: string): { group: THREE.Group } | undefined } }).avatars.get(id);
    const out: unknown[] = [];
    visual?.group.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && (o as THREE.Mesh).visible) out.push({ name: o.name || o.type, type: m.type, transparent: m.transparent, depthWrite: m.depthWrite, depthTest: m.depthTest, renderOrder: o.renderOrder, opacity: (m as THREE.MeshBasicMaterial).opacity }); });
    return out;
  },
  weaponBox(id: string) {
    const visual = (renderer as unknown as { avatars: { get(id: string): { weapon: THREE.Mesh } | undefined } }).avatars.get(id)!;
    visual.weapon.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(visual.weapon);
    const scale = new THREE.Vector3(); visual.weapon.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    return { min: box.min, max: box.max, scale };
  },
  rayHits(x: number, y: number, z: number) {
    const r = renderer as unknown as { camera: THREE.PerspectiveCamera; scene: THREE.Scene };
    const from = r.camera.position.clone(), dir = new THREE.Vector3(x, y, z).sub(from);
    const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length() + 2);
    const hits: THREE.Intersection[] = [];
    r.scene.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) try { o.raycast(ray, hits); } catch { /* skinned rigs */ } });
    hits.sort((p, q) => p.distance - q.distance);
    return hits.slice(0, 6).map(h => ({ d: +h.distance.toFixed(2), name: h.object.name || h.object.type, parent: h.object.parent?.type, visible: h.object.visible, mat: ((h.object as THREE.Mesh).material as THREE.Material)?.type }));
  },
  cardsDepthTest(on: boolean) { (renderer as unknown as { effects: { cards: { material: THREE.ShaderMaterial } } }).effects.cards.material.depthTest = on; },
  weaponState(id: string) {
    const visual = (renderer as unknown as { avatars: { get(id: string): { weapon: THREE.Mesh } | undefined } }).avatars.get(id)!;
    const m = visual.weapon.material as THREE.Material;
    return { transparent: m.transparent, depthTest: m.depthTest, depthWrite: m.depthWrite, renderOrder: visual.weapon.renderOrder, layers: visual.weapon.layers.mask, parent: visual.weapon.parent?.type, onBefore: String(visual.weapon.onBeforeRender).slice(0, 80), frustum: visual.weapon.frustumCulled, type: m.type, uuidShared: m.uuid };
  },
  hideWeapon(id: string) { const v = (renderer as unknown as { avatars: { get(id: string): { weapon: THREE.Mesh } | undefined } }).avatars.get(id)!; v.weapon.geometry = new THREE.BufferGeometry(); },
  debug() {
    const fx = (renderer as unknown as { effects: Record<string, { cards?: { life: number; age: number; cell: number; pos: unknown }[] }> }).effects;
    return Object.fromEntries(Object.entries(fx).filter(([, v]) => v && v.cards).map(([k, v]) => [k, v.cards!.filter(c => c.life > 0).map(c => ({ cell: c.cell, age: +c.age.toFixed(3), life: c.life, pos: c.pos, size: [(c as unknown as { size0: number }).size0, (c as unknown as { size1: number }).size1] }))]));
  },
};
Object.defineProperty(window, '__vfx', { value: api });
