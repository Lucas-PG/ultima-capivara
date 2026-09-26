import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainColor, terrainHeight, WORLD_PALETTE } from '../shared/terrain';
import { ROADS } from '../shared/layout';
import type { Settings, WorldSpec } from '../shared/types';
import { createToonMaterial } from './materials';

const CELL = 24, CANDIDATES = 2000;
export const GROUND_COVER = {
  low: { fraction: 0, distance: 0 },
  medium: { fraction: .8, distance: 32 },
  high: { fraction: 1, distance: 35 },
} as const;
const grassy = new Set<string>([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass]);
const hash = (x: number, z: number, salt: number) => {
  let n = Math.imul(x + salt * 31, 374761393) ^ Math.imul(z - salt * 17, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

// Short curved ribbons, three orientations, with a broad painted base and a
// sunlit tapered tip. No alpha atlas, transparent sorting or texture downloads.
function blades() {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const base = new THREE.Color('#79A94F'), tip = new THREE.Color('#BDD27F'), color = new THREE.Color();
  for (let blade = 0; blade < 7; blade++) {
    const angle = blade * 2.39996, ca = Math.cos(angle), sa = Math.sin(angle), offset = positions.length / 3;
    for (let row = 0; row < 3; row++) {
      const t = row / 2, width = .021 * (1 - t) + .001, bend = t * t * .075;
      color.copy(base).lerp(tip, t * t);
      for (const side of [-1, 1]) {
        positions.push(ca * width * side + sa * bend + ca * .15, t * (.12 + blade * .016), sa * width * side - ca * bend + sa * .15);
        colors.push(color.r, color.g, color.b);
      }
      if (row < 2) { const a = offset + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  geometry.computeBoundingSphere();
  return geometry;
}

function tint(geometry: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color), values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function groundDetails() {
  const flower: THREE.BufferGeometry[] = [];
  flower.push(tint(new THREE.CylinderGeometry(.009, .012, .22, 4).translate(0, .11, 0), '#6F9D43'));
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    flower.push(tint(new THREE.SphereGeometry(1, 6, 3).scale(.055, .014, .032).rotateY(-angle)
      .translate(Math.cos(angle) * .043, .23, Math.sin(angle) * .043), '#FFE6A0'));
  }
  flower.push(tint(new THREE.SphereGeometry(.025, 6, 3).scale(1, .45, 1).translate(0, .244, 0), '#E9A647'));
  const bloom = mergeGeometries(flower)!; flower.forEach(g => g.dispose());
  const pebble = tint(new THREE.IcosahedronGeometry(.11, 0).scale(1.4, .45, 1).translate(0, .035, 0), '#B9AE8F');
  const leaf = tint(new THREE.SphereGeometry(1, 5, 3).scale(.18, .017, .057).rotateY(.6).translate(0, .025, 0), '#B4B866');
  const shell = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const shellVertices = shell.getAttribute('position');
  for (let i = 0; i < shellVertices.count; i++) {
    const x = shellVertices.getX(i), z = shellVertices.getZ(i), ridge = 1 + Math.cos(Math.atan2(z, x) * 12) * .085;
    shellVertices.setXYZ(i, x * .09 * ridge, shellVertices.getY(i) * .028, z * .115 * ridge);
  }
  shell.computeVertexNormals(); tint(shell, '#EADCC7');
  return [bloom, pebble, leaf, shell].map(geometry => {
    if (!geometry.index) return geometry;
    const flat = geometry.toNonIndexed(); geometry.dispose(); return flat;
  });
}

export class GroundCover {
  readonly group = new THREE.Group();
  private readonly geometry = blades();
  private readonly material = createToonMaterial('foliage', { vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  private readonly detailMaterial = createToonMaterial('foliage', { vertexColors: true, roughness: 1 });
  private readonly time = { value: 0 };
  private readonly eye = { value: new THREE.Vector3() };
  private readonly reach = { value: 38 };
  private readonly cells: { x: number; z: number; blades: THREE.InstancedMesh; details: THREE.Mesh | null; count: number }[] = [];
  private quality: Settings['graphics'] = 'medium';

  constructor(world: WorldSpec) {
    this.group.name = 'ground-cover';
    this.material.onBeforeCompile = shader => {
      shader.uniforms.coverTime = this.time; shader.uniforms.coverEye = this.eye; shader.uniforms.coverReach = this.reach;
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal *= gl_FrontFacing ? 1.0 : -1.0;');
      shader.vertexShader = 'uniform float coverTime,coverReach;uniform vec3 coverEye;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 root=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float fade=1.0-smoothstep(coverReach*.64,coverReach,length(root.xz-coverEye.xz));
        float tip=position.y/.24;
        float wind=sin(coverTime*1.65+root.x*.31+root.z*.19)*.022+sin(coverTime*2.4+root.z*.63)*.008;
        transformed.x+=wind*tip*tip;
        transformed.z+=wind*.44*tip*tip;
        transformed*=fade;
      `);
    };
    this.material.customProgramCacheKey = () => 'painted-ground-cover-v3';
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), detailShapes = groundDetails();
    const dunes = world.objects.filter(object => object.detail === 'dune-grass');
    const paving = world.objects.filter(o => o.detail === 'prop:plaza' || o.detail === 'floor' || o.detail === 'courtyard' || o.detail === 'path' || o.detail?.includes('pavement'));
    for (let cz = -6; cz < 6; cz++) for (let cx = -6; cx < 6; cx++) {
      const x0 = cx * CELL, z0 = cz * CELL, points: { x: number; y: number; z: number; seed: number }[] = [];
      const shore: { x: number; y: number; z: number; seed: number }[] = [];
      const colliders = world.colliders.filter(c => c.min.x < x0 + CELL + .3 && c.max.x > x0 - .3 && c.min.z < z0 + CELL + .3 && c.max.z > z0 - .3);
      for (let i = 0; i < CANDIDATES; i++) {
        const x = x0 + hash(cx * CANDIDATES + i, cz, 1) * CELL, z = z0 + hash(cx, cz * CANDIDATES + i, 2) * CELL;
        const y = terrainHeight(x, z), slope = Math.max(Math.abs(terrainHeight(x + .4, z) - y), Math.abs(terrainHeight(x, z + .4) - y)) / .4;
        const color = terrainColor(x, z, y, slope);
        const sand = color === WORLD_PALETTE.sand || color === WORLD_PALETTE.sandLight || color === WORLD_PALETTE.sandWet;
        const dune = sand && dunes.some(patch => ((x - patch.pos.x) / (patch.scale.x * .5)) ** 2 + ((z - patch.pos.z) / (patch.scale.z * .5)) ** 2 < 1);
        if (sand && y > .07 && y < 3.5 && slope < .5 && i % 61 === 0) shore.push({ x, y, z, seed: hash(cx * CANDIDATES + i, cz, 9) });
        if (y < (dune ? .3 : .8) || slope > .7 || (!dune && !grassy.has(color))) continue;
        if (ROADS.some(([x0, z0, x1, z1]) => x > x0 - .35 && x < x1 + .35 && z > z0 - .35 && z < z1 + .35)) continue;
        if (paving.some(o => Math.abs(x - o.pos.x) < o.scale.x / 2 + .15 && Math.abs(z - o.pos.z) < o.scale.z / 2 + .15)) continue;
        if (colliders.some(c => c.min.y < y + .45 && c.max.y > y - .05 && x > c.min.x - .2 && x < c.max.x + .2 && z > c.min.z - .2 && z < c.max.z + .2)) continue;
        points.push({ x, y, z, seed: hash(cx * CANDIDATES + i, cz, 3) });
      }
      if (!points.length && !shore.length) continue;
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, points.length));
      mesh.count = points.length;
      mesh.position.set(x0, 0, z0); mesh.name = `grass:${cx}:${cz}`; mesh.receiveShadow = true;
      const details: THREE.BufferGeometry[] = [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i], size = .8 + point.seed * .3;
        position.set(point.x - x0, point.y - .015, point.z - z0); rotation.setFromAxisAngle(up, point.seed * Math.PI * 2); scale.set(size, size, size);
        matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix);
        if (i % 151 === 0) details.push(detailShapes[i % 3].clone().applyMatrix4(matrix));
      }
      for (const point of shore) {
        position.set(point.x - x0, point.y + .006, point.z - z0); rotation.setFromAxisAngle(up, point.seed * Math.PI * 2);
        scale.setScalar(.7 + point.seed * 1.3); matrix.compose(position, rotation, scale);
        details.push(detailShapes[point.seed > .45 ? 3 : 1].clone().applyMatrix4(matrix));
      }
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      // Wind can extend past the undeformed ribbon bounds.
      if (mesh.boundingSphere) mesh.boundingSphere.radius += .2;
      this.group.add(mesh);
      const detailGeometry = details.length ? mergeGeometries(details) : null;
      details.forEach(g => g.dispose());
      const detailMesh = detailGeometry ? new THREE.Mesh(detailGeometry, this.detailMaterial) : null;
      if (detailMesh) { detailMesh.position.copy(mesh.position); detailMesh.receiveShadow = true; this.group.add(detailMesh); }
      this.cells.push({ x: x0 + CELL / 2, z: z0 + CELL / 2, blades: mesh, details: detailMesh, count: points.length });
    }
    detailShapes.forEach(g => g.dispose());
  }

  setQuality(quality: Settings['graphics']) {
    this.quality = quality; this.group.visible = quality !== 'low'; this.reach.value = GROUND_COVER[quality].distance;
    for (const cell of this.cells) cell.blades.count = Math.floor(cell.count * GROUND_COVER[quality].fraction);
  }

  update(camera: THREE.Camera, time: number, reducedMotion: boolean) {
    if (this.quality === 'low') return;
    this.time.value = reducedMotion ? 0 : time; this.eye.value.copy(camera.position);
    const reach = GROUND_COVER[this.quality].distance;
    for (const cell of this.cells) {
      const distance = Math.hypot(Math.max(0, Math.abs(cell.x - camera.position.x) - CELL / 2), Math.max(0, Math.abs(cell.z - camera.position.z) - CELL / 2));
      cell.blades.visible = reach > 0 && distance < reach;
      if (cell.details) cell.details.visible = reach > 0 && distance < reach * .7;
    }
  }

  dispose() {
    for (const cell of this.cells) { cell.blades.dispose(); cell.details?.geometry.dispose(); }
    this.geometry.dispose(); this.material.dispose(); this.detailMaterial.dispose(); this.group.clear();
  }
}
