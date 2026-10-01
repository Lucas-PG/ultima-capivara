import * as THREE from 'three';
import { SPECIES, type SpeciesId } from '../../shared/vegetation-species';
import type { TemplateSet } from './batch';
import { broadleafBuilder, CROWNS } from './broadleaf';
import { buildBanana, buildBromeliad, buildCrop, buildFern, buildHeliconia, buildMeadow, buildMonstera, buildReeds, buildStrelitzia, buildTaro } from './garden';
import { buildCoconut, buildRoyal, type Lod } from './palms';
import { buildBed, buildCroton, buildHedge, buildPot, buildShrub, buildThicket, buildWindowBox } from './shrubs';
import { buildVine } from './vines';

type Builder = (variant: number, lod: Lod) => THREE.BufferGeometry;

/** A species without a builder here is not drawn, so a new species can be
 * authored and reviewed on its own before it is switched on. */
const BUILDERS: Partial<Record<SpeciesId, Builder>> = {
  coconut: buildCoconut,
  royal: buildRoyal,
  ...Object.fromEntries((Object.keys(CROWNS) as SpeciesId[]).map(species => [species, broadleafBuilder(species)])),
  banana: buildBanana,
  shrub: (variant, lod) => buildShrub('shrub', variant, lod),
  thicket: buildThicket,
  hedge: buildHedge,
  hibiscus: (variant, lod) => buildShrub('hibiscus', variant, lod),
  bougainvillea: (variant, lod) => buildShrub('bougainvillea', variant, lod),
  croton: buildCroton,
  heliconia: buildHeliconia,
  strelitzia: buildStrelitzia,
  fern: buildFern,
  monstera: buildMonstera,
  taro: buildTaro,
  bromeliad: buildBromeliad,
  reeds: buildReeds,
  crop: buildCrop,
  meadow: buildMeadow,
  vine: buildVine,
  pot: buildPot,
  bed: buildBed,
  windowbox: buildWindowBox,
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
