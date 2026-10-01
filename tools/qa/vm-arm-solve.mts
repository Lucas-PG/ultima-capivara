// Places a hidden shoulder and elbow pole so the forearm continues the paw's line (a natural wrist):
// elbow = wrist - forearm * (paw forward, optionally tilted), shoulder = elbow + upper arm toward a
// body point. Prints the shoulders, poles, the elbow on screen and the resulting wrist angles, for the
// hip and aimed poses. Uses the specs and grips in the tree (or overrides).
// npx tsx tools/qa/vm-arm-solve.mts '<json: {weapon: {R?: opts, L?: opts}}>'
//   opts: { body: [x, y, z] (where the upper arm heads, camera space; omitted = searched), tilt: [flexion, deviation] (deg, wrist
//   angles to aim for), grip: {wrist, forward, palm} (weapon space override), hip: {pos, rot}, fov }
import * as THREE from 'three';
import { VIEW_SPECS, framedGrips } from '../../src/render/viewmodel-specs';
import { wristAngles } from '../../src/render/viewmodel-frame';

type V = [number, number, number];
const SIGHT: Record<string, V> = { pistol: [0, .0795, .03], revolver: [0, .0945, .038], smg: [0, .122, .045], m4: [0, .125, .055], shotgun: [0, .113, .03], dmr: [0, .158, .106], sniper: [0, .151, .122], coco: [0, .245, .084], machete: [0, .06, 0] };
const A = .3, B = .3;
const r3 = (v: THREE.Vector3) => v.toArray().map(x => +x.toFixed(3));
const pose = (pos: readonly number[], rot: readonly number[]) => ({ p: new THREE.Vector3(...pos), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')) });

/** Forearm direction giving the wanted wrist angles for a paw frame (search on the sphere around the paw). */
function forearmFor(h: THREE.Vector3, p: THREE.Vector3, side: 'R' | 'L', tilt: [number, number]) {
  if (!tilt[0] && !tilt[1]) return h.clone();
  let best = h.clone(), cost = Infinity;
  const pp = p.clone().addScaledVector(h, -p.dot(h)).normalize(), t = new THREE.Vector3().crossVectors(h, pp).multiplyScalar(side === 'R' ? 1 : -1);
  for (let a = -80; a <= 80; a += 1) for (let b = -80; b <= 80; b += 1) {
    const f = h.clone().addScaledVector(pp, -Math.tan(a * Math.PI / 180)).addScaledVector(t, -Math.tan(b * Math.PI / 180)).normalize();
    const w = wristAngles(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -.3, 0), f.clone().multiplyScalar(.3).add(new THREE.Vector3(0, -.3, 0)), h, p, side);
    const c = (w.flexion - tilt[0]) ** 2 + (w.deviation - tilt[1]) ** 2;
    if (c < cost) { cost = c; best = f; }
  }
  return best;
}

function solve(weapon: string, side: 'R' | 'L', opts: { body?: V; tilt?: [number, number]; grip?: { wrist: V; forward: V; palm: V }; hip?: { pos: V; rot: V }; fov?: number; screenWeight?: number; tilts?: [number, number][]; tiltWeight?: number }, aimed: boolean) {
  const spec = VIEW_SPECS[weapon as keyof typeof VIEW_SPECS];
  const grip = opts.grip ?? framedGrips(spec)[side]!;
  let gun: { p: THREE.Vector3; q: THREE.Quaternion };
  if (!aimed) gun = pose((opts.hip ?? spec.hip).pos, (opts.hip ?? spec.hip).rot);
  else {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spec.adsPitch ?? 0);
    const eye = new THREE.Vector3(...((spec.adsEye ?? SIGHT[weapon]) as V)).applyQuaternion(q);
    gun = { p: new THREE.Vector3(0, 0, -spec.adsDistance).sub(eye), q };
  }
  const W = new THREE.Vector3(...grip.wrist).applyQuaternion(gun.q).add(gun.p);
  const h = new THREE.Vector3(...grip.forward).normalize().applyQuaternion(gun.q);
  const p = new THREE.Vector3(...grip.palm).normalize().applyQuaternion(gun.q);
  const f = forearmFor(h, p, side, opts.tilt ?? [0, 0]);
  const E = W.clone().addScaledVector(f, -B);
  const body = new THREE.Vector3(...(opts.body ?? [side === 'R' ? .2 : -.2, -.3, .1]));
  const S = E.clone().add(body.clone().sub(E).normalize().multiplyScalar(A));
  const dir = W.clone().sub(S).normalize();
  const pole = E.clone().sub(S).addScaledVector(dir, -E.clone().sub(S).dot(dir)).normalize();
  const fovY = aimed ? (spec.adsFov ?? 44) : (opts.fov ?? 44), tanY = Math.tan(fovY * Math.PI / 360), tanX = tanY * 16 / 9;
  const scr = (v: THREE.Vector3) => v.z < -.01 ? [+(.5 + v.x / -v.z / tanX / 2).toFixed(2), +(.5 - v.y / -v.z / tanY / 2).toFixed(2)] : ['behind'];
  const angles = wristAngles(S, E, W, h, p, side);
  // How much screen the forearm takes: samples along it inside the frame, sized by depth (radius about 5 cm).
  let screenCost = 0;
  // The forearm, then the upper arm with its cuff (sampled at half weight: it should stay off screen).
  for (let k = 0; k <= 24; k++) {
    const q = k <= 12 ? W.clone().lerp(E, k / 12) : E.clone().lerp(S, (k - 12) / 12);
    if (q.z > -.01) { screenCost += 4; continue; }
    const sx = .5 + q.x / -q.z / tanX / 2, sy = .5 - q.y / -q.z / tanY / 2;
    if (sx > -.05 && sx < 1.05 && sy > -.05 && sy < 1.05) screenCost += (.05 / -q.z / tanY) ** 2;
  }
  return { shoulder: r3(S), pole: r3(pole), elbowScreen: scr(E), elbow: r3(E), forearmScreen: +screenCost.toFixed(3), wrist: Object.fromEntries(Object.entries(angles).map(([k, v]) => [k, Math.round(v)])), reach: +W.distanceTo(S).toFixed(3) };
}

/** Searches the body point (where the upper arm heads) for the least forearm twist with the elbow off
 * screen (below the frame or behind the eye) and bent (reach under 0.57 m). */
function search(weapon: string, side: 'R' | 'L', opts: Parameters<typeof solve>[2] & { screenWeight?: number; tilts?: [number, number][] }, aimed: boolean) {
  if (opts.tilts) {
    let pick: ReturnType<typeof search> | null = null;
    for (const tilt of opts.tilts) {
      const r = search(weapon, side, { ...opts, tilts: undefined, tilt }, aimed);
      const c = r.cost + ((tilt[0] / 45) ** 2 + (tilt[1] / 25) ** 2) * (opts.tiltWeight ?? 200);
      if (!pick || c < pick.cost) pick = { ...r, cost: Math.round(c), tilt } as typeof r;
    }
    return pick!;
  }
  let best: ReturnType<typeof solve> | null = null, bestCost = Infinity, bestBody: V = [0, 0, 0];
  const xs = side === 'R' ? [.05, .12, .2, .28, .36] : [-.36, -.28, -.2, -.12, -.05];
  for (const x of xs) for (const y of [-.55, -.45, -.35, -.25, -.15]) for (const z of [-.25, -.1, .05, .2, .35]) {
    const r = solve(weapon, side, { ...opts, body: [x, y, z] }, aimed);
    const [sx, sy] = r.elbowScreen as number[];
    const hidden = r.elbowScreen[0] === 'behind' || sy > 1.04 || sx < -.04 || sx > 1.04;
    const cost = r.wrist.pronation ** 2 + (hidden ? 0 : 1e5) + r.forearmScreen * (opts.screenWeight ?? 0) + Math.max(0, r.reach - .57) * 1e6 + Math.max(0, .3 - r.reach) * 1e5
      + ((x - (side === 'R' ? .2 : -.2)) ** 2 + (y + .3) ** 2 + (z - .05) ** 2) * 2000;
    if (cost < bestCost) { bestCost = cost; best = r; bestBody = [x, y, z]; }
  }
  return { ...best!, body: bestBody, cost: Math.round(bestCost) };
}

const jobs = JSON.parse(process.argv[2] ?? '{}') as Record<string, Partial<Record<'R' | 'L', Parameters<typeof solve>[2]>>>;
for (const [weapon, sides] of Object.entries(jobs)) for (const [side, opts] of Object.entries(sides) as ['R' | 'L', Parameters<typeof solve>[2]][]) {
  const run = (aimed: boolean) => opts.body ? solve(weapon, side, opts, aimed) : search(weapon, side, opts, aimed);
  if (process.env.ONLY === 'aimed') { console.log(weapon, side, 'aimed', JSON.stringify(run(true))); continue; }
  console.log(weapon, side, 'hip  ', JSON.stringify(run(false)));
  console.log(weapon, side, 'aimed', JSON.stringify(run(true)));
}
