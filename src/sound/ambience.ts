// Island ambience. Nothing here is a constant hiss: beds are band-limited and
// breathe (wave cycles, wind gusts, leaf flurries that fall to near silence),
// and the life of the island arrives as positioned one-shots from trees,
// water and buildings.
import { band, buffer, fadeIn, fadeOut, grains, makeLoop, mix, modes, Rng, smoothCurve, svf, tone } from './dsp';
import { sambaLoop } from './music';
import { bell } from './feedback';

const CROSSFADE = 1.5;

/** White noise through a moving filter with a moving gain, both functions of time. */
function moving(x: Float32Array, rate: number, rng: Rng, mode: 'lp' | 'bp' | 'hp', freq: (t: number) => number, q: number, gain: (t: number) => number, brown = false) {
  const layer = new Float32Array(x.length);
  let b = 0;
  for (let i = 0; i < layer.length; i++) {
    let n = rng.signed();
    if (brown) { b = b * .985 + n * .15; n = b * 2.2; }
    layer[i] = n;
  }
  svf(layer, rate, mode, freq, q);
  for (let i = 0; i < layer.length; i++) x[i] += layer[i] * gain(i / rate);
}

function waves(rate: number, seconds: number, schedule: number[], rng: Rng): Float32Array {
  const x = buffer(rate, seconds + CROSSFADE);
  // A low murmur of distant water under everything, band-limited below 300 Hz.
  moving(x, rate, rng, 'lp', () => 220, .7, () => .015, true);
  for (const start of schedule) {
    const build = rng.range(1.4, 2.2), size = rng.range(.7, 1);
    band(x, rate, rng, { start, dur: build + 1.5, mode: 'lp', freq: t => 250 + 900 * Math.min(1, t / build), q: .6, attack: build, tau: .5, gain: .45 * size });
    band(x, rate, rng, { start: start + build, dur: 2, mode: 'lp', freq: t => 800 + 2600 * Math.exp(-t / .35), q: .6, attack: .06, tau: .38, gain: 1 * size });
    band(x, rate, rng, { start: start + build + .2, dur: 4, mode: 'bp', freq: t => 600 + 1200 * Math.exp(-t / 1.2), q: .7, attack: .3, tau: .75, gain: .5 * size });
    // Fizz of bubbles as the wash recedes: sparse, high, decaying.
    const fizz = buffer(rate, 4);
    grains(fizz, rate, rng, 0, 3.5, 500, .5, .0003, u => Math.exp(-u * 2.2));
    svf(fizz, rate, 'hp', 2800);
    mix(x, fizz, Math.round((start + build + .3) * rate), .35 * size);
  }
  return x;
}

export type BedId = 'surf' | 'wind' | 'leaves' | 'waterfall' | 'harbour' | 'storm' | 'cabin' | 'engine' | 'freefall' | 'canopy';
export const BED_IDS: readonly BedId[] = ['surf', 'wind', 'leaves', 'waterfall', 'harbour', 'storm', 'cabin', 'engine', 'freefall', 'canopy'];
export const STEREO_BEDS: ReadonlySet<BedId> = new Set(['surf', 'wind', 'leaves', 'storm']);

export function bed(id: BedId, rate: number, rng: Rng, channel: number, seconds: number): Float32Array {
  const total = seconds + CROSSFADE;
  let x: Float32Array = buffer(rate, total);
  switch (id) {
    case 'surf': {
      // Both channels share the wave timing; the noise differs so the bed is wide.
      const timing = new Rng(1234), schedule: number[] = [];
      for (let t = timing.range(0, 1.5); t < total - 2; t += timing.range(5.5, 8.5)) schedule.push(t);
      x = waves(rate, seconds, schedule.map(t => t + channel * .04), rng);
      break;
    }
    case 'wind': {
      const gust = smoothCurve(new Rng(77), total, .35), gain = (t: number) => .12 + .88 * gust(t) ** 2;
      moving(x, rate, rng, 'bp', t => 280 + 420 * gust(t), .7, gain);
      moving(x, rate, rng, 'bp', t => 850 + 600 * gust(t), 7, t => .18 * gust(t) ** 3);
      break;
    }
    case 'leaves': {
      // Leaf flurries ride their own gusts and fall away to near silence between them.
      const gust = smoothCurve(new Rng(99), total, .5), level = (t: number) => Math.max(0, gust(t) * 1.5 - .5) ** 2;
      const flutter = buffer(rate, total);
      grains(flutter, rate, rng, 0, total, 2600, .5, .0005);
      for (let i = 0; i < flutter.length; i++) flutter[i] *= level(i / rate);
      svf(flutter, rate, 'bp', 3800, .6);
      mix(x, flutter, 0, 1);
      moving(x, rate, rng, 'bp', () => 2600, .8, t => .25 * level(t));
      break;
    }
    case 'waterfall': {
      const swell = smoothCurve(new Rng(5 + channel), total, .4);
      moving(x, rate, rng, 'lp', () => 1800, .6, t => .35 + .45 * swell(t) ** 2);
      moving(x, rate, rng, 'bp', () => 480, .8, t => .4 + .4 * swell(t), true);
      const splash = buffer(rate, total);
      grains(splash, rate, rng, 0, total, 1200, .3, .0006);
      svf(splash, rate, 'bp', 1400, .7); mix(x, splash, 0, .6);
      break;
    }
    case 'harbour':
      // Water lapping at hulls and quay stones: irregular slaps, no bed.
      for (let t = rng.range(0, .5); t < total - .5; t += rng.range(.55, 1.5)) {
        band(x, rate, rng, { start: t, dur: .6, mode: 'lp', freq: rng.range(550, 900), q: .9, attack: rng.range(.02, .06), tau: rng.range(.08, .16), gain: rng.range(.4, 1) });
        if (rng.next() < .3) modes(x, rate, t + .03, [[rng.range(85, 110), .08, .25], [rng.range(190, 230), .05, .12]], .004);
        if (rng.next() < .4) { const f = rng.range(500, 1200); tone(x, rate, { start: t + rng.range(.05, .2), dur: .05, from: f, to: f * 1.6, attack: .003, tau: .012, gain: .08 }); }
      }
      break;
    case 'storm': {
      const swell = smoothCurve(new Rng(31), total, .3), howl = smoothCurve(new Rng(32 + channel), total, .6);
      moving(x, rate, rng, 'lp', () => 190, .7, t => .6 + .4 * swell(t), true);
      moving(x, rate, rng, 'bp', t => 500 + 700 * howl(t), 2.5, t => .25 * howl(t) ** 2);
      break;
    }
    case 'cabin': case 'engine': {
      // Turboprop drone: blade-pass harmonics beating slowly, plus airflow.
      const f = id === 'cabin' ? 82 : 96, cycles = (hz: number) => Math.round(hz * seconds) / seconds;
      for (const [mult, gain] of [[1, .5], [2, .35], [3, .2], [5, .1]] as const) {
        tone(x, rate, { start: 0, dur: total, from: cycles(f * mult), attack: .01, tau: 1e6, gain, shape: 'saw' });
        tone(x, rate, { start: 0, dur: total, from: cycles(f * mult + .5), attack: .01, tau: 1e6, gain: gain * .6, shape: 'saw' });
      }
      svf(x, rate, 'lp', id === 'cabin' ? 500 : 1400, .7);
      moving(x, rate, rng, 'lp', () => id === 'cabin' ? 700 : 1600, .6, () => id === 'cabin' ? .25 : .35);
      break;
    }
    case 'freefall': {
      const flutter = smoothCurve(new Rng(8), total, 9);
      moving(x, rate, rng, 'bp', () => 750, .5, t => .7 + .3 * flutter(t));
      moving(x, rate, rng, 'lp', () => 2200, .6, () => .3);
      break;
    }
    case 'canopy': {
      const flap = smoothCurve(new Rng(9), total, 10);
      moving(x, rate, rng, 'bp', () => 380, .8, t => .15 + .85 * flap(t) ** 3);
      moving(x, rate, rng, 'lp', () => 900, .6, () => .12);
      break;
    }
  }
  return makeLoop(x, rate, CROSSFADE);
}

// ---- Island life one-shots.
export type CritterId = 'bemtevi' | 'sabia' | 'maritaca' | 'gull' | 'dove' | 'cicada' | 'cricket' | 'frog' | 'dog' | 'rooster' | 'hen'
  | 'church-bell' | 'buoy-bell' | 'creak' | 'bike-bell' | 'chimes' | 'mill' | 'sizzle' | 'cups' | 'splash-fish' | 'pardal' | 'radio';
export const CRITTER_IDS: readonly CritterId[] = ['bemtevi', 'sabia', 'maritaca', 'gull', 'dove', 'cicada', 'cricket', 'frog', 'dog', 'rooster', 'hen',
  'church-bell', 'buoy-bell', 'creak', 'bike-bell', 'chimes', 'mill', 'sizzle', 'cups', 'splash-fish', 'pardal', 'radio'];

const LENGTH: Record<CritterId, number> = {
  bemtevi: 1, sabia: 2.2, maritaca: 2.2, gull: 1.6, dove: 1.8, cicada: 8, cricket: 3.2, frog: 1.4, dog: 1.4, rooster: 2.2, hen: 1.2,
  'church-bell': 5, 'buoy-bell': 3, creak: 1.2, 'bike-bell': 1, chimes: 3, mill: 2.2, sizzle: 2, cups: .8, 'splash-fish': .8, pardal: 1.6, radio: 5,
};

/** A syllable of birdsong: a pitch glide with a little roughness and a quiet octave. */
function chirp(x: Float32Array, rate: number, t: number, from: number, to: number, dur: number, gain: number, rough = 0) {
  tone(x, rate, { start: t, dur, from, to, glide: dur, attack: Math.min(.01, dur * .2), tau: dur * .5, gain, vibrato: rough ? [70, rough] : undefined });
  tone(x, rate, { start: t, dur, from: from * 2, to: to * 2, glide: dur, attack: Math.min(.01, dur * .2), tau: dur * .35, gain: gain * .15 });
}

function creakBurst(x: Float32Array, rate: number, rng: Rng, t: number, dur: number, f0: number, gain: number) {
  const layer = buffer(rate, dur);
  for (let i = 0; i < layer.length;) {
    const u = i / layer.length;
    layer[i] = Math.sin(Math.PI * u) * (rng.next() < .5 ? 1 : -1);
    i += Math.max(1, Math.round(rate / (f0 * (1 + .4 * Math.sin(Math.PI * u)) * rng.range(.9, 1.1))));
  }
  svf(layer, rate, 'bp', 600, 4);
  mix(x, layer, Math.round(t * rate), gain);
}

/**
 * The Tucano cargo balloon's propane burner: a valve click, then a breathy low
 * roar with a flickering flame hiss above it, cut off with a short tail. It is
 * the balloon's signature from the ground, fired every few seconds as it drifts over.
 */
export function balloonBurner(rate: number, rng: Rng): Float32Array {
  const burn = rng.range(1.1, 1.6), total = burn + .45, x = buffer(rate, total);
  const flicker = smoothCurve(rng, total, 16);
  const shape = (t: number) => t < .09 ? t / .09 : t < burn ? 1 : Math.exp(-(t - burn) / .11);
  moving(x, rate, rng, 'lp', () => 180, .8, t => .18 * shape(t) * (.72 + .28 * flicker(t)), true);
  moving(x, rate, rng, 'lp', t => 650 + 250 * flicker(t), .7, t => .8 * shape(t) * (.7 + .3 * flicker(t)));
  moving(x, rate, rng, 'bp', t => 1500 + 700 * flicker(t), .8, t => .35 * shape(t) * (.55 + .45 * flicker(t)));
  modes(x, rate, 0, [[1900, .012, .18], [3300, .006, .09]]);
  // Keep the roar out of the sub-bass rumble that belongs to explosions.
  svf(x, rate, 'hp', 55);
  return fadeOut(x, rate, .05);
}

export function critter(id: CritterId, rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, LENGTH[id]), j = (f: number) => f * rng.range(.95, 1.05);
  switch (id) {
    case 'bemtevi': {
      // "bem-te-viii": Brazil's loudest garden bird.
      const b = j(2300);
      chirp(x, rate, 0, b * 1.05, b * .9, .09, .6, .02);
      chirp(x, rate, .15, b * 1.2, b * 1.1, .08, .6, .02);
      chirp(x, rate, .3, b * 1.4, b * .95, .38, .7, .03);
      break;
    }
    case 'sabia': {
      const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2], base = j(1600);
      let t = 0;
      for (let i = 0, n = rng.int(5, 8); i < n; i++) {
        const f = base * scale[rng.int(0, scale.length - 1)], d = rng.range(.09, .24);
        chirp(x, rate, t, f, f * rng.range(.92, 1.1), d, .5);
        t += d + rng.range(.03, .09);
      }
      break;
    }
    case 'maritaca':
      for (let i = 0, n = rng.int(5, 9); i < n; i++) {
        const t = rng.range(0, 1.6), f = rng.range(1100, 1900), d = rng.range(.08, .16);
        const s = buffer(rate, d + .02);
        tone(s, rate, { start: 0, dur: d, from: f, to: f * rng.range(.8, 1.1), attack: .006, tau: d * .5, gain: .5, shape: 'saw', vibrato: [90, .04] });
        svf(s, rate, 'bp', f * 1.8, 2);
        mix(x, s, Math.round(t * rate), rng.range(.5, 1));
      }
      break;
    case 'gull': {
      const s = buffer(rate, LENGTH.gull);
      tone(s, rate, { start: 0, dur: .38, from: j(1500), to: 900, attack: .02, tau: .18, gain: .6, shape: 'saw' });
      for (let i = 0; i < 3; i++) tone(s, rate, { start: .5 + i * .17, dur: .12, from: j(1250), to: 1000, attack: .01, tau: .05, gain: .4, shape: 'saw' });
      svf(s, rate, 'bp', 2400, 1.2); svf(s, rate, 'lp', 4000);
      mix(x, s, 0, 1);
      break;
    }
    case 'dove': [0, .45, .75].forEach((t, i) => chirp(x, rate, t, j(560) * (i === 1 ? 1.1 : 1), j(520), i === 2 ? .45 : .25, .5)); break;
    case 'cicada': {
      // Swell, sustain, fade: a pulsing narrowband buzz that stops on its own.
      const f = j(5200), dur = LENGTH.cicada - .5;
      const s = buffer(rate, dur);
      for (let i = 0; i < s.length; i++) {
        const t = i / rate, swell = Math.min(1, t / 1.6) * Math.min(1, (dur - t) / 2.2);
        const pulse = .5 + .5 * Math.sin(2 * Math.PI * 46 * t);
        s[i] = (Math.sin(2 * Math.PI * f * (1 - .04 * Math.max(0, t - dur + 2.2) / 2.2) * t) + rng.signed() * .5) * pulse * pulse * swell;
      }
      svf(s, rate, 'bp', f, 4);
      mix(x, s, 0, 1);
      break;
    }
    case 'cricket':
      for (let t = 0; t < 2.9; t += rng.range(.42, .55)) for (let p = 0; p < 3; p++) tone(x, rate, { start: t + p * .04, dur: .025, from: j(4400), attack: .003, tau: .008, gain: .4 });
      break;
    case 'frog':
      for (let r = 0; r < rng.int(2, 3); r++) {
        const s = buffer(rate, .25);
        for (let p = 0; p < 9; p++) tone(s, rate, { start: p * .022, dur: .03, from: j(300), attack: .002, tau: .008, gain: .6, shape: 'saw' });
        svf(s, rate, 'bp', 700, 1.5);
        mix(x, s, Math.round(r * .38 * rate), 1);
      }
      break;
    case 'dog':
      for (let r = 0; r < rng.int(2, 3); r++) {
        const s = buffer(rate, .2);
        tone(s, rate, { start: 0, dur: .16, from: j(520), to: 380, attack: .008, tau: .05, gain: .6, shape: 'saw' });
        band(s, rate, rng, { start: 0, dur: .12, mode: 'bp', freq: 900, attack: .005, tau: .03, gain: .2 });
        svf(s, rate, 'bp', 1000, 1.1);
        mix(x, s, Math.round((r * .32 + rng.range(0, .05)) * rate), 1);
      }
      svf(x, rate, 'lp', 1600); // always heard from a yard away
      break;
    case 'rooster': {
      const s = buffer(rate, LENGTH.rooster), f = j(620);
      [[0, .12, f, f * 1.2], [.18, .12, f * 1.2, f * 1.35], [.36, .14, f * 1.4, f * 1.5], [.58, .9, f * 1.6, f * 1.05]].forEach(([t, d, a, b]) =>
        tone(s, rate, { start: t, dur: d, from: a, to: b, attack: .02, tau: d * .7, gain: .5, shape: 'saw', vibrato: [30, .02] }));
      svf(s, rate, 'bp', 1600, 1); svf(s, rate, 'lp', 3500);
      mix(x, s, 0, 1);
      break;
    }
    case 'hen':
      for (let i = 0, n = rng.int(3, 5); i < n; i++) {
        const s = buffer(rate, .12);
        tone(s, rate, { start: 0, dur: .08, from: j(700), to: 500, attack: .005, tau: .025, gain: .6, shape: 'saw' });
        svf(s, rate, 'bp', 1200, 1.5);
        mix(x, s, Math.round((i * .18 + rng.range(0, .05)) * rate), 1);
      }
      break;
    case 'church-bell': for (let i = 0; i < 3; i++) bell(x, rate, i * 1.3, 196, .5, 2.2); svf(x, rate, 'lp', 2500); break;
    case 'buoy-bell': bell(x, rate, 0, j(880), .5, .9); bell(x, rate, rng.range(.7, 1.3), j(880), .35, .9); break;
    case 'creak': creakBurst(x, rate, rng, 0, rng.range(.5, 1), j(95), .7); break;
    case 'bike-bell': bell(x, rate, 0, j(3100), .5, .25); bell(x, rate, .12, 3100, .45, .3); break;
    case 'chimes': { const p = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]; for (let i = 0; i < rng.int(4, 7); i++) bell(x, rate, rng.range(0, 1.8), 1760 * p[rng.int(0, 4)], .25, .6); break; }
    case 'mill': creakBurst(x, rate, rng, 0, 1.8, j(55), .8); modes(x, rate, 1.2, [[140, .12, .3]]); break;
    case 'sizzle': grains(x, rate, rng, 0, 1.9, 700, .4, .0003, u => Math.sin(Math.PI * u)); svf(x, rate, 'hp', 3000); break;
    case 'cups': bell(x, rate, 0, j(3300), .4, .12); bell(x, rate, rng.range(.12, .3), j(2900), .3, .12); break;
    case 'pardal':
      // House sparrows chattering on a wire: quick bright cheeps.
      for (let t = rng.range(0, .1); t < 1.4; t += rng.range(.08, .22)) { const f = rng.range(3200, 4600); chirp(x, rate, t, f, f * rng.range(.75, .95), rng.range(.03, .06), .45); }
      break;
    case 'radio': {
      // A neighbour's radio through a window: a samba phrase, band-limited and a little crunchy.
      const s = sambaLoop(rate, rng, 0);
      for (let i = 0; i < s.length; i++) s[i] = Math.tanh(s[i] * 2.5) * .5;
      svf(svf(s, rate, 'hp', 400, .8), rate, 'lp', 2800, .8);
      mix(x, s.subarray(0, Math.min(s.length, x.length)), 0, 1);
      fadeIn(x, rate, .8);
      break;
    }
    case 'splash-fish': band(x, rate, rng, { start: 0, dur: .4, mode: 'bp', freq: 1200, q: .7, attack: .004, tau: .06, gain: .7 }); for (let i = 0; i < 5; i++) { const f = rng.range(600, 1600); tone(x, rate, { start: rng.range(.03, .3), dur: .04, from: f, to: f * 1.5, attack: .002, tau: .01, gain: .08 }); } break;
  }
  return fadeOut(x, rate, .05);
}
