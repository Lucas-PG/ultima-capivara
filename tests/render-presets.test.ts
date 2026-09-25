import { expect, it } from 'vitest';
import { PRESETS } from '../src/render/pipeline';

it('keeps world depth single-sampled so overlapping skin parts cannot puncture the character mask', () => {
  // R6 at 1 m: a resolved foreground sub-sample may be farther than the bounded
  // 5 mm tolerance from the visible part at the pixel centre. FXAA runs afterward.
  for (const [name, preset] of Object.entries(PRESETS)) expect(preset.samples, name).toBe(0);
});
