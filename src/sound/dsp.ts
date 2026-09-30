// Small offline DSP kit for baking the game's sounds into PCM. Everything is
// deterministic (seeded) and runs without Web Audio, so a worker can bake the
// bank and the tests can render and measure exactly what the game plays.

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  signed() { return this.next() * 2 - 1; }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const buffer = (rate: number, seconds: number) => new Float32Array(Math.max(1, Math.round(rate * seconds)));
const TAU = Math.PI * 2;

/** exp-decay envelope with a linear attack: 0 before `start`, peak 1 at start + attack. */
export function env(t: number, start: number, attack: number, tau: number): number {
  const u = t - start;
  if (u < 0) return 0;
  if (u < attack) return u / attack;
  return Math.exp(-(u - attack) / tau);
}

export type FilterMode = 'lp' | 'hp' | 'bp' | 'notch';

/**
 * Topology-preserving state-variable filter. `freq` may be a number or a
 * function of time (seconds) for sweeps; it is re-evaluated every 16 samples.
 * The band-pass output is normalized to unity gain at the centre.
 */
export function svf(x: Float32Array, rate: number, mode: FilterMode, freq: number | ((t: number) => number), q = .707, from = 0, to = x.length): Float32Array {
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const k = 1 / q, dynamic = typeof freq === 'function', m = mode === 'lp' ? 0 : mode === 'bp' ? 1 : mode === 'hp' ? 2 : 3;
  const set = (f: number) => {
    const g = Math.tan(Math.PI * Math.min(Math.max(f, 10), rate * .49) / rate);
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
  };
  set(dynamic ? (freq as (t: number) => number)(from / rate) : freq as number);
  for (let i = from; i < to; i++) {
    if (dynamic && (i & 15) === 0) set((freq as (t: number) => number)(i / rate));
    const v0 = x[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    x[i] = m === 0 ? v2 : m === 1 ? k * v1 : m === 2 ? v0 - k * v1 - v2 : v0 - k * v1;
  }
  return x;
}

export function onePole(x: Float32Array, rate: number, mode: 'lp' | 'hp', freq: number): Float32Array {
  const a = Math.exp(-TAU * freq / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y;
    x[i] = mode === 'lp' ? y : x[i] - y;
  }
  return x;
}

/** White noise shaped by `shape(t)` over [start, start + dur), added into x. */
export function noise(x: Float32Array, rate: number, rng: Rng, start: number, dur: number, shape: (u: number) => number, gain = 1): Float32Array {
  const a = Math.max(0, Math.round(start * rate)), b = Math.min(x.length, Math.round((start + dur) * rate));
  for (let i = a; i < b; i++) x[i] += rng.signed() * shape((i - a) / rate) * gain;
  return x;
}

/** A burst of filtered noise rendered on its own then mixed in (keeps filter state local to the layer). */
export function band(x: Float32Array, rate: number, rng: Rng, o: {
  start: number; dur: number; mode: FilterMode; freq: number | ((t: number) => number); q?: number;
  attack?: number; tau: number; gain: number; brown?: boolean; hold?: number;
}): Float32Array {
  const layer = new Float32Array(Math.max(1, Math.round(o.dur * rate)));
  let b = 0, e = 1;
  const attack = o.attack ?? .0005, hold = o.hold ?? 0, decay = Math.exp(-1 / (o.tau * rate));
  const attackEnd = Math.round(attack * rate), holdEnd = Math.round((attack + hold) * rate);
  for (let i = 0; i < layer.length; i++) {
    if (i < attackEnd) e = i / attackEnd; else if (i < holdEnd) e = 1; else e = i === holdEnd ? 1 : e * decay;
    let n = rng.signed();
    if (o.brown) { b = b * .985 + n * .15; n = b * 2.2; }
    layer[i] = n * e;
  }
  const f = o.freq;
  svf(layer, rate, o.mode, typeof f === 'function' ? (t: number) => f(t) : f, o.q ?? .707);
  return mix(x, layer, Math.round(o.start * rate), o.gain);
}

/** A sine (or softened triangle/saw) with an exponential pitch glide and envelope, added into x. */
export function tone(x: Float32Array, rate: number, o: {
  start: number; dur: number; from: number; to?: number; glide?: number; attack?: number; tau: number; gain: number;
  shape?: 'sine' | 'tri' | 'saw' | 'square'; phase?: number; vibrato?: [number, number];
}): Float32Array {
  const a = Math.round(o.start * rate), n = Math.round(o.dur * rate);
  const to = o.to ?? o.from, glide = Math.max(1, Math.round((o.glide ?? o.dur) * rate)), attack = Math.max(1, Math.round((o.attack ?? .002) * rate));
  const ratio = (to / o.from) ** (1 / glide), decay = Math.exp(-1 / (o.tau * rate)), vib = o.vibrato;
  let phase = o.phase ?? 0, f = o.from, e = 0;
  for (let i = 0; i < n && a + i < x.length; i++) {
    if (i < glide) f *= ratio;
    const fi = vib ? f * (1 + vib[1] * Math.sin(TAU * vib[0] * i / rate)) : f;
    phase += fi / rate;
    const p = phase - Math.floor(phase);
    const w = o.shape === 'tri' ? 1 - 4 * Math.abs(p - .5) : o.shape === 'saw' ? 2 * p - 1 : o.shape === 'square' ? (p < .5 ? 1 : -1) : Math.sin(TAU * p);
    e = i < attack ? i / attack : i === attack ? 1 : e * decay;
    if (a + i >= 0) x[a + i] += w * e * o.gain;
  }
  return x;
}

/** Damped sinusoid modes (modal synthesis) struck at `start`. */
export function modes(x: Float32Array, rate: number, start: number, list: readonly (readonly [freq: number, tau: number, gain: number])[], attack = .0004): Float32Array {
  const a = Math.round(start * rate);
  const ramp = Math.max(1, Math.round(attack * rate));
  for (const [freq, tau, gain] of list) {
    // Damped resonator recurrence: y[n] = 2 r cos(w) y[n-1] - r^2 y[n-2].
    const n = Math.min(x.length - a, Math.round(tau * 7 * rate)), w = TAU * freq / rate, r = Math.exp(-1 / (tau * rate));
    const c = 2 * r * Math.cos(w), r2 = r * r;
    let y1 = Math.sin(-w) / r, y2 = Math.sin(-2 * w) / r2;
    for (let i = 0; i < n; i++) {
      const y = c * y1 - r2 * y2;
      y2 = y1; y1 = y;
      if (a + i >= 0) x[a + i] += y * (i < ramp ? i / ramp : 1) * gain;
    }
  }
  return x;
}

/** Sparse micro-impulses (crackle, grit, leaf ticks) with a density envelope, band-limited afterwards by the caller. */
export function grains(x: Float32Array, rate: number, rng: Rng, start: number, dur: number, perSecond: number, gain: number, width = .0006, shape: (u: number) => number = () => 1): Float32Array {
  const count = Math.round(perSecond * dur);
  for (let g = 0; g < count; g++) {
    const u = rng.next(), t = start + u * dur, amp = gain * shape(u) * (.3 + .7 * rng.next()) * (rng.next() < .5 ? -1 : 1);
    const a = Math.round(t * rate), n = Math.max(2, Math.round(width * rate * (.5 + rng.next())));
    for (let i = 0; i < n && a + i < x.length; i++) x[a + i] += amp * rng.signed() * (1 - i / n);
  }
  return x;
}

export function mix(dst: Float32Array, src: Float32Array, offset: number, gain = 1): Float32Array {
  const from = Math.max(0, -offset), to = Math.min(src.length, dst.length - offset);
  for (let i = from; i < to; i++) dst[offset + i] += src[i] * gain;
  return dst;
}

export function scale(x: Float32Array, gain: number): Float32Array { for (let i = 0; i < x.length; i++) x[i] *= gain; return x; }

/** tanh saturation with makeup so small signals keep unity gain. */
export function saturate(x: Float32Array, drive: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / drive;
  return x;
}

export function fadeOut(x: Float32Array, rate: number, seconds: number): Float32Array {
  const n = Math.min(x.length, Math.round(seconds * rate));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= (i / n) ** 2;
  return x;
}

export function fadeIn(x: Float32Array, rate: number, seconds: number): Float32Array {
  const n = Math.min(x.length, Math.round(seconds * rate));
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}

/** Delayed, low-passed copies of the signal (slapback and terrain echoes). */
export function echoes(x: Float32Array, rate: number, taps: readonly (readonly [delay: number, gain: number, lowpass: number])[]): Float32Array {
  const dry = x.slice();
  for (const [delay, gain, lowpass] of taps) {
    const copy = svf(svf(dry.slice(), rate, 'lp', lowpass), rate, 'lp', lowpass);
    mix(x, copy, Math.round(delay * rate), gain);
  }
  return x;
}

/**
 * Compact Schroeder reverb (four damped combs, two all-passes) for short
 * rooms and outdoor diffusion. Returns only the wet signal, same length.
 */
export function reverb(x: Float32Array, rate: number, decay: number, damp: number, size = 1): Float32Array {
  const combs = [.0297, .0371, .0411, .0437].map(d => Math.round(d * size * rate));
  const out = new Float32Array(x.length);
  const damping = Math.exp(-TAU * damp / rate);
  for (const length of combs) {
    const line = new Float32Array(length), fb = 10 ** (-3 * length / rate / decay);
    let idx = 0, low = 0;
    for (let i = 0; i < x.length; i++) {
      const y = line[idx];
      low = y * (1 - damping) + low * damping;
      line[idx] = x[i] + low * fb;
      out[i] += y * .25;
      idx = (idx + 1) % length;
    }
  }
  for (const d of [.005, .0017]) {
    const length = Math.max(1, Math.round(d * size * rate)), line = new Float32Array(length), g = .7;
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const buffered = line[idx], input = out[i];
      out[i] = -g * input + buffered;
      line[idx] = input + g * buffered;
      idx = (idx + 1) % length;
    }
  }
  return out;
}

/** Karplus-Strong plucked string. `bright` in (0, 1] shapes the pluck, `decay` is the T60 in seconds. */
export function pluck(x: Float32Array, rate: number, rng: Rng, start: number, freq: number, decay: number, gain: number, bright = .5): Float32Array {
  const period = rate / freq, length = Math.max(2, Math.floor(period)), frac = period - length;
  const line = new Float32Array(length + 2);
  let lp = 0;
  for (let i = 0; i < line.length; i++) { lp = lp + bright * (rng.signed() - lp); line[i] = lp; }
  const loss = 10 ** (-3 / (decay * freq));
  const a = Math.round(start * rate), n = Math.min(x.length - a, Math.round(decay * 1.2 * rate));
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx], next = line[(idx + 1) % line.length];
    const y = cur + frac * (next - cur);
    const filtered = (y + prev) * .5 * loss;
    prev = y;
    line[idx] = filtered;
    idx = (idx + 1) % line.length;
    x[a + i] += y * gain;
  }
  return x;
}

/** Smooth random curve in [0, 1] (value noise) for gusts, swells and flocks. */
export function smoothCurve(rng: Rng, seconds: number, knotsPerSecond: number): (t: number) => number {
  const count = Math.ceil(seconds * knotsPerSecond) + 3, knots = Array.from({ length: count }, () => rng.next());
  return (t: number) => {
    const p = Math.max(0, t * knotsPerSecond), i = Math.floor(p), f = p - i, s = f * f * (3 - 2 * f);
    return knots[Math.min(i, count - 1)] * (1 - s) + knots[Math.min(i + 1, count - 1)] * s;
  };
}

/** Folds the last `crossfade` seconds into the start so the buffer loops without a seam. */
export function makeLoop(x: Float32Array, rate: number, crossfade: number): Float32Array {
  const f = Math.round(crossfade * rate), out = x.slice(0, x.length - f);
  for (let i = 0; i < f; i++) {
    const u = i / f, a = Math.sin(u * Math.PI / 2), b = Math.cos(u * Math.PI / 2);
    out[i] = x[i] * a + x[x.length - f + i] * b;
  }
  return out;
}

export function peakOf(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  return m;
}

// BS.1770 K-weighting (pre-filter shelf and RLB high-pass) for any sample rate.
function kWeighted(x: Float32Array, rate: number): Float64Array {
  const out = Float64Array.from(x);
  const run = (b0: number, b1: number, b2: number, a1: number, a2: number) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < out.length; i++) {
      const y = b0 * out[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = out[i]; y2 = y1; y1 = y; out[i] = y;
    }
  };
  let k = Math.tan(Math.PI * 1681.974450955533 / rate);
  const vh = 10 ** (3.999843853973347 / 20), vb = vh ** .4996667741545416, q1 = .7071752369554196;
  let a0 = 1 + k / q1 + k * k;
  run((vh + vb * k / q1 + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q1 + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q1 + k * k) / a0);
  k = Math.tan(Math.PI * 38.13547087602444 / rate);
  const q2 = .5003270373238773;
  a0 = 1 + k / q2 + k * k;
  run(1, -2, 1, 2 * (k * k - 1) / a0, (1 - k / q2 + k * k) / a0);
  return out;
}

/** Loudest 400 ms K-weighted window in LUFS (short sounds are measured as if padded with silence). */
export function momentaryLufs(x: Float32Array, rate: number): number {
  const k = kWeighted(x, rate), w = Math.round(rate * .4);
  let sum = 0, best = 0;
  for (let i = 0; i < k.length; i++) {
    sum += k[i] * k[i];
    if (i >= w) sum -= k[i - w] * k[i - w];
    if (sum > best) best = sum;
  }
  return -.691 + 10 * Math.log10(Math.max(best / w, 1e-20));
}

/** Mean K-weighted loudness of a whole buffer in LUFS (for loops). */
export function integratedLufs(x: Float32Array, rate: number): number {
  const k = kWeighted(x, rate);
  let sum = 0;
  for (let i = 0; i < k.length; i++) sum += k[i] * k[i];
  return -.691 + 10 * Math.log10(Math.max(sum / Math.max(1, k.length), 1e-20));
}
