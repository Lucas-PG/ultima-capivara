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
 * GPU cost follows the pixel count, the square of the density: a frame over budget drops straight
 * to the density that fits, a frame with room climbs back in small steps. Without GPU timings a
 * climb is a probe that backs off (3 s, 6 s, ... 48 s) each time it fails. Frames slowed by the
 * main thread never lower the resolution, which would blur the image without gaining a frame. */
export class DynamicResolution {
  density: number;
  private range: RenderRange;
  private readonly misses: boolean[] = [];
  private gpu: number | null = null;
  private cpu = 0;
  private sinceChange = 0;
  private probeDelay = 3000;
  private probing = false;
  private overloadMs = 0;

  constructor(range: RenderRange) { this.range = range; this.density = range.max; }

  get ceiling() { return this.range.max; }

  /** A new range (preset, setting or screen change) starts again at its ceiling. */
  reset(range: RenderRange) {
    this.range = range; this.density = range.max; this.misses.length = 0;
    this.gpu = null; this.sinceChange = 0; this.probeDelay = 3000; this.probing = false; this.overloadMs = 0;
  }

  /** The GPU still misses the budget at the floor density for about 15 s of play (with recovery
   * paying it back at half the rate): a lighter preset would play better. */
  get overloaded() { return this.overloadMs > 15000; }

  /** Feeds one frame; returns true when the density changed. */
  update(frame: FrameSample): boolean {
    const { intervalMs, budgetMs } = frame;
    // A hidden tab or a long stall is not a steady frame rate.
    if (!this.range.dynamic || !(intervalMs > 0) || intervalMs > 1000) return false;
    this.sinceChange += intervalMs;
    this.cpu += (frame.cpuMs - this.cpu) * .1;
    if (frame.gpuMs !== null && frame.gpuMs > 0) this.gpu = this.gpu === null ? frame.gpuMs : this.gpu + (frame.gpuMs - this.gpu) * .15;
    this.misses.push(intervalMs > budgetMs * 1.3);
    if (this.misses.length > 60) this.misses.shift();
    const recent = this.misses.slice(-30), missRate = recent.filter(Boolean).length / Math.max(1, recent.length);
    const cpuBound = this.cpu > budgetMs * .85;
    const gpuOver = this.gpu !== null && this.gpu > budgetMs * .92;
    const { min, max } = this.range;
    const struggling = !cpuBound && (gpuOver || (recent.length >= 20 && missRate >= .2));
    this.overloadMs = struggling && this.density <= min + 1e-6 ? this.overloadMs + intervalMs : Math.max(0, this.overloadMs - intervalMs * .5);
    if (this.sinceChange >= 300 && !cpuBound && (gpuOver || (recent.length >= 20 && missRate >= .2))) {
      // The pixels that fit 80 percent of the budget, from the GPU time (or the frame time) at this density.
      const cost = this.gpu !== null && gpuOver ? this.gpu : Math.max(budgetMs * 1.3, recent.length ? intervalAverage(this.misses, budgetMs) : budgetMs * 1.3);
      const factor = Math.min(.95, Math.max(.7, Math.sqrt(budgetMs * .8 / cost)));
      if (this.probing) this.probeDelay = Math.min(48000, this.probeDelay * 2);
      this.probing = false;
      return this.set(Math.max(min, Math.min(this.density - STEP, quantize(this.density * factor))));
    }
    if (this.density >= max || this.misses.length < 60 || this.misses.some(Boolean)) return false;
    if (this.gpu !== null) {
      // Climb only when the GPU time predicts the next step still fits.
      const next = Math.min(max, quantize(this.density + STEP));
      if (this.sinceChange < 1000 || this.gpu * (next / this.density) ** 2 > budgetMs * .75) return false;
      return this.set(next);
    }
    if (this.sinceChange < this.probeDelay) return false;
    if (this.probing) this.probeDelay = 3000;
    this.probing = true;
    return this.set(Math.min(max, quantize(this.density + STEP)));
  }

  private set(density: number) {
    density = Math.min(this.range.max, Math.max(this.range.min, +density.toFixed(4)));
    if (Math.abs(density - this.density) < 1e-6) return false;
    // GPU time scales with the pixel count; carry the estimate to the new density.
    if (this.gpu !== null) this.gpu *= (density / this.density) ** 2;
    this.density = density; this.sinceChange = 0; this.misses.length = 0;
    return true;
  }
}

// Mean frame time implied by the recent misses: a missed vsync costs at least two intervals.
function intervalAverage(misses: boolean[], budgetMs: number) {
  const missed = misses.filter(Boolean).length;
  return budgetMs * (1 + missed / Math.max(1, misses.length));
}
