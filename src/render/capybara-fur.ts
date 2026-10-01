import * as THREE from 'three';

// Close-range pelt for the world capybara: the fur faces of LOD0 repeated as offset shells in
// one skinned draw, each keeping only the strands of a noise field anchored to the bind pose, so
// the silhouette reads as fur instead of a smooth plastic edge. Only capybaras within a few
// metres of the camera draw it (spectating, the lobby, results, a fight at arm's length).
export const FUR_SHELLS = 8;
export const FUR_RANGE = 6.5;
const FUR_LENGTH = .015;
/** Shell layers drawn by distance: every layer up close, a spread-out subset further away (where a
 * capybara is a few hundred pixels tall and only the fuzzy outline still shows), so a crowd within
 * the fur range costs what one close capybara does. Each set keeps its layers in order, inner to
 * outer, as the outer strands must draw over the inner ones. */
export const FUR_LEVELS: readonly { until: number; layers: readonly number[] }[] = [
  { until: 3, layers: [0, 1, 2, 3, 4, 5, 6, 7] },
  { until: 4.5, layers: [1, 3, 5, 7] },
  { until: FUR_RANGE, layers: [3, 7] },
];

// The comb of the painted pelt (capybara_paint.fur_flow) in bind space: back from the nose over
// the head, down the neck, body and legs, from the elbow to the fingers, forward over the feet.
const FUR_COMB = `
  vec3 furCombAt(vec3 p) {
    vec3 comb = vec3(0.0, -1.0, 0.0);
    vec3 radial = normalize(p - vec3(0.0, 1.64, -.43));
    radial = normalize(radial + vec3(0.0, -.9 * smoothstep(.02, .16, p.z), 0.0));
    comb = mix(comb, radial, smoothstep(1.45, 1.53, p.y));
    float side = sign(p.x);
    vec3 elbow = vec3(side * .4080, 1.0324, -.1211), axis = vec3(side * -.1197, -.3790, -.9176);
    float arm = smoothstep(.20, .12, length(cross(p - elbow, axis))) * step(.2, side * p.x) * step(p.y, 1.32);
    comb = mix(comb, axis, arm);
    comb = mix(comb, vec3(0.0, -.35, -1.0), smoothstep(.15, .10, p.y));
    return normalize(comb);
  }`;

// Value noise in coordinates that follow the comb (the head radial from the nose, the body down,
// the forearms elbow to wrist), so strands and locks stay combed where the comb turns; the regions
// blend like the comb (the painted pelt uses the same frames). Fragment shader only.
const FUR_COMBED = `
  float furCombed(vec3 p, float across, float along, float seed) {
    vec3 d = p - vec3(0.0, 1.64, -.43);
    float side = sign(p.x);
    vec3 elbow = vec3(side * .4080, 1.0324, -.1211), axis = vec3(side * -.1197, -.3790, -.9176);
    vec3 q = p - elbow;
    float wh = smoothstep(1.45, 1.53, p.y) * (1.0 - .6 * smoothstep(.04, .18, p.z));
    float wa = smoothstep(.20, .12, length(cross(q, axis))) * step(.2, side * p.x) * step(p.y, 1.32);
    // Only the regions that reach this point are evaluated (most fragments lie in one), so the
    // combed noise costs one lookup per scale instead of three.
    float n = 0.0;
    if (wa < .999) {
      float nb = wh < .999 ? furNoise3(vec3(p.x / across, p.z / across, -p.y / along) + seed) : 0.0;
      float r = length(d);
      float nh = wh > .001 ? furNoise3(vec3(d.x / r * .35 / across, d.y / r * .35 / across, r / along) + seed + 7.0) : 0.0;
      n = mix(nb, nh, wh);
    }
    if (wa > .001) {
      vec3 e1 = normalize(cross(axis, vec3(0.0, 1.0, 0.0))), e2 = cross(axis, e1);
      n = mix(n, furNoise3(vec3(dot(q, e1) / across, dot(q, e2) / across, dot(q, axis) / along) + seed + 13.0), wa);
    }
    return n;
  }`;

const shellGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry[] | null>();
const shellMaterials = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

/** Shared shell geometry for a LOD0 source (null when it carries no `_fur` mask): every layer. */
export function furShellGeometry(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
  return furShellLevels(mesh)?.[0] ?? null;
}

/** The shared shell geometries of a LOD0 source, one per FUR_LEVELS entry: the same vertex streams
 * (uploaded once), each with the index of its own layers. */
export function furShellLevels(mesh: THREE.SkinnedMesh): THREE.BufferGeometry[] | null {
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
  const levels = FUR_LEVELS.map(({ layers }, level) => {
    const view = level ? new THREE.BufferGeometry() : geometry;
    if (level) for (const [name, attribute] of Object.entries(geometry.attributes)) view.setAttribute(name, attribute);
    const indices = new Uint32Array(fur.length * layers.length);
    layers.forEach((s, k) => fur.forEach((v, i) => { indices[k * fur.length + i] = s * used.length + remap.get(v)!; }));
    view.setIndex(new THREE.BufferAttribute(indices, 1));
    view.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.9);
    return view;
  });
  shellGeometries.set(source, levels);
  return levels;
}

/** Releases a source's shared shell geometries (renderer disposal). */
export function disposeFurShells(source: THREE.BufferGeometry): void {
  shellGeometries.get(source)?.forEach(geometry => geometry.dispose()); shellGeometries.delete(source);
}

/** The body material with shell displacement and strand cut-out (one per team material). */
export function furShellMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const cached = shellMaterials.get(base);
  if (cached) return cached;
  const material = base.clone();
  // The solid skin owns depth and the character ID silhouette. Writing the cut-out
  // shells into depth makes the undisplaced ID pass reject pixels under the hairs,
  // and its outline then traces every strand as a dark contour inside the face.
  material.depthWrite = false;
  // The clone keeps the body's team and style hooks; the shell code is added after them.
  const previous = material.onBeforeCompile, key = base.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uFurLength = { value: FUR_LENGTH };
    // Thins the pelt toward FUR_RANGE so the shells fade out instead of popping (per avatar).
    shader.uniforms.uFurFade = { get value() { return material.userData.furFade ?? 0; } };
    shader.vertexShader = `attribute float furShell;\nattribute float furLength;\nattribute vec3 furRest;\nuniform float uFurLength;\nvarying float vFurShell;\nvarying vec3 vFurRest;\n${FUR_COMB}\n${shader.vertexShader}`
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vFurShell = furShell; vFurRest = furRest;
        // Combed down the body and back over the head (bind space), carried by the skin.
        vec3 furComb = furCombAt(furRest);
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
      ${FUR_COMB}
      ${FUR_COMBED}
      ${shader.fragmentShader}`
      .replace('#include <common>', '#include <common>\nuniform float uFurFade;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Fine strands (about a millimetre across, a centimetre along the comb) gathered into locks
        // (about 1.3 x 4 cm): the low shells keep most strands, the high ones only the cores of the
        // locks, so the pelt ends in soft pointed clumps. The roots sit in shadow, the tips catch light.
        float furLock = furCombed(vFurRest, .013, .040, 0.0);
        float furStrand = furCombed(vFurRest, .0011, .009, 31.0);
        float furKeep = furStrand * .55 + furLock * .70 - .10;
        if (furKeep < mix(.32, .95, vFurShell) + uFurFade) discard;
        diffuseColor.rgb *= mix(.84, 1.12, vFurShell);`);
  };
  material.customProgramCacheKey = () => `${key}:capivara-fur-v5`;
  shellMaterials.set(base, material);
  material.addEventListener('dispose', () => shellMaterials.delete(base));
  return material;
}

/** A per-avatar shell mesh, skinned by the avatar's own LOD0 skeleton. */
export function attachFurShells(lod0: THREE.SkinnedMesh): THREE.SkinnedMesh | null {
  const levels = furShellLevels(lod0);
  if (!levels) return null;
  const geometry = levels[0];
  // Each avatar owns a copy (same shader program) so its distance fade is its own.
  const shared = furShellMaterial(lod0.material as THREE.MeshStandardMaterial);
  const material = shared.clone();
  material.onBeforeCompile = shared.onBeforeCompile; material.customProgramCacheKey = shared.customProgramCacheKey;
  const shells = new THREE.SkinnedMesh(geometry, material);
  shells.name = `${lod0.name}_fur`; shells.castShadow = false; shells.receiveShadow = true;
  shells.renderOrder = 1;
  shells.frustumCulled = true; shells.visible = false;
  shells.bind(lod0.skeleton, lod0.bindMatrix);
  shells.userData.furLevels = levels;
  lod0.add(shells);
  return shells;
}

/** Shows the shells within FUR_RANGE with fewer layers further away, thinning them over the last metres. */
export function updateFurShells(shells: THREE.SkinnedMesh, distance: number): void {
  shells.visible = distance < FUR_RANGE;
  const levels = shells.userData.furLevels as THREE.BufferGeometry[] | undefined;
  if (levels) {
    const level = FUR_LEVELS.findIndex(entry => distance < entry.until);
    shells.geometry = levels[level < 0 ? levels.length - 1 : level];
  }
  (shells.material as THREE.Material).userData.furFade = THREE.MathUtils.smoothstep(distance, FUR_RANGE - 2.5, FUR_RANGE) * .6;
}
