import * as THREE from 'three';
import { createOutlineMaterial } from './toon';
import { CharacterMask } from './character-mask';
import { timing } from './timing';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { AtmospherePass } from './atmosphere-pass';

// Graphics presets. The outline pass is the art style, so it runs on every
// preset; what scales is resolution and shadows. Final FXAA covers every preset.
// World depth stays single-sampled: resolving even two samples across overlapping
// R6 skin parts rejects mask pixels at the chin/bandana seam (TATU40).
export const PRESETS = {
  low: { dpr: .75, samples: 0, shadows: false, shadowReach: 0, shadowSize: 1024, interior: true, atmosphere: false, smaa: false },
  medium: { dpr: 1.5, samples: 0, shadows: true, shadowReach: 36, shadowSize: 1024, interior: true, atmosphere: true, smaa: true },
  high: { dpr: 2, samples: 0, shadows: true, shadowReach: 64, shadowSize: 2048, interior: true, atmosphere: true, smaa: true },
} as const;

export class RenderPipeline {
  private readonly atmosphere: AtmospherePass;
  private readonly smaa = new SMAAPass();
  private useSmaa = false;
  private readonly mask: CharacterMask;
  private readonly fpTarget: THREE.WebGLRenderTarget;
  private readonly fpMaterial: THREE.ShaderMaterial;
  private readonly fpScene = new THREE.Scene();
  private readonly savedClear = new THREE.Color();
  private disposed = false;
  private readonly postTarget: THREE.WebGLRenderTarget;
  private readonly aaTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly aaMaterial: THREE.ShaderMaterial;
  private readonly aaScene = new THREE.Scene();
  private readonly postMaterial: THREE.ShaderMaterial;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly gl: THREE.WebGLRenderer, samples: number) {
    this.postTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.postTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.atmosphere = new AtmospherePass(this.postTarget.texture, this.postTarget.depthTexture);
    this.mask = new CharacterMask(this.postTarget.depthTexture);
    this.fpTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.fpTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.fpMaterial = createOutlineMaterial(this.fpTarget.texture, this.fpTarget.depthTexture);
    this.fpMaterial.uniforms.transparentBackground.value = 1;
    this.fpMaterial.transparent = true;
    this.fpMaterial.uniforms.ink.value.set(.168627, .105882, .070588);
    const fpQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fpMaterial);
    fpQuad.frustumCulled = false; this.fpScene.add(fpQuad);
    this.aaMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.aaMaterial.uniforms.tDiffuse.value = this.aaTarget.texture;
    const aaQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aaMaterial);
    aaQuad.frustumCulled = false; this.aaScene.add(aaQuad);
    this.postMaterial = createOutlineMaterial(this.postTarget.texture, this.postTarget.depthTexture);
    this.postMaterial.uniforms.tAtmosphere.value = this.atmosphere.target.texture;
    this.postMaterial.uniforms.tCharacter.value = this.mask.target.texture;
    this.postMaterial.uniforms.characterEnabled.value = 1;
    this.postMaterial.uniforms.suppressWater.value = 1;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial); quad.frustumCulled = false; this.postScene.add(quad);
  }

  setSamples(samples: number) {
    if (this.postTarget.samples !== samples) { this.postTarget.samples = samples; this.postTarget.dispose(); }
  }

  setQuality(preset: typeof PRESETS[keyof typeof PRESETS]) {
    this.atmosphere.enabled = preset.atmosphere;
    this.postMaterial.uniforms.atmosphereEnabled.value = Number(preset.atmosphere);
    this.useSmaa = preset.smaa;
  }

  resize() {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.postTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.atmosphere.resize(size.x, size.y); this.smaa.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.mask.resize(Math.max(1, size.x), Math.max(1, size.y));
    this.fpTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.fpMaterial.uniforms.texel.value.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
    this.fpMaterial.uniforms.width.value = Math.max(1, size.y / 1080 * 1.5);
    this.aaTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.aaMaterial.uniforms.resolution.value.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
    this.postMaterial.uniforms.width.value = Math.max(.75, Math.min(1, size.y / 720) + Math.max(0, size.y - 720) / 360 * .25);
    (this.postMaterial.uniforms.texel.value as THREE.Vector2).set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, stats: { drawCalls: number; triangles: number },
    firstPersonScene?: THREE.Scene, firstPersonCamera?: THREE.PerspectiveCamera) {
    this.gl.setRenderTarget(this.postTarget); this.gl.render(scene, camera);
    stats.drawCalls = this.gl.info.render.calls; stats.triangles = this.gl.info.render.triangles;
    this.mask.render(this.gl, scene, camera);
    stats.drawCalls += this.gl.info.render.calls; stats.triangles += this.gl.info.render.triangles;
    if (this.atmosphere.enabled) { this.atmosphere.render(this.gl, camera); stats.drawCalls++; stats.triangles += 2; }
    this.postMaterial.uniforms.cameraWorldY.value = camera.position.y;
    const matrix = camera.matrixWorld.elements;
    this.postMaterial.uniforms.cameraUpRow.value.set(matrix[1], matrix[5], matrix[9]);
    this.postMaterial.uniforms.inverseProjectionScale.value.set(1 / camera.projectionMatrix.elements[0], 1 / camera.projectionMatrix.elements[5]);
    this.postMaterial.uniforms.cn.value = camera.near; this.postMaterial.uniforms.cf.value = camera.far;
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    stats.drawCalls++; stats.triangles += 2;
    if (firstPersonScene && firstPersonCamera) {
      const started = timing.begin(), alpha = this.gl.getClearAlpha(); this.gl.getClearColor(this.savedClear);
      try {
        this.gl.setClearColor(0, 0); this.gl.setRenderTarget(this.fpTarget); this.gl.render(firstPersonScene, firstPersonCamera);
        stats.drawCalls += this.gl.info.render.calls; stats.triangles += this.gl.info.render.triangles;
      } finally { this.gl.setClearColor(this.savedClear, alpha); }
      this.fpMaterial.uniforms.cn.value = firstPersonCamera.near; this.fpMaterial.uniforms.cf.value = firstPersonCamera.far;
      this.fpMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
      this.gl.setRenderTarget(this.aaTarget); this.gl.autoClear = false;
      try { this.gl.render(this.fpScene, this.postCamera); } finally { this.gl.autoClear = true; }
      stats.drawCalls++; stats.triangles += 2;
      timing.end('first-person-draw', started);
    }
    this.renderAA();
    stats.drawCalls += this.useSmaa ? 3 : 1; stats.triangles += this.useSmaa ? 6 : 2;
  }

  private renderAA() {
    if (this.useSmaa) {
      this.smaa.renderToScreen = true;
      this.smaa.render(this.gl, this.postTarget, this.aaTarget, 0, false);
    } else { this.gl.setRenderTarget(null); this.gl.render(this.aaScene, this.postCamera); }
  }

  beginFirstPersonWarmup() { this.gl.setRenderTarget(this.fpTarget); }

  // Storm exposure (0..1) and the decaying pulse of the latest storm bite.
  setScreenFeedback(storm: number, pulse: number) {
    this.postMaterial.uniforms.uStorm.value = storm; this.postMaterial.uniforms.uPulse.value = pulse;
  }

  async warmup(scene?: THREE.Scene, camera?: THREE.PerspectiveCamera) {
    // r186 renamed these implementation fields before @types/three caught up.
    // Decode its bundled lookup images while the loading screen is still up.
    const smaa = this.smaa as unknown as { _areaTexture: THREE.Texture; _searchTexture: THREE.Texture };
    await Promise.all([smaa._areaTexture, smaa._searchTexture].map(texture => (texture.image as HTMLImageElement).decode()));
    for (const post of [this.postScene, this.aaScene, this.fpScene, this.atmosphere.scene]) {
      if (this.disposed) throw new Error('Pipeline disposed during warmup');
      await this.gl.compileAsync(post, this.postCamera);
    }
    if (this.disposed) throw new Error('Pipeline disposed during warmup');
    if (scene && camera) {
      // Allocate both attachments and submit every preloaded skinned mask variant
      // while the loading overlay still covers the canvas.
      this.gl.initRenderTarget(this.postTarget);
      this.mask.render(this.gl, scene, camera);
      this.atmosphere.render(this.gl, camera);
    }
  }

  renderPost() {
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    this.renderAA();
  }

  dispose() {
    this.disposed = true;
    this.atmosphere.dispose(); this.smaa.dispose();
    this.mask.dispose(); this.fpTarget.dispose(); this.fpMaterial.dispose();
    this.fpScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.aaTarget.dispose(); this.aaMaterial.dispose();
    this.aaScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.postTarget.dispose();
    this.postMaterial.dispose(); this.postScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  }
}
