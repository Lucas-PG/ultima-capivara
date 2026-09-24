import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function furGrain(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  let seed = 85217;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const patches = Array.from({ length: 8 * 8 }, () => random() * 2 - 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x / 8, gy = y / 8, ix = Math.floor(gx), iy = Math.floor(gy);
    const blend = (a: number, b: number, t: number) => a + (b - a) * t;
    const patch = (a: number, b: number) => patches[(b % 8) * 8 + a % 8];
    const mottling = blend(blend(patch(ix, iy), patch(ix + 1, iy), gx - ix),
      blend(patch(ix, iy + 1), patch(ix + 1, iy + 1), gx - ix), gy - iy);
    const shade = Math.max(194, Math.min(255, 233 + mottling * 12 + (random() - .5) * 18));
    const i = (y * size + x) * 4;
    data[i] = shade; data[i + 1] = shade; data[i + 2] = shade; data[i + 3] = 255;
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3); map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}

export function buildCapybaraBody(color: string): { body: THREE.SkinnedMesh; bones: THREE.Bone[]; dispose: () => void } {
  const fur = new THREE.Color(color);
  const shadow = fur.clone().lerp(new THREE.Color('#684b34'), .34);
  const muzzle = fur.clone().lerp(new THREE.Color('#e7b986'), .22);
  const belly = fur.clone().lerp(new THREE.Color('#dfbd90'), .38);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const smallSphere = new THREE.SphereGeometry(1, 10, 7);
  const tinySphere = new THREE.SphereGeometry(1, 8, 6);
  const roundedBox = new RoundedBoxGeometry(1, 1, 1, 2, .22);
  const parts: THREE.BufferGeometry[] = [];
  const part = (base: THREE.BufferGeometry, tint: THREE.Color | string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, bone: number, rotation = new THREE.Euler()) => {
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(sx, sy, sz)));
    const shade = typeof tint === 'string' ? new THREE.Color(tint) : tint;
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const indices = new Uint16Array(positions.count * 4);
    const weights = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
      const grain = Math.sin(px * 29 + pz * 17) * Math.sin(py * 33 - pz * 11) * .025;
      const warm = Math.sin(px * 7 + py * 9 + pz * 5) * .025;
      const value = 1 + grain + warm;
      colors[i * 3] = shade.r * value;
      colors[i * 3 + 1] = shade.g * value * (1 + warm * .16);
      colors[i * 3 + 2] = shade.b * value;
      indices[i * 4] = bone; weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    parts.push(geometry);
  };
  const oval = (tint: THREE.Color | string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, bone: number, small = false) =>
    part(small ? smallSphere : sphere, tint, x, y, z, sx, sy, sz, bone);
  const detail = (tint: THREE.Color | string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, bone: number) =>
    part(tinySphere, tint, x, y, z, sx, sy, sz, bone);

  // A low continuous barrel hides the tops of the four short legs.
  oval(fur, 0, .95, .19, .45, .49, .76, 1);
  oval(belly, 0, .65, .09, .37, .17, .56, 1);
  oval(fur, 0, 1.14, -.31, .36, .31, .31, 1);
  for (const side of [-1, 1]) {
    oval(fur, side * .28, .70, -.30, .20, .29, .25, 1, true);
    oval(fur, side * .28, .75, .66, .23, .34, .30, 1, true);
  }

  // The head is broad and blunt, with its eyes set high on either side.
  oval(fur, 0, 1.355, -.51, .35, .31, .35, 2);
  oval(fur, 0, 1.235, -.75, .32, .22, .29, 2);
  part(roundedBox, muzzle, 0, 1.18, -.945, .59, .27, .49, 2);
  oval(shadow, 0, 1.215, -1.187, .23, .087, .031, 2, true);
  detail('#604839', 0, 1.083, -1.193, .125, .008, .012, 2);
  for (const side of [-1, 1]) {
    oval(shadow, side * .277, 1.632, -.34, .068, .077, .057, 2, true);
    detail('#9c7061', side * .281, 1.637, -.385, .033, .044, .017, 2);
    detail('#272621', side * .309, 1.447, -.792, .028, .03, .022, 2);
    detail('#f4e3bd', side * .326, 1.459, -.808, .008, .008, .006, 2);
    detail('#4e3d32', side * .125, 1.258, -1.219, .026, .014, .009, 2);
    for (let i = 0; i < 3; i++)
      detail(shadow, side * (.20 + i % 2 * .036), 1.155 + (i - 1) * .037,
        -1.195 + i % 2 * .01, .005, .005, .005, 2);
  }

  const legPositions: [number, number][] = [[-.30, -.30], [.30, -.30], [-.32, .65], [.32, .65]];
  legPositions.forEach(([x, z], i) => {
    const bone = 5 + i;
    oval(fur, x, .32, z, i < 2 ? .145 : .17, .28, .17, bone);
    oval(shadow, x, .085, z - .055, .16, .075, .19, bone, true);
    for (let toe = 0; toe < 4; toe++) {
      const tx = x + (toe - 1.5) * .072;
      detail(fur, tx, .059, z - .17, .039, .045, .067, bone);
      detail('#554637', tx, .029, z - .222, .020, .014, .024, bone);
    }
  });

  // Teal neckwear separates the warm fur from the island's stone and clay.
  // It is a permanent character detail, independent of collected armor.
  for (const side of [-1, 1]) {
    part(roundedBox, '#378f8e', side * .329, 1.205, -.36, .10, .16, .33, 1);
    part(roundedBox, '#9fcec0', side * .381, 1.25, -.36, .018, .025, .24, 1);
  }
  const scarf = new THREE.ConeGeometry(.5, 1, 3);
  part(scarf, '#48a8a1', 0, 1.02, -.47, .53, .30, .10, 1, new THREE.Euler(0, 0, Math.PI));
  scarf.dispose();

  // A permanent leather harness supports the side-mounted weapon.
  for (const z of [-.17, .30]) {
    part(roundedBox, '#70533b', 0, 1.429, z, .75, .035, .08, 1);
    for (const side of [-1, 1])
      part(roundedBox, '#70533b', side * .436, 1.14, z, .036, .48, .08, 1);
  }
  part(roundedBox, '#574634', .434, 1.015, -.58, .105, .20, .40, 1);
  part(roundedBox, '#bc9d69', .496, 1.02, -.58, .022, .045, .28, 1);

  // Canvas saddle and pouches sit against the barrel rather than hovering over it.
  part(roundedBox, '#425955', 0, 1.42, .08, .72, .072, .58, 9);
  for (const side of [-1, 1]) {
    part(roundedBox, '#455b54', side * .44, 1.06, .13, .105, .26, .35, 9);
    part(roundedBox, '#6c7963', side * .501, 1.155, .13, .026, .068, .35, 9);
    part(roundedBox, '#bd9c69', side * .518, 1.065, .13, .013, .027, .095, 9);
  }
  oval('#52635a', 0, 1.64, -.50, .35, .095, .31, 10);
  part(roundedBox, '#455a54', 0, 1.565, -.79, .55, .052, .15, 10);

  const geometry = mergeGeometries(parts, false);
  parts.forEach(item => item.dispose());
  sphere.dispose(); smallSphere.dispose(); tinySphere.dispose(); roundedBox.dispose();
  if (!geometry) throw new Error('Cannot merge capybara geometry');
  geometry.computeBoundingSphere();
  const grain = furGrain();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain,
    bumpMap: grain, bumpScale: .003, roughness: .95, metalness: .01 });
  const body = new THREE.SkinnedMesh(geometry, material);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  const bones = Array.from({ length: 11 }, () => new THREE.Bone());
  bones[1].position.set(0, .99, .22);
  bones[2].position.set(0, 1.36, -.51);
  legPositions.forEach(([x, z], i) => bones[5 + i].position.set(x, .61, z));
  bones[9].position.set(0, 1.14, .08);
  bones[10].position.set(0, 1.61, -.5);
  for (let i = 1; i < bones.length; i++) bones[0].add(bones[i]);
  body.add(bones[0]); body.bind(new THREE.Skeleton(bones));
  return { body, bones, dispose: () => { geometry.dispose(); material.dispose(); grain.dispose(); } };
}
