import type { WeaponId } from './types';

export const CORRENTE_LADDER = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'slingshot', 'machete'] as const satisfies readonly WeaponId[];

export interface WeaponDefinition {
  name: string; shortName: string; description: string; ammo: string | null;
  magazine: number; damage: number; rpm: number; reload: number; range: number;
  headMultiplier: number; spread: number; adsSpread: number; pellets?: number;
  melee?: boolean; projectile?: boolean; speed?: number; automatic?: boolean;
}

export const ADS_TIME: Record<WeaponId, number> = {
  pistol: .16, smg: .16, m4: .22, shotgun: .22, dmr: .22, sniper: .3, machete: .16, slingshot: .16,
};
export const RECOIL: Record<WeaponId, { pitch: number; yaw: number; recovery: number }> = {
  pistol: { pitch: .014, yaw: .002, recovery: .45 },
  smg: { pitch: .008, yaw: .004, recovery: .45 },
  m4: { pitch: .011, yaw: .003, recovery: .45 },
  shotgun: { pitch: .042, yaw: .004, recovery: .55 },
  dmr: { pitch: .028, yaw: .004, recovery: .5 },
  sniper: { pitch: .055, yaw: .003, recovery: .6 },
  machete: { pitch: 0, yaw: 0, recovery: .4 },
  slingshot: { pitch: .01, yaw: .002, recovery: .45 },
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: { name: 'Pistola', shortName: 'Pistola', description: '9 mm semiautomática', ammo: '9mm', magazine: 17, damage: 24, rpm: 480, reload: 1.8, range: 90, headMultiplier: 2, spread: 1.3, adsSpread: .2 },
  smg: { name: 'SMG', shortName: 'SMG', description: 'Rajada de 9 mm', ammo: '9mm', magazine: 25, damage: 16, rpm: 850, reload: 2, range: 80, headMultiplier: 1.8, spread: 2.2, adsSpread: .55, automatic: true },
  m4: { name: 'M4', shortName: 'M4', description: 'Fuzil 5.56', ammo: '556', magazine: 30, damage: 26, rpm: 720, reload: 2.5, range: 160, headMultiplier: 2, spread: 2, adsSpread: .15, automatic: true },
  shotgun: { name: 'Doze', shortName: 'Doze', description: 'Escopeta calibre 12', ammo: '12', magazine: 6, damage: 11, rpm: 75, reload: .55, range: 35, headMultiplier: 1.5, spread: 4, adsSpread: 3, pellets: 8 },
  dmr: { name: 'Carabina', shortName: 'DMR', description: 'Carabina 5.56 com luneta', ammo: '556', magazine: 12, damage: 42, rpm: 300, reload: 2.6, range: 190, headMultiplier: 2.1, spread: 3, adsSpread: .1 },
  sniper: { name: 'Sniper', shortName: 'Sniper', description: 'Rifle .308 de ferrolho', ammo: '308', magazine: 5, damage: 90, rpm: 50, reload: 3, range: 240, headMultiplier: 2.5, spread: 5, adsSpread: 0 },
  machete: { name: 'Facão', shortName: 'Facão', description: 'Arma corpo a corpo', ammo: null, magazine: 0, damage: 45, rpm: 120, reload: 0, range: 2.4, headMultiplier: 1.4, spread: 0, adsSpread: 0, melee: true },
  slingshot: { name: 'Estilingão', shortName: 'Estilingão', description: 'Pedrada de estilingue', ammo: 'pedra', magazine: 1, damage: 75, rpm: 75, reload: .6, range: 90, headMultiplier: 1.6, spread: .4, adsSpread: .12, projectile: true, speed: 50 },
};

// Distances in metres: full damage to start, then a linear taper to the floor.
const FALLOFF: Partial<Record<WeaponId, readonly [number, number, number]>> = {
  pistol: [25, 90, .7], smg: [18, 60, .65], m4: [45, 140, .8],
  shotgun: [8, 38, .2],
};
export function damageFalloff(id: WeaponId, distance: number): number {
  const rule = FALLOFF[id];
  if (!rule) return 1;
  const [start, end, floor] = rule;
  return 1 - (1 - floor) * Math.min(1, Math.max(0, (distance - start) / (end - start)));
}

// Heat is server owned and decays between shots. Moving or firing a burst widens
// the cone, while the first settled shot keeps the weapon's listed accuracy.
export function shotSpread(id: WeaponId, ads: number, speed: number, airborne: boolean, heat: number, swimming = false): number {
  const def = WEAPONS[id];
  if (def.melee || def.projectile) return 0;
  const movement = airborne ? .9 : Math.min(1, speed / 3.9) * .45;
  const blend = swimming ? 0 : Math.min(1, Math.max(0, ads));
  return def.spread + (def.adsSpread - def.spread) * blend + movement + heat * (.65 - .3 * blend) + (swimming ? 1.5 : 0);
}

export function advanceAds(id: WeaponId, amount: number, held: boolean, dt: number): number {
  return Math.min(1, Math.max(0, amount + (held ? 1 : -1) * dt / ADS_TIME[id]));
}
export const shotHeatGain = (id: WeaponId) => id === 'smg' ? .32 : id === 'm4' ? .3 : .12;
export const coolShotHeat = (heat: number, dt: number) => Math.max(0, heat - dt * 2.4);
