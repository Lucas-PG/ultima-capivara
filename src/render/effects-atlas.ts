import * as THREE from 'three';

// One procedural 1024x512 atlas (8x4 cells of 128 px) holds every VFX card, so
// all effects share a texture and two materials. Channels are masks, not
// colours: R marks the lighter tone, G the ink outline, A the coverage. The
// card shader paints each instance's base and light colours through them,
// which gives the bible's flat 2 to 3 tone cards with an outline (§11).
export const CELL = {
  flashA: 0, flashB: 1, flashC: 2, pow: 3, puff: 4, mist: 5, spark: 6, chip: 7,
  splinter: 8, leaf: 9, drop: 10, tuft: 11, star: 12, ring: 13, plus: 14, shard: 15,
  twinkle: 16, alert: 17, hole: 18, scuff: 19,
} as const;
export const ATLAS_COLUMNS = 8, ATLAS_ROWS = 4;
// Hand-painted flipbook cells (public/textures/vfx-flipbooks.png, Forja's approved F2
// sheet, built by tools/vfx/build-flipbooks.mjs). Card cells from 32 up sample it in
// its own colours; `dust` and `chip` are painted in neutral grey and tinted per surface.
export const PAINTED_URL = 'textures/vfx-flipbooks.png';
export const PAINT = {
  flash: 32, pow: 35, star: 37, fur: 38, wood: 40, splinter: 42, dust: 43, chip: 45,
} as const;

const SIZE = 128;
const INK = 'rgb(0,255,0)', BODY = 'rgb(0,0,0)', LIGHT = 'rgb(255,0,0)';
type Ctx = CanvasRenderingContext2D;

function star(ctx: Ctx, points: number, outer: number, inner: number, turn = -Math.PI / 2, jitter: readonly number[] = []) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 ? inner : outer) * (jitter[i % Math.max(1, jitter.length)] ?? 1), a = turn + i * Math.PI / points;
    if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}
function circle(ctx: Ctx, x: number, y: number, r: number) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
function poly(ctx: Ctx, points: readonly (readonly [number, number])[]) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
}
// Ink first (a wider stroke of the same path), then the body, then the light facet.
function inked(ctx: Ctx, path: () => void, width = 9) {
  path(); ctx.strokeStyle = INK; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
  path(); ctx.fillStyle = BODY; ctx.fill();
}
function light(ctx: Ctx, path: () => void) { path(); ctx.fillStyle = LIGHT; ctx.fill(); }

const DRAW: Record<number, (ctx: Ctx) => void> = {
  [CELL.flashA]: ctx => {
    star(ctx, 8, 58, 20, -Math.PI / 2, [1, 1, .58, 1]); ctx.fillStyle = BODY; ctx.fill();
    star(ctx, 8, 34, 13, -Math.PI / 2, [1, 1, .6, 1]); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.flashB]: ctx => {
    star(ctx, 6, 52, 22, -Math.PI / 3, [1, 1, .8, 1, .9, 1]); ctx.fillStyle = BODY; ctx.fill();
    star(ctx, 6, 30, 14, -Math.PI / 3); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.flashC]: ctx => {
    star(ctx, 9, 40, 30); ctx.fillStyle = BODY; ctx.fill();
    ctx.beginPath(); circle(ctx, 0, 0, 20); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.pow]: ctx => {
    inked(ctx, () => star(ctx, 10, 54, 30, -Math.PI / 2, [1, .92, 1.04, .9, .96, 1, .9, 1.02, 1, .94]));
    light(ctx, () => star(ctx, 10, 34, 20, -Math.PI / 2 + .2));
  },
  [CELL.puff]: ctx => {
    const blobs = () => { ctx.beginPath(); circle(ctx, -18, 8, 30); circle(ctx, 16, 10, 28); circle(ctx, 0, -14, 32); };
    inked(ctx, blobs, 8);
    light(ctx, () => { ctx.beginPath(); circle(ctx, -8, -20, 20); circle(ctx, -24, 0, 14); });
  },
  [CELL.mist]: ctx => {
    ctx.beginPath(); circle(ctx, 0, 0, 50); ctx.fillStyle = BODY; ctx.fill();
    ctx.beginPath(); circle(ctx, -10, -10, 28); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.spark]: ctx => {
    poly(ctx, [[-58, 0], [0, -9], [58, 0], [0, 9]]); ctx.fillStyle = BODY; ctx.fill();
    poly(ctx, [[-36, 0], [8, -4], [52, 0], [8, 4]]); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.chip]: ctx => {
    inked(ctx, () => poly(ctx, [[-36, -18], [6, -40], [40, -8], [24, 34], [-28, 30]]));
    light(ctx, () => poly(ctx, [[-26, -14], [4, -30], [16, -12], [-10, 2]]));
  },
  [CELL.splinter]: ctx => {
    inked(ctx, () => poly(ctx, [[-56, 4], [-20, -10], [52, -6], [58, 2], [10, 12]]), 7);
    light(ctx, () => poly(ctx, [[-40, 0], [-14, -5], [40, -3], [-10, 3]]));
  },
  [CELL.leaf]: ctx => {
    const shape = () => { ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-6, -40, 50, 0); ctx.quadraticCurveTo(-6, 40, -50, 0); ctx.closePath(); };
    inked(ctx, shape, 7);
    light(ctx, () => { ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-4, -26, 44, 0); ctx.lineTo(-40, 3); ctx.closePath(); });
  },
  [CELL.drop]: ctx => {
    const shape = () => { ctx.beginPath(); ctx.moveTo(54, 0); ctx.quadraticCurveTo(10, -30, -22, -26); ctx.arc(-22, 0, 26, -Math.PI / 2, Math.PI / 2, true); ctx.quadraticCurveTo(10, 30, 54, 0); ctx.closePath(); };
    inked(ctx, shape, 7);
    light(ctx, () => { ctx.beginPath(); circle(ctx, -26, -8, 10); });
  },
  [CELL.tuft]: ctx => {
    const shape = () => poly(ctx, [[-34, 34], [-40, -6], [-26, 6], [-14, -46], [2, -2], [18, -40], [26, 4], [40, -12], [34, 34]]);
    inked(ctx, shape, 8);
    light(ctx, () => poly(ctx, [[-24, 26], [-14, -30], [-2, 4], [16, -26], [20, 26]]));
  },
  [CELL.star]: ctx => {
    inked(ctx, () => star(ctx, 5, 54, 24));
    light(ctx, () => poly(ctx, [[0, -50], [-12, -14], [-48, -14], [0, 0]]));
  },
  [CELL.ring]: ctx => {
    ctx.beginPath(); circle(ctx, 0, 0, 50); ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.stroke();
    ctx.beginPath(); circle(ctx, 0, 0, 50); ctx.strokeStyle = BODY; ctx.lineWidth = 9; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 49, Math.PI * 1.05, Math.PI * 1.6); ctx.strokeStyle = LIGHT; ctx.lineWidth = 4; ctx.stroke();
  },
  [CELL.plus]: ctx => {
    const shape = () => { ctx.beginPath(); ctx.roundRect(-14, -46, 28, 92, 10); ctx.roundRect(-46, -14, 92, 28, 10); };
    inked(ctx, shape, 10);
    light(ctx, () => { ctx.beginPath(); ctx.roundRect(-8, -40, 10, 30, 5); ctx.roundRect(-40, -8, 30, 10, 5); });
  },
  [CELL.shard]: ctx => {
    inked(ctx, () => poly(ctx, [[-30, 40], [-8, -48], [36, 26]]));
    light(ctx, () => poly(ctx, [[-20, 30], [-6, -30], [4, 18]]));
  },
  [CELL.twinkle]: ctx => {
    const shape = () => { ctx.beginPath(); ctx.moveTo(0, -56); ctx.quadraticCurveTo(6, -6, 56, 0); ctx.quadraticCurveTo(6, 6, 0, 56); ctx.quadraticCurveTo(-6, 6, -56, 0); ctx.quadraticCurveTo(-6, -6, 0, -56); ctx.closePath(); };
    shape(); ctx.fillStyle = BODY; ctx.fill();
    ctx.beginPath(); circle(ctx, 0, 0, 12); ctx.fillStyle = LIGHT; ctx.fill();
  },
  [CELL.alert]: ctx => {
    const shape = () => { ctx.beginPath(); ctx.moveTo(-17, -52); ctx.lineTo(17, -52); ctx.lineTo(10, 18); ctx.lineTo(-10, 18); ctx.closePath(); circle(ctx, 0, 40, 13); };
    inked(ctx, shape, 12);
    light(ctx, () => poly(ctx, [[-11, -46], [-2, -46], [-5, 8], [-8, 8]]));
  },
  [CELL.hole]: ctx => {
    star(ctx, 9, 50, 36, 0, [1, .85, 1.1, .9, 1, .8, 1.05, .92, 1]); ctx.fillStyle = LIGHT; ctx.fill();
    ctx.beginPath(); circle(ctx, 2, 2, 26); ctx.fillStyle = BODY; ctx.fill();
  },
  [CELL.scuff]: ctx => {
    ctx.beginPath(); circle(ctx, -12, 4, 34); circle(ctx, 16, -6, 30); circle(ctx, 4, 18, 26); ctx.fillStyle = BODY; ctx.fill();
    ctx.beginPath(); circle(ctx, 0, 2, 16); ctx.fillStyle = LIGHT; ctx.fill();
  },
};

// Built synchronously from code (no file to fetch), so every variant exists
// before the renderer's warm-up compiles and uploads. EffectsView owns and
// disposes the texture.
export function createEffectsAtlas(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE * ATLAS_COLUMNS; canvas.height = SIZE * ATLAS_ROWS;
  const ctx = canvas.getContext('2d')!;
  for (const [cell, draw] of Object.entries(DRAW)) {
    const index = Number(cell);
    ctx.save();
    ctx.translate((index % ATLAS_COLUMNS) * SIZE + SIZE / 2, Math.floor(index / ATLAS_COLUMNS) * SIZE + SIZE / 2);
    draw(ctx);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 1;
  return texture;
}
