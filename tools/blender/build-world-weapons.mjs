// Derive world silhouettes from the shipped first-person art, without its paws.
// Quantized inline buffers preserve synchronous instanced-loot and avatar caches.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix3, Matrix4, Vector3 } from 'three';

const root = fileURLToPath(new URL('../../', import.meta.url));
const input = `${root}/public/models/weapons/painted-weapons.glb`;
const source = await readFile(input);
const asset = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(input);
await MeshoptSimplifier.ready;
const specs = {
  pistol: [.70, 1400, 280], smg: [.88, 1700, 320], m4: [.84, 2200, 380],
  shotgun: [.84, 1900, 350], dmr: [.84, 1900, 360], sniper: [.84, 2000, 380],
  machete: [.90, 650, 180], slingshot: [.80, 850, 240],
};
const result = {};
const report = { source: 'painted-weapons.glb', sourceSha256: createHash('sha256').update(source).digest('hex'),
  forward: '-Z', material: 'shared painted atlas with authored contact shading', weapons: {} };

for (const [id, [scale, nearBudget, farBudget]] of Object.entries(specs)) {
  const positions = [], attributes = [], indices = [];
  const orientation = new Matrix4().makeRotationX(id === 'machete' ? -Math.PI / 2 : 0);
  orientation.scale(new Vector3(scale, scale, scale));
  for (const part of ['body', 'magazine', 'action']) {
    const partRoot = asset.getRoot().listNodes().find(node => node.getName() === `${id}_${part}`);
    const visit = node => {
      const matrix = orientation.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const p = primitive.getAttribute('POSITION'), n = primitive.getAttribute('NORMAL');
        const uv = primitive.getAttribute('TEXCOORD_0'), color = primitive.getAttribute('COLOR_0');
        const offset = positions.length / 3;
        for (let i = 0; i < p.getCount(); i++) {
          positions.push(...new Vector3().fromArray(p.getElement(i, [])).applyMatrix4(matrix).toArray());
          attributes.push(...new Vector3().fromArray(n.getElement(i, [])).applyMatrix3(normalMatrix).normalize().toArray(),
            ...uv.getElement(i, []), ...color.getElement(i, []).slice(0, 3));
        }
        for (let i = 0; i < primitive.getIndices().getCount(); i += 3) {
          const face = [0, 1, 2].map(j => primitive.getIndices().getScalar(i + j));
          // Rarity is already communicated by the world glow. FP-only labels
          // can float beside the slim slingshot when its covering paw is absent.
          if (face.every(j => Math.floor(uv.getElement(j, [])[0] * 32) === 9)) continue;
          indices.push(...face.map(j => offset + j));
        }
      }
      node.listChildren().forEach(visit);
    };
    if (partRoot) visit(partRoot);
  }
  const p = new Float32Array(positions), a = new Float32Array(attributes), original = new Uint32Array(indices);
  const lods = {};
  for (const [lod, budget, error] of [['near', nearBudget, .025], ['far', farBudget, .1]]) {
    // Permissive collapses seam duplicates but weights UVs and normals, keeping
    // paint zones and broad bevels while removing subpixel screws at distance.
    const [reduced, deviation] = MeshoptSimplifier.simplifyWithAttributes(original, p, 3, a, 8,
      [.12, .12, .12, .35, .04, .08, .08, .08], null, Math.min(budget * 3, original.length), error, ['Permissive', 'Prune']);
    const compact = new Map(), packed = { position: [], normal: [], uv: [], color: [], index: [] };
    for (let face = 0; face < reduced.length; face += 3) {
      const corners = [reduced[face], reduced[face + 1], reduced[face + 2]];
      const columns = corners.map(i => Math.min(31, Math.floor(a[i * 8 + 3] * 32)));
      const column = columns[1] === columns[2] ? columns[1] : columns[0];
      for (const sourceIndex of corners) {
      const key = `${sourceIndex}:${column}`;
      if (!compact.has(key)) {
        compact.set(key, compact.size);
        for (let axis = 0; axis < 3; axis++) {
          packed.position.push(Math.round(p[sourceIndex * 3 + axis] * 100000));
          packed.normal.push(Math.round(a[sourceIndex * 8 + axis] * 32767));
          packed.color.push(Math.round(Math.max(0, Math.min(1, a[sourceIndex * 8 + 5 + axis])) * 255));
        }
        const sourceColumn = Math.floor(a[sourceIndex * 8 + 3] * 32);
        const u = sourceColumn === column ? a[sourceIndex * 8 + 3] * 32 - column : .5;
        const v = Math.max(0, Math.min(1, a[sourceIndex * 8 + 4]));
        // Wide padded cells avoid distant mip bleeding between narrow FP strips.
        packed.uv.push(Math.round(((column % 8 * 64 + 4 + u * 56) / 512) * 65535),
          Math.round(((Math.floor(column / 8) * 128 + 4 + v * 120) / 512) * 65535));
      }
      packed.index.push(compact.get(key));
      }
    }
    if (reduced.length / 3 > budget) throw new Error(`${id} ${lod} exceeds ${budget}: ${reduced.length / 3}`);
    lods[lod] = packed;
    console.log(`${id} ${lod}: ${reduced.length / 3} triangles, error ${deviation}`);
  }
  result[id] = lods;
  report.weapons[id] = { sourceTriangles: original.length / 3, scale, near: lods.near.index.length / 3, far: lods.far.index.length / 3 };
}
const data = JSON.stringify(result) + '\n';
report.bundledBytes = Buffer.byteLength(data);
await writeFile(`${root}/src/render/world-weapon-data.json`, data);
await writeFile(`${root}/public/models/weapons/world-metrics.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
