import { describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../src/audio';
import { DEFAULT_SETTINGS } from '../src/settings';

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
    audio.voiceChirp = vi.fn();
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
    audio.update(actor, { phase: 'playing', actors: [actor] }, 1 / 60, false);
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
