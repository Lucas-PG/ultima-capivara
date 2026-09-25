import * as THREE from 'three';

// A cartoon pass that keeps every existing material: direct light snaps to
// the legacy MeshToonMaterial's four bands instead of a smooth
// falloff. Textures, shadows, custom onBeforeCompile hooks and graphics
// settings keep working because only the shared lighting chunk changes.
const LIT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
if (!chunk.includes('toonCoord')) {
  const start = chunk.indexOf('void RE_Direct_Physical(');
  const at = chunk.indexOf(LIT, start);
  if (start >= 0 && at >= 0) {
    THREE.ShaderChunk.lights_physical_pars_fragment = chunk.slice(0, at) + `${LIT}
	// Legacy MeshToonMaterial ramp (88/150/210/255) over dot * 0.5 + 0.5: the
	// shadow side still gets a third of the sun, which keeps the island bright.
	float toonCoord = dot( geometryNormal, directLight.direction ) * 0.5 + 0.5;
	dotNL = 0.345 + smoothstep( 0.23, 0.27, toonCoord ) * 0.243 + smoothstep( 0.48, 0.52, toonCoord ) * 0.235 + smoothstep( 0.73, 0.77, toonCoord ) * 0.177;` + chunk.slice(at + LIT.length);
  }
}

// Ink outlines from depth discontinuities, a strong saturation lift, then the
// renderer's own tone mapping and output colour space.
export function createOutlineMaterial(color: THREE.Texture, depth: THREE.DepthTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: color }, tDepth: { value: depth },
      texel: { value: new THREE.Vector2(1, 1) }, width: { value: 1.5 }, cn: { value: .07 }, cf: { value: 850 },
      // Storm screen feedback (Brasa): 0 leaves the image untouched.
      uStorm: { value: 0 }, uPulse: { value: 0 },
    },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform sampler2D tColor,tDepth;uniform vec2 texel;uniform float cn,cf,width,uStorm,uPulse;varying vec2 vUv;
      float L(float d){float z=d*2.0-1.0;return 2.0*cn*cf/(cf+cn-z*(cf-cn));}
      void main(){
        vec4 src=texture2D(tColor,vUv);vec3 c=src.rgb;float d=texture2D(tDepth,vUv).x;
        vec2 o=texel*width;
        float a=texture2D(tDepth,vUv+vec2(o.x,0.0)).x,b=texture2D(tDepth,vUv-vec2(o.x,0.0)).x;
        float e=texture2D(tDepth,vUv+vec2(0.0,o.y)).x,f=texture2D(tDepth,vUv-vec2(0.0,o.y)).x;
        float zl=L(min(min(d,a),min(b,min(e,f))));
        float lap=abs(a+b+e+f-4.0*d)*zl*zl*(cf-cn)/(cn*cf);
        // Far away only strong silhouettes keep their ink, so dense detail doesn't turn into noise.
        float edge=smoothstep(.01+zl*.0005,.04+zl*.0012,lap/zl)*(1.0-smoothstep(55.0,150.0,zl))*step(d,.99999);
        // VFX cards push alpha above 1 (Brasa): scene edges behind an effect are not inked over it.
        edge*=1.0-clamp(src.a-1.0,0.0,1.0);
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float g=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
        gl_FragColor.rgb=clamp(mix(vec3(g),gl_FragColor.rgb,1.38*mix(1.0,.55,uStorm)),0.0,1.0);
        // Out in the storm: a violet edge that leaves the central half of the screen clean for aiming,
        // plus a brief stronger edge on each storm bite.
        float sv=smoothstep(.55,1.35,length((vUv-.5)*2.0))*(uStorm*.3+uPulse*.6);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.541,.302,1.0),sv);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.09,.075,.06),edge*.95);
      }`,
  });
}
