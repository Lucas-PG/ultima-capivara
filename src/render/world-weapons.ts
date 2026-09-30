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
  return unpack(data[id][detail], `painted-world:${id}:${detail}`);
}

export function worldM4PartGeometry(part: 'nearBody' | 'nearMag'): THREE.BufferGeometry {
  const packed = (data.m4 as unknown as Record<string, typeof data.m4.near>)[part];
  const geometry = unpack(packed, `painted-world:m4:${part}`);
  if (part === 'nearMag') geometry.translate(0, -.02, .071);
  return geometry;
}

export function worldShortPartGeometries(id: 'pistol' | 'smg' | 'revolver') {
  const source = data[id] as unknown as { nearBody: typeof data.m4.near;
    parts: Record<string, { pivot: [number, number, number]; geometry: typeof data.m4.near }> };
  return { body: unpack(source.nearBody, `painted-world:${id}:nearBody`),
    parts: Object.fromEntries(Object.entries(source.parts).map(([name, part]) => {
      const geometry = unpack(part.geometry, `painted-world:${id}:${name}`);
      geometry.translate(-part.pivot[0], -part.pivot[1], -part.pivot[2]);
      return [name, { geometry, pivot: new THREE.Vector3().fromArray(part.pivot) }];
    })) };
}

function unpack(packed: typeof data.m4.near, name: string): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(packed.position.map(value => value / 100000), 3));
  geometry.setAttribute('normal', new THREE.Int16BufferAttribute(packed.normal, 3, true));
  geometry.setAttribute('uv', new THREE.Uint16BufferAttribute(packed.uv, 2, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute(packed.color, 3, true));
  geometry.setIndex(packed.index);
  geometry.computeBoundingSphere();
  return geometry;
}
