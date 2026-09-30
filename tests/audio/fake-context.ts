// A minimal stand-in for Web Audio: nodes record their connections and
// parameter automation so tests can inspect the engine's real graph and the
// voices it starts, without rendering.
export class FakeParam {
  value: number;
  events: [string, ...number[]][] = [];
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v: number, t: number) { this.value = v; this.events.push(['set', v, t]); return this; }
  setTargetAtTime(v: number, t: number, c: number) { this.value = v; this.events.push(['target', v, t, c]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.events.push(['exp', v, t]); return this; }
  cancelScheduledValues(t: number) { this.events.push(['cancel', t]); return this; }
  get last() { return this.events.at(-1); }
}

export class FakeNode {
  outputs = new Set<FakeNode>();
  inputs = new Set<FakeNode>();
  constructor(public ctx: FakeContext, public kind: string) { ctx.nodes.push(this); }
  connect(dest: FakeNode) { this.outputs.add(dest); dest.inputs.add(this); return dest; }
  disconnect() { for (const d of this.outputs) d.inputs.delete(this); this.outputs.clear(); }
}

export class FakeBuffer {
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number, public id = '') {}
  get duration() { return this.length / this.sampleRate; }
  copyToChannel() {}
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null; loop = false; playbackRate = new FakeParam(1);
  started: number | null = null; offset = 0; stopped: number | null = null;
  onended: (() => void) | null = null;
  start(at = 0, offset = 0) { this.started = at; this.offset = offset; this.ctx.started.push(this); }
  stop(at = 0) { this.stopped = at; }
}

export class FakeContext {
  nodes: FakeNode[] = [];
  started: FakeSource[] = [];
  currentTime = 1;
  sampleRate = 44100;
  state: AudioContextState = 'running';
  destination = new FakeNode(this, 'destination');
  listener = {
    positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
    forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(-1),
    upX: new FakeParam(), upY: new FakeParam(1), upZ: new FakeParam(),
  };
  private make<T extends FakeNode>(node: T, params: Record<string, number> = {}) {
    for (const [k, v] of Object.entries(params)) (node as unknown as Record<string, FakeParam>)[k] = new FakeParam(v);
    return node;
  }
  createGain() { return this.make(new FakeNode(this, 'gain'), { gain: 1 }); }
  createBiquadFilter() { return Object.assign(this.make(new FakeNode(this, 'biquad'), { frequency: 350, Q: 1, gain: 0 }), { type: 'lowpass' }); }
  createStereoPanner() { return this.make(new FakeNode(this, 'stereo'), { pan: 0 }); }
  createPanner() {
    return Object.assign(this.make(new FakeNode(this, 'panner'), { positionX: 0, positionY: 0, positionZ: 0 }),
      { panningModel: 'equalpower', distanceModel: 'inverse', rolloffFactor: 1, refDistance: 1, maxDistance: 10000 });
  }
  createDynamicsCompressor() { return this.make(new FakeNode(this, 'compressor'), { threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 }); }
  createWaveShaper() { return Object.assign(new FakeNode(this, 'shaper'), { curve: null as Float32Array | null, oversample: 'none' }); }
  createBufferSource() { return new FakeSource(this, 'source'); }
  createBuffer(channels: number, length: number, rate: number) { return new FakeBuffer(channels, length, rate); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  /** Ids (as tagged by the test bank) of every voice started so far. */
  get playedIds() { return this.started.map(s => s.buffer?.id ?? '?'); }
}
