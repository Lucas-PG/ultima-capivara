import * as THREE from 'three';

// Half-resolution contact shading and a soft highlight buffer share one pass.
// It reuses world depth, so the scene and all skinned meshes are drawn only once.
export class AtmospherePass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  readonly material: THREE.ShaderMaterial;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  enabled = true;
  private readonly sun = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly sunDirection = new THREE.Vector3(-70, 32, -30).normalize();

  constructor(color: THREE.Texture, depth: THREE.DepthTexture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: color }, tDepth: { value: depth },
        inverseProjection: { value: new THREE.Matrix4() }, projectionScale: { value: new THREE.Vector2() },
        texel: { value: new THREE.Vector2(1, 1) }, depthTexel: { value: new THREE.Vector2(1, 1) }, sunScreen: { value: new THREE.Vector3() } },
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tColor;
        uniform highp sampler2D tDepth;
        uniform mat4 inverseProjection;
        uniform vec2 projectionScale,texel,depthTexel; uniform vec3 sunScreen;
        vec3 viewPosition(vec2 uv){
          // Depth is nearest sampled. Reconstruct its actual pixel centre,
          // including off-grid hemisphere taps, instead of a neighbouring ray.
          vec2 pixel=(floor(uv/depthTexel)+.5)*depthTexel;
          vec4 p=inverseProjection*vec4(pixel*2.0-1.0,texture2D(tDepth,pixel).r*2.0-1.0,1.0);
          return p.xyz/p.w;
        }
        vec3 bright(vec2 uv){
          vec3 c=texture2D(tColor,uv).rgb;
          float l=max(c.r,max(c.g,c.b));
          // Tiny near-light fragments can have very large HDR values. Bound
          // their contribution before filtering to avoid bloom fireflies.
          return c/max(l,1.0)*min(max(l-1.15,0.0),.8);
        }
        void main(){
          vec3 p=viewPosition(vUv);
          vec3 l=p-viewPosition(vUv-vec2(texel.x,0.0)),r=viewPosition(vUv+vec2(texel.x,0.0))-p;
          vec3 b=p-viewPosition(vUv-vec2(0.0,texel.y)),t=viewPosition(vUv+vec2(0.0,texel.y))-p;
          vec3 n=cross(abs(l.z)<abs(r.z)?l:r,abs(b.z)<abs(t.z)?b:t);
          n/=max(length(n),.00001);
          float ao=0.0;
          float rotation=fract(dot(floor(vUv/texel),vec2(.75487766,.56984029)))*6.2831853;
          vec2 radius=projectionScale*.65/max(-p.z,.2);
          vec3 glow=bright(vUv)*.2;
          for(int i=0;i<8;i++){
            float fi=float(i),angle=fi*2.399963+rotation;
            vec2 direction=vec2(cos(angle),sin(angle));
            vec2 sampleUv=vUv+direction*radius*(.24+fi*.105);
            vec3 delta=viewPosition(clamp(sampleUv,texel,1.0-texel))-p;
            float distance=length(delta);
            // A world-space bias rejects reconstruction error and the tiny
            // blade/root contacts that otherwise stripe shallow ground planes.
            float horizon=max(0.0,(dot(n,delta)-max(.035,-p.z*.0015))/max(distance,.03)-.12);
            float within=step(0.0,sampleUv.x)*step(sampleUv.x,1.0)*step(0.0,sampleUv.y)*step(sampleUv.y,1.0);
            ao+=horizon*(1.0-smoothstep(.12,1.15,distance))*within;
            // Two footprint sizes keep tiny emissive trims and broad sunlit
            // highlights gentle instead of drawing a sharp halo.
            glow+=bright(vUv+direction*texel*(3.0+mod(fi,2.0)*5.0))*.1;
          }
          ao=clamp(ao*.7,0.0,.62)*(1.0-smoothstep(48.0,85.0,-p.z));
          if(texture2D(tDepth,vUv).r>.99999)ao=0.0;
          // Depth silhouettes interrupt a short radial integration toward the
          // sun, creating shafts only where the canopy actually opens.
          float shafts=0.0; vec2 ray=(sunScreen.xy-vUv)*.025;
          for(int i=0;i<12;i++){
            vec2 uv=vUv+ray*float(i+1);
            float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
            shafts+=step(.99995,texture2D(tDepth,uv).r)*inside*(1.0-float(i)/14.0);
          }
          shafts*=sunScreen.z*exp(-length(vUv-sunScreen.xy)*3.5)*.055;
          glow+=vec3(1.0,.66,.3)*shafts;
          gl_FragColor=vec4(glow,1.0-ao);
        }
      `,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false; this.scene.add(this.quad);
  }

  resize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
    this.material.uniforms.texel.value.set(1 / this.target.width, 1 / this.target.height);
    this.material.uniforms.depthTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(gl: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    if (!this.enabled) return;
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.projectionScale.value.set(camera.projectionMatrix.elements[0] * .5, camera.projectionMatrix.elements[5] * .5);
    this.sun.copy(camera.position).addScaledVector(this.sunDirection, 500).project(camera);
    camera.getWorldDirection(this.view);
    this.material.uniforms.sunScreen.value.set(this.sun.x * .5 + .5, this.sun.y * .5 + .5,
      Math.max(0, this.view.dot(this.sunDirection)));
    gl.setRenderTarget(this.target); gl.render(this.scene, this.camera);
  }

  dispose() { this.target.dispose(); this.material.dispose(); this.quad.geometry.dispose(); }
}
