import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_PALETTE } from '../shared/terrain';
import type { MapObject, WorldSpec } from '../shared/types';
import { releaseAfterUpload } from './memory';
import { createToonMaterial } from './materials';

const PLANT_PAINT = { ...WORLD_PALETTE,
  foliageLight: '#A1B75F', foliageMid: '#688F4B', foliageCore: '#376653',
  palmMid: '#6B9049', palmLight: '#B4BC70', palmTrunk: '#9C7A52', palmRing: '#75563B',
  trunk: '#785B3D',
};

// Closed crowns and individually shaped fronds have a readable silhouette from
// either side. No atlas rectangles, oversized leaf cards, or transparent sorting.
export function buildVegetation(world: WorldSpec) {
  const group = new THREE.Group();
  const breeze = { value: 0 };
  const templates = new Map<string, THREE.BufferGeometry[]>();
  const material = createToonMaterial('foliage', { vertexColors: true, roughness: .9, side: THREE.DoubleSide });
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.uBreeze = breeze;
    shader.vertexShader = `varying float vLeafMask;
      varying vec3 vPlantPaint;
      uniform float uBreeze;
      attribute vec3 plantTemplate;
      attribute float crownCenter;
      attribute float palmFrond;\n${shader.vertexShader}`.replace(
      '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          if (plantTemplate.y > 0.5) {
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
        float phase = 0.0;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3].x * .17 + instanceMatrix[3].z * .11;
          if (plantTemplate.y > 0.5) {
            float heightScale = length(instanceMatrix[1].xyz);
            float radialScale = length(instanceMatrix[0].xyz);
            float templateHeight = plantTemplate.x;
            float palmVariation = .85 + .3 * fract(sin(dot(instanceMatrix[3].xz,
              vec2(41.37, 17.61))) * 43758.5453);
            float crownScale = plantTemplate.y > 1.5 ? heightScale * palmVariation :
              max(1.6, plantTemplate.z * templateHeight * heightScale) /
              max(1.6, plantTemplate.z * templateHeight);
            float crownBlend = smoothstep(templateHeight * .45, templateHeight * .75, position.y);
            transformed.xz *= mix(1.0, crownScale / max(radialScale, .001), crownBlend);
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
${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        float brush = sin(vPlantPaint.x * 7.1 + sin(vPlantPaint.z * 4.3)) *
          sin(vPlantPaint.y * 8.7 + vPlantPaint.z * 2.1);
        diffuseColor.rgb *= .96 + .055 * brush;
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 leafGrain = vec3(
          sin(vPlantPaint.y * 21.0 + sin(vPlantPaint.z * 17.0)),
          sin(vPlantPaint.z * 23.0 + sin(vPlantPaint.x * 19.0)),
          sin(vPlantPaint.x * 22.0 + sin(vPlantPaint.y * 18.0)));
        // Fade subpixel grain before it aliases into bright moving flecks.
        float grainVisibility = 1.0 - smoothstep(.035, .12, length(fwidth(vPlantPaint)));
        normal = normalize(normal + vLeafMask * leafGrain * .035 * grainVisibility);
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
  material.customProgramCacheKey = () => 'painted-fluffy-foliage-v4';
  // Smooth overlapping branch sections retain the original collision radius.
  const stem = new THREE.CylinderGeometry(.95, 1, 1, 10, 1, true);
  const lumpy = (segments: number, rings: number) => {
    const geometry = new THREE.SphereGeometry(1, segments, rings), points = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const r = 1 + .10 * Math.sin(x * 7 + z * 5) * Math.cos(y * 6 - x * 4) + .035 * Math.cos(z * 11 + y * 8);
      points.setXYZ(i, x * r, y * r, z * r);
      // Analytic canopy normals survive non-indexed merging, so light shades a
      // soft leaf volume instead of exposing each polygon's face normal.
      const normal = new THREE.Vector3(x, y * .94, z).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    return geometry;
  };
  const crowns = [lumpy(16, 10), lumpy(10, 7), lumpy(8, 5)];
  const coconut = new THREE.SphereGeometry(1, 10, 7);
  const trunkRing = new THREE.TorusGeometry(1, .065, 3, 8);
  trunkRing.rotateX(Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const hash = (n: number, salt: number) => {
    let x = Math.imul(n + salt * 7919, 1597334677);
    x = Math.imul(x ^ x >>> 16, 2246822507);
    return (x >>> 0) / 4294967296;
  };
  let lod = 0, templateKey = '';
  const stash = (geometry: THREE.BufferGeometry, _material: number, _x: number, _z: number) => {
    geometry.deleteAttribute('uv');
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
    scale: THREE.Vector3, material = 0, rotation = new THREE.Quaternion(), frond = 0) => {
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    geometry.applyMatrix4(matrix.compose(position, rotation, scale));
    geometry.setAttribute('crownCenter', new THREE.Float32BufferAttribute(
      new Array<number>(geometry.getAttribute('position').count).fill(material === 1 ? position.y : 0), 1));
    geometry.setAttribute('palmFrond', new THREE.Float32BufferAttribute(
      new Array<number>(geometry.getAttribute('position').count).fill(frond), 1));
    stash(tint(geometry, color, material === 1), material, position.x, position.z);
  };
  const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string, frond = 0) => {
    const delta = to.clone().sub(from);
    piece(stem, color, from.clone().lerp(to, .5), new THREE.Vector3(radius, delta.length() + radius * .16, radius),
      0, new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()), frond);
  };
  const leaf = (base: THREE.Vector3, tip: THREE.Vector3, width: number, color: string | THREE.Color,
    frond = 0, vertical = 0) => {
    const axis = tip.clone().sub(base);
    const side = new THREE.Vector3(-axis.z, .03 + axis.length() * vertical, axis.x).normalize();
    const steps = lod === 0 ? frond > 0 ? 4 : 3 : 2;
    const points: THREE.Vector3[] = [], normals: THREE.Vector3[] = [];
    const rows: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, spread = Math.pow(Math.sin(Math.PI * t), .72) * width;
      const center = base.clone().lerp(tip, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * width * .18, 0));
      rows.push([center.clone().addScaledVector(side, spread), center.clone().add(new THREE.Vector3(0, spread * .16, 0)), center.clone().addScaledVector(side, -spread)]);
    }
    const volumeNormal = new THREE.Vector3(axis.x * .7, Math.max(.15, axis.length() * .45), axis.z * .7).normalize();
    for (let i = 0; i < steps; i++) for (const face of [[0, 3, 1], [1, 3, 4], [1, 4, 2], [2, 4, 5]]) {
      const ring = [...rows[i], ...rows[i + 1]];
      for (const index of face) {
        points.push(ring[index]);
        normals.push(volumeNormal.clone().addScaledVector(side, index % 3 === 0 ? .32 : index % 3 === 2 ? -.32 : 0).normalize());
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals.flatMap(n => [n.x, n.y, n.z]), 3));
    g.setAttribute('crownCenter', new THREE.Float32BufferAttribute(new Array<number>(points.length).fill(base.y), 1));
    g.setAttribute('palmFrond', new THREE.Float32BufferAttribute(new Array<number>(points.length).fill(frond), 1));
    stash(tint(g, color), 1, base.x, base.z);
  };
  const species = (object: MapObject) => object.kind === 'tree' ?
    (['mangrove', 'orchard', 'ipe-yellow', 'ipe-pink', 'flamboyant', 'banana'].includes(object.detail || '') ? object.detail! : 'tree') :
    object.kind === 'grass' && object.detail === 'reeds' ? 'reeds' : object.kind;
  const specimens = new Map<string, MapObject>();
  for (const object of world.objects) if (object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass') {
    const key = species(object);
    if (!specimens.has(key)) specimens.set(key, object);
  }
  const positionKey = (x: number, z: number) => `${x.toFixed(4)}:${z.toFixed(4)}`;
  const trunkRadii = new Map<string, number>();
  for (const collider of world.colliders) if (/^(mangrove-)?trunk-/.test(collider.id))
    trunkRadii.set(positionKey((collider.min.x + collider.max.x) / 2,
      (collider.min.z + collider.max.z) / 2), (collider.max.x - collider.min.x) / 2);
  for (lod = 0; lod < 3; lod++) for (const [key, object] of specimens) {
    templateKey = `${key}:${lod}`;
    const far = lod > 0, distant = lod === 2;
    if (far && object.kind === 'grass') continue;
    const { scale, kind } = object;
    const rotation = 0;
    const base = new THREE.Vector3(), h = scale.y;
    const seed = 75600 + (key === 'orchard' ? 0 : 1);
    if (kind === 'grass') {
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
      const bend = .45 + hash(seed, 7) * .55;
      const top = base.clone().add(new THREE.Vector3(Math.cos(rotation) * bend, h * .91, Math.sin(rotation) * bend));
      let previous = base.clone();
      const radius = .13 + h * .009;
      const segments = distant ? 2 : far ? 4 : 8;
      for (let segment = 1; segment <= segments; segment++) {
        const t = segment / segments;
        const point = base.clone().lerp(top, t);
        point.x += Math.sin(t * Math.PI) * .16;
        branch(previous, point, radius * (1 - t * .32), PLANT_PAINT.palmTrunk);
        previous = point;
      }
      for (let ring = 1; ring < (far ? 0 : 10); ring++) {
        const t = ring / 10, point = base.clone().lerp(top, t);
        point.x += Math.sin(t * Math.PI) * .16;
        piece(trunkRing, PLANT_PAINT.palmRing, point, new THREE.Vector3(radius * (1 - t * .32), .12, radius * (1 - t * .32)));
      }
      for (let i = 0; i < 9; i++) {
        const angle = rotation + i * Math.PI * 2 / 9;
        const length = h * (.29 + hash(seed, i + 40) * .055);
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
        const point = (t: number) => top.clone().addScaledVector(direction, length * t)
          .add(new THREE.Vector3(0, Math.sin(t * Math.PI) * .65 - t * t * 2.7 + (i % 2) * .15, 0));
        // The same connected silhouette sits below the close leaflets and is
        // retained alone at distance, so the LOD swap loses only fine detail.
        for (const [start, end, width] of [[0, .46, .16], [.27, .78, .18], [.58, 1, .14]] as const)
          leaf(point(start), point(end), length * width, PLANT_PAINT.palmMid, i + 1, .6);
        if (!far) for (let rib = 0; rib < 3; rib++)
          branch(point(rib / 3), point((rib + 1) / 3), .022, PLANT_PAINT.palmMid, i + 1);
        for (let n = distant ? 14 : far ? 2 : 1; n <= 13; n += far ? 3 : 1) {
          const t = n / 14, root = point(t);
          const blade = Math.sin(Math.PI * t) * length * .36;
          for (const side of [-1, 1]) {
            const tip = root.clone().addScaledVector(across, blade * side)
              .addScaledVector(direction, length * .14).add(new THREE.Vector3(0, -.1 - blade * .13, 0));
            leaf(root, tip, (far ? .27 : .15) * Math.sin(Math.PI * t) + .026,
              (n + i) % 3 ? PLANT_PAINT.palmMid : PLANT_PAINT.palmLight, i + 1, .5);
          }
        }
      }
      for (let i = 0; i < (far ? 0 : 5); i++) {
        const angle = rotation + i * 1.25;
        piece(coconut, '#907046', top.clone().add(new THREE.Vector3(Math.cos(angle) * .22, -.15, Math.sin(angle) * .22)), new THREE.Vector3(.14, .19, .14));
      }
      continue;
    }
    if (key === 'banana') {
      const crown = base.clone().add(new THREE.Vector3(0, h * .77, 0));
      branch(base, crown, .13, PLANT_PAINT.palmTrunk);
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const root = crown.clone().add(new THREE.Vector3(Math.cos(angle) * .12, 0, Math.sin(angle) * .12));
        const tip = crown.clone().add(new THREE.Vector3(Math.cos(angle) * h * .45,
          h * (.05 + (i % 2) * .04), Math.sin(angle) * h * .45));
        leaf(root, tip, h * (far ? .19 : .16), i % 3 ? PLANT_PAINT.foliageLight : PLANT_PAINT.foliageMid);
        if (!far) branch(root, tip, .025, PLANT_PAINT.foliageCore);
      }
      if (!far) piece(coconut, '#D8D98A', crown.clone().add(new THREE.Vector3(0, -.28, 0)),
        new THREE.Vector3(.17, .32, .17));
      continue;
    }
    const trunkTop = base.clone().add(new THREE.Vector3(.15 * Math.cos(rotation), h * .6, .15 * Math.sin(rotation)));
    const trunkRadius = .15 + h * .015;
    let previousTrunk = base.clone();
    const trunkSegments = distant ? 2 : far ? 3 : 6;
    for (let segment = 1; segment <= trunkSegments; segment++) {
      const t = segment / trunkSegments, point = base.clone().lerp(trunkTop, t);
      point.x += Math.sin(t * Math.PI * 1.6) * .12;
      point.z += Math.sin(t * Math.PI) * .08;
      branch(previousTrunk, point, trunkRadius * (1 - .20 * t), PLANT_PAINT.trunk);
      previousTrunk = point;
    }
    for (let root = 0; root < (far ? 0 : 6); root++) {
      const angle = rotation + root * Math.PI / 3;
      branch(base.clone().add(new THREE.Vector3(Math.cos(angle) * .5, .04, Math.sin(angle) * .5)),
        base.clone().add(new THREE.Vector3(0, .7, 0)), trunkRadius * .38, PLANT_PAINT.trunk);
    }
    const broad = key === 'flamboyant';
    const flowering = key === 'ipe-yellow' || key === 'ipe-pink';
    const radius = Math.max(1.6, h * (broad ? .34 : .27));
    for (let cluster = 0; cluster < (far ? 5 : 9); cluster++) {
      const angle = rotation + cluster * 2.399, outer = cluster < 5;
      const center = base.clone().add(new THREE.Vector3(
        outer ? Math.cos(angle) * radius * (broad ? .8 : .57) : Math.cos(angle) * .35,
        h * (broad ? .78 : outer ? .71 : .88) + hash(seed, cluster) * .22,
        outer ? Math.sin(angle) * radius * (broad ? .8 : .57) : Math.sin(angle) * .35));
      if (!distant) branch(trunkTop.clone().add(new THREE.Vector3(0, -.6, 0)), center, trunkRadius * .4, PLANT_PAINT.trunk);
      const canopyColor = flowering && cluster % 3 !== 1 ? (key === 'ipe-yellow' ? ['#DCA823', '#E9BC43', '#C8A33C'][cluster % 3] : '#D97F9F') :
        broad && cluster < 6 ? (cluster % 2 ? '#E8483C' : '#E76F51') :
          cluster % 3 === 0 ? PLANT_PAINT.foliageLight :
            cluster % 3 === 1 ? PLANT_PAINT.foliageMid : PLANT_PAINT.foliageCore;
      const color = new THREE.Color(canopyColor);
      const bulk = far ? 1.12 : 1;
      piece(crowns[lod], color, center, new THREE.Vector3(radius * (broad ? .76 : .69) * bulk,
        radius * (broad ? .28 : .49) * bulk, radius * (broad ? .76 : .66) * bulk), 1);
      // Small leaves at crown edges add detail without filling the view with cards.
      for (let spray = 0; spray < (far ? distant ? 0 : 4 : 20); spray++) {
        const a = angle + spray * 2.399;
        const elevation = Math.sin(spray * 1.71) * .29;
        const root = center.clone().add(new THREE.Vector3(Math.cos(a) * radius * .56, radius * elevation, Math.sin(a) * radius * .56));
        const tip = root.clone().add(new THREE.Vector3(Math.cos(a) * (.25 + spray % 3 * .07), .03 + elevation * .22, Math.sin(a) * (.25 + spray % 3 * .07)));
        const leafColor = flowering || broad ? canopyColor : spray % 3 ? PLANT_PAINT.foliageMid : PLANT_PAINT.foliageLight;
        leaf(root, tip, .09 + spray % 3 * .018, leafColor);
      }
      if (!far && seed % 3 === 0 && cluster < 5) {
        for (let fruit = 0; fruit < 3; fruit++) piece(coconut, '#e8a145', center.clone().add(new THREE.Vector3(
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
    const templateKind = type === 'grass' || type === 'reeds' ? 0 : type === 'palm' || type === 'banana' ? 2 : 1;
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
    const key = `${species(object)}:${Math.floor(object.pos.x / 32)}:${Math.floor(object.pos.z / 32)}`;
    const bucket = cells.get(key) || [];
    bucket.push(object); cells.set(key, bucket);
  }
  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3(), instanceScale = new THREE.Vector3();
  const instanceRotation = new THREE.Quaternion(), yawRotation = new THREE.Quaternion();
  const leanAxis = new THREE.Vector3();
  const instances: THREE.InstancedMesh[] = [];
  const makeInstances = (geometry: THREE.BufferGeometry, count: number, material: THREE.Material,
    objects: MapObject[], cx: number, cz: number, templateHeight: number, shadow = false) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    objects.forEach((object, index) => {
      instancePosition.set(object.pos.x - cx, object.pos.y, object.pos.z - cz);
      const heightScale = object.scale.y / templateHeight;
      if (shadow) instanceScale.setScalar(heightScale);
      else if (object.kind === 'grass') {
        const bladeCap = object.detail === 'reeds' ? 1.6 : .42;
        instanceScale.set(1, Math.min(bladeCap, object.scale.y) / Math.min(bladeCap, templateHeight), 1);
      } else {
        const templateRadius = object.kind === 'palm' ? .13 + templateHeight * .009 :
          object.detail === 'banana' ? .13 : .15 + templateHeight * .015;
        const targetRadius = trunkRadii.get(positionKey(object.pos.x, object.pos.z)) ??
          (object.kind === 'palm' ? .13 + object.scale.y * .009 : .15 + object.scale.y * .015);
        instanceScale.set(targetRadius / templateRadius, heightScale, targetRadius / templateRadius);
      }
      // Most authored landmark trees have no rotation. Give each a stable
      // orientation so instancing does not reveal identical neighbouring crowns.
      const rotation = object.rotation ?? hash(Math.round(object.pos.x * 100), Math.round(object.pos.z * 100)) * Math.PI * 2;
      yawRotation.setFromAxisAngle(up, rotation);
      if (object.kind === 'palm') {
        const salt = Math.round(object.pos.x * 100) ^ Math.round(object.pos.z * 100);
        const coast = object.pos.y < 2.2;
        const direction = coast ? Math.atan2(-object.pos.z, -object.pos.x) +
          (hash(salt, 3) - .5) * .7 : hash(salt, 4) * Math.PI * 2;
        const lean = THREE.MathUtils.degToRad(3 + hash(salt, 5) * 9);
        leanAxis.set(Math.sin(direction), 0, -Math.cos(direction));
        instanceRotation.setFromAxisAngle(leanAxis, lean).multiply(yawRotation);
      } else instanceRotation.copy(yawRotation);
      mesh.setMatrixAt(index, instanceMatrix.compose(instancePosition, instanceRotation, instanceScale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    instances.push(mesh);
    return mesh;
  };
  for (const [key, objects] of cells) {
    const [type, cellX, cellZ] = key.split(':');
    const cx = (Number(cellX) + .5) * 32, cz = (Number(cellZ) + .5) * 32;
    const nearGeometry = merged.get(`${type}:0`)!;
    const farGeometry = merged.get(`${type}:1`), distantGeometry = merged.get(`${type}:2`);
    const templateHeight = specimens.get(type)!.scale.y;
    const near = makeInstances(nearGeometry, objects.length, material, objects, cx, cz, templateHeight);
    near.receiveShadow = true;
    const node = new THREE.LOD(); node.name = `vegetation:${key}`; node.position.set(cx, 0, cz);
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
  stem.dispose(); crowns.forEach(g => g.dispose()); coconut.dispose(); trunkRing.dispose();
  return { group, update(time: number) { breeze.value = time; },
    dispose() { instances.forEach(mesh => mesh.dispose()); merged.forEach(g => g.dispose());
      shadowTree.dispose(); shadowPalm.dispose(); material.dispose(); shadowProxy.dispose(); } };
}
