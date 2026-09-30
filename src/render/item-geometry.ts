import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldWeaponGeometry } from './world-weapons';
import type { LootSpawn, WeaponId } from '../shared/types';

export const itemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .16, side: THREE.DoubleSide });
const pawnBox = new THREE.BoxGeometry(1, 1, 1);
// Half cylinder rotated by Euler(0, 0, PI / 2): curved side up, axis along X.
const pawnDome = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI);
const vertex = (base: THREE.BufferGeometry, tint: string | THREE.Color, pos: THREE.Vector3, scale: THREE.Vector3, rotation = new THREE.Euler()) => {
  const geometry = base.index ? base.toNonIndexed() : base.clone();
  geometry.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rotation), scale));
  const color = typeof tint === 'string' ? new THREE.Color(tint) : tint;
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
};
function mergeParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) throw new Error('Cannot merge avatar geometry');
  merged.computeBoundingSphere(); return merged;
}

export function itemGeometry(kind: LootSpawn['kind'], weapon: WeaponId = 'pistol', detail: 'near' | 'far' = 'near'): THREE.BufferGeometry {
  if (kind === 'weapon') return worldWeaponGeometry(weapon, detail);
  return pickupGeometry(kind, detail);
}

/** Loot other than weapons: rim-lit so a pickup separates from the ground and walls at any range. */
export const pickupMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .04, side: THREE.DoubleSide, name: 'pickup' });
pickupMaterial.onBeforeCompile = shader => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float pickupRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
    totalEmissiveRadiance += diffuseColor.rgb * pickupRim * .55 + vec3(pickupRim * .1);`);
};

const ROUND = new Map<string, THREE.BufferGeometry>();
const rounded = (radius: number, segments: number) => {
  const key = `${radius.toFixed(3)}:${segments}`;
  let geometry = ROUND.get(key);
  if (!geometry) ROUND.set(key, geometry = new RoundedBoxGeometry(1, 1, 1, segments, radius));
  return geometry;
};

/**
 * Pickups read at a glance from eye height and across a street: each kind has its own silhouette
 * and colour, matching its HUD icon (blue vest for armour, olive helmet with goggles, a brass-topped
 * ammo can, a red-cross kit, a striped bandage roll, a green guaraná can, a bowl of açaí, wrapped
 * rapadura). Built around the origin, about half a metre across, hovering above the loot ring.
 */
function pickupGeometry(kind: Exclude<LootSpawn['kind'], 'weapon'>, detail: 'near' | 'far'): THREE.BufferGeometry {
  // Far copies (past 14 m) keep the silhouette and colours with a third of the triangles and none of the fine bits.
  const near = detail === 'near', seg = (n: number) => near ? n : Math.max(3, Math.round(n / 2));
  const lathe = (profile: [number, number][], segments = 16) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg(segments));
  const parts: THREE.BufferGeometry[] = [];
  const part = (base: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler()) =>
    parts.push(vertex(base, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation));
  const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, radius = .18, rotation?: THREE.Euler) =>
    part(rounded(radius, near ? 2 : 1), color, x, y, z, sx, sy, sz, rotation);
  if (kind === 'armor') {
    // A padded vest wrapped round an unseen torso: front and back panels with a V neck and arm holes,
    // side straps, shoulder straps, pouches and a cream name tape. It has depth from every side.
    const outline = (neck: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-.24, -.25); shape.lineTo(.24, -.25); shape.lineTo(.25, .02);
      shape.quadraticCurveTo(.15, .05, .14, .2); shape.lineTo(.13, .27); shape.lineTo(.06, .27);
      shape.quadraticCurveTo(.02, .27 - neck, 0, .27 - neck); shape.quadraticCurveTo(-.02, .27 - neck, -.06, .27);
      shape.lineTo(-.13, .27); shape.lineTo(-.14, .2); shape.quadraticCurveTo(-.15, .05, -.25, .02); shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: .05, bevelEnabled: true, bevelThickness: .025, bevelSize: .022, bevelSegments: near ? 2 : 1, curveSegments: near ? 5 : 2 });
    };
    // Panels curve round the body: the front bows forward at the middle, the back bows backward.
    const panel = (neck: number, z: number, bow: number) => bend(vertex(outline(neck), '#ffffff', new THREE.Vector3(0, 0, z), new THREE.Vector3(1, 1, 1)), bow);
    parts.push(tint(panel(.13, -.125, 1.5), '#2f86d6'), tint(panel(.04, .075, -1.5), '#2873bd'));
    for (const x of [-.232, .232]) box('#1d4f80', x, -.1, -.005, .06, .24, .2, .25);
    for (const x of [-.095, .095]) box('#f0e2bf', x, .285, -.025, .065, .04, .23, .3);
    for (const [x, z] of [[-.13, -.162], [0, -.18], [.13, -.162]]) {
      box('#245f9c', x, -.14, z, .105, .12, .06, .25);
      if (near) box('#f4c542', x, -.085, z - .032, .045, .016, .01, .3);
    }
    box('#f0e2bf', .095, .09, -.175, .1, .038, .014, .3);
    box('#1d4f80', 0, -.235, -.12, .44, .04, .05, .3);
  } else if (kind === 'helmet') {
    // Dome, flared brim and a pair of amber goggles on the band: the helmet from its HUD icon.
    part(lathe([[0, .19], [.07, .185], [.13, .165], [.175, .12], [.2, .06], [.21, 0], [.21, -.02]]), '#6f7d45', 0, -.02, 0, 1, 1, 1);
    part(lathe([[.2, -.01], [.25, -.035], [.265, -.05], [.25, -.06], [.2, -.045]]), '#4f5a31', 0, -.02, 0, 1, 1, 1);
    part(lathe([[.212, 0], [.212, .045]], 18), '#3b4426', 0, -.02, 0, 1, 1, 1);
    for (const x of [-.07, .07]) {
      part(new THREE.CylinderGeometry(.052, .052, .04, seg(14)), '#2c2a26', x, .045, -.195, 1, 1, 1, new THREE.Euler(Math.PI / 2 - .25, 0, 0));
      part(new THREE.CylinderGeometry(.04, .04, .045, seg(14)), '#f2a93b', x, .045, -.2, 1, 1, 1, new THREE.Euler(Math.PI / 2 - .25, 0, 0));
    }
    box('#2c2a26', 0, .05, -.19, .06, .025, .03, .3);
  } else if (kind === 'ammo') {
    // An olive ammo can with a yellow stencil band, carry handle and brass rounds showing on top.
    box('#5b6a3a', 0, -.05, 0, .46, .3, .26, .12);
    box('#46522c', 0, .115, 0, .48, .05, .28, .2);
    box('#e8bf47', 0, -.03, 0, .465, .05, .265, .1);
    part(new THREE.TorusGeometry(.07, .014, seg(6), seg(12), Math.PI), '#2e3320', 0, .14, 0, 1, 1, 1);
    for (const [x, z] of [[-.16, -.06], [-.1, .07], [.13, -.05], [.17, .06]]) {
      part(new THREE.CylinderGeometry(.022, .022, .09, seg(8)), '#d9a441', x, .175, z, 1, 1, 1);
      part(new THREE.ConeGeometry(.022, .04, seg(8)), '#b8742e', x, .24, z, 1, 1, 1);
    }
  } else if (kind === 'medkit') {
    // A cream case with a raised red cross on both faces, latches and a dark handle.
    box('#f4efe2', 0, -.03, 0, .46, .32, .2, .15);
    box('#d9d1bd', 0, -.03, 0, .47, .03, .21, .3);
    for (const z of [-.103, .103]) { box('#d8412f', 0, -.03, z, .2, .062, .02, .3); box('#d8412f', 0, -.03, z, .062, .2, .02, .3); }
    part(new THREE.TorusGeometry(.065, .018, seg(6), seg(12), Math.PI), '#3d4540', 0, .13, 0, 1, 1, 1);
    if (near) for (const x of [-.15, .15]) box('#8c8f86', x, .1, -.1, .05, .04, .02, .3);
  } else if (kind === 'bandage') {
    // A fat roll with red stripes and its loose end trailing down.
    part(new THREE.CylinderGeometry(.15, .15, .28, seg(20)), '#f5e8ca', 0, 0, 0, 1, 1, 1, new THREE.Euler(0, 0, Math.PI / 2));
    part(new THREE.CylinderGeometry(.058, .058, .285, seg(12)), '#d9c7a0', 0, 0, 0, 1, 1, 1, new THREE.Euler(0, 0, Math.PI / 2));
    for (const x of [-.08, .08]) part(new THREE.CylinderGeometry(.153, .153, .03, seg(20)), '#d8412f', x, 0, 0, 1, 1, 1, new THREE.Euler(0, 0, Math.PI / 2));
    box('#f5e8ca', 0, -.115, -.15, .23, .012, .18, .4, new THREE.Euler(-.9, 0, 0));
  } else if (kind === 'guarana') {
    // A green soda can with a cream label and a guaraná fruit (red husk, white pulp, black seed).
    part(lathe([[0, -.19], [.095, -.19], [.105, -.17], [.105, .14], [.085, .18], [.08, .19], [0, .19]]), '#2f9a3f', 0, 0, 0, 1, 1, 1);
    part(lathe([[.107, -.06], [.107, .07]], 18), '#fff0cf', 0, 0, 0, 1, 1, 1);
    part(lathe([[0, .188], [.078, .188], [.078, .196], [0, .196]], 14), '#c9ccc8', 0, 0, 0, 1, 1, 1);
    for (const z of [-1, 1]) {
      part(new THREE.SphereGeometry(.04, seg(12), seg(8)), '#d8412f', 0, .005, z * .105, 1, 1, .5);
      part(new THREE.SphereGeometry(.022, seg(10), seg(6)), '#fff8e8', 0, .005, z * .122, 1, 1, .5);
      if (near) part(new THREE.SphereGeometry(.011, seg(8), seg(6)), '#1c1a18', 0, .005, z * .131, 1, 1, .5);
    }
  } else if (kind === 'acai') {
    // A bowl of açaí with banana slices, granola and a spoon standing in it.
    part(lathe([[.0, -.13], [.1, -.13], [.16, -.07], [.19, .02], [.2, .06], [.185, .065], [.17, .03]], 18), '#f2e3c4', 0, 0, 0, 1, 1, 1);
    part(lathe([[.192, -.005], [.197, .02]], 18), '#2f86d6', 0, 0, 0, 1, 1, 1);
    part(lathe([[0, .07], [.12, .065], [.172, .045]], 18), '#5a2270', 0, 0, 0, 1, 1, 1);
    for (const [x, z] of [[.06, -.05], [-.05, -.07], [.0, .06], [.09, .04]]) part(new THREE.CylinderGeometry(.034, .034, .016, seg(14)), '#f2d77a', x, .08, z, 1, 1, 1, new THREE.Euler(.2, 0, .15));
    if (near) for (const [x, z] of [[-.08, .02], [-.1, -.02], [-.07, .05], [-.04, -.01], [.03, -.1]]) box('#b77a3c', x, .078, z, .026, .018, .022, .3);
    box('#c9ccc8', .08, .16, .02, .018, .2, .01, .4, new THREE.Euler(0, 0, -.35));
    part(new THREE.SphereGeometry(.035, seg(12), seg(8)), '#c9ccc8', .045, .07, .02, 1, .35, .7);
  } else if (kind === 'rapadura') {
    // Two caramel sugar bricks in a band of straw paper tied with string.
    box('#9a5724', 0, -.075, 0, .4, .14, .24, .22);
    box('#b36d2e', .015, .065, 0, .36, .13, .22, .22);
    box('#c98a48', .015, .128, 0, .3, .012, .17, .4);
    box('#ead6a4', 0, -.005, 0, .17, .3, .255, .12);
    for (const x of [-.05, .05]) box('#7a4a2a', x, -.005, 0, .016, .31, .265, .3);
    box('#7a4a2a', 0, .15, 0, .12, .016, .016, .4);
  }
  const merged = mergeParts(parts);
  return shade(merged);
}

/** Replaces a part's colour. */
function tint(geometry: THREE.BufferGeometry, hex: string) {
  const color = new THREE.Color(hex), attribute = geometry.getAttribute('color');
  for (let i = 0; i < attribute.count; i++) attribute.setXYZ(i, color.r, color.g, color.b);
  return geometry;
}

/** Bows a panel round the vertical axis (z += bow * x^2), carrying its normals along. */
function bend(geometry: THREE.BufferGeometry, bow: number) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    position.setZ(i, position.getZ(i) + bow * x * x);
    n.set(normal.getX(i) - 2 * bow * x * normal.getZ(i), normal.getY(i), normal.getZ(i)).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return geometry;
}

/** Cheap baked form: darker toward the base, a touch brighter on top, so the flat colours turn round. */
function shade(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!, position = geometry.getAttribute('position'), color = geometry.getAttribute('color');
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) - min.y) / Math.max(1e-6, max.y - min.y), k = .74 + .32 * t * t * (3 - 2 * t);
    color.setXYZ(i, Math.min(1, color.getX(i) * k), Math.min(1, color.getY(i) * k), Math.min(1, color.getZ(i) * k));
  }
  return geometry;
}

// A chunky cartoon supply chest: planked wood, brass bands and corner caps and a
// domed lid. The lid geometry is built around its hinge on the back top edge.
export function chestGeometry(lid: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts.push(vertex(pawnBox, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz)));
  const dome = (color: string, x: number, y: number, z: number, height: number, length: number, depth: number) =>
    parts.push(vertex(pawnDome, color, new THREE.Vector3(x, y, z), new THREE.Vector3(height, length, depth), new THREE.Euler(0, 0, Math.PI / 2)));
  const wood = '#9a6238', plank = '#6a3f22', brass = '#d9a441', iron = '#3f4447';
  if (lid) {
    add(plank, 0, .04, .33, 1, .08, .68);
    dome(wood, 0, .08, .33, .2, .94, .33);
    for (const x of [-.3, .3]) dome(brass, x, .08, .33, .222, .08, .352);
    for (const x of [-.485, .485]) dome(iron, x, .08, .33, .214, .05, .344);
    add(brass, 0, -.02, .685, .14, .16, .035);
    add('#f2d27a', 0, .02, .705, .05, .05, .02);
  } else {
    add(iron, 0, .035, 0, 1.02, .07, .7);
    add(wood, 0, .27, 0, .94, .42, .62);
    for (const y of [.17, .32]) for (const z of [-.316, .316]) add(plank, 0, y, z, .95, .022, .02);
    for (const y of [.17, .32]) for (const x of [-.476, .476]) add(plank, x, y, 0, .02, .022, .63);
    add(plank, 0, .485, 0, 1, .05, .68);
    for (const x of [-.3, .3]) add(brass, x, .26, 0, .08, .47, .665);
    for (const x of [-.485, .485]) for (const z of [-.325, .325]) add(iron, x, .26, z, .07, .5, .07);
    add(brass, 0, .38, .338, .2, .19, .03);
    add('#2b2622', 0, .36, .355, .035, .07, .01);
  }
  return mergeParts(parts);
}
