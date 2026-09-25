import * as THREE from 'three';

// A text plane must never show its back, where the glyphs read in reverse.
export function textSignMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide });
}

// Separate outward-facing planes keep a freestanding sign readable from both sides.
export function twoSidedTextSign(width: number, height: number, material: THREE.Material): THREE.Group {
  const geometry = new THREE.PlaneGeometry(width, height);
  const group = new THREE.Group();
  const front = new THREE.Mesh(geometry, material);
  const back = new THREE.Mesh(geometry, material);
  front.position.z = .012;
  back.position.z = -.012;
  back.rotation.y = Math.PI;
  group.add(front, back);
  return group;
}
