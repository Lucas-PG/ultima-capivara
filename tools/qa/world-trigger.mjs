// Identify the real trigger triangles already baked into the world weapon.
// The world simplifier preserves source positions, so all three vertices must
// lie on the shipped first-person trigger. No proxy surface is measured.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3, Triangle, Box3 } from 'three';
import { readFile } from 'node:fs/promises';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const data = JSON.parse(await readFile(new URL('../../src/render/world-weapon-data.json', import.meta.url), 'utf8'));
const cache = new Map();
export function worldTriggerIndices(weapon) {
  if (!cache.has(weapon)) cache.set(weapon, identify(weapon));
  return cache.get(weapon);
}
async function identify(weapon) {
  if (weapon === 'machete') return [];
  await MeshoptDecoder.ready;
  const doc = await io.read(new URL(`../../public/models/arsenal/${weapon}.glb`, import.meta.url).pathname);
  const trigger = doc.getRoot().listNodes().find(node => node.getName() === `${weapon}_trigger`);
  if (!trigger) throw new Error(`Missing source trigger ${weapon}`);
  const triangles = [], bounds = new Box3();
  trigger.traverse(node => {
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute('POSITION'), index = primitive.getIndices();
      const count = index?.getCount() ?? position.getCount();
      const at = i => new Vector3().fromArray(position.getElement(index ? index.getScalar(i) : i, [])).applyMatrix4(matrix);
      for (let i = 0; i < count; i += 3) {
        const t = new Triangle(at(i), at(i + 1), at(i + 2));
        triangles.push(t); bounds.expandByPoint(t.a); bounds.expandByPoint(t.b); bounds.expandByPoint(t.c);
      }
    }
  });
  const packed = data[weapon].nearBody ?? data[weapon].near;
  const matched = new Set(), p = new Vector3(), closest = new Vector3();
  const tolerance = .0003; bounds.expandByScalar(tolerance);
  for (let i = 0; i < packed.position.length / 3; i++) {
    p.fromArray(packed.position, i * 3).multiplyScalar(.00001);
    if (!bounds.containsPoint(p)) continue;
    for (const triangle of triangles) if (triangle.closestPointToPoint(p, closest).distanceToSquared(p) <= tolerance * tolerance) {
      matched.add(i); break;
    }
  }
  const indices = [];
  for (let i = 0; i < packed.index.length; i += 3) {
    const face = packed.index.slice(i, i + 3);
    if (face.every(vertex => matched.has(vertex))) indices.push(...face);
  }
  if (!indices.length) throw new Error(`No world trigger triangles identified for ${weapon}`);
  return indices;
}
