// Fits a first-person paw grip to an explicit intent on the live rig (VITE_QA=1 dev server).
// The cost adds skin penetration into the gun, contact gaps per digit, where each
// digit sits around the bore, the paw's place along the gun and the wrist bend
// against the forearm. Pattern search from a start grip; prints the fitted spec.
// Batch: node tools/qa/grip-fit.mjs --batch <jobs.json> (one browser, sequential fits).
// Add --watch to append jobs between reviews; replace the queue with null to close Chrome.
// Jobs may include tune (live view spec), capture (output directory) and views (named orbit triples).
// node tools/qa/grip-fit.mjs <weapon> '<intent json>' ['<start grip json>'] [--evals N] [--fp|--ads]
// Intent (degrees around the bore: 0 right, 90 top, 180 left, 270 bottom; ranges may wrap):
//   { "side": "L", "zone": [zMin, zMax], "digits": { "index": { "tip": [a, b], "base": [a, b], "along": 80, "weight": 1 }, ... },
//     "part": "mag", "partOffset": [0, .15, 0],
//     "axisOrigin": [x, y, z], // Optional grip axis, e.g. the pump below the barrel.
//     "axis": [x, y, z], // Direction of that member (default the bore, -z); a pistol grip runs down.
//     "contactParts": { "thumb": "mag" }, "palmFacing": [x, y, z, maxDegrees, weight],
//     "forwardFacing": [x, y, z, maxDegrees, weight],
//     "palm": [a, b], "thumbAlong": deg, "wristBend": deg, "contact": ["palm", "index", ...],
//     "wristLimits": { "flexion": [ext, flex], "deviation": [ulnar, radial], "pronation": [sup, pron], "weight": 1 }, // degrees
//     "shoulders": { "R": [x, y, z], "L": [x, y, z] }, // hidden shoulders (camera space) for the fit
//     "hiddenArm": 20, // weight: the elbow and upper arm must stay out of view
//     "withPaw": true, // the other paw is a solid too; "contactParts": { "index": "paw" } asks a digit to touch it
//     "curlBounds": { "index": [[min, max], [min, max], [min, max]], "spread": [min, max] },
//     "rotateAtPalm": true } // Keeps the palm centre steady during orientation steps.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { measure } from './weapon-contact.mjs';
import { fitGrip } from './grip-fit-core.mjs';
import { installGripSearch } from './grip-search.mjs';
import { measureGrip } from './grip-measure.mjs';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const batchFile = flag('--batch');
const watch = args.includes('--watch');
const evals = +(flag('--evals') ?? 1500);
const mode = args.includes('--ads') ? 'ads' : 'fp';
const [weapon, intentJson, startJson] = args.filter(a => !a.startsWith('--'));
const jobs = batchFile ? JSON.parse(await readFile(batchFile, 'utf8')) : [{ weapon, intent: JSON.parse(intentJson), start: startJson ? JSON.parse(startJson) : undefined }];
async function* queuedJobs() {
  let index = 0, waiting = false;
  for (;;) {
    const queue = watch && batchFile ? JSON.parse(await readFile(batchFile, 'utf8')) : jobs;
    if (!queue) return;
    if (index < queue.length) { waiting = false; yield queue[index++]; continue; }
    if (!watch) return;
    if (!waiting) { console.log('Waiting for another grip job'); waiting = true; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'log') console.log(m.text()); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
try {
  for await (const job of queuedJobs()) {
    const { weapon, intent } = job;
    console.log(`job ${job.name ?? weapon}`);
    await page.evaluate(([w, tune]) => { window.__vmTune = tune ? { [w]: tune } : undefined; }, [weapon, job.tune]);
    await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
    if (intent.motion) await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [weapon, ...intent.motion]);
    await page.evaluate(measureGrip, [weapon, intent.side]);
    await page.evaluate(installGripSearch);

    const result = await page.evaluate(fitGrip, [weapon, intent, job.start ?? (await page.evaluate(([w, s]) => window.__vmProbe.models[w].grips[s], [weapon, intent.side])), job.evals ?? evals]);

    const round = v => Array.isArray(v) ? v.map(round) : typeof v === 'number' ? +v.toFixed(6) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
    console.log('initial', JSON.stringify({ cost: +result.initial.cost.toFixed(2), terms: result.initial.terms, where: result.initial.where }));
    console.log('final  ', JSON.stringify({ cost: +result.final.cost.toFixed(2), terms: result.final.terms, where: result.final.where }), `evals ${result.evals}`);
    console.log('mins   ', JSON.stringify(result.final.mins));
    console.log('grip   ', JSON.stringify(round(result.final.grip)));
    if (job.output) await writeFile(job.output, JSON.stringify(result, null, 2) + '\n');
    if (job.capture && !intent.part) {
      await mkdir(job.capture, { recursive: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
      const tune = { ...job.tune, grips: { ...job.tune?.grips, [intent.side]: result.final.grip } };
      await page.evaluate(([w, tune]) => { window.__vmTune = { [w]: tune }; window.__vmOrbit = undefined; }, [weapon, tune]);
      await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
      const contact = await page.evaluate(measure, [weapon, intent.side]);
      await writeFile(`${job.capture}/${job.name ?? weapon}-probe.json`, JSON.stringify(contact, null, 2) + '\n');
      for (const [name, view] of Object.entries(job.views ?? { eye: null, near: [-Math.PI / 2 + .25, .15, .26], below: [.2, -1.1, .26], top: [.3, 1.25, .28] })) {
        await page.evaluate(([v, target]) => { window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target } : undefined; }, [view, contact.centroid]);
        await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
        await page.screenshot({ path: `${job.capture}/${job.name ?? weapon}-${name}.png` });
      }
      await page.evaluate(() => { window.__vmOrbit = undefined; });
    }
  }
} finally { await browser.close(); }
