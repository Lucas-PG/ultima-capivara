import * as THREE from 'three';
import { expect, it } from 'vitest';
import { CardSystem } from '../src/render/effects-systems';
import { MELEE_CONTACT } from '../src/shared/weapon-presentation';

it('keeps a confirmed melee contact puff hidden and stationary until blade contact, and clears it on reset', () => {
  const atlas = new THREE.Texture(), system = new CardSystem(atlas, atlas, 2, 0);
  try {
    const puff = system.spawn(); puff.age = -MELEE_CONTACT; puff.life = .22; puff.pos.set(0, 1, -2); puff.vel.y = .25;
    system.update(.1, .01, () => true);
    expect(system.mesh.visible).toBe(false); expect(puff.pos.y).toBe(1);
    system.update(.04, .01, () => true);
    expect(system.mesh.visible).toBe(true); expect(puff.pos.y).toBeGreaterThan(1);
    system.clear(); system.update(0, .01, () => true);
    expect(system.mesh.visible).toBe(false);
    const next = system.spawn(); expect(next.age).toBe(0);
  } finally { system.dispose(); atlas.dispose(); }
});
