import * as THREE from 'three';
import { KIT_PIECES } from '../shared/kit-collision';
import type { KitPlacement } from './kit';

// Read window glass from the authored atlas, rather than inventing apertures.
// The small painted bounce stays on existing surfaces and adds no draw or light.
export function kitInteriorLight(material: THREE.MeshStandardMaterial, model: THREE.Object3D,
  placements: readonly KitPlacement[]) {
  const layouts = new Map<string, { floor: number; ceiling: number; half: THREE.Vector2; windows: THREE.Box3[][] }[]>();
  const point = new THREE.Vector3();
  for (const id of ['house_small', 'house_tall']) {
    const mesh = model.getObjectByName(`${id}_LOD0`) as THREE.Mesh | undefined;
    const definition = KIT_PIECES[id], base = definition.colliders[0];
    if (!mesh?.isMesh || base.type !== 'box') continue;
    const floors = definition.colliders.filter(c => c.type === 'box' && c.height < .3 &&
      c.width > base.width * .5 && c.depth > base.depth * .5 && (c === base || c.material === 'wood'));
    const roof = definition.colliders.filter(c => c.type === 'box' && c.width < .5 &&
      c.depth > base.depth * .7 && c.height > 2.5).reduce((height, c) => Math.max(height, c.y + c.height / 2), 0);
    const position = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
    const rooms = floors.map(floor => {
      const floorY = floor.y + floor.height / 2;
      const ceiling = Math.min(roof, ...floors.filter(next => next.y > floorY + .5).map(next => next.y - next.height / 2));
      const windows = [[new THREE.Box3(), new THREE.Box3()], [new THREE.Box3(), new THREE.Box3()]];
      for (let i = 0; i < position.count; i++) {
        // glTF UV rows use the same top-left order as the painted kit palette.
        if (Math.floor(uv.getX(i) * 4) + Math.floor(uv.getY(i) * 4) * 4 !== 10) continue;
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (point.y < floorY + .45 || point.y > ceiling || Math.abs(point.z) < base.depth * .4) continue;
        windows[point.z > 0 ? 1 : 0][point.x > 0 ? 1 : 0].expandByPoint(point);
      }
      return { floor: floorY, ceiling, half: new THREE.Vector2(base.width / 2 - .15, base.depth / 2 - .15), windows };
    });
    layouts.set(id, rooms);
  }
  const rooms = placements.flatMap(placement => {
    const layout = layouts.get(placement.piece);
    if (!layout) return [];
    const scale = placement.scale ?? 1;
    const inverse = new THREE.Matrix4().compose(new THREE.Vector3(placement.x, placement.y, placement.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw), new THREE.Vector3(scale, scale, scale)).invert();
    const sun = new THREE.Vector3(-70, 32, -30).transformDirection(inverse);
    return layout.map(room => ({ ...room, inverse, sun }));
  });
  const uniforms = {
    kitRoomAmount: { value: 0 }, kitRoomInverse: { value: new THREE.Matrix4() },
    kitRoomBounds: { value: new THREE.Vector4() }, kitRoomSun: { value: new THREE.Vector3() },
    kitWindowPlane: { value: 0 }, kitWindowRects: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  };
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer); Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform mat4 kitRoomInverse; varying vec3 vKitRoomPoint;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', `#include <project_vertex>
        vKitRoomPoint = (kitRoomInverse * modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `uniform float kitRoomAmount;
      uniform vec4 kitRoomBounds;
      uniform vec3 kitRoomSun;
      uniform float kitWindowPlane;
      uniform vec4 kitWindowRects[2];
      varying vec3 vKitRoomPoint;
      ${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float kitCeiling = 0.0;
        float kitWindow = 0.0;
        if (kitRoomAmount > 0.001) {
          vec3 p = vKitRoomPoint;
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          vec2 edge = kitRoomBounds.xy - abs(p.xz);
          float inside = smoothstep(0.0, 0.12, min(edge.x, edge.y));
          #ifdef USE_MAP
            vec2 paintTile = floor(clamp(vMapUv, vec2(0.0), vec2(.99999)) * 4.0);
            float paintIndex = paintTile.x + paintTile.y * 4.0;
            float floorPaint = float(abs(paintIndex - 5.0) < .1 || abs(paintIndex - 14.0) < .1);
            float floorBounce = inside * floorPaint * (1.0 - smoothstep(.015, .035, abs(p.y - kitRoomBounds.z)))
              * smoothstep(.65, .95, worldNormal.y) * kitRoomAmount;
            diffuseColor.rgb *= mix(vec3(1.0), vec3(1.08, 1.025, .91), floorBounce);
          #endif
          kitCeiling = inside * (1.0 - smoothstep(0.03, 0.12, abs(p.y - kitRoomBounds.w)))
            * (1.0 - smoothstep(-0.85, -0.45, worldNormal.y)) * kitRoomAmount;
          // A pale limewash response on the underside only. Painted grain and
          // baked contact values remain visible; exterior clay keeps its colour.
          diffuseColor.rgb = mix(diffuseColor.rgb,
            sqrt(max(diffuseColor.rgb, vec3(0.0))) * vec3(1.02, 1.0, .92), kitCeiling * .42);
          if (inside > 0.0 && abs(kitRoomSun.z) > .04 && abs(p.y - kitRoomBounds.z) < .04 && worldNormal.y > .65) {
            float ray = (kitWindowPlane - p.z) / kitRoomSun.z;
            vec2 aperture = p.xy + kitRoomSun.xy * ray;
            for (int i = 0; i < 2; i++) {
              vec4 rect = kitWindowRects[i];
              vec2 border = min(aperture - rect.xy, rect.zw - aperture);
              float pane = smoothstep(-.04, .16, min(border.x, border.y));
              vec2 mullion = abs(aperture - (rect.xy + rect.zw) * .5);
              pane *= .35 + .65 * smoothstep(.025, .075, min(mullion.x, mullion.y));
              kitWindow = max(kitWindow, pane);
            }
            kitWindow *= inside * step(0.0, ray) * kitRoomAmount;
          }
        }`).replace('#include <opaque_fragment>', `
          outgoingLight += diffuseColor.rgb * vec3(1.0, .78, .48) * kitWindow * .85;
          outgoingLight += diffuseColor.rgb * vec3(.25, .22, .18) * kitCeiling;
          #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${key}:kit-window-bounce-v1`;
  material.needsUpdate = true;
  return (camera: THREE.Camera) => {
    uniforms.kitRoomAmount.value = 0;
    for (const room of rooms) {
      point.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(room.inverse);
      const edge = Math.min(room.half.x - Math.abs(point.x), room.half.y - Math.abs(point.z));
      if (edge <= 0 || point.y < room.floor - .15 || point.y > room.ceiling) continue;
      uniforms.kitRoomAmount.value = THREE.MathUtils.smoothstep(edge, 0, .55);
      uniforms.kitRoomInverse.value.copy(room.inverse);
      uniforms.kitRoomBounds.value.set(room.half.x, room.half.y, room.floor, room.ceiling);
      uniforms.kitRoomSun.value.copy(room.sun);
      const windows = room.windows[room.sun.z > 0 ? 1 : 0];
      const hasWindows = windows.every(window => !window.isEmpty());
      uniforms.kitWindowPlane.value = hasWindows ? (windows[0].min.z + windows[0].max.z) / 2 : 0;
      windows.forEach((window, i) => {
        // A future asset without glass keeps the ceiling lift, with no fake beam.
        if (window.isEmpty()) uniforms.kitWindowRects.value[i].set(0, 0, 0, 0);
        else uniforms.kitWindowRects.value[i].set(window.min.x, window.min.y, window.max.x, window.max.y);
      });
      if (!hasWindows) uniforms.kitRoomSun.value.z = 0;
      break;
    }
  };
}
