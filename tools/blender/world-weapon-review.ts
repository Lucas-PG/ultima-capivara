import * as THREE from 'three';
import { itemGeometry } from '../../src/render/item-geometry';
import { worldWeaponMaterial } from '../../src/render/world-weapons';
import { PAINTED_WEAPON_IDS } from '../../src/render/painted-weapons';

const detail = new URLSearchParams(location.search).get('lod') === 'far' ? 'far' : 'near';
const gl = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: true });
gl.setPixelRatio(1); gl.setSize(innerWidth, innerHeight);
gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#ede4d1');
scene.add(new THREE.HemisphereLight('#B4C2EE', '#C9A66B', 1.15));
const sun = new THREE.DirectionalLight('#FFD9A8', 2.7); sun.position.set(-7, 5.5, 3); scene.add(sun);
const halfHeight = 3.8 * innerHeight / innerWidth;
const camera = new THREE.OrthographicCamera(-3.8, 3.8, halfHeight, -halfHeight, .1, 20);
camera.position.z = 8;
const metrics: Record<string, number> = {};
for (const [i, id] of PAINTED_WEAPON_IDS.entries()) {
  const mesh = new THREE.Mesh(itemGeometry('weapon', id, detail), worldWeaponMaterial());
  mesh.rotation.set(.16, -1.08, -.08);
  mesh.updateMatrixWorld();
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3());
  const scale = Math.min(1.54 / size.x, .93 / size.y); mesh.scale.setScalar(scale);
  mesh.updateMatrixWorld(); box.setFromObject(mesh);
  mesh.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
  mesh.position.x += -2.85 + i % 4 * 1.9; mesh.position.y += i < 4 ? .96 : -1.00;
  scene.add(mesh);
  metrics[id] = mesh.geometry.index!.count / 3;
  const label = document.createElement('span'); label.textContent = `${id} · ${metrics[id]} tri`; document.querySelector('#labels')!.append(label);
}
gl.render(scene, camera);
Object.assign(window, { ready: true, worldWeaponReport: { detail, metrics } });
addEventListener('beforeunload', () => { scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); gl.dispose(); });
