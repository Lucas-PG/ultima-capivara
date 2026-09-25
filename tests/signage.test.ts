import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textSignMaterial, twoSidedTextSign } from '../src/render/signage';

describe('island text signs', () => {
  it('renders only the outward side of each text plane', () => {
    const texture = new THREE.Texture();
    const material = textSignMaterial(texture);
    expect(material.side).toBe(THREE.FrontSide);

    const board = twoSidedTextSign(3, .6, material);
    board.rotation.y = .37;
    board.updateMatrixWorld(true);
    expect(board.children).toHaveLength(2);
    const [front, back] = board.children as THREE.Mesh[];
    expect(front.geometry).toBe(back.geometry);
    for (const [face, direction] of [[front, 1], [back, -1]] as const) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
      const expected = new THREE.Vector3(0, 0, direction).applyAxisAngle(new THREE.Vector3(0, 1, 0), .37);
      expect(normal.distanceTo(expected)).toBeLessThan(1e-6);
      const right = new THREE.Vector3(1, 0, 0).transformDirection(face.matrixWorld);
      const screenRight = new THREE.Vector3(direction, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), .37);
      expect(right.dot(screenRight)).toBeGreaterThan(.999999);
    }
    front.geometry.dispose(); material.dispose(); texture.dispose();
  });
});
