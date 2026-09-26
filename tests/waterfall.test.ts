import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWaterfalls } from '../src/render/waterfall';
import type { MapObject } from '../src/shared/types';

const marker: MapObject = { id: 'western-cascade', kind: 'box', detail: 'waterfall', color: '#fff',
  pos: { x: -116, y: 8, z: -9 }, scale: { x: 6, y: 16.1, z: .22 }, rotation: Math.PI / 2 };

describe('living waterfall', () => {
  it('curves out from its rotated cliff lip and reaches the water surface', () => {
    const falls = createWaterfalls({ objects: [marker] }); falls.group.updateMatrixWorld(true);
    const flow = falls.group.getObjectByName('Água em queda') as THREE.Mesh;
    const positions = flow.geometry.getAttribute('position'), uv = flow.geometry.getAttribute('uv');
    const top = new THREE.Vector3(), base = new THREE.Vector3(); let tops = 0, bases = 0;
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(flow.matrixWorld);
      if (uv.getY(i) === 0) { top.add(point); tops++; }
      if (uv.getY(i) === 1) { base.add(point); bases++; }
    }
    top.divideScalar(tops); base.divideScalar(bases);
    expect(top.y).toBeCloseTo(marker.pos.y + marker.scale.y / 2, 4);
    expect(base.y).toBeCloseTo(-.05, 4);
    expect(base.x - top.x, 'western flow must travel east into its pool').toBeGreaterThan(3);
    expect(Math.abs(base.z - top.z)).toBeLessThan(.5);
    expect(flow.geometry.index!.count / 3).toBeLessThan(2000);
    falls.dispose();
  });

  it('reduces Low geometry and spray while retaining the cascade, and releases every resource once', () => {
    const falls = createWaterfalls({ objects: [marker] });
    const scene = new THREE.Scene(); scene.add(falls.group);
    const near = falls.group.getObjectByName('Água em queda') as THREE.Mesh;
    const far = falls.group.getObjectByName('Água em queda leve') as THREE.Mesh;
    let spray!: THREE.InstancedMesh;
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    falls.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh) spray = object;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
      expect(object.castShadow).toBe(false);
    });
    falls.setQuality('low');
    expect(near.visible).toBe(false); expect(far.visible).toBe(true);
    expect(far.geometry.index!.count).toBeLessThan(near.geometry.index!.count / 2);
    expect(spray.count).toBeLessThanOrEqual(6);
    const material = near.material as THREE.ShaderMaterial;
    falls.update(12); expect(material.uniforms.uTime.value).toBe(12);
    falls.update(18, true); expect(material.uniforms.uTime.value).toBe(0);
    const disposals = new Map<object, number>();
    for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
    falls.dispose(); falls.dispose();
    expect(scene.children).toHaveLength(0);
    expect(disposals.size).toBe(resources.size);
    for (const count of disposals.values()) expect(count).toBe(1);
  });
});
