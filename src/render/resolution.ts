import type { Settings } from '../shared/types';

// Render resolution policy. The 3D image is drawn at a render density (render pixels per CSS
// pixel) and upscaled to the screen; the HUD is HTML and always stays at the screen's own
// resolution. On a Retina laptop (devicePixelRatio 2) the native density costs four times the
// pixels of a 1x screen: at Medium that measured 18 fps live on a MacBook Air M2.

export type RenderScale = Settings['renderScale'];
export const RENDER_SCALES: readonly RenderScale[] = ['auto', 1, .75, .5];

/** Density range of the automatic scale per preset, in render pixels per CSS pixel. The ceiling
 * never exceeds the screen's own density, so a 1x monitor keeps native resolution on Medium. */
export const PRESET_DENSITY: Record<Settings['graphics'], { readonly min: number; readonly max: number }> = {
  low: { min: .5, max: .75 },
  medium: { min: .6, max: 1.25 },
  // High climbs to the screen's own density whenever the GPU time leaves room for it.
  high: { min: .75, max: 2 },
};

export type RenderRange = { min: number; max: number; dynamic: boolean };

/** The density range the renderer may use: automatic within the preset's range, or a fixed share of native. */
export function renderRange(graphics: Settings['graphics'], scale: RenderScale, deviceRatio: number): RenderRange {
  const native = Math.max(.5, deviceRatio || 1);
  if (scale !== 'auto') { const fixed = Math.max(.25, native * scale); return { min: fixed, max: fixed, dynamic: false }; }
  const preset = PRESET_DENSITY[graphics], max = Math.min(native, preset.max);
  return { min: Math.min(max, preset.min), max, dynamic: true };
}

/** Canvas density: the screen's own on Medium and High, so the upscale (not the browser's bilinear
 * stretch) fills it; Low keeps its canvas at the render ceiling and saves that full-screen pass. */
export function outputDensity(graphics: Settings['graphics'], range: RenderRange, deviceRatio: number) {
  const native = Math.max(.5, deviceRatio || 1);
  return graphics === 'low' ? Math.min(native, range.max) : native;
}

/** Render size in pixels for a CSS viewport at a density, never below 1. */
export function renderSize(cssWidth: number, cssHeight: number, density: number) {
  return { width: Math.max(1, Math.round(cssWidth * density)), height: Math.max(1, Math.round(cssHeight * density)) };
}

export type FrameSample = {
  /** Time since the previous rendered frame. */
  intervalMs: number;
  /** The cadence the game is trying to hold (16.7 ms at 60 fps). */
  budgetMs: number;
  /** Main-thread time of this frame's update and draw submission. */
  cpuMs: number;
  /** GPU time of a recent frame where the browser exposes timer queries (an upper bound under load). */
  gpuMs: number | null;
};

const STEP = .05;
const quantize = (value: number) => Math.round(value / STEP) * STEP;

/** Holds the frame-time budget by moving the render density between the range's floor and ceiling.
 * Missed frames decide, unless the main thread is the cause: when a quarter of recent frames miss the
 * density steps down toward the pixels that fit (at most a fifth per step, a third when most frames
 * miss), and a trickle of misses (4 in a second) costs one step. After a second with no miss it
 * climbs one small step, a probe; a probe that misses three frames within 4 s goes straight back.
 * Each drop marks the density that missed: the next try there waits twice as long as the last
 * (up to 30 s) while the steps below it stay free, so the resolution settles just under what the
 * GPU can draw instead of breathing. GPU timer queries do not measure headroom on this hardware:
 * Apple GPUs lower their clock to fill the frame, so a Medium frame read 10 to 13 ms at every
 * density from 0.6 to 1.15 while a fixed 1.0 held 60 fps, and an earlier controller guided by those
 * times sat at its floor. A GPU time over budget (the clock at its peak) still vetoes a probe and
 * sizes a drop. A slow main thread never lowers the resolution, steadily or in a stall, which would
 * blur the image without gaining a frame. */
export class DynamicResolution {
  density: number;
  private range: RenderRange;
  private readonly misses: boolean[] = [];
  private readonly gpuSamples: number[] = [];
  private inFlight = 0;
  private cpu = 0;
  private sinceChange = 0;
  private sinceRaise = Infinity;
  private raisedFrom = 0;
  // The density of the last probe that missed, and the wait before trying it (or above) again.
  private failedAt = Infinity;
  private retryDelay = CLIMB_DELAY;
  private sinceFail = Infinity;
  private overloadMs = 0;

  constructor(range: RenderRange) { this.range = range; this.density = range.max; }

  get ceiling() { return this.range.max; }
  /** The median GPU frame time of recent timer queries, when the browser has them (diagnostics too). */
  get gpuEstimate(): number | null {
    if (this.gpuSamples.length < 5) return null;
    const sorted = [...this.gpuSamples].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  }

  /** A new range (preset, setting or screen change) starts again at its ceiling. */
  reset(range: RenderRange) {
    this.range = range; this.density = range.max; this.misses.length = 0; this.gpuSamples.length = 0; this.inFlight = 0;
    this.sinceChange = 0; this.sinceRaise = Infinity; this.failedAt = Infinity; this.retryDelay = CLIMB_DELAY; this.sinceFail = Infinity;
    this.overloadMs = 0;
  }

  /** Frames still miss at the floor density for about 15 s of play (with recovery paying it back at
   * half the rate): a lighter preset would play better. */
  get overloaded() { return this.overloadMs > 15000; }

  /** Feeds one frame; returns true when the density changed. */
  update(frame: FrameSample): boolean {
    const { intervalMs, budgetMs } = frame;
    // A hidden tab or a long stall is not a steady frame rate.
    if (!this.range.dynamic || !(intervalMs > 0) || intervalMs > 1000) return false;
    this.sinceChange += intervalMs; this.sinceRaise += intervalMs; this.sinceFail += intervalMs;
    this.cpu += (frame.cpuMs - this.cpu) * .1;
    if (frame.gpuMs !== null && frame.gpuMs > 0) {
      // Queries submitted before a change measured the old density.
      if (this.inFlight > 0) this.inFlight--;
      else { this.gpuSamples.push(frame.gpuMs); if (this.gpuSamples.length > 15) this.gpuSamples.shift(); }
    }
    // A frame whose own main-thread work took two budgets (a page fault, a collection, a long task)
    // missed for a reason a lower resolution cannot fix.
    this.misses.push(intervalMs > budgetMs * 1.3 && !(frame.cpuMs > budgetMs * 2));
    if (this.misses.length > 60) this.misses.shift();
    const recent = this.misses.slice(-30), missed = recent.filter(Boolean).length, missRate = missed / Math.max(1, recent.length);
    const gpu = this.gpuEstimate, cpuBound = this.cpu > budgetMs * .85;
    const missing = recent.length >= 20 && missRate >= .25, severe = recent.length >= 20 && missRate >= .6;
    // A few misses every second are a stutter too, below the quick reaction's threshold.
    const trickle = this.misses.length >= 60 && this.misses.filter(Boolean).length >= 4;
    // A fresh probe gets less benefit of the doubt: three misses since the climb undo it.
    const probeMissed = this.sinceRaise < 4000 && missed >= 3;
    const { min, max } = this.range;
    const struggling = !cpuBound && (missing || trickle || probeMissed);
    this.overloadMs = struggling && this.density <= min + 1e-6 ? this.overloadMs + intervalMs : Math.max(0, this.overloadMs - intervalMs * .5);
    if (struggling && (!missing || this.sinceChange >= (severe ? 300 : 500))) {
      let target = this.density - STEP;
      if (missing) {
        // Toward the pixels that fit 80 percent of the budget, from the frame times (or a GPU time over budget).
        const cost = Math.max(budgetMs * 1.3, gpu !== null && gpu > budgetMs ? gpu : intervalAverage(this.misses, budgetMs));
        target = Math.min(target, quantize(this.density * Math.min(.95, Math.max(severe ? .7 : .8, Math.sqrt(budgetMs * .8 / cost)))));
      }
      // A probe was one step too far: back to where it came from.
      if (this.sinceRaise < 4000) target = Math.min(target, this.raisedFrom);
      if (this.density <= min + 1e-6) return false;
      // Mark the density that missed; missing again at or below the mark doubles the wait before the next try.
      this.retryDelay = this.failedAt <= this.density + 1e-6 ? Math.min(30000, this.retryDelay * 2) : CLIMB_DELAY * 2;
      this.failedAt = this.density; this.sinceFail = 0; this.sinceRaise = Infinity;
      return this.set(Math.max(min, target));
    }
    if (this.density >= max || this.misses.length < 60 || this.misses.some(Boolean) || this.sinceChange < CLIMB_DELAY) return false;
    // A probe that held for 4 s clears the mark it reached.
    if (this.sinceRaise >= 4000 && this.density >= this.failedAt - 1e-6) { this.failedAt = Infinity; this.retryDelay = CLIMB_DELAY; }
    const next = Math.min(max, quantize(this.density + STEP));
    if (next >= this.failedAt - 1e-6 && this.sinceFail < this.retryDelay) return false;
    // A GPU already over budget is at its peak clock: more pixels cannot fit.
    if (gpu !== null && gpu > budgetMs * .95) return false;
    const from = this.density;
    if (this.set(next)) { this.sinceRaise = 0; this.raisedFrom = from; return true; }
    return false;
  }

  private set(density: number) {
    density = Math.min(this.range.max, Math.max(this.range.min, +density.toFixed(4)));
    if (Math.abs(density - this.density) < 1e-6) return false;
    this.density = density; this.sinceChange = 0; this.misses.length = 0; this.gpuSamples.length = 0; this.inFlight = 4;
    return true;
  }
}

const CLIMB_DELAY = 1500;

// Mean frame time implied by the recent misses: a missed vsync costs at least two intervals.
function intervalAverage(misses: boolean[], budgetMs: number) {
  const missed = misses.filter(Boolean).length;
  return budgetMs * (1 + missed / Math.max(1, misses.length));
}
