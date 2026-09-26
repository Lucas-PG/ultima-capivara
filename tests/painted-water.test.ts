import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PaintedWater } from '../src/render/water';
import type { WorldSpec } from '../src/shared/types';

describe('painted shoreline', () => {
  it('derives depth from the rendered terrain and keeps foam only on water-crossing structures', () => {
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute('position', new THREE.Float32BufferAttribute([-1, 1, -1, 1, -.05, -1, -1, -6.05, 1, 1, -12.05, 1], 3));
    const world = { size: 2, colliders: [
      { id: 'pier', material: 'wood', min: { x: 0, y: -1, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      { id: 'dry-crate', material: 'wood', min: { x: 0, y: 1, z: 0 }, max: { x: 1, y: 2, z: 1 } },
      { id: 'ground', material: 'earth', min: { x: 0, y: -1, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    ] } as WorldSpec;
    const water = new PaintedWater(world, terrain, 8), material = water.mesh.material as THREE.ShaderMaterial;
    const depth = material.uniforms.depthField.value as THREE.DataTexture;
    const width = depth.image.width, padding = (width - 2) / 2;
    const sample = (x: number, z: number) => depth.image.data![((padding + z) * width + padding + x) * 4];
    expect([sample(0, 0), sample(1, 0), sample(0, 1), sample(1, 1)]).toEqual([0, 0, 128, 255]);
    expect(water.contacts.count).toBe(1);
    const clock = material.uniforms.uTime;
    water.update(12, false); expect(clock.value).toBe(12);
    water.update(20, true); expect(clock.value).toBe(0);
    expect(material.uniforms.uTime).toBe(clock);
    expect(depth.generateMipmaps).toBe(true); expect(depth.anisotropy).toBe(8);
    water.setQuality('low'); expect(material.uniforms.uDetail.value).toBe(0);
    water.setQuality('medium'); expect(material.uniforms.uDetail.value).toBe(1);
    let disposed = 0; depth.addEventListener('dispose', () => disposed++); water.dispose();
    expect(disposed).toBe(1);
  });
});
