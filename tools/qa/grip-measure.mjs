// Signed skin-to-weapon clearance used by still and motion reviews. Distances are millimetres.
// options.surface selects a named moving part or body; options.bones selects actual skin groups.
// Omitting both preserves the whole-paw collision scan. A contact scan must still be paired with it.
export function measureGrip([weapon, side, opposingPaw = false, options = {}]) {
  const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder;
  vm.scene.updateMatrixWorld(true);
  const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor;
  const toGun = new M4().copy(holder.matrixWorld).invert();
  const scale = holder.scale.x;
  // A virtual world paw is cropped at the wrist. Close only its containment
  // volume; appended cap triangles never count as rendered contact surfaces.
  const closeBoundary = window.__qaCloseContactBoundary ??= geometry => {
    if (!geometry.userData.qaCloseContactBoundary || geometry.userData.qaContactTriangleCount !== undefined) return;
    const position = geometry.attributes.position, index = geometry.index;
    const count = index ? index.count : position.count;
    const triangles = Array.from({ length: count }, (_, i) => index ? index.getX(i) : i);
    const welded = [], points = new Map(), edges = new Map();
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e7)).join(',');
      if (!points.has(key)) points.set(key, i);
      welded[i] = points.get(key);
    }
    for (let i = 0; i < count; i += 3) for (let k = 0; k < 3; k++) {
      const a = welded[triangles[i + k]], b = welded[triangles[i + (k + 1) % 3]];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
    }
    const outgoing = new Map();
    for (const edge of edges.values()) if (edge.count === 1) {
      if (outgoing.has(edge.a)) throw new Error('Ambiguous cropped contact boundary');
      outgoing.set(edge.a, edge.b);
    }
    while (outgoing.size) {
      const first = outgoing.keys().next().value, loop = [first];
      let current = first;
      do {
        const next = outgoing.get(current);
        if (next === undefined) throw new Error('Unclosed cropped contact boundary');
        outgoing.delete(current); current = next;
        if (current !== first) loop.push(current);
      } while (current !== first);
      for (let i = 1; i + 1 < loop.length; i++) triangles.push(loop[0], loop[i + 1], loop[i]);
    }
    geometry.userData.qaContactTriangleCount = count / 3;
    geometry.setIndex(triangles);
  };
  for (const mesh of vm.arms.meshes) closeBoundary(mesh.geometry);
  // Arsenal exports merge disjoint primitive solids into a single mesh. Weld UV-split positions
  // and follow shared edges to classify each closed component separately. The topology is static.
  const components = window.__qaSolidComponents ??= geometry => {
    const position = geometry.attributes.position, index = geometry.index, cached = geometry.userData.qaSolidTopology;
    if (cached?.position === position && cached?.index === index) return cached;
    const count = (index ? index.count : position.count) / 3, parent = new Uint32Array(count);
    for (let i = 0; i < count; i++) parent[i] = i;
    const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const points = new Map(), welded = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e7)).join(',');
      if (!points.has(key)) points.set(key, points.size);
      welded[i] = points.get(key);
    }
    const edges = new Map();
    for (let triangle = 0; triangle < count; triangle++) {
      const vertices = [0, 1, 2].map(k => welded[index ? index.getX(triangle * 3 + k) : triangle * 3 + k]);
      for (let k = 0; k < 3; k++) {
        const a = vertices[k], b = vertices[(k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (edges.has(key)) parent[root(triangle)] = root(edges.get(key)); else edges.set(key, triangle);
      }
    }
    const groups = new Map(), labels = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const component = root(i); if (!groups.has(component)) groups.set(component, groups.size);
      labels[i] = groups.get(component);
    }
    return geometry.userData.qaSolidTopology = { position, index, labels, count: groups.size };
  };
  let nextSolid = 0;
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
    const topology = components(o.geometry), solidBase = nextSolid; nextSolid += topology.count;
    const at = i => (o.isSkinnedMesh ? o.getVertexPosition(idx ? idx.getX(i) : i, new V3()) : new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i)).applyMatrix4(m).multiplyScalar(scale);
    for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2), o.name, solidBase + topology.labels[i / 3], i / 3 < (o.geometry.userData.qaContactTriangleCount ?? Infinity)]);
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
    let palm = false;
    if (bone === 'hand') {
      const rest = mesh.bindPalmPosition ? mesh.bindPalmPosition(i, new V3()) :
        new V3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.bindMatrix).sub(wristBind);
      palm = rest.y < -.006 && rest.z < -.012;
    }
    const wrap = /^(index|middle|ring)[23]$/.test(bone);
    if (options.region === 'palm' && !palm || options.region === 'wrap' && !wrap) continue;
    mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(scale);
    const world = new V3(); mesh.getVertexPosition(i, world); world.applyMatrix4(mesh.matrixWorld);
    pts.push({ bone, palm, wrap, p: p.clone(), world });
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
  const near = tris.filter(([a, b, c, , , contact]) => contact && Math.max(a.x, b.x, c.x) > lo.x && Math.min(a.x, b.x, c.x) < hi.x && Math.max(a.y, b.y, c.y) > lo.y &&
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
      for (const [a, b, c, , solid] of node.triangles) {
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
        if (distance > 1e-8) hits.push([distance, det < 0 ? 1 : -1, solid]);
      }
    };
    visit(volumeRoot); hits.sort((a, b) => a[0] - b[0]);
    const winding = new Map();
    for (let i = 0; i < hits.length;) {
      const distance = hits[i][0], signs = new Map();
      do { const [, sign, solid] = hits[i++]; signs.set(solid, (signs.get(solid) ?? 0) + sign); } while (i < hits.length && hits[i][0] - distance < 1e-7);
      for (const [solid, sign] of signs) winding.set(solid, (winding.get(solid) ?? 0) + Math.sign(sign));
    }
    return new Set([...winding].filter(([, count]) => count !== 0).map(([solid]) => solid));
  };
  const distanceToBox = (p, node) => {
    let d = 0;
    for (const axis of ['x', 'y', 'z']) d += Math.max(0, node.min[axis] - p[axis], p[axis] - node.max[axis]) ** 2;
    return d;
  };
  const c0 = new V3();
  let nearestSurfaceDistance = Infinity, nearestSurface;
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
    // A face-restricted contact is a Euclidean distance to that face. Its sign cannot come from
    // a different side of the solid: a permitted side graze may be centimetres behind the front.
    if (best < nearestSurfaceDistance) {
      nearestSurfaceDistance = best;
      nearestSurface = { bone: v.bone, at: v.p.toArray().map(n => +(n * 1000).toFixed(3)),
        surfaceAt: v.closest?.toArray().map(n => +(n * 1000).toFixed(3)), part: v.part };
    }
    // A closer positive face from an overlapping part must never hide penetration into another.
    // Classify each rendered solid, then retain the deepest containing solid's signed clearance.
    const inside = distanceToBox(v.p, surfaceBounds) > 0 ? new Set() : insideSurface(v.p);
    sign = inside.size ? -1 : 1;
    if (inside.size && !desiredNormal) {
      const depths = new Map([...inside].map(solid => [solid, Infinity]));
      const contacts = new Map();
      const inspect = node => {
        if (distanceToBox(v.p, node) > Math.max(...depths.values()) + 1e-10) return;
        if (!node.triangles) { inspect(node.left); inspect(node.right); return; }
        for (const [a, b, c, part, solid, contact] of node.triangles) if (contact && inside.has(solid)) {
          closest(v.p, a, b, c, c0);
          const d = c0.distanceToSquared(v.p);
          if (d < depths.get(solid)) {
            depths.set(solid, d); contacts.set(solid, { closest: c0.clone(), normal: n.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().clone(), part });
          }
        }
      };
      inspect(volumeRoot);
      const [solid, depth] = [...depths].sort((a, b) => b[1] - a[1])[0];
      best = depth; Object.assign(v, contacts.get(solid));
    }
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
  const regions = Object.fromEntries(['palm', 'wrap'].map(region => [region, +(Math.min(...measured.filter(v => v[region]).map(v => v.d)) * 1000).toFixed(3)]));
  return { summary, digits, regions, nearestSurfaceDistance: +(Math.sqrt(nearestSurfaceDistance) * 1000).toFixed(3), nearestSurface, bore: [bore.x, bore.y, bore.z].map(x => +(x * 1000).toFixed(0)), trianglesNear: near.length,
    centroid: [centroid.x, centroid.y, centroid.z], worst: +(Math.min(...measured.map(v => v.d)) * 1000).toFixed(3) };
}
