import * as THREE from 'three';
import { damp } from '../shared/math';
import { rarityOf } from '../shared/rarity';
import { WEAPONS } from '../shared/weapons';
import type { LootSpawn, RenderFrame, Vec3, WeaponId, WorldSpec } from '../shared/types';
import { itemGeometry, itemMaterial, chestGeometry } from './item-geometry';

interface ChestVisual { index: number; open: number; pos: Vec3 }
interface LootBatch { mesh: THREE.InstancedMesh; capacity: number }
// Extra instances per loot model for items spilled from chests at runtime.
const DROP_SLOTS = 16;
const lootKey = (item: LootSpawn) => item.kind === 'weapon' ? `weapon:${item.weapon || 'pistol'}` : item.kind;
const lootPhase = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return (h >>> 0) % 628 / 100; };
// Rarity glow for ground weapons: a camera-facing soft halo and, from Rara up, a light beam.
const glowHalo = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: `uniform float uTime;varying vec2 vUv;varying vec3 vColor;
    void main(){vUv=uv;vColor=vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vColor=instanceColor;
      #endif
      vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
      float size=length(instanceMatrix[0].xyz)*(1.0+.07*sin(uTime*3.0+instanceMatrix[3].x));
      center.xy+=position.xy*size;gl_Position=projectionMatrix*center;}`,
  fragmentShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){float d=length(vUv-.5)*2.0;float a=pow(max(0.0,1.0-d),2.4);gl_FragColor=vec4(vColor*a*1.35,a);}`,
});
const glowBeam = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){vUv=uv;vColor=vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vColor=instanceColor;
      #endif
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
  fragmentShader: `varying vec2 vUv;varying vec3 vColor;
    void main(){float a=pow(1.0-vUv.y,1.6)*smoothstep(0.0,.06,vUv.y)*.55;gl_FragColor=vec4(vColor*a,a);}`,
});

export class LootView {
  private readonly chests = new Map<string, ChestVisual>();
  private readonly temp = new THREE.Object3D();
  private elapsed = 0;
  private readonly lootBatches = new Map<string, LootBatch>();
  private readonly lootRings: THREE.InstancedMesh;
  private readonly lootHalos: THREE.InstancedMesh;
  private readonly lootBeams: THREE.InstancedMesh;
  // Local time at which each chest drop started its arc out of the chest.
  private readonly dropStarts = new Map<string, number>();
  private readonly chestBases: THREE.InstancedMesh;
  private readonly chestLids: THREE.InstancedMesh;
  private readonly chestGlints: THREE.InstancedMesh;
  constructor(private readonly scene: THREE.Scene, world: WorldSpec) {
    const counts = new Map<string, number>();
    for (const item of world.loot) counts.set(lootKey(item), (counts.get(lootKey(item)) || 0) + 1);
    for (const [key, count] of counts) this.lootBatch(key, count);
    // Every kind a chest can spill gets its batch now, so opening one never builds meshes mid-match.
    for (const kind of ['ammo', 'armor', 'helmet', 'bandage', 'medkit', 'guarana', 'acai', 'rapadura'] as const) this.lootBatch(kind);
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) this.lootBatch(`weapon:${weapon}`);
    const weapons = world.loot.filter(item => item.kind === 'weapon').length + 48;
    this.lootRings = new THREE.InstancedMesh(new THREE.TorusGeometry(.47, .035, 4, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .58 }), world.loot.length + 96);
    this.lootHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowHalo(), weapons);
    this.lootBeams = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075, .075, 1, 10, 1, true).translate(0, .5, 0), glowBeam(), weapons);
    for (const mesh of [this.lootRings, this.lootHalos, this.lootBeams]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color()); this.scene.add(mesh);
    }
    this.lootHalos.renderOrder = 3; this.lootBeams.renderOrder = 3;
    this.chestBases = new THREE.InstancedMesh(chestGeometry(false), itemMaterial, world.chests.length);
    this.chestLids = new THREE.InstancedMesh(chestGeometry(true), itemMaterial, world.chests.length);
    this.chestGlints = new THREE.InstancedMesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }), world.chests.length);
    for (const mesh of [this.chestBases, this.chestLids, this.chestGlints]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    world.chests.forEach((spec, index) => this.chests.set(spec.id, { index, open: 0, pos: spec }));
  }

  private lootBatch(key: string, count = 0): LootBatch {
    let batch = this.lootBatches.get(key);
    if (!batch) {
      const [kind, weapon] = key.split(':') as [LootSpawn['kind'], WeaponId | undefined];
      const capacity = count + DROP_SLOTS;
      const mesh = new THREE.InstancedMesh(itemGeometry(kind, weapon), itemMaterial, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      this.scene.add(mesh); batch = { mesh, capacity }; this.lootBatches.set(key, batch);
    }
    return batch;
  }

  private lootColor(kind: string) {
    if (kind === 'weapon') return '#f0b862';
    if (kind === 'ammo') return '#e3c789';
    if (kind === 'armor' || kind === 'helmet') return '#8ec5de';
    if (kind === 'acai') return '#b991db';
    if (kind === 'medkit' || kind === 'bandage') return '#96d39b';
    return '#dfb87a';
  }

  update(snapshot: RenderFrame['snapshot'], elapsed: number) {
    this.elapsed = elapsed;
    const show = !!snapshot && snapshot.phase === 'playing';
    const used = new Map<LootBatch, number>();
    let rings = 0, halos = 0, beams = 0;
    const color = new THREE.Color(), seen = new Set<string>();
    for (const item of show ? snapshot!.loot : []) {
      if (!item.active) continue;
      const batch = this.lootBatch(lootKey(item)), index = used.get(batch) || 0;
      if (index >= batch.capacity || rings >= this.lootRings.instanceMatrix.count) continue;
      used.set(batch, index + 1);
      const phase = lootPhase(item.id);
      let x = item.x, z = item.z, y = item.y + .56 + Math.sin(this.elapsed * 2 + phase) * .07, spin = this.elapsed * .45 + phase, scale = 1, landed = 1;
      if (item.from) {
        // Chest drops arc from the lid to their landing spot; late joiners see them settled.
        seen.add(item.id);
        let start = this.dropStarts.get(item.id);
        if (start === undefined) { start = this.elapsed - Math.max(0, snapshot!.time - (item.spawnedAt ?? snapshot!.time)); this.dropStarts.set(item.id, start); }
        const t = THREE.MathUtils.clamp((this.elapsed - start) / .55, 0, 1);
        if (t < 1) {
          const e = 1 - (1 - t) * (1 - t);
          x = item.from.x + (item.x - item.from.x) * e; z = item.from.z + (item.z - item.from.z) * e;
          y = item.from.y + (item.y + .56 - item.from.y) * t + Math.sin(t * Math.PI) * .9;
          spin += t * 7; scale = .45 + .55 * e; landed = t;
        }
      }
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, spin, 0); this.temp.scale.setScalar(scale); this.temp.updateMatrix();
      batch.mesh.setMatrixAt(index, this.temp.matrix);
      const weapon = item.kind === 'weapon', rarity = weapon ? rarityOf(item.rarity) : null;
      color.set(rarity ? rarity.color : this.lootColor(item.kind));
      this.temp.position.set(x, item.y + .07, z); this.temp.rotation.set(Math.PI / 2, 0, 0); this.temp.scale.setScalar(landed * (item.from ? .82 : 1)); this.temp.updateMatrix();
      this.lootRings.setMatrixAt(rings, this.temp.matrix); this.lootRings.setColorAt(rings++, color);
      if (!weapon || halos >= this.lootHalos.instanceMatrix.count) continue;
      const tier = item.rarity || 0;
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar((1.35 + tier * .22) * landed); this.temp.updateMatrix();
      this.lootHalos.setMatrixAt(halos, this.temp.matrix); this.lootHalos.setColorAt(halos++, tier ? color : color.clone().multiplyScalar(.55));
      if (!tier) continue;
      this.temp.position.set(x, item.y + .05, z); this.temp.scale.set(1, (2 + tier * 1.1) * landed, 1); this.temp.updateMatrix();
      this.lootBeams.setMatrixAt(beams, this.temp.matrix); this.lootBeams.setColorAt(beams++, color);
    }
    for (const id of this.dropStarts.keys()) if (!seen.has(id)) this.dropStarts.delete(id);
    for (const batch of this.lootBatches.values()) { batch.mesh.count = used.get(batch) || 0; batch.mesh.instanceMatrix.needsUpdate = true; }
    this.lootRings.count = rings; this.lootHalos.count = halos; this.lootBeams.count = beams;
    for (const mesh of [this.lootRings, this.lootHalos, this.lootBeams]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    (this.lootHalos.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
    const opened = new Set(snapshot?.openedChests || []);
    for (const [id, chest] of this.chests) {
      chest.open = damp(chest.open, opened.has(id) ? 1 : 0, 7, .016);
      const spec = chest.pos, scale = show ? 1 : .0001;
      this.temp.position.set(spec.x, spec.y, spec.z); this.temp.rotation.set(0, 0, 0);
      this.temp.scale.setScalar(scale); this.temp.updateMatrix(); this.chestBases.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .5, spec.z - .33); this.temp.rotation.set(-chest.open * 1.75, 0, 0);
      this.temp.updateMatrix(); this.chestLids.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .98 + Math.sin(this.elapsed * 3 + chest.index) * .06, spec.z);
      this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar(show && !opened.has(id) ? .85 : .0001);
      this.temp.updateMatrix(); this.chestGlints.setMatrixAt(chest.index, this.temp.matrix);
    }
    this.chestBases.instanceMatrix.needsUpdate = true; this.chestLids.instanceMatrix.needsUpdate = true; this.chestGlints.instanceMatrix.needsUpdate = true;
  }

}
