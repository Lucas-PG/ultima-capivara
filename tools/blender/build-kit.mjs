import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
  ['-b', '--python-exit-code', '1', '--python', 'tools/blender/kit/build.py'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(`${root}/output/kit/kit.raw.glb`);
await document.transform(dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }), dedup());
await mkdir(`${root}/public/models/kit`, { recursive: true });
const path = `${root}/public/models/kit/kit.glb`;
await io.write(path, document);
const report = JSON.parse(await readFile(`${root}/output/kit/blender-report.json`, 'utf8'));
report.bytes = (await stat(path)).size;
report.materials = document.getRoot().listMaterials().length;
if (report.materials !== 1 || report.bytes > 8 * 1024 * 1024) throw new Error('Island kit exceeds its material or download budget');
await writeFile(`${root}/public/models/kit/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Island kit: ${report.pieces.length} pieces, ${report.materials} material, ${report.bytes} bytes`);
