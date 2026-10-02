import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.argv[2] || 'docs/overhaul/evidence/codex-gamemodes';
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5199';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=gl-egl'] });
const rows = [], errors = [];
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
 page.on('pageerror', e => errors.push(e.message));
 await page.addInitScript(() => { localStorage.setItem('uc-onboarded', '1'); localStorage.setItem('uc-v2-settings', JSON.stringify({ reducedMotion: true })); });
 for (const mode of ['duel', 'squads']) {
  await page.goto(`${base}/?networkQa=1`); await page.locator(`[data-mode=${mode}]`).click(); await page.locator('[data-do=practice]').click();
  await page.waitForFunction(() => window.__capivara?.inspect().snapshot?.phase === 'playing' && !window.__capivara.inspect().renderState.loading, null, { timeout: 60000 });
  if (mode === 'squads') {
   await page.waitForFunction(() => { const b=document.querySelector('[data-open-shop]'); return b && !b.disabled; });
   await page.keyboard.press('KeyO'); await page.locator('.round-shop').waitFor();
   await page.setViewportSize({ width: 390, height: 844 });
   const shop = await page.evaluate(() => {
    const d=document.querySelector('.round-shop'), footer=d.querySelector('footer').getBoundingClientRect(), shelves=d.querySelector('.shop-shelves');
    return { name:'phone-shop', footerInside:footer.bottom<=innerHeight && footer.top>=0, scrollable:shelves.scrollHeight>shelves.clientHeight, noHorizontalOverflow:d.scrollWidth<=d.clientWidth+1 };
   });
   rows.push(shop); if (!shop.footerInside || !shop.scrollable || !shop.noHorizontalOverflow) errors.push('phone shop layout');
   await page.waitForFunction(() => !document.querySelector('.round-shop'), null, { timeout: 20000 });
   await page.waitForFunction(() => window.__capivara.inspect().clientInput.locked, null, { timeout: 5000 });
   rows.push({ name:'automatic-shop-close', locked:true });
  }
  for (const [width,height] of [[1920,1080],[1280,720],[390,844],[844,390]]) for (const scale of [.8,1,1.2]) {
   await page.setViewportSize({ width,height });
   await page.evaluate(scale => { const ui=window.__hudQA; ui.settings.uiScale=scale; ui.applyHudPrefs(); },scale);
   await page.waitForTimeout(120);
   const row=await page.evaluate(({mode,scale}) => {
    const round=document.querySelector('#round-hud'), box=round.getBoundingClientRect(), compass=document.querySelector('#compass').getBoundingClientRect();
    const fonts=[...round.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>{
     let zoom=1; for(let p=e;p;p=p.parentElement) zoom*=Number.parseFloat(getComputedStyle(p).zoom)||1;
     return { text:e.textContent, pixels:Number.parseFloat(getComputedStyle(e).fontSize)*zoom };
    });
    const overlap=Math.min(box.right,compass.right)-Math.max(box.left,compass.left)>2 && Math.min(box.bottom,compass.bottom)-Math.max(box.top,compass.top)>2;
    return { mode,scale,size:[innerWidth,innerHeight],minFont:Math.min(...fonts.map(f=>f.pixels)),fonts,compassOverlap:overlap,inside:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,horizontalOverflow:round.scrollWidth>round.clientWidth+1 };
   },{mode,scale});
   rows.push(row); if(row.minFont<11.95 || row.compassOverlap || !row.inside || row.horizontalOverflow) errors.push(`${mode} ${width}x${height} ${scale}: ${JSON.stringify(row)}`);
   if(scale===1) await page.screenshot({path:`${out}/${mode}-ui-${width}x${height}.jpg`,quality:85});
  }
 }
 writeFileSync(`${out}/ui-scales.json`,JSON.stringify({errors,rows},null,2));
 console.log(JSON.stringify({checks:rows.length,errors}));
 if(errors.length) process.exitCode=1;
} finally {await browser.close();}
