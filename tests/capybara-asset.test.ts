import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type Specular } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, Matrix4, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

let asset: Document;
beforeAll(async () => {
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/capybara/capybara.glb');
});

describe('shipped capybara asset contract', () => {
  it('keeps specular alpha off fur and the mouth, with soft reflection only on eyes and nose', () => {
    const texture = asset.getRoot().listMaterials()[0].getExtension<Specular>('KHR_materials_specular')?.getSpecularTexture();
    expect(texture).toBeDefined();
    const png = Buffer.from(texture!.getImage()!);
    expect(png.readUInt32BE(16)).toBe(16);
    expect(png[24]).toBe(8); expect(png[25]).toBe(6); // RGBA, not an RGB mask with implicit alpha 1.
    const chunks: Buffer[] = [];
    for (let at = 8; at < png.length;) {
      const length = png.readUInt32BE(at);
      if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
      at += length + 12;
    }
    const data = inflateSync(Buffer.concat(chunks)), filter = data[0], row = Uint8Array.from(data.subarray(1, 65));
    // The atlas repeats every row. On row zero, Up is zero and Paeth equals Left.
    expect(filter).toBeLessThanOrEqual(4);
    for (let i = 0; i < row.length; i++) {
      const left = i < 4 ? 0 : row[i - 4];
      row[i] = (row[i] + (filter === 1 || filter === 4 ? left : filter === 3 ? Math.floor(left / 2) : 0)) & 255;
    }
    for (let column = 0; column < 16; column++) {
      const alpha = row[column * 4 + 3];
      if (column === 9 || column === 15) { expect(alpha).toBeGreaterThan(30); expect(alpha).toBeLessThan(128); }
      else expect(alpha, `matte atlas column ${column}`).toBe(0);
    }
  });

  it('stays within the triangle, material and texture budgets with a single skin', async () => {
    const root = asset.getRoot();
    expect(root.listMeshes()).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const mesh = root.listMeshes().find(mesh => mesh.getName() === `Capybara_LOD${i}`)!;
      expect(mesh).toBeDefined();
      const triangles = mesh.listPrimitives().reduce((n, p) => n + p.getIndices()!.getCount() / 3, 0);
      expect(triangles).toBeLessThanOrEqual([15000, 5000, 1500][i]);
    }
    expect(root.listMaterials().length).toBeLessThanOrEqual(3);
    expect(root.listSkins()).toHaveLength(1);
    // Painted fur must survive export; losing COLOR_0 turns the white carrier atlas into white fur.
    const colors = root.listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0');
    expect(colors).toBeDefined();
    expect(Array.from({ length: colors!.getCount() }, (_, i) => colors!.getElement(i, [])).some(rgb => rgb.some(value => value > 0 && value < 1))).toBe(true);
    const png = root.listTextures()[0].getImage()!;
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(header.getUint32(16)).toBeLessThanOrEqual(1024);
    expect(header.getUint32(20)).toBeLessThanOrEqual(1024);
    const bytes = await readFile('public/models/capybara/capybara.glb');
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    // Uniform specular turned the dark mouth into a bright rim. Keep the authored
    // nose/eye mask in the shipped asset so fur and the cavity remain matte.
    expect(json.materials[0].extensions?.KHR_materials_specular?.specularTexture).toBeDefined();
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
          const inHead = Math.hypot(p.x, p.y - 1.6, p.z + .04) <= .25;
          const inBody = Math.hypot(p.x, p.z) <= .30 && p.y >= -.002 && p.y <= 1.42;
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

  it('keeps facial motion inside the head hitbox, including ears and mouth extremes', async () => {
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
    for (const name of [...expressions.map(name => `face_${name}`), 'idle']) {
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
            maximum = Math.max(maximum, Math.hypot(vertex.x, vertex.y - 1.6, vertex.z + .04));
          }
        }
      }
      expect(maximum, name).toBeLessThanOrEqual(.25);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  });

});
