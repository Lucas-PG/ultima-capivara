// Seeded bot trials: how quickly bots kill a human who is still looting, and
// whether any bot does something visibly dumb. CPU only, no rendering.
// Usage: npx tsx scripts/bot-trials.ts [seeds=12] [difficulty=normal]
import { Simulation } from '../src/simulation';
import { createWorld } from '../src/shared/world';
import { inArena } from '../src/shared/layout';
import type { ActorState, Difficulty, GameEvent, InputFrame } from '../src/shared/types';

const TICK = 1 / 60;
const world = createWorld();
type Runtime = { state: ActorState; input: InputFrame; brain: any };
type Sanity = { botSeconds: number; pushing: number; stuck: number; spins: number; jitter: number; openReload: number };

// A new player who loots and never shoots back: the worst case for early deaths.
function humanInput(sim: Simulation, me: ActorState, seq: number, dm: boolean): InputFrame {
  const snapshot = sim.snapshot();
  let best: { x: number; z: number; id: string } | null = null, bd = dm ? 40 : 30;
  for (const loot of snapshot.loot) {
    if (!loot.active || (dm && !inArena(loot.x, loot.z))) continue;
    const d = Math.hypot(loot.x - me.pos.x, loot.z - me.pos.z);
    if (d < bd && Math.abs(loot.y - me.pos.y) < 2) { bd = d; best = loot; }
  }
  const goal = best || { x: snapshot.zone.x, z: snapshot.zone.z, id: '' };
  if (best && bd < 2.2) sim.action(me.id, { type: 'interact', id: seq, target: best.id });
  const yaw = Math.atan2(-(goal.x - me.pos.x), -(goal.z - me.pos.z));
  return { seq, moveX: 0, moveZ: Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z) > 1.5 ? 1 : 0, yaw, pitch: 0, sprint: true, crouch: false,
    jump: false, fire: false, ads: false, lean: 0, clientTime: snapshot.time };
}

function sanityTracker() {
  const last = new Map<string, { yaw: number; turn: number; flips: number[]; turns: { t: number; d: number }[]; window: { t: number; x: number; z: number } | null }>();
  const s: Sanity = { botSeconds: 0, pushing: 0, stuck: 0, spins: 0, jitter: 0, openReload: 0 };
  return {
    s,
    sample(sim: Simulation) {
      const time = sim.snapshot().time;
      for (const a of ((sim as any).actors as Map<string, Runtime>).values()) {
        const st = a.state, b = a.brain;
        if (!b || !st.alive || st.stage !== 'ground') { last.delete(st.id); continue; }
        s.botSeconds += TICK;
        const moving = Math.hypot(a.input.moveX, a.input.moveZ) > .3, speed = Math.hypot(st.velocity.x, st.velocity.z);
        if (moving && speed < .6 && !st.using) s.pushing += TICK;
        const fighting = b.sees || b.mode === 'fight';
        if (st.reloadUntil && b.sees && b.mode !== 'cover' && speed < .8) s.openReload += TICK;
        const l = last.get(st.id) || { yaw: st.yaw, turn: 0, flips: [], turns: [], window: null };
        const d = Math.atan2(Math.sin(st.yaw - l.yaw), Math.cos(st.yaw - l.yaw));
        // Jitter: the turn direction reverses more than 4 times within a second while not fighting.
        if (Math.abs(d) > .01 && Math.sign(d) !== Math.sign(l.turn) && l.turn !== 0 && !fighting) l.flips.push(time);
        l.flips = l.flips.filter(t => time - t < 1);
        if (l.flips.length > 4) { s.jitter++; l.flips = []; }
        if (Math.abs(d) > .01) l.turn = d;
        // Spinning: a full turn in one direction within 2 s while not fighting.
        l.turns.push({ t: time, d: fighting ? 0 : d }); l.turns = l.turns.filter(x => time - x.t < 2);
        if (Math.abs(l.turns.reduce((sum, x) => sum + x.d, 0)) > Math.PI * 2) { s.spins++; l.turns = []; }
        // Stuck: trying to move but less than 0.4 m of progress in a second.
        if (!moving) l.window = null;
        else if (!l.window) l.window = { t: time, x: st.pos.x, z: st.pos.z };
        else if (time - l.window.t >= 1) {
          if (Math.hypot(st.pos.x - l.window.x, st.pos.z - l.window.z) < .4) s.stuck++;
          l.window = { t: time, x: st.pos.x, z: st.pos.z };
        }
        l.yaw = st.yaw; last.set(st.id, l);
      }
    },
  };
}

export function battleRoyale(seed: number, difficulty: Difficulty, window = 30) {
  const sim = new Simulation(world, { mode: 'battle-royale', capacity: 8, bots: true, difficulty, duration: 480 },
    [{ id: 'human', name: 'Human', color: '#1fb5a8', ready: true, connected: true }], `bot-trial-${seed}`, seed);
  const actors = (sim as any).actors as Map<string, Runtime>, human = actors.get('human')!;
  // The human picks a landing spot the way bots do, and glides there.
  const plan = { land: null as any, jumpAt: 0 };
  (sim as any).planLanding(plan);
  const sanity = sanityTracker();
  let seq = 0, landedAt = -1, firstHit = -1, damage = 0, died = false, time = 0;
  while (time < 200) {
    const me = human.state;
    time = sim.snapshot().time;
    if (me.stage === 'plane' && time >= plan.jumpAt && sim.snapshot().phase === 'playing') (sim as any).drop(human);
    if (me.stage === 'falling' || me.stage === 'parachute') { human.brain = plan; (sim as any).botAir(human); human.brain = null; }
    else if (me.stage === 'ground' && me.alive) sim.input('human', humanInput(sim, me, ++seq, false));
    sim.step(TICK);
    for (const e of sim.drainEvents() as GameEvent[]) {
      if (landedAt < 0 || time - landedAt > window) continue;
      if (e.type === 'damage' && e.target === 'human' && e.actor) { damage += e.amount; if (firstHit < 0) firstHit = time - landedAt; }
      if (e.type === 'kill' && e.target === 'human') died = true;
    }
    if (landedAt < 0 && me.stage === 'ground') landedAt = time;
    if (landedAt >= 0) sanity.sample(sim);
    if (landedAt >= 0 && time - landedAt > Math.max(window, 90)) break;
  }
  return { seed, landedAt: +landedAt.toFixed(1), died, firstHit: firstHit < 0 ? null : +firstHit.toFixed(2), damage: Math.round(damage), sanity: sanity.s };
}

export function correria(seed: number, difficulty: Difficulty, window = 60) {
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty, duration: 300 },
    [{ id: 'human', name: 'Human', color: '#1fb5a8', ready: true, connected: true }], `bot-trial-dm-${seed}`, seed);
  const human = ((sim as any).actors as Map<string, Runtime>).get('human')!;
  const sanity = sanityTracker();
  let seq = 0, deaths = 0, damage = 0, firstHit = -1, time = 0, start = -1;
  while (true) {
    const snap = sim.snapshot(); time = snap.time;
    if (snap.phase === 'playing' && start < 0) start = time;
    if (start >= 0 && time - start >= window) break;
    if (human.state.alive) sim.input('human', humanInput(sim, human.state, ++seq, true));
    sim.step(TICK);
    for (const e of sim.drainEvents() as GameEvent[]) {
      if (e.type === 'damage' && e.target === 'human' && e.actor) { damage += e.amount; if (firstHit < 0) firstHit = time - start; }
      if (e.type === 'kill' && e.target === 'human') deaths++;
    }
    if (start >= 0) sanity.sample(sim);
  }
  return { seed, deaths, firstHit: firstHit < 0 ? null : +firstHit.toFixed(2), damage: Math.round(damage), sanity: sanity.s };
}

const perMinute = (n: number, seconds: number) => (n / Math.max(1, seconds / 60)).toFixed(2);
if (process.argv[1]?.endsWith('bot-trials.ts')) {
  const seeds = Number(process.argv[2] || 12), difficulty = (process.argv[3] || 'normal') as Difficulty;
  const br = Array.from({ length: seeds }, (_, i) => battleRoyale(i + 1, difficulty));
  const dm = Array.from({ length: seeds }, (_, i) => correria(i + 1, difficulty));
  const total = (rows: { sanity: Sanity }[]) => rows.reduce((t, r) => { for (const k of Object.keys(t) as (keyof Sanity)[]) t[k] += r.sanity[k]; return t; },
    { botSeconds: 0, pushing: 0, stuck: 0, spins: 0, jitter: 0, openReload: 0 } as Sanity);
  console.log(`# Bot trials (${difficulty}, seeds 1-${seeds})\n`);
  console.log('## Battle royale, first 30 s after landing (human loots, never shoots)\n');
  console.log('| seed | landed s | died | first hit s | damage |\n|---|---|---|---|---|');
  for (const r of br) console.log(`| ${r.seed} | ${r.landedAt} | ${r.died ? 'yes' : 'no'} | ${r.firstHit ?? '-'} | ${r.damage} |`);
  console.log(`\nDeaths: ${br.filter(r => r.died).length}/${seeds}. Mean damage ${Math.round(br.reduce((s, r) => s + r.damage, 0) / seeds)}.\n`);
  console.log('## Correria, first 60 s (human loots, never shoots)\n');
  console.log('| seed | deaths | first hit s | damage |\n|---|---|---|---|');
  for (const r of dm) console.log(`| ${r.seed} | ${r.deaths} | ${r.firstHit ?? '-'} | ${r.damage} |`);
  console.log(`\nDeaths: ${dm.reduce((s, r) => s + r.deaths, 0)} in ${seeds} minutes. Mean damage ${Math.round(dm.reduce((s, r) => s + r.damage, 0) / seeds)}.\n`);
  for (const [name, rows] of [['Battle royale (90 s after landing)', br], ['Correria (60 s)', dm]] as const) {
    const t = total(rows);
    console.log(`## Bot sanity, ${name}: ${Math.round(t.botSeconds / 60)} bot-minutes\n`);
    console.log(`| per bot-minute | pushing into walls s | stuck events | spins | jitter bursts | reloading in the open s |\n|---|---|---|---|---|---|`);
    console.log(`| | ${perMinute(t.pushing, t.botSeconds)} | ${perMinute(t.stuck, t.botSeconds)} | ${perMinute(t.spins, t.botSeconds)} | ${perMinute(t.jitter, t.botSeconds)} | ${perMinute(t.openReload, t.botSeconds)} |\n`);
  }
}
