import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LootView } from '../src/render/loot';
import type { LootSpawn, WorldSnapshot, WorldSpec } from '../src/shared/types';

describe('indoor loot readability', () => {
  it('keeps every active pistol in exactly one distance batch and restores detail when approached', () => {
    const items = [2, 30].map((x, index) => ({ id: `pistol-${index}`, kind: 'weapon', weapon: 'pistol', rarity: 0,
      x, y: 0, z: 0, active: true }));
    const world = { objects: [], loot: items, chests: [], colliders: [] } as unknown as WorldSpec;
    const scene = new THREE.Scene(), view = new LootView(scene, world), camera = new THREE.PerspectiveCamera();
    const snapshot = { phase: 'playing', loot: items, openedChests: [] } as unknown as WorldSnapshot;
    const near = scene.getObjectByName('loot:weapon:pistol') as THREE.InstancedMesh;
    const far = scene.getObjectByName('loot:weapon:pistol:far') as THREE.InstancedMesh;
    view.update(snapshot, 0, camera);
    expect([near.count, far.count]).toEqual([1, 1]);
    camera.position.x = 30; view.update(snapshot, 0, camera);
    const matrix = new THREE.Matrix4(); near.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(30); expect(near.count + far.count).toBe(2);
    items[0].active = false; view.update(snapshot, 0, camera);
    expect([near.count, far.count]).toEqual([1, 0]);
    scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  });

  it.each(['legacy', 'kit'])('ends a %s rare beam below the room ceiling while keeping outdoor beams full height', source => {
    const item = { id: 'indoor', kind: 'weapon', weapon: 'm4', rarity: 3, x: 0, y: 0, z: 0, active: true } as LootSpawn;
    const outside = { ...item, id: 'outdoor', x: 12 };
    const world = { objects: [{ kind: 'box', detail: 'prop:house:home', pos: { x: 0, y: 0, z: 0 }, scale: { x: 8, y: 0, z: 8 } }],
      loot: [item, outside], chests: [], colliders: [] } as unknown as WorldSpec;
    if (source === 'kit') {
      world.objects = [];
      world.colliders = [{ id: 'house:ceiling', pieceId: 'house', material: 'stone',
        min: { x: -4, y: 2.95, z: -4 }, max: { x: 4, y: 3.1, z: 4 } }];
    }
    const scene = new THREE.Scene(), view = new LootView(scene, world);
    view.update({ phase: 'playing', loot: world.loot, openedChests: [] } as unknown as WorldSnapshot, 0);
    const beam = scene.children.find(mesh => mesh instanceof THREE.InstancedMesh && mesh.geometry.type === 'CylinderGeometry') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    beam.getMatrixAt(0, matrix);
    expect(matrix.elements[13] + matrix.elements[5]).toBeCloseTo(2.87);
    beam.getMatrixAt(1, matrix);
    expect(matrix.elements[5]).toBeCloseTo(5.3);
  });
});
