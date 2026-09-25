import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PAINTED_WEAPON_IDS } from '../src/render/painted-weapons';

let asset: Document;
beforeAll(async () => {
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/weapons/painted-weapons.glb');
});

describe('painted weapons shipped asset contract', () => {
  it('includes eight complete weapons under the combined weapon and paw budget', () => {
    for (const id of PAINTED_WEAPON_IDS) {
      const root = asset.getRoot().listNodes().find(node => node.getName() === id)!;
      expect(root, id).toBeDefined();
      let triangles = 0;
      const names = new Set<string>();
      const visit = (node: Node) => {
        names.add(node.getName());
        for (const primitive of node.getMesh()?.listPrimitives() || []) triangles += primitive.getIndices()!.getCount() / 3;
        node.listChildren().forEach(visit);
      };
      visit(root);
      expect(triangles, id).toBeGreaterThan(500);
      expect(triangles, id).toBeLessThanOrEqual(10000);
      for (const part of ['body', 'right_paw', 'muzzle', 'eject', 'sight', 'legendary']) expect(names.has(`${id}_${part}`), `${id}/${part}`).toBe(true);
      expect(names.has(`${id}_left_paw`), id).toBe(id !== 'machete');
    }
  });

  it('uses a shared painted atlas without photographic surface maps', () => {
    const materials = asset.getRoot().listMaterials();
    expect(materials).toHaveLength(1);
    expect(materials[0].getMetallicFactor()).toBe(0);
    expect(materials[0].getRoughnessFactor()).toBeGreaterThanOrEqual(.85);
    expect(materials[0].getNormalTexture()).toBeNull();
    expect(materials[0].getMetallicRoughnessTexture()).toBeNull();
    expect(materials[0].getBaseColorTexture()).toBeDefined();
    expect(asset.getRoot().listTextures()).toHaveLength(2);
    expect(materials[0].getEmissiveTexture()?.getSize()).toEqual([32, 32]);
    for (const channel of materials[0].getEmissiveFactor()) expect(channel).toBeCloseTo(.35, 6);
  });

  it('puts firearm muzzle anchors ahead of the receiver and keeps sight anchors centred', () => {
    for (const id of PAINTED_WEAPON_IDS.filter(id => !['machete', 'slingshot'].includes(id))) {
      const muzzle = asset.getRoot().listNodes().find(node => node.getName() === `${id}_muzzle`)!;
      const sight = asset.getRoot().listNodes().find(node => node.getName() === `${id}_sight`)!;
      const m = muzzle.getWorldTranslation(), s = sight.getWorldTranslation();
      expect(Math.abs(m[0]), id).toBeLessThan(.001);
      expect(m[2], id).toBeLessThan(-.25);
      expect(Math.abs(s[0]), id).toBeLessThan(.001);
      expect(s[1], id).toBeGreaterThan(0);
    }
  });
});
