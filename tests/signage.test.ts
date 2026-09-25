import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textSignMaterial, twoSidedTextSign } from '../src/render/signage';
import { SIGN_ART } from '../src/shared/signage';
import { createWorld } from '../src/shared/world';

describe('island text signs', () => {
  it('uses only the five approved place names', () => {
    const actual = createWorld().objects.filter(object => object.kind === 'sign').map(object => object.detail);
    expect(new Set(actual)).toEqual(new Set(SIGN_ART.map(sign => sign.label)));
    const mirante = createWorld().objects.find(object => object.detail === 'MIRANTE')!;
    expect(Math.hypot(mirante.pos.x - 102, mirante.pos.z + 22)).toBeLessThan(30);
    expect(SIGN_ART.find(sign => sign.label === 'MIRANTE')?.accent).toBe('#E9B44C');
  });
  it('renders only the outward side of each text plane', () => {
    const texture = new THREE.Texture();
    const material = textSignMaterial(texture);
    expect(material.side).toBe(THREE.FrontSide);

    const { group: board, geometry, edgeGeometry, edgeMaterial } =
      twoSidedTextSign(3, .6, material, '#2A9D8F', 4);
    board.rotation.y = .37;
    board.updateMatrixWorld(true);
    expect(board.children).toHaveLength(3);
    const [front, back] = board.children.slice(1) as THREE.Mesh[];
    expect(front.geometry).toBe(back.geometry);
    expect(edgeGeometry.parameters.depth).toBeCloseTo(.07);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(.25);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(.5);
    }
    for (const [face, direction] of [[front, 1], [back, -1]] as const) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
      const expected = new THREE.Vector3(0, 0, direction).applyAxisAngle(new THREE.Vector3(0, 1, 0), .37);
      expect(normal.distanceTo(expected)).toBeLessThan(1e-6);
      const right = new THREE.Vector3(1, 0, 0).transformDirection(face.matrixWorld);
      const screenRight = new THREE.Vector3(direction, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), .37);
      expect(right.dot(screenRight)).toBeGreaterThan(.999999);
    }
    geometry.dispose(); edgeGeometry.dispose(); edgeMaterial.dispose(); material.dispose(); texture.dispose();
  });
});
