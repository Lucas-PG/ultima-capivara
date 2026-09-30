// Weapon signatures. Every gun is built from the same layers so each layer can
// be tuned for identity: a supersonic crack or muzzle pop (transient), a sub
// "blast" and low body (punch), a mid "bark" band (the gun's voice), its
// mechanism (slide, bolt, spring, cylinder) and an outdoor tail with echoes.
// Far versions keep the gun's identity but trade the crack for a dark pop and
// a long rolling terrain echo, which footsteps never have.
import { band, buffer, echoes, fadeOut, mix, modes, Rng, saturate, svf, tone } from './dsp';

export type Mode = readonly (readonly [freq: number, tau: number, gain: number])[];
interface Click { t: number; modes: Mode; tick: number; gain: number }
interface GunSpec {
  length: number;
  crack: { gain: number; hp: number; width: number; tau: number };
  blast: { from: number; to: number; glide: number; tau: number; gain: number };
  body: { lp: number; tau: number; gain: number };
  bark: { freq: number; q: number; tau: number; gain: number };
  drive: number;
  mech: Click[];
  tail: { tau: number; lp: number; gain: number };
  echoes: [number, number, number][];
}
interface FarSpec {
  length: number; pop: { lp: number; tau: number; gain: number }; boom: { from: number; to: number; tau: number; gain: number };
  snap: number; roll: { count: number; span: number; lp: number; tau: number; gain: number };
}

export const GUNS = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'revolver'] as const;
export type GunId = typeof GUNS[number];

const NEAR: Record<GunId, GunSpec> = {
  pistol: {
    length: .75, crack: { gain: .9, hp: 2200, width: .00035, tau: .0009 }, blast: { from: 230, to: 85, glide: .035, tau: .03, gain: 0.3 },
    body: { lp: 1760, tau: .022, gain: 0.72 }, bark: { freq: 1700, q: 1.1, tau: .018, gain: 1.2 }, drive: 2.2,
    mech: [{ t: .026, modes: [[3300, .008, .35], [5200, .005, .2], [2300, .012, .15]], tick: 4500, gain: .5 }],
    tail: { tau: .16, lp: 3200, gain: .22 }, echoes: [[.075, .22, 2600], [.19, .12, 1600]],
  },
  revolver: {
    length: 1, crack: { gain: 1, hp: 1800, width: .0005, tau: .0012 }, blast: { from: 200, to: 60, glide: .05, tau: .05, gain: 0.28 },
    body: { lp: 1872, tau: .04, gain: 0.8 }, bark: { freq: 1150, q: .9, tau: .03, gain: 1.44 }, drive: 2.8,
    mech: [{ t: .004, modes: [[2450, .05, .12], [3900, .03, .06], [1230, .07, .05]], tick: 3000, gain: .35 }],
    tail: { tau: .26, lp: 2600, gain: .3 }, echoes: [[.09, .28, 2200], [.23, .16, 1400], [.41, .08, 900]],
  },
  smg: {
    length: .5, crack: { gain: .75, hp: 2600, width: .0003, tau: .0007 }, blast: { from: 260, to: 110, glide: .025, tau: .018, gain: 0.22 },
    body: { lp: 2240, tau: .016, gain: 0.56 }, bark: { freq: 2300, q: 1.2, tau: .013, gain: 1.12 }, drive: 2,
    mech: [
      { t: .011, modes: [[3700, .006, .3], [2600, .009, .2], [5600, .004, .15]], tick: 5000, gain: .55 },
      { t: .036, modes: [[4400, .004, .12], [3100, .005, .08]], tick: 5200, gain: .25 },
    ],
    tail: { tau: .11, lp: 3600, gain: .15 }, echoes: [[.06, .15, 2800]],
  },
  m4: {
    length: .8, crack: { gain: 1, hp: 2400, width: .00025, tau: .0006 }, blast: { from: 190, to: 70, glide: .03, tau: .03, gain: 0.34 },
    body: { lp: 1600, tau: .026, gain: 0.72 }, bark: { freq: 1350, q: 1, tau: .02, gain: 1.05 }, drive: 2.4,
    mech: [
      { t: .018, modes: [[3100, .007, .3], [4700, .005, .15]], tick: 4200, gain: .45 },
      // The buffer spring's "sproing" is the rifle's fingerprint.
      { t: .03, modes: [[1420, .07, .07], [2890, .05, .05], [4350, .035, .03]], tick: 2900, gain: .5 },
    ],
    tail: { tau: .2, lp: 3000, gain: .24 }, echoes: [[.08, .22, 2400], [.2, .13, 1500]],
  },
  dmr: {
    length: 1, crack: { gain: 1.1, hp: 2000, width: .0003, tau: .0008 }, blast: { from: 170, to: 58, glide: .04, tau: .045, gain: 0.28 },
    body: { lp: 1872, tau: .035, gain: 0.8 }, bark: { freq: 1150, q: .9, tau: .026, gain: 1.26 }, drive: 2.6,
    mech: [{ t: .03, modes: [[2500, .012, .35], [3800, .008, .2], [1600, .018, .15]], tick: 3500, gain: .55 }],
    tail: { tau: .28, lp: 2600, gain: .3 }, echoes: [[.1, .26, 2000], [.26, .16, 1300]],
  },
  sniper: {
    length: 1.6, crack: { gain: 1.25, hp: 1800, width: .0004, tau: .001 }, blast: { from: 150, to: 42, glide: .06, tau: .08, gain: 0.35 },
    body: { lp: 1560, tau: .06, gain: 0.88 }, bark: { freq: 900, q: .8, tau: .04, gain: 1.08 }, drive: 3,
    mech: [], tail: { tau: .45, lp: 2200, gain: .38 }, echoes: [[.12, .32, 1800], [.34, .2, 1100], [.62, .1, 700]],
  },
  shotgun: {
    length: 1.2, crack: { gain: .8, hp: 1500, width: .0006, tau: .0018 }, blast: { from: 140, to: 48, glide: .05, tau: .065, gain: 0.34 },
    body: { lp: 2704, tau: .05, gain: 1.0 }, bark: { freq: 750, q: .7, tau: .04, gain: 1.52 }, drive: 3.2,
    mech: [], tail: { tau: .33, lp: 2400, gain: .34 }, echoes: [[.1, .28, 1900], [.27, .17, 1200]],
  },
};

const FAR: Record<GunId, FarSpec> = {
  pistol: { length: 1.6, pop: { lp: 2100, tau: .012, gain: .8 }, boom: { from: 110, to: 60, tau: .05, gain: 0.23 }, snap: 0, roll: { count: 6, span: .9, lp: 1120, tau: .18, gain: .5 } },
  revolver: { length: 2, pop: { lp: 1650, tau: .018, gain: .85 }, boom: { from: 90, to: 48, tau: .08, gain: 0.32 }, snap: 0, roll: { count: 7, span: 1.2, lp: 960, tau: .22, gain: .55 } },
  smg: { length: 1.3, pop: { lp: 2400, tau: .01, gain: .75 }, boom: { from: 120, to: 70, tau: .035, gain: 0.18 }, snap: 0, roll: { count: 5, span: .7, lp: 1280, tau: .14, gain: .45 } },
  m4: { length: 2, pop: { lp: 1950, tau: .014, gain: .8 }, boom: { from: 100, to: 52, tau: .06, gain: 0.25 }, snap: .3, roll: { count: 7, span: 1.2, lp: 1040, tau: .2, gain: .55 } },
  dmr: { length: 2.2, pop: { lp: 1650, tau: .018, gain: .85 }, boom: { from: 90, to: 46, tau: .07, gain: 0.29 }, snap: .35, roll: { count: 8, span: 1.4, lp: 960, tau: .24, gain: .6 } },
  sniper: { length: 2.8, pop: { lp: 1350, tau: .025, gain: .9 }, boom: { from: 75, to: 38, tau: .11, gain: 0.36 }, snap: .45, roll: { count: 10, span: 2, lp: 800, tau: .32, gain: .65 } },
  shotgun: { length: 2.2, pop: { lp: 1350, tau: .03, gain: .9 }, boom: { from: 80, to: 40, tau: .1, gain: 0.36 }, snap: 0, roll: { count: 8, span: 1.4, lp: 880, tau: .26, gain: .6 } },
};

const jitter = (rng: Rng, value: number, amount: number) => value * (1 + rng.signed() * amount);

/** Supersonic crack or muzzle front: an N-wave plus a very short noise burst, high-passed. */
export function crack(x: Float32Array, rate: number, rng: Rng, start: number, gain: number, hp: number, width: number, tau: number) {
  const layer = buffer(rate, .03), w = Math.max(3, Math.round(width * rate));
  for (let i = 0; i < w; i++) layer[i] = 1 - 2 * i / (w - 1);
  for (let i = 0; i < layer.length; i++) layer[i] += rng.signed() * Math.exp(-i / rate / tau) * .8;
  svf(layer, rate, 'hp', hp, .6); svf(layer, rate, 'hp', hp * .7, .6);
  mix(x, layer, Math.round(start * rate), gain);
}

/** A metallic mechanism click: a tiny band-passed noise tick exciting a few damped modes. */
export function click(x: Float32Array, rate: number, rng: Rng, t: number, list: Mode, tick: number, gain: number) {
  band(x, rate, rng, { start: t, dur: .012, mode: 'bp', freq: tick, q: 1.4, attack: .0002, tau: .0015, gain: gain * .8 });
  modes(x, rate, t, list.map(([f, tau, g]) => [jitter(rng, f, .03), tau, g * gain] as const));
}

export function gunNear(id: GunId, rate: number, rng: Rng): Float32Array {
  const s = NEAR[id], x = buffer(rate, s.length);
  tone(x, rate, { start: 0, dur: s.blast.tau * 8, from: jitter(rng, s.blast.from, .05), to: s.blast.to, glide: s.blast.glide, attack: .0008, tau: jitter(rng, s.blast.tau, .1), gain: s.blast.gain });
  band(x, rate, rng, { start: 0, dur: s.body.tau * 8, mode: 'lp', freq: s.body.lp, q: .6, attack: .0005, tau: jitter(rng, s.body.tau, .1), gain: s.body.gain });
  band(x, rate, rng, { start: .0005, dur: s.bark.tau * 8, mode: 'bp', freq: jitter(rng, s.bark.freq, .05), q: s.bark.q, attack: .0006, tau: jitter(rng, s.bark.tau, .1), gain: s.bark.gain });
  saturate(x, s.drive);
  // The transient goes on after the saturation so it stays needle-sharp.
  crack(x, rate, rng, 0, jitter(rng, s.crack.gain, .08) * .6, s.crack.hp, s.crack.width, s.crack.tau);
  for (const m of s.mech) click(x, rate, rng, m.t + rng.signed() * .002, m.modes, m.tick, m.gain);
  echoes(x, rate, s.echoes.map(([d, g, lp]) => [jitter(rng, d, .08), g, lp] as const));
  // The diffuse outdoor tail darkens as it decays, like air and foliage do.
  band(x, rate, rng, { start: .004, dur: s.length, mode: 'lp', freq: t => 300 + s.tail.lp * Math.exp(-t / (s.tail.tau * 2.5)), q: .5, attack: .012, tau: jitter(rng, s.tail.tau, .1), gain: s.tail.gain });
  return fadeOut(x, rate, .08);
}

export function gunFar(id: GunId, rate: number, rng: Rng): Float32Array {
  const s = FAR[id], x = buffer(rate, s.length);
  if (s.snap) crack(x, rate, rng, 0, s.snap, 1800, .0004, .001);
  band(x, rate, rng, { start: .002, dur: s.pop.tau * 10, mode: 'lp', freq: jitter(rng, s.pop.lp, .06), q: .8, attack: .0015, tau: s.pop.tau, gain: s.pop.gain });
  tone(x, rate, { start: .002, dur: s.boom.tau * 8, from: s.boom.from, to: s.boom.to, glide: s.boom.tau * 1.5, attack: .003, tau: s.boom.tau, gain: s.boom.gain });
  saturate(x, 1.6);
  // Rolling echoes off hills and walls: several dark bursts, sparser and darker with time.
  for (let k = 0; k < s.roll.count; k++) {
    const u = k / s.roll.count, delay = .04 + s.roll.span * u ** 1.3 + rng.range(0, .06);
    band(x, rate, rng, {
      start: delay, dur: s.roll.tau * 6, mode: 'lp', freq: s.roll.lp * (1 - .4 * u) * rng.range(.85, 1.1), q: .6,
      attack: rng.range(.015, .05), tau: s.roll.tau * rng.range(.8, 1.2), gain: s.roll.gain * Math.exp(-delay / (s.roll.span * .45)) * rng.range(.6, 1),
    });
  }
  return fadeOut(x, rate, .15);
}

/** Hollow launcher "thoonk": a tube pop and air rush, no crack. */
export function cocoLaunch(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .7);
  tone(x, rate, { start: 0, dur: .3, from: jitter(rng, 260, .05), to: 120, glide: .04, attack: .001, tau: .05, gain: 1 });
  modes(x, rate, 0, [[jitter(rng, 185, .04), .06, .5], [370, .04, .2]], .002);
  band(x, rate, rng, { start: 0, dur: .2, mode: 'lp', freq: 600, attack: .001, tau: .03, gain: .6 });
  saturate(x, 1.6);
  band(x, rate, rng, { start: .01, dur: .4, mode: 'bp', freq: t => 900 + 1500 * Math.min(1, t / .2), q: 1.2, attack: .02, tau: .08, gain: .35 });
  tone(x, rate, { start: .04, dur: .3, from: 1200, to: 1500, attack: .01, tau: .08, gain: .05 });
  band(x, rate, rng, { start: .004, dur: .6, mode: 'lp', freq: 1800, q: .5, attack: .01, tau: .12, gain: .1 });
  return fadeOut(x, rate, .05);
}

/** Facão swing: a doppler whoosh with a faint blade shimmer. */
export function macheteSwing(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .38), peak = rng.range(.09, .13);
  band(x, rate, rng, { start: 0, dur: .36, mode: 'bp', freq: t => 700 + 2100 * Math.max(0, Math.sin(Math.PI * Math.min(1, t / (peak * 2)))), q: 1.4, attack: peak * .8, tau: .06, gain: 1 });
  band(x, rate, rng, { start: 0, dur: .3, mode: 'lp', freq: 420, attack: peak, tau: .07, gain: .35 });
  modes(x, rate, .015, [[jitter(rng, 3100, .03), .05, .05], [4650, .04, .03]], .01);
  return fadeOut(x, rate, .04);
}

/** Coconut blast: deep thump, crunchy shell crack, dusty tail and falling bits. */
export function cocoBlast(rate: number, rng: Rng, far: boolean): Float32Array {
  const x = buffer(rate, far ? 2.6 : 1.6);
  tone(x, rate, { start: 0, dur: .9, from: far ? 80 : 110, to: 35, glide: .12, attack: .002, tau: far ? .25 : .2, gain: 1 });
  band(x, rate, rng, { start: 0, dur: .6, mode: 'lp', freq: far ? 500 : 900, attack: .001, tau: .07, gain: 1, brown: true });
  if (!far) {
    band(x, rate, rng, { start: 0, dur: .12, mode: 'bp', freq: 2200, q: .8, attack: .0005, tau: .02, gain: .5 });
    const grit = buffer(rate, .2);
    for (let i = 0; i < 180; i++) { const a = Math.floor(rng.next() * grit.length * .5); grit[a] += rng.signed() * Math.exp(-a / rate / .05); }
    svf(grit, rate, 'bp', 2400, .9); mix(x, grit, 0, .8);
  }
  saturate(x, 2.4);
  band(x, rate, rng, { start: .05, dur: far ? 2.4 : 1.4, mode: 'lp', freq: far ? 280 : 400, attack: .05, tau: far ? .5 : .35, gain: .45, brown: true });
  if (far) echoes(x, rate, [[.18, .35, 500], [.5, .22, 380], [.95, .12, 300]]);
  else for (let i = 0; i < 7; i++) {
    const t = rng.range(.18, .9);
    band(x, rate, rng, { start: t, dur: .03, mode: 'bp', freq: rng.range(900, 2200), q: 2, attack: .0005, tau: .006, gain: rng.range(.04, .1) * Math.exp(-t / .6) });
  }
  return fadeOut(x, rate, .15);
}
