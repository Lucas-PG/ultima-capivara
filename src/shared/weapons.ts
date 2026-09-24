import type { WeaponId } from './types';

export interface WeaponDefinition {
  name: string; shortName: string; description: string; ammo: string | null;
  magazine: number; damage: number; rpm: number; reload: number; range: number;
  headMultiplier: number; spread: number; adsSpread: number; pellets?: number;
  melee?: boolean; projectile?: boolean; speed?: number; automatic?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: { name: 'Pistola', shortName: 'Pistola', description: '9 mm semiautomática', ammo: '9mm', magazine: 17, damage: 24, rpm: 480, reload: 1.8, range: 90, headMultiplier: 2, spread: 1.5, adsSpread: .2 },
  smg: { name: 'SMG', shortName: 'SMG', description: 'Rajada de 9 mm', ammo: '9mm', magazine: 25, damage: 17, rpm: 920, reload: 2.1, range: 80, headMultiplier: 1.8, spread: 2.6, adsSpread: .45, automatic: true },
  m4: { name: 'M4', shortName: 'M4', description: 'Fuzil 5.56', ammo: '556', magazine: 30, damage: 28, rpm: 780, reload: 2.6, range: 160, headMultiplier: 2, spread: 2.3, adsSpread: .06, automatic: true },
  shotgun: { name: 'Doze', shortName: 'Doze', description: 'Escopeta calibre 12', ammo: '12', magazine: 6, damage: 12, rpm: 70, reload: .5, range: 35, headMultiplier: 1.5, spread: 3.4, adsSpread: 2.4, pellets: 8 },
  dmr: { name: 'Carabina', shortName: 'DMR', description: 'Carabina 5.56 com luneta', ammo: '556', magazine: 12, damage: 44, rpm: 320, reload: 2.7, range: 190, headMultiplier: 2.1, spread: 3.5, adsSpread: .02 },
  sniper: { name: 'Sniper', shortName: 'Sniper', description: 'Rifle .308 de ferrolho', ammo: '308', magazine: 5, damage: 95, rpm: 50, reload: 3, range: 240, headMultiplier: 2.5, spread: 6, adsSpread: 0 },
  machete: { name: 'Facão', shortName: 'Facão', description: 'Arma corpo a corpo', ammo: null, magazine: 0, damage: 45, rpm: 110, reload: 0, range: 2.4, headMultiplier: 1.4, spread: 0, adsSpread: 0, melee: true },
  slingshot: { name: 'Estilingão', shortName: 'Estilingão', description: 'Pedrada de estilingue', ammo: 'pedra', magazine: 1, damage: 80, rpm: 70, reload: .6, range: 90, headMultiplier: 1.6, spread: .4, adsSpread: .12, projectile: true, speed: 50 },
};
