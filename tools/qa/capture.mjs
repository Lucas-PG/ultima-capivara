// Captures named QA poses from a running VITE_QA=1 server into a folder.
// Usage: node tools/qa/capture.mjs <outDir> pose1 pose2 ...  (BASE env overrides the URL)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [out, ...poses] = process.argv.slice(2);
if (!out) throw new Error('Give a worktree-local output directory.');
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
  page.on('pageerror', e => { console.error('pageerror', e.message); process.exitCode = 1; });
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${base}/?qa=1${process.env.QUERY || ''}`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
  console.log('warming island');
  await page.evaluate(() => { window.__qaStarted = false; window.__capyQA.start().then(() => { window.__qaStarted = true; }); });
  try { await page.waitForFunction(() => window.__qaStarted, null, { timeout: 90000 }); }
  catch (error) { await page.screenshot({ path: `${out}/startup-failed.png` }); throw error; }
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  const list = poses.length ? poses : await page.evaluate(() => window.__capyQA.names());
  for (const name of list) {
    try {
      const r = await page.evaluate(p => window.__capyQA.pose(p), name);
      if (name.startsWith('results')) {
        await page.locator('#vpanel.show').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('#vpanel [data-count]')].every(el => el.textContent === el.getAttribute('data-count') && (el.classList.contains('done') || document.body.classList.contains('reduce-motion'))));
      }
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/${name}.png` });
      console.log(name, r.drawCalls, r.triangles);
    } catch (e) { console.error(name, e.message.split('\n')[0]); process.exitCode = 1; }
  }
} finally { await browser.close(); }
