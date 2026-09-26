const STEP_MS = 1000 / 60;

// Input and prediction keep their fixed cadence even when no display frame is
// requested. A suspended page drops elapsed time instead of replaying seconds.
export class InputClock {
  private previous = performance.now();
  private tickAt = this.previous;
  private accumulator = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly active: () => boolean, private readonly tick: (now: number) => void) {
    this.timer = setInterval(() => this.advance(), STEP_MS / 2);
  }

  private advance() {
    const now = performance.now(), elapsed = Math.max(0, now - this.previous);
    this.previous = now;
    if (!this.active()) { this.accumulator = 0; this.tickAt = now; return; }
    // Throttled timers can fire only once per second. Send the current intent
    // once rather than either replaying stale time or going silent forever.
    if (elapsed > 500) { this.accumulator = 0; this.tickAt = now; this.tick(now); return; }
    this.accumulator += Math.min(100, elapsed);
    while (this.accumulator + 1e-7 >= STEP_MS) {
      this.accumulator = Math.max(0, this.accumulator - STEP_MS);
      this.tickAt = now - this.accumulator;
      this.tick(now);
    }
  }

  fraction(now: number) { return Math.max(0, Math.min(1, (now - this.tickAt) / STEP_MS)); }
  reset() { this.previous = this.tickAt = performance.now(); this.accumulator = 0; }
  dispose() { clearInterval(this.timer); }
}
