import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { readFile } from 'node:fs/promises';

let asset: Document;
beforeAll(async () => {
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/capybara/capybara.glb');
});

describe('shipped capybara asset contract', () => {
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
    const png = root.listTextures()[0].getImage()!;
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(header.getUint32(16)).toBeLessThanOrEqual(1024);
    expect(header.getUint32(20)).toBeLessThanOrEqual(1024);
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
});
