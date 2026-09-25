import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_PALETTE } from '../shared/terrain';
import type { WorldSpec } from '../shared/types';
import { releaseAfterUpload } from './memory';

// Closed crowns and individually shaped fronds have a readable silhouette from
// either side. No atlas rectangles, oversized leaf cards, or transparent sorting.
export function buildVegetation(world: WorldSpec) {
  const group = new THREE.Group();
  const breeze = { value: 0 };
  const geometries = new Map<string, THREE.BufferGeometry[]>();
  const materials = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, side: THREE.DoubleSide }),
  ];
  materials[1].onBeforeCompile = shader => {
    shader.uniforms.uBreeze = breeze;
    shader.vertexShader = `uniform float uBreeze;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', `#include <begin_vertex>
        float gust = sin(uBreeze * 1.3 + position.x * .63 + position.z * .41);
        transformed.x += gust * .028;
        transformed.z += cos(uBreeze * .9 + position.z * .48) * .018;
      `);
  };
  // Open-ended, 7-sided branches: the caps are never seen and doubled the count.
  const stem = new THREE.CylinderGeometry(.7, 1, 1, 7, 1, true);
  const lumpy = (detail: number) => {
    const geometry = new THREE.IcosahedronGeometry(1, detail), points = geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const r = 1 + .055 * Math.sin(x * 19 + z * 13) * Math.cos(y * 17 - x * 8) + .04 * Math.cos(z * 11 + y * 9);
      points.setXYZ(i, x * r, y * r, z * r);
    }
    geometry.computeVertexNormals(); return geometry;
  };
  // Two levels of detail: near crowns are 320-triangle lumps (the toon ramp and
  // ink outline hide the facets), far crowns 80. The old 1280-triangle crowns
  // made trees ~9.5k triangles each, most of the frame on this island.
  const crowns = [lumpy(2), lumpy(1)];
  const coconut = new THREE.IcosahedronGeometry(1, 1);
  const trunkRing = new THREE.TorusGeometry(1, .065, 3, 8);
  trunkRing.rotateX(Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const hash = (n: number, salt: number) => {
    let x = Math.imul(n + salt * 7919, 1597334677);
    x = Math.imul(x ^ x >>> 16, 2246822507);
    return (x >>> 0) / 4294967296;
  };
  let lod = 0;
  const stash = (geometry: THREE.BufferGeometry, material: number, x: number, z: number) => {
    geometry.deleteAttribute('uv');
    const key = `${material}:${Math.floor(x / 32)}:${Math.floor(z / 32)}:${lod}`;
    const bucket = geometries.get(key) || []; bucket.push(geometry); geometries.set(key, bucket);
  };
  const tint = (geometry: THREE.BufferGeometry, color: string | THREE.Color) => {
    const base = new THREE.Color(color), positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal'), colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const light = .94 + .06 * Math.max(0, normals.getY(i));
      colors.set([base.r * light, base.g * light, base.b * light], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
  };
  const piece = (base: THREE.BufferGeometry, color: string | THREE.Color, position: THREE.Vector3,
    scale: THREE.Vector3, material = 0, rotation = new THREE.Quaternion()) => {
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    geometry.applyMatrix4(matrix.compose(position, rotation, scale));
    stash(tint(geometry, color), material, position.x, position.z);
  };
  const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string) => {
    const delta = to.clone().sub(from);
    piece(stem, color, from.clone().lerp(to, .5), new THREE.Vector3(radius, delta.length(), radius),
      0, new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()));
  };
  const leaf = (base: THREE.Vector3, tip: THREE.Vector3, width: number, color: string | THREE.Color) => {
    const axis = tip.clone().sub(base);
    const side = new THREE.Vector3(-axis.z, .03, axis.x).normalize().multiplyScalar(width);
    const mid = base.clone().lerp(tip, .46).add(new THREE.Vector3(0, width * .18, 0));
    const left = mid.clone().add(side), right = mid.clone().sub(side);
    const ridge = mid.clone().add(new THREE.Vector3(0, width * .24, 0));
    const points = [base, left, ridge, left, tip, ridge, tip, right, ridge, right, base, ridge];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
    g.computeVertexNormals(); stash(tint(g, color), 1, base.x, base.z);
  };
  for (lod = 0; lod < 2; lod++) for (const object of world.objects) {
    if (!['tree', 'palm', 'grass'].includes(object.kind)) continue;
    const far = lod === 1;
    if (far && object.kind === 'grass') continue;
    const { pos, scale, kind, rotation = 0 } = object;
    const base = new THREE.Vector3(pos.x, pos.y, pos.z), h = scale.y;
    const seed = Math.round((pos.x + 150) * 197 + (pos.z + 150) * 307);
    if (kind === 'grass') {
      const reeds = object.detail === 'reeds';
      for (let i = 0; i < (reeds ? 9 : 7); i++) {
        const angle = i * 2.399 + rotation, height = Math.min(reeds ? 1.6 : .42, h) * (.5 + hash(seed, i) * .5);
        const root = base.clone().add(new THREE.Vector3(Math.cos(angle) * .12, 0, Math.sin(angle) * .12));
        const tip = root.clone().add(new THREE.Vector3(Math.cos(angle) * height * .45, height, Math.sin(angle) * height * .45));
        leaf(root, tip, reeds ? .025 : .04, i % 3 ? WORLD_PALETTE.tuft : WORLD_PALETTE.tuftTip);
        if (reeds && i % 3 === 0) piece(coconut, '#825c3e', tip, new THREE.Vector3(.035, .13, .035));
      }
      continue;
    }
    if (kind === 'palm') {
      const bend = .45 + hash(seed, 7) * .55;
      const top = base.clone().add(new THREE.Vector3(Math.cos(rotation) * bend, h * .91, Math.sin(rotation) * bend));
      let previous = base.clone();
      const radius = .13 + h * .009;
      const segments = far ? 3 : 7;
      for (let segment = 1; segment <= segments; segment++) {
        const t = segment / segments;
        const point = base.clone().lerp(top, t);
        point.x += Math.sin(t * Math.PI) * .16;
        branch(previous, point, radius * (1 - t * .32), WORLD_PALETTE.palmTrunk);
        previous = point;
      }
      for (let ring = 1; ring < (far ? 0 : 10); ring++) {
        const t = ring / 10, point = base.clone().lerp(top, t);
        point.x += Math.sin(t * Math.PI) * .16;
        piece(trunkRing, WORLD_PALETTE.palmRing, point, new THREE.Vector3(radius * (1 - t * .32), .12, radius * (1 - t * .32)));
      }
      for (let i = 0; i < 9; i++) {
        const angle = rotation + i * Math.PI * 2 / 9;
        const length = h * (.29 + hash(seed, i + 40) * .055);
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
        const point = (t: number) => top.clone().addScaledVector(direction, length * t)
          .add(new THREE.Vector3(0, Math.sin(t * Math.PI) * .65 - t * t * 1.0 + (i % 2) * .15, 0));
        if (!far) for (let rib = 0; rib < 3; rib++) branch(point(rib / 3), point((rib + 1) / 3), .022, WORLD_PALETTE.palmMid);
        for (let n = far ? 2 : 1; n <= 13; n += far ? 3 : 1) {
          const t = n / 14, root = point(t);
          const blade = Math.sin(Math.PI * t) * length * .36;
          for (const side of [-1, 1]) {
            const tip = root.clone().addScaledVector(across, blade * side)
              .addScaledVector(direction, length * .14).add(new THREE.Vector3(0, -.1 - blade * .13, 0));
            leaf(root, tip, (.15 * Math.sin(Math.PI * t) + .026) * (far ? 2.2 : 1),
              (n + i) % 3 ? WORLD_PALETTE.palmMid : WORLD_PALETTE.palmLight);
          }
        }
      }
      for (let i = 0; i < (far ? 0 : 5); i++) {
        const angle = rotation + i * 1.25;
        piece(coconut, '#907046', top.clone().add(new THREE.Vector3(Math.cos(angle) * .22, -.15, Math.sin(angle) * .22)), new THREE.Vector3(.14, .19, .14));
      }
      continue;
    }
    const trunkTop = base.clone().add(new THREE.Vector3(.15 * Math.cos(rotation), h * .6, .15 * Math.sin(rotation)));
    const trunkRadius = .15 + h * .015;
    branch(base, trunkTop, trunkRadius, WORLD_PALETTE.trunk);
    for (let root = 0; root < (far ? 0 : 4); root++) {
      const angle = rotation + root * Math.PI / 2;
      branch(base.clone().add(new THREE.Vector3(Math.cos(angle) * .5, .04, Math.sin(angle) * .5)),
        base.clone().add(new THREE.Vector3(0, .7, 0)), trunkRadius * .38, WORLD_PALETTE.trunk);
    }
    const radius = Math.max(1.6, h * .27);
    for (let cluster = 0; cluster < (far ? 5 : 7); cluster++) {
      const angle = rotation + cluster * 2.399, outer = cluster < 5;
      const center = base.clone().add(new THREE.Vector3(
        outer ? Math.cos(angle) * radius * .57 : Math.cos(angle) * .35,
        h * (outer ? .71 : .88) + hash(seed, cluster) * .22,
        outer ? Math.sin(angle) * radius * .57 : Math.sin(angle) * .35));
      branch(trunkTop.clone().add(new THREE.Vector3(0, -.6, 0)), center, trunkRadius * .4, WORLD_PALETTE.trunk);
      const color = new THREE.Color(cluster % 3 === 0 ? WORLD_PALETTE.foliageLight :
        cluster % 3 === 1 ? WORLD_PALETTE.foliageMid : WORLD_PALETTE.foliageCore);
      const bulk = far ? 1.12 : 1;
      piece(crowns[lod], color, center, new THREE.Vector3(radius * .69 * bulk, radius * .49 * bulk, radius * .66 * bulk), 1);
      // Small leaves at crown edges add detail without filling the view with cards.
      for (let spray = 0; spray < (far ? 0 : 5); spray++) {
        const a = angle + spray * 1.256;
        const root = center.clone().add(new THREE.Vector3(Math.cos(a) * radius * .56, radius * .14, Math.sin(a) * radius * .56));
        const tip = root.clone().add(new THREE.Vector3(Math.cos(a) * .43, .1, Math.sin(a) * .43));
        leaf(root, tip, .14, WORLD_PALETTE.foliageLight);
      }
      if (!far && seed % 3 === 0 && cluster < 5) {
        for (let fruit = 0; fruit < 3; fruit++) piece(coconut, '#e8a145', center.clone().add(new THREE.Vector3(
          Math.cos(angle + fruit) * radius * .49, -.15, Math.sin(angle + fruit) * radius * .5)), new THREE.Vector3(.095, .11, .095), 1);
      }
    }
  }
  // Each 32 m chunk swaps to its far version beyond 45 m (and drops grass).
  const merged: THREE.BufferGeometry[] = [];
  const lods = new Map<string, THREE.LOD>();
  const shadowProxy = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  for (const [key, parts] of geometries) {
    const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
    if (!geometry) throw new Error('Cannot merge vegetation geometry');
    geometry.computeBoundingSphere(); merged.push(geometry);
    const [material, cx, cz, level] = key.split(':');
    const mesh = new THREE.Mesh(geometry, materials[Number(material)]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const chunk = `${material}:${cx}:${cz}`;
    let node = lods.get(chunk);
    if (!node) { node = new THREE.LOD(); lods.set(chunk, node); group.add(node); }
    node.addLevel(mesh, level === '0' ? 0 : 45);
  }
  for (const node of lods.values()) {
    if (node.levels.length === 1 && node.levels[0].distance === 0) node.addLevel(new THREE.Object3D(), 45);
    // LOD distance is measured from the node, so centre it on its chunk.
    const first = node.levels.find(level => level.object instanceof THREE.Mesh)!.object as THREE.Mesh;
    const center = first.geometry.boundingSphere!.center.clone();
    for (const level of node.levels) if (level.object instanceof THREE.Mesh) { level.object.geometry.translate(-center.x, -center.y, -center.z); level.object.geometry.computeBoundingSphere(); }
    node.position.copy(center);
    // Shadows come from an invisible proxy of the cheap far geometry, so the
    // shadow pass never draws the detailed crowns and fronds.
    const far = node.levels.find(level => level.distance > 0 && level.object instanceof THREE.Mesh)?.object as THREE.Mesh | undefined;
    for (const level of node.levels) if (level.object instanceof THREE.Mesh) level.object.castShadow = false;
    if (far) { const proxy = new THREE.Mesh(far.geometry, shadowProxy); proxy.castShadow = true; node.add(proxy); }
  }
  // The returned closures share this scope: drop the per-piece parts so they can be collected.
  geometries.clear();
  merged.forEach(releaseAfterUpload);
  stem.dispose(); crowns.forEach(g => g.dispose()); coconut.dispose(); trunkRing.dispose();
  return { group, update(time: number) { breeze.value = time; },
    dispose() { merged.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); shadowProxy.dispose(); } };
}
