// Shared island plan. North is -Z; terrain, kit placement, navigation,
// vegetation and the map all read the same lots, river banks and routes.
export type Rect = readonly [number, number, number, number];
export type Point = readonly [number, number];
export const FORTE = [4, -99] as const;
export const FAROL = [-6, 115] as const;
// Igreja Matriz: fronts Rua Direita and the praça that runs down to the river.
export const CHURCH = [-8, -46] as const;
export const PLAZA = [-8, -19] as const;
export const PLAZA_RECT: Rect = [-21, -31, 5, -1];
// The covered market stands on its own largo, with the feira between it and the quay.
export const MERCADAO = [31, -22] as const;
export const MARKET_RECT: Rect = [21, -31, 44, 12];
export const LAKE = [-92, -1, 12] as const; // Cachoeira feeder pool.
export const CAMPINHO = [88, -60] as const; // Neighbourhood football pitch, north-east field.
export const ENGENHO = [-84, 16] as const; // The sugar mill hall on the upper river's south bank.
/** The mill's water wheel stands in the river edge below the hall. */
export const WATER_WHEEL = [-82, 5.2] as const;
export const CAPELA = [-76, 66] as const; // Hilltop chapel above the south-west woods.
/** The Capela's stone stair: one straight flight on the chapel's axis, from
 * the foot of the hill (x) up the east face to the adro at 14 m. Its treads
 * match the escadaria kit piece (tools/blender/kit/capela.py); the ground
 * under the flight is cut to it. */
export const CAPELA_STAIR = { x: -52, z: 66, yaw: Math.PI / 2, foot: 2.6, risers: 40, rise: .285, run: .5, halfWidth: 2.3 } as const;
export const ROSARIO = [-21, 26] as const; // Largo do Rosário, south bank square.
/** Lagoa da Maré: the tidal lagoon of the south-east palafitas, wading deep and open to the sea. */
export const MARE = { x: 96, z: 97, rx: 17, rz: 12, bed: -.8 } as const;
/** The village shore where the boardwalk starts, level with the stilt decks. */
export const MARE_SHORE: Rect = [76, 76, 96, 86];
export const ROSARIO_RECT: Rect = [-30, 17, -12, 33];
// Harbour basin: a straight stone quay on its north side, mangrove on the south.
export const BAY: Rect = [94, -3, 150, 31];
export const PORTO_QUAY_Z = -3;
/** The walled stretch of the harbour's north side: three 8 m quay slots. */
export const PORTO_QUAY_X = [99, 123] as const;

// First arrival in each district: a usable approach with a recognisable view,
// rather than a radial sample that can face a wall or the back of a terrace.
export const DISTRICT_ARRIVALS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  forte: [4, -78, 4, -99], vila: [-8, -8, -8, -40], mercado: [42, -7, 31, -22],
  morro: [-97, -66, -95, -35], cachoeira: [-83, -13, -109, -9], porto: [83, -8, 107, 12],
  praia: [-36, 95, -30, 109], farol: [-6, 76, -6, 115], mangue: [96, 40, 112, 50],
  fazenda: [53, 78, 70, 60], rosario: [-21, 36, -21, 20], engenho: [-60, 35.5, -104, 35.5],
  campinho: [74, -48, 88, -60], capela: [-37.5, 66, -76, 66], palafitas: [84, 82, 96, 97],
};
export interface DistrictPlan { id: string; name: string; x: number; z: number; radius: number; color: string }
export const DISTRICTS: readonly DistrictPlan[] = [
  { id: 'forte', name: 'Forte', x: 4, z: -99, radius: 25, color: '#c47c57' },
  { id: 'vila', name: 'Vila', x: -8, z: -22, radius: 30, color: '#e39973' },
  { id: 'mercado', name: 'Mercado', x: 31, z: -14, radius: 22, color: '#c59aaa' },
  { id: 'morro', name: 'Morro', x: -87, z: -53, radius: 29, color: '#c88465' },
  { id: 'cachoeira', name: 'Cachoeira', x: -102, z: -6, radius: 18, color: '#7db7bd' },
  { id: 'porto', name: 'Porto', x: 100, z: -18, radius: 24, color: '#638caf' },
  { id: 'praia', name: 'Praia', x: -28, z: 104, radius: 28, color: '#e9c47d' },
  { id: 'farol', name: 'Farol', x: -5, z: 104, radius: 20, color: '#d86c53' },
  { id: 'mangue', name: 'Mangue', x: 110, z: 48, radius: 20, color: '#617c56' },
  { id: 'fazenda', name: 'Fazenda', x: 62, z: 64, radius: 24, color: '#d7b671' },
  { id: 'rosario', name: 'Rosário', x: -21, z: 36, radius: 18, color: '#e6a34f' },
  { id: 'engenho', name: 'Engenho', x: -84, z: 24, radius: 20, color: '#b98a5e' },
  { id: 'campinho', name: 'Campinho', x: CAMPINHO[0], z: CAMPINHO[1], radius: 20, color: '#8fb35a' },
  { id: 'capela', name: 'Capela', x: -64, z: 66, radius: 22, color: '#a9b98a' },
  { id: 'palafitas', name: 'Palafitas', x: 92, z: 93, radius: 17, color: '#5fa8b0' },
];

// Width is the wetted channel width. Inside town the river runs between stone
// quays (QUAY_X); elsewhere its banks are natural, another 4 m each side.
// Through town it is a canalised river of straight reaches: each of the three
// town bridges crosses a reach running due east, so decks meet the quays square.
// It then turns south-east under the market and out into the harbour basin.
export const RIVER: readonly (readonly [number, number, number])[] = [
  [-109, -9, 10], [-92, -1, 15], [-76, 2, 8], [-62, 3, 13], [-55, 7.5, 11], [-47, 10.5, 9],
  [-33, 11, 9], [-17, 8, 8], [1, 8, 8], [15, 10, 9], [29, 16, 10],
  [43, 16, 10], [60, 22, 11], [74, 23, 12], [88, 20, 15], [102, 15, 20],
];
/** The town reach of the river is walled on both banks between these x limits. */
export const QUAY_X = [-55, 60] as const;
/** Walled stretches of each bank (north -1, south +1). The south bank opens onto
 * a small river beach below the Largo do Rosário, where the town swims. */
export const QUAYS: Readonly<Record<-1 | 1, readonly (readonly [number, number])[]>> = {
  [-1]: [[-55, 60]],
  [1]: [[-55, -34], [-12, 60]],
};
export function riverSample(x: number, z: number) {
  let distance = Infinity, width = 0, centerX = 0, centerZ = 0, dirX = 1, dirZ = 0;
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, az, aw] = RIVER[i - 1], [bx, bz, bw] = RIVER[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < distance) {
      const length = Math.hypot(dx, dz);
      distance = d; width = aw + (bw - aw) * t; centerX = px; centerZ = pz; dirX = dx / length; dirZ = dz / length;
    }
  }
  return { distance, width, x: centerX, z: centerZ, dirX, dirZ };
}
export const riverDistance = (x: number, z: number) => {
  const sample = riverSample(x, z);
  return sample.distance - sample.width / 2;
};
/** Centre of the channel at a given x along the town reach (the river runs west to east there). */
export function riverAtX(x: number) {
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, az, aw] = RIVER[i - 1], [bx, bz, bw] = RIVER[i];
    if (x >= ax && x <= bx) { const t = (x - ax) / (bx - ax); return { z: az + (bz - az) * t, width: aw + (bw - aw) * t }; }
  }
  const last = RIVER[RIVER.length - 1];
  return { z: last[1], width: last[2] };
}
/** Quay walls: the water face stands this far beyond the wetted channel, and the stone is this deep. */
export const QUAY_FACE = .5, QUAY_DEPTH = 5;
export interface QuayPoint { x: number; z: number }
// The water face of each bank is the river polyline offset by its half width
// plus the face gap, joined at mitres: straight wall runs between the bends.
function quayPolyline(side: -1 | 1): QuayPoint[] {
  const normal = (a: readonly number[], b: readonly number[]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    return { x: -dz / length * side, z: dx / length * side };
  };
  return RIVER.map(([x, z, width], i) => {
    const before = normal(RIVER[Math.max(0, i - 1)], RIVER[Math.max(1, i)]);
    const after = normal(RIVER[Math.min(RIVER.length - 2, i)], RIVER[Math.min(RIVER.length - 1, i + 1)]);
    const bisector = { x: before.x + after.x, z: before.z + after.z }, length = Math.hypot(bisector.x, bisector.z);
    const mitre = (width / 2 + QUAY_FACE) / Math.sqrt((1 + before.x * after.x + before.z * after.z) / 2);
    return { x: x + bisector.x / length * mitre, z: z + bisector.z / length * mitre };
  });
}
export const QUAY_FACES: Readonly<Record<-1 | 1, readonly QuayPoint[]>> = { [-1]: quayPolyline(-1), [1]: quayPolyline(1) };
/** Point and unit tangent of one bank's water face where it passes x. */
export function quayFaceAt(x: number, side: -1 | 1) {
  const face = QUAY_FACES[side];
  for (let i = 1; i < face.length; i++) {
    const a = face[i - 1], b = face[i];
    if (x < a.x || x > b.x) continue;
    const t = (x - a.x) / (b.x - a.x), length = Math.hypot(b.x - a.x, b.z - a.z);
    return { x, z: a.z + (b.z - a.z) * t, dirX: (b.x - a.x) / length, dirZ: (b.z - a.z) / length, segment: i };
  }
  const last = face[face.length - 1];
  return { x, z: last.z, dirX: 1, dirZ: 0, segment: face.length - 1 };
}
/** Quay wall line (the water face) on one bank at x: side -1 north, +1 south. */
export const quayLine = (x: number, side: -1 | 1) => quayFaceAt(x, side).z;
/** Landward edge of the quay stones at x: buildings stand behind this line. */
export const quayBack = (x: number, side: -1 | 1) => { const face = quayFaceAt(x, side); return face.z + side * QUAY_DEPTH / Math.max(.5, face.dirX); };
export type BridgeKind = 'bridge_arch' | 'bridge_chapel' | 'bridge_wood';
export interface BridgePlan { x: number; z: number; kind: BridgeKind; yaw: number }
// Three different crossings in town, each continuing a street on both banks,
// plus the timber trestle that carries the coast road over the river mouth.
export const BRIDGE_PLANS: readonly BridgePlan[] = [
  { x: -41.5, ...riverCrossing(-41.5), kind: 'bridge_chapel' },
  { x: -8, ...riverCrossing(-8), kind: 'bridge_arch' },
  { x: 36, ...riverCrossing(36), kind: 'bridge_wood' },
  { x: 81, ...riverCrossing(81), kind: 'bridge_wood' },
];
function riverCrossing(x: number) {
  // Bridges keep a square deck: the local reach is nearly straight at each site.
  return { z: riverAtX(x).z, yaw: 0 };
}
export const BRIDGES = BRIDGE_PLANS.map(bridge => [bridge.x, bridge.z] as const);

// Visible low walls and open bunting gates mark the Correria town boundary.
export const ARENA = { minX: -56, maxX: 60, minZ: -58, maxZ: 58 } as const;
export const ARENA_CENTER = { x: 2, z: 0 };
export const inArena = (x: number, z: number, margin = 0) =>
  x >= ARENA.minX + margin && x <= ARENA.maxX - margin && z >= ARENA.minZ + margin && z <= ARENA.maxZ - margin;
/** Streets and squares: the lanes that lamps line, houses face and signs look along. */
export const STREETS: readonly Rect[] = [
  // Rua Direita: the long east-west street from the Morro to the harbour.
  [-100, -38, 112, -33],
  [-101, -66, -94, -26], [1, -88, 7, -38], [80, -33, 86, 16],
  // Rua da Capelinha runs down both banks to the western bridge.
  [-44, -33, -39, 7], [-44, 18, -39, 33],
  // South bank: Rua do Sul, the streets from the arch and timber bridges, the beach road.
  [-56, 33, 60, 38], [-10.5, 7, -5.5, 33], [33.5, 23, 38.5, 33],
  // Rua do Engenho: the workers' street running west to the mill and the casa-grande.
  [-106, 33, -56, 38],
  [-33, 38, -27, 89], [-30, 75, 71, 81], [57, 38, 63, 77], [-50, 97, 39, 103], [-10.5, 38, -5.5, 97],
  [80, 29, 86, 44],
  // Paved squares share the cobbled street paint.
  PLAZA_RECT, MARKET_RECT, ROSARIO_RECT,
];
/** Becos: the paved alleys left between terraced houses, filled in by frontage(). */
const becos: Rect[] = [];
/** Stone paving off the streets: sidewalks run to the walls, becos through the blocks. */
export const PAVING: Rect[] = [
  [-56, -33, 60, -31],  // Rua Direita's south sidewalk, up to the block corners
  [-16, -58, 0, -38],   // the Matriz's adro
  [62, -33, 124, -3],   // the harbour yard behind the Rua Direita houses
  [24, 20, 60, 33],     // the south-bank riverside walk east of the timber bridge
  [-56, -4, 22, 5],     // the north-bank quayside, where the blocks meet the quay stones
  [-67.7, 59, -62, 73], // the Capela's adro, between the chapel door and the stair head
  [-42, 63.6, -33, 68.4], // the landing at the stair foot, off the Capela street
];
/** Everything paved: street paint, impact surfaces, the map and ground cover all read this. */
export const ROADS: Rect[] = [...STREETS, ...PAVING];
export const HILLS: readonly (readonly [number, number, number, number])[] = [
  [-98, -57, 48, 26], [-112, -20, 28, 23], [-67, -79, 31, 12],
  [4, -104, 37, 17], [54, -76, 43, 11], [-76, 66, 34, 14],
  [-3, 117, 22, 8], [63, 65, 42, 6],
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
  for (const [x0, z0, x1, z1] of STREETS) {
    const horizontal = x1 - x0 > z1 - z0;
    const px = horizontal ? Math.max(x0, Math.min(x1, x)) : (x0 + x1) / 2;
    const pz = horizontal ? (z0 + z1) / 2 : Math.max(z0, Math.min(z1, z));
    const gap = Math.hypot(px - x, pz - z);
    if (gap < distance) { distance = gap; yaw = Math.round(Math.atan2(px - x, pz - z) / (Math.PI / 2)) * Math.PI / 2; }
  }
  return yaw;
}
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

// Solid terraced houses (casario) make the continuous street fronts between
// the enterable houses. They are facades with a real depth, never hollow.
export type RowPiece = 'row_sobrado' | 'row_loja' | 'row_terrea' | 'row_alto';
export const ROW_PIECES: readonly RowPiece[] = ['row_sobrado', 'row_loja', 'row_terrea', 'row_alto'];
/** Width along the street and depth into the block, including trims. */
export const ROW_SIZE: Record<RowPiece, readonly [number, number]> = {
  row_sobrado: [6.6, 8], row_loja: [8.4, 8], row_terrea: [7.2, 7], row_alto: [6, 8],
};
export interface RowLot { x: number; z: number; w: number; d: number; yaw: number; piece: RowPiece }
type Side = 'n' | 's' | 'e' | 'w';
const ENTERABLE: Record<string, [HousePiece, HouseRole]> = {
  h: ['house_small', 'home'], m: ['house_medium', 'kiosk'], t: ['house_tall', 'home'], o: ['sobrado', 'tailor'],
  b: ['house_small', 'bakery'], c: ['house_medium', 'cafe'], k: ['house_small', 'workshop'], f: ['house_small', 'fishmonger'],
  p: ['house_small', 'fisher'], d: ['sobrado', 'clinic'], w: ['house_medium', 'workshop'], q: ['sobrado', 'home'],
};
const ROW_CODES: Record<string, RowPiece> = { S: 'row_sobrado', L: 'row_loja', T: 'row_terrea', A: 'row_alto' };
// Kit footprint widths of the enterable pieces (walls plus corner pilasters).
const ENTERABLE_WIDTH: Record<HousePiece, number> = {
  house_small: 7.7, house_medium: 9.7, house_tall: 8.7, sobrado: 8.8, house_laje: 9, house_laje_b: 9, house_varanda: 9.8,
};
const ENTERABLE_DEPTH: Record<HousePiece, number> = {
  house_small: 6.7, house_medium: 7.7, house_tall: 7.7, sobrado: 8.4, house_laje: 6.7, house_laje_b: 6.7, house_varanda: 8.6,
};
const houses: HouseLot[] = [], rows: RowLot[] = [];
const FILLERS: readonly RowPiece[] = ['row_terrea', 'row_sobrado', 'row_alto'];
/**
 * Lines one street edge with buildings. `line` is the street-side building
 * line, `from`/`to` run along it, `street` is the side the fronts face.
 * Codes cycle until the frontage is full: rows S L T A, enterable houses
 * h m t o b c k f p d w q, gaps | (3.2 m beco) and . (1 m). The last slot
 * takes the widest filler row that still fits, so fronts stay continuous.
 */
function frontage(street: Side, line: number, from: number, to: number, codes: string) {
  const along = street === 'n' || street === 's', yaw = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[street];
  const outward = street === 's' || street === 'e' ? 1 : -1, direction = Math.sign(to - from) || 1;
  const put = (code: string, cursor: number) => {
    const enterable = ENTERABLE[code], row = ROW_CODES[code];
    const width = enterable ? ENTERABLE_WIDTH[enterable[0]] : ROW_SIZE[row][0];
    const depth = enterable ? ENTERABLE_DEPTH[enterable[0]] : ROW_SIZE[row][1];
    const centreAlong = cursor + direction * width / 2, centreAcross = line - outward * depth / 2;
    const x = along ? centreAlong : centreAcross, z = along ? centreAcross : centreAlong;
    if (enterable) {
      const [piece, role] = enterable, [bw, bd] = HOUSE_SIZE[piece];
      // The walled room sits on the building line; balconies and steps project past it.
      const bodyShift = (depth - HOUSE_BODY[piece][1]) / 2;
      const cx = along ? x : x + outward * bodyShift, cz = along ? z + outward * bodyShift : z;
      houses.push({ x: round(cx), z: round(cz), w: along ? bw : bd, d: along ? bd : bw, role, material: 'stone', piece, yaw });
    } else rows.push({ x: round(x), z: round(z), w: along ? width : depth, d: along ? depth : width, yaw, piece: row });
    return width;
  };
  const widthOf = (code: string) => ENTERABLE[code] ? ENTERABLE_WIDTH[ENTERABLE[code][0]] : ROW_CODES[code] ? ROW_SIZE[ROW_CODES[code]][0] : 0;
  if (![...codes].some(code => widthOf(code) > 0)) throw new Error(`Frontage without buildings: ${codes}`);
  let cursor = from;
  for (let index = 0; index < 64; index++) {
    const code = codes[index % codes.length], remaining = (to - cursor) * direction;
    const gap = code === '|' ? 3.2 : code === '.' ? 1 : 0;
    if (gap) {
      // A beco is paved from the street through the block, one row deep.
      if (code === '|') {
        const a = cursor, b = cursor + direction * gap, inner = line - outward * 8.2;
        const [u0, u1] = [Math.min(a, b), Math.max(a, b)], [v0, v1] = [Math.min(line, inner), Math.max(line, inner)];
        becos.push(along ? [u0, v0, u1, v1] : [v0, u0, v1, u1]);
      }
      cursor += direction * gap; continue;
    }
    if (remaining >= widthOf(code) - .01) { cursor += direction * (put(code, cursor) + .15); continue; }
    const filler = FILLERS.filter(piece => ROW_SIZE[piece][0] <= remaining + .01)
      .sort((a, b) => ROW_SIZE[b][0] - ROW_SIZE[a][0])[0];
    if (filler) put(Object.keys(ROW_CODES).find(key => ROW_CODES[key] === filler)!, cursor);
    break;
  }
}
const round = (value: number) => Math.round(value * 100) / 100;

// --- North bank: Vila (praça and church) and Mercado ---------------------
// Rua Direita, north side, either side of the church and the fort road.
frontage('s', -38, -56, -14, 'ShoTS|LAL');
frontage('s', -38, 8, 60, 'AStL|SmTt|AL');
// West blocks: Rua da Capelinha and the praça's west side, back to back.
frontage('e', -44, -31, 1, 'TStL|SA');
frontage('w', -39, -31, .5, 'LAk|TS');
frontage('e', -21, -31, .3, 'SoA|LT');
// Praça east side and the small shops facing the market largo behind it.
frontage('w', 5, -31, -1.6, 'AcS|L');
frontage('e', 21, -31, 0, 'TT|T');
// East block: fronts on the market largo, a back lane along the town edge.
frontage('w', 44, -31, 10.5, 'LSo|ATdS');
// --- South bank: Rosário ------------------------------------------------
// Rua do Sul, north side, and the riverside row facing the quay.
frontage('s', 33, -56, -44.5, 'TL');
frontage('s', 33, -5, 24, 'SfA|LTo');
// Largo do Rosário, west side, and the Capelinha street.
frontage('e', -30, 24.5, 32, 'TS');
frontage('e', -44, 22.5, 32, 'LS');
// Rua do Sul, south side; the Capela do Rosário stands in its middle.
frontage('n', 38, -56, -33.5, 'SLpT');
frontage('n', 38, -5, 56.5, 'AqS|LTSmL|AS');
// --- Rua da Praia: from Rua do Sul down to the beach road -----------------
// Both sides below the Capela do Rosário on a terrace level with Rua do Sul,
// a corner shop and a bakery; a cottage row on down to the beach.
frontage('e', -10.5, 54.5, 74.6, 'AhA');
frontage('w', -5.5, 46.3, 74.9, 'LbAA');
frontage('w', -5.5, 81.4, 96.6, 'Th');
// --- Porto: the harbour end of Rua Direita, the working quay behind it ----
frontage('n', -33, 63, 79.5, 'hT');
frontage('n', -33, 86.5, 118.1, 'Apwh');
// --- Engenho: the workers' terrace on Rua do Engenho, a beco to the mill yard.
frontage('s', 33, -102, -61, 'TT|kTh');
// Enterable houses need both doorways open: a house whose back door would
// open onto another building becomes a solid terraced front instead.
for (let i = houses.length - 1; i >= 0; i--) {
  const h = houses[i], [, bodyDepth] = HOUSE_BODY[h.piece];
  const back = { x: h.x - Math.sin(h.yaw ?? 0) * (bodyDepth / 2 + 1.1), z: h.z - Math.cos(h.yaw ?? 0) * (bodyDepth / 2 + 1.1) };
  const blocked = [...rows, ...houses].some(other => other !== h && Math.abs(back.x - other.x) < other.w / 2 + .4 && Math.abs(back.z - other.z) < other.d / 2 + .4);
  if (!blocked) continue;
  houses.splice(i, 1);
  const width = Math.abs(Math.sin(h.yaw ?? 0)) > .5 ? h.d : h.w, piece = FILLERS.filter(row => ROW_SIZE[row][0] <= width + .8)
    .sort((a, b) => ROW_SIZE[b][0] - ROW_SIZE[a][0])[0];
  const [rw, rd] = ROW_SIZE[piece], turned = Math.abs(Math.sin(h.yaw ?? 0)) > .5;
  // Keep the same street line: the row front replaces the house front.
  const front = { x: h.x + Math.sin(h.yaw ?? 0) * HOUSE_BODY[h.piece][1] / 2, z: h.z + Math.cos(h.yaw ?? 0) * HOUSE_BODY[h.piece][1] / 2 };
  rows.push({ x: round(front.x - Math.sin(h.yaw ?? 0) * rd / 2), z: round(front.z - Math.cos(h.yaw ?? 0) * rd / 2),
    w: turned ? rd : rw, d: turned ? rw : rd, yaw: h.yaw ?? 0, piece });
}
PAVING.push(...becos);
ROADS.push(...becos);
export const HOUSES: readonly HouseLot[] = [
  // Harbour, beach, farm and fishing houses keep their individual lots.
  home(47, 60, 'home', 'house_varanda'), home(-40, 80, 'home', 'house_varanda', Math.PI / 2),
  home(-17, 90, 'fisher'), home(62, 44, 'home', 'medium', -Math.PI / 2),
  // The Engenho's casa-grande looks over the mill yard; a fisherman's house on the mangrove shore.
  home(-108, 20, 'home', 'house_varanda', Math.PI / 2), home(101, 47, 'fisher', false, Math.PI),
  ...houses,
];
export const ROW_LOTS: readonly RowLot[] = rows;
/** Enterable houses that stand in a street frontage, and the becos left between terraces. */
export const FRONTAGE_HOUSES: readonly HouseLot[] = houses;
export const BECOS: readonly Rect[] = becos;
export const MORRO_LOTS: readonly HouseLot[] = [
  // The Morro climbs in flat-roofed laje houses: every roof is a terrace reached by its outside stair.
  home(-109, -69, 'home', 'house_laje'), home(-108, -54, 'home', 'house_laje_b'), home(-109, -38, 'home', 'house_laje'),
  home(-86, -69, 'home', true), home(-84, -53, 'home', 'house_laje_b'), home(-84, -25, 'home', 'house_laje', 0),
  home(-71, -63, 'home', 'house_laje_b', Math.PI / 2), home(-70, -49, 'home', true, Math.PI), home(-68, -25, 'home', 'house_laje_b'),
  home(-59, -72, 'home', 'house_laje'), home(-58, -54, 'home', 'house_laje'),
];
export const MORRO_COLS = [-109, -85, -70, -58] as const;
export const MORRO_Z = [-74, -20] as const;
export const TOWERS = HOUSES.filter(h => TWO_STOREY.includes(h.piece)).map(h => [h.x, h.z] as const);
/** Every building footprint, enterable or solid, as an axis-aligned rect: vegetation and dressing keep off these. */
export const LOT_RECTS: readonly Rect[] = [...HOUSES, ...MORRO_LOTS, ...rows].map(h => [h.x - h.w / 2, h.z - h.d / 2, h.x + h.w / 2, h.z + h.d / 2] as const);
export const AREAS: readonly { rect: Rect; margin: number; y: number | null; fixed?: boolean }[] = [
  { rect: [-56, -58, 60, 58], margin: 3, y: 2.2 },
  { rect: [-14, -117, 22, -81], margin: 2, y: 15.5, fixed: true },
  { rect: [62, -40, 126, -5], margin: 3, y: 2.2 },
  { rect: [41, 48, 83, 78], margin: 3, y: 5.4 },
  { rect: [-53, 93, -22, 115], margin: 2, y: .85 },
  { rect: [12, 93, 47, 115], margin: 2, y: .85 },
  { rect: [-13, 109, 1, 122], margin: 1, y: 9.5, fixed: true },
  { rect: [CAMPINHO[0] - 25, CAMPINHO[1] - 15, CAMPINHO[0] + 25, CAMPINHO[1] + 17], margin: 3, y: null },
  // The Rua da Praia's upper block, level with Rua do Sul: its terraced rows share one floor.
  { rect: [-19, 46, 3, 75], margin: 2, y: 2.2 },
  // Its cottage pair below the Rua do Farol shares a floor too.
  { rect: [-6, 81, 2, 97], margin: 2, y: 3.35 },
  // The Engenho's mill yard and workers' street, level with the river terrace.
  { rect: [-110, 9, -60, 38], margin: 3, y: 2.6 },
  // The coast road's timber bridge over the river mouth lands level on both banks.
  { rect: [77, 2, 85, 10], margin: 2, y: 2 }, { rect: [77, 32, 85, 40], margin: 2, y: 2 },
  // The palafitas' shore, level with the stilt decks over the lagoon.
  { rect: MARE_SHORE, margin: 3, y: 1.15 },
  // The fishing village's shore terrace above the mangrove.
  { rect: [92, 42, 128, 64], margin: 3, y: 2.2 },
  { rect: [CAPELA[0] - 10, CAPELA[1] - 7, CAPELA[0] + 14, CAPELA[1] + 7], margin: 2, y: 14, fixed: true },
];

// Shared endpoints are junctions. Cover keeps these routes at least 3 m wide.
export const NAV_ROUTES: readonly (readonly Point[])[] = [
  // Rua Direita from the Morro to the harbour, and the fort road.
  [[-97, -69], [-97, -36], [-60, -36], [-41.5, -36], [-8, -36], [4, -36], [11.5, -36], [32, -36], [50.5, -36], [83, -36], [112, -36]],
  // The harbour yard runs behind the houses along the quay stones.
  [[83, -36], [83, -26], [83, -6], [96, -6], [110, -6]],
  [[-97, -69], [-76, -78], [-60, -36]],
  [[4, -36], [4, -52], [4, -62], [4, -80], [4, -87]],
  // North bank streets down to the quays; the praça axis crosses the arch bridge.
  [[-41.5, -36], [-41.5, 3], [-41.5, 13], [-41.5, 24], [-41.5, 35.5]],
  [[-8, -36], [-8, -8], [-8, 2], [-8, 12], [-8, 35.5]],
  [[32, -36], [32, -8], [36, 10], [36, 17], [36, 27], [36, 35.5]],
  [[11.5, -36], [11.5, -3]], [[50.5, -36], [50.5, 12]],
  [[83, -6], [83, 12], [81, 23], [83, 34], [83, 44], [100, 44]],
  // Rua do Sul along the south bank.
  [[-60, 35.5], [-41.5, 35.5], [-30, 35.5], [-8, 35.5], [36, 35.5], [60, 35.5], [60, 44], [60, 78]],
  [[-97, -36], [-83, -13], [-66, -11], [-56, -12]],
  // West: Rua do Engenho to the casa-grande, a beco down to the mill hall and
  // its water wheel, and the climb to the hill chapel.
  [[-60, 35.5], [-66, 35.5], [-85.7, 35.5], [-104, 35.5], [-101.5, 28], [-101.5, 20]],
  [[-85.7, 35.5], [-85.7, 23.5], [-85.7, 12], [-90, 8]],
  [[-66, 35.5], [-60, 50], [-62, 58], [-70, 60], [-76, 58]],
  [[-30, 35.5], [-30, 61], [-30, 66], [-30, 78], [-45, 100], [-8, 100], [36, 100], [60, 78]],
  [[-30, 78], [3, 78], [60, 78], [80, 54], [100, 44]],
  // Down from the farm road to the palafitas' shore and the boardwalk.
  [[60, 78], [71, 79], [79, 82], [86, 84.5]],
  // The lighthouse path climbs the cape's north face in two long ramps.
  [[-8, 78], [-8, 97], [4, 96], [14, 102], [10, 109], [0, 112]],
  // Up the Capela's stair to the adro, and down the hill's east shoulder to the beach.
  [[-30, 66], [-41, 66], [-62.5, 66], [-63.5, 73], [-64, 87], [-45, 100]],
  [[-8, 35.5], [-8, 78]],
  // Beach traffic joins the graded southern ramp below the fort. A shortcut
  // across the fixed terrace would create an unwalkable cut under its walls.
  [[4, -62], [18, -66], [31, -79], [51, -101], [74, -91], [61, -72], [61, -36]],
  // The campinho joins the harbour road junction.
  [[61, -50], [74, -52], [CAMPINHO[0], CAMPINHO[1] - 3]],
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
