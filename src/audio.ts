import { clamp } from './shared/math';
import { terrainHeight } from './shared/terrain';
import { waterAt } from './shared/water';
import { colliderGrid } from './shared/collider-grid';
import { hasLineOfSight } from './shared/collision';
import { WEAPONS } from './shared/weapons';
import { weaponShotDuration } from './shared/weapon-presentation';
import { terrainSurface } from './simulation/surface';
import type { ActorState, ConsumableId, EmoteId, GameEvent, Settings, Surface, Vec3, WeaponId, WorldSnapshot, WorldSpec } from './shared/types';
import { bakeOrder, renderSound, type Quality } from './sound/bank';
import type { BakeMessage, BakeRequest } from './sound/bake.worker';
import type { StepMaterial } from './sound/foley';
import {
  ambienceMix, critterWeights, GUN_RANGE, gunDistance, LEVEL, levelGain, OCCLUDED, safetyCurve, STEP_RANGE, stepDistance, worldDistance, type Place,
} from './sound/mix';

// Low-health heartbeat threshold (matches the HUD's low-health state) and the storm bed's linear gain.
export const LOW_HP = 30;
export const STORM_LEVEL = levelGain(LEVEL.storm);

// Your own gunfire has its own pool so a firefight around you can never steal it.
type VoiceKind = 'own' | 'shot' | 'step' | 'fx' | 'world';
const VOICE_CAPS: Record<Quality, Record<VoiceKind, number>> = {
  high: { own: 12, shot: 20, step: 10, fx: 24, world: 8 },
  low: { own: 10, shot: 12, step: 6, fx: 16, world: 5 },
};

interface PlayOptions {
  /** Target loudness in LUFS at unity sliders (see sound/mix.ts). */
  level: number;
  at?: number;
  /** World position: the voice is spatialized (direction only; distance is in `level` and `cutoff`). */
  pos?: Vec3 | null;
  out?: AudioNode;
  rate?: number;
  cutoff?: number;
  pan?: number;
  kind?: VoiceKind;
  loop?: boolean;
  /** Seconds into the buffer to start from (loops start at a random point). */
  offset?: number;
}
interface Voice { source: AudioBufferSourceNode; gain: GainNode; panner: PannerNode | null; stereo: StereoPannerNode | null; nodes: AudioNode[] }
interface Loop extends Voice { id: string }
type Buses = {
  master: GainNode; effects: GainNode; ambience: GainNode; music: GainNode;
  ambienceDuck: GainNode; ambienceTone: BiquadFilterNode; musicDuck: GainNode; limiter: DynamicsCompressorNode; clipper: WaveShaperNode;
};

const MATERIAL: Record<Surface, StepMaterial> = { dirt: 'dirt', sand: 'sand', foliage: 'grass', stone: 'stone', wood: 'wood', metal: 'metal', water: 'water' };
const PICKUP_CUE: Record<string, string> = { weapon: 'fb:pick-weapon', ammo: 'fb:pick-ammo', armor: 'fb:pick-armor', helmet: 'fb:pick-helmet' };
const USE_CUE: Record<ConsumableId, string> = { bandage: 'fb:use-bandage', medkit: 'fb:use-medkit', guarana: 'fb:use-guarana', acai: 'fb:use-acai', rapadura: 'fb:use-rapadura' };
const EMOTE_VOICE: Partial<Record<EmoteId, string>> = { wave: 'voice:wave', victory: 'voice:cheer', sit: 'voice:purr', chill: 'voice:purr' };
const GUN_SOUND = (id: WeaponId) => id === 'coco' ? 'shot:coco' : id === 'machete' ? 'swing:machete' : `shot:${id}`;
const distanceOf = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * The game's sound engine. Every sound is baked from code (src/sound) in a
 * worker after unlock(); the mix table in src/sound/mix.ts sets the loudness
 * hierarchy. No AudioContext or hardware is opened before unlock().
 */
export class SoundEngine {
  private settings: Settings;
  private context: AudioContext | null = null;
  private buses: Buses | null = null;
  private quality: Quality = 'high';
  private bank = new Map<string, AudioBuffer[]>();
  private lastVariant = new Map<string, number>();
  private baker: Worker | null = null;
  private bakeTimer = 0;
  private voices: Record<VoiceKind, number[]> = { own: [], shot: [], step: [], fx: [], world: [] };
  private loops = new Map<string, Loop>();
  private remoteFire: GainNode | null = null;
  private disposed = false;
  private myId = '';
  // World knowledge for ambience, material and occlusion.
  private readonly trees: Vec3[] = [];
  private readonly waterfall: Vec3 | null;
  private readonly harbour: Vec3 | null;
  private place: Place = { coast: .3, height: 2, canopy: 0, inside: false, harbour: Infinity, waterfall: Infinity, district: null };
  private seaYaw = 0;
  private nextPlace = 0;
  private nextCritter = 0;
  private lastSnapshot: WorldSnapshot | null = null;
  // Local movement.
  private lastPosition: Vec3 | null = null;
  private lastActorId: string | null = null;
  private lastGrounded = false;
  private lastSwimming = false;
  private lastVelocityY = 0;
  private lastCrouch = false;
  private lastStage = '';
  private distanceToStep = 0;
  private stepCount = 0;
  private remoteSteps = new Map<string, { pos: Vec3; travelled: number; grounded: boolean; swimming: boolean; velocityY: number }>();
  private mudVoices = new Map<string, { next: number; end: number; channel: GainNode | null }>();
  private soakingActors = new Set<string>();
  // Combat, feedback and match flow.
  private duckUntil = 0;
  private voiceAt = new Map<string, number>();
  private voiceEnds: number[] = [];
  private pendingHurt = new Set<string>();
  private nextSpotCheck = 0;
  private spottedActor: string | null = null;
  private nextHeart = 0;
  private nextCrackle = 0;
  private nextThunder = 0;
  private reloadUntil = 0;
  private reloadGain: GainNode | null = null;
  private localReloadEnd = -Infinity;
  private emotes = new Map<string, EmoteId | null>();
  private phaseSeen = '';
  private countdownSeen = -1;
  private shrinkingSeen = false;
  private stingerMatch = '';
  private music: string | null = null;

  constructor(settings: Settings, private world?: WorldSpec) {
    this.settings = { ...settings };
    const objects = world?.objects || [];
    for (const object of objects) if (object.kind === 'tree' || object.kind === 'palm') this.trees.push(object.pos);
    this.waterfall = objects.find(object => object.detail === 'waterfall')?.pos || null;
    const porto = world?.districts.find(d => d.id === 'porto');
    this.harbour = porto ? { x: porto.x, y: 0, z: porto.z } : null;
  }

  async unlock(): Promise<void> {
    if (this.disposed || typeof window === 'undefined') return;
    if (this.context) { if (this.context.state === 'suspended') await this.context.resume(); return; }
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    this.quality = this.settings.graphics === 'low' ? 'low' : 'high';
    const gain = () => context.createGain();
    const master = gain(), effects = gain(), ambience = gain(), music = gain(), ambienceDuck = gain(), musicDuck = gain(), remoteFire = gain();
    const ambienceTone = context.createBiquadFilter();
    ambienceTone.type = 'lowpass'; ambienceTone.frequency.value = 20000; ambienceTone.Q.value = .5;
    // Master chain: a fast limiter, then a soft clipper that can never reach full scale.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 20; limiter.attack.value = .002; limiter.release.value = .15;
    const clipper = context.createWaveShaper();
    clipper.curve = safetyCurve() as Float32Array<ArrayBuffer>; clipper.oversample = 'none';
    remoteFire.connect(effects);
    effects.connect(master);
    ambience.connect(ambienceDuck); ambienceDuck.connect(ambienceTone); ambienceTone.connect(master);
    music.connect(musicDuck); musicDuck.connect(master);
    master.connect(limiter); limiter.connect(clipper); clipper.connect(context.destination);
    this.buses = { master, effects, ambience, music, ambienceDuck, ambienceTone, musicDuck, limiter, clipper };
    this.remoteFire = remoteFire;
    this.setSettings(this.settings);
    this.bake(context);
    await context.resume();
  }

  setSettings(settings: Settings): void {
    this.settings = { ...settings };
    if (!this.context || !this.buses) return;
    const time = this.context.currentTime;
    this.buses.master.gain.setTargetAtTime(clamp(settings.master, 0, 1), time, .025);
    this.buses.effects.gain.setTargetAtTime(clamp(settings.effects, 0, 1), time, .025);
    this.buses.ambience.gain.setTargetAtTime(clamp(settings.ambience, 0, 1), time, .08);
    this.buses.music.gain.setTargetAtTime(clamp(settings.music, 0, 1), time, .08);
  }

  // ---- Bank ----------------------------------------------------------------

  private bake(context: AudioContext) {
    const accept = (message: BakeMessage) => {
      if (message.type !== 'sound' || this.disposed || this.context !== context) return;
      const buffer = context.createBuffer(message.channels.length, message.channels[0].length, message.rate);
      message.channels.forEach((channel, i) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, i));
      const list = this.bank.get(message.id) || [];
      list[message.variant] = buffer;
      this.bank.set(message.id, list);
    };
    const request: BakeRequest = { rate: context.sampleRate, quality: this.quality };
    try {
      if (typeof Worker === 'undefined') throw new Error('no worker');
      const worker = new Worker(new URL('./sound/bake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => { accept(event.data); if (event.data.type === 'done') { worker.terminate(); if (this.baker === worker) this.baker = null; } };
      worker.onerror = () => { worker.terminate(); if (this.baker === worker) { this.baker = null; this.bakeHere(context, accept); } };
      worker.postMessage(request);
      this.baker = worker;
    } catch { this.bakeHere(context, accept); }
  }

  /** Fallback without workers: bake in small slices so no frame stalls for long. */
  private bakeHere(context: AudioContext, accept: (message: BakeMessage) => void) {
    const queue = bakeOrder(this.quality).filter(({ sound, variant }) => !this.bank.get(sound.id)?.[variant]);
    const step = () => {
      if (this.disposed || this.context !== context) return;
      const until = performance.now() + 6;
      while (queue.length && performance.now() < until) {
        const { sound, variant } = queue.shift()!;
        accept({ type: 'sound', ...renderSound(sound, variant, context.sampleRate, this.quality) });
      }
      if (queue.length) this.bakeTimer = window.setTimeout(step, 16);
    };
    step();
  }

  private buffer(id: string): AudioBuffer | null {
    const list = this.bank.get(id);
    if (!list?.length) return null;
    const ready = list.map((b, i) => b ? i : -1).filter(i => i >= 0);
    if (!ready.length) return null;
    // Random variant, never the same one twice in a row.
    const last = this.lastVariant.get(id) ?? -1;
    let pick = ready[Math.floor(Math.random() * ready.length)];
    if (pick === last && ready.length > 1) pick = ready[(ready.indexOf(pick) + 1) % ready.length];
    this.lastVariant.set(id, pick);
    return list[pick];
  }

  // ---- Voices ----------------------------------------------------------------

  private play(id: string, options: PlayOptions): Voice | null {
    const ctx = this.context, buses = this.buses;
    if (!ctx || !buses || !Number.isFinite(options.level)) return null;
    const kind = options.kind ?? 'fx', now = ctx.currentTime, at = Math.max(now, options.at ?? now);
    const active = this.voices[kind] = this.voices[kind].filter(end => end > now);
    if (!options.loop && active.length >= VOICE_CAPS[this.quality][kind]) return null;
    const buffer = this.buffer(id);
    if (!buffer) return null;
    const source = ctx.createBufferSource(), gain = ctx.createGain(), nodes: AudioNode[] = [source, gain];
    source.buffer = buffer; source.loop = !!options.loop;
    source.playbackRate.value = options.rate ?? 1;
    gain.gain.value = levelGain(options.level);
    source.connect(gain);
    let tail: AudioNode = gain;
    if (options.cutoff && options.cutoff < 16000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = options.cutoff; filter.Q.value = .6;
      tail.connect(filter); tail = filter; nodes.push(filter);
    }
    let panner: PannerNode | null = null, stereo: StereoPannerNode | null = null;
    if (options.pos) {
      panner = ctx.createPanner();
      panner.panningModel = this.quality === 'high' && kind !== 'world' ? 'HRTF' : 'equalpower';
      // Distance is already in the level and the cutoff: the panner only gives direction.
      panner.distanceModel = 'linear'; panner.rolloffFactor = 0; panner.refDistance = 1; panner.maxDistance = 10000;
      this.setPosition(panner, options.pos, at);
      tail.connect(panner); tail = panner; nodes.push(panner);
    } else if (options.pan !== undefined) {
      stereo = ctx.createStereoPanner();
      stereo.pan.value = clamp(options.pan, -1, 1);
      tail.connect(stereo); tail = stereo; nodes.push(stereo);
    }
    tail.connect(options.out ?? buses.effects);
    source.onended = () => { for (const node of nodes) node.disconnect(); };
    source.start(at, options.offset ?? 0);
    if (!options.loop) active.push(at + buffer.duration / (options.rate ?? 1));
    return { source, gain, panner, stereo, nodes };
  }

  private setPosition(panner: PannerNode, pos: Vec3, at: number) {
    if (panner.positionX) {
      panner.positionX.setValueAtTime(pos.x, at); panner.positionY.setValueAtTime(pos.y, at); panner.positionZ.setValueAtTime(pos.z, at);
    } else panner.setPosition(pos.x, pos.y, pos.z);
  }

  /** A looping voice kept by key; created once its buffer is baked. */
  /** A looping voice kept by key, created silent once its buffer is baked; it starts at a random point so beds never line up. */
  private loop(key: string, id: string, out: AudioNode, options: { pos?: Vec3; pan?: boolean } = {}): Loop | null {
    const existing = this.loops.get(key);
    if (existing) return existing;
    const duration = this.bank.get(id)?.find(Boolean)?.duration;
    if (!duration) return null;
    const voice = this.play(id, { level: -200, out, loop: true, pos: options.pos, pan: options.pan ? 0 : undefined, offset: Math.random() * duration });
    if (!voice) return null;
    voice.gain.gain.value = 0;
    const loop: Loop = { ...voice, id };
    this.loops.set(key, loop);
    return loop;
  }

  private fadeLoop(key: string, id: string, out: AudioNode, level: number, time = .6, options: { pos?: Vec3; pan?: boolean } = {}) {
    const ctx = this.context!, existing = this.loops.get(key);
    if (!Number.isFinite(level)) { if (existing) existing.gain.gain.setTargetAtTime(0, ctx.currentTime, time); return existing ?? null; }
    const loop = existing ?? this.loop(key, id, out, options);
    loop?.gain.gain.setTargetAtTime(levelGain(level), ctx.currentTime, time);
    return loop;
  }

  private stopLoop(key: string) {
    const loop = this.loops.get(key);
    if (!loop || !this.context) return;
    loop.gain.gain.setTargetAtTime(0, this.context.currentTime, .08);
    const source = loop.source;
    try { source.stop(this.context.currentTime + .5); } catch { /* stopped */ }
    this.loops.delete(key);
  }

  private placeListener(position: Vec3, yaw: number) {
    const ctx = this.context!;
    const listener = ctx.listener, now = ctx.currentTime;
    // Firefox has no AudioParam fields on AudioListener, only the older setters.
    if (!listener.positionX) {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0);
      return;
    }
    listener.positionX.setTargetAtTime(position.x, now, .01);
    listener.positionY.setTargetAtTime(position.y, now, .01);
    listener.positionZ.setTargetAtTime(position.z, now, .01);
    listener.forwardX.setTargetAtTime(-Math.sin(yaw), now, .01);
    listener.forwardY.setTargetAtTime(0, now, .01);
    listener.forwardZ.setTargetAtTime(-Math.cos(yaw), now, .01);
    listener.upX.setValueAtTime(0, now); listener.upY.setValueAtTime(1, now); listener.upZ.setValueAtTime(0, now);
  }

  private occluded(from: Vec3, to: Vec3): boolean {
    if (!this.world) return false;
    const d = distanceOf(from, to);
    if (d < 1) return false;
    // A grid walk along the ray is cheap even across the island.
    const hit = colliderGrid(this.world).ray(from, { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d }, d);
    return hit !== null && hit < d - .6;
  }

  /** A sound at a world position, heard through the gun, step or world distance model. */
  private at(id: string, pos: Vec3, listener: Vec3, level: number, model: 'step' | 'world', range: number, extra: Partial<PlayOptions> = {}) {
    const d = distanceOf(pos, listener);
    if (d > range) return null;
    const m = model === 'step' ? stepDistance(d, range) : worldDistance(d, range);
    return this.play(id, { level: level + m.db, cutoff: m.cutoff, pos, kind: extra.kind ?? (model === 'step' ? 'step' : 'world'), ...extra });
  }

  // ---- Events ----------------------------------------------------------------

  event(event: GameEvent, listener: Vec3, yaw: number, myId: string): void {
    const ctx = this.context;
    if (!ctx || !this.buses || ctx.state !== 'running' || this.disposed) return;
    this.myId = myId;
    this.placeListener(listener, yaw);
    const now = ctx.currentTime, actorPos = (id: string | null | undefined) => id ? this.lastSnapshot?.actors.find(a => a.id === id)?.pos : undefined;
    switch (event.type) {
      case 'shot': this.shot(event, listener, myId, now); break;
      case 'damage': this.damage(event, listener, yaw, myId, now); break;
      case 'kill': {
        this.pendingHurt.delete(event.target);
        const eliminated = this.lastSnapshot?.actors.find(a => a.id === event.target);
        if (eliminated) this.voiceChirp('elimination', eliminated.id, eliminated.pos, listener, myId);
        if (event.actor === myId) { this.duckRemoteFire(now); this.play('fb:kill', { level: LEVEL.kill, at: now + .03 }); }
        if (eliminated && event.target !== myId) this.at('fb:poof', eliminated.pos, listener, LEVEL.poof, 'world', 45);
        break;
      }
      case 'pickup': {
        if (event.actor !== myId) break;
        const loot = this.lastSnapshot?.loot.find(l => l.id === event.item);
        const chest = !loot && !!this.world?.chests.some(c => c.id === event.item);
        if (chest) { this.play('fb:chest', { level: LEVEL.pickup }); break; }
        this.play(PICKUP_CUE[loot?.kind ?? ''] ?? 'fb:pick-item', { level: LEVEL.pickup });
        if (loot?.kind === 'weapon' && loot.rarity > 0) this.play(`fb:rare-${clamp(loot.rarity, 1, 3)}`, { level: LEVEL.chime, at: now + .06 });
        break;
      }
      case 'use': {
        const own = event.actor === myId, pos = actorPos(event.actor);
        if (own) this.play(USE_CUE[event.item], { level: LEVEL.use });
        else if (pos) this.at(USE_CUE[event.item], pos, listener, LEVEL.use - 2, 'step', 20);
        break;
      }
      case 'reload': {
        if (event.actor === myId) break; // The viewmodel plays every mechanism cue.
        const pos = actorPos(event.actor);
        if (pos) this.remoteReload(event.weapon, pos, listener, now);
        break;
      }
      case 'respawn': if (event.actor === myId) this.play('fb:respawn', { level: LEVEL.respawn }); break;
      case 'water': {
        const own = event.actor === myId;
        if (own) this.waterSound(null, now, event.entering, LEVEL.splash);
        else if (distanceOf(event.pos, listener) <= 32) this.waterSound(event.pos, now, event.entering, LEVEL.splash + 2, listener);
        break;
      }
      case 'upgrade': {
        const own = event.actor === myId, pos = actorPos(event.actor), rate = 2 ** (clamp(event.level, 0, 7) / 24);
        if (own) { this.duckRemoteFire(now); this.play('fb:upgrade', { level: LEVEL.upgrade + (event.level === 7 ? 3 : 0), rate }); }
        else if (pos) this.at('fb:upgrade', pos, listener, LEVEL.upgrade - 4, 'world', 24, { rate });
        break;
      }
      case 'bounce': {
        if (event.actor === myId) this.play('fb:bounce', { level: LEVEL.bounce });
        else this.at('fb:bounce', event.pos, listener, LEVEL.bounce, 'step', 28);
        break;
      }
      case 'supply':
        if (event.stage === 'incoming') this.play('fb:supply-incoming', { level: LEVEL.supply });
        else if (event.stage === 'landed') this.at('fb:supply-land', event.pos, listener, LEVEL.supplyLand, 'world', 90);
        else this.at('fb:supply-open', event.pos, listener, LEVEL.supply, 'world', 28);
        break;
      case 'impact':
        if (event.weapon === 'coco') this.explosion(event.pos, listener);
        else this.impact(event.surface, event.pos, listener, event.actor === myId);
        break;
      case 'alert': {
        if (event.target !== myId) break;
        const bot = this.lastSnapshot?.actors.find(a => a.id === event.actor);
        if (bot) this.voiceChirp('spot', bot.id, bot.pos, listener, myId);
        break;
      }
      case 'notice': this.play('fb:ui-notice', { level: LEVEL.notice }); break;
    }
  }

  private shot(event: Extract<GameEvent, { type: 'shot' }>, listener: Vec3, myId: string, now: number) {
    const own = event.actor === myId, distance = distanceOf(event.origin, listener);
    if (!own && distance > GUN_RANGE) return;
    if (own || distance < 40) this.duckUntil = Math.max(this.duckUntil, now + 2.5);
    const rate = .97 + Math.random() * .06, id = event.weapon;
    if (own) {
      const auto = WEAPONS[id].automatic;
      const level = id === 'machete' ? LEVEL.ownMelee : id === 'coco' ? LEVEL.ownShot - 3 : auto ? LEVEL.ownShotAuto : LEVEL.ownShot;
      this.play(GUN_SOUND(id), { level, rate, kind: 'own' });
      this.mechanism(id, now, null, listener);
    } else {
      const g = gunDistance(distance), occluded = distance > 3 && this.occluded(listener, { ...event.origin, y: event.origin.y + .3 });
      const base = (id === 'machete' ? LEVEL.remoteMelee : LEVEL.remoteShot) + g.db + (occluded ? OCCLUDED.gunDb : 0);
      const cutoff = occluded ? Math.min(g.cutoff, OCCLUDED.gunCutoff) : g.cutoff, at = now + g.delay;
      if (id === 'machete') { if (distance < 25) this.play(GUN_SOUND(id), { level: base, pos: event.origin, cutoff, kind: 'shot', rate }); }
      else {
        const far = id === 'coco' ? 0 : g.far;
        if (g.near > .05) this.play(GUN_SOUND(id), { level: base + 20 * Math.log10(g.near), pos: event.origin, cutoff, at, rate, kind: 'shot', out: this.remoteFire! });
        if (far > .05) this.play(`far:${id}`, { level: base + 20 * Math.log10(far), pos: event.origin, cutoff: occluded ? cutoff * 1.5 : undefined, at, rate, kind: 'shot', out: this.remoteFire! });
        if (distance < 25) this.mechanism(id, at, event.origin, listener);
        this.whizBy(event, listener, now);
      }
    }
    if (event.surface && !event.hit && id !== 'machete') this.impact(event.surface, event.end, listener, own);
  }

  /** The gun's action after the shot, timed to the viewmodel's cycle (pump, bolt). */
  private mechanism(id: WeaponId, at: number, pos: Vec3 | null, listener: Vec3) {
    const cycle = weaponShotDuration(id);
    const cues: [string, number][] = id === 'shotgun' ? [['pump-back', .3], ['pump-home', .68]] :
      id === 'sniper' ? [['bolt-open', .15], ['bolt-back', .38], ['bolt-home', .8]] : [];
    for (const [cue, t] of cues) {
      if (pos) this.at(`foley:${cue}`, pos, listener, LEVEL.remoteFoley, 'step', 25, { at: at + cycle * t });
      else this.play(`foley:${cue}`, { level: LEVEL.ownFoley + 3, at: at + cycle * t });
    }
  }

  /** A remote round passing within a couple of metres cracks by at the closest point of its path. */
  private whizBy(event: Extract<GameEvent, { type: 'shot' }>, listener: Vec3, now: number) {
    const o = event.origin, e = event.end, dx = e.x - o.x, dy = e.y - o.y, dz = e.z - o.z, length = Math.hypot(dx, dy, dz);
    if (length < 8) return;
    const t = clamp(((listener.x - o.x) * dx + (listener.y - o.y) * dy + (listener.z - o.z) * dz) / (length * length), 0, 1);
    const along = t * length;
    if (along < 6 || t >= 1) return;
    const closest = { x: o.x + dx * t, y: o.y + dy * t, z: o.z + dz * t }, miss = distanceOf(closest, listener);
    if (miss > 2.6) return;
    this.play('whiz', { level: LEVEL.whiz - miss * 3, pos: closest, at: now + along / 700, kind: 'shot' });
  }

  private impact(surface: Surface, pos: Vec3, listener: Vec3, own: boolean) {
    const d = distanceOf(pos, listener);
    this.at(`impact:${surface}`, pos, listener, LEVEL.impact + (own ? 2 : 0), 'step', own ? 60 : 25, { at: (this.context?.currentTime ?? 0) + d / 343, kind: 'fx' });
  }

  private explosion(pos: Vec3, listener: Vec3) {
    const d = distanceOf(pos, listener);
    if (d > 200) return;
    const g = gunDistance(d), at = this.context!.currentTime + g.delay;
    if (d < 40) this.duckUntil = Math.max(this.duckUntil, at + 2.5);
    if (g.near > .05) this.play('boom:coco', { level: LEVEL.explosion + g.db + 20 * Math.log10(g.near), pos, at, cutoff: g.cutoff, kind: 'shot' });
    if (g.far > .05) this.play('boom:coco-far', { level: LEVEL.explosion + g.db + 20 * Math.log10(g.far), pos, at, kind: 'shot' });
  }

  private damage(event: Extract<GameEvent, { type: 'damage' }>, listener: Vec3, yaw: number, myId: string, now: number) {
    if (event.actor === myId || event.target === myId || distanceOf(event.pos, listener) < 35) this.duckUntil = Math.max(this.duckUntil, now + 2.5);
    const hurt = this.lastSnapshot?.actors.find(a => a.id === event.target);
    const ctx = this.context;
    // Damage and kill arrive in the same batch. A microtask lets elimination take the actor's voice slot.
    if (hurt && !this.pendingHurt.has(hurt.id)) {
      this.pendingHurt.add(hurt.id);
      queueMicrotask(() => {
        if (!this.pendingHurt.delete(hurt.id) || this.disposed || this.context !== ctx) return;
        this.voiceChirp('hurt', hurt.id, hurt.pos, listener, myId);
      });
    }
    if (event.target === myId && !event.actor) this.play('fb:storm-bite', { level: LEVEL.stormBite });
    else if (event.target === myId) {
      // The thump leans toward the side the shot came from.
      const from = this.lastSnapshot?.actors.find(a => a.id === event.actor);
      const pan = from ? clamp(Math.sin(Math.atan2(-(from.pos.x - listener.x), -(from.pos.z - listener.z)) - yaw) * -.75, -.75, .75) : 0;
      this.play('fb:damage', { level: LEVEL.damageTaken, pan });
    } else if (event.actor === myId) {
      this.duckRemoteFire(now);
      this.play(event.head ? 'fb:head' : 'fb:hit', { level: event.head ? LEVEL.head : LEVEL.hit });
    } else this.at('flesh', event.pos, listener, LEVEL.flesh, 'step', 30);
    if (event.armorBreak) {
      const local = event.target === myId || event.actor === myId;
      if (local) this.play('fb:armor-break', { level: LEVEL.armorBreak });
      else this.at('fb:armor-break', event.pos, listener, LEVEL.armorBreak - 4, 'step', 30);
    }
  }

  private remoteReload(weapon: WeaponId, pos: Vec3, listener: Vec3, now: number) {
    const duration = WEAPONS[weapon].reload;
    const cues: [string, number][] = weapon === 'shotgun' ? [['shell-in', .64]] : weapon === 'revolver' ? [['cylinder-open', .18], ['eject', .33], ['speedloader', .68], ['cylinder-close', .78]] :
      weapon === 'coco' ? [['coconut-in', .64]] : weapon === 'machete' ? [] : [['mag-out', .2], ['mag-in', .68], [weapon === 'sniper' ? 'bolt-home' : 'slide-home', .86]];
    for (const [cue, t] of cues) this.at(`foley:${cue}`, pos, listener, LEVEL.remoteFoley, 'step', 18, { at: now + duration * t });
  }

  /** First-person Foley cue from the viewmodel choreography (magazine, slide, bolt, pump...). */
  foley(cue: string): void {
    const ctx = this.context;
    if (!ctx || !this.buses || ctx.state !== 'running' || this.disposed) return;
    this.localReloadEnd = ctx.currentTime + .6;
    if (this.reloadGain) this.cancelReload();
    this.play(`foley:${cue}`, { level: cue === 'draw' || cue === 'grab' ? LEVEL.ownFoley - 3 : LEVEL.ownFoley });
  }

  /** Menu and HUD interface sounds. */
  ui(kind: 'hover' | 'click' | 'back'): void {
    if (!this.context || this.context.state !== 'running' || this.disposed) return;
    this.play(`fb:ui-${kind}`, { level: kind === 'hover' ? LEVEL.uiHover : LEVEL.ui });
  }

  // ---- Frame update ------------------------------------------------------------

  update(actor: ActorState | null, snapshot: WorldSnapshot | null, dt: number, menu: boolean): void {
    const ctx = this.context;
    this.lastSnapshot = snapshot;
    if (!ctx || !this.buses || ctx.state !== 'running' || this.disposed) return;
    const now = ctx.currentTime;
    const combat = now < this.duckUntil;
    this.buses.musicDuck.gain.setTargetAtTime(combat ? .4 : 1, now, combat ? .03 : .6);
    this.buses.ambienceDuck.gain.setTargetAtTime(combat ? .45 : 1, now, combat ? .05 : 1.2);
    this.updateAmbient(actor, menu, now, combat);
    this.updateMusic(actor, snapshot, menu, now);
    this.updateFlow(snapshot, menu, now);
    this.updateStorm(actor, snapshot, menu, now);
    this.updateAir(actor, snapshot, menu, now);
    if (!menu && actor?.alive && actor.stage === 'ground' && actor.hp > 0 && actor.hp < LOW_HP && snapshot?.phase === 'playing') {
      if (now >= this.nextHeart) {
        // Lub-dub, quicker as health drops: 0.95 s at 30 hp down to 0.6 s near zero.
        this.play('fb:heart', { level: LEVEL.heart });
        this.nextHeart = now + .6 + .35 * actor.hp / LOW_HP;
      }
    } else this.nextHeart = Math.max(this.nextHeart, now);
    if (!actor || !snapshot || menu || !Number.isFinite(dt) || dt <= 0) {
      this.lastPosition = null; this.lastActorId = null; this.lastGrounded = false; this.lastSwimming = false; this.distanceToStep = 0;
      this.remoteSteps.clear();
      this.clearMudVoices();
      this.cancelReload();
      this.clearEmotes();
      return;
    }
    this.placeListener({ x: actor.pos.x, y: actor.pos.y + 1.5, z: actor.pos.z }, actor.yaw);
    this.updateSoaking(actor, snapshot, now);
    this.updateRemoteSteps(actor, snapshot);
    this.updateEmotes(actor, snapshot);
    if (now >= this.nextSpotCheck && actor.alive && actor.stage === 'ground') {
      this.nextSpotCheck = now + .7;
      const other = snapshot.actors.find(a => a.id !== actor.id && a.alive && a.stage === 'ground' && Math.hypot(a.pos.x - actor.pos.x, a.pos.z - actor.pos.z) < 24 &&
        Math.cos(actor.yaw) * (actor.pos.z - a.pos.z) + Math.sin(actor.yaw) * (actor.pos.x - a.pos.x) > 0 &&
        (!this.world || hasLineOfSight({ ...actor.pos, y: actor.pos.y + 1.5 }, { ...a.pos, y: a.pos.y + 1 }, this.world)));
      if (other?.id !== this.spottedActor) {
        this.spottedActor = other?.id || null;
        if (other) this.voiceChirp('spot', actor.id, actor.pos, actor.pos, actor.id);
      }
    }
    this.updateReload(actor, snapshot, now);
    if (!actor.alive) { this.lastActorId = null; this.lastPosition = null; this.distanceToStep = 0; return; }
    const grounded = actor.grounded && actor.stage === 'ground' && !actor.swimming;
    if (this.lastActorId !== actor.id) {
      this.lastActorId = actor.id; this.lastPosition = { ...actor.pos };
      this.lastGrounded = grounded; this.lastSwimming = actor.swimming; this.lastVelocityY = actor.velocity.y; this.distanceToStep = 0; this.lastCrouch = actor.crouch;
      return;
    }
    if (actor.crouch !== this.lastCrouch && grounded) this.play('cloth', { level: LEVEL.ownCloth });
    this.lastCrouch = actor.crouch;
    // Ordinary jumps keep stage='ground'. Contact, not stage, owns the cadence.
    if (actor.swimming && this.lastSwimming && this.lastPosition && Math.hypot(actor.velocity.x, actor.velocity.z) > .15) {
      const travelled = Math.hypot(actor.pos.x - this.lastPosition.x, actor.pos.z - this.lastPosition.z);
      this.distanceToStep = travelled < 2 ? this.distanceToStep + travelled : 0;
      if (this.distanceToStep >= 1.6) { this.distanceToStep %= 1.6; this.waterSound(null, now, null, LEVEL.swim); }
    } else if (!this.lastGrounded && !this.lastSwimming && grounded) {
      this.footstep(actor.pos, LEVEL.ownLand + clamp(-this.lastVelocityY, 0, 18) * .45, true);
      this.distanceToStep = 0;
    } else if (this.lastGrounded && !grounded && !actor.swimming && actor.velocity.y > 1.5) {
      this.play('jump', { level: LEVEL.ownJump });
    } else if (this.lastPosition && grounded && this.lastGrounded && Math.hypot(actor.velocity.x, actor.velocity.z) > .1) {
      const travelled = Math.hypot(actor.pos.x - this.lastPosition.x, actor.pos.z - this.lastPosition.z);
      this.distanceToStep = travelled < 2 ? this.distanceToStep + travelled : 0;
      const stride = actor.crouch ? 2.7 : actor.sprint ? 2.15 : 1.65;
      if (this.distanceToStep >= stride) {
        this.distanceToStep %= stride;
        this.footstep(actor.pos, LEVEL.ownStep + (actor.crouch ? -6 : actor.sprint ? 3 : 0), false);
        if (actor.sprint && this.stepCount++ % 2 === 0) this.play('gear', { level: LEVEL.ownGear, at: now + .05 });
      }
    } else this.distanceToStep = 0;
    this.lastPosition = { ...actor.pos }; this.lastGrounded = grounded; this.lastSwimming = actor.swimming; this.lastVelocityY = actor.velocity.y;
  }

  /** What the paws are touching: a collider top under the feet, shallow water, or the painted terrain. */
  materialAt(pos: Vec3): StepMaterial {
    if (this.world) {
      let best: StepMaterial | null = null, top = -Infinity;
      for (const c of [...colliderGrid(this.world).query(pos.x - .05, pos.z - .05, pos.x + .05, pos.z + .05), ...(this.world.walkways || [])]) {
        if (pos.x < c.min.x || pos.x > c.max.x || pos.z < c.min.z || pos.z > c.max.z) continue;
        if (c.max.y > pos.y + .15 || c.max.y < pos.y - .4 || c.max.y <= top) continue;
        top = c.max.y; best = c.material === 'earth' ? 'dirt' : c.material;
      }
      if (best) return best;
    }
    const water = waterAt(pos.x, pos.z);
    if (water && pos.y < water.surfaceY + .1) return 'water';
    return MATERIAL[terrainSurface(pos.x, pos.z)];
  }

  /** One stride or touchdown. `level` is in LUFS; a remote step passes its distance and listener. */
  private footstep(position: Vec3, level: number, landing: boolean, remote?: { listener: Vec3; range: number; occluded: boolean }) {
    const id = `${landing ? 'land' : 'step'}:${this.materialAt(position)}`;
    if (!remote) { this.play(id, { level, kind: 'step' }); return; }
    const d = distanceOf(position, remote.listener), m = stepDistance(d, remote.range);
    this.play(id, {
      level: level + m.db + (remote.occluded ? OCCLUDED.stepDb : 0), pos: position, kind: 'step',
      cutoff: remote.occluded ? Math.min(m.cutoff, OCCLUDED.stepCutoff) : m.cutoff,
    });
  }

  private updateRemoteSteps(listener: ActorState, snapshot: WorldSnapshot) {
    // Keep airborne neighbours in the history so a snapshot touchdown sounds
    // once, without carrying their in-air travel into the next walking stride.
    const nearby = snapshot.actors.filter(a => a.id !== listener.id && a.alive && a.stage !== 'plane')
      .map(actor => ({ actor, distance: distanceOf(actor.pos, listener.pos) }))
      .filter(item => item.distance < (item.actor.crouch ? STEP_RANGE.crouch : STEP_RANGE.sprint)).sort((a, b) => a.distance - b.distance).slice(0, 6);
    const seen = new Set<string>(), ear = { ...listener.pos, y: listener.pos.y + 1.5 };
    for (const { actor } of nearby) {
      seen.add(actor.id);
      const grounded = actor.grounded && actor.stage === 'ground' && !actor.swimming;
      const prior = this.remoteSteps.get(actor.id) || { pos: { ...actor.pos }, travelled: 0, grounded, swimming: actor.swimming, velocityY: actor.velocity.y };
      const landing = !prior.grounded && !prior.swimming && grounded, fallSpeed = Math.max(0, -prior.velocityY);
      const moved = Math.hypot(actor.pos.x - prior.pos.x, actor.pos.z - prior.pos.z);
      const steady = (grounded && prior.grounded) || (actor.swimming && prior.swimming);
      prior.travelled = steady && Math.hypot(actor.velocity.x, actor.velocity.z) > .15 && moved < 2 ? prior.travelled + moved : 0;
      prior.grounded = grounded; prior.swimming = actor.swimming; prior.velocityY = actor.velocity.y;
      prior.pos = { ...actor.pos }; this.remoteSteps.set(actor.id, prior);
      const stride = actor.swimming ? 1.6 : actor.crouch ? 2.7 : actor.sprint ? 2.15 : 1.65;
      if (!landing && prior.travelled < stride) continue;
      prior.travelled %= stride;
      const occluded = this.occluded(ear, { ...actor.pos, y: actor.pos.y + 1 });
      if (actor.swimming) { this.waterSound(actor.pos, this.context!.currentTime, null, LEVEL.swim + 4 + (occluded ? -8 : 0), listener.pos); continue; }
      const range = landing ? STEP_RANGE.sprint : actor.crouch ? STEP_RANGE.crouch : actor.sprint ? STEP_RANGE.sprint : STEP_RANGE.walk;
      const level = landing ? LEVEL.remoteLand + clamp(fallSpeed, 0, 18) * .45 : LEVEL.remoteStep + (actor.crouch ? -8 : actor.sprint ? 3 : 0);
      this.footstep(actor.pos, level, landing, { listener: ear, range, occluded });
    }
    for (const id of this.remoteSteps.keys()) if (!seen.has(id)) this.remoteSteps.delete(id);
  }

  /** Swim strokes (entering null) and entry or exit splashes, local (pos null) or at a remote position. */
  private waterSound(pos: Vec3 | null, now: number, entering: boolean | null, level: number, listener?: Vec3) {
    const id = entering === null ? 'swim' : entering ? 'splash:in' : 'splash:out';
    if (!pos || !listener) { this.play(id, { level, at: now }); return; }
    this.at(id, pos, listener, level, 'step', 32, { at: now });
  }

  private clearMudVoices() {
    for (const voice of this.mudVoices.values()) voice.channel?.disconnect();
    this.mudVoices.clear();
    this.soakingActors.clear();
  }

  private updateSoaking(listener: ActorState, snapshot: WorldSnapshot, now: number) {
    if (!listener.alive || snapshot.phase !== 'playing') { this.clearMudVoices(); return; }
    const heard = new Set<string>(), soaking = new Set<string>();
    for (const actor of [listener, ...snapshot.actors]) {
      const own = actor === listener;
      // Local prediction wins over a delayed snapshot, including cancellation.
      if (!own && actor.id === listener.id) continue;
      if (!actor.soaking || !actor.alive || !actor.grounded || actor.swimming || actor.stage !== 'ground') continue;
      soaking.add(actor.id);
      const distance = distanceOf(actor.pos, listener.pos);
      if (!own && (distance > 12 || heard.size >= 4)) continue;
      heard.add(actor.id);
      let voice = this.mudVoices.get(actor.id);
      const entering = !this.soakingActors.has(actor.id);
      if (!voice) { voice = { next: now, end: now, channel: null }; this.mudVoices.set(actor.id, voice); }
      if (voice.channel && now >= voice.end) { voice.channel.disconnect(); voice.channel = null; }
      if (now < voice.next) continue;
      const channel = this.context!.createGain();
      channel.connect(this.buses!.effects);
      voice.channel = channel; voice.end = now + .5;
      // Schedule one small sound, never a catch-up burst after a paused frame.
      voice.next = now + 1.8 + (actor.pos.x * .17 + actor.pos.z * .31 + now * .19) % 1 * .5;
      this.mudSound(channel, own ? null : actor.pos, entering, own ? LEVEL.mud : LEVEL.mud - 2, listener.pos);
    }
    for (const [id, voice] of this.mudVoices) if (!heard.has(id)) {
      voice.channel?.disconnect(); this.mudVoices.delete(id);
    }
    this.soakingActors = soaking;
  }

  private mudSound(output: AudioNode, pos: Vec3 | null, entering: boolean, level: number, listener: Vec3) {
    const id = entering ? 'mud:in' : 'mud:bubble';
    if (!pos) this.play(id, { level, out: output });
    else this.at(id, pos, listener, level, 'step', 12, { out: output });
  }

  private updateReload(actor: ActorState, snapshot: WorldSnapshot, now: number) {
    const remaining = actor.reloadUntil - snapshot.time;
    if (remaining <= 0) { if (this.reloadUntil) this.cancelReload(); return; }
    if (actor.reloadUntil === this.reloadUntil) return;
    this.cancelReload();
    this.reloadUntil = actor.reloadUntil;
    // Your own reload is voiced by the viewmodel's cues; this covers the capybara you spectate.
    if (!this.myId || actor.id === this.myId || now < this.localReloadEnd) return;
    const weapon = actor.weapons[actor.slot];
    if (!weapon) return;
    const duration = WEAPONS[weapon.id].reload, elapsed = Math.max(0, duration - remaining);
    const channel = this.context!.createGain();
    channel.connect(this.buses!.effects);
    this.reloadGain = channel;
    const cues: [string, number][] = weapon.id === 'shotgun' ? [['shell-in', .64], ['pump-home', .92]] : [['mag-out', .2], ['mag-in', .65], ['slide-home', .86]];
    for (const [cue, t] of cues) {
      const offset = duration * t - elapsed;
      if (offset >= -.03) this.play(`foley:${cue}`, { level: LEVEL.ownFoley, at: now + Math.max(0, offset), out: channel });
    }
  }

  private cancelReload() {
    if (this.reloadGain && this.context) this.reloadGain.gain.setTargetAtTime(0, this.context.currentTime, .008);
    this.reloadGain = null; this.reloadUntil = 0;
  }

  // ---- Emotes ------------------------------------------------------------------

  private updateEmotes(listener: ActorState, snapshot: WorldSnapshot) {
    const seen = new Set<string>();
    for (const actor of snapshot.actors) {
      const own = actor.id === listener.id, a = own ? listener : actor, d = distanceOf(a.pos, listener.pos);
      if (!own && d > 30) continue;
      seen.add(a.id);
      const emote = a.alive ? a.emote : null, before = this.emotes.get(a.id) ?? null;
      const key = `dance:${a.id}`;
      if (emote !== before) {
        this.emotes.set(a.id, emote);
        if (before === 'dance') this.stopLoop(key);
        const voice = emote ? EMOTE_VOICE[emote] : undefined;
        if (voice) { if (own) this.play(voice, { level: LEVEL.voice }); else this.at(voice, a.pos, listener.pos, LEVEL.remoteVoice, 'step', 30); }
      }
      if (emote === 'dance') {
        const dances = [...this.loops.keys()].filter(k => k.startsWith('dance:')).length;
        if (!this.loops.has(key) && dances >= 2) continue;
        const level = own ? LEVEL.dance : LEVEL.dance + stepDistance(d, 30).db + 6;
        const loop = this.fadeLoop(key, 'music:samba', this.buses!.effects, level, .15, own ? {} : { pos: a.pos });
        if (loop?.panner) this.setPosition(loop.panner, a.pos, this.context!.currentTime);
      }
    }
    for (const id of [...this.emotes.keys()]) if (!seen.has(id)) { this.emotes.delete(id); this.stopLoop(`dance:${id}`); }
  }

  private clearEmotes() {
    for (const id of this.emotes.keys()) this.stopLoop(`dance:${id}`);
    this.emotes.clear();
  }

  // ---- Ambience ------------------------------------------------------------------

  private measurePlace(actor: ActorState): Place {
    const p = actor.pos;
    let ocean = 0, total = 0, sx = 0, sz = 0;
    for (const radius of [10, 22, 40]) for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, x = p.x + Math.sin(a) * radius, z = p.z + Math.cos(a) * radius, w = 1 / radius;
      total += w;
      if (waterAt(x, z)?.kind === 'ocean') { ocean += w; sx += Math.sin(a) * w; sz += Math.cos(a) * w; }
    }
    if (ocean > 0) this.seaYaw = Math.atan2(sx, sz);
    let trees = 0;
    for (const t of this.trees) if (Math.abs(t.x - p.x) < 18 && Math.abs(t.z - p.z) < 18 && Math.hypot(t.x - p.x, t.z - p.z) < 18) trees++;
    const head = { x: p.x, y: p.y + 1.7, z: p.z };
    const inside = !!this.world && actor.stage === 'ground' && colliderGrid(this.world).ray(head, { x: 0, y: 1, z: 0 }, 9) !== null;
    let district: string | null = null, best = Infinity;
    for (const d of this.world?.districts || []) { const dist = Math.hypot(p.x - d.x, p.z - d.z); if (dist < d.radius * 1.3 && dist < best) { best = dist; district = d.id; } }
    return {
      coast: clamp(ocean / total * 1.6, 0, 1), height: Math.max(0, p.y), canopy: clamp(trees / 7, 0, 1), inside,
      harbour: this.harbour ? Math.hypot(p.x - this.harbour.x, p.z - this.harbour.z) : Infinity,
      waterfall: this.waterfall ? distanceOf(p, this.waterfall) : Infinity, district,
    };
  }

  private updateAmbient(actor: ActorState | null, menu: boolean, now: number, combat: boolean) {
    const buses = this.buses!, playing = !menu && !!actor && actor.stage === 'ground';
    if (playing && now >= this.nextPlace) { this.nextPlace = now + .5; this.place = this.measurePlace(actor!); }
    const mix = playing ? ambienceMix(this.place) : { surf: -Infinity, wind: -Infinity, leaves: -Infinity, harbour: -Infinity, waterfall: -Infinity };
    const surf = this.fadeLoop('bed:surf', 'bed:surf', buses.ambience, mix.surf, 1.2, { pan: true });
    if (surf && actor) {
      surf.stereo?.pan.setTargetAtTime(clamp(Math.sin(this.seaYaw - Math.atan2(-Math.sin(actor.yaw), -Math.cos(actor.yaw))) * .6, -.6, .6), now, .5);
    }
    this.fadeLoop('bed:wind', 'bed:wind', buses.ambience, mix.wind, 1.5);
    this.fadeLoop('bed:leaves', 'bed:leaves', buses.ambience, mix.leaves, 1.2);
    if (this.harbour) this.fadeLoop('bed:harbour', 'bed:harbour', buses.ambience, mix.harbour, 1, { pos: { ...this.harbour, y: .5 } });
    if (this.waterfall) this.fadeLoop('bed:waterfall', 'bed:waterfall', buses.ambience, mix.waterfall, 1, { pos: this.waterfall });
    buses.ambienceTone.frequency.setTargetAtTime(this.place.inside && playing ? 1100 : 20000, now, .25);
    if (!playing || this.settings.ambience <= 0 || combat) { this.nextCritter = Math.max(this.nextCritter, now + (combat ? 2 : .5)); return; }
    if (now < this.nextCritter) return;
    this.nextCritter = now + 2.5 + Math.random() * 5;
    const choices = critterWeights(this.place);
    let r = Math.random() * choices.reduce((s, [, w]) => s + w, 0), id = choices[0][0];
    for (const [c, w] of choices) { r -= w; if (r <= 0) { id = c; break; } }
    const p = actor!.pos;
    const near = this.trees.filter(t => { const d = Math.hypot(t.x - p.x, t.z - p.z); return d > 6 && d < 40; });
    const tree = ['bemtevi', 'sabia', 'maritaca', 'dove', 'cicada', 'cricket', 'pardal'].includes(id) && near.length ? near[Math.floor(Math.random() * near.length)] : null;
    const a = Math.random() * Math.PI * 2, r2 = 14 + Math.random() * 24;
    const pos = tree ? { x: tree.x, y: tree.y + 5, z: tree.z } : { x: p.x + Math.sin(a) * r2, y: p.y + 3, z: p.z + Math.cos(a) * r2 };
    this.at(`critter:${id}`, pos, p, LEVEL.critter + (id === 'cicada' ? -4 : 0) + (this.place.inside ? -8 : 0), 'world', 70, { out: buses.ambience, kind: 'world', rate: .96 + Math.random() * .08 });
  }

  // ---- Music, match flow, storm and air --------------------------------------------

  private updateMusic(actor: ActorState | null, snapshot: WorldSnapshot | null, menu: boolean, now: number) {
    const buses = this.buses!;
    let want: string | null = null, level = -Infinity;
    if (menu) { want = 'music:menu'; level = LEVEL.menu; }
    else if (snapshot?.phase === 'playing' && actor) {
      const mode = snapshot.config.mode;
      const endgame = mode === 'battle-royale' ? snapshot.remaining <= 3 : mode === 'deathmatch' ? snapshot.remaining <= 30 : snapshot.remaining <= 2;
      if (mode === 'battle-royale' && actor.alive && (actor.stage === 'plane' || actor.stage === 'falling' || actor.stage === 'parachute')) { want = 'music:samba'; level = LEVEL.drop; }
      else if (endgame) { want = 'music:tension'; level = LEVEL.tension; }
    }
    if (this.settings.music <= 0) want = null;
    for (const id of ['music:menu', 'music:samba', 'music:tension']) {
      const on = want === id;
      if (on || this.loops.has(id)) this.fadeLoop(id, id, buses.music, on ? level : -Infinity, on ? 1.2 : 1.5);
    }
    this.music = want;
  }

  private updateFlow(snapshot: WorldSnapshot | null, menu: boolean, now: number) {
    if (!snapshot || menu) { this.phaseSeen = menu ? '' : this.phaseSeen; return; }
    if (snapshot.phase === 'countdown') {
      const second = Math.ceil(snapshot.countdown);
      if (second !== this.countdownSeen && second > 0 && second <= 5) this.play('fb:ui-tick', { level: LEVEL.tick, rate: second === 1 ? 1.12 : 1 });
      this.countdownSeen = second;
    }
    if (snapshot.phase === 'playing' && this.phaseSeen === 'countdown') this.play('fb:ui-go', { level: LEVEL.whistle });
    if (snapshot.phase === 'results' && this.stingerMatch !== snapshot.matchId && this.phaseSeen === 'playing') {
      this.stingerMatch = snapshot.matchId;
      const mine = snapshot.results.find(r => r.id === this.myId);
      if (mine) this.play(mine.winner ? 'music:victory' : 'music:defeat', { level: mine.winner ? LEVEL.victory : LEVEL.defeat, out: this.buses!.music });
    }
    const shrinking = snapshot.config.mode === 'battle-royale' && snapshot.phase === 'playing' && snapshot.zone.shrinking;
    if (shrinking && !this.shrinkingSeen) this.play('fb:zone-warn', { level: LEVEL.zoneWarn, at: now + .05 });
    this.shrinkingSeen = shrinking;
    this.phaseSeen = snapshot.phase;
  }

  private updateStorm(actor: ActorState | null, snapshot: WorldSnapshot | null, menu: boolean, now: number) {
    const zone = snapshot?.zone, buses = this.buses!;
    const live = !menu && !!actor?.alive && actor.stage !== 'plane' && snapshot?.config.mode === 'battle-royale' && snapshot.phase === 'playing' && !!zone;
    const edge = live ? Math.hypot(actor!.pos.x - zone!.x, actor!.pos.z - zone!.z) - zone!.radius : -Infinity;
    const outside = edge > 0;
    // Outside: the full storm. Inside but near the wall: its rumble, growing as you approach.
    const level = outside ? LEVEL.storm : live && edge > -25 ? LEVEL.stormWall + 20 * Math.log10(1 - -edge / 25) : -Infinity;
    const loop = this.fadeLoop('bed:storm', 'bed:storm', buses.effects, level, outside ? .35 : .8);
    if (!loop && Number.isFinite(level)) return;
    if (outside && now >= this.nextCrackle) {
      this.nextCrackle = now + 1.2 + Math.random() * 2.2;
      this.play('fb:crackle', { level: LEVEL.crackle, pan: Math.random() * 1.2 - .6 });
    }
    if (outside && now >= this.nextThunder) {
      this.nextThunder = now + 6 + Math.random() * 8;
      this.play('fb:thunder', { level: LEVEL.thunder, pan: Math.random() * 1.4 - .7 });
    }
    if (!outside) { this.nextThunder = Math.max(this.nextThunder, now + 3); }
  }

  private updateAir(actor: ActorState | null, snapshot: WorldSnapshot | null, menu: boolean, now: number) {
    const buses = this.buses!, stage = !menu && actor?.alive ? actor.stage : '';
    this.fadeLoop('bed:cabin', 'bed:cabin', buses.effects, stage === 'plane' ? LEVEL.cabin : -Infinity, .5);
    const speed = actor ? Math.hypot(actor.velocity.x, actor.velocity.y, actor.velocity.z) : 0;
    this.fadeLoop('bed:freefall', 'bed:freefall', buses.effects, stage === 'falling' ? LEVEL.freefall + 20 * Math.log10(clamp(speed / 40, .25, 1)) : -Infinity, .3);
    this.fadeLoop('bed:canopy', 'bed:canopy', buses.effects, stage === 'parachute' ? LEVEL.canopy : -Infinity, .4);
    if (stage === 'parachute' && this.lastStage === 'falling') this.play('fb:chute-open', { level: LEVEL.chute });
    this.lastStage = stage;
    // The drop plane heard from the ground while anyone is still aboard.
    const flying = !menu && snapshot?.config.mode === 'battle-royale' && snapshot.phase === 'playing' && snapshot.actors.some(a => a.stage === 'plane');
    const plane = snapshot?.plane;
    const d = flying && plane && actor && stage !== 'plane' ? distanceOf(plane, actor.pos) : Infinity;
    const loop = this.fadeLoop('bed:engine', 'bed:engine', buses.effects, d < 420 ? LEVEL.engine + worldDistance(d, 420).db : -Infinity, .5, plane ? { pos: plane } : {});
    if (loop?.panner && plane) {
      loop.panner.positionX.setTargetAtTime(plane.x, now, .1); loop.panner.positionY.setTargetAtTime(plane.y, now, .1); loop.panner.positionZ.setTargetAtTime(plane.z, now, .1);
    }
  }

  // ---- Mix helpers --------------------------------------------------------------

  // Local confirms (hit, headshot, elimination) dip other players' gunfire by
  // about 6 dB for a quarter second so they are never masked by distant fire.
  private duckRemoteFire(now: number) {
    const gain = this.remoteFire?.gain;
    if (!gain) return;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(.5, now, .008);
    gain.setTargetAtTime(1, now + .25, .12);
  }

  private voiceChirp(kind: 'hurt' | 'spot' | 'elimination', id: string, pos: Vec3, listener: Vec3, myId: string) {
    const ctx = this.context!, now = ctx.currentTime;
    if (now - (this.voiceAt.get(id) ?? -Infinity) < 2) return;
    const distance = distanceOf(pos, listener);
    if (id !== myId && distance > 40) return;
    this.voiceEnds = this.voiceEnds.filter(end => end > now);
    if (id !== myId && this.voiceEnds.length >= 6) return;
    this.voiceAt.set(id, now);
    if (id !== myId) this.voiceEnds.push(now + .5);
    if (id === myId) this.play(`voice:${kind}`, { level: LEVEL.voice });
    else this.at(`voice:${kind}`, pos, listener, LEVEL.remoteVoice, 'step', 40);
  }

  /** QA diagnostics: context state, baked buffers, live loops and active one-shot voices. */
  stats() {
    const now = this.context?.currentTime ?? 0;
    return {
      state: this.context?.state ?? 'none', rate: this.context?.sampleRate ?? 0, quality: this.quality, baked: [...this.bank.values()].reduce((n, l) => n + l.filter(Boolean).length, 0),
      loops: Object.fromEntries([...this.loops].map(([k, l]) => [k, +l.gain.gain.value.toFixed(4)])),
      voices: Object.fromEntries(Object.entries(this.voices).map(([k, v]) => [k, v.filter(e => e > now).length])), music: this.music, place: this.place,
    };
  }

  setHidden(hidden: boolean): void {
    if (!this.context || this.disposed) return;
    if (hidden) { this.clearMudVoices(); void this.context.suspend(); }
    else void this.context.resume();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelReload();
    this.clearMudVoices();
    this.baker?.terminate(); this.baker = null;
    if (typeof window !== 'undefined') window.clearTimeout(this.bakeTimer);
    for (const loop of this.loops.values()) { try { loop.source.stop(); } catch { /* already stopped */ } for (const node of loop.nodes) node.disconnect(); }
    this.loops.clear();
    void this.context?.close();
    this.context = null; this.buses = null; this.remoteFire = null;
    this.voiceAt.clear(); this.voiceEnds = []; this.pendingHurt.clear(); this.spottedActor = null;
    this.bank.clear();
  }
}
