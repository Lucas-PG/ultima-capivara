import * as THREE from 'three';
import { terrainHeight } from '../shared/terrain';
import type { WorldSpec } from '../shared/types';

const WATER = { shallow: '#2EC4B6', middle: '#1FB0AE', deep: '#0E7C86', foam: '#F4FBF6' } as const;
const LEVEL = -.05, DEPTH_RANGE = 12;

export class PaintedWater {
  readonly mesh: THREE.Mesh;
  readonly contacts: THREE.InstancedMesh;
  private readonly depth: THREE.DataTexture;
  private readonly time = { value: 0 };

  constructor(world: WorldSpec, terrain: THREE.BufferGeometry) {
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
    const values = new Uint8Array(depths.length);
    for (let i = 0; i < values.length; i++) values[i] = Math.round(THREE.MathUtils.clamp(
      Math.max(depths[i], Math.max(0, distance[i] * stride - 6) * .16) / DEPTH_RANGE, 0, 1) * 255);
    this.depth = new THREE.DataTexture(values, side, side, THREE.RedFormat);
    this.depth.minFilter = this.depth.magFilter = THREE.LinearFilter; this.depth.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        depthField: { value: this.depth }, grid: { value: side }, islandSize: { value: fieldSize }, uTime: this.time,
        shallow: { value: new THREE.Color(WATER.shallow) }, middle: { value: new THREE.Color(WATER.middle) },
        deep: { value: new THREE.Color(WATER.deep) }, foam: { value: new THREE.Color(WATER.foam) },
      }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      vertexShader: `varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D depthField;uniform float grid,islandSize,uTime;
        uniform vec3 shallow,middle,deep,foam;varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 uv=vWorld.xz/islandSize+.5;
          vec2 sampleUV=(uv*(grid-1.0)+.5)/grid;
          float depth=texture2D(depthField,sampleUV).r*12.0;
          vec2 stepUV=vec2(1.0/grid,0.0);
          float dx=texture2D(depthField,sampleUV+stepUV).r-texture2D(depthField,sampleUV-stepUV).r;
          float dz=texture2D(depthField,sampleUV+stepUV.yx).r-texture2D(depthField,sampleUV-stepUV.yx).r;
          float slope=length(vec2(dx,dz))*12.0*(grid-1.0)/(2.0*islandSize);
          float shoreDistance=depth/max(.015,slope);
          vec3 color=mix(shallow,middle,smoothstep(.3,3.0,depth));
          color=mix(color,deep,smoothstep(3.0,10.0,depth));
          float broadWave=.5+.5*sin(vWorld.x*.18+vWorld.z*.12-uTime*.4);
          float shore=(1.0-smoothstep(.18,1.05,shoreDistance))*(.35+.65*broadWave);
          color=mix(color,foam,shore*.55);
          vec2 cell=vWorld.xz/6.0, local=fract(cell)-.5;
          float glint=(1.0-smoothstep(.07,.12,abs(local.x)))*(1.0-smoothstep(.012,.025,abs(local.y)));
          glint*=step(.82,hash(floor(cell)))*smoothstep(.55,.95,.5+.5*sin(uTime*.7+hash(floor(cell))*6.28));
          glint*=1.0-smoothstep(20.0,60.0,distance(vWorld,cameraPosition));
          color=mix(color,foam,glint*.35);
          // Dissolve into the sky haze before the far clip or the ocean mesh edge.
          // At the 120 m plane view this spans about 50 pixels at 1080p.
          float horizon=1.0-smoothstep(500.0,750.0,distance(vWorld,cameraPosition));
          gl_FragColor=vec4(color,smoothstep(0.0,.35,shoreDistance)*.96*horizon);
          #include <fog_fragment>
        }`,
    });
    // UniformsUtils clones values; restore the shared clock for both materials.
    material.uniforms.uTime = this.time; material.uniforms.depthField.value = this.depth;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), material);
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
          float wash=.7+.3*sin(vWorld.x*.8+vWorld.z*.5-uTime*.4);
          float alpha=smoothstep(-.02,.06,d)*(1.0-smoothstep(.08,.48,d))*.55*wash;
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
  update(time: number, reducedMotion: boolean) { this.time.value = reducedMotion ? 0 : time; }
  dispose() {
    this.depth.dispose();
    for (const mesh of [this.mesh, this.contacts]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.contacts.dispose();
  }
}
