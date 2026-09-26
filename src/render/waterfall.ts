import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MapObject, Settings, WorldSpec } from '../shared/types';

const noise = `
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
`;

function streams(marker: MapObject, low: boolean) {
  const positions: number[] = [], uvs: number[] = [], seeds: number[] = [], indices: number[] = [];
  const count = low ? 4 : 7, steps = low ? 14 : 30, width = marker.scale.x, height = marker.scale.y;
  const reach = Math.min(5.6, Math.max(2.6, height * .31));
  for (let stream = 0; stream < count; stream++) {
    const seed = stream * 2.37 + .6, center = (stream / (count - 1) - .5) * width * .79;
    const span = width / count * (1.05 + .36 * Math.sin(seed)), offset = positions.length / 3;
    for (let row = 0; row <= steps; row++) for (let column = 0; column <= 4; column++) {
      const t = row / steps, u = column / 4;
      const fringe = 1 + Math.sin(t * 11 + seed) * .08 + t ** 4 * .35;
      positions.push(center + (u - .5) * span * fringe + Math.sin(t * 4 + seed) * t * .18,
        height / 2 - height * t * t,
        -.9 + reach * t + Math.sin(seed) * t * .24 + Math.sin(u * Math.PI) * .09);
      uvs.push(u, t); seeds.push(seed);
      if (row < steps && column < 4) {
        const a = offset + row * 5 + column;
        indices.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('flowSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Curved falling ribbons, water-contact foam and a small GPU-animated spray. */
export function createWaterfalls(world: Pick<WorldSpec, 'objects'>, quality: Settings['graphics'] = 'medium') {
  const group = new THREE.Group(); group.name = 'Cachoeiras';
  const clock = { value: 0 }, geometries: THREE.BufferGeometry[] = [];
  const flowMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: clock, deep: { value: new THREE.Color('#5CABA6') }, white: { value: new THREE.Color('#E1EFE0') },
    }]), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `attribute float flowSeed;varying vec2 vUv;varying float vSeed;varying vec3 vNormal;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vSeed=flowSeed;vNormal=normalize(normalMatrix*normal);
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime;uniform vec3 deep,white;varying vec2 vUv;varying float vSeed;varying vec3 vNormal;
      #include <fog_pars_fragment>
      ${noise}
      void main(){
        vec2 flow=vec2(vUv.x*4.5+vSeed,vUv.y*14.0-uTime*2.6);
        float broad=noise(flow),fine=noise(flow*vec2(2.8,.7)+vec2(7.0,uTime*.4));
        float broken=noise(vec2(vUv.x*11.0+vSeed,vUv.y*28.0-uTime*4.0));
        float edge=smoothstep(0.0,.17+fine*.12,vUv.x)*smoothstep(0.0,.17+broad*.12,1.0-vUv.x);
        float impact=smoothstep(.72,1.0,vUv.y),crest=1.0-smoothstep(.0,.18,vUv.y);
        float froth=smoothstep(.34,.82,broad*.68+fine*.32)+impact*.22+crest*.35;
        vec3 color=mix(deep,white,clamp(.28+froth*.72,0.0,1.0));
        color*=.90+.10*abs(vNormal.z);
        float alpha=edge*(.55+froth*.35)*mix(1.0,smoothstep(.12,.55,broken),impact*.6);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const foamMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: clock, white: { value: new THREE.Color('#D9F1DC') } }]),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime;uniform vec3 white;varying vec2 vUv;
      #include <fog_pars_fragment>
      ${noise}
      void main(){vec2 q=(vUv-.5)*2.0;float d=length(q);float paint=noise(q*7.0+vec2(uTime*.3,-uTime*.18));
        float ring=1.0-smoothstep(.025,.11,abs(fract(d*2.6-uTime*.25)-.45));
        float core=1.0-smoothstep(.08,.7,d);float alpha=(core*(.48+paint*.4)+ring*.22)*(1.0-smoothstep(.65,1.0,d));
        gl_FragColor=vec4(white,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const sprayMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: clock, white: { value: new THREE.Color('#D8EEE2') } }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute vec4 spray;varying vec2 vUv;varying float vLife;
      uniform float uTime;
      #include <fog_pars_vertex>
      void main(){vUv=uv;float life=fract(uTime*.16+spray.w);vLife=life;
        vec3 center=vec3(spray.x+sin(life*4.0+spray.w*11.0)*life*.7,spray.y+life*2.5,spray.z+life*.65);
        vec4 mvPosition=modelViewMatrix*vec4(center,1.0);
        mvPosition.xy+=position.xy*(.7+life*1.7);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 white;varying vec2 vUv;varying float vLife;
      #include <fog_pars_fragment>
      ${noise}
      void main(){vec2 q=(vUv-.5)*2.0;float edge=1.0-smoothstep(.2,.95,length(q));
        float paint=noise(q*3.5+vLife*2.0);float fade=sin(vLife*3.14159);
        gl_FragColor=vec4(white,edge*fade*(.1+paint*.16));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const materials = [flowMaterial, foamMaterial, sprayMaterial];
  materials.forEach(material => { material.uniforms.uTime = clock; });
  const levels: { near: THREE.Mesh; far: THREE.Mesh; spray: THREE.InstancedMesh }[] = [];
  for (const marker of world.objects.filter(object => object.detail === 'waterfall')) {
    const fall = new THREE.Group(); fall.position.copy(marker.pos); fall.rotation.y = marker.rotation ?? 0; group.add(fall);
    const near = new THREE.Mesh(streams(marker, false), flowMaterial), far = new THREE.Mesh(streams(marker, true), flowMaterial);
    near.name = 'Água em queda'; far.name = 'Água em queda leve'; fall.add(near, far); geometries.push(near.geometry, far.geometry);
    near.renderOrder = far.renderOrder = 2;
    const reach = Math.min(5.6, Math.max(2.6, marker.scale.y * .31));
    const base = new THREE.PlaneGeometry(marker.scale.x * 1.55, 6).rotateX(-Math.PI / 2).translate(0, -marker.scale.y / 2 + .065, reach - .3);
    const crest = new THREE.PlaneGeometry(marker.scale.x * 1.15, 2.6).rotateX(-Math.PI / 2).translate(0, marker.scale.y / 2 + .02, -1.45);
    const foamGeometry = mergeGeometries([base, crest])!; base.dispose(); crest.dispose(); geometries.push(foamGeometry);
    const foam = new THREE.Mesh(foamGeometry, foamMaterial); foam.renderOrder = 3; fall.add(foam);
    const sprayGeometry = new THREE.PlaneGeometry(1, 1), particles = new Float32Array(24 * 4);
    for (let i = 0; i < 24; i++) {
      const a = i * 2.399, radius = .5 + Math.sqrt(i / 24) * marker.scale.x * .52;
      particles.set([Math.cos(a) * radius, -marker.scale.y / 2 + .2 + i % 3 * .15, reach - .5 + Math.sin(a) * 1.6, i / 24], i * 4);
    }
    sprayGeometry.setAttribute('spray', new THREE.InstancedBufferAttribute(particles, 4)); geometries.push(sprayGeometry);
    const spray = new THREE.InstancedMesh(sprayGeometry, sprayMaterial, 24); spray.renderOrder = 4;
    spray.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -marker.scale.y / 2 + 2, reach), marker.scale.x * .7 + 5);
    fall.add(spray); levels.push({ near, far, spray });
  }
  const setQuality = (value: Settings['graphics']) => {
    for (const level of levels) { level.near.visible = value !== 'low'; level.far.visible = value === 'low'; level.spray.count = value === 'low' ? 6 : 24; }
  };
  setQuality(quality);
  let disposed = false;
  return { group, setQuality,
    update(time: number, reducedMotion = false) { clock.value = reducedMotion ? 0 : time; },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); geometries.forEach(geometry => geometry.dispose());
      levels.forEach(level => level.spray.dispose()); materials.forEach(material => material.dispose()); },
  };
}
