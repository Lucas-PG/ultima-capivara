import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
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
      expect(triangles, id).toBeLessThanOrEqual(40000);
      for (const part of ['body', 'right_paw', 'muzzle', 'eject', 'sight', 'legendary']) expect(names.has(`${id}_${part}`), `${id}/${part}`).toBe(true);
      expect(names.has(`${id}_left_paw`), id).toBe(id !== 'machete');
    }
  });

  it('keeps reload-part aliases at identity under the existing weapon groups', () => {
    for (const id of ['pistol', 'smg', 'm4', 'dmr', 'sniper']) {
      for (const role of ['mag', id === 'pistol' ? 'slide' : 'bolt', 'grip_l']) {
        const node = asset.getRoot().listNodes().find(node => node.getName() === `${id}_${role}`);
        expect(node, `${id}/${role}`).toBeDefined();
        expect(node!.getExtras().partRole).toBe(role);
        expect(node!.getTranslation()).toEqual([0, 0, 0]);
        expect(node!.getRotation()).toEqual([0, 0, 0, 1]);
        expect(node!.listChildren().length).toBeGreaterThan(0);
      }
    }
  });

  it('uses painted colour and roughness atlases with baked contact shading', () => {
    const materials = asset.getRoot().listMaterials();
    expect(materials).toHaveLength(1);
    expect(materials[0].getMetallicFactor()).toBe(0);
    expect(materials[0].getRoughnessFactor()).toBeGreaterThanOrEqual(.85);
    expect(materials[0].getNormalTexture()?.getSize()).toEqual([1024, 1024]);
    expect(materials[0].getMetallicRoughnessTexture()).toBeDefined();
    expect(materials[0].getBaseColorTexture()).toBeDefined();
    expect(asset.getRoot().listTextures()).toHaveLength(4);
    expect(materials[0].getBaseColorTexture()?.getSize()).toEqual([1024, 1024]);
    for (const mesh of asset.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) expect(p.getAttribute('COLOR_0')).toBeDefined();
    expect(materials[0].getEmissiveTexture()?.getSize()).toEqual([32, 32]);
    for (const channel of materials[0].getEmissiveFactor()) expect(channel).toBeCloseTo(.35, 6);
  });

  it('exports articulated finger pivots for the four first-person hero grips', () => {
    for (const id of ['pistol', 'smg', 'm4', 'shotgun']) for (const role of ['trigger_finger', 'grip_fingers']) {
      const node = asset.getRoot().listNodes().find(node => node.getName() === `${id}_${role}`);
      expect(node, `${id}/${role}`).toBeDefined();
      expect(node!.getExtras().partRole).toBe(role);
      expect(node!.getTranslation()).toEqual([0, 0, 0]);
      expect(node!.getRotation()).toEqual([0, 0, 0, 1]);
      expect(node!.listChildren().some(child => !!child.getMesh())).toBe(true);
    }
  });

  it('restricts the emissive atlas column to the machete blade, never paws or other weapons', () => {
    let edgeVertices = 0;
    for (const node of asset.getRoot().listNodes()) {
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      for (const primitive of node.getMesh()?.listPrimitives() || []) {
        const uv = primitive.getAttribute('TEXCOORD_0')!, positions = primitive.getAttribute('POSITION')!;
        for (let i = 0; i < uv.getCount(); i++) {
          if (Math.floor(uv.getElement(i, [])[0] * 32) !== 24) continue;
          edgeVertices++;
          expect(node.getName()).toBe('machete_body_mesh');
          const vertex = new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(matrix);
          // The blade starts above the wooden guard; the grip and paws sit below it.
          expect(vertex.y).toBeGreaterThanOrEqual(.019);
          expect(vertex.y).toBeLessThanOrEqual(.603);
          expect(Math.abs(vertex.z)).toBeLessThanOrEqual(.013);
        }
      }
    }
    expect(edgeVertices).toBeGreaterThan(0);
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
