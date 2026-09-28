import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemGeometry, itemMaterial } from '../src/render/item-geometry';
import { worldWeaponMaterial } from '../src/render/world-weapons';
import { LootView } from '../src/render/loot';
import { PAINTED_WEAPON_IDS } from '../src/render/painted-weapons';
import type { WorldSnapshot, WorldSpec } from '../src/shared/types';

describe('held and dropped weapons', () => {
  it('bakes all eight ground and third-person guns from the first-person builders within the prop budget', () => {
    for (const id of PAINTED_WEAPON_IDS) {
      const near = itemGeometry('weapon', id), far = itemGeometry('weapon', id, 'far');
      try {
        expect(near.index!.count / 3, id).toBeLessThanOrEqual(2400);
        expect(far.index!.count / 3, id).toBeLessThanOrEqual(900);
        expect(far.index!.count, id).toBeLessThan(near.index!.count * .55);
        for (const geometry of [near, far]) {
          expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
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

  it('shares one vertex-painted weapon material between held and instanced drops without changing other loot materials', () => {
    const paint = worldWeaponMaterial();
    expect(worldWeaponMaterial()).toBe(paint);
    expect(paint.vertexColors).toBe(true);
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
