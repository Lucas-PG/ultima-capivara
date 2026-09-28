import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { Choreography } from './viewmodel-choreo';

// Authored first-person reloads. Coordinates: gun offsets in camera space
// (x right, y up, z back; pitch up, yaw left, roll counter-clockwise), hands and
// parts in weapon space unless the key says 'view'.
const curl = (index: number[], middle: number[], ring: number[], thumb: number[]) =>
  ({ index, middle, ring, thumb }) as unknown as HandCurl;
const OPEN = curl([.25, .2, .15], [.3, .25, .15], [.35, .25, .2], [.15, .1, .05]);
const HOLD_MAG = curl([.9, .9, .6], [1.1, 1, .7], [1.2, 1.05, .75], [.6, .4, .3]);
const PINCH = curl([.7, .9, .7], [1.2, 1.1, .8], [1.3, 1.1, .8], [.9, .6, .4]);

const PISTOL_RELOAD: Choreography = [
  // Cant the gun toward the support paw and show the well.
  { t: .1, p: [-.085, .065, .03], r: [.35, .16, -.55], ease: 'out' },
  { t: .09, L: { space: 'view', wrist: [-.13, -.3, -.12], forward: [.3, .5, -1], palm: [.8, 0, .3], curl: OPEN } },
  // Release: the empty magazine slides and drops away.
  { t: .12, mag: { out: .01 } },
  { t: .2, mag: { out: .1, p: [.01, -.03, .01], r: [.25, 0, .15] }, ease: 'in' },
  { t: .3, mag: { visible: false, out: .16, p: [.03, -.32, .06], r: [1.1, .3, .7] }, ease: 'in' },
  // Paw to the belt and back with a fresh magazine.
  { t: .3, L: { space: 'view', wrist: [-.2, -.52, .02], forward: [.2, .8, -.4], palm: [.9, 0, .2], curl: HOLD_MAG } },
  { t: .4, mag: { visible: false, out: .3, p: [-.06, -.2, .05], r: [0, 0, .5] } },
  { t: .41, mag: { visible: true, out: .3, p: [-.06, -.2, .05], r: [0, 0, .5] } },
  { t: .5, L: { space: 'gun', wrist: [-.075, -.33, .06], forward: [.35, .9, -.15], palm: [1, 0, .1], curl: HOLD_MAG } },
  { t: .5, mag: { out: .14, p: [-.03, -.03, .012], r: [0, 0, .25] } },
  { t: .58, L: { space: 'gun', wrist: [-.048, -.24, .04], forward: [.15, .95, -.15], palm: [1, 0, .05], curl: HOLD_MAG } },
  { t: .58, mag: { out: .06, p: [0, 0, 0], r: [0, 0, 0] } },
  // Seat it with the heel of the paw.
  { t: .65, L: { space: 'gun', wrist: [-.045, -.175, .025], forward: [.15, .95, -.15], palm: [1, 0, .05], curl: HOLD_MAG }, ease: 'snap' },
  { t: .65, mag: { out: 0 }, ease: 'snap' },
  { t: .63, p: [-.085, .065, .03], r: [.35, .16, -.55] },
  { t: .67, p: [-.09, .08, .025], r: [.4, .16, -.52], ease: 'snap' },
  // Rack the slide over the top, then let it snap home.
  { t: .74, p: [-.07, .0, .05], r: [.05, .38, -.08] },
  { t: .74, L: { space: 'gun', wrist: [-.095, .05, .085], forward: [1, .15, -.2], palm: [.25, -1, 0], curl: PINCH } },
  { t: .8, L: { space: 'gun', wrist: [-.095, .05, .12], forward: [1, .15, -.2], palm: [.25, -1, 0], curl: PINCH } },
  { t: .74, parts: { slide: 0 } },
  { t: .8, parts: { slide: .03 } },
  { t: .83, parts: { slide: 0 }, ease: 'snap' },
  { t: .83, p: [-.065, .012, .065], r: [.12, .38, -.06], ease: 'snap' },
  { t: .87, L: { space: 'gun', wrist: [-.12, .02, .15], forward: [1, .1, -.3], palm: [.3, -1, 0], curl: OPEN } },
  { t: .97, L: { space: 'grip' } },
];

export const RELOADS: Partial<Record<WeaponId, Choreography>> = {
  pistol: PISTOL_RELOAD,
};
