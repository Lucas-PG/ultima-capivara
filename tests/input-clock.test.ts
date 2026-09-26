import { afterEach, expect, it, vi } from 'vitest';
import { InputClock } from '../src/input-clock';
import { InputController } from '../src/input';
import { DEFAULT_SETTINGS } from '../src/settings';
import { installNetworkInput } from './network-game-hook';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('sends injected QA movement through the real key state beyond 120 unacknowledged samples', () => {
  vi.useFakeTimers();
  const document = new EventTarget(), window = new EventTarget();
  class KeyEvent extends Event {
    readonly code: string; readonly repeat = false;
    constructor(type: string, init: { code: string; bubbles?: boolean }) { super(type, init); this.code = init.code; }
  }
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('KeyboardEvent', KeyEvent);
  const input = new InputController(new EventTarget() as HTMLCanvasElement, DEFAULT_SETTINGS);
  installNetworkInput(input);
  const qa = (window as any).__networkQA, send = vi.fn();
  const clock = new InputClock(() => input.locked, now => send(input.sample(now / 1000)));
  qa.activate(); qa.key('KeyW', true);
  vi.advanceTimersByTime(3000);
  expect(send.mock.calls.length).toBeGreaterThanOrEqual(179);
  expect(send.mock.calls.every(([frame]) => frame.moveZ === 1 && frame.moveX === 0)).toBe(true);
  expect(send.mock.calls.at(-1)![0].seq).toBeGreaterThan(120);
  qa.key('KeyW', false); expect(input.sample(3).moveZ).toBe(0); vi.advanceTimersByTime(40);
  expect(send.mock.calls.at(-1)![0].moveZ).toBe(0);
  clock.dispose(); input.dispose();
});

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
