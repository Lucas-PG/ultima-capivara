// Board guides from the target composition (src/render/viewmodel-targets.ts): boxes as [x0, y0, x1, y1].
import { FRAME_CLASS, HIP_TARGETS, CORRIDOR } from '../../src/render/viewmodel-targets.ts';
const box = b => b ? [b.x[0], b.y[0], b.x[1], b.y[1]] : undefined;
export const GUIDES = Object.fromEntries(Object.entries(FRAME_CLASS).map(([weapon, frame]) => {
  const t = HIP_TARGETS[frame];
  return [weapon, {
    hip: { muzzle: box(t.muzzle), sight: box(t.sight), grip: box(t.grip), support: box(t.support), supportExit: t.supportExit,
      corridor: [CORRIDOR.x[0], CORRIDOR.y[0], CORRIDOR.x[1], CORRIDOR.y[1]] },
    aimed: { sight: [.49, .49, .51, .51] },
  }];
}));
