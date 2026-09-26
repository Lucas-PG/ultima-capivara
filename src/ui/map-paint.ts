import { KIT_PIECES } from '../shared/kit-collision';
import { NAV_ROUTES, ROADS } from '../shared/layout';
import { beachDistance, terrainHeight } from '../shared/terrain';
import { WATER_LEVEL } from '../shared/water';
import type { WorldSpec } from '../shared/types';

const mix = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const SEA = [39, 112, 133], SHALLOWS = [80, 175, 170], FOAM = [188, 223, 192];
const SAND = [226, 200, 143], GRASS = [127, 160, 87], HILL = [171, 163, 111];

// One metre samples at the normal 4 px/m bake. The raster is reused by both maps,
// including Low; no terrain sampling, noise or roof construction happens per HUD tick.
export function terrainMapPixels(worldSize: number, pixels: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * pixels * 4), step = 4, side = Math.ceil(pixels / step);
  const heights = new Float32Array(side * side), metres = worldSize / pixels;
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++)
    heights[j * side + i] = terrainHeight((i * step + step / 2) * metres - worldSize / 2, (j * step + step / 2) * metres - worldSize / 2);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    const x = (i * step + step / 2) * metres - worldSize / 2, z = (j * step + step / 2) * metres - worldSize / 2;
    const h = heights[j * side + i], water = h < WATER_LEVEL;
    const dx = (heights[j * side + Math.min(side - 1, i + 1)] - heights[j * side + Math.max(0, i - 1)]) / (step * metres * 2);
    const dz = (heights[Math.min(side - 1, j + 1) * side + i] - heights[Math.max(0, j - 1) * side + i]) / (step * metres * 2);
    const beach = !water && h < 3 && beachDistance(x, z) > 0;
    let a: number[], b: number[], blend: number;
    if (water) { a = SEA; b = SHALLOWS; blend = (h - WATER_LEVEL + 4) / 4; }
    else if (beach || h < .85) { a = SAND; b = GRASS; blend = beach ? 0 : (h - .45) / .4; }
    else { a = GRASS; b = HILL; blend = (h - 4) / 16; }
    if (!water && ROADS.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) { a = b = [201, 184, 139]; blend = 0; }
    const brush = Math.sin(x * .47 + Math.sin(z * .21) * 2) * Math.sin(z * .63) * 3;
    const shade = water ? brush : Math.max(-25, Math.min(22, -(dx + dz) * 13)) + brush;
    const shore = Math.max(0, 1 - Math.abs(h - WATER_LEVEL) / .22);
    const contour = !water && h > 4 && (h / 2 - Math.floor(h / 2)) > .92 ? -7 : 0;
    for (let yy = j * step; yy < Math.min(pixels, (j + 1) * step); yy++) for (let xx = i * step; xx < Math.min(pixels, (i + 1) * step); xx++) {
      const grain = ((Math.imul(xx + 19, 374761393) ^ Math.imul(yy + 47, 668265263)) >>> 27) / 8 - 2;
      const index = (yy * pixels + xx) * 4;
      for (let c = 0; c < 3; c++) data[index + c] = mix(mix(a[c], b[c], blend) + shade + grain + contour, FOAM[c], shore * .8);
      data[index + 3] = 255;
    }
  }
  return data;
}

export function paintIslandMap(canvas: HTMLCanvasElement, world: WorldSpec, ppm: number) {
  const px = Math.round(world.size * ppm), ctx = canvas.getContext('2d')!;
  canvas.width = canvas.height = px;
  const image = ctx.createImageData(px, px); image.data.set(terrainMapPixels(world.size, px)); ctx.putImageData(image, 0, 0);
  const map = (v: number) => (v + world.size / 2) * ppm;
  ctx.lineCap = ctx.lineJoin = 'round';
  // Routes come from the same authored paths used to shape the terrain and navigation.
  for (const route of NAV_ROUTES) {
    ctx.beginPath(); let drawing = false;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1], [bx, bz] = route[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let j = 0; j <= steps; j++) {
        const x = mix(ax, bx, j / steps), z = mix(az, bz, j / steps);
        if (terrainHeight(x, z) < WATER_LEVEL) { drawing = false; continue; }
        if (drawing) ctx.lineTo(map(x), map(z)); else ctx.moveTo(map(x), map(z)); drawing = true;
      }
    }
    ctx.strokeStyle = 'rgba(99,79,43,.22)'; ctx.lineWidth = ppm * 2.7; ctx.stroke();
    ctx.strokeStyle = '#cfbf8b'; ctx.lineWidth = ppm * 1.6; ctx.stroke();
  }
  for (const object of world.objects) if (object.detail === 'courtyard') {
    ctx.fillStyle = '#ddcc9a'; ctx.fillRect(map(object.pos.x - object.scale.x / 2), map(object.pos.z - object.scale.z / 2), object.scale.x * ppm, object.scale.z * ppm);
  }
  // A roof is a single warm block from the kit footprint, never individual wall colliders.
  for (const piece of world.pieces ?? []) {
    const def = KIT_PIECES[piece.piece]; if (!def) continue;
    const roof = /^(house_|church$|market_hall$|warehouse$|barn$|beach_kiosk$)/.test(piece.piece);
    const stone = /^(fort_wall|fort_tower|fort_gate|lighthouse|bridge_stone)$/.test(piece.piece);
    const dock = piece.piece === 'dock_wood';
    if (!roof && !stone && !dock) continue;
    const w = def.footprint[0] * (piece.scale ?? 1) * ppm, d = def.footprint[1] * (piece.scale ?? 1) * ppm;
    ctx.save(); ctx.translate(map(piece.x), map(piece.z)); ctx.rotate(-piece.yaw);
    ctx.fillStyle = 'rgba(66,52,30,.28)'; ctx.fillRect(-w / 2 + ppm * .5, -d / 2 + ppm * .65, w, d);
    ctx.fillStyle = roof ? '#ba6845' : dock ? '#b68b56' : '#b7a77c';
    ctx.strokeStyle = roof ? '#734c34' : '#817655'; ctx.lineWidth = Math.max(1, ppm * .3);
    ctx.fillRect(-w / 2, -d / 2, w, d); ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.fillStyle = roof ? '#de9963' : '#d8c69a'; ctx.fillRect(-w / 2 + ppm * .35, -d / 2 + ppm * .35, w - ppm * .7, d * .42);
    if (roof) { ctx.strokeStyle = '#f2c98a'; ctx.beginPath(); ctx.moveTo(-w / 2 + ppm * .4, 0); ctx.lineTo(w / 2 - ppm * .4, 0); ctx.stroke(); }
    ctx.restore();
  }
  // Deliberate, sparse brush marks follow actual foliage placements.
  ctx.fillStyle = 'rgba(47,104,64,.28)';
  for (const object of world.objects) if (object.kind === 'tree' || object.kind === 'palm') {
    const r = Math.min(2.2, Math.max(.7, object.scale.x * .3)) * ppm;
    ctx.beginPath(); ctx.ellipse(map(object.pos.x), map(object.pos.z), r, r * .65, -.4, 0, Math.PI * 2); ctx.fill();
  }
}

// A cached paper compass keeps the same north-up convention as the player markers.
export function paintMapCompass(canvas: HTMLCanvasElement) {
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(48, 64); ctx.lineJoin = 'round';
  ctx.fillStyle = '#f7e8ba'; ctx.strokeStyle = '#6c5037'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 2); ctx.fillStyle = i === 0 ? '#c8673f' : '#b19762';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#f6d16f'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = '30px "Dela Gothic One","Arial Black",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4;
  ctx.strokeText('N', 0, -34); ctx.fillStyle = '#fff4d6'; ctx.fillText('N', 0, -34);
}
