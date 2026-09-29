import * as THREE from 'three';
import { afterAll, expect, it } from 'vitest';
import { GROUND_COVER, GROUND_COVER_MAX_HEIGHT, GroundCover } from '../src/render/ground-cover';
import { createWorld } from '../src/shared/world';
import { ROADS } from '../src/shared/layout';
import { terrainHeight } from '../src/shared/terrain';
import { buildTemplates } from '../src/render/vegetation/templates';
import { vegetationDressing } from '../src/shared/vegetation-dressing';
import { SPECIES } from '../src/shared/vegetation-species';

const world = createWorld();
// One island's ground cover serves every read-only check below: building it is the slow part.
const shared = new GroundCover(world);
afterAll(() => shared.dispose());

it('grows the lawn from plain blades tinted by the ground, away from roads and solids', () => {
  const cover = shared;
  {
    const lawns = cover.group.children.filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh);
    expect(lawns.length).toBeGreaterThan(20);
    const tuft = lawns[0].geometry, paint = tuft.getAttribute('coverPaint'), position = tuft.getAttribute('position');
    // The lawn has no painted card: textured tufts read as dots on the ground at range.
    for (let i = 0; i < paint.count; i++) expect(paint.getX(i)).toBe(0);
    const box = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    expect(box.max.y, 'lawn tufts must stay short').toBeLessThan(.4);
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    const violations: string[] = [];
    let tinted = 0;
    for (const node of lawns) {
      const nearby = world.colliders.filter(c => c.max.x >= node.position.x - 1 && c.min.x <= node.position.x + 25 && c.max.z >= node.position.z - 1 && c.min.z <= node.position.z + 25);
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix);
        const x = matrix.elements[12] + node.position.x, y = matrix.elements[13] + .02, z = matrix.elements[14] + node.position.z;
        if (ROADS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) violations.push(`road ${x.toFixed(1)},${z.toFixed(1)}`);
        if (nearby.some(c => c.min.y < y + .4 && c.max.y > y && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z)) violations.push(`solid ${x.toFixed(1)},${z.toFixed(1)}`);
        node.getColorAt(i, color);
        // Instance tint is the ground's own green: more green than red or blue, never a flat white.
        if (color.g > color.b && color.g > color.r * .9 && color.r + color.g + color.b < 2.4) tinted++;
      }
    }
    expect(violations).toEqual([]);
    expect(tinted / lawns.reduce((n, m) => n + m.count, 0)).toBeGreaterThan(.98);
  }
});

it('keeps every accent shorter than a crouched capybara and flat patches on the ground', () => {
  const cover = shared;
  {
    let flat = 0;
    for (const node of cover.group.children) {
      if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) continue;
      const position = node.geometry.getAttribute('position'), root = node.geometry.getAttribute('coverRoot'), sway = node.geometry.getAttribute('coverSway');
      for (let i = 0; i < position.count; i++) {
        const ground = terrainHeight(position.getX(i) + node.position.x, position.getZ(i) + node.position.z);
        const rise = position.getY(i) - ground;
        expect(rise, 'ground cover must never hide a player').toBeLessThanOrEqual(GROUND_COVER_MAX_HEIGHT + 1e-6);
        expect(rise, 'ground cover sinks into the slope').toBeGreaterThan(-.05);
        if (sway.getX(i) === 0 && position.getY(i) - root.getY(i) < .06 && rise > 0) flat++;
      }
    }
    expect(flat, 'clover and fallen leaves must exist').toBeGreaterThan(100);
    expect(GROUND_COVER_MAX_HEIGHT).toBeLessThan(.7);
  }
});

it('keeps meadow drifts in the plant batch as low as ground cover, so open fields never hide anyone', () => {
  const box = new THREE.Box3();
  for (const lods of buildTemplates(new Set(['meadow'])).meadow) for (const g of lods) {
    box.setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
    expect(box.max.y).toBeLessThanOrEqual(GROUND_COVER_MAX_HEIGHT);
  }
  // Instances only ever shrink the template.
  for (const plant of vegetationDressing(world).filter(p => p.species === 'meadow')) expect(plant.height).toBeLessThanOrEqual(SPECIES.meadow.height);
});

it('stays out of the depth buffer so the ink pass never outlines grass, but draws after the solids', () => {
  const cover = shared;
  {
    for (const node of cover.group.children) {
      const mesh = node as THREE.Mesh;
      expect((mesh.material as THREE.Material).depthWrite).toBe(false);
      expect((mesh.material as THREE.Material).depthTest).toBe(true);
      expect(mesh.renderOrder).toBeGreaterThan(0);
      expect(mesh.castShadow).toBe(false);
    }
  }
});

it('culls distant cells, grows denser on High, switches off on Low and disposes everything', () => {
  // This one changes quality and disposes, so it builds its own cover.
  const cover = new GroundCover(world), camera = new THREE.PerspectiveCamera();
  try {
    camera.position.set(-35, 4, 61); cover.setQuality('medium'); cover.update(camera, 1, false);
    const visible = cover.group.children.filter(node => node.visible);
    expect(visible.length).toBeGreaterThan(0); expect(visible.length).toBeLessThan(48);
    const reach = GROUND_COVER.medium.distance + 24 * Math.SQRT2;
    for (const node of visible) expect(Math.hypot(node.position.x + 12 - camera.position.x, node.position.z + 12 - camera.position.z)).toBeLessThan(reach);
    const count = () => cover.group.children.reduce((n, node) => n + (node instanceof THREE.InstancedMesh ? node.count : 0), 0);
    const medium = count();
    cover.setQuality('high');
    expect(count()).toBeGreaterThan(medium);
    cover.setQuality('low'); cover.update(camera, 2, false);
    expect(cover.group.visible).toBe(false);
    expect(cover.group.children.every(node => !node.visible)).toBe(true);
  } finally { cover.dispose(); }
  expect(cover.group.children).toHaveLength(0);
});
