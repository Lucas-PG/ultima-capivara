import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetLoader } from './assets';

const SKY = {
  top: '#376FAD', middle: '#8BB6D1', horizon: '#FFC380', fog: '#DBC2AE',
  cloud: '#FFE5B4', warm: '#FFC679', shade: '#7D829F', sun: '#FFF1C9',
} as const;

export class PaintedSky {
  readonly group = new THREE.Group();
  readonly clouds: THREE.Mesh;
  private readonly texture: THREE.Texture;
  constructor(assets: AssetLoader) {
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
    const right = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + [.17, -.11, .08, -.15, .12, -.06, .19, -.08][i];
      const scale = [.8, 1.25, .65, 1.4, .95, 1.1, .7, 1.2][i], height = [205, 280, 225, 310, 190, 265, 230, 295][i];
      transform.position.set(Math.cos(angle) * 470, height, Math.sin(angle) * 470);
      transform.lookAt(0, height * .45, 0); transform.rotateY([.09, -.16, .18, -.08, .13, -.2, .05, -.11][i]);
      transform.updateMatrix();
      const sunSide = right.setFromMatrixColumn(transform.matrix, 0).dot(sunDirection);
      const card = new THREE.PlaneGeometry(245 * scale, 245 * scale), uv = card.getAttribute('uv');
      // The atlas is lit from the upper left. Mirror each fixed card toward the
      // real sun; keep the painted billows stationary as the camera turns.
      for (let v = 0; v < uv.count; v++) uv.setXY(v, ((sunSide > 0 ? 1 - uv.getX(v) : uv.getX(v)) + i % 4) / 4,
        (uv.getY(v) + 1 - Math.floor(i / 4)) / 2);
      geometries.push(card.applyMatrix4(transform.matrix));
    }
    const geometry = mergeGeometries(geometries)!; geometries.forEach(part => part.dispose());
    this.texture = assets.texture('textures/clouds-painted-v4.png');
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.name = 'painted-cumulus-billows';
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
