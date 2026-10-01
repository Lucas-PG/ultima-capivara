import * as THREE from 'three';
import { createOutlineMaterial } from './toon';
import { CharacterMask } from './character-mask';
import { timing } from './timing';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SMAABlendShader, SMAAEdgesShader, SMAAWeightsShader } from 'three/addons/shaders/SMAAShader.js';
import { AtmospherePass } from './atmosphere-pass';
import { createUpscaleMaterial } from './upscale';
import { gpuPasses } from './gpu-passes';
import { gpuFrameTimer } from './gpu-frame-timer';

// Full-resolution character silhouettes stay thin. Medium/High use SMAA;
// Low uses FXAA and omits ambient occlusion and bloom, but keeps a short-reach
// sun shadow: without it crates, carts and players floated on flat ground.
// World depth stays single-sampled: resolving even two samples across overlapping
// R6 skin parts rejects mask pixels at the chin/bandana seam (TATU40).
// Render resolution per preset lives in ./resolution (PRESET_DENSITY).
export const PRESETS = {
  low: { samples: 0, shadows: true, shadowReach: 22, shadowSize: 1024, interior: true, atmosphere: false, smaa: false },
  medium: { samples: 0, shadows: true, shadowReach: 36, shadowSize: 1024, interior: true, atmosphere: true, smaa: true },
  high: { samples: 0, shadows: true, shadowReach: 64, shadowSize: 2048, interior: true, atmosphere: true, smaa: true },
} as const;

/** Full-screen passes also fill this many pixels past the rendered region, from clamped lookups, so
 * anti-aliasing and the upscale never read stale pixels at the right and top edges. */
export const GUARD = 8;

const quad = (material: THREE.Material) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); mesh.frustumCulled = false; return mesh; };

// SMAA through a viewport of targets allocated at the largest render size, so a resolution
// change costs nothing; edges and weights in 8-bit targets (half the bandwidth of the stock pass).
class ScaledSMAA {
  readonly edges = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, format: THREE.RGFormat });
  readonly weights = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  readonly source: SMAAPass;
  readonly uvScale = new THREE.Vector2(1, 1);
  // The blend into the canvas covers exactly the rendered region; into a target, the padded one.
  private readonly validScale = new THREE.Vector2(1, 1);
  private readonly blendScale = new THREE.Vector2(1, 1);
  private readonly resolution = new THREE.Vector2(1, 1);
  readonly edgesMaterial: THREE.ShaderMaterial;
  readonly weightsMaterial: THREE.ShaderMaterial;
  readonly blendMaterial: THREE.ShaderMaterial;
  readonly scene = new THREE.Scene();
  private readonly mesh: THREE.Mesh;

  constructor(input: THREE.Texture) {
    // The stock pass decodes the area and search lookup images; its own targets stay 1x1.
    this.source = new SMAAPass();
    const lookup = this.source as unknown as { _areaTexture: THREE.Texture; _searchTexture: THREE.Texture };
    const scaled = (shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string; defines?: Record<string, string> }, scale = this.uvScale) => new THREE.ShaderMaterial({
      defines: { ...shader.defines }, uniforms: { ...THREE.UniformsUtils.clone(shader.uniforms), resolution: { value: this.resolution }, uvScale: { value: scale } },
      vertexShader: `uniform vec2 uvScale;\n${shader.vertexShader.replace('vUv = uv;', 'vUv = uv * uvScale;')}`,
      fragmentShader: shader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.edgesMaterial = scaled(SMAAEdgesShader); this.edgesMaterial.uniforms.tDiffuse.value = input;
    this.weightsMaterial = scaled(SMAAWeightsShader);
    this.weightsMaterial.uniforms.tDiffuse.value = this.edges.texture;
    this.weightsMaterial.uniforms.tArea.value = lookup._areaTexture; this.weightsMaterial.uniforms.tSearch.value = lookup._searchTexture;
    this.blendMaterial = scaled(SMAABlendShader, this.blendScale);
    this.blendMaterial.uniforms.tDiffuse.value = this.weights.texture; this.blendMaterial.uniforms.tColor.value = input;
    this.mesh = quad(this.edgesMaterial); this.scene.add(this.mesh);
  }
  get lookups() { const lookup = this.source as unknown as { _areaTexture?: THREE.Texture; _searchTexture?: THREE.Texture }; return [lookup._areaTexture, lookup._searchTexture]; }
  setSize(width: number, height: number) {
    this.edges.setSize(width, height); this.weights.setSize(width, height); this.resolution.set(1 / width, 1 / height);
  }
  setViewport(width: number, height: number, allocWidth: number, allocHeight: number, validWidth: number, validHeight: number) {
    this.edges.viewport.set(0, 0, width, height); this.weights.viewport.set(0, 0, width, height);
    this.uvScale.set(width / allocWidth, height / allocHeight); this.validScale.set(validWidth / allocWidth, validHeight / allocHeight);
  }
  render(gl: THREE.WebGLRenderer, camera: THREE.Camera, output: THREE.WebGLRenderTarget | null) {
    this.mesh.material = this.edgesMaterial; gl.setRenderTarget(this.edges); gl.render(this.scene, camera);
    this.mesh.material = this.weightsMaterial; gl.setRenderTarget(this.weights); gl.render(this.scene, camera);
    this.blendScale.copy(output ? this.uvScale : this.validScale);
    this.mesh.material = this.blendMaterial; gl.setRenderTarget(output); gl.render(this.scene, camera);
  }
  dispose() {
    this.edges.dispose(); this.weights.dispose(); this.source.dispose();
    this.edgesMaterial.dispose(); this.weightsMaterial.dispose(); this.blendMaterial.dispose(); this.mesh.geometry.dispose();
  }
}

/** Pixel sizes of one frame: the canvas (output), the targets' allocation, and the region drawn now. */
export type PipelineSize = { outputWidth: number; outputHeight: number; allocWidth: number; allocHeight: number; width: number; height: number };

export class RenderPipeline {
  private atmosphere: AtmospherePass | null = null;
  private smaa: ScaledSMAA | null = null;
  private useSmaa = false;
  private readonly mask: CharacterMask;
  private readonly fpTarget: THREE.WebGLRenderTarget;
  private readonly fpMaterial: THREE.RawShaderMaterial;
  private readonly fpScene = new THREE.Scene();
  private readonly savedClear = new THREE.Color();
  private disposed = false;
  private readonly postTarget: THREE.WebGLRenderTarget;
  private readonly aaTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  // Anti-aliased image at the render resolution, read by the upscale when it differs from the canvas.
  private readonly scaledTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  private readonly aaMaterial: THREE.ShaderMaterial;
  private readonly aaScene = new THREE.Scene();
  private readonly postMaterial: THREE.RawShaderMaterial;
  private readonly postScene = new THREE.Scene();
  private readonly upscaleMaterial: THREE.ShaderMaterial;
  private readonly upscaleScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly aaUvScale = new THREE.Vector2(1, 1);
  private readonly aaPadded = new THREE.Vector2(1, 1);
  private readonly aaValid = new THREE.Vector2(1, 1);
  readonly size: PipelineSize = { outputWidth: 1, outputHeight: 1, allocWidth: 1, allocHeight: 1, width: 1, height: 1 };

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
    this.fpScene.add(quad(this.fpMaterial));
    this.aaMaterial = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(FXAAShader.uniforms), uvScale: { value: this.aaUvScale } },
      vertexShader: `uniform vec2 uvScale;\n${FXAAShader.vertexShader.replace('vUv = uv;', 'vUv = uv * uvScale;')}`,
      fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.aaMaterial.uniforms.tDiffuse.value = this.aaTarget.texture;
    this.aaScene.add(quad(this.aaMaterial));
    this.postMaterial = createOutlineMaterial(this.postTarget.texture, this.postTarget.depthTexture);
    this.postMaterial.uniforms.tCharacter.value = this.mask.target.texture;
    this.postMaterial.uniforms.characterEnabled.value = 1;
    this.postMaterial.uniforms.suppressWater.value = 1;
    this.postScene.add(quad(this.postMaterial));
    this.upscaleMaterial = createUpscaleMaterial(this.scaledTarget.texture);
    // QA builds can compare upscale sharpness with ?sharpen=0.2.
    const sharpen = (import.meta.env.DEV || import.meta.env.VITE_QA === '1') && typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('sharpen') ?? NaN) : NaN;
    if (Number.isFinite(sharpen)) this.upscaleMaterial.uniforms.sharpness.value = sharpen;
    this.upscaleScene.add(quad(this.upscaleMaterial));
  }

  setSamples(samples: number) {
    if (this.postTarget.samples !== samples) { this.postTarget.samples = samples; this.postTarget.dispose(); }
  }

  setQuality(preset: typeof PRESETS[keyof typeof PRESETS]) {
    if (preset.atmosphere) this.atmosphere ||= new AtmospherePass(this.postTarget.texture, this.postTarget.depthTexture!);
    else { this.atmosphere?.dispose(); this.atmosphere = null; }
    if (preset.smaa) this.smaa ||= new ScaledSMAA(this.aaTarget.texture);
    else { this.smaa?.dispose(); this.smaa = null; }
    this.postMaterial.uniforms.tAtmosphere.value = this.atmosphere?.target.texture ?? this.postTarget.texture;
    this.postMaterial.uniforms.atmosphereEnabled.value = Number(preset.atmosphere);
    this.useSmaa = preset.smaa;
    this.allocate(this.size.allocWidth, this.size.allocHeight, true);
    this.applyViewport();
  }

  /** Sizes everything to the canvas: the render region, the allocation and the output are the same. */
  resize() {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(1, size.x), height = Math.max(1, size.y);
    this.setSize({ outputWidth: width, outputHeight: height, allocWidth: width, allocHeight: height, width, height });
  }

  /** Reallocates targets only when the allocation changes; a new render region is free. */
  setSize(size: PipelineSize) {
    Object.assign(this.size, { ...size, width: Math.min(size.width, size.allocWidth), height: Math.min(size.height, size.allocHeight) });
    this.allocate(size.allocWidth, size.allocHeight);
    this.applyViewport();
  }

  /** Changes the rendered region inside the current allocation (dynamic resolution). */
  setRenderSize(width: number, height: number) {
    this.size.width = Math.max(1, Math.min(width, this.size.allocWidth)); this.size.height = Math.max(1, Math.min(height, this.size.allocHeight));
    this.applyViewport();
  }

  private allocated = { width: 0, height: 0 };
  private allocate(width: number, height: number, force = false) {
    if (!force && this.allocated.width === width && this.allocated.height === height) return;
    this.allocated = { width, height };
    this.postTarget.setSize(width, height); this.atmosphere?.resize(width, height); this.smaa?.setSize(width, height);
    this.mask.resize(width, height); this.fpTarget.setSize(width, height);
    this.aaTarget.setSize(width, height); this.scaledTarget.setSize(width, height);
    this.aaMaterial.uniforms.resolution.value.set(1 / width, 1 / height);
    for (const material of [this.postMaterial, this.fpMaterial]) (material.uniforms.texel.value as THREE.Vector2).set(1 / width, 1 / height);
    this.upscaleMaterial.uniforms.sourceSize.value.set(width, height);
  }

  private applyViewport() {
    const { width, height, allocWidth, allocHeight, outputHeight } = this.size;
    // Full-screen passes cover a guard band past the rendered region (clamped lookups fill it).
    const paddedWidth = Math.min(allocWidth, width + GUARD), paddedHeight = Math.min(allocHeight, height + GUARD);
    this.postTarget.viewport.set(0, 0, width, height); this.fpTarget.viewport.set(0, 0, width, height);
    this.mask.setViewport(width, height);
    this.aaTarget.viewport.set(0, 0, paddedWidth, paddedHeight); this.scaledTarget.viewport.set(0, 0, paddedWidth, paddedHeight);
    this.atmosphere?.setViewport(width, height, allocWidth, allocHeight);
    this.smaa?.setViewport(paddedWidth, paddedHeight, allocWidth, allocHeight, width, height);
    this.aaPadded.set(paddedWidth / allocWidth, paddedHeight / allocHeight); this.aaValid.set(width / allocWidth, height / allocHeight);
    for (const material of [this.postMaterial, this.fpMaterial]) {
      // vUv spans the padded region; lookups stay inside the rendered one.
      material.uniforms.uvScale.value.set(paddedWidth / allocWidth, paddedHeight / allocHeight);
      material.uniforms.validScale.value.set(width / allocWidth, height / allocHeight);
      material.uniforms.viewScale.value.set(paddedWidth / width, paddedHeight / height);
      material.uniforms.viewTexel.value.set(1 / width, 1 / height);
    }
    if (this.atmosphere) this.postMaterial.uniforms.atmosphereScale.value.copy(this.atmosphere.validScale);
    // Ink keeps the same width on screen at any render resolution (it was tuned on the output).
    const ratio = height / Math.max(1, outputHeight);
    this.fpMaterial.uniforms.width.value = Math.max(1, outputHeight / 1080 * 1.5) * ratio;
    this.postMaterial.uniforms.width.value = Math.max(.75, Math.min(1, outputHeight / 720) + Math.max(0, outputHeight - 720) / 360 * .25) * ratio;
    this.upscaleMaterial.uniforms.validSize.value.set(width, height);
  }

  /** True when the frame is drawn below the canvas resolution and upscaled. */
  get upscaling() { return this.size.width !== this.size.outputWidth || this.size.height !== this.size.outputHeight; }

  // Compile and upload all variants without filling viewport-sized buffers.
  beginWarmup() { this.setSize({ outputWidth: 64, outputHeight: 64, allocWidth: 64, allocHeight: 64, width: 48, height: 48 }); }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, stats: { drawCalls: number; triangles: number },
    firstPersonScene?: THREE.Scene, firstPersonCamera?: THREE.PerspectiveCamera) {
    gpuFrameTimer.begin();
    gpuPasses.mark('world');
    this.gl.setRenderTarget(this.postTarget); this.gl.render(scene, camera);
    stats.drawCalls = this.gl.info.render.calls; stats.triangles = this.gl.info.render.triangles;
    gpuPasses.mark('mask');
    this.mask.render(this.gl, scene, camera);
    stats.drawCalls += this.gl.info.render.calls; stats.triangles += this.gl.info.render.triangles;
    gpuPasses.mark('atmosphere');
    if (this.atmosphere) { this.atmosphere.render(this.gl, camera); stats.drawCalls++; stats.triangles += 2; }
    this.postMaterial.uniforms.cameraWorldY.value = camera.position.y;
    const matrix = camera.matrixWorld.elements;
    this.postMaterial.uniforms.cameraUpRow.value.set(matrix[1], matrix[5], matrix[9]);
    this.postMaterial.uniforms.inverseProjectionScale.value.set(1 / camera.projectionMatrix.elements[0], 1 / camera.projectionMatrix.elements[5]);
    this.postMaterial.uniforms.cn.value = camera.near; this.postMaterial.uniforms.cf.value = camera.far;
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    gpuPasses.mark('post');
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    stats.drawCalls++; stats.triangles += 2;
    if (firstPersonScene && firstPersonCamera) {
      gpuPasses.mark('fp-scene');
      const started = timing.begin(), alpha = this.gl.getClearAlpha(); this.gl.getClearColor(this.savedClear);
      try {
        this.gl.setClearColor(0, 0); this.gl.setRenderTarget(this.fpTarget); this.gl.render(firstPersonScene, firstPersonCamera);
        stats.drawCalls += this.gl.info.render.calls; stats.triangles += this.gl.info.render.triangles;
      } finally { this.gl.setClearColor(this.savedClear, alpha); }
      this.fpMaterial.uniforms.cn.value = firstPersonCamera.near; this.fpMaterial.uniforms.cf.value = firstPersonCamera.far;
      this.fpMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
      gpuPasses.mark('fp-composite');
      this.gl.setRenderTarget(this.aaTarget); this.gl.autoClear = false;
      try { this.gl.render(this.fpScene, this.postCamera); } finally { this.gl.autoClear = true; }
      stats.drawCalls++; stats.triangles += 2;
      timing.end('first-person-draw', started);
    }
    gpuPasses.mark('aa');
    const upscale = this.upscaling;
    this.renderAA(upscale ? this.scaledTarget : null);
    stats.drawCalls += this.useSmaa ? 3 : 1; stats.triangles += this.useSmaa ? 6 : 2;
    if (upscale) {
      gpuPasses.mark('upscale');
      this.gl.setRenderTarget(null); this.gl.render(this.upscaleScene, this.postCamera);
      stats.drawCalls++; stats.triangles += 2;
    }
    gpuPasses.endFrame();
    gpuFrameTimer.end();
  }

  private renderAA(output: THREE.WebGLRenderTarget | null = null) {
    if (this.useSmaa && this.smaa) this.smaa.render(this.gl, this.postCamera, output);
    else {
      // Into the canvas the pass maps exactly the rendered region; into a target, the padded one.
      this.aaUvScale.copy(output ? this.aaPadded : this.aaValid);
      this.gl.setRenderTarget(output); this.gl.render(this.aaScene, this.postCamera);
    }
  }

  beginFirstPersonWarmup() { this.gl.setRenderTarget(this.fpTarget); }

  // Storm exposure (0..1), the decaying pulse of the latest storm bite, and how low the viewed health is (0..1).
  setScreenFeedback(storm: number, pulse: number, low = 0) {
    this.postMaterial.uniforms.uStorm.value = storm; this.postMaterial.uniforms.uPulse.value = pulse; this.postMaterial.uniforms.uLow.value = low;
  }

  async warmup(scene?: THREE.Scene, camera?: THREE.PerspectiveCamera) {
    // Decode SMAA's bundled lookup images while the loading screen is still up.
    if (this.smaa) await Promise.all(this.smaa.lookups.map(texture => (texture?.image as HTMLImageElement | undefined)?.decode()));
    for (const post of [this.postScene, this.aaScene, this.fpScene, this.upscaleScene, ...(this.smaa ? [this.smaa.scene] : []), ...(this.atmosphere ? [this.atmosphere.scene] : [])]) {
      if (this.disposed) throw new Error('Pipeline disposed during warmup');
      await this.gl.compileAsync(post, this.postCamera);
    }
    if (this.disposed) throw new Error('Pipeline disposed during warmup');
    if (scene && camera) {
      // Allocate both attachments and submit every preloaded skinned mask variant
      // while the loading overlay still covers the canvas.
      this.gl.initRenderTarget(this.postTarget);
      this.mask.render(this.gl, scene, camera);
      this.atmosphere?.render(this.gl, camera);
    }
  }

  renderPost(output: THREE.WebGLRenderTarget | null = null) {
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    // Compile and draw every SMAA material and the upscale once.
    this.renderAA(this.scaledTarget);
    this.gl.setRenderTarget(output); this.gl.render(this.upscaleScene, this.postCamera);
  }

  dispose() {
    this.disposed = true;
    this.atmosphere?.dispose(); this.smaa?.dispose();
    this.mask.dispose(); this.fpTarget.dispose(); this.fpMaterial.dispose();
    this.aaTarget.dispose(); this.scaledTarget.dispose(); this.aaMaterial.dispose(); this.upscaleMaterial.dispose();
    for (const scene of [this.fpScene, this.aaScene, this.postScene, this.upscaleScene])
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.postTarget.dispose(); this.postMaterial.dispose();
  }
}
