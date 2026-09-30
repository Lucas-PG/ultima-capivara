import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import crowns from '../src/shared/vegetation-crowns.json';
import { crownProfileOf, CROWN_BAND, CROWN_SPECIES, PROFILED_SPECIES } from '../src/render/vegetation/crown-profile';
import { KIND } from '../src/render/vegetation/mesh-builder';
import { collectPlants, plantMatrix } from '../src/render/vegetation/plants';
import { buildTemplates } from '../src/render/vegetation/templates';
import { crownAt, plantCrown, roomVolumes, WALKER_BAND, walkingSurfaces } from '../src/shared/vegetation-crowns';
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
    expect(PROFILED_SPECIES).toEqual(expect.arrayContaining([...CROWN_SPECIES, 'hibiscus', 'bougainvillea', 'thicket', 'meadow']));
    for (const species of PROFILED_SPECIES) {
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

  it('keeps every rendered leaf out of every walled room, beside the house or through a neighbour', () => {
    // The Morro's upper rooms showed a pink ipe crown and bougainvillea growing through the walls
    // into the room. Independent of the profiles the placement uses: every leaf of every drawn
    // plant (trees, bushes, drapes) is tested against each room's box, from its floor to its
    // ceiling and out to the inner faces of its walls.
    const rooms = world.pieces!.flatMap(piece => roomVolumes(piece).map(room => ({ piece, room })));
    expect(rooms.length).toBeGreaterThan(50);
    expect(rooms.filter(({ piece }) => piece.piece === 'house_tall' || piece.piece === 'sobrado').length).toBeGreaterThan(16);
    const plants = collectPlants(world), species = new Set(plants.map(p => p.species));
    const templates = buildTemplates(species), vertex = new THREE.Vector3(), faults: string[] = [];
    for (const plant of plants) {
      const near = rooms.filter(({ piece }) => Math.hypot(piece.x - plant.position.x, piece.z - plant.position.z) < 22);
      if (!near.length) continue;
      const geometry = templates[plant.species][plant.variant][0], position = geometry.getAttribute('position'), aux = geometry.getAttribute('aux');
      for (let i = 0; i < position.count; i++) {
        if (aux.getY(i) !== KIND.leaf) continue;
        vertex.fromBufferAttribute(position, i).applyMatrix4(plant.matrix);
        const hit = near.find(({ piece, room }) => {
          const k = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw), dx = vertex.x - piece.x, dz = vertex.z - piece.z;
          const u = (dx * c - dz * s) / k, v = (dx * s + dz * c) / k, y = (vertex.y - piece.y) / k, [u0, v0, u1, v1] = room.bounds;
          // A leaf tip within 5 cm of a face (the wall and ceiling trim) is hidden.
          return u > u0 + .05 && u < u1 - .05 && v > v0 + .05 && v < v1 - .05 && y > room.y && y < room.top - .05;
        });
        if (hit) { faults.push(`${plant.species} at ${plant.position.x.toFixed(1)},${plant.position.z.toFixed(1)} in ${hit.piece.id}`); break; }
      }
    }
    expect(faults).toEqual([]);
  });

  it('never starts a player under a tree: no rendered leaf over any spawn, royale districts included', () => {
    // Four crowns hung over the Cachoeira and Mangue royale spawns: spawns were chosen after the
    // crowns were moved clear of the walks, so the tree rule never saw them. Every leaf of every
    // tree is tested against a 0.5 m column over each spawn, from the knee to above the head.
    expect(world.spawns.filter(s => s.mode === 'battle-royale').length).toBeGreaterThan(50);
    const templates = new Map<SpeciesId, THREE.BufferGeometry[]>();
    const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4(), faults: string[] = [];
    for (const object of world.objects) {
      const crown = plantCrown(object);
      if (!crown) continue;
      const near = world.spawns.filter(spawn => Math.hypot(spawn.x - crown.x, spawn.z - crown.z) < 14);
      if (!near.length) continue;
      const t = plantTransform(object);
      if (!templates.has(t.species)) templates.set(t.species, buildTemplates(new Set([t.species]))[t.species].map(lods => lods[0]));
      const geometry = templates.get(t.species)![t.variant], position = geometry.getAttribute('position'), aux = geometry.getAttribute('aux');
      plantMatrix(object, matrix);
      for (let i = 0; i < position.count; i++) {
        if (aux.getY(i) !== KIND.leaf) continue;
        vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
        const hit = near.find(spawn => Math.hypot(vertex.x - spawn.x, vertex.z - spawn.z) < .5 && vertex.y > spawn.y + .35 && vertex.y < spawn.y + 2.2);
        if (hit) { faults.push(`${object.id} over the ${hit.mode} spawn at ${hit.x.toFixed(1)},${hit.z.toFixed(1)} (${hit.district ?? 'arena'})`); break; }
      }
    }
    expect(faults).toEqual([]);
  });
});
