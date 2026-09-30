// The mix: target loudness per category, distance models, occlusion and the
// ambience policy. Pure functions, so the tests measure exactly what the engine
// applies. Levels are momentary loudness (LUFS) at unity sliders for one-shots
// and mean loudness for beds and music; every baked buffer sits at REF_LUFS.
import { REF_LUFS } from './bank';
import type { Vec3 } from '../shared/types';

export const LEVEL = {
  // Gunfire: the top of the hierarchy. Remote shots are given at 2 m.
  ownShot: -14, ownShotAuto: -15.5, remoteShot: -13, explosion: -12,
  whiz: -19, incoming: -24, ownMelee: -20, remoteMelee: -22,
  // Confirmations sit a few dB under your own shot but live above its band.
  hit: -19, head: -17, kill: -16, armorBreak: -18, damageTaken: -17, heart: -25, stormBite: -20,
  // Handling and movement. Remote steps are given at 1.5 m.
  ownFoley: -27, remoteFoley: -24, impact: -25, flesh: -25,
  ownStep: -37, ownLand: -31, ownJump: -40, ownCloth: -42, ownGear: -39, remoteStep: -25, remoteLand: -23,
  swim: -31, splash: -25, mud: -30,
  voice: -27, remoteVoice: -23,
  pickup: -23, chime: -26, use: -24, ui: -26, uiHover: -32, notice: -28, tick: -26, whistle: -22, zoneWarn: -22,
  supply: -24, supplyLand: -16, bounce: -25, poof: -26, chute: -24, upgrade: -26, respawn: -25,
  // Beds (mean loudness at full presence) and island life.
  surf: -28, wind: -32, leaves: -31, harbour: -28, waterfall: -22, storm: -23, stormWall: -32,
  cabin: -25, engine: -18, freefall: -24, canopy: -29, critter: -26, thunder: -24, crackle: -34,
  // Music.
  menu: -18, drop: -26, tension: -27, dance: -24, victory: -18, defeat: -20,
} as const;
export type LevelId = keyof typeof LEVEL;

export const dbToGain = (db: number) => 10 ** (db / 20);
/**
 * Output trim: the table is written with your own shot at -14 LUFS, and the whole mix
 * sits 6 dB lower so sustained fire stays under the limiter instead of into the clipper
 * (measured in Chrome: an automatic firefight peaked at -0.7 dBFS untrimmed, and spent
 * 0.08% of samples in the clipper's knee at -4 dB). Beds are written 2 dB hotter to match.
 */
export const OUTPUT_TRIM = -6;
/** Linear gain for a baked buffer to play at `level` LUFS (before the sliders). */
export const levelGain = (level: number) => dbToGain(level - REF_LUFS + OUTPUT_TRIM);

const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Gunfire carries: about -4 dB per doubling past 2 m instead of the physical 6. Audible to GUN_RANGE. */
export const GUN_RANGE = 260;
/** The forward report of a shot aimed at the listener, never a sideways or short blocked ray. */
export function incomingShotWeight(origin: Vec3, end: Vec3, ear: Vec3): number {
  const dx = end.x - origin.x, dy = end.y - origin.y, dz = end.z - origin.z;
  const ex = ear.x - origin.x, ey = ear.y - origin.y, ez = ear.z - origin.z;
  const length = Math.hypot(dx, dy, dz), distance = Math.hypot(ex, ey, ez);
  if (distance < 3 || length < distance - 3 || length < 1) return 0;
  return smoothstep(.94, .998, (dx * ex + dy * ey + dz * ez) / (length * distance));
}
export function gunDistance(distance: number): { db: number; near: number; far: number; cutoff: number; delay: number } {
  const d = Math.max(2, distance);
  const db = -13 * Math.log10(d / 2);
  // Close shots use the full report; far ones blend into the dark rolling version.
  const far = smoothstep(18, 70, distance), near = Math.sqrt(1 - far * far);
  return { db, near, far, cutoff: Math.max(2500, 18000 / (1 + distance / 30)), delay: distance > 20 ? distance / 343 : 0 };
}

/** Steps and handling fall off like real sound (6 dB per doubling past 1.5 m) and fade out before `range`. */
export function stepDistance(distance: number, range: number): { db: number; cutoff: number } {
  const d = Math.max(1.5, distance);
  const edge = 1 - smoothstep(range * .7, range, distance);
  return { db: -17 * Math.log10(d / 1.5) + (edge > 0 ? 20 * Math.log10(edge) : -Infinity), cutoff: 16000 / (1 + distance / 14) };
}

/** Island life and world sounds (critters, supply drops): gentle rolloff past 5 m. */
export function worldDistance(distance: number, range: number): { db: number; cutoff: number } {
  const d = Math.max(5, distance), edge = 1 - smoothstep(range * .7, range, distance);
  return { db: -14 * Math.log10(d / 5) + (edge > 0 ? 20 * Math.log10(edge) : -Infinity), cutoff: 14000 / (1 + distance / 40) };
}

/** A wall between you and the source: quieter and much darker, but gunfire stays audible. */
export const OCCLUDED = { gunDb: -5, gunCutoff: 1400, stepDb: -8, stepCutoff: 900 } as const;

/** How far other capybaras can be heard moving. Crouching is nearly silent. */
export const STEP_RANGE = { crouch: 8, walk: 24, sprint: 32 } as const;

export interface Place {
  /** 0..1: how much open ocean surrounds the listener (surf). */
  coast: number;
  /** Metres above sea level. */
  height: number;
  /** 0..1: tree and palm density within about 18 m. */
  canopy: number;
  /** Under a roof. */
  inside: boolean;
  /** Distances in metres (Infinity when none). */
  harbour: number; waterfall: number;
  district: string | null;
}

export interface BedMix { surf: number; wind: number; leaves: number; harbour: number; waterfall: number }

/** Bed gains in dB (-Infinity for silent) for the listener's surroundings. Combat ducking is applied on the bus. */
export function ambienceMix(place: Place): BedMix {
  const inside = place.inside ? -10 : 0;
  const lift = Math.min(1, Math.max(0, (place.height - 3) / 20));
  const db = (base: number, presence: number) => presence <= .02 ? -Infinity : base + 20 * Math.log10(presence);
  return {
    surf: db(LEVEL.surf + inside, place.coast * (1 - .5 * lift)),
    wind: db(LEVEL.wind + inside - 3, .42 + .58 * lift),
    leaves: db(LEVEL.leaves + inside, place.canopy * (place.inside ? .5 : 1)),
    harbour: db(LEVEL.harbour + inside, 1 - smoothstep(10, 45, place.harbour)),
    waterfall: db(LEVEL.waterfall + inside, 1 - smoothstep(6, 70, place.waterfall)),
  };
}

export type CritterChoice = readonly [id: string, weight: number];

/** Which island life can call out here, weighted. */
export function critterWeights(place: Place): CritterChoice[] {
  const out: [string, number][] = [];
  const trees = place.canopy, coast = place.coast, town = ['vila', 'mercado', 'rosario', 'capela', 'engenho'].includes(place.district ?? '');
  if (trees > .1) out.push(['bemtevi', 3 * trees], ['sabia', 2 * trees], ['maritaca', 1.2 * trees], ['dove', 1.5 * trees], ['cicada', 1 * trees], ['cricket', .8 * trees]);
  if (coast > .15) out.push(['gull', 2.5 * coast], ['splash-fish', .6 * coast]);
  if (place.harbour < 60) out.push(['gull', 2], ['buoy-bell', 1], ['creak', 1.5]);
  if (town) out.push(['pardal', 2], ['bemtevi', 1.2], ['dove', 1.2], ['dog', .8], ['bike-bell', .6], ['chimes', .7], ['radio', .5]);
  if (place.district === 'capela') out.push(['church-bell', .5]);
  if (place.district === 'fazenda') out.push(['rooster', 1], ['hen', 1.5], ['mill', 1]);
  if (place.district === 'engenho') out.push(['mill', .8], ['hen', .6]);
  if (place.district === 'mangue' || place.district === 'palafitas') out.push(['frog', 2], ['cricket', 1], ['splash-fish', 1]);
  if (place.district === 'mercado' || place.district === 'vila') out.push(['sizzle', .4], ['cups', .5]);
  if (!out.length) out.push(['bemtevi', 1], ['cricket', .5]);
  return out;
}

/** The soft clipper after the limiter: linear to 0.7, then a tanh knee that never reaches 1. */
export function safetyCurve(samples = 2049, ceiling = .98): Float32Array {
  const curve = new Float32Array(samples), knee = .7;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
