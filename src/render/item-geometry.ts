import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { LootSpawn, WeaponId } from '../shared/types';

export const itemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .16, side: THREE.DoubleSide });
const pawnSphere = new THREE.SphereGeometry(1, 12, 8);
const pawnBox = new THREE.BoxGeometry(1, 1, 1);
const pawnRoundedBox = new RoundedBoxGeometry(1, 1, 1, 2, .1);
const pawnGuard = new THREE.TorusGeometry(1, .13, 5, 14);
const pawnCylinder = new THREE.CylinderGeometry(.5, .5, 1, 12);
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

export function itemGeometry(kind: LootSpawn['kind'], weapon: WeaponId = 'pistol'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (base: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler()) =>
    parts.push(vertex(base, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation));
  const b = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => add(pawnBox, color, x, y, z, sx, sy, sz);
  const tube = (color: string, x: number, y: number, z: number, radius: number, length: number) => add(pawnCylinder, color, x, y, z, radius * 2, length, radius * 2, new THREE.Euler(Math.PI / 2, 0, 0));
  if (kind === 'weapon') {
    const small = weapon === 'pistol', blade = weapon === 'machete', sling = weapon === 'slingshot';
    if (blade) {
      b('#8e9a9a', 0, .01, -.26, .025, .085, .53);
      b('#d8dfd6', -.016, -.015, -.27, .012, .016, .53);
      b('#8a5e3f', 0, -.04, .13, .08, .085, .22);
      b('#c6a269', 0, -.03, .016, .14, .025, .038);
    } else if (sling) {
      b('#8f623c', 0, -.08, .10, .075, .23, .07);
      for (const side of [-1, 1]) {
        const arm = vertex(pawnCylinder, '#8f623c', new THREE.Vector3(side * .1, .085, -.04), new THREE.Vector3(.045, .26, .045), new THREE.Euler(0, 0, side * -.42)); parts.push(arm);
        b('#584638', side * .15, .14, -.13, .012, .014, .20);
      }
      b('#6c513b', 0, .14, -.23, .12, .025, .075);
    } else if (small) {
      // A compact slide over an angled grip, with the muzzle inside the slide.
      // The former shared rifle recipe left a long exposed barrel on pistols.
      add(pawnRoundedBox, '#536C78', 0, .025, -.012, .085, .076, .245);
      add(pawnRoundedBox, '#35474C', 0, -.019, .012, .077, .042, .207);
      add(pawnRoundedBox, '#8C694C', 0, -.1, .077, .069, .145, .076, new THREE.Euler(-.24, 0, 0));
      b('#B49061', 0, -.174, .094, .075, .012, .075);
      tube('#ABB8B6', 0, .018, -.137, .021, .014);
      tube('#223537', 0, .018, -.146, .014, .005);
      b('#A9B8B7', 0, .067, -.021, .038, .004, .205);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) b('#A0B1AD', side * .043, .023, .041 + i * .011, .003, .043, .004);
        b('#414F48', side * .035, -.1, .082, .004, .072, .042);
        b('#C6AE73', side * .039, -.093, .083, .003, .026, .021);
      }
      add(pawnGuard, '#364B50', 0, -.067, -.015, .035, .037, .035, new THREE.Euler(0, Math.PI / 2, 0));
      b('#B2ADA0', 0, -.052, .002, .008, .035, .006);
      b('#263A40', 0, .071, -.101, .013, .015, .016);
      for (const side of [-1, 1]) b('#263A40', side * .024, .07, .084, .016, .013, .018);
      b('#A1C48A', 0, .08, -.101, .005, .003, .01);
    } else {
      const compact = weapon === 'smg', shotgun = weapon === 'shotgun', sniper = weapon === 'sniper', dmr = weapon === 'dmr';
      const front = compact ? .47 : shotgun ? .72 : sniper ? .85 : dmr ? .72 : .62;
      const color = shotgun ? '#8d6645' : sniper ? '#687861' : compact ? '#557b87' : '#59645b';
      b('#414b4d', 0, 0, -.02, .13, .12, .38);
      b(color, 0, -.017, -.25, .13, .10, .28);
      tube('#657174', 0, .012, -.28 - front * .42, shotgun ? .026 : .019, front);
      tube('#343e40', 0, .012, -.28 - front * .86, .031, .045);
      b(color, 0, -.04, .23, .12, .14, .22);
      b('#3a4140', 0, -.145, .09, .075, .18, .07);
      if (!shotgun) b('#556469', 0, -.145, -.07, .075, .18, .088);
      b('#292f31', 0, -.085, .33, .14, .19, .04);
      if (shotgun) {
        b('#a5784d', 0, -.055, -.45, .13, .08, .20);
        tube('#526064', 0, -.055, -.45, .014, .48);
      }
      if (sniper || dmr) {
        tube('#303a3c', 0, .14, -.12, .043, sniper ? .32 : .25);
        for (const z of [-.2, -.04]) b('#455052', 0, .065, z, .024, .065, .03);
        tube('#477080', 0, .14, -.29, .048, .014);
      } else {
        b('#3b4547', 0, .08, -.41, .016, .08, .015);
        b('#475155', 0, .055, .04, .05, .04, .04);
      }
      if (weapon === 'm4') for (let i = 0; i < 6; i++) b('#333b3e', 0, .057, -.20 - i * .04, .095, .007, .015);
    }
  } else if (kind === 'ammo') {
    b('#626b50', 0, 0, 0, .48, .29, .31);
    b('#343d36', 0, .16, 0, .51, .045, .34);
    b('#d0af6f', 0, .162, -.17, .22, .016, .018);
    for (const x of [-.13, 0, .13]) add(pawnCylinder, '#d0a767', x, .183, .025, .065, .07, .065);
  } else if (kind === 'armor') {
    b('#3d5964', 0, .02, 0, .43, .43, .14);
    b('#6e8d98', 0, .10, -.077, .34, .09, .023);
    for (const x of [-.18, .18]) b('#303c42', x, .26, 0, .07, .16, .17);
    b('#9ba7a3', 0, -.16, -.085, .2, .037, .02);
  } else if (kind === 'helmet') {
    add(pawnSphere, '#506b71', 0, .06, 0, .24, .18, .25);
    b('#384e53', 0, -.07, -.16, .48, .05, .18);
    b('#a3b8b3', 0, .17, -.10, .22, .025, .04);
  } else if (kind === 'medkit' || kind === 'bandage') {
    if (kind === 'medkit') {
      b('#e9e8de', 0, 0, 0, .4, .29, .29);
      b('#c45146', 0, 0, -.15, .2, .045, .012);
      b('#c45146', 0, 0, -.15, .046, .21, .012);
      b('#5b665e', 0, .16, 0, .14, .04, .08);
    } else {
      add(pawnCylinder, '#efdfc1', 0, 0, 0, .32, .25, .32, new THREE.Euler(0, 0, Math.PI / 2));
      add(pawnCylinder, '#bd5b50', .13, 0, 0, .045, .27, .27, new THREE.Euler(0, 0, Math.PI / 2));
    }
  } else if (kind === 'guarana' || kind === 'acai') {
    const fruit = kind === 'acai' ? '#703f78' : '#c47b3c';
    add(pawnCylinder, fruit, 0, 0, 0, .26, .38, .26);
    add(pawnCylinder, '#d9c7a4', 0, .2, 0, .26, .04, .26);
    b(kind === 'acai' ? '#d9aed6' : '#e5ca7a', 0, .015, -.133, .17, .13, .01);
  } else {
    b('#aa7045', 0, -.04, 0, .43, .21, .28);
    b('#c38c59', 0, .08, 0, .37, .035, .25);
  }
  return mergeParts(parts);
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
