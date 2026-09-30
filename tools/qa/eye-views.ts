// Turns ground positions into eye-level review cameras (1.62 m over the walkable surface) for cam.mjs / veg.mjs.
// npx tsx tools/qa/eye-views.ts <out.json> '<json {name: [x, z, targetX, targetZ, fov?, lift?]}>'
//   lift raises the target above the target's own eye height (metres), e.g. to frame a crown.
import { writeFileSync } from 'node:fs';
import { createWorld } from '../../src/shared/world';
import { walkableHeight } from '../../src/shared/navigation';
const [out, json] = process.argv.slice(2);
const world = createWorld(), views: Record<string, number[]> = {};
const r = (n: number) => Math.round(n * 100) / 100;
for (const [name, [x, z, tx, tz, fov = 65, lift = 0]] of Object.entries(JSON.parse(json) as Record<string, number[]>)) {
  const eye = walkableHeight(x, z, world) + 1.62, target = walkableHeight(tx, tz, world) + 1.62 + lift;
  views[name] = [x, r(eye), z, tx, r(target), tz, fov];
}
writeFileSync(out, JSON.stringify(views, null, 1));
console.log(Object.entries(views).map(([k, v]) => `${k} y=${v[1]}`).join('  '));
