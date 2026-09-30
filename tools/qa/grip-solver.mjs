// Browser-side solver shared by one-shot and persistent weapon QA.
export function fitGrip([weapon, intent, start, maxEvals]) {
  const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder, side = intent.side;
  const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor, Q = holder.quaternion.constructor;
  vm.scene.updateMatrixWorld(true);
  const toGun = new M4().copy(holder.matrixWorld).invert(), scale = holder.scale.x;
  const bore = model.muzzle.getWorldPosition(new V3()).applyMatrix4(toGun).multiplyScalar(scale);
  // ---- gun triangles in weapon space, indexed for exact nearest queries
  const tris = [];
  model.group.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry.attributes.position) return;
    for (let parent = o; parent; parent = parent.parent) if (!parent.visible) return;
    const m = new M4().multiplyMatrices(toGun, o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    const at = i => new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m).multiplyScalar(scale);
    for (let i = 0; i < count; i += 3) {
      const a = at(i), b = at(i + 1), c = at(i + 2), n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
      if (n.lengthSq() > 1e-16) tris.push({ a, b, c, n, owner: o });
    }
  });
  function tree(list) {
    const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
    for (const t of list) { lo.min(t.a).min(t.b).min(t.c); hi.max(t.a).max(t.b).max(t.c); }
    const node = { lo, hi };
    if (list.length <= 16) return { ...node, triangles: list };
    const size = new V3().subVectors(hi, lo), axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    list.sort((a, b) => a.a[axis] + a.b[axis] + a.c[axis] - b.a[axis] - b.b[axis] - b.c[axis]);
    const mid = list.length >> 1;
    return { ...node, left: tree(list.slice(0, mid)), right: tree(list.slice(mid)) };
  }
  const root = tree([...tris]);
  // A trigger finger must contact the trigger, not a nearby frame surface.
  // Optional contactParts maps a digit segment or palm to its actual part.
  const partTrees = {};
  for (const id of new Set(Object.values(intent.contactParts ?? {}))) {
    const object = model.parts[id];
    if (!object) throw new Error(`Unknown contact part: ${id}`);
    const selected = tris.filter(t => {
      for (let o = t.owner; o; o = o.parent) if (o === object) return true;
      return false;
    });
    if (!selected.length) throw new Error(`Contact part is hidden or empty: ${id}`);
    partTrees[id] = tree(selected);
  }
  const distanceToBox = (p, node) => {
    let d = 0;
    for (const axis of ['x', 'y', 'z']) d += Math.max(0, node.lo[axis] - p[axis], p[axis] - node.hi[axis]) ** 2;
    return d;
  };
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
  // Signed distance (negative inside), exact within 40 mm, +Infinity beyond.
  function signed(p, from = root, radius = .04) {
    let best = radius ** 2, sign = 1, found = false;
    const visit = node => {
      if (distanceToBox(p, node) > best + 1e-10) return;
      if (!node.triangles) {
        const leftFirst = distanceToBox(p, node.left) <= distanceToBox(p, node.right);
        visit(leftFirst ? node.left : node.right); visit(leftFirst ? node.right : node.left);
        return;
      }
      for (const t of node.triangles) {
        closest(p, t.a, t.b, t.c, c0);
        const d = c0.distanceToSquared(p), s = t.n.dot(q.subVectors(p, c0)) < 0 ? -1 : 1;
        if (d < best - 1e-12) { best = d; sign = s; found = true; }
        else if (d < best + 1e-10 && s > 0) sign = 1;
      }
    };
    visit(from);
    return found ? Math.sqrt(best) * sign : Infinity;
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
    if (i % Math.max(1, intent.stride ?? 1)) continue;
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
    const groups = {}, partMins = {};
    let pen = 0;
    for (const v of verts) {
      mesh.getVertexPosition(v.i, v.p); v.p.applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(scale);
      v.d = signed(v.p);
      const g = v.palm ? 'palm' : v.bone.replace(/[0-9]$/, '') + (/[23]$/.test(v.bone) ? '' : v.bone.endsWith('1') ? '1' : '');
      const G = groups[g] ??= { min: Infinity, n: 0, sum: new V3() };
      G.min = Math.min(G.min, v.d); G.n++; G.sum.add(v.p);
      if (v.bone.endsWith('3') || v.bone.endsWith('1')) { const T = groups[v.bone] ??= { min: Infinity, n: 0, sum: new V3() }; T.min = Math.min(T.min, v.d); T.n++; T.sum.add(v.p); }
      const contact = v.palm && intent.contactParts?.palm ? 'palm' : v.bone;
      const part = intent.contactParts?.[contact];
      if (part) partMins[contact] = Math.min(partMins[contact] ?? Infinity, Math.abs(signed(v.p, partTrees[part], .2)));
      const depth = (intent.clearance ?? -.0002) - v.d; if (depth > 0) pen += (depth * 1000) ** 2;
    }
    const terms = { pen: pen * 2 };
    // Contact: each listed digit (segments 2-3) and the palm touch the gun.
    terms.gap = 0;
    for (const g of intent.contact ?? []) {
      const G = groups[g]; if (!G) continue;
      const gap = Math.max(0, G.min - .0008) * 1000; terms.gap += gap * gap * .6;
    }
    for (const d of Object.values(partMins)) terms.gap += (Math.max(0, d - .0008) * 1000) ** 2 * (intent.partContactWeight ?? 3);
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
    return { cost, terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, +v.toFixed(2)])), where, mins,
      ...(Object.keys(partMins).length ? { partMins: Object.fromEntries(Object.entries(partMins).map(([k, d]) => [k, +(d * 1000).toFixed(1)])) } : {}), grip };
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
  const lo = [-Infinity, -Infinity, -Infinity, -Infinity, -1.55, -Infinity, ...Array(12).fill(-.1), -.6];
  const hi = [Infinity, Infinity, Infinity, Infinity, 1.55, Infinity, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.4, 1.2, 1, 1.2];
  const began = performance.now(); let progress = 0;
  while (count < maxEvals && Math.max(...steps) > 1e-4 && performance.now() - began < (intent.maxSeconds ?? 1800) * 1000) {
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
    if (intent.coupled) {
      const attempt = T => {
        if (count >= maxEvals) return;
        for (let i = 0; i < T.length; i++) T[i] = Math.max(lo[i], Math.min(hi[i], T[i]));
        const value = evaluate(T); count++;
        if (value < best - 1e-9) { best = value; P = T; improved = true; }
      };
      // Move along the contact frame, then turn around the palm instead of
      // sweeping it through the grip when the wrist rotates.
      for (const field of ['forward', 'palm']) for (const sign of [1, -1]) {
        const g = build(P), T = [...P], step = Math.max(...steps.slice(0, 3));
        for (let j = 0; j < 3; j++) if (!lock.has(j)) T[j] += g[field][j] * step * sign;
        attempt(T);
      }
      for (const j of [3, 4, 5]) if (!lock.has(j)) for (const sign of [1, -1]) {
        const a = build(P), T = [...P]; T[j] += sign * steps[j]; const b = build(T);
        for (let k = 0; k < 3; k++) if (!lock.has(k)) T[k] += (a.forward[k] - b.forward[k]) * .05 + (a.palm[k] - b.palm[k]) * .008;
        attempt(T);
      }
      // Exchange bend between adjacent joints while keeping a fingertip seated.
      for (const j of [6, 7, 9, 10, 12, 13, 15, 16]) if (!lock.has(j) && !lock.has(j + 1)) for (const sign of [1, -1]) {
        const T = [...P], step = Math.min(steps[j], steps[j + 1]); T[j] += sign * step; T[j + 1] -= sign * step; attempt(T);
      }
    }
    if (!improved) steps = steps.map(s => s * .5);
    if (count - progress >= 200) { progress = count; console.log('fit-progress', JSON.stringify({ count, seconds: Math.round((performance.now() - began) / 1000), cost: +best.toFixed(2), grip: build(P) })); }
  }
  const final = evaluate(P, true);
  let handKey;
  if (intent.part) {
    const part = model.parts[intent.part];
    if (!part) throw new Error(`Unknown contact part: ${intent.part}`);
    const local = new M4().multiplyMatrices(toGun, part.matrixWorld).invert();
    const rotation = new Q().setFromRotationMatrix(local);
    handKey = { space: 'part', part: intent.part,
      wrist: new V3(...final.grip.wrist).applyMatrix4(local).toArray(),
      forward: new V3(...final.grip.forward).applyQuaternion(rotation).toArray(),
      palm: new V3(...final.grip.palm).applyQuaternion(rotation).toArray(), curl: final.grip.curl };
  }
  return { initial, final, evals: count, handKey };
}
