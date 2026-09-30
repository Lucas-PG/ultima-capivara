import { spawnSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const blender = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';
const statueOnly = process.argv.includes('--statue-only');
const characterOnly = !statueOnly && !process.argv.includes('--statue');
const run = script => spawnSync('/bin/bash', ['-c', 'tools/blender/wait-for-blender.sh && "$1" -b -t 3 --python-exit-code 1 --python "$2"', 'character-build', blender, script], { cwd: root, stdio: 'inherit' });
for (const script of process.env.SKIP_BLENDER ? [] : [...(characterOnly ? [] : ['tools/blender/capybara_statue.py']), ...(statueOnly ? [] : [process.env.CHAR_SCRIPT || 'tools/blender/capybara_v6.py'])]) {
  const result = run(script);
  if (result.error) throw result.error;
  if (result.status !== 0) { console.error(`${script}: exit ${result.status ?? result.signal}`); process.exit(result.status || 1); }
}
// The character's maps are painted from the bake cache after Blender exits (see capybara_maps.py).
if (!statueOnly && !process.env.SKIP_PAINT) {
  const result = spawnSync(process.env.BLENDER_PYTHON || '/Applications/Blender.app/Contents/Resources/5.0/python/bin/python3.11', ['tools/blender/capybara_maps.py'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
if (!characterOnly) {
  const statue = await io.read(`${root}/output/characters/statue.raw.glb`);
  await statue.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16 }));
  await io.write(`${root}/public/models/capybara/statue.glb`, statue);
  if (statueOnly) {
    const path = `${root}/public/models/capybara/metrics.json`;
    const metrics = JSON.parse(await readFile(path, 'utf8'));
    metrics.statueBytes = (await stat(`${root}/public/models/capybara/statue.glb`)).size;
    await writeFile(path, JSON.stringify(metrics, null, 2) + '\n');
    process.exit(0);
  }
}
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
// keepSolidTextures: the exported slots hold flat placeholders until the painted maps replace them.
await document.transform(dedup(), resample(), prune({ keepSolidTextures: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizationVolume: 'scene' }), dedup(), prune({ keepSolidTextures: true }));
// The exported slots hold placeholders; the painted maps go in as WebP. Albedo and ORM hold
// up at q85; the normal map keeps q90 so the fine fur and weave relief survives.
for (const texture of document.getRoot().listTextures()) {
  const quality = texture.getName().endsWith('_normal') ? 90 : 85;
  const painted = await readFile(`${root}/output/characters/${texture.getName()}.png`);
  texture.setImage(new Uint8Array(await sharp(painted).webp({ quality, effort: 6 }).toBuffer())).setMimeType('image/webp');
}
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
report.texture = { format: 'baked albedo + tangent normal + ORM (R: team mask, G: roughness, B: metal)', count: decoded.getRoot().listTextures().length,
  sizes: Object.fromEntries(decoded.getRoot().listTextures().map(texture => [texture.getName(), texture.getSize()?.[0]])) };
for (let i = 0; i < 3; i++) {
  const lod = report.lods.find(lod => lod.name.includes(`LOD${i}`));
  if (!lod || lod.triangles > [50000, 10000, 2500][i]) throw new Error(`LOD${i} exceeds budget`);
}
const requiredClips = ['idle', 'run', 'jump', 'walk', 'strafe_l', 'strafe_r', 'backpedal', 'crouch_idle', 'crouch_walk', 'crouch_back', 'crouch_strafe_l', 'crouch_strafe_r', 'fall', 'land', 'reload_tp', 'death',
  'face_neutral', 'face_determined', 'face_hit', 'face_stunned', 'face_victory', 'face_blink', 'wave', 'dance', 'victory', 'sit', 'chill', 'boing'];
if (report.materials !== 1 || report.skins !== 1 || report.joints !== 67 || !requiredClips.every(clip => report.clips.includes(clip))) throw new Error('Character rig/material/animation contract failed');
await writeFile(`${root}/public/models/capybara/metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`Capivara: ${report.lods.map(lod => `${lod.name} ${lod.triangles} tris`).join(', ')}; ${report.bytes} bytes (${(report.bytes / report.rawBytes * 100).toFixed(1)}% of raw); ${report.joints} joints; ${report.materials} material; clips ${report.clips.join(', ')}`);
