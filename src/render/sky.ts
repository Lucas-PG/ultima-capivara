import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY = {
  top: '#376FAD', middle: '#8BB6D1', horizon: '#FFC380', fog: '#DBC2AE',
  cloud: '#FFE5B4', warm: '#FFC679', shade: '#7D829F', sun: '#FFF1C9',
} as const;

// Original low-frequency painted cloud card. One shared atlas, fixed world-facing
// cards, no camera-facing billboards or alpha-test thresholds that pop in motion.
function cloudTexture(sunSides: number[]) {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  let state = 9183;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
  sunSides.forEach((sunSide, index) => {
    ctx.save(); ctx.translate(index % 4 * 512, Math.floor(index / 4) * 512);
    const lobes: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const x = 72 + i / 27 * 365, envelope = Math.sin(i / 27 * Math.PI);
      lobes.push({ x, y: 346 - envelope * (45 + random() * 77), rx: 25 + random() * 39, ry: 24 + envelope * (20 + random() * 48) });
    }
    // Overlapping rounded volumes carry broad painted light and coloured
    // undersides. Fine brush dabs stay inside the cloud silhouette.
    ctx.beginPath();
    for (const lobe of lobes) { ctx.moveTo(lobe.x + lobe.rx, lobe.y); ctx.ellipse(lobe.x, lobe.y, lobe.rx, lobe.ry, 0, 0, Math.PI * 2); }
    const body = ctx.createLinearGradient(0, 125, 0, 400);
    body.addColorStop(0, '#FFECCA'); body.addColorStop(.45, '#F6CFAB'); body.addColorStop(.8, '#BBA8B4'); body.addColorStop(1, '#8590AA');
    ctx.fillStyle = body; ctx.fill(); ctx.clip();
    for (const lobe of lobes) {
      const litX = lobe.x + sunSide * lobe.rx * .35, litY = lobe.y - lobe.ry * .48;
      const gradient = ctx.createRadialGradient(litX, litY, 0, litX, litY, lobe.rx * 1.4);
      gradient.addColorStop(0, 'rgba(255,242,204,.68)'); gradient.addColorStop(.6, 'rgba(255,220,169,.16)'); gradient.addColorStop(1, 'rgba(255,220,169,0)');
      ctx.fillStyle = gradient; ctx.fillRect(lobe.x - lobe.rx * 2, lobe.y - lobe.ry * 2, lobe.rx * 4, lobe.ry * 4);
    }
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 480; i++) {
      const x = random() * 512, y = 150 + random() * 240;
      ctx.fillStyle = i % 3 ? 'rgba(255,221,170,.055)' : 'rgba(92,103,153,.035)';
      ctx.beginPath(); ctx.ellipse(x, y, 4 + random() * 19, 1 + random() * 4, -.18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.restore();
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
          vSun=projectionMatrix*viewMatrix*vec4(cameraPosition+normalize(vec3(-70.0,32.0,-30.0))*500.0,1.0);
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
            color+=sun*1.4*exp(-sunDistance*sunDistance/18.0);
            color=mix(color,sun*5.0,1.0-smoothstep(.92,1.02,sunDistance));
          }
          // Sub-code-value dither prevents gradient banding without visible grain.
          float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
          gl_FragColor=vec4(color+dither/1024.0,1.0);
        }`,
    }));
    dome.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport); };
    dome.renderOrder = -1000; dome.frustumCulled = false; this.group.add(dome);
    const geometries: THREE.BufferGeometry[] = [];
    const transform = new THREE.Object3D(), sunDirection = new THREE.Vector3(-70, 32, -30).normalize();
    const right = new THREE.Vector3(), sunSides: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + [.17, -.11, .08, -.15, .12, -.06, .19, -.08][i];
      const scale = [.8, 1.25, .65, 1.4, .95, 1.1, .7, 1.2][i], height = [205, 280, 225, 310, 190, 265, 230, 295][i];
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
  update(camera: THREE.Camera, elapsed: number, reducedMotion: boolean) {
    this.group.position.copy(camera.position);
    this.clouds.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * .003) * .04;
  }
  dispose() {
    this.texture.dispose();
    this.group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  }
}
