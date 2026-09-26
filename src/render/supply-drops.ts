import * as THREE from 'three';
import { supplyDropPhase, supplyDropPosition, SUPPLY_RELEASE_HEIGHT } from '../shared/supply-drops';
import type { Settings, WorldSnapshot } from '../shared/types';
import type { AssetLoader } from './assets';

export const SUPPLY_ASSET_PATH = 'models/supply-drop/supply-drop.glb';
const ROOTS = ['drop_carrier', 'drop_crate', 'drop_chute'] as const;
interface Delivery {
  group: THREE.Group; carrier: THREE.LOD; crate: THREE.LOD; chute: THREE.LOD;
  flare: THREE.Group; ring: THREE.Mesh; glow: THREE.Mesh; smoke: THREE.InstancedMesh;
  fade: THREE.InstancedBufferAttribute;
}

/** Two timestamp-driven deliveries. Reconnects never replay a descent clock. */
export class SupplyDropView {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  private readonly deliveries: Delivery[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly scratch = new THREE.Object3D();
  private source: THREE.Group | null = null;
  private disposed = false;
  private quality: Settings['graphics'] = 'medium';

  constructor(assets: Pick<AssetLoader, 'gltf'>) {
    this.group.name = 'Entrega do Tucano';
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group(), carrier = new THREE.LOD(), crate = new THREE.LOD(), chute = new THREE.LOD();
      group.name = `entrega:${i}`; group.visible = false;
      carrier.name = 'Tucano'; crate.name = 'Caixa de entrega'; chute.name = 'Paraquedas da entrega';
      for (const lod of [carrier, crate, chute]) { lod.autoUpdate = false; group.add(lod); }
      const flare = new THREE.Group(); flare.name = 'Sinal da entrega'; group.add(flare);
      const ringGeometry = new THREE.RingGeometry(.82, .87, 40).rotateX(-Math.PI / 2);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: '#EFB666', transparent: true, opacity: .35, depthWrite: false });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.position.y = .025;
      const glowGeometry = new THREE.PlaneGeometry(.46, .46).rotateX(-Math.PI / 2);
      const glowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;
          float a=pow(max(0.,1.-r),2.);gl_FragColor=vec4(mix(vec3(1.,.24,.025),vec3(1.,.78,.29),a),a*.75);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial); glow.position.set(.68, .03, .16);
      const smokeGeometry = new THREE.PlaneGeometry(1, 1);
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(8), 1);
      smokeGeometry.setAttribute('smokeFade', fade);
      const smokeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
        vertexShader: `attribute float smokeFade;varying vec2 vUv;varying float vFade;
          void main(){vUv=uv;vFade=smokeFade;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv;varying float vFade;void main(){
          float r=length((vUv-.5)*2.);float a=exp(-r*r*2.)*(1.-smoothstep(.3,1.,r));
          vec3 paint=mix(vec3(.44,.19,.055),vec3(.9,.52,.2),vUv.y);
          gl_FragColor=vec4(paint,a*vFade*.23);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      });
      const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, 8);
      smoke.name = 'Fumaça do sinal'; smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fade.setUsage(THREE.DynamicDrawUsage);
      smoke.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 5);
      flare.add(ring, glow, smoke); this.group.add(group);
      this.geometries.add(ringGeometry).add(glowGeometry).add(smokeGeometry);
      this.materials.add(ringMaterial).add(glowMaterial).add(smokeMaterial);
      this.deliveries.push({ group, carrier, crate, chute, flare, ring, glow, smoke, fade });
    }
    this.ready = assets.gltf(SUPPLY_ASSET_PATH).then(asset => {
      this.source = asset.scene;
      if (this.disposed) { this.disposeSource(); return; }
      asset.scene.updateMatrixWorld(true);
      for (const delivery of this.deliveries) for (const [index, root] of ROOTS.entries()) {
        const lod = [delivery.carrier, delivery.crate, delivery.chute][index];
        for (let level = 0; level < 3; level++) {
          const name = `${root}_LOD${level}`, source = asset.scene.getObjectByName(name);
          if (!source) throw new Error(`Peça da entrega ausente: ${name}.`);
          const copy = source.clone(true);
          source.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
          copy.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = root === 'drop_crate' && this.quality !== 'low'; object.receiveShadow = root === 'drop_crate';
          });
          const distances = index === 0 ? [0, 42, 95] : index === 1 ? [0, 16, 45] : [0, 30, 70];
          lod.addLevel(copy, distances[level], .12);
        }
      }
    });
    void this.ready.catch(() => {});
  }

  update(snapshot: Pick<WorldSnapshot, 'phase' | 'config' | 'supplyDrops'> | null, time: number, camera: THREE.Camera, settings: Pick<Settings, 'graphics' | 'reducedMotion'>) {
    if (this.disposed) return;
    this.group.visible = !!snapshot && snapshot.phase === 'playing' && snapshot.config.mode === 'battle-royale';
    if (!this.group.visible) return;
    if (this.quality !== settings.graphics) {
      this.quality = settings.graphics;
      for (const delivery of this.deliveries) delivery.crate.traverse(object => {
        if (object instanceof THREE.Mesh) object.castShadow = this.quality !== 'low';
      });
    }
    const reduced = settings.reducedMotion;
    for (let i = 0; i < this.deliveries.length; i++) {
      const delivery = this.deliveries[i], drop = snapshot!.supplyDrops?.[i];
      delivery.group.visible = !!drop && time >= drop.announcedAt;
      if (!drop || !delivery.group.visible) continue;
      const phase = supplyDropPhase(drop, time), sinceRelease = time - drop.releaseAt, sinceLanding = time - drop.landsAt;
      const position = supplyDropPosition(drop, time), x = Math.sin(drop.heading), z = Math.cos(drop.heading);
      const incoming = phase === 'incoming';
      delivery.crate.visible = phase !== 'opened';
      delivery.crate.position.copy(position);
      if (incoming) { delivery.crate.position.x += x * sinceRelease * 12; delivery.crate.position.z += z * sinceRelease * 12; }
      const sway = reduced || incoming ? 0 : Math.exp(-Math.max(0, sinceLanding) * 10);
      delivery.crate.rotation.set(Math.sin(time * 1.3) * .025 * sway, drop.heading, Math.sin(time * 1.7) * .04 * sway);

      delivery.carrier.visible = sinceRelease < 22;
      delivery.carrier.position.set(drop.pos.x + x * sinceRelease * 12,
        drop.pos.y + SUPPLY_RELEASE_HEIGHT + 1.2 + Math.max(0, sinceRelease) * 1.5, drop.pos.z + z * sinceRelease * 12);
      delivery.carrier.rotation.set(0, drop.heading, reduced ? 0 : Math.sin(time * 1.1) * .025);
      delivery.carrier.scale.setScalar(1 - THREE.MathUtils.smoothstep(sinceRelease, 18, 22));

      delivery.chute.visible = !incoming && sinceLanding < 1.2 && phase !== 'opened';
      delivery.chute.position.copy(position); delivery.chute.rotation.copy(delivery.crate.rotation);
      const opening = reduced ? 1 : THREE.MathUtils.smoothstep(sinceRelease, 0, .32);
      const folding = THREE.MathUtils.smoothstep(sinceLanding, 0, 1.2);
      delivery.chute.scale.set(opening * (1 - folding * .5), opening * (1 - folding * .98), opening * (1 - folding * .5));
      delivery.flare.position.copy(drop.pos); delivery.flare.visible = phase !== 'opened';
      const distance = camera.position.distanceToSquared(drop.pos);
      delivery.smoke.visible = !reduced && distance < 120 * 120;
      delivery.smoke.count = this.quality === 'low' ? 3 : 8;
      for (let puff = 0; puff < delivery.smoke.count && delivery.smoke.visible; puff++) {
        const life = THREE.MathUtils.euclideanModulo((time - drop.announcedAt) * .22 + puff / delivery.smoke.count, 1);
        this.scratch.position.set(.68 + life * .5 + Math.sin(time * .4 + puff * 2.4) * .14 * life, .16 + life * 4.4, .16 + life * .15);
        this.scratch.quaternion.copy(camera.quaternion);
        this.scratch.scale.setScalar(.18 + life * 1.2); this.scratch.updateMatrix();
        delivery.smoke.setMatrixAt(puff, this.scratch.matrix);
        delivery.fade.setX(puff, Math.sin(life * Math.PI) * (1 - THREE.MathUtils.smoothstep(distance, 90 * 90, 120 * 120)));
      }
      delivery.smoke.instanceMatrix.needsUpdate = true; delivery.fade.needsUpdate = true;
      const pulse = reduced ? 1 : .88 + .12 * Math.sin(time * 2.4);
      delivery.glow.scale.setScalar(pulse);
      (delivery.ring.material as THREE.MeshBasicMaterial).opacity = .22 * pulse;
      delivery.group.updateMatrixWorld(true);
      for (const lod of [delivery.carrier, delivery.crate, delivery.chute]) if (lod.visible) lod.update(camera);
    }
  }

  private disposeSource() {
    if (!this.source) return;
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    this.source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    resources.forEach(resource => resource.dispose()); this.source = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent(); this.disposeSource();
    for (const delivery of this.deliveries) delivery.smoke.dispose();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
  }
}
