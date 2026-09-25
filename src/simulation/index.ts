import { aimDirection, clamp, emptyInput, rng } from '../shared/math';
import { actorEye, clearSpawn, hasLineOfSight, moveActor, overlapsFootprint, raycastWorld } from '../shared/collision';
import { terrainHeight } from '../shared/terrain';
import { ARENA, ARENA_CENTER, inArena } from '../shared/layout';
import { advanceAds, coolShotHeat, damageFalloff, shotHeatGain, shotSpread, WEAPONS } from '../shared/weapons';
import { resolveImpact, type Impact } from './surface';
import { adaptDifficulty, angleDiff, BOT_START, BOT_WEAPON, botValue, ColliderGrid, createBrain, DIFFICULTY, type BotBrain, type BotDifficulty } from './bots';
import { PROTOCOL_VERSION, WORLD_VERSION } from '../shared/types';
import type { ActorState, ChestSpec, ConsumableId, GameEvent, InputFrame, LootState, MatchResult, PlayerAction, PlayerProfile, RoomConfig, Vec3, WeaponId, WeaponState, WorldSnapshot, WorldSpec, ZoneState } from '../shared/types';

const TICK = 1 / 60;
const PLANE_ALTITUDE = 115, PLANE_SPEED = 30, PLANE_ROUTE = 350;
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
const CHEST_WEAPONS: WeaponId[] = ['smg', 'shotgun', 'm4', 'dmr', 'sniper', 'slingshot'];
const CHEST_EXTRA: [LootState['kind'], number][] = [['bandage', 20], ['medkit', 12], ['armor', 18], ['helmet', 12], ['guarana', 14], ['acai', 12], ['rapadura', 12]];
const AMMO: Record<WeaponId, number> = { pistol: 51, smg: 75, m4: 90, shotgun: 18, dmr: 36, sniper: 15, machete: 0, slingshot: 12 };
// Legacy-sized hit shapes on the standing capybara (eye 1.62, facing -z): a head
// sphere and a vertical body cylinder from the feet. When a bot shoots a human the
// legacy player-favouring sizes apply. Crouching scales them by 1.3/1.8 from the feet.
// Keep the movement capsule narrow enough for doors; shots use these volumes instead.
const HIT_SHAPES = {
  normal: { headY: 1.6, headZ: -.04, headR: .25, bodyR: .3, bodyTop: 1.42 },
  favoured: { headY: 1.6, headZ: -.04, headR: .19, bodyR: .27, bodyTop: 1.36 },
} as const;
interface ActorRuntime {
  state: ActorState; input: InputFrame; lastSeq: number; lastInputAt: number; lastAction: number;
  nextShot: number; wasFiring: boolean; lastShotPressId: number; jumpQueued: boolean; jumpQueuedUntil: number; triggerQueued: Extract<PlayerAction, { type: 'trigger' }> | null; disconnectedAt: number; lastHurt: number;
  brain: BotBrain | null; boostUntil: number; hot: number; shotHeat: number; adsAmount: number; elimination: number; stormExposure: number; landedAt: number;
  shots: number; hits: number; headshots: number; chests: number; eliminatedAt: number | null;
  history: { time: number; pos: Vec3; crouch: boolean; yaw: number }[];
}
interface Projectile { owner: string; weapon: WeaponId; pos: Vec3; velocity: Vec3; life: number }
type EventWithoutId = { [K in GameEvent['type']]: Omit<Extract<GameEvent, { type: K }>, 'id'> }[GameEvent['type']];

const copy = <T>(value: T): T => structuredClone(value);
const groundPoint = (x: number, z: number): Vec3 => ({ x, y: terrainHeight(x, z), z });
const center = (actor: ActorState): Vec3 => ({ x: actor.pos.x, y: actor.pos.y + actorEye(actor), z: actor.pos.z });
const norm = (v: Vec3): Vec3 => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const DEG = Math.PI / 180;
// Minimum time between a bot's visible alert tell and its first shot at a human.
export const BOT_TELL = .45;
// Loot a bot will walk to must be on its own level (no stairs pathing).
const LEVEL = 1.8;
// Seconds after a human lands before bots may pick them as a target.
export const LANDING_GRACE = 2.5;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Simulation {
  private readonly world: WorldSpec;
  private readonly config: RoomConfig;
  private readonly matchId: string;
  private readonly random: () => number;
  private readonly actors = new Map<string, ActorRuntime>();
  private readonly loot: LootState[];
  private readonly openedChests = new Set<string>();
  private dropSeq = 0;
  private readonly grid: ColliderGrid;
  private readonly diff: BotDifficulty;
  private readonly landings: Vec3[] = [];
  private botCount = 0;
  private readonly spentDrops = new Map<LootState, number>();
  private readonly approaches = new Map<string, Vec3 | 'open' | 'none'>();
  private readonly events: GameEvent[] = [];
  private readonly projectiles: Projectile[] = [];
  private tick = 0;
  private time = 0;
  private accumulator = 0;
  private eventId = 0;
  private phase: WorldSnapshot['phase'] = 'countdown';
  private matchStartedAt = 0;
  private countdown = 3;
  private elimination = 0;
  private results: MatchResult[] = [];
  // Legacy initPlane(): a random heading across the island, offset up to 35 m
  // from the centre, 350 m long at 30 m/s after a 3 s countdown.
  private plane: Vec3 = { x: -175, y: PLANE_ALTITUDE, z: 0 };
  private planeStart: Vec3 = { x: -175, y: PLANE_ALTITUDE, z: 0 };
  private planeDir: Vec3 = { x: 1, y: 0, z: 0 };
  private zone: ZoneState;
  private zoneTimer = STORM[0].wait;
  private zoneStart: Vec3 = { x: 0, y: 0, z: 0 };
  private zoneStartRadius = 190;

  constructor(world: WorldSpec, config: RoomConfig, players: PlayerProfile[], matchId: string, seed = crypto.getRandomValues(new Uint32Array(1))[0]) {
    this.world = world;
    this.grid = new ColliderGrid(world);
    this.config = { ...config };
    this.diff = adaptDifficulty(DIFFICULTY[config.difficulty], config.adapt);
    this.matchId = matchId;
    this.random = rng(seed);
    // Snapshots must not carry undefined fields: finiteTree() rejects them and the
    // host would stop publishing. Non-weapon spawns may come with `weapon: undefined`.
    this.loot = world.loot.map(({ weapon, ...item }) => ({ ...item, ...(weapon ? { weapon } : {}), active: true, rarity: weapon === 'slingshot' ? 3 : Math.floor(this.random() * 4), respawnAt: 0 }));
    const heading = this.random() * Math.PI * 2, offset = (this.random() * 2 - 1) * 35;
    this.planeDir = { x: Math.cos(heading), y: 0, z: Math.sin(heading) };
    this.planeStart = { x: -this.planeDir.z * offset - this.planeDir.x * PLANE_ROUTE / 2, y: PLANE_ALTITUDE, z: this.planeDir.x * offset - this.planeDir.z * PLANE_ROUTE / 2 };
    this.plane = { ...this.planeStart };
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
      const dm = this.config.mode === 'deathmatch';
      const x = dm ? ARENA.minX + 2 + this.random() * (ARENA.maxX - ARENA.minX - 4) : -110 + this.random() * 220;
      const z = dm ? ARENA.minZ + 2 + this.random() * (ARENA.maxZ - ARENA.minZ - 4) : -110 + this.random() * 220;
      const p = groundPoint(x, z);
      if (terrainHeight(x, z) > .5 && clearSpawn(p, this.world)) return p;
    }
    const b = this.config.mode === 'deathmatch' ? { x0: ARENA.minX + 2, x1: ARENA.maxX - 2, z0: ARENA.minZ + 2, z1: ARENA.maxZ - 2 } : { x0: -110, x1: 110, z0: -110, z1: 110 };
    for (let x = b.x0; x <= b.x1; x += 2) for (let z = b.z0; z <= b.z1; z += 2) {
      const p = groundPoint(x, z);
      if (terrainHeight(x, z) > .5 && clearSpawn(p, this.world)) return p;
    }
    throw new Error('World has no safe spawn point');
  }
  private inArena(p: Vec3) { return inArena(p.x, p.z); }
  private makeWeapon(id: WeaponId, rarity = 0): WeaponState { return { id, ammo: WEAPONS[id].magazine, reserve: AMMO[id], rarity }; }
  private addActor(profile: PlayerProfile, bot: boolean) {
    if (this.actors.has(profile.id)) return;
    const spawn = this.spawnPoint(profile.id);
    const br = this.config.mode === 'battle-royale';
    const brain = bot ? this.makeBrain(spawn) : null;
    const state: ActorState = {
      id: profile.id, name: profile.name.slice(0, 28), color: profile.color, bot, connected: bot || profile.connected,
      pos: br ? { ...this.plane } : spawn, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
      hp: 100, armor: 0, helmet: 0, alive: true, grounded: !br, crouch: false, sprint: false, ads: false,
      stage: br ? 'plane' : 'ground', kills: 0, deaths: 0, damage: 0,
      weapons: br ? bot ? this.botLoadout() : [this.makeWeapon('pistol'), this.makeWeapon('machete')] : [this.makeWeapon('smg'), this.makeWeapon('pistol'), this.makeWeapon('machete')],
      slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 },
      reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: br ? 0 : this.time + (this.phase === 'playing' ? 2 : 5), lastInput: 0, shotHeat: 0,
    };
    if (brain) {
      if (brain.elite) { state.name = `${state.name.slice(0, 24)} ★`; state.helmet = br ? 60 : 0; }
      if (br) this.planLanding(brain);
    }
    this.actors.set(profile.id, { state, input: emptyInput(), lastSeq: -1, lastInputAt: -Infinity, lastAction: -1, nextShot: 0, wasFiring: false, lastShotPressId: -1, jumpQueued: false, jumpQueuedUntil: 0, triggerQueued: null, disconnectedAt: Infinity, lastHurt: 0, brain, boostUntil: 0, hot: 0, shotHeat: 0, adsAmount: 0, elimination: 0, stormExposure: 0, landedAt: -Infinity, shots: 0, hits: 0, headshots: 0, chests: 0, eliminatedAt: null, history: [] });
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
    if (action.type === 'jump') { if (s.stage === 'plane') this.drop(actor); else if (s.stage === 'ground') { actor.jumpQueued = true; actor.jumpQueuedUntil = this.time + .1; } }
    else if (action.type === 'trigger') { if (s.stage === 'ground' && actor.lastShotPressId < action.id) actor.triggerQueued = action; }
    else if (action.type === 'parachute') { if (s.stage === 'falling') s.stage = 'parachute'; }
    else if (action.type === 'slot') {
      if (Number.isInteger(action.slot) && action.slot >= 0 && action.slot < s.weapons.length && action.slot !== s.slot) {
        s.slot = action.slot; s.reloadUntil = 0; s.useUntil = 0; s.using = null; actor.shotHeat = s.shotHeat = 0; actor.adsAmount = 0;
      }
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
    actor.elimination = ++this.elimination; actor.eliminatedAt ??= this.time;
    this.emit({ type: 'notice', text: `${s.name} saiu da partida` });
  }

  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulator = Math.min(this.accumulator + Math.min(dt, .25), .5);
    while (this.accumulator + 1e-10 >= TICK) { this.accumulator -= TICK; this.fixedStep(); }
  }
  private fixedStep() {
    this.time += TICK; this.tick++;
    if (this.phase === 'countdown') { this.countdown = Math.max(0, this.countdown - TICK); if (this.countdown <= 0) { this.phase = 'playing'; this.matchStartedAt = this.time; this.emit({ type: 'notice', text: 'A partida começou!' }); } return; }
    if (this.phase !== 'playing') return;
    if (this.config.mode === 'battle-royale') { this.updatePlane(); this.updateZone(); }
    for (const actor of this.actors.values()) {
      const s = actor.state;
      if (actor.shotHeat > 0) actor.shotHeat = s.shotHeat = coolShotHeat(actor.shotHeat, TICK);
      if (!s.connected && actor.disconnectedAt >= 0 && this.time - actor.disconnectedAt >= 30) this.forfeit(actor);
      if (!s.alive) { if (this.config.mode === 'deathmatch' && s.respawnAt && this.time >= s.respawnAt && s.connected) this.respawn(actor); continue; }
      if (s.stage === 'plane') {
        s.pos = { ...this.plane };
        if (!actor.brain && s.connected && this.time - actor.lastInputAt <= .3) { s.yaw = actor.input.yaw; s.pitch = actor.input.pitch; }
        if (this.time > (actor.brain ? actor.brain.jumpAt : 12)) this.drop(actor);
        continue;
      }
      if (s.stage === 'falling' || s.stage === 'parachute') {
        if (actor.brain) this.botAir(actor);
        this.updateFall(actor);
        // Bots face their glide direction.
        if (actor.brain && Math.hypot(s.velocity.x, s.velocity.z) > 1) s.yaw = Math.atan2(-s.velocity.x, -s.velocity.z);
        continue;
      }
      if (s.bot) this.updateBot(actor);
      const inp = s.bot || s.connected && this.time - actor.lastInputAt <= .3 ? actor.input : emptyInput();
      const trigger = actor.triggerQueued;
      actor.triggerQueued = null;
      s.yaw = inp.yaw; s.pitch = inp.pitch;
      const before = actor.brain ? { x: s.pos.x, z: s.pos.z, h: terrainHeight(s.pos.x, s.pos.z) } : null;
      const queuedJump = actor.jumpQueued && this.time <= actor.jumpQueuedUntil;
      const consumeQueuedJump = queuedJump && s.grounded;
      moveActor(s, consumeQueuedJump ? { ...inp, jump: true } : inp, this.world, TICK, actor.boostUntil > this.time ? 1.15 : 1);
      if (before) {
        // Bots never wade into the pond or the sea, whatever their steering says.
        const h = terrainHeight(s.pos.x, s.pos.z);
        if (h < -.3 && h < before.h) { s.pos.x = before.x; s.pos.z = before.z; s.velocity.x = 0; s.velocity.z = 0; }
      }
      actor.jumpQueued = queuedJump && !consumeQueuedJump;
      if (this.config.mode === 'deathmatch') { s.pos.x = clamp(s.pos.x, ARENA.minX + .32, ARENA.maxX - .32); s.pos.z = clamp(s.pos.z, ARENA.minZ + .32, ARENA.maxZ - .32); }
      if (s.using && this.time >= s.useUntil) this.finishConsume(actor);
      if (s.reloadUntil && this.time >= s.reloadUntil) this.finishReload(actor);
      if (actor.hot > 0) { const heal = Math.min(actor.hot, 5 * TICK, 100 - s.hp); s.hp += heal; actor.hot -= heal; }
      // The storm bites once per second of exposure. Exposure carries over when
      // stepping back inside, so edge-hopping never dodges damage.
      if (this.config.mode === 'battle-royale' && Math.hypot(s.pos.x - this.zone.x, s.pos.z - this.zone.z) > this.zone.radius) {
        actor.stormExposure += TICK;
        if (actor.stormExposure >= 1 - 1e-9) { actor.stormExposure -= 1; this.damage(actor, this.zone.damage, null, 'storm', false); }
      }
      if (trigger) {
        s.yaw = trigger.yaw; s.pitch = trigger.pitch; s.lean = trigger.lean; s.ads = trigger.ads;
        actor.wasFiring = false;
      }
      const weaponId = s.weapons[s.slot].id;
      actor.adsAmount = advanceAds(weaponId, actor.adsAmount, s.ads && !s.sprint && !s.reloadUntil && weaponId !== 'machete', TICK);
      if (s.alive && (inp.fire || trigger)) this.fire(actor, trigger?.clientTime, trigger?.id);
      if (!inp.fire) actor.wasFiring = false;
      if (inp.jump) actor.input.jump = false;
      actor.history.push({ time: this.time, pos: { ...s.pos }, crouch: s.crouch, yaw: s.yaw });
      if (actor.history.length > 15) actor.history.shift();
    }
    this.updateProjectiles();
    for (const loot of this.loot) if (!loot.active && loot.respawnAt && this.time >= loot.respawnAt) { loot.active = true; loot.respawnAt = 0; }
    for (const [loot, until] of this.spentDrops) if (this.time >= until) { this.loot.splice(this.loot.indexOf(loot), 1); this.spentDrops.delete(loot); }
    if (this.config.mode === 'deathmatch' && this.time >= this.config.duration + 3) this.finish();
    if (this.config.mode === 'battle-royale') {
      const survivors = [...this.actors.values()].filter(a => a.state.alive);
      if (survivors.length === 0 || survivors.length === 1 && survivors[0].state.connected) this.finish();
    }
  }
  private updatePlane() {
    const along = clamp((this.time - 3) * PLANE_SPEED, 0, PLANE_ROUTE);
    this.plane = { x: this.planeStart.x + this.planeDir.x * along, y: PLANE_ALTITUDE, z: this.planeStart.z + this.planeDir.z * along };
  }
  private drop(a: ActorRuntime) {
    if (a.state.stage !== 'plane') return;
    a.state.stage = 'falling'; a.state.pos = { ...this.plane, y: this.plane.y - 3 };
    a.state.velocity = { x: this.planeDir.x * 8, y: -2, z: this.planeDir.z * 8 }; a.state.grounded = false;
  }
  private updateFall(a: ActorRuntime) {
    const s = a.state, inp = a.input, chute = s.stage === 'parachute';
    // The body faces where the player steers (the renderer turns the avatar by s.yaw).
    s.yaw = inp.yaw; s.pitch = a.brain ? 0 : inp.pitch;
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
      s.pos.y = ground; s.velocity = { x: 0, y: 0, z: 0 }; s.stage = 'ground'; s.grounded = true; a.landedAt = this.time;
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
    this.emit({ type: 'use', actor: s.id, item });
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
      a.chests++;
      this.spillChest(chest, s);
      this.emit({ type: 'pickup', actor: s.id, item: chest.id });
      return;
    }
    if (!loot) return;
    if (loot.kind === 'weapon') this.giveWeapon(s, loot.weapon || 'pistol', loot.rarity);
    else if (loot.kind === 'ammo') { for (const w of s.weapons) if (w.id !== 'machete') w.reserve = Math.min(AMMO[w.id] * 3, w.reserve + WEAPONS[w.id].magazine); }
    else if (loot.kind === 'armor') s.armor = Math.min(100, s.armor + 50);
    else if (loot.kind === 'helmet') s.helmet = Math.min(60, s.helmet + 60);
    else if (CONSUMABLES.includes(loot.kind)) s.consumables[loot.kind as ConsumableId] = Math.min(5, s.consumables[loot.kind as ConsumableId] + 1);
    loot.active = false; loot.respawnAt = this.config.mode === 'deathmatch' && !loot.from ? this.time + 30 : 0;
    this.emit({ type: 'pickup', actor: s.id, item: loot.id });
    // Chest drops never respawn. Keep them inactive briefly so clients can still
    // name the item in the pickup feed, then remove them from snapshots.
    if (loot.from) this.spentDrops.set(loot, this.time + 1);
  }
  // Like the legacy build, a chest bursts open and its contents land on the floor
  // in a fan facing whoever opened it; they are then picked up one by one.
  private spillChest(chest: ChestSpec, opener: ActorState) {
    const weapon = CHEST_WEAPONS[Math.floor(this.random() * CHEST_WEAPONS.length)];
    const roll = this.random(), rarity = weapon === 'slingshot' ? 3 : roll < .55 ? 1 : roll < .87 ? 2 : 3;
    let pickRoll = this.random() * CHEST_EXTRA.reduce((sum, [, weight]) => sum + weight, 0), extra: LootState['kind'] = 'bandage';
    for (const [kind, weight] of CHEST_EXTRA) { if ((pickRoll -= weight) < 0) { extra = kind; break; } }
    const kinds: LootState['kind'][] = ['weapon', 'ammo', extra];
    if (this.random() < .45) kinds.push(this.random() < .5 ? 'ammo' : 'rapadura');
    let heading = Math.atan2(opener.pos.x - chest.x, opener.pos.z - chest.z);
    if (!Number.isFinite(heading) || Math.hypot(opener.pos.x - chest.x, opener.pos.z - chest.z) < .2) heading = 0;
    const from = { x: chest.x, y: chest.y + .6, z: chest.z };
    kinds.forEach((kind, i) => {
      const spot = this.dropSpot(chest, heading, (i - (kinds.length - 1) / 2) * .82);
      this.loot.push({ id: `drop-${++this.dropSeq}`, kind, ...(kind === 'weapon' ? { weapon } : {}), ...spot,
        active: true, rarity: kind === 'weapon' ? rarity : 0, respawnAt: 0, from, spawnedAt: this.time });
    });
  }
  private dropSpot(chest: ChestSpec, heading: number, side: number): Vec3 {
    const from = { x: chest.x, y: chest.y + .6, z: chest.z };
    // Prefer the opener's side; swing around the chest if a wall or fixture is in the way.
    for (const turn of [0, .7, -.7, 1.4, -1.4, 2.4, -2.4, Math.PI]) {
      const a = heading + turn, x = chest.x + Math.sin(a) * 1.25 + Math.cos(a) * side, z = chest.z + Math.cos(a) * 1.25 - Math.sin(a) * side;
      const y = Math.max(terrainHeight(x, z), chest.y);
      const blocked = this.world.colliders.some(c => x > c.min.x - .22 && x < c.max.x + .22 && z > c.min.z - .22 && z < c.max.z + .22 &&
        c.max.y > y + .05 && c.min.y < y + 1);
      if (!blocked && hasLineOfSight(from, { x, y: y + .3, z }, this.world)) return { x, y, z };
    }
    return { x: chest.x, y: chest.y, z: chest.z };
  }
  private giveWeapon(s: ActorState, id: WeaponId, rarity: number) {
    const existing = s.weapons.find(w => w.id === id);
    if (existing) { existing.rarity = Math.max(existing.rarity, rarity); existing.reserve = Math.min(AMMO[id] * 3, existing.reserve + AMMO[id]); return; }
    if (s.weapons.length < 4) s.weapons.push(this.makeWeapon(id, rarity));
    else { const slot = s.weapons.findIndex(w => w.id !== 'machete' && w.id !== 'pistol'); s.weapons[slot < 0 ? 0 : slot] = this.makeWeapon(id, rarity); }
  }
  // `aim` is the bot path: a direction plus the legacy aim-error cone (radians).
  private fire(a: ActorRuntime, clientTime = a.input.clientTime, pressId = a.input.firePressId, aim?: { dir: Vec3; cone: number }) {
    const s = a.state, w = s.weapons[s.slot], def = w && WEAPONS[w.id];
    if (!w || !def || s.stage !== 'ground' || s.using || this.time < a.nextShot) return;
    if (!def.automatic && !s.bot && (a.wasFiring || pressId !== undefined && a.lastShotPressId >= pressId)) return;
    if (s.reloadUntil) {
      if (w.id !== 'shotgun' || w.ammo === 0) return;
      s.reloadUntil = 0;
    }
    a.wasFiring = true;
    if (!def.melee && w.ammo <= 0) { this.startReload(a); return; }
    const spread = shotSpread(w.id, a.adsAmount, Math.hypot(s.velocity.x, s.velocity.z), !s.grounded, a.shotHeat);
    if (!s.bot && !def.melee && !def.projectile) a.shotHeat = s.shotHeat = Math.min(1.2, a.shotHeat + shotHeatGain(w.id));
    if (pressId !== undefined) a.lastShotPressId = Math.max(a.lastShotPressId, pressId);
    if (s.protectionUntil > this.time) s.protectionUntil = this.time;
    a.nextShot = this.time + 60 / def.rpm;
    if (!def.melee) w.ammo--;
    a.shots++;
    const origin = center(s), forward = aim ? aim.dir : aimDirection(s.yaw, s.pitch);
    const range = w.id === 'pistol' || w.id === 'smg' ? 60 : w.id === 'slingshot' ? 25 : def.melee ? 0 : 90;
    if (range) this.alertBots(s.pos, range);
    origin.x += Math.cos(s.yaw) * s.lean * .32; origin.z -= Math.sin(s.yaw) * s.lean * .32;
    if (def.projectile) {
      this.projectiles.push({ owner: s.id, weapon: w.id, pos: { ...origin }, velocity: { x: forward.x * (def.speed || 50), y: forward.y * (def.speed || 50), z: forward.z * (def.speed || 50) }, life: 3 });
      this.emit({ type: 'shot', actor: s.id, weapon: w.id, origin, end: { x: origin.x + forward.x * 2, y: origin.y + forward.y * 2, z: origin.z + forward.z * 2 }, hit: false });
      return;
    }
    const pellets = def.pellets || 1; let hit = false, headHit = false, impact: Impact | null = null, endpoint = { x: origin.x + forward.x * def.range, y: origin.y + forward.y * def.range, z: origin.z + forward.z * def.range };
    for (let n = 0; n < pellets; n++) {
      const direction = aim ? this.cone(forward, aim.cone + (pellets > 1 ? def.spread * DEG * .5 : 0))
        : def.melee ? forward : norm({ x: forward.x + (this.random() * 2 - 1) * spread * DEG, y: forward.y + (this.random() * 2 - 1) * spread * DEG, z: forward.z + (this.random() * 2 - 1) * spread * DEG });
      const wall = raycastWorld(origin, direction, def.range, this.world);
      let best = wall?.distance ?? def.range, victim: ActorRuntime | null = null, head = false;
      for (const other of this.actors.values()) {
        const t = other.state;
        if (t.id === s.id || !t.alive || t.stage !== 'ground') continue;
        const rewind = !s.bot && !def.melee && this.time - clientTime <= .2 && this.time - clientTime >= 0
          ? [...other.history].reverse().find(h => h.time <= clientTime) : undefined;
        const found = this.rayActor(origin, direction, t, best, rewind?.pos, rewind?.crouch, rewind?.yaw, !!a.brain && !t.bot);
        if (found) { best = found.distance; victim = other; head = found.head; }
      }
      if (victim) {
        hit = true; headHit ||= head; endpoint = { x: origin.x + direction.x * best, y: origin.y + direction.y * best, z: origin.z + direction.z * best };
        const falloff = damageFalloff(w.id, best);
        this.damage(victim, def.damage * (head ? def.headMultiplier : 1) * (1 + w.rarity * .08) * falloff * (a.brain ? this.botDamage(a, victim) : 1), s.id, w.id, head);
      } else if (!hit) {
        impact = resolveImpact(origin, direction, wall, def.range);
        if (impact) endpoint = impact.point;
      }
    }
    if (hit) { a.hits++; if (headHit) a.headshots++; }
    const struck = !hit && impact ? { surface: impact.surface, normal: { x: Math.round(impact.normal.x * 1000) / 1000, y: Math.round(impact.normal.y * 1000) / 1000, z: Math.round(impact.normal.z * 1000) / 1000 } } : {};
    this.emit({ type: 'shot', actor: s.id, weapon: w.id, origin, end: endpoint, hit, ...struck });
  }
  private rayActor(origin: Vec3, d: Vec3, actor: ActorState, max: number, position = actor.pos, crouch = actor.crouch, yaw = actor.yaw, favoured = false): { distance: number; head: boolean } | null {
    const shape = favoured ? HIT_SHAPES.favoured : HIT_SHAPES.normal;
    const scale = crouch ? 1.8 / 1.3 : 1;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const wx = origin.x - position.x, wz = origin.z - position.z;
    const x = (cos * wx - sin * wz) * scale, y = (origin.y - position.y) * scale, z = (sin * wx + cos * wz) * scale;
    const vx = (cos * d.x - sin * d.z) * scale, vy = d.y * scale, vz = (sin * d.x + cos * d.z) * scale;
    let best = max, head = false;
    // Head sphere.
    {
      const px = x, py = y - shape.headY, pz = z - shape.headZ;
      const a = vx * vx + vy * vy + vz * vz, b = px * vx + py * vy + pz * vz, c = px * px + py * py + pz * pz - shape.headR ** 2;
      const disc = b * b - a * c;
      if (disc >= 0 && (-b + Math.sqrt(disc)) / a >= 0) { const near = Math.max(0, (-b - Math.sqrt(disc)) / a); if (near < best) { best = near; head = true; } }
    }
    // Body cylinder around the vertical axis, capped at the feet and the shoulders.
    {
      let low = 0, high = Infinity;
      const a = vx * vx + vz * vz, b = x * vx + z * vz, c = x * x + z * z - shape.bodyR ** 2;
      if (a < 1e-12) { if (c > 0) low = Infinity; }
      else {
        const disc = b * b - a * c;
        if (disc < 0) low = Infinity;
        else { low = Math.max(low, (-b - Math.sqrt(disc)) / a); high = Math.min(high, (-b + Math.sqrt(disc)) / a); }
      }
      if (Math.abs(vy) < 1e-12) { if (y < 0 || y > shape.bodyTop) low = Infinity; }
      else { const t0 = -y / vy, t1 = (shape.bodyTop - y) / vy; low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1)); }
      if (low <= high && high >= 0 && low < best) { best = Math.max(0, low); head = false; }
    }
    return best < max ? { distance: best, head } : null;
  }
  private damage(target: ActorRuntime, raw: number, attackerId: string | null, weapon: WeaponId | 'storm' | 'fall', head: boolean) {
    const s = target.state;
    if (!s.alive || s.protectionUntil > this.time || !Number.isFinite(raw) || raw <= 0) return;
    let damage = raw;
    const hadArmor = s.armor > 0;
    if (head && s.helmet > 0) { const blocked = Math.min(s.helmet, damage * .4); s.helmet -= blocked; damage -= blocked; }
    if (s.armor > 0) { const blocked = Math.min(s.armor, damage); s.armor -= blocked; damage -= blocked; }
    s.hp = Math.max(0, s.hp - damage);
    const attacker = attackerId && attackerId !== s.id ? this.actors.get(attackerId) : null;
    if (attacker) attacker.state.damage += raw;
    target.lastHurt = this.time;
    const brain = target.brain;
    if (brain && attacker) {
      // Legacy hurt(): remember the attacker, get alert toward them and rethink soon.
      brain.lastAttacker = attacker.state.id; brain.hurtUntil = this.time + 1.5; brain.recentDmg += damage;
      brain.alertUntil = this.time + 3; brain.hearPos = { ...attacker.state.pos };
      if (!brain.sees) brain.thinkAt = Math.min(brain.thinkAt, this.time + .08);
    }
    if (s.using) { s.using = null; s.useUntil = 0; }
    this.emit({ type: 'damage', actor: attackerId || '', target: s.id, amount: Math.round(raw * 10) / 10, head, pos: { ...s.pos, y: s.pos.y + 1 }, ...(hadArmor && s.armor <= 0 ? { armorBreak: true } : {}) });
    if (s.hp <= 0) this.kill(target, attacker || null, weapon);
  }
  private kill(target: ActorRuntime, killer: ActorRuntime | null, weapon: WeaponId | 'storm' | 'fall') {
    const s = target.state;
    if (!s.alive) return;
    s.alive = false; s.hp = 0; s.deaths++; s.using = null; s.reloadUntil = 0; target.jumpQueued = false; target.triggerQueued = null;
    if (killer && killer !== target) killer.state.kills++;
    target.elimination = ++this.elimination; target.eliminatedAt ??= this.time;
    if (this.config.mode === 'deathmatch') s.respawnAt = this.time + 3;
    const from = killer && killer !== target ? killer.state.pos : null;
    this.emit({ type: 'kill', actor: killer?.state.id || null, target: s.id, weapon,
      ...(from ? { from: { ...from }, distance: Math.round(Math.hypot(from.x - s.pos.x, from.y - s.pos.y, from.z - s.pos.z)) } : {}) });
  }
  private respawn(a: ActorRuntime) {
    const s = a.state; s.pos = this.spawnPoint(s.id); s.velocity = { x: 0, y: 0, z: 0 };
    s.hp = 100; s.armor = 0; s.helmet = 0; s.alive = true; s.grounded = true; s.stage = 'ground';
    s.crouch = false; s.sprint = false; s.ads = false; s.lean = 0;
    s.weapons = [this.makeWeapon('smg'), this.makeWeapon('pistol'), this.makeWeapon('machete')]; s.slot = 0;
    s.reloadUntil = 0; s.useUntil = 0; s.using = null;
    s.protectionUntil = this.time + 2; s.respawnAt = 0; a.nextShot = this.time; a.wasFiring = false;
    a.input = emptyInput(); a.lastInputAt = -Infinity; a.lastShotPressId = -1; a.jumpQueued = false; a.triggerQueued = null; a.hot = 0; a.shotHeat = s.shotHeat = 0; a.adsAmount = 0; a.boostUntil = 0; a.history = [];
    if (a.brain) a.brain = createBrain(a.brain.elite, a.brain.skill, s.pos, a.brain.flank);
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
        const hit = this.rayActor(previous, dir, other.state, best, undefined, undefined, undefined, !!this.actors.get(p.owner)?.brain && !other.state.bot);
        if (hit) { best = hit.distance; victim = other; head = hit.head; }
      }
      if (victim) {
        const owner = this.actors.get(p.owner);
        if (owner) { owner.hits++; if (head) owner.headshots++; }
        this.damage(victim, WEAPONS[p.weapon].damage * (head ? WEAPONS[p.weapon].headMultiplier : 1), p.owner, p.weapon, head);
      }
      const underground = p.pos.y < terrainHeight(p.pos.x, p.pos.z);
      const landed = victim ? null : resolveImpact(previous, dir, wall || (underground ? { distance: length, collider: { id: 'terrain', min: p.pos, max: p.pos, material: 'earth' } } : null), length);
      if (landed) this.emit({ type: 'impact', actor: p.owner, weapon: p.weapon, pos: landed.point, surface: landed.surface, normal: landed.normal });
      if (victim || wall || landed || underground || p.life <= 0) this.projectiles.splice(i, 1);
    }
  }
  // ---------------- bots (ported from the legacy build) ----------------
  private rnd(a: number, b: number) { return a + (b - a) * this.random(); }
  private makeBrain(pos: Vec3): BotBrain {
    const elite = this.botCount++ < this.diff.elites;
    return createBrain(elite, elite ? this.rnd(.8, 1.2) : this.rnd(1.6, 2.5), pos, this.random() < .5 ? 1 : -1);
  }
  private botLoadout(): WeaponState[] {
    let roll = this.random() * BOT_START.reduce((sum, [, w]) => sum + w, 0), id: WeaponId = 'pistol';
    for (const [weapon, weight] of BOT_START) if ((roll -= weight) < 0) { id = weapon; break; }
    const r = this.random(), rarity = r < .7 ? 0 : r < .92 ? 1 : r < .99 ? 2 : 3;
    return id === 'pistol' ? [this.makeWeapon('pistol', rarity), this.makeWeapon('machete')] : [this.makeWeapon(id, rarity), this.makeWeapon('pistol'), this.makeWeapon('machete')];
  }
  // Legacy makeBot(): land on a loot spot at least 26 m from other bots and jump
  // from the plane when its path passes by.
  // No water within `r` metres (the touchdown spot and its surroundings are dry).
  private dryAround(x: number, z: number, r = 4) {
    if (terrainHeight(x, z) < .3) return false;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (terrainHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) < 0) return false; }
    return true;
  }
  private planLanding(b: BotBrain) {
    const S = this.planeStart, d = this.planeDir;
    const side = (p: Vec3) => Math.abs((p.x - S.x) * -d.z + (p.z - S.z) * d.x);
    // Only spots within gliding reach of the route (about 100 m from 115 m up).
    // Open-sky spots only: a parachute aimed at loot under a roof lands on the roof.
    const spots = [...this.world.loot, ...this.world.chests].filter(p => this.dryAround(p.x, p.z) && Math.abs(p.y - terrainHeight(p.x, p.z)) < .35 && Math.abs(p.x) < 118 && Math.abs(p.z) < 118 && side(p) < 90 && !this.roofed(p.x, p.y, p.z, 1.5));
    if (!spots.length) { b.land = { x: this.rnd(-60, 60), y: 0, z: this.rnd(-60, 60) }; b.jumpAt = this.rnd(5, 12); return; }
    let spot = spots[Math.floor(this.random() * spots.length)];
    for (let k = 0; k < 30 && this.landings.some(l => Math.hypot(l.x - spot.x, l.z - spot.z) < 26); k++) spot = spots[Math.floor(this.random() * spots.length)];
    this.landings.push(spot);
    b.land = { x: spot.x + this.rnd(-3, 3), y: 0, z: spot.z + this.rnd(-3, 3) };
    if (!this.dryAround(b.land.x, b.land.z) || this.roofed(b.land.x, spot.y, b.land.z, 1.5)) b.land = { x: spot.x, y: 0, z: spot.z };
    const along = (b.land.x - S.x) * d.x + (b.land.z - S.z) * d.z;
    b.jumpAt = clamp(3 + (along - 20) / PLANE_SPEED + this.rnd(-1.2, .8), 4.5, 3 + PLANE_ROUTE / PLANE_SPEED - 1);
  }
  private botAir(a: ActorRuntime) {
    const s = a.state, b = a.brain!, land = b.land || s.pos;
    const dx = land.x - s.pos.x, dz = land.z - s.pos.z, dist = Math.hypot(dx, dz), height = s.pos.y - terrainHeight(land.x, land.z);
    const inp = a.input = { ...emptyInput(), seq: this.tick, clientTime: this.time };
    if (dist > .5) s.yaw = Math.atan2(-dx, -dz);
    inp.yaw = s.yaw; inp.moveZ = dist > 1.5 ? Math.min(1, dist / 10) : 0;
    // Dive while the landing spot is within gliding reach.
    inp.sprint = s.stage === 'falling' && dist < Math.max(0, height - 55) * .45 + 55;
  }
  private botDamage(a: ActorRuntime, victim: ActorRuntime): number {
    const human = !victim.state.bot || this.config.mode === 'deathmatch';
    if (human) return (a.brain!.elite ? .62 : .45) * this.diff.dmg;
    // Legacy used .15/.1; the quadruped hit volumes are larger than the old
    // humanoids, so bot-vs-bot is scaled down to keep legacy's attrition rate.
    return victim.brain?.elite ? .07 : .1;
  }
  private cone(dir: Vec3, angle: number): Vec3 {
    if (angle <= 0) return dir;
    const up = Math.abs(dir.y) < .95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const right = norm({ x: dir.y * up.z - dir.z * up.y, y: dir.z * up.x - dir.x * up.z, z: dir.x * up.y - dir.y * up.x });
    const u2 = { x: right.y * dir.z - right.z * dir.y, y: right.z * dir.x - right.x * dir.z, z: right.x * dir.y - right.y * dir.x };
    const r = Math.tan(angle) * Math.sqrt(this.random()), th = this.random() * Math.PI * 2;
    return norm({ x: dir.x + right.x * r * Math.cos(th) + u2.x * r * Math.sin(th), y: dir.y + right.y * r * Math.cos(th) + u2.y * r * Math.sin(th), z: dir.z + right.z * r * Math.cos(th) + u2.z * r * Math.sin(th) });
  }
  private alertBots(pos: Vec3, range: number) {
    for (const other of this.actors.values()) {
      const b = other.brain;
      if (!b || !other.state.alive || b.sees || Math.hypot(other.state.pos.x - pos.x, other.state.pos.y - pos.y, other.state.pos.z - pos.z) >= range) continue;
      b.alertUntil = this.time + 3; b.hearPos = { ...pos };
    }
  }
  private botEye(s: ActorState): Vec3 { return center(s); }
  private botCanSee(s: ActorState, t: ActorState) {
    return this.grid.sees(this.botEye(s), { x: t.pos.x, y: t.pos.y + 1.0 * (t.crouch ? 1.3 / 1.8 : 1), z: t.pos.z });
  }
  private walkable(x: number, z: number) {
    if (this.config.mode === 'deathmatch') return inArena(x, z, .5) && terrainHeight(x, z) > .3;
    return Math.abs(x) < 118 && Math.abs(z) < 118 && terrainHeight(x, z) > .3;
  }
  // Indoor loot is reached through a doorway: the nearest outdoor spot with a straight
  // knee-height line to the item. Loot with no such line is left alone by bots.
  private approach(id: string, p: Vec3): Vec3 | 'open' | 'none' {
    const cached = this.approaches.get(id);
    if (cached) return cached;
    let result: Vec3 | 'open' | 'none' = 'open';
    if (this.roofed(p.x, p.y, p.z)) {
      result = 'none';
      const low = { x: p.x, y: p.y + .7, z: p.z };
      let bd = Infinity;
      for (let k = 0; k < 32; k++) {
        const a = k / 32 * Math.PI * 2;
        for (const r of [2.5, 4, 5.5, 7, 9]) {
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = this.standAt(x, z, p.y);
          if (r >= bd || Math.abs(y - p.y) > 1 || !this.walkable(x, z) || this.pointBlocked(x, y, z) || this.roofed(x, y, z)) continue;
          if (this.grid.sees({ x, y: y + .7, z }, low)) { bd = r; result = { x, y, z }; break; }
        }
      }
    }
    this.approaches.set(id, result);
    return result;
  }

  // Something overhead within `margin` metres (a roof or an upper floor).
  private roofed(x: number, y: number, z: number, margin = 0) {
    return this.grid.near(x - margin, z - margin, x + margin, z + margin).some(c => x > c.min.x - margin && x < c.max.x + margin &&
      z > c.min.z - margin && z < c.max.z + margin && c.min.y > y + 1);
  }
  // Standing height at (x, z) for someone at height `top`: terrain or the highest collider top within a step.
  private standAt(x: number, z: number, top: number) {
    let ground = terrainHeight(x, z);
    for (const c of this.grid.near(x, z, x, z)) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= top + .45) ground = Math.max(ground, c.max.y);
    return ground;
  }
  // A bot stranded on a roof or wall top walks to the nearest point where the ground drops away.
  private dropPoint(s: ActorState): Vec3 | null {
    let best: Vec3 | null = null, bd = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      for (let r = 1.5; r <= 10; r += 1.5) {
        const x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r;
        if (!this.walkable(x, z)) break;
        if (this.standAt(x, z, s.pos.y) < s.pos.y - 1.5) { if (r < bd) { bd = r; best = { x, y: s.pos.y, z }; } break; }
      }
    }
    return best;
  }

  private pointBlocked(x: number, y: number, z: number) {
    return this.grid.near(x - .8, z - .8, x + .8, z + .8).some(c => x > c.min.x - .35 && x < c.max.x + .35 && z > c.min.z - .35 && z < c.max.z + .35 && y + .6 > c.min.y && y + .3 < c.max.y);
  }
  // Legacy safeCircle(): the storm's next circle (Correria uses the arena rectangle instead).
  private safeCircle() {
    if (this.config.mode === 'deathmatch') return { x: ARENA_CENTER.x, z: ARENA_CENTER.z, r: Math.min(ARENA.maxX - ARENA.minX, ARENA.maxZ - ARENA.minZ) / 2 };
    if (this.zone.phase >= STORM.length) return { x: this.zone.x, z: this.zone.z, r: 0 };
    return { x: this.zone.nextX, z: this.zone.nextZ, r: this.zone.nextRadius };
  }
  private randomGoal(s: ActorState): Vec3 {
    const sc = this.safeCircle(), spots = this.config.mode === 'deathmatch' ? this.world.loot.filter(l => this.inArena(l)) : [...this.world.loot, ...this.world.chests];
    for (let k = 0; k < 20; k++) {
      let x: number, z: number;
      if (this.random() < .3 && spots.length) { const p = spots[Math.floor(this.random() * spots.length)]; x = p.x; z = p.z; }
      else if (this.config.mode === 'deathmatch') { x = ARENA.minX + 3 + this.random() * (ARENA.maxX - ARENA.minX - 6); z = ARENA.minZ + 3 + this.random() * (ARENA.maxZ - ARENA.minZ - 6); }
      else { const a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * sc.r * .85; x = sc.x + Math.cos(a) * r; z = sc.z + Math.sin(a) * r; }
      if (!this.walkable(x, z) || this.pointBlocked(x, terrainHeight(x, z), z)) continue;
      if (this.config.mode !== 'deathmatch' && Math.hypot(x - sc.x, z - sc.z) > sc.r * .95 && k < 15) continue;
      return groundPoint(x, z);
    }
    return this.walkable(sc.x, sc.z) ? groundPoint(sc.x, sc.z) : { ...s.pos };
  }
  // Legacy zoneNeed(): only head in when the storm will catch this bot otherwise.
  private zoneNeed(s: ActorState): Vec3 | null {
    if (this.config.mode !== 'battle-royale') return null;
    const sc = this.safeCircle(), d = Math.hypot(s.pos.x - sc.x, s.pos.z - sc.z);
    const outNow = Math.hypot(s.pos.x - this.zone.x, s.pos.z - this.zone.z) > this.zone.radius * .93;
    if (d < sc.r * .8 && !outNow) return null;
    const phase = STORM[this.zone.phase], left = !this.zone.shrinking ? this.zone.timeLeft + (phase ? phase.shrink : 0) : this.zone.timeLeft;
    const need = Math.max(0, d - sc.r * .6) / 5.6;
    if (!outNow && left > need * 1.6 + 10) return null;
    const k = d > 0 ? sc.r * .55 / d : 0;
    return groundPoint(sc.x + (s.pos.x - sc.x) * k, sc.z + (s.pos.z - sc.z) * k);
  }
  private heals(s: ActorState) { return s.consumables.bandage + s.consumables.medkit + s.consumables.rapadura; }
  private botHeal(a: ActorRuntime) {
    const s = a.state;
    if (s.using) return;
    if (s.hp < 55 && s.consumables.medkit) this.startConsume(a, 'medkit');
    else if (s.hp < 75 && s.consumables.bandage) this.startConsume(a, 'bandage');
    else if (s.consumables.rapadura) this.startConsume(a, 'rapadura');
    else if (s.consumables.medkit) this.startConsume(a, 'medkit');
  }
  private bestWeapon(s: ActorState) {
    let best = s.slot, value = -1;
    s.weapons.forEach((w, i) => { const v = botValue(w.id, w.rarity) + (w.id === 'machete' ? -5 : 0); if (v > value) { value = v; best = i; } });
    return best;
  }
  private findLoot(s: ActorState): BotBrain['loot'] {
    const dm = this.config.mode === 'deathmatch';
    let best: BotBrain['loot'] = null, bd = dm ? 14 : 36;
    const current = s.weapons[this.bestWeapon(s)], value = botValue(current.id, current.rarity);
    const b = this.actors.get(s.id)?.brain, ignored = (id: string) => (b?.ignore.get(id) ?? -1) > this.time;
    for (const item of this.loot) {
      if (!item.active || ignored(item.id) || this.approach(item.id, item) === 'none') continue;
      let want = false;
      if (item.kind === 'weapon') want = !!item.weapon && BOT_WEAPON[item.weapon].tier > 0 && botValue(item.weapon, item.rarity) > value;
      else if (item.kind === 'armor' || item.kind === 'acai') want = s.armor < 100;
      else if (item.kind === 'helmet') want = s.helmet <= 0;
      else if (item.kind === 'bandage' || item.kind === 'medkit' || item.kind === 'rapadura') want = this.heals(s) < 4;
      if (!want) continue;
      const d = Math.hypot(item.x - s.pos.x, item.z - s.pos.z);
      if (d < bd && Math.abs(item.y - s.pos.y) < LEVEL) { bd = d; best = { id: item.id, kind: 'item', pos: { x: item.x, y: item.y, z: item.z } }; }
    }
    if (!dm && (BOT_WEAPON[current.id].tier < 3 || s.armor < 50)) for (const c of this.world.chests) {
      if (this.openedChests.has(c.id) || ignored(c.id) || this.approach(c.id, c) === 'none') continue;
      const d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
      if (d < bd && Math.abs(c.y - s.pos.y) < LEVEL) { bd = d; best = { id: c.id, kind: 'chest', pos: { x: c.x, y: c.y, z: c.z } }; }
    }
    return best;
  }
  private findCover(s: ActorState, threat: ActorState): Vec3 | null {
    let best: Vec3 | null = null, score = Infinity;
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2 + this.rnd(-.1, .1), r = k % 2 ? 3 : 6.5, x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r;
      if (!this.walkable(x, z)) continue;
      const y = Math.max(terrainHeight(x, z), s.pos.y - .5);
      if (this.pointBlocked(x, y, z)) continue;
      const eye = { x, y: y + 1, z }, dx = threat.pos.x - x, dy = threat.pos.y + 1.2 - eye.y, dz = threat.pos.z - z, L = Math.hypot(dx, dy, dz);
      const hit = this.grid.ray(eye, { x: dx / L, y: dy / L, z: dz / L }, Math.min(L, 3.6));
      if (hit === null || hit > L - .5 || hit > 3.5) continue;
      const sc = r + Math.max(0, 8 - L) * .5;
      if (sc < score) { score = sc; best = { x, y, z }; }
    }
    return best;
  }
  // When a wall blocks the straight line, head for the nearest visible corner of
  // that wall segment. Walls are split at openings, so this usually is a doorway.
  private route(s: ActorState, goal: Vec3, avoid: Vec3 | null = null): Vec3 | null {
    const low = { x: s.pos.x, y: s.pos.y + .7, z: s.pos.z }, dx = goal.x - s.pos.x, dz = goal.z - s.pos.z, L = Math.hypot(dx, dz);
    if (L < 1.5 || this.grid.ray(low, { x: dx / L, y: 0, z: dz / L }, L) === null) return null;
    const c = this.grid.lastHit;
    if (!c) return null;
    const m = .85, corners = [[c.min.x - m, c.min.z - m], [c.min.x - m, c.max.z + m], [c.max.x + m, c.min.z - m], [c.max.x + m, c.max.z + m]];
    let best: Vec3 | null = null, score = Infinity;
    for (const [x, z] of corners) {
      const d = Math.hypot(x - s.pos.x, z - s.pos.z);
      // Never send a bot straight back to the corner it just used.
      if (d < 1.2 || !this.walkable(x, z) || (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 1)) continue;
      const y = Math.max(terrainHeight(x, z), s.pos.y);
      if (this.pointBlocked(x, y, z) || !this.grid.sees(low, { x, y: low.y, z })) continue;
      const sc = d + Math.hypot(goal.x - x, goal.z - z);
      if (sc < score) { score = sc; best = { x, y, z }; }
    }
    return best;
  }
  private probe(s: ActorState, angle: number) {
    const dir = { x: -Math.sin(angle), y: 0, z: -Math.cos(angle) };
    // Three rays as wide as the movement capsule, so corners and door jambs count as blocked.
    for (const side of [0, -.28, .28]) {
      const origin = { x: s.pos.x + dir.z * side, y: s.pos.y + .6, z: s.pos.z - dir.x * side };
      if (this.grid.ray(origin, dir, 1.3) !== null) return false;
    }
    const x = s.pos.x + dir.x * 1.3, z = s.pos.z + dir.z * 1.3;
    // Shores (and the Correria fence) are walls for bots: never step down toward
    // water, but always allow climbing out of it.
    const ahead = terrainHeight(x, z);
    if (ahead < .15 && ahead < terrainHeight(s.pos.x, s.pos.z)) return false;
    return this.config.mode !== 'deathmatch' || this.inArena({ x, y: 0, z });
  }
  private botThink(a: ActorRuntime) {
    const s = a.state, b = a.brain!, diff = this.diff, dm = this.config.mode === 'deathmatch';
    const weapon = BOT_WEAPON[s.weapons[s.slot]?.id || 'pistol'];
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    let best: ActorRuntime | null = null, bd = Infinity;
    for (const other of this.actors.values()) {
      const t = other.state;
      if (t.id === s.id || !t.alive || t.stage !== 'ground' || t.protectionUntil > this.time) continue;
      // A human who just touched down gets a moment to find their feet, unless they already shot this bot.
      if (!t.bot && this.time - other.landedAt < LANDING_GRACE && b.lastAttacker !== t.id) continue;
      // Legacy bots hunted humans and only fought other bots up close or when shot by them.
      const human = !t.bot || dm;
      const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z, d = Math.hypot(dx, dz);
      if (d > weapon.sight * (human ? diff.sight : .55)) continue;
      if (!human && d > 18 && b.lastAttacker !== t.id) continue;
      const moving = Math.hypot(t.velocity.x, t.velocity.z) > .5;
      const heard = human && moving && d < (t.sprint ? (b.elite ? 20 : 15) : t.crouch ? (b.elite ? 4 : 2) : (b.elite ? 9 : 6));
      if (d > weapon.sight * (t.crouch && !moving ? .6 : 1)) continue;
      if (this.time >= b.alertUntil && !heard && d > 6 && (dx * fx + dz * fz) / d < Math.cos(1.35)) continue;
      if (!this.botCanSee(s, t)) continue;
      const score = d * (t.id === b.target ? .65 : 1) * (t.hp < 50 ? .8 : 1);
      if (score < bd) { bd = score; best = other; }
    }
    if ((best?.state.id || null) !== b.target) {
      if (best) {
        const d = Math.hypot(best.state.pos.x - s.pos.x, best.state.pos.z - s.pos.z), human = !best.state.bot || dm;
        b.reactT = (b.elite ? this.rnd(.25, .4) + d / 220 : this.rnd(.45, .75) + d / 140) + (human ? diff.react : .4);
        // Humans always get a readable tell: the alert pop stays up this long before the first shot.
        if (human) { b.reactT = Math.max(b.reactT, BOT_TELL); this.emit({ type: 'alert', actor: s.id, target: best.state.id, delay: Math.round(b.reactT * 100) / 100 }); }
        b.trackT = 0;
      }
      b.target = best?.state.id || null;
    }
    b.sees = !!best;
    if (best) { b.lastSeen = { ...best.state.pos }; b.lastSeenAt = this.time; b.loot = null; }
    b.zoneGoal = this.zoneNeed(s);
    if (!best && !b.zoneGoal && b.mode !== 'cover') {
      const loot = b.loot;
      if (loot && (loot.kind === 'item' ? !this.loot.some(l => l.id === loot.id && l.active) : this.openedChests.has(loot.id))) b.loot = null;
      if (!b.loot && this.time - b.lootScanAt > 1.2) { b.lootScanAt = this.time; b.loot = this.findLoot(s); }
    }
  }
  private updateBot(a: ActorRuntime) {
    const s = a.state, b = a.brain!, dt = TICK, now = this.time;
    b.recentDmg *= Math.exp(-dt * .8);
    // Pick the best gun; bots never run dry (legacy bots had endless reserves).
    const slot = this.bestWeapon(s);
    if (slot !== s.slot && !s.reloadUntil) s.slot = slot;
    const w = s.weapons[s.slot], def = WEAPONS[w.id], bw = BOT_WEAPON[w.id];
    if (def.ammo && w.reserve < def.magazine) w.reserve = AMMO[w.id];
    if (now >= b.thinkAt) { b.thinkAt = now + this.rnd(.15, .25); this.botThink(a); }
    const target = b.target ? this.actors.get(b.target) : undefined, t = target?.state;
    const fighting = !!(t && t.alive && b.sees && t.stage === 'ground' && t.protectionUntil <= now);
    b.trackT = fighting ? b.trackT + dt : Math.max(0, b.trackT - dt * 2);
    let mx = 0, mz = 0, speed = 0, face = s.yaw, crouch = false, jump = false, pitch = s.pitch * Math.exp(-4 * dt);
    const atCover = b.mode === 'cover' && !!b.coverPt && Math.hypot(b.coverPt.x - s.pos.x, b.coverPt.z - s.pos.z) <= .7;
    if (s.using) {
      crouch = true;
      if (fighting && t) face = Math.atan2(-(t.pos.x - s.pos.x), -(t.pos.z - s.pos.z));
    } else if (b.mode === 'cover' && b.coverPt) {
      const dx = b.coverPt.x - s.pos.x, dz = b.coverPt.z - s.pos.z, dist = Math.hypot(dx, dz);
      if (dist > .7) { mx = dx / dist; mz = dz / dist; speed = 5.8; face = Math.atan2(-mx, -mz); }
      else { crouch = true; if (this.heals(s) > 0 && s.hp < 70 && now >= b.hurtUntil) this.botHeal(a); }
      if (t && t.alive && dist <= .7) face = Math.atan2(-(t.pos.x - s.pos.x), -(t.pos.z - s.pos.z));
      if (now >= b.coverUntil && !s.reloadUntil && !s.using && (s.hp >= 60 || this.heals(s) === 0)) { b.mode = 'fight'; b.coverPt = null; b.flank = -b.flank; }
    } else if (fighting && t) {
      b.mode = 'fight';
      const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z, dist = Math.hypot(dx, dz) || 1, ux = dx / dist, uz = dz / dist;
      const reloading = !!s.reloadUntil;
      // Never stand still in the open while reloading: back off and keep side-stepping.
      const forward = reloading ? -1 : dist > bw.range * 1.25 ? 1 : dist < bw.range * .55 ? -1 : 0;
      if (reloading && b.strafeDir === 0) b.strafeDir = this.random() < .5 ? -1 : 1;
      if (now >= b.strafeUntil) {
        b.strafeDir = this.random() < .25 && !reloading ? 0 : this.random() < .5 ? -1 : 1; b.strafeUntil = now + this.rnd(.35, 1);
        if (s.grounded && this.random() < .12 && dist < 25) jump = true;
      }
      mx = ux * forward - uz * b.strafeDir * .9; mz = uz * forward + ux * b.strafeDir * .9; speed = forward === 1 ? 4.4 : 3.6;
      face = Math.atan2(-dx, -dz);
      pitch = Math.atan2(t.pos.y + 1 - (s.pos.y + 1.42), dist);
      if (b.strafeDir === 0 && dist > 16 && !reloading) crouch = true;
      // A reload that starts mid-fight looks for cover at once, whatever the search cooldown.
      const reloadStarted = reloading && !b.reloading;
      if ((now >= b.coverCdUntil || reloadStarted) && ((s.hp < (b.elite ? 65 : 50) && this.heals(s) > 0) || (reloading && dist < 35) || b.recentDmg > 45)) {
        const cover = this.findCover(s, t); b.coverCdUntil = now + 5;
        if (cover) { b.mode = 'cover'; b.coverPt = cover; b.coverUntil = now + this.rnd(1.2, 2.4); }
      }
    } else {
      if (b.mode === 'fight') b.mode = 'roam';
      let g: Vec3 | null = null, run = false, kind: 'zone' | 'chase' | 'hear' | 'loot' | 'goal' = 'goal';
      if (b.zoneGoal) { g = b.zoneGoal; run = true; kind = 'zone'; }
      else if (b.lastSeen && now - b.lastSeenAt < 5) {
        // Push the last sighting, flanking to one side for the first seconds.
        const px = -(b.lastSeen.z - s.pos.z), pz = b.lastSeen.x - s.pos.x, pl = Math.hypot(px, pz) || 1, k = now - b.lastSeenAt < 2.5 ? 6 * b.flank : 0;
        g = { x: b.lastSeen.x + px / pl * k, y: b.lastSeen.y, z: b.lastSeen.z + pz / pl * k }; run = true; kind = 'chase';
      } else if (now < b.alertUntil && b.hearPos) { g = b.hearPos; kind = 'hear'; }
      else if (b.loot) {
        g = b.loot.pos; kind = 'loot';
        const door = this.approach(b.loot.id, b.loot.pos);
        // Walk to the doorway spot first unless the item is already in plain view.
        if (typeof door === 'object' && Math.hypot(door.x - s.pos.x, door.z - s.pos.z) > 1 &&
          !this.grid.sees({ x: s.pos.x, y: s.pos.y + .7, z: s.pos.z }, { x: g.x, y: g.y + .7, z: g.z })) g = door;
      }
      else { if (!b.goal) b.goal = this.randomGoal(s); g = b.goal; }
      // Up on a roof with the goal below: head for the nearest edge and drop off instead of circling.
      if (g.y < s.pos.y - 1.5 && s.grounded && s.pos.y - terrainHeight(s.pos.x, s.pos.z) > 2.2) {
        if (!b.drop || Math.hypot(b.drop.x - s.pos.x, b.drop.z - s.pos.z) < .6) b.drop = this.dropPoint(s);
        if (b.drop) { g = b.drop; run = false; kind = 'goal'; }
      } else b.drop = null;
      // Commit to a detour corner until it is reached or lost from sight; re-planning every
      // few frames made bots flip between the two ends of a wall.
      const goalMoved = !b.routeFor || Math.hypot(b.routeFor.x - g.x, b.routeFor.z - g.z) > 2;
      const viaLost = !!b.via && !this.grid.sees({ x: s.pos.x, y: s.pos.y + .7, z: s.pos.z }, { x: b.via.x, y: s.pos.y + .7, z: b.via.z });
      if (goalMoved || viaLost || (!b.via && now >= b.routeAt)) {
        b.routeAt = now + .3; b.routeFor = { ...g }; b.via = this.route(s, g, b.lastVia);
      }
      if (b.via && Math.hypot(b.via.x - s.pos.x, b.via.z - s.pos.z) < 1) { b.lastVia = b.via; b.via = null; b.routeAt = now; }
      // Loot that stays out of reach (behind walls with no door found) is dropped for a while.
      if (kind === 'loot' && b.loot) {
        if (b.lootFor !== b.loot.id) { b.lootFor = b.loot.id; b.lootSince = now; }
        else if (now - b.lootSince > 8) { b.ignore.set(b.loot.id, now + 30); b.loot = null; b.via = null; }
      }
      const step = b.via || g, dist = Math.hypot(g.x - s.pos.x, g.z - s.pos.z);
      const dx = step.x - s.pos.x, dz = step.z - s.pos.z, stepDist = Math.hypot(dx, dz) || 1;
      if (dist < 1.3) {
        if (kind === 'goal') b.goal = null;
        else if (kind === 'hear') { b.hearPos = null; b.alertUntil = -1; }
        else if (kind === 'loot' && b.loot && g !== b.loot.pos) b.routeAt = now; // at the doorway: next step is the item
        else if (kind === 'loot' && b.loot) {
          if (Math.abs(g.y - s.pos.y) < 1.6) this.interact(a, b.loot.id);
          b.loot = null; b.lootScanAt = now - .9;
        } else if (kind === 'chase') b.lastSeenAt = -99;
      } else { mx = dx / stepDist; mz = dz / stepDist; speed = run ? 5.8 : 4.2; }
      if (now < b.alertUntil && b.hearPos && !run) face = Math.atan2(-(b.hearPos.x - s.pos.x), -(b.hearPos.z - s.pos.z));
      else if (speed > 0) face = Math.atan2(-mx, -mz);
      if (this.heals(s) > 0 && s.hp < 75 && now >= b.hurtUntil && !run) this.botHeal(a);
    }
    if (crouch) speed = Math.min(speed, 2);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      if (now >= b.avoidAt) {
        b.avoidAt = now + .15;
        const angle = Math.atan2(-mx, -mz);
        // Hold a side-step for at least 0.6 s before straightening, so bots do not wobble along walls.
        if (this.probe(s, angle + b.avoidOff * .6)) { if (b.avoidOff && now >= b.avoidHold && this.probe(s, angle)) b.avoidOff = 0; }
        else {
          let found = false; const sign = this.random() < .5 ? 1 : -1;
          for (const o of [1, -1, 2, -2, 3, -3]) if (this.probe(s, angle + o * sign * .6)) { b.avoidOff = o * sign; b.avoidHold = now + .6; found = true; break; }
          if (!found) b.avoidOff = 5;
        }
      }
      if (b.avoidOff) { const angle = Math.atan2(-mx, -mz) + b.avoidOff * .6; mx = -Math.sin(angle) * ml; mz = -Math.cos(angle) * ml; }
      mx /= ml; mz /= ml;
      if (speed >= 5 && Math.abs(angleDiff(Math.atan2(-mx, -mz), face)) < .3) face = Math.atan2(-mx, -mz);
    }
    // Pressing into something for a third of a second: try the next side-step right away.
    const pressing = ml > 0 && !s.using && Math.hypot(s.velocity.x, s.velocity.z) < speed * .3;
    b.pressT = pressing ? b.pressT + dt : 0;
    if (b.pressT > .35) {
      const order = [1, -1, 2, -2, 3, -3], next = order[(order.indexOf(b.avoidOff) + 1) % order.length];
      b.avoidOff = next; b.avoidAt = now + .5; b.pressT = 0; b.via = null;
    }
    // The 1 s stuck window only runs while the bot is trying to walk somewhere.
    if (ml === 0 || b.stuckAt < 0) { b.stuckAt = now; b.lastPos = { ...s.pos }; }
    else if (now - b.stuckAt > 1) {
      if (Math.hypot(s.pos.x - b.lastPos.x, s.pos.z - b.lastPos.z) < .4) {
        b.goal = this.randomGoal(s); b.avoidOff = 0;
        if (b.loot) { b.ignore.set(b.loot.id, now + 30); b.loot = null; }
        b.via = null;
        if (b.mode === 'cover') b.coverUntil = now;
        // Hop only over a genuinely low ledge; jumping at walls looks broken.
        const ahead = { x: -Math.sin(s.yaw), y: 0, z: -Math.cos(s.yaw) };
        if (s.grounded && this.grid.ray({ x: s.pos.x, y: s.pos.y + .3, z: s.pos.z }, ahead, 1) !== null &&
          this.grid.ray({ x: s.pos.x, y: s.pos.y + 1.1, z: s.pos.z }, ahead, 1.2) === null) jump = true;
      }
      b.lastPos = { ...s.pos }; b.stuckAt = now;
    }
    // Out of combat the heading eases toward where the bot wants to face; in a fight it tracks the target directly.
    if (!Number.isFinite(b.face)) b.face = s.yaw;
    b.face = fighting ? face : b.face + angleDiff(b.face, face) * (1 - Math.exp(-10 * dt));
    const yaw = s.yaw + clamp(angleDiff(s.yaw, b.face), -9 * dt, 9 * dt);
    // Turn world-space movement into this frame's local input.
    const sprint = speed >= 5 && !crouch, scale = sprint ? 1 : Math.min(1, speed / 3.9);
    const inp: InputFrame = a.input = { ...emptyInput(), seq: this.tick, clientTime: now, yaw, pitch: clamp(pitch, -1.2, 1.2), crouch, jump, sprint };
    inp.moveZ = (-Math.sin(yaw) * mx - Math.cos(yaw) * mz) * scale;
    inp.moveX = (Math.cos(yaw) * mx - Math.sin(yaw) * mz) * scale;
    b.reloading = !!s.reloadUntil;
    if (fighting && t && !s.reloadUntil && !s.using) {
      b.reactT -= dt;
      const dist = Math.hypot(t.pos.x - s.pos.x, t.pos.y - s.pos.y, t.pos.z - s.pos.z);
      if (b.reactT <= 0 && now >= b.fireAt && now - a.landedAt >= .5 && dist <= def.range && Math.abs(angleDiff(yaw, face)) < .2 && (b.mode !== 'cover' || atCover)) this.botShoot(a, target!);
    }
  }
  private botShoot(a: ActorRuntime, target: ActorRuntime) {
    const s = a.state, b = a.brain!, t = target.state, w = s.weapons[s.slot], def = WEAPONS[w.id], bw = BOT_WEAPON[w.id];
    if (!def.melee && w.ammo <= 0) { this.startReload(a); return; }
    const head = this.random() < (b.elite ? .2 : .1), k = t.crouch ? 1.3 / 1.8 : 1;
    // Aim at the head sphere or the upper body (see HIT_SHAPES).
    const aim = head ? { x: t.pos.x - Math.sin(t.yaw) * .04 * k, y: t.pos.y + 1.6 * k, z: t.pos.z - Math.cos(t.yaw) * .04 * k }
      : { x: t.pos.x, y: t.pos.y + 1.0 * k, z: t.pos.z };
    const eye = center(s), dist = Math.hypot(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z);
    const tv = Math.hypot(t.velocity.x, t.velocity.z), sv = Math.hypot(s.velocity.x, s.velocity.z);
    const track = b.elite ? lerp(1.5, .45, clamp(b.trackT / 1.6, 0, 1)) : lerp(1.8, .75, clamp(b.trackT / 2.2, 0, 1));
    const human = !t.bot || this.config.mode === 'deathmatch';
    const err = (b.skill + dist * .008 + tv * .22 + sv * .18) * track * DEG * (w.id === 'dmr' || w.id === 'sniper' ? .6 : 1) * (s.crouch ? .8 : 1) * (human ? this.diff.err : 1.8);
    const before = w.ammo;
    this.fire(a, this.time, undefined, { dir: norm({ x: aim.x - eye.x, y: aim.y - eye.y, z: aim.z - eye.z }), cone: err });
    if (w.ammo === before && !def.melee) return;
    if (bw.burst) {
      if (b.burst > 0) { b.burst--; b.fireAt = this.time + 60 / def.rpm * 1.2; }
      else { b.burst = 4 + Math.floor(this.random() * 5); b.fireAt = this.time + this.rnd(bw.cooldown[0], bw.cooldown[1]); }
    } else b.fireAt = this.time + this.rnd(bw.cooldown[0], bw.cooldown[1]);
    if (!def.melee && w.ammo <= 0) this.startReload(a);
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
      const livedUntil = this.config.mode === 'battle-royale' ? a.eliminatedAt ?? this.time : this.time;
      return { id: s.id, name: s.name, color: s.color, bot: s.bot, kills: s.kills, deaths: s.deaths, damage: s.damage, place, winner: place === 1 && (this.config.mode === 'deathmatch' || alive === 1),
        shots: a.shots, hits: a.hits, headshots: a.headshots, survived: Math.round(Math.max(0, livedUntil - this.matchStartedAt) * 10) / 10, chests: a.chests };
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
