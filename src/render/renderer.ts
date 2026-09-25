import * as THREE from 'three';
import { disposeCapybaraAssets, preloadCapybaraAsset } from './capybara';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { damp } from '../shared/math';
import { PLAYER_COLORS, type GameEvent, type RenderFrame, type Settings, type Vec3, type WorldSpec } from '../shared/types';
import { WorldScene } from './world-scene';
import { WeaponView } from './weapons';
import { AvatarView, avatar, BOT_COLOR } from './avatars';
import { CameraRig, makePlane } from './camera';
import { LootView } from './loot';
import { EffectsView } from './effects';
import { RenderPipeline, PRESETS } from './pipeline';
import { itemGeometry } from './item-geometry';
export { itemGeometry } from './item-geometry';

export class GameRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly worldView: WorldScene;
  private readonly weaponView: WeaponView;
  private readonly avatars: AvatarView;
  private readonly cameraRig: CameraRig;
  private readonly loot: LootView;
  private readonly effects: EffectsView;
  private readonly pipeline: RenderPipeline;
  private readonly plane = makePlane();
  private readonly zone: THREE.Mesh;
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

  constructor(canvas: HTMLCanvasElement, world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}) {
    this.settings = settings;
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
    this.loot = new LootView(this.scene, world);
    this.effects = new EffectsView(this.scene);
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
    this.adaptResolution();
    const dt = Math.min(Math.max(frame.dt || 0, 0), .05);
    this.lastFrame = frame; this.elapsed += dt;
    this.worldView.update(this.elapsed);
    this.cameraRig.updatePlanePath(frame.snapshot, dt, this.elapsed);
    this.avatars.update(frame, this.cameraRig.cameraBlend, this.elapsed);
    this.cameraRig.update(frame, this.settings, this.elapsed, this.weaponView.adsAmount);
    this.loot.update(frame.snapshot, this.elapsed); this.effects.update(dt);
    const room = this.litRooms.find(room => Math.abs(this.camera.position.x - room.x) < room.w / 2 &&
      Math.abs(this.camera.position.z - room.z) < room.d / 2 && this.camera.position.y < room.y + 3.1);
    if (room) {
      this.interiorLight.position.set(room.bakery ? room.x + room.w / 2 - 1.95 : room.x,
        room.y + (room.bakery ? .93 : 2.45), room.bakery ? room.z - room.d * .24 : room.z);
      this.interiorLight.color.set(room.bakery ? '#ffae62' : '#ffdcaa');
    }
    this.interiorLight.intensity = damp(this.interiorLight.intensity, room ? room.bakery ? 4.3 : 4 : 0, 7, dt);
    const snapshot = frame.snapshot;
    const viewed = this.cameraRig.lastActor;
    this.weaponView.update(frame.playing && viewed?.id === frame.playerId ? viewed : undefined, dt, this.settings, this.cameraRig.closeWall(), snapshot?.time || 0);
    if (snapshot) {
      const zone = snapshot.zone;
      this.worldView.arenaBoundary.visible = snapshot.config.mode === 'deathmatch';
      // Like legacy, the storm wall is always up: a tall curtain at the safe
      // edge that also hides the empty far sea.
      this.zone.visible = frame.playing && snapshot.config.mode === 'battle-royale';
      this.zone.position.set(zone.x, 70, zone.z); this.zone.scale.set(zone.radius, 170, zone.radius);
      (this.zone.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
      this.plane.visible = frame.playing && snapshot.config.mode === 'battle-royale' && snapshot.actors.some(a => a.stage === 'plane');
      this.plane.position.copy(this.cameraRig.planePosition);
      // The nose (-Z) follows the flight path.
      if (this.cameraRig.planeVelocity.lengthSq() > 1) this.plane.rotation.y = Math.atan2(-this.cameraRig.planeVelocity.x, -this.cameraRig.planeVelocity.z);
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
    this.pipeline.render(this.scene, this.camera, this.frameStats);
    const scoped = viewed?.ads && !viewed.sprint && viewed.reloadUntil <= (snapshot?.time || 0) && ['sniper', 'dmr'].includes(viewed.weapons[viewed.slot]?.id || '');
    if (frame.playing && viewed?.alive && viewed.stage === 'ground' && viewed.id === frame.playerId && !scoped && this.cameraRig.cameraBlend < .35) {
      this.gl.autoClear = false; this.gl.clearDepth(); this.gl.render(this.weaponView.scene, this.weaponView.camera); this.gl.autoClear = true;
      this.frameStats.drawCalls += this.gl.info.render.calls;
      this.frameStats.triangles += this.gl.info.render.triangles;
    }
  }

  event(event: GameEvent): void {
    this.effects.event(event, this.avatars, this.weaponView, this.lastFrame?.playerId);
  }

  // Menu-time preload: waits for the world's textures (and sky) to arrive, then compiles every
  // shader of the world and first-person scenes so the first match frame doesn't stall.
  // Opt-in characters must finish loading; rejection keeps the match behind its loading gate.
  warmup(): Promise<void> {
    this.warming ||= (async () => {
      const started = performance.now();
      await preloadCapybaraAsset();
      const textures = () => { const list: THREE.Texture[] = []; this.scene.traverse(object => { const mats = (object as THREE.Mesh).material; for (const mat of Array.isArray(mats) ? mats : mats ? [mats] : []) for (const value of Object.values(mat)) if (value instanceof THREE.Texture) list.push(value); }); return list; };
      const loaded = (texture: THREE.Texture) => { const image = texture.image as { complete?: boolean; data?: unknown; width?: number } | null; return !!image && image.complete !== false && (image.data !== undefined || (image.width ?? 0) > 0); };
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
  // program variant (incl. shadow depth), so nothing stalls mid-match; the old
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
      this.pipeline.renderPost();
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
    this.scene.remove(this.worldView.group);
    this.worldView.dispose(); this.weaponView.dispose();
    this.environment.dispose(); this.pipeline.dispose();
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
    disposeCapybaraAssets();
    this.gl.dispose();
  }
}
