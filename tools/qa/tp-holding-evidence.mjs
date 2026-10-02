// Own-game world holds, two close cameras per state, plus real skinned contact.
// BASE=http://127.0.0.1:5191 node tools/qa/tp-holding-evidence.mjs OUT [weapons csv]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measureGrip } from './grip-measure.mjs';
import { installThirdPersonGripProbe } from './tp-grip-adapter.mjs';
import { reloadKeys } from './holding-states.mjs';
import { worldTriggerIndices } from './world-trigger.mjs';
import { TRIGGER_FACE, triggerInGuard } from './trigger-guard.mjs';

const [out, list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete'] = process.argv.slice(2);
if (!out) throw new Error('Supply an output directory');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const report = { viewport: { width: 1470, height: 956 }, states: {}, measurements: {} };
const reloads = { pistol: 1.8, revolver: 2.3, smg: 2, m4: 2.5, shotgun: .55, dmr: 2.6, sniper: 3, coco: 2.8 };
try {
  const page = await browser.newPage({ viewport: report.viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const weapon of list.split(',')) {
    const triggerIndices = await worldTriggerIndices(weapon);
    await page.goto(`${process.env.BASE || 'http://127.0.0.1:5191'}/tools/blender/review.html?clean&graphics=medium&weapon=${weapon}&x=84&z=-58`);
    await page.waitForFunction(() => window.capyReview?.ready, null, { timeout: 120000 });
    const states = [
      ['idle', 'idle', .6], ['aimed', 'idle', .6], ['walk', 'walk', .6], ['strafe', 'strafe_l', .6],
      ['sprint', 'run', .6], ['crouch', 'crouch', .3], ['jump', 'jump', .2], ['land', 'idle', .1], ['fire', 'idle', .08],
      ...(weapon === 'machete' ? [['slash', 'idle', .12], ['chop', 'idle', .16]] :
        ['reload', 'reload-partial'].flatMap(action => [...new Set([.15, .35, .55, .75, .9, ...reloadKeys(weapon, action === 'reload').map(key => key.t)])]
          .sort((a, b) => a - b).map(t => [`${action}-${t}`, action, t * reloads[weapon]]))),
    ].filter(([name]) => !process.env.STATES || process.env.STATES.split(',').includes(name));
    report.states[weapon] = states;
    report.measurements[weapon] = [];
    for (const [name, clip, seconds] of states) {
      await page.evaluate(({ weapon, name, clip, seconds, duration }) => {
        const r = window.capyReview, view = r.renderer, a = r.actor;
        // Recreate each avatar to reset mixer, stance and cached pose state.
        view.avatars.prepare([]); view.avatars.prepare([a]);
        const fresh = view.avatars.get(a.id);
        // capyReview retains its original avatar handle, so use the renderer's
        // fresh avatar for measurements and render it through the real update.
        r.contactAvatar = fresh;
        a.weapons = [{ id: weapon, ammo: 10, reserve: 60, rarity: 0, box: 0 }]; a.slot = 0;
        a.alive = a.grounded = true; a.crouch = a.sprint = a.ads = a.swimming = false;
        a.velocity = { x: 0, y: 0, z: 0 }; a.reloadUntil = 0; a.shotSeq = 0;
        a.emote = null; a.emoteUntil = 0;
        const update = time => view.avatars.update(r.frame, 0, time);
        let time = 20; r.frame.dt = 1 / 60;
        for (let i = 0; i < 90; i++) { r.frame.snapshot.time = time += 1 / 60; update(time); }
        if (name === 'land') {
          a.grounded = false; a.velocity.y = -5;
          for (let i = 0; i < 18; i++) { r.frame.snapshot.time = time += 1 / 60; update(time); }
          a.grounded = true; a.velocity.y = 0;
        }
        a.ads = name === 'aimed'; a.sprint = clip === 'run'; a.crouch = clip === 'crouch';
        a.velocity.z = clip === 'walk' ? -3.9 : clip === 'run' ? -6.4 : 0;
        a.velocity.x = clip === 'strafe_l' ? -3.9 : 0;
        if (clip === 'jump') { a.grounded = false; a.velocity.y = 4; }
        if (name === 'fire') a.shotSeq++;
        if (name === 'slash' || name === 'chop') {
          for (let i = 0; i < (name === 'chop' ? 3 : 1); i++) view.avatars.attack(a.id);
        }
        if (clip.startsWith('reload')) { a.weapons[0].ammo = clip === 'reload' ? 0 : 3; a.reloadUntil = time + duration; }
        for (let remaining = seconds; remaining > 1e-8;) {
          const dt = Math.min(1 / 60, remaining); remaining -= dt; time += dt;
          r.frame.dt = dt; r.frame.snapshot.time = time; update(time);
        }
        fresh.label.visible = false;
        r.frame.dt = 0; view.scene.updateMatrixWorld(true);
        r.avatar = fresh;
      }, { weapon, name, clip, seconds, duration: reloads[weapon] ?? 0 });
      const adapter = await page.evaluate(installThirdPersonGripProbe, { weaponId: weapon, triggerIndices });
      const row = { state: name, seconds, adapter };
      for (const side of ['R', 'L']) row[side] = await page.evaluate(measureGrip, [weapon, side]);
      if (weapon === 'pistol' || weapon === 'revolver') row.pair = await page.evaluate(measureGrip, [weapon, 'L', true]);
      if (!name.startsWith('reload') && name !== 'sprint' && weapon !== 'machete') {
        const contact = await page.evaluate(measureGrip, [weapon, 'R', false, TRIGGER_FACE]);
        row.trigger = { ...contact, insideGuard: triggerInGuard(weapon, contact.digits.index?.tip, adapter.scale[0]) };
      }
      report.measurements[weapon].push(row);
      if (process.env.MEASURE_ONLY !== '1') for (const side of ['right', 'left']) {
        await page.evaluate(side => {
          const r = window.capyReview, view = r.renderer, V3 = r.avatar.weapon.position.constructor;
          const target = new V3(0, -.025, -.10).applyMatrix4(r.avatar.weapon.matrixWorld);
          const offset = new V3(side === 'right' ? .78 : -.78, .20, -.14);
          view.camera.position.copy(target).add(offset); view.camera.lookAt(target); view.camera.fov = 48; view.camera.updateProjectionMatrix();
          view.pipeline.render(view.scene, view.camera, { drawCalls: 0, triangles: 0 });
        }, side);
        await page.screenshot({ path: `${out}/${weapon}-${name}-${side}.png` });
      }
      console.log(weapon, name, 'R', row.R.worst, 'L', row.L.worst, 'world mm');
    }
    writeFileSync(`${out}/measurements.json`, JSON.stringify(report, null, 1) + '\n');
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); writeFileSync(`${out}/measurements.json`, JSON.stringify(report, null, 1) + '\n'); }
