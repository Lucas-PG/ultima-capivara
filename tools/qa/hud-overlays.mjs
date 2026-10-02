// Match overlays and surrounding menus, captured through the real UI methods.
// BASE=http://127.0.0.1:5195 node tools/qa/hud-overlays.mjs <outDir> <before|after>
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const [out, prefix = 'overlays'] = process.argv.slice(2);
if (!out) throw new Error('Give an output directory.');
mkdirSync(out, { recursive: true });
const sizes = (process.env.SIZES || '1280x720,1470x956').split(',').map(s => s.split('x').map(Number));
const states = ['scoreboard', 'scoreboard-correria', 'scoreboard-corrente', 'bigmap', 'pause', 'pause-watch', 'settings', 'leave', 'emote-wheel', 'home', 'how', 'host', 'join', 'lobby', 'loading', 'loading-correria', 'loading-corrente'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=gl-egl'] });
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: sizes[0][0], height: sizes[0][1] } });
  page.on('pageerror', error => { console.error(error); process.exitCode = 1; });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5195'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA && !!window.__hudQA);
  await page.evaluate(() => { window.__qaStarted = false; window.__capyQA.start().then(() => window.__qaStarted = true); });
  await page.waitForFunction(() => window.__qaStarted, null, { timeout: 120000 });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const files = [];
    for (const state of states) {
      await page.evaluate(() => { const ui = window.__hudQA; ui.closeModal(); ui.setLoading(false); ui.setRoom(null); ui.game('practice'); });
      await page.evaluate(pose => window.__capyQA.pose(pose), state === 'pause-watch' ? 'hud-watch' : state === 'emote-wheel' ? 'emote-wheel' : 'hud-full');
      await page.evaluate(state => {
        const ui = window.__hudQA, s = structuredClone(ui.snapshot);
        if (state.startsWith('scoreboard')) {
          s.config.mode = state.endsWith('correria') ? 'deathmatch' : state.endsWith('corrente') ? 'corrente' : 'battle-royale';
          ui.hudTime = 0; ui.update(s, 'practice', 30, true, 60, null);
        } else if (state === 'bigmap') { ui.toggleMap(true); ui.hudTime = 0; ui.update(s, 'practice', 30, false, 60, null); }
        else if (state.startsWith('pause')) ui.setPaused(true);
        else if (state === 'settings') { ui.setPaused(true); ui.settingsModal(); }
        else if (state === 'leave') { ui.setPaused(true); ui.confirmLeave(); }
        else if (['home', 'how', 'host', 'join'].includes(state)) {
          ui.home();
          if (state === 'how') ui.howModal();
          if (state === 'host' || state === 'join') ui.roomModal(state);
        } else if (state === 'lobby') {
          ui.setRoom({ code: 'CAPY42', myId: 'practice', hostId: 'practice', isHost: true, phase: 'lobby', config: s.config,
            players: s.actors.slice(0, 6).map((a, i) => ({ id: i === 0 ? 'practice' : a.id, name: i === 0 ? 'Capivara' : a.name, color: a.color, ready: i !== 3, connected: true })) });
        } else if (state.startsWith('loading')) {
          ui.selectedMode = state.endsWith('correria') ? 'deathmatch' : state.endsWith('corrente') ? 'corrente' : 'battle-royale';
          ui.setLoading(true); ui.setLoadingProgress(.62);
        }
      }, state);
      await page.waitForTimeout(600);
      await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
      report[`${state}-${width}x${height}`] = await page.evaluate(() => {
        const small = [...document.querySelectorAll('body *')].flatMap(el => {
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('[hidden],.sr,script,style,svg')) return [];
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return [];
          const px = parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom || 1);
          return px < 11.95 ? [`${el.id || el.className || el.tagName}: ${px.toFixed(1)}px`] : [];
        });
        return { smallText: [...new Set(small)], horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      const file = `${out}/${prefix}-${state}-${width}x${height}.jpg`;
      await page.screenshot({ path: file, quality: 85 }); files.push(file);
      console.log(state, width, height);
    }
    const cw = Math.round(width / 3), ch = Math.round(height / 3), cols = 4, label = 25;
    const cells = await Promise.all(files.flatMap((file, i) => [
      sharp(file).resize(cw, ch).toBuffer().then(input => ({ input, left: i % cols * cw, top: Math.floor(i / cols) * (ch + label) + label })),
      Promise.resolve({ input: Buffer.from(`<svg width="${cw}" height="${label}"><rect width="100%" height="100%" fill="#3a2418"/><text x="9" y="18" fill="#fff4d6" font-size="15" font-family="sans-serif">${states[i]}</text></svg>`), left: i % cols * cw, top: Math.floor(i / cols) * (ch + label) }),
    ]));
    await sharp({ create: { width: cw * cols, height: Math.ceil(files.length / cols) * (ch + label), channels: 3, background: '#3a2418' } }).composite(cells).jpeg({ quality: 82 }).toFile(`${out}/${prefix}-overlays-${width}x${height}.jpg`);
  }
} finally { await browser.close(); }
writeFileSync(`${out}/${prefix}-overlays.json`, JSON.stringify(report, null, 2));
