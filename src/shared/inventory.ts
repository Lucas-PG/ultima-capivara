import { WEAPONS } from './weapons';
import type { WeaponId, WeaponState } from './types';

// Four fixed hotbar boxes: two long guns, one sidearm and the facão. A weapon
// always lives in the same box, so key 1-4 never changes meaning mid-match.
export const BOX_COUNT = 4;
export const BOX_LABELS = ['Primária', 'Primária', 'Pistola', 'Facão'] as const;
export type WeaponClass = 'primary' | 'sidearm' | 'melee';
export const WEAPON_CLASS: Record<WeaponId, WeaponClass> = {
  smg: 'primary', m4: 'primary', shotgun: 'primary', dmr: 'primary', sniper: 'primary',
  pistol: 'sidearm', slingshot: 'sidearm', revolver: 'sidearm', coco: 'primary', machete: 'melee',
};
const CLASS_BOXES: Record<WeaponClass, readonly number[]> = { primary: [0, 1], sidearm: [2], melee: [3] };

export const defaultBox = (id: WeaponId) => CLASS_BOXES[WEAPON_CLASS[id]][0];
export const indexOfBox = (weapons: readonly WeaponState[], box: number) => weapons.findIndex(w => w.box === box);

export type PickupPlan =
  | { kind: 'merge'; index: number }
  | { kind: 'fill'; box: number }
  | { kind: 'swap'; index: number; box: number };

// Picking up never destroys a carried weapon: the same gun tops up ammo, an
// empty box is filled, and a full class swaps with the held gun of that class
// (or its first box), which is then dropped where the player stands.
export function planPickup(weapons: readonly WeaponState[], held: number, id: WeaponId): PickupPlan {
  const same = weapons.findIndex(w => w.id === id);
  if (same >= 0) return { kind: 'merge', index: same };
  const boxes = CLASS_BOXES[WEAPON_CLASS[id]];
  const free = boxes.find(box => indexOfBox(weapons, box) < 0);
  if (free !== undefined) return { kind: 'fill', box: free };
  const heldBox = weapons[held]?.box;
  const box = heldBox !== undefined && boxes.includes(heldBox) ? heldBox : boxes[0];
  return { kind: 'swap', index: indexOfBox(weapons, box), box };
}

// Keeps the array ordered by box so the wheel cycles in hotbar order. Returns the new index.
export function insertWeapon(weapons: WeaponState[], weapon: WeaponState): number {
  let index = weapons.findIndex(w => w.box > weapon.box);
  if (index < 0) index = weapons.length;
  weapons.splice(index, 0, weapon);
  return index;
}

export const canDrop = (weapon: WeaponState | undefined) => !!weapon && !WEAPONS[weapon.id].melee;

export function validLoadout(weapons: readonly { box?: unknown }[]) {
  let previous = -1;
  for (const w of weapons) {
    if (!Number.isSafeInteger(w.box) || (w.box as number) <= previous || (w.box as number) >= BOX_COUNT) return false;
    previous = w.box as number;
  }
  return true;
}

// Swimming keeps one paw free: only the sidearm box can be held or fired.
export const swimReady = (id: WeaponId | undefined) => !!id && WEAPON_CLASS[id] === 'sidearm';
export const sidearmIndex = (weapons: readonly WeaponState[]) => weapons.findIndex(w => swimReady(w.id));

/** The carried weapon in the next occupied box (hotbar order), wrapping around. */
export function nextBoxSlot(weapons: readonly WeaponState[], held: number, direction: 1 | -1): number {
  const order = weapons.map((weapon, index) => ({ index, box: weapon.box ?? index })).sort((a, b) => a.box - b.box);
  const at = order.findIndex(entry => entry.index === held);
  if (at < 0 || !order.length) return held;
  return order[(at + direction + order.length) % order.length].index;
}
