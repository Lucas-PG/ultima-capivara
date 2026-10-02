// QA-only readbacks of original floating-point render outputs.
export async function installFiniteDiagnostics(page, url) {
  await page.evaluate(async url => {
    const module = await import(url), Renderer = Object.values(module).find(value => typeof value === 'function' &&
      Object.hasOwn(value.prototype ?? {}, 'setSettings') && Object.hasOwn(value.prototype ?? {}, 'update'));
    if (!Renderer) throw new Error('GameRenderer export missing');
    const update = Renderer.prototype.update;
    Renderer.prototype.update = function (frame, draw) {
      window.__finiteRenderer = this; window.__finiteFrame = frame;
      return update.call(this, frame, draw);
    };
    window.__finiteHardware = () => {
      const context = window.__finiteRenderer.gl.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
      return { renderer: String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
        version: String(context.getParameter(context.VERSION)), shadingLanguage: String(context.getParameter(context.SHADING_LANGUAGE_VERSION)),
        attributes: context.getContextAttributes(), floatColor: !!context.getExtension('EXT_color_buffer_float'),
        halfFloatLinear: !!context.getExtension('OES_texture_half_float_linear'), floatLinear: !!context.getExtension('OES_texture_float_linear'),
        timerQuery: !!context.getExtension('EXT_disjoint_timer_query_webgl2'),
        fragmentHighFloat: (() => { const p = context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT); return p && { rangeMin: p.rangeMin, rangeMax: p.rangeMax, precision: p.precision }; })() };
    };
    window.__finiteRead = () => {
      const renderer = window.__finiteRenderer, pipeline = renderer.pipeline, context = renderer.gl.getContext();
      const targets = { world: pipeline.postTarget, atmosphere: pipeline.atmosphere?.target, firstPerson: pipeline.fpTarget,
        composite: pipeline.aaTarget, smaaEdges: pipeline.smaa?.edges, smaaWeights: pipeline.smaa?.weights, scaled: pipeline.scaledTarget };
      const readings = {}, previous = context.getParameter(context.FRAMEBUFFER_BINDING), alignment = context.getParameter(context.PACK_ALIGNMENT);
      try {
        context.pixelStorei(context.PACK_ALIGNMENT, 1);
        for (const [name, target] of Object.entries(targets)) {
          if (!target) continue;
          const framebuffer = renderer.gl.properties.get(target).__webglFramebuffer;
          if (!framebuffer) { readings[name] = { skipped: 'not allocated' }; continue; }
          context.bindFramebuffer(context.FRAMEBUFFER, framebuffer);
          const format = context.getParameter(context.IMPLEMENTATION_COLOR_READ_FORMAT), type = context.getParameter(context.IMPLEMENTATION_COLOR_READ_TYPE);
          const components = format === context.RGBA ? 4 : format === context.RGB ? 3 : format === context.RG ? 2 : 1;
          const width = Math.min(target.width, target.viewport.z), height = Math.min(target.height, target.viewport.w);
          const Constructor = type === context.FLOAT ? Float32Array : type === context.HALF_FLOAT || type === context.UNSIGNED_SHORT ? Uint16Array : Uint8Array;
          const pixels = new Constructor(width * height * components);
          context.readPixels(0, 0, width, height, format, type, pixels);
          let nonFinitePixels = 0, nanComponents = 0, infComponents = 0; const first = [];
          const floating = type === context.FLOAT || type === context.HALF_FLOAT;
          if (floating) for (let pixel = 0; pixel < width * height; pixel++) {
            let invalid = false;
            for (let c = 0; c < components; c++) {
              const value = pixels[pixel * components + c];
              if (type === context.HALF_FLOAT ? (value & 0x7c00) === 0x7c00 : !Number.isFinite(value)) {
                invalid = true;
                if (type === context.HALF_FLOAT ? (value & 0x3ff) !== 0 : Number.isNaN(value)) nanComponents++; else infComponents++;
              }
            }
            if (invalid) { nonFinitePixels++; if (first.length < 12) first.push([pixel % width, Math.floor(pixel / width)]); }
          }
          readings[name] = { width, height, format, type, error: context.getError(), floating, nonFinitePixels: floating ? nonFinitePixels : null,
            nanComponents: floating ? nanComponents : null, infComponents: floating ? infComponents : null, first };
        }
      } finally { context.pixelStorei(context.PACK_ALIGNMENT, alignment); context.bindFramebuffer(context.FRAMEBUFFER, previous); }
      return { size: { ...pipeline.size }, readings };
    };
    // Optional negative control: one deliberately invalid source texel must be
    // detected, then an ordinary redraw restores the original scene output.
    window.__finiteNegativeControl = () => {
      const renderer = window.__finiteRenderer, context = renderer.gl.getContext(), target = renderer.pipeline.postTarget;
      const previous = context.getParameter(context.FRAMEBUFFER_BINDING), scissor = context.getParameter(context.SCISSOR_BOX), enabled = context.isEnabled(context.SCISSOR_TEST);
      try {
        context.bindFramebuffer(context.FRAMEBUFFER, renderer.gl.properties.get(target).__webglFramebuffer);
        context.enable(context.SCISSOR_TEST); context.scissor(0, 0, 1, 1);
        context.clearBufferfv(context.COLOR, 0, new Float32Array([NaN, Infinity, 0, 1]));
      } finally {
        context.scissor(...scissor); if (!enabled) context.disable(context.SCISSOR_TEST);
        context.bindFramebuffer(context.FRAMEBUFFER, previous);
      }
      const injected = window.__finiteRead().readings.world;
      renderer.update({ ...window.__finiteFrame, dt: 0 });
      const restored = window.__finiteRead().readings.world;
      if (!injected.nonFinitePixels || restored.nonFinitePixels) throw new Error('Finite-output negative control failed');
      return { injected, restored };
    };
  }, url);
}
