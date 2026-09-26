import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { SUPPLY_CANOPY_HEIGHT } from '../src/shared/supply-drops';

let asset: Document;
beforeAll(async () => {
  asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/supply-drop/supply-drop.glb');
});

function vertices(node: Node) {
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  const position = node.getMesh()!.listPrimitives()[0].getAttribute('POSITION')!;
  return Array.from({ length: position.getCount() }, (_, i) => new Vector3().fromArray(position.getElement(i, [])).applyMatrix4(matrix));
}

describe('painted supply drop asset contract', () => {
  it('ships all nine independently cloneable LOD roots with actual preload bytes and one painted material', async () => {
    const nodes = asset.getRoot().listNodes();
    for (const kind of ['carrier', 'crate', 'chute']) for (let lod = 0; lod < 3; lod++) {
      const node = nodes.find(node => node.getName() === `drop_${kind}_LOD${lod}`)!;
      expect(node?.getMesh()).toBeTruthy();
      expect(node.getExtras().front).toBe('+Z');
    }
    expect(asset.getRoot().listMaterials()).toHaveLength(1);
    expect(asset.getRoot().listMaterials()[0].getBaseColorTexture()).toBeTruthy();
    expect(asset.getRoot().listMaterials()[0].getMetallicRoughnessTexture()).toBeTruthy();
    const metrics = JSON.parse(await readFile('public/models/supply-drop/metrics.json', 'utf8'));
    const bytes = await readFile('public/models/supply-drop/supply-drop.glb');
    expect(metrics.bytes).toBe(bytes.byteLength);
    expect(metrics.bytes).toBeLessThan(1024 * 1024);
    for (const lod of [0, 1, 2]) {
      const triangles = nodes.filter(node => node.getName().endsWith(`_LOD${lod}`)).reduce((sum, node) => sum + node.getMesh()!.listPrimitives().reduce((sum, p) => sum + p.getIndices()!.getCount() / 3, 0), 0);
      expect(triangles).toBeLessThanOrEqual([6000, 3200, 1300][lod]);
    }
  });

  it('keeps the crate on its bottom-centred landing root and inside the approved clear footprint at every LOD', () => {
    for (const lod of [0, 1, 2]) {
      const node = asset.getRoot().listNodes().find(node => node.getName() === `drop_crate_LOD${lod}`)!;
      const bounds = new Box3().setFromPoints(vertices(node));
      expect(bounds.min.y).toBeCloseTo(0, 3);
      expect(bounds.max.y).toBeLessThanOrEqual(.782);
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThanOrEqual(.477);
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThanOrEqual(.427);
      expect(vertices(node).every(p => Math.hypot(p.x, p.z) < .65)).toBe(true);
    }
  });

  it('faces the balloon outward and renders both sides of the parachute cloth without disabling culling', () => {
    for (const lod of [0, 1, 2]) {
      const carrier = asset.getRoot().listNodes().find(node => node.getName() === `drop_carrier_LOD${lod}`)!;
      const points = vertices(carrier), indices = carrier.getMesh()!.listPrimitives()[0].getIndices()!;
      let outward = 0, inward = 0;
      for (let i = 0; i < indices.getCount(); i += 3) {
        const [a, b, c] = [0, 1, 2].map(offset => points[indices.getScalar(i + offset)]);
        const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        if (center.y < 2.1 || center.y > 6.5) continue;
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        const facing = normal.dot(new Vector3(center.x, 0, center.z));
        if (facing > .000001) outward++;
        else if (facing < -.000001) inward++;
      }
      expect(outward).toBeGreaterThan(50);
      expect(inward).toBe(0);
      const chute = asset.getRoot().listNodes().find(node => node.getName() === `drop_chute_LOD${lod}`)!;
      expect(new Box3().setFromPoints(vertices(chute)).max.y).toBeLessThanOrEqual(SUPPLY_CANOPY_HEIGHT);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(vertices(chute).flatMap(v => v.toArray()), 3));
      geometry.setIndex(Array.from(chute.getMesh()!.listPrimitives()[0].getIndices()!.getArray()!));
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.updateMatrixWorld();
      for (const [height, direction] of [[4, -1], [2, 1]]) {
        const hits = new Raycaster(new Vector3(.23, height, .12), new Vector3(0, direction, 0)).intersectObject(mesh);
        expect(hits.length, `LOD${lod} visible cloth from ${height}`).toBeGreaterThan(0);
      }
      geometry.dispose(); mesh.material.dispose();
    }
  });
});
