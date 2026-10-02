import type { Collider, Vec3 } from '../src/shared/types';

// Clip the complete query box against every convex halfspace. Keeping each
// new cap prevents a hull wholly inside a box from disappearing with its faces.
export function boxOverlapsCollider(min: Vec3, max: Vec3, solid: Collider, margin = .015) {
  if (Math.min(max.x, solid.max.x) - Math.max(min.x, solid.min.x) <= margin ||
      Math.min(max.y, solid.max.y) - Math.max(min.y, solid.min.y) <= margin ||
      Math.min(max.z, solid.max.z) - Math.max(min.z, solid.min.z) <= margin) return false;
  if (!solid.hull) return true;
  const a = [min.x + margin / 2, min.y + margin / 2, min.z + margin / 2];
  const b = [max.x - margin / 2, max.y - margin / 2, max.z - margin / 2];
  const vertices = Array.from({ length: 8 }, (_, i) => [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]]);
  let faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]].map(face => face.map(i => vertices[i]));
  for (const [nx, ny, nz, d] of solid.hull) {
    const dot = (p: number[]) => nx * p[0] + ny * p[1] + nz * p[2] - d + margin / 2;
    const clipped: number[][][] = [], crossings: number[][] = [];
    for (const face of faces) {
      const polygon: number[][] = [];
      for (let i = 0; i < face.length; i++) {
        const p = face[i], q = face[(i + 1) % face.length], dp = dot(p), dq = dot(q);
        if (dp <= 0) polygon.push(p);
        if ((dp <= 0) !== (dq <= 0)) {
          const t = dp / (dp - dq), intersection = p.map((v, axis) => v + (q[axis] - v) * t);
          polygon.push(intersection);
          if (!crossings.some(v => Math.hypot(...v.map((x, axis) => x - intersection[axis])) < 1e-8)) crossings.push(intersection);
        }
      }
      if (polygon.length >= 3) clipped.push(polygon);
    }
    if (crossings.length >= 3) {
      const centre = [0, 1, 2].map(axis => crossings.reduce((sum, p) => sum + p[axis], 0) / crossings.length);
      const u = Math.abs(ny) < .9 ? [nz, 0, -nx] : [1, 0, 0];
      const v = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
      const angle = (p: number[]) => Math.atan2(v.reduce((sum, x, axis) => sum + x * (p[axis] - centre[axis]), 0), u.reduce((sum, x, axis) => sum + x * (p[axis] - centre[axis]), 0));
      crossings.sort((p, q) => angle(p) - angle(q)); clipped.push(crossings);
    }
    faces = clipped;
    if (!faces.length) return false;
  }
  return true;
}
