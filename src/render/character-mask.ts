import * as THREE from 'three';
import { WATER_LEVEL } from '../shared/water';

// A depth-tested ID silhouette keeps far characters inked without outlining
// hidden bodies through buildings. Layer 1 is assigned only to character skins.
export class CharacterMask {
  // One channel: the composite reads only red (a quarter of the bandwidth of RGBA).
  readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, format: THREE.RedFormat });
  private readonly material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false });
  private readonly clearColor = new THREE.Color();
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(depth: THREE.DepthTexture) {
    this.uniforms = { sceneDepth: { value: depth }, inverseSize: { value: new THREE.Vector2(1, 1) }, near: { value: .07 }, far: { value: 850 }, waterLevel: { value: WATER_LEVEL } };
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `varying float vMaskWorldY;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
        #include <project_vertex>
        vMaskWorldY=(modelMatrix*vec4(transformed,1.0)).y;`);
      shader.fragmentShader = `uniform sampler2D sceneDepth;uniform vec2 inverseSize;uniform float near,far,waterLevel;varying float vMaskWorldY;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        // The multisampled world depth can resolve off the mask pixel centre.
        // Cover that subpixel slope without reaching through nearby cover.
        // Bound the extra tolerance to 5 mm in linear view depth.
        float viewDepth=2.0*near*far/(far+near-(gl_FragCoord.z*2.0-1.0)*(far-near));
        float slopeBias=min(0.75*fwidth(gl_FragCoord.z),0.005*near*far/((far-near)*viewDepth*viewDepth));
        // Transparent water does not write world depth. Suppress the submerged
        // silhouette explicitly instead of tracing an inked body through it.
        if(vMaskWorldY<waterLevel+.015 || viewDepth>150.0 || gl_FragCoord.z>texture2D(sceneDepth,gl_FragCoord.xy*inverseSize).r+0.0000001+slopeBias)discard;
        #include <opaque_fragment>`);
    };
    this.material.customProgramCacheKey = () => 'visible-character-mask-v4-water';
  }
  resize(width: number, height: number) {
    this.target.setSize(width, height); this.uniforms.inverseSize.value.set(1 / width, 1 / height);
  }
  /** Draws only the rendered region of the allocation (dynamic resolution). */
  setViewport(width: number, height: number) { this.target.viewport.set(0, 0, width, height); }
  // One mask material per kind of mesh (skinned, morphed, instanced). A single override material
  // drawn over meshes of different kinds rebuilt its program parameters at every switch between
  // them, dozens of times a frame in a crowd: the largest source of garbage in a royale landing.
  private readonly variants = new Map<string, THREE.MeshBasicMaterial>();
  private readonly swapped: THREE.Mesh[] = [];
  private readonly originals: (THREE.Material | THREE.Material[])[] = [];
  private variant(mesh: THREE.Mesh) {
    const geometry = mesh.geometry, key = `${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0}:${(mesh as THREE.InstancedMesh).isInstancedMesh ? 1 : 0}:` +
      `${geometry.morphAttributes.position?.length ?? 0}:${geometry.morphAttributes.normal?.length ?? 0}`;
    let material = this.variants.get(key);
    if (!material) {
      material = this.material.clone();
      material.onBeforeCompile = this.material.onBeforeCompile; material.customProgramCacheKey = this.material.customProgramCacheKey;
      this.variants.set(key, material);
    }
    return material;
  }
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const layers = camera.layers.mask, background = scene.background, override = scene.overrideMaterial;
    const shadows = gl.shadowMap.enabled, alpha = gl.getClearAlpha(), autoUpdate = scene.matrixWorldAutoUpdate; gl.getClearColor(this.clearColor);
    this.uniforms.near.value = camera.near; this.uniforms.far.value = camera.far;
    try {
      // The world pass just updated every matrix of this scene: a second traversal is pure CPU cost.
      scene.matrixWorldAutoUpdate = false;
      camera.layers.set(1); scene.background = null; scene.overrideMaterial = null;
      scene.traverseVisible(object => {
        if (!(object as THREE.Mesh).isMesh || !object.layers.test(camera.layers)) return;
        const mesh = object as THREE.Mesh;
        this.swapped.push(mesh); this.originals.push(mesh.material); mesh.material = this.variant(mesh);
      });
      gl.shadowMap.enabled = false; gl.setClearColor(0, 0);
      gl.setRenderTarget(this.target); gl.render(scene, camera);
    } finally {
      for (let i = 0; i < this.swapped.length; i++) this.swapped[i].material = this.originals[i];
      this.swapped.length = 0; this.originals.length = 0;
      camera.layers.mask = layers; scene.background = background; scene.overrideMaterial = override; scene.matrixWorldAutoUpdate = autoUpdate;
      gl.shadowMap.enabled = shadows; gl.setClearColor(this.clearColor, alpha);
    }
  }
  dispose() { this.target.dispose(); this.material.dispose(); for (const material of this.variants.values()) material.dispose(); }
}
