// Records the game's real master output in Chrome during a practice match.
// node tools/audio/capture-mix.mjs <outDir> [mode] [scenario]
// Scenarios: "idle" (stand still: full mix, then with every looping source
// muted, then each loop soloed) and "combat" (hunt the nearest bot).
// Writes <outDir>/<scenario>-<segment>.f32 (mono float32 at the context rate)
// plus <outDir>/<scenario>.json describing the segments and the looping sources.
// Needs a VITE_QA=1 dev server at BASE. Chrome runs muted.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [out = 'audio-capture', mode = 'deathmatch', scenario = 'idle'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text()); });

// Every connection to a destination is routed through a pass-through recorder,
// and every connection is remembered so a source can be muted and restored.
await page.addInitScript(() => {
  const outputs = new Map();
  const rec = window.__rec = { contexts: [], loops: [], recording: false };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioNode) { const list = outputs.get(this) || []; list.push([dest, ...rest]); outputs.set(this, list); }
    const ctx = this.context;
    if (dest === ctx.destination && !this.__recorder) {
      let entry = rec.contexts.find(c => c.ctx === ctx);
      if (!entry) {
        const node = ctx.createScriptProcessor(4096, 2, 2);
        node.__recorder = true;
        entry = { ctx, node, chunks: [], game: false };
        node.onaudioprocess = event => {
          const a = event.inputBuffer.getChannelData(0), b = event.inputBuffer.getChannelData(1);
          event.outputBuffer.getChannelData(0).set(a); event.outputBuffer.getChannelData(1).set(b);
          if (rec.recording) { const mono = new Float32Array(a.length); for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) / 2; entry.chunks.push(mono); }
        };
        connect.call(node, ctx.destination);
        rec.contexts.push(entry);
      }
      return connect.call(this, entry.node, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.loop) {
      rec.loops.push({ node: this, seconds: this.buffer?.duration ?? 0 });
      const entry = rec.contexts.find(c => c.ctx === this.context); if (entry) entry.game = true; else this.context.__game = true;
    }
    return start.apply(this, args);
  };
  rec.mute = (index, muted) => {
    const node = rec.loops[index].node;
    if (muted) node.disconnect(); else for (const args of outputs.get(node) || []) connect.call(node, ...args);
  };
  rec.take = () => {
    const entry = rec.contexts.find(c => c.game || c.ctx.__game) || rec.contexts.at(-1);
    const total = entry.chunks.reduce((s, c) => s + c.length, 0), all = new Float32Array(total);
    let o = 0; for (const c of entry.chunks) { all.set(c, o); o += c.length; }
    for (const e of rec.contexts) e.chunks = [];
    const bytes = new Uint8Array(all.buffer); let s = '';
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { rate: entry.ctx.sampleRate, data: btoa(s) };
  };
});

await page.goto(`${process.env.BASE || 'http://127.0.0.1:5175'}/?networkQa=1&calm&timing=1${process.env.QUERY || ''}`);
await page.locator(`[data-mode="${mode}"]`).click();
await page.locator('[data-do="practice"]').click();
await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot && !s.renderState.loading; }, null, { timeout: 120000 });
await page.evaluate(() => { window.__networkQA.activate(); window.__networkQA.key('KeyH', true); window.__networkQA.key('KeyH', false); });
await page.waitForTimeout(2500);
await page.waitForFunction(() => (window.__capivara.audio?.().baked ?? 1) > 250, null, { timeout: 60000 }).catch(() => console.error('bank not baked'));
console.log('audio', JSON.stringify(await page.evaluate(() => window.__capivara.audio?.())));

const segments = [];
async function record(name, seconds) {
  await page.evaluate(() => { window.__rec.take(); window.__rec.recording = true; });
  await page.waitForTimeout(seconds * 1000);
  const { rate, data } = await page.evaluate(() => { window.__rec.recording = false; return window.__rec.take(); });
  writeFileSync(`${out}/${scenario}-${name}.f32`, Buffer.from(data, 'base64'));
  const pos = await page.evaluate(() => { const i = window.__capivara.inspect(); const a = i.snapshot.actors.find(x => !x.bot); return a && { x: +a.pos.x.toFixed(1), y: +a.pos.y.toFixed(1), z: +a.pos.z.toFixed(1) }; });
  const audio = await page.evaluate(() => window.__capivara.audio?.());
  segments.push({ name, seconds, rate, pos, audio });
  console.log('recorded', name, seconds, 's at', rate, 'Hz', JSON.stringify(pos));
}

const loops = await page.evaluate(() => window.__rec.loops.map(l => l.seconds));
if (scenario === 'idle') {
  await record('full', 12);
  for (let i = 0; i < loops.length; i++) await page.evaluate(i => window.__rec.mute(i, true), i);
  await record('loops-muted', 8);
  for (let i = 0; i < loops.length; i++) {
    await page.evaluate(i => window.__rec.mute(i, false), i);
    await record(`loop-${i}`, 5);
    await page.evaluate(i => window.__rec.mute(i, true), i);
  }
} else if (scenario === 'drop') {
  // Battle royale: ride the plane, jump, fall, open the chute and land, logging the audio state.
  const log = setInterval(async () => { try { const a = await page.evaluate(() => { const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot); return { stage: me?.stage, audio: window.__capivara.audio() }; }); console.log('state', a.stage, a.audio.music, JSON.stringify(a.audio.loops)); } catch { /* page busy */ } }, 3000);
  setTimeout(() => page.evaluate(() => { window.__networkQA.key('Space', true); window.__networkQA.key('Space', false); }), 5000);
  await record('drop', 40);
  clearInterval(log);
} else {
  // Hunt: aim at the nearest bot, close in and fire.
  await page.evaluate(() => {
    window.__hunt = setInterval(() => {
      const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot);
      if (!me?.alive) return;
      let best = null, bd = 1e9;
      for (const t of i.snapshot.actors) { if (!t.bot || !t.alive) continue; const d = Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z); if (d < bd) { bd = d; best = t; } }
      if (!best) return;
      const dx = best.pos.x - me.pos.x, dz = best.pos.z - me.pos.z;
      window.__networkQA.look(Math.atan2(-dx, -dz), Math.atan2(best.pos.y + 1 - me.pos.y - 1.55, Math.hypot(dx, dz)));
      window.__networkQA.key('KeyW', bd > 9);
      if (bd < 45) window.__networkQA.fire();
    }, 90);
  });
  await page.evaluate(() => window.__capivara.resetPerf());
  await record('hunt', 20);
  const cost = await page.evaluate(() => {
    const d = window.__capivara.timings().spans.filter(s => s.name === 'audio').map(s => s.duration).sort((a, b) => a - b);
    const q = p => +(d[Math.floor(p * (d.length - 1))] ?? 0).toFixed(3);
    return { frames: d.length, p50: q(.5), p95: q(.95), p99: q(.99), top: d.slice(-5).map(v => +v.toFixed(2)) };
  });
  console.log('audio update ms', JSON.stringify(cost));
}
writeFileSync(`${out}/${scenario}.json`, JSON.stringify({ mode, scenario, loops, segments }, null, 1));
await browser.close();
