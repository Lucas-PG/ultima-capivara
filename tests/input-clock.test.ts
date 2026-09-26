import { afterEach, expect, it, vi } from 'vitest';
import { InputClock } from '../src/input-clock';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps sampling at 60 Hz without any animation frames and stops on disposal', () => {
  vi.useFakeTimers();
  const sample = vi.fn(), clock = new InputClock(() => true, sample);
  vi.advanceTimersByTime(1000);
  expect(sample.mock.calls.length).toBeGreaterThanOrEqual(59);
  expect(sample.mock.calls.length).toBeLessThanOrEqual(60);
  clock.dispose(); const sent = sample.mock.calls.length;
  vi.advanceTimersByTime(1000); expect(sample).toHaveBeenCalledTimes(sent);
});

it('drops a suspension and inactive time instead of sending a catch-up burst', () => {
  vi.useFakeTimers();
  let active = false, now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const sample = vi.fn(), clock = new InputClock(() => active, sample);
  now = 5000; vi.advanceTimersByTime(8); expect(sample).not.toHaveBeenCalled();
  active = true; now += 20; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledOnce();
  now += 10000; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledOnce();
  now += 17; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledTimes(2);
  expect(clock.fraction(now + 8)).toBeGreaterThan(.4); clock.dispose();
});
