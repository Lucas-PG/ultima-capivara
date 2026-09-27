import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ToonArsenal, TOON_WEAPON_IDS } from '../src/render/toon-weapons';

// The code-built arsenal must stay compatible with the first-person animation
// contract: a muzzle out in front, magazines/actions the reload can move, and a
// sight line on the centre so ADS lines up with the crosshair.
describe('toon first-person arsenal', () => {
  const arsenal = new ToonArsenal();
  for (const id of TOON_WEAPON_IDS) it(`${id} exposes the parts the animations drive`, () => {
    const model = arsenal.create(id);
    model.group.updateMatrixWorld(true);
    const muzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
    if (id !== 'machete') expect(muzzle.z).toBeLessThan(-.04);
    expect(model.group.getObjectByName('paw_r') ?? model.group.getObjectByName('paw_support')).toBeTruthy();
    if (id !== 'machete') {
      expect(model.support.children.length).toBeGreaterThan(0);
      expect(model.magazine?.userData.travel).toBeGreaterThan(0);
    }
    const box = new THREE.Box3().setFromObject(model.group);
    expect(box.min.x).toBeLessThan(0); expect(box.max.x).toBeGreaterThan(0);
    // Batched for draw calls: ink everywhere, but only a few dozen meshes per held gun.
    let inked = 0, meshes = 0; model.group.traverse(o => { if (o.name === 'ink') inked++; if (o instanceof THREE.Mesh) meshes++; });
    expect(inked).toBeGreaterThan(0);
    expect(meshes).toBeLessThan(45);
  });
  it('recolours only accent paint for rarity and shows legendary trim at tier 3', () => {
    const model = arsenal.create('m4', 0);
    const accent = () => { let c = ''; model.group.traverse(o => { if (o instanceof THREE.Mesh && o.userData.accent) c = (o.material as THREE.MeshStandardMaterial).color.getHexString(); }); return c; };
    const common = accent();
    arsenal.setRarity(model, 3);
    expect(accent()).not.toBe(common);
    expect(model.legendary.visible).toBe(true);
  });
});
