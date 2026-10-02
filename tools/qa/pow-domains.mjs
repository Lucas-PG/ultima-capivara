// Targeted GPU audit of the remaining view-angle powers in the water shader.
// Uses the production expressions verbatim with a one-ULP cosine overshoot.
import { readFileSync, writeFileSync } from 'node:fs';
import { launchRenderBrowser, browserName, angle, vulkanNative } from './render-browser.mjs';
const out = process.argv[2];
if (!out) throw new Error('An output JSON path is required');
const water = readFileSync('src/render/water.ts', 'utf8');
const cases = [
  { name: 'water-fresnel', expression: water.match(/float fresnel=[^;]+;/)[0], result: 'fresnel', setup: 'float facing=inputFacing,flowing=0.0;' },
  { name: 'water-reflection', expression: water.match(/vec3 reflection=[^;]+;/)[0], result: 'reflection.r', setup: 'vec3 sky=vec3(.2),horizonColor=vec3(.8),viewDirection=vec3(0.0,inputFacing,0.0);' },
];
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(cases => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating WebGL2 output unavailable');
    const compile = (type, source) => {
      const shader=gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
    const texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1,1);
    const target=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,target); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Float target incomplete');
    gl.viewport(0,0,1,1); const rows=[], pixel=new Float32Array(4);
    const debug=gl.getExtension('WEBGL_debug_renderer_info'), hardware=String(gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER));
    try {
      for (const c of cases) {
        const fragment=compile(gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float;uniform float inputFacing;out vec4 outputColor;void main(){${c.setup}${c.expression}float value=${c.result};outputColor=vec4(value,float(isnan(value)),float(isinf(value)),inputFacing);}`);
        const program=gl.createProgram(); gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
        if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        for (const facing of [0,.5,1,1+2**-23,1+2**-22]) {
          gl.uniform1f(gl.getUniformLocation(program,'inputFacing'),facing); gl.drawArrays(gl.TRIANGLES,0,3); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);
          rows.push({name:c.name,expression:c.expression,facing,value:pixel[0],nan:pixel[1],inf:pixel[2],error:gl.getError()});
        }
        gl.deleteProgram(program); gl.deleteShader(fragment);
      }
      return {hardware,rows};
    } finally {gl.deleteFramebuffer(target);gl.deleteTexture(texture);gl.deleteShader(vertex);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }, cases);
  writeFileSync(out,JSON.stringify({measuredAt:new Date().toISOString(),browser:browserName,angle,vulkanNative,...result},null,2));
  const failures=result.rows.filter(row=>row.nan||row.inf||row.error);
  console.log(JSON.stringify({hardware:result.hardware,cases:result.rows.length,failures:failures.length,out}));
  if (failures.length) process.exitCode=1;
} finally {await browser.close();}
