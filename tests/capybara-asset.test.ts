import { STANDING_HIT_SHAPE } from '../src/shared/collision';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, Matrix4, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';

let asset: Document;
beforeAll(async () => {
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/capybara/capybara.glb');
});

it('keeps Redentora a budgeted stone version of the current long-headed capybara', async () => {
  const statue = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/capybara/statue.glb');
  const root = statue.getRoot();
  expect(root.listMeshes()).toHaveLength(1); expect(root.listMaterials()).toHaveLength(1);
  expect(root.listTextures()).toHaveLength(0); expect(root.listSkins()).toHaveLength(0);
  const node = root.listNodes().find(node => node.getMesh())!;
  expect(node.getExtras().characterSource).toBe('capybara_form.head + eyes + paw (v6)');
  const primitive = node.getMesh()!.listPrimitives()[0], position = primitive.getAttribute('POSITION')!;
  expect(primitive.getIndices()!.getCount() / 3).toBeLessThanOrEqual(10000);
  const transform = new Matrix4().fromArray(node.getWorldMatrix());
  const low = new Vector3(Infinity, Infinity, Infinity), high = low.clone().multiplyScalar(-1);
  const headLow = low.clone(), headHigh = high.clone();
  for (let i = 0; i < position.getCount(); i++) {
    const p = new Vector3().fromArray(position.getElement(i, [])).applyMatrix4(transform);
    low.min(p); high.max(p);
    if (p.y > 1.5) { headLow.min(p); headHigh.max(p); }
  }
  // Same feet-origin placement and arms-wide landmark silhouette, with the player's
  // long blunt muzzle and small high ears rather than the old square metaball head.
  expect(low.y).toBeCloseTo(.0015, 2); expect(high.y).toBeGreaterThan(1.79); expect(high.y).toBeLessThan(1.9);
  expect(high.x - low.x).toBeGreaterThan(1.9); expect(headLow.z).toBeLessThan(-.32);
  expect(headHigh.x - headLow.x).toBeGreaterThan(.32); expect(headHigh.z - headLow.z).toBeGreaterThan(.48);
});

describe('shipped capybara asset contract', () => {
  it('marks only the scarf and the hip cloth for the team colour, on an otherwise untinted skin', () => {
    for (const mesh of asset.getRoot().listMeshes()) {
      const primitive = mesh.listPrimitives()[0];
      const colors = primitive.getAttribute('COLOR_0')!, team = primitive.getAttribute('_TEAM')!, position = primitive.getAttribute('POSITION')!;
      expect(colors, mesh.getName()).toBeTruthy(); expect(team, mesh.getName()).toBeTruthy();
      let masked = 0;
      for (let i = 0; i < colors.getCount(); i++) {
        // Colour lives in the baked albedo; a non-white vertex colour would tint it.
        const [r, g, b] = colors.getElement(i, [0, 0, 0, 0]) as number[];
        expect(Math.min(r, g, b), `${mesh.getName()} vertex colour ${i}`).toBeGreaterThan(.99);
        if (team.getScalar(i) > .5) masked++;
      }
      // A scarf and a rag, not a recoloured body: a small share of the character takes the team hue.
      expect(masked / colors.getCount(), mesh.getName()).toBeGreaterThan(.005);
      expect(masked / colors.getCount(), mesh.getName()).toBeLessThan(.15);
      expect(position.getCount()).toBeGreaterThan(0);
    }
  });

  it('stays within the triangle, material and texture budgets with a single skin', async () => {
    const root = asset.getRoot();
    expect(root.listMeshes()).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const mesh = root.listMeshes().find(mesh => mesh.getName() === `Capybara_LOD${i}`)!;
      expect(mesh).toBeDefined();
      const triangles = mesh.listPrimitives().reduce((n, p) => n + p.getIndices()!.getCount() / 3, 0);
      expect(triangles).toBeLessThanOrEqual([50000, 10000, 2500][i]);
    }
    expect(root.listMaterials().length).toBeLessThanOrEqual(1);
    expect(root.listTextures()).toHaveLength(3);
    const surface = root.listMaterials()[0];
    expect(surface.getBaseColorTexture()).toBeTruthy();
    expect(surface.getNormalTexture()).toBeTruthy();
    expect(surface.getMetallicRoughnessTexture()).toBeTruthy();
    expect(surface.getExtras().capyCharacterV6).toBe(true);
    expect(root.listSkins()).toHaveLength(1);
    const joints = root.listSkins()[0].listJoints().map(joint => joint.getName());
    for (const side of ['L', 'R']) {
      const digits = joints.filter(name => /^paw_(index|middle|ring|thumb)[1-3]_/.test(name) && name.endsWith(side));
      expect(digits).toHaveLength(12);
    }
    // The skin colour lives in the baked albedo; COLOR_0 must exist and stay white, since the
    // material multiplies it (a missing stream would render the character black).
    const colors = root.listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0');
    expect(colors).toBeDefined();
    expect(Array.from({ length: colors!.getCount() }, (_, i) => colors!.getElement(i, [])).every(rgb => rgb.slice(0, 3).every(value => value > .99))).toBe(true);
    const bytes = await readFile('public/models/capybara/capybara.glb');
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
  });

  it('fits the normal standing hit shapes in every decoded LOD, except weapon arms', () => {
    for (const node of asset.getRoot().listNodes().filter(node => node.getMesh())) {
      const skin = node.getSkin()!, joints = skin.listJoints(), inverse = skin.getInverseBindMatrices()!;
      const transforms = joints.map((joint, i) => new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(inverse.getElement(i, []))));
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const positions = primitive.getAttribute('POSITION')!, indices = primitive.getAttribute('JOINTS_0')!, weights = primitive.getAttribute('WEIGHTS_0')!;
        let smoothlyWeighted = 0;
        for (let i = 0; i < positions.getCount(); i++) {
          const ids = indices.getElement(i, []), w = weights.getElement(i, []), p = new Vector3();
          let armWeight = 0, influences = 0;
          expect(w.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 2);
          for (let j = 0; j < 4; j++) if (w[j] > 0) {
            p.add(new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(transforms[ids[j]]).multiplyScalar(w[j]));
            if (/arm|paw/.test(joints[ids[j]].getName())) armWeight += w[j];
            influences++;
          }
          if (influences > 1) smoothlyWeighted++;
          if (armWeight > 0) continue;
          const shape = STANDING_HIT_SHAPE;
          // One centimetre of slack for decimation rounding; shots use the analytic volumes.
          const inHead = Math.hypot(p.x, p.y - shape.headY, p.z - shape.headZ) <= shape.headR + .012;
          const inBody = Math.hypot(p.x, p.z) <= shape.bodyR + .012 && p.y >= -.002 && p.y <= shape.bodyTop + .012;
          expect(inHead || inBody, `${node.getName()} vertex ${i}: ${p.toArray()}`).toBe(true);
        }
        expect(smoothlyWeighted).toBeGreaterThan(20);
      }
    }
  });

  it('ships real idle, run, jump motion and eyelid scaling on the same armature', () => {
    const root = asset.getRoot();
    const names = root.listSkins()[0].listJoints().map(joint => joint.getName());
    for (const name of ['spine', 'neck', 'head', 'jaw', 'tail', 'ear_L', 'ear_R', 'paw_L', 'paw_R', 'foot_L', 'foot_R']) expect(names).toContain(name);
    for (const name of ['idle', 'run', 'jump']) {
      const animation = root.listAnimations().find(clip => clip.getName() === name)!;
      expect(animation).toBeDefined();
      expect(animation.listSamplers().some(s => s.getInput()!.getCount() > 3)).toBe(true);
    }
    const idle = root.listAnimations().find(clip => clip.getName() === 'idle')!;
    const blink = idle.listChannels().find(channel => channel.getTargetNode()?.getName() === 'blink_L' && channel.getTargetPath() === 'scale')!;
    expect(blink).toBeDefined();
    const scale = blink.getSampler()!.getOutput()!;
    expect(Array.from(scale.getArray()!).some(value => value < .1)).toBe(true);
  });

  it('includes the complete directional and action clip contract without root travel', () => {
    const names = ['walk', 'strafe_l', 'strafe_r', 'backpedal', 'crouch_idle', 'crouch_walk', 'crouch_back', 'crouch_strafe_l', 'crouch_strafe_r', 'fall', 'land', 'reload_tp', 'death'];
    for (const name of names) {
      const clip = asset.getRoot().listAnimations().find(animation => animation.getName() === name);
      expect(clip, name).toBeDefined();
      if (name === 'crouch_idle') {
        // Meshopt removes redundant samples from the quiet breath. Check its
        // actual expansion instead of tying the contract to a sample count.
        const breath = clip!.listChannels().find(c => c.getTargetNode()?.getName() === 'belly' && c.getTargetPath() === 'scale');
        expect(breath).toBeDefined();
        const values = breath!.getSampler()!.getOutput()!;
        const widths = Array.from({ length: values.getCount() }, (_, i) => values.getElement(i, [])[0]);
        expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(.005);
      } else expect(clip!.listSamplers().some(s => s.getInput()!.getCount() >= 8), name).toBe(true);
      if (name === 'death') continue;
      for (const channel of clip!.listChannels()) {
        if (channel.getTargetNode()?.getName() !== 'root' || channel.getTargetPath() !== 'translation') continue;
        const positions = channel.getSampler()!.getOutput()!;
        for (let i = 1; i < positions.getCount(); i++) expect(positions.getElement(i, []), name).toEqual(positions.getElement(0, []));
      }
    }
  });

  it('keeps social clips in place for the host-owned emote durations and closes every loop', () => {
    const expected = { wave: [3, false], dance: [8, true], victory: [4, false], sit: [12, true], chill: [12, true] } as const;
    for (const [name, [seconds, loop]] of Object.entries(expected)) {
      const clip = asset.getRoot().listAnimations().find(animation => animation.getName() === name);
      expect(clip, name).toBeDefined();
      const duration = Math.max(...clip!.listSamplers().map(sampler => {
        const time = sampler.getInput()!;
        return time.getScalar(time.getCount() - 1);
      }));
      expect(duration, name).toBeCloseTo(seconds, 4);
      for (const channel of clip!.listChannels()) {
        const values = channel.getSampler()!.getOutput()!, first = values.getElement(0, []);
        if (channel.getTargetNode()?.getName() === 'root') {
          for (let i = 1; i < values.getCount(); i++) {
            for (const [j, value] of values.getElement(i, []).entries()) expect(value, `${name} fixed root`).toBeCloseTo(first[j], 5);
          }
        }
        if (loop) {
          const last = values.getElement(values.getCount() - 1, []);
          // q and -q encode the same orientation; compare the shorter distance.
          const sign = channel.getTargetPath() === 'rotation' && first.reduce((sum, value, j) => sum + value * last[j], 0) < 0 ? -1 : 1;
          last.forEach((value, j) => expect(value * sign, `${name} loop seam`).toBeCloseTo(first[j], 4));
        }
      }
      if (name === 'sit' || name === 'chill') {
        const lowering = clip!.listChannels().find(channel => channel.getTargetNode()?.getName() === 'spine' && channel.getTargetPath() === 'translation');
        expect(lowering, `${name} authored seated pose`).toBeDefined();
      }
    }
  });

  it('plants the authored emote feet at the actor contact surface', async () => {
    const bytes = await readFile('public/models/capybara/capybara.glb');
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
    let gltf;
    try {
      gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    } finally { vi.unstubAllGlobals(); }
    const mesh = gltf.scene.getObjectByName('Capybara_LOD0') as SkinnedMesh;
    const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const feet = [[], []] as number[][];
    for (let i = 0; i < indices.count; i++) {
      for (let j = 0; j < 4; j++) {
        const joint = mesh.skeleton.bones[indices.getComponent(i, j)].name;
        if (weights.getComponent(i, j) > .9 && (joint === 'foot_L' || joint === 'foot_R')) feet[joint === 'foot_L' ? 0 : 1].push(i);
      }
    }
    expect(feet.every(vertices => vertices.length > 20)).toBe(true);
    const mixer = new AnimationMixer(gltf.scene), vertex = new Vector3();
    for (const name of ['wave', 'dance', 'victory', 'sit', 'chill']) {
      const clip = gltf.animations.find(clip => clip.name === name)!;
      mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
      for (let sample = 0; sample < 16; sample++) {
        mixer.setTime(clip.duration * sample / 16); gltf.scene.updateMatrixWorld(true); mesh.skeleton.update();
        const bottoms = feet.map(vertices => {
          let bottom = Infinity;
          for (const index of vertices) {
            mesh.getVertexPosition(index, vertex); vertex.applyMatrix4(mesh.matrixWorld);
            bottom = Math.min(bottom, vertex.y);
          }
          return bottom;
        });
        expect(Math.min(...bottoms), `${name} feet cannot sink below the contact plane`).toBeGreaterThanOrEqual(-.03);
        expect(Math.min(...bottoms), `${name} keeps a foot planted`).toBeLessThanOrEqual(.04);
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  });

  it('keeps faces and locomotion inside the head hitbox, including ears and mouth extremes', async () => {
    const bytes = await readFile('public/models/capybara/capybara.glb');
    // Image decoding is unnecessary for CPU skinning; the real exported meshes,
    // skeleton, quantization and animation tracks are used without a GPU.
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', async () => ({ width: 16, height: 16, close() {} }));
    let gltf;
    try {
      gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    } finally { vi.unstubAllGlobals(); }
    const meshes: SkinnedMesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof SkinnedMesh) meshes.push(object); });
    const mixer = new AnimationMixer(gltf.scene), vertex = new Vector3();
    const expressions = ['neutral', 'determined', 'hit', 'stunned', 'victory', 'blink'];
    for (const name of [...expressions.map(name => `face_${name}`), 'idle', 'walk', 'strafe_l', 'backpedal', 'run', 'jump']) {
      const clip = gltf.animations.find(clip => clip.name === name)!;
      expect(clip, name).toBeDefined();
      mixer.stopAllAction(); mixer.clipAction(clip).play();
      let maximum = 0;
      for (let sample = 0; sample < 8; sample++) {
        mixer.setTime(clip.duration * sample / 8); gltf.scene.updateMatrixWorld(true);
        for (const mesh of meshes) {
          mesh.skeleton.update();
          const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          for (let i = 0; i < indices.count; i++) {
            let headWeight = 0;
            for (let j = 0; j < 4; j++) {
              const joint = mesh.skeleton.bones[indices.getComponent(i, j)];
              if (/^(head|jaw|ear_|blink_|socket_|glint_|brow_|mouth_)/.test(joint.name)) headWeight += weights.getComponent(i, j);
            }
            if (headWeight < .5) continue;
            mesh.getVertexPosition(i, vertex); vertex.applyMatrix4(mesh.matrixWorld);
            maximum = Math.max(maximum, Math.hypot(vertex.x, vertex.y - STANDING_HIT_SHAPE.headY, vertex.z - STANDING_HIT_SHAPE.headZ));
          }
        }
      }
      expect(maximum, name).toBeLessThanOrEqual(STANDING_HIT_SHAPE.headR + .012);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  });

});

// Shots at a crouched capybara use the standing shapes scaled by 1.3 / 1.8 about the feet, so
// the visible crouched head must sit where that smaller head sphere is.
it('crouches its head into the crouched head volume', async () => {
  const bytes = await readFile('public/models/capybara/capybara.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 16, height: 16, close() {} }));
  let gltf;
  try {
    gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  } finally { vi.unstubAllGlobals(); }
  gltf.scene.updateMatrixWorld(true);
  const head = gltf.scene.getObjectByName('head')!;
  const shape = STANDING_HIT_SHAPE, k = 1.3 / 1.8;
  // The standing head centre, carried by the head bone.
  const local = head.worldToLocal(new Vector3(0, shape.headY, shape.headZ));
  const mixer = new AnimationMixer(gltf.scene);
  for (const name of ['crouch_idle', 'crouch_walk', 'crouch_back', 'crouch_strafe_l', 'crouch_strafe_r']) {
    const clip = gltf.animations.find(clip => clip.name === name)!;
    mixer.stopAllAction(); mixer.clipAction(clip).play();
    for (let sample = 0; sample < 6; sample++) {
      mixer.setTime(clip.duration * sample / 6); gltf.scene.updateMatrixWorld(true);
      const centre = head.localToWorld(local.clone());
      const target = new Vector3(0, shape.headY * k, shape.headZ * k);
      expect(centre.distanceTo(target), `${name} ${sample}`).toBeLessThan(shape.headR * k * .4);
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
});
