// Third-person and ground weapons from the first-person arsenal.
// Each weapon is simplified to near/far LODs and its baked texture is packed
// into one 1024 atlas, so every held or dropped gun shares a single material.
// node tools/blender/build-world-arsenal.mjs   (after build-fp.mjs)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix3, Matrix4, Vector3 } from 'three';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const IDS = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'machete'];
// Parts that only exist during first-person animations.
const SKIP = { revolver: ['mag'], shotgun: ['mag'] };
const BUDGET = { near: [2400, .012], far: [420, .06] };
const CELL = 256, ATLAS = 1024, PAD = 6;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const result = {}, report = { atlas: 'textures/world-arsenal.webp', weapons: {} };
const selected = process.argv.slice(2);
for (const id of selected) if (!IDS.includes(id)) throw new Error(`Unknown weapon: ${id}`);
if (selected.length) {
  Object.assign(result, JSON.parse(await readFile(`${root}/src/render/world-weapon-data.json`, 'utf8')));
  const previous = JSON.parse(await readFile(`${root}/public/models/arsenal/world-metrics.json`, 'utf8')).weapons;
  // Older reports only listed ids. Preserve measured entries without turning
  // that list into numbered object keys during a targeted rebuild.
  for (const id of IDS) {
    if (previous[id]) report.weapons[id] = previous[id];
    else if (result[id]) report.weapons[id] = { near: result[id].near.index.length / 3, far: result[id].far.index.length / 3 };
  }
}
const composites = [];
for (const [slot, id] of IDS.entries()) {
  if (selected.length && !selected.includes(id)) continue;
  const doc = await io.read(`${root}/output/arsenal/${id}.glb`);
  const positions = [], attributes = [], indices = [], bodyIndices = [], magIndices = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || SKIP[id]?.some(part => node.getName() === `${id}_${part}`)) continue;
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    for (const primitive of mesh.listPrimitives()) {
      const p = primitive.getAttribute('POSITION'), n = primitive.getAttribute('NORMAL'), uv = primitive.getAttribute('TEXCOORD_0');
      const offset = positions.length / 3;
      for (let i = 0; i < p.getCount(); i++) {
        positions.push(...new Vector3().fromArray(p.getElement(i, [])).applyMatrix4(matrix).toArray());
        attributes.push(...new Vector3().fromArray(n.getElement(i, [])).applyMatrix3(normalMatrix).normalize().toArray(), ...uv.getElement(i, []));
      }
      const index = primitive.getIndices();
      for (let i = 0; i < index.getCount(); i++) {
        const value = offset + index.getScalar(i); indices.push(value);
        (node.getName() === `${id}_mag` ? magIndices : bodyIndices).push(value);
      }
    }
  }
  const p = new Float32Array(positions), a = new Float32Array(attributes), original = new Uint32Array(indices);
  const col = slot % 4, row = Math.floor(slot / 4), lods = {};
  const budgets = id === 'm4' ? { ...BUDGET, nearBody: [2000, .012], nearMag: [400, .012] } : BUDGET;
  for (const [lod, [budget, error]] of Object.entries(budgets)) {
    const sourceIndices = lod === 'nearBody' ? new Uint32Array(bodyIndices) : lod === 'nearMag' ? new Uint32Array(magIndices) : original;
    // The Carabina's hanging sling is part of its silhouette, even at far LOD.
    // Its thin ribbon would otherwise be removed completely by the error limit.
    const locks = id === 'dmr' && lod === 'far' ? Uint8Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + 1] < -.135 ? 1 : 0) : null;
    const [reduced] = MeshoptSimplifier.simplifyWithAttributes(sourceIndices, p, 3, a, 5, [.1, .1, .1, .6, .6], locks,
      Math.min(budget * 3, sourceIndices.length), error, ['Permissive']);
    const used = new Map(), packed = { position: [], normal: [], uv: [], color: [], index: [] };
    for (const source of reduced) {
      if (!used.has(source)) {
        used.set(source, used.size);
        for (let axis = 0; axis < 3; axis++) {
          packed.position.push(Math.round(p[source * 3 + axis] * 100000));
          packed.normal.push(Math.round(a[source * 5 + axis] * 32767));
          packed.color.push(255);
        }
        const u = Math.min(1, Math.max(0, a[source * 5 + 3])), v = Math.min(1, Math.max(0, a[source * 5 + 4]));
        packed.uv.push(Math.round((col * CELL + PAD + u * (CELL - PAD * 2)) / ATLAS * 65535),
          Math.round((row * CELL + PAD + v * (CELL - PAD * 2)) / ATLAS * 65535));
      }
      packed.index.push(used.get(source));
    }
    lods[lod] = packed;
  }
  result[id] = lods;
  report.weapons[id] = { source: original.length / 3, near: lods.near.index.length / 3, far: lods.far.index.length / 3 };
  const cell = await sharp(`${root}/output/arsenal/${id}_albedo.png`).resize(CELL - PAD * 2, CELL - PAD * 2).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).toBuffer();
  composites.push({ input: cell, left: col * CELL, top: row * CELL });
}
const atlasPath = `${root}/public/textures/world-arsenal.webp`;
const atlas = selected.length ? sharp(await readFile(atlasPath)) : sharp({ create: { width: ATLAS, height: ATLAS, channels: 3, background: '#555555' } });
// Preserve the decoded pixels of untouched cells during a targeted rebuild.
await writeFile(atlasPath, await atlas.composite(composites).webp(selected.length ? { lossless: true } : { quality: 88 }).toBuffer());
const data = JSON.stringify(result, null, 2) + '\n';
report.bundledBytes = Buffer.byteLength(data);
await writeFile(`${root}/src/render/world-weapon-data.json`, data);
await writeFile(`${root}/public/models/arsenal/world-metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
void readFile;
