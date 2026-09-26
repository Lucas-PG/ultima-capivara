import * as THREE from 'three';
import type { WeaponId } from '../shared/types';
import data from './world-weapon-data.json';
import palette from './weapon-palette.json';
import { createPaintedWeaponAtlas } from './weapon-atlas';

let material: THREE.MeshStandardMaterial | undefined;
// Shared by held and instanced ground weapons. Other loot keeps its own paint.
export function worldWeaponMaterial(): THREE.MeshStandardMaterial {
  if (!material) {
    const source = createPaintedWeaponAtlas(palette.map(hex => parseInt(hex, 16)), 512);
    const pixels = new Uint8Array(512 * 512 * 4), strip = source.image.data!;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const column = Math.floor(y / 128) * 8 + Math.floor(x / 64);
      const u = THREE.MathUtils.clamp((x % 64 - 4) / 56, 0, 1), v = THREE.MathUtils.clamp((y % 128 - 4) / 120, 0, 1);
      const from = (Math.min(511, Math.floor(v * 512)) * 512 + column * 16 + Math.min(15, Math.floor(u * 16))) * 4;
      const to = (y * 512 + x) * 4;
      for (let c = 0; c < 4; c++) pixels[to + c] = strip[from + c];
    }
    source.dispose();
    const map = new THREE.DataTexture(pixels, 512, 512);
    map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
    map.name = 'painted-world-weapons';
    material = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .88, metalness: 0 });
    material.name = 'painted-world-weapons';
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
