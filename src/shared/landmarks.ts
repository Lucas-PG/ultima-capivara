import type { Collider, Vec3 } from './types';

// Solid, non-enterable district landmarks drawn by src/render/landmarks.ts.
export type LandmarkKind = 'crane' | 'windmill' | 'barn' | 'radio_mast' | 'redentora';
export interface LandmarkSpec extends Vec3 { id: string; kind: LandmarkKind; yaw: number }

// Colliders in the landmark's local frame: [centreX, centreY, centreZ, width, height, depth].
export const LANDMARK_COLLIDERS: Record<LandmarkKind, readonly (readonly [number, number, number, number, number, number])[]> = {
  crane: [[-2.6, 5.5, -2.6, .6, 11, .6], [2.6, 5.5, -2.6, .6, 11, .6], [-2.6, 5.5, 2.6, .6, 11, .6], [2.6, 5.5, 2.6, .6, 11, .6]],
  windmill: [[0, 5, 0, 4.6, 10, 4.6]],
  barn: [[0, 2.5, 0, 10, 5, 8], [6.3, .7, .6, 1.6, 1.4, 5]],
  radio_mast: [[0, 4.5, 0, 2.8, 9, 2.8], [2.4, .9, 0, 1.6, 1.8, 1.4]],
  // Capivara Redentora: two-step plinth you can climb onto, then the robed statue.
  redentora: [[0, .5, 0, 8, 1, 8], [0, 1.4, 0, 6.2, .8, 6.2], [0, 11.8, 0, 5, 20, 4.4]],
};
/** Statue scale and plinth top, shared by the renderer and colliders. */
export const REDENTORA = { scale: 10, plinthTop: 1.8 } as const;

// Quarter-turn yaws only, so each local box stays an exact axis-aligned collider.
export function landmarkColliders(spec: LandmarkSpec): Collider[] {
  const turns = ((Math.round(spec.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  return LANDMARK_COLLIDERS[spec.kind].map(([x, y, z, w, h, d], i) => {
    const [rx, rz, rw, rd] = turns === 0 ? [x, z, w, d] : turns === 1 ? [z, -x, d, w] : turns === 2 ? [-x, -z, w, d] : [-z, x, d, w];
    return { id: `${spec.id}-${i}`, pieceId: spec.id, material: spec.kind === 'barn' ? 'wood' : spec.kind === 'redentora' ? 'stone' : 'metal',
      min: { x: spec.x + rx - rw / 2, y: spec.y + y - h / 2, z: spec.z + rz - rd / 2 },
      max: { x: spec.x + rx + rw / 2, y: spec.y + y + h / 2, z: spec.z + rz + rd / 2 } };
  });
}
