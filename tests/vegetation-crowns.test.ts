import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import crowns from '../src/shared/vegetation-crowns.json';
import { crownProfileOf, CROWN_BAND, CROWN_SPECIES } from '../src/render/vegetation/crown-profile';
import { KIND } from '../src/render/vegetation/mesh-builder';
import { plantMatrix } from '../src/render/vegetation/plants';
import { buildTemplates } from '../src/render/vegetation/templates';
import { crownAt, plantCrown, WALKER_BAND, walkingSurfaces } from '../src/shared/vegetation-crowns';
import { vegetationDressing } from '../src/shared/vegetation-dressing';
import { plantTransform } from '../src/shared/vegetation-trunks';
import { createWorld } from '../src/shared/world';
import type { SpeciesId } from '../src/shared/vegetation-species';

// Crowns used to hang into the camera over the Morro's roof path and along the
// streets: a mango's outer boughs droop to 1.8 m, a palm's old fronds lower.
// Placement now keeps every crown out of the walker's band over every walking
// surface, measured with profiles baked from the very templates that render.
const world = createWorld();
const surfaces = walkingSurfaces(world);

describe('crowns stay clear of walking height', () => {
  it('bakes each crown profile from its render template, never flattering the real foliage', () => {
    expect(crowns.band).toBe(CROWN_BAND);
    const stored = crowns.profiles as unknown as Record<string, [number, number][][]>;
    for (const species of CROWN_SPECIES) {
      const actual = crownProfileOf(species);
      expect(stored[species], `${species}: run npx tsx scripts/generate-crown-profiles.ts`).toHaveLength(actual.length);
      actual.forEach((rings, variant) => {
        expect(stored[species][variant].length, `${species} ${variant} reach`).toBeGreaterThanOrEqual(rings.length);
        rings.forEach(([low, high], ring) => {
          expect(stored[species][variant][ring][0], `${species} ${variant} ring ${ring} low`).toBeLessThanOrEqual(low + 1e-6);
          expect(stored[species][variant][ring][1], `${species} ${variant} ring ${ring} high`).toBeGreaterThanOrEqual(high - 1e-6);
        });
      });
    }
  });

  it('keeps every tree, palm and garden banana out of the band from waist to above the head over any walk', () => {
    const faults: string[] = [];
    for (const object of world.objects) {
      const crown = plantCrown(object), hit = crown && surfaces.underCrown(crown);
      if (hit) faults.push(`${object.id} over ${hit.x.toFixed(1)},${hit.y.toFixed(1)},${hit.z.toFixed(1)}`);
    }
    for (const plant of vegetationDressing(world)) {
      const crown = crownAt(plant.species, plant.variant, plant.x, plant.y, plant.z, plant.height), hit = crown && surfaces.underCrown(crown);
      if (hit) faults.push(`${plant.id} over ${hit.x.toFixed(1)},${hit.y.toFixed(1)},${hit.z.toFixed(1)}`);
    }
    expect(faults).toEqual([]);
  });

  it('holds for the rendered leaves themselves, over streets, routes, decks and the Morro roof terraces', () => {
    // Independent of the profiles: transform every leaf of the drawn template and test it against
    // the walking surface samples below it.
    const templates = new Map<SpeciesId, THREE.BufferGeometry[]>();
    const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4(), faults: string[] = [];
    let checked = 0, roofs = 0;
    for (const object of world.objects) {
      const crown = plantCrown(object);
      if (!crown || !surfaces.find(crown.x, crown.z, 12, () => true)) continue;
      const t = plantTransform(object);
      if (!templates.has(t.species)) templates.set(t.species, buildTemplates(new Set([t.species]))[t.species].map(lods => lods[0]));
      const geometry = templates.get(t.species)![t.variant], position = geometry.getAttribute('position'), aux = geometry.getAttribute('aux');
      plantMatrix(object, matrix); checked++;
      for (let i = 0; i < position.count; i += 2) {
        if (aux.getY(i) !== KIND.leaf) continue;
        vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
        const hit = surfaces.find(vertex.x, vertex.z, .5, (_x, y) => vertex.y > y + WALKER_BAND[0] && vertex.y < y + WALKER_BAND[1]);
        if (hit) { faults.push(`${object.id} leaf at ${vertex.y.toFixed(2)} over ${hit.x.toFixed(1)},${hit.y.toFixed(1)},${hit.z.toFixed(1)}`); break; }
      }
    }
    for (const piece of world.pieces!) if (/^house_laje/.test(piece.piece) && piece.x < -55) roofs++;
    expect(checked).toBeGreaterThan(80);
    expect(roofs).toBeGreaterThan(5);
    expect(faults).toEqual([]);
  });
});
