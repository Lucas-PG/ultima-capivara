import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LootView } from '../src/render/loot';
import type { LootSpawn, WorldSnapshot, WorldSpec } from '../src/shared/types';

describe('indoor loot readability', () => {
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
