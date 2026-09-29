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
      for (const point of points) if (Math.abs(point.z + .6) < .00002) seam.set(key(point), new Set());
      for (let i = 0; i < index.getCount(); i += 3) {
        const face = [0, 1, 2].map(j => points[index.getScalar(i + j)]);
        const before = face.some(v => v.z > -.59998), after = face.some(v => v.z < -.60002);
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

// The arms are dressed with the character's surface atlas at runtime: embedding
// a second copy would double the download and the GPU texture memory, and
// dropping the UVs would render them as flat untextured fur.
it('ships the arms without their own textures but with the UVs the shared character atlas needs', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const arms = await io.read('public/models/fp/fp-arms.glb'), character = await io.read('public/models/capybara/capybara.glb');
  expect(arms.getRoot().listTextures()).toHaveLength(0);
  for (const material of arms.getRoot().listMaterials()) expect(material.getExtras()).toMatchObject({ capySurfaceAtlas: true, sharedSurfaces: 'models/capybara/capybara.glb' });
  const surfaced = character.getRoot().listMaterials().filter(material => material.getExtras().capySurfaceAtlas && material.getBaseColorTexture());
  expect(surfaced.length).toBeGreaterThan(0);
  for (const mesh of arms.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) expect(primitive.getAttribute('TEXCOORD_0'), mesh.getName()).not.toBeNull();
});

it('binds the character surface maps onto the first-person arm materials', async () => {
  const { ArmsRig } = await import('../src/render/fp-arms');
  const texture = new THREE.Texture();
  const characterMaterial = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture });
  characterMaterial.userData.capySurfaceAtlas = true;
  const character = new THREE.Group(); character.add(new THREE.Mesh(new THREE.BoxGeometry(), characterMaterial));
  const scene = new THREE.Group();
  for (const side of ['R', 'L']) {
    const bones = ['upper', 'fore', 'fore_twist', 'hand', 'index1', 'index2', 'index3', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3']
      .map(name => { const bone = new THREE.Bone(); bone.name = `${name}_${side}`; return bone; });
    for (let i = 1; i < 4; i++) bones[i - 1].add(bones[i]);
    for (let i = 4; i < bones.length; i++) (i % 3 === 1 ? bones[3] : bones[i - 1]).add(bones[i]);
    scene.add(bones[0]);
    const material = new THREE.MeshStandardMaterial(); material.userData = { capySurfaceAtlas: true, sharedSurfaces: 'models/capybara/capybara.glb' };
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material); mesh.name = `arm_${side}`; mesh.bind(new THREE.Skeleton(bones)); scene.add(mesh);
  }
  const rig = new ArmsRig({ scene } as never, { scene: character } as never);
  const materials: THREE.MeshStandardMaterial[] = [];
  rig.group.traverse(object => { if (object instanceof THREE.SkinnedMesh) materials.push(object.material as THREE.MeshStandardMaterial); });
  expect(materials).toHaveLength(2);
  for (const material of materials) { expect(material.map).toBe(texture); expect(material.normalMap).toBe(texture); }
});
