import * as THREE from 'three';
import { fbm } from '../shared/terrain';
import type { MapObject, WorldSpec } from '../shared/types';
import { WATER_LEVEL } from '../shared/water';
import { SUN_DIRECTION } from './materials';

/**
 * The offshore islets every battle royale flies past: steep granite domes (the Brazilian coast's
 * morros, bare rock streaked by rain) over forested shoulders, rocky headlands and sand coves,
 * with surf breaking round them and coconut palms on the beaches. One heightfield mesh and one
 * surf ring for all of them; the canopy, the rock and the sand are painted in the shader in world
 * metres, so they hold up from the plane without any texture download.
 */
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

interface Dome { u: number; v: number; radius: number; height: number; sharp: number; bare: number }
interface Islet { object: MapObject; seed: number; domes: Dome[] }

function islets(world: Pick<WorldSpec, 'objects'>): Islet[] {
  return world.objects.filter(object => object.detail === 'distant-island').map((object, index) => {
    const seed = index * 2.73 + .4, twin = hash(seed) > .45;
    // Three kinds, as along the Brazilian coast: a bare granite sugarloaf, a sharper forested pico
    // with rock only near its summit, and a low islet of rolling forested hills.
    const kind = index % 3, lead = (hash(seed + 1) - .5) * .4;
    const sharp = kind === 1 ? .78 : kind === 0 ? .5 : .7, bare = kind === 0 ? 1 : kind === 1 ? .45 : .1;
    const tall = kind === 2 ? .42 : kind === 1 ? 1.08 : 1;
    const domes: Dome[] = [{ u: lead, v: (hash(seed + 2) - .5) * .2, radius: (kind === 1 ? .42 : .5) + hash(seed + 3) * .12, height: tall, sharp, bare }];
    if (twin) domes.push({ u: lead + (lead > 0 ? -1 : 1) * (.45 + hash(seed + 4) * .1), v: (hash(seed + 5) - .5) * .3, radius: .34 + hash(seed + 6) * .1,
      height: tall * (.5 + hash(seed + 7) * .2), sharp, bare: bare * .8 });
    return { object, seed, domes };
  });
}

/** Height (metres) of an islet at local (u, v) in [-1, 1], and how much of it is bare rock or sand. */
function isletSample(islet: Islet, u: number, v: number) {
  const { object, seed, domes } = islet;
  // Domes no taller than about half the islet is wide: rounded morros, not spires.
  const height = Math.min(object.scale.y * .8, Math.min(object.scale.x, object.scale.z) * .62);
  const warp = fbm(u * 2.6 + seed, v * 2.6 - seed) * .12;
  const r = Math.hypot(u + warp, v - warp * .8);
  const angle = Math.atan2(v, u);
  // Coves and headlands around the coast: coves slope down to a sand apron, headlands end in cliffs.
  const cove = smooth((fbm(Math.cos(angle) * 1.4 + seed * 3, Math.sin(angle) * 1.4 - seed) + .05) / .3);
  const coastWidth = .06 + cove * .3;
  const inland = smooth((.93 - r) / coastWidth);
  // Forested shoulders rising inland in rolling spurs.
  const spurs = fbm(u * 3.2 + seed, v * 3.2 - seed);
  const shoulder = (.08 + .2 * smooth((.95 - r) / .75) + spurs * .07) * inland;
  let peak = 0, rock = 0;
  for (const dome of domes) {
    const d = Math.hypot((u - dome.u) * 1.08, v - dome.v) / dome.radius;
    if (d >= 1) continue;
    // Steep flanks and a rounded crown: the sugarloaf profile, one face steeper than the other.
    const lean = 1 + .25 * Math.sin(Math.atan2(v - dome.v, u - dome.u) + seed * 5);
    const around = Math.atan2(v - dome.v, u - dome.u);
    // Rock ribs down the flanks, where rain has fluted the granite.
    const ribs = (Math.sin(around * 13 + fbm(around * 3, seed) * 4) * .5 + .5) * smooth((d - .35) / .3) * .025 * dome.bare;
    const profile = (Math.pow(Math.max(0, 1 - (d * lean) ** (2 - dome.sharp)), .5 + dome.sharp * .4) + ribs) * dome.height;
    peak = Math.max(peak, profile);
    // Bare granite on the dome's steep flanks, green on its shoulders.
    // Forest climbs the gullies in tongues; the spurs between them stay bare.
    const gully = fbm(Math.atan2(v - dome.v, u - dome.u) * 2.2 + seed, d * 2.5);
    const bareFrom = .22 + (1 - dome.bare) * .0, bareTo = .9 - (1 - dome.bare) * .55;
    rock = Math.max(rock, smooth((d - bareFrom) / .2) * smooth((bareTo - d + gully * .35) / .15) * .95 * Math.min(1, dome.bare + .3));
  }
  const folds = fbm(u * 9 + seed, v * 8 - seed) * .02;
  const land = height * Math.max(shoulder, peak * .85 + shoulder * .35 + folds) * inland;
  // The sand apron of each cove, a metre above the sea, then the seabed falling away.
  const sandApron = cove * 1.3 * smooth((1.0 - r) / .12);
  const y = Math.max(land, sandApron) - 7 * smooth((r - .95) / .12);
  const sand = cove * smooth((land < 1.6 ? 1 : 0) + (1.6 - land) / 1.6) * smooth((1.02 - r) / .1);
  // Headland cliffs: bare rock where the coast drops steeply.
  rock = Math.max(rock, (1 - cove) * smooth((r - .8) / .08));
  return { y, rock, sand, r, angle };
}

/** Local (u, v) to world, in the islet's own footprint. */
const toWorld = (islet: Islet, u: number, v: number) => ({ x: islet.object.pos.x + u * islet.object.scale.x / 2, z: islet.object.pos.z + v * islet.object.scale.z / 2 });

/** Coconut palms on the islets' sand coves (drawn by the vegetation batch like every palm). */
export function isletPalms(world: Pick<WorldSpec, 'objects'>): MapObject[] {
  const palms: MapObject[] = [], all = islets(world);
  /** Ground of every other islet at a world point (neighbouring islets overlap). */
  const other = (self: Islet, x: number, z: number) => Math.max(-Infinity, ...all.filter(o => o !== self).map(o =>
    isletSample(o, (x - o.object.pos.x) / (o.object.scale.x / 2), (z - o.object.pos.z) / (o.object.scale.z / 2)).y));
  for (const islet of all) {
    let placed = 0;
    for (let k = 0; k < 40 && placed < 7; k++) {
      const angle = hash(islet.seed * 11 + k) * Math.PI * 2, r = .86 + hash(islet.seed * 13 + k) * .1;
      const u = Math.cos(angle) * r, v = Math.sin(angle) * r, s = isletSample(islet, u, v);
      if (s.sand < .6 || s.y < .4) continue;
      const { x, z } = toWorld(islet, u, v);
      if (other(islet, x, z) > s.y - .3) continue;
      palms.push({ id: `islet-palm-${palms.length}`, kind: 'palm', detail: 'coconut', pos: { x, y: s.y - .1, z },
        scale: { x: 1, y: 8 + hash(k + islet.seed) * 4, z: 1 }, color: '#5FA544' });
      placed++;
    }
  }
  return palms;
}

const SHADER_HEAD = `
  varying vec3 vIsletWorld;
  varying vec3 vIsletPaint;
  uniform vec3 isletSun;
  uniform float isletTime;
  float isletHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float isletNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(isletHash(i), isletHash(i + vec2(1, 0)), f.x), mix(isletHash(i + vec2(0, 1)), isletHash(i + vec2(1, 1)), f.x), f.y);
  }
  // Nearest crown centre of a jittered grid: offset from it and the crown's own random value.
  vec3 isletCrown(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec3 best = vec3(9.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = vec2(isletHash(i + g), isletHash(i + g + 7.1)) * .8 + .1;
      vec2 d = g + o - f;
      if (dot(d, d) < dot(best.xy, best.xy)) best = vec3(d, isletHash(i + g + 3.3));
    }
    return best;
  }
`;

/** One inexpensive layer of offshore islets, and the surf that breaks round them. */
export function createIslandBackdrop(world: Pick<WorldSpec, 'objects'>) {
  const positions: number[] = [], paint: number[] = [], indices: number[] = [];
  const surfPositions: number[] = [], surfAttr: number[] = [], surfIndices: number[] = [];
  const steps = 80, row = steps + 1, spokes = 128;
  for (const islet of islets(world)) {
    const offset = positions.length / 3;
    for (let iz = 0; iz <= steps; iz++) for (let ix = 0; ix <= steps; ix++) {
      const u = ix / steps * 2.2 - 1.1, v = iz / steps * 2.2 - 1.1, s = isletSample(islet, u, v), { x, z } = toWorld(islet, u, v);
      positions.push(x, s.y, z); paint.push(s.rock, s.sand, hash(islet.seed));
      if (ix < steps && iz < steps) {
        const a = offset + iz * row + ix;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    // The surf ring: from just inside the waterline outward, along the coast found on each spoke.
    const base = surfPositions.length / 3;
    for (let k = 0; k <= spokes; k++) {
      const angle = k / spokes * Math.PI * 2, c = Math.cos(angle), sn = Math.sin(angle);
      let r = 1.1;
      for (let t = 1.1; t > .3; t -= .01) if (isletSample(islet, c * t, sn * t).y > WATER_LEVEL) { r = t; break; }
      const inner = toWorld(islet, c * r, sn * r), reach = 5 + (fbm(c * 2.5 + islet.seed, sn * 2.5 - islet.seed) + .5) * 6;
      const nx = c * islet.object.scale.x / 2, nz = sn * islet.object.scale.z / 2, n = Math.hypot(nx, nz);
      for (const [along, out] of [[-.8, 0], [reach, 1]] as const)
        surfPositions.push(inner.x + nx / n * along, WATER_LEVEL + .06, inner.z + nz / n * along), surfAttr.push(out, k / spokes * 40 + islet.seed * 7);
      if (k < spokes) { const a = base + k * 2; surfIndices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('isletPaint', new THREE.Float32BufferAttribute(paint, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const uniforms = { isletSun: { value: SUN_DIRECTION.clone() }, isletTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec3 isletPaint;\n${SHADER_HEAD}\n${shader.vertexShader}`.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vIsletWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vIsletPaint = isletPaint;`);
    shader.fragmentShader = `${SHADER_HEAD}\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 p = vIsletWorld;
        vec3 n = normalize(cross(dFdx(p), dFdy(p))); n *= sign(n.y + 1e-4);
        float footprint = length(fwidth(p));
        // Canopy: crowns 4 to 6 m across, each lit on its sun side and dark in the gaps between.
        vec2 q = p.xz / 3.4 + vec2(isletNoise(p.xz / 23.0), isletNoise(p.zx / 19.0)) * 1.6;
        vec3 crown = isletCrown(q), small = isletCrown(p.xz / 1.6 + 5.0);
        vec3 crownNormal = normalize(vec3(-crown.x, .75, -crown.y));
        float lit = clamp(dot(crownNormal, isletSun) * .5 + .5, 0.0, 1.0);
        float gap = smoothstep(.66, .38, length(crown.xy));
        float detail = 1.0 - smoothstep(.3, 1.2, footprint);
        // Clumps of several crowns share a green, so the forest reads in masses, not as a tiled floor.
        float clump = isletNoise(p.xz / 14.0 + 2.0);
        vec3 green = mix(vec3(.16, .28, .15), vec3(.27, .4, .19), clump * .7 + crown.z * .3);
        green = mix(green, vec3(.3, .38, .16), smoothstep(.6, .9, isletNoise(p.xz / 31.0)));
        // One crown in forty flowers: yellow and pink ipes dot the forest as on the main island.
        green = mix(green, crown.z > .994 ? vec3(.8, .62, .22) : vec3(.66, .34, .48), step(.988, crown.z) * smoothstep(.5, .15, length(crown.xy)) * .8);
        vec3 canopy = green * mix(.7, 1.18, lit) * mix(.62, 1.0, gap);
        canopy *= mix(1.0, .9 + .2 * isletHash(floor(p.xz / 2.1 + small.xy)), detail);
        // Granite: pale grey-tan, streaked where rain runs down the faces, with dark wet feet.
        vec2 face = abs(n.x) > abs(n.z) ? p.zy : p.xy;
        float streak = smoothstep(.45, .85, isletNoise(vec2(face.x / 2.2, face.y / 16.0))) * (1.0 - abs(n.y));
        float band = isletNoise(vec2(face.x / 9.0, face.y / 3.0));
        vec3 granite = mix(vec3(.47, .45, .41), vec3(.58, .55, .49), band) * (1.0 - streak * .32);
        granite = mix(granite * .55, granite, smoothstep(.3, 2.5, p.y));
        // Sand with a darker wet band at the sea.
        vec3 sand = mix(vec3(.62, .54, .38), vec3(.9, .82, .6), smoothstep(.05, .7, p.y));
        // Rock where the ground is steep or the kit says so; plants cling to the ledges.
        float steep = smoothstep(.5, .28, n.y);
        float rockMask = clamp(max(vIsletPaint.x, steep) - smoothstep(.72, .95, n.y) * .6, 0.0, 1.0);
        rockMask *= smoothstep(.2, .45, isletNoise(p.xz / 6.0 + p.y / 9.0) + rockMask * .6);
        vec3 ground = mix(canopy, granite, rockMask);
        ground = mix(ground, sand, clamp(vIsletPaint.y * smoothstep(.5, .85, n.y) + smoothstep(1.5, .5, p.y) * (1.0 - steep), 0.0, 1.0) * (1.0 - rockMask * .7));
        diffuseColor.rgb = ground;
      }`);
  };
  material.customProgramCacheKey = () => 'offshore-islets-v2';
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Ilhas distantes';
  mesh.castShadow = mesh.receiveShadow = false;

  // Surf: broken white lines rolling onto the islets, fading out to sea.
  const surfGeometry = new THREE.BufferGeometry();
  surfGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfPositions, 3));
  surfGeometry.setAttribute('surf', new THREE.Float32BufferAttribute(surfAttr, 2));
  surfGeometry.setIndex(surfIndices); surfGeometry.computeBoundingSphere();
  const surfMaterial = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, isletTime: uniforms.isletTime }, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 surf; varying vec2 vSurf; varying vec3 vSurfWorld;
      #include <fog_pars_vertex>
      void main() { vSurf = surf; vec4 world = modelMatrix * vec4(position, 1.0); vSurfWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float isletTime; varying vec2 vSurf; varying vec3 vSurfWorld;
      #include <fog_pars_fragment>
      float surfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float surfNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(surfHash(i), surfHash(i + vec2(1, 0)), f.x), mix(surfHash(i + vec2(0, 1)), surfHash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float t = vSurf.x, along = vSurf.y;
        // The wash hugging the rocks, then two lines of breakers rolling in, broken along the coast.
        float wash = 1.0 - smoothstep(.0, .22, t);
        float roll = fract(t * 2.2 + isletTime * .12 + surfNoise(vec2(along * .6, 0.0)) * .5);
        float line = smoothstep(.0, .12, roll) * (1.0 - smoothstep(.12, .32, roll)) * (1.0 - smoothstep(.45, 1.0, t));
        float broken = smoothstep(.3, .7, surfNoise(vec2(along * 1.7, t * 3.0 - isletTime * .2)));
        float foam = max(wash * (.55 + .45 * broken), line * broken * .85);
        gl_FragColor = vec4(vec3(.96, .98, 1.0), clamp(foam * 1.1, 0.0, .95));
        #include <fog_fragment>
      }`,
  });
  const surf = new THREE.Mesh(surfGeometry, surfMaterial); surf.name = 'Arrebentação das ilhas'; surf.renderOrder = 3;
  mesh.add(surf);
  return {
    mesh,
    update(time: number) { uniforms.isletTime.value = time; },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); surfGeometry.dispose(); surfMaterial.dispose(); },
  };
}
