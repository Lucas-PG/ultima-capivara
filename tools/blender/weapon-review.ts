// Asset and framing review only. Production integration uses the shared loader.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PaintedWeaponSet, PAINTED_WEAPON_IDS } from '../../src/render/painted-weapons';
import { WEAPON_HIP_POSES, WEAPON_VIEW_FOV, type WeaponHipPose } from '../../src/render/weapon-framing';
import type { WeaponId } from '../../src/shared/types';

const params = new URLSearchParams(location.search);
if (params.has('runtime')) await import('../../src/render/toon');
const gl = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, alpha: true, antialias: true });
gl.setPixelRatio(1); gl.setSize(innerWidth, innerHeight);
gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.1;
gl.setClearColor(0, 0);
const { RenderPipeline } = await import('../../src/render/pipeline');
const pipeline = params.has('runtime') ? new RenderPipeline(gl, 2) : null;
pipeline?.resize();
const background = new THREE.Scene(); background.background = new THREE.Color('#e9e4d8');
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#B4C2EE', '#C9A66B', 1.15));
const sun = new THREE.DirectionalLight('#FFD9A8', 2.7); sun.position.set(-7, 5.5, 3); scene.add(sun);
if (pipeline) {
  const { PaintedSky } = await import('../../src/render/sky');
  const sky = new PaintedSky(), skyScene = new THREE.Scene(); skyScene.add(sky.group);
  const pmrem = new THREE.PMREMGenerator(gl);
  const environment = pmrem.fromScene(skyScene, .035, .1, 850, { size: 128 });
  scene.environment = environment.texture;
  addEventListener('beforeunload', () => { sky.dispose(); environment.dispose(); });
  scene.environmentIntensity = .35; pmrem.dispose();
}
const camera = new THREE.PerspectiveCamera(WEAPON_VIEW_FOV, innerWidth / innerHeight, .01, 20);
const set = new PaintedWeaponSet();
await set.preload(url => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
const models = Object.fromEntries(PAINTED_WEAPON_IDS.map(id => [id, set.create(id)]));
const holder = new THREE.Group(); scene.add(holder);
for (const model of Object.values(models)) { holder.add(model.group); model.group.visible = false; }
let current: WeaponId = 'm4';
let pose: WeaponHipPose = { ...WEAPON_HIP_POSES[current] };

function shot(options: { weapon?: WeaponId; pose?: Partial<WeaponHipPose>; rarity?: number; ads?: boolean; angle?: string; paws?: boolean } = {}) {
  current = options.weapon || current;
  for (const [id, model] of Object.entries(models)) model.group.visible = id === current;
  const model = models[current];
  set.setRarity(model, options.rarity ?? 0);
  pose = { ...WEAPON_HIP_POSES[current], ...options.pose };
  holder.position.set(pose.x, pose.y, pose.z); holder.scale.setScalar(pose.scale); holder.rotation.set(options.ads ? 0 : pose.pitch ?? 0, 0, 0);
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (options.ads) holder.position.set(0, -model.sightY * pose.scale, -.4);
  if (options.angle) {
    holder.position.set(0, 0, 0); holder.scale.setScalar(1);
    camera.position.set(options.angle === 'side' ? 1.3 : .9, .3, options.angle === 'side' ? -.25 : .9);
    camera.lookAt(0, -.06, -.3);
  }
  model.group.getObjectByName(`${current}_right_paw`)!.visible = options.paws !== false;
  model.support.visible = options.paws !== false;
  if (pipeline) pipeline.render(background, camera, { drawCalls: 0, triangles: 0 }, scene, camera);
  else gl.render(scene, camera);
  document.querySelector<HTMLElement>('#caption')!.hidden = params.has('clean');
  document.querySelector<HTMLElement>('#aim')!.hidden = !!options.angle;
  document.querySelector('#caption')!.textContent = `${current} · FOV ${camera.fov}° · ${innerWidth} × ${innerHeight}`;
  return { weapon: current, pose };
}

function measure() {
  const width = innerWidth, height = innerHeight;
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
  const pixels = new Uint8Array(width * height * 4);
  gl.setRenderTarget(target); gl.clear(); gl.render(scene, camera);
  gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  gl.setRenderTarget(null); target.dispose();
  let occupied = 0, central = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 128) continue;
    occupied++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if ((x + .5 - width / 2) ** 2 + (y + .5 - height / 2) ** 2 < 60 ** 2) central++;
  }
  const bounds = { x: minX, y: height - maxY - 1, width: Math.max(0, maxX - minX + 1), height: Math.max(0, maxY - minY + 1) };
  const coverage = occupied / (width * height), boundingCoverage = bounds.width * bounds.height / (width * height);
  return { weapon: current, viewport: [width, height], fov: camera.fov, pose, occupied, coverage, bounds, boundingCoverage, crosshairPixels: central,
    pass: coverage >= .18 && coverage <= .25 && boundingCoverage <= .45 && central === 0 };
}

(window as unknown as { weaponReview: unknown }).weaponReview = { shot, measure, models, set, ready: true };
shot({ weapon: (params.get('weapon') || 'm4') as WeaponId, angle: params.get('angle') || undefined });
addEventListener('beforeunload', () => { set.dispose(); pipeline?.dispose(); gl.dispose(); });
addEventListener('resize', () => {
  gl.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); pipeline?.resize(); shot({ weapon: current, pose });
});
