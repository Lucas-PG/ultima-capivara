import { clamp } from './shared/math';
import { terrainHeight } from './shared/terrain';
import { hasLineOfSight } from './shared/collision';
import { WEAPONS } from './shared/weapons';
import type { ActorState, ConsumableId, GameEvent, Settings, Surface, Vec3, WeaponId, WorldSnapshot, WorldSpec } from './shared/types';

type AudioBuses = { master: GainNode; effects: GainNode; ambience: GainNode; music: GainNode };
type ShotVoice = { crack: number; body: number; tail: number; bass: number; metal: number; length: number };
type LocalPlace = { kind: 'bakery' | 'cafe' | 'harbor'; pos: Vec3; radius: number };
const SAMPLE_FILES = {
  pistol: 'pistol.mp3', smg: 'smg.mp3', m4: 'm4.mp3', shotgun: 'shotgun.mp3', dmr: 'dmr.mp3', sniper: 'sniper.mp3',
  'footstep-0': 'footstep-0.mp3', 'footstep-1': 'footstep-1.mp3', 'footstep-2': 'footstep-2.mp3',
  'footstep-3': 'footstep-3.mp3', 'footstep-4': 'footstep-4.mp3', 'footstep-5': 'footstep-5.mp3',
  'reload-mag': 'reload-mag.mp3', 'reload-shell': 'reload-shell.mp3',
} as const;
type SampleId = keyof typeof SAMPLE_FILES;

const VOICES: Record<WeaponId, ShotVoice> = {
  pistol: { crack: 1550, body: 180, tail: 600, bass: 105, metal: 2450, length: .36 },
  smg: { crack: 1850, body: 210, tail: 760, bass: 118, metal: 3100, length: .25 },
  m4: { crack: 1300, body: 145, tail: 450, bass: 85, metal: 2600, length: .52 },
  shotgun: { crack: 950, body: 90, tail: 330, bass: 63, metal: 1650, length: .7 },
  dmr: { crack: 1230, body: 125, tail: 410, bass: 73, metal: 2250, length: .62 },
  sniper: { crack: 1050, body: 88, tail: 290, bass: 54, metal: 1850, length: .9 },
  machete: { crack: 0, body: 0, tail: 0, bass: 0, metal: 0, length: .23 },
  slingshot: { crack: 0, body: 0, tail: 0, bass: 0, metal: 0, length: .3 },
};

// Low-health heartbeat threshold (matches the HUD's low-health state) and the storm rumble level.
export const LOW_HP = 30;
export const STORM_LEVEL = .07;
const RARITY_CHIME: readonly (readonly number[])[] = [[], [659.25, 880], [659.25, 830.61, 1046.5], [659.25, 830.61, 987.77, 1318.5]];

/** Local sound samples have a synthesized fallback. No AudioContext or hardware is opened before unlock(). */
export class SoundEngine {
  private settings: Settings;
  private context: AudioContext | null = null;
  private buses: AudioBuses | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lowNoiseBuffer: AudioBuffer | null = null;
  private samples: Partial<Record<SampleId, AudioBuffer>> = {};
  private footstepIndex = 0;
  private ambientSources: AudioBufferSourceNode[] = [];
  private ambientNodes: AudioNode[] = [];
  private spatialNodes = new Set<{ panner: PannerNode; filter: BiquadFilterNode }>();
  private windGain: GainNode | null = null;
  private surfGain: GainNode | null = null;
  private insectsGain: GainNode | null = null;
  private fountainGain: GainNode | null = null;
  private readonly fountain: Vec3 | null;
  private readonly interiors: { pos: Vec3; halfX: number; halfZ: number }[];
  private readonly localPlaces: LocalPlace[];
  private inside = false;
  private nearbyPlace: LocalPlace | null = null;
  private nextRegionCheck = 0;
  private nextPlaceSound = 0;
  private shots: number[] = [];
  private lastSnapshot: WorldSnapshot | null = null;
  private lastPosition: Vec3 | null = null;
  private lastActorId: string | null = null;
  private lastGrounded = false;
  private lastSwimming = false;
  private lastVelocityY = 0;
  private distanceToStep = 0;
  private nextWildlife = 0;
  private nextMusic = 0;
  private musicDucker: GainNode | null = null;
  // Other players' gunfire runs through here so local confirms can sit on top of it.
  private remoteFire: GainNode | null = null;
  private stormGain: GainNode | null = null;
  private nextCrackle = 0;
  private stormLfo: { lfo: OscillatorNode; depth: GainNode } | null = null;
  private nextHeart = 0;
  private duckUntil = 0;
  private voiceAt = new Map<string, number>();
  private voiceEnds: number[] = [];
  private pendingHurt = new Set<string>();
  private nextSpotCheck = 0;
  private spottedActor: string | null = null;
  private phrase = 0;
  private reloadUntil = 0;
  private reloadGain: GainNode | null = null;
  private localReloadEnd = -Infinity;
  private disposed = false;
  private remoteSteps = new Map<string, { pos: Vec3; travelled: number; grounded: boolean; swimming: boolean; velocityY: number }>();

  constructor(settings: Settings, private world?: WorldSpec) {
    this.settings = { ...settings };
    const objects = world?.objects || [];
    this.fountain = objects.find(object => object.detail === 'prop:plaza')?.pos || null;
    this.interiors = objects.filter(object => object.detail?.startsWith('prop:house:')).map(object => ({
      pos: object.pos, halfX: object.scale.x / 2 - .2, halfZ: object.scale.z / 2 - .2,
    }));
    this.localPlaces = objects.flatMap(object => {
      const kind = object.detail === 'prop:house:bakery' ? 'bakery' : object.detail === 'prop:house:cafe' ? 'cafe' : object.detail === 'prop:harbor' ? 'harbor' : null;
      return kind ? [{ kind, pos: object.pos, radius: kind === 'harbor' ? 22 : 11 }] : [];
    });
  }

  async unlock(): Promise<void> {
    if (this.disposed || typeof window === 'undefined') return;
    if (this.context) { if (this.context.state === 'suspended') await this.context.resume(); return; }
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const master = context.createGain(), effects = context.createGain(), ambience = context.createGain(), music = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8;
    limiter.attack.value = .003; limiter.release.value = .18;
    const musicDucker = context.createGain(); musicDucker.gain.value = 1;
    effects.connect(master); ambience.connect(master); music.connect(musicDucker); musicDucker.connect(master); master.connect(limiter); limiter.connect(context.destination);
    this.musicDucker = musicDucker;
    const remoteFire = context.createGain(); remoteFire.connect(effects); this.remoteFire = remoteFire;
    this.buses = { master, effects, ambience, music };
    this.noiseBuffer = this.makeNoise(false);
    this.lowNoiseBuffer = this.makeNoise(true);
    this.setSettings(this.settings);
    this.startAmbience();
    await context.resume();
    void this.loadSamples(context);
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

  event(event: GameEvent, listener: Vec3, yaw: number, myId: string): void {
    const ctx = this.context;
    if (!ctx || !this.buses || ctx.state !== 'running' || this.disposed) return;
    this.placeListener(listener, yaw);
    if (event.type === 'shot') {
      const own = event.actor === myId;
      const distance = Math.hypot(event.origin.x - listener.x, event.origin.y - listener.y, event.origin.z - listener.z);
      if (!own && distance > 250) return;
      const now = ctx.currentTime;
      if (own || distance < 35) this.duckUntil = Math.max(this.duckUntil, now + 2);
      this.shots = this.shots.filter(end => end > now);
      if (this.shots.length >= 24 || (!own && this.shots.length >= 18)) return;
      this.shots.push(now + VOICES[event.weapon].length + (own ? 0 : distance / 343));
      const output = own ? this.buses.effects : this.spatial(event.origin, this.remoteFire || this.buses.effects, distance);
      this.weapon(event.weapon, output, own ? 1 : .72, now + (own ? 0 : distance / 343));
      if (event.surface && !event.hit) this.impactSound(event.surface, event.end, listener, own);
    } else if (event.type === 'upgrade') {
      const own = event.actor === myId, actor = this.lastSnapshot?.actors.find(candidate => candidate.id === event.actor);
      if (!own && !actor) return;
      const distance = actor ? Math.hypot(actor.pos.x - listener.x, actor.pos.y - listener.y, actor.pos.z - listener.z) : 0;
      if (!own && distance > 24) return;
      const output = own ? this.buses.effects : this.spatial(actor!.pos, this.buses.effects, distance);
      const base = 440 * 2 ** (clamp(event.level, 0, 7) / 24), volume = own ? .045 : .018;
      const notes = event.level === 7 ? [1, 1.25, 1.5, 2] : [1, 1.25, 1.5];
      if (own) this.duckRemoteFire(ctx.currentTime);
      notes.forEach((ratio, index) => {
        const pitch = base * ratio, time = ctx.currentTime + .05 + index * .085;
        this.tone(output, time, pitch, pitch, .3, volume, 'triangle');
        this.tone(output, time, pitch * 2, pitch * 2, .16, volume * .2, 'sine');
      });
    } else if (event.type === 'water') {
      const distance = Math.hypot(event.pos.x - listener.x, event.pos.y - listener.y, event.pos.z - listener.z);
      if (distance > 32) return;
      const own = event.actor === myId;
      const output = own ? this.buses.effects : this.spatial(event.pos, this.buses.effects, distance);
      this.waterSound(output, ctx.currentTime, event.entering, own ? 1 : .7);
    } else if (event.type === 'impact') {
      this.impactSound(event.surface, event.pos, listener, event.actor === myId);
    } else if (event.type === 'reload') {
      if (event.actor === myId && ctx.currentTime < this.localReloadEnd + .25) return;
      const actor = this.lastSnapshot?.actors.find(a => a.id === event.actor);
      const distance = actor ? Math.hypot(actor.pos.x - listener.x, actor.pos.y - listener.y, actor.pos.z - listener.z) : 0;
      const output = actor && actor.id !== myId ? this.spatial(actor.pos, this.buses.effects, distance) : this.buses.effects;
      const reloadSample = event.weapon === 'shotgun' ? 'reload-shell' : 'reload-mag';
      if (!this.playSample(reloadSample, output, .13, ctx.currentTime, .18)) this.metalClick(output, ctx.currentTime, 1200, .16);
    } else if (event.type === 'damage') {
      if (event.actor === myId || event.target === myId || Math.hypot(event.pos.x - listener.x, event.pos.y - listener.y, event.pos.z - listener.z) < 35)
        this.duckUntil = Math.max(this.duckUntil, ctx.currentTime + 2);
      const hurt = this.lastSnapshot?.actors.find(a => a.id === event.target);
      // Damage and kill arrive in the same batch. A microtask lets elimination take the actor's voice slot.
      if (hurt && !this.pendingHurt.has(hurt.id)) {
        this.pendingHurt.add(hurt.id);
        queueMicrotask(() => {
          if (!this.pendingHurt.delete(hurt.id) || this.disposed || this.context !== ctx) return;
          this.voiceChirp('hurt', hurt.id, hurt.pos, listener, myId);
        });
      }
      const now = ctx.currentTime;
      if (event.target === myId && !event.actor) this.stormBite(now);
      else if (event.target === myId) {
        // The thump leans toward the side the shot came from.
        const from = this.lastSnapshot?.actors.find(a => a.id === event.actor);
        const pan = from ? clamp(Math.sin(Math.atan2(-(from.pos.x - listener.x), -(from.pos.z - listener.z)) - yaw) * -.75, -.75, .75) : 0;
        const side = this.panned(pan);
        this.noise(side, now, .18, 'lowpass', 260, .12, .004);
        this.tone(side, now, 95, 48, .18, .12, 'sine');
      } else if (event.actor === myId) {
        this.duckRemoteFire(now);
        if (event.head) {
          // Headshot: a bright two-note "ding" that never reads as a body hit.
          this.metalClick(this.buses.effects, now, 2550, .12);
          this.tone(this.buses.effects, now, 1568, 1568, .2, .075, 'triangle');
          this.tone(this.buses.effects, now + .045, 2349, 2349, .24, .05, 'sine');
        } else this.metalClick(this.buses.effects, now, 1750, .09);
      }
      if (event.armorBreak) this.armorBreakSound(event.pos, listener, event.target === myId || event.actor === myId, now);
    } else if (event.type === 'kill') {
      this.pendingHurt.delete(event.target);
      const eliminated = this.lastSnapshot?.actors.find(a => a.id === event.target);
      if (eliminated) this.voiceChirp('elimination', eliminated.id, eliminated.pos, listener, myId);
      if (event.actor === myId) { this.duckRemoteFire(ctx.currentTime); this.tone(this.buses.effects, ctx.currentTime, 470, 720, .16, .07, 'triangle'); }
      if (eliminated && event.target !== myId) this.poof(eliminated.pos, listener, ctx.currentTime);
    } else if (event.type === 'pickup' && event.actor === myId) {
      const now = ctx.currentTime, loot = this.lastSnapshot?.loot.find(l => l.id === event.item);
      const chest = !loot && !!this.world?.chests.some(c => c.id === event.item);
      this.metalClick(this.buses.effects, now, 1200, .09);
      this.tone(this.buses.effects, now, 520, 720, .12, .045, 'sine');
      if (chest) {
        this.noise(this.buses.effects, now, .22, 'bandpass', 420, .07, .03, true);
        this.chime(now + .08, [659.25, 830.61, 987.77, 1318.5], .04);
      } else if (loot?.kind === 'weapon' && loot.rarity > 0) this.chime(now + .05, RARITY_CHIME[loot.rarity], .03 + loot.rarity * .006);
    } else if (event.type === 'use') {
      this.useSound(event.item, event.actor === myId, this.lastSnapshot?.actors.find(a => a.id === event.actor)?.pos || listener, listener, ctx.currentTime);
    } else if (event.type === 'alert' && event.target === myId) {
      // The bot's pre-attack "hm!" comes from where it stands.
      const bot = this.lastSnapshot?.actors.find(a => a.id === event.actor);
      if (bot) this.voiceChirp('spot', bot.id, bot.pos, listener, myId);
    } else if (event.type === 'respawn' && event.actor === myId) {
      this.tone(this.buses.effects, ctx.currentTime, 240, 410, .42, .065, 'triangle');
    }
  }

  update(actor: ActorState | null, snapshot: WorldSnapshot | null, dt: number, menu: boolean): void {
    const ctx = this.context;
    this.lastSnapshot = snapshot;
    if (!ctx || !this.buses || ctx.state !== 'running' || this.disposed) return;
    const now = ctx.currentTime;
    this.updateAmbient(actor, menu, now);
    if (menu && this.settings.music > 0 && now >= this.nextMusic) this.menuPhrase(now);
    if (!menu && actor?.alive && snapshot?.phase === 'playing' && this.settings.music > 0 && now >= this.nextMusic) this.matchPhrase(now);
    this.musicDucker?.gain.setTargetAtTime(now < this.duckUntil ? .5 : 1, now, now < this.duckUntil ? .025 : .45);
    this.updateStorm(actor, snapshot, menu, now);
    if (!menu && actor?.alive && actor.stage === 'ground' && actor.hp > 0 && actor.hp < LOW_HP && snapshot?.phase === 'playing') {
      if (now >= this.nextHeart) {
        // Lub-dub, quicker as health drops: 0.95 s at 30 hp down to 0.6 s near zero.
        const interval = .6 + .35 * actor.hp / LOW_HP;
        this.tone(this.buses.effects, now, 66, 46, .14, .11, 'sine');
        this.tone(this.buses.effects, now + .17, 60, 42, .12, .075, 'sine');
        this.nextHeart = now + interval;
      }
    } else this.nextHeart = Math.max(this.nextHeart, now);
    if (!actor || !snapshot || menu || !Number.isFinite(dt) || dt <= 0) {
      this.lastPosition = null; this.lastActorId = null; this.lastGrounded = false; this.lastSwimming = false; this.distanceToStep = 0;
      this.remoteSteps.clear();
      this.cancelReload();
      return;
    }
    this.placeListener({ x: actor.pos.x, y: actor.pos.y + 1.5, z: actor.pos.z }, actor.yaw);
    this.updateRemoteSteps(actor, snapshot);
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
      this.lastGrounded = grounded; this.lastSwimming = actor.swimming; this.lastVelocityY = actor.velocity.y; this.distanceToStep = 0;
      return;
    }
    // Ordinary jumps keep stage='ground'. Contact, not stage, owns the cadence.
    if (actor.swimming && this.lastSwimming && this.lastPosition && Math.hypot(actor.velocity.x, actor.velocity.z) > .15) {
      const travelled = Math.hypot(actor.pos.x - this.lastPosition.x, actor.pos.z - this.lastPosition.z);
      this.distanceToStep = travelled < 2 ? this.distanceToStep + travelled : 0;
      if (this.distanceToStep >= 1.6) { this.distanceToStep %= 1.6; this.waterSound(this.buses.effects, now, null, .65); }
    } else if (!this.lastGrounded && !this.lastSwimming && grounded) {
      this.footstep(actor.pos, .09 + clamp(-this.lastVelocityY, 0, 18) * .01, true);
      this.distanceToStep = 0;
    } else if (this.lastPosition && grounded && this.lastGrounded && Math.hypot(actor.velocity.x, actor.velocity.z) > .1) {
      const travelled = Math.hypot(actor.pos.x - this.lastPosition.x, actor.pos.z - this.lastPosition.z);
      this.distanceToStep = travelled < 2 ? this.distanceToStep + travelled : 0;
      const stride = actor.crouch ? 2.7 : actor.sprint ? 2.15 : 1.65;
      if (this.distanceToStep >= stride) {
        this.distanceToStep %= stride;
        this.footstep(actor.pos, actor.crouch ? .055 : actor.sprint ? .17 : .115, false);
        if (actor.sprint) {
          this.noise(this.buses.effects, now + .08, .11, 'bandpass', 470, .025, .02);
          this.tone(this.buses.effects, now + .04, 77, 52, .1, .018, 'triangle');
        }
      }
    } else this.distanceToStep = 0;
    this.lastPosition = { ...actor.pos }; this.lastGrounded = grounded; this.lastSwimming = actor.swimming; this.lastVelocityY = actor.velocity.y;
  }

  setHidden(hidden: boolean): void {
    if (!this.context || this.disposed) return;
    if (hidden) void this.context.suspend();
    else void this.context.resume();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelReload();
    for (const source of this.ambientSources) { try { source.stop(); } catch { /* already stopped */ } source.disconnect(); }
    if (this.stormLfo) { try { this.stormLfo.lfo.stop(); } catch { /* already stopped */ } this.stormLfo.lfo.disconnect(); this.stormLfo = null; }
    this.ambientSources = [];
    for (const node of this.ambientNodes) node.disconnect();
    this.ambientNodes = [];
    for (const node of this.spatialNodes) { node.panner.disconnect(); node.filter.disconnect(); }
    this.spatialNodes.clear();
    void this.context?.close();
    this.context = null; this.buses = null; this.noiseBuffer = null; this.lowNoiseBuffer = null;
    this.musicDucker = null; this.remoteFire = null; this.stormGain = null; this.voiceAt.clear(); this.voiceEnds = []; this.pendingHurt.clear(); this.spottedActor = null;
    this.samples = {};
  }

  private async loadSamples(context: AudioContext): Promise<void> {
    await Promise.all((Object.entries(SAMPLE_FILES) as [SampleId, string][]).map(async ([id, file]) => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed && this.context === context) this.samples[id] = buffer;
      } catch { /* Keep the synthesized fallback if a file cannot load or decode. */ }
    }));
  }

  private playSample(id: SampleId, output: AudioNode, level: number, start: number, cap: number): boolean {
    const buffer = this.samples[id], ctx = this.context;
    if (!buffer || !ctx) return false;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = .98 + Math.random() * .04;
    gain.gain.value = clamp(level, 0, cap);
    source.connect(gain); gain.connect(output);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(start);
    return true;
  }

  private makeNoise(low: boolean): AudioBuffer {
    const ctx = this.context!;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate), channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      previous = low ? previous * .985 + white * .015 : white;
      channel[i] = low ? previous * 4 : white;
    }
    return buffer;
  }

  private spatial(position: Vec3, output: AudioNode, distance: number): AudioNode {
    const ctx = this.context!;
    const panner = ctx.createPanner(), filter = ctx.createBiquadFilter();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 3; panner.maxDistance = 250; panner.rolloffFactor = 1.3;
    filter.type = 'lowpass';
    filter.frequency.value = clamp(14000 / (1 + distance / 40), 1100, 14000);
    panner.positionX.setValueAtTime(position.x, ctx.currentTime);
    panner.positionY.setValueAtTime(position.y + 1.1, ctx.currentTime);
    panner.positionZ.setValueAtTime(position.z, ctx.currentTime);
    panner.connect(filter); filter.connect(output);
    const node = { panner, filter };
    this.spatialNodes.add(node);
    window.setTimeout(() => { panner.disconnect(); filter.disconnect(); this.spatialNodes.delete(node); }, 1800);
    return panner;
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

  private noise(output: AudioNode, start: number, duration: number, filterType: BiquadFilterType, frequency: number, volume: number, attack = .001, low = false) {
    const ctx = this.context!, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = low ? this.lowNoiseBuffer : this.noiseBuffer;
    source.playbackRate.value = .88 + Math.random() * .25;
    filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = filterType === 'bandpass' ? .65 : .7;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(attack, duration * .3));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(output);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(start, Math.random() * .65, duration);
    source.stop(start + duration + .01);
  }

  private tone(output: AudioNode, start: number, from: number, to: number, duration: number, volume: number, shape: OscillatorType) {
    const ctx = this.context!, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + Math.min(.008, duration * .2));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(output);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
  }

  private metalClick(output: AudioNode, start: number, frequency: number, volume: number) {
    this.noise(output, start, .035, 'highpass', frequency, volume, .001);
    this.tone(output, start, frequency * .55, frequency * .27, .045, volume * .3, 'triangle');
  }

  private weapon(id: WeaponId, output: AudioNode, level: number, now: number) {
    if (id === 'machete') {
      this.noise(output, now, .23, 'bandpass', 850, .23 * level, .02);
      this.tone(output, now + .035, 240, 92, .16, .055 * level, 'triangle');
      return;
    }
    if (id === 'slingshot') {
      this.tone(output, now, 390, 86, .16, .11 * level, 'triangle');
      this.noise(output, now + .035, .13, 'bandpass', 1100, .085 * level, .002);
      this.noise(output, now + .14, .08, 'lowpass', 600, .07 * level, .004);
      return;
    }
    if (this.playSample(id, output, (id === 'shotgun' || id === 'sniper' ? .48 : .42) * level, now, .48)) return;
    const voice = VOICES[id];
    const size = id === 'shotgun' || id === 'sniper' ? 1.18 : id === 'smg' ? .72 : 1;
    this.noise(output, now, .042, 'highpass', voice.crack, .34 * size * level, .001);
    this.noise(output, now + .004, voice.length * .56, 'lowpass', voice.body * 3.2, .2 * size * level, .003, true);
    this.tone(output, now, voice.bass * 2.5, voice.bass, .18 + voice.length * .18, .15 * size * level, 'triangle');
    this.noise(output, now + .035, voice.length, 'bandpass', voice.tail, .095 * size * level, .008);
    this.metalClick(output, now + (id === 'smg' ? .018 : .045), voice.metal, .1 * level);
    if (id === 'shotgun') this.metalClick(output, now + .42, 1250, .16 * level);
    if (id === 'sniper' || id === 'dmr') {
      this.metalClick(output, now + .28, 2200, .12 * level);
      this.metalClick(output, now + .5, 900, .12 * level);
    }
  }

  private startAmbience() {
    const ctx = this.context!, buses = this.buses!;
    const loop = (buffer: AudioBuffer, filter: BiquadFilterType, frequency: number, left: number) => {
      const source = ctx.createBufferSource(), shape = ctx.createBiquadFilter(), pan = ctx.createStereoPanner(), gain = ctx.createGain();
      source.buffer = buffer; source.loop = true; shape.type = filter; shape.frequency.value = frequency;
      pan.pan.value = left; gain.gain.value = 0;
      source.connect(shape); shape.connect(pan); pan.connect(gain); gain.connect(buses.ambience);
      source.start(0, Math.random() * 1.5); this.ambientSources.push(source); this.ambientNodes.push(shape, pan, gain);
      return gain;
    };
    this.windGain = loop(this.lowNoiseBuffer!, 'lowpass', 460, -.32);
    this.surfGain = loop(this.noiseBuffer!, 'lowpass', 950, .35);
    this.insectsGain = loop(this.noiseBuffer!, 'bandpass', 3600, -.15);
    if (this.fountain) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), panner = ctx.createPanner(), gain = ctx.createGain();
      source.buffer = this.noiseBuffer; source.loop = true;
      filter.type = 'bandpass'; filter.frequency.value = 950; filter.Q.value = .45;
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2; panner.maxDistance = 70; panner.rolloffFactor = 1.8;
      panner.positionX.value = this.fountain.x; panner.positionY.value = this.fountain.y + .7; panner.positionZ.value = this.fountain.z;
      gain.gain.value = 0;
      source.connect(filter); filter.connect(panner); panner.connect(gain); gain.connect(buses.ambience);
      source.start(0, Math.random() * 1.5);
      this.ambientSources.push(source); this.ambientNodes.push(filter, panner, gain); this.fountainGain = gain;
    }
    // Storm: a low rumble with a slow swell, silent until the listener is outside the zone.
    {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      source.buffer = this.lowNoiseBuffer; source.loop = true;
      filter.type = 'lowpass'; filter.frequency.value = 320; gain.gain.value = 0;
      lfo.frequency.value = .35; depth.gain.value = 0;
      lfo.connect(depth); depth.connect(gain.gain);
      source.connect(filter); filter.connect(gain); gain.connect(buses.effects);
      source.start(0, Math.random() * 1.5); lfo.start();
      this.ambientSources.push(source); this.ambientNodes.push(filter, gain, depth);
      this.stormLfo = { lfo, depth }; this.stormGain = gain;
    }
    this.nextWildlife = ctx.currentTime + 4;
  }

  private updateAmbient(actor: ActorState | null, menu: boolean, now: number) {
    if (!this.windGain || !this.surfGain || !this.insectsGain || !this.buses) return;
    if (menu || !actor) { this.inside = false; this.nearbyPlace = null; }
    else if (now >= this.nextRegionCheck) {
      this.nextRegionCheck = now + .25;
      this.inside = actor.stage === 'ground' && this.interiors.some(house =>
        Math.abs(actor.pos.x - house.pos.x) < house.halfX && Math.abs(actor.pos.z - house.pos.z) < house.halfZ &&
        actor.pos.y >= house.pos.y - .3 && actor.pos.y < house.pos.y + 2.7);
      const previous = this.nearbyPlace;
      let nearest: LocalPlace | null = null, best = Infinity;
      for (const place of this.localPlaces) {
        const distance = Math.hypot(actor.pos.x - place.pos.x, actor.pos.z - place.pos.z);
        if (distance < place.radius && distance < best) { nearest = place; best = distance; }
      }
      this.nearbyPlace = nearest;
      if (nearest !== previous) this.nextPlaceSound = Math.min(this.nextPlaceSound, now + .9);
    }
    const coast = actor ? clamp((2.5 - terrainHeight(actor.pos.x, actor.pos.z)) / 2.5, 0, 1) : .2;
    const outdoor = menu ? .25 : actor ? this.inside ? .2 : 1 : .45;
    this.windGain.gain.setTargetAtTime(.035 * outdoor, now, .8);
    this.surfGain.gain.setTargetAtTime((.015 + .08 * coast) * outdoor, now, 1.2);
    this.insectsGain.gain.setTargetAtTime((.004 + .013 * (1 - coast)) * outdoor, now, 1.2);
    if (this.fountainGain) {
      const distance = actor && this.fountain ? Math.hypot(actor.pos.x - this.fountain.x, actor.pos.z - this.fountain.z) : Infinity;
      this.fountainGain.gain.setTargetAtTime(!menu && actor?.stage === 'ground' ? .025 * clamp(1 - distance / 27, 0, 1) : 0, now, .7);
    }
    if (!menu && actor && this.settings.ambience > 0 && !this.inside && now >= this.nextWildlife) {
      this.nextWildlife = now + 5 + Math.random() * 9;
      const bird = Math.random() < .65;
      const output = this.buses.ambience;
      if (bird) {
        const base = 850 + Math.random() * 360;
        this.tone(output, now, base, base * 1.45, .12, .015, 'sine');
        this.tone(output, now + .16, base * 1.2, base * .85, .16, .012, 'sine');
      } else {
        this.noise(output, now, .35, 'bandpass', 3800, .018, .06);
        this.noise(output, now + .44, .25, 'bandpass', 3300, .012, .04);
      }
    }
    if (menu || !actor || this.settings.ambience <= 0 || now < this.nextPlaceSound) return;
    const place = this.nearbyPlace;
    if (!place) { this.nextPlaceSound = now + .8; return; }
    const distance = Math.hypot(actor.pos.x - place.pos.x, actor.pos.z - place.pos.z);
    const output = this.spatial(place.pos, this.buses.ambience, distance);
    if (place.kind === 'bakery') {
      this.noise(output, now, .12, 'highpass', 1250, .015, .004);
      this.noise(output, now + .16, .09, 'highpass', 1600, .01, .003);
      this.nextPlaceSound = now + 3 + Math.random() * 3;
    } else if (place.kind === 'cafe') {
      this.tone(output, now, 1500, 950, .07, .013, 'sine');
      this.tone(output, now + .11, 1130, 790, .09, .009, 'sine');
      this.nextPlaceSound = now + 6 + Math.random() * 5;
    } else {
      this.noise(output, now, .4, 'bandpass', 420, .012, .05, true);
      this.tone(output, now + .06, 190, 105, .42, .011, 'triangle');
      this.nextPlaceSound = now + 5 + Math.random() * 5;
    }
  }

  private updateRemoteSteps(listener: ActorState, snapshot: WorldSnapshot) {
    // Keep airborne neighbours in the history so a snapshot touchdown sounds
    // once, without carrying their in-air travel into the next walking stride.
    const nearby = snapshot.actors.filter(a => a.id !== listener.id && a.alive && a.stage !== 'plane')
      .map(actor => ({ actor, distance: Math.hypot(actor.pos.x - listener.pos.x, actor.pos.y - listener.pos.y, actor.pos.z - listener.pos.z) }))
      .filter(item => item.distance < (item.actor.crouch ? 7 : 28)).sort((a, b) => a.distance - b.distance).slice(0, 6);
    const seen = new Set<string>();
    for (const { actor, distance } of nearby) {
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
      const occluded = this.world && !hasLineOfSight({ ...listener.pos, y: listener.pos.y + 1.5 }, { ...actor.pos, y: actor.pos.y + 1 }, this.world);
      const output = this.spatial(actor.pos, this.buses!.effects, distance);
      if (actor.swimming) { this.waterSound(output, this.context!.currentTime, null, occluded ? .14 : .45); continue; }
      const volume = landing ? .12 + clamp(fallSpeed, 0, 18) * .012 : actor.crouch ? .06 : actor.sprint ? .24 : .16;
      this.footstep(actor.pos, volume * (occluded ? .35 : 1), landing, output);
    }
    for (const id of this.remoteSteps.keys()) if (!seen.has(id)) this.remoteSteps.delete(id);
  }

  private waterSound(output: AudioNode, now: number, entering: boolean | null, volume: number) {
    if (entering === null) {
      this.noise(output, now, .27, 'bandpass', 620, .055 * volume, .045, true);
      this.tone(output, now + .05, 155, 235, .13, .019 * volume, 'sine');
      return;
    }
    this.noise(output, now, entering ? .36 : .2, 'lowpass', entering ? 1300 : 1800, (entering ? .19 : .065) * volume, .012, true);
    if (entering) this.tone(output, now, 135, 48, .22, .075 * volume, 'sine');
    for (let i = 0; i < 3; i++) {
      const delay = .08 + i * .085, pitch = 420 + i * 135;
      this.tone(output, now + delay, pitch, pitch * .6, .06, .023 * volume, 'sine');
    }
  }

  private footstep(position: Vec3, volume: number, landing: boolean, output: AudioNode = this.buses!.effects) {
    const ctx = this.context!, now = ctx.currentTime;
    const sampleId = `footstep-${this.footstepIndex++ % 6}` as SampleId;
    if (this.playSample(sampleId, output, volume * (landing ? .8 : .68), now, .2)) {
      if (landing) this.tone(output, now, 110, 45, .17, volume * .42, 'sine');
      return;
    }
    const x = position.x, z = position.z;
    const dock = x > -91 && x < -56 && z > -86 && z < -48;
    const town = Math.hypot(x + 42, z + 12) < 32 || Math.hypot(x + 5, z + 48) < 17;
    const sand = terrainHeight(x, z) < 1.5;
    const body = dock ? 280 : town ? 520 : sand ? 170 : 340;
    this.noise(output, now, landing ? .23 : .13, 'lowpass', body * 2, volume, .004, !town);
    this.tone(output, now, landing ? 110 : 92, 45, landing ? .17 : .085, volume * .42, 'sine');
    if (dock) this.metalClick(output, now + .02, 600, volume * .22);
    if (sand) this.noise(output, now + .035, .11, 'highpass', 1150, volume * .18, .008);
  }

  private updateReload(actor: ActorState, snapshot: WorldSnapshot, now: number) {
    const remaining = actor.reloadUntil - snapshot.time;
    if (remaining <= 0) { if (this.reloadUntil) this.cancelReload(); return; }
    if (actor.reloadUntil === this.reloadUntil) return;
    this.cancelReload();
    this.reloadUntil = actor.reloadUntil;
    const weapon = actor.weapons[actor.slot];
    if (!weapon) return;
    const duration = WEAPONS[weapon.id].reload;
    const elapsed = Math.max(0, duration - remaining);
    const channel = this.context!.createGain();
    channel.connect(this.buses!.effects);
    this.reloadGain = channel;
    const schedule = (at: number, fn: (time: number) => void) => {
      const offset = at - elapsed;
      if (offset >= -.03) fn(now + Math.max(0, offset));
    };
    if (weapon.id === 'shotgun') {
      schedule(.06, t => this.metalClick(channel, t, 780, .12));
      schedule(duration * .64, t => { if (!this.playSample('reload-shell', channel, .14, t, .18)) this.metalClick(channel, t, 1150, .17); });
      schedule(duration * .92, t => this.metalClick(channel, t, 1600, .13));
    } else {
      schedule(.08, t => this.metalClick(channel, t, 900, .1));
      schedule(duration * .27, t => this.noise(channel, t, .12, 'bandpass', 610, .09, .008));
      schedule(duration * .58, t => { if (!this.playSample('reload-mag', channel, .16, t, .18)) this.metalClick(channel, t, 1200, .17); });
      schedule(duration * .68, t => this.tone(channel, t, 390, 170, .09, .07, 'triangle'));
      schedule(duration * .88, t => this.metalClick(channel, t, weapon.id === 'sniper' ? 900 : 1800, .17));
    }
    this.localReloadEnd = now + remaining;
  }

  private cancelReload() {
    if (this.reloadGain && this.context) this.reloadGain.gain.setTargetAtTime(0, this.context.currentTime, .008);
    this.reloadGain = null; this.reloadUntil = 0;
  }

  private menuPhrase(now: number) {
    const output = this.buses!.music;
    // D minor pentatonic. Short changing phrases leave space between notes.
    const pitches = [293.66, 349.23, 392, 440, 523.25];
    const patterns = [[0, 2, 3], [1, 3, 2], [2, 4, 1], [0, 1, 4]];
    const notes = patterns[this.phrase++ % patterns.length];
    this.tone(output, now, 146.83, 146.83, 1.5, .025, 'sine');
    notes.forEach((index, i) => {
      const time = now + i * .58, pitch = pitches[index];
      this.tone(output, time, pitch, pitch * .997, .9, .027, 'sine');
      this.tone(output, time, pitch * 2, pitch * 2, .55, .004, 'triangle');
    });
    this.nextMusic = now + 3.7 + (this.phrase % 3) * .28;
  }
  private matchPhrase(now: number) {
    const output = this.buses!.music;
    const notes = [146.83, 174.61, 220, 196];
    const root = notes[this.phrase++ % notes.length];
    this.tone(output, now, root / 2, root / 2, 2.1, .009, 'sine');
    this.tone(output, now + 1.05, root, root * .997, .65, .006, 'triangle');
    this.nextMusic = now + 4.2;
  }
  private panned(pan: number): AudioNode {
    const ctx = this.context!, panner = ctx.createStereoPanner();
    panner.pan.value = pan; panner.connect(this.buses!.effects);
    window.setTimeout(() => panner.disconnect(), 600);
    return panner;
  }

  // Local confirms (hit, headshot, elimination) dip other players' gunfire by
  // about 6 dB for a quarter second so they are never masked by distant fire.
  private duckRemoteFire(now: number) {
    const gain = this.remoteFire?.gain;
    if (!gain) return;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(.5, now, .008);
    gain.setTargetAtTime(1, now + .25, .12);
  }

  private chime(start: number, notes: readonly number[], volume: number) {
    notes.forEach((pitch, i) => {
      this.tone(this.buses!.effects, start + i * .055, pitch, pitch, .22, volume, 'triangle');
      this.tone(this.buses!.effects, start + i * .055, pitch * 2, pitch * 2, .12, volume * .25, 'sine');
    });
  }

  private impactSound(surface: Surface, pos: Vec3, listener: Vec3, own: boolean) {
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (distance > (own ? 60 : 22)) return;
    const now = this.context!.currentTime + distance / 343, output = this.spatial(pos, this.buses!.effects, distance), k = own ? 1 : .6;
    if (surface === 'metal') { this.metalClick(output, now, 2400, .09 * k); this.tone(output, now, 1900, 1650, .16, .03 * k, 'triangle'); }
    else if (surface === 'wood') { this.noise(output, now, .07, 'bandpass', 700, .09 * k, .002); this.tone(output, now, 240, 160, .06, .03 * k, 'triangle'); }
    else if (surface === 'stone') this.noise(output, now, .05, 'highpass', 1900, .08 * k, .001);
    else if (surface === 'water') { this.noise(output, now, .2, 'bandpass', 1300, .07 * k, .01); this.noise(output, now + .05, .16, 'lowpass', 500, .04 * k, .02); }
    else this.noise(output, now, .08, 'lowpass', surface === 'sand' ? 520 : 700, .07 * k, .003, true);
  }

  private armorBreakSound(pos: Vec3, listener: Vec3, local: boolean, now: number) {
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (!local && distance > 30) return;
    const output = local ? this.buses!.effects : this.spatial(pos, this.buses!.effects, distance), k = local ? 1 : .6;
    // Glassy shatter: a bright crack, then falling shards.
    this.noise(output, now, .09, 'highpass', 3200, .13 * k, .001);
    this.tone(output, now, 1320, 520, .24, .06 * k, 'triangle');
    this.metalClick(output, now + .06, 2800, .06 * k); this.metalClick(output, now + .13, 2200, .045 * k);
  }

  private poof(pos: Vec3, listener: Vec3, now: number) {
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (distance > 45) return;
    const output = this.spatial(pos, this.buses!.effects, distance);
    // Cartoon "pof": a soft low puff and a short springy squeak.
    this.noise(output, now + .02, .26, 'lowpass', 520, .12, .01, true);
    this.tone(output, now + .03, 330, 700, .12, .035, 'sine');
  }

  private useSound(item: ConsumableId, local: boolean, pos: Vec3, listener: Vec3, now: number) {
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (!local && distance > 25) return;
    const output = local ? this.buses!.effects : this.spatial(pos, this.buses!.effects, distance), k = local ? 1 : .55;
    if (item === 'acai') {
      // Armor up: a glassy shimmer rising.
      [880, 1108.7, 1318.5].forEach((pitch, i) => this.tone(output, now + i * .06, pitch, pitch * 1.01, .28, .035 * k, 'triangle'));
      this.noise(output, now, .3, 'highpass', 4200, .02 * k, .08);
    } else if (item === 'guarana') {
      // Fizz and a quick upward zip.
      this.noise(output, now, .35, 'bandpass', 3000, .05 * k, .02);
      this.tone(output, now + .05, 420, 980, .22, .045 * k, 'triangle');
    } else {
      // Heal: a warm rising arpeggio; the medkit gets one more note.
      const notes = item === 'medkit' ? [392, 493.88, 587.33, 783.99] : [440, 554.37, 659.25];
      notes.forEach((pitch, i) => this.tone(output, now + i * .07, pitch, pitch, .24, .04 * k, 'sine'));
    }
  }

  private stormBite(now: number) {
    // One bite per second: a low whump with an electric crackle, distinct from gunfire damage.
    this.tone(this.buses!.effects, now, 80, 38, .3, .12, 'sine');
    this.noise(this.buses!.effects, now, .22, 'lowpass', 300, .09, .01, true);
    this.noise(this.buses!.effects, now + .03, .12, 'highpass', 2600, .045, .002);
  }

  private updateStorm(actor: ActorState | null, snapshot: WorldSnapshot | null, menu: boolean, now: number) {
    const zone = snapshot?.zone;
    const outside = !menu && !!actor?.alive && actor.stage !== 'plane' && snapshot?.config.mode === 'battle-royale' && snapshot.phase === 'playing' &&
      !!zone && Math.hypot(actor.pos.x - zone.x, actor.pos.z - zone.z) > zone.radius;
    this.stormGain?.gain.setTargetAtTime(outside ? STORM_LEVEL : 0, now, outside ? .35 : .6);
    this.stormLfo?.depth.gain.setTargetAtTime(outside ? STORM_LEVEL * .45 : 0, now, .5);
    if (outside && now >= this.nextCrackle && this.buses) {
      this.nextCrackle = now + 1.2 + Math.random() * 2.2;
      this.noise(this.buses.effects, now, .09, 'highpass', 3000 + Math.random() * 1500, .02, .002);
    }
  }

  private voiceChirp(kind: 'hurt' | 'spot' | 'elimination', id: string, pos: Vec3, listener: Vec3, myId: string) {
    const ctx = this.context!, now = ctx.currentTime;
    if (now - (this.voiceAt.get(id) ?? -Infinity) < 2) return;
    const distance = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
    if (id !== myId && distance > 40) return;
    this.voiceEnds = this.voiceEnds.filter(end => end > now);
    if (id !== myId && this.voiceEnds.length >= 6) return;
    this.voiceAt.set(id, now);
    if (id !== myId) this.voiceEnds.push(now + .42);
    const output = id === myId ? this.buses!.effects : this.spatial(pos, this.buses!.effects, distance);
    const base = kind === 'hurt' ? 235 : kind === 'spot' ? 310 : 195;
    const volume = kind === 'hurt' ? .045 : .036;
    this.tone(output, now, base, base * (kind === 'spot' ? 1.28 : .76), .14, volume, 'triangle');
    this.tone(output, now + .11, base * 1.4, base * (kind === 'spot' ? 1.65 : .85), .21, volume * .7, 'sine');
  }
}
