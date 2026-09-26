import * as THREE from 'three';
import { timing } from './timing';
import { instrumentGpu, instrumentMaterials } from './timing-gpu';
import { PaintedSky } from './sky';
import { AmbientLife } from './ambient-life';
import { PAINT } from './materials';
import { preloadNameplateFont } from './nameplates';
import { disposeCapybaraAssets, preloadCapybaraAsset } from './capybara';
import { damp } from '../shared/math';
import { PLAYER_COLORS, isArenaMode, type GameEvent, type RenderFrame, type Settings, type Vec3, type WorldSpec, type ZoneState } from '../shared/types';
import { AssetLoader } from './assets';
import { ASSET_MANIFEST, type AssetEntry } from './asset-manifest';
import capybaraMetrics from '../../public/models/capybara/metrics.json';
import weaponMetrics from '../../public/models/weapons/metrics.json';
import kitMetrics from '../../public/models/kit/metrics.json';
import { KIT_PIECES } from '../shared/kit-collision';
import { KIT_ASSET_PATH } from './kit';
import { paintedWeaponsEnabled } from './painted-weapons';
import type { AssetProgressCallback } from './asset-progress';
import { WorldScene } from './world-scene';
import { WeaponView } from './weapons';
import { AvatarView, avatar, BOT_COLOR } from './avatars';
import { CameraRig, makePlane } from './camera';
import { LootView } from './loot';
import { SupplyDropView } from './supply-drops';
import { EffectsView, type EffectsFrame } from './effects';
import { StormView } from './storm';
import { DEATH_CAM_SECONDS } from '../shared/death-cam';
import { actorEye } from '../shared/collision';
import { RenderPipeline, PRESETS } from './pipeline';
import { itemGeometry } from './item-geometry';
import type { PresentationFrame } from './local-presentation';
export { itemGeometry } from './item-geometry';

const ZONE_NONE: ZoneState = { x: 0, z: 0, radius: 0, nextRadius: 0, nextX: 0, nextZ: 0, phase: 0, shrinking: false, timeLeft: 0, damage: 0 };

export class GameRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sky: PaintedSky;
  private readonly ambientLife = new AmbientLife();
  private readonly worldView: WorldScene;
  private readonly weaponView: WeaponView;
  private readonly assets: AssetLoader;
  private readonly onProgress: AssetProgressCallback;
  private readonly avatars: AvatarView;
  private readonly cameraRig: CameraRig;
  private readonly loot: LootView;
  private readonly supplyDrops: SupplyDropView;
  private readonly effects: EffectsView;
  private readonly effectsFrame: EffectsFrame;
  private readonly pipeline: RenderPipeline;
  private readonly plane = makePlane();
  private readonly storm: StormView;
  private stormAmount = 0;
  private stormPulse = 0;
  private effectsMatch = '';
  private readonly propellers = this.plane.children.filter(child => child.name === 'propeller');
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(-70, 32, -30);
  private readonly shadowDirection = this.sunOffset.clone().normalize();
  private readonly shadowRight = new THREE.Vector3(0, 1, 0).cross(this.shadowDirection).normalize();
  private readonly shadowUp = this.shadowDirection.clone().cross(this.shadowRight);
  private readonly shadowAnchor = new THREE.Vector3();
  private readonly interiorLight = new THREE.PointLight(PAINT.interior, 0, 14, 2);
  private readonly litRooms: { x: number; y: number; z: number; w: number; d: number }[];
  private readonly environment: THREE.WebGLRenderTarget;
  private settings: Settings;
  private elapsed = 0;
  private lastFrame: RenderFrame | null = null;
  private lastSize = { width: 1, height: 1 };
  private frameStats = { drawCalls: 0, triangles: 0 };
  private resolutionScale = 1;
  private lastDeviceRatio = 0;
  private frameInterval = 16.7;
  private lastUpdateAt = 0;
  private slowFor = 0;
  private fastFor = 0;
  private warming: Promise<void> | null = null;
  private preparation: Promise<void> = Promise.resolve();
  private disposed = false;
  private releaseWarmupAvatars: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}, onProgress: AssetProgressCallback = () => {}) {
    this.onProgress = (fraction, label) => { if (!this.disposed) onProgress(fraction, label); };
    this.settings = settings;
    this.litRooms = world.objects.filter(object => object.kind === 'roof' || object.detail?.startsWith('prop:house:'))
      .map(object => ({ ...object.pos, y: object.pos.y - (object.kind === 'roof' ? 3.1 : 0),
        w: object.scale.x, d: object.scale.z }));
    for (const piece of world.pieces ?? []) if (['house_small', 'house_tall', 'church', 'market_hall'].includes(piece.piece)) {
      const footprint = KIT_PIECES[piece.piece].footprint, scale = piece.scale ?? 1;
      const c = Math.abs(Math.cos(piece.yaw)), s = Math.abs(Math.sin(piece.yaw));
      this.litRooms.push({ x: piece.x, y: piece.y, z: piece.z,
        w: (footprint[0] * c + footprint[1] * s) * scale, d: (footprint[0] * s + footprint[1] * c) * scale });
    }
    // No canvas MSAA: every frame is drawn through the post target, so a multisampled
    // canvas only added a full-screen resolve.
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    instrumentGpu(this.gl);
    const weaponManifest: readonly AssetEntry[] = paintedWeaponsEnabled() ? [
      ...ASSET_MANIFEST.filter(asset => !asset.path.startsWith('models/service-pistol/') && !asset.path.startsWith('models/m700/')),
      { path: 'models/weapons/painted-weapons.glb', kind: 'glb', bytes: weaponMetrics.bytes, label: 'Armas da ilha' },
    ] : ASSET_MANIFEST;
    const manifest: readonly AssetEntry[] = [...weaponManifest, ...(world.pieces?.length ? [{
      path: KIT_ASSET_PATH, kind: 'glb' as const, bytes: kitMetrics.bytes, label: 'Casas e caminhos da ilha',
    }] : []), {
      path: 'models/capybara/capybara.glb', kind: 'glb', bytes: capybaraMetrics.bytes, label: 'Capivara',
    }];
    this.assets = new AssetLoader(this.gl, this.onProgress, manifest);
    this.sky = new PaintedSky(this.assets);
    this.weaponView = new WeaponView(this.assets, () => { if (!this.disposed) onAssetsReady(); });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral keeps saturated cartoon colours; ACES washed them toward grey.
    this.gl.toneMapping = THREE.NeutralToneMapping; this.gl.toneMappingExposure = 1.1;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const skyScene = new THREE.Scene(); skyScene.add(this.sky.group);
    // Reflections use the continuous sky and sun. The asynchronously loaded
    // cloud atlas is revealed only in the world, after the asset barrier.
    this.sky.clouds.visible = false;
    this.environment = pmrem.fromScene(skyScene, .035, .1, 850, { size: 128 });
    this.sky.clouds.visible = true;
    this.scene.add(this.sky.group); pmrem.dispose();
    this.weaponView.scene.environment = this.environment.texture;
    this.weaponView.scene.environmentIntensity = .35;
    this.scene.background = new THREE.Color(PAINT.fog);
    this.scene.fog = new THREE.Fog(PAINT.fog, 34, 285);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, .07, 850);
    this.camera.rotation.order = 'YXZ';
    this.avatars = new AvatarView(this.scene, this.camera, world);
    this.cameraRig = new CameraRig(this.camera, world, settings, this.avatars);
    this.scene.add(new THREE.HemisphereLight(PAINT.hemisphereSky, PAINT.hemisphereGround, .88));
    this.scene.add(this.interiorLight);
    this.sun = new THREE.DirectionalLight(PAINT.sun, 3.5); this.sun.position.set(-70, 32, -30);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 170;
    this.sun.shadow.bias = -.00035; this.sun.shadow.normalBias = .12;
    this.scene.add(this.sun, this.sun.target);
    this.worldView = new WorldScene(world, settings, this.assets, () => {
      if (!this.disposed) onAssetsReady();
    });
    this.scene.add(this.worldView.group, this.ambientLife.points);
    this.scene.add(this.plane); this.plane.visible = false;
    this.storm = new StormView(this.scene);
    this.loot = new LootView(this.scene, world);
    this.supplyDrops = new SupplyDropView(this.assets); this.scene.add(this.supplyDrops.group);
    this.effects = new EffectsView(this.scene, world, this.weaponView.scene, this.assets);
    this.effectsFrame = { camera: this.camera, fpCamera: this.weaponView.camera, avatars: this.avatars,
      firstPerson: false, viewportHeight: 1, reducedMotion: settings.reducedMotion };
    this.pipeline = new RenderPipeline(this.gl, PRESETS[settings.graphics].samples);
    this.applyPreset(settings);
    this.resize();
  }

  private applyPreset(settings: Settings) {
    const preset = PRESETS[settings.graphics];
    this.applyPixelRatio();
    this.pipeline.setSamples(preset.samples);
    this.pipeline.setQuality(preset);
    this.gl.shadowMap.enabled = preset.shadows; this.sun.castShadow = preset.shadows;
    this.interiorLight.visible = preset.interior;
    const reach = preset.shadowReach || 30, shadow = this.sun.shadow.camera;
    if (this.sun.shadow.mapSize.x !== preset.shadowSize) {
      this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.sun.shadow.camera.far = settings.graphics === 'high' ? 230 : 180;
    this.sun.shadow.normalBias = settings.graphics === 'high' ? .07 : .1;
    this.sun.shadow.radius = settings.graphics === 'high' ? 2.4 : 1.6;
    shadow.left = -reach; shadow.right = reach; shadow.top = reach; shadow.bottom = -reach; shadow.updateProjectionMatrix();
  }

  private applyPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, PRESETS[this.settings.graphics].dpr) * this.resolutionScale;
    if (Math.abs(this.gl.getPixelRatio() - ratio) > .01) {
      const resizeAt = timing.begin();
      this.gl.setPixelRatio(ratio); this.pipeline.resize();
      timing.end('resolution-change', resizeAt, '', true);
    }
  }

  // Only sustained misses reduce resolution. A tight floor preserves small
  // details and readable silhouettes on Retina displays; isolated stalls do not.
  private adaptResolution() {
    const now = performance.now(), interval = now - this.lastUpdateAt; this.lastUpdateAt = now;
    const budget = 1000 / (this.settings.frameLimit || 60);
    if (interval <= 0 || interval > budget * 2.6) return;
    this.frameInterval += (interval - this.frameInterval) * .08;
    if (this.frameInterval > budget * 1.18) { this.slowFor += interval; this.fastFor = 0; }
    else if (this.frameInterval < budget * 1.04) { this.fastFor += interval; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor > 3500 && this.resolutionScale > .85) { this.resolutionScale = Math.max(.85, this.resolutionScale - .05); this.slowFor = 0; this.applyPixelRatio(); }
    else if (this.fastFor > 4000 && this.resolutionScale < 1) { this.resolutionScale = Math.min(1, this.resolutionScale + .05); this.fastFor = 0; this.applyPixelRatio(); }
  }

  update(frame: PresentationFrame, draw = true): void {
    if (this.disposed) return;
    if (this.lastDeviceRatio !== (window.devicePixelRatio || 1) || this.lastSize.width !== window.innerWidth || this.lastSize.height !== window.innerHeight) this.resize();
    if (draw) this.adaptResolution();
    const dt = Math.min(Math.max(frame.dt || 0, 0), .05);
    this.lastFrame = frame; this.elapsed += dt;
    // A new match starts with no marks, shells or effects from the previous one.
    if (frame.snapshot && frame.snapshot.matchId !== this.effectsMatch) { this.effectsMatch = frame.snapshot.matchId; this.effects.clear(); this.cameraRig.clearDeathCam(); this.worldView.resetRecreation(); }
    this.cameraRig.updatePlanePath(frame.snapshot, dt, this.elapsed);
    this.avatars.update(frame, this.cameraRig.cameraBlend, this.elapsed, this.settings.reducedMotion);
    const cameraAt = timing.begin();
    this.cameraRig.update(frame, this.settings, this.elapsed, this.weaponView.adsAmount);
    this.worldView.update(this.elapsed, this.camera, frame.snapshot?.actors, frame.localActor);
    this.ambientLife.update(this.camera, this.elapsed, this.settings, this.gl.getPixelRatio());
    timing.end('camera', cameraAt);
    this.loot.update(frame.snapshot, this.elapsed, this.camera);
    this.supplyDrops.update(frame.snapshot, frame.simulationTime ?? frame.snapshot?.time ?? 0, this.camera, this.settings);
    let room: typeof this.litRooms[number] | undefined;
    for (const candidate of this.litRooms) if (Math.abs(this.camera.position.x - candidate.x) < candidate.w / 2 &&
      Math.abs(this.camera.position.z - candidate.z) < candidate.d / 2 && this.camera.position.y > candidate.y &&
      this.camera.position.y < candidate.y + 3.1) { room = candidate; break; }
    if (room) {
      this.interiorLight.position.set(room.x, room.y + 2.45, room.z);
      this.interiorLight.color.set(PAINT.interior);
    }
    this.interiorLight.intensity = damp(this.interiorLight.intensity, room ? 9 : 0, 7, dt);
    const snapshot = frame.snapshot;
    const viewed = this.cameraRig.lastActor;
    this.weaponView.update(frame.playing && viewed?.id === frame.playerId ? viewed : undefined, dt, this.settings, this.cameraRig.closeWall(), frame.simulationTime ?? snapshot?.time ?? 0, this.camera.quaternion);
    const held = viewed?.weapons[viewed.slot]?.id;
    const scoped = viewed?.ads && !viewed.sprint && viewed.reloadUntil <= (snapshot?.time || 0) && (held === 'sniper' || held === 'dmr');
    const emoting = viewed?.emote && viewed.emoteUntil > (frame.simulationTime ?? snapshot?.time ?? 0);
    const firstPerson = !!(frame.playing && viewed?.alive && viewed.stage === 'ground' && viewed.id === frame.playerId && !scoped && !emoting && this.cameraRig.cameraBlend < .35);
    this.effectsFrame.firstPerson = firstPerson;
    this.effectsFrame.viewportHeight = this.lastSize.height;
    this.effectsFrame.reducedMotion = this.settings.reducedMotion;
    this.effectsFrame.lowQuality = this.settings.graphics === 'low';
    this.effects.update(dt, this.effectsFrame, snapshot?.actors, frame.simulationTime ?? snapshot?.time ?? 0, frame.localActor);
    if (snapshot) {
      const zone = snapshot.zone;
      this.worldView.arenaBoundary.visible = isArenaMode(snapshot.config.mode);
      const br = frame.playing && snapshot.config.mode === 'battle-royale';
      this.storm.update(zone, this.camera, this.elapsed, br);
      const exposed = br && viewed?.alive && viewed.stage !== 'plane' ? StormView.exposure(zone, viewed.pos.x, viewed.pos.z) : 0;
      this.stormAmount = damp(this.stormAmount, exposed, 5, dt);
      this.plane.visible = frame.playing && snapshot.config.mode === 'battle-royale' && this.hasPlanePassengers(snapshot);
      this.plane.position.copy(this.cameraRig.planePosition);
      // The nose (-Z) follows the flight path.
      if (this.cameraRig.planeVelocity.lengthSq() > 1) this.plane.rotation.y = Math.atan2(-this.cameraRig.planeVelocity.x, -this.cameraRig.planeVelocity.z);
      else this.plane.rotation.y = -Math.PI / 2;
      for (const propeller of this.propellers) propeller.rotation.z += dt * 34;
    } else { this.storm.update(ZONE_NONE, this.camera, this.elapsed, false); this.stormAmount = 0; this.plane.visible = false; this.worldView.arenaBoundary.visible = false; }
    this.stormPulse = Math.max(0, this.stormPulse - dt / .45);
    this.pipeline.setScreenFeedback(this.stormAmount, this.settings.reducedMotion ? this.stormPulse * .5 : this.stormPulse);
    // Thin the haze with altitude so the island stays readable from the plane.
    if (this.scene.fog instanceof THREE.Fog) {
      const altitude = THREE.MathUtils.smoothstep(this.camera.position.y, 15, 110), far = 460;
      this.scene.fog.near = 110 * (1 + altitude); this.scene.fog.far = far * (1 + .35 * altitude);
    }
    if (this.settings.graphics !== 'low') {
      // Snap in light space so camera movement does not slide the shadow texels.
      const texel = 2 * PRESETS[this.settings.graphics].shadowReach / this.sun.shadow.mapSize.x;
      this.shadowAnchor.set(this.camera.position.x, 0, this.camera.position.z);
      const right = Math.round(this.shadowAnchor.dot(this.shadowRight) / texel) * texel;
      const up = Math.round(this.shadowAnchor.dot(this.shadowUp) / texel) * texel;
      const depth = this.shadowAnchor.dot(this.shadowDirection);
      this.shadowAnchor.copy(this.shadowRight).multiplyScalar(right).addScaledVector(this.shadowUp, up).addScaledVector(this.shadowDirection, depth);
      this.sun.target.position.copy(this.shadowAnchor);
      this.sun.position.copy(this.shadowAnchor).add(this.sunOffset);
      this.sun.target.updateMatrixWorld();
    }
    this.sky.update(this.camera, this.elapsed, this.settings.reducedMotion);
    // Review poses settle camera and animation without submitting a viewport
    // draw for every intermediate state. Normal gameplay always draws.
    if (!draw) return;
    const drawAt = timing.begin(), programs = timing.enabled ? this.gl.info.programs?.length ?? 0 : 0;
    this.pipeline.render(this.scene, this.camera, this.frameStats,
      firstPerson ? this.weaponView.scene : undefined, firstPerson ? this.weaponView.camera : undefined);
    timing.end('world-draw', drawAt);
    if (timing.enabled && (this.gl.info.programs?.length ?? 0) > programs) timing.record('shader-program-created', drawAt, 0, 'frame', true);
  }

  private hasPlanePassengers(snapshot: NonNullable<RenderFrame['snapshot']>) {
    for (const actor of snapshot.actors) if (actor.stage === 'plane') return true;
    return false;
  }

  inspectWeapon(): void { this.weaponView.inspect(); }

  event(event: GameEvent): void {
    const frame = this.lastFrame, viewed = frame?.spectateId || frame?.playerId;
    // A storm bite on the viewed capybara: attacker-less damage while outside the zone.
    if (event.type === 'damage' && !event.actor && event.target === viewed && this.stormAmount > .5) this.stormPulse = 1;
    // Death cam only for your own elimination, never when a spectated capybara falls.
    if (event.type === 'kill' && frame && event.target === frame.playerId && !frame.spectateId) {
      const me = frame.snapshot?.actors.find(actor => actor.id === event.target);
      if (me) this.cameraRig.startDeathCam({ victimEye: { x: me.pos.x, y: me.pos.y + actorEye(me), z: me.pos.z }, killerId: event.actor,
        killerPos: event.from || null, duration: DEATH_CAM_SECONDS });
    }
    if (event.type === 'respawn') this.avatars.respawn(event.actor);
    if (event.type === 'bounce') { this.worldView.bounce(event.pos); this.avatars.bounce(event.actor); }
    this.effects.event(event, this.avatars, this.weaponView, frame?.playerId, frame?.snapshot || null);
  }

  // Asset failures keep the loading screen from promising a ready match.
  // There is no timeout that silently defers work until landing or a weapon swap.
  private requireActive() {
    if (this.disposed) throw new Error('Renderer disposed before match preparation completed');
  }

  async warmup(): Promise<void> {
    this.requireActive();
    this.warming ||= (async () => {
      this.requireActive();
      await this.weaponView.assets;
      this.requireActive();
      await preloadCapybaraAsset(url => this.assets.gltf(url));
      await preloadNameplateFont();
      this.requireActive();
      await this.worldView.ready;
      await this.supplyDrops.ready;
      await this.assets.ready();
      this.requireActive();
      this.onProgress(.9, 'Pintando a ilha');
      await import('./thumbnails').then(module => { this.requireActive(); return module.loadWeaponThumbnails(); });
      this.requireActive();
      this.resize();
      await this.uploadEverything();
      this.requireActive();
      this.onProgress(.98, 'Chamando a turma');
    })();
    return this.warming;
  }

  prepareMatch(snapshot: NonNullable<RenderFrame['snapshot']>): Promise<void> {
    this.preparation = this.preparation.then(async () => {
      this.requireActive();
      await this.warmup();
      this.requireActive();
      this.avatars.prepare(snapshot.actors);
      await this.uploadEverything(false);
      this.requireActive();
      this.onProgress(1, 'Pronto!');
    });
    return this.preparation;
  }

  // One offscreen frame with culling off, every LOD level and weapon model shown
  // and the shadow pass on: uploads all geometry and textures and compiles every
  // program variant (incl. shadow depth), so nothing stalls mid-match; the old
  // landing hitch was the first-person scene, far LODs and chests compiling and
  // uploading on the frame you touched the ground.
  private async uploadEverything(reportProgress = true) {
    this.requireActive();
    const target = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
    const culled: THREE.Object3D[] = [], hidden: THREE.Object3D[] = [];
    const lods: { object: THREE.LOD; autoUpdate: boolean }[] = [];
    const shadowMaps: { shadow: THREE.LightShadow; size: THREE.Vector2; map: THREE.RenderTarget | null }[] = [];
    const reveal = (root: THREE.Object3D) => root.traverse(object => {
      if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
      if (!object.visible && !(object instanceof THREE.Light)) { hidden.push(object); object.visible = true; }
      if (object instanceof THREE.LOD) { lods.push({ object, autoUpdate: object.autoUpdate }); object.autoUpdate = false; }
    });
    // Stand-in capybaras (one per bandana colour, with gun, parachute and name tag)
    // build and upload the shared body geometries and compile the skinned programs.
    // Later match preparation uploads the actual players; shared rigs and
    // palette variants are already resident from the initial warmup.
    const stands = reportProgress ? [...PLAYER_COLORS, BOT_COLOR].map(color => avatar(color, 'Capivara')) : [];
    for (const stand of stands) {
      stand.weapon.geometry = itemGeometry('weapon', 'm4'); stand.group.position.copy(this.camera.position);
      this.scene.add(stand.group);
    }
    this.releaseWarmupAvatars = () => {
      this.releaseWarmupAvatars = null;
      for (const stand of stands) {
        this.scene.remove(stand.group); stand.weapon.geometry.dispose(); stand.body.skeleton.dispose();
        stand.group.traverse(object => { if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); } });
        stand.chute.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      }
    };
    this.scene.add(this.avatars.warmupWeapons);
    this.effects.warm(true);
    reveal(this.scene); this.weaponView.revealAll(true); reveal(this.weaponView.scene);
    this.assets.prepareTextures(this.scene); this.assets.prepareTextures(this.weaponView.scene);
    instrumentMaterials(this.scene); instrumentMaterials(this.weaponView.scene);
    const shadows = this.gl.shadowMap.enabled;
    try {
      this.pipeline.beginWarmup();
      this.scene.traverse(object => {
        if (!(object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight) || !object.castShadow) return;
        const shadow = object.shadow;
        shadowMaps.push({ shadow, size: shadow.mapSize.clone(), map: shadow.map });
        shadow.mapSize.set(64, 64); shadow.map = null;
      });
      // Compile world programs against the same linear target as normal frames.
      this.gl.setRenderTarget(target);
      const compileWorldAt = timing.begin();
      await this.gl.compileAsync(this.scene, this.camera);
      timing.end('shader-compile-world', compileWorldAt, '', true);
      this.requireActive();
      const uploadWorldAt = timing.begin();
      this.gl.render(this.scene, this.camera);
      timing.end('warmup-upload-world', uploadWorldAt, '', true);
      if (reportProgress) this.onProgress(.96, 'Afiando as armas');
      // First person now uses a linear target before shared output and AA.
      this.pipeline.beginFirstPersonWarmup();
      const compileFpAt = timing.begin();
      await this.gl.compileAsync(this.weaponView.scene, this.weaponView.camera);
      timing.end('shader-compile-first-person', compileFpAt, '', true);
      this.requireActive();
      const uploadFpAt = timing.begin();
      this.gl.render(this.weaponView.scene, this.weaponView.camera);
      timing.end('warmup-upload-first-person', uploadFpAt, '', true);
      const postAt = timing.begin();
      await this.pipeline.warmup(this.scene, this.camera);
      timing.end('shader-compile-post', postAt, '', true);
      this.requireActive();
      this.pipeline.renderPost(target);
    } finally {
      if (!this.disposed) { this.gl.setRenderTarget(null); this.gl.shadowMap.enabled = shadows; }
      culled.forEach(object => { object.frustumCulled = true; });
      hidden.forEach(object => { object.visible = false; });
      lods.forEach(({ object, autoUpdate }) => { object.autoUpdate = autoUpdate; });
      for (const { shadow, size, map } of shadowMaps) {
        shadow.map?.dispose(); shadow.map = map; shadow.mapSize.copy(size);
      }
      if (!this.disposed) this.pipeline.resize();
      this.weaponView.revealAll(false);
      this.effects.warm(false);
      target.dispose(); this.scene.remove(this.avatars.warmupWeapons);
      this.releaseWarmupAvatars?.();
    }
  }

  resize(): void {
    if (this.disposed) return;
    const canvas = this.gl.domElement;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    // CSS pixels belong to the viewport; DPR belongs only to GPU attachments.
    // Never feed a stale canvas layout back into the next drawing-buffer size.
    canvas.style.width = '100vw'; canvas.style.height = '100vh';
    const dpr = window.devicePixelRatio || 1;
    if (width === this.lastSize.width && height === this.lastSize.height && dpr === this.lastDeviceRatio) return;
    this.lastDeviceRatio = dpr;
    // Apply CSS extent and DPR together. Moving between displays must not
    // allocate the old extent at the new DPR, then allocate it all again.
    this.gl.setDrawingBufferSize(width, height, Math.min(dpr, PRESETS[this.settings.graphics].dpr) * this.resolutionScale);
    this.lastSize = { width, height }; this.pipeline.resize();
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.weaponView.resize(width, height); this.avatars.resize(width, height);
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.resolutionScale = 1; this.applyPreset(settings);
    this.worldView.setSettings(settings);
    this.scene.fog = new THREE.Fog(PAINT.fog, 34, 285);
    this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); this.resize();
  }

  // The spectate hand-off waits for the camera's own clock, which is clamped per frame.
  get deathCamActive() { return this.cameraRig.deathCamActive; }

  get stats() { return { ...this.frameStats }; }
  get cameraPosition(): Vec3 { return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.worldView.group);
    this.worldView.dispose(); this.ambientLife.dispose(); this.weaponView.dispose(); this.supplyDrops.dispose();
    this.scene.remove(this.sky.group); this.sky.dispose();
    this.scene.remove(this.storm.mesh); this.storm.dispose();
    this.environment.dispose(); this.pipeline.dispose(); this.assets.dispose(); this.effects.dispose();
    // Detach avatar instances before traversing resources owned by this scene.
    this.releaseWarmupAvatars?.();
    this.avatars.dispose();
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
    materials.forEach(mat => mat.dispose());
    disposeCapybaraAssets();
    this.gl.dispose();
  }
}
