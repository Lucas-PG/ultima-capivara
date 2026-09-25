import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { SIGN_ART } from '../src/shared/signage';

const font = await fs.readFile('node_modules/@fontsource/dela-gothic-one/files/dela-gothic-one-latin-400-normal.woff2');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<style>@font-face{font-family:SignDela;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-weight:400}</style>`);
  const png = await page.evaluate(async signs => {
    await document.fonts.load('128px SignDela', 'MERCADÃO');
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#F4E7C6'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < signs.length; i++) {
      const { label, accent } = signs[i], x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
      ctx.fillStyle = '#F4E7C6'; ctx.fillRect(x, y, 512, 256);
      ctx.fillStyle = accent; ctx.fillRect(x + 12, y + 12, 488, 232);
      ctx.fillStyle = '#F4E7C6'; ctx.fillRect(x + 21, y + 21, 470, 214);
      ctx.fillStyle = '#2B1B12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const wideBoard = signs[i].aspect > 3;
      ctx.font = `${wideBoard ? 128 : 80}px SignDela`;
      // The boards have two aspect ratios; precompress glyphs in atlas space
      // so they regain their natural width when mapped to either geometry.
      ctx.save(); ctx.translate(x + 256, y + 128); ctx.scale(2 / signs[i].aspect, 1);
      ctx.fillText(label, 0, 0, wideBoard ? 900 : 444); ctx.restore();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, SIGN_ART);
  await fs.writeFile('public/textures/island-signs.png', Buffer.from(png, 'base64'));
} finally {
  await browser.close();
}
