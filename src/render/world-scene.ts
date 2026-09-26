import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { AssetLoader } from './assets';
import { PaintedWater } from './water';
import { createToonMaterial, type ToonMaterialKind } from './materials';
import { roadPaintWeight, terrainHeight, WORLD_PALETTE } from '../shared/terrain';
import { ARENA, ROADS } from '../shared/layout';
import { buildVegetation } from './vegetation';
import { createIslandBackdrop } from './island-backdrop';
import { createStreetDressing } from './street-dressing';
import { createWaterfalls } from './waterfall';
import { RecreationView } from './recreation';
import { GroundCover } from './ground-cover';
import { createKit, type KitScene } from './kit';
import { releaseAfterUpload } from './memory';
import { buildProps } from './props';
import { buildWallArt } from './wall-art';
import { textSignMaterial, twoSidedTextSign } from './signage';
import { SIGN_ART } from '../shared/signage';
import type { ActorState, MapObject, Settings, Vec3, WorldSpec } from '../shared/types';

const c = (value: string | number) => new THREE.Color(value);
const box = new THREE.BoxGeometry(1, 1, 1);
const softBox = new RoundedBoxGeometry(1, 1, 1, 1, .055);
const chamferBox = new RoundedBoxGeometry(1, 1, 1, 1, .18);
const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 12);
const cone = new THREE.ConeGeometry(.5, 1, 12);
const sphere = new THREE.IcosahedronGeometry(.5, 2);
const cliffFace = (() => {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 8, 6, 3);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    // Break the silhouette into weathered strata while staying inside the
    // shared collision volume. Matching coordinates keep face seams closed.
    const strata = .018 + .018 * Math.sin(y * 38 + x * 9);
    vertices.setXYZ(i, x * (.94 - strata), y > .3 ? y - .035 * (1 + Math.sin(x * 23 + z * 8)) : y,
      z * (.89 - strata - .07 * Math.pow(Math.abs(x) * 2, 4)));
  }
  geometry.computeVertexNormals(); return geometry;
})();
const thinCone = new THREE.ConeGeometry(.5, 1, 7);
const bentBlade = new THREE.ConeGeometry(.055, .45, 3).translate(0, .225, 0);
type Surface = 'earth' | 'sand' | 'plaster' | 'brick' | 'stone' | 'timber' | 'cover-wood' | 'bark' | 'metal' | 'roof' | 'road' | 'leaf' | 'fabric';
const tileMeters: Record<Surface, number> = {
  earth: 2, sand: 2, plaster: 1.8, brick: 3, stone: 1.5, timber: 2, 'cover-wood': 2, bark: 1.9,
  metal: 2, roof: 4, road: 2.3, leaf: 2, fabric: 2,
};
const roughness: Record<Surface, number> = { earth: 1, sand: 1, plaster: 1, brick: 1, stone: 1, timber: 1, 'cover-wood': 1,
  bark: 1, metal: .85, roof: 1, road: 1, leaf: .88, fabric: .96 };
const hash = (x: number, y: number, salt: number) => {
  let n = Math.imul(x + salt * 17, 374761393) + Math.imul(y - salt * 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const boatHull = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-.5, -.32); shape.lineTo(-.4, .27); shape.quadraticCurveTo(0, .5, .4, .27);
  shape.lineTo(.5, -.32); shape.quadraticCurveTo(0, -.52, -.5, -.32);
  const g = new THREE.ExtrudeGeometry(shape, { depth: .26, bevelEnabled: true, bevelSize: .08, bevelThickness: .08, bevelSegments: 1, steps: 1, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, -.13, 0);
  return g;
})();

function coloredGeometry(geometry: THREE.BufferGeometry, color: THREE.Color, position: THREE.Vector3, scale: THREE.Vector3, rotation = 0, tile = 2.5): THREE.BufferGeometry {
  const result = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), scale);
  result.applyMatrix4(matrix);
  return paintGeometry(result, color, tile);
}

function paintGeometry(result: THREE.BufferGeometry, color: THREE.Color, tile: number): THREE.BufferGeometry {
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  const colors = new Float32Array(result.getAttribute('position').count * 3);
  const uvs = new Float32Array(result.getAttribute('position').count * 2);
  const positions = result.getAttribute('position'), normals = result.getAttribute('normal');
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
  }
  for (let i = 0; i < positions.count; i++) {
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (ny >= nx && ny >= nz) { uvs[i * 2] = x / tile; uvs[i * 2 + 1] = z / tile; }
    else if (nx >= nz) { uvs[i * 2] = z / tile; uvs[i * 2 + 1] = y / tile; }
    else { uvs[i * 2] = x / tile; uvs[i * 2 + 1] = y / tile; }
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  result.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return result;
}

const branchShape = new THREE.CylinderGeometry(.56, 1, 1, 6, 1);
const UP = new THREE.Vector3(0, 1, 0);
function roofGeometry(detail: string | undefined): THREE.BufferGeometry {
  const gable = detail === 'gable' || detail === 'market-awning' || detail === 'thatch';
  const vertices = gable ? [
    -.5, 0, -.5, .5, 0, -.5, 0, 1, -.5,
    -.5, 0, .5, 0, 1, .5, .5, 0, .5,
    -.5, 0, -.5, 0, 1, -.5, 0, 1, .5,
    -.5, 0, -.5, 0, 1, .5, -.5, 0, .5,
    .5, 0, -.5, .5, 0, .5, 0, 1, .5,
    .5, 0, -.5, 0, 1, .5, 0, 1, -.5,
    -.5, 0, -.5, -.5, 0, .5, .5, 0, .5,
    -.5, 0, -.5, .5, 0, .5, .5, 0, -.5,
  ] : [
    -.5, 0, -.5, .5, 0, -.5, 0, 1, 0,
    .5, 0, -.5, .5, 0, .5, 0, 1, 0,
    .5, 0, .5, -.5, 0, .5, 0, 1, 0,
    -.5, 0, .5, -.5, 0, -.5, 0, 1, 0,
    -.5, 0, -.5, -.5, 0, .5, .5, 0, .5,
    -.5, 0, -.5, .5, 0, .5, .5, 0, -.5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
const hipRoof = roofGeometry('hip');
const gableRoof = roofGeometry('gable');

function terrainGeometry(world: WorldSpec): THREE.BufferGeometry {
  const size = world.size, steps = Math.round(world.size / 2), stride = size / steps;
  const positions: number[] = [], uvs: number[] = [], slopes: number[] = [], roadPaint: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix <= steps; ix++) {
    const x = -size / 2 + ix * stride, z = -size / 2 + iz * stride, y = terrainHeight(x, z);
    const slope = Math.hypot(terrainHeight(x + 2, z) - terrainHeight(x - 2, z),
      terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) / 4;
    positions.push(x, y, z); uvs.push(x / size + .5, z / size + .5); slopes.push(slope);
    roadPaint.push(roadPaintWeight(x, z, y, slope));
    if (ix < steps && iz < steps) {
      const a = iz * (steps + 1) + ix, b = a + 1, d = a + steps + 1;
      indices.push(a, d, b, b, d, d + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('terrainSlope', new THREE.Float32BufferAttribute(slopes, 1));
  geo.setAttribute('terrainRoadPaint', new THREE.Float32BufferAttribute(roadPaint, 1));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

function waterNormalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!, pixels = context.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = x / 256 * Math.PI * 2, v = y / 256 * Math.PI * 2;
    const dx = Math.cos(u * 5 + v * 2) * .36 + Math.cos(u * 11 - v * 7) * .13;
    const dy = Math.cos(v * 6 - u * 2) * .32 + Math.cos(v * 13 + u * 5) * .12;
    const i = (y * 256 + x) * 4;
    pixels.data[i] = 128 + dx * 80; pixels.data[i + 1] = 128 + dy * 80;
    pixels.data[i + 2] = 245; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(220, 220); texture.anisotropy = 4;
  return texture;
}

function surfaceOf(object: MapObject, collider: Map<string, string>): Surface {
  const { kind, detail } = object;
  if (kind === 'grass' || kind === 'palm' || kind === 'tree') return 'leaf';
  if (kind === 'roof') return detail === 'market-awning' ? 'fabric' : 'roof';
  if (kind === 'rock' || detail === 'floor' || detail === 'stair' || detail === 'bridge-stone' || detail === 'cliff' || detail === 'fountain') return 'stone';
  if (detail === 'path' || detail === 'stair-path') return 'road';
  if (detail === 'boardwalk' || detail === 'pier' || detail === 'shutter' || detail === 'window-frame' || detail === 'door-frame' ||
    detail === 'window-cross' || detail === 'fence' || detail === 'post' || detail === 'table' || detail === 'crate') return 'timber';
  if (detail === 'container' || detail === 'container-rib' || detail === 'crane' || detail === 'crane-arm' ||
    detail === 'pump' || detail === 'canopy-post' || detail === 'truck' || detail === 'silo' || detail === 'wheel' ||
    detail === 'radio-mast' || detail === 'rust' || detail === 'beacon') return 'metal';
  if (detail === 'sofa' || detail === 'umbrella') return 'fabric';
  const physical = collider.get(object.id);
  if (detail === 'wall' && physical === 'stone' && object.pos.x > 28 && object.pos.x < 82 && object.pos.z > -62 && object.pos.z < -10) return 'brick';
  return physical === 'wood' ? 'timber' : physical === 'metal' ? 'metal' : kind === 'box' ? 'plaster' : 'stone';
}

export class WorldScene {
  readonly group = new THREE.Group();
  readonly arenaBoundary = new THREE.Group();
  readonly water: THREE.Mesh;
  readonly ready: Promise<void>;
  private readonly kit: KitScene;
  private readonly paintedWater: PaintedWater;
  private readonly smallWaterNormals: THREE.CanvasTexture;
  private readonly waterfalls: ReturnType<typeof createWaterfalls>;
  private readonly recreation: RecreationView;
  private readonly vegetation: ReturnType<typeof buildVegetation>;
  private readonly groundCover: GroundCover;
  private reducedMotion = false;
  private readonly disposables: { dispose: () => void }[] = [];

  constructor(world: WorldSpec, settings: Settings, loader: AssetLoader, onAssetsReady: () => void = () => {}) {
    this.recreation = new RecreationView(world, loader, settings.graphics); this.group.add(this.recreation.group);
    this.kit = createKit(this.group, loader, (world.pieces ?? []).filter(piece => !this.recreation.pieceIds.has(piece.id)), settings.graphics);
    this.ready = Promise.all([this.kit.ready, this.recreation.ready]).then(() => {});
    void this.ready.catch(() => {});
    this.disposables.push(this.recreation, this.kit);
    const signAtlas = loader.texture('textures/island-signs.png');
    signAtlas.colorSpace = THREE.SRGBColorSpace;
    signAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    signAtlas.magFilter = THREE.LinearFilter;
    const signMaterial = textSignMaterial(signAtlas);
    this.disposables.push(signAtlas, signMaterial);
    void loader.ready().then(onAssetsReady, () => {});
    const kinds: Record<Surface, ToonMaterialKind> = {
      earth: 'terrain', sand: 'terrain', plaster: 'plaster', brick: 'stone', stone: 'stone',
      timber: 'wood', 'cover-wood': 'wood', bark: 'wood', metal: 'painted-metal', roof: 'stone', road: 'stone', leaf: 'foliage', fabric: 'fabric',
    };
    const materialFor = (surface: Surface) => {
      const material = createToonMaterial(kinds[surface], {
        vertexColors: true, roughness: roughness[surface],
        side: surface === 'leaf' || surface === 'fabric' || surface === 'roof' ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (surface === 'cover-wood') {
        // Resolve the shadow once beside the base, outside the cover's own
        // silhouette. Tree/roof shadows remain, without unresolved slat stripes.
        material.onBeforeCompile = shader => {
          shader.vertexShader = `attribute vec3 coverShadowPoint;\n${shader.vertexShader}`.replace(
            '#include <shadowmap_vertex>', `#include <shadowmap_vertex>
              #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                #pragma unroll_loop_start
                for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
                  vDirectionalShadowCoord[i] = directionalShadowMatrix[i] * vec4(coverShadowPoint, 1.0);
                }
                #pragma unroll_loop_end
              #endif`);
        };
        material.customProgramCacheKey = () => 'painted-cover-base-shadow-v1';
      }
      return material;
    };
    const groundColors = loader.texture('textures/terrain-color.png');
    groundColors.colorSpace = THREE.SRGBColorSpace;
    groundColors.minFilter = THREE.LinearMipmapLinearFilter;
    groundColors.magFilter = THREE.LinearFilter;
    groundColors.generateMipmaps = true;
    this.disposables.push(groundColors);
    const groundMaterial = createToonMaterial('terrain', { map: groundColors, roughness: 1 });
    groundMaterial.customProgramCacheKey = () => `terrain-ground-grass-response-v12:${ROADS.length}`;
    groundMaterial.onBeforeCompile = shader => {
      shader.uniforms.terrainRoads = { value: ROADS.map(([x0, z0, x1, z1]) => new THREE.Vector4(x0, z0, x1, z1)) };
      shader.uniforms.terrainAsphalt = { value: new THREE.Color(WORLD_PALETTE.road) };
      shader.uniforms.terrainCurb = { value: new THREE.Color(WORLD_PALETTE.curb) };
      shader.uniforms.terrainGrass = { value: new THREE.Color(WORLD_PALETTE.grass) };
      shader.uniforms.terrainGrassLight = { value: new THREE.Color(WORLD_PALETTE.grassLight) };
      shader.uniforms.terrainDryGrass = { value: new THREE.Color(WORLD_PALETTE.dryGrass) };
      shader.uniforms.terrainSand = { value: new THREE.Color(WORLD_PALETTE.sand) };
      shader.uniforms.terrainSandLight = { value: new THREE.Color(WORLD_PALETTE.sandLight) };
      shader.uniforms.terrainRockPaint = { value: new THREE.Color(WORLD_PALETTE.rock) };
      shader.uniforms.terrainRockTop = { value: new THREE.Color(WORLD_PALETTE.rockTop) };
      shader.uniforms.terrainMorroLight = { value: new THREE.Color('#D8C8AA') };
      shader.uniforms.terrainMorroMid = { value: new THREE.Color('#BBAE98') };
      shader.uniforms.terrainMorroJoint = { value: new THREE.Color('#9E8F7A') };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        attribute float terrainSlope;
        attribute float terrainRoadPaint;
        varying float vTerrainSlope;
        varying float vTerrainRoadPaint;
        varying vec2 vTerrainXZ;
        varying float vTerrainWorldY;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vTerrainSlope = terrainSlope;
        vTerrainRoadPaint = terrainRoadPaint;
        vTerrainXZ = (modelMatrix * vec4(position, 1.0)).xz;
        vTerrainWorldY = (modelMatrix * vec4(position, 1.0)).y;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        varying float vTerrainSlope;
        varying float vTerrainRoadPaint;
        varying vec2 vTerrainXZ;
        varying float vTerrainWorldY;
        uniform vec4 terrainRoads[${ROADS.length}];
        uniform vec3 terrainAsphalt;
        uniform vec3 terrainCurb;
        uniform vec3 terrainGrass;
        uniform vec3 terrainGrassLight;
        uniform vec3 terrainDryGrass;
        uniform vec3 terrainSand;
        uniform vec3 terrainSandLight;
        uniform vec3 terrainRockPaint;
        uniform vec3 terrainRockTop;
        uniform vec3 terrainMorroLight;
        uniform vec3 terrainMorroMid;
        uniform vec3 terrainMorroJoint;
        float terrainHash(vec2 cell) {
          return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
        }
        float terrainNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 blend = fract(point);
          blend = blend * blend * (3.0 - 2.0 * blend);
          return mix(mix(terrainHash(cell), terrainHash(cell + vec2(1.0, 0.0)), blend.x),
            mix(terrainHash(cell + vec2(0.0, 1.0)), terrainHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
        }
        float terrainFbm(vec2 point) {
          return terrainNoise(point) * 0.6 + terrainNoise(point * 2.1 + vec2(5.2, 1.3)) * 0.28 +
            terrainNoise(point * 4.3 + vec2(9.1, 3.7)) * 0.12;
        }
        float terrainRectDistance(vec2 point, vec4 rect) {
          vec2 center = (rect.xy + rect.zw) * 0.5;
          vec2 halfSize = (rect.zw - rect.xy) * 0.5;
          vec2 outside = abs(point - center) - halfSize;
          return length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
        }
      `).replace('#include <map_fragment>', `
        #include <map_fragment>
        float distanceToRoad = 1e6;
        for (int road = 0; road < ${ROADS.length}; road++)
          distanceToRoad = min(distanceToRoad, terrainRectDistance(vTerrainXZ, terrainRoads[road]));
        float edgeWidth = max(fwidth(distanceToRoad), 0.002);
        float roadInterior = 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToRoad);
        float roadPaint = clamp(vTerrainRoadPaint, 0.0, 1.0);
        float asphaltMask = roadInterior * roadPaint;
        float curbMask = (1.0 - smoothstep(0.4 - edgeWidth, 0.4 + edgeWidth, distanceToRoad)) * (1.0 - roadInterior) * roadPaint;
        float broadWear = terrainFbm(vTerrainXZ / 18.0 + vec2(6.0, 19.0));
        float fineWear = terrainNoise(vTerrainXZ / 3.8 + vec2(23.0, 7.0));
        vec3 curbPaint = terrainCurb * (.97 + fineWear * .07 + broadWear * .03);
        diffuseColor.rgb = mix(diffuseColor.rgb, curbPaint, curbMask);
        // Rounded, staggered stone courses use world metres. Their joints and
        // individual washes fade before becoming a distant checker pattern.
        vec2 pavingUV = vTerrainXZ / vec2(.82, .54);
        float pavingDetail = 1.0 - smoothstep(.1, .55, max(fwidth(pavingUV.x), fwidth(pavingUV.y)));
        float pavingRow = floor(pavingUV.y);
        pavingUV.x += mod(pavingRow, 2.0) * .5 + sin(pavingRow * 2.19) * .09;
        vec2 pavingCell = floor(pavingUV);
        float stoneWash = terrainHash(pavingCell + vec2(8.0, 19.0));
        float cornerRadius = .13 + stoneWash * .025;
        vec2 stoneEdge = abs(fract(pavingUV) - .5) - vec2(.5 - cornerRadius);
        float stoneDistance = length(max(stoneEdge, 0.0)) + min(max(stoneEdge.x, stoneEdge.y), 0.0) - cornerRadius;
        float stoneAA = max(fwidth(stoneDistance), .001);
        float stoneFace = 1.0 - smoothstep(-.03 - stoneAA, -.03 + stoneAA, stoneDistance);
        float wornEdge = smoothstep(-.11, -.035, stoneDistance);
        vec3 pavingPaint = terrainAsphalt * (.97 + stoneWash * .045 + fineWear * .035 + wornEdge * .07);
        pavingPaint = mix(terrainAsphalt * .62, pavingPaint, stoneFace);
        pavingPaint = mix(terrainAsphalt * (.98 + broadWear * .06), pavingPaint, pavingDetail);
        diffuseColor.rgb = mix(diffuseColor.rgb, pavingPaint, asphaltMask);
        // Authored stone is albedo, so it receives the same sun and shadows
        // as grass. Lake banks retain their painted grass/sand substrate.
        float coastRadius = max(abs(vTerrainXZ.x), abs(vTerrainXZ.y)) * 0.65 + length(vTerrainXZ) * 0.35;
        float coastalRock = smoothstep(110.0, 113.0, coastRadius);
        float rockMask = max(smoothstep(1.03, 1.13, vTerrainSlope),
          coastalRock * smoothstep(0.55, 0.7, vTerrainSlope));
        vec3 terrainPoint=vec3(vTerrainXZ.x,vTerrainWorldY,vTerrainXZ.y);
        vec3 triWeights=abs(normalize(cross(dFdx(terrainPoint),dFdy(terrainPoint))));
        triWeights/=max(dot(triWeights,vec3(1.0)),.001);
        float rockWash=dot(triWeights,vec3(terrainFbm(terrainPoint.yz/3.5),terrainFbm(terrainPoint.xz/3.5),terrainFbm(terrainPoint.xy/3.5)));
        vec3 rockPaint=mix(terrainRockPaint,terrainRockTop,smoothstep(-.3,.3,rockWash))*(.97+rockWash*.1);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockPaint, rockMask * (1.0 - asphaltMask - curbMask));
        // Fine sand detail is expressed in metres, independent of the colour
        // map resolution. Filter the ripples analytically at grazing distance.
        float sandRatio=diffuseColor.r/max(diffuseColor.b,.001);
        float sandMask=smoothstep(1.35,1.9,sandRatio)*(1.0-smoothstep(.4,.7,vTerrainSlope))*(1.0-asphaltMask-curbMask);
        float ripplePhase=dot(vTerrainXZ,vec2(5.8,2.7))+terrainFbm(vTerrainXZ/2.0)*2.8;
        float ripple=sin(ripplePhase)*(1.0-smoothstep(.5,2.5,fwidth(ripplePhase)));
        float sandWash=terrainFbm(vTerrainXZ/4.0)*.08+terrainFbm(vTerrainXZ/.8)*.025;
        float wet=1.0-smoothstep(.02,.65,vTerrainWorldY);
        vec3 sandPaint=diffuseColor.rgb*(1.0+sandWash+ripple*.035)*(1.0-wet*.2);
        diffuseColor.rgb=mix(diffuseColor.rgb,sandPaint,sandMask);
        // Broad paint weights preserve filtered sand/grass edges.
        float grassResponse = smoothstep(1.0, 1.45, diffuseColor.g / max(diffuseColor.r, 0.001)) *
          smoothstep(1.1, 2.0, diffuseColor.g / max(diffuseColor.b, 0.001));
        float paintedPatch=terrainFbm(vTerrainXZ/8.0+vec2(3.0,9.0));
        float dryFleck=smoothstep(.12,.4,terrainFbm(vTerrainXZ/18.0+vec2(13.0,2.0)));
        vec3 variedGrass=diffuseColor.rgb*(.93+paintedPatch*.16);
        variedGrass=mix(variedGrass,variedGrass*vec3(1.13,1.015,.82),dryFleck*.5);
        diffuseColor.rgb=mix(diffuseColor.rgb,variedGrass,grassResponse);
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.24,sandMask*wet);`);
    };
    const ground = new THREE.Mesh(terrainGeometry(world), groundMaterial);
    ground.receiveShadow = true; this.group.add(ground); this.disposables.push(ground.geometry, ground.material as THREE.Material);
    const backdrop = createIslandBackdrop(world); this.group.add(backdrop.mesh); this.disposables.push(backdrop);
    const street = createStreetDressing(world); this.group.add(street.group); this.disposables.push(street);
    this.waterfalls = createWaterfalls(world, settings.graphics); this.group.add(this.waterfalls.group); this.disposables.push(this.waterfalls);

    this.paintedWater = new PaintedWater(world, ground.geometry, loader.maxAnisotropy);
    this.water = this.paintedWater.mesh;
    this.group.add(this.water, this.paintedWater.contacts); this.disposables.push(this.paintedWater);
    this.smallWaterNormals = waterNormalTexture(); this.smallWaterNormals.repeat.set(3, 5);
    this.disposables.push(this.smallWaterNormals);

    const surfaceBindings = new Map<Surface, { material: THREE.MeshStandardMaterial; id: number; cast: boolean; receive: boolean }>();
    const materialVariants = new Map<string, { material: THREE.MeshStandardMaterial; id: number; cast: boolean; receive: boolean }>();
    const buckets = new Map<string, { binding: { material: THREE.MeshStandardMaterial; cast: boolean; receive: boolean }; parts: THREE.BufferGeometry[] }>();
    const stash = (surface: Surface, geometry: THREE.BufferGeometry, x: number, z: number) => {
      // 64 m cells: few enough draw calls from the plane, still culled on the ground.
      let binding = surfaceBindings.get(surface);
      if (!binding) {
        const candidate = materialFor(surface);
        const cast = surface !== 'leaf' && surface !== 'earth' && surface !== 'sand' && surface !== 'road';
        const receive = surface !== 'leaf';
        const signature = [candidate.map?.uuid, candidate.normalMap?.uuid, candidate.roughnessMap?.uuid,
          candidate.normalScale.x, candidate.normalScale.y, candidate.roughness, candidate.metalness,
          candidate.side, candidate.customProgramCacheKey(), cast, receive].join(':');
        binding = materialVariants.get(signature);
        if (binding) candidate.dispose();
        else {
          binding = { material: candidate, id: materialVariants.size, cast, receive };
          materialVariants.set(signature, binding);
          this.disposables.push(candidate);
        }
        surfaceBindings.set(surface, binding);
      }
      const key = `${binding.id}:${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
      const bucket = buckets.get(key) || { binding, parts: [] };
      bucket.parts.push(geometry); buckets.set(key, bucket);
    };
    const colliderMaterials = new Map(world.colliders.map(collider => [collider.id, collider.material]));
    const pathObjects = world.objects.filter(object => object.detail === 'path');
    const urban = world.districts.filter(district => district.id === 'vila' || district.id === 'centro' || district.id === 'posto');
    const cascadeMaterial = new THREE.MeshPhysicalMaterial({ color: '#91bdc0', emissive: '#2d777b', emissiveIntensity: .16,
      roughness: .14, metalness: .02, normalMap: this.smallWaterNormals, normalScale: new THREE.Vector2(.2, .4),
      clearcoat: 1, transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide });
    this.disposables.push(cascadeMaterial);
    const add = (surface: Surface, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0) => {
      const tint = c(color);
      const painted = coloredGeometry(geometry, tint, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation, tileMeters[surface]);
      if (surface === 'cover-wood') {
        const cosine = Math.abs(Math.cos(rotation)), sine = Math.abs(Math.sin(rotation));
        // The fixed sun is northwest (-70,55,-30). Sample just beyond that
        // corner so the box and projecting rails cannot shadow their own probe.
        const px = x - (sx * cosine + sz * sine) / 2 - .15;
        const pz = z - (sz * cosine + sx * sine) / 2 - .15;
        const count = painted.getAttribute('position').count, points = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) { points[i * 3] = px; points[i * 3 + 1] = y - sy / 2 + .08; points[i * 3 + 2] = pz; }
        painted.setAttribute('coverShadowPoint', new THREE.BufferAttribute(points, 3));
      }
      stash(surface, painted, x, z);
    };
    const addBranch = (from: THREE.Vector3, to: THREE.Vector3, radius: number, tint: string, surface: Surface = 'bark') => {
      const direction = to.clone().sub(from), length = direction.length();
      const midpoint = from.clone().add(to).multiplyScalar(.5);
      const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
      const geometry = branchShape.toNonIndexed();
      geometry.applyMatrix4(new THREE.Matrix4().compose(midpoint, rotation, new THREE.Vector3(radius, length, radius)));
      stash(surface, paintGeometry(geometry, c(tint).lerp(c('#ffffff'), .15), tileMeters[surface]), midpoint.x, midpoint.z);
    };
    const glassPanels: THREE.BufferGeometry[] = [];
    const glass = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      glassPanels.push(coloredGeometry(box, c('#b9ced0'), new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz)));
    const decorateHouse = (roof: MapObject) => {
      const x = roof.pos.x, z = roof.pos.z, y = roof.pos.y - 3.1;
      const w = roof.scale.x - .65, d = roof.scale.z - .65;
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      const plinth = '#a69882';
      for (const side of [-1, 1]) {
        const faceZ = side > 0 ? z1 : z0;
        const doorX = side > 0 ? x - w * .18 : x + w * .2;
        const windowX = side > 0 ? x + w * .25 : x - w * .24;
        const leftEnd = doorX - 1.07, rightStart = doorX + 1.07;
        if (leftEnd > x0) add('stone', box, plinth, (x0 + leftEnd) / 2, y + .14, faceZ + side * .085,
          leftEnd - x0, .28, .19);
        if (x1 > rightStart) add('stone', box, plinth, (rightStart + x1) / 2, y + .14, faceZ + side * .085,
          x1 - rightStart, .28, .19);
        add('stone', softBox, '#baa98c', doorX, y + .045, faceZ + side * .58, 2.2, .09, .86);
        add('timber', softBox, '#79573d', doorX + 1.52, y + 1.15, faceZ + side * .18, .82, 2.23, .065,
          side * .12);
        add('timber', box, '#b99570', doorX + 1.52, y + .32, faceZ + side * .23, .72, .075, .035);
        add('timber', box, '#b99570', doorX + 1.52, y + 1.93, faceZ + side * .23, .72, .075, .035);
        add('metal', sphere, '#bba678', doorX + 1.24, y + 1.15, faceZ + side * .28, .09, .09, .09);
        add('roof', softBox, '#a46f56', doorX, y + 2.62, faceZ + side * .42, 2.35, .095, .72);
        for (const bracket of [-.88, .88]) add('timber', box, '#765944', doorX + bracket, y + 2.43,
          faceZ + side * .28, .07, .35, .35);
        glass(windowX, y + 1.53, faceZ, 1.24, 1.18, .018);
        add('stone', softBox, '#d4c8aa', windowX, y + .81, faceZ + side * .15, 1.72, .1, .36);
        add('plaster', box, '#d5cfbb', windowX, y + 2.27, faceZ + side * .12, 1.67, .08, .32);
        add('metal', box, '#969589', doorX - 1.26, y + 2.02, faceZ + side * .19, .17, .25, .23);
        add('metal', box, '#c5a777', doorX - 1.26, y + 1.94, faceZ + side * .34, .11, .045, .1);
      }
      for (const side of [-1, 1]) {
        const faceX = side > 0 ? x1 : x0;
        add('stone', box, plinth, faceX + side * .085, y + .14, z, .19, .28, d);
        glass(faceX, y + 1.53, z, .018, 1.18, 1.22);
        add('stone', softBox, '#d4c8aa', faceX + side * .15, y + .81, z, .36, .1, 1.72);
        add('plaster', box, '#d5cfbb', faceX + side * .12, y + 2.27, z, .32, .08, 1.67);
        for (const shutterSide of [-1, 1]) {
          const shutterZ = z + shutterSide * .89;
          add('timber', box, '#79917b', faceX + side * .18, y + 1.53, shutterZ, .085, 1.32, .29);
          for (let slat = 0; slat < 5; slat++) add('timber', box, '#b6bda0', faceX + side * .24,
            y + 1.12 + slat * .2, shutterZ, .026, .026, .25);
        }
      }
      for (const side of [-1, 1]) {
        const edgeZ = z + side * roof.scale.z / 2;
        add('metal', box, '#7c7770', x, roof.pos.y - .045, edgeZ, roof.scale.x, .085, .13);
        add('metal', cylinder, '#77776e', x1 - .2, y + 1.55, edgeZ + side * .015, .09, 2.95, .09);
      }
      for (const side of [-1, 1]) add('metal', box, '#7c7770', x + side * roof.scale.x / 2,
        roof.pos.y - .045, z, .13, .085, roof.scale.z);
      add('metal', softBox, '#929b91', x1 + .13, y + 1.2, z + d * .23, .18, .5, .38);
      add('metal', cylinder, '#a2a69a', x1 + .14, y + .48, z + d * .23, .035, .95, .035);
    };
    for (const object of world.objects) {
      const { kind, pos, scale, color, detail, rotation = 0 } = object;
      if (detail?.startsWith('prop:') || detail === 'distant-island' || kind === 'palm' || kind === 'tree' || kind === 'grass') continue;
      if (detail === 'waterfall') continue;
      if (detail === 'water') {
        const geometry = cylinder.clone(); geometry.scale(scale.x, scale.y, scale.z);
        const basin = new THREE.Mesh(geometry, cascadeMaterial);
        basin.position.set(pos.x, pos.y, pos.z); this.group.add(basin); this.disposables.push(geometry);
        continue;
      }
      if (kind === 'sign') {
        const atlasIndex = SIGN_ART.findIndex(sign => sign.label === detail);
        if (atlasIndex < 0) throw new Error(`Unapproved island sign: ${detail}`);
        const board = twoSidedTextSign(scale.x, scale.y * .62, signMaterial, SIGN_ART[atlasIndex].accent, atlasIndex);
        board.group.position.set(pos.x, pos.y + .4, pos.z); board.group.rotation.y = rotation; this.group.add(board.group);
        const boardBottom = board.group.position.y - scale.y * .31;
        const postMaterial = new THREE.MeshStandardMaterial({ color: '#8A5E3C', roughness: 1 });
        for (const side of [-1, 1]) {
          const offset = side * (scale.x / 2 - .24);
          const postX = pos.x + Math.cos(rotation) * offset;
          const postZ = pos.z - Math.sin(rotation) * offset;
          const groundY = terrainHeight(postX, postZ);
          const postHeight = Math.max(.1, boardBottom - groundY);
          const postGeometry = new THREE.BoxGeometry(.08, postHeight, .08);
          const post = new THREE.Mesh(postGeometry, postMaterial);
          post.position.set(postX, groundY + postHeight / 2, postZ);
          post.rotation.y = rotation;
          this.group.add(post); this.disposables.push(postGeometry);
        }
        this.disposables.push(board.geometry, board.edgeGeometry, board.edgeMaterial, postMaterial);
        continue;
      }
      if (kind === 'lamp') {
        add('metal', cylinder, '#665c4a', pos.x, pos.y + scale.y * .5, pos.z, .16, scale.y, .16);
        add('plaster', sphere, '#f6ce83', pos.x, pos.y + scale.y + .12, pos.z, .6, .4, .6);
        add('metal', cone, '#5d6254', pos.x, pos.y + scale.y + .45, pos.z, .8, .35, .8);
        continue;
      }
      if (kind === 'boat') {
        add('timber', boatHull, color, pos.x, pos.y, pos.z, scale.x, scale.y, scale.z, rotation);
        add('timber', box, '#735c42', pos.x, pos.y + .42, pos.z, scale.x * .52, .06, scale.z * .55, rotation);
        add('timber', cylinder, '#897153', pos.x, pos.y + 1.2, pos.z, .09, 2.1, .09);
        add('fabric', thinCone, '#e5d9b2', pos.x + .55, pos.y + 1.3, pos.z, 1.4, 1.8, .1, rotation);
        continue;
      }
      const geometry = kind === 'box' ? (detail === 'cliff' ? cliffFace : detail === 'crate' || detail === 'sofa' || detail === 'table' || detail === 'truck' ? softBox : box) :
        kind === 'cylinder' || kind === 'barrel' ? cylinder : kind === 'cone' ? cone : kind === 'sphere' ? sphere :
        kind === 'rock' ? sphere : kind === 'roof' ? (detail === 'hip' ? hipRoof : gableRoof) : box;
      if (kind === 'barrel') {
        add('metal', geometry, color, pos.x, pos.y, pos.z, scale.x * 2, scale.y, scale.z * 2, rotation);
        add('metal', cylinder, '#c5a774', pos.x, pos.y + scale.y * .3, pos.z, scale.x * 2.06, .07, scale.z * 2.06);
        add('metal', cylinder, '#c5a774', pos.x, pos.y - scale.y * .3, pos.z, scale.x * 2.06, .07, scale.z * 2.06);
      } else if (kind === 'roof') {
        const roofSurface = surfaceOf(object, colliderMaterials);
        add(roofSurface, geometry, color, pos.x, pos.y, pos.z, scale.x, scale.y, scale.z, rotation);
        if (detail === 'thatch') {
          add('timber', softBox, '#B98556', pos.x, pos.y - .055, pos.z,
            scale.x * .94, .1, scale.z * .94);
          for (const side of [-1, 1]) for (let tuft = -4; tuft <= 4; tuft++) {
            add('roof', chamferBox, tuft % 2 ? '#B98556' : '#D8BC94',
              pos.x + tuft * scale.x / 9, pos.y - .07, pos.z + side * (scale.z / 2 + .025),
              scale.x / 10, .14, .1);
          }
        } else add('timber', box, '#514945', pos.x, pos.y + .04, pos.z,
          scale.x * 1.01, .1, scale.z * 1.01);
        if (detail === 'gable') add('metal', box, '#75645c', pos.x, pos.y + scale.y * .97, pos.z, .12, .08, scale.z * .95, rotation);
        if (detail === 'hip' && Math.abs(scale.y - 1.8) < .05) {
          decorateHouse(object);
          const peak = new THREE.Vector3(pos.x, pos.y + scale.y + .045, pos.z);
          for (const dx of [-1, 1]) for (const dz of [-1, 1])
            addBranch(peak, new THREE.Vector3(pos.x + dx * scale.x * .47, pos.y + .06,
              pos.z + dz * scale.z * .47), .085, color, 'roof');
        }
      } else {
        let surface = surfaceOf(object, colliderMaterials);
        if (surface === 'timber' && (detail === 'crate' || detail === 'wall')) surface = 'cover-wood';
        const paint = surface === 'cover-wood' ? '#9C6A42' : color;
        add(surface, detail === 'kiosk-post' ? chamferBox : geometry,
          paint, pos.x, pos.y, pos.z, scale.x, scale.y, scale.z, rotation);
        if (detail === 'kiosk-post') add('timber', chamferBox, '#7A5234', pos.x,
          terrainHeight(pos.x, pos.z) + .025, pos.z, .2, .07, .2);
        if (detail === 'shutter') for (const face of [-1, 1]) for (let slat = 0; slat < 5; slat++)
          add('timber', box, '#b6bfa2', pos.x, pos.y + (slat - 2) * .21, pos.z + face * .065,
            scale.x * .9, .025, .025);
        if (detail === 'path') {
          const edges = [
            [1, 0, scale.x / 2, scale.z], [-1, 0, scale.x / 2, scale.z],
            [0, 1, scale.z / 2, scale.x], [0, -1, scale.z / 2, scale.x],
          ] as const;
          const hasCurb = urban.some(district => Math.hypot(pos.x - district.x, pos.z - district.z) < district.radius * 1.2);
          for (const [nx, nz, offset, span] of edges) {
            const checkX = pos.x + nx * (offset + .27), checkZ = pos.z + nz * (offset + .27);
            const covered = pathObjects.some(other => other !== object &&
              Math.abs(checkX - other.pos.x) < other.scale.x / 2 - .06 &&
              Math.abs(checkZ - other.pos.z) < other.scale.z / 2 - .06);
            if (covered) continue;
            if (hasCurb) add('stone', box, '#a9a895', pos.x + nx * offset, pos.y + .063,
              pos.z + nz * offset, nx ? .19 : span, .12, nz ? .19 : span);
            for (let tuft = 0; tuft < 4; tuft++) {
              if (hash(Math.round(pos.x * 10), Math.round(pos.z * 10), tuft + (nx + 1) * 3 + (nz + 1) * 7) < .21) continue;
              const along = (tuft - 1.5) * span * .23;
              const gx = pos.x + nx * (offset + .42) + (nz ? along : 0);
              const gz = pos.z + nz * (offset + .42) + (nx ? along : 0);
              const gy = terrainHeight(gx, gz);
              for (let blade = 0; blade < 9; blade++) {
                const angle = blade * 2.4 + hash(tuft, blade, Math.round(pos.x + pos.z)) * .4;
                add('leaf', bentBlade, blade % 4 === 0 ? '#b5bc78' : '#648d50', gx + Math.cos(angle) * .13,
                  gy, gz + Math.sin(angle) * .13, .44, .27 + hash(tuft, blade, 3) * .22, .44, angle);
              }
            }
          }
        }
        if (detail === 'wall' && scale.y > 1) {
          const spanX = scale.x > scale.z;
          add('stone', box, '#a99983', pos.x, pos.y - scale.y * .48, pos.z,
            spanX ? scale.x + .025 : scale.x + .04, .095, spanX ? scale.z + .04 : scale.z + .025, rotation);
        }
        if (detail === 'container') for (let n = -2; n <= 2; n++) {
          const alongX = scale.x > scale.z;
          add('metal', box, '#a7a9a0', pos.x + (alongX ? n * scale.x / 6 : 0), pos.y, pos.z + (alongX ? 0 : n * scale.z / 6),
            alongX ? .045 : scale.x + .02, scale.y * .85, alongX ? scale.z + .02 : .045);
        }
      }
    }
    if (glassPanels.length) {
      const glazing = mergeGeometries(glassPanels, false);
      glassPanels.forEach(panel => panel.dispose());
      if (glazing) {
        const glassMaterial = new THREE.MeshStandardMaterial({ color: '#e2f3eb', vertexColors: true,
          transparent: true, opacity: .28, metalness: .08, roughness: .11, depthWrite: false, side: THREE.DoubleSide });
        const panes = new THREE.Mesh(glazing, glassMaterial);
        panes.renderOrder = 3;
        this.group.add(panes);
        this.disposables.push(glazing, glassMaterial);
      }
    }
    for (const { binding, parts } of buckets.values()) {
      const merged = mergeGeometries(parts, false);
      parts.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere(); releaseAfterUpload(merged);
      const mesh = new THREE.Mesh(merged, binding.material);
      mesh.castShadow = binding.cast;
      mesh.receiveShadow = binding.receive;
      this.group.add(mesh); this.disposables.push(merged);
    }
    buckets.clear();
    const vegetation = this.vegetation = buildVegetation({ ...world, objects: world.objects.filter(object => object.kind !== 'grass' || object.detail === 'reeds' || object.detail === 'crop') }), props = buildProps(world), wallArt = buildWallArt(world);
    this.group.add(vegetation.group, props.group, wallArt.group);
    this.disposables.push(vegetation, props, wallArt);
    this.groundCover = new GroundCover(world); this.group.add(this.groundCover.group); this.disposables.push(this.groundCover);
    const fountain = world.objects.find(object => object.detail === 'prop:plaza');
    if (fountain) {
      const waterGeometry = new THREE.RingGeometry(.73, 1.85, 48, 3).rotateX(-Math.PI / 2);
      const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#479f9b', roughness: .2,
        metalness: .05, clearcoat: .8, normalMap: this.smallWaterNormals, normalScale: new THREE.Vector2(.15, .15),
        transparent: true, opacity: .91 });
      const basin = new THREE.Mesh(waterGeometry, waterMaterial);
      basin.position.set(fountain.pos.x, fountain.pos.y + 1.039, fountain.pos.z);
      this.group.add(basin); this.disposables.push(waterGeometry, waterMaterial);
      const jetMaterial = new THREE.MeshBasicMaterial({ color: '#2EC4B6' });
      const splashMaterial = new THREE.MeshBasicMaterial({ color: '#F4FBF6', transparent: true,
        opacity: .8, depthWrite: false });
      this.disposables.push(jetMaterial, splashMaterial);
      const jets: THREE.BufferGeometry[] = [], splashes: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        const points = Array.from({ length: 13 }, (_, n) => {
          const t = n / 12, radius = .58 + t * .94;
          return new THREE.Vector3(fountain.pos.x + Math.cos(angle) * radius,
            fountain.pos.y + 1.34 + Math.sin(t * Math.PI) * .42 - t * .29,
            fountain.pos.z + Math.sin(angle) * radius);
        });
        jets.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .05, 6, false));
        const splash = new THREE.SphereGeometry(.075, 8, 5);
        splash.scale(1.55, .4, 1.55).translate(points[12].x, points[12].y, points[12].z);
        splashes.push(splash);
      }
      const jetGeometry = mergeGeometries(jets, false), splashGeometry = mergeGeometries(splashes, false);
      jets.forEach(geometry => geometry.dispose()); splashes.forEach(geometry => geometry.dispose());
      if (jetGeometry) { this.group.add(new THREE.Mesh(jetGeometry, jetMaterial)); this.disposables.push(jetGeometry); }
      if (splashGeometry) { this.group.add(new THREE.Mesh(splashGeometry, splashMaterial)); this.disposables.push(splashGeometry); }
    }
    if (!world.pieces?.length) this.addArenaBoundary();
    this.group.add(this.arenaBoundary);
    this.setSettings(settings);
  }

  private addArenaBoundary() {
    const posts: THREE.BufferGeometry[] = [], lines: THREE.BufferGeometry[] = [];
    const add = (target: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, color: string,
      x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      target.push(coloredGeometry(geometry, c(color), new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz)));
    };
    const { minX, maxX, minZ, maxZ } = ARENA;
    const post = (x: number, z: number) => add(posts, cylinder, '#ffe6a0', x, Math.max(terrainHeight(x, z), 0) + 1.3, z, .12, 2.6, .12);
    for (let x = minX; x <= maxX; x += 8) for (const z of [minZ, maxZ]) {
      post(x, z);
      add(posts, box, '#f7c76f', x + .38, Math.max(terrainHeight(x, z), 0) + 2.52, z, .9, .42, .035);
    }
    for (let z = minZ + 8; z < maxZ; z += 8) for (const x of [minX, maxX]) post(x, z);
    // The tape follows the ground in short spans instead of one straight line.
    for (const [x0, z0, x1, z1] of [[minX, minZ, maxX, minZ], [minX, maxZ, maxX, maxZ], [minX, minZ, minX, maxZ], [maxX, minZ, maxX, maxZ]]) {
      const length = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(length / 4);
      for (let i = 0; i < steps; i++) {
        const x = x0 + (x1 - x0) * (i + .5) / steps, z = z0 + (z1 - z0) * (i + .5) / steps;
        add(lines, box, '#f2bb60', x, Math.max(terrainHeight(x, z), 0) + 2.35, z, x1 !== x0 ? length / steps : .035, .035, z1 !== z0 ? length / steps : .035);
      }
    }
    for (const [geometries, opacity] of [[posts, .5], [lines, .42]] as const) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!geometry) continue;
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity,
        depthWrite: false, side: THREE.DoubleSide });
      this.arenaBoundary.add(new THREE.Mesh(geometry, material));
      this.disposables.push(geometry, material);
    }
  }

  setSettings(settings: Settings) {
    this.reducedMotion = settings.reducedMotion;
    this.groundCover.setQuality(settings.graphics);
    this.waterfalls.setQuality(settings.graphics);
    this.paintedWater.setQuality(settings.graphics);
    this.recreation.setQuality(settings.graphics);
  }

  update(time: number, camera?: THREE.Camera, actors: readonly ActorState[] = [], localActor?: ActorState) {
    if (camera) { this.kit.update(camera, time); this.groundCover.update(camera, time, this.reducedMotion); }
    this.vegetation.update(this.reducedMotion ? 0 : time);
    this.waterfalls.update(time, this.reducedMotion);
    this.paintedWater.update(time, this.reducedMotion);
    this.recreation.update(time, camera, this.reducedMotion, actors, localActor);
    this.smallWaterNormals.offset.set(time * .013, -time * .08);
  }

  bounce(position: Vec3) { this.recreation.bounce(position); }
  resetRecreation() { this.recreation.reset(); }

  dispose() { this.disposables.forEach(value => value.dispose()); }
}
