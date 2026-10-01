// Summaries of tools/qa/real-perf.mjs runs: node tools/qa/real-perf-summary.mjs <run.json>... [--json]
// fps = frames the game rendered per second; frame times are display (rAF) intervals; 1% low is the
// frame rate of the slowest 1% of frames; hitches are intervals over 50 ms after the first 10 s.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const asJson = process.argv.includes('--json');
const at = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
const mean = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

export function summarize(run) {
  const samples = run.samples.filter(s => s.phase === 'playing' || s.phase === 'countdown');
  const settled = samples.filter(s => s.t > 10);
  const intervals = settled.flatMap(s => s.intervals), sorted = [...intervals].sort((a, b) => a - b);
  const worst = sorted.slice(Math.floor(sorted.length * .99));
  // Elapsed time comes from the display's own frame timestamps, not from the 1 s sampling loop.
  const seconds = settled.reduce((a, s) => a + s.intervals.reduce((x, y) => x + y, 0), 0) / 1000, rendered = settled.reduce((a, s) => a + s.renderedFrames, 0);
  const passes = {};
  for (const s of settled) for (const [name, p] of Object.entries(s.gpu?.passes ?? {})) (passes[name] ||= []).push(p.mean);
  const gpuTotal = settled.map(s => s.gpu?.total?.mean).filter(n => n > 0);
  const cpu = {};
  for (const s of settled) for (const [name, span] of Object.entries(s.cpu ?? {})) { const e = cpu[name] ||= { n: 0, sum: 0, max: 0 }; e.n += span.n; e.sum += span.sum; e.max = Math.max(e.max, span.max); }
  const cpuFrames = Math.max(1, cpu.render?.n ?? rendered);
  const thermal = {}; for (const s of settled) thermal[s.thermal] = (thermal[s.thermal] ?? 0) + 1;
  const stages = {}; for (const s of settled) stages[s.stage ?? s.phase] = (stages[s.stage ?? s.phase] ?? 0) + 1;
  const minutes = []; let minuteAt = 0, frames = 0, ms = 0;
  for (const s of settled) { frames += s.renderedFrames; ms += s.intervals.reduce((x, y) => x + y, 0); if (s.t - minuteAt >= 60 || s === settled.at(-1)) { minutes.push(+(frames / Math.max(.001, ms / 1000)).toFixed(1)); minuteAt = s.t; frames = 0; ms = 0; } }
  return {
    quality: run.quality, mode: run.mode, seconds: Math.round(seconds), headless: run.headless, menuMs: run.menuMs, firstFrameMs: run.firstFrameMs,
    fps: +(rendered / Math.max(1, seconds)).toFixed(1), fpsByMinute: minutes,
    p50: +at(sorted, .5).toFixed(1), p95: +at(sorted, .95).toFixed(1), p99: +at(sorted, .99).toFixed(1), max: +(sorted.at(-1) ?? 0).toFixed(1),
    low1: +(1000 / Math.max(1, mean(worst))).toFixed(1), over20: intervals.filter(n => n > 20).length, over50: intervals.filter(n => n > 50).length,
    frames: intervals.length, gpuMs: +mean(gpuTotal).toFixed(2), gpuPasses: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, +mean(v).toFixed(2)])),
    cpuMsPerFrame: Object.fromEntries(Object.entries(cpu).filter(([k]) => !['raf-gap', 'worker-tick'].includes(k)).map(([k, v]) => [k, +(v.sum / cpuFrames).toFixed(2)])),
    cpuMax: Object.fromEntries(Object.entries(cpu).filter(([k]) => k !== 'raf-gap').map(([k, v]) => [k, +v.max.toFixed(1)])),
    workerTickMs: cpu['worker-tick'] ? +(cpu['worker-tick'].sum / cpu['worker-tick'].n).toFixed(2) : null,
    longTasks: settled.reduce((a, s) => a + (s.longTasks?.length ?? 0), 0), heapMB: [Math.min(...settled.map(s => s.heapMB)), Math.max(...settled.map(s => s.heapMB))],
    draws: Math.round(mean(settled.map(s => s.draws ?? 0))), triangles: Math.round(mean(settled.map(s => s.triangles ?? 0))),
    density: settled.some(s => s.density) ? { mean: +mean(settled.map(s => s.density ?? 0)).toFixed(2), min: Math.min(...settled.map(s => s.density ?? 9)), max: Math.max(...settled.map(s => s.density ?? 0)) } : null,
    buffer: settled.at(-1)?.drawingBuffer, buffers: [...new Set(settled.map(s => s.drawingBuffer?.join('x')))],
    thermal, load: +mean(settled.map(s => s.load[0])).toFixed(2), stages, gc: run.gcTraces, errors: run.errors?.length ?? 0,
  };
}

if (files.length) {
  const rows = files.map(file => ({ file, ...summarize(JSON.parse(readFileSync(file, 'utf8'))) }));
  if (asJson) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) {
    console.log(`${r.file.split('/').pop()}: ${r.quality} ${r.mode} ${r.headless ? 'headless' : 'headed'} ${r.seconds}s fps ${r.fps} (by minute ${r.fpsByMinute.join(' ')}) p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} 1%low ${r.low1} >20ms ${r.over20} >50ms ${r.over50} of ${r.frames}`);
    console.log(`  gpu ${r.gpuMs} ms ${JSON.stringify(r.gpuPasses)}`);
    console.log(`  cpu/frame ${JSON.stringify(r.cpuMsPerFrame)} worker ${r.workerTickMs} ms/tick longTasks ${r.longTasks}`);
    console.log(`  cpu max ${JSON.stringify(r.cpuMax)}`);
    console.log(`  draws ${r.draws} tris ${r.triangles} density ${JSON.stringify(r.density)} buffers ${r.buffers.join(',')} heap ${r.heapMB.join('-')} MB thermal ${JSON.stringify(r.thermal)} load ${r.load} stages ${JSON.stringify(r.stages)} menu ${r.menuMs} ms first frame ${r.firstFrameMs} ms errors ${r.errors}`);
    if (r.gc?.length) console.log(`  gc ${JSON.stringify(r.gc)}`);
  }
}
