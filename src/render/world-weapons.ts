import * as THREE from 'three';
import type { WeaponId } from '../shared/types';
import data from './world-weapon-data.json';

export const WORLD_ARSENAL_ATLAS = 'textures/world-arsenal.webp';
let material: THREE.MeshStandardMaterial | undefined;
// Shared by held and instanced ground weapons: the first-person arsenal's baked
// paint packed into one atlas. Other loot keeps its own paint.
export function worldWeaponMaterial(): THREE.MeshStandardMaterial {
  if (!material) {
    // Headless tests have no image decoder; the material contract stays the same.
    const map = typeof document === 'undefined' || typeof document.createElementNS !== 'function' ? new THREE.Texture() : new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}${WORLD_ARSENAL_ATLAS}`);
    map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.name = 'world-arsenal';
    material = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .6, metalness: .15 });
    material.name = 'world-arsenal';
  }
  return material;
}

export function worldWeaponGeometry(id: WeaponId, detail: 'near' | 'far'): THREE.BufferGeometry {
  const packed = data[id][detail], geometry = new THREE.BufferGeometry();
  geometry.name = `painted-world:${id}:${detail}`;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(packed.position.map(value => value / 100000), 3));
  geometry.setAttribute('normal', new THREE.Int16BufferAttribute(packed.normal, 3, true));
  geometry.setAttribute('uv', new THREE.Uint16BufferAttribute(packed.uv, 2, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute(packed.color, 3, true));
  geometry.setIndex(packed.index);
  geometry.computeBoundingSphere();
  return geometry;
}
