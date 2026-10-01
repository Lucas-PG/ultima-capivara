// Writes review cameras for one specimen of every species: eye level at 3.5 m, 15 m (lit and back-lit),
// 60 m, from below and from the air. The sun sits toward -x,-z, so "lit" cameras stand on that side.
// npx tsx tools/qa/species-views.ts <out.json> [species ...]
import { writeFileSync } from 'node:fs';
import { createWorld } from '../../src/shared/world';
import { plantSpecies } from '../../src/shared/vegetation-species';
import { terrainHeight } from '../../src/shared/terrain';
import { hasLineOfSight } from '../../src/shared/collision';
const [out, ...only] = process.argv.slice(2);
const world = createWorld();
const seen = new Map<string, { x: number; z: number; y: number; h: number; score: number }>();
// Score a specimen by how open its surroundings are: flat ground, no colliders, no other crowns.
const openness = (o: (typeof world.objects)[number]) => {
  let score = 0;
  const g = terrainHeight(o.pos.x, o.pos.z);
  for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [12, 0], [-12, 0], [0, 12], [0, -12]]) score += Math.abs(terrainHeight(o.pos.x + dx, o.pos.z + dz) - g) * 3;
  for (const c of world.colliders) if (c.max.x > o.pos.x - 14 && c.min.x < o.pos.x + 14 && c.max.z > o.pos.z - 14 && c.min.z < o.pos.z + 14 && c.max.y > g + .3) score += 1.5;
  for (const p of world.objects) if (p !== o && (p.kind === 'tree' || p.kind === 'palm') && Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < 12) score += 4;
  return score;
};
for (const o of world.objects) {
  if (o.kind !== 'tree' && o.kind !== 'palm') continue;
  const s = plantSpecies(o), score = openness(o);
  if (!seen.has(s) || score < seen.get(s)!.score) seen.set(s, { x: o.pos.x, z: o.pos.z, y: o.pos.y, h: o.scale.y, score });
}
const views: Record<string, number[]> = {};
const eye = (x: number, z: number) => terrainHeight(x, z) + 1.62;
const insideCollider = (x: number, y: number, z: number) => world.colliders.some(c =>
  x > c.min.x - .4 && x < c.max.x + .4 && z > c.min.z - .4 && z < c.max.z + .4 && y > c.min.y - .2 && y < c.max.y + .2);
for (const [s, p] of seen) {
  if (only.length && !only.includes(s)) continue;
  const h = Math.abs(p.h), ground = terrainHeight(p.x, p.z);
  const target = { x: p.x, y: ground + h * .55, z: p.z };
  // Scan azimuths from the preferred one until the camera is on dry land, outside every collider and sees the crown.
  const camera = (d: number, prefer: number, y?: number) => {
    for (let k = 0; k < 24; k++) {
      const a = prefer + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * Math.PI / 12, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const cy = y ?? eye(x, z);
      if (terrainHeight(x, z) < .3 || insideCollider(x, cy, z) || insideCollider(x, cy - 1.2, z)) continue;
      if (!hasLineOfSight({ x, y: cy, z }, target, world)) continue;
      return [x, cy, z];
    }
    return null;
  };
  const sun = Math.atan2(-.53, -.85);            // toward the sun side (-x, -z)
  const add = (name: string, d: number, prefer: number, tall: number, fov: number, y?: number) => {
    const c = camera(d, prefer, y);
    if (c) views[name] = [c[0], c[1], c[2], p.x, ground + h * tall, p.z, fov];
  };
  add(`${s}-3`, 3.5, sun, .6, 72);
  add(`${s}-15`, 15, sun, .55, 55);
  add(`${s}-15b`, 15, sun + Math.PI, .55, 55);
  add(`${s}-60`, 45, sun, .5, 38);
  views[`${s}-under`] = [p.x - 1.2, eye(p.x, p.z), p.z - .8, p.x, ground + h * .85, p.z, 85];
  views[`${s}-air`] = [p.x - 14, ground + 26, p.z - 10, p.x, ground + h * .5, p.z, 55];
}
writeFileSync(out, JSON.stringify(views, null, 1));
console.log([...seen].map(([s, p]) => `${s}@${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' '));
