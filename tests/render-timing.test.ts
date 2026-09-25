import { describe, expect, it, vi } from 'vitest';
import { TimingRecorder } from '../src/render/timing';

describe('local stall evidence', () => {
  it('does not sample clocks or retain events when disabled', () => {
    const now = vi.fn(() => 100), probe = new TimingRecorder(false, 2, { now, timeOrigin: 42 });
    probe.context('playing', 20, 3);
    probe.end('hud', probe.begin()); probe.record('raf-gap', 10, 60);
    expect(now).not.toHaveBeenCalled();
    expect(probe.snapshot().spans).toEqual([]);
  });
  it('retains chronological timestamped spans with phase/tick/frame and explicit loss counts', () => {
    let now = 1;
    const probe = new TimingRecorder(true, 2, { now: () => now, timeOrigin: 123456 });
    probe.context('loading', 0, 0); probe.record('first-material-use', 1, 0, 'fur');
    probe.context('playing', 60, 5); const start = probe.begin(); now = 4;
    probe.end('hud', start); probe.record('raf-gap', 4, 7);
    const result = probe.snapshot();
    expect(result.timeOrigin).toBe(123456); expect(result.droppedSpans).toBe(1);
    expect(result.spans).toEqual([
      { name: 'hud', startTime: 1, duration: 3, phase: 'playing', tick: 60, renderedFrames: 5, label: '' },
      { name: 'raf-gap', startTime: 4, duration: 7, phase: 'playing', tick: 60, renderedFrames: 5, label: '' },
    ]);
    probe.reset(); expect(probe.snapshot().spans).toEqual([]); expect(probe.snapshot().droppedSpans).toBe(0);
  });
  it('does not leave user timing entries accumulating in the browser buffer', () => {
    const probe = new TimingRecorder(true, 4);
    probe.record('texture-upload', performance.now(), 0, 'texImage2D', true);
    expect(performance.getEntriesByName('capivara:texture-upload')).toHaveLength(0);
    expect(probe.snapshot().spans[0].label).toBe('texImage2D');
  });
});
