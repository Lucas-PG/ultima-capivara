import * as THREE from 'three';
import { expect, it } from 'vitest';
import { plantMatrix } from '../src/render/vegetation/plants';
import { KIND, TRUNK_KINDS } from '../src/render/vegetation/mesh-builder';
import { buildTemplates } from '../src/render/vegetation/templates';
import { plantSpecies, plantVariant, type SpeciesId } from '../src/shared/vegetation-species';
import { hasSolidTrunk, plantTrunkSections } from '../src/shared/vegetation-trunks';
import type { MapObject } from '../src/shared/types';

const object = (detail: string, height: number, x = 18, z = -34, y = 1.2, kind: 'tree' | 'palm' = 'tree'): MapObject =>
  ({ id: 'stem', kind, detail, pos: { x, y, z }, scale: { x: 1, y: height, z: 1 }, rotation: 1.17, color: '#789956' });

// A collider built from `plantTrunkSections` is only honest if the trunk the player sees is that same
// set of tapered cylinders: same centreline, radius, yaw, lean and scale.
it('renders each solid trunk from the same tapered sections a collider would use', () => {
  const cases: [SpeciesId, string, number, 'tree' | 'palm'][] = [
    ['coconut', 'coconut', 6, 'palm'], ['coconut', 'coconut', 9, 'palm'], ['coconut', 'coconut', 12, 'palm'],
    ['mango', 'mango', 7, 'tree'], ['jungle', 'jungle', 10, 'tree'], ['almond', 'almond', 8, 'tree'],
    ['umbrella', 'flamboyant', 9, 'tree'], ['cashew', 'cashew', 5, 'tree'], ['mangrove', 'mangrove', 6, 'tree'],
    ['ipe-yellow', 'ipe-yellow', 8, 'tree'],
  ];
  for (const [species, detail, height, kind] of cases) {
    const plant = object(detail, height, 18, -34, 1.2, kind);
    expect(plantSpecies(plant)).toBe(species);
    const sections = plantTrunkSections(plant);
    expect(sections.length, species).toBeGreaterThan(4);
    expect(sections[0].a, species).toEqual(plant.pos);
    const geometry = buildTemplates(new Set([species]))[species][plantVariant(plant, species)][0];
    const position = geometry.getAttribute('position'), aux = geometry.getAttribute('aux');
    const matrix = plantMatrix(plant), vertices: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i++) if (TRUNK_KINDS.includes(aux.getY(i)))
      vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
    expect(vertices.length, `${species} has no collision-flagged trunk vertices`).toBeGreaterThan(60);
    for (const vertex of vertices) {
      const error = Math.min(...sections.map(section => {
        const a = new THREE.Vector3().copy(section.a), b = new THREE.Vector3().copy(section.b);
        const axis = b.clone().sub(a), t = THREE.MathUtils.clamp(vertex.clone().sub(a).dot(axis) / axis.lengthSq(), 0, 1);
        return vertex.distanceTo(a.addScaledVector(axis, t)) - THREE.MathUtils.lerp(section.radiusBottom, section.radiusTop, t);
      }));
      // The tube bends between sections: a few millimetres of slack, never a fat trunk over thin collision.
      expect(error, `${species} trunk swells past its collision radius`).toBeLessThan(.035);
    }
    for (const section of sections) {
      const middle = new THREE.Vector3().copy(section.a).lerp(section.b, .5);
      expect(Math.min(...vertices.map(vertex => vertex.distanceTo(middle))), `${species} trunk is missing a section`).toBeLessThan(
        Math.hypot(new THREE.Vector3().copy(section.a).distanceTo(section.b) / 2, section.radiusBottom) + .035);
    }
  }
});

it('leans shore palms over the water and never requests solid trunks for soft plants', () => {
  // Coconut palms on the beach grow toward the sea: the trunk top sits farther from the island centre than the base.
  for (const [x, z] of [[-27, 113], [95, -91], [-118, 20], [40, 118]]) {
    const palm = object('coconut', 8, x, z, .8, 'palm');
    const sections = plantTrunkSections(palm), top = sections.at(-1)!.b;
    const outward = (top.x - palm.pos.x) * x + (top.z - palm.pos.z) * z;
    expect(outward, `palm at ${x},${z} leans inland`).toBeGreaterThan(.3);
  }
  const soft = object('foliage', 1.7);
  expect(plantSpecies(soft)).toBe('shrub');
  expect(plantTrunkSections(soft)).toEqual([]);
  expect(plantTrunkSections(object('banana', 4))).toEqual([]);
  expect(plantTrunkSections({ ...soft, kind: 'grass', detail: 'fern' })).toEqual([]);
  expect(hasSolidTrunk('banana') || hasSolidTrunk('shrub')).toBe(false);
});
