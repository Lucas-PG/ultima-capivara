import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A text plane must never show its back, where the glyphs read in reverse.
export function textSignMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide });
}

// A bevelled 7 cm board remains visible edge-on. Both text faces use the same
// outward winding and atlas UVs, so neither can show reversed lettering.
export function twoSidedTextSign(width: number, height: number, material: THREE.Material,
  accent: string, atlasIndex: number) {
  const geometry = new THREE.PlaneGeometry(width - .07, height - .07);
  const uv = geometry.getAttribute('uv');
  const col = atlasIndex % 4, row = Math.floor(atlasIndex / 4);
  for (let i = 0; i < uv.count; i++) {
    const x = 4 / 512 + uv.getX(i) * 504 / 512;
    const y = 4 / 256 + uv.getY(i) * 248 / 256;
    uv.setXY(i, (col + x) / 4, 1 - (row + 1 - y) / 2);
  }
  const edgeGeometry = new RoundedBoxGeometry(width, height, .07, 2, .035);
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 1 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(edgeGeometry, edgeMaterial));
  const front = new THREE.Mesh(geometry, material);
  const back = new THREE.Mesh(geometry, material);
  front.position.z = .037;
  back.position.z = -.037;
  back.rotation.y = Math.PI;
  group.add(front, back);
  return { group, geometry, edgeGeometry, edgeMaterial };
}
