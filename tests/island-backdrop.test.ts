import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createIslandBackdrop, isletPalms } from '../src/render/island-backdrop';
import { WATER_LEVEL } from '../src/shared/water';
import { createWorld } from '../src/shared/world';

// The offshore islets are what every battle royale flies past for about ten seconds. They used to
// be soft vertex-coloured blobs; now they are granite morros over forest with coves, surf and palms.
const world = createWorld(), islands = world.objects.filter(o => o.detail === 'distant-island');

describe('offshore islets', () => {
  it('stay two draws and a bounded triangle count for all twelve', () => {
    const backdrop = createIslandBackdrop(world);
    try {
      const meshes: THREE.Mesh[] = [];
      backdrop.mesh.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
      expect(meshes).toHaveLength(2);
      const triangles = meshes.reduce((sum, m) => sum + m.geometry.index!.count / 3, 0);
      expect(triangles).toBeLessThan(180_000);
    } finally { backdrop.dispose(); }
  });

  it('shape rounded morros, never spires, each with land above the sea and a beach cove', () => {
    const backdrop = createIslandBackdrop(world);
    try {
      const position = backdrop.mesh.geometry.getAttribute('position'), paint = backdrop.mesh.geometry.getAttribute('isletPaint');
      // Each islet owns an equal, consecutive block of the heightfield's vertices.
      const block = position.count / islands.length;
      expect(Number.isInteger(block)).toBe(true);
      for (const [index, island] of islands.entries()) {
        let top = -Infinity, land = 0, sand = 0;
        for (let i = index * block; i < (index + 1) * block; i++) {
          const y = position.getY(i);
          top = Math.max(top, y);
          if (y > WATER_LEVEL + 1) land++;
          if (paint.getY(i) > .5 && y > WATER_LEVEL) sand++;
        }
        expect(top, island.id).toBeLessThanOrEqual(Math.min(island.scale.x, island.scale.z) * .75);
        expect(top, island.id).toBeGreaterThan(12);
        expect(land, island.id).toBeGreaterThan(500);
        expect(sand, island.id).toBeGreaterThan(10);
      }
    } finally { backdrop.dispose(); }
  });

  it('stands every beach palm on its islet ground, above the sea', () => {
    const palms = isletPalms(world), backdrop = createIslandBackdrop(world), ray = new THREE.Raycaster();
    try {
      expect(palms.length).toBeGreaterThan(islands.length * 2);
      backdrop.mesh.updateMatrixWorld(true);
      for (const palm of palms) {
        ray.set(new THREE.Vector3(palm.pos.x, 500, palm.pos.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(backdrop.mesh, false).find(h => h.object === backdrop.mesh);
        expect(hit, palm.id).toBeDefined();
        expect(hit!.point.y, palm.id).toBeGreaterThan(WATER_LEVEL + .3);
        // Rooted: neither floating over the sand nor buried in it.
        expect(Math.abs(hit!.point.y - palm.pos.y), palm.id).toBeLessThan(.6);
      }
    } finally { backdrop.dispose(); }
  });
});
