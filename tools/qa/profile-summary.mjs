// Source-mapped CPU or allocation profiles from real-perf.mjs.
// node tools/qa/profile-summary.mjs <profile.json|profile.cpuprofile> <buildDir>
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const [path, build] = process.argv.slice(2);
if (!build) throw new Error('Usage: node tools/qa/profile-summary.mjs <profile> <buildDir>');
const profile = JSON.parse(readFileSync(path, 'utf8')), maps = new Map(), self = new Map();
const location = frame => {
  const file = basename(frame.url), mapPath = join(build, 'assets', `${file}.map`);
  if (!maps.has(file)) maps.set(file, existsSync(mapPath) ? new TraceMap(JSON.parse(readFileSync(mapPath, 'utf8'))) : null);
  const map = maps.get(file), position = map ? originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber }) : null;
  return position?.source ? `${position.name || frame.functionName || '(anon)'} ${position.source.replace(/^\.\.\//g, '')}:${position.line}`
    : `${frame.functionName || '(anon)'} ${file}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
};
const add = (frame, amount) => { const key = location(frame); self.set(key, (self.get(key) || 0) + amount); };
if (profile.nodes) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  profile.samples.forEach((id, i) => add(nodes.get(id).callFrame, profile.timeDeltas[i] / 1000));
} else {
  const walk = node => { add(node.callFrame, node.selfSize / 1024); node.children.forEach(walk); };
  walk(profile.head);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ profile: path, units: profile.nodes ? 'ms' : 'KB', total: +total.toFixed(2),
  self: [...self].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([functionName, value]) => ({ functionName, value: +value.toFixed(2), percent: +(100 * value / total).toFixed(2) })) }, null, 2));
