import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aimDirection, damp } from '../shared/math';
import { actorEye } from '../shared/collision';
import { terrainHeight } from '../shared/terrain';
import type { ActorState, GameEvent, LootSpawn, RenderFrame, Settings, Vec3, WeaponId, WorldSpec } from '../shared/types';
import { WorldScene } from './world-scene';
import { WeaponView } from './weapons';

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const material = (color: string, emissive = '#000000') => new THREE.MeshStandardMaterial({ color, emissive, roughness: .8, metalness: .04 });
const addEllipsoid = (group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material(color));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; group.add(mesh); return mesh;
};
const addBox = (group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
};
interface Avatar {
  group: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; weapon: THREE.Mesh;
  weaponId: WeaponId | null; chute: THREE.Group; label: THREE.Sprite; phase: number; initialized: boolean;
}
interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; life: number; maxLife: number }
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }
interface ChestVisual { index: number; open: number; pos: Vec3 }
interface LootBatch { mesh: THREE.InstancedMesh; specs: LootSpawn[] }

const skinMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: .02, side: THREE.DoubleSide });
const itemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .16, side: THREE.DoubleSide });
const pawnSphere = new THREE.SphereGeometry(1, 12, 8);
const pawnBox = new THREE.BoxGeometry(1, 1, 1);
const pawnCylinder = new THREE.CylinderGeometry(.5, .5, 1, 12);
const vertex = (base: THREE.BufferGeometry, tint: string | THREE.Color, pos: THREE.Vector3, scale: THREE.Vector3, rotation = new THREE.Euler()) => {
  const geometry = base.index ? base.toNonIndexed() : base.clone();
  geometry.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rotation), scale));
  const color = typeof tint === 'string' ? new THREE.Color(tint) : tint;
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
};
function mergeParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) throw new Error('Cannot merge avatar geometry');
  merged.computeBoundingSphere(); return merged;
}

function makeFurNormal(): THREE.DataTexture {
  const width = 32, data = new Uint8Array(width * width * 4);
  let seed = 0x4c925;
  for (let i = 0; i < width * width; i++) {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed) + 0x6d2b79f5 | 0;
    const noise = (seed >>> 24) - 128;
    data[i * 4] = 128 + Math.round(noise * .065); data[i * 4 + 1] = 128 + Math.round(noise * .065);
    data[i * 4 + 2] = 254; data[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(data, width, width, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; return map;
}
const furNormal = makeFurNormal();
skinMaterial.normalMap = furNormal; skinMaterial.normalScale.set(.22, .22);

function nameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(35,39,36,.63)'; ctx.roundRect(6, 7, 500, 82, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,238,194,.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#f8ebcc'; ctx.font = 'bold 39px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name.slice(0, 22), 256, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false }));
  sprite.scale.set(2.1, .39, 1); sprite.position.y = 2.03; return sprite;
}

function avatar(color: string, name: string): Avatar {
  const group = new THREE.Group();
  const fur = new THREE.Color(color);
  const light = fur.clone().lerp(new THREE.Color('#edc899'), .35);
  const shadow = fur.clone().lerp(new THREE.Color('#583e31'), .42);
  const parts: THREE.BufferGeometry[] = [];
  const part = (base: THREE.BufferGeometry, tint: string | THREE.Color, x: number, y: number, z: number, sx: number, sy: number, sz: number, bone: number, rotation = new THREE.Euler()) => {
    const geometry = vertex(base, tint, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation);
    const count = geometry.getAttribute('position').count;
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = bone; weights[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    parts.push(geometry);
  };
  const oval = (tint: string | THREE.Color, x: number, y: number, z: number, sx: number, sy: number, sz: number, bone: number) => part(pawnSphere, tint, x, y, z, sx, sy, sz, bone);
  const blockPart = (tint: string | THREE.Color, x: number, y: number, z: number, sx: number, sy: number, sz: number, bone: number) => part(pawnBox, tint, x, y, z, sx, sy, sz, bone);
  // Compact 1.8 m biped body with the long capybara muzzle and small rounded ears.
  oval(fur, 0, .98, .06, .39, .45, .29, 1);
  oval(light, 0, 1.04, -.205, .285, .34, .12, 1);
  oval(shadow, 0, .73, .22, .35, .24, .25, 1);
  oval(fur, 0, 1.49, -.11, .32, .25, .275, 2);
  oval(light, 0, 1.38, -.37, .275, .155, .185, 2);
  oval(light, 0, 1.33, -.47, .20, .09, .105, 2);
  oval(shadow, 0, 1.33, -.565, .072, .055, .04, 2);
  for (const side of [-1, 1]) {
    oval(shadow, side * .235, 1.724, -.012, .073, .07, .058, 2);
    oval('#c18f7f', side * .237, 1.735, -.061, .037, .041, .019, 2);
    oval('#f8e8cb', side * .251, 1.535, -.298, .064, .054, .029, 2);
    oval('#292c29', side * .257, 1.536, -.324, .033, .034, .019, 2);
    oval('#ffffff', side * .246, 1.551, -.339, .011, .012, .007, 2);
    oval(shadow, side * .17, 1.385, -.476, .025, .03, .025, 2);
    for (let i = 0; i < 2; i++) blockPart('#f0e1c6', side * (.045 + i * .035), 1.271, -.49, .027, .034, .033, 2);
    const armBone = side < 0 ? 3 : 4;
    oval(fur, side * .35, 1.1, -.075, .135, .27, .14, armBone);
    oval(light, side * .35, .895, -.20, .105, .105, .105, armBone);
    for (let finger = 0; finger < 4; finger++) {
      oval(light, side * .35 + (finger - 1.5) * .035, .85, -.285, .023, .035, .065, armBone);
      oval('#5c5045', side * .35 + (finger - 1.5) * .035, .835, -.335, .018, .01, .025, armBone);
    }
  }
  const legPositions: [number, number][] = [[-.215, -.14], [.215, -.14], [-.215, .22], [.215, .22]];
  legPositions.forEach(([x, z], i) => {
    const bone = 5 + i;
    oval(fur, x, .36, z, .145, .24, .14, bone);
    oval(shadow, x, .08, z - .05, .16, .08, .18, bone);
    for (let toe = -1; toe <= 1; toe++) oval('#5b4a3e', x + toe * .055, .06, z - .2, .032, .025, .055, bone);
  });
  // Vest and helmet are bones so equipment changes keep the avatar to one draw call.
  oval('#3c5860', 0, 1.105, -.237, .295, .28, .105, 9);
  blockPart('#ac9873', 0, 1.105, -.338, .61, .046, .038, 9);
  for (const side of [-1, 1]) blockPart('#a98f6c', side * .24, 1.25, -.27, .055, .23, .055, 9);
  oval('#536b66', 0, 1.66, -.10, .335, .12, .31, 10);
  blockPart('#6e8070', 0, 1.632, -.37, .53, .045, .15, 10);
  const body = new THREE.SkinnedMesh(mergeParts(parts), skinMaterial);
  body.castShadow = true; body.receiveShadow = true;
  const bones = Array.from({ length: 11 }, () => new THREE.Bone());
  bones[1].position.set(0, .98, 0); bones[2].position.set(0, 1.49, -.11);
  bones[3].position.set(-.34, 1.17, -.075); bones[4].position.set(.34, 1.17, -.075);
  legPositions.forEach(([x, z], i) => bones[5 + i].position.set(x, .58, z));
  bones[9].position.set(0, 1.1, -.23); bones[10].position.set(0, 1.68, -.1);
  for (let i = 1; i < bones.length; i++) bones[0].add(bones[i]);
  body.add(bones[0]); body.bind(new THREE.Skeleton(bones)); group.add(body);
  const weapon = new THREE.Mesh(new THREE.BufferGeometry(), itemMaterial);
  weapon.position.set(0, 1.04, -.44); weapon.rotation.x = -.08; weapon.castShadow = true; group.add(weapon);
  const chute = new THREE.Group(); group.add(chute);
  addEllipsoid(chute, '#e6c280', 0, 3.65, 0, 1.9, .32, 1.18);
  for (const x of [-1.6, 1.6]) for (const z of [-.9, .9]) {
    const start = new THREE.Vector3(x, 3.65, z), end = new THREE.Vector3(x * .15, 1.25, z * .15);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: '#f7ebcd' })); chute.add(line);
  }
  const label = nameSprite(name); group.add(label);
  return { group, body, bones, weapon, weaponId: null, chute, label, phase: 0, initialized: false };
}

function itemGeometry(kind: LootSpawn['kind'], weapon: WeaponId = 'pistol'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (base: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler()) =>
    parts.push(vertex(base, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation));
  const b = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => add(pawnBox, color, x, y, z, sx, sy, sz);
  const tube = (color: string, x: number, y: number, z: number, radius: number, length: number) => add(pawnCylinder, color, x, y, z, radius * 2, length, radius * 2, new THREE.Euler(Math.PI / 2, 0, 0));
  if (kind === 'weapon') {
    const small = weapon === 'pistol', blade = weapon === 'machete', sling = weapon === 'slingshot';
    if (blade) {
      b('#8e9a9a', 0, .01, -.26, .025, .085, .53);
      b('#d8dfd6', -.016, -.015, -.27, .012, .016, .53);
      b('#8a5e3f', 0, -.04, .13, .08, .085, .22);
      b('#c6a269', 0, -.03, .016, .14, .025, .038);
    } else if (sling) {
      b('#8f623c', 0, -.08, .10, .075, .23, .07);
      for (const side of [-1, 1]) {
        const arm = vertex(pawnCylinder, '#8f623c', new THREE.Vector3(side * .1, .085, -.04), new THREE.Vector3(.045, .26, .045), new THREE.Euler(0, 0, side * -.42)); parts.push(arm);
        b('#584638', side * .15, .14, -.13, .012, .014, .20);
      }
      b('#6c513b', 0, .14, -.23, .12, .025, .075);
    } else {
      const compact = weapon === 'smg', shotgun = weapon === 'shotgun', sniper = weapon === 'sniper', dmr = weapon === 'dmr';
      const front = small ? .23 : compact ? .47 : shotgun ? .72 : sniper ? .85 : dmr ? .72 : .62;
      const color = shotgun ? '#8d6645' : sniper ? '#687861' : compact ? '#557b87' : '#59645b';
      b('#414b4d', 0, 0, -.02, small ? .10 : .13, small ? .09 : .12, small ? .24 : .38);
      b(color, 0, -.017, -.25, small ? .085 : .13, small ? .065 : .10, small ? .11 : .28);
      tube('#657174', 0, .012, -.28 - front * .42, small ? .015 : shotgun ? .026 : .019, front);
      tube('#343e40', 0, .012, -.28 - front * .86, small ? .024 : .031, .045);
      b(small ? '#424747' : color, 0, -.04, small ? .13 : .23, small ? .10 : .12, small ? .095 : .14, small ? .11 : .22);
      b('#3a4140', 0, -.145, .09, .075, .18, .07);
      if (!shotgun) b('#556469', 0, -.145, -.07, .075, small ? .10 : .18, .088);
      if (!small) b('#292f31', 0, -.085, .33, .14, .19, .04);
      if (shotgun) {
        b('#a5784d', 0, -.055, -.45, .13, .08, .20);
        tube('#526064', 0, -.055, -.45, .014, .48);
      }
      if (sniper || dmr) {
        tube('#303a3c', 0, .14, -.12, .043, sniper ? .32 : .25);
        for (const z of [-.2, -.04]) b('#455052', 0, .065, z, .024, .065, .03);
        tube('#477080', 0, .14, -.29, .048, .014);
      } else {
        b('#3b4547', 0, .08, -.41, .016, .08, .015);
        b('#475155', 0, .055, .04, .05, .04, .04);
      }
      if (weapon === 'm4') for (let i = 0; i < 6; i++) b('#333b3e', 0, .057, -.20 - i * .04, .095, .007, .015);
    }
  } else if (kind === 'ammo') {
    b('#626b50', 0, 0, 0, .48, .29, .31);
    b('#343d36', 0, .16, 0, .51, .045, .34);
    b('#d0af6f', 0, .162, -.17, .22, .016, .018);
    for (const x of [-.13, 0, .13]) add(pawnCylinder, '#d0a767', x, .183, .025, .065, .07, .065);
  } else if (kind === 'armor') {
    b('#3d5964', 0, .02, 0, .43, .43, .14);
    b('#6e8d98', 0, .10, -.077, .34, .09, .023);
    for (const x of [-.18, .18]) b('#303c42', x, .26, 0, .07, .16, .17);
    b('#9ba7a3', 0, -.16, -.085, .2, .037, .02);
  } else if (kind === 'helmet') {
    add(pawnSphere, '#506b71', 0, .06, 0, .24, .18, .25);
    b('#384e53', 0, -.07, -.16, .48, .05, .18);
    b('#a3b8b3', 0, .17, -.10, .22, .025, .04);
  } else if (kind === 'medkit' || kind === 'bandage') {
    if (kind === 'medkit') {
      b('#e9e8de', 0, 0, 0, .4, .29, .29);
      b('#c45146', 0, 0, -.15, .2, .045, .012);
      b('#c45146', 0, 0, -.15, .046, .21, .012);
      b('#5b665e', 0, .16, 0, .14, .04, .08);
    } else {
      add(pawnCylinder, '#efdfc1', 0, 0, 0, .32, .25, .32, new THREE.Euler(0, 0, Math.PI / 2));
      add(pawnCylinder, '#bd5b50', .13, 0, 0, .045, .27, .27, new THREE.Euler(0, 0, Math.PI / 2));
    }
  } else if (kind === 'guarana' || kind === 'acai') {
    const fruit = kind === 'acai' ? '#703f78' : '#c47b3c';
    add(pawnCylinder, fruit, 0, 0, 0, .26, .38, .26);
    add(pawnCylinder, '#d9c7a4', 0, .2, 0, .26, .04, .26);
    b(kind === 'acai' ? '#d9aed6' : '#e5ca7a', 0, .015, -.133, .17, .13, .01);
  } else {
    b('#aa7045', 0, -.04, 0, .43, .21, .28);
    b('#c38c59', 0, .08, 0, .37, .035, .25);
  }
  return mergeParts(parts);
}

function chestGeometry(lid: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts.push(vertex(pawnBox, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz)));
  if (lid) {
    add('#91613b', 0, .11, .3, .96, .22, .65);
    add('#d1ac68', 0, .205, .3, .99, .038, .67);
    for (const x of [-.35, .35]) add('#c5a266', x, .12, .3, .055, .24, .68);
  } else {
    add('#715039', 0, .27, 0, .93, .52, .64);
    add('#c29e66', 0, .075, 0, .98, .07, .68);
    for (const x of [-.36, .36]) add('#b9975f', x, .26, 0, .06, .54, .69);
    add('#dbb470', 0, .30, .341, .18, .17, .035);
  }
  return mergeParts(parts);
}

function makePlane(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, '#e0ddd0', 0, 0, 0, 3.4, 1.7, 14);
  addEllipsoid(group, '#e8e7dc', 0, 0, -7.2, 1.65, .88, 2.3);
  addBox(group, '#dfc06e', 0, -.15, -1, 21, .24, 3.2);
  addBox(group, '#dfc06e', 0, 1.1, 5.6, 8.5, .2, 1.6);
  addBox(group, '#b8c3bb', 0, 2.4, 5.9, .24, 3, 1.5);
  for (const x of [-5.2, 5.2]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 2.4, 12), material('#9ca9a8'));
    engine.rotation.x = Math.PI / 2; engine.position.set(x, -.5, -1); group.add(engine);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(.13, 3.8, .08), material('#c7af75'));
    prop.position.set(x, -.5, -2.3); prop.name = 'propeller'; group.add(prop);
  }
  return group;
}

function segmentAabb(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, min: Vec3, max: Vec3): number {
  let near = 0, far = maxDistance;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
      continue;
    }
    const inv = 1 / direction[axis];
    let t1 = (min[axis] - origin[axis]) * inv, t2 = (max[axis] - origin[axis]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1); far = Math.min(far, t2);
    if (far < near) return Infinity;
  }
  return near;
}

export class GameRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly worldView: WorldScene;
  private readonly weaponView: WeaponView;
  private readonly avatars = new Map<string, Avatar>();
  private readonly chests = new Map<string, ChestVisual>();
  private readonly plane = makePlane();
  private readonly zone: THREE.Mesh;
  private readonly lootBatches = new Map<string, LootBatch>();
  private readonly lootRings: THREE.InstancedMesh;
  private readonly lootSpec: WorldSpec['loot'];
  private readonly chestBases: THREE.InstancedMesh;
  private readonly chestLids: THREE.InstancedMesh;
  private readonly chestGlints: THREE.InstancedMesh;
  private readonly chestLights: THREE.PointLight[] = [];
  private readonly world: WorldSpec;
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private readonly temp = new THREE.Object3D();
  private readonly sun: THREE.DirectionalLight;
  private readonly environment: THREE.WebGLRenderTarget;
  private settings: Settings;
  private elapsed = 0;
  private lastFrame: RenderFrame | null = null;
  private lastActor: ActorState | undefined;
  private lastViewedId: string | null = null;
  private cameraInitialized = false;
  private menuAngle = 0;
  private lastSize = { width: 1, height: 1 };
  private frameStats = { drawCalls: 0, triangles: 0 };

  constructor(canvas: HTMLCanvasElement, world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}) {
    this.settings = settings; this.world = world; this.lootSpec = world.loot;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: settings.graphics !== 'low', powerPreference: 'high-performance', alpha: false });
    this.weaponView = new WeaponView(onAssetsReady);
    this.gl.setPixelRatio(settings.graphics === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping; this.gl.toneMappingExposure = .98;
    this.gl.shadowMap.enabled = settings.graphics !== 'low'; this.gl.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .035, .1, 100, { size: 128 });
    room.dispose(); pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .3;
    this.weaponView.scene.environment = this.environment.texture;
    this.weaponView.scene.environmentIntensity = .9;
    this.scene.background = new THREE.Color('#bed9d1');
    this.scene.fog = new THREE.FogExp2('#a9c6bd', settings.graphics === 'low' ? .0055 : .0037);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, .07, 850);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight('#d5e1df', '#645344', .5));
    this.sun = new THREE.DirectionalLight('#ffe1b5', 2.15); this.sun.position.set(-55, 84, -38);
    this.sun.castShadow = settings.graphics !== 'low'; this.sun.shadow.mapSize.set(1024, 1024);
    const shadowReach = settings.graphics === 'high' ? 42 : 30;
    this.sun.shadow.camera.left = -shadowReach; this.sun.shadow.camera.right = shadowReach;
    this.sun.shadow.camera.top = shadowReach; this.sun.shadow.camera.bottom = -shadowReach;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 170;
    this.sun.shadow.bias = -.00018; this.sun.shadow.normalBias = .018;
    this.scene.add(this.sun, this.sun.target);
    const haze = new THREE.Mesh(new THREE.SphereGeometry(640, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vPosition;void main(){float h=normalize(vPosition).y;vec3 horizon=vec3(.95,.81,.64);vec3 middle=vec3(.68,.82,.80);vec3 top=vec3(.42,.65,.76);vec3 color=mix(horizon,middle,smoothstep(-.1,.3,h));color=mix(color,top,smoothstep(.25,.9,h));gl_FragColor=vec4(color,1.0);}',
    }));
    this.scene.add(haze);
    this.worldView = new WorldScene(world, settings, () => {
      if (this.worldView.skyTexture.image?.data) {
        this.scene.background = this.worldView.skyTexture;
        this.scene.backgroundIntensity = .8;
        haze.visible = false;
      }
      onAssetsReady();
    });
    this.scene.add(this.worldView.group);
    this.scene.add(this.plane); this.plane.visible = false;
    const zoneMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#a77de0') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float uTime;uniform vec3 uColor;varying vec2 vUv;void main(){float band=.5+.5*sin(vUv.x*340.0+vUv.y*65.0-uTime*2.4);float fade=smoothstep(.0,.18,vUv.y)*(1.0-smoothstep(.7,1.0,vUv.y));gl_FragColor=vec4(uColor,(.10+.12*band)*fade);}',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.zone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), zoneMaterial);
    this.zone.frustumCulled = false; this.zone.renderOrder = 2; this.scene.add(this.zone);
    const grouped = new Map<string, LootSpawn[]>();
    for (const item of world.loot) {
      const key = item.kind === 'weapon' ? `weapon:${item.weapon || 'pistol'}` : item.kind;
      const list = grouped.get(key) || []; list.push(item); grouped.set(key, list);
    }
    for (const [key, specs] of grouped) {
      const geometry = itemGeometry(specs[0].kind, specs[0].weapon);
      const mesh = new THREE.InstancedMesh(geometry, itemMaterial, specs.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      this.scene.add(mesh); this.lootBatches.set(key, { mesh, specs });
    }
    this.lootRings = new THREE.InstancedMesh(new THREE.TorusGeometry(.47, .035, 4, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .58 }), world.loot.length);
    this.lootRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.lootRings.frustumCulled = false;
    this.scene.add(this.lootRings);
    world.loot.forEach((item, i) => this.lootRings.setColorAt(i, new THREE.Color(this.lootColor(item.kind))));
    this.lootRings.instanceColor!.needsUpdate = true;
    this.chestBases = new THREE.InstancedMesh(chestGeometry(false), itemMaterial, world.chests.length);
    this.chestLids = new THREE.InstancedMesh(chestGeometry(true), itemMaterial, world.chests.length);
    this.chestGlints = new THREE.InstancedMesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }), world.chests.length);
    for (const mesh of [this.chestBases, this.chestLids, this.chestGlints]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    world.chests.forEach((spec, index) => this.chests.set(spec.id, { index, open: 0, pos: spec }));
    for (let i = 0; i < 2; i++) { const light = new THREE.PointLight('#ffd39b', .75, 4.4); light.visible = false; this.scene.add(light); this.chestLights.push(light); }
    const tracerMaterial = new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1, 4), tracerMaterial); mesh.visible = false; this.scene.add(mesh);
      this.tracers.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), life: 0, maxLife: .11 });
    }
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffce7c', transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 65; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.045, 0), sparkMaterial); mesh.visible = false; this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    this.resize();
  }

  private lootColor(kind: string) {
    if (kind === 'weapon') return '#f0b862';
    if (kind === 'ammo') return '#e3c789';
    if (kind === 'armor' || kind === 'helmet') return '#8ec5de';
    if (kind === 'acai') return '#b991db';
    if (kind === 'medkit' || kind === 'bandage') return '#96d39b';
    return '#dfb87a';
  }

  private ensureAvatar(actor: ActorState): Avatar {
    let visual = this.avatars.get(actor.id);
    if (!visual) { visual = avatar(actor.color, actor.name); this.avatars.set(actor.id, visual); this.scene.add(visual.group); }
    return visual;
  }

  private updateAvatars(frame: RenderFrame) {
    const actors = frame.snapshot?.actors || [];
    const seen = new Set<string>();
    const viewed = frame.spectateId || frame.playerId;
    for (const actor of actors) {
      seen.add(actor.id);
      const visual = this.ensureAvatar(actor);
      visual.group.visible = actor.alive && (!frame.playing || actor.id !== viewed || actor.stage !== 'ground');
      const pos = actor.id === frame.playerId && frame.predicted ? frame.predicted : actor.pos;
      const target = v(pos);
      if (!visual.initialized || visual.group.position.distanceToSquared(target) > 144) visual.group.position.copy(target);
      else visual.group.position.lerp(target, Math.min(1, frame.dt * 14));
      visual.initialized = true;
      visual.group.rotation.y = actor.yaw;
      visual.group.scale.setScalar(actor.crouch ? 1.3 / 1.8 : 1);
      visual.bones[2].rotation.x = actor.pitch * .4;
      visual.bones[9].scale.setScalar(actor.armor > 0 ? 1 : .0001);
      visual.bones[10].scale.setScalar(actor.helmet > 0 ? 1 : .0001);
      visual.chute.visible = actor.stage === 'parachute';
      visual.label.visible = actor.alive && actor.id !== viewed && visual.group.position.distanceToSquared(this.camera.position) < 24 * 24;
      visual.phase += frame.dt * Math.min(12, Math.hypot(actor.velocity.x, actor.velocity.z) * 1.7);
      const walk = actor.grounded && !actor.crouch ? Math.min(1, Math.hypot(actor.velocity.x, actor.velocity.z) / 5) : 0;
      for (let i = 0; i < 4; i++) visual.bones[5 + i].rotation.x = Math.sin(visual.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * .4 * walk;
      visual.bones[3].rotation.x = -.22 - Math.sin(visual.phase) * .1 * walk;
      visual.bones[4].rotation.x = -.25 + Math.sin(visual.phase) * .1 * walk;
      visual.bones[1].rotation.z = Math.sin(visual.phase * .5) * .018 * walk;
      visual.group.rotation.z = actor.lean * .11;
      if (actor.stage === 'falling') visual.group.rotation.x = -.22; else visual.group.rotation.x = 0;
      const held = actor.weapons[actor.slot]?.id || null;
      if (held !== visual.weaponId) {
        visual.weapon.geometry.dispose();
        visual.weapon.geometry = held ? itemGeometry('weapon', held) : new THREE.BufferGeometry();
        visual.weaponId = held;
      }
      visual.weapon.visible = actor.stage === 'ground' && !!held;
    }
    for (const [id, visual] of this.avatars) if (!seen.has(id)) visual.group.visible = false;
  }

  private updateCamera(frame: RenderFrame) {
    const snapshot = frame.snapshot;
    const viewedId = frame.spectateId || frame.playerId;
    const actor = snapshot?.actors.find(a => a.id === viewedId);
    this.lastActor = actor;
    if (frame.playing && actor?.alive) {
      const predicted = viewedId === frame.playerId && frame.predicted ? frame.predicted : actor.pos;
      const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
      const bob = this.settings.reducedMotion ? 0 : actor.grounded ? Math.sin(this.elapsed * (actor.sprint ? 15 : 10)) * Math.min(speed / 8, 1) * (actor.sprint ? .035 : .018) : 0;
      const yaw = viewedId === frame.playerId ? frame.input.yaw : actor.yaw;
      const pitch = viewedId === frame.playerId ? frame.input.pitch : actor.pitch;
      const target = v(predicted).add(new THREE.Vector3(0, actorEye(actor) + bob, 0));
      const leanDistance = actor.lean * .24;
      if (Math.abs(leanDistance) > .001) {
        const leanDir = new THREE.Vector3(Math.cos(yaw) * Math.sign(leanDistance), 0, -Math.sin(yaw) * Math.sign(leanDistance));
        let allowed = Math.abs(leanDistance);
        for (const collider of this.world.colliders) {
          if (Math.abs(collider.min.x - target.x) > 2 && Math.abs(collider.max.x - target.x) > 2) continue;
          if (Math.abs(collider.min.z - target.z) > 2 && Math.abs(collider.max.z - target.z) > 2) continue;
          const hit = segmentAabb(target, leanDir, allowed, collider.min, collider.max);
          if (hit < allowed) allowed = Math.max(0, hit - .07);
        }
        target.addScaledVector(leanDir, allowed);
      }
      if (!this.cameraInitialized || this.lastViewedId !== viewedId || this.camera.position.distanceToSquared(target) > 100) this.camera.position.copy(target);
      else this.camera.position.lerp(target, Math.min(1, frame.dt * 22));
      this.cameraInitialized = true; this.lastViewedId = viewedId;
      // Yaw must be applied before pitch. Resetting a lookAt() XYZ Euler's roll
      // can flip the horizon when the view crosses east or west.
      this.camera.rotation.set(pitch, yaw, actor.lean * -.045, 'YXZ');
      const ads = viewedId === frame.playerId ? this.weaponView.adsAmount : actor.ads && !actor.sprint ? 1 : 0;
      const zoom = actor.weapons[actor.slot]?.id === 'sniper' ? 5.5 : actor.weapons[actor.slot]?.id === 'dmr' ? 2.9 : 1.25;
      this.camera.fov = damp(this.camera.fov, this.settings.fov / (1 + ads * (zoom - 1)), 13, frame.dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (frame.playing) {
      if (!this.cameraInitialized && actor) {
        this.camera.position.copy(v(actor.pos).add(new THREE.Vector3(0, actorEye(actor), 0)));
        this.camera.lookAt(this.camera.position.clone().add(v(aimDirection(actor.yaw, actor.pitch))));
        this.cameraInitialized = true; this.lastViewedId = viewedId;
      }
      return;
    }
    this.cameraInitialized = false; this.lastViewedId = null;
    // The menu is a slow scenic orbit over the village and the harbour.
    this.menuAngle += frame.dt * (this.settings.reducedMotion ? .035 : .09);
    const x = -48 + Math.sin(this.menuAngle) * 53, z = -29 + Math.cos(this.menuAngle) * 48;
    this.camera.position.set(x, 27 + Math.sin(this.menuAngle * .6) * 3, z);
    this.camera.lookAt(-43, 1.5, -35);
    this.camera.fov = damp(this.camera.fov, 56, 4, frame.dt); this.camera.updateProjectionMatrix();
  }

  private closeWall(): number {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    let nearest = 1.5;
    for (const collider of this.world.colliders) {
      if (Math.abs(collider.min.x - this.camera.position.x) > 3 && Math.abs(collider.max.x - this.camera.position.x) > 3) continue;
      if (Math.abs(collider.min.z - this.camera.position.z) > 3 && Math.abs(collider.max.z - this.camera.position.z) > 3) continue;
      const d = segmentAabb(this.camera.position, dir, 1.5, collider.min, collider.max);
      if (d >= 0 && d < nearest) nearest = d;
    }
    return THREE.MathUtils.clamp((1.1 - nearest) / 1.1, 0, 1);
  }

  private updateLoot(snapshot: RenderFrame['snapshot']) {
    const active = new Map(snapshot?.loot.map(item => [item.id, item]) || []);
    const show = !!snapshot && snapshot.phase === 'playing';
    for (const batch of this.lootBatches.values()) {
      batch.specs.forEach((spec, index) => {
        const visible = show && !!active.get(spec.id)?.active;
        this.temp.position.set(spec.x, spec.y + .56 + Math.sin(this.elapsed * 2 + index) * .07, spec.z);
        this.temp.rotation.set(0, this.elapsed * .45 + index * .7, 0);
        this.temp.scale.setScalar(visible ? 1 : .0001); this.temp.updateMatrix();
        batch.mesh.setMatrixAt(index, this.temp.matrix);
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < this.lootSpec.length; i++) {
      const spec = this.lootSpec[i], state = active.get(spec.id);
      const visible = show && !!state?.active;
      this.temp.position.y = spec.y + .07; this.temp.rotation.set(Math.PI / 2, 0, 0);
      this.temp.position.x = spec.x; this.temp.position.z = spec.z;
      this.temp.scale.setScalar(visible ? 1 : .0001); this.temp.updateMatrix(); this.lootRings.setMatrixAt(i, this.temp.matrix);
    }
    this.lootRings.instanceMatrix.needsUpdate = true;
    const opened = new Set(snapshot?.openedChests || []);
    const nearLights: { distance: number; pos: Vec3 }[] = [];
    for (const [id, chest] of this.chests) {
      chest.open = damp(chest.open, opened.has(id) ? 1 : 0, 7, .016);
      const spec = chest.pos, scale = show ? 1 : .0001;
      this.temp.position.set(spec.x, spec.y, spec.z); this.temp.rotation.set(0, 0, 0);
      this.temp.scale.setScalar(scale); this.temp.updateMatrix(); this.chestBases.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .52, spec.z - .3); this.temp.rotation.set(-chest.open * 1.5, 0, 0);
      this.temp.updateMatrix(); this.chestLids.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .65 + Math.sin(this.elapsed * 3 + chest.index) * .06, spec.z);
      this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar(show && !opened.has(id) ? .85 : .0001);
      this.temp.updateMatrix(); this.chestGlints.setMatrixAt(chest.index, this.temp.matrix);
      if (show && !opened.has(id) && this.settings.graphics === 'high') {
        const distance = (spec.x - this.camera.position.x) ** 2 + (spec.y - this.camera.position.y) ** 2 + (spec.z - this.camera.position.z) ** 2;
        if (distance < 196) nearLights.push({ distance, pos: spec });
      }
    }
    this.chestBases.instanceMatrix.needsUpdate = true; this.chestLids.instanceMatrix.needsUpdate = true; this.chestGlints.instanceMatrix.needsUpdate = true;
    nearLights.sort((a, b) => a.distance - b.distance);
    this.chestLights.forEach((light, index) => {
      const nearest = nearLights[index]; light.visible = !!nearest;
      if (nearest) light.position.set(nearest.pos.x, nearest.pos.y + .6, nearest.pos.z);
    });
  }

  private updateEffects(dt: number) {
    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt; tracer.mesh.visible = tracer.life > 0;
      if (!tracer.mesh.visible) continue;
      const t = 1 - tracer.life / tracer.maxLife;
      const start = tracer.from.clone().lerp(tracer.to, Math.min(1, t * 2));
      const end = tracer.from.clone().lerp(tracer.to, Math.min(1, t * 2 + .13));
      const diff = end.clone().sub(start), length = diff.length();
      tracer.mesh.position.copy(start).addScaledVector(diff, .5); tracer.mesh.scale.set(1, length, 1);
      tracer.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
    }
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt; particle.mesh.visible = particle.life > 0;
      particle.velocity.y -= dt * 7.5; particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.setScalar(Math.max(.05, particle.life / .45));
    }
  }

  update(frame: RenderFrame): void {
    const dt = Math.min(Math.max(frame.dt || 0, 0), .05);
    this.lastFrame = frame; this.elapsed += dt;
    this.worldView.update(this.elapsed);
    this.updateAvatars(frame); this.updateCamera(frame); this.updateLoot(frame.snapshot); this.updateEffects(dt);
    const snapshot = frame.snapshot;
    const viewed = this.lastActor;
    this.weaponView.update(frame.playing && viewed?.id === frame.playerId ? viewed : undefined, dt, this.settings, this.closeWall(), snapshot?.time || 0);
    if (snapshot) {
      const zone = snapshot.zone;
      this.worldView.arenaBoundary.visible = snapshot.config.mode === 'deathmatch';
      this.zone.visible = frame.playing && snapshot.config.mode === 'battle-royale' && zone.radius < 140;
      this.zone.position.set(zone.x, 24, zone.z); this.zone.scale.set(zone.radius, 48, zone.radius);
      (this.zone.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
      this.plane.visible = frame.playing && snapshot.config.mode === 'battle-royale' && snapshot.actors.some(a => a.stage === 'plane');
      this.plane.position.copy(v(snapshot.plane));
      this.plane.rotation.y = Math.PI * .18;
      this.plane.children.filter(child => child.name === 'propeller').forEach(child => { child.rotation.z += dt * 34; });
    } else { this.zone.visible = false; this.plane.visible = false; this.worldView.arenaBoundary.visible = false; }
    if (this.settings.graphics !== 'low') {
      this.sun.position.set(this.camera.position.x - 55, 84, this.camera.position.z - 38);
      this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.sun.target.updateMatrixWorld();
    }
    this.gl.render(this.scene, this.camera);
    this.frameStats.drawCalls = this.gl.info.render.calls;
    this.frameStats.triangles = this.gl.info.render.triangles;
    const scoped = viewed?.ads && !viewed.sprint && viewed.reloadUntil <= (snapshot?.time || 0) && ['sniper', 'dmr'].includes(viewed.weapons[viewed.slot]?.id || '');
    if (frame.playing && viewed?.alive && viewed.stage === 'ground' && viewed.id === frame.playerId && !scoped) {
      this.gl.autoClear = false; this.gl.clearDepth(); this.gl.render(this.weaponView.scene, this.weaponView.camera); this.gl.autoClear = true;
      this.frameStats.drawCalls += this.gl.info.render.calls;
      this.frameStats.triangles += this.gl.info.render.triangles;
    }
  }

  event(event: GameEvent): void {
    if (event.type === 'shot') {
      const tracer = this.tracers.find(item => item.life <= 0) || this.tracers[0];
      tracer.from.copy(v(event.origin)); tracer.to.copy(v(event.end)); tracer.life = tracer.maxLife; tracer.mesh.visible = true;
      if (event.actor === this.lastFrame?.playerId) this.weaponView.shot(event.weapon);
      const end = v(event.end);
      for (let i = 0; i < (event.hit ? 7 : 3); i++) {
        const particle = this.particles.find(item => item.life <= 0);
        if (!particle) break;
        particle.life = .25 + Math.random() * .22; particle.mesh.position.copy(end); particle.mesh.visible = true;
        particle.velocity.set((Math.random() - .5) * 4, Math.random() * 3.8, (Math.random() - .5) * 4);
      }
    } else if (event.type === 'damage') {
      const visual = this.avatars.get(event.target);
      if (visual) {
        visual.group.scale.multiplyScalar(1.04);
        const spark = this.particles.find(item => item.life <= 0);
        if (spark) { spark.life = .3; spark.mesh.position.copy(v(event.pos)); spark.mesh.visible = true; spark.velocity.set(0, 2, 0); }
      }
    }
  }

  resize(): void {
    const canvas = this.gl.domElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth), height = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (width === this.lastSize.width && height === this.lastSize.height) return;
    this.lastSize = { width, height }; this.gl.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.weaponView.resize(width, height);
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.gl.setPixelRatio(settings.graphics === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
    this.gl.shadowMap.enabled = settings.graphics !== 'low'; this.sun.castShadow = settings.graphics !== 'low';
    const shadowReach = settings.graphics === 'high' ? 42 : 30;
    this.sun.shadow.camera.left = -shadowReach; this.sun.shadow.camera.right = shadowReach;
    this.sun.shadow.camera.top = shadowReach; this.sun.shadow.camera.bottom = -shadowReach;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.worldView.setSettings(settings);
    this.scene.fog = new THREE.FogExp2('#a9c6bd', settings.graphics === 'low' ? .0055 : .0037);
    this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); this.resize();
  }

  get stats() { return { ...this.frameStats }; }
  get cameraPosition(): Vec3 { return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }; }

  dispose(): void {
    this.scene.remove(this.worldView.group);
    this.worldView.dispose(); this.weaponView.dispose();
    this.environment.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) return;
      if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) geometries.add(object.geometry);
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) if (mat instanceof THREE.Material) {
        materials.add(mat);
        if ('map' in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    textures.add(furNormal); textures.forEach(texture => texture.dispose());
    materials.forEach(mat => mat.dispose());
    this.gl.dispose();
  }
}
