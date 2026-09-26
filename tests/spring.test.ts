import { expect, it } from 'vitest';
import { Spring } from '../src/render/spring';

it('converges without overshoot and gives the same pose at different display rates', () => {
  const values = [30, 60, 144].map(rate => {
    const spring = new Spring(); spring.reset(1.6);
    for (let frame = 0; frame < rate / 2; frame++) {
      spring.update(1.15, 23, 1 / rate);
      expect(spring.value).toBeGreaterThanOrEqual(1.15); expect(spring.value).toBeLessThanOrEqual(1.6);
    }
    return spring.value;
  });
  expect(values[0]).toBeCloseTo(values[2], 10); expect(values[1]).toBeCloseTo(1.15, 3);
});

it('absorbs a landing impulse and settles without moving the target', () => {
  const spring = new Spring(); spring.impulse(-3);
  spring.update(0, 17, 1 / 60); expect(spring.value).toBeLessThan(0);
  for (let i = 0; i < 90; i++) spring.update(0, 17, 1 / 60);
  expect(spring.value).toBeCloseTo(0, 6); expect(spring.velocity).toBeCloseTo(0, 6);
});
