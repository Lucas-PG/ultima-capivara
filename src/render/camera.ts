import * as THREE from 'three';
import { timing } from './timing';
import { Spring } from './spring';
import { damp } from '../shared/math';
import { aimedFov, verticalFov } from '../settings';
import { actorEye } from '../shared/collision';
import { colliderGrid } from '../shared/collider-grid';
import { capybaraHasClip } from './capybara';
import { terrainHeight } from '../shared/terrain';
import type { ActorState, RenderFrame, Settings, Vec3, WorldSpec } from '../shared/types';
import type { AvatarView } from './avatars';
import type { PresentationFrame } from './local-presentation';
import { FollowCamera, clearDistance } from './follow-camera';

const AXES = ['x', 'y', 'z'] as const;
const ease = (t: number) => t * t * (3 - 2 * t);
type CameraMode = 'orbit' | 'chase' | 'emote' | 'fps' | 'follow';
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
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
  // Spectating: an over-the-shoulder follow camera on the watched capybara; mouse look orbits around it.
  private readonly follow = new FollowCamera();
  private lastInputYaw: number | null = null;
  private lastInputPitch = 0;
  // Switching views travels along an arc (lifted over roofs for long hops) instead of cutting.
  private blendLift = 0;
  private ownDead = false;
  // Results: a slow orbit around the champion's celebration.
  private resultsAngle: number | null = null;
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
    const base = verticalFov(this.settings.fov);
    const framed = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(4 / Math.max(1, distance))), 32, base);
    this.camera.fov = THREE.MathUtils.lerp(base, cam.killerId || cam.killerPos ? framed : base, k);
    this.camera.updateProjectionMatrix();
    this.wasDeathCam = true;
  }

  private poseEmote(actor: ActorState, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    const seated = actor.emote === 'sit' || actor.emote === 'chill';
    const loaf = actor.emote === 'chill' && capybaraHasClip('chill');
    // The authored loaf spans local Z [-1.236,.169], with its head at Y .311.
    // Frame that low, forward body rather than the standing root or seat height.
    const look = this.lookTarget.copy(actor.pos).setY(actor.pos.y + (loaf ? .16 : seated ? .78 : 1.02));
    if (loaf) { look.x -= Math.sin(actor.yaw) * .53; look.z -= Math.cos(actor.yaw) * .53; }
    const distance = seated ? 2.45 : 3.05;
    let best = -1;
    // Prefer the face and free paw. In a narrow room choose the clear side
    // instead of pulling the camera through a wall or into the capybara.
    for (const offset of [.38, -.38, Math.PI]) {
      const angle = actor.yaw + offset;
      const end = this.target.set(look.x - Math.sin(angle) * distance, look.y + (loaf ? .48 : .38), look.z - Math.cos(angle) * distance);
      end.y = Math.max(end.y, terrainHeight(end.x, end.z) + .25);
      const direction = this.direction.subVectors(end, look), length = direction.length();
      direction.divideScalar(length);
      let allowed = length;
      for (const collider of colliderGrid(this.world).query(Math.min(look.x, end.x) - .2, Math.min(look.z, end.z) - .2,
        Math.max(look.x, end.x) + .2, Math.max(look.z, end.z) + .2)) {
        const hit = segmentAabb(look, direction, allowed, collider.min, collider.max);
        if (hit < allowed) allowed = Math.max(0, hit - .2);
      }
      if (allowed > best) { best = allowed; position.copy(look).addScaledVector(direction, allowed); }
      if (allowed > length - .05) break;
    }
    position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .25);
    quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, look, this.camera.up));
  }

  update(frame: PresentationFrame, settings: Settings, elapsed: number, adsAmount: number) {
    this.settings = settings; this.elapsed = elapsed; this.adsAmount = adsAmount;
    if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') {
      // QA: window.__camOverride = [x, y, z, targetX, targetY, targetZ, fov?] frames the world freely.
      const view = (globalThis as { __camOverride?: number[] }).__camOverride;
      if (view) {
        this.camera.position.set(view[0], view[1], view[2]); this.camera.lookAt(view[3], view[4], view[5]);
        this.camera.fov = view[6] ?? 55; this.camera.updateProjectionMatrix(); return;
      }
    }
    const snapshot = frame.snapshot;
    const viewedId = frame.spectateId || frame.playerId, own = viewedId === frame.playerId;
    let actor: ActorState | undefined;
    if (snapshot) for (const candidate of snapshot.actors) if (candidate.id === viewedId) { actor = candidate; break; }
    // The local capybara uses prediction; a watched one uses the same interpolated pose its body is drawn with.
    if (own && frame.localActor) actor = frame.localActor;
    else if (!own && actor) actor = frame.remoteActors?.get(viewedId) ?? actor;
    this.lastActor = actor;
    // Mouse look while spectating orbits the follow camera; the local aim is not used for anything else then.
    const inputYaw = frame.input.yaw, inputPitch = frame.input.pitch;
    if (!own && this.lastInputYaw !== null) this.follow.orbit(wrapAngle(inputYaw - this.lastInputYaw), inputPitch - this.lastInputPitch);
    this.lastInputYaw = inputYaw; this.lastInputPitch = inputPitch;
    if (frame.playing && snapshot?.phase === 'results') {
      this.deathCam = null;
      if (this.poseResults(frame)) { this.lastActor = undefined; return; }
    } else this.resultsAngle = null;
    const cam = this.deathCam;
    if (cam) {
      const dead = frame.playing && !!actor && !actor.alive && own;
      if (cam.start === null && dead) cam.start = this.elapsed;
      // Drop it on spectating, the menu, a respawn after it ran, or a dead view that never arrived.
      if (!frame.playing || !own || (cam.start !== null && actor?.alive) || (cam.start === null && this.elapsed - cam.armedAt > 3)) this.deathCam = null;
      // After its beat the shot keeps tracking the eliminator until spectating, a respawn or the results take over.
      else if (dead && cam.start !== null) { this.ownDead = true; this.poseDeathCam(); return; }
    }
    if (frame.playing && !own && actor) { this.poseSpectate(frame, actor, viewedId); return; }
    if (frame.playing && actor?.alive) {
      const yaw = frame.input.yaw, pitch = frame.input.pitch;
      const emoting = actor.emote && actor.emoteUntil > (frame.simulationTime ?? snapshot?.time ?? 0) && actor.grounded && !actor.swimming;
      const mode: CameraMode = actor.stage === 'plane' ? 'orbit' : emoting ? 'emote' : actor.stage === 'ground' ? 'fps' : 'chase';
      // A respawn is a cut: the new life starts in the eyes, never after a swoop across the island.
      const snap = !this.cameraInitialized || this.lastViewedId !== viewedId || this.ownDead;
      if (!snap && this.cameraMode && mode !== this.cameraMode) this.startBlend(mode === 'emote' ? .45 : mode === 'fps' ? .4 : .8);
      if (this.cameraMode !== mode && timing.enabled) timing.record('camera-transition', timing.begin(), 0, mode, true);
      if (snap) { this.cameraBlend = 0; this.eyeHeight.reset(actorEye(actor)); this.landing.reset(); this.grounded = actor.grounded; this.swimming = actor.swimming; }
      this.wasDeathCam = false; this.ownDead = false;
      this.cameraMode = mode;
      const position = this.position, quaternion = this.quaternion;
      let fov = verticalFov(this.settings.fov);
      if (mode === 'orbit') this.poseOrbit(yaw, pitch, position, quaternion);
      else if (mode === 'emote') {
        this.poseEmote(actor, position, quaternion);
        fov = Math.min(verticalFov(settings.fov), actor.emote === 'chill' && capybaraHasClip('chill') ? 52 : 58);
      } else if (mode === 'chase') fov = this.poseChase(actor, yaw, pitch, position, quaternion);
      else {
        const predicted = frame.predicted ? frame.predicted : actor.pos;
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
        const ads = this.adsAmount;
        fov = aimedFov(this.settings.fov, actor.weapons[actor.slot]?.id ?? null, ads);
      }
      this.applyBlend(position, quaternion, frame.dt);
      this.camera.position.copy(position); this.camera.quaternion.copy(quaternion);
      this.cameraInitialized = true; this.lastViewedId = viewedId;
      this.camera.fov = snap || mode === 'fps' ? fov : damp(this.camera.fov, fov, 13, frame.dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (frame.playing) {
      if (actor && !actor.alive && own) this.ownDead = true;
      if (!this.cameraInitialized && actor) {
        this.camera.position.copy(actor.pos); this.camera.position.y += actorEye(actor);
        this.direction.set(-Math.sin(actor.yaw) * Math.cos(actor.pitch), Math.sin(actor.pitch), -Math.cos(actor.yaw) * Math.cos(actor.pitch));
        this.camera.lookAt(this.lookTarget.copy(this.camera.position).add(this.direction));
        this.cameraInitialized = true; this.lastViewedId = viewedId;
      }
      return;
    }
    this.cameraInitialized = false; this.lastViewedId = null; this.cameraMode = null; this.cameraBlend = 0; this.wasDeathCam = false; this.ownDead = false;
    this.follow.reset(); this.resultsAngle = null;
    // The menu is a slow scenic orbit over the village and the harbour.
    this.menuAngle += frame.dt * (this.settings.reducedMotion ? .035 : .09);
    const x = -48 + Math.sin(this.menuAngle) * 53, z = -29 + Math.cos(this.menuAngle) * 48;
    this.camera.position.set(x, 27 + Math.sin(this.menuAngle * .6) * 3, z);
    this.camera.lookAt(-43, 1.5, -35);
    this.camera.fov = damp(this.camera.fov, 56, 4, frame.dt); this.camera.updateProjectionMatrix();
  }

  // Blends ease from the camera's current pose. `lift` raises the path in the middle (an arc over roofs).
  private startBlend(duration: number, lift = 0) {
    if (this.settings.reducedMotion) { this.cameraBlend = 0; return; }
    this.blendFromPosition.copy(this.camera.position); this.blendFromQuaternion.copy(this.camera.quaternion);
    this.cameraBlend = 1; this.cameraBlendDuration = duration; this.blendLift = lift;
  }
  private applyBlend(position: THREE.Vector3, quaternion: THREE.Quaternion, dt: number) {
    if (this.cameraBlend <= 0) return;
    this.cameraBlend = Math.max(0, this.cameraBlend - dt / this.cameraBlendDuration);
    const t = ease(this.cameraBlend);
    position.lerp(this.blendFromPosition, t); quaternion.slerp(this.blendFromQuaternion, t);
    position.y += this.blendLift * Math.sin(Math.PI * t);
    // A hop between capybaras flies over what is in the way instead of through a hill, a rock or a roof.
    if (this.blendLift > 0 && t > .02) {
      position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .8);
      for (const solid of colliderGrid(this.world).query(position.x - .3, position.z - .3, position.x + .3, position.z + .3))
        if (position.x > solid.min.x - .3 && position.x < solid.max.x + .3 && position.z > solid.min.z - .3 && position.z < solid.max.z + .3 &&
          position.y > solid.min.y - .3 && position.y < solid.max.y + .3) position.y = solid.max.y + .6;
    }
  }

  private poseOrbit(yaw: number, pitch: number, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    // Orbit the plane with the mouse, like the legacy build. Level mouse
    // looks down at the island instead of at the horizon.
    const orbitPitch = THREE.MathUtils.clamp(pitch - .38, -1.2, .3), reach = 26 * Math.cos(orbitPitch);
    position.set(this.planePosition.x + Math.sin(yaw) * reach, this.planePosition.y + 4 - Math.sin(orbitPitch) * 26, this.planePosition.z + Math.cos(yaw) * reach);
    quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, this.lookTarget.copy(this.planePosition).setY(this.planePosition.y + 1), this.camera.up));
  }

  private poseChase(actor: ActorState, yaw: number, pitch: number, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    const body = this.avatars.get(actor.id)?.group.position || this.target.copy(actor.pos);
    const chute = actor.stage === 'parachute', distance = chute ? 7.5 : 6;
    const chasePitch = THREE.MathUtils.clamp(pitch, -1.3, .6), reach = distance * Math.cos(chasePitch);
    position.set(body.x + Math.sin(yaw) * reach, body.y + 2.4 - Math.sin(chasePitch) * distance, body.z + Math.cos(yaw) * reach);
    position.y = Math.max(position.y, terrainHeight(position.x, position.z) + .6);
    quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, this.lookTarget.copy(body).setY(body.y + (chute ? 2.2 : 1.2)), this.camera.up));
    return verticalFov(this.settings.fov) + 6;
  }

  // Watching another capybara: over its shoulder on the ground (or over its fallen body), the plane orbit and the
  // drop chase in the air, the face view for gestures. A new target is reached along an arc, never by a cut.
  private poseSpectate(frame: PresentationFrame, actor: ActorState, viewedId: string) {
    const simulationTime = frame.simulationTime ?? frame.snapshot?.time ?? 0;
    const emoting = actor.alive && actor.emote && actor.emoteUntil > simulationTime && actor.grounded && !actor.swimming;
    const mode: CameraMode = actor.stage === 'plane' && actor.alive ? 'orbit' : emoting ? 'emote' : actor.stage === 'ground' || !actor.alive ? 'follow' : 'chase';
    const body = this.avatars.get(actor.id)?.group.position ?? this.target.copy(actor.pos);
    if (this.lastViewedId !== viewedId) {
      this.follow.reset();
      if (this.cameraInitialized) {
        const hop = this.camera.position.distanceTo(body);
        this.startBlend(THREE.MathUtils.clamp(.35 + hop / 70, .35, 1.1), hop > 8 ? Math.min(14, hop * .22) : 0);
      }
    } else if (this.cameraMode && mode !== this.cameraMode) this.startBlend(mode === 'emote' ? .45 : .6);
    this.wasDeathCam = false;
    this.cameraMode = mode;
    const position = this.position, quaternion = this.quaternion;
    let fov = Math.min(verticalFov(this.settings.fov), 62);
    if (mode === 'orbit') this.poseOrbit(actor.yaw, actor.pitch, position, quaternion);
    else if (mode === 'emote') { this.poseEmote(actor, position, quaternion); fov = Math.min(fov, 58); }
    else if (mode === 'chase') fov = this.poseChase(actor, actor.yaw, actor.pitch, position, quaternion);
    else {
      this.follow.update(this.world, { pos: body, yaw: actor.yaw, pitch: actor.pitch, crouch: actor.crouch, swimming: actor.swimming, alive: actor.alive },
        frame.dt, this.settings.reducedMotion);
      position.copy(this.follow.position); quaternion.copy(this.follow.quaternion);
    }
    this.applyBlend(position, quaternion, frame.dt);
    this.camera.position.copy(position); this.camera.quaternion.copy(quaternion);
    const snap = !this.cameraInitialized;
    this.cameraInitialized = true; this.lastViewedId = viewedId;
    this.camera.fov = snap ? fov : damp(this.camera.fov, fov, 8, frame.dt);
    this.camera.updateProjectionMatrix();
  }

  // Results: the champion celebrates in a slow orbit, framed from the front, behind the results panel.
  private poseResults(frame: PresentationFrame): boolean {
    const snapshot = frame.snapshot!, champion = snapshot.results.find(result => result.winner) ?? snapshot.results[0];
    const state = champion && snapshot.actors.find(actor => actor.id === champion.id);
    if (!state) return false;
    const body = this.avatars.get(state.id)?.group.position ?? this.target.copy(state.pos);
    const dt = Math.max(0, Math.min(frame.dt, .1));
    if (this.resultsAngle === null) {
      // Start in front of the champion, a little to its left, easing out of whatever the view was.
      this.resultsAngle = state.yaw + .55;
      if (this.cameraInitialized) this.startBlend(1.4, 0);
    } else if (!this.settings.reducedMotion) this.resultsAngle += dt * .16;
    const look = this.lookTarget.copy(body).setY(body.y + .95), angle = this.resultsAngle;
    const out = this.direction.set(-Math.sin(angle), .3, -Math.cos(angle)).normalize();
    const pivot = this.fpsPosition.copy(body).setY(body.y + 1.2);
    const reach = clearDistance(this.world, pivot, out, 4.8, .25);
    const position = this.position.copy(pivot).addScaledVector(out, reach);
    const quaternion = this.quaternion.setFromRotationMatrix(this.lookMatrix.lookAt(position, look, this.camera.up));
    this.applyBlend(position, quaternion, dt);
    this.camera.position.copy(position); this.camera.quaternion.copy(quaternion);
    this.camera.fov = damp(this.camera.fov, 46, 4, dt); this.camera.updateProjectionMatrix();
    this.cameraInitialized = true; this.cameraMode = null;
    return true;
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
