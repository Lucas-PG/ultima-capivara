import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
  ['-b', '--python-exit-code', '1', '--python', 'tools/blender/supply_drop.py'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(`${root}/output/supply-drop/supply-drop.raw.glb`);
await document.transform(dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }), dedup());
await mkdir(`${root}/public/models/supply-drop`, { recursive: true });
const path = `${root}/public/models/supply-drop/supply-drop.glb`;
await io.write(path, document);
const report = JSON.parse(await readFile(`${root}/output/supply-drop/blender-report.json`, 'utf8'));
const decoded = await io.read(path);
report.components = report.components.map(component => {
  const node = decoded.getRoot().listNodes().find(node => node.getName() === component.name);
  if (!node?.getMesh()) throw new Error(`Missing exported supply root ${component.name}`);
  const m = node.getWorldMatrix(), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const primitive of node.getMesh().listPrimitives()) {
    triangles += primitive.getIndices().getCount() / 3;
    const positions = primitive.getAttribute('POSITION');
    for (let i = 0; i < positions.getCount(); i++) {
      const p = positions.getElement(i, []);
      for (let axis = 0; axis < 3; axis++) {
        const value = m[axis] * p[0] + m[4 + axis] * p[1] + m[8 + axis] * p[2] + m[12 + axis];
        min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
      }
    }
  }
  return { name: component.name, triangles, min, max };
});
report.bytes = (await stat(path)).size;
report.materials = decoded.getRoot().listMaterials().length;
if (report.materials !== 1 || report.bytes > 1024 * 1024) throw new Error('Supply asset exceeds material/download budget');
await writeFile(`${root}/public/models/supply-drop/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Tucano: ${report.components.length} components, ${report.materials} material, ${report.bytes} bytes`);
