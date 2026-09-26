import * as THREE from 'three';
import { damp } from '../shared/math';
import { RARITY } from '../shared/rarity';
import { WEAPONS } from '../shared/weapons';
import type { LootSpawn, RenderFrame, Vec3, WeaponId, WorldSpec } from '../shared/types';
import { itemGeometry, itemMaterial, chestGeometry } from './item-geometry';
import { worldWeaponMaterial } from './world-weapons';

interface ChestVisual { index: number; open: number; pos: Vec3 }
interface DropVisual { id: string; start: number; seen: boolean }
interface LootBatch { mesh: THREE.InstancedMesh; capacity: number; used: number }
// Extra instances per loot model for items spilled from chests at runtime.
const DROP_SLOTS = 16;
const rarityColors = RARITY.map(rarity => new THREE.Color(rarity.color));
const lootColors = {
  weapon: new THREE.Color('#f0b862'), ammo: new THREE.Color('#e3c789'),
  armor: new THREE.Color('#8ec5de'), helmet: new THREE.Color('#8ec5de'), acai: new THREE.Color('#b991db'),
  medkit: new THREE.Color('#96d39b'), bandage: new THREE.Color('#96d39b'),
  guarana: new THREE.Color('#dfb87a'), rapadura: new THREE.Color('#dfb87a'),
};
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
  private readonly temp = new THREE.Object3D();
  private readonly batches: LootBatch[] = [];
  private readonly chestList: { id: string; visual: ChestVisual }[] = [];
  private readonly glows: THREE.InstancedMesh[];
  private readonly color = new THREE.Color();
  private readonly haloColor = new THREE.Color();
  private readonly drops: DropVisual[] = [];
  private readonly beamLimits = new Map<string, number>();
  private readonly beamCeilings: { x: number; z: number; y: number; halfWidth: number; halfDepth: number }[];
  private readonly weaponBatches: Partial<Record<WeaponId, LootBatch>> = {};
  private readonly distantWeapons: Partial<Record<WeaponId, LootBatch>> = {};
  private elapsed = 0;
  private readonly lootBatches = new Map<string, LootBatch>();
  private readonly lootRings: THREE.InstancedMesh;
  private readonly lootHalos: THREE.InstancedMesh;
  private readonly lootBeams: THREE.InstancedMesh;
  // Local time at which each chest drop started its arc out of the chest.
  private readonly dropStarts = new Map<string, DropVisual>();
  private readonly chestBases: THREE.InstancedMesh;
  private readonly chestLids: THREE.InstancedMesh;
  private readonly chestGlints: THREE.InstancedMesh;
  constructor(private readonly scene: THREE.Scene, world: WorldSpec) {
    this.beamCeilings = world.objects.filter(object => object.kind === 'roof' || object.detail?.startsWith('prop:house:'))
      .map(object => ({ x: object.pos.x, z: object.pos.z, y: object.pos.y + (object.kind === 'roof' ? 0 : 2.95),
        halfWidth: object.scale.x / 2, halfDepth: object.scale.z / 2 }));
    for (const solid of world.colliders) if (solid.pieceId) this.beamCeilings.push({
      x: (solid.min.x + solid.max.x) / 2, z: (solid.min.z + solid.max.z) / 2, y: solid.min.y,
      halfWidth: (solid.max.x - solid.min.x) / 2, halfDepth: (solid.max.z - solid.min.z) / 2,
    });
    for (const item of world.loot) if (item.kind === 'weapon') this.beamHeight(item);
    const counts = new Map<string, number>();
    for (const item of world.loot) counts.set(lootKey(item), (counts.get(lootKey(item)) || 0) + 1);
    for (const [key, count] of counts) this.lootBatch(key, count);
    // Every kind a chest can spill gets its batch now, so opening one never builds meshes mid-match.
    for (const kind of ['ammo', 'armor', 'helmet', 'bandage', 'medkit', 'guarana', 'acai', 'rapadura'] as const) this.lootBatch(kind);
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) this.lootBatch(`weapon:${weapon}`);
    for (const weapon of Object.keys(WEAPONS) as WeaponId[])
      this.distantWeapons[weapon] = this.lootBatch(`weapon:${weapon}:far`, counts.get(`weapon:${weapon}`) ?? 0);
    const weapons = world.loot.filter(item => item.kind === 'weapon').length + 48;
    this.lootRings = new THREE.InstancedMesh(new THREE.TorusGeometry(.47, .035, 4, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .58 }), world.loot.length + 96);
    this.lootHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowHalo(), weapons);
    this.lootBeams = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075, .075, 1, 10, 1, true).translate(0, .5, 0), glowBeam(), weapons);
    for (const mesh of [this.lootRings, this.lootHalos, this.lootBeams]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color()); this.scene.add(mesh);
    }
    this.glows = [this.lootRings, this.lootHalos, this.lootBeams];
    this.lootHalos.renderOrder = 3; this.lootBeams.renderOrder = 3;
    this.chestBases = new THREE.InstancedMesh(chestGeometry(false), itemMaterial, world.chests.length);
    this.chestLids = new THREE.InstancedMesh(chestGeometry(true), itemMaterial, world.chests.length);
    this.chestGlints = new THREE.InstancedMesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }), world.chests.length);
    for (const mesh of [this.chestBases, this.chestLids, this.chestGlints]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    world.chests.forEach((spec, index) => { const visual = { index, open: 0, pos: spec }; this.chestList.push({ id: spec.id, visual }); });
  }

  private beamHeight(item: LootSpawn) {
    let limit = this.beamLimits.get(item.id);
    if (limit !== undefined) return limit;
    const base = item.y + .05;
    limit = Infinity;
    for (const ceiling of this.beamCeilings) if (ceiling.y > base && Math.abs(item.x - ceiling.x) <= ceiling.halfWidth &&
      Math.abs(item.z - ceiling.z) <= ceiling.halfDepth) limit = Math.min(limit, Math.max(0, ceiling.y - base - .08));
    this.beamLimits.set(item.id, limit);
    return limit;
  }

  private lootBatch(key: string, count = 0): LootBatch {
    let batch = this.lootBatches.get(key);
    if (!batch) {
      const [kind, weapon, detail] = key.split(':') as [LootSpawn['kind'], WeaponId | undefined, 'far' | undefined];
      const capacity = count + DROP_SLOTS;
      const mesh = new THREE.InstancedMesh(itemGeometry(kind, weapon, detail), kind === 'weapon' ? worldWeaponMaterial() : itemMaterial, capacity);
      mesh.name = `loot:${key}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      this.scene.add(mesh); batch = { mesh, capacity, used: 0 }; this.lootBatches.set(key, batch); this.batches.push(batch);
      if (kind === 'weapon' && detail !== 'far') this.weaponBatches[weapon || 'pistol'] = batch;
    }
    return batch;
  }

  update(snapshot: RenderFrame['snapshot'], elapsed: number, camera?: THREE.Camera) {
    this.elapsed = elapsed;
    const show = !!snapshot && snapshot.phase === 'playing';
    for (const batch of this.batches) batch.used = 0;
    let rings = 0, halos = 0, beams = 0;
    const color = this.color;
    for (const drop of this.drops) drop.seen = false;
    if (show) for (const item of snapshot!.loot) {
      if (!item.active) continue;
      const distantWeapon = camera && item.kind === 'weapon' &&
        (item.x - camera.position.x) ** 2 + (item.y - camera.position.y) ** 2 + (item.z - camera.position.z) ** 2 > 14 * 14;
      const batch = distantWeapon ? this.distantWeapons[item.weapon || 'pistol']! : item.kind === 'weapon' ? this.weaponBatches[item.weapon || 'pistol']! : this.lootBatches.get(item.kind)!;
      const index = batch.used;
      if (index >= batch.capacity || rings >= this.lootRings.instanceMatrix.count) continue;
      batch.used++;
      const phase = lootPhase(item.id);
      let x = item.x, z = item.z, y = item.y + .56 + Math.sin(this.elapsed * 2 + phase) * .07, spin = this.elapsed * .45 + phase, scale = 1, landed = 1;
      if (item.from) {
        // Chest drops arc from the lid to their landing spot; late joiners see them settled.
        let drop = this.dropStarts.get(item.id);
        if (!drop) {
          drop = { id: item.id, start: this.elapsed - Math.max(0, snapshot!.time - (item.spawnedAt ?? snapshot!.time)), seen: true };
          this.dropStarts.set(item.id, drop); this.drops.push(drop);
        }
        drop.seen = true;
        const t = THREE.MathUtils.clamp((this.elapsed - drop.start) / .55, 0, 1);
        if (t < 1) {
          const e = 1 - (1 - t) * (1 - t);
          x = item.from.x + (item.x - item.from.x) * e; z = item.from.z + (item.z - item.from.z) * e;
          y = item.from.y + (item.y + .56 - item.from.y) * t + Math.sin(t * Math.PI) * .9;
          spin += t * 7; scale = .45 + .55 * e; landed = t;
        }
      }
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, spin, 0); this.temp.scale.setScalar(scale); this.temp.updateMatrix();
      batch.mesh.setMatrixAt(index, this.temp.matrix);
      const weapon = item.kind === 'weapon';
      color.copy(weapon ? rarityColors[item.rarity ?? 0] || rarityColors[0] : lootColors[item.kind]);
      this.temp.position.set(x, item.y + .07, z); this.temp.rotation.set(Math.PI / 2, 0, 0); this.temp.scale.setScalar(landed * (item.from ? .82 : 1)); this.temp.updateMatrix();
      this.lootRings.setMatrixAt(rings, this.temp.matrix); this.lootRings.setColorAt(rings++, color);
      if (!weapon || halos >= this.lootHalos.instanceMatrix.count) continue;
      const tier = item.rarity || 0;
      this.temp.position.set(x, y, z); this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar((1.35 + tier * .22) * landed); this.temp.updateMatrix();
      this.lootHalos.setMatrixAt(halos, this.temp.matrix); this.lootHalos.setColorAt(halos++, tier ? color : this.haloColor.copy(color).multiplyScalar(.55));
      if (!tier) continue;
      this.temp.position.set(x, item.y + .05, z); this.temp.scale.set(1, Math.min(2 + tier * 1.1, this.beamHeight(item)) * landed, 1); this.temp.updateMatrix();
      this.lootBeams.setMatrixAt(beams, this.temp.matrix); this.lootBeams.setColorAt(beams++, color);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) if (!this.drops[i].seen) { this.dropStarts.delete(this.drops[i].id); this.drops.splice(i, 1); }
    for (const batch of this.batches) { batch.mesh.count = batch.used; batch.mesh.instanceMatrix.needsUpdate = true; }
    this.lootRings.count = rings; this.lootHalos.count = halos; this.lootBeams.count = beams;
    for (const mesh of this.glows) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    (this.lootHalos.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
    const opened = snapshot?.openedChests;
    for (const { id, visual: chest } of this.chestList) {
      chest.open = damp(chest.open, opened?.includes(id) ? 1 : 0, 7, .016);
      const spec = chest.pos, scale = show ? 1 : .0001;
      this.temp.position.set(spec.x, spec.y, spec.z); this.temp.rotation.set(0, 0, 0);
      this.temp.scale.setScalar(scale); this.temp.updateMatrix(); this.chestBases.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .5, spec.z - .33); this.temp.rotation.set(-chest.open * 1.75, 0, 0);
      this.temp.updateMatrix(); this.chestLids.setMatrixAt(chest.index, this.temp.matrix);
      this.temp.position.set(spec.x, spec.y + .98 + Math.sin(this.elapsed * 3 + chest.index) * .06, spec.z);
      this.temp.rotation.set(0, 0, 0); this.temp.scale.setScalar(show && !opened?.includes(id) ? .85 : .0001);
      this.temp.updateMatrix(); this.chestGlints.setMatrixAt(chest.index, this.temp.matrix);
    }
    this.chestBases.instanceMatrix.needsUpdate = true; this.chestLids.instanceMatrix.needsUpdate = true; this.chestGlints.instanceMatrix.needsUpdate = true;
  }

}
