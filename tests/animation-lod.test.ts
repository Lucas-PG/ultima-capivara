import { expect, it, vi } from 'vitest';

vi.mock('../src/render/capybara', () => ({ CAPY_BONES: {}, buildCapybaraBody: vi.fn() }));
const { animationInterval } = await import('../src/render/avatars');

it('animates the capybara you watch and every nearby one at full rate', () => {
  expect(animationInterval(80, false, true)).toBe(1);
  expect(animationInterval(2, true, false)).toBe(1);
  expect(animationInterval(19.9, true, false)).toBe(1);
});

it('lowers the pose rate with distance and off screen, but never skips more than three frames', () => {
  const near = animationInterval(10, true, false), mid = animationInterval(30, true, false), far = animationInterval(90, true, false);
  expect(near).toBeLessThan(mid); expect(mid).toBeLessThan(far);
  expect(animationInterval(5, false, false)).toBeGreaterThanOrEqual(far);
  for (const distance of [0, 10, 30, 90, 400]) for (const onScreen of [true, false])
    expect(animationInterval(distance, onScreen, false)).toBeLessThanOrEqual(4);
});
