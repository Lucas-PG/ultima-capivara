import { terrainHeight } from './terrain';
import type { Collider, Vec3, WorldSpec } from './types';

// Static world geometry is shared by movement, cameras, navigation and bots.
// Array replacement and additions/removals rebuild the cell membership.
export class ColliderGrid {
  private cells = new Map<number, number[]>();
  private built = -1;
  private source: Collider[] | null = null;
  private marks = new Int32Array(0);
  private stamp = 0;
  // Collider hit by the last ray() call, when the nearest hit was a box.
  lastHit: Collider | null = null;
  constructor(private readonly world: WorldSpec, private readonly size = 6) {}

  private key(ix: number, iz: number) { return (ix + 2048) * 4096 + iz + 2048; }
  private ensure() {
    const colliders = this.world.colliders;
    if (this.source === colliders && this.built === colliders.length) return;
    this.source = colliders;
    this.cells.clear(); this.built = colliders.length; this.marks = new Int32Array(colliders.length); this.stamp = 0;
    colliders.forEach((c, index) => {
      for (let ix = Math.floor(c.min.x / this.size); ix <= Math.floor(c.max.x / this.size); ix++)
        for (let iz = Math.floor(c.min.z / this.size); iz <= Math.floor(c.max.z / this.size); iz++) {
          const k = this.key(ix, iz), list = this.cells.get(k);
          if (list) list.push(index); else this.cells.set(k, [index]);
        }
    });
  }

  // Source indices let sequential collision resolution resume after a push
  // into another cell without revisiting solids already resolved this tick.
  queryIndices(minX: number, minZ: number, maxX: number, maxZ: number, after = -1): number[] {
    this.ensure();
    const found: number[] = [], stamp = ++this.stamp;
    for (let ix = Math.floor(minX / this.size); ix <= Math.floor(maxX / this.size); ix++)
      for (let iz = Math.floor(minZ / this.size); iz <= Math.floor(maxZ / this.size); iz++)
        for (const index of this.cells.get(this.key(ix, iz)) || []) {
          if (index <= after || this.marks[index] === stamp) continue;
          this.marks[index] = stamp;
          const c = this.world.colliders[index];
          if (c.max.x >= minX && c.min.x <= maxX && c.max.z >= minZ && c.min.z <= maxZ) found.push(index);
        }
    return found.sort((a, b) => a - b);
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): Collider[] {
    return this.queryIndices(minX, minZ, maxX, maxZ).map(index => this.world.colliders[index]);
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

const grids = new WeakMap<WorldSpec, ColliderGrid>();
export function colliderGrid(world: WorldSpec): ColliderGrid {
  let grid = grids.get(world);
  if (!grid) { grid = new ColliderGrid(world); grids.set(world, grid); }
  return grid;
}
