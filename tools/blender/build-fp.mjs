// Builds the first-person arms and the v2 arsenal, then packs them for the game.
// node tools/blender/build-fp.mjs [arms] [weapon ids...]   (no args: everything)
// --pack repacks the last Blender export of the arms without running Blender.
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
const repackOnly = args.includes('--pack');
const arms = !args.length || args.includes('arms');
const weapons = args.filter(a => a !== 'arms' && a !== '--pack');
const run = (script, extra = []) => {
  const result = spawnSync(blender, ['-b', '--python-exit-code', '1', '--python', script, '--', ...extra], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
async function pack(source, target, extra = []) {
  const document = await io.read(source);
  // UVs and tangents stay even when no texture ships in the file (shared surfaces).
  await document.transform(...extra, dedup(), prune({ keepLeaves: true, keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }), dedup());
  await io.write(target, document);
  return (await stat(target)).size;
}
if (arms) {
  if (!repackOnly) run('tools/blender/fp_arms.py');
  await mkdir(`${root}/public/models/fp`, { recursive: true });
  // The arms carry their own baked maps (sculpted paw, fur, pads, claws, linen).
  const bytes = await pack(`${root}/output/fp/fp-arms.raw.glb`, `${root}/public/models/fp/fp-arms.glb`);
  const report = JSON.parse(await readFile(`${root}/output/fp/fp-arms-report.json`, 'utf8'));
  await writeFile(`${root}/public/models/fp/metrics.json`, JSON.stringify({ ...report, bytes }, null, 2) + '\n');
  console.log('arms', bytes);
}
if (!repackOnly && (!args.length || weapons.length)) {
  run('tools/blender/arsenal.py', weapons);
  // A targeted build must retain metadata for the untouched shipped weapons.
  const report = { ...JSON.parse(await readFile(`${root}/public/models/arsenal/metrics.json`, 'utf8')),
    ...JSON.parse(await readFile(`${root}/output/arsenal/report.json`, 'utf8')) };
  await mkdir(`${root}/public/models/arsenal`, { recursive: true });
  for (const id of weapons.length ? weapons : Object.keys(report)) {
    report[id].bytes = await pack(`${root}/output/arsenal/${id}.glb`, `${root}/public/models/arsenal/${id}.glb`);
    console.log(id, report[id].bytes, report[id].triangles);
  }
  for (const id of Object.keys(report)) report[id].bytes = (await stat(`${root}/public/models/arsenal/${id}.glb`)).size;
  await writeFile(`${root}/public/models/arsenal/metrics.json`, JSON.stringify(report, null, 2) + '\n');
}
