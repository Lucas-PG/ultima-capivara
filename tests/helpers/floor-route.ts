import { KIT_PIECES } from '../../src/shared/kit-collision';
import type { Vec3, WorldSpec } from '../../src/shared/types';

export function floorRoute(world: WorldSpec, point: Vec3) {
  return world.buildingRoutes?.filter(route => {
    const piece = world.pieces!.find(piece => piece.id === route.pieceId)!;
    const floor = KIT_PIECES[piece.piece].traversal!.floors.find(floor => floor.id === route.floorId)!;
    const scale = piece.scale ?? 1, dx = (point.x - piece.x) / scale, dz = (point.z - piece.z) / scale;
    const x = dx * Math.cos(piece.yaw) - dz * Math.sin(piece.yaw), z = dx * Math.sin(piece.yaw) + dz * Math.cos(piece.yaw);
    return Math.abs(piece.y + floor.y * scale - point.y) < .06 &&
      x >= floor.bounds[0] && x <= floor.bounds[2] && z >= floor.bounds[1] && z <= floor.bounds[3];
  }).sort((a, b) => a.points.length - b.points.length)[0];
}
