import type { MapObject, Vec3 } from './types';
import { plantHash, plantSpecies, plantVariant, SHORE_HEIGHT, SOLID_TRUNK_HEIGHT, SPECIES, type SpeciesId } from './vegetation-species';

export { plantHash };
export interface PlantStemSection { a: Vec3; b: Vec3; radiusBottom: number; radiusTop: number }

interface TrunkSpec {
  /** Centreline in template space for t in [0, 1]; y is metres above the ground. */
  path: (t: number, variant: number) => Vec3;
  /** Radius above the root flare, at template scale. */
  radius: number;
  /** Fraction of the radius lost by the top of the trunk. */
  taper: number;
  /** Extra radius (as a multiple of `radius`) at the ground, fading over `flareHeight` metres. */
  flare: number;
  flareHeight: number;
  /** Sections for the collision and the highest render LOD. Denser near the ground when `spacing` > 1. */
  sections: number;
  spacing: number;
}

const TAU = Math.PI * 2;
const curve = (drift: number, sway: number, phase: number) => (t: number, height: number): Vec3 =>
  ({ x: drift * Math.pow(t, 1.8) + sway * Math.sin(t * TAU), y: height * t, z: sway * .7 * Math.sin(t * Math.PI + phase) });

// Only species with a solid trunk appear here. Bananas and shrubs stay soft.
export const TRUNKS: Partial<Record<SpeciesId, TrunkSpec>> = {
  // Coconut palms curve progressively as they climb; three variants share one draw.
  coconut: { path: (t, v) => curve([.7, 1.6, 2.7][v] ?? 1, [.05, .1, .08][v] ?? .05, v)(t, 7.6),
    radius: .25, taper: .3, flare: 1.1, flareHeight: .7, sections: 12, spacing: 1.3 },
  royal: { path: t => ({ x: .12 * Math.sin(t * Math.PI), y: 10.6 * t, z: 0 }),
    radius: .3, taper: .12, flare: .7, flareHeight: .9, sections: 10, spacing: 1.2 },
  mango: { path: (t, v) => ({ x: .14 * Math.sin(t * Math.PI * 1.5 + v), y: 2.6 * t, z: .1 * Math.sin(t * Math.PI + v) }),
    radius: .38, taper: .3, flare: .9, flareHeight: .9, sections: 7, spacing: 1.2 },
  almond: { path: (t, v) => ({ x: .12 * t + .1 * Math.sin(t * Math.PI + v), y: 4 * t, z: .08 * Math.sin(t * Math.PI * 1.4) }),
    radius: .26, taper: .25, flare: .6, flareHeight: .8, sections: 8, spacing: 1.2 },
  jungle: { path: (t, v) => ({ x: .1 * Math.sin(t * Math.PI + v), y: 4.6 * t, z: .1 * Math.sin(t * Math.PI * 1.6) }),
    radius: .3, taper: .25, flare: 1.0, flareHeight: 1.2, sections: 8, spacing: 1.3 },
  cashew: { path: (t, v) => ({ x: (.5 + v * .25) * Math.sin(t * Math.PI * .9), y: 1.6 * t, z: .2 * Math.sin(t * Math.PI * 1.3) }),
    radius: .3, taper: .35, flare: .8, flareHeight: .6, sections: 9, spacing: 1.1 },
  umbrella: { path: (t, v) => ({ x: .2 * Math.sin(t * Math.PI * 1.2 + v), y: 3.4 * t, z: .12 * Math.sin(t * Math.PI) }),
    radius: .3, taper: .3, flare: .8, flareHeight: .9, sections: 7, spacing: 1.2 },
  'ipe-yellow': { path: (t, v) => ({ x: .22 * t + .12 * Math.sin(t * Math.PI * 1.6 + v), y: 3.8 * t, z: .1 * Math.sin(t * Math.PI) }),
    radius: .22, taper: .3, flare: .6, flareHeight: .7, sections: 8, spacing: 1.2 },
  'ipe-pink': { path: (t, v) => ({ x: .22 * t + .12 * Math.sin(t * Math.PI * 1.6 + v), y: 3.8 * t, z: .1 * Math.sin(t * Math.PI) }),
    radius: .22, taper: .3, flare: .6, flareHeight: .7, sections: 8, spacing: 1.2 },
  mangrove: { path: (t, v) => ({ x: .1 * Math.sin(t * Math.PI + v), y: 1.7 * t, z: .1 * t }),
    radius: .3, taper: .3, flare: .5, flareHeight: .6, sections: 5, spacing: 1.1 },
};

export function hasSolidTrunk(species: SpeciesId) { return species in TRUNKS; }

function radiusAt(spec: TrunkSpec, t: number, y: number) {
  return spec.radius * (1 - spec.taper * t) * (1 + spec.flare * Math.exp(-y / spec.flareHeight));
}

/** The renderer and any collider builder consume this same tapered centreline. */
export function plantStemTemplate(species: SpeciesId, segments?: number, variant = 0): PlantStemSection[] {
  const spec = TRUNKS[species];
  if (!spec) return [];
  const n = segments ?? spec.sections;
  const t = (i: number) => Math.pow(i / n, spec.spacing);
  const at = (i: number) => spec.path(t(i), variant);
  return Array.from({ length: n }, (_, i) => {
    const a = at(i), b = at(i + 1);
    return { a, b, radiusBottom: radiusAt(spec, t(i), a.y), radiusTop: radiusAt(spec, t(i + 1), b.y) };
  });
}

/** Where the trunk ends and the crown begins, in template space. */
export function plantTrunkTop(species: SpeciesId, variant = 0): Vec3 {
  const spec = TRUNKS[species];
  return spec ? spec.path(1, variant) : { x: 0, y: 0, z: 0 };
}

export function plantTransform(object: MapObject) {
  const species = plantSpecies(object), def = SPECIES[species], palm = def.kind === 'palm';
  const px = Math.round(object.pos.x * 100), pz = Math.round(object.pos.z * 100), salt = px ^ pz;
  const shore = object.pos.y < SHORE_HEIGHT;
  // Coconut trunks curve toward +x in template space. On the shore that curve faces the sea.
  const yaw = palm && shore ? Math.atan2(-object.pos.z, object.pos.x) + (plantHash(salt, 3) - .5) * .9
    : object.rotation ?? plantHash(px, pz) * TAU;
  // Uniform scale: a stretched matrix would fatten slanted trunks past their isotropic collision radius.
  // Crown proportions vary through template variants instead.
  const heightScale = object.scale.y / def.height;
  return {
    species, variant: plantVariant(object, species), yaw,
    lean: palm ? (1 + plantHash(salt, 5) * 4) * Math.PI / 180 : 0,
    leanDirection: plantHash(salt, 4) * TAU,
    heightScale, radialScale: heightScale,
  };
}

/** World-space visual sections, including the exact yaw, lean and scale.
 * Small shrubs, banana leaves and all ground plants intentionally stay soft. */
export function plantTrunkSections(object: MapObject): PlantStemSection[] {
  if ((object.kind !== 'tree' && object.kind !== 'palm') || object.scale.y < SOLID_TRUNK_HEIGHT) return [];
  const transform = plantTransform(object);
  if (!hasSolidTrunk(transform.species)) return [];
  const cy = Math.cos(transform.yaw), sy = Math.sin(transform.yaw);
  const ax = Math.sin(transform.leanDirection), az = -Math.cos(transform.leanDirection);
  const c = Math.cos(transform.lean), s = Math.sin(transform.lean);
  const worldPoint = (point: Vec3): Vec3 => {
    const x = (point.x * cy + point.z * sy) * transform.radialScale;
    const y = point.y * transform.heightScale;
    const z = (-point.x * sy + point.z * cy) * transform.radialScale;
    const dot = ax * x + az * z;
    return { x: object.pos.x + x * c - az * y * s + ax * dot * (1 - c),
      y: object.pos.y + y * c + (az * x - ax * z) * s,
      z: object.pos.z + z * c + ax * y * s + az * dot * (1 - c) };
  };
  return plantStemTemplate(transform.species, undefined, transform.variant).map(section => ({
    a: worldPoint(section.a), b: worldPoint(section.b),
    radiusBottom: section.radiusBottom * transform.radialScale, radiusTop: section.radiusTop * transform.radialScale }));
}
