// The sound bank: every sound the game plays, rendered from code into PCM and
// loudness-normalized, so the mix table (mix.ts) alone sets how loud each
// category is. Rendering is deterministic per id and variant.
import { integratedLufs, momentaryLufs, Rng, scale, seedOf } from './dsp';
import { cocoBlast, cocoLaunch, GUNS, gunFar, gunNear, incomingReport, macheteSwing } from './weapons';
import { cloth, FOLEY_CUES, fleshHit, foley, impact, IMPACT_SURFACES, jump, mud, splash, step, STEP_MATERIALS, swimStroke, whiz } from './foley';
import { FEEDBACK_IDS, feedback, VOICE_IDS, voice } from './feedback';
import { balloonBurner, bed, BED_IDS, critter, CRITTER_IDS, STEREO_BEDS, type BedId } from './ambience';
import { defeat, menuLoop, sambaLoop, tensionLoop, victory } from './music';

export type Quality = 'high' | 'low';
/** full: the context rate (crisp transients); half and quarter: dark, distant or low beds; music: 24 kHz. */
export type RateClass = 'full' | 'half' | 'quarter' | 'music';
/** Every buffer is normalized to this loudness before the mix table applies its gain. */
export const REF_LUFS = -20;

export interface SoundDef {
  id: string; variants: number; lowVariants: number; rate: RateClass; channels: 1 | 2; loop: boolean;
  /** Bake order: 0 first (combat), higher later (ambience, music). */
  priority: number;
  render: (rate: number, rng: Rng, variant: number, channel: number, quality: Quality) => Float32Array;
}

const QUARTER_BEDS: ReadonlySet<BedId> = new Set(['wind', 'storm', 'cabin', 'engine', 'freefall', 'canopy', 'harbour', 'waterfall']);

const LOW_CRITTERS: ReadonlySet<string> = new Set(['dove', 'frog', 'dog', 'hen', 'rooster', 'church-bell', 'mill', 'creak']);
const HALF_FEEDBACK: ReadonlySet<string> = new Set(['thunder', 'zone-warn', 'supply-incoming', 'supply-land', 'chest', 'respawn', 'chute-open', 'storm-bite', 'heart', 'damage']);

const BED_SECONDS: Record<BedId, [high: number, low: number]> = {
  surf: [16, 10], wind: [16, 10], leaves: [12, 8], waterfall: [6, 5], harbour: [10, 7], storm: [10, 7], cabin: [4, 4], engine: [4, 4], freefall: [4, 3], canopy: [3, 3],
};

function def(id: string, variants: number, lowVariants: number, rate: RateClass, priority: number, render: SoundDef['render'], channels: 1 | 2 = 1, loop = false): SoundDef {
  return { id, variants, lowVariants, rate, channels, loop, priority, render };
}

export const SOUNDS: readonly SoundDef[] = [
  ...GUNS.map(g => def(`shot:${g}`, g === 'smg' || g === 'm4' ? 4 : 3, 2, 'full', 0, (r, rng) => gunNear(g, r, rng))),
  ...GUNS.map(g => def(`far:${g}`, 2, 1, 'half', 1, (r, rng) => gunFar(g, r, rng))),
  def('shot:coco', 2, 1, 'full', 0, (r, rng) => cocoLaunch(r, rng)),
  def('swing:machete', 3, 2, 'full', 0, (r, rng) => macheteSwing(r, rng)),
  def('boom:coco', 2, 1, 'full', 0, (r, rng) => cocoBlast(r, rng, false)),
  def('boom:coco-far', 1, 1, 'half', 1, (r, rng) => cocoBlast(r, rng, true)),
  def('whiz', 3, 2, 'full', 0, (r, rng) => whiz(r, rng)),
  def('shot:incoming', 2, 1, 'full', 0, (r, rng) => incomingReport(r, rng)),
  def('balloon:burner', 3, 1, 'half', 2, (r, rng) => balloonBurner(r, rng)),
  def('flesh', 2, 1, 'full', 1, (r, rng) => fleshHit(r, rng)),
  ...STEP_MATERIALS.map(m => def(`step:${m}`, 6, 3, 'full', 1, (r, rng, v) => step(m, false, r, rng, v))),
  ...STEP_MATERIALS.map(m => def(`land:${m}`, 2, 1, 'full', 1, (r, rng, v) => step(m, true, r, rng, v))),
  def('jump', 2, 1, 'full', 2, (r, rng) => jump(r, rng)),
  def('cloth', 2, 1, 'full', 2, (r, rng) => cloth(r, rng, false)),
  def('gear', 3, 2, 'full', 2, (r, rng) => cloth(r, rng, true)),
  def('swim', 3, 2, 'full', 2, (r, rng) => swimStroke(r, rng)),
  def('splash:in', 2, 1, 'full', 2, (r, rng) => splash(r, rng, true)),
  def('splash:out', 2, 1, 'full', 2, (r, rng) => splash(r, rng, false)),
  def('mud:in', 1, 1, 'full', 3, (r, rng) => mud(r, rng, true)),
  def('mud:bubble', 2, 1, 'full', 3, (r, rng) => mud(r, rng, false)),
  ...IMPACT_SURFACES.map(s => def(`impact:${s}`, 3, 2, 'full', 1, (r, rng, v) => impact(s, r, rng, v))),
  ...FOLEY_CUES.map(c => def(`foley:${c}`, 2, 1, 'full', 1, (r, rng) => foley(c, r, rng))),
  ...FEEDBACK_IDS.map(f => def(`fb:${f}`, f === 'hit' || f === 'crackle' || f === 'thunder' ? 2 : 1, 1, HALF_FEEDBACK.has(f) ? 'half' : 'full', f.startsWith('ui') || f === 'hit' || f === 'head' || f === 'kill' ? 0 : 2, (r, rng) => feedback(f, r, rng))),
  ...VOICE_IDS.map(v => def(`voice:${v}`, 3, 2, 'full', 2, (r, rng) => voice(v, r, rng))),
  ...BED_IDS.map(b => def(`bed:${b}`, 1, 1, QUARTER_BEDS.has(b) ? 'quarter' : 'half', 3, (r, rng, _v, ch, q) => bed(b, r, rng, ch, BED_SECONDS[b][q === 'low' ? 1 : 0]), STEREO_BEDS.has(b) ? 2 : 1, true)),
  ...CRITTER_IDS.map(c => def(`critter:${c}`, c.endsWith('bell') || c === 'mill' || c === 'cicada' ? 1 : 2, 1, LOW_CRITTERS.has(c) ? 'quarter' : 'half', 4, (r, rng) => critter(c, r, rng))),
  def('music:menu', 1, 1, 'music', 5, (r, rng, _v, ch) => menuLoop(r, rng, ch), 2, true),
  def('music:samba', 1, 1, 'music', 5, (r, rng, _v, ch) => sambaLoop(r, rng, ch), 2, true),
  def('music:tension', 1, 1, 'music', 5, (r, rng) => tensionLoop(r, rng, 0), 1, true),
  def('music:victory', 1, 1, 'music', 5, (r, rng, _v, ch) => victory(r, rng, ch), 2),
  def('music:defeat', 1, 1, 'music', 5, (r, rng) => defeat(r, rng)),
];

export const SOUND_BY_ID: ReadonlyMap<string, SoundDef> = new Map(SOUNDS.map(s => [s.id, s]));

export function rateFor(rate: RateClass, contextRate: number): number {
  return rate === 'full' ? contextRate : rate === 'half' ? Math.round(contextRate / 2) : rate === 'quarter' ? Math.round(contextRate / 4) : 24000;
}

export const variantsFor = (sound: SoundDef, quality: Quality) => quality === 'low' ? sound.lowVariants : sound.variants;

export interface Rendered { id: string; variant: number; rate: number; loop: boolean; channels: Float32Array[] }

/** Renders one variant and normalizes it to REF_LUFS (loops by their mean loudness, one-shots by their loudest 400 ms). */
export function renderSound(sound: SoundDef, variant: number, contextRate: number, quality: Quality = 'high'): Rendered {
  const rate = rateFor(sound.rate, contextRate);
  // Low quality plays beds and music in mono.
  const count = quality === 'low' && sound.priority >= 3 ? 1 : sound.channels;
  const channels = Array.from({ length: count }, (_, ch) => sound.render(rate, new Rng(seedOf(`${sound.id}#${variant}#${ch}`)), variant, ch, quality));
  const length = Math.min(...channels.map(c => c.length));
  const sum = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < length; i++) sum[i] += c[i] / channels.length;
  const measured = sound.loop ? integratedLufs(sum, rate) : momentaryLufs(sum, rate);
  const gain = 10 ** ((REF_LUFS - measured) / 20);
  // One-shots drop their silent tail (below -80 dB re peak) to save memory.
  let end = length;
  if (!sound.loop) {
    let top = 0;
    for (let i = 0; i < length; i++) top = Math.max(top, Math.abs(sum[i]));
    while (end > 1 && Math.abs(sum[end - 1]) < top * 1e-4) end--;
    end = Math.min(length, end + Math.round(rate * .005));
  }
  return { id: sound.id, variant, rate, loop: sound.loop, channels: channels.map(c => scale(c.slice(0, end), gain)) };
}

/** The bake order: combat first, then movement and feedback, ambience and music last. */
export function bakeOrder(quality: Quality): { sound: SoundDef; variant: number }[] {
  return [...SOUNDS].sort((a, b) => a.priority - b.priority)
    .flatMap(sound => Array.from({ length: variantsFor(sound, quality) }, (_, variant) => ({ sound, variant })));
}
