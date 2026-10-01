import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FUR_LEVELS, FUR_RANGE, FUR_SHELLS, attachFurShells, furShellLevels, updateFurShells } from '../src/render/capybara-fur';

// A two-triangle pelt on one bone: enough for the shell builder (it needs an index, a `_fur` mask
// and skinning to read bind-pose positions).
function pelt(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0, .1, 1, 0, 0, 1.1, 0, .1, 1.1, 0]), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]), 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(16), 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setAttribute('_fur', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1]), 1));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
  return mesh;
}

describe('close-range fur shells', () => {
  it('draws every layer up close and a spread-out subset further away, always inner to outer', () => {
    const levels = furShellLevels(pelt())!;
    expect(levels).toHaveLength(FUR_LEVELS.length);
    expect(FUR_LEVELS[0].layers).toHaveLength(FUR_SHELLS);
    levels.forEach((geometry, level) => {
      const index = geometry.index!, shell = geometry.getAttribute('furShell');
      // Two triangles per drawn layer.
      expect(index.count).toBe(6 * FUR_LEVELS[level].layers.length);
      // The outer strands draw over the inner ones: layer heights never decrease along the index.
      const heights = Array.from({ length: index.count }, (_, i) => shell.getX(index.getX(i)));
      expect(heights.every((h, i) => i === 0 || h >= heights[i - 1])).toBe(true);
      // Every level keeps the outermost layer, so the silhouette keeps its full fur length.
      expect(Math.max(...heights)).toBe(1);
      // All levels share the vertex streams (one upload) and differ only by their index.
      if (level) expect(geometry.getAttribute('furRest')).toBe(levels[0].getAttribute('furRest'));
    });
    // Further levels never draw more layers than nearer ones.
    for (let i = 1; i < FUR_LEVELS.length; i++) expect(FUR_LEVELS[i].layers.length).toBeLessThan(FUR_LEVELS[i - 1].layers.length);
  });

  it('picks the level by distance and hides the shells beyond the fur range', () => {
    const shells = attachFurShells(pelt())!, levels = shells.userData.furLevels as THREE.BufferGeometry[];
    updateFurShells(shells, 1);
    expect(shells.visible).toBe(true); expect(shells.geometry).toBe(levels[0]);
    updateFurShells(shells, (FUR_LEVELS[0].until + FUR_LEVELS[1].until) / 2);
    expect(shells.geometry).toBe(levels[1]);
    updateFurShells(shells, FUR_RANGE - .1);
    expect(shells.geometry).toBe(levels[levels.length - 1]);
    updateFurShells(shells, FUR_RANGE + .1);
    expect(shells.visible).toBe(false);
  });
});
