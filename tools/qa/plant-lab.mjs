// Stills of plant templates from the plant lab (tools/qa/plant-lab.html) on a running dev server.
// node tools/qa/plant-lab.mjs <outDir> <species,...>       standard sheet per species: variants, LODs, 3/15/60 m, back-lit, below
// node tools/qa/plant-lab.mjs <outDir> '<json {name: LabScene}>'   custom scenes (see plant-lab.ts)
//   env: BASE (default http://127.0.0.1:5176), WIND=seconds renders 4 frames of wind per scene instead of one,
//        QUERY (e.g. ?defaultDepth to compare against three's default shadow material).
import { chromium } from '@playwright/test';

const [out, what] = process.argv.slice(2);
let SPECIES = {};
const standard = (species) => {
  const h = SPECIES[species]?.height ?? 4, variants = SPECIES[species]?.variants ?? 1;
  const mid = h * .55, far = Math.max(8, h * 1.6), d15 = Math.max(4, h * 1.7);
  // The sun sits toward -x, -z: "lit" cameras stand on that side.
  const lit = [-.85, -.53], at = (d, k = 1) => [lit[0] * d * k, lit[1] * d * k];
  const row = Array.from({ length: variants }, (_, v) => ({ species, variant: v, x: (v - (variants - 1) / 2) * h * 1.25, z: 0 }));
  const lods = [0, 1, 2].map(lod => ({ species, lod, x: (lod - 1) * h * 1.25, z: 0 }));
  const one = [{ species, x: 0, z: 0 }];
  const [x3, z3] = at(Math.max(2.2, h * .45)), [x15, z15] = at(d15), [x60, z60] = at(far * 3.2);
  return {
    [`${species}-row`]: { plants: row, camera: [x15 * 1.5, 1.62, z15 * 1.5 + 2, 0, mid, 0, 50] },
    [`${species}-lods`]: { plants: lods, camera: [x15 * 1.4, 1.62, z15 * 1.4, 0, mid, 0, 50] },
    [`${species}-3`]: { plants: one, camera: [x3, 1.62, z3, 0, Math.min(h * .6, 3), 0, 72] },
    [`${species}-15`]: { plants: one, camera: [x15, 1.62, z15, 0, mid, 0, 55] },
    [`${species}-15b`]: { plants: one, camera: [-x15, 1.62, -z15, 0, mid, 0, 55] },
    [`${species}-60`]: { plants: [{ species, lod: 2, x: 0, z: 0 }], camera: [x60, 1.62, z60, 0, mid, 0, 30] },
    [`${species}-under`]: { plants: one, camera: [.9, 1.62, .6, 0, h * .9, 0, 85] },
  };
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console.error', m.text().slice(0, 300)); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5176'}/tools/qa/plant-lab.html${process.env.QUERY || ''}`);
await page.waitForFunction(() => !!window.__lab, null, { timeout: 60000 });
await page.evaluate(() => window.__lab.ready());
SPECIES = await page.evaluate(() => window.__lab.species);
const scenes = what.trim().startsWith('{') ? JSON.parse(what) : Object.assign({}, ...what.split(',').map(standard));
for (const [name, scene] of Object.entries(scenes)) {
  const r = await page.evaluate(s => window.__lab.show(s), scene);
  if (process.env.WIND) {
    for (let i = 0; i < 4; i++) {
      await page.evaluate(t => window.__lab.frame(t), (scene.time ?? 0) + i * Number(process.env.WIND) / 4);
      await page.screenshot({ path: `${out}/${name}-w${i}.png` });
    }
  } else await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name.padEnd(22), 'draws', r.drawCalls, 'tris', r.triangles);
}
await browser.close();
