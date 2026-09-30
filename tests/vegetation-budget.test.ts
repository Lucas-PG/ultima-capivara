import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { isletPalms } from '../src/render/island-backdrop';
import { HIDE_DISTANCE } from '../src/render/vegetation/batch';
import { FOLIAGE_TILES } from '../src/render/vegetation/atlas';
import { KIND, TRUNK_KINDS } from '../src/render/vegetation/mesh-builder';
import { plantMatrix } from '../src/render/vegetation/plants';
import { buildTemplates } from '../src/render/vegetation/templates';
import { createWorld } from '../src/shared/world';
import { fieldRows, onFieldRow, vegetationDressing } from '../src/shared/vegetation-dressing';
import { isBatchedPlant, plantSpecies, SPECIES, SPECIES_IDS, type SpeciesId } from '../src/shared/vegetation-species';
import type { MapObject, WorldSpec } from '../src/shared/types';

const templates = buildTemplates(new Set(SPECIES_IDS));
const triangles = (g: THREE.BufferGeometry) => g.index!.count / 3;
const extent = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());
const crowned = (species: SpeciesId) => SPECIES[species].kind === 'palm' || SPECIES[species].kind === 'tree';

describe('plant templates', () => {
  it('exist for every species, so nothing the island places is silently left undrawn', () => {
    for (const species of SPECIES_IDS) {
      expect(templates[species], species).toBeDefined();
      expect(templates[species], species).toHaveLength(SPECIES[species].variants);
    }
  });

  it('shrink at every LOD while keeping the silhouette the player judges a plant by', () => {
    for (const [species, variants] of Object.entries(templates) as [SpeciesId, THREE.BufferGeometry[][]][]) for (const [variant, [near, mid, far]] of variants.entries()) {
      const label = `${species} v${variant}`;
      // Big templates must halve per step; tiny ones (a few crossed cards) only may not grow.
      if (triangles(near) > 200) expect(triangles(mid), label).toBeLessThan(triangles(near) * .5);
      else expect(triangles(mid), label).toBeLessThanOrEqual(triangles(near));
      if (triangles(mid) > 100) expect(triangles(far), label).toBeLessThan(triangles(mid) * .5);
      else expect(triangles(far), label).toBeLessThanOrEqual(triangles(mid));
      const [n, m, f] = [near, mid, far].map(extent);
      // Crowns and bushes are cover and landmarks: width and height hold within 22 %. Floor plants, wall drapes and
      // the planting on kit planters and beds (whose solid kit piece carries the silhouette), 35 %.
      const decorative = SPECIES[species].kind === 'ground' || SPECIES[species].kind === 'vine' || species === 'pot' || species === 'bed';
      const tolerance = decorative ? .35 : .22;
      for (const [name, e] of [['mid', m], ['far', f]] as const) {
        expect(Math.abs(e.x / n.x - 1), `${label} ${name} width`).toBeLessThan(tolerance);
        expect(Math.abs(e.y / n.y - 1), `${label} ${name} height`).toBeLessThan(tolerance);
        expect(Math.abs(e.z / n.z - 1), `${label} ${name} depth`).toBeLessThan(tolerance);
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

  it('give every palm and tree a solid trunk and wind sway that grows toward the leaves', () => {
    for (const species of SPECIES_IDS.filter(crowned)) {
      const g = templates[species][0][0], aux = g.getAttribute('aux');
      let trunk = 0, leafSway = 0, leaves = 0, trunkSway = 0;
      for (let i = 0; i < aux.count; i++) {
        if (TRUNK_KINDS.includes(aux.getY(i))) { trunk++; trunkSway = Math.max(trunkSway, aux.getX(i)); }
        if (aux.getY(i) === KIND.leaf) { leaves++; leafSway += aux.getX(i); }
      }
      expect(trunk, species).toBeGreaterThan(60);
      expect(leafSway / leaves, `${species} leaves must move more than the trunk`).toBeGreaterThan(trunkSway * 1.5);
    }
  });

  it('paint growth rings on palm trunks only, never on broadleaf bark', () => {
    for (const species of SPECIES_IDS.filter(crowned)) {
      const aux = templates[species][0][0].getAttribute('aux');
      let ringed = false;
      for (let i = 0; i < aux.count; i++) if (aux.getY(i) === KIND.palmTrunk) ringed = true;
      expect(ringed, species).toBe(SPECIES[species].kind === 'palm');
    }
  });

  it('hang wall drapes from their origin down one face of the wall', () => {
    // Vine template space: origin on the wall top edge, wall face at z = 0, plant on +z.
    for (const lods of templates.vine) for (const g of lods) {
      const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      expect(box.max.y, 'drape rises over the wall top').toBeLessThan(.35);
      expect(box.min.y, 'drape must hang down the wall').toBeLessThan(-1.2);
      // Only the mass along the top may lean back over the wall; below it the leaves stay off the face.
      const position = g.getAttribute('position');
      for (let i = 0; i < position.count; i++) if (position.getY(i) < -.45) expect(position.getZ(i), 'drape sinks into the wall').toBeGreaterThan(-.02);
    }
  });
});

describe('vegetation batch', () => {
  it('draws every authored plant and every dressing plant as one instance in one batched mesh, at its authored place and size', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    try {
      // Seedlings on the farm's field rows give way to the full rows the dressing plants there.
      const rows = fieldRows(world), authored = world.objects.filter(o => isBatchedPlant(o) && !onFieldRow(o, rows)), dressing = vegetationDressing(world);
      // Plus the palms on the offshore islets' coves, after the island's own plants.
      const islets = isletPalms(world);
      expect(islets.length).toBeGreaterThan(30);
      expect(vegetation.batch.size).toBe(authored.length + dressing.length + islets.length);
      // Species and variants live inside the batch: the whole island's plants cost one draw call.
      const meshes = vegetation.group.children.filter((c): c is THREE.BatchedMesh => c instanceof THREE.BatchedMesh);
      expect(meshes).toHaveLength(1);
      expect(vegetation.group.children).toHaveLength(1);
      expect(meshes[0].castShadow && meshes[0].receiveShadow).toBe(true);
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion();
      const seen = new Set<string>();
      authored.forEach((object, i) => {
        meshes[0].getMatrixAt(vegetation.batch.instanceOf(i), matrix);
        matrix.decompose(position, q, scale);
        expect(position.distanceTo(new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z)), object.id).toBeLessThan(1e-4);
        const expected = plantMatrix(object);
        expect(matrix.elements.every((e, k) => Math.abs(e - expected.elements[k]) < 1e-3), `${object.id} matrix`).toBe(true);
        // Uniform enough that the template's own height maps to the authored plant height.
        expect(scale.y * SPECIES[plantSpecies(object)].height, object.id).toBeCloseTo(object.scale.y, 3);
        seen.add(plantSpecies(object));
      });
      dressing.forEach((plant, j) => {
        meshes[0].getMatrixAt(vegetation.batch.instanceOf(authored.length + j), matrix);
        matrix.decompose(position, q, scale);
        expect(position.distanceTo(new THREE.Vector3(plant.x, plant.y, plant.z)), plant.id).toBeLessThan(1e-4);
        expect(scale.y * SPECIES[plant.species].height, plant.id).toBeCloseTo(plant.height, 3);
        seen.add(plant.species);
      });
      for (const species of ['coconut', 'mango', 'umbrella', 'ipe-yellow', 'ipe-pink', 'mangrove', 'thicket', 'vine', 'banana', 'fern', 'reeds'] as SpeciesId[])
        expect(seen.has(species), `${species} should have a placed specimen`).toBe(true);
    } finally { vegetation.dispose(); }
  });

  it('casts solid trunk shadows: the shadow pass alpha-tests leaf cards only', () => {
    // Trunk, limb and fruit UVs are bark coordinates; cut against the atlas alpha they would cast no shadow.
    const vegetation = buildVegetation({ objects: [], colliders: [] } as unknown as WorldSpec);
    try {
      const depth = vegetation.batch.mesh.customDepthMaterial as THREE.MeshDepthMaterial;
      expect(depth).toBeInstanceOf(THREE.MeshDepthMaterial);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      depth.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).not.toContain('#include <alphatest_fragment>');
      expect(shader.fragmentShader).toContain(`vAux.y > .5 && vAux.y < 1.5 && diffuseColor.a < alphaTest`);
      // The shadow sways with the leaves.
      expect(shader.vertexShader).toContain('uWind');
    } finally { vegetation.dispose(); }
  });

  it('dissolves leaves at the lens for the local camera only, never in the shadow other players see cast', () => {
    // Plants have no collision: a player walking through a bush, or dying in one, had the screen
    // filled with leaves. The colour pass dithers foliage out by distance to the lens; the shadow
    // pass, which draws the plant the same for every view, must not.
    const vegetation = buildVegetation({ objects: [], colliders: [] } as unknown as WorldSpec);
    try {
      const colour = vegetation.batch.mesh.material as THREE.MeshStandardMaterial;
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      colour.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toMatch(/float lens = length\( vViewPosition \);[\s\S]*nearFade[\s\S]*gl_FragCoord[\s\S]*discard/);
      const depth = vegetation.batch.mesh.customDepthMaterial as THREE.MeshDepthMaterial;
      const shadow = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      depth.onBeforeCompile(shadow, {} as THREE.WebGLRenderer);
      expect(shadow.fragmentShader).not.toContain('nearFade');
      expect(shadow.fragmentShader).not.toContain('gl_FragCoord');
    } finally { vegetation.dispose(); }
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

  it('never hides cover at range, so a crouched player is hidden or exposed alike for every viewer', () => {
    // Only wall drapes may drop out: they hang on solid walls and hide nobody.
    for (const species of SPECIES_IDS) if (SPECIES[species].kind !== 'vine') expect(HIDE_DISTANCE[SPECIES[species].kind], species).toBe(Infinity);
  });

  it('keeps the densest 360 degree view within the triangle budget', () => {
    const world = createWorld(), vegetation = buildVegetation(world), camera = new THREE.PerspectiveCamera();
    try {
      // Worst case: every plant around the camera drawn at once, at the LOD the camera distance selects.
      for (const [x, z] of [[-1, -10], [-26, 104], [-87, -53], [62, 63], [101, 52], [-40, -38]]) {
        camera.position.set(x, 4, z); camera.updateMatrixWorld();
        vegetation.setQuality('medium'); vegetation.update(0, camera);
        let tris = 0;
        for (let i = 0; i < vegetation.batch.size; i++) {
          if (vegetation.batch.isHidden(i)) continue;
          const plant = vegetation.batch.plantAt(i);
          tris += triangles(templates[plant.species][plant.variant][vegetation.batch.lodOf(i)]);
        }
        expect(tris, `around ${x},${z}`).toBeLessThan(420_000);
      }
    } finally { vegetation.dispose(); }
  });

  it('keeps island pickup and spawn placement deterministic through vegetation rebuilds', () => {
    const world = createWorld();
    const before = structuredClone({ loot: world.loot, spawns: world.spawns, chests: world.chests, colliders: world.colliders.length });
    const vegetation = buildVegetation(world); vegetation.dispose();
    expect({ loot: world.loot, spawns: world.spawns, chests: world.chests, colliders: world.colliders.length }).toEqual(before);
    const rebuilt = createWorld();
    expect({ loot: rebuilt.loot, spawns: rebuilt.spawns, chests: rebuilt.chests, colliders: rebuilt.colliders.length }).toEqual(before);
  });
});
