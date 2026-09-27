import * as THREE from 'three';
import { KIT_PIECES } from '../shared/kit-collision';
import type { KitPlacement } from './kit';

const ROOM_PALETTES = [
  ['#F3DBBA', '#C57552', '#548F86'], // Sunset cloth, terracotta border, teal motif.
  ['#ECE9CC', '#509897', '#C6924E'], // Coastal linen, turquoise border, gold motif.
  ['#E8CE91', '#847E54', '#B66545'], // Ochre cloth, olive border, clay motif.
].map(palette => palette.map(color => new THREE.Color(color)));

// Called on an owned placement clone before its transform/cell merge. Only
// existing colour/UV attributes change; positions, normals and indices do not.
export function paintKitPlacement(geometry: THREE.BufferGeometry, placement: KitPlacement) {
  const palette = placement.paintVariant === undefined ? undefined : ROOM_PALETTES[placement.paintVariant];
  const decor = palette && (placement.piece === 'rug' || placement.piece === 'wall_picture');
  const floors = placement.interiorFloor && /^house_(small|medium|tall)$/.test(placement.piece)
    ? KIT_PIECES[placement.piece].traversal?.floors : undefined;
  if (!decor && !floors) return;
  const uv = geometry.getAttribute('uv'), color = geometry.getAttribute('color');
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const tileAt = (i: number) => Math.floor(uv.getX(i) * 4) + Math.floor(uv.getY(i) * 4) * 4;
  const retile = (i: number, tile: number) => uv.setXY(i,
    (tile % 4 + (uv.getX(i) * 4) % 1) / 4, (Math.floor(tile / 4) + (uv.getY(i) * 4) % 1) / 4);
  for (let i = 0; i < position.count; i++) {
    const tile = tileAt(i), r = color.getX(i), g = color.getY(i), b = color.getZ(i);
    if (decor && palette) {
      let part = -1, authoredTint = 1;
      if (placement.piece === 'rug' && tile === 11) {
        part = r > g * 1.4 ? 2 : g > r * 1.4 ? 1 : 0;
        authoredTint = part === 2 ? .83 : part === 1 ? .57 : 1;
      } else if (placement.piece === 'wall_picture') {
        part = tile === 0 ? 0 : tile === 2 ? 1 : tile === 3 ? 2 : -1;
        // Reuse the pale painted tile under the selected picture pigment.
        if (part >= 0) retile(i, 0);
      }
      if (part >= 0) {
        const tint = palette[part], ao = Math.min(1, Math.max(r, g, b) / authoredTint);
        color.setXYZ(i, tint.r * ao, tint.g * ao, tint.b * ao);
      }
    }
    if (floors && normal.getY(i) > .85 && (tile === 5 || tile === 14) && floors.some(floor =>
      Math.abs(position.getY(i) - floor.y) < .025 && position.getX(i) >= floor.bounds[0] - .01 &&
      position.getX(i) <= floor.bounds[2] + .01 && position.getZ(i) >= floor.bounds[1] - .01 && position.getZ(i) <= floor.bounds[3] + .01)) {
      retile(i, placement.interiorFloor === 'wood' ? 5 : 14);
      if (placement.interiorFloor === 'warm-tile') color.setXYZ(i, r * 1.04, g * .93, b * .78);
    }
  }
}

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

// From inside, houses had solid walls where the facade shows glazed windows.
// Each exterior pane gets an inner counterpart on the room side of its wall: a
// frame with the sky and horizon seen along the view ray, so rooms read as
// connected to the street. One merged mesh, two triangles per window.
export function kitInteriorWindows(model: THREE.Object3D, placements: readonly KitPlacement[]): THREE.Mesh | null {
  const local = new Map<string, { center: THREE.Vector3; size: THREE.Vector2; axis: 'x' | 'z'; sign: number }[]>();
  const point = new THREE.Vector3();
  for (const id of ['house_small', 'house_medium', 'house_tall']) {
    const mesh = model.getObjectByName(`${id}_LOD0`) as THREE.Mesh | undefined;
    const base = KIT_PIECES[id]?.colliders[0];
    if (!mesh?.isMesh || base?.type !== 'box') continue;
    const position = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
    const clusters = new Map<string, { box: THREE.Box3; axis: 'x' | 'z'; sign: number }>();
    for (let i = 0; i < position.count; i++) {
      if (Math.floor(uv.getX(i) * 4) + Math.floor(uv.getY(i) * 4) * 4 !== 10) continue;
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const zWall = Math.abs(point.z) / base.depth > Math.abs(point.x) / base.width, axis = zWall ? 'z' : 'x';
      const sign = Math.sign(zWall ? point.z : point.x), across = zWall ? point.x : point.z;
      // Painted tile 10 is the pair of shutter boards; the window is the gap between a pair.
      const key = `${axis}${sign}:${Math.round(across / 2.5)}:${point.y > 3 ? 1 : 0}`;
      if (!clusters.has(key)) clusters.set(key, { box: new THREE.Box3(), axis, sign });
      clusters.get(key)!.box.expandByPoint(point);
    }
    const panes = [];
    for (const { box, axis, sign } of clusters.values()) {
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const width = (axis === 'z' ? size.x : size.z) - .12;
      if (width < .3 || size.y < .3) continue;
      // The room side of the wall comes from its collider: the solid box this window sits in.
      let inner = 0;
      const glass = axis === 'z' ? center.z * sign : center.x * sign, along = axis === 'z' ? center.x : center.z;
      for (const shape of KIT_PIECES[id].colliders) {
        if (shape.type !== 'box' || shape.height < 1) continue;
        const face = (axis === 'z' ? shape.z : shape.x) * sign, thick = axis === 'z' ? shape.depth : shape.width;
        const span = axis === 'z' ? [shape.x - shape.width / 2, shape.x + shape.width / 2] : [shape.z - shape.depth / 2, shape.z + shape.depth / 2];
        if (thick > .6 || Math.abs(face - glass) > .6 || along < span[0] - width || along > span[1] + width) continue;
        inner = Math.max(inner, face - thick / 2);
      }
      if (inner <= 0) continue;
      const plane = sign * (inner - .012);
      panes.push({ center: axis === 'z' ? new THREE.Vector3(center.x, center.y, plane) : new THREE.Vector3(plane, center.y, center.z),
        size: new THREE.Vector2(width, size.y - .1), axis, sign });
    }
    local.set(id, panes);
  }
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const corner = new THREE.Vector3();
  for (const placement of placements) {
    const panes = local.get(placement.piece);
    if (!panes?.length) continue;
    const scale = placement.scale ?? 1;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(placement.x, placement.y, placement.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw), new THREE.Vector3(scale, scale, scale));
    for (const pane of panes) {
      const base = positions.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const a = (u - .5) * pane.size.x, b = (v - .5) * pane.size.y;
        // Winding faces the room: the pane looks back along -sign.
        const across = pane.axis === 'z' ? -pane.sign * a : pane.sign * a;
        corner.copy(pane.center).add(pane.axis === 'z' ? new THREE.Vector3(across, b, 0) : new THREE.Vector3(0, b, across)).applyMatrix4(matrix);
        positions.push(corner.x, corner.y, corner.z); uvs.push(u, v);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  // Front faces look into the room. Facade windows are real openings, so from the
  // street the back face reads as dark glass in the same frame, hiding the room.
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { sunDirection: { value: new THREE.Vector3(-70, 32, -30).normalize() } },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld;
      void main(){ vUv = uv; vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `uniform vec3 sunDirection; varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vec3 ray = normalize(vWorld - cameraPosition);
        vec3 horizon = vec3(.95, .82, .66), zenith = vec3(.55, .75, .89), ground = vec3(.54, .63, .35);
        vec3 view = mix(horizon, zenith, smoothstep(0.0, .45, ray.y));
        view = mix(view, mix(ground, ground * .7, smoothstep(-.05, -.5, ray.y)), smoothstep(.01, -.03, ray.y));
        view += vec3(1.0, .75, .45) * pow(max(0.0, dot(ray, sunDirection)), 12.0) * .45;
        vec2 edge = min(vUv, 1.0 - vUv);
        float frame = 1.0 - step(.07, min(edge.x, edge.y));
        float mullion = 1.0 - step(.025, min(abs(vUv.x - .5), abs(vUv.y - .5)));
        vec3 wood = vec3(.86, .82, .72);
        vec3 glass = gl_FrontFacing ? view * 1.08 : mix(vec3(.10, .17, .20), zenith, .18 + .3 * smoothstep(.2, .9, vUv.y));
        gl_FragColor = vec4(mix(glass, wood, max(frame, mullion)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'interior-windows';
  return mesh;
}
