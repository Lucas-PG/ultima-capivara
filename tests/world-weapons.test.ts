import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemGeometry, itemMaterial } from '../src/render/item-geometry';
import { worldWeaponMaterial } from '../src/render/world-weapons';
import { LootView } from '../src/render/loot';
import { PAINTED_WEAPON_IDS } from '../src/render/painted-weapons';
import type { WorldSnapshot, WorldSpec } from '../src/shared/types';
import metrics from '../public/models/weapons/world-metrics.json';

describe('painted held and dropped weapons', () => {
  it('derives all eight world designs from the current first-person art with bounded near and far geometry', () => {
    expect(metrics.sourceSha256).toBe(createHash('sha256').update(readFileSync('public/models/weapons/painted-weapons.glb')).digest('hex'));
    for (const id of PAINTED_WEAPON_IDS) {
      const near = itemGeometry('weapon', id), far = itemGeometry('weapon', id, 'far');
      try {
        expect(near.index!.count / 3, id).toBeLessThanOrEqual(2200);
        expect(far.index!.count / 3, id).toBeLessThanOrEqual(380);
        expect(far.index!.count, id).toBeLessThan(near.index!.count * .4);
        for (const geometry of [near, far]) {
          expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
          expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
          const uv = geometry.getAttribute('uv');
          for (let i = 0; i < geometry.index!.count; i += 3) {
            const cells = [0, 1, 2].map(corner => {
              const vertex = geometry.index!.getX(i + corner);
              return Math.floor(uv.getX(vertex) * 8) + 8 * Math.floor(uv.getY(vertex) * 4);
            });
            expect(new Set(cells).size, `${id} paint must not interpolate across unrelated atlas cells`).toBe(1);
          }
          geometry.computeBoundingBox();
          expect(geometry.boundingBox!.isEmpty()).toBe(false);
          expect(geometry.boundingBox!.max.distanceTo(geometry.boundingBox!.min)).toBeLessThan(1.8);
        }
        // Far simplification must keep the same readable weapon silhouette.
        expect(far.boundingBox!.min.distanceTo(near.boundingBox!.min), id).toBeLessThan(.06);
        expect(far.boundingBox!.max.distanceTo(near.boundingBox!.max), id).toBeLessThan(.06);
      } finally { near.dispose(); far.dispose(); }
    }
  });

  it('shares textured weapon paint between held and instanced drops without changing other loot materials', () => {
    const paint = worldWeaponMaterial();
    expect(worldWeaponMaterial()).toBe(paint);
    const map = paint.map as THREE.DataTexture;
    expect(map.image.width).toBe(512); expect(map.image.height).toBe(512);
    expect(paint.vertexColors).toBe(true); expect(paint.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(paint).not.toBe(itemMaterial); expect(itemMaterial.map).toBeNull();
  });

  it('moves every distant dropped weapon to its cheap shared batch without hiding it or adding draws per item', () => {
    const loot = PAINTED_WEAPON_IDS.map(weapon => ({ id: weapon, kind: 'weapon' as const, weapon,
      x: 0, y: 0, z: 0, active: true, respawnAt: 0, rarity: 3 }));
    const world = { loot, objects: [], colliders: [], chests: [] } as unknown as WorldSpec;
    const scene = new THREE.Scene(), view = new LootView(scene, world), camera = new THREE.PerspectiveCamera();
    const snapshot = { phase: 'playing', loot, openedChests: [], time: 1 } as unknown as WorldSnapshot;
    const batch = (name: string) => scene.getObjectByName(name) as THREE.InstancedMesh;
    for (const [distance, detail] of [[3, 'near'], [30, 'far']] as const) {
      camera.position.z = distance; view.update(snapshot, 1, camera);
      for (const id of PAINTED_WEAPON_IDS) {
        expect(batch(`loot:weapon:${id}${detail === 'far' ? ':far' : ''}`).count).toBe(1);
        expect(batch(`loot:weapon:${id}${detail === 'far' ? '' : ':far'}`).count).toBe(0);
        expect(batch(`loot:weapon:${id}`).material).toBe(worldWeaponMaterial());
      }
    }
    scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  });
});
