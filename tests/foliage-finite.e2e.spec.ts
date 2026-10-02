import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Foliage rim stays finite when normalized dot products round past either unit endpoint', async ({ page }, testInfo) => {
  // Compile the shipped rim expression, replacing only its dot-product input.
  // Float32 normalization can put that input one ULP outside [-1, 1]. Keeping
  // the power and domain guard verbatim makes this fail if the guard is removed.
  const source = readFileSync('src/render/vegetation/foliage-material.ts', 'utf8');
  const line = source.match(/float rim = [^;]+;/)?.[0];
  expect(line).toBeTruthy();
  const dot = 'dot( normalize( normal ), normalize( vViewPosition ) )';
  expect(line).toContain(dot);
  const expression = line!.replace(dot, 'facing');
  // This vector also exercises the driver normalization/dot operations rather
  // than only supplying their boundary result. Some drivers round it down.
  const vector = [1 / 31, 11 / 33, 12 / 37];
  const values = [-1 - 2 ** -22, -1 - 2 ** -23, -1, -.75, -.5, -.25, 0, .25, .5, .75, 1, 1 + 2 ** -23, 1 + 2 ** -22];
  const result = await page.evaluate(({ expression, values, vector }) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating WebGL2 output is required by the game');
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`);
    const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;uniform float inputFacing;uniform vec3 inputVector;uniform bool useVector;out vec4 outputColor;
      void main(){float facing=useVector?dot(normalize(inputVector),normalize(inputVector)):inputFacing;
        ${expression}outputColor=vec4(rim,float(isnan(rim)),float(isinf(rim)),facing);}`);
    const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    const texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, texture); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 1, 1);
    const target = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float target incomplete');
    gl.useProgram(program); gl.viewport(0, 0, 1, 1);
    const uniform = gl.getUniformLocation(program, 'inputFacing'), useVector = gl.getUniformLocation(program, 'useVector'), pixel = new Float32Array(4);
    const read = () => {
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Float readback failed');
      return { facing: pixel[3], rim: pixel[0], nan: pixel[1], inf: pixel[2] };
    };
    try {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const hardware = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      const samples = values.map(facing => { gl.uniform1f(uniform, facing); return read(); });
      gl.uniform3fv(gl.getUniformLocation(program, 'inputVector'), vector); gl.uniform1i(useVector, 1);
      return { hardware, samples, normalizedVector: read() };
    } finally {
      gl.deleteFramebuffer(target); gl.deleteTexture(texture); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }, { expression, values, vector });
  await testInfo.attach('foliage-rim-samples', { body: JSON.stringify({ expression, ...result }, null, 2), contentType: 'application/json' });
  for (const sample of [...result.samples, result.normalizedVector]) {
    expect(sample.nan, `NaN at ${sample.facing}`).toBe(0);
    expect(sample.inf, `Inf at ${sample.facing}`).toBe(0);
    expect(Number.isFinite(sample.rim)).toBe(true);
    expect(sample.rim).toBeCloseTo(Math.max(0, 1 - Math.abs(sample.facing)) ** 2.8, 6);
  }
});
