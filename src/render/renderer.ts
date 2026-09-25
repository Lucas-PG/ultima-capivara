import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { damp } from '../shared/math';
import { PLAYER_COLORS, type GameEvent, type RenderFrame, type Settings, type Vec3, type WorldSpec, type ZoneState } from '../shared/types';
import { AssetLoader } from './assets';
import type { AssetProgressCallback } from './asset-progress';
import { WorldScene } from './world-scene';
import { WeaponView } from './weapons';
import { AvatarView, avatar, BOT_COLOR } from './avatars';
import { CameraRig, makePlane } from './camera';
import { LootView } from './loot';
import { EffectsView } from './effects';
import { StormView } from './storm';
import { RenderPipeline, PRESETS } from './pipeline';
import { itemGeometry } from './item-geometry';
export { itemGeometry } from './item-geometry';

const ZONE_NONE: ZoneState = { x: 0, z: 0, radius: 0, nextRadius: 0, nextX: 0, nextZ: 0, phase: 0, shrinking: false, timeLeft: 0, damage: 0 };

export class GameRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly worldView: WorldScene;
  private readonly weaponView: WeaponView;
  private readonly assets: AssetLoader;
  private readonly onProgress: AssetProgressCallback;
  private readonly avatars: AvatarView;
  private readonly cameraRig: CameraRig;
  private readonly loot: LootView;
  private readonly effects: EffectsView;
  private readonly pipeline: RenderPipeline;
  private readonly plane = makePlane();
  private readonly storm: StormView;
  private stormAmount = 0;
  private stormPulse = 0;
  private effectsMatch = '';
  private readonly propellers = this.plane.children.filter(child => child.name === 'propeller');
  private readonly sun: THREE.DirectionalLight;
  private readonly interiorLight = new THREE.PointLight('#ffd09b', 0, 8, 2);
  private readonly litRooms: { x: number; y: number; z: number; w: number; d: number; bakery: boolean }[];
  private readonly environment: THREE.WebGLRenderTarget;
  private settings: Settings;
  private elapsed = 0;
  private lastFrame: RenderFrame | null = null;
  private lastSize = { width: 1, height: 1 };
  private frameStats = { drawCalls: 0, triangles: 0 };
  private resolutionScale = 1;
  private frameInterval = 16.7;
  private lastUpdateAt = 0;
  private slowFor = 0;
  private fastFor = 0;
  private warming: Promise<void> | null = null;
  private preparation: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}, onProgress: AssetProgressCallback = () => {}) {
    this.onProgress = (fraction, label) => { if (!this.disposed) onProgress(fraction, label); };
    this.settings = settings;
    this.litRooms = world.objects.filter(object => object.detail === 'prop:house:bakery' || object.detail === 'prop:house:cafe')
      .map(object => ({ ...object.pos, w: object.scale.x, d: object.scale.z, bakery: object.detail!.endsWith('bakery') }));
    // No canvas MSAA: every frame is drawn through the post target, so a multisampled
    // canvas only added a full-screen resolve.
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.assets = new AssetLoader(this.gl, this.onProgress);
    this.weaponView = new WeaponView(this.assets, () => { if (!this.disposed) onAssetsReady(); });
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
    this.avatars = new AvatarView(this.scene, this.camera);
    this.cameraRig = new CameraRig(this.camera, world, settings, this.avatars);
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
    this.worldView = new WorldScene(world, settings, this.assets, () => {
      if (this.disposed) return;
      if (this.worldView.skyTexture.image?.data) {
        this.scene.background = this.worldView.skyTexture;
        this.scene.backgroundIntensity = .8;
        haze.visible = false;
      }
      onAssetsReady();
    });
    this.scene.add(this.worldView.group);
    this.scene.add(this.plane); this.plane.visible = false;
    this.storm = new StormView(this.scene);
    this.loot = new LootView(this.scene, world);
    this.effects = new EffectsView(this.scene, world, this.weaponView.scene);
    this.pipeline = new RenderPipeline(this.gl, PRESETS[settings.graphics].samples);
    this.applyPreset(settings);
    this.resize();
  }

  private applyPreset(settings: Settings) {
    const preset = PRESETS[settings.graphics];
    this.applyPixelRatio();
    this.pipeline.setSamples(preset.samples);
    this.gl.shadowMap.enabled = preset.shadows; this.sun.castShadow = preset.shadows;
    this.interiorLight.visible = preset.interior;
    const reach = preset.shadowReach || 30, shadow = this.sun.shadow.camera;
    shadow.left = -reach; shadow.right = reach; shadow.top = reach; shadow.bottom = -reach; shadow.updateProjectionMatrix();
  }

  private applyPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, PRESETS[this.settings.graphics].dpr) * this.resolutionScale;
    if (Math.abs(this.gl.getPixelRatio() - ratio) > .01) { this.gl.setPixelRatio(ratio); this.pipeline.resize(); }
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

  update(frame: RenderFrame): void {
    if (this.disposed) return;
    this.adaptResolution();
    const dt = Math.min(Math.max(frame.dt || 0, 0), .05);
    this.lastFrame = frame; this.elapsed += dt;
    // A new match starts with no marks, shells or effects from the previous one.
    if (frame.snapshot && frame.snapshot.matchId !== this.effectsMatch) { this.effectsMatch = frame.snapshot.matchId; this.effects.clear(); }
    this.worldView.update(this.elapsed);
    this.cameraRig.updatePlanePath(frame.snapshot, dt, this.elapsed);
    this.avatars.update(frame, this.cameraRig.cameraBlend, this.elapsed);
    this.cameraRig.update(frame, this.settings, this.elapsed, this.weaponView.adsAmount);
    this.loot.update(frame.snapshot, this.elapsed);
    let room: typeof this.litRooms[number] | undefined;
    for (const candidate of this.litRooms) if (Math.abs(this.camera.position.x - candidate.x) < candidate.w / 2 &&
      Math.abs(this.camera.position.z - candidate.z) < candidate.d / 2 && this.camera.position.y < candidate.y + 3.1) { room = candidate; break; }
    if (room) {
      this.interiorLight.position.set(room.bakery ? room.x + room.w / 2 - 1.95 : room.x,
        room.y + (room.bakery ? .93 : 2.45), room.bakery ? room.z - room.d * .24 : room.z);
      this.interiorLight.color.setHex(room.bakery ? 0xffae62 : 0xffdcaa);
    }
    this.interiorLight.intensity = damp(this.interiorLight.intensity, room ? room.bakery ? 4.3 : 4 : 0, 7, dt);
    const snapshot = frame.snapshot;
    const viewed = this.cameraRig.lastActor;
    this.weaponView.update(frame.playing && viewed?.id === frame.playerId ? viewed : undefined, dt, this.settings, this.cameraRig.closeWall(), snapshot?.time || 0);
    const held = viewed?.weapons[viewed.slot]?.id;
    const scoped = viewed?.ads && !viewed.sprint && viewed.reloadUntil <= (snapshot?.time || 0) && (held === 'sniper' || held === 'dmr');
    const firstPerson = !!(frame.playing && viewed?.alive && viewed.stage === 'ground' && viewed.id === frame.playerId && !scoped && this.cameraRig.cameraBlend < .35);
    this.effects.update(dt, { camera: this.camera, fpCamera: this.weaponView.camera, avatars: this.avatars, firstPerson, viewportHeight: this.lastSize.height });
    if (snapshot) {
      const zone = snapshot.zone;
      this.worldView.arenaBoundary.visible = snapshot.config.mode === 'deathmatch';
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
      const altitude = THREE.MathUtils.smoothstep(this.camera.position.y, 15, 110), far = this.settings.graphics === 'low' ? 330 : 420;
      this.scene.fog.near = 90 * (1 + altitude); this.scene.fog.far = far * (1 + .35 * altitude);
    }
    if (this.settings.graphics !== 'low') {
      this.sun.position.set(this.camera.position.x - 55, 84, this.camera.position.z - 38);
      this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.sun.target.updateMatrixWorld();
    }
    this.pipeline.render(this.scene, this.camera, this.frameStats);
    if (firstPerson) {
      this.gl.autoClear = false; this.gl.clearDepth(); this.gl.render(this.weaponView.scene, this.weaponView.camera); this.gl.autoClear = true;
      this.frameStats.drawCalls += this.gl.info.render.calls;
      this.frameStats.triangles += this.gl.info.render.triangles;
    }
  }

  private hasPlanePassengers(snapshot: NonNullable<RenderFrame['snapshot']>) {
    for (const actor of snapshot.actors) if (actor.stage === 'plane') return true;
    return false;
  }

  event(event: GameEvent): void {
    const frame = this.lastFrame, viewed = frame?.spectateId || frame?.playerId;
    // A storm bite on the viewed capybara: attacker-less damage while outside the zone.
    if (event.type === 'damage' && !event.actor && event.target === viewed && this.stormAmount > .5) this.stormPulse = 1;
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
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const culled: THREE.Object3D[] = [], hidden: THREE.Object3D[] = [], lods: THREE.LOD[] = [];
    const reveal = (root: THREE.Object3D) => root.traverse(object => {
      if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
      if (!object.visible && !(object instanceof THREE.Light)) { hidden.push(object); object.visible = true; }
      if (object instanceof THREE.LOD) { lods.push(object); object.autoUpdate = false; }
    });
    // Stand-in capybaras (one per fur colour, with gun, parachute and name tag)
    // build and upload the shared body geometries and compile the skinned programs.
    const stands = [...PLAYER_COLORS, BOT_COLOR].map(color => avatar(color, 'Capivara'));
    for (const stand of stands) {
      stand.weapon.geometry = itemGeometry('weapon', 'm4'); stand.group.position.copy(this.camera.position);
      this.scene.add(stand.group);
    }
    this.scene.add(this.avatars.warmupWeapons);
    this.effects.warm(true);
    reveal(this.scene); this.weaponView.revealAll(true); reveal(this.weaponView.scene);
    const shadows = this.gl.shadowMap.enabled;
    try {
      // Compile world programs against the same linear target as normal frames.
      this.gl.setRenderTarget(target);
      await this.gl.compileAsync(this.scene, this.camera);
      this.requireActive();
      this.gl.render(this.scene, this.camera);
      if (reportProgress) this.onProgress(.96, 'Afiando as armas');
      // First-person and post shaders target the canvas, with output colour and tone mapping.
      this.gl.setRenderTarget(null);
      await this.gl.compileAsync(this.weaponView.scene, this.weaponView.camera);
      this.requireActive();
      this.gl.render(this.weaponView.scene, this.weaponView.camera);
      await this.pipeline.warmup();
      this.requireActive();
      this.pipeline.renderPost();
    } finally {
      if (!this.disposed) { this.gl.setRenderTarget(null); this.gl.shadowMap.enabled = shadows; }
      culled.forEach(object => { object.frustumCulled = true; });
      hidden.forEach(object => { object.visible = false; });
      lods.forEach(lod => { lod.autoUpdate = true; });
      this.weaponView.revealAll(false);
      this.effects.warm(false);
      target.dispose(); this.scene.remove(this.avatars.warmupWeapons);
      for (const stand of stands) {
        this.scene.remove(stand.group); stand.weapon.geometry.dispose(); stand.body.skeleton.dispose();
        stand.group.traverse(object => { if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); } });
        stand.chute.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      }
    }
  }

  resize(): void {
    if (this.disposed) return;
    const canvas = this.gl.domElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth), height = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (width === this.lastSize.width && height === this.lastSize.height) return;
    this.lastSize = { width, height }; this.gl.setSize(width, height, false); this.pipeline.resize();
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
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.worldView.group);
    this.worldView.dispose(); this.weaponView.dispose();
    this.environment.dispose(); this.pipeline.dispose(); this.assets.dispose(); this.effects.dispose(); this.storm.dispose();
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
    this.avatars.dispose();
    materials.forEach(mat => mat.dispose());
    this.gl.dispose();
  }
}
