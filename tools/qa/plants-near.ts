// Lists the plants of the world spec nearest to a point, to aim review cameras at real specimens.
// npx tsx tools/qa/plants-near.ts <x> <z> [count] [species]
import { createWorld } from '../../src/shared/world';
import { plantSpecies } from '../../src/shared/vegetation-species';
import { terrainHeight } from '../../src/shared/terrain';
const [x, z, count = '8', filter] = process.argv.slice(2);
const world = createWorld();
const rows = world.objects.filter(o => o.kind === 'tree' || o.kind === 'palm')
  .map(o => ({ o, species: plantSpecies(o), d: Math.hypot(o.pos.x - Number(x), o.pos.z - Number(z)) }))
  .filter(r => !filter || r.species === filter).sort((a, b) => a.d - b.d).slice(0, Number(count));
for (const r of rows) console.log(`${r.species.padEnd(11)} x=${r.o.pos.x.toFixed(1)} z=${r.o.pos.z.toFixed(1)} y=${r.o.pos.y.toFixed(2)} h=${r.o.scale.y.toFixed(1)} d=${r.d.toFixed(1)} ground=${terrainHeight(r.o.pos.x, r.o.pos.z).toFixed(2)}`);
