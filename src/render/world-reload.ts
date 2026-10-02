import type { WeaponId } from '../shared/types';
import type { Choreography, HandKey, Key } from './viewmodel-choreo';
import type { V3 } from './viewmodel-specs';
import { isShortGun, shortReload } from './short-world-parts';
import { m4Reload } from './viewmodel-anims';
import measured from './world-reload-grips.json';

// TP keeps the same moving parts and reload timing. Its coarser skin needs
// independent part-local support keys; FP fitting must not move world paws.
const fits = measured as unknown as { m4: Key[]; smg: Key[]; m4Seat: HandKey; m4Catch: HandKey; smgMag: HandKey; smgCharge: HandKey };
const OPEN: HandKey['curl'] = { index: [.25, .2, .15], middle: [.3, .25, .15], ring: [.35, .25, .2], thumb: [.15, .1, .05] };
const cache = new Map<string, Choreography>();
const translated = (key: HandKey, source: HandKey, reference: HandKey): HandKey => ({ ...key,
  contact: source.contact, wrist: key.wrist!.map((v, i) => v + (source.wrist?.[i] ?? 0) - (reference.wrist?.[i] ?? 0)) as unknown as V3,
  curl: source.contact === false ? source.curl : key.curl });
export function worldReload(id: WeaponId, empty: boolean): Choreography | null {
  const source = isShortGun(id) ? shortReload(id, empty) : id === 'm4' ? m4Reload(empty) : null;
  if (!source) return null;
  const name = `${id}/${empty}`;
  if (!cache.has(name)) {
    const reference = (time: number) => source.find(key => key.t === time)!.L!;
    const keys = source.map(key => {
      // FP reload palm keys are independently fitted; retain the measured TP carry.
      if (id === 'pistol' && key.R) key = { ...key, R: { space: 'grip', indexed: true } };
      // The world rig traverses its own measured index route continuously.
      // Retain the authored carrying grip while removing the FP endpoint flag.
      if (id === 'm4' && key.R?.indexed) key = { ...key, R: { ...key.R, indexed: undefined } };
      const hand = key.L;
      if (id === 'revolver' && hand?.part === 'cylinder' && [.17, .835].includes(key.t)) return { ...key, L: { ...hand, wrist: [hand.wrist![0], hand.wrist![1] + .0005, hand.wrist![2]] as V3 } };
      if (id === 'm4' && hand && [.015, .958, .901].includes(key.t)) return { ...key, L: { ...hand, offset: [-.045, -.036, .004] as V3 } };
      if (id === 'm4' && key.t >= .17 && key.t <= .7 && hand) return { ...key, L: undefined };
      if (id === 'm4' && hand && key.t >= .733 && key.t <= .785) return { ...key, L: key.t === .77 ? fits.m4Seat : translated(fits.m4Seat, hand, reference(.77)) };
      if (id === 'm4' && hand && [.83, .86, .902].includes(key.t)) return { ...key, L: key.t === .86 ? fits.m4Catch : translated(fits.m4Catch, hand, reference(.86)) };
      if (id === 'smg' && key.t === .035) return { ...key, L: { ...hand!, offset: [-.09, -.035, 0] as V3 } };
      if (id === 'smg' && hand?.space === 'grip' && key.t > .8 && hand.offset) return { ...key, L: { ...hand, offset: [-.065, 0, 0] as V3 } };
      if (id === 'smg' && key.t >= .17 && key.t <= .68 && hand) return { ...key, L: undefined };
      if (id === 'smg' && hand?.part === 'mag' && key.t < .17) return { ...key, L: { ...fits.smgMag, contact: false as const, wrist: fits.smgMag.wrist!.map((v, i) => v - (i === 0 ? key.t === .15 ? .045 : .15 : 0)) as unknown as V3 } };
      if (id === 'smg' && hand?.space === 'part' && hand.part === 'mag' && key.t > .68) {
        const away = key.t <= .7 ? .065 : key.t <= .715 ? .13 : .15;
        return { ...key, L: { ...fits.smgMag, contact: false as const, wrist: fits.smgMag.wrist!.map((v, i) => v - (i === 0 ? away : 0)) as unknown as V3, curl: key.t <= .7 ? fits.smgMag.curl : OPEN } };
      }
      if (id === 'smg' && hand?.space === 'part' && hand.part === 'mag') return { ...key, L: translated(fits.smgMag, hand, reference(.17)) };
      if (id === 'smg' && hand?.space === 'part' && hand.part === 'charge') return { ...key, L: translated(fits.smgCharge, hand, reference(.805)) };
      if (id === 'pistol' && key.t === .075) return { ...key, L: { ...hand!, wrist: [-.25, -.12, .08] as V3 } };
      if (id === 'pistol' && key.t === .035) return { ...key, L: { ...hand!, offset: [-.045, -.04, 0] as V3 } };
      return { ...key };
    });
    if (id === 'smg' && empty) keys.push({ t: .799, L: { ...fits.smgCharge, contact: false, wrist: fits.smgCharge.wrist!.map((v, i) => v - (i === 0 ? .04 : 0)) as unknown as V3 } });
    if (id === 'pistol' && empty) keys.push({ t: .17, L: { space: 'gun', wrist: [-.24, -.12, .08], forward: [.35, .12, -1], palm: [1, 0, .15], curl: OPEN } });
    cache.set(name, [...keys, ...(id === 'm4' ? fits.m4 : id === 'smg' ? fits.smg : [])].sort((a, b) => a.t - b.t));
  }
  return cache.get(name)!;
}
