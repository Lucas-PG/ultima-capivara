// Which display refreshes the game draws. A cap of 0 is "Taxa da tela": one frame per refresh
// (120 on a ProMotion MacBook Pro, 144 on a gaming monitor, 60 on a MacBook Air). 60 and 30 cap the
// rate; a display within 10 percent of the cap (a 60.1 Hz panel) simply draws every refresh, since
// skipping one in six hundred would be a visible stutter for nothing.

/** Frames per second the game may draw: 0 is the display's own rate. */
export type FrameLimit = 0 | 30 | 60;

const WINDOW = 240;

export class FramePacer {
  private readonly ring = new Float64Array(WINDOW);
  private readonly sorted = new Float64Array(WINDOW);
  private count = 0;
  private lastTick = 0;
  private deadline = 0;
  /** The display's refresh interval: a low percentile of recent requestAnimationFrame deltas
   * (slow frames only lengthen deltas), never taken above 60 Hz's, so a game too slow to reach
   * the display rate can never talk its own frame budget up. */
  displayMs = 1000 / 60;

  /** Call on every requestAnimationFrame callback, drawn or not. */
  tick(now: number) {
    const delta = now - this.lastTick; this.lastTick = now;
    // Hidden tabs and long stalls say nothing about the refresh rate.
    if (delta < 3 || delta > 60) return;
    this.ring[this.count++ % WINDOW] = delta;
    if (this.count >= 9 && (this.count < 60 || this.count % 30 === 0)) {
      const n = Math.min(this.count, WINDOW), view = this.sorted.subarray(0, n);
      view.set(this.ring.subarray(0, n)); view.sort();
      this.displayMs = Math.min(1000 / 60, view[Math.floor(n * .05)]);
    }
  }

  /** The cadence the game holds for a cap: what the dynamic resolution budgets for. */
  intervalMs(limit: number) { return limit > 0 ? Math.max(1000 / limit, this.displayMs) : this.displayMs; }

  /** Whether to draw on this refresh. Never catches up after a stall. */
  shouldRender(now: number, limit: number): boolean {
    const interval = this.intervalMs(limit);
    if (interval < this.displayMs * 1.1) { this.deadline = now + interval; return true; }
    // A refresh up to half an interval early still counts for this slot: rAF timestamps jitter.
    if (now < this.deadline - this.displayMs / 2) return false;
    this.deadline = now > this.deadline + interval ? now + interval : this.deadline + interval;
    return true;
  }

  /** The next refresh draws (after a pause, a lock or a cap change). */
  reset() { this.deadline = 0; }
}

/** The automatic default draws at the display's rate only while the machine has headroom: on a
 * high-refresh screen, if holding that rate takes the render density below this share of its
 * ceiling for a few seconds, the game settles at 60 for the session (a chosen "Taxa da tela"
 * always keeps the display's rate). */
export const HEADROOM_DENSITY = .85;
export const HEADROOM_SECONDS = 3;
