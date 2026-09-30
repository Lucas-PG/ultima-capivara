// Fairness against a human: one bot against a strafing, invulnerable player on
// open ground. Reports the tell before the first shot, hit rate and the time a
// bot needs to deal 100 damage, per difficulty, distance and weapon.
// npx tsx scripts/bot-duel-audit.ts [seeds=8] [output.json]
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import { emptyInput, rng } from '../src/shared/math';
import { WEAPONS } from '../src/shared/weapons';
import type { ActorState, Difficulty, InputFrame, WeaponId, WorldSpec } from '../src/shared/types';

const [count = '8', output] = process.argv.slice(2);
type Runtime = { state: ActorState; brain: any; input: InputFrame };
const rows: Record<string, unknown>[] = [];

function duel(difficulty: Difficulty, distance: number, weapon: WeaponId, seed: number, strafe: boolean) {
  const world: WorldSpec = {
    version: 'duel-audit', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'deathmatch' }],
  };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty, duration: 300 },
    [{ id: 'player', name: 'Player', color: '#fff', ready: true, connected: true }], 'duel-audit', seed);
  for (let i = 0; i < 13; i++) sim.step(.25);
  const actors = (sim as any).actors as Map<string, Runtime>, player = actors.get('player')!, bot = actors.get('bot-1')!;
  for (const [id, actor] of actors) if (id !== 'player' && id !== 'bot-1') Object.assign(actor.state, { alive: false, hp: 0, respawnAt: 1e9 });
  Object.assign(player.state, { pos: { x: 0, y: terrainHeight(0, 0), z: 0 }, hp: 1e6, protectionUntil: 0, alive: true });
  Object.assign(bot.state, { pos: { x: 0, y: terrainHeight(0, -distance), z: -distance }, yaw: Math.PI, pitch: 0, protectionUntil: 0,
    weapons: [{ id: weapon, ammo: WEAPONS[weapon].magazine, reserve: 300, rarity: 0, box: 0 }], slot: 0 });
  bot.brain.thinkAt = 0; bot.brain.lastPos = { ...bot.state.pos };
  sim.drainEvents();
  const random = rng(seed * 7919), start = (sim as any).time as number;
  let seq = 1_000_000, direction = 1, switchAt = 0, first: number | null = null, shots = 0, hits = 0, damage = 0, lethal: number | null = null;
  for (let tick = 0; tick < 12 * 60 && lethal === null; tick++) {
    const now = (sim as any).time as number;
    if (strafe && now >= switchAt) { direction = -direction; switchAt = now + .45 + random() * .7; }
    // The player faces the bot and strafes, as a human trading shots would.
    const yaw = Math.atan2(-(bot.state.pos.x - player.state.pos.x), -(bot.state.pos.z - player.state.pos.z));
    sim.input('player', { ...emptyInput(), seq: seq++, clientTime: now, yaw, moveX: strafe ? direction : 0 });
    sim.step(1 / 60);
    for (const event of sim.drainEvents()) {
      if (event.type === 'shot' && event.actor === 'bot-1') { shots++; first ??= (sim as any).time - start; }
      if (event.type === 'damage' && event.actor === 'bot-1' && event.target === 'player') {
        hits++; damage += event.amount;
        if (damage >= 100 && lethal === null) lethal = (sim as any).time - start;
      }
    }
  }
  return { first, shots, hits, lethal };
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) for (const weapon of ['pistol', 'smg', 'm4'] as WeaponId[])
  for (const distance of [10, 20, 35]) for (const strafe of [false, true]) {
    const runs = Array.from({ length: Number(count) }, (_, i) => duel(difficulty, distance, weapon, i + 1, strafe));
    const row = { difficulty, weapon, distance, strafe,
      firstShotS: +mean(runs.flatMap(r => r.first ?? [])).toFixed(2),
      hitRate: +(runs.reduce((a, r) => a + r.hits, 0) / Math.max(1, runs.reduce((a, r) => a + r.shots, 0))).toFixed(2),
      // Time from exposure until 100 damage (an unarmoured player's health); 12 s cap.
      timeTo100S: +mean(runs.map(r => r.lethal ?? 12)).toFixed(2) };
    rows.push(row); console.log(JSON.stringify(row));
  }
if (output) writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
