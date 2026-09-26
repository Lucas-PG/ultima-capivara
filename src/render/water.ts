import * as THREE from 'three';
import { terrainHeight } from '../shared/terrain';
import { RIVER } from '../shared/layout';
import type { Settings, WorldSpec } from '../shared/types';
import { WATER_LEVEL as LEVEL, WATER_HALF_SIZE } from '../shared/water';

const WATER = { shallow: '#71AE91', middle: '#2B8F93', deep: '#14566D', foam: '#D9E8CD', sky: '#A3CBD4', horizon: '#E4CAAC' } as const;
const DEPTH_RANGE = 12, SHORE_RANGE = 16;

export class PaintedWater {
  readonly mesh: THREE.Mesh;
  readonly contacts: THREE.InstancedMesh;
  private readonly depth: THREE.DataTexture;
  private readonly time = { value: 0 };
  private readonly detail = { value: 1 };

  constructor(world: WorldSpec, terrain: THREE.BufferGeometry, anisotropy = 1) {
    // Keep the exact rendered samples at the shore, but extend the bathymetry
    // beyond its square boundary using the shared coast. Distance to dry land
    // deepens the offshore shelf organically, including outside the height grid.
    const positions = terrain.getAttribute('position'), terrainSide = Math.round(Math.sqrt(positions.count));
    const stride = world.size / (terrainSide - 1), padding = Math.ceil(100 / stride), side = terrainSide + padding * 2;
    const fieldSize = (side - 1) * stride, depths = new Float32Array(side * side), distance = new Float32Array(side * side);
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      const tx = x - padding, tz = z - padding, i = z * side + x;
      const height = tx >= 0 && tz >= 0 && tx < terrainSide && tz < terrainSide
        ? positions.getY(tz * terrainSide + tx) : terrainHeight(x * stride - fieldSize / 2, z * stride - fieldSize / 2);
      depths[i] = Math.max(0, LEVEL - height); distance[i] = depths[i] > 0 ? 1e6 : 0;
    }
    // Two chamfer sweeps, once during loading. No per-frame coast queries.
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      const i = z * side + x;
      if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
      if (z) distance[i] = Math.min(distance[i], distance[i - side] + 1,
        x ? distance[i - side - 1] + Math.SQRT2 : 1e6, x + 1 < side ? distance[i - side + 1] + Math.SQRT2 : 1e6);
    }
    for (let z = side - 1; z >= 0; z--) for (let x = side - 1; x >= 0; x--) {
      const i = z * side + x;
      if (x + 1 < side) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      if (z + 1 < side) distance[i] = Math.min(distance[i], distance[i + side] + 1,
        x ? distance[i + side - 1] + Math.SQRT2 : 1e6, x + 1 < side ? distance[i + side + 1] + Math.SQRT2 : 1e6);
    }
    // One filtered lookup carries depth, the river's flow vector and distance
    // to the bank. This replaces five texture fetches in the old water shader.
    const values = new Uint8Array(depths.length * 4);
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      const i = z * side + x, wx = x * stride - fieldSize / 2, wz = z * stride - fieldSize / 2;
      const depth = Math.max(depths[i], Math.max(0, distance[i] * stride - 6) * .16);
      const dx = (depths[z * side + Math.min(side - 1, x + 1)] - depths[z * side + Math.max(0, x - 1)]) / (2 * stride);
      const dz = (depths[Math.min(side - 1, z + 1) * side + x] - depths[Math.max(0, z - 1) * side + x]) / (2 * stride);
      const shore = Math.min(distance[i] * stride, depths[i] / Math.max(.015, Math.hypot(dx, dz)));
      let flowX = 0, flowZ = 0, flowWeight = 0;
      for (let segment = 1; segment < RIVER.length; segment++) {
        const [ax, az, aw] = RIVER[segment - 1], [bx, bz, bw] = RIVER[segment];
        const rx = bx - ax, rz = bz - az, length = Math.hypot(rx, rz);
        const t = THREE.MathUtils.clamp(((wx - ax) * rx + (wz - az) * rz) / (length * length), 0, 1);
        const width = THREE.MathUtils.lerp(aw, bw, t), away = Math.hypot(wx - ax - rx * t, wz - az - rz * t);
        const weight = 1 - THREE.MathUtils.smoothstep(away, width * .5, width * .5 + 6);
        flowX += rx / length * weight; flowZ += rz / length * weight; flowWeight += weight;
      }
      const river = Math.min(1, flowWeight);
      flowX = THREE.MathUtils.lerp(.32, flowX / Math.max(.001, flowWeight) * .7, river);
      flowZ = THREE.MathUtils.lerp(-.1, flowZ / Math.max(.001, flowWeight) * .7, river);
      values[i * 4] = Math.round(Math.min(1, depth / DEPTH_RANGE) * 255);
      values[i * 4 + 1] = Math.round((flowX * .5 + .5) * 255);
      values[i * 4 + 2] = Math.round((flowZ * .5 + .5) * 255);
      values[i * 4 + 3] = Math.round(Math.min(1, shore / SHORE_RANGE) * 255);
    }
    this.depth = new THREE.DataTexture(values, side, side);
    this.depth.minFilter = THREE.LinearMipmapLinearFilter; this.depth.magFilter = THREE.LinearFilter;
    this.depth.generateMipmaps = true; this.depth.anisotropy = anisotropy; this.depth.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        depthField: { value: this.depth }, grid: { value: side }, islandSize: { value: fieldSize }, uTime: this.time, uDetail: this.detail,
        shallow: { value: new THREE.Color(WATER.shallow) }, middle: { value: new THREE.Color(WATER.middle) },
        deep: { value: new THREE.Color(WATER.deep) }, foam: { value: new THREE.Color(WATER.foam) },
        sky: { value: new THREE.Color(WATER.sky) }, horizonColor: { value: new THREE.Color(WATER.horizon) },
      }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      vertexShader: `varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D depthField;uniform float grid,islandSize,uTime,uDetail;
        uniform vec3 shallow,middle,deep,foam,sky,horizonColor;varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);}
        float paintedRipple(vec2 p){
          vec2 cell=floor(p),f=fract(p);float seed=hash(cell);
          float x=(f.x-.5)*2.0,center=.3+hash(cell+vec2(7.1,2.3))*.32;
          float edge=f.y-center-.14*x*x;
          float stroke=1.0-smoothstep(.015,.015+max(.025,fwidth(p.y)*1.1),abs(edge));
          return stroke*(1.0-smoothstep(.35,.85,abs(x)))*smoothstep(.35,.65,seed);
        }
        void main(){
          vec2 uv=vWorld.xz/islandSize+.5;
          vec2 sampleUV=(uv*(grid-1.0)+.5)/grid;
          vec4 field=texture2D(depthField,sampleUV);
          float depth=field.r*12.0,shoreDistance=field.a*16.0;
          vec2 flow=field.gb*2.0-1.0;
          vec2 p=vWorld.xz-flow*uTime*.45;
          float brush=noise(p*.31),wash=noise(p*.071+vec2(9.0,3.0));
          float phase=dot(p,vec2(2.1,1.3))+brush*1.7;
          float crossPhase=dot(p,vec2(-.9,2.6))+wash*.9;
          float distanceToEye=distance(vWorld,cameraPosition);
          float detailFade=1.0-smoothstep(24.0,95.0,distanceToEye);
          vec3 color=mix(shallow,middle,smoothstep(.12,1.15,depth));
          color=mix(color,deep,smoothstep(.8,3.4,depth));
          color*=.88+wash*.2+brush*.08;
          float waveFilter=1.0-smoothstep(.5,2.0,max(fwidth(phase),fwidth(crossPhase)));
          vec2 slope=vec2(cos(phase)*.065,cos(crossPhase)*.045)*waveFilter;
          vec3 waterNormal=normalize(vec3(-slope.x,1.0,-slope.y));
          vec3 viewDirection=normalize(cameraPosition-vWorld);
          float fresnel=.06+.55*pow(1.0-max(0.0,dot(viewDirection,waterNormal)),3.0);
          vec3 reflection=mix(sky,horizonColor,pow(1.0-max(0.0,viewDirection.y),5.0));
          reflection*=.82+wash*.15+brush*.1;
          color=mix(color,reflection,fresnel);
          float ribbons=paintedRipple(p*vec2(.72,1.55));
          color=mix(color,foam,ribbons*.13*detailFade);
          if(uDetail>.5){
            float fine=paintedRipple(p*vec2(1.6,3.2)+vec2(9.3,6.7));
            color=mix(color,foam,fine*.06*detailFade);
            float caustic=pow(.5+.5*sin(phase*.8)*cos(crossPhase*.7),8.0);
            color+=foam*caustic*.075*(1.0-smoothstep(.3,1.5,depth))*detailFade;
          }
          float bankWave=shoreDistance-(.13+.09*sin(uTime*.65+wash*5.0));
          float bank=(1.0-smoothstep(.04,.2,abs(bankWave)))*smoothstep(0.0,.07,depth);
          float lace=(.45+.55*smoothstep(.3,.66,brush))*(.85+.15*sin(uTime*.7+phase*.1));
          color=mix(color,foam,bank*lace*.68);
          vec3 sunDirection=normalize(vec3(-70.0,32.0,-30.0));
          vec3 halfDirection=normalize(viewDirection+sunDirection);
          float sunFacing=max(0.0,dot(waterNormal,halfDirection));
          float sunlight=pow(sunFacing,65.0)*.28+pow(sunFacing,180.0)*.9*(.65+.35*sin(phase));
          color+=vec3(1.0,.69,.32)*sunlight;
          // Dissolve into the sky haze before the far clip or the ocean mesh edge.
          // At the 120 m plane view this spans about 50 pixels at 1080p.
          float horizon=1.0-smoothstep(500.0,750.0,distanceToEye);
          float absorption=.18+.8*(1.0-exp(-depth*1.7));
          float alpha=smoothstep(0.0,.1,depth)*absorption;
          gl_FragColor=vec4(color,max(alpha,bank*lace*.62)*horizon);
          #include <fog_fragment>
        }`,
    });
    // UniformsUtils clones values; restore the shared clock for both materials.
    material.uniforms.uTime = this.time; material.uniforms.uDetail = this.detail; material.uniforms.depthField.value = this.depth;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(WATER_HALF_SIZE * 2, WATER_HALF_SIZE * 2), material);
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = LEVEL; this.mesh.renderOrder = 1;

    const contacts = world.colliders.filter(collider => collider.material !== 'earth' && collider.min.y <= LEVEL && collider.max.y > LEVEL);
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const sizes = new Float32Array(contacts.length * 2);
    const contactMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { foam: { value: new THREE.Color(WATER.foam) }, uTime: this.time }]),
      transparent: true, depthWrite: false, fog: true,
      vertexShader: `attribute vec2 contactSize;varying vec2 vUv,vSize;varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){vUv=uv;vSize=contactSize;vec4 p=instanceMatrix*vec4(position,1.0);vWorld=(modelMatrix*p).xyz;
          vec4 mvPosition=modelViewMatrix*p;gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 foam;uniform float uTime;varying vec2 vUv,vSize;varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main(){vec2 q=abs((vUv-.5)*vSize)-(vSize*.5-.6);
          float d=length(max(q,0.0))+min(max(q.x,q.y),0.0);
          float phase=vWorld.x*.8+vWorld.z*.5-uTime*.6;
          float wash=.5+.3*sin(phase)+.2*sin(vWorld.x*3.1-vWorld.z*2.7+uTime*.4);
          float band=d-.06*sin(phase);
          float alpha=smoothstep(-.02,.05,band)*(1.0-smoothstep(.06,.27,band))*.4*wash;
          gl_FragColor=vec4(foam,alpha);
          #include <fog_fragment>
        }`,
    });
    contactMaterial.uniforms.uTime = this.time;
    this.contacts = new THREE.InstancedMesh(geometry, contactMaterial, contacts.length);
    const transform = new THREE.Object3D();
    contacts.forEach((collider, i) => {
      const width = collider.max.x - collider.min.x + 1.2, depth = collider.max.z - collider.min.z + 1.2;
      sizes[i * 2] = width; sizes[i * 2 + 1] = depth;
      transform.position.set((collider.max.x + collider.min.x) / 2, LEVEL + .015, (collider.max.z + collider.min.z) / 2);
      transform.scale.set(width, 1, depth); transform.updateMatrix(); this.contacts.setMatrixAt(i, transform.matrix);
    });
    geometry.setAttribute('contactSize', new THREE.InstancedBufferAttribute(sizes, 2));
    this.contacts.renderOrder = 2;
  }
  setQuality(quality: Settings['graphics']) { this.detail.value = quality === 'low' ? 0 : 1; }
  update(time: number, reducedMotion: boolean) { this.time.value = reducedMotion ? 0 : time; }
  dispose() {
    this.depth.dispose();
    for (const mesh of [this.mesh, this.contacts]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.contacts.dispose();
  }
}
