import { DISTRICT_ARRIVALS } from '../../src/shared/layout';
import { walkableHeight } from '../../src/shared/navigation';
import type { Vec3, WorldSpec } from '../../src/shared/types';

/** A named review camera: where the capybara stands (x, z), where it looks (yaw, pitch; yaw 0
 * faces north, -z) and, for a stance above the ground (a roof terrace), the floor height. */
export type WorldView = readonly [x: number, z: number, yaw: number, pitch: number, floor?: number];

/** Yaw that faces from (x, z) toward (tx, tz). */
const toward = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

// Every view stands where a player can stand, at the player's eye, and looks
// at what its name says. tests/qa-views.test.ts keeps each camera out of the
// solids and its view clear of walls and foliage for the first 2 m.
export const VIEWS: Record<string, WorldView> = {
  plaza: [-1, -10, .48, .02], bakery: [-43, -36, Math.PI, .02],
  river: [4.5, 20.5, .28, -.03], forteBeach: [62, -85.5, 1.13, .2],
  fortApproach: [4, -62, 0, .2],
  // Up Rua Direita toward the Morro and the Redentora above it.
  morroApproach: [-48, -35.5, Math.PI / 2, .14],
  // Along each quay promenade, the river on one side and the fronts on the other.
  quayNorth: [-18, -3, toward(-18, -3, 0, 1.5), -.06], quaySouth: [30, 27.5, toward(30, 27.5, 12, 22.5), -.06],
  bathVila: [-24, 30.5, 0, -.2], bathFazenda: [55, 51, Math.PI / 2, -.28], bathMangue: [111, 56, Math.PI / 2, -.22],
  trampolineVila: [-16, 34, 0, -.12], trampolineForte: [51, -101, Math.atan2(-4, 6), -.13],
  trampolinePraia: [-38, 101, Math.PI, -.13],
  // Down Rua Direita through the Vila, fronts continuous on both sides.
  vilaStreet: [-30, -35.5, -Math.PI / 2, .03],
  capyFront: [-1, -10, 0, 0], capySide: [-1, -10, 0, 0],
  redentoraVila: [-6, -26, 1.62, .1], redentoraNear: [-72, -36.5, toward(-72, -36.5, -110, -24), .16], redentoraPlinth: [-101, -27, toward(-101, -27, -110, -24), .5],
  morroStreet: [-97, -45, 0, .12],
  // From a laje roof terrace over the roofs falling to the Vila, and along the high terraces of the Morro.
  morroRoofs: [-84.5, -25, -Math.PI / 2, .02, 10.7], lajeRoof: [-109, -38, toward(-109, -38, -108, -54), .02, 27.4],
  // From the fazenda house's veranda out over its farm.
  varandaFazenda: [49.2, 60, -Math.PI / 2, -.02, 5.51],
  // The praça's sobrado across the square, and the sobrado on the market largo.
  sobradoPlaza: [-13, -21, toward(-13, -21, -24.5, -19.85), .15], clinicSobrado: [39.5, -16.5, toward(39.5, -16.5, 47.5, -11.3), .15],
  swimWaterline: [-60, 2, 0, .04], swimRemote: [-60, 2, 0, .04], swimExit: [-60, 2, Math.PI, .12],
};

/** Each district's review view is its authored arrival: the first sight of the place. */
export const DISTRICT_VIEWS: Record<string, WorldView> = Object.fromEntries(Object.entries(DISTRICT_ARRIVALS)
  .map(([id, [x, z, lx, lz]]) => [id, [x, z, toward(x, z, lx, lz), id === 'forte' ? .16 : .04] as const]));

/** Where the reviewing capybara stands for a view: on the walking surface, or on its floor. */
export function viewStance(world: WorldSpec, view: WorldView): Vec3 {
  return { x: view[0], y: view[4] ?? walkableHeight(view[0], view[1], world), z: view[1] };
}
