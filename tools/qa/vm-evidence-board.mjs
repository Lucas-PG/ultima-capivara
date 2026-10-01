// Before and after boards from two vm-evidence.mjs runs (same states, same cameras): per weapon, each
// state as a before | after pair, labelled, with the target composition drawn as guides on the hip and
// aimed tiles (our own captures only). Without a before directory it lays out the after set alone.
// node tools/qa/vm-evidence-board.mjs <outDir> <afterDir> [beforeDir|-] [size WxH] [weapons csv] [tile width]
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { GUIDES } from './vm-guides.mjs';
const [out, afterDir, beforeDir = '-', size = '1280x720', list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', tileArg] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const [W, H] = size.split('x').map(Number);
const index = JSON.parse(readFileSync(`${afterDir}/index.json`, 'utf8'));
const pairs = beforeDir !== '-';
const tw = Number(tileArg || (pairs ? 420 : 480)), th = Math.round(tw * H / W);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Guides: target boxes (fractions of the frame) for the muzzle, sight and support paw, the arms' exit
// spans on the bottom edge, and the central band that should stay clear.
function guideSvg(weapon, state) {
  const g = GUIDES[weapon]?.[state];
  if (!g) return '';
  const box = (b, color, label) => b ? `<rect x="${b[0] * tw}" y="${b[1] * th}" width="${(b[2] - b[0]) * tw}" height="${(b[3] - b[1]) * th}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="4 3"/>`
    + `<text x="${b[0] * tw + 2}" y="${b[1] * th - 3}" font-size="10" fill="${color}" font-family="sans-serif">${label}</text>` : '';
  const span = (s, color, label) => s ? `<line x1="${s[0] * tw}" y1="${th - 3}" x2="${s[1] * tw}" y2="${th - 3}" stroke="${color}" stroke-width="5" stroke-opacity=".8"/>`
    + `<text x="${s[0] * tw}" y="${th - 9}" font-size="10" fill="${color}" font-family="sans-serif">${label}</text>` : '';
  const corridor = g.corridor ? `<rect x="${g.corridor[0] * tw}" y="${g.corridor[1] * th}" width="${(g.corridor[2] - g.corridor[0]) * tw}" height="${(g.corridor[3] - g.corridor[1]) * th}" fill="#ffffff" fill-opacity=".06" stroke="#ffffff" stroke-opacity=".35" stroke-width="1"/>` : '';
  return corridor + box(g.muzzle, '#ff5a5a', 'muzzle') + box(g.sight, '#ffd23c', 'sight') + box(g.grip, '#52e0ff', 'firing paw') + box(g.support, '#7dff7a', 'support paw')
    + span(g.supportExit, '#7dff7a', 'support forearm') + span(g.firingExit, '#52e0ff', 'firing arm')
    + `<line x1="${tw / 2 - 6}" y1="${th / 2}" x2="${tw / 2 + 6}" y2="${th / 2}" stroke="#fff"/><line x1="${tw / 2}" y1="${th / 2 - 6}" x2="${tw / 2}" y2="${th / 2 + 6}" stroke="#fff"/>`;
}
async function tile(dir, weapon, state, label, guides) {
  const file = `${dir}/${size}/${weapon}-${state.id}.png`;
  if (!existsSync(file)) return sharp({ create: { width: tw, height: th, channels: 3, background: '#111' } }).png().toBuffer();
  const svg = `<svg width="${tw}" height="${th}">${guides ? guideSvg(weapon, state.id) : ''}<rect width="${tw}" height="18" fill="#000" fill-opacity=".6"/>`
    + `<text x="5" y="13" font-size="12" fill="#fff" font-family="sans-serif">${esc(`${weapon} ${state.label}${label ? ' · ' + label : ''}`)}</text></svg>`;
  return sharp(file).resize(tw, th).composite([{ input: Buffer.from(svg) }]).toBuffer();
}
for (const weapon of list.split(',')) {
  const states = index[weapon] ?? [];
  const tiles = [];
  for (const state of states) {
    const guides = state.id === 'hip' || state.id === 'aimed';
    if (pairs) tiles.push(await tile(beforeDir, weapon, state, 'before', guides));
    tiles.push(await tile(afterDir, weapon, state, pairs ? 'after' : '', guides));
  }
  const cols = 4, rows = Math.ceil(tiles.length / cols), gap = 4;
  const file = `${out}/${weapon}-${size}.jpg`;
  await sharp({ create: { width: cols * (tw + gap), height: rows * (th + gap), channels: 3, background: '#1b1b1b' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * (tw + gap) + (pairs && i % 2 ? 0 : 0), top: Math.floor(i / cols) * (th + gap) })))
    .jpeg({ quality: Number(process.env.Q || 78), mozjpeg: true }).toFile(file);
  console.log(file);
}
