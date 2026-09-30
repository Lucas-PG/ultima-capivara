// Writes review cameras aimed at derived vegetation dressing (wall vines, garden beds, forest floor):
// eye level in front of each sampled plant, facing it. npx tsx tools/qa/dressing-views.ts <out.json> [species] [count]
import { writeFileSync } from 'node:fs';
import { createWorld } from '../../src/shared/world';
import { vegetationDressing } from '../../src/shared/vegetation-dressing';
import { terrainHeight } from '../../src/shared/terrain';
const [out, species = 'vine', count = '6'] = process.argv.slice(2);
const world = createWorld(), plants = vegetationDressing(world).filter(p => p.species === species);
const views: Record<string, number[]> = {};
const step = Math.max(1, Math.floor(plants.length / Number(count)));
for (let i = 0; i < plants.length && Object.keys(views).length < Number(count); i += step) {
  const p = plants[i], d = species === 'vine' ? 7 : 4.5;
  // Vines face +z of their yaw; stand in front of the wall. Ground plants: stand south-west (lit side).
  const nx = species === 'vine' ? Math.sin(p.yaw) : -.85, nz = species === 'vine' ? Math.cos(p.yaw) : -.53;
  const x = p.x + nx * d, z = p.z + nz * d, y = terrainHeight(x, z) + 1.62;
  views[`${species}-${i}`] = [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +p.x.toFixed(2), +(species === 'vine' ? p.y - p.height * .5 : p.y + p.height * .4).toFixed(2), +p.z.toFixed(2), 60];
}
writeFileSync(out, JSON.stringify(views, null, 1));
console.log(Object.keys(views).join(' '));
