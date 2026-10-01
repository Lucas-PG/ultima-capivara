// Music, all rendered from code: a bossa nova menu loop (nylon guitar,
// upright bass, vibraphone, shaker and rim), a light batucada for the drop and
// the dance emote, a sparse tension pulse for the final circle, and stingers.
import { band, buffer, fadeOut, grains, mix, modes, pluck, Rng, svf, tone } from './dsp';

const A4 = 440, hz = (semitones: number) => A4 * 2 ** (semitones / 12);

function guitar(x: Float32Array, rate: number, rng: Rng, t: number, notes: readonly number[], gain: number, spread = .012, decay = 1.4) {
  notes.forEach((n, i) => pluck(x, rate, rng, t + i * spread, hz(n), decay, gain * (i === 0 ? 1 : .85), .45));
}
function bass(x: Float32Array, rate: number, t: number, n: number, gain: number, dur = .55) {
  tone(x, rate, { start: t, dur, from: hz(n), attack: .006, tau: dur * .5, gain });
  tone(x, rate, { start: t, dur: dur * .6, from: hz(n) * 2, attack: .004, tau: dur * .25, gain: gain * .25 });
}
function vibe(x: Float32Array, rate: number, t: number, n: number, gain: number, dur: number) {
  const f = hz(n);
  modes(x, rate, t, [[f, Math.min(1.4, dur * 1.3), gain], [f * 4, .15, gain * .12], [f * 10, .03, gain * .03]], .004);
}
function shaker(x: Float32Array, rate: number, rng: Rng, t: number, gain: number) {
  band(x, rate, rng, { start: t, dur: .06, mode: 'hp', freq: 5500, attack: .006, tau: .012, gain });
}
function rim(x: Float32Array, rate: number, rng: Rng, t: number, gain: number) {
  modes(x, rate, t, [[1750, .018, gain], [3900, .006, gain * .3]], .0004);
  band(x, rate, rng, { start: t, dur: .01, mode: 'bp', freq: 3000, attack: .0002, tau: .001, gain: gain * .4 });
}
function surdo(x: Float32Array, rate: number, rng: Rng, t: number, gain: number, open = true) {
  tone(x, rate, { start: t, dur: open ? .6 : .2, from: 78, to: 58, glide: .08, attack: .003, tau: open ? .22 : .06, gain });
  band(x, rate, rng, { start: t, dur: .06, mode: 'lp', freq: 400, attack: .001, tau: .01, gain: gain * .5 });
}
function caixa(x: Float32Array, rate: number, rng: Rng, t: number, gain: number) {
  band(x, rate, rng, { start: t, dur: .1, mode: 'bp', freq: 2600, q: .8, attack: .0005, tau: .03, gain });
  tone(x, rate, { start: t, dur: .05, from: 220, to: 180, attack: .001, tau: .012, gain: gain * .4 });
}
function tamborim(x: Float32Array, rate: number, rng: Rng, t: number, gain: number) {
  modes(x, rate, t, [[760, .04, gain], [1900, .015, gain * .3]], .0004);
  band(x, rate, rng, { start: t, dur: .02, mode: 'hp', freq: 3000, attack: .0003, tau: .003, gain: gain * .4 });
}
function agogo(x: Float32Array, rate: number, t: number, high: boolean, gain: number) {
  const f = high ? 1318.5 : 987.8;
  modes(x, rate, t, [[f, .18, gain], [f * 2.6, .07, gain * .3], [f * 4.2, .03, gain * .12]], .0006);
}

// Dmaj9 | Em9 | F#m7 | B7b9 | Em9 | A13 | Dmaj9 | A7sus4, as guitar voicings and bass roots.
const CHORDS = [[-15, -12, -8, -5], [-14, -10, -7, -3], [-17, -12, -8, -3], [-12, -9, -6, -3], [-14, -10, -7, -3], [-14, -8, -3, 2], [-15, -12, -8, -5], [-14, -7, -5, 0]];
const ROOTS = [-31, -29, -27, -34, -29, -36, -31, -36];
// [beat, semitones from A4, beats]
const MELODY: readonly (readonly [number, number, number])[][] = [
  [[0, 12, 1.5], [1.5, 9, .5], [2, 7, 2]], [[0, 10, 1], [1, 9, 1], [2, 5, 2]], [[.5, 7, 1], [1.5, 9, .5], [2, 12, 2]], [[0, 12, 1], [1, 10, 1], [2, 9, 2]],
  [[0, 9, 1.5], [1.5, 7, .5], [2, 5, 2]], [[0, 4, 1], [1, 7, 1], [2, 9, 2]], [[0, 7, 1.5], [1.5, 4, .5], [2, 0, 2]], [[2.5, 5, .5], [3, 7, 1]],
];

export const MENU_BPM = 132;

/** Eight bars of bossa nova. `channel` 0 leans guitar, 1 leans vibraphone and shaker. */
export function menuLoop(rate: number, rng: Rng, channel: number): Float32Array {
  const beat = 60 / MENU_BPM, bar = beat * 4, bars = 8, x = buffer(rate, bar * bars + 2.5);
  const g = channel === 0 ? 1 : .7, v = channel === 0 ? .7 : 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    // Bossa clave comping across two bars: eighths 0, 3, 6 then 10, 13 (the second bar).
    const hits = b % 2 === 0 ? [0, 3, 6] : [2, 5];
    for (const e of hits) guitar(x, rate, rng, t0 + e * beat / 2, CHORDS[b], .22 * g, .008, 1.1);
    bass(x, rate, t0, ROOTS[b], .22);
    bass(x, rate, t0 + 2 * beat, ROOTS[b] + 7, .18);
    for (let s = 0; s < 8; s++) shaker(x, rate, rng, t0 + s * beat / 2, (s % 2 ? .05 : .09) * (channel === 1 ? 1.2 : .8));
    rim(x, rate, rng, t0 + (b % 2 ? 1.5 : 3) * beat, .12);
    for (const [at, n, d] of MELODY[b]) vibe(x, rate, t0 + at * beat, n, .2 * v, d * beat);
  }
  // Fold the ringing tail back into the start so the loop is seamless.
  const loopLength = Math.round(bar * bars * rate), out = x.slice(0, loopLength);
  for (let i = loopLength; i < x.length; i++) out[i - loopLength] += x[i];
  return out;
}

export const SAMBA_BPM = 100;

/** Light batucada: surdo on two, caixa sixteenths, tamborim and agogô. Four bars. */
export function sambaLoop(rate: number, rng: Rng, channel: number): Float32Array {
  const beat = 60 / SAMBA_BPM, bar = beat * 2, bars = 4, x = buffer(rate, bar * bars + 1);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    surdo(x, rate, rng, t0, .15, false);
    surdo(x, rate, rng, t0 + beat, .25);
    for (let s = 0; s < 8; s++) caixa(x, rate, rng, t0 + s * beat / 4, (s % 4 === 2 ? .16 : .06) * (channel ? 1.15 : .85));
    const tam = [0, 3, 6] ;
    for (const s of tam) tamborim(x, rate, rng, t0 + s * beat / 4 + (b % 2 ? beat / 4 : 0), .2 * (channel ? .8 : 1.2));
    if (b % 2 === 0) { agogo(x, rate, t0, true, .12); agogo(x, rate, t0 + beat * .75, false, .1); agogo(x, rate, t0 + beat * 1.5, true, .1); }
  }
  const loopLength = Math.round(bar * bars * rate), out = x.slice(0, loopLength);
  for (let i = loopLength; i < x.length; i++) out[i - loopLength] += x[i];
  return out;
}

/** Final circle: a low heartbeat surdo, soft shaker and a drone that swells over four bars. */
export function tensionLoop(rate: number, rng: Rng, channel: number): Float32Array {
  const beat = 60 / SAMBA_BPM, bars = 4, bar = beat * 4, length = bar * bars, x = buffer(rate, length + 1);
  for (let b = 0; b < bars; b++) for (let k = 0; k < 4; k++) {
    const t = b * bar + k * beat;
    surdo(x, rate, rng, t, k % 2 ? .12 : .2, k % 2 === 1);
    shaker(x, rate, rng, t + beat / 2, .05 * (channel ? 1.2 : .8));
    if (k === 3) rim(x, rate, rng, t + beat * .75, .06);
  }
  for (const [n, g] of [[-31, .1], [-24, .07]] as const) {
    const d = buffer(rate, length);
    for (let i = 0; i < d.length; i++) {
      const t = i / rate, p = hz(n) * t;
      d[i] = (2 * (p - Math.floor(p)) - 1) * g * (.6 + .4 * Math.sin(Math.PI * 2 * t / length - Math.PI / 2));
    }
    svf(d, rate, 'lp', 700, .8);
    mix(x, d, 0, .8);
  }
  const loopLength = Math.round(length * rate), out = x.slice(0, loopLength);
  for (let i = loopLength; i < x.length; i++) out[i - loopLength] += x[i];
  return out;
}

export function victory(rate: number, rng: Rng, channel: number): Float32Array {
  const x = buffer(rate, 3.4), beat = .16;
  [5, 9, 12, 17].forEach((n, i) => pluck(x, rate, rng, i * beat, hz(n), .9, .3, .6)); // cavaquinho run D5 F#5 A5 D6
  guitar(x, rate, rng, 4 * beat, [-19, -12, -7, -3, 2, 5], .3, .014, 2.2); // big strum D6/9
  surdo(x, rate, rng, 4 * beat, .5);
  agogo(x, rate, 4 * beat, true, .15); agogo(x, rate, 4.5 * beat, false, .12); agogo(x, rate, 5 * beat, true, .12);
  // Cuíca "whoop": a bright rising friction voice.
  tone(x, rate, { start: 6 * beat, dur: .35, from: 420, to: 950, glide: .25, attack: .03, tau: .15, gain: .15 * (channel ? 1.2 : .8), shape: 'tri' });
  grains(x, rate, rng, 4 * beat, 1.5, 60, .03, .0004, u => 1 - u);
  return fadeOut(x, rate, .5);
}

export function defeat(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, 3.6), beat = .42;
  [0, -4, -5, -7].forEach((n, i) => pluck(x, rate, rng, i * beat, hz(n), 1.6, .3, .35)); // A4 F4 E4 D4
  guitar(x, rate, rng, 4 * beat, [-19, -14, -10, -7], .22, .03, 2.4); // soft D minor, slowly strummed
  svf(x, rate, 'lp', 3000);
  return fadeOut(x, rate, .6);
}
