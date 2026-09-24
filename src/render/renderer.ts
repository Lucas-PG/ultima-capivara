import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aimDirection, damp } from '../shared/math';
import { actorEye } from '../shared/collision';
import { terrainHeight } from '../shared/terrain';
import { PLAYER_COLORS, type ActorState, type GameEvent, type LootSpawn, type RenderFrame, type Settings, type Vec3, type WeaponId, type WorldSpec } from '../shared/types';
import { WorldScene } from './world-scene';
import { WeaponView } from './weapons';
import { buildCapybaraBody, CAPY_BONES, WEAPON_MOUNT } from './capybara';
import { createOutlineMaterial } from './toon';
import { rarityOf } from '../shared/rarity';
import { WEAPONS } from '../shared/weapons';

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const ease = (t: number) => t * t * (3 - 2 * t);
type CameraMode = 'orbit' | 'chase' | 'fps';
// Bots are all drawn in the simulation's single bot fur colour.
const BOT_COLOR = '#ae825e';
// Graphics presets. The outline pass is the art style, so it runs on every
// preset; what scales is resolution, MSAA inside it, and shadows.
const PRESETS = {
  low: { dpr: .75, samples: 0, shadows: false, shadowReach: 0, interior: false },
  medium: { dpr: 1, samples: 0, shadows: true, shadowReach: 32, interior: true },
  high: { dpr: 1.25, samples: 2, shadows: true, shadowReach: 42, interior: true },
} as const;
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
interface LootBatch { mesh: THREE.InstancedMesh; capacity: number }
// Extra instances per loot model for items spilled from chests at runtime.
const DROP_SLOTS = 16;
const lootKey = (item: LootSpawn) => item.kind === 'weapon' ? `weapon:${item.weapon || 'pistol'}` : item.kind;
const lootPhase = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return (h >>> 0) % 628 / 100; };
// Rarity glow for ground weapons: a camera-facing soft halo and, from Rara up, a light beam.
const glowHalo = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: `uniform float uTime;varying vec2 vUv;varying vec3 vColor;
    void main(){vUv=uv;vColor=vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vColor=instanceColor;
      #endif
      vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
      float size=length(instanceMatrix[0].xyz)*(1.0+.07*sin(uTime*3.0+instanceMatrix[3].x));
      center.xy+=position.xy*size;gl_Position=projectionMatrix*center;}`,
  fragmentShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){float d=length(vUv-.5)*2.0;float a=pow(max(0.0,1.0-d),2.4);gl_FragColor=vec4(vColor*a*1.35,a);}`,
});
const glowBeam = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){vUv=uv;vColor=vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vColor=instanceColor;
      #endif
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
  fragmentShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){float a=pow(1.0-vUv.y,1.6)*smoothstep(0.0,.06,vUv.y)*.55;gl_FragColor=vec4(vColor*a,a);}`,
});

const itemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .16, side: THREE.DoubleSide });
const pawnSphere = new THREE.SphereGeometry(1, 12, 8);
const pawnBox = new THREE.BoxGeometry(1, 1, 1);
const pawnCylinder = new THREE.CylinderGeometry(.5, .5, 1, 12);
// Half cylinder rotated by Euler(0, 0, PI / 2): curved side up, axis along X.
const pawnDome = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI);
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
  const { body, bones } = buildCapybaraBody(color);
  group.add(body);
  // The held weapon rides on the arms bone, so it aims with the paws.
  const weapon = new THREE.Mesh(new THREE.BufferGeometry(), itemMaterial);
  weapon.position.copy(WEAPON_MOUNT); weapon.castShadow = true; bones[CAPY_BONES.arms].add(weapon);
  const chute = new THREE.Group(); group.add(chute);
  addEllipsoid(chute, '#e6c280', 0, 3.65, 0, 1.9, .32, 1.18);
  for (const x of [-1.6, 1.6]) for (const z of [-.9, .9]) {
    const start = new THREE.Vector3(x, 3.65, z), end = new THREE.Vector3(x * .15, 1.25, z * .15);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: '#f7ebcd' })); chute.add(line);
  }
  const label = nameSprite(name); label.position.y = 2.2; group.add(label);
  return { group, body, bones, weapon, weaponId: null, chute, label, phase: 0, initialized: false };
}

export function itemGeometry(kind: LootSpawn['kind'], weapon: WeaponId = 'pistol'): THREE.BufferGeometry {
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

// A chunky cartoon supply chest: planked wood, brass bands and corner caps and a
// domed lid. The lid geometry is built around its hinge on the back top edge.
function chestGeometry(lid: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts.push(vertex(pawnBox, color, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz)));
  const dome = (color: string, x: number, y: number, z: number, height: number, length: number, depth: number) =>
    parts.push(vertex(pawnDome, color, new THREE.Vector3(x, y, z), new THREE.Vector3(height, length, depth), new THREE.Euler(0, 0, Math.PI / 2)));
  const wood = '#9a6238', plank = '#6a3f22', brass = '#d9a441', iron = '#3f4447';
  if (lid) {
    add(plank, 0, .04, .33, 1, .08, .68);
    dome(wood, 0, .08, .33, .2, .94, .33);
    for (const x of [-.3, .3]) dome(brass, x, .08, .33, .222, .08, .352);
    for (const x of [-.485, .485]) dome(iron, x, .08, .33, .214, .05, .344);
    add(brass, 0, -.02, .685, .14, .16, .035);
    add('#f2d27a', 0, .02, .705, .05, .05, .02);
  } else {
    add(iron, 0, .035, 0, 1.02, .07, .7);
    add(wood, 0, .27, 0, .94, .42, .62);
    for (const y of [.17, .32]) for (const z of [-.316, .316]) add(plank, 0, y, z, .95, .022, .02);
    for (const y of [.17, .32]) for (const x of [-.476, .476]) add(plank, x, y, 0, .02, .022, .63);
    add(plank, 0, .485, 0, 1, .05, .68);
    for (const x of [-.3, .3]) add(brass, x, .26, 0, .08, .47, .665);
    for (const x of [-.485, .485]) for (const z of [-.325, .325]) add(iron, x, .26, z, .07, .5, .07);
    add(brass, 0, .38, .338, .2, .19, .03);
    add('#2b2622', 0, .36, .355, .035, .07, .01);
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
  private readonly lootHalos: THREE.InstancedMesh;
  private readonly lootBeams: THREE.InstancedMesh;
  // Local time at which each chest drop started its arc out of the chest.
  private readonly dropStarts = new Map<string, number>();
  private readonly chestBases: THREE.InstancedMesh;
  private readonly chestLids: THREE.InstancedMesh;
  private readonly chestGlints: THREE.InstancedMesh;
  private readonly world: WorldSpec;
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private readonly temp = new THREE.Object3D();
  private readonly sun: THREE.DirectionalLight;
  private readonly interiorLight = new THREE.PointLight('#ffd09b', 0, 8, 2);
  private readonly litRooms: { x: number; y: number; z: number; w: number; d: number; bakery: boolean }[];
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
  private resolutionScale = 1;
  private frameInterval = 16.7;
  private lastUpdateAt = 0;
  private slowFor = 0;
  private fastFor = 0;
  private warming: Promise<void> | null = null;
  // Plane: third-person orbit. Drop: chase camera. Ground: first person.
  // Switching modes eases from the last pose instead of cutting.
  private cameraMode: CameraMode | null = null;
  private cameraBlend = 0;
  private cameraBlendDuration = .6;
  private readonly blendFromPosition = new THREE.Vector3();
  private readonly blendFromQuaternion = new THREE.Quaternion();
  private readonly fpsPosition = new THREE.Vector3();
  private readonly lookMatrix = new THREE.Matrix4();
  // Snapshots arrive at 20 Hz; the plane is extrapolated between them so it glides.
  private readonly planePosition = new THREE.Vector3();
  private readonly planeVelocity = new THREE.Vector3();
  private planeSample = { match: '', tick: -1, time: 0, at: 0, pos: new THREE.Vector3() };
  private readonly postTarget: THREE.WebGLRenderTarget;
  private readonly postMaterial: THREE.ShaderMaterial;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(canvas: HTMLCanvasElement, world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}) {
    this.settings = settings; this.world = world;
    this.litRooms = world.objects.filter(object => object.detail === 'prop:house:bakery' || object.detail === 'prop:house:cafe')
      .map(object => ({ ...object.pos, w: object.scale.x, d: object.scale.z, bakery: object.detail!.endsWith('bakery') }));
    // No canvas MSAA: every frame is drawn through the post target, so a multisampled
    // canvas only added a full-screen resolve.
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.weaponView = new WeaponView(onAssetsReady);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral keeps saturated cartoon colours; ACES washed them toward grey.
    this.gl.toneMapping = THREE.NeutralToneMapping; this.gl.toneMappingExposure = 1.15;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .035, .1, 100, { size: 128 });
    room.dispose(); pmrem.dispose();
    // The world is lit by sun + hemisphere only; image-based light at .14 cost a
    // cube-map lookup per pixel for almost no visible change. The gun keeps it.
    this.weaponView.scene.environment = this.environment.texture;
    this.weaponView.scene.environmentIntensity = .9;
    this.scene.background = new THREE.Color('#bed9d1');
    this.scene.fog = new THREE.Fog('#bcd3d2', 90, settings.graphics === 'low' ? 330 : 420);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, .07, 850);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight('#dcefff', '#9aab62', 1.2));
    this.scene.add(this.interiorLight);
    this.sun = new THREE.DirectionalLight('#ffe6bf', 2.3); this.sun.position.set(-55, 84, -38);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 170;
    this.sun.shadow.bias = -.00035; this.sun.shadow.normalBias = .055;
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
    const counts = new Map<string, number>();
    for (const item of world.loot) counts.set(lootKey(item), (counts.get(lootKey(item)) || 0) + 1);
    for (const [key, count] of counts) this.lootBatch(key, count);
    // Every kind a chest can spill gets its batch now, so opening one never builds meshes mid-match.
    for (const kind of ['ammo', 'armor', 'helmet', 'bandage', 'medkit', 'guarana', 'acai', 'rapadura'] as const) this.lootBatch(kind);
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) this.lootBatch(`weapon:${weapon}`);
    const weapons = world.loot.filter(item => item.kind === 'weapon').length + 48;
    this.lootRings = new THREE.InstancedMesh(new THREE.TorusGeometry(.47, .035, 4, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .58 }), world.loot.length + 96);
    this.lootHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowHalo(), weapons);
    this.lootBeams = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075, .075, 1, 10, 1, true).translate(0, .5, 0), glowBeam(), weapons);
    for (const mesh of [this.lootRings, this.lootHalos, this.lootBeams]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color()); this.scene.add(mesh);
    }
    this.lootHalos.renderOrder = 3; this.lootBeams.renderOrder = 3;
    this.chestBases = new THREE.InstancedMesh(chestGeometry(false), itemMaterial, world.chests.length);
    this.chestLids = new THREE.InstancedMesh(chestGeometry(true), itemMaterial, world.chests.length);
    this.chestGlints = new THREE.InstancedMesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }), world.chests.length);
    for (const mesh of [this.chestBases, this.chestLids, this.chestGlints]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    world.chests.forEach((spec, index) => this.chests.set(spec.id, { index, open: 0, pos: spec }));
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
    this.postTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: PRESETS[settings.graphics].samples });
    this.postTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.postMaterial = createOutlineMaterial(this.postTarget.texture, this.postTarget.depthTexture);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial); quad.frustumCulled = false; this.postScene.add(quad);
    this.applyPreset(settings);
    this.resize();
  }

  private applyPreset(settings: Settings) {
    const preset = PRESETS[settings.graphics];
    this.applyPixelRatio();
    if (this.postTarget.samples !== preset.samples) { this.postTarget.samples = preset.samples; this.postTarget.dispose(); }
    this.gl.shadowMap.enabled = preset.shadows; this.sun.castShadow = preset.shadows;
    this.interiorLight.visible = preset.interior;
    const reach = preset.shadowReach || 30, shadow = this.sun.shadow.camera;
    shadow.left = -reach; shadow.right = reach; shadow.top = reach; shadow.bottom = -reach; shadow.updateProjectionMatrix();
  }

  private applyPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, PRESETS[this.settings.graphics].dpr) * this.resolutionScale;
    if (Math.abs(this.gl.getPixelRatio() - ratio) > .01) { this.gl.setPixelRatio(ratio); this.sizePost(); }
  }

  // Like legacy PERF: if frames keep arriving late, render fewer pixels (down to
  // 60 %); when there is headroom again, climb back. Paused/background frames
  // (long gaps) are ignored.
  private adaptResolution() {
    const now = performance.now(), interval = now - this.lastUpdateAt; this.lastUpdateAt = now;
    const budget = 1000 / (this.settings.frameLimit || 60);
    if (interval <= 0 || interval > budget * 2.6) return;
    this.frameInterval += (interval - this.frameInterval) * .08;
    if (this.frameInterval > budget * 1.18) { this.slowFor += interval; this.fastFor = 0; }
    else if (this.frameInterval < budget * 1.04) { this.fastFor += interval; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor > 1500 && this.resolutionScale > .6) { this.resolutionScale = Math.max(.6, this.resolutionScale - .1); this.slowFor = 0; this.applyPixelRatio(); }
    else if (this.fastFor > 6000 && this.resolutionScale < 1) { this.resolutionScale = Math.min(1, this.resolutionScale + .05); this.fastFor = 0; this.applyPixelRatio(); }
  }

  private sizePost() {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.postTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    (this.postMaterial.uniforms.texel.value as THREE.Vector2).set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
  }

  private lootBatch(key: string, count = 0): LootBatch {
    let batch = this.lootBatches.get(key);
    if (!batch) {
      const [kind, weapon] = key.split(':') as [LootSpawn['kind'], WeaponId | undefined];
      const capacity = count + DROP_SLOTS;
      const mesh = new THREE.InstancedMesh(itemGeometry(kind, weapon), itemMaterial, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      this.scene.add(mesh); batch = { mesh, capacity }; this.lootBatches.set(key, batch);
    }
    return batch;
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
      // Everyone still in the plane rides inside it; the viewed capivara stays
      // visible in third person and while the camera eases into its eyes.
      visual.group.visible = actor.alive && actor.stage !== 'plane' &&
        (!frame.playing || actor.id !== viewed || actor.stage !== 'ground' || this.cameraBlend > .35);
      const pos = actor.id === frame.playerId && frame.predicted ? frame.predicted : actor.pos;
      const target = v(pos);
      if (!visual.initialized || visual.group.position.distanceToSquared(target) > 144) visual.group.position.copy(target);
      else visual.group.position.lerp(target, Math.min(1, frame.dt * 14));
      visual.initialized = true;
      visual.group.rotation.y = actor.yaw;
      visual.group.scale.setScalar(1);
      visual.bones[CAPY_BONES.armor].scale.setScalar(actor.armor > 0 ? 1 : .0001);
      visual.bones[CAPY_BONES.helmet].scale.setScalar(actor.helmet > 0 ? 1 : .0001);
      visual.chute.visible = actor.stage === 'parachute';
      visual.label.visible = actor.alive && actor.id !== viewed && visual.group.position.distanceToSquared(this.camera.position) < 24 * 24;
      this.poseAvatar(visual, actor, frame.dt);
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

  // Upright cartoon pose: two-leg walk, knee-bend crouch, aim with head and
  // arms, belly-down freefall and dangling legs under the parachute.
  private poseAvatar(visual: Avatar, actor: ActorState, dt: number) {
    const b = visual.bones, B = CAPY_BONES;
    for (const bone of b) { bone.rotation.set(0, 0, 0); bone.position.copy(bone.userData.rest as THREE.Vector3); }
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    visual.phase += dt * Math.min(13, speed * 2.1);
    visual.group.rotation.set(0, actor.yaw, 0);
    const pitch = THREE.MathUtils.clamp(actor.pitch, -1, 1);
    if (actor.stage === 'falling') {
      // Belly down around the body's centre, paws forward, legs trailing.
      const tilt = new THREE.Euler(-1.25, 0, Math.sin(visual.phase * .3 + this.elapsed * 2) * .06), centre = new THREE.Vector3(0, .9, 0);
      b[B.root].rotation.copy(tilt); b[B.root].position.copy(centre).sub(centre.clone().applyEuler(tilt));
      b[B.arms].rotation.x = .75; b[B.head].rotation.x = .7;
      const kick = Math.sin(this.elapsed * 5) * .15;
      b[B.thighL].rotation.x = -.35 + kick; b[B.thighR].rotation.x = -.35 - kick;
      b[B.shinL].rotation.x = -.5; b[B.shinR].rotation.x = -.5;
      return;
    }
    if (actor.stage === 'parachute') {
      // Paws up on the lines, legs swinging loosely.
      b[B.arms].rotation.x = 2.75; b[B.head].rotation.x = .15;
      const sway = Math.sin(this.elapsed * 2.2) * .18;
      b[B.thighL].rotation.x = .12 + sway; b[B.thighR].rotation.x = .12 - sway;
      b[B.shinL].rotation.x = -.25 - sway * .5; b[B.shinR].rotation.x = -.25 + sway * .5;
      return;
    }
    const walk = actor.grounded ? Math.min(1, speed / 5) : 0;
    const step = Math.sin(visual.phase);
    if (actor.crouch) {
      // The simulation's crouch is the standing hit shape scaled by 1.3 / 1.8
      // from the feet, so the crouched capivara is drawn exactly that way.
      visual.group.scale.setScalar(1.3 / 1.8);
      const creep = step * .35 * walk;
      b[B.thighL].rotation.x = creep; b[B.thighR].rotation.x = -creep;
    } else {
      b[B.thighL].rotation.x = step * .65 * walk; b[B.thighR].rotation.x = -step * .65 * walk;
      b[B.shinL].rotation.x = -Math.max(0, -Math.cos(visual.phase)) * .8 * walk;
      b[B.shinR].rotation.x = -Math.max(0, Math.cos(visual.phase)) * .8 * walk;
      b[B.root].position.y = Math.abs(Math.cos(visual.phase)) * .045 * walk;
      b[B.torso].rotation.z = step * .05 * walk;
      if (!actor.grounded) { b[B.thighL].rotation.x = .5; b[B.shinL].rotation.x = -.9; b[B.thighR].rotation.x = -.15; b[B.shinR].rotation.x = -.3; }
    }
    const lean = b[B.torso].rotation.x;
    // Hit volumes do not lean, so the body only hints at it.
    b[B.torso].rotation.z += -actor.lean * .05;
    b[B.head].rotation.x = pitch * .55 - lean;
    b[B.arms].rotation.x = pitch - lean + (actor.sprint ? -.55 : 0);
  }

  private updateCamera(frame: RenderFrame) {
    const snapshot = frame.snapshot;
    const viewedId = frame.spectateId || frame.playerId;
    const actor = snapshot?.actors.find(a => a.id === viewedId);
    this.lastActor = actor;
    if (frame.playing && actor?.alive) {
      const own = viewedId === frame.playerId;
      const yaw = own ? frame.input.yaw : actor.yaw;
      const pitch = own ? frame.input.pitch : actor.pitch;
      const mode: CameraMode = actor.stage === 'plane' ? 'orbit' : actor.stage === 'ground' ? 'fps' : 'chase';
      const snap = !this.cameraInitialized || this.lastViewedId !== viewedId;
      if (!snap && this.cameraMode && mode !== this.cameraMode) {
        this.blendFromPosition.copy(this.camera.position); this.blendFromQuaternion.copy(this.camera.quaternion);
        this.cameraBlend = 1; this.cameraBlendDuration = mode === 'fps' ? .6 : .8;
      }
      if (snap) this.cameraBlend = 0;
      this.cameraMode = mode;
      const position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
      let fov = this.settings.fov;
      if (mode === 'orbit') {
        // Orbit the plane with the mouse, like the legacy build. Level mouse
        // looks down at the island instead of at the horizon.
        const orbitPitch = THREE.MathUtils.clamp(pitch - .38, -1.2, .3), reach = 26 * Math.cos(orbitPitch);
        position.set(this.planePosition.x + Math.sin(yaw) * reach, this.planePosition.y + 4 - Math.sin(orbitPitch) * 26, this.planePosition.z + Math.cos(yaw) * reach);
        quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, this.planePosition.clone().setY(this.planePosition.y + 1), this.camera.up));
      } else if (mode === 'chase') {
        const body = this.avatars.get(actor.id)?.group.position || v(actor.pos);
        const chute = actor.stage === 'parachute', distance = chute ? 7.5 : 6;
        const chasePitch = THREE.MathUtils.clamp(pitch, -1.3, .6), reach = distance * Math.cos(chasePitch);
        position.set(body.x + Math.sin(yaw) * reach, body.y + 2.4 - Math.sin(chasePitch) * distance, body.z + Math.cos(yaw) * reach);
        position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .6);
        quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, body.clone().setY(body.y + (chute ? 2.2 : 1.2)), this.camera.up));
        fov = this.settings.fov + 6;
      } else {
        const predicted = own && frame.predicted ? frame.predicted : actor.pos;
        const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
        const bob = this.settings.reducedMotion ? 0 : actor.grounded ? Math.sin(this.elapsed * (actor.sprint ? 15 : 10)) * Math.min(speed / 8, 1) * (actor.sprint ? .035 : .018) : 0;
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
        if (snap || this.cameraBlend > 0 || this.fpsPosition.distanceToSquared(target) > 100) this.fpsPosition.copy(target);
        else this.fpsPosition.lerp(target, Math.min(1, frame.dt * 22));
        position.copy(this.fpsPosition);
        // Yaw must be applied before pitch. Resetting a lookAt() XYZ Euler's roll
        // can flip the horizon when the view crosses east or west.
        quaternion.setFromEuler(new THREE.Euler(pitch, yaw, actor.lean * -.045, 'YXZ'));
        const ads = own ? this.weaponView.adsAmount : actor.ads && !actor.sprint ? 1 : 0;
        const zoom = actor.weapons[actor.slot]?.id === 'sniper' ? 5.5 : actor.weapons[actor.slot]?.id === 'dmr' ? 2.9 : 1.25;
        fov = this.settings.fov / (1 + ads * (zoom - 1));
      }
      if (this.cameraBlend > 0) {
        this.cameraBlend = Math.max(0, this.cameraBlend - frame.dt / this.cameraBlendDuration);
        const t = ease(this.cameraBlend);
        position.lerp(this.blendFromPosition, t); quaternion.slerp(this.blendFromQuaternion, t);
      }
      this.camera.position.copy(position); this.camera.quaternion.copy(quaternion);
      this.cameraInitialized = true; this.lastViewedId = viewedId;
      this.camera.fov = snap ? fov : damp(this.camera.fov, fov, 13, frame.dt);
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
    this.cameraInitialized = false; this.lastViewedId = null; this.cameraMode = null; this.cameraBlend = 0;
    // The menu is a slow scenic orbit over the village and the harbour.
    this.menuAngle += frame.dt * (this.settings.reducedMotion ? .035 : .09);
    const x = -48 + Math.sin(this.menuAngle) * 53, z = -29 + Math.cos(this.menuAngle) * 48;
    this.camera.position.set(x, 27 + Math.sin(this.menuAngle * .6) * 3, z);
    this.camera.lookAt(-43, 1.5, -35);
    this.camera.fov = damp(this.camera.fov, 56, 4, frame.dt); this.camera.updateProjectionMatrix();
  }

  private updatePlanePath(snapshot: RenderFrame['snapshot'], dt: number) {
    if (!snapshot) return;
    const sample = this.planeSample, fresh = sample.match !== snapshot.matchId;
    if (fresh || snapshot.tick !== sample.tick) {
      const pos = v(snapshot.plane), step = snapshot.time - sample.time;
      if (fresh) { this.planePosition.copy(pos); this.planeVelocity.set(0, 0, 0); }
      else if (step > 0 && step < 1) this.planeVelocity.copy(pos).sub(sample.pos).divideScalar(step);
      this.planeSample = { match: snapshot.matchId, tick: snapshot.tick, time: snapshot.time, at: this.elapsed, pos };
    }
    const target = this.planeSample.pos.clone().addScaledVector(this.planeVelocity, Math.min(.25, this.elapsed - this.planeSample.at));
    if (this.planePosition.distanceToSquared(target) > 400) this.planePosition.copy(target);
    else this.planePosition.lerp(target, Math.min(1, dt * 10));
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
    const show = !!snapshot && snapshot.phase === 'playing';
    const used = new Map<LootBatch, number>();
    let rings = 0, halos = 0, beams = 0;
    const color = new THREE.Color(), seen = new Set<string>();
    for (const item of show ? snapshot!.loot : []) {
      if (!item.active) continue;
      const batch = this.lootBatch(lootKey(item)), index = used.get(batch) || 0;
      if (index >= batch.capacity || rings >= this.lootRings.instanceMatrix.count) continue;
      used.set(batch, index + 1);
      const phase = lootPhase(item.id);
      let x = item.x, z = item.z, y = item.y + .56 + Math.sin(this.elapsed * 2 + phase) * .07, spin = this.elapsed * .45 + phase, scale = 1, landed = 1;
      if (item.from) {
        // Chest drops arc from the lid to their landing spot; late joiners see them settled.
        seen.add(item.id);
        let start = this.dropStarts.get(item.id);
        if (start === undefined) { start = this.elapsed - Math.max(0, snapshot!.time - (item.spawnedAt ?? snapshot!.time)); this.dropStarts.set(item.id, start); }
        const t = THREE.MathUtils.clamp((this.elapsed - start) / .55, 0, 1);
        if (t < 1) {
          const e = 1 - (1 - t) * (1 - t);
          x = item.from.x + (item.x - item.from.x) * e; z = item.from.z + (item.z - item.from.z) * e;
          y = item.from.y + (item.y + .56 - item.from.y) * t + Math.sin(t * Math.PI) * .9;
          spin += t * 7; scale = .45 + .55 * e; landed = t;
        }
      }
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, spin, 0); this.temp.scale.setScalar(scale); this.temp.updateMatrix();
      batch.mesh.setMatrixAt(index, this.temp.matrix);
      const weapon = item.kind === 'weapon', rarity = weapon ? rarityOf(item.rarity) : null;
      color.set(rarity ? rarity.color : this.lootColor(item.kind));
      this.temp.position.set(x, item.y + .07, z); this.temp.rotation.set(Math.PI / 2, 0, 0); this.temp.scale.setScalar(landed * (item.from ? .82 : 1)); this.temp.updateMatrix();
      this.lootRings.setMatrixAt(rings, this.temp.matrix); this.lootRings.setColorAt(rings++, color);
      if (!weapon || halos >= this.lootHalos.instanceMatrix.count) continue;
      const tier = item.rarity || 0;
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar((1.35 + tier * .22) * landed); this.temp.updateMatrix();
      this.lootHalos.setMatrixAt(halos, this.temp.matrix); this.lootHalos.setColorAt(halos++, tier ? color : color.clone().multiplyScalar(.55));
      if (!tier) continue;
      this.temp.position.set(x, item.y + .05, z); this.temp.scale.set(1, (2 + tier * 1.1) * landed, 1); this.temp.updateMatrix();
      this.lootBeams.setMatrixAt(beams, this.temp.matrix); this.lootBeams.setColorAt(beams++, color);
    }
    for (const id of this.dropStarts.keys()) if (!seen.has(id)) this.dropStarts.delete(id);
    for (const batch of this.lootBatches.values()) { batch.mesh.count = used.get(batch) || 0; batch.mesh.instanceMatrix.needsUpdate = true; }
    this.lootRings.count = rings; this.lootHalos.count = halos; this.lootBeams.count = beams;
    for (const mesh of [this.lootRings, this.lootHalos, this.lootBeams]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    (this.lootHalos.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
    const opened = new Set(snapshot?.openedChests || []);
    for (const [id, chest] of this.chests) {
      chest.open = damp(chest.open, opened.has(id) ? 1 : 0, 7, .016);
      const spec = chest.pos, scale = show ? 1 : .0001;
      this.temp.position.set(spec.x, spec.y, spec.z); this.temp.rotation.set(0, 0, 0);
      this.temp.scale.setScalar(scale); this.temp.updateMatrix(); this.chestBases.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .5, spec.z - .33); this.temp.rotation.set(-chest.open * 1.75, 0, 0);
      this.temp.updateMatrix(); this.chestLids.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .98 + Math.sin(this.elapsed * 3 + chest.index) * .06, spec.z);
      this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar(show && !opened.has(id) ? .85 : .0001);
      this.temp.updateMatrix(); this.chestGlints.setMatrixAt(chest.index, this.temp.matrix);
    }
    this.chestBases.instanceMatrix.needsUpdate = true; this.chestLids.instanceMatrix.needsUpdate = true; this.chestGlints.instanceMatrix.needsUpdate = true;
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
    this.adaptResolution();
    const dt = Math.min(Math.max(frame.dt || 0, 0), .05);
    this.lastFrame = frame; this.elapsed += dt;
    this.worldView.update(this.elapsed);
    this.updatePlanePath(frame.snapshot, dt);
    this.updateAvatars(frame); this.updateCamera(frame); this.updateLoot(frame.snapshot); this.updateEffects(dt);
    const room = this.litRooms.find(room => Math.abs(this.camera.position.x - room.x) < room.w / 2 &&
      Math.abs(this.camera.position.z - room.z) < room.d / 2 && this.camera.position.y < room.y + 3.1);
    if (room) {
      this.interiorLight.position.set(room.bakery ? room.x + room.w / 2 - 1.95 : room.x,
        room.y + (room.bakery ? .93 : 2.45), room.bakery ? room.z - room.d * .24 : room.z);
      this.interiorLight.color.set(room.bakery ? '#ffae62' : '#ffdcaa');
    }
    this.interiorLight.intensity = damp(this.interiorLight.intensity, room ? room.bakery ? 4.3 : 4 : 0, 7, dt);
    const snapshot = frame.snapshot;
    const viewed = this.lastActor;
    this.weaponView.update(frame.playing && viewed?.id === frame.playerId ? viewed : undefined, dt, this.settings, this.closeWall(), snapshot?.time || 0);
    if (snapshot) {
      const zone = snapshot.zone;
      this.worldView.arenaBoundary.visible = snapshot.config.mode === 'deathmatch';
      // Like legacy, the storm wall is always up: a tall curtain at the safe
      // edge that also hides the empty far sea.
      this.zone.visible = frame.playing && snapshot.config.mode === 'battle-royale';
      this.zone.position.set(zone.x, 70, zone.z); this.zone.scale.set(zone.radius, 170, zone.radius);
      (this.zone.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
      this.plane.visible = frame.playing && snapshot.config.mode === 'battle-royale' && snapshot.actors.some(a => a.stage === 'plane');
      this.plane.position.copy(this.planePosition);
      // The nose (-Z) follows the flight path.
      if (this.planeVelocity.lengthSq() > 1) this.plane.rotation.y = Math.atan2(-this.planeVelocity.x, -this.planeVelocity.z);
      else this.plane.rotation.y = -Math.PI / 2;
      this.plane.children.filter(child => child.name === 'propeller').forEach(child => { child.rotation.z += dt * 34; });
    } else { this.zone.visible = false; this.plane.visible = false; this.worldView.arenaBoundary.visible = false; }
    // Thin the haze with altitude so the island stays readable from the plane.
    if (this.scene.fog instanceof THREE.Fog) {
      const altitude = THREE.MathUtils.smoothstep(this.camera.position.y, 15, 110), far = this.settings.graphics === 'low' ? 330 : 420;
      this.scene.fog.near = 90 * (1 + altitude); this.scene.fog.far = far * (1 + .35 * altitude);
    }
    if (this.settings.graphics !== 'low') {
      this.sun.position.set(this.camera.position.x - 55, 84, this.camera.position.z - 38);
      this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.sun.target.updateMatrixWorld();
    }
    this.gl.setRenderTarget(this.postTarget);
    this.gl.render(this.scene, this.camera);
    this.frameStats.drawCalls = this.gl.info.render.calls;
    this.frameStats.triangles = this.gl.info.render.triangles;
    this.postMaterial.uniforms.cn.value = this.camera.near; this.postMaterial.uniforms.cf.value = this.camera.far;
    this.gl.setRenderTarget(null); this.gl.render(this.postScene, this.postCamera);
    const scoped = viewed?.ads && !viewed.sprint && viewed.reloadUntil <= (snapshot?.time || 0) && ['sniper', 'dmr'].includes(viewed.weapons[viewed.slot]?.id || '');
    if (frame.playing && viewed?.alive && viewed.stage === 'ground' && viewed.id === frame.playerId && !scoped && this.cameraBlend < .35) {
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

  // Menu-time preload: waits for the world's textures (and sky) to arrive, then compiles every
  // shader of the world and first-person scenes so the first match frame doesn't stall.
  // Never rejects; gives up waiting after 15 s so a slow network can't block the game.
  warmup(): Promise<void> {
    this.warming ||= (async () => {
      const textures = () => { const list: THREE.Texture[] = []; this.scene.traverse(object => { const mats = (object as THREE.Mesh).material; for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) for (const value of Object.values(mat)) if (value instanceof THREE.Texture) list.push(value); }); return list; };
      const loaded = (texture: THREE.Texture) => { const image = texture.image as { complete?: boolean; data?: unknown; width?: number } | null; return !!image && image.complete !== false && (image.data !== undefined || (image.width ?? 0) > 0); };
      const started = performance.now();
      while (performance.now() - started < 15000 && !(this.worldView.skyTexture.image && textures().every(loaded))) await new Promise(resolve => setTimeout(resolve, 120));
      await Promise.race([this.weaponView.assets, new Promise(resolve => setTimeout(resolve, Math.max(0, 15000 - (performance.now() - started))))]);
      try {
        this.resize();
        await this.gl.compileAsync(this.scene, this.camera);
        await this.gl.compileAsync(this.weaponView.scene, this.weaponView.camera);
        this.uploadEverything();
      } catch { /* compiling lazily on the first frame still works */ }
    })();
    return this.warming;
  }

  // One offscreen frame with culling off, every LOD level and weapon model shown
  // and the shadow pass on: uploads all geometry and textures and compiles every
  // program variant (incl. shadow depth), so nothing stalls mid-match — the old
  // landing hitch was the first-person scene, far LODs and chests compiling and
  // uploading on the frame you touched the ground.
  private uploadEverything() {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const culled: THREE.Object3D[] = [], hidden: THREE.Object3D[] = [], lods: THREE.LOD[] = [];
    const reveal = (root: THREE.Object3D) => root.traverse(object => {
      if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
      if (!object.visible) { hidden.push(object); object.visible = true; }
      if (object instanceof THREE.LOD) { lods.push(object); object.autoUpdate = false; }
    });
    // Stand-in capybaras (one per fur colour, with gun, parachute and name tag)
    // build and upload the shared body geometries and compile the skinned programs.
    const stands = [...PLAYER_COLORS, BOT_COLOR].map(color => avatar(color, 'Capivara'));
    for (const stand of stands) {
      stand.weapon.geometry = itemGeometry('weapon', 'm4'); stand.group.position.copy(this.camera.position);
      this.scene.add(stand.group);
    }
    reveal(this.scene); this.weaponView.revealAll(true); reveal(this.weaponView.scene);
    const shadows = this.gl.shadowMap.enabled;
    try {
      this.gl.setRenderTarget(target);
      this.gl.render(this.scene, this.camera);
      this.gl.render(this.weaponView.scene, this.weaponView.camera);
      this.gl.setRenderTarget(null);
      this.gl.render(this.postScene, this.postCamera);
    } finally {
      this.gl.setRenderTarget(null); this.gl.shadowMap.enabled = shadows;
      culled.forEach(object => { object.frustumCulled = true; });
      hidden.forEach(object => { object.visible = false; });
      lods.forEach(lod => { lod.autoUpdate = true; });
      this.weaponView.revealAll(false);
      target.dispose();
      for (const stand of stands) {
        this.scene.remove(stand.group); stand.weapon.geometry.dispose(); stand.body.skeleton.dispose();
        stand.group.traverse(object => { if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); } });
        stand.chute.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      }
    }
  }

  resize(): void {
    const canvas = this.gl.domElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth), height = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (width === this.lastSize.width && height === this.lastSize.height) return;
    this.lastSize = { width, height }; this.gl.setSize(width, height, false); this.sizePost();
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.weaponView.resize(width, height);
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.resolutionScale = 1; this.applyPreset(settings);
    this.worldView.setSettings(settings);
    this.scene.fog = new THREE.Fog('#bcd3d2', 90, settings.graphics === 'low' ? 330 : 420);
    this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); this.resize();
  }

  get stats() { return { ...this.frameStats }; }
  get cameraPosition(): Vec3 { return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }; }

  dispose(): void {
    this.scene.remove(this.worldView.group);
    this.worldView.dispose(); this.weaponView.dispose();
    this.environment.dispose(); this.postTarget.dispose(); this.postTarget.depthTexture?.dispose();
    this.postMaterial.dispose(); this.postScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
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
    textures.forEach(texture => texture.dispose());
    this.avatars.forEach(visual => visual.body.skeleton.dispose());
    materials.forEach(mat => mat.dispose());
    this.gl.dispose();
  }
}
