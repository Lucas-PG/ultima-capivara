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
const IDS = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'machete', 'slingshot'];
// Parts that only exist during first-person animations.
const SKIP = { revolver: ['mag'], shotgun: ['mag'], slingshot: ['pouch'] };
const BUDGET = { near: [2400, .012], far: [420, .06] };
const CELL = 256, ATLAS = 1024, PAD = 6;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const result = {}, report = { atlas: 'textures/world-arsenal.webp', weapons: {} };
const composites = [];
for (const [slot, id] of IDS.entries()) {
  const doc = await io.read(`${root}/output/arsenal/${id}.glb`);
  const positions = [], attributes = [], indices = [];
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
      for (let i = 0; i < index.getCount(); i++) indices.push(offset + index.getScalar(i));
    }
  }
  const p = new Float32Array(positions), a = new Float32Array(attributes), original = new Uint32Array(indices);
  const col = slot % 4, row = Math.floor(slot / 4), lods = {};
  for (const [lod, [budget, error]] of Object.entries(BUDGET)) {
    const [reduced] = MeshoptSimplifier.simplifyWithAttributes(original, p, 3, a, 5, [.1, .1, .1, .6, .6], null,
      Math.min(budget * 3, original.length), error, ['Permissive']);
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
await sharp({ create: { width: ATLAS, height: ATLAS, channels: 3, background: '#555555' } }).composite(composites).webp({ quality: 88 }).toFile(`${root}/public/textures/world-arsenal.webp`);
const data = JSON.stringify(result) + '\n';
report.bundledBytes = Buffer.byteLength(data);
await writeFile(`${root}/src/render/world-weapon-data.json`, data);
await writeFile(`${root}/public/models/arsenal/world-metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
void readFile;
