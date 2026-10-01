// HUD layout review: the busiest HUD states at every window size and interface scale.
// Captures each combination and reports HUD plates that overlap each other or leave the window.
// Usage: node tools/qa/hud-review.mjs <outDir>   (BASE overrides the URL; SIZES=1280x720,... SCALES=0.8,1,1.2 POSES=... narrow the run;
// DPR=2 renders like a Retina screen). Also reports visible HUD text drawn under the readability floor (12 CSS px).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.argv[2];
if (!out) throw new Error('Give a worktree-local output directory.');
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5173';
const sizes = (process.env.SIZES || '1280x720,1470x956,1600x900,1920x1080,2560x1440,2560x1080,1280x548,1024x640,960x600,844x390,390x844').split(',').map(s => s.split('x').map(Number));
const scales = (process.env.SCALES || '0.8,1,1.2').split(',').map(Number);
const poses = (process.env.POSES || 'hud,hud-full,hud-watch,hud-corrente').split(',');
// Plates that may never touch each other or the window edge.
const TEXT_FLOOR = 12;
const PLATES = ['topL', 'ladder', 'compass', 'safe', 'hOut', 'mapWrap', 'feed', 'matchMoment', 'banner', 'deathCard', 'specBar', 'prompt', 'use', 'alt', 'vitals', 'stance', 'consbar', 'hotbar', 'wpnbox', 'coach', 'killConfirm', 'storm'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const faults = [];
try {
  for (const scale of scales) {
    const page = await browser.newPage({ viewport: { width: sizes[0][0], height: sizes[0][1] }, deviceScaleFactor: Number(process.env.DPR || 1) });
    page.on('pageerror', e => { console.error('pageerror', e.message); process.exitCode = 1; });
    // No 'uc-onboarded': the first-visit coach plate is part of the layout under review.
    await page.addInitScript(uiScale => localStorage.setItem('uc-v2-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('uc-v2-settings') || '{}'), uiScale })), scale);
    await page.goto(`${base}/?qa=1`);
    await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
    await page.evaluate(() => { window.__qaStarted = false; window.__capyQA.start().then(() => { window.__qaStarted = true; }); });
    await page.waitForFunction(() => window.__qaStarted, null, { timeout: 120000 });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      for (const pose of poses) {
        await page.evaluate(p => window.__capyQA.pose(p), pose);
        await page.waitForTimeout(450);
        const name = `${pose}-${width}x${height}-ui${Math.round(scale * 100)}`;
        await page.screenshot({ path: `${out}/${name}.jpg`, quality: 82 });
        const rects = await page.evaluate(ids => ids.flatMap(id => {
          const el = document.getElementById(id);
          if (!el || el.hidden || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return [];
          const r = el.getBoundingClientRect();
          return r.width < 2 || r.height < 2 ? [] : [{ id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }];
        }), PLATES);
        const found = [];
        for (const r of rects) if (r.x0 < -1 || r.y0 < -1 || r.x1 > width + 1 || r.y1 > height + 1)
          found.push(`${r.id} leaves the window (${Math.round(r.x0)},${Math.round(r.y0)} to ${Math.round(r.x1)},${Math.round(r.y1)})`);
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j], w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          if (w > 3 && h > 3) found.push(`${a.id} overlaps ${b.id} by ${Math.round(w)}x${Math.round(h)}`);
        }
        // Text size as drawn: the computed size times every CSS zoom above it (the HUD scales with zoom).
        const small = await page.evaluate(floor => [...document.querySelectorAll('#hud *')].flatMap(el => {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return [];
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('[hidden],.sr,#bigmap,#emoteWheel,#scoreboard,#pause-panel,#victory')) return [];
          const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return [];
          const px = parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom || 1);
          return px < floor - .05 ? [`${el.id || el.getAttribute('class') || el.tagName}:${px.toFixed(1)}px`] : [];
        }), TEXT_FLOOR);
        if (small.length) found.push(`text under ${TEXT_FLOOR}px: ${[...new Set(small)].slice(0, 6).join(', ')}`);
        console.log(name, found.length ? found.join('; ') : 'clean', `(${rects.length} plates)`);
        for (const fault of found) faults.push(`${name}: ${fault}`);
      }
    }
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(`${out}/faults.txt`, faults.join('\n') + '\n');
console.log(faults.length, 'layout faults');
