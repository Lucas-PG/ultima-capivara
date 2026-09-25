import { terrainHeight } from '../shared/terrain';
import type { Collider, Difficulty, Vec3, WeaponId, WorldSpec } from '../shared/types';

// Bot behaviour follows the legacy single-file build (reference/legacy.html,
// "bots" section): the same difficulty table, per-weapon ranges and cadence,
// reaction times, aim error cone, cover, looting and zone logic.

// Legacy DIFFS: facil / normal / dificil.
export const DIFFICULTY: Record<Difficulty, { dmg: number; err: number; react: number; sight: number; elites: number }> = {
  easy: { dmg: .55, err: 1.6, react: .4, sight: .7, elites: 3 },
  normal: { dmg: .78, err: 1.25, react: .15, sight: .85, elites: 4 },
  hard: { dmg: 1, err: 1, react: 0, sight: 1, elites: 5 },
};

// Legacy botRange / botSight and the fire cadence table from botFire().
export type BotDifficulty = (typeof DIFFICULTY)[Difficulty];
// Legacy computeDiff(): the adaptive factor makes bots up to ~20% milder or braver.
export function adaptDifficulty(base: BotDifficulty, adapt = 0): BotDifficulty {
  const a = Number.isFinite(adapt) ? Math.max(-1, Math.min(1, adapt)) : 0;
  return { dmg: base.dmg * (1 + a * .22), err: base.err * (1 - a * .18), react: Math.max(0, base.react - a * .12), sight: base.sight * (1 + a * .1), elites: base.elites };
}

export const BOT_WEAPON: Record<WeaponId, { tier: number; range: number; sight: number; burst?: boolean; cooldown: [number, number] }> = {
  pistol: { tier: 1, range: 12, sight: 60, cooldown: [.22, .4] },
  smg: { tier: 2, range: 10, sight: 55, burst: true, cooldown: [.3, .6] },
  shotgun: { tier: 2, range: 6, sight: 40, cooldown: [.8, 1.1] },
  m4: { tier: 3, range: 26, sight: 110, burst: true, cooldown: [.3, .6] },
  dmr: { tier: 3, range: 38, sight: 140, cooldown: [.55, .9] },
  sniper: { tier: 3, range: 55, sight: 170, cooldown: [1.4, 2.2] },
  machete: { tier: 0, range: 1, sight: 10, cooldown: [.45, .7] },
  slingshot: { tier: 0, range: 18, sight: 60, cooldown: [1.2, 1.6] },
};
export const botValue = (id: WeaponId, rarity = 0) => BOT_WEAPON[id].tier * 10 + rarity;
// Legacy plane loadout weights.
export const BOT_START: [WeaponId, number][] = [['pistol', 58], ['smg', 16], ['shotgun', 12], ['m4', 8], ['sniper', 3], ['dmr', 3]];

export interface BotBrain {
  elite: boolean; skill: number;
  thinkAt: number; alertUntil: number; hurtUntil: number; coverUntil: number; coverCdUntil: number; recentDmg: number;
  target: string | null; sees: boolean; lastSeen: Vec3 | null; lastSeenAt: number; trackT: number; reactT: number;
  fireAt: number; burst: number; strafeDir: number; strafeUntil: number;
  mode: 'roam' | 'fight' | 'cover'; coverPt: Vec3 | null; flank: number;
  goal: Vec3 | null; loot: { id: string; kind: 'item' | 'chest'; pos: Vec3 } | null; lootScanAt: number; zoneGoal: Vec3 | null;
  hearPos: Vec3 | null; lastAttacker: string | null;
  avoidOff: number; avoidAt: number; stuckAt: number; lastPos: Vec3;
  via: Vec3 | null; routeFor: Vec3 | null; routeAt: number; ignore: Map<string, number>;
  land: Vec3 | null; jumpAt: number;
  reloading: boolean; drop: Vec3 | null; lastVia: Vec3 | null; lootFor: string | null; lootSince: number; pressT: number; avoidHold: number; face: number;
}

export function createBrain(elite: boolean, skill: number, pos: Vec3, flank: number): BotBrain {
  return {
    elite, skill, thinkAt: 0, alertUntil: -1, hurtUntil: -1, coverUntil: -1, coverCdUntil: -1, recentDmg: 0,
    target: null, sees: false, lastSeen: null, lastSeenAt: -99, trackT: 0, reactT: 0,
    fireAt: 0, burst: 0, strafeDir: 1, strafeUntil: 0, mode: 'roam', coverPt: null, flank,
    goal: null, loot: null, lootScanAt: -99, zoneGoal: null, hearPos: null, lastAttacker: null,
    avoidOff: 0, avoidAt: 0, stuckAt: -1, lastPos: { ...pos }, via: null, routeFor: null, routeAt: 0, ignore: new Map(), land: null, jumpAt: Infinity, reloading: false, drop: null, lastVia: null, lootFor: null, lootSince: 0, pressT: 0, avoidHold: 0, face: Number.NaN,
  };
}

export const angleDiff = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// A uniform grid over the static colliders so the many short bot probes and
// sight checks do not scan all ~3000 boxes. Rebuilt when colliders are added.
export class ColliderGrid {
  private cells = new Map<number, number[]>();
  private built = -1;
  private marks = new Int32Array(0);
  private stamp = 0;
  // Collider hit by the last ray() call, when the nearest hit was a box.
  lastHit: Collider | null = null;
  constructor(private readonly world: WorldSpec, private readonly size = 6) {}

  private key(ix: number, iz: number) { return (ix + 2048) * 4096 + iz + 2048; }
  private ensure() {
    const colliders = this.world.colliders;
    if (this.built === colliders.length) return;
    this.cells.clear(); this.built = colliders.length; this.marks = new Int32Array(colliders.length); this.stamp = 0;
    colliders.forEach((c, index) => {
      for (let ix = Math.floor(c.min.x / this.size); ix <= Math.floor(c.max.x / this.size); ix++)
        for (let iz = Math.floor(c.min.z / this.size); iz <= Math.floor(c.max.z / this.size); iz++) {
          const k = this.key(ix, iz), list = this.cells.get(k);
          if (list) list.push(index); else this.cells.set(k, [index]);
        }
    });
  }

  near(minX: number, minZ: number, maxX: number, maxZ: number): Collider[] {
    this.ensure();
    const found: Collider[] = [], stamp = ++this.stamp;
    for (let ix = Math.floor(minX / this.size); ix <= Math.floor(maxX / this.size); ix++)
      for (let iz = Math.floor(minZ / this.size); iz <= Math.floor(maxZ / this.size); iz++)
        for (const index of this.cells.get(this.key(ix, iz)) || []) {
          if (this.marks[index] === stamp) continue;
          this.marks[index] = stamp; found.push(this.world.colliders[index]);
        }
    return found;
  }

  // Distance to the first collider or terrain hit along a unit direction, or null.
  ray(o: Vec3, d: Vec3, max: number): number | null {
    this.ensure();
    const S = this.size, stamp = ++this.stamp;
    let best = max, bestIndex = -1;
    let ix = Math.floor(o.x / S), iz = Math.floor(o.z / S);
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    let tMaxX = Math.abs(d.x) > 1e-9 ? ((ix + (stepX > 0 ? 1 : 0)) * S - o.x) / d.x : Infinity;
    let tMaxZ = Math.abs(d.z) > 1e-9 ? ((iz + (stepZ > 0 ? 1 : 0)) * S - o.z) / d.z : Infinity;
    const dX = Math.abs(d.x) > 1e-9 ? S / Math.abs(d.x) : Infinity, dZ = Math.abs(d.z) > 1e-9 ? S / Math.abs(d.z) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 400; guard++) {
      for (const index of this.cells.get(this.key(ix, iz)) || []) {
        if (this.marks[index] === stamp) continue;
        this.marks[index] = stamp;
        const c = this.world.colliders[index];
        let low = 0, high = best;
        for (const axis of ['x', 'y', 'z'] as const) {
          const dd = d[axis], oo = o[axis];
          if (Math.abs(dd) < 1e-9) { if (oo < c.min[axis] || oo > c.max[axis]) { low = Infinity; break; } continue; }
          const a = (c.min[axis] - oo) / dd, b = (c.max[axis] - oo) / dd;
          low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
          if (low > high) break;
        }
        if (low <= high && low < best) { best = low; bestIndex = index; }
      }
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += dX; ix += stepX; } else { t = tMaxZ; tMaxZ += dZ; iz += stepZ; }
      if (t > best || t > max) break;
    }
    const step = best > 6 ? 2 : .5;
    for (let s = step; s <= best; s += step) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (y < terrainHeight(x, z) - .02) { this.lastHit = null; return s; }
    }
    this.lastHit = bestIndex >= 0 && best < max ? this.world.colliders[bestIndex] : null;
    return best < max ? best : null;
  }

  sees(a: Vec3, b: Vec3): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return true;
    return this.ray(a, { x: dx / L, y: dy / L, z: dz / L }, L - .05) === null;
  }
}
