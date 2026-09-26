import { describe, expect, it, vi } from 'vitest';
import { LOW_HP, SoundEngine, STORM_LEVEL } from '../src/audio';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('ground contact audio', () => {
  function engine() {
    const audio = new SoundEngine({ ...DEFAULT_SETTINGS, music: 0 }) as any;
    audio.context = { currentTime: 1, state: 'running' };
    audio.buses = { effects: {} };
    audio.updateAmbient = vi.fn(); audio.updateStorm = vi.fn(); audio.updateReload = vi.fn();
    audio.placeListener = vi.fn(); audio.spatial = vi.fn((_pos, output) => output);
    audio.footstep = vi.fn(); audio.nextSpotCheck = Infinity;
    return audio;
  }
  function actor(id = 'self') {
    return { id, alive: true, hp: 100, stage: 'ground', grounded: true, crouch: false, sprint: false,
      pos: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, yaw: 0 };
  }
  function update(audio: any, local: ReturnType<typeof actor>, remotes: ReturnType<typeof actor>[] = []) {
    // A delayed authoritative local snapshot can still report contact during a
    // predicted jump. The explicit local argument must win for local sounds.
    audio.update(local, { phase: 'playing', actors: [{ ...local, grounded: true }, ...remotes] }, 1 / 60, false);
  }

  it('stops steps on a predicted jump, lands once, and resumes only while moving', () => {
    const audio = engine(), local = actor();
    update(audio, local);
    for (let i = 0; i < 3; i++) { local.pos.x += .5; update(audio, local); }
    local.grounded = false;
    for (let i = 0; i < 8; i++) { local.pos.x += .5; local.velocity.y = 6 - i * 2; update(audio, local); }
    expect(audio.footstep).not.toHaveBeenCalled();
    local.grounded = true; local.velocity = { x: 0, y: 0, z: 0 };
    update(audio, local);
    for (let i = 0; i < 8; i++) update(audio, local);
    expect(audio.footstep).toHaveBeenCalledOnce();
    expect(audio.footstep.mock.calls[0][2]).toBe(true);
    local.velocity.x = 3;
    for (let i = 0; i < 4; i++) { local.pos.x += .5; update(audio, local); }
    expect(audio.footstep.mock.calls.map((call: any[]) => call[2])).toEqual([true, false]);
  });

  it('uses snapshot contact for remote jumps and emits one spatial landing', () => {
    const audio = engine(), local = actor(), remote = actor('remote');
    local.velocity.x = 0;
    update(audio, local, [remote]);
    remote.grounded = false; remote.velocity.y = -10;
    for (let i = 0; i < 8; i++) { remote.pos.x += .5; update(audio, local, [remote]); }
    expect(audio.footstep).not.toHaveBeenCalled();
    remote.grounded = true; remote.velocity = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 8; i++) update(audio, local, [remote]);
    expect(audio.footstep).toHaveBeenCalledOnce();
    expect(audio.footstep.mock.calls[0][2]).toBe(true);
    expect(audio.spatial).toHaveBeenCalledOnce();
  });

  it('scales touchdown weight with the downward speed', () => {
    const land = (speed: number) => {
      const audio = engine(), local = actor(); local.grounded = false; local.velocity.y = -speed;
      update(audio, local); local.grounded = true; local.velocity.y = 0; update(audio, local);
      expect(audio.footstep).toHaveBeenCalledOnce();
      return audio.footstep.mock.calls[0][1];
    };
    expect(land(16)).toBeGreaterThan(land(4));
  });

  it('makes crouch walking quieter and less frequent for local and remote actors', () => {
    const walk = (crouch: boolean, remote: boolean) => {
      const audio = engine(), local = actor(), walker = remote ? actor('remote') : local;
      walker.crouch = crouch;
      if (remote) local.velocity.x = 0;
      const others = remote ? [walker] : [];
      update(audio, local, others);
      for (let i = 0; i < 8; i++) { walker.pos.x += .5; update(audio, local, others); }
      return audio.footstep.mock.calls;
    };
    for (const remote of [false, true]) {
      const normal = walk(false, remote), quiet = walk(true, remote);
      expect(normal).toHaveLength(2); expect(quiet).toHaveLength(1);
      expect(quiet[0][1]).toBeLessThan(normal[0][1]);
    }
  });

  it('does not mistake respawn or a change of spectator for a landing', () => {
    const audio = engine(), local = actor();
    update(audio, local); local.alive = false; local.grounded = false; update(audio, local);
    local.alive = true; local.grounded = true; update(audio, local);
    local.grounded = false; update(audio, local); update(audio, actor('spectated'));
    expect(audio.footstep).not.toHaveBeenCalled();
  });

  it('adds a landing thud even when recorded footstep samples are loaded', () => {
    const audio = engine();
    audio.footstep = (SoundEngine.prototype as any).footstep;
    audio.playSample = vi.fn(() => true); audio.tone = vi.fn();
    audio.footstep(actor().pos, .2, false);
    expect(audio.tone).not.toHaveBeenCalled();
    audio.footstep(actor().pos, .2, true);
    expect(audio.playSample).toHaveBeenCalledTimes(2);
    expect(audio.tone).toHaveBeenCalledOnce();
  });
});

describe('audio mix and capybara chirps', () => {
  it('keeps the recommended bus defaults and accepts live volume changes', () => {
    expect([DEFAULT_SETTINGS.master, DEFAULT_SETTINGS.effects, DEFAULT_SETTINGS.ambience, DEFAULT_SETTINGS.music]).toEqual([.8, .85, .45, .25]);
    const audio = new SoundEngine(DEFAULT_SETTINGS) as any;
    const gain = () => ({ gain: { setTargetAtTime: vi.fn() } });
    audio.context = { currentTime: 1 };
    audio.buses = { master: gain(), effects: gain(), ambience: gain(), music: gain() };
    audio.setSettings({ ...DEFAULT_SETTINGS, music: .1 });
    expect(audio.buses.master.gain.setTargetAtTime).toHaveBeenCalledWith(.8, 1, .025);
    expect(audio.buses.effects.gain.setTargetAtTime).toHaveBeenCalledWith(.85, 1, .025);
    expect(audio.buses.ambience.gain.setTargetAtTime).toHaveBeenCalledWith(.45, 1, .08);
    expect(audio.buses.music.gain.setTargetAtTime).toHaveBeenCalledWith(.1, 1, .08);
  });

  it('limits repeated actor calls and caps overlapping remote voices at six', () => {
    const audio = new SoundEngine(DEFAULT_SETTINGS) as any;
    audio.context = { currentTime: 1 };
    audio.buses = { effects: {} };
    audio.spatial = vi.fn(() => ({}));
    audio.tone = vi.fn();
    const position = { x: 0, y: 0, z: 0 };
    audio.voiceChirp('hurt', 'one', position, position, 'self');
    audio.voiceChirp('elimination', 'one', position, position, 'self');
    expect(audio.tone).toHaveBeenCalledTimes(2);
    for (let i = 2; i <= 8; i++) audio.voiceChirp('spot', `actor-${i}`, position, position, 'self');
    expect(audio.voiceEnds).toHaveLength(6);
    expect(audio.tone).toHaveBeenCalledTimes(12);
    audio.context.currentTime = 3.1;
    audio.voiceChirp('hurt', 'one', position, position, 'self');
    expect(audio.tone).toHaveBeenCalledTimes(14);
  });

  it('ducks only nearby or player combat and gives lethal hits the elimination voice slot', async () => {
    const audio = new SoundEngine(DEFAULT_SETTINGS) as any;
    audio.context = { currentTime: 1, state: 'running' };
    audio.buses = { effects: {} };
    audio.placeListener = vi.fn();
    audio.voiceChirp = vi.fn(); audio.poof = vi.fn();
    const here = { x: 0, y: 0, z: 0 }, far = { x: 100, y: 0, z: 0 };
    audio.lastSnapshot = { actors: [
      { id: 'far', pos: far }, { id: 'near', pos: here }, { id: 'lethal', pos: here },
    ] };
    audio.event({ id: 1, type: 'damage', actor: 'enemy', target: 'far', amount: 10, head: false, pos: far }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.duckUntil).toBe(0);
    audio.event({ id: 2, type: 'damage', actor: 'enemy', target: 'near', amount: 10, head: false, pos: here }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.duckUntil).toBe(3);
    expect(audio.voiceChirp).toHaveBeenCalledWith('hurt', 'near', here, here, 'self');
    audio.event({ id: 3, type: 'damage', actor: 'enemy', target: 'lethal', amount: 100, head: false, pos: here }, here, 0, 'self');
    audio.event({ id: 4, type: 'kill', actor: 'enemy', target: 'lethal', weapon: 'smg' }, here, 0, 'self');
    await Promise.resolve();
    expect(audio.voiceChirp).not.toHaveBeenCalledWith('hurt', 'lethal', here, here, 'self');
    expect(audio.voiceChirp).toHaveBeenCalledWith('elimination', 'lethal', here, here, 'self');
  });

  it('plays a sparse in-match bed and ducks it by about 6 dB for nearby combat', () => {
    const audio = new SoundEngine(DEFAULT_SETTINGS) as any;
    const gain = { setTargetAtTime: vi.fn() };
    audio.context = { currentTime: 1, state: 'running' };
    audio.buses = { music: {}, effects: {} };
    audio.musicDucker = { gain };
    audio.updateAmbient = vi.fn(); audio.placeListener = vi.fn(); audio.updateRemoteSteps = vi.fn(); audio.updateReload = vi.fn();
    audio.tone = vi.fn(); audio.nextSpotCheck = 100;
    const actor = { id: 'a', alive: true, stage: 'ground', pos: { x: 0, y: 0, z: 0 }, yaw: 0, velocity: { x: 0, y: 0, z: 0 } };
    audio.update(actor, { phase: 'playing', actors: [actor], config: { mode: 'deathmatch' } }, 1 / 60, false);
    expect(audio.tone).toHaveBeenCalledTimes(2);
    expect(audio.tone.mock.calls.map((call: unknown[]) => call[5])).toEqual([.009, .006]);
    audio.weapon = vi.fn();
    audio.event({ id: 1, type: 'shot', actor: 'a', weapon: 'pistol', origin: actor.pos, end: actor.pos, hit: false }, actor.pos, 0, 'a');
    expect(audio.duckUntil).toBe(3);
    audio.update(null, null, 1 / 60, false);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(.5, 1, .025);
    audio.context.currentTime = 3.1;
    audio.update(null, null, 1 / 60, false);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 3.1, .45);
  });
});

// Feedback completeness: every event gets a cue, and local feedback stays on top of the mix.
describe('combat feedback audio', () => {
  function engine() {
    const audio = new SoundEngine(DEFAULT_SETTINGS) as any;
    audio.context = { currentTime: 1, state: 'running' };
    audio.buses = { effects: { name: 'effects' }, music: {} };
    audio.remoteFire = { name: 'remote', gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } };
    audio.placeListener = vi.fn(); audio.spatial = vi.fn((_pos: unknown, out: unknown) => out);
    audio.weapon = vi.fn(); audio.metalClick = vi.fn(); audio.tone = vi.fn(); audio.noise = vi.fn(); audio.voiceChirp = vi.fn();
    audio.panned = vi.fn(() => ({ name: 'panned' }));
    return audio;
  }
  const here = { x: 0, y: 0, z: 0 };

  it('routes other players\' gunfire under a bus that local hit confirms duck by 6 dB for a quarter second', () => {
    const audio = engine();
    audio.event({ id: 1, type: 'shot', actor: 'enemy', weapon: 'm4', origin: { x: 50, y: 0, z: 0 }, end: here, hit: false }, here, 0, 'self');
    expect(audio.weapon.mock.calls[0][1]).toBe(audio.remoteFire);
    audio.event({ id: 2, type: 'shot', actor: 'self', weapon: 'm4', origin: here, end: here, hit: false }, here, 0, 'self');
    expect(audio.weapon.mock.calls[1][1]).toBe(audio.buses.effects);
    audio.event({ id: 3, type: 'damage', actor: 'self', target: 'enemy', amount: 26, head: false, pos: here }, here, 0, 'self');
    expect(audio.remoteFire.gain.setTargetAtTime).toHaveBeenCalledWith(.5, 1, .008);
    expect(audio.remoteFire.gain.setTargetAtTime).toHaveBeenCalledWith(1, 1.25, .12);
  });

  it('gives a headshot a distinct bell cue that a body hit never plays', () => {
    const audio = engine();
    audio.event({ id: 1, type: 'damage', actor: 'self', target: 'enemy', amount: 26, head: false, pos: here }, here, 0, 'self');
    expect(audio.tone).not.toHaveBeenCalled();
    audio.event({ id: 2, type: 'damage', actor: 'self', target: 'enemy', amount: 52, head: true, pos: here }, here, 0, 'self');
    expect(audio.tone.mock.calls.map((call: unknown[]) => call[2])).toContain(1568);
  });

  it('plays incoming damage toward the attacker and a storm bite as its own cue', () => {
    const audio = engine();
    audio.stormBite = vi.fn();
    audio.lastSnapshot = { actors: [{ id: 'east', pos: { x: 10, y: 0, z: 0 } }] };
    // Facing -z (yaw 0), an attacker at +x is on the right.
    audio.event({ id: 1, type: 'damage', actor: 'east', target: 'self', amount: 20, head: false, pos: here }, here, 0, 'self');
    expect(audio.panned.mock.calls[0][0]).toBeGreaterThan(.5);
    audio.event({ id: 2, type: 'damage', actor: '', target: 'self', amount: 4, head: false, pos: here }, here, 0, 'self');
    expect(audio.stormBite).toHaveBeenCalledOnce();
    expect(audio.panned).toHaveBeenCalledOnce();
  });

  it('beats the low-health heart only while alive under the threshold, faster as health drops', () => {
    const audio = engine();
    audio.updateAmbient = vi.fn(); audio.updateRemoteSteps = vi.fn(); audio.updateReload = vi.fn(); audio.updateStorm = vi.fn();
    audio.nextMusic = 1e9; audio.nextSpotCheck = 1e9;
    const actor = (hp: number, alive = true) => ({ id: 'self', alive, hp, stage: 'ground', pos: here, yaw: 0, velocity: here });
    const beat = (hp: number, alive = true) => { audio.tone.mockClear(); audio.nextHeart = 0; audio.update(actor(hp, alive), { phase: 'playing', actors: [] }, 1 / 60, false); return audio.tone.mock.calls.length; };
    expect(beat(LOW_HP + 20)).toBe(0);
    expect(beat(0, false)).toBe(0);
    expect(beat(LOW_HP - 5)).toBe(2);
    const slow = audio.nextHeart - 1;
    beat(4);
    expect(audio.nextHeart - 1).toBeLessThan(slow);
  });

  it('rumbles the storm only while the listener is outside the safe zone', () => {
    const audio = engine();
    audio.stormGain = { gain: { setTargetAtTime: vi.fn() } };
    const zone = { x: 0, z: 0, radius: 20 };
    const snap = { phase: 'playing', config: { mode: 'battle-royale' }, zone };
    audio.updateStorm({ alive: true, stage: 'ground', pos: { x: 5, y: 0, z: 0 } }, snap, false, 1);
    expect(audio.stormGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, .6);
    audio.updateStorm({ alive: true, stage: 'ground', pos: { x: 30, y: 0, z: 0 } }, snap, false, 1);
    expect(audio.stormGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(STORM_LEVEL, 1, .35);
  });

  it('voices a bot\'s pre-attack alert from the bot, and only to the player it targets', () => {
    const audio = engine();
    const bot = { id: 'bot-1', pos: { x: 12, y: 0, z: 0 } };
    audio.lastSnapshot = { actors: [bot] };
    audio.event({ id: 1, type: 'alert', actor: 'bot-1', target: 'someone-else', delay: .5 }, here, 0, 'self');
    expect(audio.voiceChirp).not.toHaveBeenCalled();
    audio.event({ id: 2, type: 'alert', actor: 'bot-1', target: 'self', delay: .5 }, here, 0, 'self');
    expect(audio.voiceChirp).toHaveBeenCalledWith('spot', 'bot-1', bot.pos, here, 'self');
  });

  it('gives every consumable and pickup rarity an audible confirmation', () => {
    const audio = engine();
    for (const item of ['bandage', 'medkit', 'rapadura', 'guarana', 'acai'] as const) {
      audio.tone.mockClear();
      audio.event({ id: 1, type: 'use', actor: 'self', item }, here, 0, 'self');
      expect(audio.tone).toHaveBeenCalled();
    }
    audio.lastSnapshot = { actors: [], loot: [{ id: 'l1', kind: 'weapon', rarity: 3 }, { id: 'l0', kind: 'weapon', rarity: 0 }] };
    audio.tone.mockClear();
    audio.event({ id: 2, type: 'pickup', actor: 'self', item: 'l0' }, here, 0, 'self');
    const common = audio.tone.mock.calls.length;
    audio.tone.mockClear();
    audio.event({ id: 3, type: 'pickup', actor: 'self', item: 'l1' }, here, 0, 'self');
    expect(audio.tone.mock.calls.length).toBeGreaterThan(common);
  });
});
