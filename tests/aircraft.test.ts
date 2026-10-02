import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT_ASSET_ENTRY, disposeAircraftAssets, makeParachute, makePlane, preloadAircraftAsset } from '../src/render/aircraft';
import { loadAircraftFixture } from './helpers/aircraft-fixture';
import metrics from '../public/models/aircraft/metrics.json';

const instances: THREE.Object3D[] = [];
afterEach(() => {
  for (const root of instances) root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  instances.length = 0; disposeAircraftAssets();
});
async function ready() {
  const plane = makePlane(); instances.push(plane);
  await preloadAircraftAsset(loadAircraftFixture, plane);
  plane.updateMatrixWorld(true);
  return plane;
}

describe('aircraft readiness and authored geometry', () => {
  it('keeps both captured propeller references and uploads a correctly scaled aircraft before play', async () => {
    const plane = makePlane(); instances.push(plane);
    const props = plane.children.filter(child => child.name === 'propeller');
    expect(props).toHaveLength(2);
    await preloadAircraftAsset(loadAircraftFixture, plane);
    expect(plane.children.filter(child => child.name === 'propeller')).toEqual(props);
    const bounds = new THREE.Box3().setFromObject(plane), span = bounds.getSize(new THREE.Vector3());
    // A regression guard against applying metre transforms into normalized
    // integer POSITION attributes, which collapses a Meshopt model to a cube.
    expect(span.x).toBeGreaterThan(24); expect(span.x).toBeLessThan(25.5);
    expect(span.z).toBeGreaterThan(17); expect(span.z).toBeLessThan(19);
    expect(bounds.max.y).toBeGreaterThan(4.8);
    for (const prop of props) expect((prop.children[0] as THREE.LOD).levels).toHaveLength(3);
  });

  it('ships all distance levels, two materials, no textures and an exact tracked download size', async () => {
    const source = await loadAircraftFixture();
    for (const kind of ['plane_body', 'plane_glass', 'plane_propeller', 'chute_base', 'chute_team'])
      for (const level of [0, 1, 2]) expect(source.scene.getObjectByName(`${kind}_LOD${level}`)).toBeInstanceOf(THREE.Mesh);
    expect((await readFile(`public/${AIRCRAFT_ASSET_ENTRY.path}`)).byteLength).toBe(AIRCRAFT_ASSET_ENTRY.bytes);
    expect(metrics.bytes).toBeLessThan(1024 * 1024);
    expect(metrics.materials).toBe(2); expect(metrics.textures).toBe(0);
    for (const [index, level] of metrics.triangles.entries()) {
      expect(level.plane).toBeLessThanOrEqual([42000, 18000, 7000][index]);
      expect(level.chute).toBeLessThanOrEqual([6500, 3500, 1800][index]);
    }
  });

  it('leaves the jump opening hollow at all distances and keeps the cabin floor solid', async () => {
    const plane = await ready();
    for (const level of [0, 1, 2]) {
      const body = plane.getObjectByName(`plane_body_LOD${level}`)!;
      const doorway = new THREE.Raycaster(new THREE.Vector3(5, .1, 3), new THREE.Vector3(-1, 0, 0), 0, 10);
      expect(doorway.intersectObject(body).length, `LOD${level} open doorway`).toBe(0);
      const floor = new THREE.Raycaster(new THREE.Vector3(0, .1, 3), new THREE.Vector3(0, -1, 0), 0, 2);
      expect(floor.intersectObject(body).length, `LOD${level} cabin floor`).toBeGreaterThan(0);
    }
  });

  it('shows inflated canopy cloth from above and below and preserves the actor foot origin', async () => {
    await ready(); const chute = makeParachute('#E87943'); instances.push(chute); chute.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(chute);
    expect(bounds.max.y).toBeGreaterThan(4.3); expect(bounds.max.y).toBeLessThan(4.7);
    expect(bounds.min.y).toBeGreaterThan(.9); expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(5.2);
    for (const level of [0, 1, 2]) for (const [y, sign] of [[6, -1], [3, 1]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(.4, y, 0), new THREE.Vector3(0, sign, 0), 0, 4);
      const hits = ['base', 'team'].flatMap(kind => ray.intersectObject(chute.getObjectByName(`chute_${kind}_LOD${level}`)!));
      expect(hits.length, `LOD${level} cloth viewed from ${y}`).toBeGreaterThan(0);
    }
  });

  it('owns per-avatar resources and leaves the other kit color intact when one chute is disposed', async () => {
    await ready(); const first = makeParachute('#E87943'), second = makeParachute('#248F85'); instances.push(first, second);
    const a = first.getObjectByName('chute_team_LOD0') as THREE.Mesh;
    const b = second.getObjectByName('chute_team_LOD0') as THREE.Mesh;
    expect(a.geometry).not.toBe(b.geometry); expect(a.material).not.toBe(b.material);
    expect((a.material as THREE.MeshStandardMaterial).color.equals(new THREE.Color('#E87943'))).toBe(true);
    expect((b.material as THREE.MeshStandardMaterial).color.equals(new THREE.Color('#248F85'))).toBe(true);
    expect((first.children[0] as THREE.LOD).levels.map(level => level.distance)).toEqual([0, 24, 60]);
  });

  it('rejects missing assets and a load that completes after disposal', async () => {
    const plane = makePlane(); instances.push(plane);
    await expect(preloadAircraftAsset(async () => ({ scene: new THREE.Group() }) as GLTF, plane)).rejects.toThrow('incompleto');
    expect(() => makeParachute('#fff')).toThrow('pronto');
    const source = await loadAircraftFixture();
    const geometry = (source.scene.getObjectByName('plane_body_LOD0') as THREE.Mesh).geometry;
    let disposals = 0; geometry.addEventListener('dispose', () => disposals++);
    let finish!: (source: GLTF) => void;
    const pending = preloadAircraftAsset(() => new Promise(resolve => { finish = resolve; }), plane);
    disposeAircraftAssets(); finish(source);
    await expect(pending).rejects.toThrow('cancelado');
    expect(disposals).toBe(1);
    expect((plane.children[0] as THREE.LOD).levels).toHaveLength(0);
  });
});
