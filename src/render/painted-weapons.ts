import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponId } from '../shared/types';
import { RARITY } from '../shared/rarity';
import palette from './weapon-palette.json';

export const PAINTED_WEAPON_URL = `${import.meta.env.BASE_URL}models/weapons/painted-weapons.glb`;
export const paintedWeaponsEnabled = () => typeof location === 'undefined' || new URLSearchParams(location.search).get('weapons') !== 'legacy';
export const PAINTED_WEAPON_IDS: readonly WeaponId[] = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot'];

export interface PaintedWeaponModel {
  group: THREE.Group; muzzle: THREE.Object3D; eject: THREE.Object3D;
  magazine: THREE.Object3D; action: THREE.Object3D; support: THREE.Object3D;
  sightY: number; legendary: THREE.Object3D;
}

/** One renderer owns this set. Downloads must use its shared AssetLoader. */
export class PaintedWeaponSet {
  private source: GLTF | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly atlases: THREE.DataTexture[] = [];
  private readonly instances = new Set<THREE.Group>();

  preload(load: (url: string) => Promise<GLTF>): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Armas já descartadas.'));
    return this.loading ??= this.load(load);
  }

  private async load(load: (url: string) => Promise<GLTF>): Promise<void> {
    const asset = await load(PAINTED_WEAPON_URL);
    try {
      if (this.disposed) throw new Error('Carregamento de armas cancelado após descarte.');
      for (const id of PAINTED_WEAPON_IDS) {
        const root = asset.scene.getObjectByName(id);
        if (!root) throw new Error(`Arma inválida: ${id}.`);
        for (const part of ['body', 'right_paw', 'muzzle', 'eject', 'sight', 'magazine', 'action', 'legendary']) {
          if (!root.getObjectByName(`${id}_${part}`)) throw new Error(`Arma inválida: ${id}/${part}.`);
        }
        if (id !== 'machete' && !root.getObjectByName(`${id}_left_paw`)) throw new Error(`Pata de apoio ausente: ${id}.`);
        let meshes = 0;
        root.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          meshes++;
          if (!(object.material instanceof THREE.MeshStandardMaterial) || !object.geometry.getAttribute('position')?.count)
            throw new Error(`Malha de arma inválida: ${id}.`);
        });
        if (!meshes) throw new Error(`Arma vazia: ${id}.`);
        for (const part of id === 'machete' ? ['body', 'right_paw'] : ['body', 'right_paw', 'left_paw']) {
          let visibleMesh = false;
          root.getObjectByName(`${id}_${part}`)!.traverse(object => {
            if (object instanceof THREE.Mesh && object.geometry.getAttribute('position')?.count) visibleMesh = true;
          });
          if (!visibleMesh) throw new Error(`Parte de arma vazia: ${id}/${part}.`);
        }
      }
      const mesh = asset.scene.getObjectByProperty('isMesh', true) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      // Match the base atlas sampling: mipmaps would bleed the lit blade column
      // into neighbouring matte columns on distant or oblique surfaces.
      if (mesh.material.emissiveMap) {
        mesh.material.emissiveMap.magFilter = mesh.material.emissiveMap.minFilter = THREE.NearestFilter;
        mesh.material.emissiveMap.generateMipmaps = false; mesh.material.emissiveMap.needsUpdate = true;
      }
      for (const rarity of RARITY) {
        const colors = palette.map(hex => parseInt(hex, 16));
        colors[9] = parseInt(rarity.color.slice(1), 16);
        const pixels = new Uint8Array(32 * 32 * 4);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          const hex = colors[x];
          pixels.set([hex >> 16 & 255, hex >> 8 & 255, hex & 255, 255], (y * 32 + x) * 4);
        }
        const atlas = new THREE.DataTexture(pixels, 32, 32);
        atlas.colorSpace = THREE.SRGBColorSpace; atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
        atlas.generateMipmaps = false; atlas.needsUpdate = true;
        const material = mesh.material.clone(); material.map = atlas;
        this.atlases.push(atlas); this.materials.push(material);
      }
      this.source = asset;
    } catch (error) {
      this.releaseSource(asset);
      this.materials.forEach(material => material.dispose()); this.materials.length = 0;
      this.atlases.forEach(atlas => atlas.dispose()); this.atlases.length = 0;
      throw error;
    }
  }

  create(id: WeaponId, rarity = 0): PaintedWeaponModel {
    if (!this.source || this.disposed) throw new Error('As armas ainda não estão prontas.');
    const group = new THREE.Group(); group.name = id;
    group.add(this.source.scene.getObjectByName(id)!.clone(true));
    // Blender exports unique ids; aliases become exact only inside this weapon.
    group.traverse(object => {
      if (['mag', 'bolt', 'slide', 'grip_l'].includes(object.userData.partRole)) object.name = object.userData.partRole;
    });
    const get = (part: string) => group.getObjectByName(`${id}_${part}`)!;
    const sight = get('sight');
    const model = { group, muzzle: get('muzzle'), eject: get('eject'), magazine: get('magazine'), action: get('action'),
      support: get('left_paw') || new THREE.Group(), sightY: sight.position.y, legendary: get('legendary') };
    this.setRarity(model, rarity); this.instances.add(group);
    return model;
  }

  setRarity(model: PaintedWeaponModel, rarity: number): void {
    const tier = Number.isInteger(rarity) && rarity >= 0 && rarity < RARITY.length ? rarity : 0;
    model.group.traverse(object => {
      if (object instanceof THREE.Mesh) { object.material = this.materials[tier]; object.castShadow = true; }
    });
    model.legendary.visible = tier === 3;
  }

  release(model: PaintedWeaponModel): void {
    model.group.removeFromParent(); this.instances.delete(model.group);
  }

  private releaseSource(asset: GLTF): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    asset.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Detach instances before legacy scene disposal can touch shared geometry.
    this.instances.forEach(group => group.removeFromParent()); this.instances.clear();
    if (this.source) this.releaseSource(this.source);
    this.source = null;
    this.materials.forEach(material => material.dispose()); this.materials.length = 0;
    this.atlases.forEach(atlas => atlas.dispose()); this.atlases.length = 0;
  }
}
