import * as THREE from 'three';
import type { Settings, WorldSpec } from '../shared/types';
import type { SpeciesId } from '../shared/vegetation-species';
import { PlantBatch } from './vegetation/batch';
import { createFoliageMaterial } from './vegetation/foliage-material';
import { collectPlants } from './vegetation/plants';
import { buildTemplates } from './vegetation/templates';

/** Trees and palms of the world spec, drawn as one batched mesh with per-instance LOD and wind. */
export function buildVegetation(world: WorldSpec, atlas?: THREE.Texture) {
  const group = new THREE.Group();
  group.name = 'vegetation-root';
  const { material, uniforms } = createFoliageMaterial(atlas);
  const plants = collectPlants(world);
  const templates = buildTemplates(new Set<SpeciesId>(plants.map(plant => plant.species)));
  const batch = new PlantBatch(material, templates, plants.filter(plant => templates[plant.species]));
  batch.mesh.castShadow = true;
  batch.mesh.receiveShadow = true;
  group.add(batch.mesh);
  return { group, batch,
    setQuality(quality: Settings['graphics']) { batch.setQuality(quality); },
    update(time: number, camera?: THREE.Camera) {
      uniforms.uTime.value = time;
      if (camera) batch.update(camera);
    },
    dispose() { batch.dispose(); material.dispose(); } };
}
