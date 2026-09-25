import * as THREE from 'three';
import './toon';

export const PAINT = {
  sun: '#FFD9A8', hemisphereSky: '#B4C2EE', hemisphereGround: '#C9A66B',
  fog: '#F2DCB6', interior: '#FFD7A8', rim: '#FFE2B0',
  ink: '#3A2418', characterInk: '#2B1B12',
} as const;
export type ToonMaterialKind = 'terrain' | 'plaster' | 'stone' | 'wood' | 'foliage' | 'fabric' | 'painted-metal' | 'character' | 'weapon';

// The shared physical-light chunk supplies Direction A's soft three-band ramp.
// Keep the standard material API for vertex colours and painted glTF atlases.
export function createToonMaterial(kind: ToonMaterialKind, parameters: THREE.MeshStandardMaterialParameters = {}) {
  const material = new THREE.MeshStandardMaterial({ ...parameters,
    roughness: Math.max(.85, parameters.roughness ?? 1), metalness: 0 });
  material.name = `paint:${kind}`;
  if (kind === 'character') applyCharacterStyle(material);
  return material;
}

const styled = new WeakSet<THREE.MeshStandardMaterial>();
const rim = new THREE.Color(PAINT.rim);
// Call AFTER clone(): Three copies userData but does not copy shader callbacks.
// Preserve the incoming hook/cache key as well as maps, emissive and vertex colour.
export function applyCharacterStyle(material: THREE.MeshStandardMaterial) {
  if (styled.has(material)) return material;
  styled.add(material);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  const cacheKey = previousKey();
  material.userData.toonCharacter = true;
  material.roughness = Math.max(.85, material.roughness); material.metalness = 0;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.characterRim = { value: rim };
    shader.fragmentShader = `uniform vec3 characterRim;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
      float rimAmount = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      outgoingLight += characterRim * (0.35 * rimAmount);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:ilha-dourada-character-v1`;
  material.needsUpdate = true;
  return material;
}
