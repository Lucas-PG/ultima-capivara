import type { WeaponId } from '../shared/types';
import { VIEW_SPECS, type GripSpec, type ViewSpec } from './viewmodel-specs';
import measured from './world-grips.json';

// The world sculpt uses the same paw proportions and holding intent as first
// person, but its coarser skin and forearm weights move the heel by millimetres.
// Corrections are measured on that actual skin at TP_WEAPON_SCALE, never guessed
// from the wrist socket. Keep shared articulation unless it needs its own fit.
const fits = measured as unknown as Partial<Record<WeaponId, { R?: Partial<GripSpec>; L?: Partial<GripSpec> }>>;
export const WORLD_GRIPS = Object.fromEntries(Object.entries(VIEW_SPECS).map(([id, spec]) => {
  const fit = fits[id as WeaponId];
  return [id, { R: { ...spec.grips.R, ...fit?.R }, L: spec.grips.L ? { ...spec.grips.L, ...fit?.L } : undefined }];
})) as Record<WeaponId, ViewSpec['grips']>;
