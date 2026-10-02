import definitions from './kit-pieces.json';
import rockHulls from './rock-hulls.json';
import type { Collider, KitPlacement } from './types';

interface ShapeBase { x: number; y: number; z: number; height: number; material?: Collider['material'] }
export type KitShape = (ShapeBase & { type: 'box'; width: number; depth: number; yaw?: number }) |
  (ShapeBase & { type: 'cylinder'; radius: number });
export interface KitTraversal {
  floors: { id: string; bounds: [number, number, number, number]; y: number }[];
  entrances: { id: string; point: [number, number, number]; platform?: boolean }[];
  routes: { id: string; from: string; to: string; points: [number, number, number][] }[];
  stairs: { id: string; from: string; to: string; colliderIndices: number[] }[];
}
export interface KitPiece {
  footprint: [number, number]; height: number; colliders: KitShape[];
  collisionHulls?: { bounds: [[number, number, number], [number, number, number]]; planes: [number, number, number, number][]; bevel: number }[];
  interaction?: { surfaceY: number; radius: number };
  traversal?: KitTraversal;
  frontClearance?: number;
  /** Anchors for the painted vegetation layer (the kit draws only the pot, box or wall), piece space facing +z:
   * wall drapes (top edge, width, drop; `slab` for a balcony drape hanging in front of its railing),
   * window flower boxes (soil centre, width), pots (rim centre, radius, style) and bushes. */
  plantings?: KitPlanting[];
}
export type KitPlanting =
  | { type: 'drape'; x: number; y: number; z: number; width: number; drop: number; slab?: number }
  | { type: 'box'; x: number; y: number; z: number; width: number }
  | { type: 'pot'; x: number; y: number; z: number; radius: number; style: 'flower' | 'tall' }
  | { type: 'bush'; x: number; y: number; z: number; species: 'bougainvillea'; height: number };
export const KIT_PIECES = definitions as unknown as Record<string, KitPiece>;
for (const [id, hulls] of Object.entries(rockHulls)) KIT_PIECES[id].collisionHulls = hulls as KitPiece['collisionHulls'];

// Existing movement uses axis-aligned boxes. Cardinal solids remain exact;
// round or rotated solids use inscribed strips, never an enclosing empty box.
export function kitColliders(instance: KitPlacement, sourceBoxes = false): Collider[] {
  const definition = KIT_PIECES[instance.piece];
  if (!definition) throw new Error(`Unknown kit piece: ${instance.piece}`);
  const scale = instance.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(instance.yaw)) throw new Error(`Invalid kit transform: ${instance.id}`);
  const cosine = Math.cos(instance.yaw), sine = Math.sin(instance.yaw), boxes: Collider[] = [];
  if (definition.collisionHulls && !sourceBoxes) return definition.collisionHulls.map((shape, index) => {
    const points = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z => [shape.bounds[x][0], shape.bounds[y][1], shape.bounds[z][2]])));
    const vertices = points.map(([x, y, z]) => ({
      x: instance.x + (x * cosine + z * sine) * scale, y: instance.y + y * scale,
      z: instance.z + (z * cosine - x * sine) * scale,
    }));
    const hull = shape.planes.map(([nx, ny, nz, distance]) => {
      const x = nx * cosine + nz * sine, z = nz * cosine - nx * sine;
      return [x, ny, z, distance * scale + x * instance.x + ny * instance.y + z * instance.z] as const;
    });
    return { id: `${instance.id}:hull:${index}`, pieceId: instance.id, material: 'stone' as const, hull,
      min: { x: Math.min(...vertices.map(v => v.x)), y: Math.min(...vertices.map(v => v.y)), z: Math.min(...vertices.map(v => v.z)) },
      max: { x: Math.max(...vertices.map(v => v.x)), y: Math.max(...vertices.map(v => v.y)), z: Math.max(...vertices.map(v => v.z)) } };
  });
  definition.colliders.forEach((shape, index) => {
    const x = instance.x + (shape.x * cosine + shape.z * sine) * scale;
    const z = instance.z + (shape.z * cosine - shape.x * sine) * scale;
    const y = instance.y + shape.y * scale, halfHeight = shape.height * scale / 2;
    const box = (minX: number, minZ: number, maxX: number, maxZ: number, suffix = '') => {
      if (maxX - minX < 1e-6 || maxZ - minZ < 1e-6) return;
      boxes.push({ id: `${instance.id}:${index}${suffix}`, pieceId: instance.id,
        min: { x: x + minX, y: y - halfHeight, z: z + minZ },
        max: { x: x + maxX, y: y + halfHeight, z: z + maxZ }, material: shape.material ?? 'stone' });
    };
    if (shape.type === 'cylinder') {
      const radius = shape.radius * scale, strips = 12, step = radius * 2 / strips;
      for (let i = 0; i < strips; i++) {
        const near = -radius + step * i, far = near + step;
        const halfWidth = Math.sqrt(Math.max(0, radius ** 2 - Math.max(Math.abs(near), Math.abs(far)) ** 2));
        box(-halfWidth, near, halfWidth, far, `:${i}`);
      }
    } else {
      const yaw = instance.yaw + (shape.yaw ?? 0), c = Math.cos(yaw), s = Math.sin(yaw);
      const hw = shape.width * scale / 2, hd = shape.depth * scale / 2;
      const hx = Math.abs(c) * hw + Math.abs(s) * hd, hz = Math.abs(s) * hw + Math.abs(c) * hd;
      if (Math.abs(Math.sin(yaw * 2)) < 1e-6) box(-hx, -hz, hx, hz);
      else {
        // Intersect the oriented rectangle's X interval at both strip ends.
        // A convex solid contains every corner of each resulting box.
        const interval = (zz: number) => {
          const a = [(-hw + s * zz) / c, (hw + s * zz) / c];
          const b = [(-hd - c * zz) / s, (hd - c * zz) / s];
          return [Math.max(Math.min(...a), Math.min(...b)), Math.min(Math.max(...a), Math.max(...b))];
        };
        const strips = 12, step = hz * 2 / strips;
        for (let i = 0; i < strips; i++) {
          const near = -hz + step * i, far = near + step, a = interval(near), b = interval(far);
          box(Math.max(a[0], b[0]), near, Math.min(a[1], b[1]), far, `:${i}`);
        }
      }
    }
  });
  return boxes;
}
