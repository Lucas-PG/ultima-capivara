import * as THREE from 'three';
import { plantHash } from '../../shared/vegetation-species';
import { FOLIAGE_TILES } from './atlas';
import { bladePair, grassBlade } from './blades';
import { KIND, MeshBuilder, card, tube, type TileUv } from './mesh-builder';
import { fruit, type Lod } from './palms';

const DEG = Math.PI / 180;
const lerp = THREE.MathUtils.lerp;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const hex = (c: string) => new THREE.Color(c);

/** A painted whole-plant sprite drawn as `count` upright cards crossing at the root, each
 * leaning out a little, so it has body from every side. */
function crossed(mb: MeshBuilder, tile: TileUv, count: number, width: number, rand: (i: number) => number, salt: number,
  o: { lean?: number; sway?: number; tint?: THREE.Color; offset?: number } = {}) {
  for (let k = 0; k < count; k++) {
    const a = k / count * Math.PI + rand(salt + k) * .4, right = v3(Math.cos(a), 0, Math.sin(a));
    const out = v3(-Math.sin(a), 0, Math.cos(a)), lean = (o.lean ?? .12) * (k % 2 ? 1 : -1) * (.6 + rand(salt + k + 10) * .6);
    const up = UP.clone().applyAxisAngle(right, lean), face = new THREE.Vector3().crossVectors(right, up).normalize();
    const w = width * (.9 + rand(salt + k + 20) * .2), root = out.clone().multiplyScalar((o.offset ?? 0) * (k % 2 ? 1 : -1));
    card(mb, tile, root, right, up, { width: w, anchor: 'root', bow: w * .05, segmentsY: 2, color: o.tint ?? new THREE.Color(1, 1, 1),
      sway: .04, swayTip: o.sway ?? .3, kind: KIND.leaf, flip: k % 2 === 1,
      normal: () => face.clone().multiplyScalar(.45).addScaledVector(UP, .55).normalize() });
  }
}

/** Paddle leaves (banana-leaf painting) rising from the base: heliconia and strelitzia foliage. */
function paddles(mb: MeshBuilder, count: number, length: [number, number], elevation: [number, number], rand: (i: number) => number, salt: number, lod: Lod) {
  const tile = FOLIAGE_TILES['banana-leaf'];
  for (let k = 0; k < count; k++) {
    const l = lerp(length[0], length[1], rand(salt + k));
    bladePair(mb, {
      tile, root: v3((rand(salt + k + 3) - .5) * .2, .05, (rand(salt + k + 4) - .5) * .2), azimuth: k * 137.5 * DEG + rand(salt) * 6,
      elevation: lerp(elevation[0], elevation[1], rand(salt + k + 5)) * DEG, length: l, droop: .22 + rand(salt + k + 8) * .2,
      roll: (rand(salt + k + 9) - .5) * .4, twist: (rand(salt + k + 10) - .5) * .4, halfWidth: l * .17, fold: 12 * DEG,
      tint: new THREE.Color(.98, 1.02, .9), segments: [4, 3, 2][lod], uMid: lerp(tile.u0, tile.u1, .42), uLeft: tile.u0, uRight: tile.u1, sway: .9, shade: [.7, 1.06],
    });
  }
}

// ---------------------------------------------------------------- banana

/** Bananeira: a clump of pseudostems with long arching paddle leaves, a hanging bunch and a purple heart. */
export function buildBanana(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 23 + 11, rand = (i: number) => plantHash(seed, i);
  const tile = FOLIAGE_TILES['banana-leaf'];
  const stems = [[3.4, 0, 0], [2.5, .6, .3], [1.6, -.5, .45]].slice(0, variant === 0 ? 2 : 3).map(([h, x, z], i) => ({ h: h * (.94 + rand(i) * .12), x, z }));
  const stemBase = hex('#6f7a3c'), stemTop = hex('#a8b667');
  stems.forEach((stem, si) => {
    const lean = v3((rand(si + 5) - .5) * .45, 0, (rand(si + 6) - .5) * .45), base = v3(stem.x, 0, stem.z), top = base.clone().add(lean).setY(stem.h);
    const path = [base, base.clone().lerp(top, .5), top], radii = [.19 * (stem.h / 3.4) ** .5, .15 * (stem.h / 3.4) ** .5, .1];
    tube(mb, path, radii, { sides: lod === 0 ? 7 : 5, kind: KIND.limb, swayBase: 0, swayTop: .08, uvScale: 1,
      color: (t, angle) => stemBase.clone().lerp(stemTop, t).multiplyScalar(.92 + .1 * Math.cos(angle * 4 + t * 9)) });
    const leaves = [9, 6, 4][lod] - (si > 0 ? 2 : 0);
    for (let k = 0; k < leaves; k++) {
      const age = k / (leaves - 1), j = (a: number) => rand(si * 40 + k * 3 + a) - .5;
      const length = lerp(1.9, 2.9, 1 - Math.abs(age - .4)) * (.92 + rand(k + si * 9) * .16) * (stem.h / 3.4) ** .45;
      // The oldest leaf of the tall stems hangs dead and torn against the stem.
      const dead = age === 1 && si === 0 && lod < 2;
      bladePair(mb, {
        tile, root: top.clone().setY(top.y - .05), azimuth: k * 137.5 * DEG + si * 1.3 + variant,
        elevation: (dead ? -70 : lerp(74, 8, Math.pow(age, .85))) * DEG + j(1) * 8 * DEG, length: dead ? length * .7 : length,
        droop: dead ? .05 : lerp(.28, 1.0, age), roll: j(2) * 16 * DEG, twist: j(3) * 22 * DEG,
        halfWidth: length * .2, fold: (10 + age * 10) * DEG,
        tint: dead ? hex('#b08a4e') : new THREE.Color(lerp(1.04, .94, age), lerp(1.08, 1.0, age), lerp(.9, .84, age)),
        segments: [6, 4, 2][lod], uMid: lerp(tile.u0, tile.u1, .42), uLeft: tile.u0, uRight: tile.u1, sway: 1.15, shade: [.66, 1.08],
      });
    }
    if (lod === 0 && si === 0) {
      // Bunch: a maroon heart on a hanging stalk, with green hands of fruit above it.
      const hang = top.clone().add(v3(.34, -.4, .12));
      tube(mb, [top.clone().add(v3(0, -.05, 0)), top.clone().add(v3(.24, -.2, .08)), hang], [.03, .026, .022], { sides: 4, kind: KIND.limb, swayBase: .1, swayTop: .2, uvScale: 1, color: () => hex('#6a7f34') });
      for (let h = 0; h < 5; h++) for (let f = 0; f < 3; f++) {
        const a = f * 2.1 + h * .7;
        fruit(mb, hang.clone().add(v3(Math.cos(a) * .08 + .02 * h, -.05 - h * .075, Math.sin(a) * .08)), .05, hex(h % 2 ? '#93b84a' : '#a8c455'), v3(1, 2.4, 1));
      }
      fruit(mb, hang.clone().add(v3(.03, -.5, 0)), .1, hex('#6c1f3a'), v3(.9, 1.7, .9), 1);
    }
  });
  return mb.build();
}

// ---------------------------------------------------------------- flowering clumps

/** Helicônia: scarlet lobster-claw spikes among tall paddle leaves. */
export function buildHeliconia(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 19 + 4, rand = (i: number) => plantHash(seed, i);
  paddles(mb, [5, 3, 2][lod], [1.2, 1.7], [58, 78], rand, 40, lod);
  crossed(mb, FOLIAGE_TILES.heliconia, [3, 2, 2][lod], .95, rand, 10, { lean: .14, sway: .25 });
  return mb.build();
}

/** Ave-do-paraíso: orange and blue crane flowers over stiff upright paddles. */
export function buildStrelitzia(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 37 + 9, rand = (i: number) => plantHash(seed, i);
  paddles(mb, [4, 3, 2][lod], [1.0, 1.4], [64, 82], rand, 30, lod);
  crossed(mb, FOLIAGE_TILES.strelitzia, [3, 2, 2][lod], 1.2, rand, 10, { lean: .1, sway: .2 });
  return mb.build();
}

/** Bromélia: a stiff rosette with a red and yellow bract, for planters and the forest floor. */
export function buildBromeliad(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 41 + 2, rand = (i: number) => plantHash(seed, i);
  crossed(mb, FOLIAGE_TILES.bromeliad, [4, 3, 2][lod], .62, rand, 10, { lean: .22, sway: .08, offset: .03 });
  return mb.build();
}

// ---------------------------------------------------------------- big-leaf floor plants

/** Leaves on stalks fanning out from one root: costela-de-adão (monstera) and taioba (taro). */
function stalkedLeaves(mb: MeshBuilder, tile: TileUv, counts: readonly [number, number, number], width: [number, number], reach: [number, number], height: [number, number],
  tilt: [number, number], rand: (i: number) => number, lod: Lod, stalkColor: THREE.Color, rootAnchor: boolean) {
  const leaves = Array.from({ length: counts[0] }, (_, k) => {
    const a = k * 137.5 * DEG + rand(0) * 6, out = v3(Math.cos(a), 0, Math.sin(a));
    const r = lerp(reach[0], reach[1], rand(k + 1)), h = lerp(height[0], height[1], rand(k + 2));
    const el = lerp(tilt[0], tilt[1], rand(k + 3)) * DEG, w = lerp(width[0], width[1], rand(k + 5));
    const attach = rootAnchor ? v3(out.x * .06, .02, out.z * .06) : out.clone().multiplyScalar(r).setY(h);
    return { k, out, attach, el, w, top: attach.y + Math.cos(el) * w / tile.aspect };
  });
  // Lower LODs keep the tallest leaves of the full plant, so its outline holds (only far away does it thin).
  const keep = counts[lod];
  const kept = [...leaves].sort((a, b) => b.top - a.top).slice(0, keep);
  for (const { k, out, attach, el, w } of kept) {
    if (!rootAnchor) tube(mb, [v3(0, 0, 0), attach.clone().multiplyScalar(.45).setY(attach.y * .75), attach], [.025, .02, .016],
      { sides: 3, kind: KIND.limb, swayBase: 0, swayTop: .15, uvScale: 1, color: () => stalkColor });
    // The leaf rises from its attachment and tips outward; older, outer leaves lie flatter.
    const up = out.clone().multiplyScalar(Math.sin(el)).addScaledVector(UP, Math.cos(el));
    const right = new THREE.Vector3().crossVectors(up, out).normalize(), face = new THREE.Vector3().crossVectors(right, up).normalize();
    const shade = lerp(.8, 1.06, rand(k + 4));
    card(mb, tile, attach, right, up, { width: w, anchor: 'root', bow: .06, cup: .04, segmentsY: lod === 0 ? 2 : 1,
      color: new THREE.Color(shade, shade, shade * .95), sway: .15, swayTip: .45, kind: KIND.leaf, flip: rand(k + 6) < .5,
      normal: () => face.clone().multiplyScalar(.55).addScaledVector(UP, .45).normalize() });
  }
}

/** Costela-de-adão: a mound of big split leaves on long stalks. */
export function buildMonstera(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 29 + 3, rand = (i: number) => plantHash(seed, i);
  stalkedLeaves(mb, FOLIAGE_TILES.monstera, [9, 6, 4], [.62, .88], [.25, .6], [.35, .8], [35, 75], rand, lod, hex('#6f8c3a'), false);
  return mb.build();
}

/** Taioba / orelha-de-elefante: huge heart leaves, each painted with its own stalk. */
export function buildTaro(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 43 + 5, rand = (i: number) => plantHash(seed, i);
  stalkedLeaves(mb, FOLIAGE_TILES.taro, [7, 5, 3], [.75, 1.05], [0, 0], [0, 0], [10, 38], rand, lod, hex('#6f8c3a'), true);
  return mb.build();
}

// ---------------------------------------------------------------- ferns, reeds, crops

/** Samambaia: a rosette of arching fronds. */
export function buildFern(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 13 + 71, tile = FOLIAGE_TILES.fern;
  const fronds = [11, 8, 5][lod];
  for (let k = 0; k < fronds; k++) {
    const age = k / (fronds - 1), j = (a: number) => plantHash(seed + k, a) - .5, length = lerp(.7, 1.05, 1 - Math.abs(age - .4)) * (1 + j(1) * .2);
    bladePair(mb, {
      tile, root: v3(0, .04, 0), azimuth: k * 137.5 * DEG + variant, elevation: lerp(58, 22, age) * DEG + j(2) * 8 * DEG, length, droop: lerp(.35, .7, age),
      roll: j(3) * .3, twist: j(4) * .3, halfWidth: length * .26, fold: 8 * DEG, tint: new THREE.Color(lerp(1.05, .9, age), lerp(1.08, .96, age), lerp(.9, .82, age)),
      segments: [3, 2, 1][lod], uMid: lerp(tile.u0, tile.u1, .45), uLeft: tile.u0, uRight: tile.u1, sway: 1.2, shade: [.68, 1.06],
    });
  }
  return mb.build();
}

/** Mandioca (cassava): a slender red stem carrying tiers of palmate leaves on long petioles,
 * the crop of every Brazilian farm plot. 0.8 m template; the rows plant it at 0.7 to 1 m. */
export function buildCrop(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 31 + 8, tile = FOLIAGE_TILES['palm-fan'], rand = (i: number) => plantHash(seed, i);
  const lean = v3((rand(1) - .5) * .12, 0, (rand(2) - .5) * .12), top = v3(lean.x, .72, lean.z);
  if (lod < 2) tube(mb, [v3(0, 0, 0), v3(lean.x * .4, .36, lean.z * .4), top], [.022, .017, .01],
    { sides: lod === 0 ? 4 : 3, kind: KIND.limb, swayBase: 0, swayTop: .12, uvScale: 1, color: t => hex('#8a4a36').lerp(hex('#6f7a3a'), t * .6) });
  const leaves = [9, 5, 3][lod];
  for (let k = 0; k < leaves; k++) {
    // Leaves spiral up the stem; the lower ones reach out farther and droop.
    const h = .28 + .44 * (k + .5) / leaves, a = k * 137.5 * DEG + variant, out = v3(Math.cos(a), 0, Math.sin(a));
    const el = (18 + 40 * (k + .5) / leaves + rand(k) * 10) * DEG;
    const up = out.clone().multiplyScalar(Math.cos(el)).addScaledVector(UP, Math.sin(el));
    const right = new THREE.Vector3().crossVectors(up, UP).normalize(), face = new THREE.Vector3().crossVectors(right, up).normalize();
    const at = v3(lean.x * h / .72 + out.x * .03, h, lean.z * h / .72 + out.z * .03), shade = .86 + .24 * (k + .5) / leaves;
    card(mb, tile, at, right, up, { width: (.36 + rand(k + 8) * .08) * (lod === 2 ? 1.25 : 1), anchor: 'root', bow: .04, segmentsY: lod === 0 ? 2 : 1,
      color: new THREE.Color(.96 * shade, 1.02 * shade, .84 * shade), sway: .2, swayTip: .55, kind: KIND.leaf, flip: rand(k + 9) < .5,
      normal: () => face.clone().multiplyScalar(.5).addScaledVector(UP, .5).normalize() });
  }
  return mb.build();
}

/** Juncos: arching blades with cattail spikes on tall stems, for riverbanks and the mangue. */
export function buildReeds(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 37 + 6, rand = (i: number) => plantHash(seed, i);
  const blades = [18, 10, 6][lod], base = hex('#4f7a30'), tip = hex('#b4c765');
  for (let k = 0; k < blades; k++) {
    const a = k * 137.5 * DEG + variant, r = .04 + rand(k) * .14, height = (.75 + rand(k + 3) * .95);
    grassBlade(mb, { root: v3(Math.cos(a) * r, 0, Math.sin(a) * r), azimuth: a, height, lean: .18 + rand(k + 6) * .35, width: .08,
      base: base.clone().multiplyScalar(.85 + rand(k + 9) * .3), tip: tip.clone().multiplyScalar(.9 + rand(k + 12) * .2), segments: [3, 2, 2][lod], sway: 1 });
  }
  if (lod === 0) for (let k = 0; k < 3; k++) {
    const a = k * 2.4 + variant, r = .06 + rand(k + 40) * .08, height = 1.2 + rand(k + 41) * .5, top = v3(Math.cos(a) * r * 2, height, Math.sin(a) * r * 2);
    tube(mb, [v3(Math.cos(a) * r, 0, Math.sin(a) * r), top.clone().multiplyScalar(.5).setY(height * .55), top], [.012, .01, .008], { sides: 3, kind: KIND.limb, swayBase: 0, swayTop: .5, uvScale: 1, color: () => hex('#8ba14a') });
    fruit(mb, top.clone().add(v3(0, .1, 0)), .035, hex('#6b4426'), v3(1, 3.4, 1));
  }
  return mb.build();
}

// ---------------------------------------------------------------- meadow patches

/** A drift of wild grass tussocks about 3 m across and never taller than 0.6 m: it breaks up an open
 * field without hiding anyone. The plant batch tints each patch with the ground's own paint, so the
 * drift reads as the field grown long; the vertex colour only carries root-to-tip light. */
export function buildMeadow(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 61 + 29, rand = (i: number) => plantHash(seed, i), tile = FOLIAGE_TILES['wild-grass'];
  const tussocks = [9, 5, 4][lod];
  for (let k = 0; k < tussocks; k++) {
    // Sunflower spiral: dense in the middle, thinning to the rim. Far templates keep the spread
    // (the outermost tussocks sit on the same rim at every LOD).
    const t = tussocks === 9 ? (k + .5) / 9 : .15 + .85 * k / (tussocks - 1), r = 1.35 * Math.sqrt(t);
    const a = (tussocks === 9 ? k * 2.39996 : k * Math.PI * 2 / tussocks) + rand(0) * 6 + variant;
    const at = v3(Math.cos(a) * r, 0, Math.sin(a) * r), width = .5 * (.8 + rand(k + 20) * .2) * (1 - t * .2);
    const cards = [3, 2, 1][lod];
    for (let c = 0; c < cards; c++) {
      const yaw = rand(k + 30) * Math.PI + c * Math.PI / cards, right = v3(Math.cos(yaw), 0, Math.sin(yaw));
      const up = UP.clone().applyAxisAngle(right, (rand(k + 40 + c) - .5) * .3), face = new THREE.Vector3().crossVectors(right, up).normalize();
      card(mb, tile, at, right, up, { width, anchor: 'root', bow: width * .06, segmentsY: lod === 0 ? 2 : 1,
        color: new THREE.Color(1, 1, 1), sway: 0, swayTip: .3, kind: KIND.leaf, flip: rand(k + 60) < .5,
        normal: () => face.clone().multiplyScalar(.3).addScaledVector(UP, .7).normalize() });
    }
  }
  return mb.build();
}
