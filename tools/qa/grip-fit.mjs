// Fits a first-person paw grip to an explicit intent on the live rig (VITE_QA=1 dev server).
// The cost adds skin penetration into the gun, contact gaps per digit, where each
// digit sits around the bore, the paw's place along the gun and the wrist bend
// against the forearm. Pattern search from a start grip; prints the fitted spec.
// Batch: node tools/qa/grip-fit.mjs --batch <jobs.json> (one browser, sequential fits).
// Jobs may include tune (live view spec) and capture (output directory for eye/near/below/top views).
// node tools/qa/grip-fit.mjs <weapon> '<intent json>' ['<start grip json>'] [--evals N] [--fp|--ads]
// Intent (degrees around the bore: 0 right, 90 top, 180 left, 270 bottom; ranges may wrap):
//   { "side": "L", "zone": [zMin, zMax], "digits": { "index": { "tip": [a, b], "base": [a, b], "along": 80, "weight": 1 }, ... },
//     "part": "mag", "partOffset": [0, .15, 0],
//     "axisOrigin": [x, y, z], // Optional grip axis, e.g. the pump below the barrel.
//     "contactParts": { "thumb": "mag" }, "palmFacing": [x, y, z, maxDegrees],
//     "palm": [a, b], "thumbAlong": deg, "wristBend": deg, "contact": ["palm", "index", ...],
//     "curlBounds": { "index": [[min, max], [min, max], [min, max]], "spread": [min, max] } }
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { measure } from './weapon-contact.mjs';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const batchFile = flag('--batch');
const evals = +(flag('--evals') ?? 1500);
const mode = args.includes('--ads') ? 'ads' : 'fp';
const [weapon, intentJson, startJson] = args.filter(a => !a.startsWith('--'));
const jobs = batchFile ? JSON.parse(await readFile(batchFile, 'utf8')) : [{ weapon, intent: JSON.parse(intentJson), start: startJson ? JSON.parse(startJson) : undefined }];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'log') console.log(m.text()); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
try {
  for (const job of jobs) {
    const { weapon, intent } = job;
    console.log(`job ${job.name ?? weapon}`);
    await page.evaluate(([w, tune]) => { window.__vmTune = tune ? { [w]: tune } : undefined; }, [weapon, job.tune]);
    await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
    if (intent.motion) await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [weapon, ...intent.motion]);

    const result = await page.evaluate(([weapon, intent, start, maxEvals]) => {
      const vm = window.__vmProbe, model = vm.models[weapon], holder = vm.holder, side = intent.side;
      const M4 = holder.matrixWorld.constructor, V3 = holder.position.constructor, Q = holder.quaternion.constructor;
      if (intent.partOffset && intent.part) {
        model.parts[intent.part].position.add(new V3(...intent.partOffset));
        model.parts[intent.part].visible = true;
      }
      vm.scene.updateMatrixWorld(true);
      if (intent.part === 'bolt') vm.boltHand = 0;
      const reference = intent.part ? model.parts[intent.part] : holder;
      const toGun = new M4().copy(reference.matrixWorld).invert(), scale = holder.scale.x;
      const partToGun = new M4().copy(holder.matrixWorld).invert().multiply(reference.matrixWorld);
      const partRotation = new Q().setFromRotationMatrix(partToGun);
      const asWeaponGrip = grip => intent.part ? { ...grip, part: undefined,
        wrist: new V3(...grip.wrist).applyMatrix4(partToGun).toArray(),
        forward: new V3(...grip.forward).applyQuaternion(partRotation).toArray(),
        palm: new V3(...grip.palm).applyQuaternion(partRotation).toArray() } : grip;
      const bore = intent.axisOrigin ? new V3(...intent.axisOrigin).multiplyScalar(scale) : model.muzzle.getWorldPosition(new V3()).applyMatrix4(toGun).multiplyScalar(scale);
      // ---- gun triangles in weapon space, bucketed in a grid for nearest queries
      const tris = [], partTris = {};
      model.group.traverse(o => {
        if (!o.isMesh || o.isSkinnedMesh || !o.geometry.attributes.position) return;
        for (let parent = o; parent; parent = parent.parent) if (!parent.visible) return;
        const m = new M4().multiplyMatrices(toGun, o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index;
        const count = idx ? idx.count : pos.count;
        const at = i => new V3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m).multiplyScalar(scale);
        for (let i = 0; i < count; i += 3) {
          const a = at(i), b = at(i + 1), c = at(i + 2), n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
          if (n.lengthSq() > 1e-16) {
            const triangle = { a, b, c, n }; tris.push(triangle);
            for (const part of new Set(Object.values(intent.contactParts ?? {}))) {
              for (let ancestor = o; ancestor; ancestor = ancestor.parent) if (ancestor === model.parts[part]) {
                (partTris[part] ??= []).push(triangle); break;
              }
            }
          }
        }
      });
      // A static BVH avoids thousands of string-key grid lookups for each skin
      // vertex on every candidate. Nearest triangle and sign remain exact.
      const buildTree = items => {
        const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
        for (const t of items) { lo.min(t.a).min(t.b).min(t.c); hi.max(t.a).max(t.b).max(t.c); }
        if (items.length <= 8) return { lo, hi, items };
        const extent = hi.clone().sub(lo), axis = extent.x > extent.y && extent.x > extent.z ? 'x' : extent.y > extent.z ? 'y' : 'z';
        items.sort((a, b) => (a.a[axis] + a.b[axis] + a.c[axis]) - (b.a[axis] + b.b[axis] + b.c[axis]));
        const mid = items.length >> 1;
        return { lo, hi, left: buildTree(items.slice(0, mid)), right: buildTree(items.slice(mid)) };
      };
      const tree = buildTree(tris), partTrees = Object.fromEntries(Object.entries(partTris).map(([name, triangles]) => [name, buildTree(triangles)]));
      console.log(`Fit ready: ${tris.length} triangles`);
      const bound = (p, node) => {
        const x = Math.max(0, node.lo.x - p.x, p.x - node.hi.x), y = Math.max(0, node.lo.y - p.y, p.y - node.hi.y), z = Math.max(0, node.lo.z - p.z, p.z - node.hi.z);
        return x * x + y * y + z * z;
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
      function signed(p, root = tree) {
        let best = Infinity, sign = 1;
        const stack = [root];
        while (stack.length) {
          const node = stack.pop();
          if (bound(p, node) > best + 1e-10) continue;
          if (node.items) {
            for (const t of node.items) {
              closest(p, t.a, t.b, t.c, c0);
              const d = c0.distanceToSquared(p), s = t.n.dot(q.subVectors(p, c0)) < 0 ? -1 : 1;
              if (d < best - 1e-12) { best = d; sign = s; } else if (d < best + 1e-10 && s > 0) sign = 1;
            }
          } else if (bound(p, node.left) < bound(p, node.right)) stack.push(node.right, node.left);
          else stack.push(node.left, node.right);
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
      const stride = Math.max(1, intent.stride ?? 1);
      for (let i = 0; i < position.count; i++) {
        let best = -1, w = 0;
        for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k); if (wk > w) { w = wk; best = skinIndex.getComponent(i, k); } }
        const bone = bones[best];
        if (bone === 'upper' || bone === 'fore') continue;
        const local = new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).sub(wristBind);
        // The full distal forearm can cross a grip during magazine and catch work.
        if (i % stride) continue;
        verts.push({ i, bone, palm: bone === 'hand' && local.y < -.006 && local.z < -.012, p: new V3(), d: 0,
          bind: new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix),
          influences: Array.from({ length: 4 }, (_, k) => [skinIndex.getComponent(i, k) * 16, skinWeight.getComponent(i, k)]).filter(([, weight]) => weight > 0) });
      }
      // Match SkinnedMesh.applyBoneTransform, caching the per-bone matrices once
      // per candidate instead of multiplying them again for every skin vertex.
      const skinToGun = new M4().copy(toGun).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
      const skinCheck = new V3();
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
        vm.solveArms(model, { ...model.grips, [side]: asWeaponGrip(grip) }, null, null, intent.shoulders ?? window.__vmTune?.[weapon]?.shoulders);
        vm.arms.group.updateMatrixWorld(true);
        mesh.skeleton.update();
        const boneMatrices = mesh.skeleton.boneMatrices;
        const groups = {};
        let pen = 0;
        for (const v of verts) {
          const { x, y, z } = v.bind;
          let px = 0, py = 0, pz = 0;
          for (const [m, weight] of v.influences) {
            px += weight * (boneMatrices[m] * x + boneMatrices[m + 4] * y + boneMatrices[m + 8] * z + boneMatrices[m + 12]);
            py += weight * (boneMatrices[m + 1] * x + boneMatrices[m + 5] * y + boneMatrices[m + 9] * z + boneMatrices[m + 13]);
            pz += weight * (boneMatrices[m + 2] * x + boneMatrices[m + 6] * y + boneMatrices[m + 10] * z + boneMatrices[m + 14]);
          }
          v.p.set(px, py, pz).applyMatrix4(skinToGun).multiplyScalar(scale);
          if (detail) {
            mesh.getVertexPosition(v.i, skinCheck); skinCheck.applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(scale);
            if (skinCheck.distanceTo(v.p) > 1e-6) throw new Error('Cached skin pose differs from Three.js by more than one micrometre');
          }
          v.d = signed(v.p);
          const g = v.palm ? 'palm' : v.bone.replace(/[0-9]$/, '') + (/[23]$/.test(v.bone) ? '' : v.bone.endsWith('1') ? '1' : '');
          const G = groups[g] ??= { min: Infinity, n: 0, sum: new V3() };
          G.min = Math.min(G.min, v.d); G.n++; G.sum.add(v.p);
          const contactTree = partTrees[intent.contactParts?.[g]];
          if (contactTree) G.contact = Math.min(G.contact ?? Infinity, Math.abs(signed(v.p, contactTree)));
          if (v.bone.endsWith('3') || v.bone.endsWith('1')) { const T = groups[v.bone] ??= { min: Infinity, n: 0, sum: new V3() }; T.min = Math.min(T.min, v.d); T.n++; T.sum.add(v.p); }
          const depth = (intent.clearance ?? .0008) - v.d; if (depth > 0) pen += (depth * 1000) ** 2;
        }
        const terms = { pen: pen * 2 };
        // Contact: each listed digit (segments 2-3) and the palm touch the gun.
        terms.gap = 0;
        for (const g of intent.contact ?? []) {
          const G = groups[g]; if (!G) continue;
          const gap = Math.max(0, (G.contact ?? G.min) - .0008) * 1000; terms.gap += gap * gap * .6;
        }
        // Placement around the bore and along the gun.
        terms.place = 0;
        if (intent.palmFacing) {
          const normal = new V3(...grip.palm).normalize(), desired = new V3(...intent.palmFacing.slice(0, 3)).normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, normal.dot(desired)))) * 180 / Math.PI;
          terms.place += (Math.max(0, angle - (intent.palmFacing[3] ?? 12)) / 4) ** 2;
        }
        const centre = name => groups[name] ? new V3().copy(groups[name].sum).multiplyScalar(1 / groups[name].n) : null;
        const where = {};
        for (const [digit, spec] of Object.entries(intent.digits ?? {})) {
          const tip = centre(`${digit}3`), base = centre(`${digit}1`);
          const weight = spec.weight ?? 1;
          if (spec.tip && tip) { const a = angle(tip), o = outside(a, spec.tip); terms.place += (o / 8) ** 2 * weight; where[`${digit}Tip`] = Math.round(a); }
          if (spec.base && base) { const a = angle(base), o = outside(a, spec.base); terms.place += (o / 8) ** 2 * weight; where[`${digit}Base`] = Math.round(a); }
          if (spec.along != null && tip && base) {
            const dir = new V3().subVectors(tip, base).normalize();
            const a = Math.acos(Math.max(-1, Math.min(1, -dir.z))) * 180 / Math.PI;
            terms.place += (Math.max(0, a - spec.along) / 8) ** 2 * weight; where[`${digit}Along`] = Math.round(a);
          }
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
      const lo = [-Infinity, -Infinity, -Infinity, -Infinity, -1.2, -Infinity, ...Array(12).fill(-.1), -.6];
      const hi = [Infinity, Infinity, Infinity, Infinity, 1.2, Infinity, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.7, 1.7, 1.3, 1.4, 1.2, 1, 1.2];
      for (const [finger, offset] of Object.entries({ index: 6, middle: 9, ring: 12, thumb: 15 }))
        for (const [joint, range] of (intent.curlBounds?.[finger] ?? []).entries()) if (range) [lo[offset + joint], hi[offset + joint]] = range;
      if (intent.curlBounds?.spread) [lo[18], hi[18]] = intent.curlBounds.spread;
      P = P.map((x, i) => Math.min(hi[i], Math.max(lo[i], x)));
      let best = evaluate(P), count = 1, stalled = 0;
      const initial = evaluate(P, true);
      while (count < maxEvals && Math.max(...steps) > 1e-4) {
        let improved = false;
        for (let i = 0; i < P.length && count < maxEvals; i++) {
          if (lock.has(i)) continue;
          let moved = false;
          for (const dir of [1, -1]) {
            const T = [...P]; T[i] = Math.min(hi[i], Math.max(lo[i], T[i] + dir * steps[i]));
            if (T[i] === P[i]) continue;
            const c = evaluate(T); count++;
            if (c < best - 1e-9) { best = c; P = T; improved = moved = true; steps[i] *= 1.15; break; }
          }
          if (!moved) steps[i] = Math.max(i < 3 ? .00006 : .0006, steps[i] * .55);
        }
        stalled = improved ? 0 : stalled + 1;
        if (stalled >= 8) break;
        console.log(`fit ${count}/${maxEvals} cost ${best.toFixed(2)}`);
      }
      const final = evaluate(P, true);
      return { initial, final, evals: count };
    }, [weapon, intent, job.start ?? (await page.evaluate(([w, s]) => window.__vmProbe.models[w].grips[s], [weapon, intent.side])), job.evals ?? evals]);

    const round = v => Array.isArray(v) ? v.map(round) : typeof v === 'number' ? +v.toFixed(6) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
    console.log('initial', JSON.stringify({ cost: +result.initial.cost.toFixed(2), terms: result.initial.terms, where: result.initial.where }));
    console.log('final  ', JSON.stringify({ cost: +result.final.cost.toFixed(2), terms: result.final.terms, where: result.final.where }), `evals ${result.evals}`);
    console.log('mins   ', JSON.stringify(result.final.mins));
    console.log('grip   ', JSON.stringify(round(result.final.grip)));
    if (job.output) await writeFile(job.output, JSON.stringify(result, null, 2) + '\n');
    if (job.capture && !intent.part) {
      await mkdir(job.capture, { recursive: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
      const tune = { ...job.tune, grips: { ...job.tune?.grips, [intent.side]: result.final.grip } };
      await page.evaluate(([w, tune]) => { window.__vmTune = { [w]: tune }; window.__vmOrbit = undefined; }, [weapon, tune]);
      await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
      const contact = await page.evaluate(measure, [weapon, intent.side]);
      await writeFile(`${job.capture}/${job.name ?? weapon}-probe.json`, JSON.stringify(contact, null, 2) + '\n');
      for (const [name, view] of Object.entries({ eye: null, near: [-Math.PI / 2 + .25, .15, .26], below: [.2, -1.1, .26], top: [.3, 1.25, .28] })) {
        await page.evaluate(([v, target]) => { window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target } : undefined; }, [view, contact.centroid]);
        await page.evaluate(p => window.__capyQA.pose(p), `${job.mode ?? mode}-${weapon}`);
        await page.screenshot({ path: `${job.capture}/${job.name ?? weapon}-${name}.png` });
      }
      await page.evaluate(() => { window.__vmOrbit = undefined; });
    }
  }
} finally { await browser.close(); }
