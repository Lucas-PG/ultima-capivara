import * as THREE from 'three';

// Storybook surfaces retain continuous diffuse shading with a soft wrapped key.
const LIT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
if (!chunk.includes('paintedWrap')) {
  const start = chunk.indexOf('void RE_Direct_Physical(');
  const at = chunk.indexOf(LIT, start);
  if (start >= 0 && at >= 0) {
    THREE.ShaderChunk.lights_physical_pars_fragment = chunk.slice(0, at) + `${LIT}
	float paintedWrap = (dot(geometryNormal, directLight.direction) + 0.28) / 1.28;
	vec3 paintedDiffuseIrradiance = max(0.0, paintedWrap) * directLight.color;` + chunk.slice(at + LIT.length);
    // GGX must retain physical N.L. Wrapping its irradiance lights back-facing
    // grazing normals where the visibility denominator tends to zero.
    THREE.ShaderChunk.lights_physical_pars_fragment = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert',
      'reflectedLight.directDiffuse += paintedDiffuseIrradiance * BRDF_Lambert');
  }
}

// Preserve a lavender light contribution under the sun's occlusion. This lifts
// cast shadows without adding another light.
const shadowTint = new THREE.Color('#7397B1'), sunTint = new THREE.Color('#FFC47E');
shadowTint.setRGB(shadowTint.r / sunTint.r * .23, shadowTint.g / sunTint.g * .23, shadowTint.b / sunTint.b * .23);
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
      tAtmosphere: { value: color }, atmosphereEnabled: { value: 0 }, bloomStrength: { value: .12 },
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
      uniform sampler2D tColor,tDepth,tCharacter,tAtmosphere;uniform vec3 ink,cameraUpRow;uniform vec2 inverseProjectionScale;uniform float characterEnabled,transparentBackground,suppressWater,cameraWorldY,atmosphereEnabled,bloomStrength;uniform vec2 texel;uniform float cn,cf,width,uStorm,uPulse;varying vec2 vUv;
      float L(float d){float z=d*2.0-1.0;return 2.0*cn*cf/(cf+cn-z*(cf-cn));}
      void main(){
        vec4 src=texture2D(tColor,vUv);vec3 c=src.rgb;float d=texture2D(tDepth,vUv).x;
        bool fpEmpty=transparentBackground>.5 && d>=.999999;
        if(fpEmpty && src.a<.01)discard;
        // FP cards also extend beyond weapon depth. Recover their colour from the clear target.
        if(fpEmpty)c/=max(src.a,.01);
        float coverage=clamp(src.a-(fpEmpty?0.0:1.0),0.0,1.0);
        if(atmosphereEnabled>.5){
          float centerDepth=L(d),weight=0.0,occlusion=0.0;vec3 bloom=vec3(0.0);
          for(int i=0;i<4;i++){
            vec2 tap=vUv+vec2(mod(float(i),2.0)*2.0-1.0,floor(float(i)/2.0)*2.0-1.0)*texel*1.5;
            vec4 effect=texture2D(tAtmosphere,tap);
            float w=exp(-abs(L(texture2D(tDepth,tap).r)-centerDepth)*6.0);
            occlusion+=effect.a*w;weight+=w;bloom+=effect.rgb*.25;
          }
          float contact=weight>.001?occlusion/weight:1.0;
          c*=mix(vec3(.35,.33,.40),vec3(1.0),contact);
          c+=bloom*bloomStrength;
        }
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
        gl_FragColor.rgb=clamp(mix(vec3(g),gl_FragColor.rgb,1.03*mix(1.0,.8,uStorm)),0.0,1.0);
        float sv=smoothstep(.55,1.35,length((vUv-.5)*2.0))*(uStorm*.3+uPulse*.6);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.541,.302,1.0),sv);

        if(characterEnabled>.5){
          vec2 co=texel*.85;
          float center=texture2D(tCharacter,vUv).r;
          float around=min(min(texture2D(tCharacter,vUv+vec2(co.x,0.0)).r,texture2D(tCharacter,vUv-vec2(co.x,0.0)).r),
            min(texture2D(tCharacter,vUv+vec2(0.0,co.y)).r,texture2D(tCharacter,vUv-vec2(0.0,co.y)).r));
          gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.168627,.105882,.070588),clamp(center-around,0.0,1.0)*(1.0-coverage)*.45);
        }
        gl_FragColor.a=fpEmpty?clamp(src.a,0.0,1.0):1.0;
      }`,
  });
}
