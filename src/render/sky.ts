import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY = {
  top: '#4F9FD0', middle: '#9FD0E0', horizon: '#FFD49A', fog: '#F2DCB6',
  cloud: '#FFF4E2', warm: '#F6B98C', shade: '#C9B2D6', sun: '#FFF1C9',
} as const;

// Original low-frequency painted cloud card. One shared atlas, fixed world-facing
// cards, no camera-facing billboards or alpha-test thresholds that pop in motion.
function cloudTexture(sunSides: number[]) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const light = document.createElement('canvas'); light.width = light.height = 256;
  const lightContext = light.getContext('2d')!;
  const shapes = [
    [[49, 178, 36, 24], [76, 145, 40, 43], [119, 110, 43, 66], [165, 150, 49, 46], [211, 177, 31, 23]],
    [[38, 181, 26, 18], [67, 164, 38, 32], [112, 150, 43, 40], [159, 165, 44, 28], [211, 181, 32, 19]],
    [[40, 181, 27, 19], [69, 153, 33, 45], [103, 177, 37, 25], [161, 154, 40, 48], [199, 177, 39, 26]],
  ];
  sunSides.forEach((sunSide, index) => {
    const lobes = shapes[index % shapes.length];
    const top = Math.min(...lobes.map(([, y, , ry]) => y - ry)), bottom = Math.max(...lobes.map(([, y, , ry]) => y + ry));
    const shadeTop = bottom - (bottom - top) * .2;
    ctx.save(); ctx.translate(index % 4 * 256, Math.floor(index / 4) * 256);
    ctx.beginPath();
    for (const [x, y, rx, ry] of lobes) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
    ctx.fillStyle = SKY.cloud; ctx.fill(); ctx.clip();
    // Shade only the lower fifth. The warm sun-facing side breaks up the cool
    // underside instead of drawing the same peach stripe across every cloud.
    const shade = ctx.createLinearGradient(0, shadeTop, 0, bottom);
    shade.addColorStop(0, 'rgba(201,178,214,0)'); shade.addColorStop(1, SKY.shade);
    ctx.fillStyle = shade; ctx.fillRect(0, shadeTop, 256, bottom - shadeTop);
    lightContext.clearRect(0, 0, 256, 256);
    lightContext.globalCompositeOperation = 'source-over';
    const sunX = sunSide >= 0 ? 256 : 0;
    const warm = lightContext.createRadialGradient(sunX, bottom, 0, sunX, bottom, 190);
    warm.addColorStop(0, SKY.warm); warm.addColorStop(1, 'rgba(246,185,140,0)');
    lightContext.globalAlpha = Math.abs(sunSide);
    lightContext.fillStyle = warm; lightContext.fillRect(0, 0, 256, 256);
    lightContext.globalAlpha = 1;
    lightContext.globalCompositeOperation = 'destination-in';
    const fade = lightContext.createLinearGradient(0, shadeTop, 0, bottom);
    fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(1, 'rgba(255,255,255,1)');
    lightContext.fillStyle = fade; lightContext.fillRect(0, 0, 256, 256);
    ctx.drawImage(light, 0, 0); ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'painted-cumulus-three-silhouettes'; return texture;
}

export class PaintedSky {
  readonly group = new THREE.Group();
  private readonly clouds: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;
  constructor() {
    const viewport = new THREE.Vector4();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { ...Object.fromEntries(Object.entries(SKY).map(([name, color]) => [name, { value: new THREE.Color(color) }])), viewport: { value: viewport } },
      vertexShader: `varying vec3 vDirection;varying vec4 vSun;varying float vSunRadius;
        void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          vSun=projectionMatrix*viewMatrix*vec4(cameraPosition+normalize(vec3(-70.0,55.0,-30.0))*500.0,1.0);
          vSunRadius=projectionMatrix[1][1]*.027;}`,
      fragmentShader: `varying vec3 vDirection;varying vec4 vSun;varying float vSunRadius;uniform vec4 viewport;uniform vec3 top,middle,horizon,fog,sun;
        void main(){
          vec3 direction=normalize(vDirection);float h=direction.y;
          vec3 color=mix(horizon,middle,smoothstep(-.02,.3,h));
          color=mix(color,top,smoothstep(.25,.9,h));
          color=mix(fog,color,smoothstep(-.08,.15,h));
          // Project the sun centre, then use pixel-isotropic distance so the
          // painted disc stays circular even near the edge of a wide camera.
          vec2 screen=(gl_FragCoord.xy-viewport.xy)/viewport.zw*2.0-1.0;
          vec2 sunDelta=screen-vSun.xy/max(.001,vSun.w);sunDelta.x*=viewport.z/viewport.w;
          float sunDistance=length(sunDelta)/max(.001,vSunRadius);
          if(vSun.w>0.0){
            color=mix(color,sun,.4*exp(-sunDistance*sunDistance/10.0));
            color=mix(color,sun,1.0-smoothstep(.92,1.02,sunDistance));
          }
          // Sub-code-value dither prevents gradient banding without visible grain.
          float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
          gl_FragColor=vec4(color+dither/1024.0,1.0);
        }`,
    }));
    dome.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport); };
    dome.renderOrder = -1000; dome.frustumCulled = false; this.group.add(dome);
    const geometries: THREE.BufferGeometry[] = [];
    const transform = new THREE.Object3D(), sunDirection = new THREE.Vector3(-70, 55, -30).normalize();
    const right = new THREE.Vector3(), sunSides: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + [.17, -.11, .08, -.15, .12, -.06, .19, -.08][i];
      const scale = [.8, 1.25, .65, 1.4, .95, 1.1, .7, 1.2][i], height = [295, 340, 260, 355, 310, 325, 285, 350][i];
      transform.position.set(Math.cos(angle) * 470, height, Math.sin(angle) * 470);
      transform.lookAt(0, height * .45, 0); transform.rotateY([.09, -.16, .18, -.08, .13, -.2, .05, -.11][i]);
      transform.updateMatrix();
      sunSides.push(right.setFromMatrixColumn(transform.matrix, 0).dot(sunDirection));
      const card = new THREE.PlaneGeometry(245 * scale, 245 * scale), uv = card.getAttribute('uv');
      for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) + i % 4) / 4, (uv.getY(v) + 1 - Math.floor(i / 4)) / 2);
      geometries.push(card.applyMatrix4(transform.matrix));
    }
    const geometry = mergeGeometries(geometries)!; geometries.forEach(part => part.dispose());
    this.texture = cloudTexture(sunSides);
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false });
    this.clouds = new THREE.Mesh(geometry, material); this.clouds.renderOrder = -999; this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }
  update(camera: THREE.Camera, _elapsed: number, _reducedMotion: boolean) {
    this.group.position.copy(camera.position);
    // Fixed world directions keep the painted sun side aligned during a pan.
  }
  dispose() {
    this.texture.dispose();
    this.group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  }
}
