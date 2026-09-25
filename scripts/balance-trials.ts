import { damageFalloff, WEAPONS } from '../src/shared/weapons';
import type { WeaponId } from '../src/shared/types';

// Ideal direct hits against a stationary 100 HP target. Armor means a 50-point
// vest plus a 60-point helmet. Shotgun rows assume every pellet connects.
export function trial(id: WeaponId, distance: number, head: boolean, armored: boolean, rarity: number) {
  const weapon = WEAPONS[id];
  if (distance > weapon.range) return null;
  let hp = 100, armor = armored ? 50 : 0, helmet = armored ? 60 : 0;
  let shots = 0, time = 0;
  const cadence = 60 / weapon.rpm;
  const pellets = weapon.pellets || 1;
  while (hp > 0 && shots < 80) {
    if (shots) time += shots % Math.max(1, weapon.magazine) === 0 && !weapon.melee
      ? Math.max(cadence, weapon.reload) : cadence;
    shots++;
    for (let pellet = 0; pellet < pellets; pellet++) {
      let damage = weapon.damage * (head ? weapon.headMultiplier : 1) * (1 + rarity * .08) * damageFalloff(id, distance);
      if (head && helmet > 0) { const blocked = Math.min(helmet, damage * .4); helmet -= blocked; damage -= blocked; }
      if (armor > 0) { const blocked = Math.min(armor, damage); armor -= blocked; damage -= blocked; }
      hp = Math.max(0, hp - damage);
      if (hp === 0) break;
    }
  }
  return hp > 0 ? null : { shots, ttk: +(time + (weapon.projectile ? distance / (weapon.speed || 50) : 0)).toFixed(3) };
}

if (process.argv[1]?.endsWith('balance-trials.ts')) {
  console.log('weapon,distance_m,hit,armor50_helmet60,rarity,shots,ttk_s');
  for (const id of Object.keys(WEAPONS) as WeaponId[])
    for (const distance of [5, 15, 30, 60])
      for (const head of [false, true])
        for (const armored of [false, true])
          for (const rarity of [0, 3]) {
            const result = trial(id, distance, head, armored, rarity);
            console.log(`${id},${distance},${head ? 'head' : 'body'},${armored},${rarity},${result?.shots ?? 'NA'},${result?.ttk ?? 'NA'}`);
          }
}
