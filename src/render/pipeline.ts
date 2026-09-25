import * as THREE from 'three';
import { createOutlineMaterial } from './toon';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Graphics presets. The outline pass is the art style, so it runs on every
// preset; what scales is resolution, MSAA inside it, and shadows.
export const PRESETS = {
  low: { dpr: .75, samples: 0, shadows: false, shadowReach: 0, interior: false },
  medium: { dpr: 1, samples: 0, shadows: true, shadowReach: 32, interior: true },
  high: { dpr: 1.25, samples: 2, shadows: true, shadowReach: 42, interior: true },
} as const;

export class RenderPipeline {
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
    this.aaMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.aaMaterial.uniforms.tDiffuse.value = this.aaTarget.texture;
    const aaQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aaMaterial);
    aaQuad.frustumCulled = false; this.aaScene.add(aaQuad);
    this.postMaterial = createOutlineMaterial(this.postTarget.texture, this.postTarget.depthTexture);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial); quad.frustumCulled = false; this.postScene.add(quad);
  }

  setSamples(samples: number) {
    if (this.postTarget.samples !== samples) { this.postTarget.samples = samples; this.postTarget.dispose(); }
  }

  resize() {
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.postTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.aaTarget.setSize(Math.max(1, size.x), Math.max(1, size.y));
    this.aaMaterial.uniforms.resolution.value.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
    this.postMaterial.uniforms.width.value = Math.max(.75, size.y / 1080 * 1.25);
    (this.postMaterial.uniforms.texel.value as THREE.Vector2).set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, stats: { drawCalls: number; triangles: number }) {
    this.gl.setRenderTarget(this.postTarget);
    this.gl.render(scene, camera);
    stats.drawCalls = this.gl.info.render.calls;
    stats.triangles = this.gl.info.render.triangles;
    this.postMaterial.uniforms.cn.value = camera.near; this.postMaterial.uniforms.cf.value = camera.far;
    this.renderPost();
    stats.drawCalls += 2; stats.triangles += 4;
  }

  async warmup() {
    await this.gl.compileAsync(this.postScene, this.postCamera);
    await this.gl.compileAsync(this.aaScene, this.postCamera);
  }

  renderPost() {
    this.postMaterial.uniforms.toneMappingExposure.value = this.gl.toneMappingExposure;
    this.gl.setRenderTarget(this.aaTarget); this.gl.render(this.postScene, this.postCamera);
    this.gl.setRenderTarget(null); this.gl.render(this.aaScene, this.postCamera);
  }

  dispose() {
    this.aaTarget.dispose(); this.aaMaterial.dispose();
    this.aaScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.postTarget.dispose(); this.postTarget.depthTexture?.dispose();
    this.postMaterial.dispose(); this.postScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  }
}
