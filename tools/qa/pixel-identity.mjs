// Exact decoded-pixel comparison. No perceptual tolerance: even one changed channel fails.
// node tools/qa/pixel-identity.mjs <beforeDir> <afterDir> <out.json>
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const [before, after, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node tools/qa/pixel-identity.mjs <beforeDir> <afterDir> <out.json>');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const file of readdirSync(before).filter(name => name.endsWith('.png')).sort()) {
  const a = PNG.sync.read(readFileSync(join(before, file))), b = PNG.sync.read(readFileSync(join(after, file)));
  if (a.width !== b.width || a.height !== b.height) throw new Error(`Dimensions differ: ${file}`);
  let changedPixels = 0, maxChannelDifference = 0, squareError = 0;
  let minX = a.width, minY = a.height, maxX = -1, maxY = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a.data[i + c] - b.data[i + c]);
      if (d) changed = true;
      maxChannelDifference = Math.max(maxChannelDifference, d);
      if (c < 3) squareError += d * d;
    }
    if (changed) {
      changedPixels++;
      const x = (i / 4) % a.width, y = Math.floor(i / 4 / a.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const pixels = a.width * a.height, mse = squareError / (pixels * 3);
  rows.push({ file, width: a.width, height: a.height, pixels, changedPixels, maxChannelDifference,
    psnrDb: mse ? +(10 * Math.log10(255 * 255 / mse)).toFixed(4) : 'Infinity',
    bounds: changedPixels ? [minX, minY, maxX, maxY] : null, beforePixelSha256: hash(a.data), afterPixelSha256: hash(b.data) });
}
const exact = rows.length > 0 && rows.every(row => row.changedPixels === 0);
writeFileSync(output, JSON.stringify({ measuredAt: new Date().toISOString(), before, after, exact, rows }, null, 2));
console.log(JSON.stringify({ cameras: rows.length, exact, changedPixels: rows.reduce((sum, row) => sum + row.changedPixels, 0), output }));
if (!exact) process.exitCode = 1;
