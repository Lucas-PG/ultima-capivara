// One real Chrome instance for iterative weapon QA. JSON commands arrive on stdin.
// BASE=... node tools/qa/weapon-session.mjs
// {op:'fit', weapon, intent, start?, startLive?, evals?, out?}; {op:'pose'|'probe', weapon,
// action:'hip'|'ads'|'reload'|'reload-partial'|'inspect'|'sprint'|'fire', seconds?, tune?, out?, views?}; {op:'close'}
// For world review, use tp:true with a tpMotion action, or pose:'world-<id>'.
// camera:[x,y,z,targetX,targetY,targetZ,fov] frames either from a free camera.
// pair:true also measures skin clearance between the paws. contactParts:{palm:'paw'}
// fits a support cup against the currently posed firing paw as well as the gun.
import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.text().startsWith('fit-progress')) console.log(m.text()); });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5178'}/?qa=1`);
async function ready() {
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(() => window.__capyQA.start());
  await page.evaluate(() => window.__capyQA.quality('medium'));
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
}
await ready(); console.log('WEAPON SESSION READY');
// Avoid a PTY's canonical line-length limit for complete grip overrides.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin, terminal: false });
try {
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line);
      if (c.op === 'close') break;
      const { fitGrip } = await import(`./grip-solver.mjs?${Date.now()}`);
      const { measureGrip } = await import(`./grip-measure.mjs?${Date.now()}`);
      await ready();
      await page.evaluate(([w, tune]) => { window.__vmOrbit = undefined; window.__camOverride = undefined; window.__vmTune = { [w]: tune ?? {} }; }, [c.weapon, c.tune]);
      const action = c.action ?? 'hip', motion = c.intent?.motion;
      if (c.tp) await page.evaluate(([w, a, t]) => window.__capyQA.tpMotion(w, a, t), [c.weapon, action, c.seconds ?? 0]);
      else if (c.pose) await page.evaluate(name => window.__capyQA.pose(name), c.pose);
      else if (motion) await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [c.weapon, motion.action, motion.seconds]);
      else if (['hip', 'ads'].includes(action)) await page.evaluate(([w, a]) => window.__capyQA.pose(`${a === 'ads' ? 'ads' : 'fp'}-${w}`), [c.weapon, action]);
      else await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [c.weapon, action, c.seconds ?? 0]);
      if (c.camera) await page.evaluate(camera => { window.__camOverride = camera; window.__capyQA.quality('medium'); }, c.camera);
      let result;
      if (c.op === 'fit') {
        const start = c.start ?? await page.evaluate(([w, side, live]) => {
          const vm = window.__vmProbe, grip = vm.models[w].grips[side];
          if (!live) return grip;
          const target = vm[`target${side}`], inverse = vm.holder.matrixWorld.clone().invert();
          const rotation = vm.holder.quaternion.clone().invert();
          return { ...grip, wrist: target.wrist.clone().applyMatrix4(inverse).toArray(),
            forward: target.forward.clone().applyQuaternion(rotation).toArray(),
            palm: target.palm.clone().applyQuaternion(rotation).toArray(), curl: target.curl, pole: target.pole.toArray() };
        }, [c.weapon, c.intent.side, c.startLive]);
        result = await page.evaluate(fitGrip, [c.weapon, c.intent, start, c.evals ?? 1000]);
        console.log('FIT', JSON.stringify({ evals: result.evals, ...result.final, handKey: result.handKey }));
      } else {
        result = {};
        if (c.op === 'probe') for (const side of ['R', 'L']) {
          result[side] = await page.evaluate(measureGrip, [c.weapon, side]);
          console.log('CLEARANCE', c.weapon, action, c.seconds ?? 0, side, result[side].worst);
        }
        if (c.pair) {
          result.pair = {};
          for (const side of ['R', 'L']) {
            result.pair[side] = await page.evaluate(measureGrip, [c.weapon, side, true]);
            console.log('PAW CONTACT', side, result.pair[side].worst);
          }
        }
        if (c.out) for (const view of c.views ?? ['eye']) {
          await page.evaluate(v => {
            const vm = window.__vmProbe, V = vm.holder.position.constructor;
            const target = vm.holder.localToWorld(new V(0, -.02, -.04));
            const views = { right: [Math.PI / 2, .18, .53], left: [-Math.PI / 2, .18, .53], top: [.15, 1.3, .53], close: [-Math.PI / 2, .2, .28] };
            const o = views[v]; window.__vmOrbit = o ? { target: target.toArray(), yaw: o[0], pitch: o[1], distance: o[2] } : undefined;
            window.__capyQA.quality('medium');
          }, view);
          await mkdir(dirname(c.out), { recursive: true });
          await page.screenshot({ path: `${c.out}-${view}.png` });
        }
      }
      if (c.out) { await mkdir(dirname(c.out), { recursive: true }); await writeFile(`${c.out}.json`, JSON.stringify(result, null, 2) + '\n'); }
      console.log('DONE', c.op, c.weapon, c.out ?? '');
    } catch (error) { console.error('COMMAND ERROR', error.stack); }
  }
} finally { await browser.close(); input.close(); if (process.stdin.isTTY) process.stdin.setRawMode(false); }
