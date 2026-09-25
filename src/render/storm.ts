import * as THREE from 'three';
import type { ZoneState } from '../shared/types';

// The storm wall (style bible §11, Forja's approved F3 concept). A violet
// curtain #8A4DFF that is only a surface near you: fragments within about
// 60 m of the camera tint what lies behind the boundary by roughly 20 %, with
// slow rising wisps. Farther away only a faint low haze band remains, so the
// wall never draws stripes across the sky (baseline defect 6).
const COLOR = '#8a4dff';
const HEIGHT = 90, BASE = -6;

export class StormView {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(COLOR) }, uTime: { value: 0 }, uWisps: { value: 60 }, uOutside: { value: 0 },
      },
      vertexShader: `varying vec3 vWorld;varying float vU;
        void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;vU=uv.x;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform vec3 uColor;uniform float uTime,uWisps,uOutside;varying vec3 vWorld;varying float vU;
        float wisp(float count){return .5+.5*sin(vU*6.2831853*count+1.7*sin(vWorld.y*.11-uTime*.6)+uTime*.15);}
        void main(){
          vec3 toCam=vWorld-cameraPosition;
          float d=length(vec3(toCam.x,toCam.y*.35,toCam.z));
          float near=1.0-smoothstep(38.0,60.0,d);
          // Whole number of wisps around the ring, blended so the count can change without a seam or pop.
          float n=floor(uWisps),w=mix(wisp(n),wisp(n+1.0),fract(uWisps));
          float haze=.05*(1.0-smoothstep(3.0,20.0,vWorld.y))*smoothstep(50.0,90.0,d)*(1.0-smoothstep(260.0,380.0,d));
          float a=max(near*(.16+.07*w)*mix(1.0,.6,uOutside),haze);
          if(a<.004)discard;
          gl_FragColor=vec4(uColor,a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 160, 1, true), this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(zone: ZoneState, camera: THREE.Camera, elapsed: number, visible: boolean) {
    this.mesh.visible = visible && zone.radius > .5;
    if (!this.mesh.visible) return;
    this.mesh.position.set(zone.x, BASE + HEIGHT / 2, zone.z);
    this.mesh.scale.set(zone.radius, HEIGHT, zone.radius);
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uWisps.value = Math.max(3, Math.PI * 2 * zone.radius / 6);
    u.uOutside.value = Math.hypot(camera.position.x - zone.x, camera.position.z - zone.z) > zone.radius ? 1 : 0;
  }

  // 0 inside the safe zone, 1 once the viewer is out in the storm.
  static exposure(zone: ZoneState, x: number, z: number) { return Math.hypot(x - zone.x, z - zone.z) > zone.radius ? 1 : 0; }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}
