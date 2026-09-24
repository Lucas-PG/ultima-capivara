// The island plan: the legacy (v1) terrain and district layout, filled with
// v2's detailed buildings. terrain.ts levels the ground under every lot and
// world.ts builds on the same lots, so both read from here.

export type Rect = readonly [number, number, number, number]; // x0, z0, x1, z1

// Asphalt roads (legacy): a north–south highway and east–west branches.
export const ROADS: readonly Rect[] = [
  [-112, 41.5, 30, 48.5],
  [16.5, -112, 23.5, 110],
  [20, -38.5, 104, -31.5],
  [-100, -43.5, 20, -36.5],
  [23.5, 66, 70, 72],
];

// [x, z, radius, height] cosine hills, and the Lagoa pond [x, z, radius].
export const HILLS: readonly (readonly [number, number, number, number])[] = [
  [-5, 92, 40, 16], [100, -30, 34, 13], [-32, -112, 30, 10], [-120, 20, 26, 8], [-62, -12, 22, 5], [108, 70, 24, 7],
];
export const LAKE = [-34, 6, 14] as const;

// Correria is played on the west half: Porto, Posto, Lagoa and the Vila.
export const ARENA = { minX: -108, maxX: 8, minZ: -110, maxZ: 62 } as const;
export const ARENA_CENTER = { x: (ARENA.minX + ARENA.maxX) / 2, z: (ARENA.minZ + ARENA.maxZ) / 2 };
export const inArena = (x: number, z: number, margin = 0) =>
  x >= ARENA.minX + margin && x <= ARENA.maxX - margin && z >= ARENA.minZ + margin && z <= ARENA.maxZ - margin;

export type HouseRole = 'home' | 'bakery' | 'cafe' | 'workshop' | 'tailor' | 'clinic' | 'fisher' | 'fishmonger' | 'kiosk';
export interface HouseLot { x: number; z: number; w: number; d: number; role: HouseRole; material: 'stone' | 'wood' }

// Lots that get their own levelled pad (the big districts have area pads below).
export const HOUSES: readonly HouseLot[] = [
  // Vila: two rows along the west road, like legacy.
  { x: -95, z: 34, w: 9, d: 7, role: 'home', material: 'stone' },
  { x: -77, z: 34, w: 9, d: 8, role: 'bakery', material: 'stone' },
  { x: -59, z: 34, w: 8, d: 7, role: 'cafe', material: 'stone' },
  { x: -41, z: 34, w: 10, d: 8, role: 'home', material: 'stone' },
  { x: -15, z: 34, w: 8, d: 7, role: 'workshop', material: 'stone' },
  { x: -86, z: 56, w: 8, d: 7, role: 'tailor', material: 'stone' },
  { x: -68, z: 56, w: 8, d: 7, role: 'clinic', material: 'stone' },
  { x: -50, z: 56, w: 9, d: 7, role: 'home', material: 'stone' },
  // Scattered farmhouses and shacks.
  { x: 88, z: 94, w: 9, d: 7, role: 'home', material: 'stone' },
  { x: 2, z: 4, w: 9, d: 7, role: 'home', material: 'stone' },
  { x: 2, z: -100, w: 8, d: 7, role: 'fisher', material: 'wood' },
  { x: 100, z: 4, w: 9, d: 7, role: 'home', material: 'stone' },
  { x: -106, z: -4, w: 9, d: 7, role: 'home', material: 'stone' },
  { x: 34, z: 96, w: 9, d: 7, role: 'home', material: 'wood' },
  { x: 96, z: -92, w: 9, d: 7, role: 'home', material: 'wood' },
  { x: 80, z: -104, w: 8, d: 7, role: 'home', material: 'wood' },
  { x: 112, z: -104, w: 8, d: 7, role: 'fisher', material: 'wood' },
  { x: -100, z: 88, w: 9, d: 7, role: 'home', material: 'wood' },
  { x: -84, z: 102, w: 9, d: 7, role: 'home', material: 'wood' },
  { x: 108, z: -33, w: 8, d: 7, role: 'home', material: 'stone' },   // Cachoeira lookout
  { x: 93, z: 72, w: 7, d: 6, role: 'fisher', material: 'wood' },    // Farol keeper
  { x: -113, z: -52, w: 9, d: 7, role: 'fisher', material: 'wood' }, // Mangue shack
];

// Centro towers (two storeys with an outside stair) and the Vila church.
export const TOWERS: readonly (readonly [number, number])[] = [[42, -20], [64, -50], [38, -54], [70, -20], [51, -54], [80, -50], [84, -20]];
// Landmarks worth dropping on: the Mercadão (covered market full of loot) in
// the Centro, a stone Forte on the north headland, and a striped Farol.
export const MERCADAO = [56, -21] as const;
export const FORTE = [-28, -108] as const;
export const FAROL = [110, 70] as const;
export const CHURCH = [2, 58] as const;
export const PLAZA = [-30, 55] as const;

// Morro: terraced casinhas, each on its own little shelf (legacy grid).
function lotHash(i: number, j: number) {
  let h = Math.imul(i + 71, 374761393) ^ Math.imul(j + 13, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// Each column of casinhas shares one north–south shelf, so front and back
// doors open onto flat ground; the hill steps up between columns (side walls,
// windows only). Shelf edges sit on odd metres, between terrain samples.
export const MORRO_COLS = [-33, -25, -17, -9, -1, 7] as const;
export const MORRO_Z = [66, 118] as const;
export const MORRO_LOTS: readonly { x: number; z: number }[] = (() => {
  const lots: { x: number; z: number }[] = [];
  MORRO_COLS.forEach((x, i) => [74, 82, 90, 98, 106, 114].forEach((z, j) => {
    if (lotHash(i, j) < .3) return;
    lots.push({ x: x + (lotHash(j, i) - .5) * .5, z: z + (lotHash(i + 9, j + 5) - .5) * 1.2 });
  }));
  return lots;
})();

// Area pads: [rect, blend margin, fixed height or null for the natural height].
export const AREAS: readonly { rect: Rect; margin: number; y: number | null }[] = [
  { rect: [-108, -112, -36, -26], margin: 2, y: 1.4 },   // Porto, down by the water
  { rect: [44, 48, 80, 86], margin: 2, y: null },        // Fazenda
  { rect: [26, -64, 92, -8], margin: 3, y: null },       // Centro (city blocks + Mercadão)
  { rect: [-42, -122, -14, -94], margin: 3, y: null },   // Forte
  { rect: [102, 62, 118, 78], margin: 3, y: null },      // Farol
  { rect: [-26, -36, 6, -9], margin: 3, y: null },       // Posto
  { rect: [-40, 46, -20, 64], margin: 3, y: null },      // Vila plaza
  { rect: [-4, 52, 8, 64], margin: 3, y: null },         // Vila church
  { rect: [24, -125, 74, -104], margin: 2, y: .8 },      // Praia sand
  { rect: [-125, -100, -106, -60], margin: 1, y: -.35 }, // Mangue shallows
];
