import * as THREE from 'three';
import { fbm } from '../shared/terrain';
import type { MapObject, WorldSpec } from '../shared/types';

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function ridgeHeight(island: MapObject, u: number, v: number, seed: number) {
  const warp = fbm(u * 3 + seed, v * 3 - seed) * .09;
  const radius = Math.hypot(u + warp, v * .96 - warp);
  const coast = smooth((1.02 - radius) / .34);
  const spine = Math.sin(u * 5 + seed) * .13 + fbm(u * 6, seed) * .07;
  const ridge = Math.max(0, 1 - Math.abs(v - spine) / .58);
  const peaks = .38 + .5 * Math.exp(-((u + .22) ** 2) / .032) + .36 * Math.exp(-((u - .37) ** 2) / .05);
  const folds = fbm(u * 7 + seed, v * 6 - seed) * .12 * ridge;
  return -6 + island.scale.y * Math.max(0, .13 + Math.pow(ridge, 1.55) * peaks * .83 + folds) * coast;
}

/** One inexpensive, smoothly shaded layer of offshore jungle ridges. */
export function createIslandBackdrop(world: Pick<WorldSpec, 'objects'>) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const forest = new THREE.Color('#315C52'), foliage = new THREE.Color(), rock = new THREE.Color('#A99F89');
  const shoreline = new THREE.Color('#B7B18D'), color = new THREE.Color();
  const steps = 24, row = steps + 1;
  const islands = world.objects.filter(object => object.detail === 'distant-island');
  for (const [islandIndex, island] of islands.entries()) {
    const offset = positions.length / 3, seed = islandIndex * 2.73 + .4;
    foliage.set(island.color);
    for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix <= steps; ix++) {
      const u = ix / steps * 2 - 1, v = iz / steps * 2 - 1;
      const y = ridgeHeight(island, u, v, seed);
      const slope = Math.hypot(
        (ridgeHeight(island, u + .012, v, seed) - ridgeHeight(island, u - .012, v, seed)) / (island.scale.x * .012),
        (ridgeHeight(island, u, v + .012, seed) - ridgeHeight(island, u, v - .012, seed)) / (island.scale.z * .012));
      const wash = smooth((fbm(u * 5 + seed, v * 4) + .3) / .6);
      color.copy(forest).lerp(foliage, .18 + wash * .5);
      color.lerp(rock, smooth((slope - 1.1) / 1.5) * smooth((y / island.scale.y - .18) / .34));
      if (y < 2) color.lerp(shoreline, smooth((2 - y) / 3));
      positions.push(island.pos.x + u * island.scale.x / 2, y, island.pos.z + v * island.scale.z / 2);
      colors.push(color.r, color.g, color.b); uvs.push(ix / steps * 3, iz / steps * 3);
      if (ix < steps && iz < steps) {
        const a = offset + iz * row + ix;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const pixels = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const value = 243 + fbm(x / 23, y / 31) * 15 + fbm(x / 7, y / 17) * 4;
    const i = (y * 128 + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value; pixels[i + 3] = 255;
  }
  const paint = new THREE.DataTexture(pixels, 128, 128);
  paint.colorSpace = THREE.SRGBColorSpace; paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
  paint.magFilter = THREE.LinearFilter; paint.minFilter = THREE.LinearMipmapLinearFilter;
  paint.generateMipmaps = true; paint.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: paint, vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Ilhas distantes';
  mesh.castShadow = mesh.receiveShadow = false;
  return { mesh, dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); paint.dispose(); } };
}
