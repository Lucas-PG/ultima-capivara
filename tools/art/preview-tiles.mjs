// Renders procedural foliage tiles to PNGs on a flat backdrop for review.
// node tools/art/preview-tiles.mjs <outDir> <generator>[:<json options>] ...
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import * as tiles from './foliage-tiles.mjs';
const [out, ...names] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const name of names) {
  const [fn, arg] = name.split(/:(.*)/s);
  const tile = tiles[fn](arg ? JSON.parse(arg) : {});
  const label = fn + (arg ? '-' + (JSON.parse(arg).label ?? Object.values(JSON.parse(arg)).join('-')) : '');
  await sharp(Buffer.from(tile.svg)).flatten({ background: '#5a6b8a' }).png().toFile(`${out}/${label}.png`);
  console.log(label, tile.width, tile.height);
}
