import type { MapObject } from './types';

/** Deterministic hash in [0, 1) shared by placement, trunks and rendering. */
export function plantHash(n: number, salt: number) {
  let x = Math.imul(n + salt * 7919, 1597334677);
  x = Math.imul(x ^ x >>> 16, 2246822507);
  return (x >>> 0) / 4294967296;
}

export type PlantKind = 'palm' | 'tree' | 'banana' | 'shrub';

/**
 * Every plant species the island renders. `height` is the template height in
 * metres: instance scale is `object.scale.y / height`, so a species keeps its
 * proportions at any size. `variants` are separate geometries (same draw call).
 */
export const SPECIES = {
  coconut: { kind: 'palm', height: 9, variants: 3 },
  royal: { kind: 'palm', height: 13, variants: 1 },
  mango: { kind: 'tree', height: 8, variants: 3 },
  almond: { kind: 'tree', height: 8, variants: 2 },
  jungle: { kind: 'tree', height: 9, variants: 2 },
  cashew: { kind: 'tree', height: 5, variants: 2 },
  umbrella: { kind: 'tree', height: 9, variants: 2 },
  'ipe-yellow': { kind: 'tree', height: 8, variants: 2 },
  'ipe-pink': { kind: 'tree', height: 8, variants: 2 },
  mangrove: { kind: 'tree', height: 6, variants: 2 },
  banana: { kind: 'banana', height: 4.5, variants: 3 },
  shrub: { kind: 'shrub', height: 1.4, variants: 3 },
} as const satisfies Record<string, { kind: PlantKind; height: number; variants: number }>;

export type SpeciesId = keyof typeof SPECIES;
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
/** Ground below this height (metres) is beach: palms lean over the water and shore trees grow here. */
export const SHORE_HEIGHT = 1.6;
/** Plants at or above this height have a trunk the player can bump into. */
export const SOLID_TRUNK_HEIGHT = 2.5;

const DETAIL_SPECIES: Record<string, SpeciesId> = {
  'ipe-yellow': 'ipe-yellow', 'ipe-pink': 'ipe-pink', flamboyant: 'umbrella', banana: 'banana',
  orchard: 'mango', mangrove: 'mangrove', royal: 'royal', mango: 'mango', almond: 'almond',
  jungle: 'jungle', cashew: 'cashew', coconut: 'coconut', shrub: 'shrub',
};

/** Which species stands at this authored tree or palm. Generic scatter is
 * assigned by position so neighbouring crowns differ. */
export function plantSpecies(object: MapObject): SpeciesId {
  const named = object.detail ? DETAIL_SPECIES[object.detail] : undefined;
  if (named) return named;
  if (object.kind === 'palm') return 'coconut';
  if (object.scale.y < SOLID_TRUNK_HEIGHT) return 'shrub';
  const roll = plantHash(Math.round(object.pos.x * 10), Math.round(object.pos.z * 10));
  // Shore and dune trees: broad, tiered almond trees and low cashews. Inland, mango and tall jungle crowns.
  if (object.pos.y < SHORE_HEIGHT) return roll < .6 ? 'almond' : 'cashew';
  return roll < .55 ? 'mango' : roll < .8 ? 'jungle' : roll < .92 ? 'almond' : 'cashew';
}

export function plantVariant(object: MapObject, species: SpeciesId) {
  const n = SPECIES[species].variants;
  return Math.min(n - 1, Math.floor(plantHash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100) + 17) * n));
}
