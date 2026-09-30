// Renders the real sound bank offline and measures it. These tests guard the
// two problems players reported: gunfire that sounded like footsteps, and an
// always-on hiss over the island.
import { describe, expect, it } from 'vitest';
import { bakeOrder, REF_LUFS, renderSound, SOUND_BY_ID, SOUNDS } from '../src/sound/bank';
import { svf } from '../src/sound/dsp';
import { GUNS } from '../src/sound/weapons';
import { STEP_MATERIALS } from '../src/sound/foley';
import { ambienceMix, critterWeights, gunDistance, LEVEL, levelGain, safetyCurve, stepDistance, STEP_RANGE, worldDistance, type Place } from '../src/sound/mix';
import { DEFAULT_SETTINGS } from '../src/settings';
import { bandShare, centroid, envelopeShape, loudness, momentaryMax, noiseFloor, peak } from './audio/metrics';

const RATE = 44100;
const cache = new Map<string, { x: Float32Array; rate: number; channels: Float32Array[] }>();
function sound(id: string, variant = 0) {
  const key = `${id}#${variant}`;
  if (!cache.has(key)) {
    const r = renderSound(SOUND_BY_ID.get(id)!, variant, RATE);
    cache.set(key, { x: r.channels[0], rate: r.rate, channels: r.channels });
  }
  return cache.get(key)!;
}
const lufs = (id: string) => { const s = sound(id); return momentaryMax(s.x, s.rate); };
const shape = (id: string) => { const s = sound(id); return envelopeShape(s.x, s.rate); };
const low = (id: string) => { const s = sound(id); return bandShare(s.x, s.rate, 20, 200); };
const octaves = (a: number, b: number) => Math.abs(Math.log2(a / b));

describe('sound bank', () => {
  it('renders every sound finite, audible and normalized to the reference loudness', () => {
    for (const def of SOUNDS) {
      const s = sound(def.id);
      for (const ch of s.channels) expect(ch.every(Number.isFinite), def.id).toBe(true);
      expect(peak(s.x), def.id).toBeGreaterThan(.001);
      if (!def.loop) expect(Math.abs(momentaryMax(s.x, s.rate) - REF_LUFS), def.id).toBeLessThan(.6);
    }
  });

  it('loops without a seam: the wrap is no bigger than an ordinary sample step', () => {
    for (const def of SOUNDS.filter(s => s.loop)) for (const ch of sound(def.id).channels) {
      const steps = new Float32Array(ch.length - 1);
      for (let i = 1; i < ch.length; i++) steps[i - 1] = Math.abs(ch[i] - ch[i - 1]);
      steps.sort();
      expect(Math.abs(ch[0] - ch[ch.length - 1]), def.id).toBeLessThanOrEqual(steps[Math.floor(steps.length * .999)] + 1e-6);
    }
  });

  it('stays inside the memory budget on both quality levels', () => {
    // Float32 samples: about 40 MB on high, 24 MB on low (Leve) including music.
    const samples = (q: 'high' | 'low') => bakeOrder(q).reduce((sum, { sound: def, variant }) => {
      const r = renderSound(def, variant, RATE, q); return sum + r.channels.length * r.channels[0].length;
    }, 0);
    expect(samples('high')).toBeLessThan(10e6);
    expect(samples('low')).toBeLessThan(6e6);
  });
});

describe('gunfire never reads as footsteps', () => {
  // Levels at the mix: own shots against your own steps, and a remote shot against a
  // remote sprinting step at the same distance, which is the case that confused players.
  const shotAt = (d: number) => LEVEL.remoteShot + gunDistance(d).db;
  const stepAt = (d: number) => LEVEL.remoteStep + 3 + stepDistance(d, STEP_RANGE.sprint).db;

  it('is far louder at every distance where both can be heard', () => {
    for (const gun of GUNS) for (const material of STEP_MATERIALS) {
      const shot = lufs(`shot:${gun}`) - REF_LUFS, step = lufs(`step:${material}`) - REF_LUFS;
      expect(LEVEL.ownShot + shot - (LEVEL.ownStep + 3 + step), `${gun}/${material} own`).toBeGreaterThan(18);
      for (const d of [2, 5, 10, 20, 30]) expect(shotAt(d) + shot - (stepAt(d) + step), `${gun}/${material} @${d} m`).toBeGreaterThan(10);
    }
  });

  it('has a long reverberant tail where a step stops dead', () => {
    for (const material of STEP_MATERIALS) expect(shape(`step:${material}`).t20Ms, material).toBeLessThanOrEqual(120);
    for (const gun of GUNS) {
      const near = shape(`shot:${gun}`), far = shape(`far:${gun}`);
      expect(near.t40Ms, gun).toBeGreaterThanOrEqual(250);
      expect(far.t20Ms, gun).toBeGreaterThanOrEqual(300);
      for (const material of STEP_MATERIALS) expect(near.t40Ms / shape(`step:${material}`).t40Ms, `${gun}/${material}`).toBeGreaterThan(1.3);
    }
  });

  it('keeps the low punch for guns: steps carry almost nothing below 200 Hz', () => {
    for (const material of STEP_MATERIALS) expect(low(`step:${material}`), material).toBeLessThan(.15);
    for (const gun of GUNS) {
      expect(low(`shot:${gun}`), gun).toBeGreaterThan(.22);
      expect(low(`far:${gun}`), `far ${gun}`).toBeGreaterThan(.22);
    }
  });
});

describe('weapon signatures', () => {
  const features = (id: string) => { const s = sound(id), e = envelopeShape(s.x, s.rate); return { c: centroid(s.x, s.rate), t: e.t40Ms, low: bandShare(s.x, s.rate, 20, 200), mid: bandShare(s.x, s.rate, 1000, 4000) }; };

  it('gives every gun its own voice: pairs differ by timbre or length', () => {
    const f = Object.fromEntries(GUNS.map(g => [g, features(`shot:${g}`)]));
    for (const a of GUNS) for (const b of GUNS) if (a < b) {
      const distance = Math.hypot(octaves(f[a].c, f[b].c) / .25, Math.log2(f[a].t / f[b].t) / .3, (f[a].low - f[b].low) / .08, (f[a].mid - f[b].mid) / .08);
      expect(distance, `${a} vs ${b}`).toBeGreaterThan(1);
    }
  });

  it('makes far shots darker and longer than close ones', () => {
    for (const gun of GUNS) {
      const near = features(`shot:${gun}`), far = features(`far:${gun}`);
      expect(far.c, gun).toBeLessThan(near.c * .7);
      expect(far.t, gun).toBeGreaterThan(near.t * 1.3);
    }
  });

  it('keeps each footstep material distinct and short', () => {
    const f = Object.fromEntries(STEP_MATERIALS.map(m => [m, features(`step:${m}`)]));
    for (const a of STEP_MATERIALS) for (const b of STEP_MATERIALS) if (a < b) {
      const distance = Math.hypot(octaves(f[a].c, f[b].c) / .25, Math.log2(f[a].t / f[b].t) / .3, (f[a].mid - f[b].mid) / .08);
      expect(distance, `${a} vs ${b}`).toBeGreaterThan(1);
    }
  });
});

// ---- The idle island mix.
const MIX_RATE = 22050, SECONDS = 30;
const master = DEFAULT_SETTINGS.master, ambienceSlider = DEFAULT_SETTINGS.ambience;

function bedAt(id: string, seconds: number): Float32Array {
  const s = sound(id), out = new Float32Array(MIX_RATE * seconds), ratio = s.rate / MIX_RATE;
  for (let i = 0; i < out.length; i++) {
    const p = (i * ratio) % s.x.length, k = Math.floor(p), f = p - k;
    out[i] = s.x[k] * (1 - f) + s.x[(k + 1) % s.x.length] * f;
  }
  if (ratio < 1) svf(svf(out, MIX_RATE, 'lp', s.rate * .45), MIX_RATE, 'lp', s.rate * .45);
  return out;
}

function idleMix(place: Place): Float32Array {
  const mix = new Float32Array(MIX_RATE * SECONDS), gains = ambienceMix(place), bus = master * ambienceSlider;
  for (const [bed, db] of Object.entries(gains) as [string, number][]) {
    if (!Number.isFinite(db)) continue;
    const x = bedAt(`bed:${bed}`, SECONDS), g = levelGain(db) * bus;
    for (let i = 0; i < mix.length; i++) mix[i] += x[i] * g;
  }
  // Island life: one call every eight seconds from about 20 m, as the scheduler does.
  const choices = critterWeights(place);
  for (let k = 0; k < 3; k++) {
    const id = `critter:${choices[k % choices.length][0]}`, x = sound(id);
    const g = levelGain(LEVEL.critter + worldDistance(20, 70).db) * bus, start = Math.round((4 + k * 8) * MIX_RATE), ratio = x.rate / MIX_RATE;
    for (let i = 0; start + i < mix.length && i * ratio < x.x.length - 1; i++) mix[start + i] += x.x[Math.floor(i * ratio)] * g;
  }
  return mix;
}

const PLACES: Record<string, Place> = {
  beach: { coast: .85, height: 1, canopy: .1, inside: false, harbour: Infinity, waterfall: Infinity, district: 'praia' },
  town: { coast: .1, height: 2.2, canopy: .15, inside: false, harbour: Infinity, waterfall: Infinity, district: 'vila' },
  hill: { coast: .25, height: 24, canopy: .3, inside: false, harbour: Infinity, waterfall: Infinity, district: 'morro' },
  forest: { coast: 0, height: 6, canopy: .9, inside: false, harbour: Infinity, waterfall: Infinity, district: 'capela' },
  harbour: { coast: .5, height: 2.2, canopy: 0, inside: false, harbour: 14, waterfall: Infinity, district: 'porto' },
};

/** The pre-rebuild beds: white noise in 2 s loops, filtered, never modulated. */
function oldIdleMix(coast: number): Float32Array {
  const n = MIX_RATE * SECONDS, loopLength = MIX_RATE * 2, bus = master * ambienceSlider;
  let seed = 7;
  const white = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2147483648 - 1; };
  const loopOf = (low: boolean) => { const b = new Float32Array(loopLength); let p = 0; for (let i = 0; i < b.length; i++) { const w = white(); p = low ? p * .985 + w * .015 : w; b[i] = low ? p * 4 : w; } return b; };
  const layer = (src: Float32Array, mode: 'lp' | 'bp', f: number, q: number, gain: number) => {
    const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = src[i % loopLength];
    svf(x, MIX_RATE, mode, f, q); return x.map(v => v * gain * bus);
  };
  const wind = layer(loopOf(true), 'lp', 460, .7, .035), surf = layer(loopOf(false), 'lp', 950, .7, .015 + .08 * coast);
  const insects = layer(loopOf(false), 'bp', 3600, 1, .004 + .013 * (1 - coast));
  return wind.map((v, i) => v + surf[i] + insects[i]);
}

describe('idle island ambience', () => {
  // A hiss is a stationary broadband floor: octaves from 250 Hz to 8 kHz that hold a level
  // and never move. The old beds measured -54.7 dBFS in Chrome at default settings, flat
  // across six octaves with 1 to 4 dB of movement above 1 kHz. Designed beds may overlap
  // (surf troughs filled by a gust is a real beach), so the rule is: at most one steady
  // octave above -66 dBFS, and a floor below the old one, under -56 dBFS, which is also
  // more than 40 dB under a close gunshot at the same settings.
  const steadyBands = (x: Float32Array) => noiseFloor(x, MIX_RATE).bands.filter(b => b.centre >= 250 && b.centre <= 8000 && b.floorDb > -66 && b.swingDb < 6).length;

  it('has no constant broadband noise floor anywhere on the island', () => {
    for (const [name, place] of Object.entries(PLACES)) {
      const x = idleMix(place), floor = noiseFloor(x, MIX_RATE);
      expect(floor.broadbandFloorDb, name).toBeLessThan(-56);
      expect(steadyBands(x), name).toBeLessThanOrEqual(1);
    }
  });

  it('is still alive: audible, and breathing over time', () => {
    for (const [name, place] of Object.entries(PLACES)) {
      const x = idleMix(place), level = loudness(x, MIX_RATE), floor = noiseFloor(x, MIX_RATE);
      expect(level, name).toBeGreaterThan(-54);
      expect(level, name).toBeLessThan(-36);
      expect(Math.max(...floor.bands.map(b => b.swingDb)), name).toBeGreaterThan(10);
    }
  });

  it('would have caught the old always-on hiss', () => {
    for (const coast of [.1, .8]) {
      const x = oldIdleMix(coast), floor = noiseFloor(x, MIX_RATE);
      expect(floor.broadbandFloorDb > -56 && steadyBands(x) > 1).toBe(true);
    }
  });

  it('drops every bed under a roof', () => {
    const outside = ambienceMix(PLACES.town), inside = ambienceMix({ ...PLACES.town, inside: true });
    for (const bed of Object.keys(outside) as (keyof typeof outside)[]) if (Number.isFinite(outside[bed])) expect(inside[bed], bed).toBeLessThanOrEqual(outside[bed] - 6);
  });
});

describe('master output', () => {
  it('ends in a soft clipper that is transparent in normal play and can never reach full scale', () => {
    const curve = safetyCurve(), n = curve.length, at = (x: number) => curve[Math.round((x + 1) / 2 * (n - 1))];
    expect(Math.max(...curve.map(Math.abs))).toBeLessThan(.99);
    for (const x of [-.6, -.3, 0, .2, .5, .69]) expect(Math.abs(at(x) - x)).toBeLessThan(2e-3);
    for (let i = 1; i < n; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });

  it('keeps a worst-case pile-up below full scale at maximum sliders', () => {
    // Your shotgun, six enemy rifles at 5 m, a coconut blast, hit and kill confirms, music and surf, all at once.
    const length = RATE, sum = new Float32Array(length);
    const add = (id: string, level: number, variant = 0) => { const s = sound(id, variant), g = levelGain(level), step = s.rate / RATE; for (let i = 0; i < length && i * step < s.x.length; i++) sum[i] += s.x[Math.floor(i * step)] * g; };
    add('shot:shotgun', LEVEL.ownShot);
    for (let k = 0; k < 6; k++) add('shot:m4', LEVEL.remoteShot + gunDistance(5).db, k % 2);
    add('boom:coco', LEVEL.explosion); add('fb:hit', LEVEL.hit); add('fb:kill', LEVEL.kill); add('music:menu', LEVEL.menu); add('bed:surf', LEVEL.surf);
    const curve = safetyCurve(), n = curve.length;
    const out = sum.map(v => curve[Math.round((Math.max(-1, Math.min(1, v)) + 1) / 2 * (n - 1))]);
    expect(peak(sum)).toBeGreaterThan(.7); // the pile-up really is hot before the clipper
    expect(peak(out)).toBeLessThan(.99);
  });
});
