import type { MapObject, Vec3 } from './types';

export interface PlantStemSection { a: Vec3; b: Vec3; radiusBottom: number; radiusTop: number }
export const PLANT_CELL_SIZE = 16;
export const PLANT_TEMPLATE_HEIGHT = { tree: 8, palm: 9 } as const;

export function plantHash(n: number, salt: number) {
  let x = Math.imul(n + salt * 7919, 1597334677);
  x = Math.imul(x ^ x >>> 16, 2246822507);
  return (x >>> 0) / 4294967296;
}

export function plantTrunkRadius(kind: 'tree' | 'palm', height: number) {
  return kind === 'palm' ? .13 + height * .009 : .15 + height * .015;
}

/** The renderer and collider builder consume this same tapered centreline. */
export function plantStemTemplate(kind: 'tree' | 'palm', segments = kind === 'palm' ? 12 : 8): PlantStemSection[] {
  const h = PLANT_TEMPLATE_HEIGHT[kind], radius = plantTrunkRadius(kind, h), palm = kind === 'palm';
  const point = (t: number): Vec3 => palm ?
    { x: h * .075 * t + Math.sin(t * Math.PI) * .16, y: h * .91 * t, z: 0 } :
    { x: .15 * t + Math.sin(t * Math.PI * 1.6) * .12, y: h * .55 * t, z: Math.sin(t * Math.PI) * .08 };
  return Array.from({ length: segments }, (_, i) => ({ a: point(i / segments), b: point((i + 1) / segments),
    radiusBottom: radius * (1 - (palm ? .32 : .20) * i / segments),
    radiusTop: radius * (1 - (palm ? .32 : .20) * (i + 1) / segments) }));
}

export function plantTransform(object: MapObject) {
  const palm = object.kind === 'palm', kind = palm ? 'palm' : 'tree';
  const salt = Math.round(object.pos.x * 100) ^ Math.round(object.pos.z * 100);
  return {
    yaw: object.rotation ?? plantHash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100)) * Math.PI * 2,
    lean: palm ? (3 + plantHash(salt, 5) * 9) * Math.PI / 180 : 0,
    leanDirection: palm ? object.pos.y < 2.2 ? Math.atan2(-object.pos.z, -object.pos.x) +
      (plantHash(salt, 3) - .5) * .7 : plantHash(salt, 4) * Math.PI * 2 : 0,
    heightScale: object.scale.y / PLANT_TEMPLATE_HEIGHT[kind],
    radialScale: plantTrunkRadius(kind, object.scale.y) / plantTrunkRadius(kind, PLANT_TEMPLATE_HEIGHT[kind]),
  };
}

/** World-space visual sections, including the exact palm lean and yaw.
 * Small shrubs, banana leaves and all ground plants intentionally stay soft.
 */
export function plantTrunkSections(object: MapObject): PlantStemSection[] {
  if ((object.kind !== 'tree' && object.kind !== 'palm') || object.scale.y < 2.5 || object.detail === 'banana') return [];
  const transform = plantTransform(object), cy = Math.cos(transform.yaw), sy = Math.sin(transform.yaw);
  const ax = Math.sin(transform.leanDirection), az = -Math.cos(transform.leanDirection);
  const c = Math.cos(transform.lean), s = Math.sin(transform.lean);
  const worldPoint = (point: Vec3): Vec3 => {
    const x = (point.x * cy + point.z * sy) * transform.radialScale;
    const y = point.y * transform.heightScale;
    const z = (-point.x * sy + point.z * cy) * transform.radialScale;
    const dot = ax * x + az * z;
    return { x: object.pos.x + x * c - az * y * s + ax * dot * (1 - c),
      y: object.pos.y + y * c + (az * x - ax * z) * s,
      z: object.pos.z + z * c + ax * y * s + az * dot * (1 - c) };
  };
  return plantStemTemplate(object.kind).map(section => ({ a: worldPoint(section.a), b: worldPoint(section.b),
    radiusBottom: section.radiusBottom * transform.radialScale, radiusTop: section.radiusTop * transform.radialScale }));
}
