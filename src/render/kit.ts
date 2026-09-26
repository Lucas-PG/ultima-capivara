import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetLoader } from './assets';
import pieces from '../shared/kit-pieces.json';
import { createToonMaterial } from './materials';
import { kitInteriorLight, paintKitPlacement } from './kit-interior';

export interface KitPlacement {
  piece: string; x: number; y: number; z: number; yaw: number; scale?: number;
  paintVariant?: 0 | 1 | 2; interiorFloor?: 'wood' | 'warm-tile';
}
export interface KitScene {
  ready: Promise<void>;
  update(camera: THREE.Camera, time?: number): void;
  dispose(): void;
}
export const KIT_ASSET_PATH = 'models/kit/kit.glb';
const CELL_SIZE = 40;
const PLANT_CELL_SIZE = 8;
const FURNITURE_CELL_SIZE = 8;
const FAR_LOD = 32;
const SOFT_LANDSCAPE = new Set(['bush_cluster', 'hedge']);
const ROOM_FURNITURE = new Set(['bed', 'interior_counter', 'table', 'chair', 'shelf_pottery', 'rug',
  'wardrobe', 'sofa', 'potted_plant', 'hammock', 'stove', 'wall_picture']);
type Definition = { footprint: number[]; height: number; colliders: { type: string; x: number; y: number; z: number; width?: number; height: number; depth?: number; radius?: number; yaw?: number }[] };
const definitions: Record<string, Definition> = pieces;

// Quantized attributes must become floats BEFORE any matrix transform. Writing
// metre coordinates back into normalized Int16 attributes wraps their values.
function editableGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name);
    const array = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++)
      array[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
  }
  return geometry;
}

/** Shared atlas, one merged draw per visible cell, authored near/distant geometry. */
export function createKit(scene: THREE.Scene | THREE.Group, assets: AssetLoader,
  placements: readonly KitPlacement[], quality = 'medium'): KitScene {
  const root = new THREE.Group(); root.name = 'Ilha_modular'; scene.add(root);
  const cells = new Map<string, { origin: THREE.Vector3; placements: KitPlacement[]; lod: THREE.LOD;
    landscape: boolean; furniture: boolean; fades: boolean; material?: THREE.MeshStandardMaterial }>();
  const geometries = new Set<THREE.BufferGeometry>();
  const temporaryMaterials = new Set<THREE.Material>();
  let disposed = false;
  let releaseSource: (() => void) | undefined;
  let updateInterior: ((camera: THREE.Camera) => void) | undefined;
  for (const placement of placements) {
    if (![placement.x, placement.y, placement.z, placement.yaw, placement.scale ?? 1].every(Number.isFinite) || (placement.scale ?? 1) <= 0)
      throw new Error(`Posição de peça inválida: ${placement.piece}.`);
    // Keep traversable planting independent from the 40 m structural batches.
    // Flower beds retain visible borders at distance because they have collision.
    const fades = SOFT_LANDSCAPE.has(placement.piece) && definitions[placement.piece]?.colliders.length === 0;
    const landscape = fades || placement.piece === 'flower_bed';
    // Room props use their authored simplification before tiny bevels reach a
    // pixel. They remain opaque and visible wherever solid collision exists.
    const furniture = ROOM_FURNITURE.has(placement.piece);
    const size = landscape ? PLANT_CELL_SIZE : furniture ? FURNITURE_CELL_SIZE : CELL_SIZE;
    const cx = Math.floor(placement.x / size), cz = Math.floor(placement.z / size);
    const key = `${fades ? 'plants' : landscape ? 'flowers' : furniture ? 'furniture' : 'solid'}:${cx}:${cz}`;
    let cell = cells.get(key);
    if (!cell) {
      const origin = new THREE.Vector3((cx + .5) * size, 0, (cz + .5) * size);
      const lod = new THREE.LOD(); lod.name = `kit:${key}`; lod.position.copy(origin); lod.autoUpdate = false;
      root.add(lod); cell = { origin, placements: [], lod, landscape, furniture, fades }; cells.set(key, cell);
    }
    cell.placements.push(placement);
  }
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const place = (placement: KitPlacement, origin: THREE.Vector3) => {
    position.set(placement.x, placement.y, placement.z).sub(origin);
    rotation.setFromAxisAngle(axis, placement.yaw); scale.setScalar(placement.scale ?? 1);
    return matrix.compose(position, rotation, scale);
  };
  const placeholder = (id: string): THREE.BufferGeometry => {
    const def = definitions[id];
    const parts: THREE.BufferGeometry[] = [];
    // Metadata placeholders preserve open doors and walkable decks during loading.
    for (const c of def?.colliders || []) {
      const geometry = c.type === 'cylinder' ? new THREE.CylinderGeometry(c.radius, c.radius, c.height, 12) :
        new THREE.BoxGeometry(c.width, c.height, c.depth);
      geometry.rotateY(c.yaw || 0); geometry.translate(c.x, c.y, c.z); parts.push(geometry);
    }
    const merged = parts.length ? mergeGeometries(parts)! : new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
    parts.forEach(part => part.dispose()); return merged;
  };
  const placeholderMaterial = createToonMaterial('plaster', { color: '#D5B68B' });
  temporaryMaterials.add(placeholderMaterial);
  const fallbackSources = new Map<string, THREE.BufferGeometry>();
  for (const cell of cells.values()) {
    if (cell.landscape || cell.furniture) {
      cell.origin.set(0, 0, 0);
      for (const p of cell.placements) cell.origin.add(new THREE.Vector3(p.x, p.y, p.z));
      cell.origin.divideScalar(cell.placements.length); cell.lod.position.copy(cell.origin);
    }
    const parts = cell.placements.map(placement => {
      let source = fallbackSources.get(placement.piece);
      if (!source) { source = placeholder(placement.piece); fallbackSources.set(placement.piece, source); }
      return source.clone().applyMatrix4(place(placement, cell.origin));
    });
    const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, placeholderMaterial); mesh.castShadow = !cell.landscape && !cell.furniture; mesh.receiveShadow = true;
    cell.lod.addLevel(mesh, 0);
  }
  fallbackSources.forEach(source => source.dispose());

  const ready = placements.length ? assets.gltf(KIT_ASSET_PATH).then(asset => {
    const sourceGeometries = new Set<THREE.BufferGeometry>(), sourceMaterials = new Set<THREE.Material>(), sourceTextures = new Set<THREE.Texture>();
    asset.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      sourceGeometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        sourceMaterials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) sourceTextures.add(value);
      }
    });
    releaseSource = () => {
      sourceGeometries.forEach(geometry => geometry.dispose());
      sourceMaterials.forEach(material => material.dispose()); sourceTextures.forEach(texture => texture.dispose());
    };
    if (disposed) { releaseSource(); return; }
    asset.scene.updateMatrixWorld(true);
    // The kit owns this model for the scene lifetime; all cells share its material.
    const sourceMaterial = ((asset.scene.getObjectByProperty('isMesh', true) as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
    sourceMaterials.add(sourceMaterial);
    sourceMaterial.roughness = Math.max(.85, sourceMaterial.roughness); sourceMaterial.metalness = 0;
    updateInterior = kitInteriorLight(sourceMaterial, asset.scene, placements);
    const sourceGeometry = new Map<string, THREE.BufferGeometry>();
    for (const id of new Set(placements.map(placement => placement.piece))) {
      for (let level = 0; level < 3; level++) {
        const mesh = asset.scene.getObjectByName(`${id}_LOD${level}`) as THREE.Mesh | undefined;
        if (mesh?.isMesh) sourceGeometry.set(`${id}:${level}`, editableGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld));
      }
    }
    for (const cell of cells.values()) {
      if (cell.fades) {
        // Opaque alpha hashing fades soft cover without sorted transparent layers.
        // Only zero-collider plants can disappear, never a walkable bed or wall.
        cell.material = sourceMaterial.clone(); cell.material.alphaHash = true;
      }
      for (const entry of cell.lod.levels) {
        const geometry = (entry.object as THREE.Mesh).geometry;
        geometry.dispose(); geometries.delete(geometry);
      }
      cell.lod.clear(); cell.lod.levels.length = 0;
      for (let level = 0; level < 3; level++) {
        const parts: THREE.BufferGeometry[] = [];
        for (const placement of cell.placements) {
          const source = sourceGeometry.get(`${placement.piece}:${level}`) || sourceGeometry.get(`${placement.piece}:0`);
          if (!source) {
            // Future piece IDs can be placed before their mesh lands.
            const geometry = placeholder(placement.piece);
            const count = geometry.getAttribute('position').count;
            geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4).fill(.82), 4));
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2).fill(.12), 2));
            parts.push(geometry.applyMatrix4(place(placement, cell.origin)));
          } else {
            const geometry = source.clone(); paintKitPlacement(geometry, placement);
            parts.push(geometry.applyMatrix4(place(placement, cell.origin)));
          }
        }
        const geometry = mergeGeometries(parts);
        parts.forEach(part => part.dispose());
        if (!geometry) throw new Error('Não foi possível montar as peças da ilha.');
        geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometries.add(geometry);
        const mesh = new THREE.Mesh(geometry, cell.material ?? sourceMaterial); mesh.name = `${cell.lod.name}:LOD${level}`;
        mesh.castShadow = !cell.landscape && !cell.furniture; mesh.receiveShadow = true;
        const near = cell.furniture ? (quality === 'low' ? 8 : quality === 'high' ? 12 : 10) : cell.landscape ? (quality === 'low' ? 9 : 14) : quality === 'low' ? 24 : FAR_LOD;
        const far = cell.furniture ? (quality === 'low' ? 20 : quality === 'high' ? 27 : 23) : cell.landscape ? (quality === 'low' ? 20 : 27) : quality === 'low' ? 65 : 90;
        cell.lod.addLevel(mesh, level === 2 ? far : level ? near : 0, .12);
      }
    }
    sourceGeometry.forEach(geometry => geometry.dispose());
    temporaryMaterials.forEach(material => material.dispose()); temporaryMaterials.clear();
  }) : Promise.resolve();
  // Let the caller's readiness barrier report failure without an unhandled rejection.
  void ready.catch(() => {});
  const eye = new THREE.Vector3(), center = new THREE.Vector3();
  return {
    ready,
    update(camera) {
      if (disposed) return;
      camera.getWorldPosition(eye);
      updateInterior?.(camera);
      for (const cell of cells.values()) {
        if (cell.fades) {
          cell.lod.getWorldPosition(center);
          const distance = Math.hypot(center.x - eye.x, center.z - eye.z);
          const reach = quality === 'low' ? 35 : 45;
          cell.lod.visible = distance < reach;
          if (cell.material) cell.material.opacity = THREE.MathUtils.clamp((reach - distance) / 10, 0, 1);
          if (!cell.lod.visible) continue;
        }
        // LOD handles distance and hysteresis; Three frustum-culls cell geometry.
        cell.lod.update(camera);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent();
      geometries.forEach(geometry => geometry.dispose()); geometries.clear();
      temporaryMaterials.forEach(material => material.dispose()); temporaryMaterials.clear();
      cells.forEach(cell => cell.material?.dispose());
      releaseSource?.();
      cells.clear();
    },
  };
}
