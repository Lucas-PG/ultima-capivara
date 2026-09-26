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

  constructor(color: THREE.Texture, depth: THREE.DepthTexture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: color }, tDepth: { value: depth },
        inverseProjection: { value: new THREE.Matrix4() }, projectionScale: { value: new THREE.Vector2() },
        texel: { value: new THREE.Vector2(1, 1) } },
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tColor,tDepth;
        uniform mat4 inverseProjection;
        uniform vec2 projectionScale,texel;
        vec3 viewPosition(vec2 uv){
          vec4 p=inverseProjection*vec4(uv*2.0-1.0,texture2D(tDepth,uv).r*2.0-1.0,1.0);
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
            float horizon=max(0.0,dot(n,delta)/max(distance,.0001)-.08);
            float within=step(0.0,sampleUv.x)*step(sampleUv.x,1.0)*step(0.0,sampleUv.y)*step(sampleUv.y,1.0);
            ao+=horizon*(1.0-smoothstep(.12,1.15,distance))*within;
            // Two footprint sizes keep tiny emissive trims and broad sunlit
            // highlights gentle instead of drawing a sharp halo.
            glow+=bright(vUv+direction*texel*(3.0+mod(fi,2.0)*5.0))*.1;
          }
          ao=clamp(ao*.7,0.0,.62)*(1.0-smoothstep(48.0,85.0,-p.z));
          if(texture2D(tDepth,vUv).r>.99999)ao=0.0;
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
  }

  render(gl: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    if (!this.enabled) return;
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.projectionScale.value.set(camera.projectionMatrix.elements[0] * .5, camera.projectionMatrix.elements[5] * .5);
    gl.setRenderTarget(this.target); gl.render(this.scene, this.camera);
  }

  dispose() { this.target.dispose(); this.material.dispose(); this.quad.geometry.dispose(); }
}
