import { describe, expect, it } from 'vitest';
import { nextBoxSlot } from '../src/shared/inventory';
import type { WeaponState } from '../src/shared/types';

const w = (id: WeaponState['id'], box: number): WeaponState => ({ id, box, ammo: 1, reserve: 0, rarity: 0 });

describe('mouse-wheel weapon cycling', () => {
  // Pickups append to the carried list, so array order drifts from the hotbar.
  // The wheel must still walk the boxes the player sees, left to right.
  const carried = [w('pistol', 2), w('machete', 3), w('m4', 0)];
  it('steps to the next occupied hotbar box, not the next array entry', () => {
    expect(carried[nextBoxSlot(carried, 2, 1)].id).toBe('pistol');   // box 1 -> box 3 (box 2 empty)
    expect(carried[nextBoxSlot(carried, 0, 1)].id).toBe('machete');  // box 3 -> box 4
  });
  it('wraps around in both directions', () => {
    expect(carried[nextBoxSlot(carried, 1, 1)].id).toBe('m4');       // box 4 -> box 1
    expect(carried[nextBoxSlot(carried, 2, -1)].id).toBe('machete'); // box 1 -> box 4
  });
});
