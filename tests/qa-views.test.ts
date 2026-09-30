import { describe, expect, it } from 'vitest';
import { actorEye, clearSpawn, raycastWorld } from '../src/shared/collision';
import { colliderGrid } from '../src/shared/collider-grid';
import { terrainHeight } from '../src/shared/terrain';
import { waterAt } from '../src/shared/water';
import { crownAt, foliageSpan, plantCrown } from '../src/shared/vegetation-crowns';
import { vegetationDressing } from '../src/shared/vegetation-dressing';
import { plantTrunkSections } from '../src/shared/vegetation-trunks';
import { createWorld } from '../src/shared/world';
import type { ActorState, Vec3 } from '../src/shared/types';
import { DISTRICT_VIEWS, VIEWS, viewStance, type WorldView } from './visual/qa-views';

// Review poses went stale as the town was rebuilt: one stood inside a new
// house, two stared at deck planks from inside a pier, one looked into a
// roof. Every named world view must stand where a capybara can stand, with
// its eye in the open and nothing solid or leafy filling the first 2 m.
const world = createWorld();
const REACH = 2;
const views: [string, WorldView][] = [
  ...Object.entries(VIEWS).filter(([name]) => !name.startsWith('swim')),
  ...world.districts.map(d => [`district-${d.id}`, DISTRICT_VIEWS[d.id]] as [string, WorldView]),
];
const standing = { crouch: false } as ActorState;
const plants = [...world.objects.flatMap(o => { const c = plantCrown(o); return c ? [c] : []; }),
  ...vegetationDressing(world).flatMap(p => { const c = crownAt(p.species, p.variant, p.x, p.y, p.z, p.height); return c ? [c] : []; })];
const trunks = world.objects.flatMap(o => plantTrunkSections(o));
// Soft planting without a crown profile (shrubs, beds, hedges, the kit's bush pieces): a rounded mound.
const shrubs = vegetationDressing(world).filter(p => !['vine', 'meadow', 'crop'].includes(p.species) && !crownAt(p.species, p.variant, p.x, p.y, p.z, p.height))
  .map(p => ({ x: p.x, y: p.y, z: p.z, height: p.height, radius: Math.max(.4, p.height * .55) }));

function foliageAt(point: Vec3) {
  if (plants.some(crown => { const span = foliageSpan(crown, point.x, point.z); return !!span && point.y > span[0] && point.y < span[1]; })) return 'a crown';
  if (trunks.some(s => {
    const ax = s.b.x - s.a.x, ay = s.b.y - s.a.y, az = s.b.z - s.a.z, length = ax * ax + ay * ay + az * az;
    const t = Math.max(0, Math.min(1, ((point.x - s.a.x) * ax + (point.y - s.a.y) * ay + (point.z - s.a.z) * az) / length));
    return Math.hypot(point.x - s.a.x - ax * t, point.y - s.a.y - ay * t, point.z - s.a.z - az * t) < s.radiusBottom + .1;
  })) return 'a trunk';
  if (shrubs.some(s => point.y < s.y + s.height && Math.hypot(point.x - s.x, point.z - s.z) < s.radius)) return 'a shrub';
  return null;
}

describe('named QA world views', () => {
  it('covers every district and every hand-placed view', () => {
    expect(views.length).toBeGreaterThan(40);
    for (const [name, view] of views) expect(view, name).toBeDefined();
  });

  it.each(views)('%s stands in the open and sees past its first 2 m', (name, view) => {
    const feet = viewStance(world, view), eye = { ...feet, y: feet.y + actorEye(standing) };
    // A capybara fits where the camera stands: no solid through its body, on a real floor.
    expect(clearSpawn(feet, world), `${name} stands inside a solid`).toBe(true);
    const support = Math.max(terrainHeight(feet.x, feet.z), ...colliderGrid(world).query(feet.x, feet.z, feet.x, feet.z)
      .filter(c => c.max.y <= feet.y + .05 && feet.x >= c.min.x && feet.x <= c.max.x && feet.z >= c.min.z && feet.z <= c.max.z).map(c => c.max.y));
    expect(feet.y - support, `${name} floats above its floor`).toBeLessThan(.06);
    expect(waterAt(feet.x, feet.z) && waterAt(feet.x, feet.z)!.depth > .5 && feet.y < waterAt(feet.x, feet.z)!.surfaceY, `${name} stands in deep water`).toBeFalsy();
    // The view fan: the centre ray and eight around it, 20 degrees wide and 12 high.
    const [, , yaw, pitch] = view;
    for (const dy of [-.35, 0, .35]) for (const dp of [-.2, 0, .2]) {
      const y = yaw + dy, p = pitch + dp;
      const direction = { x: -Math.sin(y) * Math.cos(p), y: Math.sin(p), z: -Math.cos(y) * Math.cos(p) };
      const hit = raycastWorld(eye, direction, REACH, world);
      expect(hit, `${name} looks into ${hit?.collider.id} ${hit?.distance.toFixed(2)} m away`).toBeNull();
      for (let d = .25; d <= REACH; d += .25) {
        const point = { x: eye.x + direction.x * d, y: eye.y + direction.y * d, z: eye.z + direction.z * d };
        const leaf = foliageAt(point);
        expect(leaf, `${name} looks into ${leaf} ${d.toFixed(2)} m away`).toBeNull();
      }
    }
  });
});
