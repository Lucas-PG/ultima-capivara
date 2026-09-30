import * as THREE from 'three';
import { SPECIES, type SpeciesId } from '../../shared/vegetation-species';
import { plantTrunkTop } from '../../shared/vegetation-trunks';
import { KIND } from './mesh-builder';
import { buildTemplates } from './templates';

/** Crowns that can hang over a walker: trees, palms and bananas. Shrubs and ground plants stay below head height. */
export const CROWN_SPECIES = (Object.keys(SPECIES) as SpeciesId[]).filter(species => ['palm', 'tree', 'banana'].includes(SPECIES[species].kind));
/** Radial band width of a profile, template metres. */
export const CROWN_BAND = .5;

/** The foliage volume of a template: for each ring of `CROWN_BAND` around the crown axis (the
 * trunk top, or the root of a trunkless plant), the lowest and highest leaf or fruit vertex of any
 * LOD, in template metres above the ground, as [low, high] pairs. Rounded outward to 5 cm, so the
 * profile never flatters the crown. */
export function crownProfileOf(species: SpeciesId): [number, number][][] {
  const variants = buildTemplates(new Set([species]))[species] ?? [];
  const p = new THREE.Vector3();
  return variants.map((lods, variant) => {
    const top = plantTrunkTop(species, variant), rings: number[] = [], highs: number[] = [];
    for (const geometry of lods) {
      const position = geometry.getAttribute('position'), aux = geometry.getAttribute('aux');
      for (let i = 0; i < position.count; i++) {
        const kind = aux.getY(i);
        if (kind !== KIND.leaf && kind !== KIND.solid) continue;
        p.fromBufferAttribute(position, i);
        const ring = Math.floor(Math.hypot(p.x - top.x, p.z - top.z) / CROWN_BAND);
        while (rings.length <= ring) { rings.push(Infinity); highs.push(-Infinity); }
        rings[ring] = Math.min(rings[ring], p.y); highs[ring] = Math.max(highs[ring], p.y);
      }
      geometry.dispose();
    }
    // An empty inner ring sits under the crown: the leaves just outside it bound it.
    for (let i = rings.length - 2; i >= 0; i--) if (!Number.isFinite(rings[i])) { rings[i] = rings[i + 1]; highs[i] = highs[i + 1]; }
    return rings.map((low, i): [number, number] => [Math.floor(low * 20) / 20, Math.ceil(highs[i] * 20) / 20]);
  });
}
