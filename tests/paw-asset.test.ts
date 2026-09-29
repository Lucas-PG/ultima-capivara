import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { expect, it } from 'vitest';
import * as THREE from 'three';
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

// The forearm and paw are one fused sculpt (plus closed sleeve and claw shells):
// any open edge is a hole the camera can look into at the wrist or between digits.
it('fuses forearm and paw into one watertight skin', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read('public/models/fp/fp-arms.glb');
  for (const node of doc.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin())) {
    expect(node.getSkin()!.listJoints().some(joint => joint.getName().startsWith('fore_twist_'))).toBe(true);
    for (const primitive of node.getMesh()!.listPrimitives()) {
      const p = primitive.getAttribute('POSITION')!, index = primitive.getIndices()!;
      // Weld the UV-seam duplicates by position before counting edge uses.
      const key = (i: number) => p.getElement(i, []).map(n => Math.round(n * 20000)).join(',');
      const edges = new Map<string, number>();
      for (let i = 0; i < index.getCount(); i += 3) {
        const face = [0, 1, 2].map(j => key(index.getScalar(i + j)));
        for (let j = 0; j < 3; j++) {
          const [a, b] = [face[j], face[(j + 1) % 3]].sort();
          edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
        }
      }
      expect([...edges.values()].filter(uses => uses === 1).length, `${node.getName()} open edges`).toBe(0);
    }
  }
});

it('keeps the visible M4 trigger clear of the magazine and exports its own pivot', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read('public/models/arsenal/m4.glb');
  const bounds = (name: string) => {
    const node = doc.getRoot().listNodes().find(node => node.getName() === name)!;
    const box = new Box3();
    node.traverse(child => {
      const matrix = new Matrix4().fromArray(child.getWorldMatrix());
      for (const primitive of child.getMesh()?.listPrimitives() ?? []) {
        const p = primitive.getAttribute('POSITION')!;
        for (let i = 0; i < p.getCount(); i++) box.expandByPoint(new Vector3().fromArray(p.getElement(i, [])).applyMatrix4(matrix));
      }
    });
    return { node, box };
  };
  const trigger = bounds('m4_trigger'), mag = bounds('m4_mag');
  expect(trigger.box.min.z - mag.box.max.z).toBeGreaterThan(.018);
  expect(trigger.box.max.y - trigger.box.min.y).toBeGreaterThan(.025);
  expect(new Vector3().fromArray(trigger.node.getTranslation()).length()).toBeGreaterThan(.001);
  expect(doc.getRoot().listNodes().some(node => node.getName() === 'm4_release')).toBe(true);
});

// The arms carry their own baked sculpt maps. The `_FUR` length drives the
// shells: fur on the forearm and the back of the paw, none on pads and claws.
it('ships its own baked maps and a fur length that spares the pads, claws and cloth', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const arms = await io.read('public/models/fp/fp-arms.glb');
  for (const material of arms.getRoot().listMaterials()) {
    expect(material.getExtras()).toMatchObject({ capyArmsV3: true });
    expect(material.getBaseColorTexture()).not.toBeNull();
    expect(material.getNormalTexture()).not.toBeNull();
    expect(material.getMetallicRoughnessTexture()).not.toBeNull();
  }
  for (const mesh of arms.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    expect(primitive.getAttribute('TEXCOORD_0'), mesh.getName()).not.toBeNull();
    const fur = primitive.getAttribute('_FUR')!;
    const values = Array.from({ length: fur.getCount() }, (_, i) => fur.getScalar(i));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    // Most of the arm is furred, but a real share (sole, digit pads, claws, sleeve) is bare.
    const bare = values.filter(v => v < .02).length / values.length;
    expect(bare).toBeGreaterThan(.15); expect(bare).toBeLessThan(.7);
  }
});

it('grows fur shells only over the baked pelt', async () => {
  const { ArmsRig, FUR_SHELLS } = await import('../src/render/fp-arms');
  const scene = new THREE.Group();
  for (const side of ['R', 'L']) {
    const bones = ['upper', 'fore', 'fore_twist', 'hand', 'index1', 'index2', 'index3', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3']
      .map(name => { const bone = new THREE.Bone(); bone.name = `${name}_${side}`; return bone; });
    for (let i = 1; i < 4; i++) bones[i - 1].add(bones[i]);
    for (let i = 4; i < bones.length; i++) (i % 3 === 1 ? bones[3] : bones[i - 1]).add(bones[i]);
    scene.add(bones[0]);
    const geometry = new THREE.BoxGeometry().toNonIndexed(); geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    const count = geometry.attributes.position.count;
    // Fur on the first half of the faces only.
    geometry.setAttribute('_fur', new THREE.BufferAttribute(Float32Array.from({ length: count }, (_, i) => i < count / 2 ? 1 : 0), 1));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => i % 4 ? 0 : 1), 4));
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); material.userData = { capyArmsV3: true };
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = `arm_${side}`; mesh.bind(new THREE.Skeleton(bones)); scene.add(mesh);
  }
  const rig = new ArmsRig({ scene } as never);
  const shells: THREE.SkinnedMesh[] = [];
  rig.group.traverse(object => { if (object instanceof THREE.SkinnedMesh && object.name.endsWith('_fur')) shells.push(object); });
  expect(shells).toHaveLength(2);
  for (const shell of shells) expect(shell.geometry.index!.count).toBe(18 * FUR_SHELLS);
});
