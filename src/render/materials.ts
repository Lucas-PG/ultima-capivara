import * as THREE from 'three';
import './toon';
import { installHaze } from './haze';

export const PAINT = {
  sun: '#FFDDA6', hemisphereSky: '#A9C4E2', hemisphereGround: '#C0A07C',
  fog: '#C3D7E3', interior: '#FFD7A8', rim: '#FFD28A',
  ink: '#3A2418', characterInk: '#2B1B12',
} as const;
// One sun for lighting, shadows, sky, water glints and the first-person key.
// (x, y, z) toward the sun; overridable in QA with ?sun=x,y,z.
const sunQuery = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sun');
export const SUN_VECTOR: readonly [number, number, number] = (sunQuery?.split(',').map(Number).filter(Number.isFinite).length === 3
  ? sunQuery.split(',').map(Number) : [-60, 55, -35]) as [number, number, number];
export const SUN_DIRECTION = new THREE.Vector3(...SUN_VECTOR).normalize();
installHaze(SUN_DIRECTION);
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
export function applyCharacterStyle(material: THREE.MeshStandardMaterial, atlasColumns: 4 | 16 = 16) {
  if (styled.has(material)) return material;
  styled.add(material);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  const cacheKey = previousKey();
  const surfaceAtlas = material.userData.capySurfaceAtlas === true;
  // First-person arms v3: own baked maps; a `_fur` vertex attribute marks the pelt.
  // The v6 world character shares that path: baked maps and a `_fur` vertex mask.
  const bakedFur = material.userData.capyArmsV3 === true || material.userData.capyCharacterV6 === true;
  material.userData.toonCharacter = true;
  if (bakedFur) {
    material.roughness = 1; material.metalness = 1;
  } else if (surfaceAtlas) {
    // The new character atlas authors cloth, eyes, claws and hardware separately.
    material.roughness = 1; material.metalness = 1;
    material.normalScale.set(.85, .85);
  } else { material.roughness = Math.max(.85, material.roughness); material.metalness = 0; }
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.characterRim = { value: rim };
    // Team-coloured rim on far world characters (their team cloth is only a few pixels at 60 m).
    shader.uniforms.characterTeam = { value: (material.userData.teamColor as THREE.Color | undefined) ?? rim };
    if (bakedFur) {
      shader.vertexShader = `attribute float _fur;\nvarying float vFurMask;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFurMask = _fur;');
      shader.fragmentShader = `varying float vFurMask;\n${shader.fragmentShader}`;
    }
    shader.fragmentShader = `uniform vec3 characterRim;\nuniform vec3 characterTeam;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
      float grazing = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
      float rimAmount = pow(grazing, 3.0);
      float furSurface = 0.0;
      #if ${bakedFur ? 1 : 0}
        furSurface = clamp(vFurMask * 2.0, 0.0, 1.0);
      #elif defined(USE_MAP)
        vec2 atlasCell = floor(clamp(vMapUv, vec2(0.0), vec2(.99999)) * ${surfaceAtlas ? 'vec2(4.0, 2.0)' : atlasColumns.toFixed(1)});
        float paletteIndex = atlasCell.x ${atlasColumns === 4 ? '+ atlasCell.y * 4.0' : ''};
        // Mouth, eyes, nails, brass and cloth keep their authored response.
        furSurface = ${surfaceAtlas ? 'float(atlasCell.x < .5 && atlasCell.y > .5)' : 'float(paletteIndex < 2.5 || abs(paletteIndex - 4.0) < .1 || abs(paletteIndex - 14.0) < .1)'};
      #endif
      float sunEdge = .5;
      #if NUM_DIR_LIGHTS > 0
        sunEdge = smoothstep(-.3, .65, dot(normalize(normal), normalize(directionalLights[0].direction)));
      #endif
      // Atlas/vertex albedo keeps dark eye, nose and mouth cavities dark.
      float rimSurface = smoothstep(0.06, 0.18, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      // Far characters read brighter with a wider rim (as Valorant does), so a capybara in shade
      // at 40-60 m still separates from the street behind it. Nothing changes up close.
      float farRead = ${bakedFur ? 'smoothstep(18.0, 60.0, length(vViewPosition))' : '0.0'};
      outgoingLight *= 1.0 + .2 * farRead;
      outgoingLight += characterRim * rimAmount * rimSurface * (.15 + .2 * furSurface) * (.12 + .88 * sunEdge) * (1.0 + 1.5 * farRead);
      // Beyond 18 m the rim also carries the team colour, lit or in shade, so a distant
      // capybara's side reads before its scarf does.
      outgoingLight += characterTeam * pow(grazing, 1.6) * .55 * farRead;
      // Broad fibre scattering complements the fine relief in the normal map.
      // It follows the fur tile and sun, without adding gloss to the mouth.
      vec3 furSheen = mix(vec3(.045, .065, .085), characterRim * .16, sunEdge);
      outgoingLight += furSheen * sqrt(max(diffuseColor.rgb, vec3(0.0))) * pow(grazing, 2.5) * furSurface * rimSurface;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:ilha-dourada-character-v6:${atlasColumns}:${surfaceAtlas}:${bakedFur}`;
  material.needsUpdate = true;
  return material;
}
