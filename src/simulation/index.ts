import { aimDirection, clamp, emptyInput, rng } from '../shared/math';
import { actorEye, clearSpawn, hasLineOfSight, moveActor, overlapsFootprint, raycastWorld } from '../shared/collision';
import { terrainHeight } from '../shared/terrain';
import { WEAPONS } from '../shared/weapons';
import { PROTOCOL_VERSION, WORLD_VERSION } from '../shared/types';
import type { ActorState, ConsumableId, GameEvent, InputFrame, LootState, MatchResult, PlayerAction, PlayerProfile, RoomConfig, Vec3, WeaponId, WeaponState, WorldSnapshot, WorldSpec, ZoneState } from '../shared/types';

const TICK = 1 / 60;
const CONSUMABLES: ConsumableId[] = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'];
const BOT_NAMES = ['Tico', 'Bento', 'Caju', 'Pipoca', 'Dendê', 'Tapioca', 'Zeca', 'Juju', 'Nino', 'Balu', 'Lola', 'Pingo', 'Tuca', 'Paca', 'Chico', 'Luna', 'Fubá', 'Mimo', 'Naná', 'Zuzu'];
const STORM = [
  { wait: 60, shrink: 45, radius: 95, damage: 1 },
  { wait: 35, shrink: 35, radius: 55, damage: 2 },
  { wait: 30, shrink: 30, radius: 30, damage: 4 },
  { wait: 25, shrink: 25, radius: 15, damage: 6 },
  { wait: 20, shrink: 20, radius: 6, damage: 9 },
  { wait: 15, shrink: 15, radius: 0, damage: 14 },
];
const USE_TIME: Record<ConsumableId, number> = { bandage: 2.5, medkit: 5, guarana: 2, acai: 3, rapadura: 1.5 };
const AMMO: Record<WeaponId, number> = { pistol: 51, smg: 75, m4: 90, shotgun: 18, dmr: 36, sniper: 15, machete: 0, slingshot: 12 };
interface ActorRuntime {
  state: ActorState; input: InputFrame; lastSeq: number; lastInputAt: number; lastAction: number;
  nextShot: number; wasFiring: boolean; lastShotPressId: number; jumpQueued: boolean; triggerQueued: Extract<PlayerAction, { type: 'trigger' }> | null; disconnectedAt: number; lastHurt: number;
  botThinkAt: number; botReactAt: number; target: string | null; targetPos: Vec3 | null;
  waypoint: Vec3 | null; strafe: number; boostUntil: number; hot: number; elimination: number;
  history: { time: number; pos: Vec3; crouch: boolean }[];
}
interface Projectile { owner: string; weapon: WeaponId; pos: Vec3; velocity: Vec3; life: number }
type EventWithoutId = { [K in GameEvent['type']]: Omit<Extract<GameEvent, { type: K }>, 'id'> }[GameEvent['type']];

const copy = <T>(value: T): T => structuredClone(value);
const groundPoint = (x: number, z: number): Vec3 => ({ x, y: terrainHeight(x, z), z });
const center = (actor: ActorState): Vec3 => ({ x: actor.pos.x, y: actor.pos.y + actorEye(actor), z: actor.pos.z });
const norm = (v: Vec3): Vec3 => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };

export class Simulation {
  private readonly world: WorldSpec;
  private readonly config: RoomConfig;
  private readonly matchId: string;
  private readonly random: () => number;
  private readonly actors = new Map<string, ActorRuntime>();
  private readonly loot: LootState[];
  private readonly openedChests = new Set<string>();
  private readonly events: GameEvent[] = [];
  private readonly projectiles: Projectile[] = [];
  private tick = 0;
  private time = 0;
  private accumulator = 0;
  private eventId = 0;
  private phase: WorldSnapshot['phase'] = 'countdown';
  private countdown = 3;
  private elimination = 0;
  private results: MatchResult[] = [];
  private plane: Vec3 = { x: -175, y: 150, z: 0 };
  private zone: ZoneState;
  private zoneTimer = STORM[0].wait;
  private zoneStart: Vec3 = { x: 0, y: 0, z: 0 };
  private zoneStartRadius = 190;

  constructor(world: WorldSpec, config: RoomConfig, players: PlayerProfile[], matchId: string, seed = 1) {
    this.world = world;
    this.config = { ...config };
    this.matchId = matchId;
    this.random = rng(seed);
    this.loot = world.loot.map(item => ({ ...item, active: true, rarity: item.weapon === 'slingshot' ? 3 : Math.floor(this.random() * 4), respawnAt: 0 }));
    this.zone = { x: 0, z: 0, radius: 190, nextRadius: 95, nextX: 0, nextZ: 0, phase: 0, shrinking: false, timeLeft: STORM[0].wait, damage: 1 };
    for (const profile of players.slice(0, 16)) this.addActor(profile, false);
    const desired = config.bots ? config.mode === 'battle-royale' ? 21 : Math.max(8, players.length) : players.length;
    for (let i = this.actors.size; i < desired; i++) this.addActor({ id: `bot-${i}`, name: BOT_NAMES[(i - players.length) % BOT_NAMES.length], color: '#ae825e', ready: true, connected: true }, true);
  }

  private emit(event: EventWithoutId) { this.events.push({ ...event, id: ++this.eventId } as GameEvent); }
  drainEvents(): GameEvent[] { return this.events.splice(0); }

  private spawnPoint(id: string): Vec3 {
    const points = this.world.spawns.filter(s => (s.mode === 'both' || s.mode === this.config.mode) && (this.config.mode !== 'deathmatch' || this.inArena(s)));
    const others = [...this.actors.values()].map(v => v.state).filter(a => a.alive && a.stage === 'ground');
    let best: Vec3 | null = null, score = -Infinity;
    for (const point of points.length ? points : [{ x: -42, y: 0, z: -12, mode: 'both' as const, yaw: 0 }]) {
      const candidate = groundPoint(point.x, point.z);
      candidate.y = Math.max(candidate.y, point.y);
      if (!clearSpawn(candidate, this.world)) continue;
      const nearest = others.length ? Math.min(...others.map(a => Math.hypot(a.pos.x - point.x, a.pos.z - point.z))) : 100;
      const exposed = others.some(a => hasLineOfSight({ x: candidate.x, y: candidate.y + 1.62, z: candidate.z }, center(a), this.world));
      const ranking = nearest + (exposed ? 0 : 100) + this.random() * 5;
      if (ranking > score) { score = ranking; best = candidate; }
    }
    if (best) return best;
    for (let i = 0; i < 500; i++) {
      const x = this.config.mode === 'deathmatch' ? -98 + this.random() * 111 : -110 + this.random() * 220;
      const z = this.config.mode === 'deathmatch' ? -98 + this.random() * 111 : -110 + this.random() * 220;
      const p = groundPoint(x, z);
      if (terrainHeight(x, z) > .5 && clearSpawn(p, this.world)) return p;
    }
    const bounds = this.config.mode === 'deathmatch' ? { low: -98, high: 13 } : { low: -110, high: 110 };
    for (let x = bounds.low; x <= bounds.high; x += 2) for (let z = bounds.low; z <= bounds.high; z += 2) {
      const p = groundPoint(x, z);
      if (terrainHeight(x, z) > .5 && clearSpawn(p, this.world)) return p;
    }
    throw new Error('World has no safe spawn point');
  }
  private inArena(p: Vec3) { return p.x >= -100 && p.x <= 15 && p.z >= -100 && p.z <= 15; }
  private makeWeapon(id: WeaponId, rarity = 0): WeaponState { return { id, ammo: WEAPONS[id].magazine, reserve: AMMO[id], rarity }; }
  private addActor(profile: PlayerProfile, bot: boolean) {
    if (this.actors.has(profile.id)) return;
    const spawn = this.spawnPoint(profile.id);
    const br = this.config.mode === 'battle-royale';
    const state: ActorState = {
      id: profile.id, name: profile.name.slice(0, 28), color: profile.color, bot, connected: bot || profile.connected,
      pos: br ? { ...this.plane } : spawn, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
      hp: 100, armor: 0, helmet: 0, alive: true, grounded: !br, crouch: false, sprint: false, ads: false,
      stage: br ? 'plane' : 'ground', kills: 0, deaths: 0, damage: 0,
      weapons: br ? [this.makeWeapon('pistol'), this.makeWeapon('machete')] : [this.makeWeapon('smg'), this.makeWeapon('pistol'), this.makeWeapon('machete')],
      slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 },
      reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: br ? 0 : this.time + (this.phase === 'playing' ? 2 : 5), lastInput: 0,
    };
    this.actors.set(profile.id, { state, input: emptyInput(), lastSeq: -1, lastInputAt: -Infinity, lastAction: -1, nextShot: 0, wasFiring: false, lastShotPressId: -1, jumpQueued: false, triggerQueued: null, disconnectedAt: Infinity, lastHurt: 0, botThinkAt: br ? 5 + this.random() * 7 : 0, botReactAt: 0, target: null, targetPos: null, waypoint: null, strafe: 0, boostUntil: 0, hot: 0, elimination: 0, history: [] });
  }

  input(id: string, input: InputFrame) {
    const actor = this.actors.get(id);
    if (!actor || actor.state.bot || !actor.state.connected || this.phase === 'results') return;
    if (![input.seq, input.moveX, input.moveZ, input.yaw, input.pitch, input.lean, input.clientTime].every(Number.isFinite)) return;
    if (!Number.isSafeInteger(input.seq) || input.seq < 0 || input.seq <= actor.lastSeq || (actor.lastSeq >= 0 && input.seq > actor.lastSeq + 600)) return;
    if (Math.abs(input.moveX) > 1.01 || Math.abs(input.moveZ) > 1.01 || Math.abs(input.lean) > 1.01 || Math.abs(input.yaw) > 1e6 || Math.abs(input.pitch) > Math.PI / 2 + .01) return;
    if (input.clientTime > this.time + 1 || input.clientTime < this.time - 1) return;
    if (![input.sprint, input.crouch, input.jump, input.fire, input.ads].every(v => typeof v === 'boolean')) return;
    if (input.firePressId !== undefined && (!Number.isSafeInteger(input.firePressId) || input.firePressId < 0)) return;
    actor.input = { ...input, moveX: clamp(input.moveX, -1, 1), moveZ: clamp(input.moveZ, -1, 1), lean: clamp(input.lean, -1, 1) };
    actor.lastSeq = input.seq;
    actor.lastInputAt = this.time;
    actor.state.lastInput = input.seq;
  }

  action(id: string, action: PlayerAction) {
    const actor = this.actors.get(id);
    if (!actor || actor.state.bot || !actor.state.connected || this.phase !== 'playing') return;
    if (!Number.isSafeInteger(action.id) || action.id < 0 || action.id <= actor.lastAction || (actor.lastAction >= 0 && action.id > actor.lastAction + 600)) return;
    if (action.type === 'trigger' && (![action.yaw, action.pitch, action.lean, action.clientTime].every(Number.isFinite) ||
      Math.abs(action.yaw) > Math.PI * 1000 || Math.abs(action.pitch) > Math.PI / 2 + .01 ||
      Math.abs(action.lean) > 1 || typeof action.ads !== 'boolean' ||
      action.clientTime < this.time - 1 || action.clientTime > this.time + 1)) return;
    actor.lastAction = action.id;
    const s = actor.state;
    if (!s.alive) return;
    if (action.type === 'jump') { if (s.stage === 'plane') this.drop(actor); else if (s.stage === 'ground' && s.grounded) actor.jumpQueued = true; }
    else if (action.type === 'trigger') { if (s.stage === 'ground' && actor.lastShotPressId < action.id) actor.triggerQueued = action; }
    else if (action.type === 'parachute') { if (s.stage === 'falling') s.stage = 'parachute'; }
    else if (action.type === 'slot') {
      if (Number.isInteger(action.slot) && action.slot >= 0 && action.slot < s.weapons.length) { s.slot = action.slot; s.reloadUntil = 0; s.useUntil = 0; s.using = null; }
    } else if (action.type === 'reload') this.startReload(actor);
    else if (action.type === 'consume') this.startConsume(actor, action.item);
    else if (action.type === 'interact') this.interact(actor, action.target);
  }

  player(profile: PlayerProfile, status: 'join' | 'disconnect' | 'reconnect' | 'expired') {
    const actor = this.actors.get(profile.id);
    if (status === 'join' && !actor) {
      if ([...this.actors.values()].filter(a => !a.state.bot).length >= 16) return;
      const max = this.config.mode === 'battle-royale' ? 21 : 16;
      const spectator = this.config.mode === 'battle-royale' && this.phase !== 'countdown';
      if (this.actors.size >= max && !spectator) {
        const replace = [...this.actors.values()].reverse().find(a => a.state.bot);
        if (!replace) return;
        this.actors.delete(replace.state.id);
      }
      this.addActor(profile, false);
      const joined = this.actors.get(profile.id)!;
      if (spectator) { joined.state.alive = false; joined.state.hp = 0; joined.state.stage = 'ground'; joined.state.deaths = 1; }
      return;
    }
    if (!actor) return;
    if (status === 'join' && actor.disconnectedAt === -Infinity && this.config.mode === 'deathmatch') {
      actor.state.connected = true; actor.disconnectedAt = Infinity; actor.state.respawnAt = this.time;
    }
    if (status === 'disconnect') { actor.state.connected = false; actor.disconnectedAt = this.time; actor.input = emptyInput(); actor.jumpQueued = false; actor.triggerQueued = null; }
    if (status === 'reconnect') {
      actor.state.connected = true;
      if (actor.disconnectedAt !== -Infinity) actor.disconnectedAt = Infinity;
      actor.input = emptyInput(); actor.lastSeq = -1; actor.lastAction = -1; actor.lastInputAt = -Infinity;
      actor.wasFiring = false; actor.lastShotPressId = -1; actor.jumpQueued = false; actor.triggerQueued = null; actor.state.lastInput = 0;
    }
    if (status === 'expired') this.forfeit(actor);
    actor.state.name = profile.name.slice(0, 28); actor.state.color = profile.color;
  }
  private forfeit(actor: ActorRuntime) {
    if (actor.state.connected || !Number.isFinite(actor.disconnectedAt)) return;
    const s = actor.state;
    s.connected = false; actor.disconnectedAt = -Infinity;
    if (!s.alive) { s.respawnAt = 0; return; }
    s.alive = false; s.hp = 0; s.deaths++; s.respawnAt = 0; s.using = null; s.reloadUntil = 0; actor.jumpQueued = false; actor.triggerQueued = null;
    actor.elimination = ++this.elimination;
    this.emit({ type: 'notice', text: `${s.name} saiu da partida` });
  }

  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulator = Math.min(this.accumulator + Math.min(dt, .25), .5);
    while (this.accumulator + 1e-10 >= TICK) { this.accumulator -= TICK; this.fixedStep(); }
  }
  private fixedStep() {
    this.time += TICK; this.tick++;
    if (this.phase === 'countdown') { this.countdown = Math.max(0, this.countdown - TICK); if (this.countdown <= 0) { this.phase = 'playing'; this.emit({ type: 'notice', text: 'A partida começou!' }); } return; }
    if (this.phase !== 'playing') return;
    if (this.config.mode === 'battle-royale') { this.updatePlane(); this.updateZone(); }
    for (const actor of this.actors.values()) {
      const s = actor.state;
      if (!s.connected && actor.disconnectedAt >= 0 && this.time - actor.disconnectedAt >= 30) this.forfeit(actor);
      if (!s.alive) { if (this.config.mode === 'deathmatch' && s.respawnAt && this.time >= s.respawnAt && s.connected) this.respawn(actor); continue; }
      if (s.stage === 'plane') { s.pos = { ...this.plane }; if (this.time > (s.bot ? actor.botThinkAt : 12)) this.drop(actor); continue; }
      if (s.stage === 'falling' || s.stage === 'parachute') { this.updateFall(actor); continue; }
      if (s.bot) this.updateBot(actor);
      const inp = s.bot || s.connected && this.time - actor.lastInputAt <= .3 ? actor.input : emptyInput();
      const trigger = actor.triggerQueued;
      actor.triggerQueued = null;
      s.yaw = inp.yaw; s.pitch = inp.pitch;
      moveActor(s, actor.jumpQueued ? { ...inp, jump: true } : inp, this.world, TICK, actor.boostUntil > this.time ? 1.15 : 1);
      actor.jumpQueued = false;
      if (this.config.mode === 'deathmatch') { s.pos.x = clamp(s.pos.x, -99.68, 14.68); s.pos.z = clamp(s.pos.z, -99.68, 14.68); }
      if (s.using && this.time >= s.useUntil) this.finishConsume(actor);
      if (s.reloadUntil && this.time >= s.reloadUntil) this.finishReload(actor);
      if (actor.hot > 0) { const heal = Math.min(actor.hot, 5 * TICK, 100 - s.hp); s.hp += heal; actor.hot -= heal; }
      if (this.config.mode === 'battle-royale' && Math.hypot(s.pos.x - this.zone.x, s.pos.z - this.zone.z) > this.zone.radius) this.damage(actor, this.zone.damage * TICK, null, 'storm', false);
      if (trigger) {
        s.yaw = trigger.yaw; s.pitch = trigger.pitch; s.lean = trigger.lean; s.ads = trigger.ads;
        actor.wasFiring = false;
      }
      if (s.alive && (inp.fire || trigger)) this.fire(actor, trigger?.clientTime, trigger?.id);
      if (!inp.fire) actor.wasFiring = false;
      if (inp.jump) actor.input.jump = false;
      actor.history.push({ time: this.time, pos: { ...s.pos }, crouch: s.crouch });
      if (actor.history.length > 15) actor.history.shift();
    }
    this.updateProjectiles();
    for (const loot of this.loot) if (!loot.active && loot.respawnAt && this.time >= loot.respawnAt) { loot.active = true; loot.respawnAt = 0; }
    if (this.config.mode === 'deathmatch' && this.time >= this.config.duration + 3) this.finish();
    if (this.config.mode === 'battle-royale') {
      const survivors = [...this.actors.values()].filter(a => a.state.alive);
      if (survivors.length === 0 || survivors.length === 1 && survivors[0].state.connected) this.finish();
    }
  }
  private updatePlane() { this.plane.x = Math.min(175, -175 + Math.max(0, this.time - 3) * 30); }
  private drop(a: ActorRuntime) {
    if (a.state.stage !== 'plane') return;
    a.state.stage = 'falling'; a.state.pos = { ...this.plane, y: this.plane.y - 3 };
    a.state.velocity = { x: 8, y: -2, z: 0 }; a.state.grounded = false;
  }
  private updateFall(a: ActorRuntime) {
    const s = a.state, inp = a.input, chute = s.stage === 'parachute';
    const speed = chute ? 10 : 15;
    s.velocity.x += ((-Math.sin(inp.yaw) * inp.moveZ + Math.cos(inp.yaw) * inp.moveX) * speed - s.velocity.x) * .04;
    s.velocity.z += ((-Math.cos(inp.yaw) * inp.moveZ - Math.sin(inp.yaw) * inp.moveX) * speed - s.velocity.z) * .04;
    s.velocity.y += ((chute ? -6.5 : inp.sprint ? -42 : -30) - s.velocity.y) * .04;
    s.pos.x = clamp(s.pos.x + s.velocity.x * TICK, -this.world.size / 2, this.world.size / 2);
    s.pos.z = clamp(s.pos.z + s.velocity.z * TICK, -this.world.size / 2, this.world.size / 2);
    const previousY = s.pos.y;
    s.pos.y += s.velocity.y * TICK;
    if (s.stage === 'falling' && s.pos.y - terrainHeight(s.pos.x, s.pos.z) < 55) s.stage = 'parachute';
    let ground = terrainHeight(s.pos.x, s.pos.z);
    for (const collider of this.world.colliders) {
      if (overlapsFootprint(s.pos, collider) && previousY >= collider.max.y && s.pos.y <= collider.max.y) ground = Math.max(ground, collider.max.y);
    }
    if (s.pos.y <= ground) {
      const impact = s.velocity.y;
      s.pos.y = ground; s.velocity = { x: 0, y: 0, z: 0 }; s.stage = 'ground'; s.grounded = true;
      if (impact < -20) this.damage(a, Math.min(100, (-impact - 20) * 3), null, 'fall', false);
    }
  }
  private planZone() {
    const phase = STORM[this.zone.phase];
    this.zone.nextRadius = phase.radius;
    const maxOffset = Math.max(0, this.zone.radius - phase.radius);
    const angle = this.random() * Math.PI * 2, offset = this.random() * maxOffset;
    this.zone.nextX = clamp(this.zone.x + Math.cos(angle) * offset, -100 + phase.radius, 100 - phase.radius);
    this.zone.nextZ = clamp(this.zone.z + Math.sin(angle) * offset, -100 + phase.radius, 100 - phase.radius);
    this.zoneStart = { x: this.zone.x, y: 0, z: this.zone.z };
    this.zoneStartRadius = this.zone.radius;
    this.zoneTimer = phase.wait; this.zone.shrinking = false; this.zone.timeLeft = this.zoneTimer;
  }
  private updateZone() {
    const phase = STORM[this.zone.phase];
    if (!phase) { this.zone.radius = 0; this.zone.damage = 18; return; }
    this.zoneTimer -= TICK;
    if (!this.zone.shrinking && this.zoneTimer <= 0) {
      this.zone.shrinking = true; this.zoneTimer = phase.shrink; this.zone.damage = phase.damage;
      this.emit({ type: 'notice', text: 'A tempestade está fechando!' });
    } else if (this.zone.shrinking) {
      const k = clamp(1 - this.zoneTimer / phase.shrink, 0, 1);
      this.zone.x = this.zoneStart.x + (this.zone.nextX - this.zoneStart.x) * k;
      this.zone.z = this.zoneStart.z + (this.zone.nextZ - this.zoneStart.z) * k;
      this.zone.radius = this.zoneStartRadius + (phase.radius - this.zoneStartRadius) * k;
      if (this.zoneTimer <= 0) { this.zone.phase++; if (this.zone.phase < STORM.length) this.planZone(); else { this.zone.radius = 0; this.zone.damage = 18; this.zone.shrinking = false; this.zoneTimer = 0; } }
    }
    this.zone.timeLeft = Math.max(0, this.zoneTimer);
  }
  private startReload(a: ActorRuntime) {
    const s = a.state, w = s.weapons[s.slot], def = w && WEAPONS[w.id];
    if (!w || !def.ammo || s.stage !== 'ground' || s.reloadUntil || s.using || w.ammo >= def.magazine || w.reserve <= 0) return;
    s.reloadUntil = this.time + def.reload;
  }
  private finishReload(a: ActorRuntime) {
    const s = a.state, w = s.weapons[s.slot];
    if (w) {
      const def = WEAPONS[w.id];
      const amount = Math.min(w.id === 'shotgun' ? 1 : def.magazine - w.ammo, w.reserve);
      w.ammo += amount; w.reserve -= amount;
      if (amount) this.emit({ type: 'reload', actor: s.id, weapon: w.id });
      if (w.id === 'shotgun' && w.ammo < def.magazine && w.reserve > 0) { s.reloadUntil = this.time + def.reload; return; }
    }
    s.reloadUntil = 0;
  }
  private startConsume(a: ActorRuntime, item: ConsumableId) {
    const s = a.state;
    if (!CONSUMABLES.includes(item) || s.stage !== 'ground' || s.using || !s.consumables[item]) return;
    if (item === 'bandage' && s.hp >= 75 || (item === 'medkit' || item === 'rapadura') && s.hp >= 100 || item === 'acai' && s.armor >= 100) return;
    s.reloadUntil = 0; s.using = item; s.useUntil = this.time + USE_TIME[item];
  }
  private finishConsume(a: ActorRuntime) {
    const s = a.state, item = s.using;
    if (!item || !s.consumables[item]) { s.using = null; s.useUntil = 0; return; }
    s.consumables[item]--;
    if (item === 'bandage') s.hp = Math.min(75, s.hp + 15);
    if (item === 'medkit') s.hp = 100;
    if (item === 'rapadura') s.hp = Math.min(100, s.hp + 10);
    if (item === 'acai') s.armor = Math.min(100, s.armor + 25);
    if (item === 'guarana') { a.hot = Math.min(30, 100 - s.hp); a.boostUntil = this.time + 10; }
    s.using = null; s.useUntil = 0;
  }
  private interact(a: ActorRuntime, target: string) {
    const s = a.state;
    if (s.stage !== 'ground' || typeof target !== 'string') return;
    const loot = this.loot.find(item => item.id === target && item.active);
    const chest = this.world.chests.find(item => item.id === target && !this.openedChests.has(item.id));
    const item = loot || chest;
    if (!item || Math.hypot(s.pos.x - item.x, s.pos.y - item.y, s.pos.z - item.z) > 3) return;
    if (!hasLineOfSight(center(s), { x: item.x, y: item.y + .5, z: item.z }, this.world)) return;
    if (chest) {
      this.openedChests.add(chest.id);
      const choices: WeaponId[] = ['smg', 'shotgun', 'm4', 'dmr', 'sniper', 'slingshot'];
      const weapon = choices[Math.floor(this.random() * choices.length)];
      this.giveWeapon(s, weapon, weapon === 'slingshot' ? 3 : 1 + Math.floor(this.random() * 3));
      this.emit({ type: 'pickup', actor: s.id, item: `chest:${weapon}` });
      return;
    }
    if (!loot) return;
    if (loot.kind === 'weapon') this.giveWeapon(s, loot.weapon || 'pistol', loot.rarity);
    else if (loot.kind === 'ammo') { for (const w of s.weapons) if (w.id !== 'machete') w.reserve = Math.min(AMMO[w.id] * 3, w.reserve + WEAPONS[w.id].magazine); }
    else if (loot.kind === 'armor') s.armor = Math.min(100, s.armor + 50);
    else if (loot.kind === 'helmet') s.helmet = Math.min(60, s.helmet + 60);
    else if (CONSUMABLES.includes(loot.kind)) s.consumables[loot.kind as ConsumableId] = Math.min(5, s.consumables[loot.kind as ConsumableId] + 1);
    loot.active = false; loot.respawnAt = this.config.mode === 'deathmatch' ? this.time + 30 : 0;
    this.emit({ type: 'pickup', actor: s.id, item: loot.id });
  }
  private giveWeapon(s: ActorState, id: WeaponId, rarity: number) {
    const existing = s.weapons.find(w => w.id === id);
    if (existing) { existing.rarity = Math.max(existing.rarity, rarity); existing.reserve = Math.min(AMMO[id] * 3, existing.reserve + AMMO[id]); return; }
    if (s.weapons.length < 4) s.weapons.push(this.makeWeapon(id, rarity));
    else { const slot = s.weapons.findIndex(w => w.id !== 'machete' && w.id !== 'pistol'); s.weapons[slot < 0 ? 0 : slot] = this.makeWeapon(id, rarity); }
  }
  private fire(a: ActorRuntime, clientTime = a.input.clientTime, pressId = a.input.firePressId) {
    const s = a.state, w = s.weapons[s.slot], def = w && WEAPONS[w.id];
    if (!w || !def || s.stage !== 'ground' || s.using || this.time < a.nextShot) return;
    if (!def.automatic && !s.bot && (a.wasFiring || pressId !== undefined && a.lastShotPressId >= pressId)) return;
    if (s.reloadUntil) {
      if (w.id !== 'shotgun' || w.ammo === 0) return;
      s.reloadUntil = 0;
    }
    a.wasFiring = true;
    if (!def.melee && w.ammo <= 0) { this.startReload(a); return; }
    if (pressId !== undefined) a.lastShotPressId = Math.max(a.lastShotPressId, pressId);
    if (s.protectionUntil > this.time) s.protectionUntil = this.time;
    a.nextShot = this.time + 60 / def.rpm;
    if (!def.melee) w.ammo--;
    const origin = center(s), forward = aimDirection(s.yaw, s.pitch);
    origin.x += Math.cos(s.yaw) * s.lean * .32; origin.z -= Math.sin(s.yaw) * s.lean * .32;
    if (def.projectile) {
      this.projectiles.push({ owner: s.id, weapon: w.id, pos: { ...origin }, velocity: { x: forward.x * (def.speed || 50), y: forward.y * (def.speed || 50), z: forward.z * (def.speed || 50) }, life: 3 });
      this.emit({ type: 'shot', actor: s.id, weapon: w.id, origin, end: { x: origin.x + forward.x * 2, y: origin.y + forward.y * 2, z: origin.z + forward.z * 2 }, hit: false });
      return;
    }
    const pellets = def.pellets || 1; let hit = false, endpoint = { x: origin.x + forward.x * def.range, y: origin.y + forward.y * def.range, z: origin.z + forward.z * def.range };
    for (let n = 0; n < pellets; n++) {
      const spread = (s.ads ? def.adsSpread : def.spread) * Math.PI / 180;
      const direction = def.melee ? forward : norm({ x: forward.x + (this.random() - .5) * spread, y: forward.y + (this.random() - .5) * spread, z: forward.z + (this.random() - .5) * spread });
      const wall = raycastWorld(origin, direction, def.range, this.world);
      let best = wall?.distance ?? def.range, victim: ActorRuntime | null = null, head = false;
      for (const other of this.actors.values()) {
        const t = other.state;
        if (t.id === s.id || !t.alive || t.stage !== 'ground') continue;
        const rewind = !s.bot && !def.melee && this.time - clientTime <= .2 && this.time - clientTime >= 0
          ? [...other.history].reverse().find(h => h.time <= clientTime) : undefined;
        const found = this.rayActor(origin, direction, t, best, rewind?.pos, rewind?.crouch);
        if (found) { best = found.distance; victim = other; head = found.head; }
      }
      if (victim) {
        hit = true; endpoint = { x: origin.x + direction.x * best, y: origin.y + direction.y * best, z: origin.z + direction.z * best };
        const falloff = w.id === 'shotgun' ? best <= 8 ? 1 : clamp(1 - (best - 8) / 30, .2, 1) : 1;
        this.damage(victim, def.damage * (head ? def.headMultiplier : 1) * (1 + w.rarity * .08) * falloff, s.id, w.id, head);
      } else if (wall) endpoint = wall.point;
    }
    this.emit({ type: 'shot', actor: s.id, weapon: w.id, origin, end: endpoint, hit });
  }
  private rayActor(origin: Vec3, d: Vec3, actor: ActorState, max: number, position = actor.pos, crouch = actor.crouch): { distance: number; head: boolean } | null {
    let best = max, head = false;
    const height = crouch ? 1.3 : 1.8;
    const hx = origin.x - position.x, hy = origin.y - position.y - (height - .22), hz = origin.z - position.z;
    const projection = hx * d.x + hy * d.y + hz * d.z;
    const sphere = projection * projection - (hx * hx + hy * hy + hz * hz - .22 * .22);
    if (sphere >= 0) {
      const near = -projection - Math.sqrt(sphere), far = -projection + Math.sqrt(sphere);
      if (far >= 0 && Math.max(0, near) < best) { best = Math.max(0, near); head = true; }
    }
    const ox = origin.x - position.x, oz = origin.z - position.z, a = d.x * d.x + d.z * d.z;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - .3 * .3;
    let radialNear = 0, radialFar = max;
    if (a < 1e-9) { if (c > 0) return best < max ? { distance: best, head } : null; }
    else {
      const disc = b * b - a * c;
      if (disc < 0) return best < max ? { distance: best, head } : null;
      radialNear = (-b - Math.sqrt(disc)) / a;
      radialFar = (-b + Math.sqrt(disc)) / a;
    }
    let verticalNear = 0, verticalFar = max;
    const bodyTop = height - .18;
    if (Math.abs(d.y) < 1e-9) { if (origin.y < position.y || origin.y > position.y + bodyTop) return best < max ? { distance: best, head } : null; }
    else {
      const t0 = (position.y - origin.y) / d.y, t1 = (position.y + bodyTop - origin.y) / d.y;
      verticalNear = Math.min(t0, t1); verticalFar = Math.max(t0, t1);
    }
    const bodyNear = Math.max(0, radialNear, verticalNear);
    if (bodyNear <= Math.min(radialFar, verticalFar) && bodyNear < best) { best = bodyNear; head = false; }
    return best < max ? { distance: best, head } : null;
  }
  private damage(target: ActorRuntime, raw: number, attackerId: string | null, weapon: WeaponId | 'storm' | 'fall', head: boolean) {
    const s = target.state;
    if (!s.alive || s.protectionUntil > this.time || !Number.isFinite(raw) || raw <= 0) return;
    let damage = raw;
    if (head && s.helmet > 0) { const blocked = Math.min(s.helmet, damage * .4); s.helmet -= blocked; damage -= blocked; }
    if (s.armor > 0) { const blocked = Math.min(s.armor, damage); s.armor -= blocked; damage -= blocked; }
    s.hp = Math.max(0, s.hp - damage);
    const attacker = attackerId && attackerId !== s.id ? this.actors.get(attackerId) : null;
    if (attacker) attacker.state.damage += raw;
    target.lastHurt = this.time;
    if (s.using) { s.using = null; s.useUntil = 0; }
    this.emit({ type: 'damage', actor: attackerId || '', target: s.id, amount: Math.round(raw * 10) / 10, head, pos: { ...s.pos, y: s.pos.y + 1 } });
    if (s.hp <= 0) this.kill(target, attacker || null, weapon);
  }
  private kill(target: ActorRuntime, killer: ActorRuntime | null, weapon: WeaponId | 'storm' | 'fall') {
    const s = target.state;
    if (!s.alive) return;
    s.alive = false; s.hp = 0; s.deaths++; s.using = null; s.reloadUntil = 0; target.jumpQueued = false; target.triggerQueued = null;
    if (killer && killer !== target) killer.state.kills++;
    target.elimination = ++this.elimination;
    if (this.config.mode === 'deathmatch') s.respawnAt = this.time + 3;
    this.emit({ type: 'kill', actor: killer?.state.id || null, target: s.id, weapon });
  }
  private respawn(a: ActorRuntime) {
    const s = a.state; s.pos = this.spawnPoint(s.id); s.velocity = { x: 0, y: 0, z: 0 };
    s.hp = 100; s.armor = 0; s.helmet = 0; s.alive = true; s.grounded = true; s.stage = 'ground';
    s.crouch = false; s.sprint = false; s.ads = false; s.lean = 0;
    s.weapons = [this.makeWeapon('smg'), this.makeWeapon('pistol'), this.makeWeapon('machete')]; s.slot = 0;
    s.reloadUntil = 0; s.useUntil = 0; s.using = null;
    s.protectionUntil = this.time + 2; s.respawnAt = 0; a.nextShot = this.time; a.wasFiring = false;
    a.input = emptyInput(); a.lastInputAt = -Infinity; a.lastShotPressId = -1; a.jumpQueued = false; a.triggerQueued = null; a.hot = 0; a.boostUntil = 0; a.history = [];
    this.emit({ type: 'respawn', actor: s.id });
  }
  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i], previous = { ...p.pos };
      p.life -= TICK; p.velocity.y -= 9.8 * TICK;
      p.pos.x += p.velocity.x * TICK; p.pos.y += p.velocity.y * TICK; p.pos.z += p.velocity.z * TICK;
      const segment = { x: p.pos.x - previous.x, y: p.pos.y - previous.y, z: p.pos.z - previous.z };
      const length = Math.hypot(segment.x, segment.y, segment.z), dir = norm(segment);
      const wall = raycastWorld(previous, dir, length, this.world);
      let best = wall?.distance ?? length, victim: ActorRuntime | null = null, head = false;
      for (const other of this.actors.values()) {
        if (!other.state.alive || other.state.id === p.owner || other.state.stage !== 'ground') continue;
        const hit = this.rayActor(previous, dir, other.state, best);
        if (hit) { best = hit.distance; victim = other; head = hit.head; }
      }
      if (victim) this.damage(victim, WEAPONS[p.weapon].damage * (head ? WEAPONS[p.weapon].headMultiplier : 1), p.owner, p.weapon, head);
      if (victim || wall || p.pos.y < terrainHeight(p.pos.x, p.pos.z) || p.life <= 0) this.projectiles.splice(i, 1);
    }
  }
  private botWaypoint(from: Vec3, goal: Vec3): Vec3 {
    const low = { x: from.x, y: from.y + .7, z: from.z };
    const end = { x: goal.x, y: from.y + .7, z: goal.z };
    const length = Math.hypot(goal.x - from.x, goal.z - from.z);
    if (length < 1 || hasLineOfSight(low, end, this.world)) return goal;
    const hit = raycastWorld(low, { x: (goal.x - from.x) / length, y: 0, z: (goal.z - from.z) / length }, length, this.world);
    if (!hit || hit.collider.id === 'terrain') return goal;
    const c = hit.collider, margin = .85;
    const corners = [
      { x: c.min.x - margin, y: from.y, z: c.min.z - margin },
      { x: c.min.x - margin, y: from.y, z: c.max.z + margin },
      { x: c.max.x + margin, y: from.y, z: c.min.z - margin },
      { x: c.max.x + margin, y: from.y, z: c.max.z + margin },
    ].filter(p => this.config.mode !== 'deathmatch' || this.inArena(p));
    const visible = corners.filter(p => hasLineOfSight(low, { x: p.x, y: low.y, z: p.z }, this.world));
    visible.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) + Math.hypot(a.x - goal.x, a.z - goal.z) - Math.hypot(b.x - from.x, b.z - from.z) - Math.hypot(b.x - goal.x, b.z - goal.z));
    return visible[0] || goal;
  }
  private updateBot(a: ActorRuntime) {
    const s = a.state;
    if (this.time >= a.botThinkAt) {
      a.botThinkAt = this.time + (this.config.difficulty === 'hard' ? .2 : this.config.difficulty === 'easy' ? .6 : .35);
      let nearest: ActorRuntime | null = null, distance = Infinity;
      for (const other of this.actors.values()) {
        const t = other.state;
        if (t.id === s.id || !t.alive || t.stage !== 'ground') continue;
        const d = Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z);
        const range = this.config.difficulty === 'easy' ? 35 : this.config.difficulty === 'hard' ? 85 : 60;
        if (d > range || d >= distance) continue;
        const angle = Math.atan2(-(t.pos.x - s.pos.x), -(t.pos.z - s.pos.z));
        const diff = Math.atan2(Math.sin(angle - s.yaw), Math.cos(angle - s.yaw));
        if (d > 8 && Math.abs(diff) > 1.35 && this.time - a.lastHurt > 3) continue;
        if (!hasLineOfSight(center(s), center(t), this.world)) continue;
        nearest = other; distance = d;
      }
      if (nearest?.state.id !== a.target) a.botReactAt = this.time + (this.config.difficulty === 'hard' ? .25 : this.config.difficulty === 'easy' ? .8 : .5);
      a.target = nearest?.state.id || null;
      if (nearest) a.targetPos = { ...nearest.state.pos };
      else if (!a.targetPos || Math.hypot(a.targetPos.x - s.pos.x, a.targetPos.z - s.pos.z) < 2) {
        const available = this.loot.filter(l => l.active && Math.hypot(l.x - s.pos.x, l.z - s.pos.z) < 45 && hasLineOfSight(center(s), { x: l.x, y: l.y + .5, z: l.z }, this.world));
        a.targetPos = available.length ? { ...available[Math.floor(this.random() * available.length)] } : this.config.mode === 'battle-royale' && Math.hypot(s.pos.x - this.zone.nextX, s.pos.z - this.zone.nextZ) > this.zone.nextRadius * .8 ? groundPoint(this.zone.nextX, this.zone.nextZ) : this.spawnPoint(s.id);
      }
      a.strafe = this.random() < .5 ? -1 : 1;
      const planned = nearest?.state.pos || a.targetPos;
      a.waypoint = planned ? this.botWaypoint(s.pos, planned) : null;
    }
    const target = a.target ? this.actors.get(a.target) : undefined;
    const goal = target?.state.alive ? target.state.pos : a.targetPos;
    const inp: InputFrame = a.input = { ...emptyInput(), seq: this.tick, clientTime: this.time, sprint: true };
    if (!goal) return;
    const waypoint = a.waypoint || goal;
    const dx = waypoint.x - s.pos.x, dz = waypoint.z - s.pos.z, distance = Math.hypot(goal.x - s.pos.x, goal.z - s.pos.z);
    const desired = Math.atan2(-dx, -dz);
    s.yaw = inp.yaw = desired;
    if (target && this.time >= a.botReactAt && distance < WEAPONS[s.weapons[s.slot].id].range && hasLineOfSight(center(s), center(target.state), this.world)) {
      inp.fire = true; inp.ads = true; inp.sprint = false; inp.moveX = a.strafe * .4; inp.moveZ = distance > 14 ? .55 : 0;
      if (s.weapons[s.slot].ammo === 0) this.startReload(a);
    } else if (distance > 1.5) {
      inp.moveZ = 1;
      const ahead = { x: s.pos.x - Math.sin(desired) * 2, y: s.pos.y + .7, z: s.pos.z - Math.cos(desired) * 2 };
      if (!hasLineOfSight({ x: s.pos.x, y: s.pos.y + .7, z: s.pos.z }, ahead, this.world)) { inp.moveZ = .3; inp.moveX = a.strafe; inp.jump = true; }
    }
    for (const item of this.loot) if (item.active && Math.hypot(item.x - s.pos.x, item.z - s.pos.z) < 2.5 && hasLineOfSight(center(s), { x: item.x, y: item.y + .5, z: item.z }, this.world)) this.interact(a, item.id);
    if (s.hp < 60 && s.consumables.bandage && !s.using) this.startConsume(a, 'bandage');
  }
  private finish() {
    if (this.phase === 'results') return;
    this.phase = 'results';
    const sorted = [...this.actors.values()].sort((a, b) => this.config.mode === 'deathmatch' ? b.state.kills - a.state.kills || a.state.deaths - b.state.deaths || b.state.damage - a.state.damage : Number(b.state.alive) - Number(a.state.alive) || b.elimination - a.elimination);
    let previousPlace = 0;
    const alive = sorted.filter(a => a.state.alive).length;
    this.results = sorted.map((a, index) => {
      const s = a.state, prev = sorted[index - 1]?.state;
      // Eliminations decide this mode. Other columns only stabilize display order.
      const tied = this.config.mode === 'deathmatch' && prev && prev.kills === s.kills;
      const place = tied ? previousPlace : index + 1;
      previousPlace = place;
      return { id: s.id, name: s.name, color: s.color, bot: s.bot, kills: s.kills, deaths: s.deaths, damage: s.damage, place, winner: place === 1 && (this.config.mode === 'deathmatch' || alive === 1) };
    });
    this.emit({ type: 'notice', text: 'Partida encerrada!' });
  }
  snapshot(): WorldSnapshot {
    return {
      protocol: PROTOCOL_VERSION, world: this.world.version || WORLD_VERSION, matchId: this.matchId, tick: this.tick, time: this.time, phase: this.phase,
      config: { ...this.config }, countdown: this.countdown, remaining: this.config.mode === 'deathmatch' ? Math.max(0, this.config.duration - Math.max(0, this.time - 3)) : [...this.actors.values()].filter(a => a.state.alive).length,
      actors: [...this.actors.values()].map(a => copy(a.state)), loot: copy(this.loot), openedChests: [...this.openedChests],
      zone: { ...this.zone }, results: copy(this.results), plane: { ...this.plane },
    };
  }
}
