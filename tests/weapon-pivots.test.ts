import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { expect, it } from 'vitest';
import metrics from '../public/models/arsenal/metrics.json';

// A magazine contact point is authored in metres around the Blender pivot.
// Quantization must not turn that coordinate frame into a mesh decode matrix.
for (const id of ['m4', 'shotgun', 'sniper', 'dmr', 'coco'] as const) {
  it(`${id} preserves mechanical pivots and metre-scale hand contacts after packing`, async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.read(`public/models/arsenal/${id}.glb`);
    for (const [part, [x, y, z]] of Object.entries(metrics[id].pivots)) {
      const frame = document.getRoot().listNodes().find(node => node.getName() === `${id}_${part}`)!;
      expect(frame, `${id}/${part}`).toBeDefined();
      expect(frame.getScale()).toEqual([1, 1, 1]);
      expect(frame.getRotation()).toEqual([0, 0, 0, 1]);
      const actual = frame.getTranslation();
      for (const [axis, value] of [x, z, -y].entries()) expect(actual[axis]).toBeCloseTo(value, 6);
      let meshes = 0;
      frame.traverse(node => { if (node.getMesh()) meshes++; });
      expect(meshes).toBeGreaterThan(0);
    }
  });
}
