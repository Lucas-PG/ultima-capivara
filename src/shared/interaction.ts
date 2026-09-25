import { actorEye, hasLineOfSight } from './collision';
import { distance } from './math';
import { RARITY } from './rarity';
import { WEAPONS } from './weapons';
import type { ActorState, LootState, Vec3, WeaponId, WorldSnapshot, WorldSpec } from './types';

export interface Interaction { id: string; name: string }

const itemNames = { weapon: 'Arma', ammo: 'Munição', armor: 'Colete', helmet: 'Capacete', bandage: 'Bandagem', medkit: 'Kit médico', guarana: 'Guaraná', acai: 'Açaí', rapadura: 'Rapadura' };
const weaponNames = Object.fromEntries(Object.entries(WEAPONS).map(([id, def]) =>
  [id, RARITY.map(rarity => `${def.name} ${rarity.name.toLowerCase()}`)])) as Record<WeaponId, string[]>;
const eye: Vec3 = { x: 0, y: 0, z: 0 }, target: Vec3 = { x: 0, y: 0, z: 0 };

// The caller owns the result storage. Synchronous queries reuse scratch vectors
// and select directly instead of constructing/sorting every candidate each frame.
export function closestInteraction(world: WorldSpec, snapshot: Pick<WorldSnapshot, 'loot' | 'openedChests'> | null, actor: ActorState | null, result: Interaction): Interaction | null {
  if (!snapshot || !actor?.alive || actor.stage !== 'ground') return null;
  eye.x = actor.pos.x; eye.y = actor.pos.y + actorEye(actor); eye.z = actor.pos.z;
  let nearestDistance = Infinity, nearestId: string | null = null, nearestLoot: LootState | null = null;
  for (let i = 0; i < snapshot.loot.length; i++) {
    const loot = snapshot.loot[i];
    if (!loot.active) continue;
    const dist = distance(actor.pos, loot);
    if (!(dist <= 3 && dist < nearestDistance)) continue;
    target.x = loot.x; target.y = loot.y + .5; target.z = loot.z;
    if (!hasLineOfSight(eye, target, world)) continue;
    nearestDistance = dist; nearestId = loot.id; nearestLoot = loot;
  }
  for (let i = 0; i < world.chests.length; i++) {
    const chest = world.chests[i];
    if (snapshot.openedChests.includes(chest.id)) continue;
    const dist = distance(actor.pos, chest);
    // Strictly nearer preserves the original stable ordering, including loot
    // winning an equal-distance tie with a chest.
    if (!(dist <= 3 && dist < nearestDistance)) continue;
    target.x = chest.x; target.y = chest.y + .5; target.z = chest.z;
    if (!hasLineOfSight(eye, target, world)) continue;
    nearestDistance = dist; nearestId = chest.id; nearestLoot = null;
  }
  if (nearestId === null) return null;
  result.id = nearestId;
  result.name = nearestLoot ? nearestLoot.weapon ?
    weaponNames[nearestLoot.weapon][nearestLoot.rarity] || weaponNames[nearestLoot.weapon][0] :
    itemNames[nearestLoot.kind] || 'Equipamento' : 'Abrir caixa de suprimentos';
  return result;
}
