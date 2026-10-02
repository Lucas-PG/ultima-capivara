import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { fitRockCollision } from './fit-rock-collision.mjs';

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
await fitRockCollision(root);
const report = JSON.parse(await readFile(`${root}/output/kit/blender-report.json`, 'utf8'));
report.bytes = (await stat(path)).size;
// Pages serves the GLB compressed; meshopt buffers are built to shrink again under gzip.
report.gzipBytes = gzipSync(await readFile(path), { level: 9 }).length;
report.materials = document.getRoot().listMaterials().length;
if (report.materials !== 1 || report.bytes > 14 * 1024 * 1024 || report.gzipBytes > 4 * 1024 * 1024)
  throw new Error('Island kit exceeds its material or download budget');
await writeFile(`${root}/public/models/kit/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Island kit: ${report.pieces.length} pieces, ${report.materials} material, ${report.bytes} bytes (${report.gzipBytes} gzip)`);
