// Raw first-person evidence captures for the viewmodel framing pass: every weapon at the hip,
// aimed, sprinting, walking, firing, in its reload key frames and its inspect, plus the hip grip
// from both sides, with the game HUD on. Same states and times every run, so a "before" set and an
// "after" set compare from the same cameras.
// node tools/qa/vm-evidence.mjs <outDir> [weapons csv] [sizes csv, e.g. 1280x720,1470x956]   (BASE env overrides the URL)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { poseHoldingState } from './fp-state.mjs';
import { holdingStates } from './holding-states.mjs';
const [out, list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', sizes = '1280x720,1470x956'] = process.argv.slice(2);
if (!out) throw new Error('Give an output directory.');
// [id, label, action, seconds]; reload keys follow each weapon's own choreography.
const RELOAD_KEYS = {
  pistol: [['reload-a', 'reload empty', 'reload', .35], ['reload-b', 'reload empty', 'reload', 1.05], ['reload-c', 'slide release', 'reload', 1.47], ['reload-d', 'tactical', 'reload-partial', .6]],
  smg: [['reload-a', 'reload empty', 'reload', .45], ['reload-b', 'reload empty', 'reload', 1.25], ['reload-c', 'charging handle', 'reload', 1.66], ['reload-d', 'tactical', 'reload-partial', .7]],
  revolver: [['reload-a', 'crane', 'reload', .42], ['reload-b', 'ejector', 'reload', .74], ['reload-c', 'speedloader', 'reload', 1.45], ['reload-d', 'close', 'reload', 1.95]],
  m4: [['reload-a', 'reload empty', 'reload', .45], ['reload-b', 'reload empty', 'reload', 1.2], ['reload-c', 'reload seat', 'reload', 1.92], ['reload-d', 'bolt catch', 'reload', 2.15]],
  shotgun: [['reload-a', 'fire pump', 'fire', .35], ['reload-b', 'shell', 'reload', .15], ['reload-c', 'shell', 'reload', .3], ['reload-d', 'shell push', 'reload', .4]],
  dmr: [['reload-a', 'reload empty', 'reload', .45], ['reload-b', 'reload empty', 'reload', 1.3], ['reload-c', 'charge', 'reload', 2.25], ['reload-d', 'tactical', 'reload-partial', 1.0]],
  sniper: [['reload-a', 'fire bolt', 'fire', .75], ['reload-b', 'reload bolt', 'reload', .45], ['reload-c', 'reload mag', 'reload', 1.6], ['reload-d', 'bolt home', 'reload', 2.75]],
  coco: [['reload-a', 'coco lift', 'reload', .3], ['reload-b', 'coco drop', 'reload', .45], ['reload-c', 'pump', 'reload', 1.8], ['reload-d', 'coco top up', 'reload', 2.2]],
  machete: [['reload-a', 'slash', 'swing-right', .12], ['reload-b', 'slash', 'swing-left', .14], ['reload-c', 'chop', 'chop', .1], ['reload-d', 'chop', 'chop', .2]],
};
const states = weapon => [
  ['hip', 'hip', 'pose'], ['aimed', 'aimed', 'pose-ads'], ['sprint', 'sprint', 'sprint', .6], ['walk', 'walk', 'walk', .9],
  ['strafe', 'strafe left', 'strafe', .5], ['crouch', 'crouch dip', 'crouch', .12], ['jump', 'jump', 'jump', .15], ['land', 'land', 'land', .08],
  ['aim-blend', 'aim blend', 'ads', .15],
  ['holster', 'holster', 'equip', .06], ['draw', 'draw', 'draw', .2],
  ...(weapon === 'machete' ? [] : [['fire', 'fire', 'fire', .05]]),
  ...RELOAD_KEYS[weapon], ['inspect-a', 'inspect', 'inspect', .55], ['inspect-b', 'inspect', 'inspect', 1.3],
  ['side-right', 'hip right side', 'orbit', Math.PI / 2], ['side-left', 'hip left side', 'orbit', -Math.PI / 2],
  ...(process.env.ALL_KEYS ? holdingStates(weapon).filter(s => s.key).map(s => [`key-${s.action}-${s.t.toFixed(6)}`, `${s.action} key`, s.action, s.t]) : []),
];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const index = {};
try {
  for (const size of sizes.split(',')) {
    const [width, height] = size.split('x').map(Number);
    const dir = `${out}/${size}`; mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', e => console.error('pageerror', e.message));
    await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
    await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
    await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
    await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
    if (process.env.TUNE) await page.evaluate(tune => { window.__vmTune = tune; }, JSON.parse(readFileSync(process.env.TUNE, 'utf8')));
    await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
    for (const weapon of list.split(',')) {
      for (const [id, label, action, t] of states(weapon).filter(([id]) => !process.env.ONLY || process.env.ONLY.split(',').includes(id))) {
        await page.evaluate(() => { window.__vmOrbit = undefined; window.__vmActor = undefined; });
        if (action === 'pose') await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
        else if (action === 'pose-ads') await page.evaluate(w => window.__capyQA.pose(`ads-${w}`), weapon);
        else if (action === 'orbit') {
          await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
          await page.addStyleTag({ content: '#app{visibility:hidden}' });
          await page.evaluate(yaw => {
            const p = window.__vmProbe.holder.position;
            window.__vmOrbit = { yaw, pitch: .15, distance: .7, target: [p.x - .02, p.y - .04, p.z + .1] };
          }, t);
          await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
        } else if (action === 'jump') {
          await poseHoldingState(page, weapon, action, t);
        } else if (action === 'walk') {
          // Walking forward at 4.5 m/s: the motion fixture's sprint action, with the viewmodel told it walks.
          await page.evaluate(() => { window.__vmActor = a => ({ sprint: false, velocity: { x: -Math.sin(a.yaw) * 4.5, y: 0, z: -Math.cos(a.yaw) * 4.5 } }); });
          await page.evaluate(([w, s]) => window.__capyQA.motion(w, 'sprint', s), [weapon, t]);
        } else if (action === 'strafe') {
          // Strafing left at 4.5 m/s.
          await page.evaluate(() => { window.__vmActor = a => ({ sprint: false, velocity: { x: -Math.cos(a.yaw) * 4.5, y: 0, z: Math.sin(a.yaw) * 4.5 } }); });
          await page.evaluate(([w, s]) => window.__capyQA.motion(w, 'sprint', s), [weapon, t]);
        } else if (action === 'crouch') {
          // The fixture settles for 30 frames at one time, then plays the action: standing still, crouched from then on.
          await page.evaluate(() => {
            const st = { prev: -1, start: Infinity, run: 0 };
            window.__vmActor = (a, time) => { st.run = time === st.prev ? st.run + 1 : 0; if (st.run >= 28) st.start = time; st.prev = time;
              return { crouch: time > st.start, sprint: false, velocity: { x: 0, y: 0, z: 0 } }; };
          });
          await page.evaluate(([w, s]) => window.__capyQA.motion(w, 'sprint', s), [weapon, t]);
        } else if (action === 'draw') {
          // The viewmodel holds another gun until the fixture's action starts, then this one: its own draw.
          await page.evaluate(w => {
            const st = { prev: -1, start: Infinity, run: 0 };
            // The fixture's settle is a run of 30 frames at one time (the pose before it has shorter runs).
            window.__vmActor = (a, time) => { st.run = time === st.prev ? st.run + 1 : 0; if (st.run >= 28) st.start = time; st.prev = time;
              const still = { sprint: false, velocity: { x: 0, y: 0, z: 0 } };
              return time > st.start ? still : { ...still, slot: 0, weapons: [{ id: w === 'pistol' ? 'm4' : 'pistol', rarity: 0, ammo: 12, reserve: 30, box: 0 }] }; };
          }, weapon);
          await page.evaluate(([w, s]) => window.__capyQA.motion(w, 'sprint', s), [weapon, t]);
        } else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
        await page.waitForTimeout(60);
        const file = `${dir}/${weapon}-${id}.png`;
        await page.screenshot({ path: file });
        if (action === 'orbit') await page.addStyleTag({ content: '#app{visibility:visible}' });
        (index[weapon] ??= []).some(s => s.id === id) || index[weapon].push({ id, label: t === undefined || action === 'orbit' ? label : `${label} ${t}s` });
      }
      console.log(size, weapon);
    }
    await page.close();
  }
} finally {
  await browser.close();
  // A partial run (ONLY=...) merges its states into an existing index, in the full list's order.
  let merged = index;
  try {
    const previous = JSON.parse(readFileSync(`${out}/index.json`, 'utf8'));
    merged = Object.fromEntries(Object.keys({ ...previous, ...index }).map(w => [w, states(w).map(([id]) =>
      index[w]?.find(s => s.id === id) ?? previous[w]?.find(s => s.id === id)).filter(Boolean)]));
  } catch { /* first run */ }
  writeFileSync(`${out}/index.json`, JSON.stringify(merged, null, 1) + '\n');
}
