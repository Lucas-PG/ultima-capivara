// Offline measurements for rendered audio: loudness, spectrum, envelope and
// noise floor. Shared by the audio tests and the capture tools in tools/audio.

export const db = (power: number) => 10 * Math.log10(Math.max(power, 1e-20));
export const ampDb = (amplitude: number) => 20 * Math.log10(Math.max(Math.abs(amplitude), 1e-10));

export function peak(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  return m;
}

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

const twiddles = new Map<number, [Float64Array, Float64Array]>();
/** In-place radix-2 complex FFT. `re` and `im` share a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let tw = twiddles.get(n);
  if (!tw) {
    tw = [new Float64Array(n / 2), new Float64Array(n / 2)];
    for (let k = 0; k < n / 2; k++) { tw[0][k] = Math.cos(-2 * Math.PI * k / n); tw[1][k] = Math.sin(-2 * Math.PI * k / n); }
    twiddles.set(n, tw);
  }
  const [cos, sin] = tw;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * stride], wi = sin[k * stride];
        const a = start + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

export interface Spectrogram { rate: number; size: number; hop: number; frames: Float64Array[] /* power per bin */ }

export function spectrogram(x: Float32Array, rate: number, size = 2048, hop = size / 2): Spectrogram {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / size);
  const norm = 4 / (size * size); // Hann: coherent gain 0.5, so a full-scale sine reads ~0 dB.
  const frames: Float64Array[] = [];
  for (let start = 0; start + size <= Math.max(x.length, size); start += hop) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = (x[start + i] ?? 0) * window[i];
    fft(re, im);
    const power = new Float64Array(size / 2);
    for (let k = 0; k < size / 2; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) * norm;
    frames.push(power);
  }
  return { rate, size, hop, frames };
}

/** Energy-weighted spectral centroid of a whole sound, in Hz. */
export function centroid(x: Float32Array, rate: number, low = 40): number {
  const spec = spectrogram(x, rate, 2048, 512);
  let num = 0, den = 0;
  const binHz = rate / spec.size;
  for (const frame of spec.frames) for (let k = 1; k < frame.length; k++) {
    const f = k * binHz;
    if (f < low) continue;
    num += f * frame[k]; den += frame[k];
  }
  return den > 0 ? num / den : 0;
}

/** Fraction of a sound's energy in [lo, hi) Hz. */
export function bandShare(x: Float32Array, rate: number, lo: number, hi: number): number {
  const spec = spectrogram(x, rate, 2048, 512), binHz = rate / spec.size;
  let inside = 0, total = 0;
  for (const frame of spec.frames) for (let k = 1; k < frame.length; k++) {
    const f = k * binHz; total += frame[k];
    if (f >= lo && f < hi) inside += frame[k];
  }
  return total > 0 ? inside / total : 0;
}

export const OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Per-frame octave-band power (linear) for bands centred at `centres`. */
export function bandFrames(x: Float32Array, rate: number, centres = OCTAVES, size = 2048, hop = 1024): Float64Array[] {
  const spec = spectrogram(x, rate, size, hop), binHz = rate / size;
  return centres.map(centre => {
    const lo = centre / Math.SQRT2, hi = centre * Math.SQRT2;
    const out = new Float64Array(spec.frames.length);
    spec.frames.forEach((frame, i) => {
      let s = 0;
      for (let k = Math.max(1, Math.floor(lo / binHz)); k < Math.min(frame.length, Math.ceil(hi / binHz)); k++) s += frame[k];
      out[i] = s;
    });
    return out;
  });
}

const percentile = (values: ArrayLike<number>, q: number) => {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? 0;
};

export interface FloorReport {
  /** Per octave band: the 10th percentile power over time, in dB. */
  bands: { centre: number; floorDb: number; medianDb: number; swingDb: number }[];
  /** Power sum of the per-band floors from 250 Hz to 8 kHz, in dBFS. */
  broadbandFloorDb: number;
  /** Octave bands (250 Hz to 8 kHz) whose floor sits within 10 dB of the loudest band floor. */
  flatBands: number;
}

/**
 * Minimum-statistics noise floor: whatever is present in every frame of a
 * long render is the stationary part of the mix. A hiss is broadband (many
 * flat bands) and steady (small swing between the 10th and 90th percentile).
 */
export function noiseFloor(x: Float32Array, rate: number): FloorReport {
  const frames = bandFrames(x, rate);
  const bands = OCTAVES.map((centre, i) => {
    const values = frames[i];
    const floor = percentile(values, .1), median = percentile(values, .5), high = percentile(values, .9);
    return { centre, floorDb: db(floor), medianDb: db(median), swingDb: db(high) - db(floor) };
  });
  const mid = bands.filter(b => b.centre >= 250 && b.centre <= 8000);
  const broadbandFloorDb = db(mid.reduce((s, b) => s + 10 ** (b.floorDb / 10), 0));
  const loudest = Math.max(...mid.map(b => b.floorDb));
  return { bands, broadbandFloorDb, flatBands: mid.filter(b => b.floorDb > loudest - 10).length };
}

/** Short-term RMS envelope in dBFS with a `windowMs` window. */
export function envelope(x: Float32Array, rate: number, windowMs = 5): Float64Array {
  const w = Math.max(1, Math.round(rate * windowMs / 1000)), n = Math.ceil(x.length / w), out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = ampDb(rms(x, i * w, Math.min(x.length, (i + 1) * w)));
  return out;
}

export interface EnvelopeReport { attackMs: number; peakAtMs: number; t20Ms: number; t40Ms: number; peakDb: number }

/** Attack (first crossing of -20 dB re peak to the peak), and decay: last time the 5 ms envelope is within 20 / 40 dB of its peak. */
export function envelopeShape(x: Float32Array, rate: number): EnvelopeReport {
  const env = envelope(x, rate, 5);
  let top = -Infinity, at = 0;
  env.forEach((v, i) => { if (v > top) { top = v; at = i; } });
  let first = at;
  for (let i = 0; i <= at; i++) if (env[i] > top - 20) { first = i; break; }
  let t20 = at, t40 = at;
  for (let i = env.length - 1; i >= at; i--) if (env[i] > top - 20) { t20 = i; break; }
  for (let i = env.length - 1; i >= at; i--) if (env[i] > top - 40) { t40 = i; break; }
  return { attackMs: (at - first) * 5, peakAtMs: at * 5, t20Ms: (t20 - at) * 5, t40Ms: (t40 - at) * 5, peakDb: top };
}

// ITU-R BS.1770 K-weighting as two biquads designed for any sample rate.
function biquad(x: Float64Array, b0: number, b1: number, b2: number, a1: number, a2: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
}
function kWeight(x: Float32Array, rate: number): Float64Array {
  const out = Float64Array.from(x);
  {
    const f0 = 1681.974450955533, g = 3.999843853973347, q = .7071752369554196;
    const k = Math.tan(Math.PI * f0 / rate), vh = 10 ** (g / 20), vb = vh ** .4996667741545416;
    const a0 = 1 + k / q + k * k;
    biquad(out, (vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0);
  }
  {
    const f0 = 38.13547087602444, q = .5003270373238773, k = Math.tan(Math.PI * f0 / rate);
    const a0 = 1 + k / q + k * k;
    biquad(out, 1, -2, 1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0);
  }
  return out;
}

/** Maximum momentary loudness (400 ms K-weighted window, 10 ms hop), in LUFS. Silence pads short sounds. */
export function momentaryMax(x: Float32Array, rate: number): number {
  const k = kWeight(x, rate), w = Math.round(rate * .4), hop = Math.round(rate * .01);
  let best = -Infinity;
  for (let start = 0; start === 0 || start + w <= k.length; start += hop) {
    let s = 0;
    for (let i = start; i < Math.min(k.length, start + w); i++) s += k[i] * k[i];
    best = Math.max(best, -.691 + db(s / w));
    if (start + w >= k.length) break;
  }
  return best;
}

/** Integrated K-weighted loudness without gating, in LUFS (for long steady renders). */
export function loudness(x: Float32Array, rate: number): number {
  const k = kWeight(x, rate);
  let s = 0;
  for (let i = 0; i < k.length; i++) s += k[i] * k[i];
  return -.691 + db(s / Math.max(1, k.length));
}

/** Standard deviation of 100 ms levels in dB: how much a bed moves over time. */
export function modulationDb(x: Float32Array, rate: number): number {
  const env = envelope(x, rate, 100);
  const mean = env.reduce((s, v) => s + v, 0) / env.length;
  return Math.sqrt(env.reduce((s, v) => s + (v - mean) ** 2, 0) / env.length);
}
