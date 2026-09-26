import { expect, it } from 'vitest';
import { PRESETS } from '../src/render/pipeline';

it('keeps world depth single-sampled so overlapping skin parts cannot puncture the character mask', () => {
  // R6 at 1 m: a resolved foreground sub-sample may be farther than the bounded
  // 5 mm tolerance from the visible part at the pixel centre. FXAA runs afterward.
  for (const [name, preset] of Object.entries(PRESETS)) expect(preset.samples, name).toBe(0);
});

it('keeps Retina detail and proper AA on the balanced presets without charging Low for post effects', () => {
  expect(PRESETS.medium.dpr).toBeGreaterThanOrEqual(1.5);
  expect(PRESETS.high.dpr).toBeGreaterThanOrEqual(2);
  expect(PRESETS.medium.smaa).toBe(true); expect(PRESETS.high.smaa).toBe(true);
  expect(PRESETS.low.atmosphere).toBe(false); expect(PRESETS.low.smaa).toBe(false);
  expect(PRESETS.high.shadowReach).toBeGreaterThan(PRESETS.medium.shadowReach);
});
