// Prints level, loudness, noise floor and modulation for captures written by capture-mix.mjs.
// npx tsx tools/audio/analyze-capture.ts <outDir> [scenario]
import { readFileSync } from 'node:fs';
import { ampDb, loudness, modulationDb, noiseFloor, peak, rms } from '../../tests/audio/metrics';

const [dir = 'audio-capture', scenario = 'idle'] = process.argv.slice(2);
const info = JSON.parse(readFileSync(`${dir}/${scenario}.json`, 'utf8'));
console.log(`${scenario} (${info.mode}), looping sources: ${info.loops.map((s: number) => `${s.toFixed(1)} s`).join(', ') || 'none'}`);
for (const segment of info.segments) {
  const raw = readFileSync(`${dir}/${scenario}-${segment.name}.f32`);
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const floor = noiseFloor(x, segment.rate);
  console.log(`\n${segment.name}: ${(x.length / segment.rate).toFixed(1)} s, peak ${ampDb(peak(x)).toFixed(1)} dBFS, rms ${ampDb(rms(x)).toFixed(1)} dBFS, ` +
    `loudness ${loudness(x, segment.rate).toFixed(1)} LUFS, modulation ${modulationDb(x, segment.rate).toFixed(1)} dB, ` +
    `broadband floor ${floor.broadbandFloorDb.toFixed(1)} dBFS over ${floor.flatBands} flat octaves`);
  console.log('  octave  ' + floor.bands.map(b => String(b.centre).padStart(6)).join(''));
  console.log('  floor   ' + floor.bands.map(b => b.floorDb.toFixed(0).padStart(6)).join(''));
  console.log('  swing   ' + floor.bands.map(b => b.swingDb.toFixed(0).padStart(6)).join(''));
}
