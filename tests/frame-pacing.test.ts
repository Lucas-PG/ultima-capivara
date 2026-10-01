import { describe, expect, it, vi } from 'vitest';
import { FramePacer } from '../src/frame-pacing';
import { loadSettings } from '../src/settings';

/** Drives the pacer with a display's refresh timestamps; returns the timestamps it drew. */
function play(pacer: FramePacer, refreshMs: number, seconds: number, limit: number, start = 0) {
  const drawn: number[] = [];
  for (let now = start; now < start + seconds * 1000; now += refreshMs) {
    pacer.tick(now);
    if (pacer.shouldRender(now, limit)) drawn.push(now);
  }
  return drawn;
}
const gaps = (drawn: number[]) => drawn.slice(1).map((t, i) => t - drawn[i]);

describe('frame pacing', () => {
  it('draws every refresh of a 60 Hz panel under the 60 cap, even one a little faster than 60 Hz', () => {
    // The old deadline dropped one frame whenever the panel drifted half a millisecond ahead.
    for (const hz of [59.94, 60, 60.1, 61]) {
      const pacer = new FramePacer(), drawn = play(pacer, 1000 / hz, 20, 60);
      expect(Math.max(...gaps(drawn).slice(30))).toBeLessThan(1000 / hz * 1.5);
    }
  });

  it('holds an even 60 on a 120 Hz screen and an average 60 on 144 Hz under the 60 cap', () => {
    const at120 = gaps(play(new FramePacer(), 1000 / 120, 10, 60)).slice(60);
    for (const gap of at120) expect(gap).toBeCloseTo(1000 / 60, 3);
    const at144 = play(new FramePacer(), 1000 / 144, 10, 60);
    expect(at144.length / 10).toBeGreaterThan(58); expect(at144.length / 10).toBeLessThan(62);
  });

  it('draws once per refresh at the display rate ("Taxa da tela") and learns the refresh interval', () => {
    const pacer = new FramePacer();
    expect(play(pacer, 1000 / 120, 5, 0).length).toBeGreaterThan(595);
    expect(pacer.displayMs).toBeCloseTo(1000 / 120, 1);
    expect(pacer.intervalMs(0)).toBeCloseTo(1000 / 120, 1);
    const at144 = new FramePacer(); play(at144, 1000 / 144, 2, 0);
    expect(at144.intervalMs(0)).toBeCloseTo(1000 / 144, 1);
  });

  it('halves a 60 Hz panel under the 30 cap', () => {
    const drawn = play(new FramePacer(), 1000 / 60, 10, 30);
    for (const gap of gaps(drawn).slice(10)) expect(gap).toBeCloseTo(1000 / 30, 3);
  });

  it('never talks its own budget up when the game is too slow to reach the refresh rate', () => {
    // Every frame takes two refreshes: the budget must stay 60 fps so the dynamic resolution reacts.
    const pacer = new FramePacer();
    for (let now = 0; now < 5000; now += 1000 / 30) { pacer.tick(now); pacer.shouldRender(now, 60); }
    expect(pacer.intervalMs(60)).toBeCloseTo(1000 / 60, 3);
    expect(pacer.intervalMs(0)).toBeLessThanOrEqual(1000 / 60);
  });

  it('does not catch up after a stall with a burst of frames', () => {
    const pacer = new FramePacer();
    const before = play(pacer, 1000 / 120, 2, 60);
    const after = play(pacer, 1000 / 120, 2, 60, before.at(-1)! + 300);
    for (const gap of gaps(after).slice(1)) expect(gap).toBeGreaterThan(1000 / 60 - 1);
  });
});

describe('frame limit setting', () => {
  const load = (saved: object) => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved), setItem: () => {} });
    const settings = loadSettings(); vi.unstubAllGlobals(); return settings;
  };
  it('moves saves that only carried the old 60 default to the display rate, and keeps real choices', () => {
    expect(load({ frameLimit: 60 })).toMatchObject({ frameLimit: 0, frameLimitChosen: false });
    expect(load({ frameLimit: 60, frameLimitChosen: true })).toMatchObject({ frameLimit: 60, frameLimitChosen: true });
    expect(load({ frameLimit: 30 })).toMatchObject({ frameLimit: 30, frameLimitChosen: true });
    expect(load({ frameLimit: 0, frameLimitChosen: true })).toMatchObject({ frameLimit: 0, frameLimitChosen: true });
    expect(load({ frameLimit: 144 })).toMatchObject({ frameLimit: 0 });
  });
});
