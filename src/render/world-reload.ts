import type { WeaponId } from '../shared/types';
import type { Choreography, HandKey, Key } from './viewmodel-choreo';
import type { V3 } from './viewmodel-specs';
import { isShortGun, shortReload } from './short-world-parts';
import { m4Reload } from './viewmodel-anims';
import measured from './world-reload-grips.json';

// TP keeps the same moving parts and reload timing. Its coarser skin needs
// independent part-local support keys; FP fitting must not move world paws.
const fits = measured as unknown as { m4: Key[]; m4Seat: HandKey; m4Catch: HandKey; smgMag: HandKey; smgCharge: HandKey };
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
      // Traverse the independently measured world index route in the rig.
      if (id === 'm4' && key.R?.indexed) key = { ...key, R: { ...key.R, indexed: undefined } };
      const hand = key.L;
      if (id === 'm4' && key.t >= .17 && key.t <= .7 && hand) return { ...key, L: undefined };
      if (id === 'm4' && hand && key.t >= .733 && key.t <= .785) return { ...key, L: key.t === .77 ? fits.m4Seat : translated(fits.m4Seat, hand, reference(.77)) };
      if (id === 'm4' && hand && [.83, .86, .902].includes(key.t)) return { ...key, L: key.t === .86 ? fits.m4Catch : translated(fits.m4Catch, hand, reference(.86)) };
      if (id === 'smg' && hand?.space === 'part' && hand.part === 'mag') return { ...key, L: translated(fits.smgMag, hand, reference(.17)) };
      if (id === 'smg' && hand?.space === 'part' && hand.part === 'charge') return { ...key, L: translated(fits.smgCharge, hand, reference(.805)) };
      if (id === 'pistol' && key.t === .035) return { ...key, L: { ...hand!, offset: [-.045, -.04, 0] as V3 } };
      return { ...key };
    });
    if (id === 'pistol' && empty) keys.push({ t: .17, L: { space: 'gun', wrist: [-.24, -.12, .08], forward: [.35, .12, -1], palm: [1, 0, .15] } });
    cache.set(name, [...keys, ...(id === 'm4' ? fits.m4 : [])].sort((a, b) => a.t - b.t));
  }
  return cache.get(name)!;
}
