import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOW_HP, SoundEngine, STORM_LEVEL } from '../src/audio';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SOUND_BY_ID, SOUNDS } from '../src/sound/bank';
import { LEVEL, levelGain, safetyCurve } from '../src/sound/mix';
import { terrainSurface } from '../src/simulation/surface';
import type { WorldSpec } from '../src/shared/types';
import { FakeBuffer, FakeContext, FakeNode, type FakeSource } from './audio/fake-context';

class FakeWorker { onmessage: unknown = null; onerror: unknown = null; postMessage() {} terminate() {} }

/** A real engine on a fake Web Audio context, with every bank sound "baked" as a tagged buffer. */
async function engine(settings = { ...DEFAULT_SETTINGS }, world?: WorldSpec) {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('Worker', FakeWorker);
  const audio = new SoundEngine(settings, world) as any;
  await audio.unlock();
  const ctx = audio.context as FakeContext;
  for (const s of SOUNDS) audio.bank.set(s.id, Array.from({ length: s.variants }, () => new FakeBuffer(s.channels, 4410, 44100, s.id)));
  const requested: string[] = [];
  const buffer = audio.buffer.bind(audio);
  audio.buffer = (id: string) => { requested.push(id); return buffer(id); };
  return { audio, ctx, requested };
}
const played = (ctx: FakeContext) => ctx.playedIds;
const voices = (ctx: FakeContext, id: string) => ctx.started.filter(s => s.buffer?.id === id);
/** The voice's gain node (the source's only output). */
const gainOf = (s: FakeSource) => [...s.outputs][0] as FakeNode & { gain: { value: number } };
const spatial = (s: FakeSource) => { let n: FakeNode | undefined = s; for (let i = 0; i < 4 && n; i++) { if (n.kind === 'panner') return true; n = [...n.outputs][0]; } return false; };
const here = { x: 0, y: 0, z: 0 };

function actor(id = 'self') {
  return { id, alive: true, hp: 100, stage: 'ground', grounded: true, swimming: false, soaking: false, crouch: false, sprint: false, emote: null as string | null,
    pos: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, yaw: 0, weapons: [], slot: 0, reloadUntil: 0 };
}
function snapshot(actors: ReturnType<typeof actor>[], extra: Record<string, unknown> = {}) {
  return { phase: 'playing', matchId: 'm', time: 10, remaining: 8, countdown: 0, config: { mode: 'deathmatch' }, zone: { x: 0, z: 0, radius: 500, shrinking: false }, actors, loot: [], results: [], plane: { x: 0, y: 120, z: 0 }, ...extra };
}

afterEach(() => vi.unstubAllGlobals());

describe('ground contact audio', () => {
  async function steps() {
    const e = await engine();
    e.audio.footstep = vi.fn(); e.audio.waterSound = vi.fn(); e.audio.mudSound = vi.fn(); e.audio.nextSpotCheck = Infinity;
    return e;
  }
  function update(audio: any, local: ReturnType<typeof actor>, remotes: ReturnType<typeof actor>[] = []) {
    // A delayed authoritative local snapshot can still report contact during a
    // predicted jump. The explicit local argument must win for local sounds.
    audio.update(local, snapshot([{ ...local, grounded: true }, ...remotes]), 1 / 60, false);
  }

  it('stops steps on a predicted jump, lands once, and resumes only while moving', async () => {
    const { audio } = await steps(), local = actor();
    update(audio, local);
    for (let i = 0; i < 3; i++) { local.pos.x += .5; update(audio, local); }
    local.grounded = false;
    for (let i = 0; i < 8; i++) { local.pos.x += .5; local.velocity.y = 6 - i * 2; update(audio, local); }
    expect(audio.footstep).not.toHaveBeenCalled();
    local.grounded = true; local.velocity = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 9; i++) update(audio, local);
    expect(audio.footstep).toHaveBeenCalledOnce();
    expect(audio.footstep.mock.calls[0][2]).toBe(true);
    local.velocity.x = 3;
    for (let i = 0; i < 4; i++) { local.pos.x += .5; update(audio, local); }
    expect(audio.footstep.mock.calls.map((call: any[]) => call[2])).toEqual([true, false]);
  });

  it('uses snapshot contact for remote jumps and emits one spatial landing', async () => {
    const { audio } = await steps(), local = actor(), remote = actor('remote');
    local.velocity.x = 0;
    update(audio, local, [remote]);
    remote.grounded = false; remote.velocity.y = -10;
    for (let i = 0; i < 8; i++) { remote.pos.x += .5; update(audio, local, [remote]); }
    expect(audio.footstep).not.toHaveBeenCalled();
    remote.grounded = true; remote.velocity = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 8; i++) update(audio, local, [remote]);
    expect(audio.footstep).toHaveBeenCalledOnce();
    expect(audio.footstep.mock.calls[0][2]).toBe(true);
    expect(audio.footstep.mock.calls[0][3]).toBeTruthy(); // heard from the remote capybara's position
  });

  it('scales touchdown weight with the downward speed', async () => {
    const land = async (speed: number) => {
      const { audio } = await steps(), local = actor(); local.grounded = false; local.velocity.y = -speed;
      update(audio, local); local.grounded = true; local.velocity.y = 0; update(audio, local);
      expect(audio.footstep).toHaveBeenCalledOnce();
      return audio.footstep.mock.calls[0][1];
    };
    expect(await land(16)).toBeGreaterThan(await land(4));
  });

  it('makes crouch walking quieter and less frequent for local and remote actors', async () => {
    const walk = async (crouch: boolean, remote: boolean) => {
      const { audio } = await steps(), local = actor(), walker = remote ? actor('remote') : local;
      walker.crouch = crouch;
      if (remote) local.velocity.x = 0;
      const others = remote ? [walker] : [];
      update(audio, local, others);
      for (let i = 0; i < 8; i++) { walker.pos.x += .5; update(audio, local, others); }
      return audio.footstep.mock.calls;
    };
    for (const remote of [false, true]) {
      const normal = await walk(false, remote), quiet = await walk(true, remote);
      expect(normal).toHaveLength(2); expect(quiet).toHaveLength(1);
      expect(quiet[0][1]).toBeLessThan(normal[0][1]);
    }
  });

  it('keeps your own steps well under an enemy\'s at arm\'s length', () => {
    expect(LEVEL.remoteStep - LEVEL.ownStep).toBeGreaterThanOrEqual(10);
  });

  it('does not mistake respawn or a change of spectator for a landing', async () => {
    const { audio } = await steps(), local = actor();
    update(audio, local); local.alive = false; local.grounded = false; update(audio, local);
    local.alive = true; local.grounded = true; update(audio, local);
    local.grounded = false; update(audio, local); update(audio, actor('spectated'));
    expect(audio.footstep).not.toHaveBeenCalled();
  });

  it.each([false, true])('uses swim strokes and a quiet shore exit instead of steps or landing (remote: %s)', async remote => {
    const { audio } = await steps(), local = actor(), swimmer = remote ? actor('remote') : local;
    if (remote) local.velocity.x = 0;
    const others = remote ? [swimmer] : [];
    update(audio, local, others);
    swimmer.swimming = true; swimmer.grounded = false;
    update(audio, local, others);
    for (let i = 0; i < 8; i++) { swimmer.pos.x += .5; update(audio, local, others); }
    expect(audio.footstep).not.toHaveBeenCalled();
    expect(audio.waterSound).toHaveBeenCalledTimes(2);
    expect(audio.waterSound.mock.calls.every((call: unknown[]) => call[2] === null)).toBe(true);
    swimmer.swimming = false; swimmer.grounded = true; update(audio, local, others);
    expect(audio.footstep).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) { swimmer.pos.x += .5; update(audio, local, others); }
    expect(audio.footstep).toHaveBeenCalledOnce();
    expect(audio.footstep.mock.calls[0][2]).toBe(false);
  });

  it('sounds each water transition once and spatializes nearby remote splashes', async () => {
    const { audio, ctx } = await engine(), local = actor();
    audio.event({ type: 'water', id: 1, actor: local.id, pos: local.pos, entering: true }, local.pos, 0, local.id);
    audio.event({ type: 'water', id: 2, actor: 'remote', pos: { x: 4, y: -.05, z: 0 }, entering: false }, local.pos, 0, local.id);
    audio.event({ type: 'water', id: 3, actor: 'far', pos: { x: 100, y: -.05, z: 0 }, entering: true }, local.pos, 0, local.id);
    expect(played(ctx)).toEqual(['splash:in', 'splash:out']);
    expect(spatial(voices(ctx, 'splash:in')[0])).toBe(false);
    expect(spatial(voices(ctx, 'splash:out')[0])).toBe(true);
  });

  it('picks the step material from what the paws touch: boards, roads, beach and shallows', async () => {
    const pier = { id: 'pier', min: { x: 10, y: 0, z: 10 }, max: { x: 14, y: 1.2, z: 14 }, material: 'wood' as const };
    const world = { colliders: [pier], objects: [], districts: [], chests: [], walkways: [] } as unknown as WorldSpec;
    const { audio } = await engine(undefined, world);
    expect(audio.materialAt({ x: 12, y: 1.2, z: 12 })).toBe('wood');
    // Under the pier's deck the paws are on the ground again.
    expect(audio.materialAt({ x: 12, y: -3, z: 12 })).not.toBe('wood');
    let road: { x: number; z: number } | null = null, beach: { x: number; z: number } | null = null;
    for (let x = -120; x < 120 && (!road || !beach); x += 3) for (let z = -120; z < 120; z += 3) {
      const s = terrainSurface(x, z);
      if (s === 'stone' && !road) road = { x, z };
      if (s === 'sand' && !beach && audio.materialAt({ x, y: 5, z }) === 'sand') beach = { x, z };
    }
    expect(audio.materialAt({ ...road!, y: 2 })).toBe('stone');
    expect(beach).not.toBeNull();
  });

  it('sounds soaking once, keeps bubbles sparse after stalls, and cancels against a stale snapshot', async () => {
    const { audio, ctx } = await steps(), local = actor();
    local.soaking = true; local.velocity.x = 0;
    for (let i = 0; i < 12; i++) update(audio, local);
    expect(audio.mudSound).toHaveBeenCalledOnce();
    expect(audio.mudSound.mock.calls[0][2]).toBe(true);
    ctx.currentTime = 31;
    update(audio, local);
    expect(audio.mudSound.mock.calls.map((call: unknown[]) => call[2])).toEqual([true, false]);
    const channel = audio.mudVoices.get('self').channel as FakeNode;
    local.soaking = false;
    audio.update(local, snapshot([{ ...local, soaking: true }]), 1 / 60, false);
    expect(channel.outputs.size).toBe(0);
    ctx.currentTime = 40; update(audio, local);
    expect(audio.mudSound).toHaveBeenCalledTimes(2);
    local.soaking = true; update(audio, local);
    expect(audio.mudSound.mock.calls[2][2]).toBe(true);
  });

  it('only voices nearby soaking, and never replays the entry plop for an already soaking capy', async () => {
    const { audio } = await steps(), local = actor(), remote = actor('remote');
    local.velocity.x = 0; remote.velocity.x = 0;
    remote.soaking = true; remote.pos.x = 20;
    update(audio, local, [remote]); expect(audio.mudSound).not.toHaveBeenCalled();
    remote.pos.x = 4; update(audio, local, [remote]);
    expect(audio.mudSound.mock.calls[0][2]).toBe(false);
    remote.soaking = false; update(audio, local, [remote]);
    remote.soaking = true; update(audio, local, [remote]);
    expect(audio.mudSound.mock.calls[1][2]).toBe(true);
  });
});

describe('mix graph', () => {
  it('sends every bus through the limiter and a clipper that cannot reach full scale', async () => {
    const { audio, ctx } = await engine();
    const inputs = [...ctx.destination.inputs];
    expect(inputs).toHaveLength(1);
    const clipper = inputs[0] as FakeNode & { curve: Float32Array };
    expect(clipper.kind).toBe('shaper');
    expect(Math.max(...clipper.curve.map(Math.abs))).toBeLessThan(.99);
    expect([...clipper.inputs][0].kind).toBe('compressor');
    // Every bus reaches the master, and nothing but the clipper touches the destination.
    const reaches = (node: FakeNode, target: FakeNode, depth = 0): boolean => node === target || (depth < 6 && [...node.outputs].some(n => reaches(n, target, depth + 1)));
    for (const bus of ['effects', 'ambience', 'music']) expect(reaches(audio.buses[bus], audio.buses.master), bus).toBe(true);
    expect(reaches(audio.remoteFire, audio.buses.effects)).toBe(true);
    expect(safetyCurve().length).toBeGreaterThan(1000);
  });

  it('keeps the recommended slider defaults and applies live volume changes', async () => {
    // Music is a real score now (bossa menu, drop samba, endgame pulse), so it defaults to half.
    expect([DEFAULT_SETTINGS.master, DEFAULT_SETTINGS.effects, DEFAULT_SETTINGS.ambience, DEFAULT_SETTINGS.music]).toEqual([.8, .85, .45, .5]);
    const { audio } = await engine();
    audio.setSettings({ ...DEFAULT_SETTINGS, music: .1 });
    expect(audio.buses.master.gain.last).toEqual(['target', .8, 1, .025]);
    expect(audio.buses.effects.gain.last).toEqual(['target', .85, 1, .025]);
    expect(audio.buses.ambience.gain.last).toEqual(['target', .45, 1, .08]);
    expect(audio.buses.music.gain.last).toEqual(['target', .1, 1, .08]);
  });

  it('caps simultaneous gunfire voices so a firefight cannot flood the mixer', async () => {
    const { audio, ctx } = await engine();
    for (let i = 0; i < 100; i++) audio.event({ id: i, type: 'shot', actor: `bot-${i}`, weapon: 'm4', origin: { x: 10, y: 0, z: 0 }, end: { x: 20, y: 0, z: 0 }, hit: true }, here, 0, 'self');
    expect(ctx.started.filter(s => s.buffer?.id.startsWith('shot:') || s.buffer?.id.startsWith('far:')).length).toBeLessThanOrEqual(20);
  });

  it('only ever asks for sounds that exist in the bank', async () => {
    const { audio, requested } = await engine();
    const events = [
      { type: 'shot', actor: 'self', weapon: 'shotgun', origin: here, end: { x: 5, y: 0, z: 0 }, hit: false, surface: 'wood' },
      { type: 'shot', actor: 'self', weapon: 'sniper', origin: here, end: here, hit: true },
      { type: 'shot', actor: 'e', weapon: 'coco', origin: { x: 30, y: 0, z: 0 }, end: here, hit: false },
      { type: 'shot', actor: 'e', weapon: 'machete', origin: { x: 2, y: 0, z: 0 }, end: here, hit: false },
      { type: 'damage', actor: 'self', target: 'e', amount: 10, head: true, pos: here, armorBreak: true },
      { type: 'damage', actor: 'e', target: 'self', amount: 10, head: false, pos: here },
      { type: 'damage', actor: '', target: 'self', amount: 4, head: false, pos: here },
      { type: 'kill', actor: 'self', target: 'e', weapon: 'm4' },
      { type: 'pickup', actor: 'self', item: 'x' }, { type: 'use', actor: 'self', item: 'rapadura' }, { type: 'respawn', actor: 'self' },
      { type: 'upgrade', actor: 'self', weapon: 'm4', level: 7 }, { type: 'bounce', actor: 'self', pos: here },
      { type: 'supply', drop: 'd', district: 'vila', pos: here, stage: 'incoming' }, { type: 'supply', drop: 'd', district: 'vila', pos: here, stage: 'landed' },
      { type: 'supply', drop: 'd', district: 'vila', pos: here, stage: 'opened' }, { type: 'impact', actor: 'e', weapon: 'coco', pos: { x: 3, y: 0, z: 0 }, surface: 'dirt', normal: here },
      { type: 'notice', text: 'x' },
    ];
    events.forEach((event, i) => audio.event({ id: i, ...event }, here, 0, 'self'));
    for (const cue of ['mag-out', 'slide-home', 'bolt-back', 'shell-in', 'eject', 'coconut-in', 'draw']) audio.foley(cue);
    for (const kind of ['hover', 'click', 'back']) audio.ui(kind);
    expect(requested.length).toBeGreaterThan(30);
    for (const id of requested) expect(SOUND_BY_ID.has(id), id).toBe(true);
  });
});

describe('gunfire and combat feedback', () => {
  it('plays your own shots dry and centred, and the gun\'s action on the viewmodel\'s beat', async () => {
    const { audio, ctx } = await engine();
    audio.event({ id: 1, type: 'shot', actor: 'self', weapon: 'shotgun', origin: here, end: here, hit: true }, here, 0, 'self');
    const shot = voices(ctx, 'shot:shotgun')[0];
    expect(spatial(shot)).toBe(false);
    expect(gainOf(shot).gain.value).toBeCloseTo(levelGain(LEVEL.ownShot));
    const pump = ['foley:pump-back', 'foley:pump-home'].map(id => voices(ctx, id)[0].started!);
    expect(pump[0]).toBeGreaterThan(1); expect(pump[1]).toBeGreaterThan(pump[0]);
  });

  it('gives remote shots direction, speed-of-sound delay and a far layer that takes over with distance', async () => {
    const { audio, ctx } = await engine();
    audio.event({ id: 1, type: 'shot', actor: 'near', weapon: 'm4', origin: { x: 8, y: 0, z: 0 }, end: { x: 30, y: 0, z: 0 }, hit: true }, here, 0, 'self');
    audio.event({ id: 2, type: 'shot', actor: 'far', weapon: 'm4', origin: { x: 150, y: 0, z: 0 }, end: { x: 200, y: 0, z: 0 }, hit: true }, here, 0, 'self');
    expect(voices(ctx, 'far:m4')).toHaveLength(1);
    const near = voices(ctx, 'shot:m4')[0], far = voices(ctx, 'far:m4')[0];
    expect(spatial(near)).toBe(true); expect(spatial(far)).toBe(true);
    expect(far.started! - 1).toBeCloseTo(150 / 343, 2);
    expect(gainOf(far).gain.value).toBeLessThan(gainOf(near).gain.value);
    // Other players' gunfire runs through its own bus under the effects bus.
    const reachesRemote = (n: FakeNode, d = 0): boolean => n === audio.remoteFire || (d < 5 && [...n.outputs].some(o => reachesRemote(o, d + 1)));
    expect(reachesRemote(near)).toBe(true);
  });

  it('cracks a near miss past your head but not a shot that goes elsewhere', async () => {
    const { audio, ctx } = await engine();
    audio.event({ id: 1, type: 'shot', actor: 'e', weapon: 'dmr', origin: { x: 0, y: 1, z: -60 }, end: { x: 1, y: 1, z: 40 }, hit: false }, here, 0, 'self');
    expect(voices(ctx, 'whiz')).toHaveLength(1);
    audio.event({ id: 2, type: 'shot', actor: 'e', weapon: 'dmr', origin: { x: 0, y: 1, z: -60 }, end: { x: 40, y: 1, z: 40 }, hit: false }, here, 0, 'self');
    expect(voices(ctx, 'whiz')).toHaveLength(1);
  });

  it('muffles gunfire behind a wall without silencing it', async () => {
    const wall = { id: 'wall', min: { x: 4, y: 35, z: -5 }, max: { x: 5, y: 45, z: 5 }, material: 'stone' as const }; // high above the terrain
    const world = { colliders: [wall], objects: [], districts: [], chests: [], walkways: [] } as unknown as WorldSpec;
    const { audio, ctx } = await engine(undefined, world);
    audio.event({ id: 1, type: 'shot', actor: 'e', weapon: 'pistol', origin: { x: 12, y: 40, z: 0 }, end: { x: 30, y: 40, z: 0 }, hit: true }, { x: 0, y: 40, z: 0 }, 0, 'self');
    audio.event({ id: 2, type: 'shot', actor: 'e', weapon: 'pistol', origin: { x: -12, y: 40, z: 0 }, end: { x: -30, y: 40, z: 0 }, hit: true }, { x: 0, y: 40, z: 0 }, 0, 'self');
    const [behind, open] = voices(ctx, 'shot:pistol');
    const cutoff = (s: FakeSource) => ([...gainOf(s).outputs][0] as FakeNode & { frequency?: { value: number } }).frequency?.value ?? 20000;
    expect(cutoff(behind)).toBeLessThan(2000);
    expect(cutoff(open)).toBeGreaterThan(5000);
    expect(gainOf(behind).gain.value).toBeLessThan(gainOf(open).gain.value);
    expect(gainOf(behind).gain.value).toBeGreaterThan(gainOf(open).gain.value * .4);
  });

  it('ducks other players\' gunfire by 6 dB for a quarter second under your hit confirm', async () => {
    const { audio } = await engine();
    audio.event({ id: 3, type: 'damage', actor: 'self', target: 'enemy', amount: 26, head: false, pos: here }, here, 0, 'self');
    expect(audio.remoteFire.gain.events).toContainEqual(['target', .5, 1, .008]);
    expect(audio.remoteFire.gain.events).toContainEqual(['target', 1, 1.25, .12]);
  });

  it('gives a headshot a distinct bell cue that a body hit never plays', async () => {
    const { audio, ctx } = await engine();
    audio.event({ id: 1, type: 'damage', actor: 'self', target: 'enemy', amount: 26, head: false, pos: here }, here, 0, 'self');
    expect(played(ctx)).toEqual(['fb:hit']);
    audio.event({ id: 2, type: 'damage', actor: 'self', target: 'enemy2', amount: 52, head: true, pos: here }, here, 0, 'self');
    expect(played(ctx)).toEqual(['fb:hit', 'fb:head']);
    expect(LEVEL.head).toBeGreaterThan(LEVEL.hit);
  });

  it('plays incoming damage toward the attacker and a storm bite as its own cue', async () => {
    const { audio, ctx } = await engine();
    audio.lastSnapshot = { actors: [{ id: 'east', pos: { x: 10, y: 0, z: 0 } }] };
    // Facing -z (yaw 0), an attacker at +x is on the right.
    audio.event({ id: 1, type: 'damage', actor: 'east', target: 'self', amount: 20, head: false, pos: here }, here, 0, 'self');
    const hurt = voices(ctx, 'fb:damage')[0], pan = [...gainOf(hurt).outputs][0] as FakeNode & { pan: { value: number } };
    expect(pan.pan.value).toBeGreaterThan(.5);
    audio.event({ id: 2, type: 'damage', actor: '', target: 'self', amount: 4, head: false, pos: here }, here, 0, 'self');
    expect(voices(ctx, 'fb:storm-bite')).toHaveLength(1);
  });

  it('ducks only for nearby or your own combat and gives lethal hits the elimination voice slot', async () => {
    const { audio } = await engine();
    audio.voiceChirp = vi.fn();
    const far = { x: 100, y: 0, z: 0 };
    audio.lastSnapshot = { actors: [{ id: 'far', pos: far }, { id: 'near', pos: here }, { id: 'lethal', pos: here }] };
    audio.event({ id: 1, type: 'damage', actor: 'enemy', target: 'far', amount: 10, head: false, pos: far }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.duckUntil).toBe(0);
    audio.event({ id: 2, type: 'damage', actor: 'enemy', target: 'near', amount: 10, head: false, pos: here }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.duckUntil).toBeGreaterThan(2);
    expect(audio.voiceChirp).toHaveBeenCalledWith('hurt', 'near', here, here, 'self');
    audio.event({ id: 3, type: 'damage', actor: 'enemy', target: 'lethal', amount: 100, head: false, pos: here }, here, 0, 'self');
    audio.event({ id: 4, type: 'kill', actor: 'enemy', target: 'lethal', weapon: 'smg' }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.voiceChirp).not.toHaveBeenCalledWith('hurt', 'lethal', here, here, 'self');
    expect(audio.voiceChirp).toHaveBeenCalledWith('elimination', 'lethal', here, here, 'self');
  });

  it('limits repeated actor calls and caps overlapping remote voices at six', async () => {
    const { audio, ctx } = await engine();
    audio.voiceChirp('hurt', 'one', here, here, 'self');
    audio.voiceChirp('elimination', 'one', here, here, 'self');
    expect(played(ctx)).toHaveLength(1);
    for (let i = 2; i <= 8; i++) audio.voiceChirp('spot', `actor-${i}`, here, here, 'self');
    expect(audio.voiceEnds).toHaveLength(6);
    ctx.currentTime = 3.1;
    audio.voiceChirp('hurt', 'one', here, here, 'self');
    expect(played(ctx).filter(id => id === 'voice:hurt')).toHaveLength(2);
  });

  it('voices a bot\'s pre-attack alert from the bot, and only to the player it targets', async () => {
    const { audio } = await engine();
    audio.voiceChirp = vi.fn();
    const bot = { id: 'bot-1', pos: { x: 12, y: 0, z: 0 } };
    audio.lastSnapshot = { actors: [bot] };
    audio.event({ id: 1, type: 'alert', actor: 'bot-1', target: 'someone-else', delay: .5 }, here, 0, 'self');
    expect(audio.voiceChirp).not.toHaveBeenCalled();
    audio.event({ id: 2, type: 'alert', actor: 'bot-1', target: 'self', delay: .5 }, here, 0, 'self');
    expect(audio.voiceChirp).toHaveBeenCalledWith('spot', 'bot-1', bot.pos, here, 'self');
  });

  it('leaves your reload to the viewmodel and voices a nearby enemy\'s reload from where it stands', async () => {
    const { audio, ctx } = await engine();
    audio.lastSnapshot = { actors: [{ id: 'self', pos: here }, { id: 'e', pos: { x: 6, y: 0, z: 0 } }, { id: 'far', pos: { x: 60, y: 0, z: 0 } }] };
    audio.event({ id: 1, type: 'reload', actor: 'self', weapon: 'm4' }, here, 0, 'self');
    audio.event({ id: 2, type: 'reload', actor: 'far', weapon: 'm4' }, here, 0, 'self');
    expect(played(ctx)).toEqual([]);
    audio.event({ id: 3, type: 'reload', actor: 'e', weapon: 'm4' }, here, 0, 'self');
    expect(played(ctx)).toEqual(['foley:mag-out', 'foley:mag-in', 'foley:slide-home']);
    expect(ctx.started.every(spatial)).toBe(true);
  });
});

describe('world, pickups and flow', () => {
  it('announces a delivery island-wide but plays landing and opening only nearby', async () => {
    const { audio, ctx } = await engine(), event = { id: 1, type: 'supply', drop: 'tucano-1', district: 'vila', pos: { x: 150, y: 0, z: 0 } };
    audio.event({ ...event, stage: 'incoming' }, here, 0, 'self');
    audio.event({ ...event, stage: 'landed' }, here, 0, 'self');
    audio.event({ ...event, stage: 'opened' }, here, 0, 'self');
    expect(played(ctx)).toEqual(['fb:supply-incoming']);
    audio.event({ ...event, pos: { x: 20, y: 0, z: 0 }, stage: 'landed' }, here, 0, 'self');
    audio.event({ ...event, pos: { x: 5, y: 0, z: 0 }, stage: 'opened' }, here, 0, 'self');
    expect(played(ctx)).toEqual(['fb:supply-incoming', 'fb:supply-land', 'fb:supply-open']);
  });

  it('gives every consumable and pickup kind its own confirmation, and rare guns a chime', async () => {
    const { audio, ctx } = await engine();
    for (const item of ['bandage', 'medkit', 'rapadura', 'guarana', 'acai'] as const) audio.event({ id: 1, type: 'use', actor: 'self', item }, here, 0, 'self');
    expect(new Set(played(ctx)).size).toBe(5);
    audio.lastSnapshot = { actors: [], loot: [{ id: 'l0', kind: 'weapon', rarity: 0 }, { id: 'l3', kind: 'weapon', rarity: 3 }, { id: 'a', kind: 'ammo' }, { id: 'h', kind: 'helmet' }] };
    for (const item of ['l0', 'l3', 'a', 'h']) audio.event({ id: 2, type: 'pickup', actor: 'self', item }, here, 0, 'self');
    expect(played(ctx).slice(5)).toEqual(['fb:pick-weapon', 'fb:pick-weapon', 'fb:rare-3', 'fb:pick-ammo', 'fb:pick-helmet']);
  });

  it('celebrates a local ladder upgrade higher each level and keeps distant upgrades out of the mix', async () => {
    const { audio, ctx } = await engine();
    audio.event({ id: 1, type: 'upgrade', actor: 'self', weapon: 'm4', level: 2 }, here, 0, 'self');
    audio.event({ id: 2, type: 'upgrade', actor: 'self', weapon: 'm4', level: 5 }, here, 0, 'self');
    const [a, b] = voices(ctx, 'fb:upgrade');
    expect(b.playbackRate.value).toBeGreaterThan(a.playbackRate.value);
    audio.lastSnapshot = { actors: [{ id: 'far', pos: { x: 100, y: 0, z: 0 } }] };
    audio.event({ id: 3, type: 'upgrade', actor: 'far', weapon: 'machete', level: 7 }, here, 0, 'self');
    expect(voices(ctx, 'fb:upgrade')).toHaveLength(2);
  });

  it('beats the low-health heart only while alive under the threshold, faster as health drops', async () => {
    const { audio, ctx } = await engine();
    const beat = (hp: number, alive = true) => {
      const before = voices(ctx, 'fb:heart').length; audio.nextHeart = 0;
      audio.update({ ...actor(), hp, alive }, snapshot([]), 1 / 60, false);
      return voices(ctx, 'fb:heart').length - before;
    };
    expect(beat(LOW_HP + 20)).toBe(0);
    expect(beat(0, false)).toBe(0);
    expect(beat(LOW_HP - 5)).toBe(1);
    const slow = audio.nextHeart - 1;
    beat(4);
    expect(audio.nextHeart - 1).toBeLessThan(slow);
  });

  it('rumbles the storm outside the safe zone, hums near its wall, and stays silent deep inside', async () => {
    const { audio } = await engine();
    const zone = { x: 0, z: 0, radius: 50, shrinking: false };
    const at = (x: number) => { audio.update({ ...actor(), pos: { x, y: 0, z: 0 } }, snapshot([], { config: { mode: 'battle-royale' }, zone, remaining: 8 }), 1 / 60, false); return audio.loops.get('bed:storm')?.gain.gain.value ?? 0; };
    expect(at(0)).toBe(0);
    const wall = at(40);
    expect(wall).toBeGreaterThan(0);
    expect(at(60)).toBeCloseTo(STORM_LEVEL);
    expect(wall).toBeLessThan(STORM_LEVEL / 4);
  });

  it('plays the bossa in menus, samba on the drop, tension in the endgame and nothing in ordinary fights', async () => {
    const { audio } = await engine();
    const loudest = () => [...audio.loops.entries()].filter(([k]: [string]) => k.startsWith('music:')).filter(([, l]: [string, any]) => l.gain.gain.value > 0).map(([k]: [string]) => k);
    audio.update(null, null, 1 / 60, true);
    expect(loudest()).toEqual(['music:menu']);
    const br = { config: { mode: 'battle-royale' }, remaining: 8 };
    audio.update({ ...actor(), stage: 'falling' }, snapshot([], br), 1 / 60, false);
    expect(loudest()).toEqual(['music:samba']);
    audio.update(actor(), snapshot([], br), 1 / 60, false);
    expect(loudest()).toEqual([]);
    audio.update(actor(), snapshot([], { ...br, remaining: 2 }), 1 / 60, false);
    expect(loudest()).toEqual(['music:tension']);
    // Combat ducks the music bus.
    audio.event({ id: 1, type: 'shot', actor: 'self', weapon: 'pistol', origin: here, end: here, hit: true }, here, 0, 'self');
    audio.update(actor(), snapshot([], { ...br, remaining: 2 }), 1 / 60, false);
    expect(audio.buses.musicDuck.gain.value).toBeLessThan(.5);
  });

  it('counts down, blows the whistle at the start and plays a result stinger once', async () => {
    const { audio, ctx } = await engine();
    audio.myId = 'self';
    for (const c of [3, 2.5, 2, 1]) audio.update(actor(), snapshot([], { phase: 'countdown', countdown: c }), 1 / 60, false);
    expect(voices(ctx, 'fb:ui-tick')).toHaveLength(3);
    audio.update(actor(), snapshot([]), 1 / 60, false);
    expect(voices(ctx, 'fb:ui-go')).toHaveLength(1);
    const results = [{ id: 'self', winner: true }];
    audio.update(actor(), snapshot([], { phase: 'results', results }), 1 / 60, false);
    audio.update(actor(), snapshot([], { phase: 'results', results }), 1 / 60, false);
    expect(voices(ctx, 'music:victory')).toHaveLength(1);
  });

  it('starts a samba loop for a dancing capybara and stops it when the dance ends', async () => {
    const { audio } = await engine();
    audio.nextSpotCheck = Infinity;
    const me = actor(), dancer = actor('d'); me.velocity.x = 0; dancer.velocity.x = 0; dancer.pos.x = 6; dancer.emote = 'dance';
    audio.update(me, snapshot([me, dancer]), 1 / 60, false);
    expect(audio.loops.has('dance:d')).toBe(true);
    dancer.emote = null;
    audio.update(me, snapshot([me, dancer]), 1 / 60, false);
    expect(audio.loops.has('dance:d')).toBe(false);
  });

  it('fills the island with ambience only in play, and quiets it under combat', async () => {
    const { audio } = await engine();
    audio.update(null, null, 1 / 60, true);
    expect(audio.loops.get('bed:wind')?.gain.gain.value ?? 0).toBe(0);
    audio.update(actor(), snapshot([actor()]), 1 / 60, false);
    expect(audio.loops.get('bed:wind').gain.gain.value).toBeGreaterThan(0);
    audio.event({ id: 1, type: 'shot', actor: 'self', weapon: 'pistol', origin: here, end: here, hit: true }, here, 0, 'self');
    audio.update(actor(), snapshot([actor()]), 1 / 60, false);
    expect(audio.buses.ambienceDuck.gain.value).toBeLessThan(.5);
  });
});
