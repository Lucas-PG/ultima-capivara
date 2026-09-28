import { spawnSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const blender = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
const result = process.env.SKIP_BLENDER ? { status: 0 } : spawnSync(blender, ['-b', '--python-exit-code', '1', '--python', process.env.CHAR_SCRIPT || 'tools/blender/capybara_v4.py'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(`${root}/output/characters/capybara.raw.glb`);
// 1.05 seconds falls between Blender's 30 Hz samples. Normalize only the new
// bounce clip after export; do not alter any existing animation's time inputs.
const boing = document.getRoot().listAnimations().find(clip => clip.getName() === 'boing');
if (boing) {
  const duration = Math.max(...boing.listSamplers().map(sampler => sampler.getInput().getMax([])[0]));
  const inputs = new Map();
  for (const sampler of boing.listSamplers()) {
    const input = sampler.getInput();
    if (!inputs.has(input)) inputs.set(input, input.clone().setArray(Float32Array.from(input.getArray(), value => value * 1.05 / duration)));
    sampler.setInput(inputs.get(input));
  }
}
await document.transform(dedup(), resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizationVolume: 'scene' }), dedup(), prune());
const statue = await io.read(`${root}/output/characters/statue.raw.glb`);
await statue.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }));
await io.write(`${root}/public/models/capybara/statue.glb`, statue);
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
report.statueBytes = (await stat(`${root}/public/models/capybara/statue.glb`)).size;
report.rawBytes = (await stat(`${root}/output/characters/capybara.raw.glb`)).size;
report.texture = { format: "vertex colour" };
for (let i = 0; i < 3; i++) {
  const lod = report.lods.find(lod => lod.name.includes(`LOD${i}`));
  if (!lod || lod.triangles > [42000, 8200, 2400][i]) throw new Error(`LOD${i} exceeds budget`);
}
const requiredClips = ['idle', 'run', 'jump', 'walk', 'strafe_l', 'strafe_r', 'backpedal', 'crouch_idle', 'crouch_walk', 'fall', 'land', 'reload_tp', 'death',
  'face_neutral', 'face_determined', 'face_hit', 'face_stunned', 'face_victory', 'face_blink', 'wave', 'dance', 'victory', 'sit', 'chill', 'boing'];
if (report.materials > 3 || report.skins !== 1 || report.joints !== 35 || !requiredClips.every(clip => report.clips.includes(clip))) throw new Error('Character rig/material/animation contract failed');
await writeFile(`${root}/public/models/capybara/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Capivara: ${report.lods.map(lod => `${lod.name} ${lod.triangles} tris`).join(', ')}; ${report.bytes} bytes (${(report.bytes / report.rawBytes * 100).toFixed(1)}% of raw); ${report.joints} joints; ${report.materials} material; clips ${report.clips.join(', ')}`);
