import * as THREE from 'three';

// Aerial perspective shared by every fogged material and the sky dome. The
// scene fog keeps its near/far distances and base colour (the cool, sunlit
// haze); toward the sun the same haze warms to a golden glow, so distant
// hills dissolve into the matching part of the painted horizon.
export const HAZE_WARM = '#F6D7A8';
const warm = new THREE.Color(HAZE_WARM);

/** GLSL: haze colour seen along a normalized world direction. */
export function hazeGlsl(sun: THREE.Vector3) {
  const flat = new THREE.Vector2(sun.x, sun.z).normalize();
  return `vec3 paintedHaze(vec3 base, vec3 direction){
    vec2 across=normalize(direction.xz+vec2(1e-5));
    float sunward=max(dot(across,vec2(${flat.x.toFixed(5)},${flat.y.toFixed(5)})),0.0);
    float glow=pow(max(dot(direction,vec3(${sun.x.toFixed(5)},${sun.y.toFixed(5)},${sun.z.toFixed(5)})),0.0),5.0)*.55+sunward*sunward*.3;
    return mix(base,vec3(${warm.r.toFixed(4)},${warm.g.toFixed(4)},${warm.b.toFixed(4)}),clamp(glow,0.0,1.0));
  }`;
}

/** Density along the view ray: clear up to the fog near distance, where players
 * duel, and never quite opaque, so the far islands keep a painted silhouette. */
export const HAZE_CURVE = 'float paintedHazeAmount(float d,float near,float far){float t=clamp((d-near)/max(far-near,1.0),0.0,1.0);return .92*(1.0-exp(-4.0*t*t))/(1.0-exp(-4.0));}';

let installed = false;
export function installHaze(sun: THREE.Vector3) {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as Record<string, string>;
  chunks.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying vec3 vFogView;\n#endif';
  chunks.fog_vertex = '#ifdef USE_FOG\n\tvFogView = mvPosition.xyz;\n#endif';
  chunks.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying vec3 vFogView;
	uniform float fogNear;
	uniform float fogFar;
	${hazeGlsl(sun)}
	${HAZE_CURVE}
#endif`;
  // Euclidean distance, so the haze does not thin toward the screen edges.
  // (v * viewMatrix) rotates a view-space vector back into world space.
  chunks.fog_fragment = `#ifdef USE_FOG
	float fogDistance = length( vFogView );
	vec3 fogDirection = normalize( ( vec4( vFogView, 0.0 ) * viewMatrix ).xyz );
	float fogFactor = paintedHazeAmount( fogDistance, fogNear, fogFar );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, paintedHaze( fogColor, fogDirection ), fogFactor );
#endif`;
}
