// Inspect exact graph matrices, shader sources and intermediate targets without product hooks.
// BASE= BUILD= SEED=20261002 node tools/qa/state-proof.mjs <out.json>
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadavg } from 'node:os';
const out = process.argv[2], base = process.env.BASE, build = process.env.BUILD;
if (!out || !base || !build) throw new Error('BASE, BUILD and an output path are required');
const engine = readdirSync(join(build, 'assets')).find(name => /^three-engine-.*\.js$/.test(name));
const wide = JSON.parse(readFileSync(new URL('./wide-views.json', import.meta.url), 'utf8'));
const board = [['fp-m4', 'fp-m4', 1], ['plaza', 'plaza', 1], ['street', 'vilaStreet', 1], ['harbour', 'district-porto', 1],
  ['crowd', 'capyFront', 12], ['plane', 'plaza', 1, wide.plane], ['fight', 'cocoBlast', 8]];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl-egl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page), cpuThrottle = Number(process.env.CPU_THROTTLE || 1);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  page.on('pageerror', error => console.error(error.message));
  await page.addInitScript(seed => {
    localStorage.setItem('uc-onboarded', '1'); let state = seed >>> 0;
    Math.random = () => { state = Math.imul(state ^ (state >>> 16), 2246822507); state = Math.imul(state ^ (state >>> 13), 3266489909); state ^= state >>> 16; return (state >>> 0) / 4294967296; };
    const prototype = WebGL2RenderingContext.prototype, source = prototype.shaderSource;
    window.__proofShaders = [];
    prototype.shaderSource = function (shader, text) { window.__proofShaders.push(text); return source.call(this, shader, text); };
  }, Number(process.env.SEED || 20261002));
  await page.goto(`${base}/?qa=1`); await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
  await page.evaluate(async url => {
    const core = await import(url), object = Object.values(core).find(value => typeof value === 'function' &&
      Object.hasOwn(value.prototype ?? {}, 'updateMatrixWorld') && Object.hasOwn(value.prototype ?? {}, 'updateWorldMatrix'));
    if (!object) throw new Error('Object3D export missing');
    const update = object.prototype.updateMatrixWorld;
    object.prototype.updateMatrixWorld = function (force) {
      if (this.isScene && this.getObjectByName('Ilha_modular') && !this.__proofObserved) {
        this.__proofObserved = true;
        const before = this.onBeforeRender;
        this.onBeforeRender = function (renderer, scene, camera, target) {
          window.__proofWorld = this; window.__proofRenderer = renderer;
          (window.__proofTargets ||= {})[camera.layers.mask === 2 ? 'mask' : 'world'] = target;
          return before.call(this, renderer, scene, camera, target);
        };
      }
      return update.call(this, force);
    };
  }, `${base}/assets/${engine}`);
  await page.evaluate(() => window.__capyQA.start());
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  const rows = [];
  for (const preset of ['low', 'medium', 'high']) {
    await page.evaluate(q => window.__capyQA.quality(q), preset);
    for (const [name, pose, actors, camera] of board) {
      await page.evaluate(view => { window.__camOverride = view ?? undefined; }, camera);
      for (let i = 0; i < 2; i++) await page.evaluate(async ([p, n]) => { window.__capyQA.actors(n); await window.__capyQA.pose(p); }, [pose, actors]);
      await page.evaluate(q => window.__capyQA.quality(q), preset); await page.waitForTimeout(250);
      if (preset !== 'medium' || name !== 'crowd') continue;
      const proof = await page.evaluate(async () => {
        const hash = async buffer => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
        const scene = window.__proofWorld, renderer = window.__proofRenderer, gl = renderer.getContext(), matrices = [], bones = [];
        scene.traverse(object => { matrices.push(...object.matrixWorld.elements); if (object.isSkinnedMesh) bones.push(...object.skeleton.boneMatrices); });
        const targets = {};
        for (const [name, target] of Object.entries(window.__proofTargets)) {
          const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING), alignment = gl.getParameter(gl.PACK_ALIGNMENT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.properties.get(target).__webglFramebuffer); gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
          const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT), type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
          const components = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : format === gl.RG ? 2 : 1;
          const Constructor = type === gl.FLOAT ? Float32Array : type === gl.HALF_FLOAT || type === gl.UNSIGNED_SHORT ? Uint16Array : Uint8Array;
          const pixels = new Constructor(target.width * target.height * components);
          gl.readPixels(0, 0, target.width, target.height, format, type, pixels);
          const error = gl.getError(); gl.pixelStorei(gl.PACK_ALIGNMENT, alignment); gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
          targets[name] = { width: target.width, height: target.height, format, type, error, sha256: await hash(pixels.buffer) };
        }
        const shaders = await Promise.all(window.__proofShaders.map(source => hash(new TextEncoder().encode(source))));
        return { matrices: { values: matrices.length, sha256: await hash(new Float64Array(matrices).buffer) },
          bones: { values: bones.length, sha256: await hash(new Float32Array(bones).buffer) }, targets, shaders: shaders.sort() };
      });
      await page.screenshot({ path: out.replace(/\.json$/, '.png'), animations: 'disabled' });
      rows.push({ preset, name, proof });
    }
  }
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, build, cpuThrottle, load: loadavg(),
    viewport: { width: 1470, height: 956, dpr: 2 }, seed: Number(process.env.SEED || 20261002), rows }, null, 2));
  console.log('wrote', out);
} finally { await browser.close(); }
