import { colliderGrid } from './collider-grid';
import { KIT_PIECES } from './kit-collision';
import { isHousePiece, ROADS } from './layout';
import { fbm, terrainColor, terrainHeight, WORLD_PALETTE } from './terrain';
import type { KitPlacement, MapObject, WorldSpec } from './types';
import { plantHash, plantSpecies, SPECIES, type SpeciesId } from './vegetation-species';

/**
 * Decorative planting derived from the world spec: the kit's soft bush pieces, bougainvillea on
 * house walls, garden plants along house walls and ferns under forest trees. None of it has
 * collision (like every plant on the island), so it is placed only where it cannot sit on a
 * road, a doorway, a solid or another piece, and gameplay never sees it.
 */
export interface DressingPlant {
  id: string; species: SpeciesId; variant: number;
  x: number; y: number; z: number; yaw: number;
  /** Height in metres (instance scale = height / species template height). */
  height: number;
  /** Extra scale across the template (vines only: narrow climbers). */
  widthScale?: number;
}

/** Kit pieces that are nothing but foliage: the vegetation layer draws these instead of the kit. */
export const VEGETATION_PIECES: ReadonlySet<string> = new Set(['bush_cluster', 'hedge']);
/** Buildings besides the houses whose outer walls may carry garden beds. */
const GARDEN_BUILDINGS = new Set(['church', 'market_hall']);
/** Kit pieces reviewed as plain walls for bougainvillea drapes. A new piece stays bare until added
 * here, so a kit building that paints its own bougainvillea never gets a second, clashing one. */
export const VINE_WALLS: ReadonlySet<string> = new Set(['house_small', 'house_medium', 'house_tall', 'house_laje', 'house_laje_b',
  'house_varanda', 'sobrado', 'church', 'market_hall']);
/** Pieces whose outermost corner posts may carry a climbing bougainvillea. */
export const POST_CLIMBERS: ReadonlySet<string> = new Set(['beach_kiosk', 'market_stall', 'house_varanda']);
const URBAN = new Set(['vila', 'centro', 'posto', 'morro', 'fazenda', 'praia', 'farol', 'porto']);

interface WallSegment {
  /** Local axis the wall runs along, the sign of its outward normal, and its outer face position. */
  along: 'x' | 'z'; sign: 1 | -1; plane: number;
  from: number; to: number; top: number;
}

const facadeCache = new Map<string, WallSegment[]>();
/** Exterior wall segments of a kit piece, in piece space: thin tall boxes on the outermost plane
 * of each side, raised to the top of any parapet standing on them. Gaps between segments are doors. */
export function facadeSegments(piece: string): WallSegment[] {
  const cached = facadeCache.get(piece);
  if (cached) return cached;
  const boxes = (KIT_PIECES[piece]?.colliders ?? []).flatMap(c => c.type === 'box' && !c.yaw ? [c] : []);
  const walls: WallSegment[] = [];
  for (const b of boxes) {
    const thin = Math.min(b.width, b.depth);
    if (thin > .45 || b.height < 2.2) continue;
    const along = b.width > b.depth ? 'x' : 'z', normalAxis = along === 'x' ? b.z : b.x;
    if (Math.abs(normalAxis) < .5) continue;
    const sign = normalAxis > 0 ? 1 : -1, center = along === 'x' ? b.x : b.z, length = along === 'x' ? b.width : b.depth;
    walls.push({ along, sign, plane: Math.abs(normalAxis) + thin / 2, from: center - length / 2, to: center + length / 2, top: b.y + b.height / 2 });
  }
  const outer = walls.filter(w => w.plane > Math.max(...walls.filter(o => o.along === w.along && o.sign === w.sign).map(o => o.plane)) - .35);
  for (const w of outer) for (const b of boxes) {
    // A parapet on the same face: a thin box starting where this wall ends.
    const along = b.width > b.depth ? 'x' : 'z', normalAxis = along === 'x' ? b.z : b.x;
    if (along !== w.along || Math.sign(normalAxis) !== w.sign || Math.abs(Math.abs(normalAxis) + Math.min(b.width, b.depth) / 2 - w.plane) > .3) continue;
    if (Math.abs(b.y - b.height / 2 - w.top) < .8 && b.y + b.height / 2 > w.top) w.top = b.y + b.height / 2;
  }
  facadeCache.set(piece, outer);
  return outer;
}

const toWorld = (p: KitPlacement, lx: number, lz: number) => {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw), k = p.scale ?? 1;
  return { x: p.x + (lx * c + lz * s) * k, z: p.z + (lz * c - lx * s) * k };
};
/** Yaw that turns template +z toward a local outward normal of the piece. */
const facingYaw = (p: KitPlacement, w: WallSegment) => p.yaw + (w.along === 'x' ? (w.sign > 0 ? 0 : Math.PI) : (w.sign > 0 ? Math.PI / 2 : -Math.PI / 2));

/** The farm's soil strips (authored as thin boxes). */
export const fieldRows = (world: Pick<WorldSpec, 'objects'>) => world.objects.filter(o => o.detail === 'field-row');
/** Authored crop seedlings standing on a field row: the rows are planted in full by the dressing, so these are skipped. */
export function onFieldRow(object: MapObject, rows: MapObject[]) {
  return object.detail === 'crop' && rows.some(r => Math.abs(object.pos.x - r.pos.x) < r.scale.x / 2 + .05 && Math.abs(object.pos.z - r.pos.z) < r.scale.z / 2 + .05);
}

export function vegetationDressing(world: WorldSpec): DressingPlant[] {
  const out: DressingPlant[] = [], grid = colliderGrid(world), pieces = world.pieces ?? [];
  const hash = (id: string, salt: number) => { let h = salt * 2654435761; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return plantHash(h >>> 0, salt); };
  const district = (x: number, z: number) => world.districts.find(d => Math.hypot(x - d.x, z - d.z) < d.radius)?.id;
  const entrances = pieces.flatMap(p => (KIT_PIECES[p.piece]?.traversal?.entrances ?? []).filter(e => !e.platform).map(e => {
    const w = toWorld(p, e.point[0], e.point[2]), d = toWorld(p, e.point[0], e.point[2] + Math.sign(e.point[2] || 1) * 3.5);
    return { x: w.x, z: w.z, dx: d.x - w.x, dz: d.z - w.z };
  }));
  const paved = world.objects.filter(o => o.detail === 'courtyard' || o.detail === 'floor' || o.detail === 'prop:plaza' || o.detail === 'path' || o.detail?.startsWith('prop:street'));
  // Soft pieces and planting beds have no colliders; plants must not grow through them either.
  const footprints = pieces.filter(p => !isHousePiece(p.piece) && !GARDEN_BUILDINGS.has(p.piece)).map(p => {
    const [w, d] = KIT_PIECES[p.piece]?.footprint ?? [0, 0], k = p.scale ?? 1;
    return { p, hw: w * k / 2, hd: d * k / 2 };
  });
  // Footprints and doorways bucketed by 16 m cell: placement tests only their neighbours.
  const BUCKET = 16, bucketKey = (x: number, z: number) => `${Math.floor(x / BUCKET)}:${Math.floor(z / BUCKET)}`;
  const bucketed = <T,>(items: T[], at: (item: T) => { x: number; z: number; r: number }) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const { x, z, r } = at(item);
      for (let bx = Math.floor((x - r) / BUCKET); bx <= Math.floor((x + r) / BUCKET); bx++) for (let bz = Math.floor((z - r) / BUCKET); bz <= Math.floor((z + r) / BUCKET); bz++) {
        const key = `${bx}:${bz}`, list = map.get(key);
        if (list) list.push(item); else map.set(key, [item]);
      }
    }
    return (x: number, z: number) => map.get(bucketKey(x, z)) ?? [];
  };
  const footprintsNear = bucketed(footprints, f => ({ x: f.p.x, z: f.p.z, r: Math.hypot(f.hw, f.hd) + 3 }));
  const entrancesNear = bucketed(entrances, e => ({ x: e.x + e.dx / 2, z: e.z + e.dz / 2, r: Math.hypot(e.dx, e.dz) / 2 + 4 }));
  const insideFootprint = (x: number, z: number, margin: number, ignore?: KitPlacement) => footprintsNear(x, z).some(({ p, hw, hd }) => {
    if (p === ignore) return false;
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return Math.abs(dx * c - dz * s) < hw + margin && Math.abs(dx * s + dz * c) < hd + margin;
  });
  /** Can a soft plant of this radius and height stand here? */
  const free = (x: number, z: number, radius: number, height: number, ignore?: KitPlacement) => {
    const y = terrainHeight(x, z);
    if (y < .35 || Math.abs(terrainHeight(x + .8, z) - terrainHeight(x - .8, z)) > .7 || Math.abs(terrainHeight(x, z + .8) - terrainHeight(x, z - .8)) > .7) return false;
    if (ROADS.some(([x0, z0, x1, z1]) => x > x0 - radius - .6 && x < x1 + radius + .6 && z > z0 - radius - .6 && z < z1 + radius + .6)) return false;
    if (paved.some(o => Math.abs(x - o.pos.x) < o.scale.x / 2 + radius + .3 && Math.abs(z - o.pos.z) < o.scale.z / 2 + radius + .3)) return false;
    for (const e of entrancesNear(x, z)) {
      // A doorway keeps a clear apron and the walk leading away from it.
      const t = Math.max(0, Math.min(1, ((x - e.x) * e.dx + (z - e.z) * e.dz) / (e.dx * e.dx + e.dz * e.dz)));
      if (Math.hypot(x - e.x - e.dx * t, z - e.z - e.dz * t) < 1.35 + radius * .5) return false;
    }
    // Round plants against box solids: distance to the box, not box overlap (rotated walls come as strips).
    if (grid.query(x - radius, z - radius, x + radius, z + radius).some(c => c.max.y > y + .15 && c.min.y < y + height &&
      Math.hypot(Math.max(c.min.x - x, 0, x - c.max.x), Math.max(c.min.z - z, 0, z - c.max.z)) < radius)) return false;
    return !insideFootprint(x, z, radius * .6, ignore);
  };
  /** Samples the slab in front of a wall face (rotated with it) against every solid. */
  const blockedInFront = (x: number, z: number, yaw: number, halfWidth: number, bottom: number, top: number, own?: KitPlacement) => {
    const nx = Math.sin(yaw), nz = Math.cos(yaw), tx = Math.cos(yaw), tz = -Math.sin(yaw), reach = halfWidth + .5;
    const near = grid.query(x - reach, z - reach, x + reach, z + reach).filter(c => c.max.y > bottom && c.min.y < top);
    for (const a of [-1, -.5, 0, .5, 1]) for (const o of [.12, .3, .45]) {
      const px = x + tx * a * halfWidth + nx * o, pz = z + tz * a * halfWidth + nz * o;
      if (near.some(c => px > c.min.x && px < c.max.x && pz > c.min.z && pz < c.max.z)) return true;
      if (insideFootprint(px, pz, 0, own)) return true;
    }
    return false;
  };
  const add = (id: string, species: SpeciesId, variant: number, x: number, z: number, yaw: number, height: number, y = terrainHeight(x, z) - .04, widthScale?: number) =>
    out.push({ id, species, variant: Math.min(SPECIES[species].variants - 1, variant), x, y, z, yaw, height, ...(widthScale ? { widthScale } : {}) });

  // 1. The kit's bush clusters and hedges, redrawn as painted shrubs at the same place and size.
  const houses = pieces.filter(p => isHousePiece(p.piece) || GARDEN_BUILDINGS.has(p.piece));
  for (const p of pieces) {
    if (!VEGETATION_PIECES.has(p.piece)) continue;
    const near = houses.some(h => Math.hypot(h.x - p.x, h.z - p.z) < 14) || URBAN.has(district(p.x, p.z) ?? '');
    const roll = hash(p.id, 3);
    const species: SpeciesId = p.piece === 'hedge' ? 'hedge' : 'thicket';
    // Wild undergrowth stays green; beside houses, the patches flower.
    const variant = species === 'hedge' ? (roll < .5 ? 0 : 1) : near ? (roll < .3 ? 1 : roll < .62 ? 2 : roll < .85 ? 3 : 0) : (roll < .82 ? 0 : 1);
    add(p.id, species, variant, p.x, p.z, p.yaw, SPECIES[species].height * (p.scale ?? 1), p.y);
  }

  // 1b. The kit's planters and flower beds get real plants over their painted mounds.
  for (const p of pieces) {
    if (p.piece !== 'planter' && p.piece !== 'flower_bed') continue;
    const species: SpeciesId = p.piece === 'planter' ? 'pot' : 'bed';
    add(`${p.id}:planting`, species, Math.floor(hash(p.id, 5) * 4), p.x, p.z, p.yaw, SPECIES[species].height * (p.scale ?? 1), p.y);
  }

  // 2. Bougainvillea over house walls: drapes spilling from the eaves and parapets, and climbers
  // rising from a bush at a corner of the lower houses. Doors stay clear (drapes never cross a gap).
  const STYLE_HALF_WIDTH = [1.1, .85, 1.0, 1.3];
  for (const house of houses) {
    const walls = facadeSegments(house.piece), k = house.scale ?? 1;
    if (!VINE_WALLS.has(house.piece) || !walls.length || hash(house.id, 7) < .1) continue;
    let placed = 0;
    const budget = 2 + Math.floor(hash(house.id, 8) * 3);
    walls.forEach((w, wi) => {
      // Corners are the segment ends on the outline of the facade (not the jambs of a door).
      const facade = walls.filter(o => o.along === w.along && o.sign === w.sign);
      const low = Math.min(...facade.map(o => o.from)), high = Math.max(...facade.map(o => o.to));
      const spots: ('from' | 'to' | 'mid')[] = [];
      if (Math.abs(w.from - low) < .3) spots.push('from');
      if (Math.abs(w.to - high) < .3) spots.push('to');
      if (w.to - w.from > 5.5) spots.push('mid');
      spots.forEach((spot, si) => {
        const salt = 20 + wi * 7 + si;
        if (placed >= budget || hash(house.id, salt) < .4) return;
        const climber = spot !== 'mid' && w.top < 4.6 && hash(house.id, salt + 1) < .4;
        const drop = (climber ? w.top - .12 : Math.min(w.top - 1.1, 1.5 + hash(house.id, salt + 2) * 1.2)) * k;
        if (drop < 1) return;
        const roll = hash(house.id, salt + 3), variant = climber ? (roll < .6 ? 1 : 0) : roll < .45 ? 0 : roll < .65 ? 1 : roll < .82 ? 2 : 3;
        // Beside a door the drapes stay narrow, framing the windows instead of curtaining them.
        const widthScale = climber ? .6 : facade.length > 1 ? .66 : 1, halfWidth = STYLE_HALF_WIDTH[variant] * drop / 2 * widthScale;
        const along = spot === 'from' ? w.from + halfWidth / k + .08 : spot === 'to' ? w.to - halfWidth / k - .08 : (w.from + w.to) / 2;
        if (along - halfWidth / k < w.from - .05 || along + halfWidth / k > w.to + .05) return;
        const lx = w.along === 'x' ? along : w.sign * (w.plane + .05), lz = w.along === 'x' ? w.sign * (w.plane + .05) : along;
        const at = toWorld(house, lx, lz), yaw = facingYaw(house, w), top = house.y + w.top * k - .06;
        // Nothing may stand in front of the drape: stairs, balconies, awnings, a neighbour's wall.
        if (blockedInFront(at.x, at.z, yaw, halfWidth, top - drop + .15, top - .05)) return;
        add(`${house.id}:vine:${wi}:${si}`, 'vine', variant, at.x, at.z, yaw, drop, top, widthScale);
        placed++;
        if (climber) {
          // The climber's own bush at its foot.
          const bx = at.x + Math.sin(yaw) * .55, bz = at.z + Math.cos(yaw) * .55;
          if (free(bx, bz, .5, 1.4, house)) add(`${house.id}:vine-foot:${wi}:${si}`, 'bougainvillea', Math.floor(roll * 2), bx, bz, yaw, 1.3 + roll * .4);
        }
      });
    });
  }

  // 2b. Bougainvillea climbing the corner posts of pergola-like pieces (beach kiosks, market stalls,
  // veranda porches) and spilling along their beams, on the side faces so fronts stay open.
  for (const p of pieces) {
    if (!POST_CLIMBERS.has(p.piece)) continue;
    const def = KIT_PIECES[p.piece], k = p.scale ?? 1;
    const posts = def.colliders.flatMap(c => c.type === 'box' && c.width <= .3 && c.depth <= .3 && c.height >= 2.4 ? [c] : []);
    if (!posts.length) continue;
    const outer = Math.max(...posts.map(c => Math.abs(c.x)));
    posts.filter(c => Math.abs(c.x) > outer - .1).forEach((c, i) => {
      if (hash(p.id, 90 + i) < .55) return;
      const side = c.x > 0 ? 1 : -1, lx = c.x + side * (c.width / 2 + .04);
      const at = toWorld(p, lx, c.z), yaw = p.yaw + side * Math.PI / 2;
      const top = p.y + (c.y + c.height / 2) * k - .05, drop = (c.height - .4) * k, variant = hash(p.id, 100 + i) < .6 ? 0 : 1;
      const halfWidth = STYLE_HALF_WIDTH[variant] * drop / 2 * .42;
      if (blockedInFront(at.x, at.z, yaw, halfWidth, top - drop + .15, top - .05, p)) return;
      add(`${p.id}:post-vine:${i}`, 'vine', variant, at.x, at.z, yaw, drop, top, .42);
      const bx = at.x + Math.sin(yaw) * .5, bz = at.z + Math.cos(yaw) * .5;
      if (free(bx, bz, .45, 1.4, p)) add(`${p.id}:post-foot:${i}`, 'bougainvillea', variant, bx, bz, yaw, 1.2 + hash(p.id, 110 + i) * .3);
    });
  }

  // 3. Garden plants in beds along the walls: bananas at the back corners, flowers beside the doors.
  const BEDS: [SpeciesId, number, number][] = [['heliconia', 1.8, .7], ['croton', 1.1, .55], ['hibiscus', 1.6, .8], ['strelitzia', 1.5, .65],
    ['monstera', 1.1, .8], ['bromeliad', .6, .4], ['taro', 1.2, .7], ['bougainvillea', 1.5, .8]];
  for (const house of houses) {
    const walls = facadeSegments(house.piece), k = house.scale ?? 1;
    let placed = 0;
    const budget = 3 + Math.floor(hash(house.id, 11) * 4);
    walls.forEach((w, wi) => {
      const length = w.to - w.from, n = Math.max(1, Math.floor(length / 2.2));
      for (let i = 0; i < n && placed < budget; i++) {
        const salt = 100 + wi * 13 + i;
        if (hash(house.id, salt) < .35) continue;
        const along = w.from + (i + .5) / n * length + (hash(house.id, salt + 1) - .5) * .6;
        const corner = Math.min(along - w.from, w.to - along) < 1.4;
        const banana = corner && hash(house.id, salt + 2) < .35;
        const [species, height, radius] = banana ? ['banana', 3.6 + hash(house.id, salt + 3) * 1.4, 1.3] as const : BEDS[Math.floor(hash(house.id, salt + 4) * BEDS.length)];
        const offset = w.plane + radius * .9 + .15;
        const lx = w.along === 'x' ? along : w.sign * offset, lz = w.along === 'x' ? w.sign * offset : along;
        const at = toWorld(house, lx, lz);
        if (!free(at.x, at.z, radius * k * (banana ? .5 : .8), Math.min(height, 2), house)) continue;
        add(`${house.id}:bed:${wi}:${i}`, species, Math.floor(hash(house.id, salt + 5) * 4), at.x, at.z, hash(house.id, salt + 6) * Math.PI * 2, height * (.9 + hash(house.id, salt + 7) * .2));
        placed++;
      }
    });
  }

  // 4. Forest floor: ferns, taioba, costela-de-adão and bromeliads around the feet of the broad trees.
  const FLOOR: [SpeciesId, number][] = [['fern', .55], ['taro', .17], ['monstera', .16], ['bromeliad', .12]];
  for (const tree of world.objects) {
    if (tree.kind !== 'tree' || tree.scale.y < 4) continue;
    const species = plantSpecies(tree);
    if (species !== 'jungle' && species !== 'mango' && species !== 'almond') continue;
    const id = `${Math.round(tree.pos.x * 10)}:${Math.round(tree.pos.z * 10)}`;
    if (URBAN.has(district(tree.pos.x, tree.pos.z) ?? '') && hash(id, 1) < .6) continue;
    const count = Math.floor(hash(id, 2) * 3.2);
    for (let i = 0; i < count; i++) {
      const a = hash(id, 10 + i) * Math.PI * 2, r = 1.1 + hash(id, 20 + i) * 1.8;
      const x = tree.pos.x + Math.cos(a) * r, z = tree.pos.z + Math.sin(a) * r;
      let roll = hash(id, 30 + i), pick: SpeciesId = 'fern';
      for (const [s, wgt] of FLOOR) { if (roll < wgt) { pick = s; break; } roll -= wgt; }
      if (!free(x, z, .5, 1)) continue;
      add(`${id}:floor:${i}`, pick, Math.floor(hash(id, 40 + i) * 3), x, z, hash(id, 50 + i) * Math.PI * 2, SPECIES[pick].height * (.75 + hash(id, 60 + i) * .5));
    }
  }
  // 5. Farm plots: the field-row strips carry full rows of mandioca instead of a few seedlings.
  for (const row of fieldRows(world)) {
    const alongZ = row.scale.z > row.scale.x, length = Math.max(row.scale.x, row.scale.z);
    for (let i = 0, n = Math.floor(length / .8); i < n; i++) {
      const id = `${row.id}:crop:${i}`, along = -length / 2 + (i + .5) * length / n + (hash(id, 1) - .5) * .2;
      const x = row.pos.x + (alongZ ? (hash(id, 2) - .5) * .16 : along), z = row.pos.z + (alongZ ? along : (hash(id, 2) - .5) * .16);
      // A road or path laid across a plot interrupts the row.
      if (!free(x, z, .2, 1)) continue;
      add(id, 'crop', Math.floor(hash(id, 3) * 2), x, z, hash(id, 4) * Math.PI * 2, .72 + hash(id, 5) * .3);
    }
  }

  // 6. Meadow patches break up the open fields: wild grass and flowers in drifts, never tall enough
  // to hide anyone, kept off roads, paving, doorways and solids like every other planting.
  const step = 5.5, half = world.size / 2;
  for (let gz = -half; gz < half; gz += step) for (let gx = -half; gx < half; gx += step) {
    const id = `meadow:${Math.round(gx)}:${Math.round(gz)}`;
    const x = gx + hash(id, 1) * step, z = gz + hash(id, 2) * step, y = terrainHeight(x, z);
    if (y < .9 || fbm(x / 26 + 17, z / 26 - 11) < .12 || hash(id, 3) > .6) continue;
    const slope = Math.max(Math.abs(terrainHeight(x + 1, z) - y), Math.abs(terrainHeight(x, z + 1) - y));
    const paint = terrainColor(x, z, y, slope);
    if (paint !== WORLD_PALETTE.grass && paint !== WORLD_PALETTE.grassLight && paint !== WORLD_PALETTE.dryGrass) continue;
    if (!free(x, z, 1.6, .7)) continue;
    const variant = hash(id, 4) < .5 ? 0 : 1;
    add(id, 'meadow', variant, x, z, hash(id, 5) * Math.PI * 2, SPECIES.meadow.height * (.8 + hash(id, 6) * .2), y - .02);
  }
  return out;
}
