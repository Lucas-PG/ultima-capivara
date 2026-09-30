import { aimDirection } from './math';
import { actorEye, STANDING_HIT_SHAPE } from './collision';
import { shotSeed, spreadOffset, WEAPONS } from './weapons';
import type { ActorState, Vec3, WeaponId } from './types';

// Shot geometry shared by the host and the shooter's client prediction, so a
// predicted round leaves the same eye point in the same direction.

const DEG = Math.PI / 180;
// When a bot shoots a human the legacy player-favouring sizes apply.
export const HIT_SHAPES = { normal: STANDING_HIT_SHAPE, favoured: { headY: 1.6, headZ: -.04, headR: .19, bodyR: .27, bodyTop: 1.36 } } as const;

/** Eye point a round leaves from, shifted sideways by the lean. */
export function shotOrigin(actor: Pick<ActorState, 'pos' | 'crouch' | 'yaw' | 'lean'>, lean = actor.lean, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = actor.pos.x + Math.cos(actor.yaw) * lean * .32;
  out.y = actor.pos.y + actorEye(actor as ActorState);
  out.z = actor.pos.z - Math.sin(actor.yaw) * lean * .32;
  return out;
}

/** Direction of one human-fired pellet: the aim ray turned by the seeded cone offset. */
export function pelletDirection(id: WeaponId, match: string, actor: string, shot: number, pellet: number, yaw: number, pitch: number, spreadDeg: number): Vec3 {
  const f = aimDirection(yaw, pitch);
  if (WEAPONS[id].melee || spreadDeg <= 0) return f;
  const [ox, oy] = spreadOffset(id, shotSeed(match, actor, shot), pellet), k = Math.tan(spreadDeg * DEG);
  // Right and up of the view: r = (cos yaw, 0, -sin yaw), u = r x f.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ux = -rz * f.y, uy = rz * f.x - rx * f.z, uz = rx * f.y;
  const x = f.x + (rx * ox + ux * oy) * k, y = f.y + uy * oy * k, z = f.z + (rz * ox + uz * oy) * k;
  const n = Math.hypot(x, y, z) || 1;
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * Ray against a capybara's shot volumes (head sphere, body cylinder from the
 * feet; crouching scales them by 1.3/1.8 from the feet). Returns the entry
 * distance and whether the head was the first volume struck.
 */
export function rayCapybara(origin: Vec3, d: Vec3, position: Vec3, crouch: boolean, yaw: number, max: number, favoured = false): { distance: number; head: boolean } | null {
  const shape = favoured ? HIT_SHAPES.favoured : HIT_SHAPES.normal;
  const scale = crouch ? 1.8 / 1.3 : 1;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const wx = origin.x - position.x, wz = origin.z - position.z;
  const x = (cos * wx - sin * wz) * scale, y = (origin.y - position.y) * scale, z = (sin * wx + cos * wz) * scale;
  const vx = (cos * d.x - sin * d.z) * scale, vy = d.y * scale, vz = (sin * d.x + cos * d.z) * scale;
  let best = max, head = false;
  {
    const px = x, py = y - shape.headY, pz = z - shape.headZ;
    const a = vx * vx + vy * vy + vz * vz, b = px * vx + py * vy + pz * vz, c = px * px + py * py + pz * pz - shape.headR ** 2;
    const disc = b * b - a * c;
    if (disc >= 0 && (-b + Math.sqrt(disc)) / a >= 0) { const near = Math.max(0, (-b - Math.sqrt(disc)) / a); if (near < best) { best = near; head = true; } }
  }
  {
    let low = 0, high = Infinity;
    const a = vx * vx + vz * vz, b = x * vx + z * vz, c = x * x + z * z - shape.bodyR ** 2;
    if (a < 1e-12) { if (c > 0) low = Infinity; }
    else {
      const disc = b * b - a * c;
      if (disc < 0) low = Infinity;
      else { low = Math.max(low, (-b - Math.sqrt(disc)) / a); high = Math.min(high, (-b + Math.sqrt(disc)) / a); }
    }
    if (Math.abs(vy) < 1e-12) { if (y < 0 || y > shape.bodyTop) low = Infinity; }
    else { const t0 = -y / vy, t1 = (shape.bodyTop - y) / vy; low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1)); }
    if (low <= high && high >= 0 && low < best) { best = Math.max(0, low); head = false; }
  }
  return best < max ? { distance: best, head } : null;
}
