import { expect, it } from 'vitest';
import { GpuFrameTimer } from '../src/render/gpu-frame-timer';

// A WebGL2 stand-in whose timer results arrive only when the test says the GPU got to them.
function fakeGl() {
  let next = 1;
  const queries = new Map<number, { ready: boolean; ms: number }>();
  const gl = {
    TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    createQuery: () => { const id = next++; queries.set(id, { ready: false, ms: 0 }); return id; },
    beginQuery: () => {}, endQuery: () => {}, flush: () => {}, deleteQuery: (id: number) => { queries.delete(id); },
    getParameter: () => false, isContextLost: () => false,
    getQueryParameter: (id: number, what: number) => what === 3 ? queries.get(id)!.ready : queries.get(id)!.ms * 1e6,
  };
  return { gl, queries, finish: (ms: number) => { for (const query of queries.values()) if (!query.ready) { query.ready = true; query.ms = ms; } } };
}

it('keeps measuring after the GPU fell several frames behind (the queue once froze the estimate for good)', () => {
  const { gl, finish } = fakeGl(), timer = new GpuFrameTimer();
  Object.assign(timer, { gl, ext: gl });
  // Eight frames whose results are still pending: the queue fills.
  for (let i = 0; i < 8; i++) { timer.begin(); timer.end(); }
  expect(timer.take()).toBeNull();
  finish(9);
  // The next frames must collect those results and start measuring again.
  for (let i = 0; i < 3; i++) { timer.begin(); timer.end(); }
  expect(timer.take()).toBe(9);
  finish(7);
  timer.begin(); timer.end();
  expect(timer.take()).toBe(7);
});
