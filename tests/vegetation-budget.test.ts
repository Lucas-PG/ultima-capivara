import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { FOLIAGE_TILES } from '../src/render/vegetation/atlas';
import { KIND } from '../src/render/vegetation/mesh-builder';
import { plantMatrix } from '../src/render/vegetation/plants';
import { buildTemplates } from '../src/render/vegetation/templates';
import { createWorld } from '../src/shared/world';
import { plantSpecies, SPECIES, SPECIES_IDS, type SpeciesId } from '../src/shared/vegetation-species';
import type { MapObject, WorldSpec } from '../src/shared/types';

// Species whose builders have not landed yet are listed here on purpose. The list may only shrink.
const NOT_YET_DRAWN: SpeciesId[] = ['royal', 'banana', 'shrub'];
const templates = buildTemplates(new Set(SPECIES_IDS));
const triangles = (g: THREE.BufferGeometry) => g.index!.count / 3;
const extent = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());

describe('plant templates', () => {
  it('shrink at every LOD while keeping the crown silhouette', () => {
    for (const [species, variants] of Object.entries(templates)) for (const [variant, [near, mid, far]] of variants.entries()) {
      const label = `${species} v${variant}`;
      expect(triangles(mid), label).toBeLessThan(triangles(near) * .5);
      expect(triangles(far), label).toBeLessThan(triangles(mid) * .5);
      const [n, m, f] = [near, mid, far].map(extent);
      // Distant crowns must keep the width and height the player judges the tree by.
      for (const [name, e] of [['mid', m], ['far', f]] as const) {
        expect(Math.abs(e.x / n.x - 1), `${label} ${name} width`).toBeLessThan(.22);
        expect(Math.abs(e.y / n.y - 1), `${label} ${name} height`).toBeLessThan(.22);
        expect(Math.abs(e.z / n.z - 1), `${label} ${name} depth`).toBeLessThan(.22);
      }
    }
  });

  it('stay within triangle and memory budgets', () => {
    let vertices = 0;
    for (const [species, variants] of Object.entries(templates)) for (const lods of variants) {
      const [near, mid, far] = lods.map(triangles);
      expect(near, `${species} LOD0`).toBeLessThanOrEqual(3600);
      expect(mid, `${species} LOD1`).toBeLessThanOrEqual(900);
      expect(far, `${species} LOD2`).toBeLessThanOrEqual(340);
      for (const g of lods) vertices += g.getAttribute('position').count;
    }
    expect(vertices, 'all templates together').toBeLessThan(160_000);
  });

  it('carry leaf UVs that stay inside a painted atlas tile, so a card never samples its neighbour', () => {
    const rects = Object.values(FOLIAGE_TILES);
    for (const [species, variants] of Object.entries(templates)) for (const lods of variants) for (const g of lods) {
      const uv = g.getAttribute('uv'), aux = g.getAttribute('aux');
      for (let i = 0; i < uv.count; i++) {
        if (aux.getY(i) !== KIND.leaf) continue;
        const u = uv.getX(i), v = uv.getY(i);
        expect(rects.some(r => u >= r.u0 - 1e-6 && u <= r.u1 + 1e-6 && v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6), `${species} vertex ${i}`).toBe(true);
      }
    }
  });

  it('give every crown a solid trunk and wind sway that grows toward the leaves', () => {
    for (const species of SPECIES_IDS) {
      if (!(species in templates) || SPECIES[species].kind === 'shrub' || SPECIES[species].kind === 'banana') continue;
      const g = templates[species][0][0], aux = g.getAttribute('aux');
      let trunk = 0, leafSway = 0, leaves = 0, trunkSway = 0;
      for (let i = 0; i < aux.count; i++) {
        if (aux.getY(i) === KIND.trunk) { trunk++; trunkSway = Math.max(trunkSway, aux.getX(i)); }
        if (aux.getY(i) === KIND.leaf) { leaves++; leafSway += aux.getX(i); }
      }
      expect(trunk, species).toBeGreaterThan(60);
      expect(leafSway / leaves, `${species} leaves must move more than the trunk`).toBeGreaterThan(trunkSway * 1.5);
    }
  });
});

describe('vegetation batch', () => {
  it('draws every authored tree and palm as one instance in one batched mesh, at its authored place and size', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    try {
      const plants = world.objects.filter(o => o.kind === 'tree' || o.kind === 'palm');
      const drawn = plants.filter(o => !NOT_YET_DRAWN.includes(plantSpecies(o)));
      expect(vegetation.batch.size).toBe(drawn.length);
      // Species and variants live inside the batch: the whole island's crowns cost one draw call.
      const meshes = vegetation.group.children.filter((c): c is THREE.BatchedMesh => c instanceof THREE.BatchedMesh);
      expect(meshes).toHaveLength(1);
      expect(vegetation.group.children).toHaveLength(1);
      expect(meshes[0].castShadow && meshes[0].receiveShadow).toBe(true);
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion();
      const seen = new Set<string>();
      drawn.forEach((object, i) => {
        meshes[0].getMatrixAt(vegetation.batch.instanceOf(i), matrix);
        matrix.decompose(position, q, scale);
        expect(position.distanceTo(new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z)), object.id).toBeLessThan(1e-4);
        const expected = plantMatrix(object);
        expect(matrix.elements.every((e, k) => Math.abs(e - expected.elements[k]) < 1e-3), `${object.id} matrix`).toBe(true);
        // Uniform enough that the template's own height maps to the authored plant height.
        expect(scale.y * SPECIES[plantSpecies(object)].height, object.id).toBeCloseTo(object.scale.y, 3);
        seen.add(plantSpecies(object));
      });
      for (const species of ['coconut', 'mango', 'umbrella', 'ipe-yellow', 'ipe-pink', 'mangrove'] as SpeciesId[])
        expect(seen.has(species), `${species} should have a placed specimen`).toBe(true);
    } finally { vegetation.dispose(); }
  });

  it('never leaves an authored species without a builder once it is off the pending list', () => {
    const world = createWorld(), used = new Set(world.objects.filter(o => o.kind === 'tree' || o.kind === 'palm').map(plantSpecies));
    for (const species of used) if (!NOT_YET_DRAWN.includes(species)) expect(species in templates, species).toBe(true);
  });

  it('picks cheaper templates by camera distance, sooner on Low, and holds a LOD across small moves', () => {
    const tree = (x: number): MapObject => ({ id: `t${x}`, kind: 'tree', detail: 'mango', pos: { x, y: 0, z: 0 }, scale: { x: 1, y: 8, z: 1 }, color: '#5FA544' });
    const world = { objects: [tree(0)], colliders: [] } as unknown as WorldSpec;
    const vegetation = buildVegetation(world), camera = new THREE.PerspectiveCamera();
    try {
      const lodAt = (distance: number, quality: 'low' | 'medium' | 'high') => {
        camera.position.set(distance, 1.6, 0); camera.updateMatrixWorld();
        vegetation.setQuality(quality); vegetation.update(0, camera);
        return vegetation.batch.lodOf(0);
      };
      expect(lodAt(10, 'medium')).toBe(0);
      expect(lodAt(45, 'medium')).toBe(1);
      expect(lodAt(120, 'medium')).toBe(2);
      expect(lodAt(20, 'low')).toBe(1);
      expect(lodAt(60, 'low')).toBe(2);
      expect(lodAt(30, 'high')).toBe(0);
      // Hysteresis: hovering at the switch distance must not flip templates.
      lodAt(26, 'medium');
      const before = vegetation.batch.lodOf(0);
      camera.position.set(29, 1.6, 0); vegetation.update(0, camera);
      camera.position.set(27, 1.6, 0); vegetation.update(0, camera);
      expect(vegetation.batch.lodOf(0)).toBe(before);
    } finally { vegetation.dispose(); }
  });

  it('keeps the densest 360 degree view within the triangle budget', () => {
    const world = createWorld(), vegetation = buildVegetation(world), camera = new THREE.PerspectiveCamera();
    try {
      // Worst case: every plant around the camera drawn at once, at the LOD the camera distance selects.
      for (const [x, z] of [[-1, -10], [-26, 104], [-87, -53], [62, 63], [101, 52]]) {
        camera.position.set(x, 4, z); camera.updateMatrixWorld();
        vegetation.setQuality('medium'); vegetation.update(0, camera);
        let tris = 0;
        for (let i = 0; i < vegetation.batch.size; i++) {
          const plant = vegetation.batch.plantAt(i);
          tris += triangles(templates[plant.species][plant.variant][vegetation.batch.lodOf(i)]);
        }
        expect(tris, `around ${x},${z}`).toBeLessThan(420_000);
      }
    } finally { vegetation.dispose(); }
  });

  it('keeps island pickup and spawn placement deterministic through vegetation rebuilds', () => {
    const world = createWorld();
    const before = structuredClone({ loot: world.loot, spawns: world.spawns, chests: world.chests });
    const vegetation = buildVegetation(world); vegetation.dispose();
    expect({ loot: world.loot, spawns: world.spawns, chests: world.chests }).toEqual(before);
    const rebuilt = createWorld();
    expect({ loot: rebuilt.loot, spawns: rebuilt.spawns, chests: rebuilt.chests }).toEqual(before);
  });
});
