import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/shared/world';
import { terrainHeight } from '../src/shared/terrain';
import { clearSpawn, hasLineOfSight, raycastWorld } from '../src/shared/collision';
import { resolveImpact } from '../src/simulation/surface';
import { WEAPONS } from '../src/shared/weapons';
import type { Vec3, WeaponId } from '../src/shared/types';
// @ts-expect-error This catalog is also loaded directly by the Node capture tools.
import { SCENARIOS } from '../tools/vfx/scenarios.mjs';

type Scenario = { scene: { x: number; y?: number; z: number; weapon?: WeaponId; actors?: { id: string; x: number; y?: number; z: number }[] };
  events?: { type?: string; item?: string; call?: string; args?: unknown[] }[] };
const world = createWorld(), scenarios = Object.entries(SCENARIOS) as [string, Scenario][];
const feet = (p: { x: number; y?: number; z: number }): Vec3 => ({ x: p.x, y: p.y ?? terrainHeight(p.x, p.z), z: p.z });

describe('VFX review evidence uses the current island', () => {
  it.each(scenarios)('%s has real standing places, visible targets and existing pickups', (_name, scenario) => {
    const from = feet(scenario.scene), eye = { ...from, y: from.y + 1.62 };
    expect(clearSpawn(from, world), 'observer in a solid').toBe(true);
    for (const actor of scenario.scene.actors ?? []) {
      const target = feet(actor);
      expect(clearSpawn(target, world), `${actor.id} in a solid`).toBe(true);
      expect(hasLineOfSight(eye, { ...target, y: target.y + 1.2 }, world), `${actor.id} hidden`).toBe(true);
    }
    for (const event of scenario.events ?? []) if (event.type === 'pickup') {
      expect([...world.loot, ...world.chests].some(item => item.id === event.item), `missing ${event.item}`).toBe(true);
    }
  });

  it('each surface review actually strikes its named material', () => {
    for (const [name, scenario] of scenarios.filter(([name]) => name.startsWith('c-impact-'))) {
      const origin = feet(scenario.scene); origin.y += 1.62;
      const aim = scenario.events![0].args![1] as Vec3, end = feet({ ...aim, y: terrainHeight(aim.x, aim.z) + aim.y });
      const delta = { x: end.x - origin.x, y: end.y - origin.y, z: end.z - origin.z }, length = Math.hypot(delta.x, delta.y, delta.z);
      const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
      const range = WEAPONS[scenario.scene.weapon ?? 'm4'].range;
      const hit = resolveImpact(origin, direction, raycastWorld(origin, direction, range, world), range);
      expect(hit?.surface, name).toBe(name.slice('c-impact-'.length));
    }
  });
});
