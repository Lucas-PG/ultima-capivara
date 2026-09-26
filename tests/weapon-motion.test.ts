import { describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../src/audio';
import { DEFAULT_SETTINGS } from '../src/settings';
import { WEAPONS } from '../src/shared/weapons';
import { RELOAD_CUES, createReloadPose, sampleReload, sampleMelee, smoothPose,
  MELEE_SECONDS, MELEE_HIT_STOP, MELEE_CONTACT, weaponShotDuration, type MeleePose } from '../src/shared/weapon-presentation';
import type { WeaponId } from '../src/shared/types';

const reloadable = (Object.keys(WEAPONS) as WeaponId[]).filter(id => WEAPONS[id].reload > 0);
const magazineWeapons = reloadable.filter(id => id !== 'shotgun' && id !== 'slingshot');
const melee = (time: number, side = 1) => sampleMelee(time, side, {} as MeleePose);

describe('physical first-person action timing', () => {
  it('closes every firearm action before the next legal shot instead of resetting an open bolt mid-cycle', () => {
    for (const id of reloadable) expect(weaponShotDuration(id)).toBeLessThan(60 / WEAPONS[id].rpm);
  });
  it.each(reloadable)('%s begins and ends at exact rest at its gameplay duration', id => {
    for (const progress of [0, 1, 1.1]) expect(Object.values(sampleReload(id, progress, createReloadPose())).every(value => value === 0)).toBe(true);
    // Tiny frame advances cannot jump a part or hand, including every phase boundary.
    let prior = sampleReload(id, 0, createReloadPose());
    for (let i = 1; i <= 2000; i++) {
      const next = sampleReload(id, i / 2000, createReloadPose());
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        expect(Number.isFinite(next[key])).toBe(true);
        expect(Math.abs(next[key] - prior[key])).toBeLessThan(.04);
      }
      prior = next;
    }
  });

  it.each(magazineWeapons)('%s grabs before withdrawal, seats before racking and keeps the paw attached to the mag', id => {
    const c = RELOAD_CUES[id], pose = (t: number) => sampleReload(id, t, createReloadPose());
    expect(pose(c.grab).mag).toBeCloseTo(0, 8);
    expect(pose(c.grab).handY).toBeLessThan(0);
    expect(pose(c.out).mag).toBeLessThan(-.2);
    expect(pose(c.out).handY - pose(c.grab).handY).toBeCloseTo(pose(c.out).mag, 8);
    expect(pose(c.seat).mag).toBeCloseTo(0, 8);
    expect(pose(c.seat).bump).toBe(1);
    expect(pose(c.seat).action).toBe(0);
    expect(pose(c.rack).action).toBeGreaterThan(.04);
    expect(pose(c.close).action).toBe(0);
    expect(pose(.99).lift).toBeLessThan(pose(c.grab).lift * .015);
  });

  it.each(['shotgun', 'slingshot'] as const)('%s carries a single round instead of moving an imaginary magazine', id => {
    const cue = RELOAD_CUES[id];
    const fetch = sampleReload(id, cue.out, createReloadPose());
    expect(fetch.mag).toBe(0); expect(fetch.action).toBe(0); expect(fetch.prop).toBe(1);
    expect(sampleReload(id, cue.seat, createReloadPose()).prop).toBe(0);
  });

  it('winds up opposite the fast cut, follows through, then settles within the attack cadence even on a hit', () => {
    expect(melee(.08).x).toBeGreaterThan(0);
    expect(melee(.18).x).toBeLessThan(0);
    expect(melee(.24).x).toBeLessThan(melee(.18).x);
    expect(melee(MELEE_CONTACT).smear).toBeGreaterThan(.8);
    expect(melee(.3).smear).toBe(0);
    expect(MELEE_SECONDS + MELEE_HIT_STOP).toBeLessThanOrEqual(60 / WEAPONS.machete.rpm);
    expect(Object.values(melee(0)).every(value => value === 0)).toBe(true);
    expect(Object.values(melee(MELEE_SECONDS)).every(value => value === 0)).toBe(true);
    for (const t of [.04, .1, .16, .23, .36]) {
      const left = melee(t, -1), right = melee(t, 1);
      expect(left.x).toBe(-right.x); expect(left.yaw).toBe(-right.yaw); expect(left.roll).toBe(-right.roll);
    }
    expect(smoothPose(.001)).toBeLessThan(.0000001);
    expect(1 - smoothPose(.999)).toBeLessThan(.0000001);
  });
});

describe('reload contact sounds', () => {
  function audio() {
    const sound = new SoundEngine(DEFAULT_SETTINGS) as any;
    sound.context = { currentTime: 10, createGain: () => ({ connect: vi.fn(), gain: { setTargetAtTime: vi.fn() } }) };
    sound.buses = { effects: {} };
    sound.metalClick = vi.fn(); sound.noise = vi.fn(); sound.tone = vi.fn(); sound.playSample = vi.fn(() => false);
    return sound;
  }
  it.each(reloadable)('%s schedules the seat at the actual pose contact and never replays it on a late snapshot', id => {
    const sound = audio(), duration = WEAPONS[id].reload, cue = RELOAD_CUES[id];
    const actor = { reloadUntil: 20 + duration, slot: 0, weapons: [{ id }] };
    sound.updateReload(actor, { time: 20 }, 10);
    const calls = [...sound.metalClick.mock.calls, ...sound.tone.mock.calls];
    expect(calls.some(call => Math.abs(call[1] - (10 + duration * cue.seat)) < 1e-8)).toBe(true);
    const late = audio();
    late.updateReload(actor, { time: 20 + duration * (cue.seat + .1) }, 10);
    expect(late.playSample).not.toHaveBeenCalled();
    expect(late.localReloadEnd).toBeCloseTo(10 + duration * (1 - cue.seat - .1));
    late.updateReload({ ...actor, reloadUntil: 0 }, { time: 21 }, 10.1);
    expect(late.reloadGain).toBe(null);
  });
  it('shares the rendered simulation clock instead of adding the snapshot age to reload sounds', () => {
    const sound = audio(), duration = WEAPONS.m4.reload;
    sound.updateReload({ reloadUntil: 20 + duration, slot: 0, weapons: [{ id: 'm4' }] }, { time: 20 }, 10, 20.12);
    expect(sound.playSample.mock.calls[0][3]).toBeCloseTo(10 + duration * RELOAD_CUES.m4.seat - .12);
  });
});
