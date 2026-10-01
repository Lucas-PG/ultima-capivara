// Regenerates tools/qa/veg-views.json: the district review poses of the QA hook as free cameras (eye level,
// 70 degree vertical fov) plus the aerial overviews, so before/after captures always share the same cameras.
// npx tsx tools/qa/make-veg-views.ts
import { writeFileSync } from 'node:fs';
import { terrainHeight } from '../../src/shared/terrain';
const districts: Record<string, [number, number, number, number]> = {
  vila: [-1, -10, .48, .02], centro: [36, -6, .42, .02], forte: [4, -80, 0, .12], cachoeira: [-83, -13, 1.72, .08],
  morro: [-97, -66, Math.atan2(-2, -31), .08], porto: [78, -23, -1.84, 0], posto: [-22, 38, Math.PI, 0],
  farol: [3, 98, Math.PI, .25], praia: [-31, 95, Math.PI, 0], fazenda: [47, 80, -.63, 0], mangue: [86, 54, -1.2, 0], lagoa: [-65, 9, 1.22, .04],
};
const views: Record<string, number[]> = {};
const r = (n: number) => Math.round(n * 100) / 100;
for (const [name, [x, z, yaw, pitch]] of Object.entries(districts)) {
  const y = terrainHeight(x, z) + 1.62, d = 20;
  views[name] = [x, r(y), z, r(x - Math.sin(yaw) * d), r(y + Math.tan(pitch) * d), r(z - Math.cos(yaw) * d), 70];
}
views.airSW = [-120, 60, 120, -20, 0, 20, 65];
views.airNE = [120, 55, -110, 20, 0, 10, 65];
views.airPlane = [-40, 110, -150, 0, 0, 0, 62];
writeFileSync('tools/qa/veg-views.json', JSON.stringify(views, null, 1) + '\n');
console.log(Object.keys(views).join(' '));
