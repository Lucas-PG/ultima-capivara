// Cuts the approved final-art sheets (reviews/final-art: a real alpha original, or a magenta #FF00FF background) into one small sprite per
// cell for the UI: keyed to alpha with a soft edge and magenta despill, trimmed, padded to a square, resized,
// then encoded as WebP (every supported browser decodes it; AVIF would save well under 1 KiB per sprite). Keying runs in headless Chromium (canvas) so the result
// is identical on every machine; encoding needs ffmpeg and cwebp on PATH, like scripts/build-cover.mjs.
// Usage: node scripts/build-ui-art.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ART = '/Users/lucas_gaspe/dev/capivara-team/reviews/final-art';
const OUT = 'public/assets/ui';
const sheets = [
  { file: 'award-badges-3x2.png', cols: 3, rows: 2, size: 192, names: ['award-kills', 'award-damage', 'award-headshots', 'award-chests', 'award-survived', 'award-winner'] },
];

// Player kit colours (src/shared/types.ts PLAYER_COLORS): one portrait per colour, bandana recoloured from the #00FF00 key.
const KIT = ['#1fb5a8', '#e76f51', '#ffc23d', '#3d6fb6', '#a468ff', '#f28db2', '#8cc453', '#f4f1e8'];
const tmp = mkdtempSync(join(tmpdir(), 'ui-art-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const sheet of sheets) {
    // Re-encode through ffmpeg first: some generator PNGs carry chunks Chromium refuses to decode.
    const clean = join(tmp, `clean-${sheet.file}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ART, sheet.file), '-pix_fmt', 'rgba', clean]);
    const data = 'data:image/png;base64,' + readFileSync(clean).toString('base64');
    const cells = await page.evaluate(async ({ data, cols, rows, size }) => {
      const image = new Image(); image.src = data; await image.decode();
      const src = document.createElement('canvas'); src.width = image.width; src.height = image.height;
      const g = src.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
      const px = g.getImageData(0, 0, src.width, src.height), d = px.data;
      // Key colour = the sheet's own corner (the generator's magenta is approximate, e.g. 236/15/239).
      const k = [d[0], d[1], d[2]], hasAlpha = d[3] < 250;
      for (let i = 0; !hasAlpha && i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - k[0], d[i + 1] - k[1], d[i + 2] - k[2]);
        const alpha = Math.max(0, Math.min(1, (dist - 60) / 90));
        // Despill: pull magenta fringe (red and blue both above green) back toward neutral on the soft edge.
        if (alpha < 1) { const spill = Math.max(0, Math.min(d[i], d[i + 2]) - d[i + 1]) * (1 - alpha); d[i] -= spill; d[i + 2] -= spill; }
        d[i + 3] = Math.round(alpha * 255);
      }
      g.putImageData(px, 0, 0);
      const out = [], cw = src.width / cols, ch = src.height / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x0 = Math.round(c * cw), y0 = Math.round(r * ch), w = Math.round(cw), h = Math.round(ch);
        const cell = g.getImageData(x0, y0, w, h).data;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        // Ignore a thin band at the cell border: generated subjects sometimes poke a few pixels into the neighbour cell.
        const inset = Math.round(Math.min(w, h) * .025);
        for (let y = inset; y < h - inset; y++) for (let x = inset; x < w - inset; x++) if (cell[(y * w + x) * 4 + 3] > 24) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const bw = maxX - minX + 1, bh = maxY - minY + 1, side = Math.max(bw, bh) * 1.06;
        const dst = document.createElement('canvas'); dst.width = dst.height = size;
        const dg = dst.getContext('2d'); dg.imageSmoothingQuality = 'high';
        const scale = size / side;
        dg.drawImage(src, x0 + minX, y0 + minY, bw, bh, (size - bw * scale) / 2, (size - bh * scale) / 2, bw * scale, bh * scale);
        out.push(dst.toDataURL('image/png'));
      }
      return out;
    }, { ...sheet, data });
    cells.forEach((url, i) => {
      const png = join(tmp, `${sheet.names[i]}.png`);
      writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      execFileSync('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-exact', png, '-o', join(OUT, `${sheet.names[i]}.webp`)]);
      console.log(sheet.names[i], `${(statSync(join(OUT, `${sheet.names[i]}.webp`)).size / 1024).toFixed(1)} KiB webp`);
    });
  }
  // Home mode cards: the two halves of the sheet, not keyed, 960 px wide.
  const modes = join(tmp, 'modes.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ART, 'mode-art-2x1.png'), '-pix_fmt', 'rgb24', modes]);
  for (const [name, x] of [['mode-royale', 0], ['mode-correria', 1]]) {
    const half = join(tmp, `${name}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', modes, '-vf', `crop=iw/2:ih:${x}*iw/2:0,scale=960:-2:flags=lanczos`, half]);
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-sharp_yuv', half, '-o', join(OUT, `${name}.webp`)]);
    console.log(name, `${(statSync(join(OUT, `${name}.webp`)).size / 1024).toFixed(1)} KiB webp`);
  }
  // Player portraits: key the magenta, then recolour the green bandana to each kit colour keeping its two shade steps.
  const portrait = join(tmp, 'portrait.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ART, 'capy-portrait-bandana-key.png'), '-pix_fmt', 'rgba', portrait]);
  const variants = await page.evaluate(async ({ data, kits }) => {
    const image = new Image(); image.src = data; await image.decode();
    const size = 256, c = document.createElement('canvas'); c.width = c.height = image.width;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
    const base = g.getImageData(0, 0, c.width, c.height), k = [base.data[0], base.data[1], base.data[2]];
    for (let i = 0; i < base.data.length; i += 4) {
      const d = base.data, dist = Math.hypot(d[i] - k[0], d[i + 1] - k[1], d[i + 2] - k[2]), alpha = Math.max(0, Math.min(1, (dist - 60) / 90));
      if (alpha < 1) { const spill = Math.max(0, Math.min(d[i], d[i + 2]) - d[i + 1]) * (1 - alpha); d[i] -= spill; d[i + 2] -= spill; }
      d[i + 3] = Math.round(alpha * 255);
    }
    return kits.map(hex => {
      const kit = [1, 3, 5].map(j => parseInt(hex.slice(j, j + 2), 16)), px = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height), d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const w = Math.max(0, Math.min(1, (d[i + 1] - Math.max(d[i], d[i + 2])) / 160));
        if (!w) continue;
        const shade = d[i + 1] / 255;
        for (let j = 0; j < 3; j++) d[i + j] = Math.round(d[i + j] * (1 - w) + kit[j] * shade * w);
      }
      g.putImageData(px, 0, 0);
      const out = document.createElement('canvas'); out.width = out.height = size;
      const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, size, size);
      return out.toDataURL('image/png');
    });
  }, { data: 'data:image/png;base64,' + readFileSync(portrait).toString('base64'), kits: KIT });
  variants.forEach((url, i) => {
    const name = `capy-${KIT[i].slice(1)}`, png = join(tmp, `${name}.png`);
    writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
    execFileSync('cwebp', ['-quiet', '-q', '85', '-alpha_q', '100', '-exact', png, '-o', join(OUT, `${name}.webp`)]);
    console.log(name, `${(statSync(join(OUT, `${name}.webp`)).size / 1024).toFixed(1)} KiB webp`);
  });
} finally { await browser.close(); rmSync(tmp, { recursive: true, force: true }); }
