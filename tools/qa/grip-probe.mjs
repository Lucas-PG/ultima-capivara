// Measures how a first-person paw holds its gun on the live rig: per digit
// segment, the signed distance from the paw surface to the gun (negative =
// inside the gun), plus where each digit sits around the bore. Optional close-up
// and x-ray renders centred on the paw.
// node tools/qa/grip-probe.mjs <outDir|-> <weapon> [side L|R] ['<json: {name: override}>'] [views csv] [fp|ads]
// Views: eye, near, far, below, front, top, back (plus x-ray variants with an "x" prefix, e.g. xnear).
import { chromium } from '@playwright/test';
import { measure } from './weapon-contact.mjs';
const [out, weapon, side = 'L', variantsJson = '{"current":{}}', viewList = '', mode = 'fp'] = process.argv.slice(2);
const variants = JSON.parse(variantsJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });


const views = { near: [-Math.PI / 2 + .25, .15, .26], far: [Math.PI / 2 + .25, .2, .26], below: [.2, -1.1, .26], front: [Math.PI + .2, .05, .3],
  top: [.3, 1.25, .28], back: [.35, .25, .3] };
for (const [name, override] of Object.entries(variants)) {
  await page.evaluate(([w, o]) => { window.__vmTune = { [w]: o }; window.__vmOrbit = undefined; }, [weapon, override]);
  await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
  const result = await page.evaluate(measure, [weapon, side]);
  console.log(JSON.stringify({ variant: name, worst: result.worst, bore: result.bore, digits: result.digits }));
  console.log(Object.entries(result.summary).map(([k, v]) => `${k}:${v.min}${v.inside ? `(${v.inside}/${v.n} in @${v.at})` : ''}`).join('  '));
  if (out === '-' || !viewList) continue;
  for (const view of viewList.split(',')) {
    const xray = view.startsWith('x') && view !== 'eye', key = xray ? view.slice(1) : view;
    await page.evaluate(([v, target, xray, w]) => {
      window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target } : undefined;
      window.__vmProbe.models[w].group.traverse(o => {
        if (!o.isMesh) return;
        o.material.userData.xray ??= { transparent: o.material.transparent, opacity: o.material.opacity, depthWrite: o.material.depthWrite };
        const r = o.material.userData.xray;
        o.material.transparent = xray || r.transparent; o.material.opacity = xray ? .28 : r.opacity; o.material.depthWrite = xray ? false : r.depthWrite;
        o.material.needsUpdate = true;
      });
    }, [views[key] ?? null, result.centroid, xray, weapon]);
    await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/${weapon}-${name}-${view}.png` });
  }
}
await browser.close();
