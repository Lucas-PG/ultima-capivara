import * as THREE from 'three';
import { KIT_PIECES } from '../shared/kit-collision';
import type { ActorState, KitPlacement, MudBathSpec, Settings, TrampolineSpec, Vec3, WorldSpec } from '../shared/types';
import type { AssetLoader } from './assets';
import { KIT_ASSET_PATH } from './kit';

const noise = `
  float mudHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float mudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mudHash(i),mudHash(i+vec2(1,0)),f.x),mix(mudHash(i+vec2(0,1)),mudHash(i+1.0),f.x),f.y);}
`;

interface Site {
  kind: 'mud_bath' | 'trampoline'; placement: KitPlacement; spec: MudBathSpec | TrampolineSpec;
  group: THREE.Group; lod: THREE.LOD; surface: number; radius: number;
  dip: { value: number }; bounceAge: { value: number }; bouncedAt: number;
  contacts?: THREE.Vector4[]; bubbles?: THREE.InstancedMesh; steam?: THREE.InstancedMesh;
  leaves?: THREE.InstancedMesh; detail?: THREE.Group;
}

// The GLB uses normalized integer positions. Dequantize before transforming;
// metre coordinates written into Int16 attributes would otherwise wrap.
function copyGeometry(mesh: THREE.Mesh) {
  const geometry = mesh.geometry.clone();
  for (const name of Object.keys(geometry.attributes)) {
    const source = geometry.getAttribute(name), values = new Float32Array(source.count * source.itemSize);
    for (let i = 0; i < source.count; i++) for (let c = 0; c < source.itemSize; c++) values[i * source.itemSize + c] = source.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, source.itemSize));
  }
  return geometry.applyMatrix4(mesh.matrixWorld);
}

function softenMat(geometry: THREE.BufferGeometry, surface: number, steps: number) {
  if (steps < 2) return;
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const source = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => ({ name, attribute, values: Array.from(attribute.array) }));
  const indices: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let count = position.count;
  for (let face = 0; face < source.length; face += 3) {
    const corners = source.slice(face, face + 3);
    a.fromBufferAttribute(position, corners[0]); b.fromBufferAttribute(position, corners[1]); c.fromBufferAttribute(position, corners[2]);
    if (corners.some(i => Math.abs(position.getY(i) - surface) > .009 || normal.getY(i) < .95) ||
      Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)) < .25) { indices.push(...corners); continue; }
    // Keep the original UVs/paint. Only the wide top fans need enough radial
    // vertices to form a soft bowl; rim stitching and distant geometry stay cheap.
    const point = (u: number, v: number) => {
      for (const { attribute, values } of attributes) for (let component = 0; component < attribute.itemSize; component++)
        values.push(attribute.getComponent(corners[0], component) * (1 - u - v) +
          attribute.getComponent(corners[1], component) * u + attribute.getComponent(corners[2], component) * v);
      indices.push(count++);
    };
    for (let i = 0; i < steps; i++) for (let j = 0; j < steps - i; j++) {
      point(i / steps, j / steps); point((i + 1) / steps, j / steps); point(i / steps, (j + 1) / steps);
      if (i + j < steps - 1) { point((i + 1) / steps, j / steps); point((i + 1) / steps, (j + 1) / steps); point(i / steps, (j + 1) / steps); }
    }
  }
  for (const { name, attribute, values } of attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
  geometry.setIndex(indices);
}

function floatingLeaf() {
  const positions = [0, .014, 0], colors = [.22, .36, .12], indices: number[] = [];
  const count = 12;
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2, notch = i === 0 || i === count ? .45 : 1;
    positions.push(Math.cos(angle) * .18 * notch, Math.sin(angle * 2) * .014, Math.sin(angle) * .105);
    const shade = .9 + Math.sin(angle) * .12;
    colors.push(.32 * shade, .45 * shade, .16 * shade);
    if (i < count) indices.push(0, i + 2, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** The six authored play sites, with animated surfaces and no gameplay geometry. */
export class RecreationView {
  readonly group = new THREE.Group();
  readonly pieceIds = new Set<string>();
  readonly ready: Promise<void>;
  private readonly sites: Site[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly instances: THREE.InstancedMesh[] = [];
  private readonly clock = { value: 0 };
  private readonly detail = { value: 1 };
  private readonly temp = new THREE.Object3D();
  private time = 0;
  private disposed = false;
  private releaseSource: (() => void) | null = null;
  private quality: Settings['graphics'];

  constructor(world: Pick<WorldSpec, 'pieces' | 'mudBaths' | 'trampolines'>, assets: AssetLoader, quality: Settings['graphics'] = 'medium') {
    this.group.name = 'Banhos e trampolins'; this.quality = quality;
    for (const [kind, specs] of [['mud_bath', world.mudBaths], ['trampoline', world.trampolines]] as const) {
      const definition = KIT_PIECES[kind], deck = definition.colliders[0];
      if (deck.type !== 'cylinder' || !definition.interaction) continue;
      for (const spec of specs ?? []) {
        const placement = world.pieces?.find(piece => piece.id === spec.id && piece.piece === kind);
        if (!placement) continue;
        this.pieceIds.add(placement.id);
        const group = new THREE.Group(), lod = new THREE.LOD();
        group.name = `recreation:${placement.id}`; group.position.copy(placement);
        group.rotation.y = placement.yaw; group.scale.setScalar(placement.scale ?? 1);
        lod.autoUpdate = false; group.add(lod); this.group.add(group);
        const site: Site = { kind, placement, spec, group, lod, surface: definition.interaction.surfaceY,
          radius: deck.radius, dip: { value: 0 }, bounceAge: { value: 5 }, bouncedAt: -Infinity };
        this.sites.push(site);
        if (kind === 'mud_bath') this.createMud(site);
      }
    }
    // AssetLoader caches the promise. The ordinary kit remains the owner of the
    // source geometry and maps; this view owns only its geometry/material clones.
    const ownsSource = !(world.pieces ?? []).some(piece => !this.pieceIds.has(piece.id));
    this.ready = this.sites.length ? assets.gltf(KIT_ASSET_PATH).then(asset => {
      if (ownsSource) {
        const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
        asset.scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          resources.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            resources.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
          }
        });
        this.releaseSource = () => resources.forEach(resource => resource.dispose());
      }
      if (this.disposed) { this.releaseSource?.(); this.releaseSource = null; return; }
      asset.scene.updateMatrixWorld(true);
      const geometryCache = new Map<string, THREE.BufferGeometry>();
      for (const site of this.sites) {
        const source = asset.scene.getObjectByName(`${site.kind}_LOD0`) as THREE.Mesh | undefined;
        if (!source?.isMesh || Array.isArray(source.material) || !(source.material instanceof THREE.MeshStandardMaterial))
          throw new Error(`Peça de recreação ausente: ${site.kind}.`);
        const material = source.material.clone(); this.materials.add(material);
        material.metalness = 0; material.roughness = .86;
        this.stylePiece(material, site);
        for (let level = 0; level < 3; level++) {
          const key = `${site.kind}_LOD${level}`, model = asset.scene.getObjectByName(key) as THREE.Mesh | undefined;
          if (!model?.isMesh) throw new Error(`Detalhe de recreação ausente: ${key}.`);
          let geometry = geometryCache.get(key);
          if (!geometry) {
            geometry = copyGeometry(model);
            if (site.kind === 'trampoline') softenMat(geometry, site.surface, level === 0 ? 4 : level === 1 ? 2 : 1);
            geometry.computeBoundingSphere(); geometryCache.set(key, geometry); this.geometries.add(geometry);
          }
          const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.name = key;
          // Contact AO grounds these low rims; no extra sun-shadow submissions.
          site.lod.addLevel(mesh, level === 2 ? 55 : level ? 22 : 0, .12);
        }
      }
    }) : Promise.resolve();
    void this.ready.catch(() => {});
    this.setQuality(quality);
  }

  private stylePiece(material: THREE.MeshStandardMaterial, site: Site) {
    const mud = site.kind === 'mud_bath';
    material.onBeforeCompile = shader => {
      shader.uniforms.playDip = site.dip;
      shader.uniforms.playBounceAge = site.bounceAge;
      shader.uniforms.playSurface = { value: site.surface };
      shader.uniforms.playRadius = { value: site.radius };
      shader.vertexShader = `varying vec3 vPlayPoint,vPlayX,vPlayZ;uniform float playDip,playSurface,playRadius;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vPlayPoint=position;vPlayX=normalize(normalMatrix*vec3(1,0,0));vPlayZ=normalize(normalMatrix*vec3(0,0,1));
          ${mud ? '' : `float matMask=step(playSurface-.052,position.y)*step(position.y,playSurface+.009);
          float bowl=pow(max(0.0,1.0-dot(position.xz,position.xz)/pow(playRadius*.91,2.0)),2.0);
          transformed.y+=playDip*bowl*matMask;`}`);
      shader.fragmentShader = `varying vec3 vPlayPoint,vPlayX,vPlayZ;uniform float playSurface,playRadius,playBounceAge,playDip;\n${shader.fragmentShader}`;
      if (mud) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float wetRim=(1.0-smoothstep(playSurface-.015,playSurface+.14,vPlayPoint.y))*
            smoothstep(playRadius*.87,playRadius*.98,length(vPlayPoint.xz));
          diffuseColor.rgb*=mix(1.0,.54,wetRim);`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.26,wetRim);');
      } else {
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float mat=step(playSurface-.008,vPlayPoint.y)*step(vPlayPoint.y,playSurface+.009)*
            (1.0-smoothstep(playRadius*.86,playRadius*.92,length(vPlayPoint.xz)));
          float radius=length(vPlayPoint.xz),width=max(fwidth(radius)*1.2,.006);
          float stripe=1.0-smoothstep(.012,.012+width,abs(sin(radius*12.0)));
          diffuseColor.rgb*=1.0+stripe*.24*mat;
          float boing=(1.0-smoothstep(.015,.055+width,abs(radius-playBounceAge*3.5)))*
            (1.0-smoothstep(.25,.65,playBounceAge));
          diffuseColor.rgb+=vec3(.13,.17,.10)*boing*mat;`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            float bowlRadius=pow(playRadius*.91,2.0);
            vec2 slope=-4.0*playDip*max(0.0,1.0-dot(vPlayPoint.xz,vPlayPoint.xz)/bowlRadius)*vPlayPoint.xz/bowlRadius;
            normal=normalize(normal-mat*(vPlayX*slope.x+vPlayZ*slope.y));`);
      }
    };
    material.customProgramCacheKey = () => mud ? 'recreation-wet-rim-v1' : 'recreation-stretch-mat-v1';
  }

  private createMud(site: Site) {
    const detail = new THREE.Group(); detail.name = 'Vida no banho'; site.group.add(detail); site.detail = detail;
    const contacts = Array.from({ length: 4 }, () => new THREE.Vector4()); site.contacts = contacts;
    const bubbles = Array.from({ length: 8 }, (_, i) => {
      const angle = i * 2.399 + .8, radius = (.26 + Math.sqrt(i / 8) * .6) * site.radius;
      return new THREE.Vector4(Math.cos(angle) * radius, Math.sin(angle) * radius, i * .137, .055 + i % 3 * .018);
    });
    const mud = new THREE.MeshPhysicalMaterial({ color: '#78492E', roughness: .28, metalness: 0,
      clearcoat: .45, clearcoatRoughness: .22, envMapIntensity: .7 }); this.materials.add(mud);
    mud.onBeforeCompile = shader => {
      shader.uniforms.mudTime = this.clock; shader.uniforms.mudDetail = this.detail;
      shader.uniforms.mudContacts = { value: contacts }; shader.uniforms.mudBubbles = { value: bubbles };
      shader.vertexShader = `varying vec2 vMudPoint;varying vec3 vMudX,vMudZ;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vMudPoint=position.xz;vMudX=normalize(normalMatrix*vec3(1,0,0));vMudZ=normalize(normalMatrix*vec3(0,0,1));`);
      shader.fragmentShader = `uniform float mudTime,mudDetail;uniform vec4 mudContacts[4],mudBubbles[8];
        varying vec2 vMudPoint;varying vec3 vMudX,vMudZ;${noise}\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 p=vMudPoint;float radius=length(p),angle=atan(p.y,p.x);
          float wash=mudNoise(p*2.7+vec2(mudTime*.025,-mudTime*.013));
          float swirl=sin(angle*2.0-radius*4.5+wash*.8-mudTime*.095);
          float paint=.90+wash*.14+swirl*.035;
          float rings=0.0;
          for(int i=0;i<4;i++){
            float d=length(p-mudContacts[i].xy),phase=fract(mudTime*.55+float(i)*.23);
            float ring=1.0-smoothstep(.012,.035+fwidth(d),abs(d-(.22+phase*.7)));
            rings+=ring*(1.0-phase)*mudContacts[i].w;
          }
          for(int i=0;i<8;i++){
            if(mudDetail<.5 && i>=3)break;
            float phase=fract(mudTime*.17+mudBubbles[i].z);
            float age=max(0.0,(phase-.73)/.27),d=length(p-mudBubbles[i].xy);
            float ring=1.0-smoothstep(.009,.027+fwidth(d),abs(d-(mudBubbles[i].w+age*.16)));
            rings+=ring*(1.0-age)*step(.73,phase)*.6;
          }
          diffuseColor.rgb*=paint;diffuseColor.rgb+=vec3(.11,.065,.027)*min(1.0,rings);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 gradient=vec2(cos(p.x*4.5+swirl+mudTime*.07),sin(p.y*4.1+wash-mudTime*.06));
          normal=normalize(normal-.045*(vMudX*gradient.x+vMudZ*gradient.y));`);
    };
    mud.customProgramCacheKey = () => 'chocolate-spring-v1';
    const circle = new THREE.CircleGeometry(site.radius * .995, 64).rotateX(-Math.PI / 2);
    this.geometries.add(circle);
    const surface = new THREE.Mesh(circle, mud); surface.name = 'Lama viva'; surface.position.y = site.surface + .025;
    surface.receiveShadow = true; site.group.add(surface);

    const bubbleGeometry = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    bubbleGeometry.setAttribute('bubble', new THREE.InstancedBufferAttribute(new Float32Array(bubbles.flatMap(b => b.toArray())), 4));
    this.geometries.add(bubbleGeometry);
    const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#815134', roughness: .25, clearcoat: .45, clearcoatRoughness: .2, envMapIntensity: .7 });
    this.materials.add(bubbleMaterial);
    bubbleMaterial.onBeforeCompile = shader => {
      shader.uniforms.mudTime = this.clock;
      shader.vertexShader = `uniform float mudTime;attribute vec4 bubble;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float life=fract(mudTime*.17+bubble.z);
          float grow=smoothstep(.05,.60,life)*(1.0-smoothstep(.67,.73,life));
          transformed*=vec3(bubble.w*grow,bubble.w*.65*grow,bubble.w*grow);
          transformed+=vec3(bubble.x,${(site.surface + .026).toFixed(5)},bubble.y);`);
    };
    bubbleMaterial.customProgramCacheKey = () => 'lazy-mud-bubbles-v1';
    const caps = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, 8); caps.name = 'Bolhas de lama';
    caps.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, site.surface, 0), site.radius + .2);
    site.bubbles = caps; detail.add(caps); this.instances.push(caps);

    const steamGeometry = new THREE.PlaneGeometry(1, 1), steamSeeds = new Float32Array(8 * 4);
    for (let i = 0; i < 8; i++) steamSeeds.set([bubbles[i].x, bubbles[i].y, i / 8, .28 + i % 3 * .05], i * 4);
    steamGeometry.setAttribute('wisp', new THREE.InstancedBufferAttribute(steamSeeds, 4)); this.geometries.add(steamGeometry);
    const steamMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { mudTime: this.clock, tint: { value: new THREE.Color('#ECDAC2') } }]),
      vertexShader: `uniform float mudTime;attribute vec4 wisp;varying vec2 vUv;varying float vLife;
        #include <fog_pars_vertex>
        void main(){vUv=uv;vLife=fract(mudTime*.11+wisp.z);
          vec3 center=vec3(wisp.x+sin(vLife*4.0+wisp.z*8.0)*.13,${(site.surface + .15).toFixed(5)}+vLife*.9,wisp.y);
          vec4 mvPosition=modelViewMatrix*vec4(center,1.0);
          mvPosition.xy+=position.xy*vec2(wisp.w+vLife*.42,.6+vLife*.65);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 tint;varying vec2 vUv;varying float vLife;
        #include <fog_pars_fragment>
        ${noise}
        void main(){vec2 q=(vUv-.5)*2.0;q.x+=sin(q.y*3.7+vLife*5.0)*.18;
          float edge=1.0-smoothstep(.08,1.0,length(q*vec2(1.5,.85)));
          float paint=mudNoise(q*3.0+vLife*2.0);
          gl_FragColor=vec4(tint,edge*sin(vLife*3.14159)*(.055+paint*.05));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    steamMaterial.uniforms.mudTime = this.clock; this.materials.add(steamMaterial);
    const steam = new THREE.InstancedMesh(steamGeometry, steamMaterial, 8); steam.name = 'Vapor morno';
    steam.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, site.surface + .7, 0), site.radius + 1);
    site.steam = steam; detail.add(steam); this.instances.push(steam);
    const leafGeometry = floatingLeaf(), leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65, side: THREE.DoubleSide });
    this.geometries.add(leafGeometry); this.materials.add(leafMaterial);
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 3); leaves.name = 'Folhas flutuantes';
    leaves.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, site.surface, 0), site.radius + .3);
    leaves.receiveShadow = true; site.leaves = leaves; detail.add(leaves); this.instances.push(leaves);
  }

  setQuality(quality: Settings['graphics']) {
    this.quality = quality; this.detail.value = quality === 'low' ? 0 : 1;
    for (const site of this.sites) {
      if (site.bubbles) site.bubbles.count = quality === 'low' ? 3 : 8;
      if (site.steam) site.steam.count = quality === 'low' ? 2 : 8;
    }
  }

  bounce(position: Vec3) {
    for (const site of this.sites) if (site.kind === 'trampoline' &&
      Math.abs(position.y - site.spec.y) < .7 && Math.hypot(position.x - site.spec.x, position.z - site.spec.z) <= site.spec.radius + .1)
      site.bouncedAt = this.time;
  }

  reset() { for (const site of this.sites) { site.bouncedAt = -Infinity; site.dip.value = 0; site.bounceAge.value = 5; } }

  update(time: number, camera?: THREE.Camera, reducedMotion = false, actors: readonly ActorState[] = [], localActor?: ActorState) {
    if (this.disposed) return;
    this.time = time; this.clock.value = reducedMotion ? 0 : time;
    for (const site of this.sites) {
      if (camera) site.lod.update(camera);
      const age = time - site.bouncedAt;
      site.bounceAge.value = reducedMotion ? 5 : Math.max(0, Math.min(5, age));
      site.dip.value = reducedMotion || age > 1.2 ? 0 : -.19 * Math.sin(age * 19) * Math.exp(-age * 5.8);
      if (!site.contacts) continue;
      const distance = camera ? camera.position.distanceToSquared(site.spec) : 0;
      site.detail!.visible = distance < (this.quality === 'low' ? 22 : 36) ** 2;
      site.steam!.visible = !reducedMotion;
      let index = 0;
      const scale = site.placement.scale ?? 1, cosine = Math.cos(site.placement.yaw), sine = Math.sin(site.placement.yaw);
      for (const source of actors) {
        const actor = localActor?.id === source.id ? localActor : source;
        if (!actor.alive || !actor.grounded || Math.abs(actor.pos.y - site.spec.y) > .45) continue;
        const x = actor.pos.x - site.spec.x, z = actor.pos.z - site.spec.z;
        if (x * x + z * z > site.spec.radius ** 2 || index >= site.contacts.length) continue;
        site.contacts[index++].set((cosine * x - sine * z) / scale, (sine * x + cosine * z) / scale, 0, 1);
      }
      for (; index < site.contacts.length; index++) site.contacts[index].w = 0;
      for (let leaf = 0; leaf < 3; leaf++) {
        const t = this.clock.value, angle = leaf * 2.399 + .5 + t * .018, radius = site.radius * (.5 + leaf * .12);
        this.temp.position.set(Math.cos(angle) * radius, site.surface + .039 + Math.sin(t * .6 + leaf) * .006, Math.sin(angle) * radius);
        this.temp.rotation.set(Math.sin(t * .55 + leaf) * .055, angle + Math.PI * .3, Math.cos(t * .43 + leaf) * .045);
        this.temp.scale.setScalar(1 + leaf * .12); this.temp.updateMatrix(); site.leaves!.setMatrixAt(leaf, this.temp.matrix);
      }
      site.leaves!.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    this.instances.forEach(mesh => mesh.dispose()); this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose()); this.sites.length = 0;
    this.releaseSource?.(); this.releaseSource = null;
  }
}
