import * as THREE from 'three';
import { terrainHeight } from '../shared/terrain';
import type { Settings } from '../shared/types';

/** One lightweight pollen draw, anchored to the world around the camera. */
export class AmbientLife {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly origin = new THREE.Vector3();
  constructor() {
    const positions = new Float32Array(320 * 3), phases = new Float32Array(320);
    let seed = 7813;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < phases.length; i++) {
      positions.set([random() * 36, .4 + random() * 7, random() * 36], i * 3); phases[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, origin: { value: this.origin }, pixelRatio: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float phase;uniform float time,pixelRatio;uniform vec3 origin;varying float opacity;
        void main(){vec3 p=position;
          p.xz=mod(p.xz-origin.xz+vec2(time*.12),36.0)-18.0+origin.xz;
          p.y+=origin.y+sin(time*.38+phase)*.28;
          p.x+=sin(time*.27+phase)*.45;
          vec4 eye=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*eye;
          float distanceToEye=length(eye.xyz);
          gl_PointSize=clamp(32.0/max(2.0,distanceToEye),1.0,3.0)*pixelRatio;
          opacity=(1.0-smoothstep(12.0,18.0,length(p.xz-origin.xz)))*(.12+.22*pow(.5+.5*sin(phase+time*.4),4.0));
        }`,
      fragmentShader: `varying float opacity;
        void main(){float circle=1.0-smoothstep(.05,.5,length(gl_PointCoord-.5));
          gl_FragColor=vec4(vec3(1.0,.74,.34),opacity*circle);}`,
    });
    this.points = new THREE.Points(geometry, this.material); this.points.frustumCulled = false; this.points.renderOrder = 3;
  }
  update(camera: THREE.Camera, time: number, settings: Settings, pixelRatio: number) {
    this.points.visible = settings.graphics !== 'low' && !settings.reducedMotion;
    this.origin.set(camera.position.x, terrainHeight(camera.position.x, camera.position.z), camera.position.z);
    this.material.uniforms.time.value = time; this.material.uniforms.pixelRatio.value = pixelRatio;
  }
  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.material.dispose(); }
}
