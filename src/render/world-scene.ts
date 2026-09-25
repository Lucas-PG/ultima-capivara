import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { AssetLoader } from './assets';
import { terrainHeight, WORLD_PALETTE } from '../shared/terrain';
import { ARENA, ROADS } from '../shared/layout';
import { buildVegetation } from './vegetation';
import { releaseAfterUpload } from './memory';
import { buildProps } from './props';
import { buildWallArt } from './wall-art';
import { textSignMaterial, twoSidedTextSign } from './signage';
import type { MapObject, Settings, WorldSpec } from '../shared/types';

const c = (value: string | number) => new THREE.Color(value);
const box = new THREE.BoxGeometry(1, 1, 1);
const softBox = new RoundedBoxGeometry(1, 1, 1, 1, .055);
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
type Surface = 'earth' | 'sand' | 'plaster' | 'brick' | 'stone' | 'timber' | 'bark' | 'metal' | 'roof' | 'road' | 'leaf' | 'fabric';
const surfaces: Surface[] = ['earth', 'sand', 'plaster', 'brick', 'stone', 'timber', 'bark', 'metal', 'roof', 'road', 'leaf', 'fabric'];
const photoSurface: Record<Surface, string> = {
  earth: 'grass', sand: 'sand', plaster: 'plaster', brick: 'brick', stone: 'stone', timber: 'timber',
  bark: 'bark', metal: 'metal', roof: 'roof', road: 'road', leaf: 'grass', fabric: 'plaster',
};
const tileMeters: Record<Surface, number> = {
  earth: 2, sand: 2, plaster: 1.8, brick: 3, stone: 1.5, timber: 2, bark: 1.9,
  metal: 2, roof: 4, road: 2.3, leaf: 2, fabric: 2,
};
const roughness: Record<Surface, number> = { earth: 1, sand: 1, plaster: 1, brick: 1, stone: 1, timber: 1,
  bark: 1, metal: .85, roof: 1, road: 1, leaf: .88, fabric: .96 };
const hash = (x: number, y: number, salt: number) => {
  let n = Math.imul(x + salt * 17, 374761393) + Math.imul(y - salt * 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
function surfaceTextures(surface: Surface, loader: AssetLoader): { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const prefix = photoSurface[surface];
  const load = (kind: string) => {
    const texture = loader.texture(`textures/${prefix}-${kind}.webp`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  const color = load('color'); color.colorSpace = THREE.SRGBColorSpace;
  return { color, normal: load('normal'), rough: load('roughness') };
}
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
  const size = world.size, steps = 150, stride = size / steps;
  const positions: number[] = [], uvs: number[] = [], slopes: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix <= steps; ix++) {
    const x = -size / 2 + ix * stride, z = -size / 2 + iz * stride, y = terrainHeight(x, z);
    const slope = Math.hypot(terrainHeight(x + 2, z) - terrainHeight(x - 2, z),
      terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) / 4;
    positions.push(x, y, z); uvs.push(x / size + .5, z / size + .5); slopes.push(slope);
    if (ix < steps && iz < steps) {
      const a = iz * (steps + 1) + ix, b = a + 1, d = a + steps + 1;
      indices.push(a, d, b, b, d, d + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('terrainSlope', new THREE.Float32BufferAttribute(slopes, 1));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

function signTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#efe1bc'; context.fillRect(0, 0, 512, 256);
  context.fillStyle = '#ab7354'; context.fillRect(12, 12, 488, 232);
  context.fillStyle = '#f4e7bd'; context.fillRect(22, 22, 468, 212);
  context.fillStyle = '#593c33'; context.font = 'bold 62px Georgia, serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  const parts = label.split(' / ');
  parts.forEach((part, i) => context.fillText(part, 256, parts.length > 1 ? 82 + i * 100 : 128, 440));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
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

function shoreGeometry(size: number): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [];
  const step = 2.5, half = size / 2;
  const add = (x: number, z: number, u: number, v: number) => { positions.push(x, .065, z); uvs.push(u, v); };
  for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step) {
    const corners = [[x, z], [x + step, z], [x + step, z + step], [x, z + step]];
    const heights = corners.map(([px, pz]) => terrainHeight(px, pz) - .045);
    const crossings: [number, number][] = [];
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4, a = heights[edge], b = heights[next];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      crossings.push([THREE.MathUtils.lerp(corners[edge][0], corners[next][0], t), THREE.MathUtils.lerp(corners[edge][1], corners[next][1], t)]);
    }
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const a = crossings[i], b = crossings[i + 1], cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      const gx = terrainHeight(cx + .5, cz) - terrainHeight(cx - .5, cz);
      const gz = terrainHeight(cx, cz + .5) - terrainHeight(cx, cz - .5);
      const length = Math.hypot(gx, gz) || 1, ox = -gx / length * .85, oz = -gz / length * .85;
      const ua = a[0] * .28 + a[1] * .18, ub = b[0] * .28 + b[1] * .18;
      add(a[0], a[1], ua, 0); add(b[0], b[1], ub, 0); add(a[0] + ox, a[1] + oz, ua, 1);
      add(a[0] + ox, a[1] + oz, ua, 1); add(b[0], b[1], ub, 0); add(b[0] + ox, b[1] + oz, ub, 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); return geometry;
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
  readonly mist: THREE.Mesh;
  readonly skyTexture: THREE.DataTexture;
  private readonly waterNormals: THREE.CanvasTexture;
  private readonly smallWaterNormals: THREE.CanvasTexture;
  private readonly cascadeTime = { value: 0 };
  private readonly vegetation: ReturnType<typeof buildVegetation>;
  private reducedMotion = false;
  private readonly shore: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly surfaceMaterials: { material: THREE.MeshStandardMaterial; normal: THREE.Texture | null; rough: THREE.Texture | null }[] = [];

  constructor(world: WorldSpec, settings: Settings, loader: AssetLoader, onAssetsReady: () => void = () => {}) {
    this.skyTexture = loader.hdr('textures/partly-cloudy-sky-1k.hdr');
    this.skyTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.disposables.push(this.skyTexture);
    const assetTextures = new Map<string, ReturnType<typeof surfaceTextures>>();
    const textures = Object.fromEntries(surfaces.map(surface => {
      const prefix = photoSurface[surface];
      let value = assetTextures.get(prefix);
      if (!value) { value = surfaceTextures(surface, loader); assetTextures.set(prefix, value); }
      return [surface, value];
    })) as Record<Surface, ReturnType<typeof surfaceTextures>>;
    for (const value of assetTextures.values()) this.disposables.push(value.color, value.normal, value.rough);
    void loader.ready().then(onAssetsReady, () => {});
    const materialFor = (surface: Surface) => {
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true, map: surface === 'fabric' ? null : textures[surface].color,
        normalMap: surface === 'fabric' ? null : textures[surface].normal,
        normalScale: new THREE.Vector2(surface === 'plaster' ? .12 : surface === 'roof' ? .4 : .3,
          surface === 'plaster' ? .12 : surface === 'roof' ? .4 : .3),
        roughnessMap: surface === 'fabric' ? null : textures[surface].rough,
        roughness: roughness[surface], metalness: surface === 'metal' ? .28 : .02,
        side: surface === 'leaf' || surface === 'fabric' || surface === 'roof' ? THREE.DoubleSide : THREE.FrontSide,
      });
      // Cartoon look: photo textures only add a hint of grain over the flat
      // vertex colours instead of carrying the whole surface.
      if (surface !== 'plaster' && surface !== 'roof' && surface !== 'earth' && surface !== 'fabric') {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            vec3 grain = texture2D(map, vMapUv).rgb;
            diffuseColor.rgb *= mix(vec3(1.0), grain * 1.4, .4);
          `);
        };
      }
      if (surface === 'plaster' || surface === 'roof') {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', surface === 'plaster' ? `
            float plasterValue = dot(texture2D(map, vMapUv).rgb, vec3(.28, .59, .13));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(plasterValue), .17);
          ` : `
            vec3 clayTiles = texture2D(map, vMapUv).rgb;
            diffuseColor.rgb *= mix(vec3(1.0), clayTiles * 1.3, .38);
          `);
        };
      }
      this.surfaceMaterials.push({ material, normal: material.normalMap, rough: material.roughnessMap });
      return material;
    };
    const groundColors = loader.texture('textures/terrain-color.png');
    groundColors.colorSpace = THREE.SRGBColorSpace;
    groundColors.minFilter = THREE.LinearMipmapLinearFilter;
    groundColors.magFilter = THREE.LinearFilter;
    groundColors.generateMipmaps = true;
    this.disposables.push(groundColors);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: groundColors, roughness: 1, metalness: 0 });
    groundMaterial.customProgramCacheKey = () => 'terrain-ground-road-rock-slope-v4';
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
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        attribute float terrainSlope;
        varying float vTerrainSlope;
        varying vec2 vTerrainXZ;
        varying float vTerrainWorldY;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vTerrainSlope = terrainSlope;
        vTerrainXZ = (modelMatrix * vec4(position, 1.0)).xz;
        vTerrainWorldY = (modelMatrix * vec4(position, 1.0)).y;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        varying float vTerrainSlope;
        varying vec2 vTerrainXZ;
        varying float vTerrainWorldY;
        uniform vec4 terrainRoads[5];
        uniform vec3 terrainAsphalt;
        uniform vec3 terrainCurb;
        uniform vec3 terrainGrass;
        uniform vec3 terrainGrassLight;
        uniform vec3 terrainDryGrass;
        uniform vec3 terrainSand;
        uniform vec3 terrainSandLight;
        uniform vec3 terrainRockPaint;
        uniform vec3 terrainRockTop;
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
        if (vTerrainSlope >= 0.54) {
          float grassPatch = terrainFbm(vTerrainXZ / 36.0 + vec2(7.0, 3.0));
          float dryPatch = terrainFbm(vTerrainXZ / 48.0 + vec2(-4.0, 9.0));
          vec3 paintedGrass = dryPatch > 0.24 ? terrainDryGrass :
            (grassPatch > 0.0 ? terrainGrassLight : terrainGrass);
          float left = 24.0 + terrainFbm(vec2(vTerrainXZ.y / 12.0 + 11.0, 2.0)) * 5.0;
          float right = 74.0 + terrainFbm(vec2(vTerrainXZ.y / 12.0 + 29.0, 2.0)) * 5.0;
          float sea = -132.0 + terrainFbm(vec2(vTerrainXZ.x / 12.0 + 17.0, 4.0)) * 5.0;
          float inland = -104.0 + terrainFbm(vec2(vTerrainXZ.x / 12.0 + 37.0, 4.0)) * 5.0;
          float beachEdge = min(min(vTerrainXZ.x - left, right - vTerrainXZ.x),
            min(vTerrainXZ.y - sea, inland - vTerrainXZ.y));
          float warpedX = vTerrainXZ.x + terrainFbm(vTerrainXZ / 12.0 + vec2(41.0, 9.0)) * 4.0;
          float warpedZ = vTerrainXZ.y + terrainFbm(vTerrainXZ / 12.0 + vec2(-7.0, 33.0)) * 4.0;
          vec3 paintedSand = terrainFbm(vec2(warpedX / 24.0 + 3.0, warpedZ / 24.0 - 8.0)) > 0.0 ?
            terrainSandLight : terrainSand;
          vec3 paintedSlope = mix(paintedGrass, paintedSand,
            max(1.0 - step(0.79, vTerrainWorldY), smoothstep(-1.0, 1.0, beachEdge)));
          diffuseColor.rgb = mix(diffuseColor.rgb, paintedSlope, smoothstep(0.54, 0.6, vTerrainSlope));
        }
        float distanceToRoad = 1e6;
        for (int road = 0; road < 5; road++)
          distanceToRoad = min(distanceToRoad, terrainRectDistance(vTerrainXZ, terrainRoads[road]));
        float edgeWidth = max(fwidth(distanceToRoad), 0.002);
        float asphaltMask = 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToRoad);
        float curbMask = (1.0 - smoothstep(0.4 - edgeWidth, 0.4 + edgeWidth, distanceToRoad)) * (1.0 - asphaltMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, terrainCurb, curbMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, terrainAsphalt, asphaltMask);
      `).replace('#include <tonemapping_fragment>', `
        float coastRadius = max(abs(vTerrainXZ.x), abs(vTerrainXZ.y)) * 0.65 + length(vTerrainXZ) * 0.35;
        float coastalRock = smoothstep(110.0, 113.0, coastRadius);
        float lakeRock = 1.0 - smoothstep(25.0, 27.0, distance(vTerrainXZ, vec2(-34.0, 6.0)));
        float rockMask = max(smoothstep(1.03, 1.13, vTerrainSlope),
          max(coastalRock, lakeRock) * smoothstep(0.55, 0.7, vTerrainSlope));
        float irregular = sin(vTerrainXZ.x * 0.52 + sin(vTerrainXZ.y * 0.18)) * 0.12 +
          sin(vTerrainXZ.y * 0.47) * 0.08;
        float stratum = mod(floor((vTerrainWorldY + irregular) / 1.2), 2.0);
        float topBand = 1.0 - smoothstep(0.7, 1.0, vTerrainSlope);
        vec3 rockPaint = mix(terrainRockPaint, terrainRockTop, topBand) * mix(0.94, 1.06, stratum);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, rockPaint, rockMask * (1.0 - asphaltMask - curbMask));
        #include <tonemapping_fragment>
      `);
    };
    const ground = new THREE.Mesh(terrainGeometry(world), groundMaterial);
    ground.receiveShadow = true; this.group.add(ground); this.disposables.push(ground.geometry, ground.material as THREE.Material);

    this.waterNormals = waterNormalTexture();
    this.smallWaterNormals = waterNormalTexture(); this.smallWaterNormals.repeat.set(3, 5);
    // Cartoon sea: standard shading with a rippled normal for sun glints. The
    // clearcoat layer it had doubled the per-pixel cost of the whole horizon.
    const seaMaterial = new THREE.MeshStandardMaterial({ color: '#3f8392', roughness: .22, metalness: .02,
      normalMap: this.waterNormals, normalScale: new THREE.Vector2(.42, .42), transparent: true, opacity: .93,
      side: THREE.DoubleSide, depthWrite: false });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), seaMaterial);
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = -.05; this.water.renderOrder = 1; this.group.add(this.water);
    this.disposables.push(this.water.geometry, seaMaterial, this.waterNormals, this.smallWaterNormals);
    const shoreMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float uTime;varying vec2 vUv;void main(){float wash=.74+.26*sin(vUv.x*6.0-uTime*1.4);float edge=1.0-smoothstep(.05,.95,vUv.y);float grain=.75+.25*sin(vUv.x*31.0+vUv.y*19.0);gl_FragColor=vec4(vec3(.85,.94,.89),edge*wash*grain*.48);}',
    });
    this.shore = new THREE.Mesh(shoreGeometry(world.size), shoreMaterial);
    this.shore.renderOrder = 2; this.group.add(this.shore);
    this.disposables.push(this.shore.geometry, shoreMaterial);
    const waveGeo = new THREE.PlaneGeometry(260, 260, 36, 36);
    const waveMaterial = new THREE.MeshBasicMaterial({ color: '#a9d5ce', transparent: true, opacity: .025, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mist = new THREE.Mesh(waveGeo, waveMaterial); this.mist.rotation.x = -Math.PI / 2; this.mist.position.y = .02; this.group.add(this.mist);
    this.disposables.push(waveGeo, waveMaterial);

    const buckets = new Map<string, { surface: Surface; parts: THREE.BufferGeometry[] }>();
    const stash = (surface: Surface, geometry: THREE.BufferGeometry, x: number, z: number) => {
      // 64 m cells: few enough draw calls from the plane, still culled on the ground.
      const key = `${surface}:${Math.floor(x / 64)}:${Math.floor(z / 64)}`;
      const bucket = buckets.get(key) || { surface, parts: [] };
      bucket.parts.push(geometry); buckets.set(key, bucket);
    };
    const colliderMaterials = new Map(world.colliders.map(collider => [collider.id, collider.material]));
    const pathObjects = world.objects.filter(object => object.detail === 'path');
    const urban = world.districts.filter(district => district.id === 'vila' || district.id === 'centro' || district.id === 'posto');
    const cascadeMaterial = new THREE.MeshPhysicalMaterial({ color: '#91bdc0', emissive: '#2d777b', emissiveIntensity: .16,
      roughness: .14, metalness: .02, normalMap: this.smallWaterNormals, normalScale: new THREE.Vector2(.2, .4),
      clearcoat: 1, transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide });
    this.disposables.push(cascadeMaterial);
    const cascadeSheet = new THREE.ShaderMaterial({
      uniforms: { uTime: this.cascadeTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main() {
          float flow = vUv.y + uTime * .78;
          float streams = .5 + .5 * sin(vUv.x * 117.0 + sin(flow * 13.0) * .6);
          float broken = .5 + .5 * sin(vUv.x * 43.0 + flow * 29.0);
          float foam = (1.0 - smoothstep(.0, .2, vUv.y)) + smoothstep(.92, 1.0, vUv.y);
          float edge = smoothstep(.0, .035, vUv.x) * smoothstep(.0, .035, 1.0-vUv.x);
          vec3 water = mix(vec3(.31,.49,.47), vec3(.91,.96,.91), clamp(.3+streams*.37+broken*.13+foam*.35,0.0,1.0));
          gl_FragColor = vec4(water, edge*(.62+streams*.2+foam*.12));
        }`,
    });
    this.disposables.push(cascadeSheet);
    const add = (surface: Surface, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0) => {
      const tint = c(color);
      if (surface === 'plaster') tint.lerp(c('#ffffff'), .04);
      else if (surface === 'roof') {
        // Warm roofs read as the legacy build's bright terracotta red.
        const hsl = tint.getHSL({ h: 0, s: 0, l: 0 });
        if (hsl.s > .12 && (hsl.h < .14 || hsl.h > .78)) tint.lerp(c(hsl.l > .42 ? '#e2573a' : '#cf432c'), .7);
        else tint.lerp(c('#ffffff'), .08);
      }
      else if (surface !== 'leaf' && surface !== 'fabric') tint.lerp(c('#ffffff'), .22);
      stash(surface, coloredGeometry(geometry, tint, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation, tileMeters[surface]), x, z);
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
      if (detail?.startsWith('prop:') || kind === 'palm' || kind === 'tree' || kind === 'grass') continue;
      if (detail === 'waterfall') {
        const geometry = new THREE.PlaneGeometry(scale.x, scale.y, 6, 12);
        const vertices = geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) vertices.setZ(i, Math.sin(vertices.getX(i) * 3 + vertices.getY(i) * 5) * .035);
        geometry.computeVertexNormals();
        const cascade = new THREE.Mesh(geometry, cascadeSheet);
        cascade.position.set(pos.x, pos.y, pos.z + scale.z * .5 + .03);
        this.group.add(cascade); this.disposables.push(geometry);
        continue;
      }
      if (detail === 'water') {
        const geometry = cylinder.clone(); geometry.scale(scale.x, scale.y, scale.z);
        const basin = new THREE.Mesh(geometry, cascadeMaterial);
        basin.position.set(pos.x, pos.y, pos.z); this.group.add(basin); this.disposables.push(geometry);
        continue;
      }
      if (kind === 'sign') {
        const material = textSignMaterial(signTexture(detail || ''));
        const board = twoSidedTextSign(scale.x, scale.y * .62, material);
        board.position.set(pos.x, pos.y + .4, pos.z); board.rotation.y = rotation; this.group.add(board);
        const groundY = terrainHeight(pos.x, pos.z);
        const boardBottom = board.position.y - scale.y * .31;
        const poleHeight = boardBottom - groundY;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, poleHeight, 6), new THREE.MeshStandardMaterial({ color: '#6e573d' }));
        pole.position.set(pos.x, groundY + poleHeight / 2, pos.z); this.group.add(pole);
        this.disposables.push((board.children[0] as THREE.Mesh).geometry, material, material.map!, pole.geometry, pole.material as THREE.Material);
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
        add('timber', box, '#514945', pos.x, pos.y + .04, pos.z, scale.x * 1.01, .1, scale.z * 1.01);
        if (detail === 'gable') add('metal', box, '#75645c', pos.x, pos.y + scale.y * .97, pos.z, .12, .08, scale.z * .95, rotation);
        if (detail === 'hip' && Math.abs(scale.y - 1.8) < .05) {
          decorateHouse(object);
          const peak = new THREE.Vector3(pos.x, pos.y + scale.y + .045, pos.z);
          for (const dx of [-1, 1]) for (const dz of [-1, 1])
            addBranch(peak, new THREE.Vector3(pos.x + dx * scale.x * .47, pos.y + .06,
              pos.z + dz * scale.z * .47), .085, color, 'roof');
        }
      } else {
        const surface = surfaceOf(object, colliderMaterials);
        add(surface, geometry, color, pos.x, pos.y, pos.z, scale.x, scale.y, scale.z, rotation);
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
    const materialCache = new Map<Surface, THREE.MeshStandardMaterial>();
    for (const { surface, parts } of buckets.values()) {
      const merged = mergeGeometries(parts, false);
      parts.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere(); releaseAfterUpload(merged);
      let material = materialCache.get(surface);
      if (!material) { material = materialFor(surface); materialCache.set(surface, material); this.disposables.push(material); }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = surface !== 'leaf' && surface !== 'earth' && surface !== 'sand' && surface !== 'road';
      mesh.receiveShadow = surface !== 'leaf';
      this.group.add(mesh); this.disposables.push(merged);
    }
    buckets.clear();
    const vegetation = this.vegetation = buildVegetation(world), props = buildProps(world), wallArt = buildWallArt(world);
    this.group.add(vegetation.group, props.group, wallArt.group);
    this.disposables.push(vegetation, props, wallArt);
    const fountain = world.objects.find(object => object.detail === 'prop:plaza');
    if (fountain) {
      const waterGeometry = new THREE.RingGeometry(.73, 1.85, 48, 3).rotateX(-Math.PI / 2);
      const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#479f9b', roughness: .2,
        metalness: .05, clearcoat: .8, normalMap: this.smallWaterNormals, normalScale: new THREE.Vector2(.15, .15),
        transparent: true, opacity: .91 });
      const basin = new THREE.Mesh(waterGeometry, waterMaterial);
      basin.position.set(fountain.pos.x, fountain.pos.y + 1.039, fountain.pos.z);
      this.group.add(basin); this.disposables.push(waterGeometry, waterMaterial);
      const jetMaterial = new THREE.MeshBasicMaterial({ color: '#bce7d9', transparent: true, opacity: .56 });
      this.disposables.push(jetMaterial);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        const points = Array.from({ length: 13 }, (_, n) => {
          const t = n / 12, radius = .58 + t * .94;
          return new THREE.Vector3(fountain.pos.x + Math.cos(angle) * radius,
            fountain.pos.y + 1.34 + Math.sin(t * Math.PI) * .26 - t * .29,
            fountain.pos.z + Math.sin(angle) * radius);
        });
        const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .018, 5, false);
        this.group.add(new THREE.Mesh(geometry, jetMaterial)); this.disposables.push(geometry);
      }
    }
    this.addArenaBoundary();
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
    this.mist.visible = settings.graphics === 'high';
    this.mist.material instanceof THREE.MeshBasicMaterial && (this.mist.material.opacity = settings.graphics === 'high' ? .025 : 0);
    for (const { material, normal, rough } of this.surfaceMaterials) {
      const nextNormal = settings.graphics === 'low' ? null : normal;
      const nextRough = settings.graphics === 'low' ? null : rough;
      if (material.normalMap !== nextNormal || material.roughnessMap !== nextRough) {
        material.normalMap = nextNormal; material.roughnessMap = nextRough; material.needsUpdate = true;
      }
    }
    if (this.water.material instanceof THREE.MeshStandardMaterial) {
      const next = settings.graphics === 'low' ? null : this.waterNormals;
      if (this.water.material.normalMap !== next) { this.water.material.normalMap = next; this.water.material.needsUpdate = true; }
      this.water.material.normalScale.setScalar(settings.graphics === 'low' ? .24 : .42);
      this.water.material.roughness = settings.graphics === 'low' ? .29 : .22;
    }
  }

  update(time: number) {
    this.vegetation.update(this.reducedMotion ? 0 : time);
    this.cascadeTime.value = time;
    this.waterNormals.offset.set(time * .025, time * .014);
    this.smallWaterNormals.offset.set(time * .013, -time * .08);
    if (this.water.material instanceof THREE.MeshStandardMaterial) this.water.material.opacity = .92 + Math.sin(time * .55) * .012;
    if (this.shore.material instanceof THREE.ShaderMaterial) this.shore.material.uniforms.uTime.value = time;
    this.mist.position.x = Math.sin(time * .03) * 2;
    this.mist.position.z = Math.cos(time * .04) * 2;
  }

  dispose() { this.disposables.forEach(value => value.dispose()); }
}
