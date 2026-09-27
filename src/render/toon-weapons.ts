import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RARITY } from '../shared/rarity';
import type { WeaponId } from '../shared/types';

// First-person arsenal built from code: side silhouettes are extruded with
// soft bevels, every part carries an ink hull that matches the world's outline
// pass, and the capybara paws are posed around each weapon's real grip.
// Space: the gun points down -Z, +Y is up, the trigger sits at u = 0 where
// u is the distance forward along the barrel (z = -u).

export interface ToonWeaponModel {
  group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D;
  magazine?: THREE.Object3D; action?: THREE.Object3D; support: THREE.Object3D;
  triggerFinger?: THREE.Object3D; gripFingers?: THREE.Object3D;
  sightY: number; legendary: THREE.Object3D; toon: true;
  // Parts behind the eye in a cheek weld; hidden while aiming down the sights.
  stock?: THREE.Object3D;
}
export const TOON_WEAPON_IDS: readonly WeaponId[] = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'machete', 'slingshot'];

const INK = '#2a1a12';
type V2 = readonly [number, number];
const P = (u: number, v: number, x = 0) => new THREE.Vector3(x, v, -u);

function grainTexture(seed: number, stripes: number, contrast: number) {
  const size = 64, data = new Uint8Array(size * size * 4);
  let state = seed;
  const rand = () => { state = (Math.imul(state ^ state >>> 15, 1 | state) + 0x6d2b79f5) | 0; return (state >>> 0) / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const stripe = stripes ? Math.sin(x * stripes + Math.sin(y * .19) * 2.4) * 10 : 0;
    const light = Math.max(0, Math.min(255, Math.round(236 + stripe + (rand() - .5) * contrast)));
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = light; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// One material set per arsenal. Rarity only recolours the accent paint.
export class ToonArsenal {
  private readonly textures = [grainTexture(90121, 0, 16), grainTexture(33417, .7, 16), grainTexture(55123, 0, 30)];
  private readonly outline: THREE.MeshBasicMaterial;
  readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private readonly accents = RARITY.map(r => new THREE.MeshStandardMaterial({ color: r.color, roughness: .45, metalness: .05, emissive: r.color, emissiveIntensity: .12 }));
  private readonly geometries = new Set<THREE.BufferGeometry>();

  // `paws: false` builds bare guns for ground pickups and third-person baking.
  private readonly seg: { bevel: number; curve: number; sides: number; sphere: [number, number] };
  constructor(readonly paws = true, detail: 'fp' | 'near' | 'far' = 'fp') {
    this.seg = detail === 'fp' ? { bevel: 3, curve: 5, sides: 18, sphere: [20, 14] } : detail === 'near' ? { bevel: 1, curve: 2, sides: 8, sphere: [8, 6] } : { bevel: 0, curve: 1, sides: 6, sphere: [6, 4] };
    const [polymer, wood, fur] = this.textures;
    const m = (color: string, roughness: number, metalness = 0, map?: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, map: map ?? null });
    this.materials = {
      body: m('#566b7a', .5, .2, polymer), dark: m('#2b3339', .62, .15, polymer), steel: m('#7b8a91', .34, .55, polymer),
      sand: m('#a9977a', .7, 0, polymer), olive: m('#5f6a45', .72, 0, polymer), teal: m('#2f7f86', .55, .05, polymer),
      wood: m('#9a6a42', .62, 0, wood), walnut: m('#6d4529', .6, 0, wood), brass: m('#e7b95b', .32, .6),
      red: m('#d9553b', .5, 0, polymer), rubber: m('#3a302b', .9, 0, polymer), leather: m('#8b5a36', .8, 0, polymer),
      blade: m('#c9d2d4', .22, .75), edge: m('#f4f1e6', .18, .6), wrap: m('#c9b48a', .88, 0, polymer),
      glass: new THREE.MeshStandardMaterial({ color: '#7fc6d6', roughness: .08, metalness: .2, emissive: '#1d5a66', emissiveIntensity: .35 }),
      fur: m('#7a5134', .95, 0, fur), furLight: m('#9c6f4a', .95, 0, fur), pad: m('#5a3522', .8, 0), nail: m('#3a2619', .45, 0),
      sleeve: m('#2a7c77', .85, 0, polymer), cuff: m('#d9ceb2', .85, 0, polymer),
    };
    this.outline = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    this.outline.onBeforeCompile = shader => {
      shader.uniforms.inkWidth = { value: 1 };
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += normalize(normal) * 0.0042;');
    };
  }

  // Ink hull: smooth normals so hard bevel edges do not crack the outline.
  private ink(mesh: THREE.Mesh, scale = 1) {
    const source = mesh.geometry.clone();
    for (const name of Object.keys(source.attributes)) if (name !== 'position') source.deleteAttribute(name);
    const merged = mergeVertices(source, 1e-4); merged.computeVertexNormals(); source.dispose();
    this.geometries.add(merged);
    const hull = new THREE.Mesh(merged, this.outline);
    hull.scale.setScalar(scale); hull.renderOrder = -1; hull.name = 'ink';
    mesh.add(hull);
  }
  private add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, ink = true) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = false;
    parent.add(mesh); if (ink) this.ink(mesh);
    return mesh;
  }

  // A side silhouette (u forward, v up) extruded across the gun with a soft bevel.
  profile(parent: THREE.Object3D, points: V2[], width: number, material: THREE.Material, x = 0, radius = .012, bevel = .006) {
    const shape = new THREE.Shape();
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const prev = points[(i + n - 1) % n], cur = points[i], next = points[(i + 1) % n];
      const inDir = new THREE.Vector2(cur[0] - prev[0], cur[1] - prev[1]), outDir = new THREE.Vector2(next[0] - cur[0], next[1] - cur[1]);
      const r = Math.min(radius, inDir.length() * .45, outDir.length() * .45);
      inDir.normalize(); outDir.normalize();
      const a = [cur[0] - inDir.x * r, cur[1] - inDir.y * r], b = [cur[0] + outDir.x * r, cur[1] + outDir.y * r];
      if (i === 0) shape.moveTo(a[0], a[1]); else shape.lineTo(a[0], a[1]);
      shape.quadraticCurveTo(cur[0], cur[1], b[0], b[1]);
    }
    shape.closePath();
    const depth = Math.max(.001, width - (this.seg.bevel > 0 ? bevel * 2 : 0));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: this.seg.bevel > 0, bevelThickness: bevel, bevelSize: bevel * .85, bevelSegments: Math.max(1, this.seg.bevel), curveSegments: this.seg.curve });
    geometry.translate(0, 0, -depth / 2); geometry.rotateY(Math.PI / 2); geometry.translate(x, 0, 0);
    geometry.computeVertexNormals();
    return this.add(parent, geometry, material);
  }
  // A round part along the barrel axis from u0 to u1.
  tube(parent: THREE.Object3D, u0: number, u1: number, v: number, r0: number, material: THREE.Material, r1 = r0, x = 0, sides = 18) {
    const geometry = new THREE.CylinderGeometry(r1, r0, Math.abs(u1 - u0), Math.min(sides, this.seg.sides), 1);
    geometry.rotateX(-Math.PI / 2); geometry.translate(x, v, -(u0 + u1) / 2);
    return this.add(parent, geometry, material);
  }
  box(parent: THREE.Object3D, u0: number, u1: number, v0: number, v1: number, width: number, material: THREE.Material, x = 0, ink = true) {
    const geometry = new THREE.BoxGeometry(width, v1 - v0, u1 - u0);
    geometry.translate(x, (v0 + v1) / 2, -(u0 + u1) / 2);
    return this.add(parent, geometry, material, ink);
  }
  ball(parent: THREE.Object3D, at: THREE.Vector3, scale: THREE.Vector3 | number, material: THREE.Material, ink = true) {
    const geometry = new THREE.SphereGeometry(1, ...this.seg.sphere);
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    geometry.scale(s.x, s.y, s.z); geometry.translate(at.x, at.y, at.z);
    return this.add(parent, geometry, material, ink);
  }
  // Tapered capsule between two points: toes, forearms, straps.
  limb(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, material: THREE.Material, ink = true) {
    const dir = to.clone().sub(from), length = dir.length();
    const geometry = new THREE.CylinderGeometry(r1, r0, length, Math.min(16, this.seg.sides), 1, true);
    const cap0 = new THREE.SphereGeometry(r0, ...this.seg.sphere), cap1 = new THREE.SphereGeometry(r1, ...this.seg.sphere);
    cap0.translate(0, -length / 2, 0); cap1.translate(0, length / 2, 0);
    const merged = mergeParts([geometry, cap0, cap1]);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    merged.applyQuaternion(q); merged.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    return this.add(parent, merged, material, ink);
  }
  ring(parent: THREE.Object3D, at: THREE.Vector3, radius: number, tube: number, material: THREE.Material, axis: 'u' | 'x' = 'u') {
    const geometry = new THREE.TorusGeometry(radius, tube, Math.min(10, this.seg.sides), Math.min(28, this.seg.sides * 2));
    if (axis === 'x') geometry.rotateY(Math.PI / 2);
    geometry.translate(at.x, at.y, at.z);
    return this.add(parent, geometry, material);
  }

  setRarity(model: ToonWeaponModel, rarity: number) {
    const tier = Number.isInteger(rarity) && rarity >= 0 && rarity < RARITY.length ? rarity : 0;
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh && object.userData.accent) object.material = this.accents[tier];
    });
    model.legendary.visible = tier === 3;
  }
  accent(mesh: THREE.Mesh) { mesh.material = this.accents[0]; mesh.userData.accent = true; return mesh; }

  create(id: WeaponId, rarity = 0): ToonWeaponModel {
    const model = BUILDERS[id](this);
    model.group.name = id;
    this.setRarity(model, rarity);
    return model;
  }

  dispose() {
    this.geometries.forEach(g => g.dispose()); this.geometries.clear();
    Object.values(this.materials).forEach(m => m.dispose()); this.accents.forEach(m => m.dispose());
    this.outline.dispose(); this.textures.forEach(t => t.dispose());
  }
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const g = part.index ? part : part;
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) { positions.push(pos.getX(i), pos.getY(i), pos.getZ(i)); normals.push(nor.getX(i), nor.getY(i), nor.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + offset);
    else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    offset += pos.count; part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

// ---- Capybara paws ---------------------------------------------------------
// A paw wraps a grip bar: `top`/`bottom` span the bar, `radius` is its half
// thickness. Toes start on the palm side and curl around the front to finish
// on the gun's left face, the face the camera actually sees.
interface GripSpec { top: THREE.Vector3; bottom: THREE.Vector3; radius: number; forward: THREE.Vector3 }
function wrapPaw(k: ToonArsenal, parent: THREE.Object3D, grip: GripSpec, side: 1 | -1, options: { trigger?: boolean; elbow: THREE.Vector3; toes?: number[]; palm?: number }) {
  if (!k.paws) { const paw = new THREE.Group(); paw.name = side > 0 ? 'paw_r' : 'paw_l'; parent.add(paw); return { paw, fingers: new THREE.Group(), triggerFinger: undefined as THREE.Object3D | undefined }; }
  const mat = k.materials;
  const axis = grip.bottom.clone().sub(grip.top).normalize();
  const fwd = grip.forward.clone().sub(axis.clone().multiplyScalar(grip.forward.dot(axis))).normalize();
  const lateral = new THREE.Vector3().crossVectors(axis, fwd).normalize(); // points to +x for a downward bar
  const at = (t: number) => grip.top.clone().lerp(grip.bottom, t);
  // Around-the-bar point: angle 0 = palm side (behind the grip, toward the shooter), 90 = the
  // hidden (right) face for the right paw, 180 = front, 270 = visible left face.
  const around = (t: number, degrees: number, extra: number) => {
    const a = THREE.MathUtils.degToRad(degrees), r = grip.radius + extra;
    return at(t).add(fwd.clone().multiplyScalar(-Math.cos(a) * r)).add(lateral.clone().multiplyScalar(side * Math.sin(a) * r));
  };
  const paw = new THREE.Group(); paw.name = side > 0 ? 'paw_r' : 'paw_l';
  parent.add(paw);
  const palm = around(.45, 55, .018), size = options.palm ?? 1;
  k.ball(paw, palm, new THREE.Vector3(.052, .062, .05).multiplyScalar(size), mat.fur);
  // Back of the paw sits on the hidden face; the heel of the palm behind the bar.
  k.ball(paw, around(.52, 12, .02), new THREE.Vector3(.04, .05, .038).multiplyScalar(size), mat.fur);
  const fingers = new THREE.Group(); fingers.name = 'grip_fingers'; paw.add(fingers);
  const toes = options.toes ?? (options.trigger ? [.3, .56, .8] : [.18, .42, .66, .9]);
  for (const t of toes) {
    const knuckle = around(t, 95, .014), mid = around(t, 175, .016), tip = around(t + .02, 245, .012);
    k.limb(fingers, knuckle, mid, .019, .017, mat.fur);
    k.limb(fingers, mid, tip, .017, .014, mat.furLight);
    const nailAt = around(t + .025, 262, .01);
    k.ball(fingers, nailAt, new THREE.Vector3(.011, .009, .012), mat.nail, false);
  }
  // Thumb toe rides the visible face, pointing forward along the gun.
  const thumbBase = around(-.05, 205, .02), thumbTip = thumbBase.clone().add(fwd.clone().multiplyScalar(.06)).add(axis.clone().multiplyScalar(.018));
  k.limb(paw, thumbBase, thumbTip, .018, .015, mat.furLight);
  k.ball(paw, thumbTip.clone().add(fwd.clone().multiplyScalar(.012)), new THREE.Vector3(.01, .009, .012), mat.nail, false);
  let triggerFinger: THREE.Object3D | undefined;
  if (options.trigger) {
    triggerFinger = new THREE.Group(); triggerFinger.name = 'trigger_finger'; paw.add(triggerFinger);
    const base = around(.02, 120, .016), bend = around(-.1, 175, .03).add(fwd.clone().multiplyScalar(.03)), tip = bend.clone().add(fwd.clone().multiplyScalar(.035)).add(lateral.clone().multiplyScalar(-side * .012));
    k.limb(triggerFinger, base, bend, .017, .016, mat.fur);
    k.limb(triggerFinger, bend, tip, .016, .013, mat.furLight);
  }
  // Wrist and forearm run back toward the shoulder, ending in a rolled sleeve.
  const wrist = palm.clone().add(fwd.clone().multiplyScalar(-.035)).add(axis.clone().multiplyScalar(.035));
  const elbow = options.elbow;
  const cuffAt = wrist.clone().lerp(elbow, .62);
  k.limb(paw, wrist, cuffAt, .042, .055, mat.fur);
  k.limb(paw, cuffAt, elbow, .062, .07, mat.sleeve);
  const dir = elbow.clone().sub(wrist).normalize();
  const cuff = k.limb(paw, cuffAt.clone().sub(dir.clone().multiplyScalar(.012)), cuffAt.clone().add(dir.clone().multiplyScalar(.022)), .066, .069, mat.cuff);
  cuff.name = 'cuff';
  // A tuft of fur spilling over the wrist keeps the silhouette animal, not a glove.
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, spread = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    const root = cuffAt.clone().sub(dir.clone().multiplyScalar(.03)).add(spread.clone().multiplyScalar(.045));
    k.limb(paw, root, root.clone().sub(dir.clone().multiplyScalar(.035)).add(spread.clone().multiplyScalar(.012)), .014, .006, mat.furLight, false);
  }
  return { paw, fingers, triggerFinger };
}

// Support paw cradling a round/flat handguard from below; toes climb the visible (left) face.
function cradlePaw(k: ToonArsenal, parent: THREE.Object3D, center: THREE.Vector3, radius: number, elbow: THREE.Vector3, span = .09) {
  const mat = k.materials;
  const paw = new THREE.Group(); paw.name = 'grip_l'; parent.add(paw);
  if (!k.paws) return paw;
  const ringPoint = (u: number, degrees: number, extra: number) => {
    // degrees: 0 = bottom, 90 = left face (-x), 150 = upper left.
    const a = THREE.MathUtils.degToRad(degrees), r = radius + extra;
    return new THREE.Vector3(center.x - Math.sin(a) * r, center.y - Math.cos(a) * r, center.z - u);
  };
  k.ball(paw, ringPoint(0, -25, .03), new THREE.Vector3(.058, .045, .07), mat.fur);
  const toes = [-span * .45, -span * .15, span * .15, span * .45];
  toes.forEach((u, i) => {
    const knuckle = ringPoint(u, 20, .02), mid = ringPoint(u, 80, .018), tip = ringPoint(u, 128 - i * 4, .014);
    k.limb(paw, knuckle, mid, .019, .017, mat.fur);
    k.limb(paw, mid, tip, .017, .014, mat.furLight);
    k.ball(paw, ringPoint(u, 140 - i * 4, .008), new THREE.Vector3(.011, .01, .012), mat.nail, false);
  });
  const wrist = ringPoint(-.05, -35, .045);
  const cuffAt = wrist.clone().lerp(elbow, .6);
  k.limb(paw, wrist, cuffAt, .043, .056, mat.fur);
  k.limb(paw, cuffAt, elbow, .062, .07, mat.sleeve);
  const dir = elbow.clone().sub(wrist).normalize();
  k.limb(paw, cuffAt.clone().sub(dir.clone().multiplyScalar(.012)), cuffAt.clone().add(dir.clone().multiplyScalar(.022)), .066, .069, mat.cuff);
  return paw;
}

// ---- Weapons -----------------------------------------------------------------
// Two-handed sidearm hold: the support paw cups the firing paw from the visible side.
function cupPaw(k: ToonArsenal, g: THREE.Object3D) {
  const m = k.materials;
  const support = new THREE.Group(); support.name = 'grip_l'; g.add(support);
  if (!k.paws) return support;
  k.ball(support, P(-.075, -.075, -.05), new THREE.Vector3(.03, .046, .04), m.fur);
  [.0, .022, .044].forEach((d, i) => {
    const a = P(-.04 - d * .4, -.03 - d * 1.2, -.07), b = P(.005 - d * .4, -.05 - d * 1.2, -.052);
    k.limb(support, a, b, .018, .015, i === 0 ? m.furLight : m.fur);
    k.ball(support, b.clone().add(new THREE.Vector3(.008, 0, -.004)), new THREE.Vector3(.01, .009, .011), m.nail, false);
  });
  const wrist = P(-.12, -.11, -.07), elbow = new THREE.Vector3(-.2, -.42, .42), cuff = wrist.clone().lerp(elbow, .6);
  k.limb(support, wrist, cuff, .043, .056, m.fur); k.limb(support, cuff, elbow, .062, .07, m.sleeve);
  k.limb(support, cuff.clone().lerp(wrist, .04), cuff.clone().lerp(elbow, .07), .066, .069, m.cuff);
  return support;
}


function frame(sightY: number) {
  const group = new THREE.Group(), muzzle = new THREE.Object3D(), eject = new THREE.Object3D(), legendary = new THREE.Group(), stock = new THREE.Group();
  muzzle.name = 'muzzle'; eject.name = 'eject'; legendary.name = 'legendary'; stock.name = 'stock';
  group.add(muzzle, eject, legendary, stock);
  return { group, muzzle, eject, legendary, stock, sightY };
}
function sparkle(k: ToonArsenal, legendary: THREE.Object3D, points: THREE.Vector3[]) {
  for (const p of points) k.ball(legendary, p, .008, k.materials.brass, false);
}
// Standard long-gun right paw on a raked pistol grip below the receiver.
function rifleGrip(k: ToonArsenal, parent: THREE.Object3D, top: V2, bottom: V2, width: number, material: THREE.Material) {
  k.profile(parent, [[top[0] - .035, top[1]], [top[0] + .03, top[1]], [bottom[0] + .028, bottom[1]], [bottom[0] - .04, bottom[1] - .004]], width, material, 0, .016);
  return wrapPaw(k, parent, { top: P(top[0], top[1] - .02), bottom: P(bottom[0], bottom[1] + .02), radius: width / 2 + .004, forward: new THREE.Vector3(0, 0, -1) }, 1,
    { trigger: true, elbow: new THREE.Vector3(.2, -.42, .5) });
}
function magazine(k: ToonArsenal, parent: THREE.Object3D, points: V2[], width: number, material: THREE.Material, travel: number) {
  const mag = new THREE.Group(); mag.name = 'mag'; parent.add(mag);
  k.profile(mag, points, width, material, 0, .012);
  const low = points.reduce((a, b) => (b[1] < a[1] ? b : a));
  k.accent(k.box(mag, low[0] - .045, low[0] + .03, low[1] - .004, low[1] + .016, width + .008, k.materials.dark));
  mag.userData.restY = 0; mag.userData.travel = travel;
  return mag;
}
function ironSights(k: ToonArsenal, parent: THREE.Object3D, rearU: number, frontU: number, sightY: number, base: number) {
  const m = k.materials;
  k.profile(parent, [[rearU - .03, base], [rearU + .02, base], [rearU + .012, sightY + .012], [rearU - .022, sightY + .012]], .046, m.dark, 0, .006);
  k.ring(parent, P(rearU - .004, sightY), .011, .0045, m.dark, 'u');
  k.profile(parent, [[frontU - .02, base], [frontU + .02, base], [frontU + .006, sightY - .002], [frontU - .006, sightY - .002]], .012, m.dark, 0, .004, .002);
  k.ball(parent, P(frontU, sightY), .0055, m.brass, false);
}

const BUILDERS: Record<WeaponId, (k: ToonArsenal) => ToonWeaponModel> = {
  m4(k) {
    const m = k.materials, f = frame(.142);
    const g = f.group;
    // Upper receiver, rail and charging handle.
    k.profile(g, [[-.15, .005], [.25, .005], [.25, .086], [-.12, .092], [-.15, .07]], .07, m.body, 0, .012);
    k.box(g, -.12, .24, .092, .104, .05, m.dark);
    for (let u = -.1; u < .23; u += .035) k.box(g, u, u + .014, .104, .112, .052, m.dark, 0, false);
    k.box(g, -.17, -.12, .07, .086, .03, m.dark);
    // Lower receiver with a magazine well.
    k.profile(g, [[-.12, .008], [.17, .008], [.15, -.055], [.02, -.06], [-.09, -.035]], .064, m.sand, 0, .012);
    k.ring(g, P(.035, -.07), .03, .005, m.dark, 'x');
    // Handguard with vents and a rarity stripe.
    k.profile(g, [[.24, -.03], [.56, -.022], [.56, .07], [.24, .078]], .082, m.sand, 0, .02);
    for (let u = .29; u < .52; u += .055) k.box(g, u, u + .03, .018, .042, .084, m.dark, 0, false);
    k.accent(k.box(g, .26, .54, .056, .064, .086, m.dark, 0, false));
    // Barrel, front sight tower and flash hider.
    k.tube(g, .56, .78, .03, .014, m.dark);
    k.profile(g, [[.5, .03], [.56, .03], [.545, .085], [.515, .085]], .04, m.dark, 0, .006);
    k.tube(g, .76, .86, .03, .022, m.steel);
    ironSights(k, g, -.08, .53, f.sightY, .104);
    // Buffer tube and sliding stock.
    k.tube(f.stock, -.36, -.14, .052, .022, m.dark);
    k.profile(f.stock, [[-.5, .075], [-.3, .078], [-.26, .04], [-.3, -.04], [-.5, -.08]], .05, m.sand, 0, .02);
    k.box(f.stock, -.515, -.49, -.08, .078, .056, m.rubber);
    const { fingers, triggerFinger } = rifleGrip(k, g, [-.055, .008], [-.1, -.17], .046, m.sand);
    const mag = magazine(k, g, [[.03, -.045], [.105, -.045], [.14, -.23], [.07, -.24]], .05, m.dark, .29);
    const support = cradlePaw(k, g, P(.4, .02), .052, new THREE.Vector3(-.36, -.4, .3));
    const action = new THREE.Group(); action.name = 'bolt'; g.add(action);
    k.box(action, -.05, .06, .045, .07, .006, m.steel, .036);
    f.muzzle.position.copy(P(.87, .03)); f.eject.position.set(.04, .05, -.02);
    sparkle(k, f.legendary, [P(.3, .075, -.04), P(.45, .075, .04), P(-.4, .09, 0)]);
    return { ...f, magazine: mag, action, support, triggerFinger, gripFingers: fingers, toon: true };
  },

  smg(k) {
    const m = k.materials, f = frame(.13);
    const g = f.group;
    // Compact boxy receiver with a shrouded barrel: chunky and toy-like.
    k.profile(g, [[-.16, -.01], [.26, -.01], [.28, .03], [.26, .1], [-.14, .105], [-.17, .07]], .074, m.teal, 0, .022);
    k.accent(k.box(g, -.12, .22, .06, .07, .078, m.dark, 0, false));
    k.box(g, -.1, .2, .105, .116, .04, m.dark);
    for (let u = .09; u < .25; u += .045) k.tube(g, u, u + .02, .045, .04, m.dark, .04, 0, 16);
    k.tube(g, .28, .38, .045, .02, m.dark);
    k.tube(g, .36, .41, .045, .026, m.steel);
    ironSights(k, g, -.1, .23, f.sightY, .116);
    // Fold stock wire.
    k.limb(f.stock, P(-.17, .06, .03), P(-.38, .04, .03), .009, .009, m.dark);
    k.limb(f.stock, P(-.17, .06, -.03), P(-.38, .04, -.03), .009, .009, m.dark);
    k.limb(f.stock, P(-.38, .07, 0).setX(-.036), P(-.38, -.05, 0).setX(-.036), .011, .011, m.rubber);
    k.limb(f.stock, P(-.38, .07, 0).setX(.036), P(-.38, -.05, 0).setX(.036), .011, .011, m.rubber);
    k.box(f.stock, -.395, -.37, -.06, .08, .08, m.rubber);
    k.ring(g, P(.04, -.045), .028, .005, m.dark, 'x');
    const { fingers, triggerFinger } = rifleGrip(k, g, [-.06, -.01], [-.1, -.16], .044, m.dark);
    const mag = magazine(k, g, [[.1, -.01], [.155, -.01], [.165, -.24], [.105, -.24]], .042, m.dark, .27);
    // Vertical foregrip gives the support paw a real handle on the short gun.
    k.profile(g, [[.2, -.01], [.245, -.01], [.24, -.13], [.2, -.13]], .036, m.rubber, 0, .014);
    const support = new THREE.Group(); support.name = 'grip_l'; g.add(support);
    const fore = wrapPaw(k, support, { top: P(.222, -.02), bottom: P(.222, -.13), radius: .022, forward: new THREE.Vector3(0, 0, -1) }, -1,
      { elbow: new THREE.Vector3(-.22, -.45, .15), toes: [.2, .45, .7, .92] });
    fore.paw.name = 'paw_support';
    const action = new THREE.Group(); action.name = 'bolt'; g.add(action);
    k.box(action, -.02, .06, .07, .09, .008, m.steel, .04);
    f.muzzle.position.copy(P(.42, .045)); f.eject.position.set(.045, .07, -.05);
    sparkle(k, f.legendary, [P(.1, .1, -.04), P(-.05, .1, .04)]);
    return { ...f, magazine: mag, action, support, triggerFinger, gripFingers: fingers, toon: true };
  },

  pistol(k) {
    const m = k.materials, f = frame(.098);
    const g = f.group;
    // Frame (polymer, sand) and slide (slate) with chunky serrations.
    k.profile(g, [[-.1, .0], [.2, .0], [.2, .03], [-.1, .035]], .052, m.sand, 0, .012);
    k.ring(g, P(.05, -.018), .027, .0055, m.sand, 'x');
    const action = new THREE.Group(); action.name = 'slide'; g.add(action);
    k.profile(action, [[-.12, .028], [.215, .028], [.215, .078], [.18, .088], [-.1, .088], [-.12, .075]], .058, m.body, 0, .014);
    for (let u = -.1; u < -.03; u += .018) k.box(action, u, u + .008, .04, .082, .06, m.dark, 0, false);
    k.accent(k.box(action, .0, .17, .05, .058, .061, m.dark, 0, false));
    k.box(action, .03, .1, .05, .074, .004, m.dark, .03, false);
    k.tube(g, .2, .225, .052, .012, m.dark);
    ironSights(k, action, -.09, .19, f.sightY, .088);
    // Grip raked back, ready for the right paw.
    k.profile(g, [[-.1, .005], [-.02, .005], [-.055, -.13], [-.135, -.125]], .05, m.sand, 0, .018);
    const hand = wrapPaw(k, g, { top: P(-.06, -.01), bottom: P(-.095, -.12), radius: .029, forward: new THREE.Vector3(0, 0, -1) }, 1,
      { trigger: true, elbow: new THREE.Vector3(.13, -.4, .45), palm: .78 });
    const mag = new THREE.Group(); mag.name = 'mag'; g.add(mag);
    k.accent(k.box(mag, -.12, -.05, -.14, -.125, .052, m.dark));
    mag.userData.restY = 0; mag.userData.travel = .2;
    // The support paw cups the firing paw from the visible side.
    const support = cupPaw(k, g);
    f.muzzle.position.copy(P(.23, .052)); f.eject.position.set(.035, .07, -.02);
    sparkle(k, f.legendary, [P(.1, .09, -.03), P(-.05, .09, .03)]);
    return { ...f, magazine: mag, action, support, triggerFinger: hand.triggerFinger, gripFingers: hand.fingers, toon: true };
  },

  shotgun(k) {
    const m = k.materials, f = frame(.098);
    const g = f.group;
    k.profile(g, [[-.14, -.02], [.2, -.02], [.2, .075], [-.12, .085], [-.14, .06]], .066, m.body, 0, .014);
    k.accent(k.box(g, -.1, .16, .03, .042, .07, m.dark, 0, false));
    k.tube(g, .2, .88, .06, .022, m.dark);
    k.tube(g, .2, .78, .012, .018, m.dark);
    k.box(g, .86, .88, .082, .098, .01, m.brass);
    f.sightY = .098;
    k.box(g, -.1, .18, .085, .093, .012, m.dark, 0, false);
    // Walnut stock with a classic drop and a red recoil pad.
    k.profile(f.stock, [[-.14, .07], [-.14, -.03], [-.2, -.08], [-.5, -.13], [-.52, .04], [-.3, .06]], .06, m.wood, 0, .02);
    k.box(f.stock, -.54, -.515, -.13, .045, .064, m.red);
    k.ring(g, P(.03, -.04), .03, .0055, m.dark, 'x');
    const hand = wrapPaw(k, g, { top: P(-.14, -.01), bottom: P(-.19, -.1), radius: .028, forward: new THREE.Vector3(0, -.25, -1).normalize() }, 1,
      { trigger: true, elbow: new THREE.Vector3(.2, -.42, .5) });
    // Pump forend moves with the support paw on each rack.
    const action = new THREE.Group(); action.name = 'bolt'; g.add(action);
    k.profile(action, [[.36, -.012], [.62, -.012], [.62, .05], [.36, .05]], .07, m.wood, 0, .02);
    for (let u = .4; u < .6; u += .03) k.box(action, u, u + .012, -.014, .052, .072, m.walnut, 0, false);
    const support = cradlePaw(k, action, P(.49, .02), .04, new THREE.Vector3(-.36, -.4, .3));
    const shells = new THREE.Group(); shells.name = 'mag'; g.add(shells);
    for (let i = 0; i < 3; i++) {
      k.tube(shells, -.04 + i * .035, -.04 + i * .035 + .01, .02, .013, m.brass, .013, -.037);
      k.tube(shells, -.04 + i * .035 - .05, -.04 + i * .035, .02, .012, m.red, .012, -.037);
    }
    shells.userData.restY = 0; shells.userData.travel = .08;
    f.muzzle.position.copy(P(.89, .06)); f.eject.position.set(.04, .05, -.05);
    sparkle(k, f.legendary, [P(.5, .1, -.03), P(-.3, .08, .03)]);
    return { ...f, magazine: shells, action, support, triggerFinger: hand.triggerFinger, gripFingers: hand.fingers, toon: true };
  },

  dmr(k) {
    const m = k.materials, f = frame(.175);
    const g = f.group;
    k.profile(g, [[-.16, .0], [.28, .0], [.28, .085], [-.14, .09], [-.16, .07]], .07, m.olive, 0, .012);
    k.box(g, -.12, .26, .09, .102, .05, m.dark);
    // Wood furniture: thumbhole-ish stock and long handguard.
    k.profile(g, [[.28, -.03], [.62, -.02], [.62, .07], [.28, .076]], .08, m.wood, 0, .022);
    k.accent(k.box(g, .3, .6, .052, .06, .084, m.dark, 0, false));
    k.tube(g, .62, .92, .03, .015, m.dark);
    k.tube(g, .9, .98, .03, .02, m.steel);
    k.profile(f.stock, [[-.16, .08], [-.16, -.02], [-.24, -.07], [-.54, -.12], [-.56, .06], [-.32, .1]], .064, m.wood, 0, .022);
    k.box(f.stock, -.58, -.55, -.12, .065, .068, m.rubber);
    k.profile(g, [[-.1, .005], [.14, .005], [.12, -.05], [-.07, -.04]], .064, m.olive, 0, .012);
    k.ring(g, P(.03, -.06), .03, .005, m.dark, 'x');
    // Medium scope on rings.
    for (const u of [-.06, .16]) k.box(g, u, u + .03, .1, .145, .03, m.dark);
    k.tube(g, -.12, .24, f.sightY, .028, m.dark);
    k.tube(g, .2, .27, f.sightY, .028, m.dark, .04);
    k.tube(g, -.16, -.1, f.sightY, .036, m.dark, .028);
    k.accent(k.ring(g, P(.05, f.sightY), .03, .004, m.dark, 'u'));
    k.ball(g, P(.27, f.sightY), new THREE.Vector3(.036, .036, .004), m.glass, false);
    k.ball(g, P(-.165, f.sightY), new THREE.Vector3(.03, .03, .004), m.glass, false);
    const { fingers, triggerFinger } = rifleGrip(k, g, [-.06, .005], [-.11, -.16], .048, m.wood);
    const mag = magazine(k, g, [[.04, -.04], [.12, -.04], [.125, -.14], [.045, -.14]], .05, m.dark, .22);
    const support = cradlePaw(k, g, P(.45, .02), .052, new THREE.Vector3(-.36, -.4, .3));
    const action = new THREE.Group(); action.name = 'bolt'; g.add(action);
    k.box(action, -.04, .06, .05, .07, .006, m.steel, .037);
    f.muzzle.position.copy(P(.99, .03)); f.eject.position.set(.04, .05, -.02);
    sparkle(k, f.legendary, [P(.4, .08, -.04), P(-.4, .09, .03)]);
    return { ...f, magazine: mag, action, support, triggerFinger, gripFingers: fingers, toon: true };
  },

  sniper(k) {
    const m = k.materials, f = frame(.18);
    const g = f.group;
    // Long walnut stock that runs under a round receiver: the classic bolt gun.
    k.profile(f.stock, [[-.58, .05], [-.35, .06], [-.15, .042], [-.15, -.06], [-.2, -.1], [-.56, -.14]], .07, m.walnut, 0, .024);
    k.profile(g, [[-.17, .042], [.5, .03], [.5, -.035], [.1, -.05], [-.17, -.06]], .07, m.walnut, 0, .024);
    k.box(f.stock, -.6, -.57, -.14, .05, .074, m.rubber);
    k.tube(g, -.16, .2, .06, .033, m.body);
    k.tube(g, .2, 1.06, .055, .017, m.dark, .014);
    k.tube(g, 1.02, 1.1, .055, .024, m.steel);
    k.accent(k.box(g, .1, .45, .0, .012, .074, m.dark, 0, false));
    k.ring(g, P(.0, -.06), .032, .0055, m.dark, 'x');
    // Big scope: the sniper's signature silhouette.
    for (const u of [-.1, .12]) k.box(g, u, u + .035, .085, .15, .032, m.dark);
    k.tube(g, -.17, .22, f.sightY, .032, m.dark);
    k.tube(g, .2, .32, f.sightY, .032, m.dark, .05);
    k.tube(g, -.24, -.15, f.sightY, .044, m.dark, .032);
    k.box(g, .0, .05, f.sightY + .03, f.sightY + .06, .03, m.dark);
    k.accent(k.ring(g, P(.02, f.sightY), .034, .004, m.dark, 'u'));
    k.ball(g, P(.32, f.sightY), new THREE.Vector3(.048, .048, .005), m.glass, false);
    k.ball(g, P(-.245, f.sightY), new THREE.Vector3(.04, .04, .005), m.glass, false);
    // Grip is part of the stock wrist.
    const hand = wrapPaw(k, g, { top: P(-.12, -.02), bottom: P(-.18, -.1), radius: .03, forward: new THREE.Vector3(0, -.3, -1).normalize() }, 1,
      { trigger: true, elbow: new THREE.Vector3(.2, -.42, .5) });
    // Bolt handle swings up and back on each cycle.
    const action = new THREE.Group(); action.name = 'bolt_handle'; action.position.copy(P(-.1, .06)); g.add(action);
    k.limb(action, new THREE.Vector3(0, 0, 0), new THREE.Vector3(.07, -.035, .01), .008, .008, m.steel);
    k.ball(action, new THREE.Vector3(.075, -.04, .012), .016, m.dark);
    const mag = new THREE.Group(); mag.name = 'mag'; g.add(mag);
    k.profile(mag, [[.02, -.04], [.1, -.04], [.1, -.09], [.02, -.09]], .05, m.dark, 0, .01);
    mag.userData.restY = 0; mag.userData.travel = .18;
    const support = cradlePaw(k, g, P(.36, .0), .045, new THREE.Vector3(-.36, -.4, .3));
    f.muzzle.position.copy(P(1.11, .055)); f.eject.position.set(.04, .07, .02);
    sparkle(k, f.legendary, [P(.3, .03, -.04), P(-.4, .06, .04)]);
    return { ...f, magazine: mag, action, support, triggerFinger: hand.triggerFinger, gripFingers: hand.fingers, toon: true };
  },

  machete(k) {
    const m = k.materials, f = frame(0);
    const g = f.group;
    // Held blade-up in the right paw: a curved cane-knife with a bright edge.
    const blade = new THREE.Group(); g.add(blade);
    k.profile(blade, [[.0, .0], [.02, .12], [.06, .36], [.1, .52], [.075, .56], [.03, .5], [-.02, .3], [-.035, .1], [-.03, 0]], .012, m.blade, 0, .02, .004);
    k.profile(blade, [[.018, .1], [.055, .34], [.092, .5], [.082, .52], [.045, .35], [.01, .12]], .014, m.edge, -.001, .01, .003);
    k.box(blade, -.06, .05, -.012, .012, .03, m.brass);
    const handle = new THREE.Group(); g.add(handle);
    k.profile(handle, [[-.035, -.012], [.03, -.012], [.035, -.17], [-.045, -.18]], .036, m.wood, 0, .016);
    for (let v = -.03; v > -.16; v -= .03) k.box(handle, -.042, .038, v - .012, v, .04, m.wrap, 0, false);
    k.accent(k.box(handle, -.05, .04, -.195, -.18, .042, m.dark));
    const hand = wrapPaw(k, g, { top: P(-.005, -.02), bottom: P(-.005, -.17), radius: .024, forward: new THREE.Vector3(0, 0, -1) }, 1,
      { elbow: new THREE.Vector3(.1, -.46, .45), toes: [.12, .38, .62, .86] });
    blade.rotation.x = .0;
    f.muzzle.position.set(0, .54, -.08);
    sparkle(k, f.legendary, [new THREE.Vector3(0, .3, -.05)]);
    return { ...f, support: new THREE.Group(), gripFingers: hand.fingers, toon: true };
  },

  revolver(k) {
    const m = k.materials, f = frame(.092);
    const g = f.group;
    // Frame, fat fluted cylinder, ribbed barrel and a walnut bird's-head grip.
    k.profile(g, [[-.085, .0], [.09, .0], [.09, .066], [-.055, .074], [-.09, .05]], .05, m.body, 0, .012);
    const cylinder = new THREE.Group(); cylinder.name = 'mag'; g.add(cylinder);
    k.tube(cylinder, .0, .085, .036, .037, m.steel, .037, 0, 14);
    for (let a = 0; a < 6; a++) {
      const angle = a / 6 * Math.PI * 2;
      k.box(cylinder, .012, .073, .036 + Math.sin(angle) * .036 - .005, .036 + Math.sin(angle) * .036 + .005, .012, m.dark, Math.cos(angle) * .036, false);
    }
    cylinder.userData.restY = 0; cylinder.userData.travel = .07;
    k.tube(g, .085, .27, .048, .017, m.steel);
    k.box(g, .085, .27, .062, .074, .02, m.body);
    k.accent(k.box(g, .1, .25, .074, .079, .022, m.dark, 0, false));
    k.profile(g, [[.245, .07], [.268, .07], [.264, .094], [.25, .094]], .01, m.dark, 0, .004, .002);
    k.box(g, -.06, -.035, .07, .086, .03, m.dark);
    const action = new THREE.Group(); action.name = 'hammer'; g.add(action);
    k.profile(action, [[-.1, .045], [-.075, .05], [-.085, .1], [-.105, .098]], .018, m.dark, 0, .006);
    k.ring(g, P(.035, -.02), .026, .005, m.body, 'x');
    k.profile(g, [[-.09, .01], [-.035, .0], [-.05, -.1], [-.08, -.135], [-.125, -.12], [-.12, -.03]], .048, m.walnut, 0, .02);
    const hand = wrapPaw(k, g, { top: P(-.07, -.01), bottom: P(-.09, -.12), radius: .028, forward: new THREE.Vector3(0, 0, -1) }, 1,
      { trigger: true, elbow: new THREE.Vector3(.13, -.4, .45), palm: .78 });
    const support = cupPaw(k, g);
    f.muzzle.position.copy(P(.275, .048)); f.eject.position.copy(P(.04, .06));
    sparkle(k, f.legendary, [P(.15, .09, -.02), P(-.05, .09, .02)]);
    return { ...f, magazine: cylinder, action, support, triggerFinger: hand.triggerFinger, gripFingers: hand.fingers, toon: true };
  },

  coco(k) {
    const m = k.materials, f = frame(.13);
    const g = f.group;
    // Stubby break-action launcher: fat teal tube with brass bands and a coconut in the mouth.
    k.profile(g, [[-.15, -.025], [.1, -.025], [.1, .075], [-.12, .08], [-.15, .06]], .078, m.body, 0, .016);
    k.tube(g, .08, .56, .035, .054, m.teal, .054, 0, 20);
    for (const u of [.16, .4]) k.tube(g, u, u + .03, .035, .058, m.brass, .058, 0, 20);
    k.accent(k.tube(g, .27, .3, .035, .058, m.dark, .058, 0, 20));
    k.tube(g, .54, .6, .035, .064, m.dark, .06, 0, 20);
    const shell = new THREE.Group(); shell.name = 'mag'; g.add(shell);
    k.ball(shell, P(.585, .035), new THREE.Vector3(.047, .047, .05), m.walnut);
    k.ball(shell, P(.62, .045), new THREE.Vector3(.012, .01, .004), m.dark, false);
    shell.userData.restY = 0; shell.userData.travel = .12;
    // Raised leaf sights so the arc can be judged.
    k.profile(g, [[-.04, .075], [.02, .075], [.012, .13], [-.03, .13]], .044, m.dark, 0, .006);
    k.ring(g, P(-.01, f.sightY), .011, .0045, m.dark, 'u');
    k.profile(g, [[.44, .085], [.47, .085], [.462, .128], [.448, .128]], .012, m.dark, 0, .004, .002);
    k.ball(g, P(.455, f.sightY), .006, m.brass, false);
    k.profile(g, [[.24, -.02], [.44, -.02], [.43, -.06], [.25, -.06]], .06, m.wood, 0, .018);
    k.profile(f.stock, [[-.15, .07], [-.15, -.02], [-.21, -.07], [-.48, -.11], [-.5, .05], [-.3, .065]], .058, m.wood, 0, .02);
    k.box(f.stock, -.52, -.495, -.11, .04, .062, m.rubber);
    k.ring(g, P(.03, -.04), .03, .0055, m.dark, 'x');
    const { fingers, triggerFinger } = rifleGrip(k, g, [-.06, -.025], [-.1, -.17], .048, m.wood);
    const support = cradlePaw(k, g, P(.34, .0), .045, new THREE.Vector3(-.36, -.4, .3));
    const action = new THREE.Group(); action.name = 'latch'; g.add(action);
    k.box(action, .06, .1, .07, .085, .03, m.steel);
    f.muzzle.position.copy(P(.62, .035)); f.eject.position.copy(P(.05, .06));
    sparkle(k, f.legendary, [P(.3, .1, -.03), P(-.3, .08, .03)]);
    return { ...f, magazine: shell, action, support, triggerFinger, gripFingers: fingers, toon: true };
  },

  slingshot(k) {
    const m = k.materials, f = frame(.24);
    const g = f.group;
    // Forked branch, rubber bands and a leather pouch drawn back toward the eye.
    const fork = new THREE.Group(); g.add(fork);
    k.limb(fork, P(0, -.16), P(0, .06), .026, .024, m.wood);
    k.limb(fork, P(0, .06), P(.0, .22, -.07), .022, .018, m.wood);
    k.limb(fork, P(0, .06), P(.0, .22, .07), .022, .018, m.wood);
    k.accent(k.limb(fork, P(0, .0), P(0, .05), .03, .03, m.dark));
    k.ball(fork, P(0, .225, -.07), .02, m.walnut);
    k.ball(fork, P(0, .225, .07), .02, m.walnut);
    const pouch = new THREE.Group(); pouch.name = 'mag'; g.add(pouch);
    const pouchAt = P(-.26, .19);
    k.limb(pouch, P(0, .225, -.07), pouchAt.clone().setX(-.018), .006, .006, m.red, false);
    k.limb(pouch, P(0, .225, .07), pouchAt.clone().setX(.018), .006, .006, m.red, false);
    k.ball(pouch, pouchAt, new THREE.Vector3(.03, .02, .016), m.leather);
    k.ball(pouch, pouchAt.clone().add(new THREE.Vector3(0, .002, -.004)), .016, m.steel);
    pouch.userData.restY = 0; pouch.userData.travel = .08;
    const hand = wrapPaw(k, g, { top: P(0, -.01), bottom: P(0, -.15), radius: .026, forward: new THREE.Vector3(0, 0, -1) }, 1,
      { elbow: new THREE.Vector3(.12, -.45, .4) });
    // The drawing paw pinches the pouch from the left.
    const support = new THREE.Group(); support.name = 'grip_l'; g.add(support);
    if (k.paws) {
    k.ball(support, pouchAt.clone().add(new THREE.Vector3(-.03, -.02, .03)), new THREE.Vector3(.04, .05, .045), m.fur);
    k.limb(support, pouchAt.clone().add(new THREE.Vector3(-.035, .02, .01)), pouchAt.clone().add(new THREE.Vector3(-.012, .012, -.01)), .016, .014, m.furLight);
    const wrist = pouchAt.clone().add(new THREE.Vector3(-.05, -.05, .07)), elbow = new THREE.Vector3(-.24, -.4, .38), cuff = wrist.clone().lerp(elbow, .6);
    k.limb(support, wrist, cuff, .042, .055, m.fur); k.limb(support, cuff, elbow, .062, .07, m.sleeve);
    k.limb(support, cuff.clone().lerp(wrist, .05), cuff.clone().lerp(elbow, .07), .066, .069, m.cuff);
    }
    f.muzzle.position.copy(P(.05, .23)); f.eject.position.copy(pouchAt);
    sparkle(k, f.legendary, [P(0, .1, .03)]);
    return { ...f, magazine: pouch, support, gripFingers: hand.fingers, toon: true };
  },
};

// Ground pickups and third-person guns share one vertex-coloured geometry per
// weapon, baked from the same builders so every view of a gun matches.
const WORLD_LENGTH: Record<WeaponId, number> = { pistol: .35, smg: .86, m4: 1.18, shotgun: 1.25, dmr: 1.31, sniper: 1.52, machete: .63, slingshot: .42, revolver: .4, coco: 1.1 };
const bakers: Partial<Record<'near' | 'far', ToonArsenal>> = {};
export function bakeToonWeapon(id: WeaponId, detail: 'near' | 'far'): THREE.BufferGeometry {
  const baker = bakers[detail] ??= new ToonArsenal(false, detail);
  const model = baker.create(id);
  if (id === 'machete') model.group.rotation.x = -Math.PI / 2;
  model.group.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.name === 'ink' || !object.visible) return;
    let hidden = false; object.traverseAncestors(a => { if (a.name === 'legendary') hidden = true; });
    if (hidden) return;
    object.geometry.computeBoundingSphere();
    if (detail === 'far' && object.geometry.boundingSphere!.radius < .03) return;
    const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    for (const name of Object.keys(source.attributes)) if (name !== 'position' && name !== 'normal') source.deleteAttribute(name);
    source.applyMatrix4(object.matrixWorld);
    color.copy((object.material as THREE.MeshStandardMaterial).color);
    const colors = new Float32Array(source.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(source);
  });
  const merged = mergeParts(parts.map(part => { const indexed = new THREE.BufferGeometry(); indexed.setAttribute('position', part.getAttribute('position')); indexed.setAttribute('normal', part.getAttribute('normal')); indexed.userData.color = part.getAttribute('color'); return indexed; }));
  const colors: number[] = []; for (const part of parts) colors.push(...(part.getAttribute('color').array as Float32Array));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingBox();
  const box = merged.boundingBox!, length = Math.max(box.max.z - box.min.z, box.max.y - box.min.y);
  merged.scale(WORLD_LENGTH[id] / length, WORLD_LENGTH[id] / length, WORLD_LENGTH[id] / length);
  merged.computeBoundingSphere(); merged.name = `toon-world:${id}:${detail}`;
  return merged;
}
