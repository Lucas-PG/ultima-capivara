// Complete, seeded matches at 60 Hz, without a renderer or a stationary human target.
// npx tsx scripts/bot-match-audit.ts <output.json> [seeds=3] [difficulty=normal] [firstSeed=1]
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/simulation';
import type { BotBrain } from '../src/simulation/bots';
import { createWorld } from '../src/shared/world';
import type { ActorState, Difficulty, InputFrame, Mode, Vec3 } from '../src/shared/types';

const [output, count = '3', difficulty = 'normal', firstSeed = '1'] = process.argv.slice(2);
const world = createWorld(), rows: unknown[] = [];
type Runtime = { state: ActorState; input: InputFrame; brain: BotBrain };
for (const mode of ['battle-royale', 'deathmatch'] as Mode[]) for (let seed = Number(firstSeed); seed < Number(firstSeed) + Number(count); seed++) {
  const started = performance.now(), cpuStarted = process.cpuUsage();
  const sim = new Simulation(world, { mode, capacity: 8, bots: true, difficulty: difficulty as Difficulty, duration: 300 }, [], `audit-${seed}`, seed);
  const actors = (sim as any).actors as Map<string, Runtime>;
  const last = new Map<string, { pos: Vec3; moving: boolean; stuck: number; deaths: number }>();
  const encounters = new Map<string, number>(), stuckSites = new Map<string, number>();
  const metrics = { botSeconds: 0, movingSeconds: 0, stuckSeconds: 0, longestStuck: 0, swimmingSeconds: 0, stormSeconds: 0,
    engagements: 0, shots: 0, hits: 0, pickups: 0, coverSeconds: 0, fallDeaths: 0, stormDeaths: 0, combatDeaths: 0, deathsInWater: 0 };
  let tick = 0;
  const tickMs: number[] = [];
  while ((sim as any).phase !== 'results' && tick < 900 * 60) {
    const tickStart = performance.now();
    sim.step(1 / 60); tick++;
    tickMs.push(performance.now() - tickStart);
    const time = tick / 60;
    for (const event of sim.drainEvents()) {
      if (event.type === 'shot') {
        metrics.shots++;
        const target = actors.get(event.actor)?.brain.target;
        if (target) {
          const pair = [event.actor, target].sort().join('/');
          if (time - (encounters.get(pair) ?? -99) > 5) metrics.engagements++;
          encounters.set(pair, time);
        }
      }
      if (event.type === 'damage' && event.actor) metrics.hits++;
      if (event.type === 'pickup') metrics.pickups++;
      if (event.type === 'kill') {
        if (event.weapon === 'fall') metrics.fallDeaths++;
        else if (event.weapon === 'storm') metrics.stormDeaths++;
        else metrics.combatDeaths++;
        if (actors.get(event.target)?.state.swimming) metrics.deathsInWater++;
      }
    }
    if (tick % 60) continue;
    for (const { state: s, input, brain } of actors.values()) {
      if (!s.alive || s.stage !== 'ground') { last.delete(s.id); continue; }
      metrics.botSeconds++;
      if (s.swimming) metrics.swimmingSeconds++;
      if (brain.mode === 'cover') metrics.coverSeconds++;
      const zone = (sim as any).zone;
      if (mode === 'battle-royale' && Math.hypot(s.pos.x - zone.x, s.pos.z - zone.z) > zone.radius) metrics.stormSeconds++;
      const moving = Math.hypot(input.moveX, input.moveZ) > .3 && !s.using && (s.grounded || s.swimming);
      if (moving) metrics.movingSeconds++;
      const prev = last.get(s.id);
      const stuck = moving && prev?.moving && prev.deaths === s.deaths && Math.hypot(s.pos.x - prev.pos.x, s.pos.y - prev.pos.y, s.pos.z - prev.pos.z) < .4;
      const seconds = stuck ? prev.stuck + 1 : 0;
      if (stuck) {
        metrics.stuckSeconds++; metrics.longestStuck = Math.max(metrics.longestStuck, seconds);
        const key = `${Math.round(s.pos.x / 2) * 2},${Math.round(s.pos.z / 2) * 2},${brain.mode},${s.swimming ? 'water' : 'dry'}`;
        stuckSites.set(key, (stuckSites.get(key) ?? 0) + 1);
      }
      last.set(s.id, { pos: { ...s.pos }, moving, stuck: seconds, deaths: s.deaths });
    }
  }
  tickMs.sort((a, b) => a - b);
  const cpu = process.cpuUsage(cpuStarted);
  const result = { mode, seed, difficulty, complete: (sim as any).phase === 'results', seconds: +(tick / 60).toFixed(2),
    tickP95Ms: +tickMs[Math.floor(tickMs.length * .95)].toFixed(3),
    tickP99Ms: +tickMs[Math.floor(tickMs.length * .99)].toFixed(3), tickMaxMs: +tickMs.at(-1)!.toFixed(3),
    wallSeconds: +((performance.now() - started) / 1000).toFixed(2),
    cpuSeconds: +((cpu.user + cpu.system) / 1e6).toFixed(2), ...metrics,
    stuckPerBotMinute: +(metrics.stuckSeconds * 60 / metrics.botSeconds).toFixed(3),
    stuckSites: [...stuckSites].sort((a, b) => b[1] - a[1]).slice(0, 20) };
  rows.push(result); writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
