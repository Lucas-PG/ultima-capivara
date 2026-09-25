import * as THREE from 'three';
const material = (color: string, emissive = '#000000') => new THREE.MeshStandardMaterial({ color, emissive, roughness: .8, metalness: .04 });
export const addEllipsoid = (group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material(color));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; group.add(mesh); return mesh;
};
export const addBox = (group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
};
