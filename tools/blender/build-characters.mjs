import { spawnSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const blender = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
const result = spawnSync(blender, ['-b', '--python', 'tools/blender/capybara.py'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(`${root}/output/characters/capybara.raw.glb`);
await document.transform(dedup(), resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizationVolume: 'scene' }), dedup(), prune());
const path = `${root}/public/models/capybara/capybara.glb`;
await io.write(path, document);
const report = JSON.parse(await readFile(`${root}/output/characters/blender-report.json`, 'utf8'));
const decoded = await io.read(path);
report.lods = decoded.getRoot().listMeshes().map(mesh => ({ name: mesh.getName(), triangles: mesh.listPrimitives().reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0) }));
report.materials = decoded.getRoot().listMaterials().length;
report.skins = decoded.getRoot().listSkins().length;
report.joints = decoded.getRoot().listSkins()[0].listJoints().length;
report.clips = decoded.getRoot().listAnimations().map(a => a.getName());
report.bytes = (await stat(path)).size;
report.rawBytes = (await stat(`${root}/output/characters/capybara.raw.glb`)).size;
report.texture = { format: 'PNG', width: 16, height: 16 };
for (let i = 0; i < 3; i++) {
  const lod = report.lods.find(lod => lod.name.includes(`LOD${i}`));
  if (!lod || lod.triangles > [15000, 5000, 1500][i]) throw new Error(`LOD${i} exceeds budget`);
}
if (report.materials > 3 || report.skins !== 1 || !['idle', 'run', 'jump'].every(clip => report.clips.includes(clip))) throw new Error('Character rig/material/animation contract failed');
await writeFile(`${root}/public/models/capybara/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Capivara: ${report.lods.map(lod => `${lod.name} ${lod.triangles} tris`).join(', ')}; ${report.bytes} bytes (${(report.bytes / report.rawBytes * 100).toFixed(1)}% of raw); ${report.joints} joints; ${report.materials} material; clips ${report.clips.join(', ')}`);
