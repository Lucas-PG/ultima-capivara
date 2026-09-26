import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_PALETTE } from '../shared/terrain';
import type { MapObject, Settings, WorldSpec } from '../shared/types';
import { PLANT_CELL_SIZE, PLANT_TEMPLATE_HEIGHT, plantHash, plantStemTemplate, plantTransform, type PlantStemSection } from '../shared/vegetation-trunks';
import { releaseAfterUpload } from './memory';
import { createToonMaterial } from './materials';

const PLANT_PAINT = { ...WORLD_PALETTE,
  foliageLight: '#A1B75F', foliageMid: '#688F4B', foliageCore: '#376653',
  palmMid: '#6B9049', palmLight: '#B4BC70', palmTrunk: '#9C7A52', palmRing: '#75563B',
  trunk: '#785B3D',
};
const CELL_SIZE = PLANT_CELL_SIZE;

// Painted alpha cards form connected boughs around a visible branch hierarchy.
// Distant LODs retain the crown envelope using fewer, broader overlapping cards.
export function buildVegetation(world: WorldSpec, atlas?: THREE.Texture) {
  const group = new THREE.Group();
  const breeze = { value: 0 };
  const templates = new Map<string, THREE.BufferGeometry[]>();
  const material = createToonMaterial('foliage', { vertexColors: true, roughness: .9, side: THREE.DoubleSide,
    map: atlas ?? null, alphaTest: .4 });
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.uBreeze = breeze;
    shader.vertexShader = `varying float vLeafMask;
      varying vec3 vPlantPaint;
      varying vec3 vLeafDetail;
      uniform float uBreeze;
      attribute vec3 plantTemplate;
      attribute vec3 leafDetail;
      attribute float crownCenter;
      attribute float palmFrond;\n${shader.vertexShader}`.replace(
      '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          if (plantTemplate.y > 0.5 && leafDetail.z >= 0.0) {
            float normalHeightScale = length(instanceMatrix[1].xyz);
            float normalRadialScale = length(instanceMatrix[0].xyz);
            float normalTemplateHeight = plantTemplate.x;
            float palmVariation = .85 + .3 * fract(sin(dot(instanceMatrix[3].xz,
              vec2(41.37, 17.61))) * 43758.5453);
            float normalCrownScale = plantTemplate.y > 1.5 ? normalHeightScale * palmVariation :
              max(1.6, plantTemplate.z * normalTemplateHeight * normalHeightScale) /
              max(1.6, plantTemplate.z * normalTemplateHeight);
            float normalCrownBlend = smoothstep(normalTemplateHeight * .45,
              normalTemplateHeight * .75, position.y);
            float xzFactor = mix(1.0, normalCrownScale / max(normalRadialScale, .001), normalCrownBlend);
            float yFactor = crownCenter > 0.0 ? normalCrownScale / max(normalHeightScale, .001) : 1.0;
            objectNormal = normalize(vec3(objectNormal.x / xzFactor,
              objectNormal.y / yFactor, objectNormal.z / xzFactor));
          }
        #endif
      `).replace(
      '#include <begin_vertex>', `#include <begin_vertex>
        vLeafMask = crownCenter > 0.0 ? 1.0 : 0.0;
        vPlantPaint = position;
        vLeafDetail = leafDetail;
        float phase = 0.0;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3].x * .17 + instanceMatrix[3].z * .11;
          if (plantTemplate.y > 0.5 && leafDetail.z >= 0.0) {
            float heightScale = length(instanceMatrix[1].xyz);
            float radialScale = length(instanceMatrix[0].xyz);
            float templateHeight = plantTemplate.x;
            float palmVariation = .85 + .3 * fract(sin(dot(instanceMatrix[3].xz,
              vec2(41.37, 17.61))) * 43758.5453);
            float crownScale = plantTemplate.y > 1.5 ? heightScale * palmVariation :
              max(1.6, plantTemplate.z * templateHeight * heightScale) /
              max(1.6, plantTemplate.z * templateHeight);
            float crownBlend = smoothstep(templateHeight * .45, templateHeight * .75, position.y);
            vec2 crownPivot = plantTemplate.y > 2.5 ? vec2(templateHeight * .075, 0.0) : vec2(0.0);
            transformed.xz = crownPivot + (transformed.xz - crownPivot) *
              mix(1.0, crownScale / max(radialScale, .001), crownBlend);
            if (crownCenter > 0.0)
              transformed.y = crownCenter + (transformed.y - crownCenter) *
                crownScale / max(heightScale, .001);
            if (plantTemplate.y > 1.5 && palmFrond > .5) {
              float variant = floor(fract(sin(dot(instanceMatrix[3].xz,
                vec2(12.9898, 78.233))) * 43758.5453) * 3.0);
              if (palmFrond > 9.5 - variant)
                transformed = vec3(0.0, plantTemplate.x * .91, 0.0);
            }
          }
        #endif
        float gust = sin(uBreeze * 1.3 + position.x * .63 + position.z * .41 + phase);
        float sway = smoothstep(0.0, 2.0, max(position.y, 0.0));
        transformed.x += gust * .028 * sway;
        transformed.z += cos(uBreeze * .9 + position.z * .48 + phase) * .018 * sway;
      `);
    shader.fragmentShader = `varying float vLeafMask;
      varying vec3 vPlantPaint;
      varying vec3 vLeafDetail;
${shader.fragmentShader}`.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 paintedLeaf = texture2D(map, vMapUv);
          diffuseColor *= mix(vec4(1.0), paintedLeaf, step(1.5, vLeafDetail.z));
        #endif
      `).replace('#include <color_fragment>', `#include <color_fragment>
        float brush = sin(vPlantPaint.x * 7.1 + sin(vPlantPaint.z * 4.3)) *
          sin(vPlantPaint.y * 8.7 + vPlantPaint.z * 2.1);
        vec2 leafPlane = vec2(vPlantPaint.x + vPlantPaint.z * .63,
          vPlantPaint.y + vPlantPaint.z * .41) * 6.5;
        leafPlane.x += sin(leafPlane.y * 1.7) * .18;
        vec2 cell = floor(leafPlane), within = fract(leafPlane) - .5;
        float angle = fract(sin(dot(cell,vec2(127.1,311.7))) * 43758.5453) * 6.283185;
        vec2 stroke = mat2(cos(angle),-sin(angle),sin(angle),cos(angle)) * within;
        float leafPaint = exp(-dot(stroke * vec2(1.5,2.5),stroke * vec2(1.5,2.5)) * 5.0);
        float paintVisibility = 1.0 - smoothstep(.06,.22,length(fwidth(vPlantPaint)));
        diffuseColor.rgb *= .96 + .035 * brush + vLeafMask * paintVisibility *
          (leafPaint * .20 - .045) * (1.0 - step(1.5,vLeafDetail.z));
        // Broad painted midribs belong to each lamina, never a screen-space
        // noise layer. Derivatives soften them before they become subpixel.
        float veinWidth = max(fwidth(vLeafDetail.x) * 1.5, .06);
        float midrib = 1.0 - smoothstep(.025, .025 + veinWidth, abs(vLeafDetail.x));
        float leafEdge = smoothstep(.45, 1.0, abs(vLeafDetail.x));
        diffuseColor.rgb *= 1.0 + float(vLeafDetail.z > .5 && vLeafDetail.z < 1.5) * paintVisibility *
          (leafEdge * .12 - midrib * .10 + vLeafDetail.y * .075);
        float bark = sin(vPlantPaint.y * .9 + vPlantPaint.x * 33.0 + vPlantPaint.z * 27.0);
        diffuseColor.rgb *= 1.0 + (1.0 - vLeafMask) * paintVisibility * bark * .045;
      `).replace('#include <alphatest_fragment>', `
        #ifdef USE_ALPHATEST
          // Mip averaging covers less than a full pixel at the distant crown.
          // Keep painted leaves present without expanding fully clear gaps.
          float leafThreshold = mix(alphaTest, .14,
            smoothstep(18.0, 65.0, length(vViewPosition)) * step(1.5, vLeafDetail.z));
          if (diffuseColor.a < leafThreshold) discard;
        #endif
      `).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Cards have a crown-volume normal on both faces. Three's automatic
        // backface flip would otherwise light each sheet independently.
        if (vLeafDetail.z > 1.5) { normal *= faceDirection; nonPerturbedNormal = normal; }
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 leafGrain = vec3(
          sin(vPlantPaint.y * 21.0 + sin(vPlantPaint.z * 17.0)),
          sin(vPlantPaint.z * 23.0 + sin(vPlantPaint.x * 19.0)),
          sin(vPlantPaint.x * 22.0 + sin(vPlantPaint.y * 18.0)));
        // Fade subpixel grain before it aliases into bright moving flecks.
        float grainVisibility = 1.0 - smoothstep(.035, .12, length(fwidth(vPlantPaint)));
        normal = normalize(normal + vLeafMask * leafGrain * .018 * grainVisibility);
      `).replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          vec3 leafSun = normalize(directionalLights[0].direction);
          float throughLeaf = pow(max(dot(-normal, leafSun), 0.0), 1.4);
          float leafRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.8);
          float sunEdge = max(dot(normalize(normal), leafSun) * .5 + .5, 0.0);
          outgoingLight += vLeafMask * diffuseColor.rgb * vec3(1.0, .77, .32) *
            (.24 * throughLeaf + .09 * leafRim * sunEdge);
        #endif
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'painted-botanical-cards-v8';
  // Smooth overlapping branch sections retain the original collision radius.
  const stem = new THREE.CylinderGeometry(.95, 1, 1, 10, 1, true);
  const twig = new THREE.CylinderGeometry(.48, 1, 1, 5, 1, true);
  const coconut = new THREE.SphereGeometry(1, 10, 7);
  const fruitShape = new THREE.SphereGeometry(1, 7, 4);
  const trunkRing = new THREE.TorusGeometry(1, .065, 3, 8);
  trunkRing.rotateX(Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const hash = plantHash;
  let lod = 0, templateKey = '';
  const stash = (geometry: THREE.BufferGeometry, _material: number, _x: number, _z: number) => {
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv',
      new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    const bucket = templates.get(templateKey) || [];
    bucket.push(geometry); templates.set(templateKey, bucket);
  };
  const tint = (geometry: THREE.BufferGeometry, color: string | THREE.Color, canopy = false) => {
    const base = new THREE.Color(color), positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal'), colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const brush = Math.sin(positions.getX(i) * 3.7 + positions.getZ(i) * 2.3) * Math.sin(positions.getY(i) * 4.1);
      const light = canopy ? .69 + .28 * Math.max(0, normals.getY(i)) + .045 * brush :
        .90 + .08 * Math.max(0, normals.getY(i)) + .025 * brush;
      colors.set([base.r * light, base.g * light, base.b * light], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
  };
  const piece = (base: THREE.BufferGeometry, color: string | THREE.Color, position: THREE.Vector3,
    scale: THREE.Vector3, material = 0, rotation = new THREE.Quaternion(), frond = 0, solid = false) => {
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    geometry.applyMatrix4(matrix.compose(position, rotation, scale));
    geometry.setAttribute('crownCenter', new THREE.Float32BufferAttribute(
      new Array<number>(geometry.getAttribute('position').count).fill(material === 1 ? position.y : 0), 1));
    geometry.setAttribute('palmFrond', new THREE.Float32BufferAttribute(
      new Array<number>(geometry.getAttribute('position').count).fill(frond), 1));
    const detail = new Float32Array(geometry.getAttribute('position').count * 3);
    if (solid) for (let i = 2; i < detail.length; i += 3) detail[i] = -1;
    geometry.setAttribute('leafDetail', new THREE.Float32BufferAttribute(detail, 3));
    stash(tint(geometry, color, material === 1), material, position.x, position.z);
  };
  const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string, frond = 0) => {
    const delta = to.clone().sub(from);
    piece(radius < .065 ? twig : stem, color, from.clone().lerp(to, .5), new THREE.Vector3(radius, delta.length() + radius * .16, radius),
      0, new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()), frond);
  };
  const solidStem = (section: PlantStemSection, color: string) => {
    const a = new THREE.Vector3().copy(section.a), b = new THREE.Vector3().copy(section.b), axis = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(section.radiusTop, section.radiusBottom, axis.length() + .012,
      lod === 0 ? 10 : lod === 1 ? 7 : 5, 1, true);
    piece(geometry, color, a.lerp(b, .5), new THREE.Vector3(1, 1, 1), 0,
      new THREE.Quaternion().setFromUnitVectors(up, axis.normalize()), 0, true);
    geometry.dispose();
  };
  const leaf = (base: THREE.Vector3, tip: THREE.Vector3, width: number, color: string | THREE.Color,
    frond = 0, vertical = 0, steps = lod === 0 ? frond > 0 ? 4 : 3 : 2) => {
    const axis = tip.clone().sub(base);
    const side = new THREE.Vector3(-axis.z, .03 + axis.length() * vertical, axis.x).normalize();
    const points: THREE.Vector3[] = [], normals: THREE.Vector3[] = [], detail: number[] = [];
    const rows: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, spread = Math.pow(Math.sin(Math.PI * t), .72) * width;
      const center = base.clone().lerp(tip, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * width * .18, 0));
      rows.push([center.clone().addScaledVector(side, spread), center.clone().add(new THREE.Vector3(0, spread * .16, 0)), center.clone().addScaledVector(side, -spread)]);
    }
    const volumeNormal = new THREE.Vector3(axis.x * .7, Math.max(.15, axis.length() * .45), axis.z * .7).normalize();
    for (let i = 0; i < steps; i++) for (const [index, face] of [[0, 3, 1], [1, 3, 4], [1, 4, 2], [2, 4, 5]].entries()) {
      // Both ends converge to a point; do not upload their zero-area triangles.
      if (i === 0 && index % 2 === 0 || i === steps - 1 && index % 2 === 1) continue;
      const ring = [...rows[i], ...rows[i + 1]];
      for (const index of face) {
        points.push(ring[index]);
        normals.push(volumeNormal.clone().addScaledVector(side, index % 3 === 0 ? .32 : index % 3 === 2 ? -.32 : 0).normalize());
        detail.push(index % 3 - 1, (i + (index >= 3 ? 1 : 0)) / steps, 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals.flatMap(n => [n.x, n.y, n.z]), 3));
    g.setAttribute('crownCenter', new THREE.Float32BufferAttribute(new Array<number>(points.length).fill(base.y), 1));
    g.setAttribute('palmFrond', new THREE.Float32BufferAttribute(new Array<number>(points.length).fill(frond), 1));
    g.setAttribute('leafDetail', new THREE.Float32BufferAttribute(detail, 3));
    stash(tint(g, color), 1, base.x, base.z);
  };
  const paintedSpray = (path: (t: number) => THREE.Vector3, width: number, tile: number,
    roll = 0, frond = 0, segments = lod === 0 ? 3 : lod === 1 ? 2 : 1,
    volumeCenter?: THREE.Vector3) => {
    const vertices: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
    const root = path(0), end = path(1), axis = end.clone().sub(root).normalize();
    const side = new THREE.Vector3(-axis.z, 0, axis.x);
    if (side.lengthSq() < .001) side.set(1, 0, 0);
    side.normalize().applyAxisAngle(axis, roll);
    const facing = side.clone().cross(axis).normalize();
    // Curved cards carry the leaf silhouette; their shared volume normals keep
    // the crown soft instead of exposing a pile of flat lit rectangles.
    const normal = facing.clone().multiplyScalar(.38).add(new THREE.Vector3(axis.x * .22, .9, axis.z * .22)).normalize();
    for (let row = 0; row <= segments; row++) {
      const t = row / segments, center = path(t);
      for (let col = 0; col < 3; col++) {
        const across = col - 1, point = center.clone().addScaledVector(side, across * width * .5)
          .addScaledVector(facing, (1 - across * across) * Math.sin(t * Math.PI) * width * .1);
        vertices.push(point.x, point.y, point.z);
        const n = volumeCenter ? point.clone().sub(volumeCenter).multiply(new THREE.Vector3(1, 1.6, 1))
          .normalize().multiplyScalar(.9).addScaledVector(normal, .1).normalize() :
          normal.clone().addScaledVector(side, across * .13).normalize();
        normals.push(n.x, n.y, n.z);
        // TextureLoader keeps flipY=true. The agreed atlas is top-left row order.
        uv.push((tile % 4 + .012 + col * .488) / 4, 1 - (Math.floor(tile / 4) + .988 - t * .976) / 4);
        if (row < segments && col < 2) {
          const i = row * 3 + col; indices.push(i, i + 1, i + 3, i + 1, i + 4, i + 3);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('crownCenter', new THREE.Float32BufferAttribute(new Array(vertices.length / 3)
      .fill(Math.max(.01, volumeCenter?.y ?? path(.5).y)), 1));
    geometry.setAttribute('palmFrond', new THREE.Float32BufferAttribute(new Array(vertices.length / 3).fill(frond), 1));
    const detail = new Float32Array(vertices.length);
    for (let i = 2; i < detail.length; i += 3) detail[i] = 2;
    geometry.setAttribute('leafDetail', new THREE.BufferAttribute(detail, 3));
    geometry.setIndex(indices);
    const flat = geometry.toNonIndexed(); geometry.dispose();
    stash(tint(flat, '#F3F5E7'), 1, root.x, root.z);
  };
  const species = (object: MapObject) => object.kind === 'tree' ?
    (['mangrove', 'orchard', 'ipe-yellow', 'ipe-pink', 'flamboyant', 'banana'].includes(object.detail || '') ? object.detail! : 'tree') :
    object.kind === 'grass' && ['reeds', 'fern', 'monstera', 'ground-litter'].includes(object.detail || '') ? object.detail! : object.kind;
  const specimens = new Map<string, MapObject>();
  for (const object of world.objects) if (object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass') {
    const key = species(object);
    if (!specimens.has(key)) specimens.set(key, object.kind === 'palm' || object.kind === 'tree' && key !== 'banana' ?
      { ...object, scale: { ...object.scale, y: PLANT_TEMPLATE_HEIGHT[object.kind] } } : object);
  }
  for (lod = 0; lod < 3; lod++) for (const [key, object] of specimens) {
    templateKey = `${key}:${lod}`;
    const far = lod > 0, distant = lod === 2;
    if (far && object.kind === 'grass') continue;
    const { scale, kind } = object;
    const rotation = 0;
    const base = new THREE.Vector3(), h = scale.y;
    const seed = 75600 + [...key].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) | 0, 0);
    if (kind === 'grass') {
      if (key === 'fern' || key === 'monstera' || key === 'ground-litter') {
        const tile = key === 'fern' ? 14 : key === 'monstera' ? 9 : 13;
        for (let i = 0; i < (key === 'ground-litter' ? 4 : 7); i++) {
          const angle = i * 2.399, height = key === 'ground-litter' ? .035 : h;
          const root = new THREE.Vector3(Math.cos(angle) * scale.x * .13, .018, Math.sin(angle) * scale.z * .13);
          const reach = key === 'ground-litter' ? scale.x * .35 : h * .75;
          const tip = root.clone().add(new THREE.Vector3(Math.cos(angle) * reach, height * .6, Math.sin(angle) * reach));
          paintedSpray(t => root.clone().lerp(tip, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * height * .4, 0)),
            reach * (key === 'fern' ? .65 : .9), tile, .13 * Math.sin(angle));
        }
        continue;
      }
      const reeds = object.detail === 'reeds';
      for (let i = 0; i < (reeds ? 9 : 7); i++) {
        const angle = i * 2.399 + rotation, height = Math.min(reeds ? 1.6 : .42, h) * (.5 + hash(seed, i) * .5);
        const root = base.clone().add(new THREE.Vector3(Math.cos(angle) * .12, 0, Math.sin(angle) * .12));
        const tip = root.clone().add(new THREE.Vector3(Math.cos(angle) * height * .45, height, Math.sin(angle) * height * .45));
        leaf(root, tip, reeds ? .025 : .04, i % 3 ? PLANT_PAINT.tuft : PLANT_PAINT.tuftTip);
        if (reeds && i % 3 === 0) piece(coconut, '#825c3e', tip, new THREE.Vector3(.035, .13, .035));
      }
      continue;
    }
    if (kind === 'palm') {
      const sections = plantStemTemplate('palm', distant ? 4 : far ? 6 : 12);
      for (const section of sections) solidStem(section, PLANT_PAINT.palmTrunk);
      const top = new THREE.Vector3().copy(sections.at(-1)!.b), radius = .13 + h * .009;
      for (let ring = 1; ring < (far ? 0 : 10); ring++) {
        const t = ring / 10;
        const point = new THREE.Vector3(h * .075 * t + Math.sin(t * Math.PI) * .16, h * .91 * t, 0);
        piece(trunkRing, PLANT_PAINT.palmRing, point, new THREE.Vector3(radius * (1 - t * .32), .12, radius * (1 - t * .32)),
          0, new THREE.Quaternion(), 0, true);
      }
      for (let i = 0; i < 9; i++) {
        const angle = i * Math.PI * 2 / 9, length = h * (.29 + hash(seed, i + 40) * .055);
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const point = (t: number) => top.clone().addScaledVector(direction, length * t)
          .add(new THREE.Vector3(0, Math.sin(t * Math.PI) * .65 - t * t * 2.7 + (i % 2) * .15, 0));
        paintedSpray(point, length * .88, 6, (i % 2 ? 1 : -1) * .2, i + 1, distant ? 3 : far ? 4 : 7);
        if (!far) for (let rib = 0; rib < 4; rib++)
          branch(point(rib / 4), point((rib + 1) / 4), .016, PLANT_PAINT.palmMid, i + 1);
      }
      for (let i = 0; i < (far ? 0 : 5); i++) {
        const angle = i * 1.25;
        piece(coconut, '#907046', top.clone().add(new THREE.Vector3(Math.cos(angle) * .22, -.15, Math.sin(angle) * .22)), new THREE.Vector3(.14, .19, .14));
      }
      continue;
    }
    if (key === 'banana') {
      const crown = base.clone().add(new THREE.Vector3(0, h * .77, 0));
      branch(base, crown, .13, PLANT_PAINT.palmTrunk);
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7, reach = h * .46;
        const point = (t: number) => crown.clone().add(new THREE.Vector3(Math.cos(angle) * reach * t,
          Math.sin(t * Math.PI) * h * .14 - t * t * h * .15, Math.sin(angle) * reach * t));
        paintedSpray(point, reach * .65, 8, (i % 2 ? 1 : -1) * .17, 0, distant ? 2 : far ? 3 : 5);
        if (!far) for (let rib = 0; rib < 3; rib++)
          branch(point(rib / 3), point((rib + 1) / 3), .014, PLANT_PAINT.foliageCore);
      }
      continue;
    }
    const trunk = plantStemTemplate('tree', distant ? 3 : far ? 4 : 8);
    for (const section of trunk) solidStem(section, PLANT_PAINT.trunk);
    const trunkTop = new THREE.Vector3().copy(trunk.at(-1)!.b), trunkRadius = .15 + h * .015;
    for (let root = 0; root < (far ? 0 : 5); root++) {
      const angle = root * Math.PI * 2 / 5;
      branch(base.clone().add(new THREE.Vector3(Math.cos(angle) * .5, .04, Math.sin(angle) * .5)),
        base.clone().add(new THREE.Vector3(0, .7, 0)), trunkRadius * .38, PLANT_PAINT.trunk);
    }
    const broad = key === 'flamboyant';
    const flowering = key === 'ipe-yellow' || key === 'ipe-pink';
    const mangrove = key === 'mangrove', orchard = key === 'orchard';
    const radius = Math.max(1.6, h * (broad ? .34 : .27));
    const crownVolume = new THREE.Vector3(0, h * (broad ? .78 : .8), 0);
    for (let cluster = 0; cluster < 9; cluster++) {
      const angle = rotation + cluster * 2.399, outer = cluster < 5;
      const center = base.clone().add(new THREE.Vector3(
        outer ? Math.cos(angle) * radius * (broad ? .8 : .57) : Math.cos(angle) * .35,
        h * (broad ? .78 : outer ? .71 : .88) + hash(seed, cluster) * .22,
        outer ? Math.sin(angle) * radius * (broad ? .8 : .57) : Math.sin(angle) * .35));
      if (!distant) {
        const fork = trunkTop.clone().lerp(center, .54).add(new THREE.Vector3(0, -.12 * radius, 0));
        branch(trunkTop, fork, trunkRadius * .55, PLANT_PAINT.trunk);
        branch(fork, center, trunkRadius * .28, PLANT_PAINT.trunk);
      }
      const size = new THREE.Vector3(radius * (broad ? .76 : .69), radius * (broad ? .28 : .49), radius * (broad ? .76 : .66));
      const packets = distant ? 3 : far ? 5 : 8;
      for (let packet = 0; packet < packets; packet++) {
        const a = angle + (packet - 1) * Math.PI * 2 / (packets - 1);
        const offset = packet === 0 ? new THREE.Vector3(0, .08, 0) :
          new THREE.Vector3(Math.cos(a) * .68, Math.sin(a * 3 + cluster) * .28, Math.sin(a) * .68);
        const position = center.clone().add(offset.multiply(size));
        const spread = distant ? .68 : far ? .60 : .47;
        const reach = radius * spread, direction = new THREE.Vector3(Math.cos(a), .25 + hash(seed + cluster, packet + 12) * .5, Math.sin(a));
        const start = position.clone().addScaledVector(direction, -reach * .46);
        const end = position.clone().addScaledVector(direction, reach * .54);
        if (!far) branch(center, start.clone().lerp(end, .25), .027, PLANT_PAINT.trunk);
        const tile = flowering && cluster % 3 !== 1 ? key === 'ipe-yellow' ? 3 : 4 :
          broad && packet % 4 === 0 ? 5 : mangrove ? 2 : (packet + cluster) % 3 === 0 ? 1 : packet % 3 === 0 ? 15 : 0;
        // Two interleaved sprays show distinct leaves from both above and below.
        // The distant silhouette uses one broad pair without tiny geometry.
        const layers = far ? 2 : 3;
        for (let layer = 0; layer < layers; layer++) {
          const axis = direction.clone().applyAxisAngle(up, (layer - (layers - 1) * .5) * .7);
          const root = position.clone().addScaledVector(axis, -reach * .5);
          const tip = root.clone().addScaledVector(axis, reach);
          const path = (t: number) => root.clone().lerp(tip, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * reach * .13, 0));
          paintedSpray(path, reach * (broad ? 1.12 : .94), tile,
            (layer - (layers - 1) * .5) * .65 + (hash(seed + packet, layer) - .5) * .3,
            0, distant ? 1 : far ? 2 : 3, crownVolume);
        }
      }
      if (!far && orchard && cluster < 5) {
        for (let fruit = 0; fruit < 3; fruit++) piece(fruitShape, '#e8a145', center.clone().add(new THREE.Vector3(
          Math.cos(angle + fruit) * radius * .49, -.15, Math.sin(angle + fruit) * radius * .5)), new THREE.Vector3(.095, .11, .095), 1);
      }
    }
  }
  // Templates are authored once. The instance matrices keep each tree at its
  // own terrain point while one draw covers all plants of a species in a cell.
  const merged = new Map<string, THREE.BufferGeometry>();
  const shadowProxy = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  for (const [key, parts] of templates) {
    const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
    if (!geometry) throw new Error('Cannot merge vegetation geometry');
    const type = key.split(':')[0], templateHeight = specimens.get(type)!.scale.y;
    const templateKind = specimens.get(type)!.kind === 'grass' ? 0 : type === 'palm' ? 3 : type === 'banana' ? 2 : 1;
    const crownSlope = type === 'flamboyant' ? .34 : .27;
    const count = geometry.getAttribute('position').count;
    const plantTemplate = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) plantTemplate.set([templateHeight, templateKind, crownSlope], i * 3);
    geometry.setAttribute('plantTemplate', new THREE.BufferAttribute(plantTemplate, 3));
    geometry.computeBoundingSphere();
    if (templateKind) geometry.boundingSphere!.radius *= 1.5;
    merged.set(key, geometry);
    releaseAfterUpload(geometry);
  }
  templates.clear();
  const cells = new Map<string, MapObject[]>();
  for (const object of world.objects) if (object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass') {
    const key = `${species(object)}:${Math.floor(object.pos.x / CELL_SIZE)}:${Math.floor(object.pos.z / CELL_SIZE)}`;
    const bucket = cells.get(key) || [];
    bucket.push(object); cells.set(key, bucket);
  }
  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3(), instanceScale = new THREE.Vector3();
  const instanceRotation = new THREE.Quaternion(), yawRotation = new THREE.Quaternion();
  const leanAxis = new THREE.Vector3();
  const instances: THREE.InstancedMesh[] = [];
  const lods: THREE.LOD[] = [];
  const makeInstances = (geometry: THREE.BufferGeometry, count: number, material: THREE.Material,
    objects: MapObject[], cx: number, cz: number, templateHeight: number, shadow = false) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    objects.forEach((object, index) => {
      instancePosition.set(object.pos.x - cx, object.pos.y, object.pos.z - cz);
      const heightScale = object.scale.y / templateHeight;
      if (shadow) instanceScale.setScalar(heightScale);
      else if (object.kind === 'grass') {
        if (['fern', 'monstera', 'ground-litter'].includes(object.detail || '')) {
          const source = specimens.get(species(object))!;
          instanceScale.set(object.scale.x / source.scale.x, heightScale, object.scale.z / source.scale.z);
        } else {
          const bladeCap = object.detail === 'reeds' ? 1.6 : .42;
          instanceScale.set(1, Math.min(bladeCap, object.scale.y) / Math.min(bladeCap, templateHeight), 1);
        }
      } else if (object.detail === 'banana') {
        instanceScale.set(1, heightScale, 1);
      } else {
        const transform = plantTransform(object);
        instanceScale.set(transform.radialScale, transform.heightScale, transform.radialScale);
      }
      // Most authored landmark trees have no rotation. Give each a stable
      // orientation so instancing does not reveal identical neighbouring crowns.
      const rotation = object.rotation ?? hash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100)) * Math.PI * 2;
      yawRotation.setFromAxisAngle(up, rotation);
      if (object.kind === 'palm') {
        const transform = plantTransform(object);
        leanAxis.set(Math.sin(transform.leanDirection), 0, -Math.cos(transform.leanDirection));
        instanceRotation.setFromAxisAngle(leanAxis, transform.lean).multiply(yawRotation);
      } else instanceRotation.copy(yawRotation);
      mesh.setMatrixAt(index, instanceMatrix.compose(instancePosition, instanceRotation, instanceScale));
      if (!shadow) {
        const variation = hash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100));
        mesh.setColorAt(index, new THREE.Color().setRGB(.94 + variation * .08,
          .97 + variation * .04, 1.03 - variation * .13));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    instances.push(mesh);
    return mesh;
  };
  for (const [key, objects] of cells) {
    const [type, cellX, cellZ] = key.split(':');
    const cx = (Number(cellX) + .5) * CELL_SIZE, cz = (Number(cellZ) + .5) * CELL_SIZE;
    const nearGeometry = merged.get(`${type}:0`)!;
    const farGeometry = merged.get(`${type}:1`), distantGeometry = merged.get(`${type}:2`);
    const templateHeight = specimens.get(type)!.scale.y;
    const near = makeInstances(nearGeometry, objects.length, material, objects, cx, cz, templateHeight);
    near.receiveShadow = true;
    const node = new THREE.LOD(); node.name = `vegetation:${key}`; node.position.set(cx, 0, cz); lods.push(node);
    node.addLevel(near, 0);
    if (farGeometry) {
      const far = makeInstances(farGeometry, objects.length, material, objects, cx, cz, templateHeight);
      far.receiveShadow = true;
      // Tight cell LODs spend geometry on the player's immediate surroundings.
      node.addLevel(far, 25, .12);
    }
    if (distantGeometry) {
      const distant = makeInstances(distantGeometry, objects.length, material, objects, cx, cz, templateHeight);
      distant.receiveShadow = true; node.addLevel(distant, 60, .12);
    }
    group.add(node);
  }
  // Shadow-only silhouettes keep the broad canopy and palm radial shape with
  // a fraction of the visible mesh's triangles. They have no colour or UVs.
  const shadowStem = new THREE.CylinderGeometry(.025, .05, .8, 5, 1, true);
  shadowStem.translate(0, .4, 0); shadowStem.deleteAttribute('uv');
  const shadowCrown = new THREE.IcosahedronGeometry(1, 0);
  shadowCrown.scale(.3, .24, .3); shadowCrown.translate(0, .75, 0); shadowCrown.deleteAttribute('uv');
  const shadowFronds = new THREE.BufferGeometry();
  const frondVertices: number[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = i * Math.PI * 2 / 9, dx = Math.cos(angle), dz = Math.sin(angle);
    const sideX = -dz * .075, sideZ = dx * .075;
    frondVertices.push(0, .92, 0, dx * .34 + sideX, .51, dz * .34 + sideZ,
      dx * .34 - sideX, .51, dz * .34 - sideZ);
  }
  shadowFronds.setAttribute('position', new THREE.Float32BufferAttribute(frondVertices, 3));
  shadowFronds.computeVertexNormals();
  const treeStem = shadowStem.index ? shadowStem.toNonIndexed() : shadowStem.clone();
  const palmStem = shadowStem.index ? shadowStem.toNonIndexed() : shadowStem.clone();
  const crownTriangles = shadowCrown.index ? shadowCrown.toNonIndexed() : shadowCrown.clone();
  const shadowTree = mergeGeometries([treeStem, crownTriangles], false);
  const shadowPalm = mergeGeometries([palmStem, shadowFronds], false);
  treeStem.dispose(); palmStem.dispose(); crownTriangles.dispose();
  shadowStem.dispose(); shadowCrown.dispose(); shadowFronds.dispose();
  if (!shadowTree || !shadowPalm) throw new Error('Cannot merge vegetation shadow templates');
  for (const geometry of [shadowTree, shadowPalm]) { geometry.computeBoundingSphere(); releaseAfterUpload(geometry); }
  // The shadow camera covers a small slice of the map. Grouping by broadleaf
  // or palm silhouette in 64 m cells cuts redundant proxy draws.
  const shadowCells = new Map<string, MapObject[]>();
  for (const object of world.objects) if ((object.kind === 'tree' || object.kind === 'palm') && object.scale.y >= 2.5) {
    const type = object.kind === 'palm' || object.detail === 'banana' ? 'palm' : 'tree';
    const key = `${type}:${Math.floor(object.pos.x / 64)}:${Math.floor(object.pos.z / 64)}`;
    const bucket = shadowCells.get(key) || [];
    bucket.push(object); shadowCells.set(key, bucket);
  }
  for (const [key, objects] of shadowCells) {
    const [type, cellX, cellZ] = key.split(':');
    const cx = (Number(cellX) + .5) * 64, cz = (Number(cellZ) + .5) * 64;
    const geometry = type === 'palm' ? shadowPalm : shadowTree;
    const proxy = makeInstances(geometry, objects.length, shadowProxy, objects, cx, cz, 1, true);
    proxy.position.set(cx, 0, cz); proxy.castShadow = true;
    group.add(proxy);
  }
  stem.dispose(); twig.dispose(); coconut.dispose(); fruitShape.dispose(); trunkRing.dispose();
  return { group,
    setQuality(quality: Settings['graphics']) {
      for (const node of lods) {
        if (node.levels[1]) node.levels[1].distance = quality === 'low' ? 0 : 25;
        if (node.levels[2]) node.levels[2].distance = quality === 'low' ? 42 : 60;
      }
    },
    update(time: number) { breeze.value = time; },
    dispose() { instances.forEach(mesh => mesh.dispose()); merged.forEach(g => g.dispose());
      shadowTree.dispose(); shadowPalm.dispose(); material.dispose(); shadowProxy.dispose(); } };
}
