// Signed skin-to-weapon clearance used by still and motion reviews. Distances are millimetres.
export function measureGrip([weapon, side]) {
  const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder;
  vm.scene.updateMatrixWorld(true);
  const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor;
  const toGun = new M4().copy(holder.matrixWorld).invert();
  const scale = holder.scale.x;
  // Gun triangles in weapon space (metres at scale 1).
  const tris = [];
  model.group.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.visible || !o.geometry.attributes.position) return;
    let hidden = false; for (let p = o; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const m = new M4().multiplyMatrices(toGun, o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    const at = i => new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m).multiplyScalar(scale);
    for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2), o.name]);
  });
  const mesh = vm.arms.meshes.find(m => m.name.endsWith(side));
  const bones = mesh.skeleton.bones.map(b => b.name.replace(/_[LR]$/, ''));
  const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
  const count = mesh.geometry.attributes.position.count;
  const groups = {}, pts = [];
  const p = new V3();
  for (let i = 0; i < count; i++) {
    let best = -1, w = 0;
    for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k); if (wk > w) { w = wk; best = skinIndex.getComponent(i, k); } }
    const bone = bones[best];
    mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(scale);
    const world = new V3(); mesh.getVertexPosition(i, world); world.applyMatrix4(mesh.matrixWorld);
    pts.push({ bone, p: p.clone(), world });
  }
  // Closest point on a triangle (Ericson).
  const ab = new V3(), ac = new V3(), ap = new V3(), bp = new V3(), cp = new V3(), q = new V3(), n = new V3();
  function closest(pt, a, b, c, out) {
    ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(pt, a);
    const d1 = ab.dot(ap), d2 = ac.dot(ap); if (d1 <= 0 && d2 <= 0) return out.copy(a);
    bp.subVectors(pt, b); const d3 = ab.dot(bp), d4 = ac.dot(bp); if (d3 >= 0 && d4 <= d3) return out.copy(b);
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
    cp.subVectors(pt, c); const d5 = ab.dot(cp), d6 = ac.dot(cp); if (d6 >= 0 && d5 <= d6) return out.copy(c);
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return out.copy(b).addScaledVector(q.subVectors(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    const den = 1 / (va + vb + vc); return out.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den);
  }
  // Only the paw and the wrist end of the forearm are measured.
  const measured = pts.filter(v => v.bone !== 'upper' && v.bone !== 'fore');
  const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
  for (const v of measured) { lo.min(v.p); hi.max(v.p); }
  lo.subScalar(.03); hi.addScalar(.03);
  const near = tris.filter(([a, b, c]) => Math.max(a.x, b.x, c.x) > lo.x && Math.min(a.x, b.x, c.x) < hi.x && Math.max(a.y, b.y, c.y) > lo.y &&
    Math.min(a.y, b.y, c.y) < hi.y && Math.max(a.z, b.z, c.z) > lo.z && Math.min(a.z, b.z, c.z) < hi.z);
  // A median BVH keeps the full-vertex pass exact while avoiding a scan of
  // every weapon triangle for every skin vertex. Bounds only prune surfaces
  // farther than the closest triangle already found, including tie tolerance.
  const bounds = list => {
    const min = new V3(Infinity, Infinity, Infinity), max = new V3(-Infinity, -Infinity, -Infinity);
    for (const t of list) for (let i = 0; i < 3; i++) { min.min(t[i]); max.max(t[i]); }
    return { min, max };
  };
  function tree(list) {
    const node = bounds(list);
    if (list.length <= 16) return { ...node, triangles: list };
    const size = new V3().subVectors(node.max, node.min);
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    list.sort((a, b) => a[0][axis] + a[1][axis] + a[2][axis] - b[0][axis] - b[1][axis] - b[2][axis]);
    const mid = list.length >> 1;
    return { ...node, left: tree(list.slice(0, mid)), right: tree(list.slice(mid)) };
  }
  const root = tree([...near]);
  const distanceToBox = (p, node) => {
    let d = 0;
    for (const axis of ['x', 'y', 'z']) d += Math.max(0, node.min[axis] - p[axis], p[axis] - node.max[axis]) ** 2;
    return d;
  };
  const c0 = new V3();
  for (const v of measured) {
    let best = Infinity, sign = 1;
    const visit = node => {
      if (distanceToBox(v.p, node) > best + 1e-10) return;
      if (!node.triangles) {
        const leftFirst = distanceToBox(v.p, node.left) <= distanceToBox(v.p, node.right);
        visit(leftFirst ? node.left : node.right); visit(leftFirst ? node.right : node.left);
        return;
      }
      for (const [a, b, c, part] of node.triangles) {
        closest(v.p, a, b, c, c0);
        const d = c0.distanceToSquared(v.p);
        if (d < best - 1e-12) {
          best = d; v.part = part; n.subVectors(b, a).cross(ac.subVectors(c, a));
          sign = n.dot(q.subVectors(v.p, c0)) < 0 ? -1 : 1;
        } else if (d < best + 1e-10) { n.subVectors(b, a).cross(ac.subVectors(c, a)); if (n.dot(q.subVectors(v.p, c0)) >= 0) sign = 1; }
      }
    };
    visit(root);
    v.d = Math.sqrt(best) * sign;
    const g = groups[v.bone] ??= { n: 0, inside: 0, min: Infinity, tip: null, tipAlong: -Infinity };
    g.n++; if (v.d < -.0005) g.inside++; if (v.d < g.min) { g.min = v.d; g.part = v.part; g.at = [v.p.x, v.p.y, v.p.z].map(n => Math.round(n * 1000)); }
  }
  // Around the bore: 0 = right (+x), 90 = top, 180 = left, -90 = bottom.
  const bore = model.muzzle.getWorldPosition(new V3()).applyMatrix4(toGun).multiplyScalar(scale);
  const angle = v => Math.round(Math.atan2(v.y - bore.y, v.x - bore.x) * 180 / Math.PI);
  const digits = {};
  for (const f of ['index', 'middle', 'ring', 'thumb']) {
    const tip = measured.filter(v => v.bone === `${f}3`), base = measured.filter(v => v.bone === `${f}1`);
    if (!tip.length) continue;
    const avg = list => list.reduce((s, v) => s.add(v.p), new V3()).multiplyScalar(1 / list.length);
    const t = avg(tip), b = avg(base);
    digits[f] = { base: [+(b.x * 1000).toFixed(0), +(b.y * 1000).toFixed(0), +(b.z * 1000).toFixed(0)], baseAngle: angle(b),
      tip: [+(t.x * 1000).toFixed(0), +(t.y * 1000).toFixed(0), +(t.z * 1000).toFixed(0)], tipAngle: angle(t) };
  }
  const summary = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { min: +(g.min * 1000).toFixed(1), inside: g.inside, n: g.n, at: g.at, part: g.part }]));
  const centroid = measured.filter(v => v.bone === 'hand').reduce((s, v) => s.add(v.world), new V3()).multiplyScalar(1 / Math.max(1, measured.filter(v => v.bone === 'hand').length));
  return { summary, digits, bore: [bore.x, bore.y, bore.z].map(x => +(x * 1000).toFixed(0)), trianglesNear: near.length,
    centroid: [centroid.x, centroid.y, centroid.z], worst: +(Math.min(...measured.map(v => v.d)) * 1000).toFixed(1) };
}
