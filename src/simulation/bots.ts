import type { ActorState, Difficulty, Mode, Vec3, WeaponId, WorldSpec } from '../shared/types';
import { moveActor } from '../shared/collision';
import { emptyInput } from '../shared/math';
import { inArena } from '../shared/layout';
import { isArenaMode } from '../shared/types';
import { navigationAnchor, walkableHeight, walkableSegment } from '../shared/navigation';

// Difficulty, weapon ranges and shot cadence retain the legacy tuning
// (reference/legacy.html, "bots" section). Navigation, cover and rotation use
// the current shared movement and island data.

// Legacy DIFFS: facil / normal / dificil. `lag` (seconds) is how slowly a bot's
// read of its target's motion catches up: a steady run is tracked, but every
// change of direction is aimed at where the target was heading. Legacy aimed
// at the exact current position, so strafing barely mattered (85% hits at 10 m).
export const DIFFICULTY: Record<Difficulty, { dmg: number; err: number; react: number; sight: number; elites: number; lag: number }> = {
  easy: { dmg: .55, err: 1.6, react: .4, sight: .7, elites: 3, lag: .28 },
  normal: { dmg: .78, err: 1.25, react: .15, sight: .85, elites: 4, lag: .21 },
  hard: { dmg: 1, err: 1, react: 0, sight: 1, elites: 5, lag: .15 },
};

// Legacy botRange / botSight and the fire cadence table from botFire().
export type BotDifficulty = (typeof DIFFICULTY)[Difficulty];
// Legacy computeDiff(): the adaptive factor makes bots up to ~20% milder or braver.
export function adaptDifficulty(base: BotDifficulty, adapt = 0): BotDifficulty {
  const a = Number.isFinite(adapt) ? Math.max(-1, Math.min(1, adapt)) : 0;
  return { dmg: base.dmg * (1 + a * .22), err: base.err * (1 - a * .18), react: Math.max(0, base.react - a * .12), sight: base.sight * (1 + a * .1), elites: base.elites, lag: base.lag * (1 - a * .18) };
}

export const BOT_WEAPON: Record<WeaponId, { tier: number; range: number; sight: number; burst?: boolean; cooldown: [number, number] }> = {
  pistol: { tier: 1, range: 12, sight: 60, cooldown: [.22, .4] },
  smg: { tier: 2, range: 10, sight: 55, burst: true, cooldown: [.3, .6] },
  shotgun: { tier: 2, range: 6, sight: 40, cooldown: [.8, 1.1] },
  m4: { tier: 3, range: 26, sight: 110, burst: true, cooldown: [.3, .6] },
  dmr: { tier: 3, range: 38, sight: 140, cooldown: [.55, .9] },
  sniper: { tier: 3, range: 55, sight: 170, cooldown: [1.4, 2.2] },
  machete: { tier: 0, range: 1, sight: 10, cooldown: [.45, .7] },
  revolver: { tier: 2, range: 20, sight: 90, cooldown: [.45, .7] },
  coco: { tier: 3, range: 20, sight: 70, cooldown: [1.1, 1.5] },
};
export const botValue = (id: WeaponId, rarity = 0) => BOT_WEAPON[id].tier * 10 + rarity;
// Legacy plane loadout weights.
export const BOT_START: [WeaponId, number][] = [['pistol', 58], ['smg', 16], ['shotgun', 12], ['m4', 8], ['sniper', 3], ['dmr', 3]];

export interface BotBrain {
  elite: boolean; skill: number;
  thinkAt: number; alertUntil: number; hurtUntil: number; coverUntil: number; coverCdUntil: number; recentDmg: number;
  target: string | null; sees: boolean; lastSeen: Vec3 | null; lastSeenAt: number; trackT: number; reactT: number;
  fireAt: number; burst: number; strafeDir: number; strafeUntil: number;
  /** The bot's lagging read of its target's velocity (see DIFFICULTY.lag). */
  aimVelocity: Vec3 | null; aimFor: string | null;
  mode: 'roam' | 'fight' | 'cover'; coverPt: Vec3 | null; peekPt: Vec3 | null; peekUntil: number; flank: number;
  goal: Vec3 | null; loot: { id: string; kind: 'item' | 'chest' | 'supply'; pos: Vec3 } | null; lootScanAt: number; zoneGoal: Vec3 | null;
  leisure: { kind: 'celebrate' | 'bath' | 'trampoline'; pos: Vec3; exit: Vec3; until: number; bounceSeq: number } | null;
  leisureAt: number; leisureScanAt: number; celebrateAt: number; celebrateUntil: number;
  hearPos: Vec3 | null; lastAttacker: string | null;
  avoidOff: number; avoidAt: number; stuckAt: number; lastPos: Vec3;
  recoveryYaw: number | null; recoveryJump: boolean; recoveryUntil: number;
  via: Vec3 | null; routeFor: Vec3 | null; routeAt: number; ignore: Map<string, number>;
  land: Vec3 | null; jumpAt: number;
  reloading: boolean; drop: Vec3 | null; lastVia: Vec3 | null; lootFor: string | null; lootSince: number; pressT: number; avoidHold: number; face: number; hearLock: number;
}

export function createBrain(elite: boolean, skill: number, pos: Vec3, flank: number): BotBrain {
  return {
    elite, skill, thinkAt: 0, alertUntil: -1, hurtUntil: -1, coverUntil: -1, coverCdUntil: -1, recentDmg: 0,
    target: null, sees: false, lastSeen: null, lastSeenAt: -99, trackT: 0, reactT: 0,
    fireAt: 0, burst: 0, strafeDir: 1, strafeUntil: 0, aimVelocity: null, aimFor: null, mode: 'roam', coverPt: null, flank,
    peekPt: null, peekUntil: 0,
    recoveryYaw: null, recoveryJump: false, recoveryUntil: 0,
    goal: null, loot: null, lootScanAt: -99, zoneGoal: null, hearPos: null, lastAttacker: null,
    leisure: null, leisureAt: 0, leisureScanAt: 0, celebrateAt: 0, celebrateUntil: 0,
    avoidOff: 0, avoidAt: 0, stuckAt: -1, lastPos: { ...pos }, via: null, routeFor: null, routeAt: 0, ignore: new Map(), land: null, jumpAt: Infinity, reloading: false, drop: null, lastVia: null, lootFor: null, lootSince: 0, pressT: 0, avoidHold: 0, face: Number.NaN, hearLock: 0,
  };
}

export const angleDiff = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Seconds of aim lag for this bot: elites read motion faster. */
export const aimLag = (diff: BotDifficulty, elite: boolean) => diff.lag * (elite ? .75 : 1);
/** Ease the bot's read of the target's velocity toward the truth. */
export function trackAim(brain: BotBrain, target: ActorState, lag: number, dt: number) {
  if (!brain.aimVelocity || brain.aimFor !== target.id) { brain.aimVelocity = { ...target.velocity }; brain.aimFor = target.id; return; }
  const k = 1 - Math.exp(-dt / Math.max(.01, lag)), v = brain.aimVelocity;
  v.x += (target.velocity.x - v.x) * k; v.y += (target.velocity.y - v.y) * k; v.z += (target.velocity.z - v.z) * k;
}
/** Where a lagging read of the motion puts the target: exact for a steady run. */
export function aimOffset(brain: BotBrain, target: ActorState, lag: number): Vec3 {
  const v = brain.aimFor === target.id ? brain.aimVelocity : null;
  if (!v) return { x: 0, y: 0, z: 0 };
  return { x: (v.x - target.velocity.x) * lag, y: (v.y - target.velocity.y) * lag * .5, z: (v.z - target.velocity.z) * lag };
}

// Only after measured lack of progress: try short walks through the same
// collision solver used by players. A normal jump is considered only if a
// walking escape cannot regain a route toward the destination. Neither speed
// nor impulse changes.
export const RECOVERY_SECONDS = 2;
export function recoveryDirection(world: WorldSpec, actor: ActorState, goal: Vec3 | null, mode: Mode): { yaw: number; jump: boolean } | null {
  const arena = isArenaMode(mode), graph = world.navigation;
  const anchor = goal ? navigationAnchor(world, goal, arena) : undefined;
  const connected = new Set<number>(), queue = anchor === undefined ? [] : [anchor];
  if (anchor !== undefined) connected.add(anchor);
  // Label the destination's component once. Running a full path search for
  // every movement probe could consume an entire worker frame.
  for (let i = 0; i < queue.length; i++) for (const next of graph!.links[queue[i]]) {
    const point = graph!.points[next];
    if (connected.has(next) || arena && !inArena(point.x, point.z, .5)) continue;
    connected.add(next); queue.push(next);
  }
  const exits = queue.map(index => graph!.points[index]).filter(point => Math.hypot(point.x - actor.pos.x, point.z - actor.pos.z) < 18);
  let best: { yaw: number; jump: boolean } | null = null, score = -Infinity, regainedRoute = false;
  for (const jump of [false, true]) {
    for (let i = 0; i < 16; i++) {
      const yaw = i * Math.PI / 8;
      const probe: ActorState = { ...actor, pos: { ...actor.pos }, velocity: { ...actor.velocity }, yaw, emote: null, crouch: false };
      const input = { ...emptyInput(), yaw, moveZ: 1, jump };
      let safe = true, recent = { ...probe.pos };
      for (let tick = 0; tick < RECOVERY_SECONDS * 60; tick++) {
        if (tick === (RECOVERY_SECONDS - .5) * 60) recent = { ...probe.pos };
        moveActor(probe, input, world, 1 / 60, 1, mode);
        input.jump = false;
        if ((!actor.swimming && probe.swimming) || actor.pos.y - probe.pos.y > 6 || probe.bounceSeq !== actor.bounceSeq ||
          arena && !inArena(probe.pos.x, probe.pos.z, .5)) { safe = false; break; }
      }
      const progress = Math.hypot(probe.pos.x - actor.pos.x, probe.pos.z - actor.pos.z);
      // A different dead end is not an escape. Keep moving through the final
      // half-second, rather than accepting a short slide into the next wall.
      if (!safe || progress < 1.2 || Math.hypot(probe.pos.x - recent.x, probe.pos.z - recent.z) < .5 ||
        !probe.grounded && !probe.swimming) continue;
      const onRoute = Math.abs(probe.pos.y - walkableHeight(probe.pos.x, probe.pos.z, world)) < .5 &&
        walkableSegment(world, probe.pos, probe.pos, arena) &&
        (!graph || exits.some(point => Math.hypot(point.x - probe.pos.x, point.z - probe.pos.z) < 10 &&
          walkableSegment(world, probe.pos, point, arena)));
      const value = progress + (onRoute ? 16 : 0) - (jump ? 2 : 0) -
        (goal ? Math.hypot(probe.pos.x - goal.x, probe.pos.z - goal.z) * .02 : 0);
      if (value > score) { score = value; best = { yaw, jump }; regainedRoute = onRoute; }
    }
    if (regainedRoute) break;
  }
  return best;
}

export { ColliderGrid } from '../shared/collider-grid';
