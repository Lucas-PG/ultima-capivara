import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { terrainHeight } from '../shared/terrain';
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
const bentBlade = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -.045, 0, 0, .045, 0, 0, -.032, .24, .025,
    .045, 0, 0, .032, .24, .025, -.032, .24, .025,
    -.032, .24, .025, .032, .24, .025, 0, .55, .14,
  ], 3));
  g.computeVertexNormals(); return g;
})();
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
function surfaceTextures(surface: Surface, loader: THREE.TextureLoader): { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const prefix = photoSurface[surface];
  const load = (kind: string) => {
    const texture = loader.load(`${import.meta.env.BASE_URL}textures/${prefix}-${kind}.webp`);
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
const leafRects = [
  [.008, .49, .145, .985], [.15, .55, .32, .985], [.344, .59, .48, .985],
  [.502, .57, .65, .985], [.66, .57, .83, .985],
  [.018, .005, .14, .44], [.207, .005, .34, .445], [.407, .005, .555, .445],
];

class FoliageBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];

  leaf(center: THREE.Vector3, right: THREE.Vector3, upward: THREE.Vector3, color: THREE.Color, atlas: number) {
    const [u0, v0, u1, v1] = leafRects[atlas % leafRects.length];
    const corners = [
      center.clone().addScaledVector(right, -.5).addScaledVector(upward, -.5),
      center.clone().addScaledVector(right, .5).addScaledVector(upward, -.5),
      center.clone().addScaledVector(right, -.5).addScaledVector(upward, .5),
      center.clone().addScaledVector(right, .5).addScaledVector(upward, .5),
    ];
    const normal = right.clone().cross(upward).normalize();
    const indices = [0, 1, 2, 2, 1, 3];
    const coords = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
    for (const i of indices) {
      this.positions.push(corners[i].x, corners[i].y, corners[i].z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(coords[i][0], coords[i][1]);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

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
  const size = world.size, beach = world.districts.find(district => district.id === 'praia');
  const steps = 130, stride = size / steps;
  const positions: number[] = [], blends: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix <= steps; ix++) {
    const x = -size / 2 + ix * stride, z = -size / 2 + iz * stride, y = terrainHeight(x, z);
    const slope = Math.hypot(terrainHeight(x + stride, z) - terrainHeight(x - stride, z), terrainHeight(x, z + stride) - terrainHeight(x, z - stride)) / (4 * stride);
    const patch = .5 + .5 * Math.sin(x * .071 + Math.sin(z * .026)) * Math.sin(z * .093 - x * .037);
    const shore = THREE.MathUtils.clamp((.85 - y) * 2, 0, 1);
    const beachDistance = beach ? Math.hypot(x - beach.x, z - beach.z) : Infinity;
    const beachSand = beach ? 1 - THREE.MathUtils.smoothstep(beachDistance, beach.radius * .56, beach.radius * 1.16) : 0;
    const coast = Math.max(shore, beachSand);
    const exposed = THREE.MathUtils.clamp((slope - .24) * 2.4, 0, .83);
    const soil = THREE.MathUtils.clamp((patch - .5) * .72, 0, .33);
    positions.push(x, y, z); blends.push(coast, exposed, soil); uvs.push(x / 2, z / 2);
    if (ix < steps && iz < steps) {
      const a = iz * (steps + 1) + ix, b = a + 1, d = a + steps + 1;
      indices.push(a, d, b, b, d, d + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('terrainBlend', new THREE.Float32BufferAttribute(blends, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  if (detail === 'wall' && physical === 'stone' && object.pos.x > 22 && object.pos.x < 96 && object.pos.z > -50 && object.pos.z < 16) return 'brick';
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
  private readonly shore: THREE.Mesh;
  private readonly canopy: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly surfaceMaterials: { material: THREE.MeshStandardMaterial; normal: THREE.Texture | null; rough: THREE.Texture | null }[] = [];

  constructor(world: WorldSpec, settings: Settings, onAssetsReady: () => void = () => {}) {
    const loading = new THREE.LoadingManager();
    loading.onLoad = onAssetsReady;
    const loader = new THREE.TextureLoader(loading);
    this.skyTexture = new HDRLoader(loading).load(`${import.meta.env.BASE_URL}textures/partly-cloudy-sky-1k.hdr`);
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
    const materialFor = (surface: Surface) => {
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true, map: surface === 'fabric' ? null : textures[surface].color,
        normalMap: surface === 'fabric' ? null : textures[surface].normal,
        normalScale: new THREE.Vector2(surface === 'plaster' ? .18 : surface === 'roof' ? .62 : .55,
          surface === 'plaster' ? .18 : surface === 'roof' ? .62 : .55),
        roughnessMap: surface === 'fabric' ? null : textures[surface].rough,
        roughness: roughness[surface], metalness: surface === 'metal' ? .28 : .02,
        side: surface === 'leaf' || surface === 'fabric' || surface === 'roof' ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (surface === 'plaster' || surface === 'roof') {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', surface === 'plaster' ? `
            float plasterValue = dot(texture2D(map, vMapUv).rgb, vec3(.28, .59, .13));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(plasterValue), .17);
          ` : `
            vec3 clayTiles = texture2D(map, vMapUv).rgb;
            diffuseColor.rgb *= mix(vec3(1.0), clayTiles, .58);
          `);
        };
      }
      this.surfaceMaterials.push({ material, normal: material.normalMap, rough: material.roughnessMap });
      return material;
    };
    const groundMaterial = materialFor('earth');
    groundMaterial.vertexColors = false;
    groundMaterial.onBeforeCompile = shader => {
      shader.uniforms.uSandMap = { value: textures.sand.color };
      shader.uniforms.uRockMap = { value: textures.stone.color };
      shader.vertexShader = `attribute vec3 terrainBlend; varying vec3 vTerrainBlend;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTerrainBlend = terrainBlend;');
      shader.fragmentShader = `uniform sampler2D uSandMap; uniform sampler2D uRockMap; varying vec3 vTerrainBlend;\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', `
          vec2 warpedUv = vMapUv + vec2(
            sin(vMapUv.y * .31) * .33 + sin(vMapUv.x * .17) * .16,
            sin(vMapUv.x * .29) * .36 + sin(vMapUv.y * .19) * .14);
          vec2 rotatedUv = vec2(warpedUv.x * .73 - warpedUv.y * .68, warpedUv.x * .68 + warpedUv.y * .73);
          vec3 grassFine = texture2D(map, warpedUv).rgb;
          vec3 grassBroad = texture2D(map, rotatedUv * .43 + vec2(.23, .57)).rgb;
          vec3 grassColor = mix(grassFine, grassBroad, .32) * vec3(.77, 1.13, .74);
          vec3 sandColor = texture2D(uSandMap, warpedUv * .94 + vec2(.37, .21)).rgb;
          vec3 rockColor = texture2D(uRockMap, warpedUv * 1.34 + vec2(.12, .49)).rgb;
          float sandy = clamp(vTerrainBlend.x + vTerrainBlend.z * .53, 0.0, 1.0);
          float rocky = clamp(vTerrainBlend.y, 0.0, 1.0);
          diffuseColor.rgb *= mix(mix(grassColor, sandColor, sandy), rockColor, rocky);
          diffuseColor.rgb *= .88 + .12 * sin(vMapUv.x * .43 + sin(vMapUv.y * .11)) * sin(vMapUv.y * .39);
        `);
    };
    const ground = new THREE.Mesh(terrainGeometry(world), groundMaterial);
    ground.receiveShadow = true; this.group.add(ground); this.disposables.push(ground.geometry, ground.material as THREE.Material);

    this.waterNormals = waterNormalTexture();
    this.smallWaterNormals = waterNormalTexture(); this.smallWaterNormals.repeat.set(3, 5);
    const seaMaterial = new THREE.MeshPhysicalMaterial({ color: '#3f8392', roughness: .22, metalness: .02,
      normalMap: this.waterNormals, normalScale: new THREE.Vector2(.42, .42), clearcoat: 1,
      clearcoatRoughness: .13, ior: 1.33, transparent: true, opacity: .93,
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

    const buckets = {} as Record<Surface, THREE.BufferGeometry[]>;
    for (const surface of surfaces) buckets[surface] = [];
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
      else if (surface === 'roof') tint.lerp(c('#ffffff'), .2);
      else if (surface !== 'leaf' && surface !== 'fabric') tint.lerp(c('#ffffff'), .58);
      buckets[surface].push(coloredGeometry(geometry, tint, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), rotation, tileMeters[surface]));
    };
    const foliage = new FoliageBuilder();
    const addBranch = (from: THREE.Vector3, to: THREE.Vector3, radius: number, tint: string, surface: Surface = 'bark') => {
      const direction = to.clone().sub(from), length = direction.length();
      const midpoint = from.clone().add(to).multiplyScalar(.5);
      const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
      const geometry = branchShape.toNonIndexed();
      geometry.applyMatrix4(new THREE.Matrix4().compose(midpoint, rotation, new THREE.Vector3(radius, length, radius)));
      buckets[surface].push(paintGeometry(geometry, c(tint).lerp(c('#ffffff'), .3), tileMeters[surface]));
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
        const material = new THREE.MeshBasicMaterial({ map: signTexture(detail || ''), side: THREE.DoubleSide });
        const board = new THREE.Mesh(new THREE.PlaneGeometry(scale.x, scale.y * .62), material);
        board.position.set(pos.x, pos.y + .4, pos.z); board.rotation.y = rotation; this.group.add(board);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, scale.y * .9, 6), new THREE.MeshStandardMaterial({ color: '#6e573d' }));
        pole.position.set(pos.x, pos.y - scale.y * .27, pos.z); this.group.add(pole);
        this.disposables.push(board.geometry, material, material.map!, pole.geometry, pole.material as THREE.Material);
        continue;
      }
      if (kind === 'palm' || kind === 'tree') {
        const h = scale.y, seed = Number(object.id.split('-').at(-1)) || 0;
        const trunkTint = kind === 'palm' ? '#a38a69' : '#8b7659';
        const lean = hash(seed, 9, 4) * 2 - 1;
        const base = new THREE.Vector3(pos.x, pos.y, pos.z);
        const lower = new THREE.Vector3(pos.x + lean * .13, pos.y + h * .32, pos.z + lean * .08);
        const upper = new THREE.Vector3(pos.x + lean * .3, pos.y + h * .67, pos.z + lean * .2);
        const crown = new THREE.Vector3(pos.x + lean * .42, pos.y + h * .79, pos.z + lean * .26);
        const radius = kind === 'palm' ? .18 : Math.max(.19, scale.x * .13);
        addBranch(base, lower, radius * 1.25, trunkTint);
        addBranch(lower, upper, radius, trunkTint);
        if (kind === 'tree') addBranch(upper, crown, radius * .67, trunkTint);
        if (kind === 'palm') {
          addBranch(upper, crown, radius * .63, trunkTint);
          for (let n = 0; n < 13; n++) {
            const angle = rotation + n * Math.PI * 2 / 13 + (hash(seed, n, 4) - .5) * .22;
            const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const sideways = new THREE.Vector3(-outward.z, 0, outward.x);
            const reach = 2.55 + hash(seed, n, 6) * .8;
            const drop = 1.3 + hash(seed, n, 13) * .65;
            const p1 = crown.clone().addScaledVector(outward, reach * .25).add(new THREE.Vector3(0, .65, 0));
            const p2 = crown.clone().addScaledVector(outward, reach * .8).add(new THREE.Vector3(0, -.3, 0));
            const tip = crown.clone().addScaledVector(outward, reach).add(new THREE.Vector3(0, -drop, 0));
            const frondPoint = (t: number) => crown.clone().multiplyScalar((1 - t) ** 3)
              .addScaledVector(p1, 3 * (1 - t) ** 2 * t)
              .addScaledVector(p2, 3 * (1 - t) * t * t)
              .addScaledVector(tip, t ** 3);
            for (let section = 0; section < 4; section++)
              addBranch(frondPoint(section / 4), frondPoint((section + 1) / 4), .09 - section * .017,
                '#789657', 'leaf');
            for (let k = 1; k <= 17; k++) for (const side of [-1, 1]) {
              const t = k / 18, stem = frondPoint(t);
              const r = hash(seed + n * 17, k, side + 5);
              const center = stem.addScaledVector(sideways, side * (.19 + .08 * r));
              const twist = (hash(seed + n * 31, k, side + 19) - .5) * .9;
              const right = outward.clone().multiplyScalar(Math.cos(twist))
                .addScaledVector(sideways, Math.sin(twist)).multiplyScalar(.42 + .13 * r);
              const up = sideways.clone().multiplyScalar(side * (.88 - t * .19))
                .add(new THREE.Vector3(0, -.72 - .35 * t, 0));
              foliage.leaf(center, right, up, c(k % 3 ? '#e0e9c7' : '#c8d99b'), (k + n) % leafRects.length);
            }
          }
          for (let spear = 0; spear < 8; spear++) {
            const angle = rotation + spear * Math.PI / 4;
            foliage.leaf(crown.clone().add(new THREE.Vector3(Math.cos(angle) * .22, .28, Math.sin(angle) * .22)),
              new THREE.Vector3(-Math.sin(angle) * .5, 0, Math.cos(angle) * .5),
              new THREE.Vector3(Math.cos(angle) * .32, 1.3, Math.sin(angle) * .32), c('#d5dfae'), spear);
          }
        } else {
          const canopyRadius = Math.max(1.65, Math.max(scale.x, scale.z) * 1.28);
          const branches = detail === 'mangrove' ? 10 : 8;
          for (let n = 0; n < branches; n++) {
            const angle = rotation + n * Math.PI * 2 / branches + (hash(seed, n, 3) - .5) * .26;
            const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const origin = lower.clone().lerp(upper, .4 + hash(seed, n, 8) * .54);
            const middle = origin.clone().addScaledVector(outward, canopyRadius * .46).add(new THREE.Vector3(0, h * .12, 0));
            const tip = origin.clone().addScaledVector(outward, canopyRadius * (.8 + hash(seed, n, 9) * .3))
              .add(new THREE.Vector3(0, h * (.13 + hash(seed, n, 10) * .1), 0));
            addBranch(origin, middle, radius * .48, trunkTint);
            addBranch(middle, tip, radius * .28, trunkTint);
            const leafTint = c(color).lerp(c('#e2e8c3'), .66);
            for (let k = 0; k < 17; k++) {
              const r = hash(seed + n * 71, k, 1), s = hash(seed + n * 67, k, 2);
              const angleOffset = (s - .5) * 1.8;
              const leafAngle = angle + angleOffset;
              const center = middle.clone().lerp(tip, .17 + r * .91)
                .add(new THREE.Vector3((s - .5) * .8, (hash(seed + n, k, 6) - .5) * 1.25, (r - .5) * .8));
              const right = new THREE.Vector3(Math.cos(leafAngle + Math.PI / 2), (s - .5) * .18,
                Math.sin(leafAngle + Math.PI / 2)).multiplyScalar(.48 + r * .31);
              const up = new THREE.Vector3(Math.cos(leafAngle) * .36, 1, Math.sin(leafAngle) * .36)
                .normalize().multiplyScalar(.7 + s * .48);
              foliage.leaf(center, right, up, leafTint.clone().multiplyScalar(.82 + r * .25), (k + n) % leafRects.length);
            }
          }
          if (detail === 'mangrove') for (let n = 0; n < 4; n++) {
            const a = n * Math.PI / 2 + rotation;
            const root = new THREE.Vector3(pos.x + Math.cos(a) * .75, pos.y, pos.z + Math.sin(a) * .75);
            addBranch(root, lower, radius * .43, trunkTint);
          }
        }
        continue;
      }
      if (kind === 'grass') {
        for (let n = 0; n < (detail === 'reeds' ? 9 : 13); n++) {
          const a = n * 2.399 + rotation;
          add('leaf', bentBlade, n % 3 === 1 ? '#b5ab6c' : color, pos.x + Math.cos(a) * .12,
            pos.y, pos.z + Math.sin(a) * .12, scale.x * .55,
            scale.y * (detail === 'reeds' ? .8 : .48) * (.75 + (n % 4) * .1), scale.z * .55, a);
        }
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
        const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#e2f3eb', vertexColors: true,
          transparent: true, opacity: .28, metalness: .08, roughness: .11, clearcoat: 1,
          clearcoatRoughness: .08, depthWrite: false, side: THREE.DoubleSide });
        const panes = new THREE.Mesh(glazing, glassMaterial);
        panes.renderOrder = 3;
        this.group.add(panes);
        this.disposables.push(glazing, glassMaterial);
      }
    }
    const foliageAtlas = loader.load(`${import.meta.env.BASE_URL}textures/foliage.webp`);
    foliageAtlas.colorSpace = THREE.SRGBColorSpace;
    foliageAtlas.anisotropy = 4;
    const foliageMaterial = new THREE.MeshStandardMaterial({ map: foliageAtlas, vertexColors: true,
      alphaTest: .43, side: THREE.DoubleSide, roughness: .88, metalness: 0 });
    const foliageGeometry = foliage.geometry();
    this.canopy = new THREE.Mesh(foliageGeometry, foliageMaterial);
    this.canopy.castShadow = settings.graphics === 'high';
    this.canopy.receiveShadow = false;
    this.group.add(this.canopy);
    this.disposables.push(foliageAtlas, foliageMaterial, foliageGeometry);
    for (const surface of surfaces) {
      const geometries = buckets[surface];
      if (!geometries.length) continue;
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const material = materialFor(surface);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = surface === 'plaster' || surface === 'brick' || surface === 'stone' || surface === 'timber' || surface === 'metal' || surface === 'roof';
      mesh.receiveShadow = surface !== 'leaf';
      this.group.add(mesh); this.disposables.push(merged);
      this.disposables.push(material);
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
    for (let x = -100; x <= 15; x += 8) for (const z of [-100, 15]) {
      add(posts, cylinder, '#ffe6a0', x, terrainHeight(x, z) + 1.3, z, .12, 2.6, .12);
      add(posts, box, '#f7c76f', x + .38, terrainHeight(x, z) + 2.52, z, .9, .42, .035);
    }
    for (let z = -92; z < 15; z += 8) for (const x of [-100, 15]) {
      add(posts, cylinder, '#ffe6a0', x, terrainHeight(x, z) + 1.3, z, .12, 2.6, .12);
    }
    for (const [x, z, dx, dz] of [[-42.5, -100, 115, 0], [-42.5, 15, 115, 0], [-100, -42.5, 0, 115], [15, -42.5, 0, 115]]) {
      add(lines, box, '#f2bb60', x, terrainHeight(x, z) + 2.35, z, dx || .035, .035, dz || .035);
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
    this.canopy.castShadow = settings.graphics === 'high';
    this.mist.visible = settings.graphics === 'high';
    this.mist.material instanceof THREE.MeshBasicMaterial && (this.mist.material.opacity = settings.graphics === 'high' ? .025 : 0);
    for (const { material, normal, rough } of this.surfaceMaterials) {
      const nextNormal = settings.graphics === 'low' ? null : normal;
      const nextRough = settings.graphics === 'low' ? null : rough;
      if (material.normalMap !== nextNormal || material.roughnessMap !== nextRough) {
        material.normalMap = nextNormal; material.roughnessMap = nextRough; material.needsUpdate = true;
      }
    }
    if (this.water.material instanceof THREE.MeshPhysicalMaterial) {
      const next = settings.graphics === 'low' ? null : this.waterNormals;
      if (this.water.material.normalMap !== next) { this.water.material.normalMap = next; this.water.material.needsUpdate = true; }
      this.water.material.clearcoat = settings.graphics === 'low' ? .25 : 1;
      this.water.material.normalScale.setScalar(settings.graphics === 'low' ? .24 : .42);
      this.water.material.roughness = settings.graphics === 'low' ? .29 : .22;
    }
  }

  update(time: number) {
    this.cascadeTime.value = time;
    this.waterNormals.offset.set(time * .025, time * .014);
    this.smallWaterNormals.offset.set(time * .013, -time * .08);
    if (this.water.material instanceof THREE.MeshPhysicalMaterial) this.water.material.opacity = .92 + Math.sin(time * .55) * .012;
    if (this.shore.material instanceof THREE.ShaderMaterial) this.shore.material.uniforms.uTime.value = time;
    this.mist.position.x = Math.sin(time * .03) * 2;
    this.mist.position.z = Math.cos(time * .04) * 2;
  }

  dispose() { this.disposables.forEach(value => value.dispose()); }
}
