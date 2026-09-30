// Prints triangles, vertices and extents of every plant template per LOD.
// npx tsx tools/qa/template-stats.ts
import * as THREE from 'three';
import { SPECIES_IDS, SPECIES } from '../../src/shared/vegetation-species';
import { buildTemplates } from '../../src/render/vegetation/templates';
const templates = buildTemplates(new Set(SPECIES_IDS));
let totalVertices = 0;
for (const [species, variants] of Object.entries(templates)) variants.forEach((lods, v) => {
  const row = lods.map(g => {
    const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute), size = box.getSize(new THREE.Vector3());
    totalVertices += g.getAttribute('position').count;
    return `${String(g.index!.count / 3).padStart(5)} tris ${String(g.getAttribute('position').count).padStart(5)} v  ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`;
  });
  console.log(`${species.padEnd(10)} v${v} h=${SPECIES[species as keyof typeof SPECIES].height}  ${row.join('  |  ')}`);
});
console.log('total vertices', totalVertices);
