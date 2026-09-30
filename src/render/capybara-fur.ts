import * as THREE from 'three';

// Close-range pelt for the world capybara: the fur faces of LOD0 repeated as offset shells in
// one skinned draw, each keeping only the strands of a noise field anchored to the bind pose, so
// the silhouette reads as fur instead of a smooth plastic edge. Only capybaras within a few
// metres of the camera draw it (spectating, the lobby, results, a fight at arm's length).
export const FUR_SHELLS = 6;
export const FUR_RANGE = 6.5;
const FUR_LENGTH = .0075;

const shellGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | null>();
const shellMaterials = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

/** Shared shell geometry for a LOD0 source (null when it carries no `_fur` mask). */
export function furShellGeometry(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
  const source = mesh.geometry;
  if (shellGeometries.has(source)) return shellGeometries.get(source)!;
  const index = source.index, furLength = source.getAttribute('_fur');
  if (!index || !furLength) { shellGeometries.set(source, null); return null; }
  const grows = (v: number) => furLength.getX(v) > .02;
  const fur: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (grows(a) && grows(b) && grows(c)) fur.push(a, b, c);
  }
  const used = [...new Set(fur)], remap = new Map(used.map((v, i) => [v, i]));
  const geometry = new THREE.BufferGeometry();
  // Decoded floats (the source streams are quantised); only what the shells shade with.
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'tangent', 'color', 'teamMask', '_fur']) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const size = attribute.itemSize, array = new Float32Array(used.length * FUR_SHELLS * size);
    used.forEach((v, i) => { for (let k = 0; k < size; k++) array[i * size + k] = attribute.getComponent(v, k); });
    for (let s = 1; s < FUR_SHELLS; s++) array.copyWithin(s * used.length * size, 0, used.length * size);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  // Bind-pose position in metres: the strand field stays glued to the skin as it deforms.
  const rest = new Float32Array(used.length * FUR_SHELLS * 3), p = new THREE.Vector3();
  const shell = new Float32Array(used.length * FUR_SHELLS), lengths = new Float32Array(used.length * FUR_SHELLS);
  used.forEach((v, i) => {
    mesh.getVertexPosition(v, p);
    for (let s = 0; s < FUR_SHELLS; s++) {
      const j = s * used.length + i;
      p.toArray(rest, j * 3); shell[j] = (s + 1) / FUR_SHELLS; lengths[j] = furLength.getX(v);
    }
  });
  geometry.setAttribute('furRest', new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute('furShell', new THREE.BufferAttribute(shell, 1));
  geometry.setAttribute('furLength', new THREE.BufferAttribute(lengths, 1));
  const indices = new Uint32Array(fur.length * FUR_SHELLS);
  for (let s = 0; s < FUR_SHELLS; s++) fur.forEach((v, i) => { indices[s * fur.length + i] = s * used.length + remap.get(v)!; });
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.9);
  shellGeometries.set(source, geometry);
  return geometry;
}

/** Releases a source's shared shell geometry (renderer disposal). */
export function disposeFurShells(source: THREE.BufferGeometry): void {
  shellGeometries.get(source)?.dispose(); shellGeometries.delete(source);
}

/** The body material with shell displacement and strand cut-out (one per team material). */
export function furShellMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const cached = shellMaterials.get(base);
  if (cached) return cached;
  const material = base.clone();
  // The clone keeps the body's team and style hooks; the shell code is added after them.
  const previous = material.onBeforeCompile, key = base.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uFurLength = { value: FUR_LENGTH };
    // Thins the pelt toward FUR_RANGE so the shells fade out instead of popping (per avatar).
    shader.uniforms.uFurFade = { get value() { return material.userData.furFade ?? 0; } };
    shader.vertexShader = `attribute float furShell;\nattribute float furLength;\nattribute vec3 furRest;\nuniform float uFurLength;\nvarying float vFurShell;\nvarying vec3 vFurRest;\n${shader.vertexShader}`
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vFurShell = furShell; vFurRest = furRest;
        // Combed down the body and back over the head (bind space), carried by the skin.
        vec3 furComb = normalize(mix(vec3(0.0, -1.0, 0.25), vec3(0.0, 0.3, 1.0), smoothstep(1.44, 1.52, furRest.y)));
        #ifdef USE_SKINNING
          furComb = normalize((skinMatrix * vec4(furComb, 0.0)).xyz);
        #endif
        vec3 furUp = normalize(objectNormal);
        float furReach = uFurLength * furLength;
        transformed += furUp * furShell * furReach + (furComb - furUp * dot(furComb, furUp)) * furShell * furShell * furReach * .8;`);
    shader.fragmentShader = `varying float vFurShell;\nvarying vec3 vFurRest;
      float furHash3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float furNoise3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(furHash3(i), furHash3(i + vec3(1, 0, 0)), f.x), mix(furHash3(i + vec3(0, 1, 0)), furHash3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(furHash3(i + vec3(0, 0, 1)), furHash3(i + vec3(1, 0, 1)), f.x), mix(furHash3(i + vec3(0, 1, 1)), furHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
      ${shader.fragmentShader}`
      .replace('#include <common>', '#include <common>\nuniform float uFurFade;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Strands: fine across the comb, long along it (the same comb as the vertex shader).
        vec3 furDir = normalize(mix(vec3(0.0, -1.0, 0.25), vec3(0.0, 0.3, 1.0), smoothstep(1.44, 1.52, vFurRest.y)));
        vec3 furP = vFurRest * 900.0 - furDir * dot(vFurRest, furDir) * 780.0;
        float furStrand = furNoise3(furP) * .72 + furNoise3(vFurRest * 140.0) * .36;
        if (furStrand < mix(.50, .96, vFurShell) + uFurFade) discard;
        diffuseColor.rgb *= mix(.93, 1.05, vFurShell);`);
  };
  material.customProgramCacheKey = () => `${key}:capivara-fur-v1`;
  shellMaterials.set(base, material);
  material.addEventListener('dispose', () => shellMaterials.delete(base));
  return material;
}

/** A per-avatar shell mesh, skinned by the avatar's own LOD0 skeleton. */
export function attachFurShells(lod0: THREE.SkinnedMesh): THREE.SkinnedMesh | null {
  const geometry = furShellGeometry(lod0);
  if (!geometry) return null;
  // Each avatar owns a copy (same shader program) so its distance fade is its own.
  const shared = furShellMaterial(lod0.material as THREE.MeshStandardMaterial);
  const material = shared.clone();
  material.onBeforeCompile = shared.onBeforeCompile; material.customProgramCacheKey = shared.customProgramCacheKey;
  const shells = new THREE.SkinnedMesh(geometry, material);
  shells.name = `${lod0.name}_fur`; shells.castShadow = false; shells.receiveShadow = true;
  shells.frustumCulled = true; shells.visible = false;
  shells.bind(lod0.skeleton, lod0.bindMatrix);
  lod0.add(shells);
  return shells;
}

/** Shows the shells within FUR_RANGE, thinning them over the last metres. */
export function updateFurShells(shells: THREE.SkinnedMesh, distance: number): void {
  shells.visible = distance < FUR_RANGE;
  (shells.material as THREE.Material).userData.furFade = THREE.MathUtils.smoothstep(distance, FUR_RANGE - 2.5, FUR_RANGE) * .6;
}
