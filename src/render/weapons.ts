import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../shared/math';
import { advanceAds, WEAPONS } from '../shared/weapons';
import type { ActorState, Settings, WeaponId } from '../shared/types';

const palette = {
  // Cel-shaded palette: low metalness so the banded key light, not the
  // environment reflection, carries the form; local colours stay readable.
  steel: new THREE.MeshStandardMaterial({ color: '#3c4648', metalness: .32, roughness: .5 }),
  edge: new THREE.MeshStandardMaterial({ color: '#8c9794', metalness: .4, roughness: .42 }),
  dark: new THREE.MeshStandardMaterial({ color: '#1d2523', metalness: .1, roughness: .72 }),
  olive: new THREE.MeshStandardMaterial({ color: '#5c6b45', metalness: .05, roughness: .8 }),
  wood: new THREE.MeshStandardMaterial({ color: '#b07a4b', roughness: .7 }),
  walnut: new THREE.MeshStandardMaterial({ color: '#7d5637', roughness: .74 }),
  brass: new THREE.MeshStandardMaterial({ color: '#e0b265', metalness: .35, roughness: .38 }),
  shellRed: new THREE.MeshStandardMaterial({ color: '#c24635', metalness: .1, roughness: .56 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2e5d5f', metalness: .12, roughness: .66 }),
  skin: new THREE.MeshStandardMaterial({ color: '#a8703f', roughness: .95 }),
  skinLight: new THREE.MeshStandardMaterial({ color: '#d6a877', roughness: .95 }),
  skinShade: new THREE.MeshStandardMaterial({ color: '#6e4a31', roughness: .95 }),
  sleeve: new THREE.MeshStandardMaterial({ color: '#3a9c98', roughness: .85 }),
  cuff: new THREE.MeshStandardMaterial({ color: '#2c7773', roughness: .85 }),
  tape: new THREE.MeshStandardMaterial({ color: '#e7d3a6', roughness: .9 }),
  glove: new THREE.MeshStandardMaterial({ color: '#3b3f3a', roughness: .9 }),
  nail: new THREE.MeshStandardMaterial({ color: '#3f3329', roughness: .7 }),
  lens: new THREE.MeshPhysicalMaterial({ color: '#315766', metalness: .36, roughness: .08, clearcoat: 1 }),
  scopeGlass: new THREE.MeshPhysicalMaterial({ color: '#adc2c3', metalness: .35, roughness: .055, clearcoat: 1, clearcoatRoughness: .04, side: THREE.DoubleSide }),
  glass: new THREE.MeshBasicMaterial({ color: '#9fcdd0', transparent: true, opacity: .3, depthWrite: false }),
  red: new THREE.MeshBasicMaterial({ color: '#e9754f' }),
};
function grain(seed: number, wood = false): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  let state = seed;
  const rand = () => { state = (Math.imul(state ^ state >>> 15, 1 | state) + 0x6d2b79f5) | 0; return (state >>> 0) / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const stripe = wood ? Math.sin(x * .72 + Math.sin(y * .14) * 3) * 9 : 0;
    const light = Math.round(234 + stripe + (rand() - .5) * (wood ? 18 : 22));
    const i = (y * size + x) * 4;
    data[i] = Math.min(255, light); data[i + 1] = Math.min(255, light); data[i + 2] = Math.min(255, light); data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
function furTexture(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 87124;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const patches = Array.from({ length: 16 * 16 }, () => random() * 2 - 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x / 8, gy = y / 8, ix = Math.floor(gx), iy = Math.floor(gy);
    const tx = gx - ix, ty = gy - iy;
    const patch = (a: number, b: number) => patches[(b % 16) * 16 + a % 16];
    const mottling = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(patch(ix, iy), patch(ix + 1, iy), tx),
      THREE.MathUtils.lerp(patch(ix, iy + 1), patch(ix + 1, iy + 1), tx), ty);
    const shade = THREE.MathUtils.clamp(230 + mottling * 19 + (random() - .5) * 22, 190, 255);
    const i = (y * size + x) * 4;
    data[i] = shade; data[i + 1] = shade; data[i + 2] = shade; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}
const furGrain = furTexture(), woodGrain = grain(33417, true), polymerGrain = grain(97531);
function machinedFinish(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#b6b8b3'; ctx.fillRect(0, 0, 512, 512);
  let seed = 18671;
  const rand = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 2600; i++) {
    ctx.strokeStyle = `rgba(${rand() > .65 ? '235,240,231' : '55,61,58'},${.03 + rand() * .13})`;
    const x = rand() * 512, y = rand() * 512;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand() * 40, y + (rand() - .5) * 3); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; return texture;
}
const metalGrain = machinedFinish();
function coatedLens(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(51, 49, 3, 64, 64, 69);
  gradient.addColorStop(0, '#223d42'); gradient.addColorStop(.27, '#142a2f');
  gradient.addColorStop(.68, '#0b1d22'); gradient.addColorStop(.9, '#091316'); gradient.addColorStop(1, '#03090b');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  ctx.beginPath(); ctx.ellipse(46, 34, 30, 10, -.36, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(105,151,156,.18)'; ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
const scopeLensMap = coatedLens(); palette.scopeGlass.map = scopeLensMap;
palette.skin.map = furGrain; palette.skinLight.map = furGrain;
palette.skin.bumpMap = furGrain; palette.skin.bumpScale = .001;
palette.skinLight.bumpMap = furGrain; palette.skinLight.bumpScale = .001;
palette.wood.map = woodGrain; palette.walnut.map = woodGrain;
palette.olive.map = polymerGrain; palette.glove.map = polymerGrain;
palette.dark.map = polymerGrain;
palette.dark.bumpMap = polymerGrain; palette.dark.bumpScale = .0004;
palette.steel.roughnessMap = polymerGrain;
palette.steel.map = metalGrain; palette.edge.map = metalGrain;
palette.steel.bumpMap = metalGrain; palette.steel.bumpScale = .00012;
type Mat = THREE.Material;
const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: Mat, rz = 0) => {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .13), material);
  mesh.position.set(x, y, z); mesh.rotation.z = rz; mesh.castShadow = true; parent.add(mesh); return mesh;
};
const tube = (parent: THREE.Object3D, radius: number, length: number, x: number, y: number, z: number, material: Mat, sides = 12) => {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides); geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
};
const stock = (parent: THREE.Group, length: number, material: Mat) => {
  const shape = new THREE.Shape();
  const points = [[.19, -.043], [.19 + length, -.051], [.20 + length, -.225], [.14 + length, -.23], [.235, -.132]];
  points.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .108, bevelEnabled: true, bevelThickness: .006, bevelSize: .008, bevelSegments: 2, steps: 1 });
  geometry.translate(0, 0, -.054); geometry.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material); parent.add(mesh);
  box(parent, .122, .173, .025, 0, -.137, .197 + length, palette.glove);
  for (const side of [-1, 1]) {
    box(parent, .004, .031, length * .63, side * .061, -.078, .2 + length * .55, palette.dark);
    screw(parent, side * .064, -.123, .15 + length);
  }
};
const ellipsoid = (parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: Mat) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
};
const between = (parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, bottom: number, top: number, material: Mat) => {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, direction.length(), 12), material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh); return mesh;
};
const screw = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const head = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, .003, 10), palette.edge);
  head.position.set(x, y, z); head.rotation.z = Math.PI / 2; parent.add(head);
  box(parent, .002, .011, .002, x + .002, y, z, palette.dark);
};
function receiverMarkings(parent: THREE.Group, id: WeaponId) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#babbb0'; ctx.font = '600 20px monospace';
  ctx.fillText(`ILHA   /   ${id.toUpperCase()}   02`, 12, 34);
  const caliber = id === 'smg' ? '9 × 19' : id === 'm4' ? '5.56 × 45' : '7.62 × 51';
  ctx.fillStyle = '#81897f'; ctx.font = '15px monospace'; ctx.fillText(`UC • 06249     ${caliber}`, 12, 64);
  ctx.fillRect(12, 85, 95, 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: .7, metalness: .15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.17, .041), material);
  mesh.position.set(-.067, -.039, -.03); mesh.rotation.y = -Math.PI / 2; parent.add(mesh);
}

// Preserve animated groups while submitting each static material only once.
function batchRigidParts(group: THREE.Group) {
  for (const child of [...group.children]) if (child instanceof THREE.Group) batchRigidParts(child);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) if (child instanceof THREE.Mesh && !Array.isArray(child.material) && !child.material.transparent) {
    const list = batches.get(child.material) || []; list.push(child); batches.set(child.material, list);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      part.applyMatrix4(mesh.matrix); return part;
    });
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
    if (!geometry) continue;
    meshes.forEach(mesh => { group.remove(mesh); mesh.geometry.dispose(); });
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; group.add(mesh);
  }
}
// Ink outlines for the viewmodel (the world's outline pass does not cover it):
// inverted hulls pushed out along smoothed normals by a constant screen width.
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: .0026 }, ink: { value: new THREE.Color('#1b1510') } },
  side: THREE.BackSide,
  vertexShader: `#include <common>
    #include <skinning_pars_vertex>
    uniform float thickness;
    void main() {
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
      mv.xyz += normalize(normalMatrix * objectNormal) * thickness * -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: 'uniform vec3 ink; void main() { gl_FragColor = vec4(ink, 1.0); \n#include <colorspace_fragment>\n }',
});
function hullGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const bare = new THREE.BufferGeometry();
  for (const name of ['position', 'skinIndex', 'skinWeight']) {
    const attribute = source.getAttribute(name);
    if (attribute) bare.setAttribute(name, attribute);
  }
  if (source.index) bare.setIndex(source.index);
  const hull = mergeVertices(bare, 1e-4);
  hull.computeVertexNormals();
  return hull;
}
function addOutlines(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.outline) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material.transparent || material === outlineMaterial)) return;
    const type = object.geometry.type;
    if (type === 'CircleGeometry' || type === 'PlaneGeometry') return;
    meshes.push(object);
  });
  for (const mesh of meshes) {
    const geometry = hullGeometry(mesh.geometry);
    const hull = mesh instanceof THREE.SkinnedMesh ? new THREE.SkinnedMesh(geometry, outlineMaterial) : new THREE.Mesh(geometry, outlineMaterial);
    if (hull instanceof THREE.SkinnedMesh && mesh instanceof THREE.SkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.userData.outline = true; hull.frustumCulled = false; hull.castShadow = false;
    mesh.add(hull);
  }
}
const magazine = (parent: THREE.Object3D, x: number, y: number, z: number, height: number, material: Mat) => {
  const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
  group.userData.restY = y;
  const body = box(group, .07, height, .086, 0, -height / 2, 0, material); body.rotation.x = -.18;
  box(group, .078, .015, .095, 0, -height, .014, palette.dark);
  for (let i = 0; i < 5; i++) box(group, .074, .004, .005, 0, -.025 - i * (height - .04) / 5, .044, palette.edge);
  return group;
};
const scope = (parent: THREE.Object3D, y: number, z: number, length: number, radius: number) => {
  const group = new THREE.Group(); group.position.set(0, y, z); parent.add(group);
  tube(group, radius, length, 0, 0, 0, palette.dark, 36);
  for (const end of [-1, 1]) {
    tube(group, radius * 1.2, .045, 0, 0, end * length * .44, palette.steel, 36);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(radius * .94, 40), palette.scopeGlass);
    lens.position.z = end * length * .535; group.add(lens);
    for (const [size, width, depth, material] of [
      [1.15, .006, .54, palette.dark], [1.02, .0025, .55, palette.edge], [.87, .0015, .555, palette.steel],
    ] as const) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * size, width, 6, 40), material);
      rim.position.z = end * length * depth; group.add(rim);
    }
  }
  for (const mount of [-.075, .075]) box(group, .026, .065, .03, 0, -radius - .024, mount, palette.dark);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(.023, .023, .018, 12), palette.edge);
  dial.position.set(0, radius + .01, 0); group.add(dial);
  return group;
};

function gunBase(id: WeaponId): THREE.Group {
  const group = new THREE.Group();
  if (id === 'machete') {
    const shape = new THREE.Shape();
    // The tang runs into the guard so the blade never floats off the handle.
    shape.moveTo(-.022, .2); shape.lineTo(.025, .2); shape.lineTo(.035, -.4);
    shape.quadraticCurveTo(.053, -.58, -.014, -.64); shape.lineTo(-.036, -.60); shape.lineTo(-.022, .2);
    const blade = new THREE.ExtrudeGeometry(shape, { depth: .013, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2, curveSegments: 8 });
    blade.rotateX(Math.PI / 2); blade.translate(.025, -.01, -.18);
    const item = new THREE.Mesh(blade, palette.edge); group.add(item);
    box(group, .06, .025, .34, .025, -.04, -.37, palette.steel);
    box(group, .10, .03, .04, .025, -.04, .015, palette.brass);
    const grip = box(group, .066, .07, .24, .025, -.075, .14, palette.walnut); grip.rotation.x = -.08;
    for (let i = 0; i < 8; i++) box(group, .068, .006, .01, .025, -.077, .04 + i * .025, palette.glove);
    screw(group, .057, -.08, .22); screw(group, .057, -.08, .07);
    group.userData.sightY = 0;
  } else if (id === 'slingshot') {
    between(group, new THREE.Vector3(0, -.2, .12), new THREE.Vector3(0, .10, -.07), .054, .04, palette.wood);
    for (const s of [-1, 1]) {
      between(group, new THREE.Vector3(0, .10, -.07), new THREE.Vector3(s * .14, .33, -.15), .04, .028, palette.wood);
      ellipsoid(group, s * .14, .33, -.15, .034, .034, .034, palette.walnut);
      between(group, new THREE.Vector3(s * .14, .33, -.15), new THREE.Vector3(s * .04, .23, -.34), .01, .008, palette.glove);
    }
    box(group, .12, .036, .07, 0, .23, -.34, palette.glove);
    ellipsoid(group, 0, .25, -.34, .044, .04, .044, palette.steel);
    for (let i = 0; i < 5; i++) box(group, .09, .006, .012, 0, -.11, i * .036, palette.glove);
    group.userData.sightY = .25;
  } else if (id === 'pistol') {
    box(group, .11, .05, .30, 0, -.025, -.09, palette.dark);
    const slide = new THREE.Group(); group.add(slide); group.userData.action = slide;
    box(slide, .116, .058, .30, 0, .027, -.085, palette.steel);
    box(slide, .073, .004, .085, 0, .057, -.068, palette.edge);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
      const groove = box(slide, .003, .034, .004, s * .058, .026, .005 + i * .009, palette.dark); groove.rotation.x = -.26;
    }
    box(slide, .025, .014, .02, 0, .067, -.231, palette.dark);
    box(slide, .044, .013, .02, 0, .065, .04, palette.dark);
    tube(group, .017, .24, 0, .005, -.17, palette.edge);
    tube(group, .027, .006, 0, .005, -.291, palette.dark);
    const grip = box(group, .09, .18, .075, 0, -.14, .013, palette.olive); grip.rotation.x = -.21;
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) box(group, .003, .004, .04, s * .045, -.09 - i * .019, .016 + i * .003, palette.dark);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(.055, .006, 5, 12, Math.PI), palette.steel);
    guard.position.set(0, -.078, -.06); guard.rotation.y = Math.PI / 2; guard.rotation.z = Math.PI; group.add(guard);
    group.userData.magazine = magazine(group, 0, -.15, .025, .08, palette.steel);
    screw(group, .057, -.018, .025); group.userData.sightY = .071;
  } else if (id === 'shotgun') {
    box(group, .13, .10, .36, 0, -.04, -.025, palette.steel);
    box(group, .15, .012, .28, 0, .018, -.03, palette.edge);
    box(group, .009, .035, .1, .071, -.036, -.044, palette.dark);
    tube(group, .024, .75, 0, -.035, -.53, palette.steel);
    tube(group, .019, .61, 0, -.08, -.47, palette.edge);
    tube(group, .029, .06, 0, -.035, -.93, palette.dark);
    const pump = new THREE.Group(); pump.position.set(0, -.08, -.43); group.add(pump); group.userData.action = pump;
    box(pump, .133, .074, .25, 0, 0, 0, palette.wood);
    for (let i = 0; i < 9; i++) box(pump, .136, .006, .011, 0, -.023, -.1 + i * .025, palette.walnut);
    box(group, .12, .105, .4, 0, -.076, .31, palette.wood);
    box(group, .14, .17, .04, 0, -.104, .51, palette.glove);
    const grip = box(group, .08, .14, .07, 0, -.175, .10, palette.wood); grip.rotation.x = -.28;
    for (const s of [-1, 1]) { screw(group, s * .068, -.045, .07); screw(group, s * .068, -.057, -.13); }
    group.userData.sightY = .025;
  } else {
    const smg = id === 'smg', sniper = id === 'sniper', dmr = id === 'dmr';
    const finish = smg ? palette.blue : dmr ? palette.wood : palette.olive;
    const front = smg ? -.29 : -.37, handguard = smg ? .22 : sniper ? .43 : .36;
    const barrel = smg ? .18 : sniper ? .57 : dmr ? .42 : .34;
    const receiverLength = smg ? .37 : .43;
    box(group, .128, .044, receiverLength, 0, -.068, -.062, palette.steel);
    tube(group, .051, receiverLength - .015, 0, -.027, -.062, palette.steel, 24);
    box(group, .074, .014, receiverLength - .025, 0, .026, -.062, palette.dark);
    for (let i = 0; i < 11; i++) box(group, .088, .008, .012, 0, .035, .09 - i * .029, palette.steel);
    box(group, .011, .046, receiverLength - .025, -.059, -.03, -.062, palette.steel);
    // The receiver is enclosed; only the small ejection port exposes the bolt.
    tube(group, .052, .029, 0, -.027, -.062 + receiverLength / 2 - .014, palette.dark, 24);
    box(group, .119, .077, .027, 0, -.035, -.062 - receiverLength / 2 + .014, palette.steel);
    box(group, .012, .043, .092, .059, -.029, -.229, palette.steel);
    box(group, .012, .043, .112, .059, -.029, .082, palette.steel);
    box(group, .008, .009, .115, .054, -.045, -.069, palette.edge);
    box(group, .008, .019, .088, .050, -.019, -.064, palette.dark);
    box(group, .011, .020, .17, .059, -.011, -.064, palette.steel);
    box(group, .006, .020, .085, .052, -.032, -.060, palette.dark);
    receiverMarkings(group, id);
    for (const side of [-1, 1]) {
      box(group, .005, .003, receiverLength - .045, side * .066, -.062, -.062, palette.edge);
      for (const z of [-.185, .069]) screw(group, side * .07, -.047, z);
    }
    box(group, .009, .008, .042, -.075, -.086, .048, palette.edge, -.22);
    box(group, .09, .075, .2, 0, -.115, -.005, palette.dark);
    screw(group, .071, -.084, .015); screw(group, .071, -.084, -.16);
    tube(group, .023, smg ? .17 : .27, 0, -.065, smg ? .24 : .31, palette.edge);
    if (smg) {
      for (const s of [-1, 1]) {
        tube(group, .008, .28, s * .062, -.09, .31, palette.steel, 8);
        box(group, .016, .17, .04, s * .062, -.11, .46, palette.dark);
      }
    } else {
      stock(group, sniper ? .35 : .27, finish);
      box(group, .09, .019, .16, 0, -.018, .29, palette.glove);
    }
    const grip = box(group, .068, .16, .074, 0, -.192, .09, palette.olive); grip.rotation.x = -.28;
    for (let i = 0; i < 6; i++) box(group, .072, .003, .007, 0, -.145 - i * .02, .123 + i * .006, palette.dark);
    // Longitudinal rails and spaced cross ribs leave daylight through the handguard.
    box(group, .105, .018, handguard, 0, .001, front, finish);
    box(group, .092, .018, handguard, 0, -.088, front, finish);
    for (const s of [-1, 1]) {
      box(group, .014, .018, handguard, s * .057, -.011, front, palette.steel);
      box(group, .014, .018, handguard, s * .057, -.079, front, palette.steel);
      for (let i = 0; i < (smg ? 4 : 7); i++) {
        const z = front - handguard / 2 + .018 + i * (handguard - .036) / (smg ? 3 : 6);
        box(group, .013, .072, .011, s * .061, -.044, z, finish);
      }
    }
    box(group, .069, .012, handguard, 0, .016, front, palette.steel);
    for (let i = 0; i < Math.floor(handguard / .025); i++) box(group, .086, .004, .012, 0, .02, front - handguard / 2 + i * .025, palette.edge);
    const frontEnd = front - handguard / 2;
    tube(group, sniper ? .015 : .018, barrel, 0, -.044, frontEnd - barrel / 2, palette.steel);
    tube(group, .027, .09, 0, -.044, frontEnd - barrel + .01, palette.dark);
    for (const s of [-1, 1]) box(group, .005, .018, .034, s * .022, -.044, frontEnd - barrel - .015, palette.dark);
    if (sniper || dmr) {
      scope(group, .15, -.15, sniper ? .4 : .31, sniper ? .049 : .042);
      group.userData.sightY = .15;
      if (sniper) {
        for (const s of [-1, 1]) between(group, new THREE.Vector3(s * .04, -.095, -.65), new THREE.Vector3(s * .22, -.33, -.71), .009, .007, palette.steel);
      }
    } else if (id === 'm4') {
      box(group, .07, .016, .08, 0, .037, -.11, palette.dark);
      for (const s of [-1, 1]) box(group, .01, .071, .021, s * .037, .073, -.11, palette.steel);
      box(group, .084, .012, .022, 0, .11, -.11, palette.steel);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(.06, .055), palette.glass); glass.position.set(0, .076, -.122); group.add(glass);
      group.userData.sightY = .075;
    } else {
      box(group, .047, .028, .038, 0, .027, frontEnd, palette.steel);
      box(group, .013, .043, .016, 0, .063, frontEnd, palette.dark);
      for (const side of [-1, 1]) box(group, .008, .055, .014, side * .024, .055, frontEnd, palette.steel, side * -.16);
      box(group, .053, .03, .024, 0, .042, .07, palette.dark);
      for (const side of [-1, 1]) box(group, .009, .027, .019, side * .022, .071, .07, palette.dark);
      group.userData.sightY = .083;
    }
    group.userData.magazine = magazine(group, 0, -.136, -.105, smg ? .18 : sniper ? .095 : dmr ? .12 : .20, smg ? palette.blue : palette.steel);
    const action = new THREE.Group(); action.position.set(.07, -.035, .014); group.add(action); group.userData.action = action;
    box(action, .016, .014, .075, 0, 0, 0, palette.edge);
    if (sniper) {
      between(action, new THREE.Vector3(.01, 0, .015), new THREE.Vector3(.086, -.055, .015), .011, .009, palette.edge);
      ellipsoid(action, .094, -.064, .015, .021, .021, .021, palette.dark);
    }
    group.userData.muzzleZ = frontEnd - barrel - .05;
  }
  return group;
}

function paw(group: THREE.Group, palm: THREE.Vector3, elbow: THREE.Vector3, left: boolean, gripAngle = 0) {
  const wrist = palm.clone().add(new THREE.Vector3(0, -.018, .055));
  // Teal squad sleeve up to mid-forearm, then fur, a tape wrap and the paw.
  const cuffAt = elbow.clone().lerp(wrist, .5), tapeAt = elbow.clone().lerp(wrist, .82);
  between(group, elbow, cuffAt, .1, .088, palette.sleeve);
  between(group, cuffAt.clone().lerp(elbow, .12), cuffAt, .095, .093, palette.cuff);
  between(group, cuffAt, wrist, .077, .062, palette.skin);
  between(group, tapeAt.clone().lerp(elbow, .06), tapeAt.clone().lerp(wrist, .5), .071, .068, palette.tape);
  ellipsoid(group, elbow.x, elbow.y, elbow.z, .1, .1, .104, palette.sleeve);
  ellipsoid(group, wrist.x, wrist.y, wrist.z, .066, .065, .068, palette.skin);

  const foot = new THREE.Group(); foot.position.copy(palm);
  foot.rotation.y = left ? -gripAngle : gripAngle;
  group.add(foot);
  ellipsoid(foot, 0, 0, 0, .072, .041, .069, palette.skin);
  ellipsoid(foot, 0, .032, .002, .043, .006, .029, palette.skinLight);
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * .039;
    const outer = i === 0 || i === 3;
    const z = outer ? -.066 : -.073;
    ellipsoid(foot, x, -.013, z, .017, .018, outer ? .031 : .037, palette.skin);
    ellipsoid(foot, x, -.002, z - (outer ? .027 : .032), .011, .006, .013, palette.nail);
    if (i < 3) ellipsoid(foot, x + .0195, -.018, -.067, .005, .009, .023, palette.skinShade);
  }
  for (const side of [-1, 1]) {
    ellipsoid(foot, side * .066, .004, .024, .011, .017, .031, palette.skin);
    ellipsoid(foot, side * .068, .017, .045, .007, .013, .022, palette.skinShade);
  }
}
function arms(group: THREE.Group, id: WeaponId): THREE.Group {
  const support = new THREE.Group(); group.add(support);
  const main = new THREE.Group(); group.add(main);
  if (id === 'machete') {
    paw(main, new THREE.Vector3(.067, -.092, .135), new THREE.Vector3(.25, -.37, .38), false, .24);
  } else if (id === 'slingshot') {
    paw(main, new THREE.Vector3(.065, -.13, .10), new THREE.Vector3(.25, -.38, .36), false, .2);
    paw(support, new THREE.Vector3(-.085, .13, -.28), new THREE.Vector3(-.25, -.25, .12), true, .15);
  } else if (id === 'pistol') {
    paw(main, new THREE.Vector3(.058, -.085, .045), new THREE.Vector3(.27, -.38, .39), false, .36);
    paw(support, new THREE.Vector3(-.058, -.087, .055), new THREE.Vector3(-.25, -.35, .34), true, .36);
  } else {
    const supportZ = id === 'shotgun' ? -.43 : id === 'sniper' ? -.36 : id === 'smg' ? -.29 : -.35;
    paw(main, new THREE.Vector3(.077, -.18, .10), new THREE.Vector3(.27, -.41, .43), false, .22);
    paw(support, new THREE.Vector3(-.087, -.13, supportZ),
      new THREE.Vector3(-.27, -.40, id === 'shotgun' || id === 'sniper' ? .06 : .16), true, .18);
  }
  return support;
}

interface Model { group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D; magazine?: THREE.Object3D; action?: THREE.Object3D; support: THREE.Group; sightY: number; hipX: number; adsZ: number }
interface Shell { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }

function disposeImported(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (material instanceof THREE.MeshStandardMaterial) {
        for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap])
          if (texture) textures.add(texture);
      }
    }
  });
  geometry.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, .01, 10);
  private readonly holder = new THREE.Group();
  private readonly models = {} as Record<WeaponId, Model>;
  private readonly flash: THREE.Sprite;
  private readonly shells: Shell[] = [];
  private active: WeaponId = 'pistol';
  private ads = 0;
  private kick = 0;
  private draw = 0;
  private gait = 0;
  private flashLife = 0;
  private shellCursor = 0;
  private shotLife = 0;
  private reloadEnd = 0;
  private disposed = false;
  private furColor = '';

  constructor(onAssetsReady: () => void = () => {}) {
    this.scene.add(new THREE.HemisphereLight('#e4ece6', '#5e5147', .85));
    const key = new THREE.DirectionalLight('#ffe6c4', 2.7); key.position.set(-1.4, 2.4, 2.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#b9e3ea', 1.1); rim.position.set(1.8, .9, -1.6); this.scene.add(rim);
    this.scene.add(this.holder);
    let pistolFallback: THREE.Group | undefined, sniperFallback: THREE.Group | undefined;
    for (const id of ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot'] as WeaponId[]) {
      const body = gunBase(id);
      if (id === 'pistol') pistolFallback = body;
      if (id === 'sniper') sniperFallback = body;
      const group = id === 'pistol' || id === 'sniper' ? new THREE.Group() : body;
      if (group !== body) group.add(body);
      const support = arms(group, id); group.visible = false; this.holder.add(group);
      batchRigidParts(group); addOutlines(group);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, id === 'pistol' ? .005 : id === 'slingshot' ? .23 : -.044,
        id === 'pistol' ? -.30 : id === 'shotgun' ? -.95 : id === 'machete' ? -.75 : id === 'slingshot' ? -.36 : body.userData.muzzleZ || -.85);
      const eject = new THREE.Object3D(); eject.position.set(id === 'pistol' ? .06 : .083, -.03, -.045);
      group.add(muzzle, eject);
      this.models[id] = { group, muzzle, eject, magazine: body.userData.magazine, action: body.userData.action, support,
        sightY: body.userData.sightY || 0, hipX: id === 'pistol' ? .23 : id === 'machete' ? .25 : id === 'slingshot' ? .23 : id === 'smg' ? .20 : .18,
        adsZ: id === 'pistol' ? -.36 : id === 'machete' ? -.32 : id === 'slingshot' ? -.33 : -.29 };
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,230,1)'); gradient.addColorStop(.25, 'rgba(255,213,118,.94)'); gradient.addColorStop(.65, 'rgba(255,120,55,.45)'); gradient.addColorStop(1, 'rgba(255,120,55,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: '#fff2cd', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.set(.24, .24, .24); this.flash.visible = false; this.scene.add(this.flash);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .028, 10), palette.brass);
      mesh.visible = false; this.scene.add(mesh); this.shells.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    // `assets` settles once every imported model has loaded (or failed), so the
    // renderer's warm-up can compile and upload them before the first match.
    let pending = (pistolFallback ? 1 : 0) + (sniperFallback ? 1 : 0), settle = () => {};
    this.assets = pending ? new Promise<void>(resolve => { settle = resolve; }) : Promise.resolve();
    const ready = () => { onAssetsReady(); if (--pending <= 0) settle(); };
    if (pistolFallback) this.loadPistol(pistolFallback, ready);
    if (sniperFallback) this.loadSniper(sniperFallback, ready);
  }

  readonly assets: Promise<void>;

  // Warm-up only: show every model at once so one render compiles and uploads all of them.
  revealAll(on: boolean) {
    this.holder.visible = on;
    for (const [id, model] of Object.entries(this.models) as [WeaponId, Model][]) model.group.visible = on || id === this.active;
  }

  private loadPistol(fallback: THREE.Group, onAssetsReady: () => void) {
    const url = `${import.meta.env.BASE_URL}models/service-pistol/service_pistol_1k.gltf`;
    new GLTFLoader().load(url, gltf => {
      if (this.disposed) { disposeImported(gltf.scene); return; }
      const names = ['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_hammer_a',
        'service_pistol_trigger_a', 'service_pistol_magazine_loaded'];
      const nodes = names.map(name => gltf.scene.getObjectByName(name));
      if (nodes.some(node => !node)) { disposeImported(gltf.scene); onAssetsReady(); return; }
      const [frame, slide, hammer, trigger, loadedMagazine] = nodes as THREE.Object3D[];
      const modelRoot = new THREE.Group();
      modelRoot.rotation.y = Math.PI / 2;
      modelRoot.scale.setScalar(1.7);
      modelRoot.position.y = -.06;
      for (const part of [frame, hammer, trigger]) modelRoot.add(part);
      const slideMotion = new THREE.Group(); slideMotion.userData.gltfSlide = true;
      slideMotion.add(slide); modelRoot.add(slideMotion);
      loadedMagazine.position.set(0, 0, 0);
      const magazineMotion = new THREE.Group();
      magazineMotion.position.set(-.005, -.03, 0);
      magazineMotion.userData.restY = -.03;
      magazineMotion.userData.travel = .11;
      magazineMotion.add(loadedMagazine); modelRoot.add(magazineMotion);
      modelRoot.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
      addOutlines(modelRoot);
      const pistol = this.models.pistol;
      pistol.group.remove(fallback);
      fallback.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      pistol.group.add(modelRoot);
      pistol.magazine = magazineMotion;
      pistol.action = slideMotion;
      pistol.sightY = .074;
      pistol.eject.position.set(.038, .046, -.07);
      onAssetsReady();
    }, undefined, () => { if (!this.disposed) onAssetsReady(); });
  }

  private async loadSniper(fallback: THREE.Group, onAssetsReady: () => void) {
    try {
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
      if (this.disposed) return;
      const manager = new THREE.LoadingManager();
      const base = `${import.meta.env.BASE_URL}models/m700/`;
      const loader = new THREE.TextureLoader(manager);
      const color = loader.load(`${base}color.webp`);
      color.colorSpace = THREE.SRGBColorSpace;
      const normal = loader.load(`${base}normal.webp`);
      const metalness = loader.load(`${base}metalness.webp`);
      const ao = loader.load(`${base}ao.webp`);
      const roughness = loader.load(`${base}roughness.webp`);
      const maps = [color, normal, metalness, ao, roughness];
      let installed = false;
      manager.onLoad = () => {
        if (!installed) maps.forEach(map => map.dispose());
        if (!this.disposed) onAssetsReady();
      };
      new FBXLoader(manager).load(`${base}m700.fbx`, fbx => {
        if (this.disposed) { disposeImported(fbx); return; }
        const main = fbx.getObjectByName('FRAME_LOD0001');
        if (!(main instanceof THREE.SkinnedMesh)) { disposeImported(fbx); return; }
        const material = new THREE.MeshStandardMaterial({
          map: color, normalMap: normal, normalScale: new THREE.Vector2(.7, -.7),
          metalnessMap: metalness, aoMap: ao, roughnessMap: roughness,
          metalness: 1, roughness: 1, aoMapIntensity: .65,
        });
        const originals = new Set<THREE.Material>();
        fbx.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const mesh = object as THREE.Mesh;
          for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) originals.add(old);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => material) : material;
          if (mesh.geometry.hasAttribute('uv') && !mesh.geometry.hasAttribute('uv2'))
            mesh.geometry.setAttribute('uv2', mesh.geometry.getAttribute('uv').clone());
          mesh.castShadow = true;
        });
        originals.forEach(old => old.dispose());
        const modelRoot = new THREE.Group();
        modelRoot.rotation.y = Math.PI;
        modelRoot.scale.setScalar(.0115);
        modelRoot.position.z = .05;
        modelRoot.add(fbx);
        const sniper = this.models.sniper;
        sniper.group.remove(fallback);
        fallback.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
        sniper.group.add(modelRoot);
        const optic = scope(sniper.group, .15, -.18, .42, .049);
        addOutlines(modelRoot); addOutlines(optic);
        sniper.sightY = .15;
        sniper.muzzle.position.set(0, -.045, -.81);
        sniper.eject.position.set(.055, -.025, -.10);
        const bolt = main.skeleton.bones.find(bone => bone.name === 'BOLT');
        const magazine = main.skeleton.bones.find(bone => bone.name === 'MAGAZINE');
        if (bolt) { bolt.userData.fbxBolt = true; bolt.userData.restY = bolt.position.y; sniper.action = bolt; }
        if (magazine) { magazine.userData.fbxMagazine = true; magazine.userData.restZ = magazine.position.z; sniper.magazine = magazine; }
        installed = true;
      }, undefined, () => { if (!this.disposed) onAssetsReady(); });
    } catch { if (!this.disposed) onAssetsReady(); }
  }

  shot(id: WeaponId) {
    this.kick = Math.min(.15, this.kick + (id === 'sniper' ? .12 : id === 'shotgun' ? .095 : id === 'machete' ? .07 : id === 'pistol' ? .055 : .034));
    this.shotLife = id === 'machete' ? .48 : id === 'shotgun' ? .42 : id === 'sniper' ? .58 : .2;
    this.flashLife = id === 'machete' || id === 'slingshot' ? 0 : .065;
    if (id === 'machete' || id === 'slingshot') return;
    const shell = this.shells[this.shellCursor++ % this.shells.length];
    this.scene.updateMatrixWorld(true);
    this.models[id].eject.getWorldPosition(shell.mesh.position);
    shell.mesh.material = id === 'shotgun' ? palette.shellRed : palette.brass;
    shell.mesh.scale.setScalar(id === 'shotgun' ? 1.6 : 1);
    shell.mesh.visible = true; shell.mesh.rotation.set(0, 0, Math.PI / 2);
    shell.velocity.set(1.4 + Math.random() * .7, .9 + Math.random() * .7, .2 + Math.random() * .4); shell.life = .7;
  }

  update(actor: ActorState | undefined, dt: number, settings: Settings, closeWall: number, simulationTime: number) {
    this.holder.visible = !!actor && actor.alive && actor.stage === 'ground';
    if (!actor || !this.holder.visible) { this.flash.visible = false; return; }
    if (actor.color && actor.color !== this.furColor) {
      this.furColor = actor.color;
      const fur = new THREE.Color(actor.color);
      palette.skin.color.copy(fur).lerp(new THREE.Color('#5a3f2c'), .1);
      palette.skinLight.color.copy(fur).lerp(new THREE.Color('#f0d3a8'), .45);
      palette.skinShade.color.copy(fur).lerp(new THREE.Color('#3f2a1d'), .45);
    }
    const weapon = actor.weapons[actor.slot]?.id || 'pistol';
    if (weapon !== this.active) {
      this.models[this.active].group.visible = false; this.active = weapon; this.models[this.active].group.visible = true;
      this.draw = 1; this.kick = 0; this.reloadEnd = 0; this.ads = 0;
    }
    const model = this.models[this.active]; model.group.visible = true;
    const reloading = actor.reloadUntil > simulationTime;
    if (reloading && actor.reloadUntil > this.reloadEnd) this.reloadEnd = actor.reloadUntil;
    const duration = WEAPONS[weapon].reload || 1;
    const progress = reloading ? THREE.MathUtils.clamp(1 - (this.reloadEnd - simulationTime) / duration, 0, 1) : 0;
    const magazineMotion = reloading ? Math.sin(Math.PI * progress) : 0;
    if (model.magazine) {
      if (model.magazine.userData.fbxMagazine) {
        model.magazine.position.z = model.magazine.userData.restZ - magazineMotion * .09;
      } else {
        model.magazine.position.y = (model.magazine.userData.restY || 0) - magazineMotion * (model.magazine.userData.travel || .2);
        model.magazine.rotation.z = -magazineMotion * .25;
      }
    }
    model.support.position.set(magazineMotion * .012, -magazineMotion * .055, magazineMotion * .11);
    model.support.rotation.x = -magazineMotion * .25;
    if (model.action) {
      const baseZ = weapon === 'shotgun' ? -.43 : weapon === 'pistol' ? 0 : .014;
      const total = weapon === 'shotgun' ? .42 : weapon === 'sniper' ? .58 : .2;
      const cycle = this.shotLife > 0 ? Math.sin(Math.PI * THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1)) : 0;
      if (model.action.userData.fbxBolt) model.action.position.y = model.action.userData.restY + cycle * .07;
      else if (model.action.userData.gltfSlide) model.action.position.x = -cycle * .027;
      else model.action.position.z = baseZ + cycle * (weapon === 'shotgun' ? .11 : .045);
      if (!model.action.userData.fbxBolt) model.action.rotation.z = weapon === 'sniper' ? -cycle * .6 : 0;
      if (weapon === 'shotgun') model.support.position.z += cycle * .11;
    }
    const goalAds = actor.ads && !reloading && !actor.sprint && weapon !== 'machete' ? 1 : 0;
    this.ads = advanceAds(weapon, this.ads, !!goalAds, dt);
    this.kick = damp(this.kick, 0, 18, dt);
    this.draw = damp(this.draw, 0, 7, dt);
    this.shotLife = Math.max(0, this.shotLife - dt);
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    this.gait += dt * (actor.sprint ? 14 : speed > .4 ? 10 : 2);
    const bob = settings.reducedMotion ? 0 : Math.min(speed / 7, 1) * (actor.sprint ? .027 : .012);
    const sprint = actor.sprint ? 1 : 0;
    const modelScale = .72;
    this.holder.scale.setScalar(modelScale);
    const hipY = THREE.MathUtils.lerp(-.245, -model.sightY * modelScale, this.ads);
    this.holder.position.set(THREE.MathUtils.lerp(model.hipX + .045, 0, this.ads) + Math.sin(this.gait) * bob * .4,
      hipY + Math.abs(Math.sin(this.gait)) * bob - this.kick * .55 - this.draw * .16 - sprint * .08 - closeWall * .12 - magazineMotion * .045,
      THREE.MathUtils.lerp(-.73, model.adsZ, this.ads) + this.kick * .8 + closeWall * .08 + sprint * .07);
    this.holder.rotation.set(this.kick * 1.1 + this.draw * .38 + magazineMotion * .24 + sprint * .16,
      THREE.MathUtils.lerp(.24, 0, this.ads) + closeWall * .28,
      THREE.MathUtils.lerp(-.055, 0, this.ads) + Math.sin(this.gait) * bob * 1.7 - magazineMotion * .13);
    model.group.rotation.x = weapon === 'machete' && this.shotLife > 0 ? Math.sin((1 - this.shotLife / .48) * Math.PI) * .8 : 0;
    model.group.rotation.z = weapon === 'machete' && this.shotLife > 0 ? Math.sin((1 - this.shotLife / .48) * Math.PI) * -.45 : 0;
    this.flashLife -= dt;
    this.flash.visible = this.flashLife > 0;
    if (this.flash.visible) {
      this.scene.updateMatrixWorld(true);
      model.muzzle.getWorldPosition(this.flash.position);
      const s = weapon === 'shotgun' || weapon === 'sniper' ? .42 : .28;
      this.flash.scale.set(s, s, s);
    }
    for (const shell of this.shells) {
      if (shell.life <= 0) continue;
      shell.life -= dt; shell.mesh.visible = shell.life > 0;
      shell.velocity.y -= dt * 7; shell.mesh.position.addScaledVector(shell.velocity, dt);
      shell.mesh.rotation.x += dt * 17; shell.mesh.rotation.z += dt * 11;
    }
  }

  resize(width: number, height: number) { this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); }
  get adsAmount() { return this.ads; }
  get weapon() { return this.active; }
  dispose() {
    this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      const ownMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of ownMaterials) if (!Object.values(palette).includes(material)) {
        materials.add(material);
        if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
        if (material instanceof THREE.MeshStandardMaterial) {
          for (const texture of [material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap])
            if (texture) textures.add(texture);
        }
      }
    });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
    for (const material of Object.values(palette)) material.dispose();
    outlineMaterial.dispose();
    furGrain.dispose(); woodGrain.dispose(); polymerGrain.dispose(); metalGrain.dispose(); scopeLensMap.dispose();
  }
}
