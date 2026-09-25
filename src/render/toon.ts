import * as THREE from 'three';

// Direction A uses the same soft three-band diffuse ramp for standard materials.
const LIT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
if (!chunk.includes('toonCoord')) {
  const start = chunk.indexOf('void RE_Direct_Physical(');
  const at = chunk.indexOf(LIT, start);
  if (start >= 0 && at >= 0) {
    THREE.ShaderChunk.lights_physical_pars_fragment = chunk.slice(0, at) + `${LIT}
	float toonCoord = dot( geometryNormal, directLight.direction ) * 0.5 + 0.5;
	dotNL = 0.42 + smoothstep( 0.40, 0.46, toonCoord ) * 0.30 + smoothstep( 0.66, 0.72, toonCoord ) * 0.28;` + chunk.slice(at + LIT.length);
  }
}

// Preserve a lavender light contribution under the sun's occlusion. This lifts
// cast shadows without adding lights or flattening the three diffuse bands.
const shadowTint = new THREE.Color('#C9B2D6'), sunTint = new THREE.Color('#FFD9A8');
shadowTint.setRGB(shadowTint.r / sunTint.r * .75, shadowTint.g / sunTint.g * .75, shadowTint.b / sunTint.b * .75);
const sunShadow = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
if (!THREE.ShaderChunk.lights_fragment_begin.includes('paintedSunShadow')) {
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(sunShadow, `
    float paintedSunShadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
    directLight.color *= mix(vec3(${shadowTint.r.toFixed(6)},${shadowTint.g.toFixed(6)},${shadowTint.b.toFixed(6)}),vec3(1.0),paintedSunShadow);`);
}

// Ink outlines from depth discontinuities, the Direction A colour curve, then the
// renderer's own tone mapping and output colour space.
export function createOutlineMaterial(color: THREE.Texture, depth: THREE.DepthTexture) {
  return new THREE.RawShaderMaterial({
    uniforms: {
      uStorm: { value: 0 }, uPulse: { value: 0 },
      tColor: { value: color }, tDepth: { value: depth }, toneMappingExposure: { value: 1.1 },
      tCharacter: { value: color }, characterEnabled: { value: 0 }, transparentBackground: { value: 0 },
      suppressWater: { value: 0 }, cameraWorldY: { value: 0 },
      cameraUpRow: { value: new THREE.Vector3() }, inverseProjectionScale: { value: new THREE.Vector2() },
      ink: { value: new THREE.Vector3(.227451, .141176, .094118) },
      texel: { value: new THREE.Vector2(1, 1) }, width: { value: 1.25 }, cn: { value: .07 }, cf: { value: 850 },
    },
    depthTest: false, depthWrite: false,
    vertexShader: 'precision highp float;attribute vec3 position;attribute vec2 uv;varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `precision highp float;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      uniform sampler2D tColor,tDepth,tCharacter;uniform vec3 ink,cameraUpRow;uniform vec2 inverseProjectionScale;uniform float characterEnabled,transparentBackground,suppressWater,cameraWorldY;uniform vec2 texel;uniform float cn,cf,width,uStorm,uPulse;varying vec2 vUv;
      float L(float d){float z=d*2.0-1.0;return 2.0*cn*cf/(cf+cn-z*(cf-cn));}
      void main(){
        vec4 src=texture2D(tColor,vUv);vec3 c=src.rgb;float d=texture2D(tDepth,vUv).x;
        bool fpEmpty=transparentBackground>.5 && d>=.999999;
        if(fpEmpty && src.a<.01)discard;
        // FP cards also extend beyond weapon depth. Recover their colour from the clear target.
        if(fpEmpty)c/=max(src.a,.01);
        float coverage=clamp(src.a-(fpEmpty?0.0:1.0),0.0,1.0);
        vec2 o=texel*width;
        float a=texture2D(tDepth,vUv+vec2(o.x,0.0)).x,b=texture2D(tDepth,vUv-vec2(o.x,0.0)).x;
        float e=texture2D(tDepth,vUv+vec2(0.0,o.y)).x,f=texture2D(tDepth,vUv-vec2(0.0,o.y)).x;
        float zl=L(min(min(d,a),min(b,min(e,f))));
        float lap=abs(a+b+e+f-4.0*d)*zl*zl*(cf-cn)/(cn*cf);
        // Far away only strong silhouettes keep their ink, so dense detail doesn't turn into noise.
        float edge=smoothstep(.035+zl*.0008,.085+zl*.0018,lap/zl)*(1.0-smoothstep(45.0,120.0,zl))*step(d,.99999);
        if(suppressWater>.5){
          float linearDepth=L(d);
          vec3 viewPosition=vec3((vUv*2.0-1.0)*linearDepth*inverseProjectionScale,-linearDepth);
          float surfaceY=cameraWorldY+dot(viewPosition,cameraUpRow);
          edge*=smoothstep(-.07,.2,surfaceY);
        }
        // VFX alpha suppresses both world ink and character ink under the painted card.
        edge*=1.0-coverage;
        gl_FragColor=vec4(c,1.0);
        gl_FragColor.rgb=NeutralToneMapping(gl_FragColor.rgb);
        gl_FragColor=sRGBTransferOETF(gl_FragColor);
        float g=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
        gl_FragColor.rgb=clamp(mix(vec3(g),gl_FragColor.rgb,1.12*mix(1.0,.75,uStorm)),0.0,1.0);
        float sv=smoothstep(.55,1.35,length((vUv-.5)*2.0))*(uStorm*.3+uPulse*.6);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.541,.302,1.0),sv);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,ink,edge*.85);
        if(characterEnabled>.5){
          vec2 co=texel*max(1.0,width*1.2);
          float center=texture2D(tCharacter,vUv).r;
          float around=min(min(texture2D(tCharacter,vUv+vec2(co.x,0.0)).r,texture2D(tCharacter,vUv-vec2(co.x,0.0)).r),
            min(texture2D(tCharacter,vUv+vec2(0.0,co.y)).r,texture2D(tCharacter,vUv-vec2(0.0,co.y)).r));
          gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.168627,.105882,.070588),clamp(center-around,0.0,1.0)*(1.0-coverage));
        }
        gl_FragColor.a=fpEmpty?clamp(src.a,0.0,1.0):1.0;
      }`,
  });
}
