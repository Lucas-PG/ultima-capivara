// Signed skin-to-weapon clearance used by still and motion reviews. Distances are millimetres.
// options.surface selects a named moving part or body; options.bones selects actual skin groups.
// Omitting both preserves the whole-paw collision scan. A contact scan must still be paired with it.
export function measureGrip([weapon, side, opposingPaw = false, options = {}]) {
  const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder;
  vm.scene.updateMatrixWorld(true);
  const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor;
  const toGun = new M4().copy(holder.matrixWorld).invert();
  const scale = holder.scale.x;
  // Gun triangles in weapon space (metres at scale 1).
  const tris = [];
  const surface = opposingPaw ? vm.arms.meshes.find(m => m.name.endsWith(side === 'R' ? 'L' : 'R')) :
    options.surface ? model.parts[options.surface] ?? model.group.getObjectByName(`${weapon}_${options.surface}`) : model.group;
  if (!surface) throw new Error(`Missing contact surface ${weapon}/${options.surface}`);
  surface.traverse(o => {
    if (!o.isMesh || (!opposingPaw && o.isSkinnedMesh) || !o.visible || !o.geometry.attributes.position) return;
    let hidden = false; for (let p = o; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const m = new M4().multiplyMatrices(toGun, o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    const at = i => (o.isSkinnedMesh ? o.getVertexPosition(idx ? idx.getX(i) : i, new V3()) : new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i)).applyMatrix4(m).multiplyScalar(scale);
    for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2), o.name]);
  });
  const mesh = vm.arms.meshes.find(m => m.name.endsWith(side));
  const bones = mesh.skeleton.bones.map(b => b.name.replace(/_[LR]$/, ''));
  const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
  const count = mesh.geometry.attributes.position.count;
  const wristIndex = bones.indexOf('hand');
  const wristBind = wristIndex >= 0 ? new V3().setFromMatrixPosition(new M4().copy(mesh.skeleton.boneInverses[wristIndex]).invert()) : new V3();
  const groups = {}, pts = [];
  const p = new V3();
  for (let i = 0; i < count; i++) {
    let best = -1, w = 0;
    for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k); if (wk > w) { w = wk; best = skinIndex.getComponent(i, k); } }
    const bone = bones[best];
    if (bone === 'upper' || bone === 'fore' || (options.bones && !options.bones.includes(bone))) continue;
    if (options.region === 'palm') {
      const rest = mesh.bindPalmPosition ? mesh.bindPalmPosition(i, new V3()) :
        new V3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.bindMatrix).sub(wristBind);
      if (bone !== 'hand' || rest.y >= -.006 || rest.z >= -.012) continue;
    }
    if (options.region === 'wrap' && !/^(index|middle|ring)[23]$/.test(bone)) continue;
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
  const measured = pts.filter(v => v.bone !== 'upper' && v.bone !== 'fore' && (!options.bones || options.bones.includes(v.bone)));
  if (!measured.length) throw new Error(`No skin vertices for ${weapon}/${side} contact`);
  const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
  for (const v of measured) { lo.min(v.p); hi.max(v.p); }
  lo.subScalar(.03); hi.addScalar(.03);
  const desiredNormal = options.normal ? new V3(...options.normal).normalize() : null;
  const near = tris.filter(([a, b, c]) => Math.max(a.x, b.x, c.x) > lo.x && Math.min(a.x, b.x, c.x) < hi.x && Math.max(a.y, b.y, c.y) > lo.y &&
    Math.min(a.y, b.y, c.y) < hi.y && Math.max(a.z, b.z, c.z) > lo.z && Math.min(a.z, b.z, c.z) < hi.z &&
    (!desiredNormal || n.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().dot(desiredNormal) >= (options.minNormalDot ?? .5)));
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
  const surfaceBounds = bounds(tris);
  let volumeRoot;
  const insideSurface = point => {
    // Oriented ray crossings reject a distant, inward-facing nearest normal.
    // Signed counts also preserve the union of overlapping pads or gun parts.
    volumeRoot ??= tree([...tris]);
    const direction = { x: 1, y: .37139, z: .69479 }, hits = [];
    const visit = node => {
      let enter = 0, leave = Infinity;
      for (const axis of ['x', 'y', 'z']) {
        enter = Math.max(enter, (node.min[axis] - point[axis]) / direction[axis]);
        leave = Math.min(leave, (node.max[axis] - point[axis]) / direction[axis]);
      }
      if (leave < enter) return;
      if (!node.triangles) { visit(node.left); visit(node.right); return; }
      for (const [a, b, c] of node.triangles) {
        const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
        const fx = c.x - a.x, fy = c.y - a.y, fz = c.z - a.z;
        const hx = direction.y * fz - direction.z * fy, hy = direction.z * fx - fz, hz = fy - direction.y * fx;
        const det = ex * hx + ey * hy + ez * hz;
        if (Math.abs(det) < 1e-12) continue;
        const sx = point.x - a.x, sy = point.y - a.y, sz = point.z - a.z;
        const u = (sx * hx + sy * hy + sz * hz) / det;
        if (u < -1e-8 || u > 1 + 1e-8) continue;
        const qx = sy * ez - sz * ey, qy = sz * ex - sx * ez, qz = sx * ey - sy * ex;
        const v = (qx + direction.y * qy + direction.z * qz) / det;
        if (v < -1e-8 || u + v > 1 + 1e-8) continue;
        const distance = (fx * qx + fy * qy + fz * qz) / det;
        if (distance > 1e-8) hits.push([distance, det < 0 ? 1 : -1]);
      }
    };
    visit(volumeRoot); hits.sort((a, b) => a[0] - b[0]);
    let winding = 0;
    for (let i = 0; i < hits.length;) {
      const distance = hits[i][0]; let sign = 0;
      do { sign += hits[i++][1]; } while (i < hits.length && hits[i][0] - distance < 1e-7);
      winding += Math.sign(sign);
    }
    return winding !== 0;
  };
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
          best = d; v.part = part; v.closest = c0.clone(); n.subVectors(b, a).cross(ac.subVectors(c, a)); v.normal = n.clone().normalize();
          sign = n.dot(q.subVectors(v.p, c0)) < 0 ? -1 : 1;
        } else if (d < best + 1e-10) { n.subVectors(b, a).cross(ac.subVectors(c, a)); if (n.dot(q.subVectors(v.p, c0)) >= 0) sign = 1; }
      }
    };
    visit(root);
    if (sign < 0 && (distanceToBox(v.p, surfaceBounds) > 0 || !insideSurface(v.p))) sign = 1;
    v.d = Math.sqrt(best) * sign;
    const g = groups[v.bone] ??= { n: 0, inside: 0, contact: 0, min: Infinity, tip: null, tipAlong: -Infinity };
    g.n++; if (v.d < -.0005) g.inside++; if (v.d >= -.0005 && v.d <= .0015) g.contact++;
    if (v.d < g.min) { g.min = v.d; g.part = v.part; g.at = [v.p.x, v.p.y, v.p.z].map(n => +(n * 1000).toFixed(3));
      g.surfaceAt = v.closest?.toArray().map(n => +(n * 1000).toFixed(3)); g.normalAt = v.normal?.toArray().map(n => +n.toFixed(3)); }
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
    digits[f] = { base: base.length ? [b.x, b.y, b.z].map(n => +(n * 1000).toFixed(3)) : null, baseAngle: base.length ? angle(b) : null,
      tip: [t.x, t.y, t.z].map(n => +(n * 1000).toFixed(3)), tipAngle: angle(t) };
  }
  const summary = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { min: +(g.min * 1000).toFixed(3), inside: g.inside, contact: g.contact, n: g.n, at: g.at, surfaceAt: g.surfaceAt, normalAt: g.normalAt, part: g.part }]));
  const centroid = measured.filter(v => v.bone === 'hand').reduce((s, v) => s.add(v.world), new V3()).multiplyScalar(1 / Math.max(1, measured.filter(v => v.bone === 'hand').length));
  return { summary, digits, bore: [bore.x, bore.y, bore.z].map(x => +(x * 1000).toFixed(0)), trianglesNear: near.length,
    centroid: [centroid.x, centroid.y, centroid.z], worst: +(Math.min(...measured.map(v => v.d)) * 1000).toFixed(3) };
}
