import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AssetLoader } from './assets';
import { ArmsRig, FP_ARMS_URL, type HandTarget, type HandCurl } from './fp-arms';
import { VIEW_SPECS, type GripSpec, type ViewSpec, type V3 } from './viewmodel-specs';
import { newSample, sampleChoreo, type ChoreoSample, type HandKey } from './viewmodel-choreo';
import { RELOADS } from './viewmodel-anims';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';
import { damp } from '../shared/math';
import { Spring } from './spring';
import { PAINT } from './materials';
import { RARITY } from '../shared/rarity';
import { advanceAds, WEAPONS } from '../shared/weapons';
import { sampleMelee, smoothPose, weaponShotDuration,
  MELEE_SECONDS, MELEE_CONTACT, MELEE_HIT_STOP, type MeleePose } from '../shared/weapon-presentation';
import type { ActorState, Settings, WeaponId } from '../shared/types';
import { swimReady } from '../shared/inventory';

// Viewmodel FOV (vertical). Narrower than the world so the paws and guns keep
// their proportions instead of stretching toward the screen edges.
export const VIEWMODEL_FOV = 58;

const v3 = (value: V3, out = new THREE.Vector3()) => out.set(value[0], value[1], value[2]);
const ease = (t: number) => { const x = THREE.MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const window01 = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const bump = (t: number, a: number, peak: number, b: number) => window01(t, a, peak) * (1 - window01(t, peak, b));

interface Parts { slide?: THREE.Object3D; mag?: THREE.Object3D; trigger?: THREE.Object3D; hammer?: THREE.Object3D; action?: THREE.Object3D;
  cylinder?: THREE.Object3D; pump?: THREE.Object3D; bolt?: THREE.Object3D; charge?: THREE.Object3D; pouch?: THREE.Object3D }
interface Model {
  id: WeaponId; spec: ViewSpec; group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D; sight: THREE.Vector3;
  parts: Parts; rest: Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>;
  grips: { R: GripSpec; L?: GripSpec }; magAxis: THREE.Vector3; rarity: number; accent: ReturnType<typeof applyRarityAccent>[];
  crane?: THREE.Vector3; bands?: THREE.Mesh[]; tips?: THREE.Object3D[];
}
const sortedReloads = Object.fromEntries(Object.entries(RELOADS).map(([id, keys]) => [id, [...keys!].sort((a, b) => a.t - b.t)]));

const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot', 'revolver', 'coco'];

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
  private reloadDuration = 1;
  private wallPose = 0;
  private leanPose = 0;
  private meleeTime = MELEE_SECONDS;
  private meleeSide = -1;
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
  private readonly shoulderR = new THREE.Vector3(.27, -.36, .14);
  private readonly shoulderL = new THREE.Vector3(-.27, -.36, .14);
  private readonly targetR: HandTarget;
  private readonly targetL: HandTarget;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quat = new THREE.Quaternion();
  private readonly offset = new THREE.Quaternion();
  private disposed = false;
  readonly assets: Promise<void>;

  constructor(private readonly loader: AssetLoader, onAssetsReady: () => void = () => {}) {
    this.scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, .75));
    this.key.position.set(-70, 32, -30); this.rim.position.set(-70, 65, -30); this.fill.position.set(60, 10, 40);
    this.scene.add(this.key, this.rim, this.fill);
    this.scene.add(this.holder);
    this.smear.name = 'Machete motion smear'; this.smear.visible = false; this.smear.frustumCulled = false;
    this.smear.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    this.smear.renderOrder = 2; this.scene.add(this.smear);
    const target = (): HandTarget => ({ wrist: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), palm: new THREE.Vector3(0, -1, 0),
      curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3(0, -1, 0) });
    this.targetR = target(); this.targetL = target();
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
        cylinder: get('cylinder'), pump: get('pump'), bolt: get('bolt'), charge: get('charge'), pouch: get('pouch') },
      rest: new Map(), grips: spec.grips, magAxis: new THREE.Vector3(0, -1, 0), rarity: -1, accent };
    // Blender axis (x, y, z) is (x, z, -y) here.
    const axis = (arsenalMetrics as Record<string, { magAxis?: number[] }>)[id]?.magAxis;
    if (axis) model.magAxis.set(axis[0], axis[2], -axis[1]).normalize();
    const crane = (arsenalMetrics as Record<string, { crane?: number[] }>)[id]?.crane;
    if (crane) model.crane = new THREE.Vector3(crane[0], crane[2], -crane[1]);
    if (id === 'slingshot') {
      // Surgical tubing: two unit cylinders stretched each frame from the fork tips to the pouch.
      const material = new THREE.MeshStandardMaterial({ color: '#f07a2a', roughness: .55 });
      const geometry = new THREE.CylinderGeometry(.0042, .0042, 1, 10, 1, true); geometry.translate(0, .5, 0);
      model.bands = [new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)];
      model.tips = [get('tip_l')!, get('tip_r')!];
      for (const band of model.bands) { band.frustumCulled = false; root.add(band); }
    }
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
      this.meleeTime = 0; this.meleeSide *= -1; this.meleeHit = contact; this.meleeStop = 0;
    } else {
      if (id === 'revolver') this.cylinderTarget += Math.PI / 3;
      const recoil = this.models[id]?.spec.recoil ?? VIEW_SPECS[id].recoil;
      const scale = 1 - this.adsAmount * .45;
      const alternate = this.shotCount++ % 2 ? 1 : -1;
      this.kickZ.impulse(recoil.kick * scale);
      this.kickPitch.impulse(recoil.climb * (1 - this.adsAmount * .6));
      this.kickRoll.impulse(recoil.roll * alternate * (.6 + Math.random() * .6) * scale);
      this.kickYaw.impulse((Math.random() - .5) * recoil.roll * .5 * scale);
    }
    this.shotLife = weaponShotDuration(id);
  }

  // Barrel tip and ejection port of the held weapon, in this scene's (camera) space.
  muzzleWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].muzzle.getWorldPosition(target); }
  ejectWorld(target: THREE.Vector3) { this.scene.updateMatrixWorld(true); return this.models[this.active].eject.getWorldPosition(target); }

  update(actor: ActorState | undefined, dt: number, settings: Settings, closeWall: number, simulationTime: number, viewRotation?: THREE.Quaternion) {
    if (viewRotation) {
      this.inverseView.copy(viewRotation).invert();
      this.key.position.set(-70, 32, -30).applyQuaternion(this.inverseView);
      this.rim.position.set(-70, 65, -30).applyQuaternion(this.inverseView);
      this.fill.position.set(60, 10, 40).applyQuaternion(this.inverseView);
    }
    const ready = !!this.models[this.active];
    this.holder.visible = ready && !!actor && actor.alive && actor.stage === 'ground' && !(actor.emote && actor.emoteUntil > simulationTime);
    if (this.arms) this.arms.group.visible = this.holder.visible;
    if (!actor || !this.holder.visible) { this.resetMotion(); return; }
    const requested = actor.weapons[actor.slot]?.id || 'pistol';
    if (requested !== this.active && this.models[requested]) {
      this.cancelInspect(); this.holster = Math.min(1, this.holster + dt / .13);
      if (this.holster >= 1) {
        this.models[this.active].group.visible = false; this.drawFrom = this.active; this.active = requested; this.models[this.active].group.visible = true;
        this.draw = 1; this.holster = 0; this.reloadEnd = 0; this.ads = 0; this.kickZ.reset(); this.kickPitch.reset();
        this.meleeTime = MELEE_SECONDS; this.meleeStop = 0;
      }
    } else this.holster = damp(this.holster, 0, 20, dt);
    const weapon = this.active, model = this.models[weapon];
    let spec = model.spec;
    if (import.meta.env.DEV) {
      // QA tuning: window.__vmTune = { pistol: { hip: {...}, grips: {...}, fov } } overrides the spec live.
      const tune = (globalThis as { __vmTune?: Record<string, Partial<ViewSpec> & { fov?: number }> }).__vmTune?.[weapon];
      if (tune) { spec = { ...spec, ...tune, grips: { ...model.grips, ...tune.grips } }; if (tune.fov) { this.camera.fov = tune.fov; this.camera.updateProjectionMatrix(); } }
    }
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
    this.time += dt; this.lastDt = dt;
    const reloading = requested === weapon && actor.reloadUntil > simulationTime;
    this.inspectAllowed = requested === weapon && !actor.swimming && !actor.ads && !actor.sprint && !reloading &&
      this.shotLife <= 0 && (weapon !== 'machete' || this.meleeTime >= MELEE_SECONDS);
    if (!this.inspectAllowed) this.cancelInspect();
    if (reloading && actor.reloadUntil > this.reloadEnd + .01) {
      this.reloadEnd = actor.reloadUntil;
      this.reloadDuration = Math.max(.3, Math.min(WEAPONS[weapon].reload || 1, actor.reloadUntil - simulationTime + .02));
    }
    const reload = reloading ? THREE.MathUtils.clamp(1 - (this.reloadEnd - simulationTime) / this.reloadDuration, 0, 1) : -1;

    // ---- aim state
    const wantAds = actor.ads && !actor.swimming && !reloading && !actor.sprint && weapon !== 'machete' && this.draw < .5;
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
    this.draw = Math.max(0, this.draw - dt / .3);
    this.shotLife = Math.max(0, this.shotLife - dt);

    // ---- base pose: hip to sights
    const hip = v3(spec.hip.pos), hipRot = this.quat.setFromEuler(this.euler.set(spec.hip.rot[0], spec.hip.rot[1], spec.hip.rot[2], 'YXZ'));
    const sightOffset = model.sight.clone().multiplyScalar(spec.scale);
    const adsPos = new THREE.Vector3(0, 0, -spec.adsDistance).sub(sightOffset);
    const position = hip.lerp(adsPos, ads);
    const rotation = hipRot.slerp(new THREE.Quaternion(), ads);
    // ---- additive layers (x right, y up, z back; pitch up, yaw left, roll left)
    const bobScale = motion * this.movePose * (1 - ads * .85) * (1 + sprint * .9);
    const bobX = Math.sin(this.gait * .5) * .011 * bobScale, bobY = -Math.abs(Math.cos(this.gait * .5)) * .009 * bobScale + .0045 * bobScale;
    const breath = Math.sin(this.time * 1.6) * .0022 * motion * (1 - ads * .8) * (1 - sprint);
    const lowered = smoothPose(Math.min(1, this.holster + this.draw));
    const drawTwist = this.draw > 0 ? Math.sin(this.draw * Math.PI) * .25 : 0;
    const swimLow = this.swimPose * (swimReady(weapon) ? .35 : 1);
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
    const keys = sortedReloads[weapon];
    const sample = reload >= 0 && keys ? sampleChoreo(keys, reload, this.sample) : null;
    const choreo = reload >= 0 && !keys ? this.reloadPose(model, reload) : null;
    if (choreo) { px += choreo.px; py += choreo.py; pz += choreo.pz; rx += choreo.rx; ry += choreo.ry; rz += choreo.rz; }
    if (sample) { px += sample.p.x; py += sample.p.y; pz += sample.p.z; rx += sample.r.x; ry += sample.r.y; rz += sample.r.z; }
    // Shell-by-shell reloads keep the loading port canted toward the paw between shells.
    this.reloadHold = damp(this.reloadHold, reloading && spec.reload === 'shotgun' ? 1 : 0, 9, dt);
    if (this.reloadHold > .001) { const h = this.reloadHold; px -= .03 * h; py += .035 * h; pz += .02 * h; rx += .22 * h; ry += .1 * h; rz -= .6 * h; }
    this.holder.position.set(position.x + px, position.y + py, position.z + pz);
    this.offset.setFromEuler(this.euler.set(rx, ry, rz, 'YXZ'));
    this.holder.quaternion.copy(rotation).multiply(this.offset);
    this.holder.scale.setScalar(spec.scale);
    this.updateMelee(weapon, dt, settings.reducedMotion);
    this.restPosition.copy(this.holder.position); this.restRotation.copy(this.holder.quaternion);
    if (this.inspectTime >= 0) this.applyInspect(weapon, dt, settings.reducedMotion);
    this.animateParts(model, reload, choreo, sample);
    this.solveArms(model, spec.grips, choreo, sample);
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
    this.cancelInspect(); this.inspectAllowed = false; this.lastYaw = undefined;
    for (const spring of [this.kickZ, this.kickPitch, this.kickRoll, this.kickYaw, this.swayYaw, this.swayPitch, this.swayRoll, this.strafe, this.land, this.crouchDip]) spring.reset();
    this.swimPose = 0; this.swimming = false; this.sprintPose = 0; this.movePose = 0; this.wallPose = 0; this.leanPose = 0;
    this.gait = 0; this.time = 0;
    this.meleeTime = MELEE_SECONDS; this.meleeSide = -1; this.meleeStop = 0; this.meleeHit = false; this.smear.visible = false;
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

  private animateParts(model: Model, reload: number, choreo: Choreo | null, sample: ChoreoSample | null) {
    for (const [part, rest] of model.rest) { part.position.copy(rest.position); part.quaternion.copy(rest.quaternion); }
    const { slide, trigger, hammer, mag, action } = model.parts;
    const total = weaponShotDuration(model.id);
    const cycle = this.shotLife > 0 ? Math.sin(Math.PI * THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1)) : 0;
    const locked = sample?.parts.slide ?? choreo?.slide ?? 0;
    if (slide) slide.position.z += Math.max(cycle, locked) * .028;
    if (trigger) trigger.rotation.x -= (this.shotLife > total * .5 ? .3 : 0);
    if (hammer) hammer.rotation.x += cycle * -.6;
    const phase = this.shotLife > 0 ? THREE.MathUtils.clamp(1 - this.shotLife / total, 0, 1) : 1;
    const { cylinder, pump, bolt, charge } = model.parts;
    if (pump) {
      // Rack after the shot: back, then home. Reloads can drive it too.
      const racked = window01(phase, .25, .5) * (1 - window01(phase, .6, .85));
      pump.position.z += Math.max(racked, sample?.parts.pump ?? 0) * (model.id === 'coco' ? .07 : .085);
    }
    if (cylinder && model.crane) {
      this.cylinderSpin = damp(this.cylinderSpin, this.cylinderTarget, 22, this.lastDt);
      const swing = (sample?.parts.swing ?? 0) * 1.3;
      const rest = model.rest.get(cylinder)!;
      this.offset.setFromAxisAngle(AXIS_Z, swing);
      cylinder.position.copy(rest.position).sub(model.crane).applyQuaternion(this.offset).add(model.crane);
      cylinder.position.z -= (sample?.parts.eject ?? 0) * .018;
      cylinder.quaternion.copy(this.offset).multiply(rest.quaternion).multiply(this.quat.setFromAxisAngle(AXIS_Z, -this.cylinderSpin));
    }
    if (bolt) {
      const cycled = model.id === 'sniper' && this.shotLife > 0 ? phase : -1;
      const open = cycled >= 0 ? window01(cycled, .12, .3) * (1 - window01(cycled, .74, .9)) : sample?.parts.bolt ?? 0;
      const pull = cycled >= 0 ? window01(cycled, .3, .47) * (1 - window01(cycled, .52, .72)) : sample?.parts.boltPull ?? 0;
      bolt.quaternion.multiply(this.quat.setFromAxisAngle(AXIS_Z, open * 1.1));
      bolt.position.z += pull * .075;
      this.boltHand = cycled >= 0 ? window01(cycled, .02, .14) * (1 - window01(cycled, .86, 1)) : sample?.parts.boltHand ?? 0;
    } else this.boltHand = 0;
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
    void reload;
  }

  private reloadHold = 0;
  private cylinderSpin = 0;
  private cylinderTarget = 0;
  private boltHand = 0;
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

  private solveArms(model: Model, grips: ViewSpec['grips'], choreo: Choreo | null, sample: ChoreoSample | null) {
    const arms = this.arms;
    if (!arms) return;
    this.holder.updateMatrixWorld(true);
    this.gripTarget(model, grips.R, this.targetR);
    if (sample?.R) this.blendHand(model, grips.R, sample.R, this.targetR);
    if (this.boltHand > 0 && model.parts.bolt) {
      // The firing paw leaves the grip to work the bolt knob.
      const knob = model.parts.bolt.localToWorld(this.handA.wrist.set(.05, -.024, -.004));
      this.targetR.wrist.lerp(knob.add(this.handB.wrist.set(.03, -.075, .07)), this.boltHand);
      this.targetR.forward.lerp(this.handB.forward.set(-.35, .7, -.6).normalize(), this.boltHand).normalize();
      this.targetR.palm.lerp(this.handB.palm.set(-.75, .1, -.6).normalize(), this.boltHand).normalize();
      this.targetR.curl = blendCurl(this.targetR.curl, BOLT_CURL, this.boltHand);
    }
    if (model.id === 'slingshot' && this.shotLife > 0) {
      // Release: the pinching paw springs toward the fork, then draws a new stone.
      const release = 1 - window01(1 - this.shotLife / weaponShotDuration('slingshot'), .15, 1);
      this.targetR.wrist.lerp(this.handA.wrist.set(.02, .02, .08).applyMatrix4(this.holder.matrixWorld), release * .85);
    }
    arms.right.solve(this.shoulderR, this.targetR);
    if (model.parts.pouch && model.bands && model.tips) this.stretchBands(model);
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
      if (sample?.L) this.blendHand(model, L, sample.L, this.targetL);
      arms.left.solve(this.shoulderL, this.targetL);
    }
  }

  private stretchBands(model: Model) {
    // The pouch sits in the right paw's pinch; the tubing runs from each fork tip to it.
    const pouch = model.parts.pouch!, root = pouch.parent!;
    const pinch = this.handA.wrist.copy(this.targetR.wrist).addScaledVector(this.targetR.forward, .085).addScaledVector(this.targetR.palm, -.012);
    root.updateMatrixWorld(true);
    pouch.position.copy(root.worldToLocal(pinch));
    model.bands!.forEach((band, i) => {
      const tip = root.worldToLocal(model.tips![i].getWorldPosition(this.handB.wrist));
      const span = this.handB.forward.subVectors(pouch.position, tip);
      band.position.copy(tip); band.scale.set(1, span.length(), 1);
      band.quaternion.setFromUnitVectors(UP, span.normalize());
    });
  }

  private readonly handA: HandTarget = { wrist: new THREE.Vector3(), forward: new THREE.Vector3(), palm: new THREE.Vector3(), curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3() };
  private readonly handB: HandTarget = { wrist: new THREE.Vector3(), forward: new THREE.Vector3(), palm: new THREE.Vector3(), curl: { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], thumb: [0, 0, 0] }, pole: new THREE.Vector3() };
  private readonly sample: ChoreoSample = newSample();

  private resolveHand(model: Model, grip: GripSpec, key: HandKey, out: HandTarget) {
    if (key.space === 'grip') { this.gripTarget(model, grip, out); return; }
    const spec: GripSpec = { wrist: key.wrist ?? grip.wrist, forward: key.forward ?? grip.forward, palm: key.palm ?? grip.palm, curl: key.curl ?? grip.curl, pole: grip.pole };
    if (key.space === 'gun') { this.gripTarget(model, spec, out); return; }
    out.wrist.set(spec.wrist[0], spec.wrist[1], spec.wrist[2]);
    out.forward.set(spec.forward[0], spec.forward[1], spec.forward[2]).normalize();
    out.palm.set(spec.palm[0], spec.palm[1], spec.palm[2]).normalize();
    out.curl = spec.curl; out.pole.set(grip.pole[0], grip.pole[1], grip.pole[2]).normalize();
  }

  private blendHand(model: Model, grip: GripSpec, pair: { a: HandKey; b: HandKey; u: number }, out: HandTarget) {
    this.resolveHand(model, grip, pair.a, this.handA); this.resolveHand(model, grip, pair.b, this.handB);
    const u = pair.u;
    out.wrist.copy(this.handA.wrist).lerp(this.handB.wrist, u);
    out.forward.copy(this.handA.forward).lerp(this.handB.forward, u).normalize();
    out.palm.copy(this.handA.palm).lerp(this.handB.palm, u).normalize();
    out.curl = blendCurl(this.handA.curl, this.handB.curl, u);
    out.pole.copy(this.handA.pole);
  }

  private applyInspect(weapon: WeaponId, dt: number, reducedMotion: boolean) {
    this.inspectTime += dt;
    const progress = Math.min(1, this.inspectTime / 1.8);
    const look = Math.sin(Math.PI * progress) ** 2 * (reducedMotion ? .35 : 1);
    this.holder.position.x -= look * .08; this.holder.position.y += look * .05; this.holder.position.z += look * .05;
    this.offset.setFromEuler(this.euler.set(look * .2, -look * (weapon === 'machete' ? .2 : .75), look * (weapon === 'machete' ? -.3 : .45), 'YXZ'));
    this.holder.quaternion.multiply(this.offset);
    if (progress === 1) this.inspectTime = -1;
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
    this.holder.position.x += pose.x * amount; this.holder.position.y += pose.y * amount; this.holder.position.z += pose.z * amount;
    this.offset.setFromEuler(this.euler.set(pose.pitch * amount, pose.yaw * amount, pose.roll * amount, 'YXZ'));
    this.holder.quaternion.multiply(this.offset);
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
const BOLT_CURL: HandCurl = { index: [1, .9, .6], middle: [1.2, 1.1, .8], ring: [1.3, 1.1, .8], thumb: [.8, .5, .3] };
const OPEN_CURL: HandCurl = { index: [.35, .3, .2], middle: [.4, .35, .2], ring: [.45, .35, .25], thumb: [.2, .1, .1] };
function blendCurl(a: HandCurl, b: HandCurl, t: number): HandCurl {
  const mix = (x: readonly [number, number, number], y: readonly [number, number, number]) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t] as const;
  return { index: mix(a.index, b.index), middle: mix(a.middle, b.middle), ring: mix(a.ring, b.ring), thumb: mix(a.thumb, b.thumb) };
}
