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
// Reload props omitted from the combined static LODs.
const SKIP = { revolver: ['mag', 'case0', 'case1', 'case2', 'case3', 'case4', 'case5', 'live0', 'live1', 'live2', 'live3', 'live4', 'live5'], shotgun: ['mag'] };
const BUDGET = { near: [2400, .012], far: [420, .06] };
// Nearby short weapons retain the same reload parts and pivots as first person.
// The ordinary near/far meshes remain combined for ground items and distance.
const SHORT_PARTS = {
  pistol: { body: 1700, slide: 400, mag: 220, release: 24 },
  smg: { body: 1900, mag: 360, charge: 80, action: 30 },
  revolver: { body: 1400, cylinder: 500, crane: 50, action: 60, rounds: 180, mag: 130,
    case0: 12, case1: 12, case2: 12, case3: 12, case4: 12, case5: 12,
    live0: 8, live1: 8, live2: 8, live3: 8, live4: 8, live5: 8 },
};
const CELL = 256, ATLAS = 1024, PAD = 6;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const result = {}, report = { atlas: 'textures/world-arsenal.webp', weapons: {} };
const selected = process.argv.slice(2);
for (const id of selected) if (!IDS.includes(id)) throw new Error(`Unknown weapon: ${id}`);
if (selected.length) {
  Object.assign(result, JSON.parse(await readFile(`${root}/src/render/world-weapon-data.json`, 'utf8')));
  const previous = JSON.parse(await readFile(`${root}/public/models/arsenal/world-metrics.json`, 'utf8')).weapons;
  for (const [id, geometry] of Object.entries(result)) {
    const counts = { near: geometry.near.index.length / 3, far: geometry.far.index.length / 3 };
    report.weapons[id] = !Array.isArray(previous) && previous[id] ? { ...previous[id], ...counts } : counts;
  }
}
const composites = [];
for (const [slot, id] of IDS.entries()) {
  if (selected.length && !selected.includes(id)) continue;
  const doc = await io.read(`${root}/output/arsenal/${id}.glb`);
  const positions = [], attributes = [], indices = [], bodyIndices = [], magIndices = [], shortBody = [];
  const short = SHORT_PARTS[id], partIndices = {}, pivots = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const name = node.getName().slice(id.length + 1), hidden = SKIP[id]?.includes(name);
    const separate = short && name !== 'body' && short[name] !== undefined;
    if (!mesh || (hidden && !separate)) continue;
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    if (separate) {
      partIndices[name] ??= [];
      pivots[name] = new Vector3().setFromMatrixPosition(matrix).toArray().map(n => Math.round(n * 100000) / 100000);
    }
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
        const value = offset + index.getScalar(i);
        if (!hidden) {
          indices.push(value);
          (node.getName() === `${id}_mag` ? magIndices : bodyIndices).push(value);
          if (!separate) shortBody.push(value);
        }
        if (separate) partIndices[name].push(value);
      }
    }
  }
  const p = new Float32Array(positions), a = new Float32Array(attributes), original = new Uint32Array(indices);
  const col = slot % 4, row = Math.floor(slot / 4), lods = {};
  const budgets = id === 'm4' ? { ...BUDGET, nearBody: [2000, .012], nearMag: [400, .012] } : { ...BUDGET };
  if (short) {
    budgets.nearBody = [short.body, .016];
    for (const name of Object.keys(partIndices)) budgets[`part_${name}`] = [short[name], .016];
  }
  for (const [lod, [budget, error]] of Object.entries(budgets)) {
    const sourceIndices = lod.startsWith('part_') ? new Uint32Array(partIndices[lod.slice(5)]) :
      lod === 'nearBody' ? new Uint32Array(short ? shortBody : bodyIndices) : lod === 'nearMag' ? new Uint32Array(magIndices) : original;
    const [reduced] = MeshoptSimplifier.simplifyWithAttributes(sourceIndices, p, 3, a, 5, [.1, .1, .1, .6, .6], null,
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
  if (short) {
    lods.parts = {};
    for (const name of Object.keys(partIndices)) {
      lods.parts[name] = { pivot: pivots[name], geometry: lods[`part_${name}`] };
      delete lods[`part_${name}`];
    }
  }
  result[id] = lods;
  report.weapons[id] = { source: original.length / 3, near: lods.near.index.length / 3, far: lods.far.index.length / 3 };
  if (short) report.weapons[id].animatedNear = lods.nearBody.index.length / 3 + Object.values(lods.parts).reduce((n, p) => n + p.geometry.index.length / 3, 0);
  const cell = await sharp(`${root}/output/arsenal/${id}_albedo.png`).resize(CELL - PAD * 2, CELL - PAD * 2).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).toBuffer();
  composites.push({ input: cell, left: col * CELL, top: row * CELL });
}
const atlasPath = `${root}/public/textures/world-arsenal.webp`;
const atlas = selected.length ? sharp(await readFile(atlasPath)) : sharp({ create: { width: ATLAS, height: ATLAS, channels: 3, background: '#555555' } });
// Preserve the decoded pixels of untouched cells during a targeted rebuild.
await writeFile(atlasPath, await atlas.composite(composites).webp(selected.length ? { lossless: true } : { quality: 88 }).toBuffer());
const data = JSON.stringify(result, null, 2) + '\n';
report.bundledBytes = Buffer.byteLength(JSON.stringify(result) + '\n');
await writeFile(`${root}/src/render/world-weapon-data.json`, data);
await writeFile(`${root}/public/models/arsenal/world-metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
void readFile;
