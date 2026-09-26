import * as THREE from 'three';
import { timing } from './timing';
import { Spring } from './spring';
import { damp } from '../shared/math';
import { actorEye } from '../shared/collision';
import { colliderGrid } from '../shared/collider-grid';
import { terrainHeight } from '../shared/terrain';
import type { ActorState, RenderFrame, Settings, Vec3, WorldSpec } from '../shared/types';
import type { AvatarView } from './avatars';
import { addBox, addEllipsoid } from './primitives';
import type { PresentationFrame } from './local-presentation';

const material = (color: string) => new THREE.MeshStandardMaterial({ color, emissive: '#000000', roughness: .8, metalness: .04 });
const AXES = ['x', 'y', 'z'] as const;
const ease = (t: number) => t * t * (3 - 2 * t);
type CameraMode = 'orbit' | 'chase' | 'fps';
export function makePlane(): THREE.Group {
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
  for (const axis of AXES) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
      continue;
    }
    const inv = 1 / direction[axis];
    let t1 = (min[axis] - origin[axis]) * inv, t2 = (max[axis] - origin[axis]) * inv;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    near = Math.max(near, t1); far = Math.min(far, t2);
    if (far < near) return Infinity;
  }
  return near;
}

export class CameraRig {
  lastActor: ActorState | undefined;
  private lastViewedId: string | null = null;
  private cameraInitialized = false;
  private menuAngle = 0;
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private elapsed = 0;
  private adsAmount = 0;
  private readonly eyeHeight = new Spring();
  private readonly landing = new Spring();
  private grounded = true;
  private swimming = false;
  private verticalSpeed = 0;
  private gait = 0;
  // Plane: third-person orbit. Drop: chase camera. Ground: first person.
  // Switching modes eases from the last pose instead of cutting.
  private cameraMode: CameraMode | null = null;
  cameraBlend = 0;
  private cameraBlendDuration = .6;
  private readonly blendFromPosition = new THREE.Vector3();
  private readonly blendFromQuaternion = new THREE.Quaternion();
  private readonly fpsPosition = new THREE.Vector3();
  private readonly lookMatrix = new THREE.Matrix4();
  // Snapshots arrive at 20 Hz; the plane is extrapolated between them so it glides.
  readonly planePosition = new THREE.Vector3();
  readonly planeVelocity = new THREE.Vector3();
  private planeSample = { match: '', tick: -1, time: 0, at: 0, pos: new THREE.Vector3() };
  // Death cam (Brasa): after your elimination the view rises out of your eyes and frames the eliminator.
  // `start` stays null while armed: the kill event can arrive before or after the snapshot that shows you dead.
  private deathCam: { armedAt: number; start: number | null; duration: number; killerId: string | null; killerPos: THREE.Vector3 | null; victimEye: THREE.Vector3 } | null = null;
  private wasDeathCam = false;
  constructor(readonly camera: THREE.PerspectiveCamera, private readonly world: WorldSpec, private settings: Settings, private readonly avatars: AvatarView) {}

  // Timed on the renderer's clamped frame clock; cleared on respawn, spectating and a new match.
  startDeathCam(info: { victimEye: Vec3; killerId: string | null; killerPos: Vec3 | null; duration: number }) {
    this.deathCam = { armedAt: this.elapsed, start: null, duration: THREE.MathUtils.clamp(info.duration, 1.5, 2), killerId: info.killerId,
      killerPos: info.killerPos ? new THREE.Vector3(info.killerPos.x, info.killerPos.y, info.killerPos.z) : null,
      victimEye: new THREE.Vector3(info.victimEye.x, info.victimEye.y, info.victimEye.z) };
  }
  clearDeathCam() { this.deathCam = null; this.wasDeathCam = false; }
  // Armed (waiting for the dead view) or running.
  get deathCamActive() { return !!this.deathCam && (this.deathCam.start === null || this.elapsed - this.deathCam.start < this.deathCam.duration); }

  private poseDeathCam() {
    const cam = this.deathCam!, eye = cam.victimEye, look = this.lookTarget;
    const killer = cam.killerId ? this.avatars.get(cam.killerId) : undefined;
    if (killer?.group.visible) look.copy(killer.group.position).setY(killer.group.position.y + 1.2);
    else if (cam.killerPos) look.copy(cam.killerPos).setY(cam.killerPos.y + 1.2);
    else look.copy(eye).setY(eye.y - 1.4);
    // Rise and back away from the eliminator over 0.45 s (a cut with reduced motion).
    const k = this.settings.reducedMotion ? 1 : 1 - (1 - Math.min(1, (this.elapsed - cam.start!) / .45)) ** 3;
    const away = this.direction.set(eye.x - look.x, 0, eye.z - look.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    const end = this.target.copy(eye).addScaledVector(away, cam.killerId || cam.killerPos ? 2.2 : .8).setY(eye.y + (cam.killerId || cam.killerPos ? 1.6 : 3));
    const position = this.position.copy(eye).lerp(end, k);
    // Stay in front of walls between the eyes and the camera, and above the ground.
    const reach = this.fpsPosition.subVectors(position, eye), length = reach.length();
    if (length > 1e-3) {
      reach.divideScalar(length);
      let allowed = length;
      for (const collider of colliderGrid(this.world).query(eye.x - 4, eye.z - 4, eye.x + 4, eye.z + 4)) {
        const hit = segmentAabb(eye, reach, allowed, collider.min, collider.max);
        if (hit < allowed) allowed = Math.max(0, hit - .2);
      }
      position.copy(eye).addScaledVector(reach, allowed);
    }
    position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .4);
    this.camera.position.copy(position);
    this.camera.quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, look, this.camera.up));
    // Narrow the view so a 2 m capybara fills about a quarter of the frame.
    const distance = position.distanceTo(look);
    const framed = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(4 / Math.max(1, distance))), 32, this.settings.fov);
    this.camera.fov = THREE.MathUtils.lerp(this.settings.fov, cam.killerId || cam.killerPos ? framed : this.settings.fov, k);
    this.camera.updateProjectionMatrix();
    this.wasDeathCam = true;
  }

  update(frame: PresentationFrame, settings: Settings, elapsed: number, adsAmount: number) {
    this.settings = settings; this.elapsed = elapsed; this.adsAmount = adsAmount;
    const snapshot = frame.snapshot;
    const viewedId = frame.spectateId || frame.playerId;
    let actor: ActorState | undefined;
    if (snapshot) for (const candidate of snapshot.actors) if (candidate.id === viewedId) { actor = candidate; break; }
    if (viewedId === frame.playerId && frame.localActor) actor = frame.localActor;
    this.lastActor = actor;
    const cam = this.deathCam;
    if (cam) {
      const dead = frame.playing && !!actor && !actor.alive && viewedId === frame.playerId;
      if (cam.start === null && dead) cam.start = this.elapsed;
      // Drop it on spectating, the menu, a respawn after it ran, or a dead view that never arrived.
      if (!frame.playing || viewedId !== frame.playerId || (cam.start !== null && actor?.alive) || (cam.start === null && this.elapsed - cam.armedAt > 3)) this.deathCam = null;
      else if (dead && this.deathCamActive) { this.poseDeathCam(); return; }
    }
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
      if (this.cameraMode !== mode && timing.enabled) timing.record('camera-transition', timing.begin(), 0, mode, true);
      if (snap) { this.cameraBlend = 0; this.eyeHeight.reset(actorEye(actor)); this.landing.reset(); this.grounded = actor.grounded; this.swimming = actor.swimming; }
      // Handing off from the death cam to the spectated capybara eases instead of cutting.
      if (this.wasDeathCam && !this.settings.reducedMotion) {
        this.blendFromPosition.copy(this.camera.position); this.blendFromQuaternion.copy(this.camera.quaternion);
        this.cameraBlend = 1; this.cameraBlendDuration = .6;
      }
      this.wasDeathCam = false;
      this.cameraMode = mode;
      const position = this.position, quaternion = this.quaternion;
      let fov = this.settings.fov;
      if (mode === 'orbit') {
        // Orbit the plane with the mouse, like the legacy build. Level mouse
        // looks down at the island instead of at the horizon.
        const orbitPitch = THREE.MathUtils.clamp(pitch - .38, -1.2, .3), reach = 26 * Math.cos(orbitPitch);
        position.set(this.planePosition.x + Math.sin(yaw) * reach, this.planePosition.y + 4 - Math.sin(orbitPitch) * 26, this.planePosition.z + Math.cos(yaw) * reach);
        quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, this.lookTarget.copy(this.planePosition).setY(this.planePosition.y + 1), this.camera.up));
      } else if (mode === 'chase') {
        const body = this.avatars.get(actor.id)?.group.position || this.target.copy(actor.pos);
        const chute = actor.stage === 'parachute', distance = chute ? 7.5 : 6;
        const chasePitch = THREE.MathUtils.clamp(pitch, -1.3, .6), reach = distance * Math.cos(chasePitch);
        position.set(body.x + Math.sin(yaw) * reach, body.y + 2.4 - Math.sin(chasePitch) * distance, body.z + Math.cos(yaw) * reach);
        position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .6);
        quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, this.lookTarget.copy(body).setY(body.y + (chute ? 2.2 : 1.2)), this.camera.up));
        fov = this.settings.fov + 6;
      } else {
        const predicted = own && frame.predicted ? frame.predicted : actor.pos;
        const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
        const dt = Math.max(0, Math.min(frame.dt, .05));
        this.gait += speed * dt * 2.5;
        if (!actor.swimming && !this.swimming) {
          if (actor.grounded && !this.grounded) this.landing.impulse(-Math.min(3.2, Math.max(.6, -this.verticalSpeed * .28)));
          if (!actor.grounded && this.grounded && actor.velocity.y > 0) this.landing.impulse(.65);
        } else if (actor.swimming) this.landing.reset();
        this.grounded = actor.grounded; this.swimming = actor.swimming; this.verticalSpeed = actor.velocity.y;
        const eye = this.eyeHeight.update(actorEye(actor), 23, dt);
        const impact = this.landing.update(0, 17, dt);
        const bob = settings.reducedMotion ? 0 : actor.swimming ? Math.sin(elapsed * 2.1) * .012 : actor.grounded ? Math.sin(this.gait) * Math.min(speed / 8, 1) * .017 : 0;
        const target = this.target.copy(predicted).setY(predicted.y + eye + bob + (settings.reducedMotion ? 0 : impact));
        // Keep the visual crouch transition below any actual low ceiling.
        for (const solid of colliderGrid(this.world).query(predicted.x - .06, predicted.z - .06, predicted.x + .06, predicted.z + .06)) if (predicted.x > solid.min.x - .06 && predicted.x < solid.max.x + .06 &&
          predicted.z > solid.min.z - .06 && predicted.z < solid.max.z + .06 && solid.min.y > predicted.y + .5)
          target.y = Math.min(target.y, solid.min.y - .08);
        const leanDistance = actor.lean * .24;
        if (Math.abs(leanDistance) > .001) {
          const leanDir = this.direction.set(Math.cos(yaw) * Math.sign(leanDistance), 0, -Math.sin(yaw) * Math.sign(leanDistance));
          let allowed = Math.abs(leanDistance);
          for (const collider of colliderGrid(this.world).query(target.x - 2, target.z - 2, target.x + 2, target.z + 2)) {
            const hit = segmentAabb(target, leanDir, allowed, collider.min, collider.max);
            if (hit < allowed) allowed = Math.max(0, hit - .07);
          }
          target.addScaledVector(leanDir, allowed);
        }
        // Local ticks are already interpolated and reconciliation has its own
        // bounded visual offset. A second lerp adds avoidable movement latency.
        this.fpsPosition.copy(target);
        position.copy(this.fpsPosition);
        // Yaw must be applied before pitch. Resetting a lookAt() XYZ Euler's roll
        // can flip the horizon when the view crosses east or west.
        quaternion.setFromEuler(this.rotation.set(pitch, yaw, actor.lean * -.045));
        const ads = own ? this.adsAmount : actor.ads && !actor.sprint ? 1 : 0;
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
        this.camera.position.copy(actor.pos); this.camera.position.y += actorEye(actor);
        this.direction.set(-Math.sin(actor.yaw) * Math.cos(actor.pitch), Math.sin(actor.pitch), -Math.cos(actor.yaw) * Math.cos(actor.pitch));
        this.camera.lookAt(this.lookTarget.copy(this.camera.position).add(this.direction));
        this.cameraInitialized = true; this.lastViewedId = viewedId;
      }
      return;
    }
    this.cameraInitialized = false; this.lastViewedId = null; this.cameraMode = null; this.cameraBlend = 0; this.wasDeathCam = false;
    // The menu is a slow scenic orbit over the village and the harbour.
    this.menuAngle += frame.dt * (this.settings.reducedMotion ? .035 : .09);
    const x = -48 + Math.sin(this.menuAngle) * 53, z = -29 + Math.cos(this.menuAngle) * 48;
    this.camera.position.set(x, 27 + Math.sin(this.menuAngle * .6) * 3, z);
    this.camera.lookAt(-43, 1.5, -35);
    this.camera.fov = damp(this.camera.fov, 56, 4, frame.dt); this.camera.updateProjectionMatrix();
  }

  updatePlanePath(snapshot: RenderFrame['snapshot'], dt: number, elapsed: number) {
    this.elapsed = elapsed;
    if (!snapshot) return;
    const sample = this.planeSample, fresh = sample.match !== snapshot.matchId;
    if (fresh || snapshot.tick !== sample.tick) {
      const pos = this.target.copy(snapshot.plane), step = snapshot.time - sample.time;
      if (fresh) { this.planePosition.copy(pos); this.planeVelocity.set(0, 0, 0); }
      else if (step > 0 && step < 1) this.planeVelocity.copy(pos).sub(sample.pos).divideScalar(step);
      sample.match = snapshot.matchId; sample.tick = snapshot.tick; sample.time = snapshot.time; sample.at = this.elapsed; sample.pos.copy(pos);
    }
    const target = this.target.copy(this.planeSample.pos).addScaledVector(this.planeVelocity, Math.min(.25, this.elapsed - this.planeSample.at));
    if (this.planePosition.distanceToSquared(target) > 400) this.planePosition.copy(target);
    else this.planePosition.lerp(target, Math.min(1, dt * 10));
  }

  closeWall(): number {
    const dir = this.direction; this.camera.getWorldDirection(dir);
    let nearest = 1.5;
    const { x, z } = this.camera.position;
    for (const collider of colliderGrid(this.world).query(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) {
      const d = segmentAabb(this.camera.position, dir, 1.5, collider.min, collider.max);
      if (d >= 0 && d < nearest) nearest = d;
    }
    return THREE.MathUtils.clamp((1.1 - nearest) / 1.1, 0, 1);
  }

}
