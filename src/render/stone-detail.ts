import type * as THREE from 'three';

/**
 * Painted natural stone in world metres, shared by the kit's cliff rocks and the terrain's rock
 * faces. Their paint (one atlas tile over metres of rock, the terrain's 2 m colour grid) is far
 * too coarse at 1 to 5 m, where it read as a smear. This adds, projected on the three world
 * planes: fracture joints with chipped lips, plates of slightly different tone, grain, mineral
 * flecks, lichen on the tops, rain streaks down the faces and faint strata. Every layer fades by
 * its own size against the pixel footprint, so it never aliases and the far look is unchanged.
 * No texture is downloaded.
 *
 * `stonePaint(p, n, footprint)` returns (albedo multiplier rgb, relief height in metres).
 */
export const STONE_GLSL = /* glsl */ `
  float stoneHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float stoneHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float stoneNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(stoneHash2(i), stoneHash2(i + vec2(1, 0)), f.x), mix(stoneHash2(i + vec2(0, 1)), stoneHash2(i + vec2(1, 1)), f.x), f.y);
  }
  float stoneFbm(vec2 p) { return stoneNoise(p) * .55 + stoneNoise(p * 2.07 + 3.1) * .3 + stoneNoise(p * 4.3 + 7.7) * .15; }
  // Distance to the nearest joint between irregular cells (F2 - F1), and the cell's own random value.
  vec2 stoneCells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = vec2(stoneHash2(i + g), stoneHash2(i + g + 17.3)) * .8 + .1;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = stoneHash2(i + g + 41.0); } else if (d < d2) d2 = d;
    }
    return vec2(d2 - d1, id);
  }
  // One projection plane. q in metres; wall is 1 on the vertical planes (their second axis is up).
  vec4 stonePlane(vec2 q, float wall, float footprint) {
    // Warped coordinates keep the joints from reading as a grid of cells.
    vec2 w = q + vec2(stoneFbm(q * .4), stoneFbm(q * .4 + 9.2)) * 1.1;
    // Sheet joints: plates longer than high on the faces, as weathered granite splits.
    vec2 big = stoneCells(w / mix(vec2(1.7), vec2(2.8, 1.05), wall));
    // Only some joints are open; the rest have healed into the rock.
    float open = smoothstep(.38, .62, stoneNoise(w * .33 + 4.1));
    float crackAA = footprint * 1.2;
    float crack = (1.0 - smoothstep(.02, .045 + crackAA, big.x)) * open;
    float lip = smoothstep(.04, .08 + crackAA, big.x) * (1.0 - smoothstep(.08 + crackAA, .17 + crackAA, big.x)) * open;
    float jointFade = 1.0 - smoothstep(.015, .05, footprint);
    float fineFade = 1.0 - smoothstep(.006, .02, footprint);
    float grainFade = 1.0 - smoothstep(.004, .014, footprint);
    float grain = (stoneNoise(q / .11) - .5) * .65 + (stoneNoise(q / .037 + 2.0) - .5) * .35;
    float fleck = smoothstep(.8, .87, stoneNoise(q / .06 + 11.0));
    float pit = smoothstep(.72, .8, stoneNoise(q / .19 + 23.0));
    float plate = big.y - .5;
    // Rain streaks: long vertical runs of darker stone down the faces.
    float streak = smoothstep(.5, .85, stoneFbm(vec2(q.x / .45, q.y / 6.0) + 3.0)) * wall;
    float tone = 1.0 + plate * .12 - streak * .12 + grain * .09 * grainFade;
    tone *= 1.0 - crack * .36 * jointFade - pit * .07 * fineFade;
    tone += lip * .06 * jointFade + fleck * .05 * fineFade;
    float relief = -crack * .02 * jointFade - pit * .004 * fineFade + grain * .003 * grainFade + plate * .01;
    return vec4(tone, crack * jointFade, 0.0, relief);
  }
  vec4 stonePaint(vec3 p, vec3 n, float footprint) {
    vec3 t = pow(abs(n), vec3(4.0)); t /= max(t.x + t.y + t.z, 1e-4);
    vec4 a = stonePlane(p.zy, 1.0, footprint), b = stonePlane(p.xz + 31.0, 0.0, footprint), c = stonePlane(p.xy + 57.0, 1.0, footprint);
    vec4 s = a * t.x + b * t.y + c * t.z;
    // Lichen and fine moss on the upward faces, in pale grey-green crusts.
    float lichen = smoothstep(.58, .74, stoneFbm(p.xz / .6 + 4.0)) * smoothstep(.45, .85, n.y) * (1.0 - smoothstep(.02, .06, footprint));
    // Faint strata: warm and cool bands a few decimetres high, bent by the rock.
    float band = sin(p.y * 2.6 + stoneFbm(p.xz * .3) * 4.0) * (1.0 - smoothstep(.03, .1, footprint));
    vec3 tint = vec3(s.x) * (1.0 + vec3(.025, .0, -.03) * band);
    tint = mix(tint, vec3(1.08, 1.12, 1.0), lichen * .45);
    return vec4(tint, s.w);
  }
`;

/** Metres covered by one pixel at this fragment. */
const FOOTPRINT = 'length(fwidth(stoneWorld))';

/**
 * The kit's cliff rocks carry vertex alpha 0 (tools/blender/kit/build.py): there the painted
 * atlas gives way to its own blurred mean up close, overlaid with the world-space stone.
 */
export function installKitStone(material: THREE.MeshStandardMaterial) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = `varying vec3 stoneWorld;\nvarying vec3 stoneNormal;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', `#include <project_vertex>
        stoneWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        stoneNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = `varying vec3 stoneWorld;\nvarying vec3 stoneNormal;\n${STONE_GLSL}\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float stoneAmount = 0.0, stoneRelief = 0.0;
        #if defined(USE_COLOR_ALPHA) && defined(USE_MAP)
          stoneAmount = 1.0 - smoothstep(.2, .8, vColor.a);
          if (stoneAmount > 0.0) {
            float footprint = ${FOOTPRINT};
            // The tile's painted blotches are its only detail and smear up close: fall back to their
            // mean there and let the stone carry the detail.
            float near = 1.0 - smoothstep(6.0, 22.0, length(vViewPosition));
            vec3 mean = texture2D(map, vMapUv, 7.0).rgb * diffuse * vColor.rgb;
            diffuseColor.rgb = mix(diffuseColor.rgb, mean, near * .6 * stoneAmount);
            vec4 stone = stonePaint(stoneWorld, normalize(stoneNormal), footprint);
            diffuseColor.rgb *= mix(vec3(1.0), stone.rgb, stoneAmount);
            stoneRelief = stone.w * stoneAmount;
          }
          diffuseColor.a = 1.0;
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (stoneAmount > 0.0) {
          vec3 sdx = dFdx(-vViewPosition), sdy = dFdy(-vViewPosition);
          vec3 sr1 = cross(sdy, normal), sr2 = cross(normal, sdx);
          float sdet = dot(sdx, sr1);
          if (abs(sdet) > 1e-10) normal = normalize(abs(sdet) * normal - sign(sdet) * (dFdx(stoneRelief) * sr1 + dFdy(stoneRelief) * sr2));
        }`);
  };
  material.customProgramCacheKey = () => `${key}:kit-stone-v1`;
  material.needsUpdate = true;
}
