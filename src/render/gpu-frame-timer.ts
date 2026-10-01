import type * as THREE from 'three';
import { gpuPasses } from './gpu-passes';

// GPU time of whole frames for the dynamic resolution, where the browser exposes timer queries
// (Chrome on desktop does; Firefox and Safari do not, and the controller then uses frame times).
// The frame is flushed inside its query: ANGLE Metal times the command buffers committed while a
// query is open. Under a saturated GPU a result also counts queueing, so it is an upper bound.
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class GpuFrameTimer {
  private gl: WebGL2RenderingContext | null = null;
  private ext: TimerExtension | null = null;
  private readonly pending: WebGLQuery[] = [];
  private open = false;
  private latestMs: number | null = null;
  /** Set while something else times frames with its own query (QA benches). */
  suspended = false;

  attach(renderer: THREE.WebGLRenderer) {
    const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return;
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  }

  private get active() { return !!this.ext && !this.suspended && !gpuPasses.enabled; }

  begin() {
    if (!this.active || this.open || this.pending.length > 4) return;
    const query = this.gl!.createQuery();
    if (!query) return;
    this.gl!.beginQuery(this.ext!.TIME_ELAPSED_EXT, query); this.pending.push(query); this.open = true;
  }

  end() {
    if (!this.open || !this.gl || !this.ext) return;
    this.gl.flush(); this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.open = false;
    this.poll();
  }

  private poll() {
    const gl = this.gl!, ext = this.ext!;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { for (const query of this.pending.splice(0, this.open ? this.pending.length - 1 : this.pending.length)) gl.deleteQuery(query); return; }
    while (this.pending.length > (this.open ? 1 : 0) && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      this.latestMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
    }
  }

  /** The most recent completed frame's GPU milliseconds, then null until the next one completes. */
  take(): number | null { const value = this.latestMs; this.latestMs = null; return value; }
}

export const gpuFrameTimer = new GpuFrameTimer();
