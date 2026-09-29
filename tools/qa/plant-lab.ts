// Plant lab: renders chosen plant templates on an open lawn under the game's sun, sky light, fog and
// tone mapping, so a species can be judged at 3, 15 and 60 m (and in wind) without the whole island.
// Open http://127.0.0.1:<port>/tools/qa/plant-lab.html on a dev server; tools/qa/plant-lab.mjs drives it.
import * as THREE from 'three';
import { PAINT, SUN_DIRECTION } from '../../src/render/materials';
import { createFoliageMaterial } from '../../src/render/vegetation/foliage-material';
import { buildTemplates } from '../../src/render/vegetation/templates';
import { SPECIES, type SpeciesId } from '../../src/shared/vegetation-species';

export interface LabPlant { species: SpeciesId; variant?: number; lod?: 0 | 1 | 2; x: number; z: number; y?: number; height?: number; yaw?: number }
export interface LabScene { plants: LabPlant[]; camera: number[]; time?: number; ground?: string; wall?: number[] }

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
{
  const g = sky.getContext('2d')!, gradient = g.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#5f97cf'); gradient.addColorStop(.62, '#a8c6df'); gradient.addColorStop(1, '#f1cfae');
  g.fillStyle = gradient; g.fillRect(0, 0, 2, 256);
}
const skyTexture = new THREE.CanvasTexture(sky); skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;
scene.fog = new THREE.Fog(PAINT.fog, 34, 285);
scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, .88));
const sun = new THREE.DirectionalLight(PAINT.sun, 3.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 });
sun.shadow.bias = -.00035; sun.shadow.normalBias = .12;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#88A65C', roughness: 1 }));
ground.receiveShadow = true; scene.add(ground);
const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#E9C46A', roughness: 1 }));
wall.castShadow = wall.receiveShadow = true; wall.visible = false; scene.add(wall);

const atlas = new THREE.TextureLoader().load('/textures/foliage-atlas.webp');
atlas.colorSpace = THREE.SRGBColorSpace; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.anisotropy = 8;
const { material, uniforms } = createFoliageMaterial(atlas);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .07, 850);
let batch: THREE.BatchedMesh | null = null;
const cache = new Map<SpeciesId, THREE.BufferGeometry[][]>();

function show(spec: LabScene) {
  if (batch) { scene.remove(batch); batch.dispose(); }
  const species = [...new Set(spec.plants.map(p => p.species))].filter(s => !cache.has(s));
  if (species.length) for (const [s, t] of Object.entries(buildTemplates(new Set(species)))) cache.set(s as SpeciesId, t);
  let vertices = 0, indices = 0;
  const used = new Map<THREE.BufferGeometry, number>();
  for (const p of spec.plants) {
    const g = cache.get(p.species)?.[p.variant ?? 0]?.[p.lod ?? 0];
    if (!g) throw new Error(`No template for ${p.species} v${p.variant ?? 0}`);
    if (!used.has(g)) { used.set(g, -1); vertices += g.getAttribute('position').count; indices += g.index!.count; }
  }
  batch = new THREE.BatchedMesh(spec.plants.length, vertices, indices, material);
  batch.castShadow = batch.receiveShadow = true; batch.frustumCulled = false;
  for (const g of used.keys()) used.set(g, batch.addGeometry(g));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const p of spec.plants) {
    const g = cache.get(p.species)![p.variant ?? 0][p.lod ?? 0];
    const id = batch.addInstance(used.get(g)!), s = (p.height ?? SPECIES[p.species].height) / SPECIES[p.species].height;
    batch.setMatrixAt(id, m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q.setFromAxisAngle(up, p.yaw ?? 0), new THREE.Vector3(s, s, s)));
    batch.setColorAt(id, new THREE.Color(1, 1, 1));
  }
  scene.add(batch);
  (ground.material as THREE.MeshStandardMaterial).color.set(spec.ground ?? '#88A65C');
  wall.visible = !!spec.wall;
  if (spec.wall) { const [x, y, z, w, h, d] = spec.wall; wall.position.set(x, y, z); wall.scale.set(w, h, d); }
  const [x, y, z, tx, ty, tz, fov = 60] = spec.camera;
  camera.position.set(x, y, z); camera.fov = fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.lookAt(tx, ty, tz);
  sun.target.position.set(tx, 0, tz); sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 120);
  uniforms.uTime.value = spec.time ?? 0;
  renderer.render(scene, camera);
  return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}

const ready = new Promise<void>(resolve => {
  const check = () => atlas.image ? resolve() : setTimeout(check, 50);
  check();
});
Object.assign(window, { __lab: { show, species: SPECIES, ready: () => ready, frame(time: number) { uniforms.uTime.value = time; renderer.render(scene, camera); } } });
