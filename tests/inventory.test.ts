import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import { indexOfBox, planPickup } from '../src/shared/inventory';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import type { LootSpawn, PlayerProfile, RoomConfig, WeaponId, WorldSpec } from '../src/shared/types';

// The user's complaints: replacing a carried gun silently destroyed it, and key
// numbers meant different weapons as the inventory changed. These tests pin the
// rules that fix both: nothing carried is ever lost, and boxes never move.
const gun = (id: string, weapon: WeaponId, x: number, z: number): LootSpawn => ({ id, kind: 'weapon', weapon, x, y: terrainHeight(x, z), z });
const world = (loot: LootSpawn[]): WorldSpec => ({
  version: 'test', size: 256, objects: [], districts: [], chests: [], colliders: [], loot,
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 }],
});
const arena: RoomConfig = { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const player: PlayerProfile = { id: 'a', name: 'A', color: '#111111', ready: true, connected: true };
function start(loot: LootSpawn[], config = arena) {
  const sim = new Simulation(world(loot), config, [player], 'inv', 7);
  for (let i = 0; i < 13; i++) sim.step(.25);
  let id = 0;
  const act = (action: any) => sim.action('a', { ...action, id: ++id });
  const me = () => sim.snapshot().actors[0];
  return { sim, act, me };
}
const carried = (weapons: { id: WeaponId; box: number }[]) => weapons.map(w => `${w.box}:${w.id}`);

describe('inventory', () => {
  it('swaps a full class with the held gun and drops the old one with its ammo, never destroying it', () => {
    const { sim, act, me } = start([gun('m4', 'm4', 0, -1), gun('sniper', 'sniper', .6, -1)]);
    act({ type: 'interact', target: 'm4' }); // fills the free second primary box
    expect(carried(me().weapons)).toEqual(['0:smg', '1:m4', '2:pistol', '3:machete']);
    expect(me().weapons[me().slot].id).toBe('smg'); // a free box does not steal the held gun
    // The dropped copy must carry exactly the magazine and reserve it had.
    const smg = me().weapons.find(w => w.id === 'smg')!;
    expect(smg.ammo).toBeGreaterThan(0);
    act({ type: 'interact', target: 'sniper' });
    expect(carried(me().weapons)).toEqual(['0:sniper', '1:m4', '2:pistol', '3:machete']);
    expect(me().weapons[me().slot].id).toBe('sniper');
    const dropped = sim.snapshot().loot.find(l => l.active && l.weapon === 'smg')!;
    expect(dropped).toBeTruthy();
    expect([dropped.ammo, dropped.reserve]).toEqual([smg.ammo, smg.reserve]);
    act({ type: 'interact', target: dropped.id });
    expect(carried(me().weapons)).toEqual(['0:smg', '1:m4', '2:pistol', '3:machete']);
    expect(me().weapons.find(w => w.id === 'smg')).toMatchObject({ ammo: smg.ammo, reserve: smg.reserve });
    expect(sim.snapshot().loot.some(l => l.active && l.weapon === 'sniper')).toBe(true);
  });

  it('selecting another carried weapon keeps every weapon', () => {
    const { act, me } = start([]);
    const before = carried(me().weapons);
    for (const slot of [1, 2, 0, 2, 1]) act({ type: 'slot', slot });
    expect(carried(me().weapons)).toEqual(before);
    expect(me().weapons[me().slot].id).toBe('pistol');
  });

  it('drops the held gun on G, keeps the facão, and never renumbers the other boxes', () => {
    const { sim, act, me } = start([gun('m4', 'm4', 0, -1)]);
    act({ type: 'interact', target: 'm4' });
    act({ type: 'drop' });
    expect(carried(me().weapons)).toEqual(['1:m4', '2:pistol', '3:machete']);
    expect(me().weapons[me().slot].id).toBe('m4');
    expect(indexOfBox(me().weapons, 1)).toBe(me().slot);
    expect(sim.snapshot().loot.some(l => l.active && l.weapon === 'smg')).toBe(true);
    act({ type: 'drop' }); act({ type: 'drop' });
    expect(carried(me().weapons)).toEqual(['3:machete']);
    act({ type: 'drop' });
    expect(carried(me().weapons)).toEqual(['3:machete']);
  });

  it('arena drops fade out so the plaza does not fill with guns', () => {
    const { sim, act } = start([]);
    act({ type: 'drop' });
    expect(sim.snapshot().loot.filter(l => l.active && l.weapon === 'smg')).toHaveLength(1);
    for (let i = 0; i < 4 * 27; i++) sim.step(.25);
    expect(sim.snapshot().loot.some(l => l.weapon === 'smg')).toBe(false);
  });

  it('plans the same rule the prompt shows', () => {
    const weapons = [{ id: 'smg', box: 0 }, { id: 'm4', box: 1 }, { id: 'pistol', box: 2 }, { id: 'machete', box: 3 }].map(w => ({ ...w, ammo: 1, reserve: 1, rarity: 0 })) as any;
    expect(planPickup(weapons, 1, 'sniper')).toEqual({ kind: 'swap', index: 1, box: 1 });
    expect(planPickup(weapons, 3, 'sniper')).toEqual({ kind: 'swap', index: 0, box: 0 }); // holding the facão
    expect(planPickup(weapons, 0, 'revolver')).toEqual({ kind: 'swap', index: 2, box: 2 });
    expect(planPickup(weapons, 0, 'm4')).toEqual({ kind: 'merge', index: 1 });
  });

  it('carries boxes over the network and rejects an out-of-order loadout', () => {
    const { sim, act } = start([]);
    act({ type: 'drop' });
    const snapshot = { ...sim.snapshot(), matchId: 'ab'.repeat(24) };
    const rebuilt = rebuildFrame(fastPart(snapshot), worldPart(snapshot), gearPart(snapshot))!;
    expect(carried(rebuilt.actors[0].weapons)).toEqual(['2:pistol', '3:machete']);
    const gear = gearPart(snapshot); gear[0].weapons.reverse();
    expect(rebuildFrame(fastPart(snapshot), worldPart(snapshot), gear)).toBeNull();
  });
});

describe('ammo flow', () => {
  it('an empty gun with no reserve hands over to the next gun instead of dry-firing', () => {
    const { sim, me } = start([]);
    const actor = (sim as any).actors.get('a');
    actor.state.weapons[0].ammo = 0; actor.state.weapons[0].reserve = 0;
    const time = sim.snapshot().time;
    sim.input('a', { seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: true, ads: false, lean: 0, clientTime: time });
    sim.step(.1);
    expect(me().weapons[me().slot].id).toBe('pistol');
  });
});
