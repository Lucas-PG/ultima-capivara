// Trigger-guard openings copied from the existing cutter profiles in tools/blender/arsenal.py.
// Coordinates are millimetres in weapon space: profile [forward, up] becomes [y, -z].
// This is QA intent, never a collision volume or an alteration of the weapon mesh.
const openings = {
  pistol: { halfWidth: 11, yz: [[3, 6], [62.25, 6], [66, -2], [61.5, -32], [53.25, -37], [3, -37]] },
  revolver: { halfWidth: 8.5, yz: [[3, 4], [62, 4], [65, -7], [56, -40], [3, -38]] },
  smg: { halfWidth: 9.5, yz: [[3, 12], [62, 12], [65, 5], [60, -31], [3, -31]] },
  m4: { halfWidth: 8, yz: [[-34, -1], [35, -1], [31, -33], [6, -38], [-24, -28], [-34, -14]] },
  shotgun: { halfWidth: 9, yz: [[-27, 6], [43, 6], [42, -20], [33, -47], [-16, -47], [-27, -20]] },
  dmr: { halfWidth: 16, yz: [[-41, 4], [38, 4], [37, -25], [27, -47], [-31, -46], [-43, -20]] },
  sniper: { halfWidth: 9, yz: [[-19, 4], [50, 4], [49, -21], [38, -38], [-9, -38], [-20, -26]] },
  coco: { halfWidth: 9.5, yz: [[-25, 9], [47, 9], [49, -18], [36, -36], [-14, -36], [-29, -23]] },
};

/** The distal index skin centroid must occupy the guard opening, not sit beside its outer wall.
 * Full skinned-surface clearance still checks the entire digit against the actual weapon mesh. */
export function triggerInGuard(weapon, centroidMm, scale = 1) {
  const guard = openings[weapon];
  if (!guard || !centroidMm?.every(Number.isFinite) || !(scale > 0)) return false;
  const [x, up, z] = centroidMm.map(v => v / scale), forward = -z;
  if (Math.abs(x) > guard.halfWidth) return false;
  let inside = false;
  for (let i = 0, j = guard.yz.length - 1; i < guard.yz.length; j = i++) {
    const [ax, ay] = guard.yz[i], [bx, by] = guard.yz[j];
    if ((ay > up) !== (by > up) && forward < (bx - ax) * (up - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export const TRIGGER_FACE = { surface: 'trigger', bones: ['index2', 'index3'], normal: [0, 0, -1], minNormalDot: .5 };
