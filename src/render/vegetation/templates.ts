import * as THREE from 'three';
import { SPECIES, type SpeciesId } from '../../shared/vegetation-species';
import type { TemplateSet } from './batch';
import { broadleafBuilder, CROWNS } from './broadleaf';
import { buildCoconut, type Lod } from './palms';

type Builder = (variant: number, lod: Lod) => THREE.BufferGeometry;

/** A species without a builder here is not drawn, so a new species can be
 * authored and reviewed on its own before it is switched on. */
const BUILDERS: Partial<Record<SpeciesId, Builder>> = {
  coconut: buildCoconut,
  ...Object.fromEntries((Object.keys(CROWNS) as SpeciesId[]).map(species => [species, broadleafBuilder(species)])),
};

export function buildTemplates(used: ReadonlySet<SpeciesId>): TemplateSet {
  const out: TemplateSet = {};
  for (const species of used) {
    const build = BUILDERS[species];
    if (!build) continue;
    out[species] = Array.from({ length: SPECIES[species].variants }, (_, variant) =>
      ([0, 1, 2] as const).map(lod => build(variant, lod)));
  }
  return out;
}
