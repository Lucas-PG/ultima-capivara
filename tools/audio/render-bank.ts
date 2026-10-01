// Renders the procedural sound bank offline: bake time, memory, per-sound metrics,
// and optionally WAV files plus ffmpeg spectrograms for listening and review.
// npx tsx tools/audio/render-bank.ts [--quality low] [--out dir] [--match regex] [--png]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { bakeOrder, renderSound, type Quality } from '../../src/sound/bank';
import { ampDb, bandShare, centroid, envelopeShape, momentaryMax, peak } from '../../tests/audio/metrics';

const args = process.argv.slice(2), opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const quality = (opt('quality') ?? 'high') as Quality, out = opt('out'), match = new RegExp(opt('match') ?? '.'), png = args.includes('--png');
const contextRate = 44100;

function wav(channels: Float32Array[], rate: number): Buffer {
  const n = channels[0].length, c = channels.length, data = Buffer.alloc(44 + n * c * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * c * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(c, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * c * 2, 28);
  data.writeUInt16LE(c * 2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * c * 2, 40);
  let peakValue = 0; for (const ch of channels) peakValue = Math.max(peakValue, peak(ch));
  const g = peakValue > .98 ? .98 / peakValue : 1; // files only: the game's mix gain sets the real level
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[k][i] * g)) * 32767), 44 + (i * c + k) * 2);
  return data;
}

if (out) mkdirSync(out, { recursive: true });
let samples = 0, sounds = 0;
const started = performance.now(), perGroup = new Map<string, number>();
for (const { sound, variant } of bakeOrder(quality)) {
  const t = performance.now();
  const r = renderSound(sound, variant, contextRate, quality);
  const group = sound.id.split(':')[0];
  perGroup.set(group, (perGroup.get(group) ?? 0) + performance.now() - t);
  samples += r.channels.length * r.channels[0].length; sounds++;
  if (!match.test(sound.id) || variant > 0) continue;
  const mono = r.channels[0], e = envelopeShape(mono, r.rate);
  console.log(`${sound.id.padEnd(22)} ${(mono.length / r.rate).toFixed(2)}s pk ${ampDb(peak(mono)).toFixed(1).padStart(5)} M ${momentaryMax(mono, r.rate).toFixed(1)} ` +
    `cent ${centroid(mono, r.rate).toFixed(0).padStart(5)} <150 ${bandShare(mono, r.rate, 20, 150).toFixed(2)} >3k ${bandShare(mono, r.rate, 3000, 24000).toFixed(2)} t20 ${e.t20Ms} t40 ${e.t40Ms}`);
  if (out) {
    const name = sound.id.replace(/[:]/g, '_');
    writeFileSync(`${out}/${name}.wav`, wav(r.channels, r.rate));
    if (png) execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-i', `${out}/${name}.wav`, '-lavfi', 'showspectrumpic=s=640x240:legend=1:scale=log:fscale=log:mode=combined', `${out}/${name}.png`]);
  }
}
console.log(`\n${sounds} buffers, ${(samples / 1e6).toFixed(2)} M samples (${(samples * 4 / 1048576).toFixed(1)} MB as float32), bake ${(performance.now() - started).toFixed(0)} ms (${quality})`);
console.log([...perGroup].map(([g, ms]) => `${g} ${ms.toFixed(0)}`).join(', '));
