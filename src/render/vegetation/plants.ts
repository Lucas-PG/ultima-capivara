import * as THREE from 'three';
import type { MapObject, WorldSpec } from '../../shared/types';
import { fieldRows, onFieldRow, vegetationDressing } from '../../shared/vegetation-dressing';
import { isBatchedPlant, plantHash, SPECIES } from '../../shared/vegetation-species';
import { plantTransform } from '../../shared/vegetation-trunks';
import { groundPaint } from '../ground-cover';
import { isletPalms } from '../island-backdrop';
import { FOLIAGE_TILES } from './atlas';
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

/** Meadow drifts take the ground's paint (a little lighter: long grass catches more sun), so they
 * read as the field grown long rather than as dark tufts on it. Linear-space tint over the tile mean. */
const meadowTint = (x: number, z: number, variant: number) => {
  const mean = FOLIAGE_TILES['wild-grass'].mean ?? [.5, .5, .5], ground = groundPaint(x, z);
  const have = new THREE.Color().setRGB(mean[0], mean[1], mean[2], THREE.SRGBColorSpace);
  const lift = variant ? [1.12, 1.12, 1.02] : [1.2, 1.12, .9];
  return new THREE.Color(ground.r / have.r * lift[0], ground.g / have.g * lift[1], ground.b / have.b * lift[2]);
};

/** Every tree, palm and authored ground plant of the world spec, plus the derived dressing
 * (kit bushes, wall vines, garden beds, forest floor), becomes one plant instance. */
export function collectPlants(world: Pick<WorldSpec, 'objects'> & Partial<WorldSpec>): PlantInstance[] {
  const plants: PlantInstance[] = [], rows = fieldRows(world);
  for (const object of world.objects) {
    if (!isBatchedPlant(object) || onFieldRow(object, rows)) continue;
    const t = plantTransform(object);
    plants.push({ species: t.species, variant: t.variant, matrix: plantMatrix(object),
      position: new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z), color: tint(object.pos.x, object.pos.z) });
  }
  if (world.colliders && world.districts) for (const d of vegetationDressing(world as WorldSpec)) {
    const s = d.height / SPECIES[d.species].height, position = new THREE.Vector3(d.x, d.y, d.z);
    plants.push({ species: d.species, variant: d.variant, position, color: d.species === 'meadow' ? meadowTint(d.x, d.z, d.variant) : tint(d.x, d.z),
      matrix: new THREE.Matrix4().compose(position, yaw.setFromAxisAngle(UP, d.yaw).clone(), scale.set(s * (d.widthScale ?? 1), s, s)) });
  }
  // The offshore islets' beach palms join the batch like any other palm, after the island's own.
  for (const palm of isletPalms(world)) plants.push({ species: 'coconut', variant: plantTransform(palm).variant, matrix: plantMatrix(palm),
    position: new THREE.Vector3(palm.pos.x, palm.pos.y, palm.pos.z), color: tint(palm.pos.x, palm.pos.z) });
  return plants;
}
