// Fits a first-person paw grip to an explicit intent on the live rig (VITE_QA=1 dev server).
// The cost adds skin penetration into the gun, contact gaps per digit, where each
// digit sits around the bore, the paw's place along the gun and the wrist bend
// against the forearm. Pattern search from a start grip; prints the fitted spec.
// node tools/qa/grip-fit.mjs <weapon> '<intent json>' ['<start grip json>'] [--evals N] [--fp|--ads]
// Intent (degrees around the bore: 0 right, 90 top, 180 left, 270 bottom; ranges may wrap):
//   { "side": "L", "zone": [zMin, zMax], "digits": { "index": { "tip": [a, b], "base": [a, b] }, ... },
//     "palm": [a, b], "thumbAlong": deg, "wristBend": deg, "contact": ["palm", "index", ...], "free": ["thumb"] }
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const evals = +(flag('--evals') ?? 1500);
const mode = args.includes('--ads') ? 'ads' : 'fp';
const [weapon, intentJson, startJson] = args.filter(a => !a.startsWith('--'));
const intent = JSON.parse(intentJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'log') console.log(m.text()); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);

const result = await page.evaluate(([weapon, intent, start, maxEvals]) => {
  const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder, side = intent.side;
  const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor, Q = holder.quaternion.constructor;
  vm.scene.updateMatrixWorld(true);
  const toGun = new M4().copy(holder.matrixWorld).invert(), scale = holder.scale.x;
  const bore = model.muzzle.getWorldPosition(new V3()).applyMatrix4(toGun).multiplyScalar(scale);
  // ---- gun triangles in weapon space, bucketed in a grid for nearest queries
  const tris = [];
  model.group.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry.attributes.position) return;
    const m = new M4().multiplyMatrices(toGun, o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    const at = i => new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m).multiplyScalar(scale);
    for (let i = 0; i < count; i += 3) {
      const a = at(i), b = at(i + 1), c = at(i + 2), n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
      if (n.lengthSq() > 1e-16) tris.push({ a, b, c, n });
    }
  });
  const CELL = .008, grid = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  for (const t of tris) {
    const lo = new V3().copy(t.a).min(t.b).min(t.c), hi = new V3().copy(t.a).max(t.b).max(t.c);
    for (let i = Math.floor(lo.x / CELL); i <= Math.floor(hi.x / CELL); i++)
      for (let j = Math.floor(lo.y / CELL); j <= Math.floor(hi.y / CELL); j++)
        for (let k = Math.floor(lo.z / CELL); k <= Math.floor(hi.z / CELL); k++) {
          const id = key(i, j, k); if (!grid.has(id)) grid.set(id, []); grid.get(id).push(t);
        }
  }
  const ab = new V3(), ac = new V3(), ap = new V3(), bp = new V3(), cp = new V3(), q = new V3(), c0 = new V3();
  function closest(p, a, b, c, out) {
    ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
    const d1 = ab.dot(ap), d2 = ac.dot(ap); if (d1 <= 0 && d2 <= 0) return out.copy(a);
    bp.subVectors(p, b); const d3 = ab.dot(bp), d4 = ac.dot(bp); if (d3 >= 0 && d4 <= d3) return out.copy(b);
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
    cp.subVectors(p, c); const d5 = ab.dot(cp), d6 = ac.dot(cp); if (d6 >= 0 && d5 <= d6) return out.copy(c);
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return out.copy(b).addScaledVector(q.subVectors(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    const den = 1 / (va + vb + vc); return out.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den);
  }
  // Signed distance (negative inside), exact within 5 cells, +Infinity beyond.
  function signed(p) {
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.y / CELL), ck = Math.floor(p.z / CELL);
    let best = Infinity, sign = 1; const seen = new Set();
    for (let r = 0; r <= 5; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const cell = grid.get(key(i, j, k)); if (!cell) continue;
        for (const t of cell) {
          if (seen.has(t)) continue; seen.add(t);
          closest(p, t.a, t.b, t.c, c0);
          const d = c0.distanceToSquared(p), s = t.n.dot(q.subVectors(p, c0)) < 0 ? -1 : 1;
          if (d < best - 1e-12) { best = d; sign = s; } else if (d < best + 1e-10 && s > 0) sign = 1;
        }
      }
      if (best < Infinity && Math.sqrt(best) <= r * CELL) break;
    }
    return Math.sqrt(best) * sign;
  }
  // ---- paw vertices grouped by their dominant bone; palm side from the bind pose (palm faces -y at rest)
  const mesh = vm.arms.meshes.find(m => m.name.endsWith(side));
  const bones = mesh.skeleton.bones.map(b => b.name.replace(/_[LR]$/, ''));
  const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight, position = mesh.geometry.attributes.position;
  // Bind pose: the arm points -z with the palm facing -y; the hand bone sits at the wrist.
  const wristBind = new V3().setFromMatrixPosition(new M4().copy(mesh.skeleton.boneInverses[bones.indexOf('hand')]).invert());
  const verts = [];
  for (let i = 0; i < position.count; i++) {
    let best = -1, w = 0;
    for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k); if (wk > w) { w = wk; best = skinIndex.getComponent(i, k); } }
    const bone = bones[best];
    if (bone === 'upper' || bone === 'fore') continue;
    const local = new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).sub(wristBind);
    // Only the wrist end of the forearm can reach the gun.
    if (bone === 'fore_twist' && local.z > .07) continue;
    verts.push({ i, bone, palm: bone === 'hand' && local.y < -.006 && local.z < -.012, p: new V3(), d: 0 });
  }
  const arm = side === 'L' ? vm.arms.left : vm.arms.right;
  const wrap = a => ((a % 360) + 360) % 360;
  const angle = v => wrap(Math.atan2(v.y - bore.y, v.x - bore.x) * 180 / Math.PI);
  // Distance (degrees) from an angle to a wrapping range [a, b].
  const outside = (x, [a, b]) => { a = wrap(a); b = wrap(b); const inside = a <= b ? x >= a && x <= b : x >= a || x <= b;
    if (inside) return 0; const da = Math.min(Math.abs(x - a), 360 - Math.abs(x - a)), db = Math.min(Math.abs(x - b), 360 - Math.abs(x - b)); return Math.min(da, db); };
  const build = P => {
    const [x, y, z, yaw, pitch, roll] = P;
    const f = new V3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw));
    const up = new V3(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const palm = up.applyQuaternion(new Q().setFromAxisAngle(f, roll));
    const c = i => [P[i], P[i + 1], P[i + 2]];
    return { wrist: [x, y, z], forward: [f.x, f.y, f.z], palm: [palm.x, palm.y, palm.z], pole: start.pole,
      curl: { index: c(6), middle: c(9), ring: c(12), thumb: c(15), spread: P[18] }, part: start.part };
  };
  const wristW = new V3(), elbowW = new V3(), knuckleW = new V3();
  function evaluate(P, detail = false) {
    const grip = build(P);
    vm.solveArms(model, { ...model.grips, [side]: grip }, null, null, intent.shoulders);
    vm.arms.group.updateMatrixWorld(true);
    const groups = {};
    let pen = 0;
    for (const v of verts) {
      mesh.getVertexPosition(v.i, v.p); v.p.applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(scale);
      v.d = signed(v.p);
      const g = v.palm ? 'palm' : v.bone.replace(/[0-9]$/, '') + (/[23]$/.test(v.bone) ? '' : v.bone.endsWith('1') ? '1' : '');
      const G = groups[g] ??= { min: Infinity, n: 0, sum: new V3() };
      G.min = Math.min(G.min, v.d); G.n++; G.sum.add(v.p);
      if (v.bone.endsWith('3') || v.bone.endsWith('1')) { const T = groups[v.bone] ??= { min: Infinity, n: 0, sum: new V3() }; T.min = Math.min(T.min, v.d); T.n++; T.sum.add(v.p); }
      const depth = -v.d - .0002; if (depth > 0) pen += (depth * 1000) ** 2;
    }
    const terms = { pen: pen * 2 };
    // Contact: each listed digit (segments 2-3) and the palm touch the gun.
    terms.gap = 0;
    for (const g of intent.contact ?? []) {
      const G = groups[g]; if (!G) continue;
      const gap = Math.max(0, G.min - .0008) * 1000; terms.gap += gap * gap * .6;
    }
    // Placement around the bore and along the gun.
    terms.place = 0;
    const centre = name => groups[name] ? new V3().copy(groups[name].sum).multiplyScalar(1 / groups[name].n) : null;
    const where = {};
    for (const [digit, spec] of Object.entries(intent.digits ?? {})) {
      const tip = centre(`${digit}3`), base = centre(`${digit}1`);
      if (spec.tip && tip) { const a = angle(tip), o = outside(a, spec.tip); terms.place += (o / 8) ** 2; where[`${digit}Tip`] = Math.round(a); }
      if (spec.base && base) { const a = angle(base), o = outside(a, spec.base); terms.place += (o / 8) ** 2; where[`${digit}Base`] = Math.round(a); }
    }
    const palmC = centre('palm');
    if (intent.palm && palmC) { const a = angle(palmC), o = outside(a, intent.palm); terms.place += (o / 8) ** 2; where.palm = Math.round(a); }
    const handC = new V3(); let hn = 0; for (const v of verts) if (v.bone === 'hand') { handC.add(v.p); hn++; } handC.multiplyScalar(1 / hn);
    if (intent.zone) { const o = Math.max(0, intent.zone[0] - handC.z, handC.z - intent.zone[1]) * 1000; terms.place += (o / 6) ** 2; where.z = Math.round(handC.z * 1000); }
    if (intent.thumbAlong != null) {
      const t1 = centre('thumb1'), t3 = centre('thumb3');
      const dir = new V3().subVectors(t3, t1).normalize(), a = Math.acos(Math.min(1, -dir.z)) * 180 / Math.PI;
      terms.place += (Math.max(0, a - intent.thumbAlong) / 8) ** 2; where.thumbAlong = Math.round(a);
    }
    // Wrist: the paw continues the forearm within a natural bend.
    arm.fore.bone.getWorldPosition(elbowW); arm.hand.bone.getWorldPosition(wristW);
    mesh.skeleton.bones[bones.indexOf('middle1')].getWorldPosition(knuckleW);
    const fore = new V3().subVectors(wristW, elbowW).normalize(), hand = new V3().subVectors(knuckleW, wristW).normalize();
    const bend = Math.acos(Math.max(-1, Math.min(1, fore.dot(hand)))) * 180 / Math.PI;
    terms.wrist = (Math.max(0, bend - (intent.wristBend ?? 30)) / 6) ** 2; where.bend = Math.round(bend);
    // Forearm roll relative to the elbow hinge stays inside a natural supination range.
    // Stay near the authored start (keeps a look that already works, fixing only what the other terms flag).
    terms.stay = 0;
    if (intent.stay) for (let i = 0; i < P.length; i++) terms.stay += ((P[i] - P0[i]) / (i < 3 ? .004 : .12)) ** 2 * intent.stay;
    // Named digit targets: { "index3": [x, y, z, radius] } pulls that segment's centre within the radius.
    if (intent.targets) for (const [name, [x, y, z, r, w = 1]] of Object.entries(intent.targets)) {
      const c = centre(name); if (!c) continue;
      const miss = Math.max(0, c.distanceTo(new V3(x, y, z)) - r) * 1000; terms.place += (miss / 3) ** 2 * w; where[name] = [c.x, c.y, c.z].map(n => Math.round(n * 1000));
    }
    const cost = terms.pen + terms.gap + terms.place + terms.wrist + terms.stay;
    if (!detail) return cost;
    const mins = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, +(g.min * 1000).toFixed(1)]));
    return { cost, terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, +v.toFixed(2)])), where, mins, grip };
  }
  // ---- start vector
  const f0 = new V3(...start.forward).normalize();
  const yaw0 = Math.atan2(-f0.z, f0.x), pitch0 = Math.asin(f0.y);
  const up0 = new V3(0, 1, 0).addScaledVector(f0, -f0.y).normalize(), palm0 = new V3(...start.palm).addScaledVector(f0, -new V3(...start.palm).dot(f0)).normalize();
  const roll0 = Math.atan2(new V3().crossVectors(up0, palm0).dot(f0), up0.dot(palm0));
  let P = [...start.wrist, yaw0, pitch0, roll0, ...start.curl.index, ...start.curl.middle, ...start.curl.ring, ...start.curl.thumb, start.curl.spread ?? 0];
  const P0 = [...P];
  const lock = new Set(intent.lock ?? []);
  let steps = [.006, .006, .006, .15, .1, .15, ...Array(12).fill(.2), .15];
  let best = evaluate(P), count = 1;
  const initial = evaluate(P, true);
  const lo = [-Infinity, -Infinity, -Infinity, -Infinity, -1.2, -Infinity, ...Array(12).fill(-.1), -.6];
  const hi = [Infinity, Infinity, Infinity, Infinity, 1.2, Infinity, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.4, 1.2, 1, 1.2];
  while (count < maxEvals && Math.max(...steps) > 1e-4) {
    let improved = false;
    for (let i = 0; i < P.length && count < maxEvals; i++) {
      if (lock.has(i)) continue;
      for (const dir of [1, -1]) {
        const T = [...P]; T[i] = Math.min(hi[i], Math.max(lo[i], T[i] + dir * steps[i]));
        if (T[i] === P[i]) continue;
        const c = evaluate(T); count++;
        if (c < best - 1e-9) { best = c; P = T; improved = true; steps[i] *= 1.4; break; }
      }
    }
    if (!improved) steps = steps.map(s => s * .5);
  }
  const final = evaluate(P, true);
  return { initial, final, evals: count };
}, [weapon, intent, JSON.parse(startJson ?? 'null') ?? (await page.evaluate(([w, s]) => window.__vmProbe.models[w].grips[s], [weapon, intent.side])), evals]);

const round = v => Array.isArray(v) ? v.map(round) : typeof v === 'number' ? +v.toFixed(3) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
console.log('initial', JSON.stringify({ cost: +result.initial.cost.toFixed(2), terms: result.initial.terms, where: result.initial.where }));
console.log('final  ', JSON.stringify({ cost: +result.final.cost.toFixed(2), terms: result.final.terms, where: result.final.where }), `evals ${result.evals}`);
console.log('mins   ', JSON.stringify(result.final.mins));
console.log('grip   ', JSON.stringify(round(result.final.grip)));
await browser.close();
