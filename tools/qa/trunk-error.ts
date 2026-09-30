// Prints where a rendered trunk deviates most from the shared collision sections.
// npx tsx tools/qa/trunk-error.ts <detail> <height> [kind]
import * as THREE from 'three';
import { plantMatrix } from '../../src/render/vegetation/plants';
import { TRUNK_KINDS } from '../../src/render/vegetation/mesh-builder';
import { buildTemplates } from '../../src/render/vegetation/templates';
import { plantSpecies, plantVariant } from '../../src/shared/vegetation-species';
import { plantTrunkSections } from '../../src/shared/vegetation-trunks';
import type { MapObject } from '../../src/shared/types';
const [detail, height, kind = 'tree'] = process.argv.slice(2);
const object: MapObject = { id: 's', kind: kind as 'tree', detail, pos: { x: 18, y: 1.2, z: -34 }, scale: { x: 1, y: Number(height), z: 1 }, rotation: 1.17, color: '#000' };
const species = plantSpecies(object), sections = plantTrunkSections(object);
const g = buildTemplates(new Set([species]))[species][plantVariant(object, species)][0];
const pos = g.getAttribute('position'), aux = g.getAttribute('aux'), m = plantMatrix(object);
let worst = { e: -Infinity, y: 0, i: 0 };
for (let i = 0; i < pos.count; i++) {
  if (!TRUNK_KINDS.includes(aux.getY(i))) continue;
  const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
  const e = Math.min(...sections.map((s, k) => {
    const a = new THREE.Vector3().copy(s.a), b = new THREE.Vector3().copy(s.b), axis = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(v.clone().sub(a).dot(axis) / axis.lengthSq(), 0, 1);
    return v.distanceTo(a.addScaledVector(axis, t)) - THREE.MathUtils.lerp(s.radiusBottom, s.radiusTop, t);
  }));
  if (e > worst.e) worst = { e, y: v.y - object.pos.y, i };
}
console.log(species, 'sections', sections.length, 'worst error', worst.e.toFixed(4), 'at height', worst.y.toFixed(2));
sections.forEach((s, k) => console.log(k, 'y', (s.a.y - object.pos.y).toFixed(2), '->', (s.b.y - object.pos.y).toFixed(2), 'r', s.radiusBottom.toFixed(3), s.radiusTop.toFixed(3)));
