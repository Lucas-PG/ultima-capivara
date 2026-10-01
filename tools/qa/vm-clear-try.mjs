// Worst paw-to-gun clearance of chosen motion states under several framing overrides (window.__vmTune).
// node tools/qa/vm-clear-try.mjs <weapon> '<json: {name: tune}>' '<states: action@s,action@s...>' [L|R|LR]
import { chromium } from '@playwright/test';
import { measureGrip } from './grip-measure.mjs';
const [weapon, variantsJson, statesCsv, sides = 'LR'] = process.argv.slice(2);
const variants = JSON.parse(variantsJson);
const states = statesCsv.split(',').map(s => { const [a, t] = s.split('@'); return [a, +(t ?? 0)]; });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  for (const [name, tune] of Object.entries(variants)) {
    const parts = [];
    let worst = Infinity;
    for (const [action, t] of states) {
      await page.evaluate(([w, v]) => { window.__vmOrbit = undefined; window.__vmTune = Object.keys(v).length ? { [w]: v } : undefined; }, [weapon, tune]);
      if (action === 'hip' || action === 'ads') await page.evaluate(([w, a]) => window.__capyQA.pose(`${a === 'ads' ? 'ads' : 'fp'}-${w}`), [weapon, action]);
      else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
      for (const side of sides.split('')) {
        const visible = await page.evaluate(side => window.__vmProbe.arms.meshes.find(m => m.name.endsWith(side)).visible, side);
        if (!visible) continue;
        const m = await page.evaluate(measureGrip, [weapon, side]);
        const at = Object.entries(m.summary).sort((a, b) => a[1].min - b[1].min)[0]?.[0];
        worst = Math.min(worst, m.worst);
        parts.push(`${action}@${t} ${side} ${m.worst}${m.worst < -.5 ? ` (${at})` : ''}`);
      }
    }
    console.log(`${name.padEnd(10)} worst ${worst} | ${parts.join(' | ')}`);
  }
} finally { await browser.close(); }
