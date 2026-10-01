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
 * The part of the GPU cost that follows the pixel count grows with the square of the density (see
 * slope): a frame over budget steps down toward the density that fits (at most a fifth per step, a
 * third when most frames miss), a frame with room climbs back one small step at a time. GPU times are the median of recent timer queries, ignoring the
 * few still in flight from before a change, so a stray spike (another app on the GPU) cannot send the
 * image to the floor. A climb that is undone within 4 s doubles the wait before the next one, which
 * stops the resolution from breathing. Without GPU timings a climb is a probe that backs off the same
 * way. Frames slowed by the main thread never lower the resolution, which would blur the image
 * without gaining a frame. */
export class DynamicResolution {
  density: number;
  private range: RenderRange;
  private readonly misses: boolean[] = [];
  private readonly gpuSamples: number[] = [];
  private inFlight = 0;
  private cpu = 0;
  private sinceChange = 0;
  private sinceRaise = Infinity;
  private climbDelay = CLIMB_DELAY;
  private stableFor = 0;
  private overloadMs = 0;
  // GPU ms per unit of density squared, measured across density changes (null until one is seen).
  private perPixel: number | null = null;
  // The settled median at the density before the last change, waiting for one at the new density.
  private before: { x: number; y: number } | null = null;

  constructor(range: RenderRange) { this.range = range; this.density = range.max; }

  /** GPU milliseconds per unit of density squared. Much of a frame does not scale with pixels
   * (geometry, the shadow map, the upscale to the canvas, other work on the GPU): measured on this
   * laptop, about 7 of the 9 ms at Medium's floor. Reading all of the time as pixel cost kept the
   * resolution at its floor although it had room. Each density change measures the slope from the
   * settled GPU times just before and just after it (a fraction of a second apart, so the scene is
   * the same), averaged over recent changes and kept between a quarter of and all of the current
   * cost; before any change, all of it counts (the cautious reading). */
  private slope(gpu: number) {
    const all = gpu / this.density ** 2;
    return this.perPixel === null ? all : Math.min(all, Math.max(all * .25, this.perPixel));
  }

  get ceiling() { return this.range.max; }
  /** The median GPU frame time behind the decisions, when timer queries exist (diagnostics too). */
  get gpuEstimate(): number | null {
    if (this.gpuSamples.length < 5) return null;
    const sorted = [...this.gpuSamples].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  }

  /** A new range (preset, setting or screen change) starts again at its ceiling. */
  reset(range: RenderRange) {
    this.range = range; this.density = range.max; this.misses.length = 0; this.gpuSamples.length = 0; this.inFlight = 0;
    this.sinceChange = 0; this.sinceRaise = Infinity; this.climbDelay = CLIMB_DELAY; this.stableFor = 0; this.overloadMs = 0;
    this.perPixel = null; this.before = null;
  }

  /** The GPU still misses the budget at the floor density for about 15 s of play (with recovery
   * paying it back at half the rate): a lighter preset would play better. */
  get overloaded() { return this.overloadMs > 15000; }

  /** Feeds one frame; returns true when the density changed. */
  update(frame: FrameSample): boolean {
    const { intervalMs, budgetMs } = frame;
    // A hidden tab or a long stall is not a steady frame rate.
    if (!this.range.dynamic || !(intervalMs > 0) || intervalMs > 1000) return false;
    this.sinceChange += intervalMs; this.sinceRaise += intervalMs; this.stableFor += intervalMs;
    if (this.stableFor > 20000) this.climbDelay = CLIMB_DELAY;
    this.cpu += (frame.cpuMs - this.cpu) * .1;
    if (frame.gpuMs !== null && frame.gpuMs > 0) {
      if (this.inFlight > 0) this.inFlight--;
      else { this.gpuSamples.push(frame.gpuMs); if (this.gpuSamples.length > 15) this.gpuSamples.shift(); }
    }
    this.misses.push(intervalMs > budgetMs * 1.3);
    if (this.misses.length > 60) this.misses.shift();
    const recent = this.misses.slice(-30), missRate = recent.filter(Boolean).length / Math.max(1, recent.length);
    const gpu = this.gpuEstimate, cpuBound = this.cpu > budgetMs * .85;
    const settled = gpu !== null && this.gpuSamples.length >= 9;
    if (settled && this.before) {
      const dx = this.density ** 2 - this.before.x, sample = Math.max(0, (gpu - this.before.y) / dx);
      this.perPixel = this.perPixel === null ? sample : this.perPixel + (sample - this.perPixel) * .3;
      this.before = null;
    }
    const gpuOver = gpu !== null && gpu > budgetMs * .95, missing = recent.length >= 20 && missRate >= .25;
    const severe = recent.length >= 20 && missRate >= .6;
    const { min, max } = this.range;
    const struggling = !cpuBound && (gpuOver || missing);
    this.overloadMs = struggling && this.density <= min + 1e-6 ? this.overloadMs + intervalMs : Math.max(0, this.overloadMs - intervalMs * .5);
    if (struggling && this.sinceChange >= (severe ? 300 : 500)) {
      // Toward the density whose GPU time fits 80 percent of the budget (with frame times only, the pixels that would).
      let target: number;
      if (gpu !== null && gpuOver) target = Math.sqrt(Math.max(0, this.density ** 2 - (gpu - budgetMs * .8) / this.slope(gpu)));
      else target = this.density * Math.sqrt(budgetMs * .8 / Math.max(budgetMs * 1.3, intervalAverage(this.misses, budgetMs)));
      const factor = Math.min(.95, Math.max(severe ? .7 : .8, target / this.density));
      // A climb undone this soon was one step too far: wait twice as long before the next.
      if (this.sinceRaise < 4000) this.climbDelay = Math.min(30000, this.climbDelay * 2);
      this.stableFor = 0; this.sinceRaise = Infinity;
      return this.set(Math.max(min, Math.min(this.density - STEP, quantize(this.density * factor))));
    }
    if (this.density >= max || this.misses.length < 60 || this.misses.some(Boolean) || this.sinceChange < this.climbDelay) return false;
    const next = Math.min(max, quantize(this.density + STEP));
    // With GPU timings, climb only when the next step still fits comfortably; without, probe.
    if (gpu !== null && gpu + this.slope(gpu) * (next ** 2 - this.density ** 2) > budgetMs * .78) return false;
    if (this.set(next)) { this.sinceRaise = 0; return true; }
    return false;
  }

  private set(density: number) {
    density = Math.min(this.range.max, Math.max(this.range.min, +density.toFixed(4)));
    if (Math.abs(density - this.density) < 1e-6) return false;
    // Queries already submitted measured the old density: let them pass, then measure afresh.
    const gpu = this.gpuSamples.length >= 9 ? this.gpuEstimate : null;
    this.before = gpu === null ? null : { x: this.density ** 2, y: gpu };
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
