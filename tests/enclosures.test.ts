import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/shared/world';
import { clearSpawn, moveActor } from '../src/shared/collision';
import { colliderGrid } from '../src/shared/collider-grid';
import { walkableHeight, walkableSegment } from '../src/shared/navigation';
import { terrainHeight } from '../src/shared/terrain';
import { emptyInput } from '../src/shared/math';
import { Simulation } from '../src/simulation';
import { DEFAULT_CONFIG, type ActorState, type Vec3 } from '../src/shared/types';

// A walled quintal without a gate sealed in any capybara that parachuted or
// wandered into it (x 6, z 68 and x 14.6, z -49.1 had none). Walkability is
// mapped on a 1 m grid; any pocket cut off from the island-wide network is then
// explored with the real movement code, walking only, and must still reach it.
const world = createWorld(), HALF = 120, SIDE = 2 * HALF + 1;
const cell = (x: number, z: number) => {
  const ix = Math.round(x + HALF), iz = Math.round(z + HALF);
  return ix < 0 || iz < 0 || ix >= SIDE || iz >= SIDE ? -1 : iz * SIDE + ix;
};
const component = new Int32Array(SIDE * SIDE).fill(-1), sizes: number[] = [];
{
  const open = new Uint8Array(SIDE * SIDE);
  for (let i = 0; i < open.length; i++) open[i] = walkableSegment(world, { x: i % SIDE - HALF, z: Math.floor(i / SIDE) - HALF }, { x: i % SIDE - HALF, z: Math.floor(i / SIDE) - HALF }) ? 1 : 0;
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || component[start] >= 0) continue;
    const queue = [start]; component[start] = sizes.length;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], ix = c % SIDE, iz = (c - ix) / SIDE;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ix + dx, nz = iz + dz, n = nz * SIDE + nx;
        if (nx < 0 || nz < 0 || nx >= SIDE || nz >= SIDE || !open[n] || component[n] >= 0) continue;
        if (!walkableSegment(world, { x: ix - HALF, z: iz - HALF }, { x: nx - HALF, z: nz - HALF })) continue;
        component[n] = sizes.length; queue.push(n);
      }
    }
    sizes.push(queue.length);
  }
}
const MAIN = sizes.indexOf(Math.max(...sizes));
const onMain = (p: Vec3) => { const c = cell(p.x, p.z); return c >= 0 && component[c] === MAIN && Math.abs(p.y - walkableHeight(p.x, p.z, world)) < .6; };
const body = new Simulation(world, { ...DEFAULT_CONFIG, bots: false }, [{ id: 'probe', name: 'probe', color: '#ffffff' }] as never, 'enclosures', 1).snapshot().actors[0];

/** Whether a capybara starting at `from` reaches the island network in one-second moves in 16 directions. */
function reachesNetwork(from: Vec3, jump: boolean, budget = 220): boolean {
  if (onMain(from)) return true;
  const key = (p: Vec3) => cell(p.x, p.z) * 64 + Math.round(p.y * 2), seen = new Set([key(from)]), queue = [from];
  for (let i = 0; i < queue.length && i < budget; i++) for (let k = 0; k < 16; k++) {
    const actor: ActorState = { ...structuredClone(body), stage: 'ground', alive: true, grounded: true, pos: { ...queue[i] }, velocity: { x: 0, y: 0, z: 0 }, yaw: k * Math.PI / 8 };
    // One second of walking, then until the capybara stands (or swims) again: never resume from mid-air.
    for (let f = 0; f < 240 && (f < 60 || !(actor.grounded || actor.swimming)); f++)
      moveActor(actor, { ...emptyInput(), moveZ: f < 60 ? 1 : 0, jump: jump && f % 20 === 2 && f < 60 }, world, 1 / 60);
    if (onMain(actor.pos)) return true;
    if (!seen.has(key(actor.pos))) { seen.add(key(actor.pos)); queue.push({ ...actor.pos }); }
  }
  return false;
}
const centre = (index: number) => {
  let x = 0, z = 0, n = 0;
  for (let c = 0; c < component.length; c++) if (component[c] === index) { x += c % SIDE - HALF; z += Math.floor(c / SIDE) - HALF; n++; }
  return { x: x / n, z: z / n };
};

// These walk the whole island against the full rock hulls (the coastal stones became solid), about 2.5 and 7 s on an M2
// and over twice that on a CI runner; the simulation's own tick cost measured unchanged (0.94 against 0.97 ms).
const WALK_TIMEOUT = 60_000;

describe('no walkable place on the island is sealed off', () => {
  it('every ground pocket a capybara can stand in walks out to the island network', () => {
    const sealed: string[] = [];
    sizes.forEach((size, index) => {
      if (index === MAIN || size < 4) return;
      const start = component.indexOf(index), x = start % SIDE - HALF, z = Math.floor(start / SIDE) - HALF;
      if (!reachesNetwork({ x, y: walkableHeight(x, z, world), z }, false)) {
        const at = centre(index); sealed.push(`${size} m2 at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`);
      }
    });
    expect(sealed).toEqual([]);
  }, WALK_TIMEOUT);

  it('every roof, terrace and tower top a parachute can land on leads back down', () => {
    const tops = new Map<string, Vec3[]>();
    for (let c = 0; c < component.length; c++) {
      const x = c % SIDE - HALF, z = Math.floor(c / SIDE) - HALF;
      let top = -Infinity, id = '';
      for (const box of colliderGrid(world).query(x, z, x, z))
        if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z && box.max.y > top) { top = box.max.y; id = box.pieceId ?? box.id; }
      if (top < terrainHeight(x, z) + 2.5 || !clearSpawn({ x, y: top, z }, world)) continue;
      (tops.get(id) ?? tops.set(id, []).get(id)!).push({ x, y: top, z });
    }
    const sealed: string[] = [];
    for (const [id, cells] of tops) {
      if (cells.length < 4) continue;
      const mid = cells.reduce((m, p) => ({ x: m.x + p.x / cells.length, z: m.z + p.z / cells.length }), { x: 0, z: 0 });
      const start = [...cells].sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z))[0];
      // A parapet may need a hop, as in any battle royale; a sealed top may not.
      if (!reachesNetwork(start, true)) sealed.push(`${id} at ${start.x}, ${start.y.toFixed(1)}, ${start.z}`);
    }
    expect(tops.size).toBeGreaterThan(50);
    expect(sealed).toEqual([]);
  }, WALK_TIMEOUT);

  it('spawns, loot and chests all sit where a capybara walks to the island network', () => {
    const stuck = [...world.spawns.map(s => ({ id: `spawn ${s.mode}`, pos: { x: s.x, y: s.y, z: s.z } })),
      ...world.loot.map(l => ({ id: l.id, pos: { x: l.x, y: l.y, z: l.z } })), ...world.chests.map(c => ({ id: c.id, pos: { x: c.x, y: c.y, z: c.z } }))]
      .filter(item => !reachesNetwork(item.pos, false, 60)).map(item => `${item.id} at ${item.pos.x.toFixed(1)}, ${item.pos.z.toFixed(1)}`);
    expect(stuck).toEqual([]);
  });
});
