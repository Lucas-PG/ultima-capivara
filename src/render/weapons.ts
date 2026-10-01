import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetLoader } from './assets';
import { ArmsRig, FP_ARMS_URL, blendCurl, type HandTarget, type HandCurl } from './fp-arms';
import { VIEW_SPECS, SHOULDERS, type GripSpec, type ViewSpec, type V3 } from './viewmodel-specs';
import { newSample, sampleChoreo, type ChoreoSample, type HandKey } from './viewmodel-choreo';
import { RELOADS, m4Reload, pistolReload, smgReload, dmrReload, sniperReload, cocoReload, SNIPER_CYCLE, SHORT_INSPECTS, LONG_INSPECTS } from './viewmodel-anims';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';
import { damp } from '../shared/math';
import { Spring } from './spring';
import { PAINT, SUN_DIRECTION } from './materials';
import { RARITY } from '../shared/rarity';
import { advanceAds, HANDLING, WEAPONS } from '../shared/weapons';
import { sampleMelee, sampleHeavyMelee, smoothPose, weaponShotDuration,
  MELEE_SECONDS, MELEE_CONTACT, MELEE_HIT_STOP, type MeleePose } from '../shared/weapon-presentation';
import type { ActorState, Settings, WeaponId } from '../shared/types';
import { swimReady } from '../shared/inventory';

// Viewmodel FOV (vertical). Narrower than the world so the paws and guns keep
// their proportions instead of stretching toward the screen edges.
export const VIEWMODEL_FOV = 58;
// A swap spends this share of the incoming weapon's draw time lowering the old
// gun and the rest raising the new one, so it settles exactly when it may fire.
const HOLSTER_SHARE = .4;

const v3 = (value: V3, out = new THREE.Vector3()) => out.set(value[0], value[1], value[2]);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const ease = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const window01 = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const bump = (t: number, a: number, peak: number, b: number) => window01(t, a, peak) * (1 - window01(t, peak, b));

interface Parts { slide?: THREE.Object3D; mag?: THREE.Object3D; trigger?: THREE.Object3D; hammer?: THREE.Object3D; action?: THREE.Object3D;
  cylinder?: THREE.Object3D; crane?: THREE.Object3D; rounds?: THREE.Object3D; pump?: THREE.Object3D; bolt?: THREE.Object3D; charge?: THREE.Object3D; release?: THREE.Object3D; ribbons?: THREE.Object3D;
  load1?: THREE.Object3D; load2?: THREE.Object3D;
  case0?: THREE.Object3D; case1?: THREE.Object3D; case2?: THREE.Object3D; case3?: THREE.Object3D; case4?: THREE.Object3D; case5?: THREE.Object3D }
interface Model {
  id: WeaponId; spec: ViewSpec; group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D; sight: THREE.Vector3;
  parts: Parts; rest: Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>;
  grips: { R: GripSpec; L?: GripSpec }; magAxis: THREE.Vector3; rarity: number; accent: ReturnType<typeof applyRarityAccent>[];
  crane?: THREE.Vector3;
  liveTips?: (THREE.Object3D | undefined)[];
}
const sortedReloads = Object.fromEntries(Object.entries(RELOADS).map(([id, keys]) => [id, [...keys!].sort((a, b) => a.t - b.t)]));

const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'revolver', 'coco'];

// Rarity recolours the weapon's teal accents (Comum keeps them) and lights them for Lendária.
function applyRarityAccent(material: THREE.MeshStandardMaterial) {
  const uniforms = { rarityColor: { value: new THREE.Color() }, rarityAmount: { value: 0 }, rarityGlow: { value: 0 } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rarityColor; uniform float rarityAmount, rarityGlow; float rarityMask;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        rarityMask = smoothstep(.12, .22, diffuseColor.g - diffuseColor.r) * smoothstep(.06, .14, diffuseColor.b - diffuseColor.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, rarityColor * (.35 + 1.6 * dot(diffuseColor.rgb, vec3(.3, .55, .15))), rarityMask * rarityAmount);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rarityColor * rarityMask * rarityGlow;');
  };
  material.customProgramCacheKey = () => 'arsenal-rarity-v1';
  return uniforms;
}

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, .01, 10);
  private readonly holder = new THREE.Group();
  private readonly key = new THREE.DirectionalLight(PAINT.sun, 3.1);
  private readonly rim = new THREE.DirectionalLight(PAINT.rim, .8);
  private readonly fill = new THREE.DirectionalLight('#9fc3e6', .4);
  // Always present (zero at rest) so a shot never changes the lighting shader.
  private readonly muzzleLight = new THREE.PointLight('#ffb25a', 0, 2.4, 2);
  private flashLight = 0;
  private readonly inverseView = new THREE.Quaternion();
  private readonly models = {} as Record<WeaponId, Model>;
  private arms: ArmsRig | null = null;
  private active: WeaponId = 'pistol';
  private ads = 0;
  // Visual springs. Values are metres or radians in camera space.
  private readonly kickZ = new Spring(); private readonly kickPitch = new Spring(); private readonly kickRoll = new Spring(); private readonly kickYaw = new Spring();
  private readonly swayYaw = new Spring(); private readonly swayPitch = new Spring(); private readonly swayRoll = new Spring();
  private readonly strafe = new Spring(); private readonly land = new Spring(); private readonly crouchDip = new Spring();
  private lastYaw: number | undefined;
  private lastPitch = 0;
  private grounded = true;
  private crouched = false;
  private swimming = false;
  private swimPose = 0;
  private verticalSpeed = 0;
  private sprintPose = 0;
  private movePose = 0;
  private holster = 0;
  private draw = 0;
  private drawFrom: WeaponId | null = null;
  private gait = 0;
  private time = 0;
  private shotLife = 0;
  private shotCount = 0;
  private reloadEnd = 0;
  private reloadEmpty = false;
  private reloadAmmo = 0;
  private shotgunReloading = false;
  private shotgunBeganEmpty = false;
  private shotgunPumpLife = 0;
  private lastShotCycle = -1;
  private pistolEmpty = false;
  private reloadDuration = 1;
  private wallPose = 0;
  private leanPose = 0;
  private meleeTime = MELEE_SECONDS;
  private meleeSide = -1;
  private meleeCount = 0;
  private meleeHit = false;
  private meleeStop = 0;
  private readonly meleePose: MeleePose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, smear: 0, kick: 0 };
  private readonly smear = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: '#ffe3a1', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  private readonly trailBase = new THREE.Vector3();
  private readonly trailTip = new THREE.Vector3();
  private readonly lastTrailBase = new THREE.Vector3();
  private readonly lastTrailTip = new THREE.Vector3();
  private inspectTime = -1;
  private inspectAllowed = false;
  private readonly restPosition = new THREE.Vector3();
  private readonly restRotation = new THREE.Quaternion();
  private readonly shoulderR = new THREE.Vector3();
  private readonly shoulderL = new THREE.Vector3();
  private readonly targetR: HandTarget;
  private readonly targetL: HandTarget;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quat = new THREE.Quaternion();
  private readonly adsQuat = new THREE.Quaternion();
  private readonly offset = new THREE.Quaternion();
  private disposed = false;
  readonly assets: Promise<void>;

  constructor(private readonly loader: AssetLoader, onAssetsReady: () => void = () => {}) {
    this.scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, .95));
    this.key.position.copy(SUN_DIRECTION).multiplyScalar(80); this.rim.position.set(-70, 65, -30); this.fill.position.set(60, 10, 40);
    this.scene.add(this.key, this.rim, this.fill, this.muzzleLight);
    this.scene.add(this.holder);
    this.smear.name = 'Machete motion smear'; this.smear.visible = false; this.smear.frustumCulled = false;
    this.smear.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    this.smear.renderOrder = 2; this.scene.add(this.smear);
    const target = (): HandTarget => ({ wrist: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), palm: new THREE.Vector3(0, -1, 0),
      curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3(0, -1, 0) });
    this.targetR = target(); this.targetL = target();
    // QA probe (tools/qa/grip-probe.mjs): measures paw-to-gun contact on the live rig.
    if (import.meta.env.DEV) (globalThis as { __vmProbe?: WeaponView }).__vmProbe = this;
    this.assets = this.load().then(() => {
      if (this.disposed) throw new Error('Weapon view disposed before preparation completed');
      onAssetsReady();
    });
    void this.assets.catch(() => {});
  }

  private async load() {
    const [arms, ...gltfs] = await Promise.all([this.loader.gltf(FP_ARMS_URL), ...WEAPON_IDS.map(id => this.loader.gltf(VIEW_SPECS[id].url))]);
    if (this.disposed) throw new Error('Weapon view disposed before preparation completed');
    this.arms = new ArmsRig(arms);
    this.scene.add(this.arms.group);
    WEAPON_IDS.forEach((id, i) => { this.models[id] = this.fromArsenal(id, gltfs[i]); });
  }

  private fromArsenal(id: WeaponId, gltf: GLTF): Model {
    const group = new THREE.Group(); group.name = id;
    const root = gltf.scene.getObjectByName(id) ?? gltf.scene;
    group.add(root);
    // Quantization recenters mesh nodes. Restore authored mechanical pivots
    // with a parent frame while preserving the packed mesh's world transform.
    if (['pistol', 'smg', 'revolver', 'machete'].includes(id)) {
      const pivots = (arsenalMetrics as Record<string, { pivots?: Record<string, number[]> }>)[id]?.pivots ?? {};
      for (const [name, pivot] of Object.entries(pivots)) {
        const mesh = root.getObjectByName(`${id}_${name}`);
        if (!mesh?.parent) continue;
        const parent = mesh.parent, frame = new THREE.Group();
        frame.name = mesh.name; mesh.name += '_geometry';
        frame.position.set(pivot[0], pivot[2], -pivot[1]);
        mesh.position.sub(frame.position); parent.add(frame); frame.add(mesh);
      }
    }
    const get = (part: string) => root.getObjectByName(`${id}_${part}`);
    const muzzle = get('muzzle'), eject = get('eject'), sight = get('sight');
    if (!muzzle || !eject || !sight) throw new Error(`Arma sem encaixes: ${id}.`);
    const accent: ReturnType<typeof applyRarityAccent>[] = [];
    const seen = new Set<THREE.Material>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      const material = object.material as THREE.MeshStandardMaterial;
      if (seen.has(material)) return;
      seen.add(material); material.envMapIntensity = .8; accent.push(applyRarityAccent(material));
    });
    const spec = VIEW_SPECS[id];
    const model: Model = { id, spec, group, muzzle, eject, sight: sight.position.clone(),
      parts: { slide: get('slide'), mag: get('mag'), trigger: get('trigger'), hammer: get('hammer'), action: get('action'),
        cylinder: get('cylinder'), crane: get('crane'), rounds: get('rounds'), pump: get('pump'), bolt: get('bolt'), charge: get('charge'), release: get('release'), ribbons: get('ribbons'),
        load1: get('load1'), load2: get('load2'),
        case0: get('case0'), case1: get('case1'), case2: get('case2'), case3: get('case3'), case4: get('case4'), case5: get('case5') },
      rest: new Map(), grips: spec.grips, magAxis: new THREE.Vector3(0, -1, 0), rarity: -1, accent,
      liveTips: id === 'revolver' ? Array.from({ length: 6 }, (_, i) => get(`live${i}`)) : undefined };
    // Blender axis (x, y, z) is (x, z, -y) here.
    const axis = (arsenalMetrics as Record<string, { magAxis?: number[] }>)[id]?.magAxis;
    if (axis) model.magAxis.set(axis[0], axis[2], -axis[1]).normalize();
    const crane = (arsenalMetrics as Record<string, { crane?: number[] }>)[id]?.crane;
    if (crane) model.crane = new THREE.Vector3(crane[0], crane[2], -crane[1]);
    this.remember(model);
    group.visible = false; this.holder.add(group);
    return model;
  }

  private remember(model: Model) {
    for (const part of Object.values(model.parts)) if (part)
      model.rest.set(part, { position: part.position.clone(), quaternion: part.quaternion.clone() });
  }

  // Warm-up only: show every model at once so one render compiles and uploads all of them.
  revealAll(on: boolean) {
    this.holder.visible = on;
    for (const [id, model] of Object.entries(this.models) as [WeaponId, Model][]) model.group.visible = on || id === this.active;
    if (this.arms) this.arms.group.visible = on || this.holder.visible;
  }

  inspect(): boolean {
    if (this.disposed || !this.inspectAllowed) return false;
    this.inspectTime = 0;
    return true;
  }

  private cancelInspect() {
    if (this.inspectTime < 0) return;
    this.inspectTime = -1;
    this.holder.position.copy(this.restPosition); this.holder.quaternion.copy(this.restRotation);
  }

  shot(id: WeaponId, contact = false) {
    this.cancelInspect(); this.inspectAllowed = false;
    // A cosmetic holster must never make a confirmed shot emerge from the previous weapon's muzzle.
    if (id !== this.active && this.models[id]) {
      this.models[this.active].group.visible = false; this.active = id; this.models[id].group.visible = true;
      this.draw = Math.min(this.draw, .35); this.holster = 0; this.ads = 0;
    }
    if (id === 'machete') {
      this.meleeTime = 0; this.meleeSide *= -1; this.meleeCount++; this.meleeHit = contact; this.meleeStop = 0;
    } else {
      if (id === 'revolver') this.cylinderTarget += Math.PI / 3;
      this.flashLight = id === 'shotgun' || id === 'sniper' || id === 'coco' ? 1.4 : 1;
      const recoil = this.models[id]?.spec.recoil ?? VIEW_SPECS[id].recoil;
      const scale = 1 - this.adsAmount * .45;
      const alternate = this.shotCount++ % 2 ? 1 : -1;
      this.kickZ.impulse(recoil.kick * scale);
      this.kickPitch.impulse(recoil.climb * (1 - this.adsAmount * .6));
      this.kickRoll.impulse(recoil.roll * alternate * (.6 + Math.random() * .6) * scale);
      this.kickYaw.impulse((Math.random() - .5) * recoil.roll * .5 * scale);
    }
    this.shotLife = weaponShotDuration(id);
    this.shotgunPumpLife = 0; this.lastShotCycle = -1;
  }

  // Barrel tip and ejection port of the held weapon, in this scene's (camera) space.
  muzzleWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].muzzle.getWorldPosition(target); }
  ejectWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].eject.getWorldPosition(target); }

  update(actor: ActorState | undefined, dt: number, settings: Settings, closeWall: number, simulationTime: number, viewRotation?: THREE.Quaternion) {
    if (viewRotation) {
      this.inverseView.copy(viewRotation).invert();
      this.key.position.copy(SUN_DIRECTION).multiplyScalar(80).applyQuaternion(this.inverseView);
      this.rim.position.set(-70, 65, -30).applyQuaternion(this.inverseView);
      this.fill.position.set(60, 10, 40).applyQuaternion(this.inverseView);
    }
    const ready = !!this.models[this.active] && !((import.meta.env.DEV || import.meta.env.VITE_QA === '1') && (globalThis as { __camOverride?: unknown }).__camOverride);
    this.holder.visible = ready && !!actor && actor.alive && actor.stage === 'ground' && !(actor.emote && actor.emoteUntil > simulationTime);
    if (this.arms) this.arms.group.visible = this.holder.visible;
    if (!actor || !this.holder.visible) { this.resetMotion(); return; }
    const requested = actor.weapons[actor.slot]?.id || 'pistol';
    if (requested !== this.active && this.models[requested]) {
      this.cancelInspect(); this.holster = Math.min(1, this.holster + dt / (HANDLING[requested].draw * HOLSTER_SHARE));
      if (this.holster >= 1) {
        this.models[this.active].group.visible = false; this.drawFrom = this.active; this.active = requested; this.models[this.active].group.visible = true;
        this.draw = 1; this.holster = 0; this.reloadEnd = 0; this.ads = 0; this.kickZ.reset(); this.kickPitch.reset();
        this.onFoley(this.active === 'machete' ? 'draw' : 'grab');
        this.meleeTime = MELEE_SECONDS; this.meleeStop = 0;
      }
    } else this.holster = damp(this.holster, 0, 20, dt);
    const weapon = this.active, model = this.models[weapon];
    let spec = model.spec;
    let viewmodelFov = spec.viewmodelFov ?? VIEWMODEL_FOV;
    if (import.meta.env.DEV) {
      // QA tuning: window.__vmTune = { pistol: { hip: {...}, grips: {...}, fov } } overrides the spec live.
      const tune = (globalThis as { __vmTune?: Record<string, Partial<ViewSpec> & { fov?: number }> }).__vmTune?.[weapon];
      if (tune) { spec = { ...spec, ...tune, grips: { ...model.grips, ...tune.grips } }; viewmodelFov = tune.fov ?? spec.viewmodelFov ?? VIEWMODEL_FOV; }
    }
    if (this.camera.fov !== viewmodelFov) { this.camera.fov = viewmodelFov; this.camera.updateProjectionMatrix(); }
    model.group.visible = true;
    const rarity = actor.weapons[actor.slot]?.rarity ?? 0;
    if (rarity !== model.rarity) {
      model.rarity = rarity;
      for (const uniforms of model.accent) {
        uniforms.rarityColor.value.set(RARITY[rarity]?.color ?? RARITY[0].color);
        uniforms.rarityAmount.value = rarity > 0 ? 1 : 0; uniforms.rarityGlow.value = rarity === 3 ? .45 : 0;
      }
    }
    const motion = settings.reducedMotion ? .35 : 1;
    if (this.arms && this.furPreset !== settings.graphics) { this.furPreset = settings.graphics; this.arms.setFurShells(FUR_BY_PRESET[settings.graphics]); }
    this.time += dt; this.lastDt = dt;
    const reloading = requested === weapon && actor.reloadUntil > simulationTime;
    const ammo = actor.weapons[actor.slot]?.ammo ?? 0;
    this.pistolEmpty = weapon === 'pistol' && ammo === 0;
    if (weapon === 'shotgun' && requested === weapon) {
      if (reloading && !this.shotgunReloading) this.shotgunBeganEmpty = ammo === 0;
      if (!reloading && this.shotgunReloading && this.shotgunBeganEmpty && ammo > 0 && this.shotLife <= 0) this.shotgunPumpLife = .42;
      this.shotgunReloading = reloading;
      const before = this.shotgunPumpLife;
      this.shotgunPumpLife = Math.max(0, before - dt);
      if (before > .31 && this.shotgunPumpLife <= .31) this.onFoley('pump-back');
      if (before > .12 && this.shotgunPumpLife <= .12) this.onFoley('pump-home');
    } else { this.shotgunReloading = false; this.shotgunBeganEmpty = false; this.shotgunPumpLife = 0; }
    this.inspectAllowed = requested === weapon && actor.grounded && !actor.swimming && !actor.ads && !actor.sprint && !reloading &&
      this.shotLife <= 0 && this.shotgunPumpLife <= 0 && (weapon !== 'machete' || this.meleeTime >= MELEE_SECONDS);
    if (!this.inspectAllowed) this.cancelInspect();
    if (reloading && actor.reloadUntil > this.reloadEnd + .01) {
      this.reloadEnd = actor.reloadUntil;
      this.reloadEmpty = ammo === 0; this.reloadAmmo = ammo;
      this.lastReload = -1;
      this.reloadDuration = weapon === 'm4' ? WEAPONS.m4.reload : Math.max(.3, Math.min(WEAPONS[weapon].reload || 1, actor.reloadUntil - simulationTime + .02));
    }
    const reload = reloading ? THREE.MathUtils.clamp(1 - (this.reloadEnd - simulationTime) / this.reloadDuration, 0, 1) : -1;

    // ---- aim state
    const wantAds = actor.ads && !actor.swimming && !reloading && this.shotgunPumpLife <= 0 && !actor.sprint && weapon !== 'machete' && this.draw < .5;
    this.ads = advanceAds(weapon, this.ads, wantAds, dt);
    const ads = this.adsAmount;
    // ---- look inertia: the gun trails the view and settles with a slight overshoot.
    const yaw = actor.yaw || 0, pitch = actor.pitch || 0;
    if (this.lastYaw === undefined) { this.grounded = actor.grounded; this.swimming = actor.swimming; this.verticalSpeed = actor.velocity.y; this.crouched = actor.crouch; }
    const yawRate = this.lastYaw === undefined ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / Math.max(dt, 1e-3);
    const pitchRate = this.lastYaw === undefined ? 0 : (pitch - this.lastPitch) / Math.max(dt, 1e-3);
    this.lastYaw = yaw; this.lastPitch = pitch;
    const weight = spec.inertia, loose = 1 - ads * .75;
    const swayYaw = this.swayYaw.update(THREE.MathUtils.clamp(yawRate * .018 * weight, -.11, .11) * loose, 13 / Math.sqrt(weight), dt);
    const swayPitch = this.swayPitch.update(THREE.MathUtils.clamp(-pitchRate * .014 * weight, -.08, .08) * loose, 13 / Math.sqrt(weight), dt);
    const swayRoll = this.swayRoll.update(THREE.MathUtils.clamp(yawRate * .025 * weight, -.12, .12) * loose, 10, dt);
    // ---- locomotion
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    const lateral = actor.velocity.x * Math.cos(yaw) - actor.velocity.z * Math.sin(yaw);
    const strafe = this.strafe.update(THREE.MathUtils.clamp(-lateral / 6, -1, 1) * (1 - ads * .8), 8, dt);
    const moving = actor.grounded && !actor.swimming ? Math.min(speed / 4.5, 1.4) : 0;
    this.movePose = damp(this.movePose, moving, 9, dt);
    this.gait += dt * (speed < .2 ? 0 : 2.1 + speed * .62) * Math.PI;
    const sprint = this.sprintPose = damp(this.sprintPose, actor.sprint && !actor.swimming && speed > 1 && !reloading ? 1 : 0, actor.sprint ? 9 : 13, dt);
    if (!actor.swimming && !this.swimming) {
      if (actor.grounded && !this.grounded) this.land.impulse(-Math.min(2.6, Math.max(.5, -this.verticalSpeed * .22)));
      if (!actor.grounded && this.grounded && actor.velocity.y > 0) this.land.impulse(.9);
    } else if (actor.swimming) this.land.reset();
    if (actor.crouch !== this.crouched) this.crouchDip.impulse(actor.crouch ? -.7 : .5);
    this.grounded = actor.grounded; this.swimming = actor.swimming; this.verticalSpeed = actor.velocity.y; this.crouched = actor.crouch;
    this.swimPose = damp(this.swimPose, actor.swimming ? 1 : 0, 6, dt);
    this.leanPose = damp(this.leanPose, actor.lean, 10, dt);
    this.wallPose = damp(this.wallPose, closeWall * (1 - ads), 14, dt);
    const landing = this.land.update(0, 11, dt), crouchDip = this.crouchDip.update(0, 12, dt);
    const kickZ = this.kickZ.update(0, spec.recoil.frequency, dt), kickPitch = this.kickPitch.update(0, spec.recoil.frequency * .85, dt);
    const kickRoll = this.kickRoll.update(0, spec.recoil.frequency * .7, dt), kickYaw = this.kickYaw.update(0, spec.recoil.frequency * .8, dt);
    this.draw = Math.max(0, this.draw - dt / (HANDLING[weapon].draw * (1 - HOLSTER_SHARE)));
    this.shotLife = Math.max(0, this.shotLife - dt);

    // ---- base pose: hip to sights
    const hip = v3(spec.hip.pos), hipRot = this.quat.setFromEuler(this.euler.set(spec.hip.rot[0], spec.hip.rot[1], spec.hip.rot[2], 'YXZ'));
    const adsRot = this.adsQuat.setFromAxisAngle(X_AXIS, spec.adsPitch ?? 0);
    const eye = (spec.adsEye ? v3(spec.adsEye) : model.sight.clone()).multiplyScalar(spec.scale).applyQuaternion(adsRot);
    const adsPos = new THREE.Vector3(0, 0, -spec.adsDistance).sub(eye);
    const position = hip.lerp(adsPos, ads);
    const rotation = hipRot.slerp(adsRot, ads);
    // ---- additive layers (x right, y up, z back; pitch up, yaw left, roll left)
    const bobScale = motion * this.movePose * (1 - ads * .85) * (1 + sprint * .9);
    const bobX = Math.sin(this.gait * .5) * .011 * bobScale, bobY = -Math.abs(Math.cos(this.gait * .5)) * .009 * bobScale + .0045 * bobScale;
    const breath = Math.sin(this.time * 1.6) * .0022 * motion * (1 - ads * .8) * (1 - sprint);
    const lowered = smoothPose(Math.min(1, this.holster + this.draw));
    const drawTwist = this.draw > 0 ? Math.sin(this.draw * Math.PI) * .25 : 0;
    const swimLow = this.swimPose * (swimReady(weapon) ? -.3 : 1);
    let px = bobX + swayYaw * .12 + strafe * .012 - this.leanPose * .01;
    let py = bobY + breath + landing * .025 * motion + crouchDip * .02 * motion + swayPitch * .1 - lowered * .2 - swimLow * .12 - this.wallPose * .07;
    let pz = kickZ * .016 + this.wallPose * .06 + lowered * .05;
    let rx = kickPitch * .016 + swayPitch + landing * .03 * motion - lowered * .75 + this.wallPose * .5 - swimLow * .3 + breath * .6;
    let ry = swayYaw + kickYaw * .01 + drawTwist * .5 + strafe * .02;
    let rz = swayRoll + kickRoll * .01 + Math.sin(this.gait * .5) * .018 * bobScale + strafe * .07 - this.leanPose * .12 + drawTwist;
    // Sprint carries the gun across the chest, muzzle high for pistols, canted for long guns.
    const sprintPos = v3(spec.sprint.pos), sprintRot = spec.sprint.rot;
    px += sprintPos.x * sprint; py += sprintPos.y * sprint; pz += sprintPos.z * sprint;
    rx += sprintRot[0] * sprint * (1 + Math.sin(this.gait) * .06); ry += sprintRot[1] * sprint; rz += sprintRot[2] * sprint;
    // ---- reload choreography (weapon part)
    const keys = weapon === 'pistol' ? pistolReload(this.reloadEmpty) : weapon === 'smg' ? smgReload(this.reloadEmpty) : weapon === 'm4' ? m4Reload(this.reloadEmpty) :
      weapon === 'dmr' ? dmrReload(this.reloadEmpty) : weapon === 'sniper' ? sniperReload(this.reloadEmpty) : weapon === 'coco' ? cocoReload(this.reloadAmmo) : sortedReloads[weapon];
    const cycling = weapon === 'sniper' && this.shotLife > 0 && reload < 0;
    const shotPhase = 1 - this.shotLife / weaponShotDuration(weapon);
    const sample = reload >= 0 && keys ? sampleChoreo(keys, reload, this.sample) : cycling ? sampleChoreo(SNIPER_CYCLE, shotPhase, this.sample) : null;
    if (cycling) {
      for (const key of SNIPER_CYCLE) if (key.sfx && key.t > this.lastShotCycle && key.t <= shotPhase) this.onFoley(key.sfx);
      this.lastShotCycle = shotPhase;
    } else this.lastShotCycle = -1;
    // Foley: every key the reload passed since the last frame plays its cue once.
    if (keys && reload >= 0) {
      for (const key of keys) if (key.sfx && key.t > this.lastReload && key.t <= reload) this.onFoley(key.sfx);
      this.lastReload = reload;
    } else this.lastReload = -1;
    const choreo = reload >= 0 && !keys ? this.reloadPose(model, reload) : null;
    if (choreo) { px += choreo.px; py += choreo.py; pz += choreo.pz; rx += choreo.rx; ry += choreo.ry; rz += choreo.rz; }
    if (sample) { px += sample.p.x; py += sample.p.y; pz += sample.p.z; rx += sample.r.x; ry += sample.r.y; rz += sample.r.z; }
    // Shell-by-shell reloads keep the loading port canted toward the paw between shells.
    this.reloadHold = damp(this.reloadHold, reloading && spec.reload === 'shotgun' ? 1 : 0, 9, dt);
    if (this.reloadHold > .001) { const h = this.reloadHold; px -= .05 * h; py += .05 * h; pz -= .02 * h; rx += .2 * h; ry += .18 * h; rz -= 1.05 * h; }
    this.holder.position.set(position.x + px, position.y + py, position.z + pz);
    this.offset.setFromEuler(this.euler.set(rx, ry, rz, 'YXZ'));
    this.holder.quaternion.copy(rotation).multiply(this.offset);
    this.holder.scale.setScalar(spec.scale);
    this.updateMelee(weapon, dt, settings.reducedMotion);
    this.restPosition.copy(this.holder.position); this.restRotation.copy(this.holder.quaternion);
    const inspect = this.inspectTime >= 0 ? this.applyInspect(weapon, dt, settings.reducedMotion) : null;
    this.animateParts(model, reload, choreo, sample, ammo);
    this.flashLight = Math.max(0, this.flashLight - dt / .07);
    this.muzzleLight.intensity = this.flashLight * this.flashLight * 7;
    if (this.flashLight > 0) { this.holder.updateMatrixWorld(true); model.muzzle.getWorldPosition(this.muzzleLight.position); }
    this.solveArms(model, spec.grips, choreo, sample ?? inspect, spec.shoulders);
    if (import.meta.env.DEV) this.debugOrbit();
  }

  // QA lab: window.__vmOrbit = { yaw, pitch, distance, target: [x, y, z] } views the rig from outside.
  private debugOrbit() {
    const orbit = (globalThis as { __vmOrbit?: { yaw: number; pitch: number; distance: number; target: number[] } }).__vmOrbit;
    if (!orbit) { this.camera.position.set(0, 0, 0); this.camera.quaternion.identity(); return; }
    const t = new THREE.Vector3(orbit.target[0], orbit.target[1], orbit.target[2]);
    this.camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch)).multiplyScalar(orbit.distance).add(t);
    this.camera.lookAt(t);
  }

  private resetMotion() {
    if (this.reloadEnd && this.models[this.active]) this.animateParts(this.models[this.active], -1, null, null);
    this.lastReload = -1; this.reloadEmpty = false; this.reloadAmmo = 0;
    this.shotgunReloading = false; this.shotgunBeganEmpty = false; this.shotgunPumpLife = 0; this.lastShotCycle = -1;
    this.cancelInspect(); this.inspectAllowed = false; this.lastYaw = undefined;
    for (const spring of [this.kickZ, this.kickPitch, this.kickRoll, this.kickYaw, this.swayYaw, this.swayPitch, this.swayRoll, this.strafe, this.land, this.crouchDip]) spring.reset();
    this.swimPose = 0; this.swimming = false; this.sprintPose = 0; this.movePose = 0; this.wallPose = 0; this.leanPose = 0;
    this.gait = 0; this.time = 0;
    this.meleeTime = MELEE_SECONDS; this.meleeSide = -1; this.meleeCount = 0; this.meleeStop = 0; this.meleeHit = false; this.smear.visible = false;
    this.shotLife = 0; this.reloadEnd = 0; this.ads = 0; this.draw = 0; this.holster = 0;
    sampleMelee(MELEE_SECONDS, this.meleeSide, this.meleePose);
  }

  // Weapon offsets plus the support paw's job for each reload family.
  private reloadPose(model: Model, t: number): Choreo {
    const c: Choreo = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, support: 0, supportPos: new THREE.Vector3(), mag: 'in', magOut: 0, slide: 0 };
    const style = model.spec.reload;
    if (style === 'pistol' || style === 'rifle') {
      // Tilt the gun to show the well, drop the old magazine, fetch and seat a
      // new one, then rack or release the slide and settle back to the grip.
      const tilt = window01(t, 0, .14) * (1 - window01(t, .82, 1));
      c.rx += tilt * .22; c.rz += tilt * (style === 'pistol' ? .55 : -.45); c.ry += tilt * (style === 'pistol' ? .18 : -.1);
      c.px += tilt * (style === 'pistol' ? -.035 : -.02); c.py += tilt * .02;
      const eject = window01(t, .12, .24);
      const fetch = window01(t, .16, .38), bring = window01(t, .38, .62), seat = window01(t, .62, .72);
      c.support = window01(t, .08, .2) * (1 - window01(t, .8, .94));
      // Magazine: in -> falling -> hidden -> in the paw -> seated.
      if (t < .12) c.mag = 'in';
      else if (t < .38) { c.mag = 'drop'; c.magOut = eject; }
      else if (t < .62) { c.mag = 'hand'; c.magOut = 1 - bring; }
      else { c.mag = 'in'; c.magOut = (1 - seat) * .35; }
      // Support paw path: down to the belt, back up under the well.
      c.supportPos.set(-.02 - fetch * .08 + bring * .08, -.12 - fetch * .22 + bring * .22 - seat * .02, .04 + fetch * .08 - bring * .08);
      // Seating shoves the gun up; the slide snaps home a beat later.
      const shove = bump(t, .66, .71, .8);
      c.py += shove * .018; c.rx += shove * .06;
      c.slide = window01(t, .12, .16) * (1 - window01(t, .8, .84));
      const snap = bump(t, .8, .83, .92);
      c.pz += snap * .02; c.rx += snap * .05;
    } else {
      // Families without authored paws yet: a clean dip and tilt.
      const dip = bump(t, 0, .3, 1);
      c.py -= dip * .06; c.rx += dip * .3; c.rz -= dip * .35; c.support = dip;
      c.supportPos.set(-.05, -.18 * dip, .05);
      c.mag = 'in'; c.magOut = model.parts.mag ? Math.sin(Math.PI * t) : 0;
    }
    return c;
  }

  private animateParts(model: Model, reload: number, choreo: Choreo | null, sample: ChoreoSample | null, ammo = WEAPONS[model.id].magazine) {
    for (const [part, rest] of model.rest) { part.position.copy(rest.position); part.quaternion.copy(rest.quaternion); }
    const { slide, trigger, hammer, mag, action } = model.parts;
    const total = weaponShotDuration(model.id);
    const cycle = this.shotLife > 0 ? Math.sin(Math.PI * THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1)) : 0;
    const locked = sample?.parts.slide ?? choreo?.slide ?? (model.id === 'pistol' && this.pistolEmpty ? 1 : 0);
    if (slide) slide.position.z += Math.max(cycle, locked) * .028;
    if (trigger) trigger.rotation.x -= (this.shotLife > total * .5 ? .3 : 0);
    if (hammer) hammer.rotation.x += cycle * -.6;
    const phase = this.shotLife > 0 ? THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1) : 1;
    const { cylinder, crane, rounds, pump, bolt, charge } = model.parts;
    if (pump) {
      // Rack after the shot: back, then home. Reloads can drive it too.
      const racked = window01(phase, .25, .5) * (1 - window01(phase, .6, .85));
      const finish = model.id === 'shotgun' && this.shotgunPumpLife > 0 ? 1 - this.shotgunPumpLife / .42 : 0;
      const finalRack = window01(finish, .05, .35) * (1 - window01(finish, .60, .90));
      pump.position.z += Math.max(racked, finalRack, sample?.parts.pump ?? 0) * (model.id === 'coco' ? .07 : .085);
    }
    if (cylinder && model.crane) {
      this.cylinderSpin = damp(this.cylinderSpin, this.cylinderTarget, 22, this.lastDt);
      this.offset.setFromAxisAngle(AXIS_Z, (sample?.parts.swing ?? 0) * 1.3);
      const cases = [model.parts.case0, model.parts.case1, model.parts.case2, model.parts.case3, model.parts.case4, model.parts.case5];
      for (const part of [cylinder, crane, action, rounds, ...cases]) if (part) {
        const rest = model.rest.get(part)!;
        part.position.copy(rest.position).sub(model.crane).applyQuaternion(this.offset).add(model.crane);
        part.quaternion.copy(this.offset).multiply(rest.quaternion);
        if (part !== crane) part.quaternion.multiply(this.quat.setFromAxisAngle(AXIS_Z, -this.cylinderSpin));
      }
      if (action) action.position.z += (sample?.parts.eject ?? 0) * .030;
      if (rounds) {
        const spent = sample?.parts.spent ?? 0, fresh = sample?.parts.fresh ?? 0;
        rounds.visible = fresh > .5 || spent < .002;
      }
      const spent = sample?.parts.spent ?? 0;
      cases.forEach((part, i) => {
        if (!part) return;
        part.visible = spent > .001 && spent < .995;
        const tip = model.liveTips?.[i];
        if (tip) tip.visible = part.visible && i < this.reloadAmmo;
        if (!part.visible) return;
        const free = Math.max(0, spent - .18), a = i * Math.PI / 3;
        part.position.z += spent * .20;
        part.position.x += (Math.cos(a) * .045 - .14) * free;
        part.position.y += Math.sin(a) * free * .03 - free * free * .08;
        part.rotation.x += free * (i % 2 ? 2.2 : -1.8);
        part.rotation.y += free * (i - 2.5) * .55;
        if (tip) { tip.position.copy(part.position); tip.quaternion.copy(part.quaternion); }
      });
    }
    if (model.parts.ribbons) {
      const moving = this.meleeTime < MELEE_SECONDS ? Math.sin(this.meleeTime * 22 - .8) : 0;
      // The cloth hangs in world gravity as the blade rolls in the paw.
      model.parts.ribbons.quaternion.copy(this.holder.quaternion).invert().multiply(this.inverseView);
      model.parts.ribbons.rotation.x += Math.sin(this.time * 4.1) * .055 + moving * .34;
      model.parts.ribbons.rotation.z += Math.sin(this.time * 3.7 + .6) * .045 + moving * .20;
    }
    if (bolt && model.id === 'm4') {
      bolt.position.z += Math.max(cycle, sample?.parts.bolt ?? 0) * .035;
    } else if (bolt && model.id === 'sniper') {
      bolt.quaternion.multiply(this.quat.setFromAxisAngle(AXIS_Z, (sample?.parts.bolt ?? 0) * 1.1));
      bolt.position.z += (sample?.parts.boltPull ?? 0) * .075;
    }
    if (model.parts.release) {
      if (model.id === 'revolver') model.parts.release.position.z -= (sample?.parts.release ?? 0) * .004;
      else model.parts.release.rotation.z += (sample?.parts.release ?? 0) * .20;
    }
    if (model.id === 'smg' && action) action.position.z += Math.max(cycle, sample?.parts.charge ?? 0) * .052;
    if (charge) charge.position.z += (sample?.parts.charge ?? 0) * .065;
    if (mag && !sample?.mag && (model.spec.reload === 'revolver' || model.spec.reload === 'shotgun')) mag.visible = false;
    else if (mag && sample?.mag) {
      const m = sample.mag;
      mag.visible = m.visible;
      mag.position.addScaledVector(model.magAxis, m.out).add(m.p);
      mag.quaternion.multiply(this.offset.setFromEuler(this.euler.set(m.r.x, m.r.y, m.r.z, 'XYZ')));
    } else if (mag && choreo) {
      if (choreo.mag === 'drop') {
        // Falls out along the well, then drops out of frame.
        const out = choreo.magOut;
        mag.position.addScaledVector(model.magAxis, out * .09);
        mag.position.y -= out * out * .6; mag.rotation.x += out * .9; mag.rotation.z += out * .5;
        mag.visible = out < .98;
      } else if (choreo.mag === 'hand') {
        mag.visible = true;
        mag.position.addScaledVector(model.magAxis, .03 + choreo.magOut * .5);
        mag.position.x -= choreo.magOut * .06; mag.rotation.z -= choreo.magOut * .6;
      } else {
        mag.visible = true;
        mag.position.addScaledVector(model.magAxis, choreo.magOut * .06);
      }
    } else if (mag && model.spec.reload !== 'revolver' && model.spec.reload !== 'shotgun') mag.visible = true;
    if (model.id === 'coco') {
      if (mag && !sample?.mag) mag.visible = ammo >= 4;
      if (model.parts.load1) model.parts.load1.visible = (sample?.parts.load1 ?? (ammo >= 3 ? 1 : 0)) >= .5;
      if (model.parts.load2) model.parts.load2.visible = (sample?.parts.load2 ?? (ammo >= 2 ? 1 : 0)) >= .5;
    }
    if (model.id === 'revolver' && rounds && mag && (sample?.parts.fresh ?? 0) > .5 && (sample?.parts.loaded ?? 0) < .5) {
      // Cartridges share the loader's frame until released into the chambers.
      rounds.position.copy(mag.position); rounds.quaternion.copy(mag.quaternion); rounds.visible = mag.visible;
    }
    void reload;
  }

  private furPreset: Settings['graphics'] | null = null;
  private reloadHold = 0;
  private lastReload = -1;
  /** Local Foley cues (reload mechanics, draws). */
  onFoley: (cue: string) => void = () => {};
  private cylinderSpin = 0;
  private cylinderTarget = 0;
  private lastDt = 1 / 60;

  private gripTarget(model: Model, grip: GripSpec, out: HandTarget) {
    const m = this.holder.matrixWorld;
    out.wrist.set(grip.wrist[0], grip.wrist[1], grip.wrist[2]);
    const follow = grip.part ? model.parts[grip.part as keyof Parts] : undefined;
    if (follow) out.wrist.add(follow.position).sub(model.rest.get(follow)!.position);
    out.wrist.applyMatrix4(m);
    const rot = this.quat.setFromRotationMatrix(m);
    out.forward.set(grip.forward[0], grip.forward[1], grip.forward[2]).normalize().applyQuaternion(rot);
    out.palm.set(grip.palm[0], grip.palm[1], grip.palm[2]).normalize().applyQuaternion(rot);
    out.curl = grip.curl; out.pole.set(grip.pole[0], grip.pole[1], grip.pole[2]).normalize();
    void model;
  }

  private solveArms(model: Model, grips: ViewSpec['grips'], choreo: Choreo | null, sample: ChoreoSample | null, shoulders = model.spec.shoulders) {
    const arms = this.arms;
    if (!arms) return;
    this.holder.updateMatrixWorld(true);
    this.gripTarget(model, grips.R, this.targetR);
    if (sample?.R) this.blendHand(model, grips.R, sample.R, this.targetR);
    v3((shoulders ?? SHOULDERS).R, this.shoulderR); v3((shoulders ?? SHOULDERS).L, this.shoulderL);
    arms.right.solve(this.shoulderR, this.targetR);
    const L = grips.L;
    arms.setVisible(true, !!L || this.swimPose > .5);
    if (L) {
      this.gripTarget(model, L, this.targetL);
      if (choreo && choreo.support > 0) {
        // Blend the support paw toward its choreography point (camera space, relative to the gun).
        const away = new THREE.Vector3().copy(choreo.supportPos).add(this.holder.position);
        this.targetL.wrist.lerp(away, choreo.support);
        this.targetL.forward.lerp(new THREE.Vector3(.3, .5, -1).normalize(), choreo.support).normalize();
        this.targetL.palm.lerp(new THREE.Vector3(.6, 0, .2).normalize(), choreo.support).normalize();
        this.targetL.curl = blendCurl(L.curl, OPEN_CURL, choreo.support * .6);
      }
      if (model.id === 'machete') {
        // The free paw guards low on the left; it does not follow the blade.
        const cut = this.meleeTime < MELEE_SECONDS ? Math.sin(Math.PI * this.meleeTime / MELEE_SECONDS) : 0;
        this.targetL.wrist.set(-.23 - cut * .06, -.22 - cut * .11, -.39 + cut * .05);
        this.targetL.forward.set(.18, .12, -1).normalize();
        this.targetL.palm.set(.2, -.95, -.05).normalize();
      }
      if (sample?.L) this.blendHand(model, L, sample.L, this.targetL);
      arms.left.solve(this.shoulderL, this.targetL);
    }
  }

  private readonly handA: HandTarget = { wrist: new THREE.Vector3(), forward: new THREE.Vector3(), palm: new THREE.Vector3(), curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3() };
  private readonly handB: HandTarget = { wrist: new THREE.Vector3(), forward: new THREE.Vector3(), palm: new THREE.Vector3(), curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3() };
  private readonly sample: ChoreoSample = newSample();
  private readonly inspectSample: ChoreoSample = newSample();
  private readonly partOrigin = new THREE.Vector3();

  private resolveHand(model: Model, grip: GripSpec, key: HandKey, out: HandTarget) {
    if (key.space === 'grip') {
      const offset = key.offset;
      const clearGrip = offset ? { ...grip, wrist: [grip.wrist[0] + offset[0], grip.wrist[1] + offset[1], grip.wrist[2] + offset[2]] as V3 } : grip;
      this.gripTarget(model, clearGrip, out);
      if (key.curl) out.curl = { ...grip.curl, ...key.curl };
      if (key.pole) out.pole.fromArray(key.pole).normalize();
      return;
    }
    const spec: GripSpec = { wrist: key.wrist ?? grip.wrist, forward: key.forward ?? grip.forward, palm: key.palm ?? grip.palm, curl: { ...grip.curl, ...key.curl }, pole: key.pole ?? grip.pole };
    if (key.space === 'gun') { this.gripTarget(model, spec, out); return; }
    out.wrist.set(spec.wrist[0], spec.wrist[1], spec.wrist[2]);
    out.forward.set(spec.forward[0], spec.forward[1], spec.forward[2]).normalize();
    out.palm.set(spec.palm[0], spec.palm[1], spec.palm[2]).normalize();
    out.curl = spec.curl; out.pole.fromArray(spec.pole).normalize();
    if (key.space === 'part') {
      const part = model.parts[key.part as keyof Parts];
      if (!part) throw new Error(`Reload contact part missing: ${model.id}/${key.part}`);
      if (key.followRotation === false) {
        this.holder.worldToLocal(part.getWorldPosition(this.partOrigin));
        out.wrist.add(this.partOrigin).applyMatrix4(this.holder.matrixWorld);
        this.holder.getWorldQuaternion(this.quat);
      } else {
        out.wrist.applyMatrix4(part.matrixWorld);
        part.getWorldQuaternion(this.quat);
      }
      out.forward.applyQuaternion(this.quat); out.palm.applyQuaternion(this.quat);
    }
  }

  private blendHand(model: Model, grip: GripSpec, pair: { a: HandKey; b: HandKey; u: number }, out: HandTarget) {
    this.resolveHand(model, grip, pair.a, this.handA); this.resolveHand(model, grip, pair.b, this.handB);
    const u = pair.u;
    out.wrist.copy(this.handA.wrist).lerp(this.handB.wrist, u);
    out.forward.copy(this.handA.forward).lerp(this.handB.forward, u).normalize();
    out.palm.copy(this.handA.palm).lerp(this.handB.palm, u).normalize();
    out.curl = blendCurl(this.handA.curl, this.handB.curl, u);
    out.pole.copy(this.handA.pole).lerp(this.handB.pole, u).normalize();
  }

  private applyInspect(weapon: WeaponId, dt: number, reducedMotion: boolean): ChoreoSample | null {
    this.inspectTime += dt;
    const progress = Math.min(1, this.inspectTime / 1.8);
    const authored = SHORT_INSPECTS[weapon] ?? LONG_INSPECTS[weapon];
    if (authored) {
      const pose = sampleChoreo(authored, progress, this.inspectSample), amount = reducedMotion ? .35 : 1;
      this.holder.position.addScaledVector(pose.p, amount);
      this.offset.setFromEuler(this.euler.set(pose.r.x * amount, pose.r.y * amount, pose.r.z * amount, 'YXZ'));
      this.holder.quaternion.multiply(this.offset);
      if (progress === 1) this.inspectTime = -1;
      return progress < 1 ? pose : null;
    }
    const look = Math.sin(Math.PI * progress) ** 2 * (reducedMotion ? .35 : 1);
    const showLongGun = weapon === 'm4' || weapon === 'shotgun' || weapon === 'sniper' || weapon === 'dmr' || weapon === 'coco';
    this.holder.position.x -= look * .08; this.holder.position.y += look * .05;
    this.holder.position.z += look * (showLongGun ? -.16 : .05);
    const rotation = weapon === 'coco' ? [.08, .5, .08] : showLongGun ? [.1, .45, -.25] :
      weapon === 'machete' ? [.2, -.2, -.3] : [.2, -.75, .45];
    this.offset.setFromEuler(this.euler.set(look * rotation[0], look * rotation[1], look * rotation[2], 'YXZ'));
    this.holder.quaternion.multiply(this.offset);
    if (progress === 1) this.inspectTime = -1;
    return null;
  }

  private updateMelee(weapon: WeaponId, dt: number, reducedMotion: boolean) {
    this.smear.visible = false;
    if (weapon !== 'machete') { sampleMelee(MELEE_SECONDS, this.meleeSide, this.meleePose); return; }
    let step = dt;
    if (reducedMotion) { this.meleeStop = 0; this.meleeHit = false; }
    if (this.meleeStop > 0) { const held = Math.min(step, this.meleeStop); step -= held; this.meleeStop -= held; }
    if (this.meleeHit && this.meleeTime < MELEE_CONTACT && this.meleeTime + step >= MELEE_CONTACT) {
      const remaining = step - (MELEE_CONTACT - this.meleeTime);
      this.meleeTime = MELEE_CONTACT; this.meleeStop = Math.max(0, MELEE_HIT_STOP - remaining);
      step = Math.max(0, remaining - MELEE_HIT_STOP); this.meleeHit = false;
    }
    this.meleeTime = Math.min(MELEE_SECONDS, this.meleeTime + step);
    const pose = sampleMelee(this.meleeTime, this.meleeSide, this.meleePose), amount = reducedMotion ? .55 : 1;
    if (this.meleeCount > 0 && this.meleeCount % 3 === 0) {
      // The third cut is an overhead chop. Its contact and recovery still fit
      // the authoritative melee cadence and the normal hit-stop window.
      sampleHeavyMelee(this.meleeTime, pose);
    }
    this.holder.position.x += pose.x * amount; this.holder.position.y += pose.y * amount; this.holder.position.z += pose.z * amount;
    // Camera-space swings keep the cutting arc independent of the grip roll.
    this.offset.setFromEuler(this.euler.set(-pose.pitch * 1.2 * amount, pose.yaw * amount, pose.roll * amount, 'YXZ'));
    this.holder.quaternion.premultiply(this.offset);
    this.holder.updateWorldMatrix(true, true);
    this.models.machete.muzzle.getWorldPosition(this.trailTip);
    this.trailBase.set(0, .07, .01).applyMatrix4(this.models.machete.group.matrixWorld);
    if (!reducedMotion && pose.smear > .01 && this.meleeStop <= 0) {
      if (dt > 0) {
        const position = this.smear.geometry.getAttribute('position');
        const points = [this.lastTrailBase, this.lastTrailTip, this.trailTip, this.lastTrailBase, this.trailTip, this.trailBase];
        points.forEach((p, i) => position.setXYZ(i, p.x, p.y, p.z)); position.needsUpdate = true;
      }
      this.smear.material.opacity = pose.smear * .27; this.smear.visible = true;
    }
    if (dt > 0) { this.lastTrailBase.copy(this.trailBase); this.lastTrailTip.copy(this.trailTip); }
  }

  cameraFeedback(camera: THREE.Camera, reducedMotion: boolean) {
    if (reducedMotion || !this.holder.visible) return;
    if (this.active === 'machete') {
      camera.rotateX(-this.meleePose.kick * .012);
      camera.rotateZ(this.meleePose.kick * this.meleeSide * .009);
      return;
    }
    // A touch of the gun's roll reaches the view; aim itself is never moved here.
    camera.rotateZ(this.kickRoll.value * .0012);
  }

  resize(width: number, height: number) { this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); }
  get adsAmount() { return this.ads * this.ads * (3 - 2 * this.ads); }
  get weapon() { return this.active; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.arms?.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.effects) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  }
}

interface Choreo { px: number; py: number; pz: number; rx: number; ry: number; rz: number;
  support: number; supportPos: THREE.Vector3; mag: 'in' | 'drop' | 'hand'; magOut: number; slide: number }
const AXIS_Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const FUR_BY_PRESET: Record<Settings['graphics'], number> = { low: 4, medium: 8, high: 12 };
const OPEN_CURL: HandCurl = { index: [.35, .3, .2], middle: [.4, .35, .2], ring: [.45, .35, .25], thumb: [.2, .1, .1] };
