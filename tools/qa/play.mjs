// Headless live-match driver for playtests and captures (needs a VITE_QA=1 dev server).
// node tools/qa/play.mjs <outDir> <mode> '<steps json>'
// Steps: ["wait",s] ["key","KeyW",s?] ["tap","Digit3"] ["look",yaw,pitch] ["fire",n] ["shot","name"] ["eval","js"] ["hunt",s,every] ["defend",s,every,ads?]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [out, mode = 'deathmatch', stepsJson = '[]'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch(process.env.BUNDLED ? {} : { channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
mkdirSync(out, { recursive: true });
const size = { width: Math.min(1280, Number(process.env.W || 1280)), height: Math.min(720, Number(process.env.H || 720)) };
const page = await browser.newPage({ viewport: size, ...(process.env.VIDEO ? { recordVideo: { dir: process.env.VIDEO, size } } : {}) });
try {
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?networkQa=1&calm${process.env.QUERY || ''}`);
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
  else if (kind === 'look') await page.evaluate(([y, p]) => { window.__qaYaw = y; window.__qaPitch = p; window.__networkQA.look(y, p); }, [a, b]);
  else if (kind === 'down' || kind === 'up') await page.evaluate(([c, d]) => window.__networkQA.key(c, d), [a, kind === 'down']);
  else if (kind === 'mdown' || kind === 'mup') await page.evaluate(([button, d]) => document.dispatchEvent(new MouseEvent(d ? 'mousedown' : 'mouseup', { button, bubbles: true })), [a, kind === 'mdown']);
  // ["turn", dyaw, seconds, dpitch?]: rotate the view smoothly by dyaw radians.
  else if (kind === 'turn') {
    const n = Math.max(1, Math.round(b * 30));
    for (let i = 0; i < n; i++) { await page.evaluate(([dy, dp]) => { const f = window.__capivara.input?.frame; window.__networkQA.look((window.__qaYaw ??= 0) + dy, (window.__qaPitch ??= 0) + dp); window.__qaYaw += dy; window.__qaPitch += dp; }, [a / n, (step[3] ?? 0) / n]); await page.waitForTimeout(33); }
  }
  else if (kind === 'fire') for (let i = 0; i < a; i++) { await page.evaluate(() => window.__networkQA.fire()); await page.waitForTimeout(90); }
  else if (kind === 'shot') await page.screenshot({ path: `${out}/${a}.png` });
  else if (kind === 'me') console.log(a || 'me', JSON.stringify(await me()));
  else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(a)));
  // ["spectate", maximumSeconds=900, captureEvery=30]: watch a complete match.
  // The QA damage removes only the observer; bots use the ordinary worker clock.
  else if (kind === 'spectate') {
    const samples = [], end = Date.now() + (a ?? 900) * 1000; let next = 0, frame = 0;
    while (Date.now() < end) {
      const sample = await page.evaluate(() => {
        const i = window.__capivara.inspect(), s = i.snapshot, me = s.actors.find(x => !x.bot);
        if (me?.alive && s.time > 4) window.__capivara.qaDamage(me.id, 10000);
        return { time: s.time, phase: s.phase, spectateId: i.spectateId, remaining: s.remaining,
          actors: s.actors.filter(x => x.bot).map(x => ({ id: x.id, pos: x.pos, hp: x.hp, kills: x.kills, deaths: x.deaths,
            swimming: x.swimming, alive: x.alive, weapon: x.weapons[x.slot]?.id })), perf: window.__capivara.perf() };
      });
      samples.push(sample);
      if (Date.now() >= next || sample.phase === 'results') {
        writeFileSync(`${out}/spectate.json`, JSON.stringify(samples) + '\n');
        await page.screenshot({ path: `${out}/spectate-${frame++}.jpg`, quality: 80 });
        console.log('spectate', sample.time.toFixed(1), sample.phase, sample.spectateId, sample.remaining);
        next = Date.now() + (b ?? 30) * 1000;
        if (sample.spectateId && sample.phase !== 'results') await page.evaluate(() => { window.__networkQA.key('Space', true); window.__networkQA.key('Space', false); });
      }
      if (sample.phase === 'results') break;
      await page.waitForTimeout(1000);
    }
    writeFileSync(`${out}/spectate.json`, JSON.stringify(samples) + '\n');
    if (samples.at(-1)?.phase !== 'results') throw new Error('Spectated match did not finish before its time limit');
  }
  // ["defend", seconds, shotEvery, ads?]: stand still, track the nearest living bot (head height), fire bursts when within 35 m.
  else if (kind === 'defend') {
    const end = Date.now() + a * 1000; let next = Date.now() + (b ?? 1e9) * 1000, frame = 0;
    if (step[3]) await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
    while (Date.now() < end) {
      const r = await page.evaluate(() => {
        const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot);
        if (!me?.alive) return { dead: true };
        let best = null, bd = 1e9;
        for (const o of i.remoteActors.length ? i.remoteActors : i.snapshot.actors) {
          const t = i.snapshot.actors.find(x => x.id === o.id);
          if (!t || !t.bot || !t.alive) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return { none: true };
        const dx = best.pos.x - me.pos.x, dz = best.pos.z - me.pos.z, dy = best.pos.y + 1.2 - (me.pos.y + 1.62);
        window.__networkQA.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        if (bd < 35) window.__networkQA.fire();
        return { d: Math.round(bd) };
      });
      if (Date.now() >= next) { await page.screenshot({ path: `${out}/defend-${frame++}.png` }); next += b * 1000; }
      await page.waitForTimeout(70);
      if (r.none || r.dead) await page.waitForTimeout(300);
    }
    if (step[3]) await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })));
    console.log('defend', JSON.stringify(await me()));
  }
  // ["hunt", seconds, shotEvery]: aim at the nearest living bot, close in, fire; screenshot every shotEvery s.
  else if (kind === 'hunt') {
    const end = Date.now() + a * 1000; let next = Date.now() + (b ?? 1e9) * 1000, frame = 0;
    while (Date.now() < end) {
      const r = await page.evaluate(() => {
        const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot);
        if (!me?.alive) { window.__networkQA.key('KeyW', false); return { dead: true }; }
        const eye = me.pos.y + 1.55;
        let best = null, bd = 1e9;
        for (const o of i.remoteActors.length ? i.remoteActors : i.snapshot.actors) {
          const t = i.snapshot.actors.find(x => x.id === o.id);
          if (!t || !t.bot || !t.alive) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return { none: true };
        const dx = best.pos.x - me.pos.x, dz = best.pos.z - me.pos.z, dy = best.pos.y + 1.0 - eye;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        window.__networkQA.look(yaw, pitch);
        window.__networkQA.key('KeyW', bd > 9);
        if (bd < 45) window.__networkQA.fire();
        return { d: Math.round(bd), hp: Math.round(me.hp), kills: me.kills, deaths: me.deaths };
      });
      if (Date.now() >= next) { await page.screenshot({ path: `${out}/hunt-${frame++}.png` }); next += b * 1000; }
      await page.waitForTimeout(80);
      if (r.none) await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.__networkQA.key('KeyW', false));
    console.log('hunt', JSON.stringify(await me()));
  }
}
await page.close();
if (process.env.VIDEO) console.log('video', await page.video()?.path());
} finally { await browser.close(); }
