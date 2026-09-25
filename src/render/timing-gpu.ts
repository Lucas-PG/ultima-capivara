import * as THREE from 'three';
import { timing, type TimingName } from './timing';

// These wrappers only exist with ?timing=1 in a local DEV build. They time the
// CPU driver calls, not completion on the GPU. CDP supplies decode/GC task stacks.
export function instrumentGpu(gl: THREE.WebGLRenderer) {
  if (!timing.enabled) return;
  const context = gl.getContext() as WebGL2RenderingContext;
  const methods = {
    texImage2D: 'texture-upload', texSubImage2D: 'texture-upload',
    texImage3D: 'texture-upload', texSubImage3D: 'texture-upload',
    compressedTexImage2D: 'texture-upload', compressedTexSubImage2D: 'texture-upload',
    compressedTexImage3D: 'texture-upload', compressedTexSubImage3D: 'texture-upload',
    generateMipmap: 'texture-upload', compileShader: 'driver-shader-compile', linkProgram: 'driver-program-link',
  } as const satisfies Record<string, TimingName>;
  for (const [key, name] of Object.entries(methods)) {
    const method = key as keyof typeof methods;
    const original = context[method] as (...args: unknown[]) => unknown;
    // Overloaded WebGL APIs have different arities. The argument array is an
    // intentional diagnostic-only cost, included in the containing draw span.
    (context[method] as (...args: unknown[]) => unknown) = function (...args: unknown[]) {
      const started = timing.begin();
      try { return original.apply(context, args); }
      finally { timing.end(name, started, method, true); }
    };
  }
}

const observed = new WeakSet<THREE.Material>();
export function instrumentMaterials(root: THREE.Object3D) {
  if (!timing.enabled) return;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (observed.has(material)) continue;
      observed.add(material);
      const original = material.onBeforeRender;
      const label = `${material.type}:${material.id}:${material.name}`;
      let first = true;
      material.onBeforeRender = function (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
        geometry: THREE.BufferGeometry, rendered: THREE.Object3D, group: THREE.Group) {
        if (first) { first = false; timing.record('first-material-use', timing.begin(), 0, label, true); }
        original.call(this, renderer, scene, camera, geometry, rendered, group);
      };
    }
  });
}
