// Headless live-match driver for playtests and captures (needs a VITE_QA=1 dev server).
// node tools/qa/play.mjs <outDir> <mode> '<steps json>'
// Steps: ["wait",s] ["key","KeyW",s?] ["tap","Digit3"] ["look",yaw,pitch] ["fire",n] ["shot","name"] ["eval","js"]
import { chromium } from '@playwright/test';
const [out, mode = 'deathmatch', stepsJson = '[]'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?networkQa=1&calm`);
await page.locator(`[data-mode="${mode}"]`).click();
await page.locator('[data-do="practice"]').click();
await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot && !s.renderState.loading; }, null, { timeout: 90000 });
await page.evaluate(() => { window.__networkQA.activate(); window.__networkQA.key('KeyH', true); window.__networkQA.key('KeyH', false); });
const me = () => page.evaluate(() => { const i = window.__capivara.inspect(); const a = i.snapshot.actors.find(x => !x.bot); return { hp: a.hp, alive: a.alive, slot: a.slot, weapons: a.weapons.map(w => `${w.box}:${w.id}:${w.ammo}/${w.reserve}`), pos: a.pos, kills: a.kills }; });
for (const step of steps) {
  const [kind, a, b] = step;
  if (kind === 'wait') await page.waitForTimeout(a * 1000);
  else if (kind === 'key') { await page.evaluate(c => window.__networkQA.key(c, true), a); await page.waitForTimeout((b ?? .1) * 1000); await page.evaluate(c => window.__networkQA.key(c, false), a); }
  else if (kind === 'tap') { await page.evaluate(c => { window.__networkQA.key(c, true); window.__networkQA.key(c, false); }, a); }
  else if (kind === 'look') await page.evaluate(([y, p]) => window.__networkQA.look(y, p), [a, b]);
  else if (kind === 'fire') for (let i = 0; i < a; i++) { await page.evaluate(() => window.__networkQA.fire()); await page.waitForTimeout(90); }
  else if (kind === 'shot') await page.screenshot({ path: `${out}/${a}.png` });
  else if (kind === 'me') console.log(a || 'me', JSON.stringify(await me()));
  else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(a)));
}
await browser.close();
