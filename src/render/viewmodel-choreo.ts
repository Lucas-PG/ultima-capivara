import * as THREE from 'three';
import type { HandCurl } from './fp-arms';
import type { V3 } from './viewmodel-specs';

// Keyframed first-person choreography (reloads, draws, inspects).
// Each channel is interpolated between the keys that mention it; a channel
// that no key mentions stays at rest. Times are normalised to [0, 1].

export type Ease = 'smooth' | 'in' | 'out' | 'linear' | 'snap' | 'back';
/** 'grip': the weapon's rest grip; 'gun': weapon space; 'view': camera space. */
export interface HandKey { space: 'grip' | 'gun' | 'view' | 'part'; part?: string; wrist?: V3; forward?: V3; palm?: V3; curl?: HandCurl }
export interface PartKey { visible?: boolean; out?: number; p?: V3; r?: V3 }
export interface Key {
  t: number; ease?: Ease;
  /** Gun offset in camera space (position, then pitch/yaw/roll). */
  p?: V3; r?: V3;
  L?: HandKey; R?: HandKey;
  /** Magazine (or shell/round/speedloader) relative to its seat, in weapon space. */
  mag?: PartKey;
  /** Named mechanical channels: slide, bolt, pump, cylinder, gate... */
  parts?: Record<string, number>;
  /** Foley cue fired when the choreography passes this key. */
  sfx?: string;
}
export type Choreography = readonly Key[];

export interface ChoreoSample {
  p: THREE.Vector3; r: THREE.Vector3;
  L: { a: HandKey; b: HandKey; u: number } | null;
  R: { a: HandKey; b: HandKey; u: number } | null;
  mag: { visible: boolean; out: number; p: THREE.Vector3; r: THREE.Vector3 } | null;
  parts: Record<string, number>;
}

function shape(u: number, ease: Ease = 'smooth') {
  const t = THREE.MathUtils.clamp(u, 0, 1);
  switch (ease) {
    case 'linear': return t;
    case 'in': return t * t * t;
    case 'out': return 1 - (1 - t) ** 3;
    case 'snap': return 1 - (1 - t) ** 5;
    case 'back': { const s = 1.6; return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2; }
    default: return t * t * t * (t * (t * 6 - 15) + 10);
  }
}

const REST_HAND: HandKey = { space: 'grip' };
const REST_PART: Required<PartKey> = { visible: true, out: 0, p: [0, 0, 0], r: [0, 0, 0] };

// Find the keys around t that set a channel; a channel is held after its last key.
function around<T>(keys: Choreography, t: number, get: (key: Key) => T | undefined, rest: T): { a: T; b: T; u: number; ease: Ease } {
  let a: T = rest, ta = 0, b: T = rest, tb = 1, ease: Ease = 'smooth', foundB = false;
  for (const key of keys) {
    const value = get(key);
    if (value === undefined) continue;
    if (key.t <= t) { a = value; ta = key.t; }
    else if (!foundB) { b = value; tb = key.t; ease = key.ease ?? 'smooth'; foundB = true; }
  }
  if (!foundB) { b = rest; tb = 1; }
  // Holding the last key: once past every key of this channel, return to rest by t=1.
  const u = tb > ta ? shape((t - ta) / (tb - ta), ease) : 1;
  return { a, b, u, ease };
}

const lerp3 = (a: V3, b: V3, u: number, out: THREE.Vector3) => out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
const ZERO: V3 = [0, 0, 0];

export function sampleChoreo(keys: Choreography, t: number, out: ChoreoSample): ChoreoSample {
  const pos = around(keys, t, k => k.p, ZERO); lerp3(pos.a, pos.b, pos.u, out.p);
  const rot = around(keys, t, k => k.r, ZERO); lerp3(rot.a, rot.b, rot.u, out.r);
  const hasL = keys.some(k => k.L), hasR = keys.some(k => k.R), hasMag = keys.some(k => k.mag);
  out.L = hasL ? around(keys, t, k => k.L, REST_HAND) : null;
  out.R = hasR ? around(keys, t, k => k.R, REST_HAND) : null;
  if (hasMag) {
    const m = around(keys, t, k => k.mag, REST_PART as PartKey);
    const a = { ...REST_PART, ...m.a }, b = { ...REST_PART, ...m.b };
    out.mag ??= { visible: true, out: 0, p: new THREE.Vector3(), r: new THREE.Vector3() };
    // Visibility switches at the key, never mid-blend.
    out.mag.visible = m.u >= 1 ? b.visible : a.visible;
    out.mag.out = a.out + (b.out - a.out) * m.u;
    lerp3(a.p, b.p, m.u, out.mag.p); lerp3(a.r, b.r, m.u, out.mag.r);
  } else out.mag = null;
  for (const name in out.parts) out.parts[name] = 0;
  const names = new Set<string>();
  for (const key of keys) for (const name in key.parts ?? {}) names.add(name);
  for (const name of names) {
    const part = around(keys, t, k => k.parts?.[name], 0);
    out.parts[name] = part.a + (part.b - part.a) * part.u;
  }
  return out;
}

export const newSample = (): ChoreoSample => ({ p: new THREE.Vector3(), r: new THREE.Vector3(), L: null, R: null, mag: null, parts: {} });
