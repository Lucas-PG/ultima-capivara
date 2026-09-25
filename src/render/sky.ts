import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY = {
  top: '#4F9FD0', middle: '#9FD0E0', horizon: '#FFD49A', fog: '#F2DCB6',
  cloud: '#FFF4E2', warm: '#F6B98C', shade: '#C9B2D6', sun: '#FFF1C9',
} as const;

// Original low-frequency painted cloud card. One shared atlas, fixed world-facing
// cards, no camera-facing billboards or alpha-test thresholds that pop in motion.
function cloudTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const lobes = [[103, 171, 87, 46], [163, 123, 69, 70], [245, 95, 80, 78],
    [326, 139, 85, 66], [409, 176, 78, 35], [256, 185, 181, 35]];
  ctx.shadowColor = SKY.cloud; ctx.shadowBlur = 2;
  const body = ctx.createLinearGradient(0, 28, 0, 221);
  body.addColorStop(0, SKY.cloud); body.addColorStop(.58, SKY.cloud);
  body.addColorStop(.8, SKY.warm); body.addColorStop(1, SKY.shade);
  ctx.fillStyle = body;
  ctx.beginPath();
  for (const [x, y, rx, ry] of lobes) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  ctx.fill(); ctx.shadowBlur = 0;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'painted-cumulus'; return texture;
}

export class PaintedSky {
  readonly group = new THREE.Group();
  private readonly clouds: THREE.Mesh;
  private readonly texture = cloudTexture();
  constructor() {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: Object.fromEntries(Object.entries(SKY).map(([name, color]) => [name, { value: new THREE.Color(color) }])),
      vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vDirection;uniform vec3 top,middle,horizon,fog,sun;
        void main(){
          vec3 direction=normalize(vDirection);float h=direction.y;
          vec3 color=mix(horizon,middle,smoothstep(-.02,.3,h));
          color=mix(color,top,smoothstep(.25,.9,h));
          color=mix(fog,color,smoothstep(-.08,.15,h));
          float sunDistance=length(direction-normalize(vec3(-70.0,55.0,-30.0)));
          color=mix(color,sun,.16*exp(-sunDistance*sunDistance/0.012));
          color=mix(color,sun,1.0-smoothstep(.026,.030,sunDistance));
          // Sub-code-value dither prevents gradient banding without visible grain.
          float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
          gl_FragColor=vec4(color+dither/1024.0,1.0);
        }`,
    }));
    dome.renderOrder = -1000; dome.frustumCulled = false; this.group.add(dome);
    const geometries: THREE.BufferGeometry[] = [];
    const transform = new THREE.Object3D();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + .17, height = [145, 185, 110, 225, 155, 205, 125, 195][i];
      transform.position.set(Math.cos(angle) * 470, height, Math.sin(angle) * 470);
      transform.lookAt(0, 0, 0); transform.updateMatrix();
      geometries.push(new THREE.PlaneGeometry(190 + i % 3 * 35, 95 + i % 3 * 17).applyMatrix4(transform.matrix));
    }
    const geometry = mergeGeometries(geometries)!; geometries.forEach(part => part.dispose());
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false });
    this.clouds = new THREE.Mesh(geometry, material); this.clouds.renderOrder = -999; this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }
  update(camera: THREE.Camera, elapsed: number, reducedMotion: boolean) {
    this.group.position.copy(camera.position);
    this.clouds.rotation.y = reducedMotion ? 0 : elapsed * .0008;
  }
  dispose() {
    this.texture.dispose();
    this.group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  }
}
