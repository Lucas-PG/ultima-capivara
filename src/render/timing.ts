// Opt-in local diagnostics. Normal play does not allocate records or read a clock.
// CPU spans and async wall spans are distinct; neither is a GPU completion timer.
export const TIMING_NAMES = [
  'raf-gap', 'snapshot', 'audio', 'interaction', 'hud', 'render', 'camera',
  'camera-transition', 'world-draw', 'first-person-draw', 'shader-compile-world',
  'shader-compile-first-person', 'shader-compile-post', 'warmup-upload-world',
  'warmup-upload-first-person', 'gltf-parse-wall', 'texture-ready-wall',
  'texture-upload', 'first-material-use', 'shader-program-created', 'resolution-change', 'driver-shader-compile', 'driver-program-link',
] as const;
export type TimingName = typeof TIMING_NAMES[number];
export const PHASES = ['menu', 'loading', 'lobby', 'countdown', 'plane', 'playing', 'results'] as const;
export type TimingPhase = typeof PHASES[number];

export class TimingRecorder {
  private readonly data: Float64Array | null;
  private written = 0;
  private phase = 0;
  private tick = -1;
  private frame = 0;
  private readonly tasks: { startTime: number; duration: number; attribution: unknown[] }[] = [];
  private droppedTasks = 0;
  private observer?: PerformanceObserver;
  private readonly labels = new Map<string, number>();
  private readonly labelNames: string[] = [];
  readonly timeOrigin: number;
  readonly longTaskSupported: boolean;

  constructor(readonly enabled: boolean, private readonly capacity = 65536,
    private readonly clock: Pick<Performance, 'now' | 'timeOrigin'> = performance) {
    this.data = enabled ? new Float64Array(capacity * 7) : null;
    this.timeOrigin = clock.timeOrigin;
    this.longTaskSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask');
  }

  context(phase: TimingPhase, tick: number, frame: number) {
    if (!this.enabled) return;
    this.phase = PHASES.indexOf(phase); this.tick = tick; this.frame = frame;
  }
  begin() { return this.enabled ? this.clock.now() : -1; }
  end(name: TimingName, start: number, label = '', trace = false) {
    if (start < 0 || !this.enabled) return;
    this.record(name, start, this.clock.now() - start, label, trace);
  }
  record(name: TimingName, start: number, duration = 0, label = '', trace = false) {
    if (!this.data) return;
    let labelId = -1;
    if (label) {
      if (!this.labels.has(label) && this.labels.size >= 1024) label = 'other';
      labelId = this.labels.get(label) ?? this.labelNames.length;
      if (!this.labels.has(label)) { this.labels.set(label, labelId); this.labelNames.push(label); }
    }
    const offset = (this.written++ % this.capacity) * 7;
    this.data[offset] = TIMING_NAMES.indexOf(name); this.data[offset + 1] = start; this.data[offset + 2] = duration;
    this.data[offset + 3] = this.phase; this.data[offset + 4] = this.tick; this.data[offset + 5] = this.frame;
    this.data[offset + 6] = labelId;
    // Slow spans and loading/transition events also appear in a CDP User Timing trace.
    // Clear the browser buffer immediately: the numeric ring remains the source of truth.
    if (trace || duration >= 8) {
      const mark = `capivara:${name}`;
      performance.mark(mark, { startTime: start });
      performance.measure(mark, { start, duration, detail: { label, phase: PHASES[this.phase], tick: this.tick, frame: this.frame } });
      performance.clearMarks(mark); performance.clearMeasures(mark);
    }
  }
  observeLongTasks() {
    if (!this.enabled || !this.longTaskSupported || this.observer) return;
    this.observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const task = entry as PerformanceEntry & { attribution?: { toJSON(): unknown }[] };
        if (this.tasks.length === 256) { this.tasks.shift(); this.droppedTasks++; }
        this.tasks.push({ startTime: task.startTime, duration: task.duration,
          attribution: task.attribution?.map(item => item.toJSON()) ?? [] });
      }
    });
    this.observer.observe({ type: 'longtask', buffered: true });
  }
  snapshot() {
    const spans = [];
    if (this.data) for (let i = Math.max(0, this.written - this.capacity); i < this.written; i++) {
      const o = (i % this.capacity) * 7;
      spans.push({ name: TIMING_NAMES[this.data[o]], startTime: this.data[o + 1], duration: this.data[o + 2],
        phase: PHASES[this.data[o + 3]], tick: this.data[o + 4], renderedFrames: this.data[o + 5],
        label: this.labelNames[this.data[o + 6]] ?? '' });
    }
    return { enabled: this.enabled, timeOrigin: this.timeOrigin, longTaskSupported: this.longTaskSupported,
      droppedSpans: Math.max(0, this.written - this.capacity), droppedTasks: this.droppedTasks,
      spans, longTasks: this.tasks.map(task => ({ ...task })) };
  }
  reset() { this.observer?.takeRecords(); this.written = 0; this.tasks.length = 0; this.droppedTasks = 0; }
  dispose() { this.observer?.disconnect(); }
}

export const timing = new TimingRecorder(import.meta.env.DEV && typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('timing') === '1');
