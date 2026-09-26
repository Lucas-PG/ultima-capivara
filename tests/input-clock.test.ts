import { afterEach, expect, it, vi } from 'vitest';
import { InputClock } from '../src/input-clock';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps sending beyond the replay window without animation frames or acknowledgments', () => {
  vi.useFakeTimers();
  const sample = vi.fn(), clock = new InputClock(() => true, sample);
  vi.advanceTimersByTime(3000);
  expect(sample.mock.calls.length).toBeGreaterThanOrEqual(179);
  expect(sample.mock.calls.length).toBeLessThanOrEqual(180);
  clock.dispose(); const sent = sample.mock.calls.length;
  vi.advanceTimersByTime(1000); expect(sample).toHaveBeenCalledTimes(sent);
});

it('sends current intent once per throttled timer while dropping inactive time and catch-up bursts', () => {
  vi.useFakeTimers();
  let active = false, now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const sample = vi.fn(), clock = new InputClock(() => active, sample);
  now = 5000; vi.advanceTimersByTime(8); expect(sample).not.toHaveBeenCalled();
  active = true; now += 20; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledOnce();
  now += 10000; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledTimes(2);
  now += 1000; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledTimes(3);
  now += 17; vi.advanceTimersByTime(8); expect(sample).toHaveBeenCalledTimes(4);
  expect(clock.fraction(now + 8)).toBeGreaterThan(.4); clock.dispose();
});
