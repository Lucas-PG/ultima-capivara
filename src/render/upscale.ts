import * as THREE from 'three';

// Upscale from the render resolution to the screen in one pass: Catmull-Rom (five bilinear taps),
// a sharpen against the 2x2 neighbourhood mean, and a clamp to that neighbourhood's range so neither
// the bicubic lobes nor the sharpen can ring around the ink lines (the deringing FSR 1 also does).
export function createUpscaleMaterial(source: THREE.Texture) {
  // ShaderMaterial (not raw) compiles as GLSL ES 3.0 on WebGL2, which texelFetch needs.
  return new THREE.ShaderMaterial({
    uniforms: {
      tSource: { value: source },
      // Allocated texture size and the valid (rendered) region inside it, in texels.
      sourceSize: { value: new THREE.Vector2(1, 1) }, validSize: { value: new THREE.Vector2(1, 1) },
      sharpness: { value: .25 },
    },
    depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `
      uniform sampler2D tSource;uniform vec2 sourceSize,validSize;uniform float sharpness;varying vec2 vUv;
      vec3 tap(vec2 texel){return texture2D(tSource,clamp(texel,vec2(.5),validSize-.5)/sourceSize).rgb;}
      void main(){
        vec2 position=vUv*validSize;
        vec2 base=floor(position-.5)+.5,f=position-base;
        vec2 w0=f*(-.5+f*(1.0-.5*f)),w1=1.0+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.0-1.5*f)),w3=f*f*(-.5+.5*f);
        vec2 w12=w1+w2,middle=base+w2/w12;
        float c0=w12.x*w0.y,c1=w0.x*w12.y,c2=w12.x*w12.y,c3=w3.x*w12.y,c4=w12.x*w3.y;
        vec3 color=(tap(vec2(middle.x,base.y-1.0))*c0+tap(vec2(base.x-1.0,middle.y))*c1+tap(middle)*c2+
          tap(vec2(base.x+2.0,middle.y))*c3+tap(vec2(middle.x,base.y+2.0))*c4)/(c0+c1+c2+c3+c4);
        ivec2 at=ivec2(clamp(base-.5,vec2(0.0),validSize-2.0));
        vec3 a=texelFetch(tSource,at,0).rgb,b=texelFetch(tSource,at+ivec2(1,0),0).rgb;
        vec3 c=texelFetch(tSource,at+ivec2(0,1),0).rgb,d=texelFetch(tSource,at+ivec2(1,1),0).rgb;
        vec3 low=min(min(a,b),min(c,d)),high=max(max(a,b),max(c,d));
        color+=(color-(a+b+c+d)*.25)*sharpness;
        gl_FragColor=vec4(clamp(color,low,high),1.0);
      }`,
  });
}
