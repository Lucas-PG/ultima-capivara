import * as THREE from 'three';

// A depth-tested ID silhouette keeps far characters inked without outlining
// hidden bodies through buildings. Layer 1 is assigned only to character skins.
export class CharacterMask {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly material = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, depthTest: false, depthWrite: false });
  private readonly clearColor = new THREE.Color();
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(depth: THREE.DepthTexture) {
    this.uniforms = { sceneDepth: { value: depth }, inverseSize: { value: new THREE.Vector2(1, 1) }, near: { value: .07 }, far: { value: 850 } };
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = `uniform sampler2D sceneDepth;uniform vec2 inverseSize;uniform float near,far;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float viewDepth=2.0*near*far/(far+near-(gl_FragCoord.z*2.0-1.0)*(far-near));
        if(viewDepth>150.0 || gl_FragCoord.z>texture2D(sceneDepth,gl_FragCoord.xy*inverseSize).r+0.0000001)discard;
        #include <opaque_fragment>`);
    };
    this.material.customProgramCacheKey = () => 'visible-character-mask-v1';
  }
  resize(width: number, height: number) {
    this.target.setSize(width, height); this.uniforms.inverseSize.value.set(1 / width, 1 / height);
  }
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const layers = camera.layers.mask, background = scene.background, override = scene.overrideMaterial;
    const shadows = gl.shadowMap.enabled, alpha = gl.getClearAlpha(); gl.getClearColor(this.clearColor);
    this.uniforms.near.value = camera.near; this.uniforms.far.value = camera.far;
    try {
      camera.layers.set(1); scene.background = null; scene.overrideMaterial = this.material;
      gl.shadowMap.enabled = false; gl.setClearColor(0, 0);
      gl.setRenderTarget(this.target); gl.render(scene, camera);
    } finally {
      camera.layers.mask = layers; scene.background = background; scene.overrideMaterial = override;
      gl.shadowMap.enabled = shadows; gl.setClearColor(this.clearColor, alpha);
    }
  }
  dispose() { this.target.dispose(); this.material.dispose(); }
}
