import * as THREE from 'three';
import type { MapObject, WorldSpec } from '../../shared/types';
import { vegetationDressing } from '../../shared/vegetation-dressing';
import { isBatchedPlant, plantHash, SPECIES } from '../../shared/vegetation-species';
import { plantTransform } from '../../shared/vegetation-trunks';
import type { PlantInstance } from './batch';

const UP = new THREE.Vector3(0, 1, 0);
const yaw = new THREE.Quaternion(), lean = new THREE.Quaternion(), axis = new THREE.Vector3(), scale = new THREE.Vector3();

/** The instance matrix of a plant: scale, then yaw, then lean, then translation.
 * `plantTrunkSections` applies the same order, so the rendered trunk and any collider agree. */
export function plantMatrix(object: MapObject, target = new THREE.Matrix4()) {
  const t = plantTransform(object);
  yaw.setFromAxisAngle(UP, t.yaw);
  axis.set(Math.sin(t.leanDirection), 0, -Math.cos(t.leanDirection));
  lean.setFromAxisAngle(axis, t.lean).multiply(yaw);
  return target.compose(new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z), lean,
    scale.set(t.radialScale, t.heightScale, t.radialScale));
}

/** Per-instance tint: neighbouring plants of one species never share the exact same green. */
const tint = (x: number, z: number) => {
  const v = plantHash(Math.round(x * 100), Math.round(z * 100));
  return new THREE.Color(.94 + v * .08, .97 + v * .04, 1.03 - v * .13);
};

/** Every tree, palm and authored ground plant of the world spec, plus the derived dressing
 * (kit bushes, wall vines, garden beds, forest floor), becomes one plant instance. */
export function collectPlants(world: Pick<WorldSpec, 'objects'> & Partial<WorldSpec>): PlantInstance[] {
  const plants: PlantInstance[] = [];
  for (const object of world.objects) {
    if (!isBatchedPlant(object)) continue;
    const t = plantTransform(object);
    plants.push({ species: t.species, variant: t.variant, matrix: plantMatrix(object),
      position: new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z), color: tint(object.pos.x, object.pos.z) });
  }
  if (world.colliders && world.districts) for (const d of vegetationDressing(world as WorldSpec)) {
    const s = d.height / SPECIES[d.species].height, position = new THREE.Vector3(d.x, d.y, d.z);
    plants.push({ species: d.species, variant: d.variant, position, color: tint(d.x, d.z),
      matrix: new THREE.Matrix4().compose(position, yaw.setFromAxisAngle(UP, d.yaw).clone(), scale.set(s * (d.widthScale ?? 1), s, s)) });
  }
  return plants;
}
