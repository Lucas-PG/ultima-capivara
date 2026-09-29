// Measures how a first-person paw holds its gun on the live rig: per digit
// segment, the signed distance from the paw surface to the gun (negative =
// inside the gun), plus where each digit sits around the bore. Optional close-up
// and x-ray renders centred on the paw.
// node tools/qa/grip-probe.mjs <outDir|-> <weapon> [side L|R] ['<json: {name: override}>'] [views csv] [fp|ads]
// Views: eye, near, far, below, front, top, back (plus x-ray variants with an "x" prefix, e.g. xnear).
import { chromium } from '@playwright/test';
const [out, weapon, side = 'L', variantsJson = '{"current":{}}', viewList = '', mode = 'fp'] = process.argv.slice(2);
const variants = JSON.parse(variantsJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });

function measure([weapon, side]) {
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
    for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
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
  const c0 = new V3();
  for (const v of measured) {
    let best = Infinity, sign = 1;
    for (const [a, b, c] of near) {
      closest(v.p, a, b, c, c0);
      const d = c0.distanceToSquared(v.p);
      if (d < best - 1e-12) {
        best = d; n.subVectors(b, a).cross(ac.subVectors(c, a));
        sign = n.dot(q.subVectors(v.p, c0)) < 0 ? -1 : 1;
      } else if (d < best + 1e-10) { n.subVectors(b, a).cross(ac.subVectors(c, a)); if (n.dot(q.subVectors(v.p, c0)) >= 0) sign = 1; }
    }
    v.d = Math.sqrt(best) * sign;
    const g = groups[v.bone] ??= { n: 0, inside: 0, min: Infinity, tip: null, tipAlong: -Infinity };
    g.n++; if (v.d < -.0005) g.inside++; if (v.d < g.min) { g.min = v.d; g.at = [v.p.x, v.p.y, v.p.z].map(n => Math.round(n * 1000)); }
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
  const summary = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { min: +(g.min * 1000).toFixed(1), inside: g.inside, n: g.n, at: g.at }]));
  const centroid = measured.filter(v => v.bone === 'hand').reduce((s, v) => s.add(v.world), new V3()).multiplyScalar(1 / Math.max(1, measured.filter(v => v.bone === 'hand').length));
  return { summary, digits, bore: [bore.x, bore.y, bore.z].map(x => +(x * 1000).toFixed(0)), trianglesNear: near.length,
    centroid: [centroid.x, centroid.y, centroid.z], worst: +(Math.min(...measured.map(v => v.d)) * 1000).toFixed(1) };
}

const views = { near: [-Math.PI / 2 + .25, .15, .26], far: [Math.PI / 2 + .25, .2, .26], below: [.2, -1.1, .26], front: [Math.PI + .2, .05, .3],
  top: [.3, 1.25, .28], back: [.35, .25, .3] };
for (const [name, override] of Object.entries(variants)) {
  await page.evaluate(([w, o]) => { window.__vmTune = { [w]: o }; window.__vmOrbit = undefined; }, [weapon, override]);
  await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
  const result = await page.evaluate(measure, [weapon, side]);
  console.log(JSON.stringify({ variant: name, worst: result.worst, bore: result.bore, digits: result.digits }));
  console.log(Object.entries(result.summary).map(([k, v]) => `${k}:${v.min}${v.inside ? `(${v.inside}/${v.n} in @${v.at})` : ''}`).join('  '));
  if (out === '-' || !viewList) continue;
  for (const view of viewList.split(',')) {
    const xray = view.startsWith('x') && view !== 'eye', key = xray ? view.slice(1) : view;
    await page.evaluate(([v, target, xray, w]) => {
      window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target } : undefined;
      window.__vmProbe.models[w].group.traverse(o => {
        if (!o.isMesh) return;
        o.material.userData.xray ??= { transparent: o.material.transparent, opacity: o.material.opacity, depthWrite: o.material.depthWrite };
        const r = o.material.userData.xray;
        o.material.transparent = xray || r.transparent; o.material.opacity = xray ? .28 : r.opacity; o.material.depthWrite = xray ? false : r.depthWrite;
        o.material.needsUpdate = true;
      });
    }, [views[key] ?? null, result.centroid, xray, weapon]);
    await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/${weapon}-${name}-${view}.png` });
  }
}
await browser.close();
