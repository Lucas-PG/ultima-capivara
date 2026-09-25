import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { PaintedWeaponSet, PAINTED_WEAPON_IDS } from '../src/render/painted-weapons';

function fixture() {
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry(), map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map, emissiveMap: new THREE.Texture() });
  for (const id of PAINTED_WEAPON_IDS) {
    const root = new THREE.Group(); root.name = id; scene.add(root);
    for (const part of ['body', 'right_paw', 'left_paw', 'muzzle', 'eject', 'sight', 'magazine', 'action', 'legendary']) {
      if (part === 'left_paw' && id === 'machete') continue;
      const node = new THREE.Group(); node.name = `${id}_${part}`; root.add(node);
      if (['body', 'right_paw', 'left_paw'].includes(part)) node.add(new THREE.Mesh(geometry, material));
    }
  }
  return { asset: { scene, animations: [] } as unknown as GLTF, geometry, material, map };
}

describe('painted weapon readiness and ownership', () => {
  it('requires the full set before constructing a model and shares one in-flight request', async () => {
    const source = fixture(), set = new PaintedWeaponSet();
    let resolve!: (value: GLTF) => void;
    const load = vi.fn(() => new Promise<GLTF>(done => { resolve = done; }));
    const pending = set.preload(load);
    expect(set.preload(load)).toBe(pending);
    expect(() => set.create('m4')).toThrow('prontas');
    expect(load).toHaveBeenCalledTimes(1);
    resolve(source.asset); await pending;
    expect(set.create('m4').muzzle.name).toBe('m4_muzzle');
    set.dispose();
  });

  it('propagates failure and releases malformed source assets once', async () => {
    const source = fixture(), set = new PaintedWeaponSet();
    const dispose = [source.geometry, source.material, source.map].map(resource => vi.spyOn(resource, 'dispose'));
    source.asset.scene.getObjectByName('shotgun_muzzle')!.removeFromParent();
    await expect(set.preload(async () => source.asset)).rejects.toThrow('shotgun/muzzle');
    set.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1);
    const failed = new PaintedWeaponSet();
    await expect(failed.preload(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(() => failed.create('pistol')).toThrow('prontas');
    failed.dispose();
  });

  it('rejects present but empty weapon and paw groups', async () => {
    for (const part of ['body', 'right_paw', 'left_paw']) {
      const source = fixture(), set = new PaintedWeaponSet();
      source.asset.scene.getObjectByName(`m4_${part}`)!.clear();
      await expect(set.preload(async () => source.asset)).rejects.toThrow(`m4/${part}`);
      set.dispose();
    }
  });

  it('keeps fur fixed across rarity, shows legendary filigree, and shares geometry', async () => {
    const source = fixture(), set = new PaintedWeaponSet();
    await set.preload(async () => source.asset);
    const common = set.create('m4'), rare = set.create('m4', 1), legendary = set.create('m4', 3);
    expect(common.legendary.visible).toBe(false); expect(rare.legendary.visible).toBe(false); expect(legendary.legendary.visible).toBe(true);
    const mesh = (model: typeof common) => model.group.getObjectByProperty('isMesh', true) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(mesh(common).geometry).toBe(mesh(rare).geometry);
    expect(mesh(common).material.emissiveMap).toBe(source.material.emissiveMap);
    expect(mesh(common).material.emissiveMap!.minFilter).toBe(THREE.NearestFilter);
    expect(mesh(common).material.emissiveMap!.magFilter).toBe(THREE.NearestFilter);
    expect(mesh(common).material.emissiveMap!.generateMipmaps).toBe(false);
    const pixels = (model: typeof common) => (mesh(model).material.map as THREE.DataTexture).image.data!;
    expect(Array.from(pixels(common).slice(13 * 4, 14 * 4))).toEqual([162, 124, 92, 255]);
    expect(Array.from(pixels(rare).slice(13 * 4, 14 * 4))).toEqual([162, 124, 92, 255]);
    expect(Array.from(pixels(rare).slice(9 * 4, 10 * 4))).toEqual([63, 169, 245, 255]);
    set.dispose();
  });

  it('cleans up a late download without resurrecting a disposed view', async () => {
    const source = fixture(), set = new PaintedWeaponSet();
    const dispose = [source.geometry, source.material, source.map].map(resource => vi.spyOn(resource, 'dispose'));
    let resolve!: (asset: GLTF) => void;
    const pending = set.preload(() => new Promise<GLTF>(done => { resolve = done; }));
    set.dispose(); resolve(source.asset);
    await expect(pending).rejects.toThrow('cancelado');
    expect(() => set.create('pistol')).toThrow('prontas');
    set.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1);
  });
});
