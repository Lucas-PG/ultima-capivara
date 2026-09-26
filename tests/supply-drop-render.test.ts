import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { SupplyDropView, SUPPLY_ASSET_PATH } from '../src/render/supply-drops';
import { supplyDropPosition } from '../src/shared/supply-drops';
import type { SupplyDropState, WorldSnapshot } from '../src/shared/types';

function fixture() {
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry(), map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map });
  for (const name of ['drop_carrier', 'drop_crate', 'drop_chute']) for (let lod = 0; lod < 3; lod++) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `${name}_LOD${lod}`; scene.add(mesh);
  }
  const asset = { scene } as unknown as GLTF;
  const loader = { gltf: vi.fn(async () => asset) }, view = new SupplyDropView(loader);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 3, 20);
  const drop: SupplyDropState = { id: 'tucano-1', pos: { x: 2, y: 1, z: 3 }, district: 'vila', heading: Math.PI / 2,
    announcedAt: 10, releaseAt: 15, landsAt: 27, opened: false };
  const snapshot = { phase: 'playing' as const, config: { mode: 'battle-royale' } as WorldSnapshot['config'], supplyDrops: [drop] };
  const settings = { graphics: 'medium' as const, reducedMotion: false };
  return { view, loader, scene, geometry, material, map, camera, drop, snapshot, settings };
}

it('loads one authored set and reconstructs the same descent directly after reconnect', async () => {
  const h = fixture(), restored = fixture(); await Promise.all([h.view.ready, restored.view.ready]);
  expect(h.loader.gltf).toHaveBeenCalledExactlyOnceWith(SUPPLY_ASSET_PATH);
  const before = structuredClone(h.snapshot), crate = h.view.group.getObjectByName('Caixa de entrega')!;
  h.view.update(h.snapshot, 14, h.camera, h.settings);
  expect(crate.position.x).toBeLessThan(h.drop.pos.x); expect(crate.position.y).toBe(33);
  h.view.update(h.snapshot, 15, h.camera, h.settings);
  expect(crate.position.toArray()).toEqual([2, 33, 3]);
  h.view.update(h.snapshot, 21, h.camera, h.settings);
  restored.view.update(restored.snapshot, 21, restored.camera, restored.settings);
  expect(crate.position.toArray()).toEqual(Object.values(supplyDropPosition(h.drop, 21)));
  for (const name of ['Caixa de entrega', 'Tucano', 'Paraquedas da entrega', 'Sinal da entrega']) {
    expect(h.view.group.getObjectByName(name)!.matrixWorld.elements).toEqual(restored.view.group.getObjectByName(name)!.matrixWorld.elements);
  }
  expect(h.snapshot).toEqual(before);
  h.view.dispose(); restored.view.dispose();
});

it('lands on the authoritative point, folds the canopy, and removes opened or previous-match deliveries', async () => {
  const h = fixture(); await h.view.ready;
  h.view.update(h.snapshot, 27, h.camera, h.settings);
  const crate = h.view.group.getObjectByName('Caixa de entrega')!, chute = h.view.group.getObjectByName('Paraquedas da entrega')!;
  expect(crate.position.toArray()).toEqual([2, 1, 3]); expect(chute.visible).toBe(true);
  h.view.update(h.snapshot, 29, h.camera, h.settings); expect(chute.visible).toBe(false);
  h.drop.opened = true; h.view.update(h.snapshot, 30, h.camera, h.settings);
  expect(crate.visible).toBe(false); expect(h.view.group.getObjectByName('Sinal da entrega')!.visible).toBe(false);
  h.view.update(null, 0, h.camera, h.settings); expect(h.view.group.visible).toBe(false);
  h.snapshot.supplyDrops = []; h.view.update(h.snapshot, 0, h.camera, h.settings);
  expect(h.view.group.children.every(child => !child.visible)).toBe(true); h.view.dispose();
});

it('limits delivery count and Low cost, and keeps the real trajectory with reduced motion', async () => {
  const h = fixture(); await h.view.ready;
  h.snapshot.supplyDrops.push({ ...h.drop, id: 'second' }, { ...h.drop, id: 'excess' });
  h.view.update(h.snapshot, 21, h.camera, { graphics: 'low', reducedMotion: false });
  expect(h.view.group.children).toHaveLength(2);
  const smoke = h.view.group.getObjectByName('Fumaça do sinal') as THREE.InstancedMesh;
  expect(smoke.count).toBe(3);
  h.view.group.traverse(object => { if (object instanceof THREE.Mesh) expect(object.castShadow).toBe(false); });
  const crate = h.view.group.getObjectByName('Caixa de entrega')!, position = crate.position.clone();
  h.view.update(h.snapshot, 21, h.camera, { graphics: 'medium', reducedMotion: true });
  expect(smoke.visible).toBe(false); expect(crate.rotation.x).toBeCloseTo(0); expect(crate.rotation.z).toBeCloseTo(0);
  expect(crate.position.equals(position)).toBe(true); h.view.dispose();
});

it('releases shared authored resources exactly once, including a load that completes after disposal', async () => {
  const h = fixture(); await h.view.ready;
  const disposed = [h.geometry, h.material, h.map].map(resource => { const fn = vi.fn(); resource.addEventListener('dispose', fn); return fn; });
  h.view.dispose(); h.view.dispose(); disposed.forEach(fn => expect(fn).toHaveBeenCalledOnce());
  let finish!: (asset: GLTF) => void;
  const view = new SupplyDropView({ gltf: () => new Promise(resolve => { finish = resolve; }) });
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, material)); const release = vi.fn(); geometry.addEventListener('dispose', release);
  view.dispose(); finish({ scene } as unknown as GLTF); await view.ready;
  expect(release).toHaveBeenCalledOnce();
});

it('rejects an incomplete authored kit rather than silently showing a substitute', async () => {
  const h = fixture(); h.scene.getObjectByName('drop_chute_LOD2')!.removeFromParent();
  await expect(h.view.ready).rejects.toThrow('drop_chute_LOD2'); h.view.dispose();
});
