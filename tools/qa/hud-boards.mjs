// HUD state boards: every in-match HUD state in a busy moment, through the real GameUI update and event paths
// (QA build, window.__hudQA), at the sizes the player uses, composed into one labelled board per size.
// node tools/qa/hud-boards.mjs <outDir> [prefix]   (BASE, SIZES=1280x720,1470x956, STATES=a,b to narrow, SINGLES=1 keeps each shot,
// SETTINGS='{"hitPalette":"colorblind","reducedMotion":true}' merges saved settings)
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [out, prefix = 'board'] = process.argv.slice(2);
if (!out) throw new Error('Give an output directory.');
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5173';
const sizes = (process.env.SIZES || '1280x720,1470x956').split(',').map(s => s.split('x').map(Number));
const PROMPT = { id: 'hud-review-loot', name: 'Doze lendária' };
// Each state: a QA pose, then a mutation of the pose's snapshot and the events a match would send.
// Runs in the page with: ui (GameUI), s (snapshot copy), me (local actor), t (snapshot time), at (player position).
const STATES = [
  { name: 'normal', label: 'Partida: vida, colete, armas, munição, mapa', pose: 'hud-full', prompt: true, js: `me.hp = 100; me.armor = 50; me.helmet = 0; me.consumables = { bandage: 2, medkit: 1, guarana: 0, acai: 1, rapadura: 0 };` },
  { name: 'fight-low', label: 'Luta com vida baixa, colete quebrado, acertos', pose: 'hud-full', js: `
    me.hp = 18; me.armor = 0; me.helmet = 0; me.weapons[0].ammo = 4;
    post.push({ type: 'damage', id: 9101, actor: 'bot-hud-2', target: 'practice', amount: 24, head: false, pos: at, armorBreak: true });
    post.push({ type: 'damage', id: 9102, actor: 'bot-hud-9', target: 'practice', amount: 11, head: false, pos: at });
    post.push({ type: 'damage', id: 9103, actor: 'practice', target: 'bot-hud-4', amount: 31, head: true, pos: at });
    post.push({ type: 'damage', id: 9104, actor: 'practice', target: 'bot-hud-4', amount: 18, head: false, pos: at });` },
  { name: 'pickup', label: 'Pegou kit médico (e munição)', pose: 'hud-full', js: `
    me.hp = 54; me.armor = 0; me.consumables = { bandage: 3, medkit: 1, guarana: 2, acai: 1, rapadura: 2 };
    pre.consumables = { bandage: 3, medkit: 0, guarana: 2, acai: 1, rapadura: 2 };
    s.loot.push({ id: 'qa-medkit', kind: 'medkit', rarity: 0, x: at.x, y: at.y, z: at.z, active: false, respawnAt: 0 });
    post.push({ type: 'pickup', id: 9201, actor: 'practice', item: 'qa-medkit' });` },
  { name: 'heal', label: 'Cura em andamento (kit médico)', pose: 'hud-full', js: `
    me.hp = 34; me.armor = 25; me.using = 'medkit'; me.useUntil = t + 2.1; useFrom = t - 2.9;` },
  { name: 'storm', label: 'Na tempestade, refúgio longe', pose: 'hud-full', js: `
    s.zone = { ...s.zone, x: at.x + 120, z: at.z + 40, radius: 60, nextX: at.x + 140, nextZ: at.z + 30, nextRadius: 30, phase: 3, shrinking: true, timeLeft: 14, damage: 4 };
    me.hp = 71;` },
  { name: 'reload-kill', label: 'Recarregando e eliminação confirmada', pose: 'hud-full', js: `
    me.weapons[0].ammo = 0; me.reloadUntil = t + 1.1;
    post.push({ type: 'damage', id: 9301, actor: 'practice', target: 'bot-hud-6', amount: 27, head: false, pos: at });
    post.push({ type: 'kill', id: 9302, actor: 'practice', target: 'bot-hud-6', weapon: 'm4', from: at, distance: 31 });` },
  { name: 'death', label: 'Eliminada: cartão de quem pegou', pose: 'hud-watch', js: `spectate = null;` },
  { name: 'watch', label: 'Assistindo outra capivara', pose: 'hud-watch', js: `watchAgo = 6000;` },
  { name: 'corrente', label: 'Corrente: a escada de armas', pose: 'hud-corrente', js: `` },
  { name: 'respawn', label: 'Correria: caiu, volta em 2 s', pose: 'hud-full', js: `
    s.config.mode = 'deathmatch'; s.remaining = 214; me.alive = false; me.hp = 0; me.deaths = 2; me.respawnAt = t + 2;
    post.push({ type: 'kill', id: 9401, actor: 'bot-hud-3', target: 'practice', weapon: 'shotgun', from: at, distance: 8 });` },
  { name: 'plane', label: 'No avião', pose: 'hud-full', js: `me.stage = 'plane'; me.pos.y = at.y + 120; s.time = 6; me.weapons = [me.weapons[3]]; me.consumables = { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }; me.armor = 0; me.helmet = 0; me.hp = 100;` },
  { name: 'parachute', label: 'Paraquedas', pose: 'hud-full', js: `me.stage = 'parachute'; me.pos.y = at.y + 46; me.weapons = [me.weapons[3]]; me.consumables = { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }; me.armor = 0; me.helmet = 0; me.hp = 100;` },
  { name: 'countdown', label: 'Contagem antes da partida', pose: 'hud-full', js: `s.phase = 'countdown'; s.countdown = 3.2; me.weapons = [me.weapons[3]]; me.consumables = { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }; me.armor = 0; me.helmet = 0; me.hp = 100;` },
  { name: 'coach', label: 'Primeira vez: o treinador', pose: 'hud-full', coach: true, js: `me.hp = 100;` },
  { name: 'delivery', label: 'Entrega do Tucano e aviso', pose: 'hud-full', js: `
    post.push({ type: 'supply', id: 9501, drop: 'supply-9', pos: at, district: 'vila', stage: 'landed' });
    post.push({ type: 'notice', id: 9502, text: 'A tempestade está fechando!' });` },
  { name: 'scope', label: 'Mira de luneta', pose: 'hud-full', js: `me.slot = 1; me.ads = true;` },
].filter(state => !process.env.STATES || process.env.STATES.split(',').includes(state.name));

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const shots = new Map(), footprint = {};
try {
  const page = await browser.newPage({ viewport: { width: sizes[0][0], height: sizes[0][1] } });
  page.on('pageerror', e => { console.error('pageerror', e.message); process.exitCode = 1; });
  await page.addInitScript(extra => { localStorage.setItem('uc-onboarded', '1');
    if (extra) localStorage.setItem('uc-v2-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('uc-v2-settings') || '{}'), ...JSON.parse(extra) })); }, process.env.SETTINGS || '');
  await page.goto(`${base}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA && !!window.__hudQA, null, { timeout: 60000 });
  await page.evaluate(() => { window.__qaStarted = false; window.__capyQA.start().then(() => { window.__qaStarted = true; }); });
  await page.waitForFunction(() => window.__qaStarted, null, { timeout: 120000 });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    for (const state of STATES) {
      await page.evaluate(p => window.__capyQA.pose(p), state.pose);
      await page.evaluate(async ({ js, prompt, coach, pose, scope }) => {
        const ui = window.__hudQA, s = structuredClone(ui.snapshot), me = s.actors.find(a => a.id === 'practice');
        // A fresh HUD per state (as at the start of a match), so nothing transient leaks from the previous shot.
        const heading = ui.heading; ui.game('practice'); ui.scopeReady = scope; document.querySelector('#toast')?.replaceChildren();
        const t = s.time, at = { ...me.pos }, post = [], pre = structuredClone(me);
        let spectate = ui.spectate, watchAgo = 0, useFrom = null;
        document.getAnimations().forEach(a => a.cancel());
        ui.coach = coach ? { step: 'intro', visibleAt: null, startPos: null } : null;
        ui.killConfirmTimer && clearTimeout(ui.killConfirmTimer);
        new Function('ui', 's', 'me', 't', 'at', 'post', 'pre', 'ctx', `with (ctx) { ${js} }`)(ui, s, me, t, at, post, pre, new Proxy({}, {
          has: (_, k) => ['spectate', 'watchAgo', 'useFrom'].includes(k),
          get: (_, k) => ({ spectate, watchAgo, useFrom })[k],
          set: (_, k, v) => { if (k === 'spectate') spectate = v; if (k === 'watchAgo') watchAgo = v; if (k === 'useFrom') useFrom = v; return true; } }));
        const interaction = prompt && me.alive && me.stage === 'ground' ? { id: 'hud-review-loot', name: 'Doze lendária' } : null;
        // A previous frame of the same match, so changes (pickups, heals, damage) read as changes.
        const before = structuredClone(s), bme = before.actors.find(a => a.id === 'practice');
        Object.assign(bme, { consumables: pre.consumables, hp: pre.hp, armor: pre.armor, using: null, useUntil: 0 });
        ui.setSpectate(spectate);
        ui.hudTime = 0; ui.update(before, 'practice', 0, false, 60, interaction);
        // The same busy feed as the QA poses: a shotgun pick, your M4 elimination, a storm loss, a sniper shot.
        const from = { ...at };
        [{ type: 'kill', id: 9001, actor: 'bot-hud-0', target: 'bot-hud-5', weapon: 'shotgun', from, distance: 9 },
          { type: 'kill', id: 9002, actor: 'bot-hud-1', target: 'bot-hud-7', weapon: 'm4', from, distance: 47 },
          { type: 'kill', id: 9003, actor: null, target: 'bot-hud-9', weapon: 'storm' },
          { type: 'kill', id: 9004, actor: 'bot-hud-2', target: pose === 'hud-watch' ? 'practice' : 'bot-hud-11', weapon: 'sniper', from, distance: 112 }].forEach(e => ui.event(e));
        if (useFrom !== null) { ui.hudTime = 0; const early = structuredClone(s); early.time = useFrom + .01; early.actors.find(a => a.id === 'practice').useUntil = me.useUntil; ui.update(early, 'practice', 0, false, 60, interaction); }
        ui.hudTime = 0; ui.update(s, 'practice', 0, false, 60, interaction);
        for (const event of post) ui.event(event);
        if (watchAgo) ui.watchSince = performance.now() - watchAgo;
        ui.hudTime = 0; ui.update(s, 'practice', 0, false, 60, interaction);
        ui.heading = -1; ui.frameCompass(heading);
      }, { js: state.js, prompt: !!state.prompt, coach: !!state.coach, pose: state.pose, scope: state.name === 'scope' });
      // Let entrance motion settle to a representative frame, then freeze every animation there.
      await page.waitForTimeout(140);
      await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
      // Footprint: the share of the window covered by what the HUD paints (boxes with a background or border, text,
      // images), as a union on a 4 px grid. Layout containers and full-screen overlays do not count.
      footprint[`${state.name}-${width}x${height}`] = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, cell = 4, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), grid = new Uint8Array(cols * rows);
        const skip = '#storm,#vign,#scope-overlay,#bigmap,#emoteWheel,#scoreboard,#pause-panel,#victory,#dmgInd,#nums,#cross,#hitm,#rring,[hidden]';
        for (const el of document.querySelectorAll('#hud *, #toast *')) {
          if (el.closest(skip) || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          const box = el.getBoundingClientRect(); if (box.width < 2 || box.height < 2 || box.width * box.height > W * H / 4) continue;
          // Clipped by an overflow ancestor (the compass ribbon is three turns long): count only what shows.
          const r = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
          for (let up = el.parentElement; up && up.id !== 'hud'; up = up.parentElement) {
            if (getComputedStyle(up).overflow === 'visible') continue;
            const c = up.getBoundingClientRect();
            r.left = Math.max(r.left, c.left); r.top = Math.max(r.top, c.top); r.right = Math.min(r.right, c.right); r.bottom = Math.min(r.bottom, c.bottom);
          }
          if (r.right - r.left < 1 || r.bottom - r.top < 1) continue;
          const cs = getComputedStyle(el), painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !cs.backgroundColor.endsWith(', 0)')) || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0;
          const leaf = /^(IMG|svg|CANVAS)$/.test(el.tagName) || [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!painted && !leaf) continue;
          for (let y = Math.max(0, Math.floor(r.top / cell)); y < Math.min(rows, Math.ceil(r.bottom / cell)); y++)
            for (let x = Math.max(0, Math.floor(r.left / cell)); x < Math.min(cols, Math.ceil(r.right / cell)); x++) grid[y * cols + x] = 1;
        }
        return +(grid.reduce((a, b) => a + b, 0) / grid.length * 100).toFixed(2);
      });
      const file = `${out}/${prefix}-${state.name}-${width}x${height}.jpg`;
      await page.screenshot({ path: file, quality: 85 });
      shots.set(`${state.name}-${width}`, { file, label: state.label });
      console.log(state.name, width, height);
    }
  }
  // Boards: four columns, a label over each shot.
  for (const [width, height] of sizes) {
    const cells = STATES.map(state => shots.get(`${state.name}-${width}`)).filter(Boolean);
    const colW = Math.round(width / 2), colH = Math.round(height / 2), columns = 4;
    const html = `<body style="margin:0;background:#1d130c;font:600 18px system-ui,sans-serif;color:#fff1d6"><div style="display:grid;grid-template-columns:repeat(${columns},${colW}px);gap:6px;padding:6px">${cells.map(cell => `<figure style="margin:0;position:relative"><img src="data:image/jpeg;base64,${readFileSync(cell.file).toString('base64')}" style="display:block;width:${colW}px;height:${colH}px"><figcaption style="position:absolute;left:0;top:0;padding:3px 9px;background:rgba(29,19,12,.82);border-bottom-right-radius:8px">${cell.label}</figcaption></figure>`).join('')}</div></body>`;
    const board = await browser.newPage({ viewport: { width: columns * colW + 30, height: 400 } });
    await board.setContent(html, { waitUntil: 'load' });
    await board.screenshot({ path: `${out}/${prefix}-${width}x${height}.jpg`, quality: 80, fullPage: true });
    await board.close();
    console.log('board', `${out}/${prefix}-${width}x${height}.jpg`);
  }
  writeFileSync(`${out}/${prefix}-footprint.json`, JSON.stringify(footprint, null, 1));
  console.log('footprint % of window', JSON.stringify(footprint));
  if (!process.env.SINGLES) for (const { file } of shots.values()) unlinkSync(file);
} finally { await browser.close(); }
