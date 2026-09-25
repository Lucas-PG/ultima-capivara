import * as THREE from 'three';
import { createOutlineMaterial } from './toon';
import { CharacterMask } from './character-mask';
import { timing } from './timing';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Graphics presets. The outline pass is the art style, so it runs on every
// preset; what scales is resolution and shadows. Final FXAA covers every preset.
// World depth stays single-sampled: resolving even two samples across overlapping
// R6 skin parts rejects mask pixels at the chin/bandana seam (TATU40).
export const PRESETS = {
  low: { dpr: .75, samples: 0, shadows: false, shadowReach: 0, interior: true },
  medium: { dpr: 1, samples: 0, shadows: true, shadowReach: 32, interior: true },
  high: { dpr: 1.25, samples: 0, shadows: true, shadowReach: 42, interior: true },
} as const;

export class RenderPipeline {
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
    this.postMaterial.uniforms.tCharacter.value = this.mask.target.texture;
    this.postMaterial.uniforms.characterEnabled.value = 1;
    this.postMaterial.uniforms.suppressWater.value = 1;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial); quad.frustumCulled = false; this.postScene.add(quad);
  }

  setSamples(samples: number) {
    if (this.postTarget.samples !== samples) { this.postTarget.samples = samples; this.postTarget.dispose(); }
  }

  resize() {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.postTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
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
    this.gl.setRenderTarget(null); this.gl.render(this.aaScene, this.postCamera);
    stats.drawCalls++; stats.triangles += 2;
  }

  beginFirstPersonWarmup() { this.gl.setRenderTarget(this.fpTarget); }

  // Storm exposure (0..1) and the decaying pulse of the latest storm bite.
  setScreenFeedback(storm: number, pulse: number) {
    this.postMaterial.uniforms.uStorm.value = storm; this.postMaterial.uniforms.uPulse.value = pulse;
  }

  async warmup(scene?: THREE.Scene, camera?: THREE.PerspectiveCamera) {
    for (const post of [this.postScene, this.aaScene, this.fpScene]) {
      if (this.disposed) throw new Error('Pipeline disposed during warmup');
      await this.gl.compileAsync(post, this.postCamera);
    }
    if (this.disposed) throw new Error('Pipeline disposed during warmup');
    if (scene && camera) {
      // Allocate both attachments and submit every preloaded skinned mask variant
      // while the loading overlay still covers the canvas.
      this.gl.initRenderTarget(this.postTarget);
      this.mask.render(this.gl, scene, camera);
    }
  }

  renderPost() {
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    this.gl.setRenderTarget(null); this.gl.render(this.aaScene, this.postCamera);
  }

  dispose() {
    this.disposed = true;
    this.mask.dispose(); this.fpTarget.dispose(); this.fpMaterial.dispose();
    this.fpScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.aaTarget.dispose(); this.aaMaterial.dispose();
    this.aaScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.postTarget.dispose();
    this.postMaterial.dispose(); this.postScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  }
}
