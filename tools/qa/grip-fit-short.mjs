// Single-fit CLI over grip-solver.mjs, used for the short guns. The batch job
// runner with capture views and digit/facing intents is tools/qa/grip-fit.mjs.
// Fits a first-person paw grip to an explicit intent on the live rig (VITE_QA=1 dev server).
// The cost adds skin penetration into the gun, contact gaps per digit, where each
// digit sits around the bore, the paw's place along the gun and the wrist bend
// against the forearm. Pattern search from a start grip; prints the fitted spec.
// node tools/qa/grip-fit.mjs <weapon> '<intent json>' ['<start grip json>'] [--evals N] [--fp|--ads]
// Intent (degrees around the bore: 0 right, 90 top, 180 left, 270 bottom; ranges may wrap):
//   { "side": "L", "zone": [zMin, zMax], "digits": { "index": { "tip": [a, b], "base": [a, b] }, ... },
//     "stride": 1, "maxSeconds": 300, // optional coarse search and time budget
//     "palm": [a, b], "thumbAlong": deg, "wristBend": deg, "contact": ["palm", "index", ...], "free": ["thumb"] }
import { fitGrip } from './grip-solver.mjs';
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const evals = +(flag('--evals') ?? 1500);
const mode = args.includes('--ads') ? 'ads' : 'fp';
const [weapon, intentJson, startJson] = args.filter(a => !a.startsWith('--'));
const intent = JSON.parse(intentJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'log') console.log(m.text()); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
if (intent.tune) await page.evaluate(([w, tune]) => { window.__vmTune = { [w]: tune }; }, [weapon, intent.tune]);
await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
if (intent.motion) await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [weapon, intent.motion.action, intent.motion.seconds]);

const result = await page.evaluate(fitGrip, [weapon, intent, JSON.parse(startJson ?? 'null') ?? (await page.evaluate(([w, s]) => window.__vmProbe.models[w].grips[s], [weapon, intent.side])), evals]);

const round = v => Array.isArray(v) ? v.map(round) : typeof v === 'number' ? +v.toFixed(5) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
console.log('initial', JSON.stringify({ cost: +result.initial.cost.toFixed(2), terms: result.initial.terms, where: result.initial.where }));
console.log('final  ', JSON.stringify({ cost: +result.final.cost.toFixed(2), terms: result.final.terms, where: result.final.where }), `evals ${result.evals}`);
console.log('mins   ', JSON.stringify(result.final.mins));
console.log('grip   ', JSON.stringify(round(result.final.grip)));
if (result.handKey) console.log('handkey', JSON.stringify(round(result.handKey)));
await browser.close();
