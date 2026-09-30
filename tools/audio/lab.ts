// Sound lab: audition every baked sound and the readability scenarios at the game's
// real mix levels (open /tools/audio/lab.html on a dev server).
import { SOUNDS } from '../../src/sound/bank';
import type { BakeMessage } from '../../src/sound/bake.worker';
import { ambienceMix, critterWeights, gunDistance, LEVEL, levelGain, safetyCurve, stepDistance, STEP_RANGE, worldDistance, type Place } from '../../src/sound/mix';
import { DEFAULT_SETTINGS } from '../../src/settings';

const status = document.querySelector('#status')!, main = document.querySelector('#main')!;
const mixLevel = document.querySelector<HTMLInputElement>('#mix')!;
let ctx: AudioContext | null = null, out: GainNode | null = null;
const bank = new Map<string, AudioBuffer[]>(), live = new Set<AudioBufferSourceNode>();

function start() {
  if (ctx) return;
  ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor(), clipper = ctx.createWaveShaper();
  limiter.threshold.value = -8; limiter.knee.value = 3; limiter.ratio.value = 20; limiter.attack.value = .001; limiter.release.value = .15;
  clipper.curve = safetyCurve() as Float32Array<ArrayBuffer>;
  out = ctx.createGain(); out.connect(limiter); limiter.connect(clipper); clipper.connect(ctx.destination);
  const worker = new Worker(new URL('../../src/sound/bake.worker.ts', import.meta.url), { type: 'module' });
  const started = performance.now();
  worker.onmessage = (event: MessageEvent<BakeMessage>) => {
    const m = event.data;
    if (m.type === 'done') { status.textContent = `Bank baked: ${[...bank.values()].reduce((n, l) => n + l.length, 0)} buffers in ${Math.round(performance.now() - started)} ms.`; return; }
    const buffer = ctx!.createBuffer(m.channels.length, m.channels[0].length, m.rate);
    m.channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    const list = bank.get(m.id) || []; list[m.variant] = buffer; bank.set(m.id, list);
    status.textContent = `Baking... ${bank.size} sounds`;
  };
  worker.postMessage({ rate: ctx.sampleRate, quality: 'high' });
}
document.addEventListener('pointerdown', start, { once: true });

const sliders = (bus: 'effects' | 'ambience' | 'music') => DEFAULT_SETTINGS.master * DEFAULT_SETTINGS[bus];
/** Plays `id` at a mix level, optionally from a direction (azimuth in degrees, 90 = right) with a low-pass. */
function play(id: string, level: number, at = 0, options: { azimuth?: number; cutoff?: number; bus?: 'effects' | 'ambience' | 'music'; loop?: boolean } = {}) {
  const list = bank.get(id);
  if (!ctx || !out || !list?.length) return;
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = list[Math.floor(Math.random() * list.length)]; source.loop = !!options.loop;
  gain.gain.value = mixLevel.checked ? levelGain(level) * sliders(options.bus ?? 'effects') : levelGain(-20) * .5;
  let tail: AudioNode = gain;
  source.connect(gain);
  if (options.cutoff) { const f = ctx.createBiquadFilter(); f.frequency.value = options.cutoff; tail.connect(f); tail = f; }
  if (options.azimuth !== undefined) {
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.rolloffFactor = 0;
    const a = options.azimuth * Math.PI / 180; p.positionX.value = Math.sin(a) * 5; p.positionZ.value = -Math.cos(a) * 5;
    tail.connect(p); tail = p;
  }
  tail.connect(out);
  source.start(ctx.currentTime + at);
  live.add(source); source.onended = () => live.delete(source);
}
document.querySelector('#stop')!.addEventListener('click', () => { for (const s of live) { try { s.stop(); } catch { /* done */ } } live.clear(); });

const remoteShot = (id: string, d: number, at: number, azimuth: number) => {
  const g = gunDistance(d);
  if (g.near > .05) play(`shot:${id}`, LEVEL.remoteShot + g.db + 20 * Math.log10(g.near), at + g.delay, { azimuth, cutoff: g.cutoff });
  if (g.far > .05) play(`far:${id}`, LEVEL.remoteShot + g.db + 20 * Math.log10(g.far), at + g.delay, { azimuth });
};
const remoteSteps = (material: string, d: number, at: number, azimuth: number, count = 8) => {
  const m = stepDistance(d, STEP_RANGE.sprint);
  for (let i = 0; i < count; i++) play(`step:${material}`, LEVEL.remoteStep + 3 + m.db, at + i * .36, { azimuth, cutoff: m.cutoff });
};
const idle = (place: Place, seconds = 20) => {
  for (const [bed, db] of Object.entries(ambienceMix(place))) if (Number.isFinite(db)) play(`bed:${bed}`, db, 0, { bus: 'ambience', loop: true });
  const choices = critterWeights(place);
  for (let t = 2; t < seconds; t += 3 + Math.random() * 4) play(`critter:${choices[Math.floor(Math.random() * choices.length)][0]}`, LEVEL.critter + worldDistance(20, 70).db, t, { bus: 'ambience', azimuth: Math.random() * 360 });
  setTimeout(() => { for (const s of live) if (s.loop) s.stop(); }, seconds * 1000);
};

const SCENARIOS: [string, () => void][] = [
  ['Enemy SMG burst at 30 m (left), then enemy sprinting on stone at 8 m (right)', () => { for (let i = 0; i < 8; i++) remoteShot('smg', 30, i * .071, -70); remoteSteps('stone', 8, 1.6, 70); }],
  ['Enemy sniper at 150 m, then enemy steps on grass at 5 m', () => { remoteShot('sniper', 150, 0, 30); remoteSteps('grass', 5, 2.5, -40); }],
  ['Your M4 burst, then your own sprint on wood', () => { for (let i = 0; i < 6; i++) play('shot:m4', LEVEL.ownShotAuto, i * .083); for (let i = 0; i < 8; i++) play('step:wood', LEVEL.ownStep + 3, 1.2 + i * .36); }],
  ['Every gun at 10 m, one after another', () => ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'revolver'].forEach((g, i) => remoteShot(g, 10, i * 1.4, 0))],
  ['The same pistol at 5, 20, 60, 120 and 240 m', () => [5, 20, 60, 120, 240].forEach((d, i) => remoteShot('pistol', d, i * 1.8, 0))],
  ['Hit, headshot, armour break, kill', () => ['fb:hit', 'fb:head', 'fb:armor-break', 'fb:kill'].forEach((id, i) => play(id, [LEVEL.hit, LEVEL.head, LEVEL.armorBreak, LEVEL.kill][i], i * .7))],
  ['Near miss from the right', () => play('whiz', LEVEL.whiz, 0, { azimuth: 80 })],
  ['Idle beach (20 s)', () => idle({ coast: .85, height: 1, canopy: .1, inside: false, harbour: Infinity, waterfall: Infinity, district: 'praia' })],
  ['Idle forest (20 s)', () => idle({ coast: 0, height: 6, canopy: .9, inside: false, harbour: Infinity, waterfall: Infinity, district: 'capela' })],
  ['Idle town (20 s)', () => idle({ coast: .1, height: 2, canopy: .15, inside: false, harbour: Infinity, waterfall: Infinity, district: 'vila' })],
  ['Idle harbour (20 s)', () => idle({ coast: .5, height: 2, canopy: 0, inside: false, harbour: 14, waterfall: Infinity, district: 'porto' })],
  ['Menu music', () => play('music:menu', LEVEL.menu, 0, { bus: 'music' })],
];

function section(title: string, buttons: [string, () => void][], scenario = false) {
  const el = document.createElement('section'), heading = document.createElement('h2'), row = document.createElement('div');
  heading.textContent = title; row.className = 'row'; el.append(heading, row);
  for (const [label, fn] of buttons) {
    const b = document.createElement('button'); b.textContent = label; if (scenario) b.className = 'scenario';
    b.addEventListener('click', () => { start(); fn(); });
    row.append(b);
  }
  main.append(el);
}
section('Readability scenarios', SCENARIOS, true);
const groups = new Map<string, string[]>();
for (const s of SOUNDS) { const g = s.id.split(':')[0]; groups.set(g, [...(groups.get(g) || []), s.id]); }
for (const [group, ids] of groups) section(group, ids.map(id => [id.split(':')[1] ?? id, () => play(id, -24, 0, { loop: false, bus: group === 'music' ? 'music' : group === 'bed' || group === 'critter' ? 'ambience' : 'effects' })]));
