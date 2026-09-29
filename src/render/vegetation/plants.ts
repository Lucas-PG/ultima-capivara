import * as THREE from 'three';
import type { MapObject } from '../../shared/types';
import { plantHash } from '../../shared/vegetation-species';
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

/** Every tree and palm of the world spec becomes one plant instance. */
export function collectPlants(objects: readonly MapObject[]): PlantInstance[] {
  const plants: PlantInstance[] = [];
  for (const object of objects) {
    if (object.kind !== 'tree' && object.kind !== 'palm') continue;
    const t = plantTransform(object);
    const v = plantHash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100));
    plants.push({ species: t.species, variant: t.variant, matrix: plantMatrix(object),
      position: new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z),
      color: new THREE.Color(.94 + v * .08, .97 + v * .04, 1.03 - v * .13) });
  }
  return plants;
}
