import * as THREE from 'three';
import { createToonMaterial } from '../materials';

/** Wind amplitude in metres per unit of vertex sway weight. */
const WIND = 0.34;

export interface FoliageUniforms {
  uTime: { value: number };
  uWind: { value: number };
}

/** Replaces `project_vertex`: the instance matrix, then a world-frame wind offset weighted by
 * `aux.x`, so a gust moves every plant the same way. Shared by the colour and the shadow pass. */
const WIND_PROJECT = `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          mvPosition = batchingMatrix * mvPosition;
        #endif
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          vec3 origin = vec3( 0.0 );
          #ifdef USE_BATCHING
            origin = batchingMatrix[3].xyz;
          #endif
          #ifdef USE_INSTANCING
            origin = instanceMatrix[3].xyz;
          #endif
          // A slow swell travels across the island; each leaf flutters around it.
          float swell = uTime * 1.05 + origin.x * .07 + origin.z * .05;
          float flutter = uTime * 3.1 + position.x * 2.1 + position.y * 1.3 + position.z * 1.7 + origin.x * .9;
          float w = sin( swell ) * .55 + sin( swell * 2.3 + origin.z * .3 ) * .3 + sin( flutter ) * .15;
          float lift = -abs( w ) * .25;
          mvPosition.xyz += vec3( .8, lift, .6 ) * ( w * uWind * vAux.x );
          vPlantDist = distance( origin, cameraPosition );
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `;
const VERTEX_HEAD = `attribute vec3 aux;
      varying vec3 vAux;
      varying float vPlantDist;
      uniform float uTime;
      uniform float uWind;\n`;

/**
 * One material paints every plant. Vertex attribute `aux` carries
 * (wind sway weight, KIND, LOD id); vertex colour carries painted light and
 * occlusion. Works with BatchedMesh: the wind is applied in the world frame
 * after the per-instance matrix, so a gust moves every crown the same way.
 */
export function createFoliageMaterial(atlas?: THREE.Texture) {
  const uniforms: FoliageUniforms = { uTime: { value: 0 }, uWind: { value: WIND } };
  const material = createToonMaterial('foliage', { vertexColors: true, roughness: .92, side: THREE.DoubleSide,
    map: atlas ?? null, alphaTest: .42 });
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${VERTEX_HEAD}${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAux = aux;`)
      .replace('#include <project_vertex>', WIND_PROJECT);
    shader.fragmentShader = `varying vec3 vAux;
      varying float vPlantDist;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          float leafKind = step( .5, vAux.y ) * step( vAux.y, 1.5 );
          diffuseColor *= mix( vec4( 1.0 ), texture2D( map, vMapUv ), leafKind );
        #endif
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Painted bark: palm growth rings and soft vertical grain. Rings are in template metres.
        float barkKind = 1.0 - step( .5, vAux.y ) * step( vAux.y, 3.5 );
        if ( vAux.y > 4.5 ) {
          float ring = pow( .5 + .5 * cos( vMapUv.y * 19.5 ), 3.0 );
          diffuseColor.rgb *= 1.0 - .26 * ring;
        }
        if ( barkKind > .5 ) {
          float grain = fract( sin( floor( vMapUv.x * 22.0 ) * 12.9898 ) * 43758.5453 );
          float streak = .5 + .5 * sin( vMapUv.y * 3.1 + vMapUv.x * 17.0 );
          diffuseColor.rgb *= .92 + .1 * grain + .04 * streak;
        }
      `)
      .replace('#include <alphatest_fragment>', `
        #ifdef USE_ALPHATEST
          // Mip averaging thins alpha with distance. Lower the cut so crowns keep their body.
          float leafCard = step( .5, vAux.y ) * step( vAux.y, 1.5 );
          float thin = smoothstep( 22.0, 75.0, vPlantDist ) * leafCard;
          // A card seen edge-on smears its painting into a stretched strip: near the eye it fades out.
          vec3 faceNormal = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
          float facing = abs( dot( faceNormal, normalize( vViewPosition ) ) );
          float edgeOn = ( 1.0 - smoothstep( .1, .34, facing ) ) * leafCard * ( 1.0 - smoothstep( 18.0, 40.0, vPlantDist ) );
          if ( diffuseColor.a < mix( mix( alphaTest, .16, thin ), 1.01, edgeOn ) ) discard;
        #endif
      `)
      .replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          // Sun glowing through leaves, plus a soft warm rim on the sun side.
          vec3 leafSun = normalize( directionalLights[0].direction );
          float leafOnly = step( .5, vAux.y ) * step( vAux.y, 1.5 );
          float through = pow( max( dot( -normal, leafSun ), 0.0 ), 1.4 );
          float rim = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.8 );
          float sunEdge = max( dot( normalize( normal ), leafSun ) * .5 + .5, 0.0 );
          outgoingLight += leafOnly * diffuseColor.rgb * vec3( 1.0, .77, .32 ) * ( .30 * through + .10 * rim * sunEdge );
        #endif
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'ilha-dourada-foliage-v2';
  return { material, uniforms, depthMaterial: createFoliageDepthMaterial(uniforms) };
}

/** Shadow pass of the plant batch. Three's default depth material would cut every vertex against
 * the atlas alpha, so trunks, limbs and fruit (whose UVs are bark coordinates, not leaf tiles) cast
 * almost no shadow. Here only leaf cards are alpha-tested, and the wind matches the colour pass.
 * The renderer copies the foliage material's map, alpha test and side onto it each shadow pass. */
export function createFoliageDepthMaterial(uniforms: FoliageUniforms) {
  const material = new THREE.MeshDepthMaterial();
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${VERTEX_HEAD}${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAux = aux;`)
      .replace('#include <project_vertex>', WIND_PROJECT);
    shader.fragmentShader = `varying vec3 vAux;
      varying float vPlantDist;\n${shader.fragmentShader}`
      .replace('#include <alphatest_fragment>', `
        #ifdef USE_ALPHATEST
          // Only painted leaf cards are cut by the atlas alpha; bark and fruit are solid.
          if ( vAux.y > .5 && vAux.y < 1.5 && diffuseColor.a < alphaTest ) discard;
        #endif
      `);
  };
  material.customProgramCacheKey = () => 'ilha-dourada-foliage-depth-v1';
  return material;
}
