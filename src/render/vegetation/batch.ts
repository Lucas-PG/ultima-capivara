import * as THREE from 'three';
import type { Settings } from '../../shared/types';
import { SPECIES, type SpeciesId } from '../../shared/vegetation-species';

/** Distances (metres) where each template LOD hands over to the next, per graphics preset. */
export const LOD_DISTANCES = {
  low: [14, 40], medium: [28, 70], high: [36, 90],
} as const satisfies Record<Settings['graphics'], readonly [number, number]>;
/** Small plants vanish sooner than crowns; nothing tall ever disappears. */
export const HIDE_DISTANCE = { palm: Infinity, tree: Infinity, banana: 130, shrub: 75 } as const;

export interface PlantInstance {
  species: SpeciesId;
  variant: number;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  position: THREE.Vector3;
}

export type TemplateSet = Record<string, THREE.BufferGeometry[][]>;   // species -> variant -> lod

const HYSTERESIS = 2.5;
/** Wind moves vertices past the template's bounds; pad the cull spheres. */
const WIND_PAD = 1.25;

/** One BatchedMesh draws every plant. Templates are geometries inside the batch, so
 * species and variants cost memory, never draw calls; each instance picks its LOD
 * template by camera distance. */
export class PlantBatch {
  readonly mesh: THREE.BatchedMesh;
  private readonly geometryIds = new Map<string, number[][]>();
  private readonly ids: number[] = [];
  private readonly lods: number[] = [];
  private readonly hidden: boolean[] = [];
  private readonly reach: number[] = [];
  private distances: readonly [number, number] = LOD_DISTANCES.medium;
  private lastX = Infinity;
  private lastZ = Infinity;
  private lastQuality = '';
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(material: THREE.Material, templates: TemplateSet, private readonly plants: PlantInstance[]) {
    let vertices = 0, indices = 0;
    for (const variants of Object.values(templates)) for (const lods of variants) for (const g of lods) {
      vertices += g.getAttribute('position').count; indices += g.index!.count;
    }
    this.mesh = new THREE.BatchedMesh(Math.max(1, plants.length), Math.max(1, vertices), Math.max(1, indices), material);
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.sortObjects = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'vegetation';
    for (const [species, variants] of Object.entries(templates)) {
      this.geometryIds.set(species, variants.map(lods => lods.map(g => {
        g.computeBoundingSphere();
        g.boundingSphere!.radius = g.boundingSphere!.radius * WIND_PAD;
        this.geometries.push(g);
        return this.mesh.addGeometry(g);
      })));
    }
    plants.forEach((plant, i) => {
      const id = this.mesh.addInstance(this.geometryIds.get(plant.species)![plant.variant][2]);
      this.mesh.setMatrixAt(id, plant.matrix);
      this.mesh.setColorAt(id, plant.color);
      this.ids.push(id); this.lods.push(2); this.hidden.push(false);
      this.reach.push(HIDE_DISTANCE[SPECIES[plant.species].kind]);
      void i;
    });
  }

  get size() { return this.plants.length; }
  plantAt(index: number) { return this.plants[index]; }
  /** Template LOD (0 near .. 2 far) currently used by a plant, and whether it is hidden. */
  lodOf(index: number) { return this.lods[index]; }
  isHidden(index: number) { return this.hidden[index]; }
  instanceOf(index: number) { return this.ids[index]; }

  setQuality(quality: Settings['graphics']) {
    this.distances = LOD_DISTANCES[quality]; this.lastQuality = quality; this.lastX = Infinity;
  }

  /** Re-pick LODs when the camera has moved enough to matter. */
  update(camera: THREE.Camera) {
    const p = camera.position;
    if (Math.abs(p.x - this.lastX) + Math.abs(p.z - this.lastZ) < .75 && this.lastQuality) return;
    this.lastX = p.x; this.lastZ = p.z;
    const [near, far] = this.distances;
    for (let i = 0; i < this.plants.length; i++) {
      const plant = this.plants[i], dx = plant.position.x - p.x, dz = plant.position.z - p.z, dy = plant.position.y - p.y;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy * .25);
      const hide = d > this.reach[i];
      if (hide !== this.hidden[i]) { this.mesh.setVisibleAt(this.ids[i], !hide); this.hidden[i] = hide; }
      if (hide) continue;
      const current = this.lods[i];
      let lod = current;
      // Hysteresis keeps a plant from flickering between two templates at the threshold.
      if (current === 0) { if (d > near + HYSTERESIS) lod = d > far + HYSTERESIS ? 2 : 1; }
      else if (current === 1) { if (d < near - HYSTERESIS) lod = 0; else if (d > far + HYSTERESIS) lod = 2; }
      else if (d < far - HYSTERESIS) lod = d < near - HYSTERESIS ? 0 : 1;
      if (lod !== current) {
        this.mesh.setGeometryIdAt(this.ids[i], this.geometryIds.get(plant.species)![plant.variant][lod]);
        this.lods[i] = lod;
      }
    }
  }

  dispose() { this.mesh.dispose(); for (const g of this.geometries) g.dispose(); }
}
