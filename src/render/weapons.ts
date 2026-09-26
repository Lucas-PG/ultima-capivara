import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetLoader } from './assets';
import { PaintedWeaponSet, PAINTED_WEAPON_IDS, paintedWeaponsEnabled, type PaintedWeaponModel } from './painted-weapons';
import { WEAPON_HIP_POSES, WEAPON_VIEW_FOV } from './weapon-framing';
import { damp } from '../shared/math';
import { Spring } from './spring';
import { PAINT } from './materials';
import { advanceAds, WEAPONS } from '../shared/weapons';
import { createReloadPose, sampleReload, sampleMelee, smoothPose, weaponShotDuration, SUPPORT_PALM,
  MELEE_SECONDS, MELEE_CONTACT, MELEE_HIT_STOP, type MeleePose, type ReloadPose } from '../shared/weapon-presentation';
import type { ActorState, Settings, WeaponId } from '../shared/types';

const palette = {
  // Painted local colours stay readable under the continuous warm key.
  steel: new THREE.MeshStandardMaterial({ color: '#3c4648', metalness: .32, roughness: .5 }),
  edge: new THREE.MeshStandardMaterial({ color: '#8c9794', metalness: .4, roughness: .42 }),
  dark: new THREE.MeshStandardMaterial({ color: '#1d2523', metalness: .1, roughness: .72 }),
  olive: new THREE.MeshStandardMaterial({ color: '#5c6b45', metalness: .05, roughness: .8 }),
  wood: new THREE.MeshStandardMaterial({ color: '#b07a4b', roughness: .7 }),
  walnut: new THREE.MeshStandardMaterial({ color: '#7d5637', roughness: .74 }),
  brass: new THREE.MeshStandardMaterial({ color: '#e0b265', metalness: .35, roughness: .38 }),
  shellRed: new THREE.MeshStandardMaterial({ color: '#c24635', metalness: .1, roughness: .56 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2e5d5f', metalness: .12, roughness: .66 }),
  skin: new THREE.MeshStandardMaterial({ color: '#B8743A', roughness: .95 }),
  skinLight: new THREE.MeshStandardMaterial({ color: '#D39A47', roughness: .95 }),
  skinShade: new THREE.MeshStandardMaterial({ color: '#7A4424', roughness: .95 }),
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

interface Model { group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D; magazine?: THREE.Object3D; action?: THREE.Object3D; support: THREE.Object3D; triggerFinger?: THREE.Object3D; gripFingers?: THREE.Object3D; sightY: number; hipX: number; adsZ: number; painted?: PaintedWeaponModel; rarity?: number }

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
  private readonly key = new THREE.DirectionalLight(PAINT.sun, 3.1);
  private readonly rim = new THREE.DirectionalLight(PAINT.rim, .8);
  private readonly inverseView = new THREE.Quaternion();
  private readonly models = {} as Record<WeaponId, Model>;
  private readonly painted = paintedWeaponsEnabled() ? new PaintedWeaponSet() : null;
  private readonly warmupVariants = new THREE.Group();
  private readonly reloadProps: THREE.Mesh[] = [];
  private active: WeaponId = 'pistol';
  private ads = 0;
  private kick = 0;
  private readonly recoil = new Spring();
  private readonly recoilYaw = new Spring();
  private readonly swayX = new Spring();
  private readonly swayY = new Spring();
  private readonly land = new Spring();
  private lastYaw: number | undefined;
  private lastPitch = 0;
  private grounded = true;
  private swimming = false;
  private swimPose = 0;
  private verticalSpeed = 0;
  private sprintPose = 0;
  private holster = 0;
  private draw = 0;
  private gait = 0;
  private breathingTime = 0;
  private shotLife = 0;
  private reloadEnd = 0;
  private readonly reloadPose = createReloadPose();
  private readonly reloadTarget = createReloadPose();
  private readonly palm = new THREE.Vector3();
  private readonly palmRotated = new THREE.Vector3();
  private bobAmount = 0;
  private wallPose = 0;
  private meleeTime = MELEE_SECONDS;
  private meleeSide = -1;
  private meleeHit = false;
  private meleeStop = 0;
  private readonly meleePose: MeleePose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, smear: 0, kick: 0 };
  private readonly smear = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: '#ffe3a1', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  private readonly trailBase = new THREE.Vector3();
  private readonly trailTip = new THREE.Vector3();
  private readonly lastTrailBase = new THREE.Vector3();
  private readonly lastTrailTip = new THREE.Vector3();
  private inspectTime = -1;
  private inspectAllowed = false;
  private readonly restPosition = new THREE.Vector3();
  private readonly restRotation = new THREE.Euler();
  private disposed = false;

  constructor(private readonly loader: AssetLoader, onAssetsReady: () => void = () => {}) {
    this.scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, 1.05));
    this.key.position.set(-70, 32, -30); this.rim.position.set(-70, 65, -30);
    this.scene.add(this.key, this.rim);
    if (this.painted) { this.camera.fov = WEAPON_VIEW_FOV; this.camera.updateProjectionMatrix(); }
    this.warmupVariants.visible = false; this.scene.add(this.warmupVariants);
    this.scene.add(this.holder);
    this.smear.name = 'Machete motion smear'; this.smear.visible = false; this.smear.frustumCulled = false;
    this.smear.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    this.smear.renderOrder = 2; this.scene.add(this.smear);
    let pistolFallback: THREE.Group | undefined, sniperFallback: THREE.Group | undefined;
    for (const id of this.painted ? [] : PAINTED_WEAPON_IDS) {
      const body = gunBase(id);
      if (id === 'pistol') pistolFallback = body;
      if (id === 'sniper') sniperFallback = body;
      const group = id === 'pistol' || id === 'sniper' ? new THREE.Group() : body;
      if (group !== body) group.add(body);
      const support = arms(group, id); group.visible = false; this.holder.add(group);
      batchRigidParts(group);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, id === 'pistol' ? .005 : id === 'slingshot' ? .23 : -.044,
        id === 'pistol' ? -.30 : id === 'shotgun' ? -.95 : id === 'machete' ? -.75 : id === 'slingshot' ? -.36 : body.userData.muzzleZ || -.85);
      const eject = new THREE.Object3D(); eject.position.set(id === 'pistol' ? .06 : .083, -.03, -.045);
      group.add(muzzle, eject);
      this.models[id] = { group, muzzle, eject, magazine: body.userData.magazine, action: body.userData.action, support,
        sightY: body.userData.sightY || 0, hipX: id === 'pistol' ? .23 : id === 'machete' ? .25 : id === 'slingshot' ? .23 : id === 'smg' ? .20 : .18,
        adsZ: id === 'pistol' ? -.36 : id === 'machete' ? -.32 : id === 'slingshot' ? -.33 : -.29 };
    }
    this.assets = (this.painted ? this.loadPainted() : Promise.all([
      pistolFallback ? this.loadPistol(pistolFallback) : Promise.resolve(),
      sniperFallback ? this.loadSniper(sniperFallback) : Promise.resolve(),
    ])).then(() => {
      if (this.disposed) throw new Error('Weapon view disposed before preparation completed');
      onAssetsReady();
    });
    void this.assets.catch(() => {});

  }

  readonly assets: Promise<void>;

  // Warm-up only: show every model at once so one render compiles and uploads all of them.
  revealAll(on: boolean) {
    this.holder.visible = on; this.warmupVariants.visible = on;
    for (const [id, model] of Object.entries(this.models) as [WeaponId, Model][]) model.group.visible = on || id === this.active;
    for (const prop of this.reloadProps) prop.visible = on;
  }

  private async loadPainted() {
    const set = this.painted!;
    await set.preload(url => this.loader.gltf(url));
    if (this.disposed) throw new Error('Weapon view disposed before preparation completed');
    for (const id of PAINTED_WEAPON_IDS) {
      const painted = set.create(id);
      this.models[id] = { ...painted, painted, rarity: 0, hipX: WEAPON_HIP_POSES[id].x, adsZ: -.4 };
      painted.group.visible = false; this.holder.add(painted.group);
      if (id === 'shotgun' || id === 'slingshot') {
        // One original prop stays in the support paw until its seating contact.
        const prop = id === 'shotgun'
          ? new THREE.Mesh(new THREE.CylinderGeometry(.019, .019, .072, 10), palette.shellRed)
          : new THREE.Mesh(new THREE.IcosahedronGeometry(.022, 1), palette.steel);
        prop.name = 'reload-prop'; prop.visible = false;
        prop.userData.reloadProp = true; this.reloadProps.push(prop);
        const anchor = SUPPORT_PALM[id]; prop.position.set(anchor[0] + .042, anchor[1] + .028, anchor[2]);
        prop.rotation.x = Math.PI / 2; painted.support.add(prop);
        if (id === 'shotgun') {
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(.021, .021, .015, 10), palette.brass);
          rim.userData.reloadProp = true; this.reloadProps.push(rim);
          rim.position.y = -.03; prop.add(rim);
        }
      }
      for (let rarity = 1; rarity < 4; rarity++) this.warmupVariants.add(set.create(id, rarity).group);
    }
  }

  private async loadPistol(fallback: THREE.Group) {
    const gltf = await this.loader.gltf('models/service-pistol/service_pistol_1k.gltf');
    if (this.disposed) { disposeImported(gltf.scene); return; }
    const names = ['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_hammer_a',
      'service_pistol_trigger_a', 'service_pistol_magazine_loaded'];
    const nodes = names.map(name => gltf.scene.getObjectByName(name));
    const missing = names.filter((_, index) => !nodes[index]);
    if (missing.length) {
      disposeImported(gltf.scene);
      throw new Error(`models/service-pistol/service_pistol_1k.gltf: missing required nodes ${missing.join(', ')}`);
    }
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

    const pistol = this.models.pistol;
    pistol.group.remove(fallback);
    fallback.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    pistol.group.add(modelRoot);
    pistol.magazine = magazineMotion;
    pistol.action = slideMotion;
    pistol.sightY = .074;
    pistol.eject.position.set(.038, .046, -.07);
  }

  private async loadSniper(fallback: THREE.Group) {
    const base = 'models/m700/';
    const color = this.loader.texture(`${base}color.webp`);
    color.colorSpace = THREE.SRGBColorSpace;
    const normal = this.loader.texture(`${base}normal.webp`);
    const metalness = this.loader.texture(`${base}metalness.webp`);
    const ao = this.loader.texture(`${base}ao.webp`);
    const roughness = this.loader.texture(`${base}roughness.webp`);
    const fbx = await this.loader.fbx(`${base}m700.fbx`);
    if (this.disposed) { disposeImported(fbx); return; }
    const main = fbx.getObjectByName('FRAME_LOD0001');
    if (!(main instanceof THREE.SkinnedMesh)) {
      disposeImported(fbx);
      throw new Error(`${base}m700.fbx: required node FRAME_LOD0001 must be a SkinnedMesh`);
    }
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

    sniper.sightY = .15;
    sniper.muzzle.position.set(0, -.045, -.81);
    sniper.eject.position.set(.055, -.025, -.10);
    const bolt = main.skeleton.bones.find(bone => bone.name === 'BOLT');
    const magazine = main.skeleton.bones.find(bone => bone.name === 'MAGAZINE');
    if (bolt) { bolt.userData.fbxBolt = true; bolt.userData.restY = bolt.position.y; sniper.action = bolt; }
    if (magazine) { magazine.userData.fbxMagazine = true; magazine.userData.restZ = magazine.position.z; sniper.magazine = magazine; }
  }

  inspect(): boolean {
    if (this.disposed || !this.inspectAllowed) return false;
    this.inspectTime = 0;
    return true;
  }

  private cancelInspect() {
    if (this.inspectTime < 0) return;
    this.inspectTime = -1;
    // Event-driven shots read muzzle anchors before the next render update.
    this.holder.position.copy(this.restPosition); this.holder.rotation.copy(this.restRotation);
  }

  shot(id: WeaponId, contact = false) {
    this.cancelInspect(); this.inspectAllowed = false;
    // A cosmetic holster must never make a confirmed shot emerge from the
    // previous weapon's muzzle. Gameplay can fire before the animation ends.
    if (id !== this.active && this.models[id]) {
      this.models[this.active].group.visible = false; this.active = id; this.models[id].group.visible = true;
      this.draw = Math.max(this.draw, this.holster); this.holster = 0; this.ads = 0;
    }
    if (id === 'machete') {
      this.meleeTime = 0; this.meleeSide *= -1; this.meleeHit = contact; this.meleeStop = 0;
    } else {
      this.recoil.impulse(id === 'sniper' ? 4.4 : id === 'shotgun' ? 3.6 : id === 'pistol' ? 2.5 : 1.65);
      this.recoilYaw.impulse((Math.random() - .5) * .55);
    }
    this.shotLife = weaponShotDuration(id);
  }

  // Barrel tip and ejection port of the held weapon, in this scene's (camera) space.
  // The effects module draws the muzzle flash and casings there.
  muzzleWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].muzzle.getWorldPosition(target); }
  ejectWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].eject.getWorldPosition(target); }

  update(actor: ActorState | undefined, dt: number, settings: Settings, closeWall: number, simulationTime: number, viewRotation?: THREE.Quaternion) {
    if (viewRotation) {
      this.inverseView.copy(viewRotation).invert();
      this.key.position.set(-70, 32, -30).applyQuaternion(this.inverseView);
      this.rim.position.set(-70, 65, -30).applyQuaternion(this.inverseView);
    }
    this.holder.visible = !!actor && actor.alive && actor.stage === 'ground' && !(actor.emote && actor.emoteUntil > simulationTime);
    if (!actor || !this.holder.visible) {
      this.cancelInspect(); this.inspectAllowed = false; this.lastYaw = undefined; this.land.reset();
      this.swimPose = 0; this.swimming = false; this.sprintPose = 0; this.bobAmount = 0; this.wallPose = 0;
      this.gait = 0; this.breathingTime = 0;
      this.meleeTime = MELEE_SECONDS; this.meleeSide = -1; this.meleeStop = 0; this.meleeHit = false; this.smear.visible = false;
      this.shotLife = 0; this.reloadEnd = 0; this.ads = 0; this.draw = 0; this.holster = 0;
      this.recoil.reset(); this.recoilYaw.reset(); this.swayX.reset(); this.swayY.reset();
      sampleReload(this.active, 0, this.reloadPose); sampleMelee(MELEE_SECONDS, this.meleeSide, this.meleePose);
      return;
    }
    const requested = actor.weapons[actor.slot]?.id || 'pistol';
    if (requested !== this.active) {
      this.cancelInspect(); this.holster = Math.min(1, this.holster + dt / .11);
      if (this.holster >= 1) {
        this.models[this.active].group.visible = false; this.active = requested; this.models[this.active].group.visible = true;
        this.draw = 1; this.holster = 0; this.recoil.reset(); this.recoilYaw.reset(); this.reloadEnd = 0; this.ads = 0;
        sampleReload(requested, 0, this.reloadPose); this.meleeTime = MELEE_SECONDS; this.meleeStop = 0;
      }
    } else this.holster = damp(this.holster, 0, 20, dt);
    const weapon = this.active;
    const model = this.models[this.active]; model.group.visible = true;
    const rarity = actor.weapons[actor.slot]?.rarity ?? 0;
    if (model.painted && rarity !== model.rarity) {
      this.painted!.setRarity(model.painted, rarity); model.rarity = rarity;
    }
    const reloading = requested === weapon && actor.reloadUntil > simulationTime;
    this.inspectAllowed = requested === weapon && !actor.swimming && !actor.ads && !actor.sprint && !reloading &&
      this.shotLife <= 0 && (weapon !== 'machete' || this.meleeTime >= MELEE_SECONDS);
    if (!this.inspectAllowed) this.cancelInspect();
    if (reloading) this.reloadEnd = actor.reloadUntil;
    const duration = WEAPONS[weapon].reload || 1;
    const progress = reloading ? THREE.MathUtils.clamp(1 - (this.reloadEnd - simulationTime) / duration, 0, 1) : 0;
    const namedReload = !!model.painted || (model.magazine?.name === 'mag' && model.support.name === 'grip_l');
    sampleReload(weapon, progress, this.reloadTarget);
    for (const key of Object.keys(this.reloadPose) as (keyof ReloadPose)[]) {
      // A cancelled reload recovers from the current pose; completion itself
      // reaches exact rest at its authoritative deadline, without a trailing lag.
      this.reloadPose[key] = reloading ? this.reloadTarget[key] : this.reloadEnd > 0 && simulationTime >= this.reloadEnd ? 0 : damp(this.reloadPose[key], 0, 32, dt);
      if (Math.abs(this.reloadPose[key]) < .00001) this.reloadPose[key] = 0;
    }
    if (!reloading && simulationTime >= this.reloadEnd) this.reloadEnd = 0;
    const reload = this.reloadPose, magazineMotion = -reload.mag / (weapon === 'pistol' ? .26 : .32);
    if (model.magazine) {
      if (model.magazine.userData.fbxMagazine) {
        model.magazine.position.z = model.magazine.userData.restZ - magazineMotion * .09;
      } else {
        model.magazine.position.y = (model.magazine.userData.restY || 0) + (namedReload ? reload.mag : -magazineMotion * (model.magazine.userData.travel || .2));
        model.magazine.rotation.z = 0;
      }
    }
    if (namedReload) {
      model.support.rotation.set(0, 0, reload.handRoll);
      this.palm.fromArray(SUPPORT_PALM[weapon]); this.palmRotated.copy(this.palm).applyEuler(model.support.rotation);
      model.support.position.copy(this.palm).sub(this.palmRotated).add(this.palmRotated.set(reload.handX, reload.handY, reload.handZ));
    } else {
      model.support.position.set(magazineMotion * .055, -magazineMotion * .055, magazineMotion * .11);
      model.support.rotation.x = -magazineMotion * .25;
    }
    const prop = model.support.getObjectByName?.('reload-prop');
    if (prop) { prop.visible = reloading && reload.prop > .01; prop.scale.setScalar(Math.max(.001, reload.prop)); for (const child of prop.children) child.visible = true; }
    if (model.action) {
      const baseZ = model.painted ? 0 : weapon === 'shotgun' ? -.43 : weapon === 'pistol' ? 0 : .014;
      const total = weaponShotDuration(weapon);
      const cycle = this.shotLife > 0 ? Math.sin(Math.PI * THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1)) : 0;
      if (model.action.userData.fbxBolt) model.action.position.y = model.action.userData.restY + cycle * .07;
      else if (model.action.userData.gltfSlide) model.action.position.x = -cycle * .027;
      else model.action.position.z = baseZ + cycle * (weapon === 'shotgun' ? .11 : .045) + reload.action;
      if (!model.action.userData.fbxBolt) model.action.rotation.z = (weapon === 'sniper' ? -cycle * .6 : 0) + reload.actionRoll;
      if (weapon === 'shotgun') model.support.position.z += cycle * .11;
    }
    const goalAds = actor.ads && !actor.swimming && !reloading && !actor.sprint && weapon !== 'machete' ? 1 : 0;
    this.ads = advanceAds(weapon, this.ads, !!goalAds, dt);
    this.kick = this.recoil.update(0, 24, dt);
    const yawKick = this.recoilYaw.update(0, 27, dt);
    const yaw = actor.yaw || 0, pitch = actor.pitch || 0;
    if (this.lastYaw === undefined) { this.grounded = actor.grounded; this.swimming = actor.swimming; this.verticalSpeed = actor.velocity.y; }
    const yawDelta = this.lastYaw === undefined ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    const pitchDelta = this.lastYaw === undefined ? 0 : pitch - this.lastPitch;
    this.lastYaw = yaw; this.lastPitch = pitch;
    const swayX = this.swayX.update(THREE.MathUtils.clamp(-yawDelta / Math.max(dt, .001) * .012, -.055, .055), 20, dt);
    const swayY = this.swayY.update(THREE.MathUtils.clamp(pitchDelta / Math.max(dt, .001) * .01, -.04, .04), 20, dt);
    if (!actor.swimming && !this.swimming) {
      if (actor.grounded && !this.grounded) this.land.impulse(-Math.min(3, Math.max(.6, -this.verticalSpeed * .25)));
      if (!actor.grounded && this.grounded && actor.velocity.y > 0) this.land.impulse(.6);
    } else if (actor.swimming) this.land.reset();
    this.grounded = actor.grounded; this.swimming = actor.swimming; this.verticalSpeed = actor.velocity.y;
    this.swimPose = damp(this.swimPose, actor.swimming ? 1 : 0, 8, dt);
    const landing = this.land.update(0, 17, dt);
    const motion = settings.reducedMotion ? 0 : 1;
    this.breathingTime += dt;
    this.draw = Math.max(0, this.draw - dt / .24);
    this.shotLife = Math.max(0, this.shotLife - dt);
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    this.gait += speed * dt * 2.5;
    const sprint = this.sprintPose = damp(this.sprintPose, actor.sprint && !actor.swimming ? 1 : 0, 12, dt);
    this.bobAmount = damp(this.bobAmount, actor.grounded && !actor.swimming ? Math.min(speed / 7, 1) * (.012 + sprint * .015) : 0, 16, dt);
    const bob = motion * this.bobAmount;
    this.wallPose = damp(this.wallPose, closeWall, 18, dt);
    const wall = this.wallPose, lower = smoothPose(Math.min(1, this.draw + this.holster));
    const ads = this.ads * this.ads * (3 - 2 * this.ads);
    const breath = Math.sin(this.breathingTime * 1.8) * .0032 * motion * (1 - ads) * (1 - sprint);
    const grip = Math.sin(this.breathingTime * 1.17) * Math.sin(this.breathingTime * .43) * motion * (1 - ads) * (1 - magazineMotion);
    if (model.gripFingers) { model.gripFingers.position.y = grip * .0015; model.gripFingers.rotation.x = grip * .012; }
    if (model.triggerFinger) {
      const press = this.shotLife > 0 ? Math.min(1, this.shotLife / .045) : 0;
      model.triggerFinger.position.set(0, -press * .012, press * .018);
    }
    const pose = model.painted ? WEAPON_HIP_POSES[weapon] : null;
    const modelScale = pose?.scale ?? .72;
    this.holder.scale.setScalar(modelScale);
    const swimBob = Math.sin(this.breathingTime * 2.1) * .009 * motion * this.swimPose;
    const hipY = THREE.MathUtils.lerp(pose?.y ?? -.245, -model.sightY * modelScale, ads) + this.swimPose * (weapon === 'pistol' ? .035 : -.18) + swimBob;
    this.holder.position.set(THREE.MathUtils.lerp(pose?.x ?? model.hipX + .045, 0, ads) + Math.sin(this.gait) * bob * .4 + swayX * motion * (1 - ads * .85),
      hipY + breath + Math.abs(Math.sin(this.gait)) * bob - this.kick * .55 - lower * 1.05 + (swayY + landing) * motion - sprint * .08 - wall * .12 + reload.lift - reload.bump * .012,
      THREE.MathUtils.lerp(pose?.z ?? -.73, model.adsZ, ads) + this.kick * .8 + wall * .08 + sprint * .07 - reload.bump * .009);
    this.holder.rotation.set((pose?.pitch ?? 0) * (1 - ads) + this.kick * 1.1 + lower * .65 + swayY * motion + reload.pitch + sprint * .16,
      THREE.MathUtils.lerp(pose?.yaw ?? (pose ? 0 : .24), 0, ads) + wall * .28 + yawKick + swayX * motion,
      THREE.MathUtils.lerp(pose?.roll ?? (pose ? 0 : -.055), 0, ads) + Math.sin(this.gait) * bob * 1.7 + reload.roll + breath * .8 + swimBob * 1.2);
    this.updateMelee(weapon, dt, settings.reducedMotion);
    this.restPosition.copy(this.holder.position); this.restRotation.copy(this.holder.rotation);
    if (this.inspectTime >= 0) {
      this.inspectTime += dt;
      const progress = Math.min(1, this.inspectTime / 1.6);
      const look = Math.sin(Math.PI * progress) ** 2 * (settings.reducedMotion ? .35 : 1);
      this.holder.position.x -= look * .09; this.holder.position.y += look * .065;
      this.holder.position.z += look * .04;
      this.holder.rotation.x += look * .18;
      this.holder.rotation.y -= look * (weapon === 'machete' ? .2 : weapon === 'slingshot' ? .3 : .65);
      this.holder.rotation.z += look * (weapon === 'machete' ? -.3 : .35);
      if (progress === 1) this.inspectTime = -1;
    }
  }

  private updateMelee(weapon: WeaponId, dt: number, reducedMotion: boolean) {
    this.smear.visible = false;
    if (weapon !== 'machete') { sampleMelee(MELEE_SECONDS, this.meleeSide, this.meleePose); return; }
    let step = dt;
    if (reducedMotion) { this.meleeStop = 0; this.meleeHit = false; }
    if (this.meleeStop > 0) { const held = Math.min(step, this.meleeStop); step -= held; this.meleeStop -= held; }
    if (this.meleeHit && this.meleeTime < MELEE_CONTACT && this.meleeTime + step >= MELEE_CONTACT) {
      const remaining = step - (MELEE_CONTACT - this.meleeTime);
      this.meleeTime = MELEE_CONTACT; this.meleeStop = Math.max(0, MELEE_HIT_STOP - remaining);
      step = Math.max(0, remaining - MELEE_HIT_STOP); this.meleeHit = false;
    }
    this.meleeTime = Math.min(MELEE_SECONDS, this.meleeTime + step);
    const pose = sampleMelee(this.meleeTime, this.meleeSide, this.meleePose), amount = reducedMotion ? .55 : 1;
    this.holder.position.x += pose.x * amount; this.holder.position.y += pose.y * amount; this.holder.position.z += pose.z * amount;
    this.holder.rotation.x += pose.pitch * amount; this.holder.rotation.y += pose.yaw * amount; this.holder.rotation.z += pose.roll * amount;
    this.holder.updateWorldMatrix(true, true);
    this.models.machete.muzzle.getWorldPosition(this.trailTip);
    this.trailBase.set(0, .07, .01).applyMatrix4(this.models.machete.group.matrixWorld);
    if (!reducedMotion && pose.smear > .01 && this.meleeStop <= 0) {
      // A paused redraw must retain the previous swept segment, not collapse
      // its two endpoints onto the same pose.
      if (dt > 0) {
        const position = this.smear.geometry.getAttribute('position');
        const points = [this.lastTrailBase, this.lastTrailTip, this.trailTip, this.lastTrailBase, this.trailTip, this.trailBase];
        points.forEach((p, i) => position.setXYZ(i, p.x, p.y, p.z)); position.needsUpdate = true;
      }
      this.smear.material.opacity = pose.smear * .27; this.smear.visible = true;
    }
    if (dt > 0) { this.lastTrailBase.copy(this.trailBase); this.lastTrailTip.copy(this.trailTip); }
  }

  cameraFeedback(camera: THREE.Camera, reducedMotion: boolean) {
    if (reducedMotion || !this.holder.visible || this.active !== 'machete') return;
    camera.rotateX(-this.meleePose.kick * .012);
    camera.rotateZ(this.meleePose.kick * this.meleeSide * .009);
  }

  resize(width: number, height: number) { this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); }
  get adsAmount() { return this.ads * this.ads * (3 - 2 * this.ads); }
  get weapon() { return this.active; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const prop of this.reloadProps) prop.geometry.dispose();
    this.reloadProps.length = 0;
    this.painted?.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite) || object.userData.effects) return;
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

    furGrain.dispose(); woodGrain.dispose(); polymerGrain.dispose(); metalGrain.dispose(); scopeLensMap.dispose();
  }
}
