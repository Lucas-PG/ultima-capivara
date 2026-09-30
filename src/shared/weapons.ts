import type { WeaponId } from './types';

export const CORRENTE_LADDER = ['pistol', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'revolver', 'machete'] as const satisfies readonly WeaponId[];

// Combat tuning, reasoning in docs/overhaul/combat-report.md ("Balance").
// Target times to kill 100 HP with ideal body hits: SMG 0.40 s up close, M4
// 0.46 s at every range it is used at, pistol 0.6 s, DMR 0.5 s, revolver and
// shotgun 0.7 to 0.8 s, sniper and coconut two hits. Armour (up to 100) roughly
// doubles those. Heads pay 1.5x on automatics and 2 to 2.5x on precision guns,
// so aim is rewarded without turning the big capybara head into an instant kill.
export interface WeaponDefinition {
  name: string; shortName: string; description: string; ammo: string | null;
  magazine: number; damage: number; rpm: number; reload: number; range: number;
  /** Hip and fully aimed cone half-angles in degrees. */
  headMultiplier: number; spread: number; adsSpread: number; pellets?: number;
  melee?: boolean; projectile?: boolean; speed?: number; automatic?: boolean; splash?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: { name: 'Pistola', shortName: 'Pistola', description: '9 mm semiautomática', ammo: '9mm', magazine: 17, damage: 22, rpm: 400, reload: 1.8, range: 90, headMultiplier: 1.8, spread: 1.1, adsSpread: .22 },
  smg: { name: 'SMG', shortName: 'SMG', description: 'Rajada de 9 mm', ammo: '9mm', magazine: 25, damage: 15, rpm: 900, reload: 2, range: 80, headMultiplier: 1.5, spread: 1.5, adsSpread: .6, automatic: true },
  m4: { name: 'M4', shortName: 'M4', description: 'Fuzil 5.56', ammo: '556', magazine: 30, damage: 18, rpm: 650, reload: 2.5, range: 160, headMultiplier: 1.6, spread: 2, adsSpread: .12, automatic: true },
  shotgun: { name: 'Doze', shortName: 'Doze', description: 'Escopeta calibre 12', ammo: '12', magazine: 6, damage: 11, rpm: 75, reload: .55, range: 35, headMultiplier: 1.5, spread: 3.6, adsSpread: 2.6, pellets: 8 },
  dmr: { name: 'Carabina', shortName: 'DMR', description: 'Carabina 5.56 com luneta', ammo: '556', magazine: 12, damage: 40, rpm: 240, reload: 2.6, range: 190, headMultiplier: 2, spread: 3, adsSpread: .06 },
  sniper: { name: 'Sniper', shortName: 'Sniper', description: 'Rifle .308 de ferrolho', ammo: '308', magazine: 5, damage: 90, rpm: 50, reload: 3, range: 240, headMultiplier: 2.5, spread: 5, adsSpread: 0 },
  machete: { name: 'Facão', shortName: 'Facão', description: 'Arma corpo a corpo', ammo: null, magazine: 0, damage: 45, rpm: 120, reload: 0, range: 2.4, headMultiplier: 1.4, spread: 0, adsSpread: 0, melee: true },
  // Heavy sidearm: two shots if one of them is to the head, three to the body.
  revolver: { name: 'Trinta-e-oito', shortName: '38', description: 'Revólver de seis tiros', ammo: '38', magazine: 6, damage: 42, rpm: 170, reload: 2.3, range: 110, headMultiplier: 2.4, spread: 1.3, adsSpread: .08 },
  // Arcing coconut that bursts on contact: splash clears cover and punishes camping.
  coco: { name: 'Lança-coco', shortName: 'Coco', description: 'Coco explosivo em arco', ammo: 'coco', magazine: 4, damage: 90, rpm: 60, reload: 2.8, range: 70, headMultiplier: 1, spread: .7, adsSpread: .3, projectile: true, speed: 30, splash: 4.2 },
};

export const ADS_TIME: Record<WeaponId, number> = {
  pistol: .16, smg: .16, m4: .22, shotgun: .22, dmr: .26, sniper: .3, machete: .16, revolver: .18, coco: .24,
};

/**
 * Handling (seconds and speed factors). `draw`: from the swap until the weapon may fire.
 * `sprintOut`: from leaving a sprint until the first shot. `move`: walk, crouch and sprint
 * speed factor. `adsMove`: aimed walking speed as a fraction of the base walk.
 */
export const HANDLING: Record<WeaponId, { draw: number; sprintOut: number; move: number; adsMove: number }> = {
  pistol: { draw: .26, sprintOut: .1, move: 1, adsMove: .72 },
  revolver: { draw: .3, sprintOut: .12, move: 1, adsMove: .68 },
  smg: { draw: .3, sprintOut: .12, move: 1, adsMove: .72 },
  m4: { draw: .32, sprintOut: .16, move: .96, adsMove: .6 },
  shotgun: { draw: .34, sprintOut: .16, move: .96, adsMove: .62 },
  dmr: { draw: .34, sprintOut: .2, move: .94, adsMove: .55 },
  sniper: { draw: .4, sprintOut: .24, move: .9, adsMove: .45 },
  coco: { draw: .34, sprintOut: .2, move: .93, adsMove: .55 },
  machete: { draw: .22, sprintOut: .05, move: 1.08, adsMove: 1 },
};

/**
 * Cone growth in degrees. `move` at full walking speed, `air` while airborne,
 * `bloom` per unit of heat (heat caps at 1.2), `heat` gained per shot. Heat
 * cools at 2.4 per second, so paced shots stay on the listed accuracy and only
 * spam or long sprays open the cone.
 */
export const SPREAD: Record<WeaponId, { move: number; air: number; bloom: number; heat: number }> = {
  pistol: { move: .55, air: 1.6, bloom: 1, heat: .45 },
  revolver: { move: .7, air: 2, bloom: 1, heat: 1.1 },
  smg: { move: .25, air: 1, bloom: .9, heat: .26 },
  m4: { move: .6, air: 2.2, bloom: .7, heat: .3 },
  shotgun: { move: .3, air: 1, bloom: 0, heat: 0 },
  dmr: { move: .9, air: 3, bloom: 1.2, heat: .8 },
  sniper: { move: 1.4, air: 4, bloom: 0, heat: 0 },
  coco: { move: 0, air: 0, bloom: 0, heat: 0 },
  machete: { move: 0, air: 0, bloom: 0, heat: 0 },
};

/**
 * Camera recoil (radians per shot) applied on the shooter's client. Automatics
 * climb for `climbShots`, then ease to `settle` of the climb while the view sways
 * sideways (`sway` at `swayRate` radians of phase per shot) with a small random
 * `jitter`: a learnable pattern. `recovery` is the time to settle back after the
 * trigger is released; aimed fire scales everything by `ads`.
 */
export interface RecoilSpec { pitch: number; yaw: number; climbShots: number; settle: number; sway: number; swayRate: number; jitter: number; recovery: number; ads: number }
export const RECOIL: Record<WeaponId, RecoilSpec> = {
  pistol: { pitch: .016, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .003, recovery: .3, ads: .7 },
  revolver: { pitch: .042, yaw: .004, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .006, recovery: .4, ads: .7 },
  smg: { pitch: .0055, yaw: .0008, climbShots: 5, settle: .45, sway: .0045, swayRate: .9, jitter: .003, recovery: .35, ads: .75 },
  m4: { pitch: .0085, yaw: .0012, climbShots: 6, settle: .35, sway: .004, swayRate: .55, jitter: .0018, recovery: .4, ads: .72 },
  shotgun: { pitch: .05, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .006, recovery: .45, ads: .8 },
  dmr: { pitch: .028, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .004, recovery: .35, ads: .75 },
  sniper: { pitch: .06, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .004, recovery: .55, ads: .8 },
  machete: { pitch: 0, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: 0, recovery: .4, ads: 1 },
  coco: { pitch: .045, yaw: 0, climbShots: 1, settle: 1, sway: 0, swayRate: 0, jitter: .003, recovery: .5, ads: .8 },
};

/** Recoil for shot `n` (0 = first of a burst). `random` is uniform in [0, 1). */
export function recoilKick(id: WeaponId, n: number, ads: number, random: number): { pitch: number; yaw: number } {
  const r = RECOIL[id], scale = 1 + (r.ads - 1) * Math.min(1, Math.max(0, ads));
  const pitch = r.pitch * (n < r.climbShots ? 1 : r.settle) * scale;
  const drift = n < r.climbShots ? 0 : Math.sin((n - r.climbShots) * r.swayRate) * r.sway;
  return { pitch, yaw: (r.yaw + drift + (random * 2 - 1) * r.jitter) * scale };
}

// Scope and sight magnification (1 = none) while fully aimed.
export const ADS_ZOOM: Record<WeaponId, number> = {
  pistol: 1.25, smg: 1.25, m4: 1.15, shotgun: 1.25, dmr: 2.9, sniper: 5.5, machete: 1, revolver: 1.25, coco: 1.25,
};

// Distances in metres: full damage to start, then a linear taper to the floor.
const FALLOFF: Partial<Record<WeaponId, readonly [number, number, number]>> = {
  pistol: [20, 60, .7], smg: [12, 35, .6], m4: [35, 110, .75], revolver: [30, 90, .75],
  shotgun: [6, 30, .25], dmr: [80, 190, .85],
};
export function damageFalloff(id: WeaponId, distance: number): number {
  const rule = FALLOFF[id];
  if (!rule) return 1;
  const [start, end, floor] = rule;
  return 1 - (1 - floor) * Math.min(1, Math.max(0, (distance - start) / (end - start)));
}

// Heat is server owned and decays between shots. Moving, jumping or firing a
// burst widens the cone; a settled, crouched first shot keeps the listed accuracy.
export function shotSpread(id: WeaponId, ads: number, speed: number, airborne: boolean, heat: number, swimming = false, crouch = false): number {
  const def = WEAPONS[id], extra = SPREAD[id];
  if (def.melee || def.projectile) return 0;
  const blend = swimming ? 0 : Math.min(1, Math.max(0, ads));
  const base = (def.spread + (def.adsSpread - def.spread) * blend) * (crouch && !airborne && speed < 1 ? .85 : 1);
  const movement = airborne ? extra.air : Math.min(1.3, speed / 3.9) * extra.move * (1 - .3 * blend);
  return base + movement + Math.min(1.2, Math.max(0, heat)) * extra.bloom * (1 - .5 * blend) + (swimming ? 1.5 : 0);
}

export function advanceAds(id: WeaponId, amount: number, held: boolean, dt: number): number {
  return Math.min(1, Math.max(0, amount + (held ? 1 : -1) * dt / ADS_TIME[id]));
}
export const shotHeatGain = (id: WeaponId) => SPREAD[id].heat;
export const coolShotHeat = (heat: number, dt: number) => Math.max(0, heat - dt * 2.4);

// Deterministic spread: the host and the shooter's client draw the same pellet
// directions from (match, shooter, shot number), so a predicted tracer lands
// where the authoritative round does. Aim stays client authoritative anyway, so
// knowing the draw grants nothing an aim assist would not.
export function shotSeed(match: string, actor: string, shot: number): number {
  let h = 2166136261;
  for (const text of [match, actor]) for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.imul(h ^ shot, 2654435761) >>> 0;
}
function mix32(seed: number): number {
  let t = seed + 0x6D2B79F5 | 0;
  t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
/**
 * Offset of one pellet inside the cone as [right, up] fractions of the cone
 * radius (length <= 1). Single rounds are centre weighted (half of them inside
 * half the radius); the shotgun fires a fixed ring around a centre pellet,
 * turned per shot, so its reach is consistent and learnable.
 */
export function spreadOffset(id: WeaponId, seed: number, pellet: number): [number, number] {
  const u = mix32(seed ^ Math.imul(pellet + 1, 0x9E3779B1)), v = mix32(seed ^ Math.imul(pellet + 7, 0x85EBCA77));
  let radius: number, angle: number;
  if ((WEAPONS[id].pellets ?? 1) > 1) {
    const ring = WEAPONS[id].pellets! - 1, turn = mix32(seed) * Math.PI * 2;
    radius = pellet === 0 ? .12 * u : .62 + .3 * u;
    angle = pellet === 0 ? v * Math.PI * 2 : turn + (pellet - 1) / ring * Math.PI * 2 + (v - .5) * .5;
  } else { radius = u; angle = v * Math.PI * 2; }
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}
