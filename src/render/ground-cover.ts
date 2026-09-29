import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colliderGrid } from '../shared/collider-grid';
import { fbm, terrainColor, terrainHeight, WORLD_PALETTE } from '../shared/terrain';
import { ROADS } from '../shared/layout';
import type { Settings, WorldSpec } from '../shared/types';
import { createToonMaterial } from './materials';
import { GROUND_TILES, type GroundTile } from './vegetation/atlas';

const CELL = 24;
/** Cells nearer than this (metres from the camera to the cell) draw the full nine-blade lawn tuft. */
const LAWN_NEAR = 10;
/** Painted grass reach per preset. Tufts shrink into the ground over the outer quarter of the reach. */
export const GROUND_COVER = {
  low: { fraction: 0, distance: 0 },
  medium: { fraction: .8, distance: 34 },
  high: { fraction: 1, distance: 44 },
} as const;
/** Tallest ground cover (dune and wild grass), metres. Never enough to hide a crouched capybara (1.3 m). */
export const GROUND_COVER_MAX_HEIGHT = .62;

const grassy = new Set<string>([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass]);
const sandy = new Set<string>([WORLD_PALETTE.sand, WORLD_PALETTE.sandLight]);
const hash = (x: number, z: number, salt: number) => {
  let n = Math.imul(x + salt * 31, 374761393) ^ Math.imul(z - salt * 17, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

interface CardSet { tile: GroundTile; width: number; height: number; cards: number; lean?: number; flat?: boolean }

/** A tuft of painted cards crossing at its root. Vertex colour darkens the base into the ground;
 * `coverRoot` (the tuft's root) and `coverSway` (0 at the root, 1 at the tips) drive wind and fade. */
function tuft({ tile, width, height, cards, lean = .12, flat }: CardSet, base: THREE.Color, tip: THREE.Color, root = new THREE.Vector3(), yaw = 0,
  ground?: (x: number, z: number) => number) {
  const t = GROUND_TILES[tile], positions: number[] = [], uvs: number[] = [], colors: number[] = [], roots: number[] = [], sway: number[] = [], index: number[] = [];
  for (let c = 0; c < cards; c++) {
    const a = yaw + c * Math.PI / cards, ca = Math.cos(a), sa = Math.sin(a), first = positions.length / 3;
    for (let row = 0; row <= 2; row++) for (const side of [0, 1]) {
      const v = row / 2, u = side, across = (u - t.root[0]) * width;
      // Flat cards lie on the ground (clover, leaves); upright ones bow outward toward their tips.
      const up = flat ? .018 : v * height, out = flat ? (v - .5) * height : v * v * height * lean * (c % 2 ? 1 : -1);
      const px = root.x + ca * across - sa * out, pz = root.z + sa * across + ca * out;
      // Every card follows the real heightfield under it, so tufts on a slope neither float nor sink.
      positions.push(px, ground ? ground(px, pz) + (flat ? .018 : up - .02) : root.y + up, pz);
      uvs.push(t.u0 + (t.u1 - t.u0) * u, t.v0 + (t.v1 - t.v0) * v);
      const color = base.clone().lerp(tip, flat ? .6 : Math.pow(v, .7));
      colors.push(color.r, color.g, color.b); roots.push(root.x, root.y, root.z); sway.push(flat ? 0 : v * v);
    }
    for (let row = 0; row < 2; row++) {
      const a0 = first + row * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      index.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('coverRoot', new THREE.Float32BufferAttribute(roots, 3));
  g.setAttribute('coverSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('coverPaint', new THREE.Float32BufferAttribute(new Array(positions.length / 3).fill(1), 1));
  g.setIndex(index);
  return g;
}

/** The lawn: a tuft of plain curved blades, no texture and no alpha test. Colour runs from a dark
 * root to lit tips; each instance multiplies in the ground albedo under it, so a lawn is the
 * terrain's own paint standing up. */
function bladeTuft(blades: number, widen = 1) {
  const positions: number[] = [], colors: number[] = [], roots: number[] = [], sway: number[] = [], index: number[] = [];
  const p = new THREE.Vector3();
  for (let b = 0; b < blades; b++) {
    const a = b * 2.399 + hash(b, 1, 40) * .6, ca = Math.cos(a), sa = Math.sin(a);
    const r = .02 + Math.sqrt(hash(b, 2, 40)) * .13, height = .17 + hash(b, 3, 40) * .19, lean = .2 + hash(b, 4, 40) * .35;
    const width = (.036 + hash(b, 5, 40) * .018) * widen, first = positions.length / 3;
    const rx = ca * r, rz = sa * r, side = [-sa, ca];
    const at = (t: number) => p.set(rx + ca * lean * height * t * t, height * t, rz + sa * lean * height * t * t);
    for (const [t, w, shade] of [[0, 1, .6], [.55, .62, .98], [1, 0, 1.2]] as const) {
      at(t);
      const tint = [shade * (t > .5 ? 1.03 : 1), shade * (t > .5 ? 1.07 : 1), shade * (t > .5 ? .86 : 1)];
      if (w > 0) for (const sgn of [-1, 1]) {
        positions.push(p.x + side[0] * width * w * sgn * .5, p.y, p.z + side[1] * width * w * sgn * .5);
        colors.push(...tint); roots.push(0, 0, 0); sway.push(t * t);
      } else { positions.push(p.x, p.y, p.z); colors.push(...tint); roots.push(0, 0, 0); sway.push(1); }
    }
    index.push(first, first + 1, first + 3, first, first + 3, first + 2, first + 2, first + 3, first + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(0), 2));
  g.setAttribute('coverRoot', new THREE.Float32BufferAttribute(roots, 3));
  g.setAttribute('coverSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('coverPaint', new THREE.Float32BufferAttribute(new Array(positions.length / 3).fill(0), 1));
  g.setIndex(index);
  return g;
}

const ACCENTS = {
  wild: { tile: 'wild-grass', width: .62, height: .58, cards: 3, lean: .16 },
  dune: { tile: 'dune-grass', width: .7, height: .52, cards: 3, lean: .2 },
  impatiens: { tile: 'impatiens', width: .5, height: .28, cards: 2, lean: .05 },
  flowers: { tile: 'wildflowers', width: .34, height: .34, cards: 2, lean: .04 },
  clover: { tile: 'clover', width: .42, height: .38, cards: 1, flat: true },
  leaves: { tile: 'fallen-leaves', width: .4, height: .32, cards: 1, flat: true },
} as const satisfies Record<string, CardSet>;
type Accent = keyof typeof ACCENTS;

/** The terrain colour map's grass albedo at a point: the same continuous blend of the three grass
 * paints that scripts/generate-terrain-colors.ts bakes, so tufts can take the ground's own colour. */
const soften = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const GRASS = new THREE.Color(WORLD_PALETTE.grass), GRASS_LIGHT = new THREE.Color(WORLD_PALETTE.grassLight), DRY = new THREE.Color(WORLD_PALETTE.dryGrass);
function groundPaint(x: number, z: number, target = new THREE.Color()) {
  const greenMix = soften((fbm(x / 36 + 7, z / 36 + 3) + .2) / .4), dryMix = soften((fbm(x / 48 - 4, z / 48 + 9) - .18) / .24);
  return target.copy(GRASS).lerp(GRASS_LIGHT, greenMix).lerp(DRY, dryMix);
}

/** Instance tint that brings a painted tile's mean colour to a target albedo (linear), so a tuft
 * reads as the ground's own grass rather than a dark dot on it. */
function matchTint(tile: GroundTile, target: THREE.Color, strength = .9) {
  const mean = GROUND_TILES[tile].mean ?? [.5, .5, .5], out = new THREE.Color();
  const have = new THREE.Color().setRGB(mean[0], mean[1], mean[2], THREE.SRGBColorSpace);
  const channel = (want: number, got: number) => THREE.MathUtils.lerp(1, THREE.MathUtils.clamp(want / Math.max(.02, got), .35, 3.2), strength);
  return out.setRGB(channel(target.r, have.r), channel(target.g, have.g), channel(target.b, have.b));
}
function groundTint(tile: GroundTile, target: THREE.Color) {
  const c = matchTint(tile, target);
  return { base: c.clone().multiplyScalar(.72), tip: c.clone().multiplyScalar(1.04) };
}

export class GroundCover {
  readonly group = new THREE.Group();
  // Ground cover does not write depth: the depth-based ink pass would outline every tuft as a
  // sticker. It draws after the opaque world (renderOrder), so it still hides behind solids.
  private readonly material = createToonMaterial('foliage', { vertexColors: true, side: THREE.DoubleSide, roughness: 1, alphaTest: .42, depthWrite: false });
  private readonly time = { value: 0 };
  private readonly eye = { value: new THREE.Vector3() };
  private readonly reach = { value: GROUND_COVER.medium.distance as number };
  private readonly lawnGeometry: THREE.BufferGeometry;
  /** The same tufts with fewer blades, for cells beyond LAWN_NEAR. */
  private readonly farLawnGeometry: THREE.BufferGeometry;
  private readonly cells: { x: number; z: number; lawn: THREE.InstancedMesh | null; accents: THREE.Mesh | null; count: number }[] = [];
  private quality: Settings['graphics'] = 'medium';

  constructor(world: WorldSpec, atlas?: THREE.Texture) {
    this.material.map = atlas ?? null;
    const compile = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (shader, renderer) => {
      compile.call(this.material, shader, renderer);
      shader.uniforms.coverTime = this.time; shader.uniforms.coverEye = this.eye; shader.uniforms.coverReach = this.reach;
      shader.vertexShader = 'attribute vec3 coverRoot;attribute float coverSway,coverPaint;varying float vCoverPaint;uniform float coverTime,coverReach;uniform vec3 coverEye;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vCoverPaint = coverPaint;
          vec3 coverLocal = coverRoot;
          #ifdef USE_INSTANCING
            coverLocal = (instanceMatrix * vec4(coverRoot, 1.0)).xyz;
          #endif
          vec3 coverWorld = (modelMatrix * vec4(coverLocal, 1.0)).xyz;
          float coverFade = 1.0 - smoothstep(coverReach * .74, coverReach, length(coverWorld.xz - coverEye.xz));
          float coverWind = sin(coverTime * 1.7 + coverWorld.x * .31 + coverWorld.z * .19) * .055 + sin(coverTime * 2.9 + coverWorld.z * .63 + coverWorld.x * .21) * .022;
          transformed.x += coverWind * coverSway;
          transformed.z += coverWind * .5 * coverSway;
          // Distant tufts sink into the ground instead of popping out.
          transformed = coverRoot + (transformed - coverRoot) * coverFade;
        `);
      shader.fragmentShader = 'varying float vCoverPaint;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            diffuseColor *= mix(vec4(1.0), texture2D(map, vMapUv), vCoverPaint);
          #endif`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal *= faceDirection; nonPerturbedNormal = normal;')
        .replace('#include <alphatest_fragment>', `
          #ifdef USE_ALPHATEST
            // Mip averaging thins painted blades with distance: lower the cut so tufts keep their body.
            float threshold = mix(alphaTest, .2, smoothstep(10.0, 30.0, length(vViewPosition)));
            if (diffuseColor.a < threshold) discard;
          #endif`);
    };
    this.material.customProgramCacheKey = () => 'painted-ground-cover-v8';
    this.group.name = 'ground-cover';
    // The lawn tuft carries only its root-to-tip light; each instance carries the ground's albedo.
    this.lawnGeometry = bladeTuft(9); this.farLawnGeometry = bladeTuft(5, 1.2);
    const grid = colliderGrid(world);
    const dunes = world.objects.filter(object => object.detail === 'dune-grass');
    const trees = world.objects.filter(object => (object.kind === 'tree' || object.kind === 'palm') && object.scale.y >= 2.5);
    const paving = world.objects.filter(o => o.detail === 'prop:plaza' || o.detail === 'floor' || o.detail === 'courtyard' || o.detail === 'path' || o.detail?.includes('pavement'));
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const half = world.size / 2, albedo = new THREE.Color();
    for (let cz = Math.floor(-half / CELL); cz < Math.ceil(half / CELL); cz++) for (let cx = Math.floor(-half / CELL); cx < Math.ceil(half / CELL); cx++) {
      const x0 = cx * CELL, z0 = cz * CELL;
      const solids = grid.query(x0 - 1, z0 - 1, x0 + CELL + 1, z0 + CELL + 1);
      const roads = ROADS.filter(([a, b, c, d]) => a < x0 + CELL + 3 && c > x0 - 3 && b < z0 + CELL + 3 && d > z0 - 3);
      const paved = paving.filter(o => Math.abs(o.pos.x - x0 - CELL / 2) < o.scale.x / 2 + CELL / 2 + 2 && Math.abs(o.pos.z - z0 - CELL / 2) < o.scale.z / 2 + CELL / 2 + 2);
      const shade = trees.filter(t => t.pos.x > x0 - 6 && t.pos.x < x0 + CELL + 6 && t.pos.z > z0 - 6 && t.pos.z < z0 + CELL + 6);
      const blocked = (x: number, z: number, y: number, margin: number) =>
        solids.some(c => c.min.y < y + .5 && c.max.y > y - .05 && x > c.min.x - margin && x < c.max.x + margin && z > c.min.z - margin && z < c.max.z + margin);
      const onRoad = (x: number, z: number, margin: number) => roads.some(([a, b, c, d]) => x > a - margin && x < c + margin && z > b - margin && z < d + margin);
      const onPaving = (x: number, z: number, margin: number) => paved.some(o => Math.abs(x - o.pos.x) < o.scale.x / 2 + margin && Math.abs(z - o.pos.z) < o.scale.z / 2 + margin);
      const lawn: THREE.Matrix4[] = [], lawnColors: THREE.Color[] = [], accents: THREE.BufferGeometry[] = [];
      const accent = (kind: Accent, x: number, y: number, z: number, seed: number, tint: { base: THREE.Color; tip: THREE.Color }, size = 1) => {
        const spec = ACCENTS[kind], s = size * (.8 + seed * .4);
        const height = 'flat' in spec ? spec.height * s : Math.min(spec.height * s, GROUND_COVER_MAX_HEIGHT);
        accents.push(tuft({ ...spec, width: spec.width * s, height }, tint.base, tint.tip, new THREE.Vector3(x - x0, y - .01, z - z0), seed * Math.PI * 2,
          (lx, lz) => terrainHeight(lx + x0, lz + z0)));
      };
      // Jittered grid: every 0.4 m square gets one candidate, so coverage has no random holes.
      const step = .4, n = CELL / step;
      for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
        const gx = cx * n + ix, gz = cz * n + iz;
        const x = x0 + (ix + hash(gx, gz, 1)) * step, z = z0 + (iz + hash(gx, gz, 2)) * step;
        const y = terrainHeight(x, z), slope = Math.max(Math.abs(terrainHeight(x + .4, z) - y), Math.abs(terrainHeight(x, z + .4) - y)) / .4;
        if (y < .3 || slope > .75) continue;
        const paint = terrainColor(x, z, y, slope);
        const grass = grassy.has(paint), sand = sandy.has(paint);
        if (!grass && !sand) continue;
        if (onRoad(x, z, .3) || onPaving(x, z, .15) || blocked(x, z, y, .12)) continue;
        const r = hash(gx, gz, 3), r2 = hash(gx, gz, 4);
        if (sand) {
          // Dune grass only inside the authored dune patches; the open beach stays clean sand.
          const inDune = dunes.some(p => ((x - p.pos.x) / (p.scale.x * .6)) ** 2 + ((z - p.pos.z) / (p.scale.z * .6)) ** 2 < 1);
          if (inDune && r < .16) accent('dune', x, y, z, r2, groundTint('dune-grass', new THREE.Color('#C9C98A')));
          continue;
        }
        // Lawn density follows broad painted clumps: lush patches, thinner worn ones, never uniform speckle.
        const clump = .5 + .5 * fbm(x / 7 + 13, z / 7 - 5), edge = onRoad(x, z, 1.6) || onPaving(x, z, 1.2) || blocked(x, z, y, 1.0);
        const density = .42 + .58 * THREE.MathUtils.smoothstep(clump, .15, .6);
        if (r < density) {
          const size = .85 + r2 * .5 + (edge ? .15 : 0);
          position.set(x - x0, y - .02, z - z0);
          const normal = new THREE.Vector3(-(terrainHeight(x + .25, z) - terrainHeight(x - .25, z)) / .5, 1, -(terrainHeight(x, z + .25) - terrainHeight(x, z - .25)) / .5).normalize();
          rotation.setFromAxisAngle(up, r2 * Math.PI * 2).premultiply(new THREE.Quaternion().setFromUnitVectors(up, normal.lerp(up, .5).normalize()));
          lawn.push(new THREE.Matrix4().compose(position, rotation, scale.set(size, size * (.85 + r * .3), size)));
          // Tint jitter keeps a lawn from reading as one flat colour.
          lawnColors.push(groundPaint(x, z, albedo).clone().multiplyScalar(.92 + hash(gx, gz, 7) * .14));
        }
        // Accents: wild grass where mowers never reach (walls, roads, tree feet), flowers and clover in patches.
        const underTree = shade.find(t => Math.hypot(x - t.pos.x, z - t.pos.z) < t.scale.y * .34);
        const flowerPatch = fbm(x / 5 - 31, z / 5 + 17) > .38, cloverPatch = fbm(x / 4 + 71, z / 4 - 3) > .45;
        const r3 = hash(gx, gz, 5);
        const tint = groundTint('wild-grass', groundPaint(x, z, albedo));
        if (edge && r3 < .045) accent('wild', x, y, z, r2, tint);
        else if (underTree && r3 < .05) accent('leaves', x, y, z, r2, { base: new THREE.Color(.95, .9, .82), tip: new THREE.Color(1, .96, .88) });
        else if (underTree && r3 < .065) accent('wild', x, y, z, r2, tint, .85);
        else if (flowerPatch && r3 < .03) accent(r2 < .55 ? 'impatiens' : 'flowers', x, y, z, hash(gx, gz, 6), { base: new THREE.Color(.9, .92, .86), tip: new THREE.Color(1.04, 1.04, 1) });
        else if (cloverPatch && r3 < .02) accent('clover', x, y, z, r2, { base: new THREE.Color(.92, .95, .88), tip: new THREE.Color(1, 1, .96) });
      }
      if (!lawn.length && !accents.length) continue;
      let lawnMesh: THREE.InstancedMesh | null = null;
      if (lawn.length) {
        lawnMesh = new THREE.InstancedMesh(this.lawnGeometry, this.material, lawn.length);
        lawn.forEach((m, i) => { lawnMesh!.setMatrixAt(i, m); lawnMesh!.setColorAt(i, lawnColors[i]); });
        lawnMesh.position.set(x0, 0, z0); lawnMesh.name = `grass:${cx}:${cz}`; lawnMesh.receiveShadow = true; lawnMesh.renderOrder = 2;
        lawnMesh.computeBoundingBox(); lawnMesh.computeBoundingSphere();
        if (lawnMesh.boundingSphere) lawnMesh.boundingSphere.radius += .3;
        this.group.add(lawnMesh);
      }
      let accentMesh: THREE.Mesh | null = null;
      if (accents.length) {
        const merged = mergeGeometries(accents)!; accents.forEach(g => g.dispose());
        accentMesh = new THREE.Mesh(merged, this.material); accentMesh.position.set(x0, 0, z0); accentMesh.receiveShadow = true; accentMesh.renderOrder = 2;
        accentMesh.name = `grass-accents:${cx}:${cz}`;
        this.group.add(accentMesh);
      }
      this.cells.push({ x: x0 + CELL / 2, z: z0 + CELL / 2, lawn: lawnMesh, accents: accentMesh, count: lawn.length });
    }
  }

  setQuality(quality: Settings['graphics']) {
    this.quality = quality; this.group.visible = quality !== 'low'; this.reach.value = GROUND_COVER[quality].distance;
    for (const cell of this.cells) {
      if (cell.lawn) cell.lawn.count = Math.floor(cell.count * GROUND_COVER[quality].fraction);
      if (quality === 'low') { if (cell.lawn) cell.lawn.visible = false; if (cell.accents) cell.accents.visible = false; }
    }
  }

  update(camera: THREE.Camera, time: number, reducedMotion: boolean) {
    if (this.quality === 'low') return;
    this.time.value = reducedMotion ? 0 : time; this.eye.value.copy(camera.position);
    const reach = GROUND_COVER[this.quality].distance;
    for (const cell of this.cells) {
      const distance = Math.hypot(Math.max(0, Math.abs(cell.x - camera.position.x) - CELL / 2), Math.max(0, Math.abs(cell.z - camera.position.z) - CELL / 2));
      if (cell.lawn) {
        cell.lawn.visible = reach > 0 && distance < reach;
        // Past a few metres a tuft is a handful of pixels: draw it with five blades instead of nine.
        cell.lawn.geometry = distance < LAWN_NEAR ? this.lawnGeometry : this.farLawnGeometry;
      }
      if (cell.accents) cell.accents.visible = reach > 0 && distance < reach;
    }
  }

  dispose() {
    for (const cell of this.cells) { cell.lawn?.dispose(); cell.accents?.geometry.dispose(); }
    this.lawnGeometry.dispose(); this.farLawnGeometry.dispose(); this.material.dispose(); this.group.clear();
  }
}
