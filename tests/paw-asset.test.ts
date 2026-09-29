import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';

it('ships four articulated digits per paw without skin influence leaking between fingers', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const path of ['public/models/fp/fp-arms.glb', 'public/models/capybara/capybara.glb']) {
    const doc = await io.read(path);
    for (const node of doc.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin())) {
      const names = node.getSkin()!.listJoints().map(joint => joint.getName());
      const digits = new Set<string>();
      for (const p of node.getMesh()!.listPrimitives()) {
        const joints = p.getAttribute('JOINTS_0')!, weights = p.getAttribute('WEIGHTS_0')!;
        for (let i = 0; i < joints.getCount(); i++) {
          const w = weights.getElement(i, []), ids = joints.getElement(i, []);
          const active = ids.filter((_, j) => w[j] > .01).map(id => names[id]);
          const fingers = active.map(name => name.match(/^(?:paw_)?(index|middle|ring|thumb)[1-3]_([LR])$/)).filter(Boolean);
          if (!fingers.length) continue;
          const finger = fingers[0]!, key = `${finger[1]}_${finger[2]}`;
          digits.add(key);
          for (const match of fingers) expect(`${match![1]}_${match![2]}`, `${path}: ${node.getName()} vertex ${i}`).toBe(key);
          for (const name of active) expect(name === `hand_${finger[2]}` || name === `paw_${finger[2]}` || /(?:index|middle|ring|thumb)[1-3]_/.test(name)).toBe(true);
          expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
        }
      }
      // Far LOD may deliberately drop subpixel digits; close views must retain all four.
      if (!node.getName().includes('LOD2')) expect(digits.size).toBe(path.includes('/fp/') ? 4 : 8);
    }
  }
});

it('exports one continuous wrist loop without an internal cap or unconnected palm edge', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read('public/models/fp/fp-arms.glb');
  for (const node of doc.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin())) {
    expect(node.getSkin()!.listJoints().some(joint => joint.getName().startsWith('fore_twist_'))).toBe(true);
    const skin = node.getSkin()!, inverse = skin.getInverseBindMatrices()!;
    const bindMatrices = skin.listJoints().map((joint, i) => new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(inverse.getElement(i, []))));
    for (const primitive of node.getMesh()!.listPrimitives()) {
      const p = primitive.getAttribute('POSITION')!, index = primitive.getIndices()!;
      const joints = primitive.getAttribute('JOINTS_0')!, weights = primitive.getAttribute('WEIGHTS_0')!;
      const points = Array.from({ length: p.getCount() }, (_, i) => {
        const v = new Vector3().fromArray(p.getElement(i, [])), ids = joints.getElement(i, []), w = weights.getElement(i, []), result = new Vector3();
        for (let j = 0; j < 4; j++) if (w[j]) result.addScaledVector(v.clone().applyMatrix4(bindMatrices[ids[j]]), w[j]);
        return result;
      });
      const seam = new Map<string, Set<string>>();
      const key = (v: Vector3) => v.toArray().map(n => Math.round(n * 100000)).join(',');
      for (const point of points) if (Math.abs(point.z + .447) < .00002) seam.set(key(point), new Set());
      for (let i = 0; i < index.getCount(); i += 3) {
        const face = [0, 1, 2].map(j => points[index.getScalar(i + j)]);
        const before = face.some(v => v.z > -.44698), after = face.some(v => v.z < -.44702);
        for (const v of face) {
          const sides = seam.get(key(v));
          if (sides) { if (before) sides.add('forearm'); if (after) sides.add('palm'); }
        }
        expect(face.every(v => seam.has(key(v))), 'no internal wrist cap').toBe(false);
      }
      expect(seam.size).toBe(32);
      for (const sides of seam.values()) expect([...sides].sort()).toEqual(['forearm', 'palm']);
    }
  }
});

it('keeps the visible M4 trigger clear of the magazine and exports its own pivot', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read('public/models/arsenal/m4.glb');
  const bounds = (name: string) => {
    const node = doc.getRoot().listNodes().find(node => node.getName() === name)!;
    const box = new Box3(), matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()!.listPrimitives()) {
      const p = primitive.getAttribute('POSITION')!;
      for (let i = 0; i < p.getCount(); i++) box.expandByPoint(new Vector3().fromArray(p.getElement(i, [])).applyMatrix4(matrix));
    }
    return { node, box };
  };
  const trigger = bounds('m4_trigger'), mag = bounds('m4_mag');
  expect(trigger.box.min.z - mag.box.max.z).toBeGreaterThan(.018);
  expect(trigger.box.max.y - trigger.box.min.y).toBeGreaterThan(.025);
  expect(new Vector3().fromArray(trigger.node.getTranslation()).length()).toBeGreaterThan(.001);
  expect(doc.getRoot().listNodes().some(node => node.getName() === 'm4_release')).toBe(true);
});
