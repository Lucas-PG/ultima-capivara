import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
  ['-b', '-t', process.env.BLENDER_THREADS || '4', '--python-exit-code', '1', '--python', 'tools/blender/aircraft.py'],
  { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(`${root}/output/aircraft/aircraft.raw.glb`);
await document.transform(dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }), dedup());
await mkdir(`${root}/public/models/aircraft`, { recursive: true });
const path = `${root}/public/models/aircraft/aircraft.glb`;
await io.write(path, document);
const report = JSON.parse(await readFile(`${root}/output/aircraft/blender-report.json`, 'utf8'));
const decoded = await io.read(path);
report.components = report.components.map(component => {
  const node = decoded.getRoot().listNodes().find(node => node.getName() === component.name);
  if (!node?.getMesh()) throw new Error(`Missing aircraft root ${component.name}`);
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
report.gzipBytes = gzipSync(await readFile(path), { level: 9 }).length;
report.materials = decoded.getRoot().listMaterials().length;
report.triangles = [0, 1, 2].map(lod => {
  const part = kind => report.components.find(c => c.name === `${kind}_LOD${lod}`).triangles;
  return { plane: part('plane_body') + part('plane_glass') + 2 * part('plane_propeller'), chute: part('chute_base') + part('chute_team') };
});
if (report.materials > 2 || report.bytes > 1024 * 1024 || report.gzipBytes > 450 * 1024)
  throw new Error('Aircraft material or download budget exceeded');
for (const [lod, budget] of [[0, 42000], [1, 18000], [2, 7000]])
  if (report.triangles[lod].plane > budget || report.triangles[lod].chute > [6500, 3500, 1800][lod])
    throw new Error(`Aircraft LOD${lod} triangle budget exceeded: ${JSON.stringify(report.triangles[lod])}`);
await writeFile(`${root}/public/models/aircraft/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Aircraft: ${report.bytes} bytes (${report.gzipBytes} gzip), ${report.materials} materials, ${JSON.stringify(report.triangles)}`);
