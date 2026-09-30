import crowns from './vegetation-crowns.json';
import { KIT_PIECES } from './kit-collision';
import { NAV_ROUTES, ROADS } from './layout';
import { walkableHeight } from './navigation';
import type { MapObject, WorldSpec } from './types';
import { SOLID_TRUNK_HEIGHT, SPECIES, type SpeciesId } from './vegetation-species';
import { plantTransform, plantTrunkSections } from './vegetation-trunks';

/**
 * Crowns stay clear of walking height. A walker's eye is 1.62 m above the
 * surface: foliage between the waist and a hand above the head over any path,
 * street, deck or roof terrace fills the camera, however it got there (a low
 * bough, a tree below a hillside path, a palm leaning over a quay). The
 * profiles are baked from the render templates (scripts/generate-crown-profiles.ts)
 * and checked against them by tests/vegetation-crowns.test.ts.
 */
export const WALKER_BAND = [.8, 2.5] as const;
type Ring = readonly [number, number];
const PROFILES = crowns.profiles as unknown as Partial<Record<SpeciesId, Ring[][]>>;

/** Where a crown stands: its axis in the world and its lowest and highest foliage per ring. */
export interface CrownShape { x: number; z: number; base: number; scale: number; rings: readonly Ring[]; tilt: number }

/** The crown of a plant template placed at a root point (trunkless plants: bananas). */
export function crownAt(species: SpeciesId, variant: number, x: number, y: number, z: number, height: number): CrownShape | null {
  const rings = PROFILES[species]?.[variant];
  return rings ? { x, z, base: y, scale: height / SPECIES[species].height, rings, tilt: 0 } : null;
}

/** The crown of an authored tree or palm, its axis at the real (leaning, curving) trunk top. */
export function plantCrown(object: MapObject): CrownShape | null {
  if ((object.kind !== 'tree' && object.kind !== 'palm') || object.scale.y < SOLID_TRUNK_HEIGHT) return null;
  const t = plantTransform(object), rings = PROFILES[t.species]?.[t.variant];
  if (!rings) return null;
  const top = plantTrunkSections(object).at(-1)?.b ?? object.pos;
  // A lean tips the crown: one side of it drops by up to sin(lean) per metre from the axis.
  return { x: top.x, z: top.z, base: object.pos.y, scale: t.heightScale, rings, tilt: Math.sin(t.lean) };
}

/** Horizontal reach of a crown, metres. */
export const crownReach = (crown: CrownShape) => crown.rings.length * crowns.band * crown.scale;

/** World heights [low, high] of the foliage over (x, z), or null outside the crown. */
export function foliageSpan(crown: CrownShape, x: number, z: number): [number, number] | null {
  const distance = Math.hypot(x - crown.x, z - crown.z), ring = Math.floor(distance / (crowns.band * crown.scale));
  if (!(ring >= 0 && ring < crown.rings.length)) return null;
  // A ring's extreme leaf may sit anywhere in its band: its neighbours count as well.
  const near = [crown.rings[Math.max(0, ring - 1)], crown.rings[ring], crown.rings[Math.min(crown.rings.length - 1, ring + 1)]];
  const tilt = crown.tilt * distance;
  return [crown.base + Math.min(...near.map(r => r[0])) * crown.scale - tilt, crown.base + Math.max(...near.map(r => r[1])) * crown.scale + tilt];
}

/** Floors a walker stands on in the open air (not rooms or halls, where nothing grows). */
const OPEN_FLOORS = /^(roof-terrace|wall-walk|gate-walk|deck|balcony|side|turn|landing|foot|platform|veranda|adro|upper-landing$)/;
const CELL = 4;

/** Every walking surface of the island sampled at 1 m: streets and paving, the authored routes
 * (3 m wide), and the open-air floors of the kit (roof terraces, decks, wall walks). */
export class WalkingSurfaces {
  private readonly cells = new Map<number, number[]>();
  constructor(world: WorldSpec) {
    const add = (x: number, z: number, y = walkableHeight(x, z, world)) => {
      const key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL), list = this.cells.get(key);
      if (list) list.push(x, y, z); else this.cells.set(key, [x, y, z]);
    };
    for (const [x0, z0, x1, z1] of ROADS) for (let x = x0 + .5; x < x1; x += 1) for (let z = z0 + .5; z < z1; z += 1) add(x, z);
    for (const route of NAV_ROUTES) for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1], [bx, bz] = route[i], length = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d <= length; d += 1) for (const side of [-1.5, 0, 1.5]) {
        const t = d / length;
        add(ax + (bx - ax) * t - (bz - az) / length * side, az + (bz - az) * t + (bx - ax) / length * side);
      }
    }
    for (const piece of world.pieces ?? []) for (const floor of KIT_PIECES[piece.piece]?.traversal?.floors ?? []) {
      if (!OPEN_FLOORS.test(floor.id)) continue;
      const [u0, v0, u1, v1] = floor.bounds, k = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
      for (let u = u0; u <= u1 + 1e-6; u += Math.max(.25, Math.min(1, (u1 - u0) / 2))) for (let v = v0; v <= v1 + 1e-6; v += Math.max(.25, Math.min(1, (v1 - v0) / 2)))
        add(piece.x + (u * c + v * s) * k, piece.z + (v * c - u * s) * k, piece.y + floor.y * k);
    }
  }

  /** The first surface sample within `reach` of (x, z) that passes the test (samples are 1 m apart). */
  find(x: number, z: number, reach: number, test: (sx: number, sy: number, sz: number) => boolean): { x: number; y: number; z: number } | null {
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++)
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        const list = this.cells.get(cx * 4096 + cz);
        if (list) for (let i = 0; i < list.length; i += 3)
          if (Math.hypot(list[i] - x, list[i + 2] - z) <= reach && test(list[i], list[i + 1], list[i + 2])) return { x: list[i], y: list[i + 1], z: list[i + 2] };
      }
    return null;
  }

  /** A walking surface point (x, y, z) whose walker band the crown's foliage enters, if any. */
  underCrown(crown: CrownShape): { x: number; y: number; z: number } | null {
    return this.find(crown.x, crown.z, crownReach(crown), (x, y, z) => {
      const span = foliageSpan(crown, x, z);
      return !!span && span[0] < y + WALKER_BAND[1] && span[1] > y + WALKER_BAND[0];
    });
  }
}

const cache = new WeakMap<WorldSpec, WalkingSurfaces>();
export function walkingSurfaces(world: WorldSpec) {
  let surfaces = cache.get(world);
  if (!surfaces) { surfaces = new WalkingSurfaces(world); cache.set(world, surfaces); }
  return surfaces;
}
