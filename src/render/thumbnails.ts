import * as THREE from 'three';
import type { WeaponId } from '../shared/types';
import { itemGeometry } from './item-geometry';

// Hotbar thumbnails: every weapon's ground-loot model rendered once, three-quarter view, toon lit,
// with a thick sticker outline stamped in 2D. Cached as data URLs; the WebGL context is released after.
const WEAPON_IDS: WeaponId[] = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot'];
const WIDTH = 256, HEIGHT = 160, OUTLINE = 5, INK = '#16120e';
const cache = new Map<WeaponId, string>();
let pending: Promise<Map<WeaponId, string>> | null = null;

export const weaponThumbnail = (id: WeaponId) => cache.get(id);

export function loadWeaponThumbnails(): Promise<Map<WeaponId, string>> {
  pending ||= new Promise(resolve => {
    // Yield first so the match's own renderer and HUD come up before this extra context.
    window.setTimeout(() => {
      try { render(); } catch { /* thumbnails are decorative; the HUD falls back to silhouettes */ }
      resolve(cache);
    }, 250);
  });
  return pending;
}

function render() {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(WIDTH, HEIGHT, false); gl.setClearColor(0x000000, 0);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#6d5a44', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.6); key.position.set(-1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#ffe2b0', 1.1); rim.position.set(2, 1, -2.5); scene.add(rim);
  const ramp = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 20);
  const out = document.createElement('canvas'); out.width = WIDTH; out.height = HEIGHT;
  const ctx = out.getContext('2d')!;
  const ink = document.createElement('canvas'); ink.width = WIDTH; ink.height = HEIGHT;
  const inkCtx = ink.getContext('2d')!;
  for (const id of WEAPON_IDS) {
    const geometry = itemGeometry('weapon', id), mesh = new THREE.Mesh(geometry, material);
    // Models point their barrel down -z; turn it to the right and tilt toward the camera.
    mesh.rotation.set(.32, -Math.PI / 2 + .42, -.08, 'YXZ');
    scene.add(mesh); mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const pad = 1.18, aspect = WIDTH / HEIGHT;
    let halfW = size.x / 2 * pad, halfH = size.y / 2 * pad;
    if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH; camera.updateProjectionMatrix();
    camera.position.set(center.x, center.y, center.z + 5); camera.lookAt(center);
    gl.render(scene, camera);
    // Sticker outline: stamp an ink silhouette around the render, then draw the render on top.
    inkCtx.clearRect(0, 0, WIDTH, HEIGHT); inkCtx.globalCompositeOperation = 'source-over'; inkCtx.drawImage(canvas, 0, 0);
    inkCtx.globalCompositeOperation = 'source-in'; inkCtx.fillStyle = INK; inkCtx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (let a = 0; a < 16; a++) ctx.drawImage(ink, Math.cos(a / 16 * Math.PI * 2) * OUTLINE, Math.sin(a / 16 * Math.PI * 2) * OUTLINE);
    ctx.drawImage(canvas, 0, 0);
    cache.set(id, out.toDataURL('image/png'));
    scene.remove(mesh); geometry.dispose();
  }
  material.dispose(); ramp.dispose(); gl.dispose(); gl.forceContextLoss();
}
