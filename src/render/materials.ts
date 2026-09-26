import * as THREE from 'three';
import './toon';

export const PAINT = {
  sun: '#FFC47E', hemisphereSky: '#8FAECF', hemisphereGround: '#BD9069',
  fog: '#DBC2AE', interior: '#FFD7A8', rim: '#FFD28A',
  ink: '#3A2418', characterInk: '#2B1B12',
} as const;
export type ToonMaterialKind = 'terrain' | 'plaster' | 'stone' | 'wood' | 'foliage' | 'fabric' | 'painted-metal' | 'character' | 'weapon';

// The shared physical-light chunk supplies continuous wrapped sunlight.
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
      // Atlas/vertex albedo keeps dark eye, nose and mouth cavities dark.
      // Evaluate before lighting so fur retains its rim on the shaded side.
      float rimSurface = smoothstep(0.06, 0.18, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      outgoingLight += characterRim * (0.5 * rimAmount * rimSurface);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:ilha-dourada-character-v2`;
  material.needsUpdate = true;
  return material;
}
