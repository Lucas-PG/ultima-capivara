// Dev-only review sheet for the first-person arsenal: every weapon in its hip
// (or ADS / side) pose over a sky-and-grass backdrop. ?mode=hip|ads|side
import * as THREE from 'three';
import '../../src/render/toon';
import { ToonArsenal, TOON_WEAPON_IDS } from '../../src/render/toon-weapons';
import { TOON_HIP_POSES as WEAPON_HIP_POSES, WEAPON_VIEW_FOV } from '../../src/render/weapon-framing';
import { PAINT } from '../../src/render/materials';

const params = new URLSearchParams(location.search), mode = params.get('mode') || 'hip';
const only = params.get('weapon');
const ids = only ? [only as typeof TOON_WEAPON_IDS[number]] : TOON_WEAPON_IDS;
const cols = ids.length === 1 ? 1 : 4, rows = Math.ceil(ids.length / cols);
const tileW = ids.length === 1 ? 1280 : 640, tileH = ids.length === 1 ? 720 : 360;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(tileW * cols, tileH * rows, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;
renderer.setScissorTest(true);
const arsenal = new ToonArsenal();
const backdrop = new THREE.Scene();
const bg = document.createElement('canvas'); bg.width = 4; bg.height = 256;
const ctx = bg.getContext('2d')!; const grad = ctx.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#6fa2d6'); grad.addColorStop(.55, '#f3cfa0'); grad.addColorStop(.56, '#8aa05a'); grad.addColorStop(1, '#5d7a3a');
ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 256);
backdrop.background = new THREE.CanvasTexture(bg); (backdrop.background as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
const scenes = ids.map((id, i) => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, 1.05));
  const key = new THREE.DirectionalLight(PAINT.sun, 3.1); key.position.set(-70, 32, 30);
  const rim = new THREE.DirectionalLight(PAINT.rim, .8); rim.position.set(-70, 65, -30);
  scene.add(key, rim);
  const model = arsenal.create(id, Number(params.get('rarity') || i % 4));
  const holder = new THREE.Group(); holder.add(model.group); scene.add(holder);
  const pose = WEAPON_HIP_POSES[id];
  const camera = new THREE.PerspectiveCamera(mode === 'side' ? 30 : WEAPON_VIEW_FOV, tileW / tileH, .01, 10);
  if (mode === 'side') { camera.position.set(-2.2, .05, -.25); camera.lookAt(0, 0, -.25); }
  else if (mode === 'ads') { if (model.stock) model.stock.visible = false; holder.scale.setScalar(pose.scale); holder.position.set(0, -model.sightY * pose.scale, Number(params.get('adsZ') || -.4)); }
  else { holder.scale.setScalar(pose.scale); holder.position.set(pose.x, pose.y, pose.z); holder.rotation.set(pose.pitch ?? 0, pose.yaw ?? 0, pose.roll ?? 0); }
  return { scene, camera, x: (i % cols) * tileW, y: (rows - 1 - Math.floor(i / cols)) * tileH };
});
function draw() {
  for (const tile of scenes) {
    renderer.setViewport(tile.x, tile.y, tileW, tileH); renderer.setScissor(tile.x, tile.y, tileW, tileH);
    renderer.autoClear = true; renderer.render(backdrop, tile.camera);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(tile.scene, tile.camera);
  }
  (window as any).__ready = true;
}
draw();
