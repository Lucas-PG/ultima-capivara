import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS } from './effects-atlas';

// GPU-instanced building blocks for EffectsView. Every system preallocates its
// pool and attribute arrays, draws in one call, hides itself when idle and
// never allocates while a match runs.

const FOG_PARS_VERTEX = '\n#include <fog_pars_vertex>\n';
const FOG_PARS_FRAGMENT = '\n#include <fog_pars_fragment>\n';
const INK = new THREE.Color('#3a2418');

const ease = (t: number) => 1 - (1 - t) * (1 - t);
const backOut = (t: number) => { const c = 1.9, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

export const enum Motion { Ballistic, Orbit, Flash, Anchored }

export class Card {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly color = new THREE.Color();
  readonly light = new THREE.Color();
  readonly center = new THREE.Vector3();
  anchor: string | null = null;
  age = 0; life = 0; size0 = .1; size1 = .1; aspect = 1; rot = 0; spin = 0; cell = 0;
  gravity = 0; drag = 0; floor = -Infinity; bounce = 0; alpha = 1; stretch = false;
  minPx = 0; maxPx = 1e5; motion = Motion.Ballistic; pop = false; fadeIn = 0; fadeOut = .35; radius = 0;
  reset() {
    this.anchor = null; this.age = 0; this.life = .3; this.size0 = this.size1 = .1; this.aspect = 1; this.rot = 0; this.spin = 0;
    this.gravity = 0; this.drag = 0; this.floor = -Infinity; this.bounce = 0; this.alpha = 1; this.stretch = false;
    this.minPx = 0; this.maxPx = 1e5; this.motion = Motion.Ballistic; this.pop = false; this.fadeIn = 0; this.fadeOut = .35; this.radius = 0;
    this.vel.set(0, 0, 0); return this;
  }
}

function cardMaterial(atlas: THREE.Texture): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uPx: { value: .001 }, uInk: { value: INK }, uInkMix: { value: .92 } }]),
    vertexShader: `attribute vec3 aPos;attribute vec4 aShape;attribute vec3 aColor;attribute vec3 aLight;attribute vec4 aMisc;attribute vec3 aAxis;
      uniform float uPx;varying vec2 vUv;varying vec3 vColor;varying vec3 vLight;varying float vAlpha;${FOG_PARS_VERTEX}
      void main(){
        vec4 mvPosition=viewMatrix*vec4(aPos,1.0);
        float px=uPx*max(.05,-mvPosition.z);
        vec2 size=aShape.xy;
        size*=clamp(size.y,aMisc.y*px,aMisc.z*px)/max(size.y,1e-5);
        vec2 dir=vec2(cos(aShape.z),sin(aShape.z));
        if(aMisc.w>.5){vec3 ax=(viewMatrix*vec4(aAxis,0.0)).xyz;float l=length(ax.xy);
          if(l>1e-5){dir=ax.xy/l;size.x=max(size.y,size.x*clamp(l/length(ax),.25,1.0));}}
        // Pull the card toward the camera by half its size so surfaces it sprang from do not clip it.
        mvPosition.xyz+=normalize(-mvPosition.xyz)*min(size.y*.5,max(.05,-mvPosition.z)*.5);
        vec2 c=position.xy*size;
        mvPosition.xy+=vec2(c.x*dir.x-c.y*dir.y,c.x*dir.y+c.y*dir.x);
        gl_Position=projectionMatrix*mvPosition;
        vUv=(vec2(mod(aShape.w,${ATLAS_COLUMNS}.0),${ATLAS_ROWS - 1}.0-floor(aShape.w/${ATLAS_COLUMNS}.0))+uv)/vec2(${ATLAS_COLUMNS}.0,${ATLAS_ROWS}.0);
        vColor=aColor;vLight=aLight;vAlpha=aMisc.x;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uAtlas;uniform vec3 uInk;uniform float uInkMix;varying vec2 vUv;varying vec3 vColor;varying vec3 vLight;varying float vAlpha;${FOG_PARS_FRAGMENT}
      void main(){vec4 t=texture2D(uAtlas,vUv);float a=t.a*vAlpha;if(a<.01)discard;
        vec3 c=mix(vColor,vLight,t.r);c=mix(c,uInk,t.g*uInkMix);gl_FragColor=vec4(c,a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  material.uniforms.uAtlas.value = atlas;
  return material;
}

function quad(xFrom: number, xTo: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([xFrom, -.5, 0, xTo, -.5, 0, xTo, .5, 0, xFrom, .5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}
function dynamic(geometry: THREE.BufferGeometry, name: string, count: number, size: number) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
  attribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, attribute); return attribute;
}
function upload(attribute: THREE.InstancedBufferAttribute, count: number) {
  attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count * attribute.itemSize); attribute.needsUpdate = true;
}

// Camera-facing cards (flashes, puffs, chips, stars, sparkles). One pool, one draw call.
export class CardSystem {
  readonly mesh: THREE.Mesh;
  readonly cards: Card[] = [];
  private cursor = 0;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aShape: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aLight: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly aAxis: THREE.InstancedBufferAttribute;
  private readonly attributes: THREE.InstancedBufferAttribute[];
  readonly material: THREE.ShaderMaterial;

  constructor(atlas: THREE.Texture, capacity: number, renderOrder: number) {
    this.geometry = quad(-.5, .5);
    this.aPos = dynamic(this.geometry, 'aPos', capacity, 3); this.aShape = dynamic(this.geometry, 'aShape', capacity, 4);
    this.aColor = dynamic(this.geometry, 'aColor', capacity, 3); this.aLight = dynamic(this.geometry, 'aLight', capacity, 3);
    this.aMisc = dynamic(this.geometry, 'aMisc', capacity, 4); this.aAxis = dynamic(this.geometry, 'aAxis', capacity, 3);
    this.geometry.instanceCount = 0;
    this.material = cardMaterial(atlas);
    this.attributes = [this.aPos, this.aShape, this.aColor, this.aLight, this.aMisc, this.aAxis];
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.mesh.visible = false;
    for (let i = 0; i < capacity; i++) this.cards.push(new Card());
  }

  // Reuses the oldest slot when the pool is full, so a firefight can never exhaust it.
  spawn(): Card {
    for (let n = 0; n < this.cards.length; n++) {
      const card = this.cards[this.cursor]; this.cursor = (this.cursor + 1) % this.cards.length;
      if (card.life <= 0 || card.age >= card.life) return card.reset();
    }
    const card = this.cards[this.cursor]; this.cursor = (this.cursor + 1) % this.cards.length;
    return card.reset();
  }

  clear() { for (const card of this.cards) card.life = 0; }

  update(dt: number, pxPerUnit: number, resolve: (id: string, out: THREE.Vector3) => boolean, reducedMotion = false) {
    this.material.uniforms.uPx.value = pxPerUnit;
    const pos = this.aPos.array as Float32Array, shape = this.aShape.array as Float32Array, color = this.aColor.array as Float32Array;
    const lightArr = this.aLight.array as Float32Array, misc = this.aMisc.array as Float32Array, axis = this.aAxis.array as Float32Array;
    let n = 0;
    for (const c of this.cards) {
      if (c.life <= 0) continue;
      c.age += dt;
      if (c.age >= c.life) { c.life = 0; continue; }
      if (c.anchor !== null && !resolve(c.anchor, c.center)) { c.life = 0; continue; }
      const t = c.age / c.life;
      if (c.motion === Motion.Orbit || c.motion === Motion.Anchored) {
        const a = c.rot + c.spin * c.age;
        c.pos.set(c.center.x + Math.cos(a) * c.radius, c.center.y + c.vel.y * c.age, c.center.z + Math.sin(a) * c.radius);
      } else {
        c.vel.y -= c.gravity * dt;
        if (c.drag) c.vel.multiplyScalar(Math.exp(-c.drag * dt));
        c.pos.addScaledVector(c.vel, dt);
        if (c.pos.y < c.floor) {
          c.pos.y = c.floor;
          if (c.vel.y < 0) { c.vel.y = -c.vel.y * c.bounce; c.vel.x *= .45; c.vel.z *= .45; c.spin *= .4; }
        }
      }
      let size = c.size0 + (c.size1 - c.size0) * ease(t);
      if (c.pop && !reducedMotion) size *= c.age < .14 ? Math.max(.01, backOut(c.age / .14)) : 1;
      let cell = c.cell;
      if (c.motion === Motion.Flash) {
        // Three hand-drawn frames at 60 Hz: full star, turned star, small burst.
        const frame = Math.min(2, Math.floor(c.age * 60));
        cell = c.cell + frame; size *= frame === 0 ? 1 : frame === 1 ? .82 : .55;
      }
      let alpha = c.alpha;
      if (c.fadeIn > 0 && c.age < c.fadeIn) alpha *= c.age / c.fadeIn;
      const fadeFrom = 1 - c.fadeOut;
      if (t > fadeFrom) alpha *= 1 - (t - fadeFrom) / c.fadeOut;
      const i3 = n * 3, i4 = n * 4;
      pos[i3] = c.pos.x; pos[i3 + 1] = c.pos.y; pos[i3 + 2] = c.pos.z;
      shape[i4] = size * c.aspect; shape[i4 + 1] = size; shape[i4 + 2] = c.rot + (c.motion === Motion.Orbit ? 0 : c.spin * c.age); shape[i4 + 3] = cell;
      color[i3] = c.color.r; color[i3 + 1] = c.color.g; color[i3 + 2] = c.color.b;
      lightArr[i3] = c.light.r; lightArr[i3 + 1] = c.light.g; lightArr[i3 + 2] = c.light.b;
      misc[i4] = alpha; misc[i4 + 1] = c.minPx; misc[i4 + 2] = c.maxPx; misc[i4 + 3] = c.stretch ? 1 : 0;
      axis[i3] = c.vel.x; axis[i3 + 1] = c.vel.y; axis[i3 + 2] = c.vel.z;
      n++;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) for (const attribute of this.attributes) upload(attribute, n);
  }

  // Warm-up only: one invisible instance so the program compiles and uploads.
  warm(on: boolean) {
    if (!on) { this.geometry.instanceCount = 0; this.mesh.visible = false; return; }
    (this.aMisc.array as Float32Array).fill(0, 0, 4); upload(this.aMisc, 1);
    this.geometry.instanceCount = 1; this.mesh.visible = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

interface Tracer { from: THREE.Vector3; to: THREE.Vector3; age: number; life: number; width: number; length: number; alpha: number; color: THREE.Color; light: THREE.Color }

// Short painted streaks that travel from the muzzle to the impact. The visible
// segment is a fraction of the path, so a tracer reads as a flying round and
// never as a beam joining the two ends.
export class TracerSystem {
  readonly mesh: THREE.Mesh;
  private readonly tracers: Tracer[] = [];
  private cursor = 0;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly aA: THREE.InstancedBufferAttribute;
  private readonly aB: THREE.InstancedBufferAttribute;
  private readonly aStyle: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aLight: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly attributes: THREE.InstancedBufferAttribute[];

  constructor(capacity: number) {
    this.geometry = quad(0, 1);
    this.aA = dynamic(this.geometry, 'aA', capacity, 3); this.aB = dynamic(this.geometry, 'aB', capacity, 3);
    this.aStyle = dynamic(this.geometry, 'aStyle', capacity, 3);
    this.aColor = dynamic(this.geometry, 'aColor', capacity, 3); this.aLight = dynamic(this.geometry, 'aLight', capacity, 3);
    this.attributes = [this.aA, this.aB, this.aStyle, this.aColor, this.aLight];
    this.geometry.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: .001 } },
      vertexShader: `attribute vec3 aA;attribute vec3 aB;attribute vec3 aStyle;attribute vec3 aColor;attribute vec3 aLight;uniform float uPx;
        varying float vAcross;varying float vAlong;varying float vAlpha;varying vec3 vColor;varying vec3 vLight;
        void main(){
          vec3 a=(viewMatrix*vec4(aA,1.0)).xyz,b=(viewMatrix*vec4(aB,1.0)).xyz;
          vec3 p=mix(a,b,position.x);vec3 s=cross(b-a,p);float l=length(s);s=l>1e-6?s/l:vec3(1.0,0.0,0.0);
          float w=max(aStyle.x,aStyle.z*uPx*max(.05,-p.z))*mix(.35,1.0,position.x);
          p+=s*position.y*w;gl_Position=projectionMatrix*vec4(p,1.0);
          vAcross=position.y*2.0;vAlong=position.x;vAlpha=aStyle.y;vColor=aColor;vLight=aLight;
        }`,
      fragmentShader: `varying float vAcross;varying float vAlong;varying float vAlpha;varying vec3 vColor;varying vec3 vLight;
        void main(){float core=1.0-smoothstep(.3,.45,abs(vAcross));float a=vAlpha*smoothstep(0.0,.4,vAlong)*(1.0-smoothstep(.85,1.0,abs(vAcross)));
          if(a<.01)discard;gl_FragColor=vec4(mix(vColor,vLight,core),a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
    for (let i = 0; i < capacity; i++) this.tracers.push({ from: new THREE.Vector3(), to: new THREE.Vector3(), age: 0, life: 0, width: .02, length: 3, alpha: 1, color: new THREE.Color(), light: new THREE.Color() });
  }

  spawn(from: THREE.Vector3, to: THREE.Vector3, life: number, width: number, alpha: number, color: THREE.Color, light: THREE.Color) {
    const t = this.tracers[this.cursor]; this.cursor = (this.cursor + 1) % this.tracers.length;
    t.from.copy(from); t.to.copy(to); t.age = 0; t.life = life; t.width = width; t.alpha = alpha;
    const distance = from.distanceTo(to); t.length = Math.min(4.5, Math.max(.8, distance * .3));
    t.color.copy(color); t.light.copy(light);
  }

  clear() { for (const t of this.tracers) t.life = 0; }

  update(dt: number, pxPerUnit: number) {
    this.material.uniforms.uPx.value = pxPerUnit;
    const a = this.aA.array as Float32Array, b = this.aB.array as Float32Array, style = this.aStyle.array as Float32Array;
    const color = this.aColor.array as Float32Array, lightArr = this.aLight.array as Float32Array;
    let n = 0;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.age += dt;
      if (t.age >= t.life) { t.life = 0; continue; }
      const distance = t.from.distanceTo(t.to);
      if (distance < 1e-3) { t.life = 0; continue; }
      // The head covers the whole path over the lifetime; the tail trails by `length`.
      const head = Math.min(1, t.age / t.life * 1.15) * (distance + t.length);
      const h = Math.min(distance, head) / distance, tail = Math.max(0, head - t.length) / distance;
      if (tail >= 1) { t.life = 0; continue; }
      const i = n * 3;
      a[i] = t.from.x + (t.to.x - t.from.x) * tail; a[i + 1] = t.from.y + (t.to.y - t.from.y) * tail; a[i + 2] = t.from.z + (t.to.z - t.from.z) * tail;
      b[i] = t.from.x + (t.to.x - t.from.x) * h; b[i + 1] = t.from.y + (t.to.y - t.from.y) * h; b[i + 2] = t.from.z + (t.to.z - t.from.z) * h;
      style[i] = t.width; style[i + 1] = t.alpha; style[i + 2] = 1.4;
      color[i] = t.color.r; color[i + 1] = t.color.g; color[i + 2] = t.color.b;
      lightArr[i] = t.light.r; lightArr[i + 1] = t.light.g; lightArr[i + 2] = t.light.b;
      n++;
    }
    this.geometry.instanceCount = n; this.mesh.visible = n > 0;
    if (n) for (const attribute of this.attributes) upload(attribute, n);
  }

  warm(on: boolean) {
    if (!on) { this.geometry.instanceCount = 0; this.mesh.visible = false; return; }
    (this.aStyle.array as Float32Array).fill(0, 0, 3); upload(this.aStyle, 1);
    this.geometry.instanceCount = 1; this.mesh.visible = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

interface Decal { pos: THREE.Vector3; quat: THREE.Quaternion; age: number; life: number; size0: number; size1: number; spin: number; cell: number; alpha: number; fadeOut: number; color: THREE.Color; light: THREE.Color }

// Flat marks and rings on surfaces: bullet holes and scuffs that fade, water
// ripples and pickup rings that grow. A fixed ring buffer caps the count.
export class DecalSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly decals: Decal[] = [];
  private cursor = 0;
  private readonly aCell: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aLight: THREE.InstancedBufferAttribute;
  private readonly aAlpha: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly spinQuat = new THREE.Quaternion();
  private readonly turned = new THREE.Quaternion();
  private active = 0;

  constructor(atlas: THREE.Texture, capacity: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aLight = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aCell', this.aCell); geometry.setAttribute('aColor', this.aColor);
    geometry.setAttribute('aLight', this.aLight); geometry.setAttribute('aAlpha', this.aAlpha);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null } }]),
      vertexShader: `attribute float aCell;attribute vec3 aColor;attribute vec3 aLight;attribute float aAlpha;
        varying vec2 vUv;varying vec3 vColor;varying vec3 vLight;varying float vAlpha;${FOG_PARS_VERTEX}
        void main(){vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
          vUv=(vec2(mod(aCell,${ATLAS_COLUMNS}.0),${ATLAS_ROWS - 1}.0-floor(aCell/${ATLAS_COLUMNS}.0))+uv)/vec2(${ATLAS_COLUMNS}.0,${ATLAS_ROWS}.0);
          vColor=aColor;vLight=aLight;vAlpha=aAlpha;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uAtlas;varying vec2 vUv;varying vec3 vColor;varying vec3 vLight;varying float vAlpha;${FOG_PARS_FRAGMENT}
        void main(){vec4 t=texture2D(uAtlas,vUv);float a=t.a*vAlpha;if(a<.01)discard;
          gl_FragColor=vec4(mix(mix(vColor,vLight,t.r),vec3(.227,.141,.094),t.g*.9),a);
          #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    material.uniforms.uAtlas.value = atlas;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.visible = false;
    for (let i = 0; i < capacity; i++) {
      this.decals.push({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), age: 0, life: 0, size0: .1, size1: .1, spin: 0, cell: 0, alpha: 1, fadeOut: .3, color: new THREE.Color(), light: new THREE.Color() });
      this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
    }
  }

  // `normal` is the surface normal; the plane is lifted 1.5 cm off the surface.
  spawn(pos: THREE.Vector3, normal: THREE.Vector3, cell: number, size0: number, size1: number, life: number, fadeOut: number, alpha: number, color: THREE.Color, light: THREE.Color, turn: number) {
    const index = this.cursor; this.cursor = (this.cursor + 1) % this.decals.length;
    const d = this.decals[index];
    d.pos.copy(pos).addScaledVector(normal, .015);
    d.quat.setFromUnitVectors(Z_AXIS, normal);
    d.age = 0; d.life = life; d.size0 = size0; d.size1 = size1; d.spin = turn; d.cell = cell; d.alpha = alpha; d.fadeOut = fadeOut;
    d.color.copy(color); d.light.copy(light);
    const colors = this.aColor.array as Float32Array, lights = this.aLight.array as Float32Array, i = index * 3;
    (this.aCell.array as Float32Array)[index] = cell;
    colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
    lights[i] = light.r; lights[i + 1] = light.g; lights[i + 2] = light.b;
    this.active = Math.max(this.active, 1);
    this.aCell.needsUpdate = true; this.aColor.needsUpdate = true; this.aLight.needsUpdate = true;
  }

  clear() { for (const d of this.decals) d.life = 0; this.active = 1; }

  update(dt: number) {
    if (!this.active) return;
    let live = 0;
    const alpha = this.aAlpha.array as Float32Array;
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      if (d.life <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0)); } continue; }
      d.age += dt;
      if (d.age >= d.life) { d.life = 0; alpha[i] = 0; this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0)); continue; }
      live++;
      const t = d.age / d.life, size = d.size0 + (d.size1 - d.size0) * ease(t);
      alpha[i] = d.alpha * (t > 1 - d.fadeOut ? (1 - t) / d.fadeOut : 1);
      this.turned.copy(d.quat).multiply(this.spinQuat.setFromAxisAngle(Z_AXIS, d.spin));
      this.mesh.setMatrixAt(i, this.matrix.compose(d.pos, this.turned, this.scale.set(size, size, size)));
    }
    this.active = live;
    this.mesh.visible = live > 0;
    this.aAlpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true;
  }

  warm(on: boolean) { this.mesh.visible = on || this.active > 0; }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.dispose(); }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Casing { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; age: number; life: number; resting: boolean; bounces: number; shotgun: boolean }

// Brass (or red shotgun) shells. With a ground query they bounce once on the
// terrain or a prop top and come to rest lying flat on it, never below it.
export class CasingSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly casings: Casing[] = [];
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly brass = new THREE.Color('#e9b44c');
  private readonly red = new THREE.Color('#e76f51');
  static readonly RADIUS = .0065;

  constructor(capacity: number, fog: boolean, private readonly ground: ((x: number, z: number, top: number) => number) | null) {
    const geometry = new THREE.CylinderGeometry(CasingSystem.RADIUS, CasingSystem.RADIUS, .026, 7);
    geometry.rotateZ(Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff', fog });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) {
      this.casings.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), age: 0, life: 0, resting: false, bounces: 0, shotgun: false });
      this.mesh.setColorAt(i, this.brass);
    }
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, shotgun: boolean, life: number) {
    const c = this.casings[this.cursor]; this.cursor = (this.cursor + 1) % this.casings.length;
    c.pos.copy(pos); c.vel.copy(vel); c.rot.set(0, Math.random() * Math.PI * 2, 0);
    c.spin.set(8 + Math.random() * 10, 2 + Math.random() * 4, 5 + Math.random() * 8);
    c.age = 0; c.life = life; c.resting = false; c.bounces = 0; c.shotgun = shotgun;
  }

  clear() { for (const c of this.casings) c.life = 0; }

  update(dt: number) {
    let n = 0;
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.age += dt;
      if (c.age >= c.life) { c.life = 0; continue; }
      if (!c.resting) {
        c.vel.y -= 9.8 * dt;
        c.pos.addScaledVector(c.vel, dt);
        c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
        const floor = this.ground ? this.ground(c.pos.x, c.pos.z, c.pos.y + .3) + CasingSystem.RADIUS * (c.shotgun ? 1.6 : 1) : -Infinity;
        if (c.pos.y <= floor) {
          c.pos.y = floor;
          if (c.bounces < 1 && c.vel.y < -1) { c.vel.y = -c.vel.y * .3; c.vel.x *= .4; c.vel.z *= .4; c.spin.multiplyScalar(.5); c.bounces++; }
          else { c.resting = true; c.rot.x = 0; c.rot.z = 0; }
        }
      }
      // Shrink out over the last 0.2 s instead of popping.
      const shrink = Math.min(1, (c.life - c.age) / .2) * (c.shotgun ? 1.6 : 1);
      this.quat.setFromEuler(c.rot);
      this.mesh.setMatrixAt(n, this.matrix.compose(c.pos, this.quat, this.scale.setScalar(shrink)));
      this.mesh.setColorAt(n, c.shotgun ? this.red : this.brass);
      n++;
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }

  warm(on: boolean) {
    this.mesh.count = on ? 1 : 0; this.mesh.visible = on;
    if (on) { this.mesh.setMatrixAt(0, this.matrix.makeScale(0, 0, 0)); this.mesh.instanceMatrix.needsUpdate = true; }
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.dispose(); }
}
