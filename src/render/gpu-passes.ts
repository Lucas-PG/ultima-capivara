import type * as THREE from 'three';

// Opt-in GPU time per render pass (?gpu=1 in a DEV or VITE_QA build; absent from normal play).
// Passes run back to back, so exactly one EXT_disjoint_timer_query_webgl2 query is open at a
// time: mark() closes the running pass and opens the next. Results arrive a few frames late.
// On ANGLE Metal a query spans submission to completion, so in a live frame it also counts the
// time its work waited in the queue behind earlier passes, and work still unsubmitted when the
// query ends is missed. `sync` (QA benches only) completes each pass before its query ends, on
// an idle GPU, which makes every query the cost of that pass alone.
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type Query = { query: WebGLQuery; pass: string; frame: number };

export class GpuPassTimer {
  private gl: WebGL2RenderingContext | null = null;
  private ext: TimerExtension | null = null;
  private open: Query | null = null;
  private pending: Query[] = [];
  private frame = 0;
  private building = new Map<number, Record<string, number>>();
  private complete: Record<string, number>[] = [];
  private lost = 0;
  current: string | null = null;
  sync = false;
  /** While set, passes are not timed (a caller is timing whole frames with its own query). */
  suspended = false;
  private readonly pixel = new Uint8Array(4);
  // Sync mode also times each pass on the CPU clock from an idle GPU to its completion, minus the
  // cost of an empty round trip: a check on the timer queries that does not depend on the driver.
  private openedAt = 0;
  private wallFrame: Record<string, number> = {};
  private wall: Record<string, number>[] = [];
  private roundTrip = 0;

  constructor(readonly enabled: boolean) {}

  attach(renderer: THREE.WebGLRenderer) {
    if (!this.enabled) return;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    // The sun's shadow map is drawn inside the world render call: split it out as its own pass.
    const shadowMap = renderer.shadowMap, original = shadowMap.render.bind(shadowMap);
    shadowMap.render = (...args: Parameters<typeof original>) => {
      const resume = this.current;
      if (!shadowMap.enabled || !(args[0] as unknown[]).length) { original(...args); return; }
      this.mark('shadow');
      try { original(...args); } finally { this.mark(resume); }
    };
  }

  get supported() { return !!this.ext; }

  /** Ends the running pass and starts `pass` (null ends the frame's last pass). */
  mark(pass: string | null) {
    if (!this.ext || !this.gl || this.suspended) return;
    if (this.open) {
      // ANGLE Metal times the command buffers committed while a query is open: commit the pass first.
      if (this.sync) {
        this.idle();
        this.wallFrame[this.open.pass] = (this.wallFrame[this.open.pass] ?? 0) + Math.max(0, performance.now() - this.openedAt - this.roundTrip);
      }
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.open); this.open = null;
    }
    this.current = pass;
    if (pass === null) return;
    const query = this.gl.createQuery();
    if (!query) return;
    if (this.sync) this.openedAt = performance.now();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.open = { query, pass, frame: this.frame };
  }

  /** Measures an empty idle round trip, subtracted from every synchronized wall time. */
  calibrate() {
    if (!this.gl) return 0;
    this.idle();
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) { const at = performance.now(); this.idle(); samples.push(performance.now() - at); }
    return this.roundTrip = samples.sort((a, b) => a - b)[4];
  }

  endFrame() {
    if (!this.ext || !this.gl || this.suspended) return;
    this.mark(null);
    if (this.sync) { this.wall.push(this.wallFrame); this.wallFrame = {}; }
    this.poll();
    this.frame++;
  }

  private poll() {
    const gl = this.gl!, ext = this.ext!;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const item of this.pending) gl.deleteQuery(item.query);
      this.lost += new Set(this.pending.map(item => item.frame)).size;
      this.pending = []; this.building.clear();
    }
    while (this.pending.length && gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const item = this.pending.shift()!;
      const ms = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(item.query);
      const passes = this.building.get(item.frame) ?? {};
      passes[item.pass] = (passes[item.pass] ?? 0) + ms;
      this.building.set(item.frame, passes);
      // A frame is complete once the next frame's first query has resolved.
      for (const [frame, done] of this.building) if (frame < item.frame) { this.complete.push(done); this.building.delete(frame); }
    }
    if (this.complete.length > 20000) this.complete.splice(0, this.complete.length - 20000);
  }

  // A 1-pixel read of the target the pass just drew returns only once that work has completed
  // (a read of the untouched canvas does not wait for offscreen targets).
  private idle() {
    const gl = this.gl!, format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number, type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
    gl.readPixels(0, 0, 1, 1, format, type, type === gl.FLOAT ? this.floatPixel : type === gl.HALF_FLOAT ? this.halfPixel : this.pixel);
  }
  private readonly floatPixel = new Float32Array(4);
  private readonly halfPixel = new Uint16Array(4);

  /** Waits until every submitted query has resolved, then files the last frame. */
  async drain() {
    if (!this.ext || !this.gl) return;
    for (let wait = 0; wait < 80 && this.pending.length; wait++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      this.poll();
    }
    for (const done of this.building.values()) this.complete.push(done);
    this.building.clear();
  }

  /** Mean, p50 and p95 per pass and for the frame total, in milliseconds. */
  summary() {
    const stats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
      return { mean: +(values.reduce((sum, n) => sum + n, 0) / Math.max(1, values.length)).toFixed(3), p50: +at(.5).toFixed(3), p95: +at(.95).toFixed(3) };
    };
    const names = new Set(this.complete.flatMap(frame => Object.keys(frame)));
    const passes: Record<string, ReturnType<typeof stats>> = {};
    for (const name of names) passes[name] = stats(this.complete.map(frame => frame[name] ?? 0));
    const wallNames = new Set(this.wall.flatMap(frame => Object.keys(frame)));
    const wall: Record<string, ReturnType<typeof stats>> = {};
    for (const name of wallNames) wall[name] = stats(this.wall.map(frame => frame[name] ?? 0));
    const sum = (frame: Record<string, number>) => Object.values(frame).reduce((total, n) => total + n, 0);
    return { supported: this.supported, frames: this.complete.length, lostFrames: this.lost, passes,
      total: stats(this.complete.map(sum)), wall, wallTotal: stats(this.wall.map(sum)), roundTripMs: +this.roundTrip.toFixed(3) };
  }

  reset() { this.complete = []; this.wall = []; this.lost = 0; }
}

export const gpuPasses = new GpuPassTimer((import.meta.env.DEV || import.meta.env.VITE_QA === '1') &&
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpu') === '1');
