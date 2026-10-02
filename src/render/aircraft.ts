import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetEntry } from './asset-manifest';
import metrics from '../../public/models/aircraft/metrics.json';

/** Original Blender aircraft and canopy. Their origins match the host's existing
 * plane position and the capybara's foot root; no flight or glide rule lives here. */
export const AIRCRAFT_ASSET_ENTRY: AssetEntry = {
  path: 'models/aircraft/aircraft.glb', kind: 'glb', bytes: metrics.bytes, label: 'Avião e paraquedas',
};
let aircraft: GLTF | null = null;
let generation = 0;

function mesh(kind: string, level: number, tint?: string): THREE.Mesh {
  const source = aircraft?.scene.getObjectByName(`${kind}_LOD${level}`);
  if (!(source instanceof THREE.Mesh) || !(source.material instanceof THREE.MeshStandardMaterial))
    throw new Error(`Peça do avião ausente: ${kind}_LOD${level}`);
  // Each instance owns its resources, matching the avatar and renderer disposal
  // contract. Keep the export transform on the mesh: writing metre positions
  // into normalized integer buffers would clamp Meshopt vertices to a cube.
  const geometry = source.geometry.clone();
  const material = source.material.clone();
  material.vertexColors = true;
  material.forceSinglePass = true;
  if (tint) material.color.set(tint);
  if (kind === 'plane_glass') { material.depthWrite = false; material.side = THREE.DoubleSide; }
  const result = new THREE.Mesh(geometry, material);
  result.name = source.name;
  result.applyMatrix4(source.matrixWorld);
  result.castShadow = kind !== 'plane_glass';
  result.receiveShadow = true;
  return result;
}

function levels(target: THREE.LOD, kinds: readonly string[], distances: readonly number[], tint?: string) {
  for (let level = 0; level < 3; level++) {
    const group = new THREE.Group();
    for (const kind of kinds) group.add(mesh(kind, level, kind === 'chute_team' ? tint : undefined));
    target.addLevel(group, distances[level], .12);
  }
}

/** Keep the two direct propeller children stable: GameRenderer captures those
 * references before warmup and continues its existing time-based spin. */
export function makePlane(): THREE.Group {
  const plane = new THREE.Group(); plane.name = 'Avião Capivara';
  const body = new THREE.LOD(); body.name = 'Fuselagem'; plane.add(body);
  for (const point of metrics.propellers) {
    const propeller = new THREE.Group(); propeller.name = 'propeller';
    propeller.position.fromArray(point); propeller.add(new THREE.LOD()); plane.add(propeller);
  }
  return plane;
}

/** Awaited by the renderer's readiness barrier before any avatar or GPU upload.
 * A missing/corrupt model is a loading failure, never a late airborne swap. */
export async function preloadAircraftAsset(load: (path: string) => Promise<GLTF>, plane: THREE.Group): Promise<void> {
  const token = generation;
  const source = await load(AIRCRAFT_ASSET_ENTRY.path);
  if (token !== generation) { disposeSource(source); throw new Error('O carregamento do avião foi cancelado.'); }
  source.scene.updateMatrixWorld(true);
  for (const kind of ['plane_body', 'plane_glass', 'plane_propeller', 'chute_base', 'chute_team'])
    for (let level = 0; level < 3; level++) {
      const part = source.scene.getObjectByName(`${kind}_LOD${level}`);
      if (!(part instanceof THREE.Mesh) || !(part.material instanceof THREE.MeshStandardMaterial)) {
        disposeSource(source);
        throw new Error(`Modelo do avião incompleto: ${kind}_LOD${level}`);
      }
    }
  aircraft = source;
  const body = plane.getObjectByName('Fuselagem') as THREE.LOD;
  if (body.levels.length) return;
  levels(body, ['plane_body', 'plane_glass'], metrics.planeDistances);
  for (const propeller of plane.children.filter(child => child.name === 'propeller'))
    levels(propeller.children[0] as THREE.LOD, ['plane_propeller'], metrics.planeDistances);
}

/** Two draws per canopy at every distance. Six colored cells use the actor's kit
 * tint; the cream panels, seams, load lines, risers and harness share one mesh. */
export function makeParachute(kit: string): THREE.Group {
  if (!aircraft) throw new Error('O paraquedas ainda não está pronto.');
  const chute = new THREE.Group(); chute.name = 'Paraquedas Capivara';
  const lod = new THREE.LOD(); lod.name = 'Velame e tirantes';
  levels(lod, ['chute_base', 'chute_team'], metrics.chuteDistances, kit);
  chute.add(lod);
  return chute;
}

function disposeSource(source: GLTF): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  source.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function disposeAircraftAssets(): void {
  generation++;
  if (aircraft) disposeSource(aircraft);
  aircraft = null;
}
