// Shared island plan. North is -Z; terrain, kit placement and navigation
// read the same lots, river banks and routes.
export type Rect = readonly [number, number, number, number];
export type Point = readonly [number, number];
export const FORTE = [4, -99] as const;
export const FAROL = [3, 113] as const;
export const CHURCH = [-10, -40] as const;
export const PLAZA = [-10, -21] as const;
export const MERCADAO = [29, -20] as const;
export const LAKE = [-92, -1, 12] as const; // Cachoeira feeder pool.

// First arrival in each district: a usable approach with a recognisable view,
// rather than a radial sample that can face a wall or the back of a terrace.
export const DISTRICT_ARRIVALS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  forte: [4, -78, 4, -99], vila: [-1, -10, -10, -34], centro: [36, -6, 29, -20],
  morro: [-97, -66, -95, -35], cachoeira: [-83, -13, -109, -9], porto: [111, 17, 100, -8],
  praia: [-36, 95, -30, 109], farol: [0, 84, 3, 113], mangue: [114, 52, 92, 52],
  fazenda: [53, 78, 70, 60], posto: [-25, 37, -22, 47], lagoa: [-65, 9, -94, -2],
};

// Width is the wetted channel width, with another 4 m for each bank.
export const RIVER: readonly (readonly [number, number, number])[] = [
  [-109, -9, 10], [-92, -1, 15], [-70, -1, 7], [-44, 5, 7],
  [-20, 8, 7], [4, 8, 7], [28, 15, 8], [50, 22, 9],
  [78, 31, 12], [104, 35, 18], [138, 39, 26],
];
export function riverSample(x: number, z: number) {
  let distance = Infinity, width = 0, centerX = 0, centerZ = 0;
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, az, aw] = RIVER[i - 1], [bx, bz, bw] = RIVER[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < distance) { distance = d; width = aw + (bw - aw) * t; centerX = px; centerZ = pz; }
  }
  return { distance, width, x: centerX, z: centerZ };
}
export const riverDistance = (x: number, z: number) => {
  const sample = riverSample(x, z);
  return sample.distance - sample.width / 2;
};
export const BRIDGES = [[-40, 5.5], [4, 8], [44, 20.1]] as const;

// Visible low walls and open bunting gates mark the Correria town boundary.
export const ARENA = { minX: -56, maxX: 60, minZ: -58, maxZ: 58 } as const;
export const ARENA_CENTER = { x: 2, z: 0 };
export const inArena = (x: number, z: number, margin = 0) =>
  x >= ARENA.minX + margin && x <= ARENA.maxX - margin && z >= ARENA.minZ + margin && z <= ARENA.maxZ - margin;
export const ROADS: readonly Rect[] = [
  [-101, -64, -94, -26], [-98, -41, -21, -35], [8, -41, 90, -35],
  [-24, -55, 11, -49], [-.5, -88, 6.5, -49], [79, -37, 86, 21],
  [-51, 30, 45, 36], [-33, 33, -27, 89],
  [-30, 75, 71, 81], [57, 39, 63, 77],
  [-50, 97, 39, 103], [-.5, 78, 6.5, 110],
];
export const HILLS: readonly (readonly [number, number, number, number])[] = [
  [-98, -57, 48, 26], [-112, -20, 28, 23], [-67, -79, 31, 12],
  [4, -104, 37, 17], [54, -76, 43, 11], [-73, 65, 40, 12],
  [4, 112, 24, 7], [63, 65, 42, 6],
];
export type HouseRole = 'home' | 'bakery' | 'cafe' | 'workshop' | 'tailor' | 'clinic' | 'fisher' | 'fishmonger' | 'kiosk';
export interface HouseLot {
  x: number; z: number; w: number; d: number; role: HouseRole;
  material: 'stone' | 'wood'; piece: HousePiece; yaw?: number;
}
export type HousePiece = 'house_small' | 'house_medium' | 'house_tall' | 'house_laje' | 'house_laje_b' | 'house_varanda' | 'sobrado';
export const HOUSE_PIECES: readonly HousePiece[] = ['house_small', 'house_medium', 'house_tall', 'house_laje', 'house_laje_b', 'house_varanda', 'sobrado'];
export const isHousePiece = (piece: string): piece is HousePiece => (HOUSE_PIECES as readonly string[]).includes(piece);
/** Two floors with the tall-house stair and rooms. */
export const TWO_STOREY: readonly string[] = ['house_tall', 'sobrado'];
/** Single rooms with the small-house plan (7 x 6). */
export const SMALL_PLAN: readonly string[] = ['house_small', 'house_laje', 'house_laje_b'];
function streetFacing(x: number, z: number) {
  let distance = Infinity, yaw = 0;
  for (const [x0, z0, x1, z1] of ROADS) {
    const horizontal = x1 - x0 > z1 - z0;
    const px = horizontal ? Math.max(x0, Math.min(x1, x)) : (x0 + x1) / 2;
    const pz = horizontal ? (z0 + z1) / 2 : Math.max(z0, Math.min(z1, z));
    const gap = Math.hypot(px - x, pz - z);
    if (gap < distance) { distance = gap; yaw = Math.round(Math.atan2(px - x, pz - z) / (Math.PI / 2)) * Math.PI / 2; }
  }
  return yaw;
}
// Three footprints (small, wide single-storey shop, tall) keep streets from reading as one repeated box.
// Lot footprints (walls plus stairs and verandas) and the walled body alone.
export const HOUSE_SIZE: Record<HousePiece, readonly [number, number]> = {
  house_small: [7, 6], house_medium: [9, 7], house_tall: [8, 7],
  house_laje: [10, 6.8], house_laje_b: [10, 6.8], house_varanda: [9.8, 8.6], sobrado: [8.8, 8.4],
};
export const HOUSE_BODY: Record<HousePiece, readonly [number, number]> = {
  house_small: [7, 6], house_medium: [9, 7], house_tall: [8, 7],
  house_laje: [7, 6], house_laje_b: [7, 6], house_varanda: [9, 7.8], sobrado: [8, 7],
};
const home = (x: number, z: number, role: HouseRole = 'home', size: boolean | 'medium' | HousePiece = false, yaw = streetFacing(x, z)): HouseLot => {
  const piece: HousePiece = typeof size === 'string' && size !== 'medium' ? size : size === 'medium' ? 'house_medium' : size ? 'house_tall' : 'house_small';
  const [width, depth] = HOUSE_SIZE[piece], turned = Math.abs(Math.sin(yaw)) > .5;
  return { x, z, w: turned ? depth : width, d: turned ? width : depth, role, material: 'stone', piece, yaw };
};
export const HOUSES: readonly HouseLot[] = [
  home(-43, -29, 'bakery'), home(-29, -29, 'tailor', 'sobrado'),
  home(-44, -13, 'cafe', 'medium'), home(-28, -9, 'home'), home(10, -13, 'clinic', 'sobrado'),
  home(45, -14, 'workshop', 'sobrado'), home(43, -44, 'home'), home(22, -44, 'home', 'house_laje'),
  home(-44, 20, 'fisher'), home(-25, 22, 'fishmonger'), home(-10, 24, 'home', 'house_laje_b'),
  home(23, 39, 'bakery', 'medium'), home(46, 39, 'cafe'), home(-43, 44, 'workshop', true),
  home(-13, 44, 'kiosk', 'medium'), home(9, 45, 'home', true), home(30, 47, 'tailor'),
  home(87, -13, 'workshop', 'medium'), home(103, 1, 'fisher'), home(87, 16, 'fishmonger'),
  home(47, 60, 'home', 'house_varanda'), home(77, 69, 'home', 'house_varanda'), home(-49, 78, 'home', 'house_varanda'),
  home(-17, 93, 'fisher'), home(-67, 17, 'fisher', 'medium'), home(-73, -15, 'home', 'house_varanda'),
];
export const MORRO_LOTS: readonly HouseLot[] = [
  // The Morro climbs in flat-roofed laje houses: every roof is a terrace reached by its outside stair.
  home(-109, -69, 'home', 'house_laje'), home(-108, -54, 'home', 'house_laje_b'), home(-109, -38, 'home', 'house_laje'),
  home(-86, -68, 'home', true), home(-84, -53, 'home', 'house_laje_b'), home(-84, -23, 'home', 'house_laje'),
  home(-71, -63, 'home', 'house_laje_b'), home(-70, -49, 'home', true), home(-68, -25, 'home', 'house_laje_b'),
  home(-59, -72, 'home', 'house_laje'), home(-58, -54, 'home', 'house_laje'),
];
export const MORRO_COLS = [-109, -85, -70, -58] as const;
export const MORRO_Z = [-74, -20] as const;
export const TOWERS = HOUSES.filter(h => TWO_STOREY.includes(h.piece)).map(h => [h.x, h.z] as const);
export const AREAS: readonly { rect: Rect; margin: number; y: number | null; fixed?: boolean }[] = [
  { rect: [-56, -58, 60, 58], margin: 3, y: 2.2 },
  { rect: [-14, -117, 22, -81], margin: 2, y: 15.5, fixed: true },
  { rect: [76, -33, 116, 18], margin: 3, y: 1.5 },
  { rect: [41, 48, 83, 78], margin: 3, y: 5.4 },
  { rect: [-53, 93, 47, 115], margin: 2, y: .85 },
  { rect: [-4, 106, 10, 119], margin: 1, y: 5.8 },
  { rect: [87, 43, 118, 67], margin: 2, y: .35 },
];

// Shared endpoints are junctions. Cover keeps these routes at least 3 m wide.
export const NAV_ROUTES: readonly (readonly Point[])[] = [
  [[-97, -69], [-97, -38], [-54, -38], [-22, -38], [-22, -52], [4, -52], [4, -62], [4, -80], [4, -87]],
  [[-97, -69], [-76, -78], [-54, -38]],
  [[4, -52], [14, -52], [14, -38], [62, -38], [82, -26], [108, -26], [112, 21], [82, 21], [82, -26]],
  [[-54, -38], [-53, -10], [-40, -5], [-40, 16], [-40, 33], [-22, 33], [4, 33], [44, 33], [60, 40]],
  [[14, -38], [2, -27], [4, -4], [4, 20], [4, 33]],
  [[62, -38], [60, 1], [44, 10], [44, 30]],
  [[-97, -38], [-83, -13], [-64, -11], [-53, -10]],
  [[-82, 15], [-62, 30], [-40, 33]],
  [[-22, 33], [-30, 61], [-30, 78], [-45, 100], [3, 100], [36, 100], [60, 78], [60, 40]],
  [[-30, 78], [3, 78], [60, 78], [80, 54], [102, 54]],
  [[3, 78], [3, 100], [3, 106]],
  [[-30, 61], [-63, 61], [-64, 87], [-45, 100]],
  // Beach traffic joins the graded southern ramp below the fort. A shortcut
  // across the fixed terrace would create an unwalkable cut under its walls.
  [[4, -62], [18, -66], [31, -79], [51, -101], [74, -91], [62, -38]],
];
export function routeDistance(x: number, z: number): number {
  let nearest = Infinity;
  for (const route of NAV_ROUTES) for (let i = 1; i < route.length; i++) {
    const [ax, az] = route[i - 1], [bx, bz] = route[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return nearest;
}
