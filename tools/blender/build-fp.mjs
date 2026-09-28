// Builds the first-person arms and the v2 arsenal, then packs them for the game.
// node tools/blender/build-fp.mjs [arms] [weapon ids...]   (no args: everything)
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const blender = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
const args = process.argv.slice(2);
const arms = !args.length || args.includes('arms');
const weapons = args.filter(a => a !== 'arms');
const run = (script, extra = []) => {
  const result = spawnSync(blender, ['-b', '--python-exit-code', '1', '--python', script, '--', ...extra], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
async function pack(source, target) {
  const document = await io.read(source);
  await document.transform(dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }), dedup());
  await io.write(target, document);
  return (await stat(target)).size;
}
if (arms) {
  run('tools/blender/fp_arms.py');
  await mkdir(`${root}/public/models/fp`, { recursive: true });
  const bytes = await pack(`${root}/output/fp/fp-arms.raw.glb`, `${root}/public/models/fp/fp-arms.glb`);
  console.log('arms', bytes);
}
if (!args.length || weapons.length) {
  run('tools/blender/arsenal.py', weapons);
  const report = JSON.parse(await readFile(`${root}/output/arsenal/report.json`, 'utf8'));
  await mkdir(`${root}/public/models/arsenal`, { recursive: true });
  for (const id of weapons.length ? weapons : Object.keys(report)) {
    report[id].bytes = await pack(`${root}/output/arsenal/${id}.glb`, `${root}/public/models/arsenal/${id}.glb`);
    console.log(id, report[id].bytes, report[id].triangles);
  }
  const previous = await readFile(`${root}/public/models/arsenal/metrics.json`, 'utf8').then(JSON.parse).catch(() => ({}));
  await writeFile(`${root}/public/models/arsenal/metrics.json`, JSON.stringify({ ...previous, ...report }, null, 2) + '\n');
}
