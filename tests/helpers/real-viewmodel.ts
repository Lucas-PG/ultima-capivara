import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { ActorState, Settings, WeaponId } from '../../src/shared/types';
import { WEAPONS } from '../../src/shared/weapons';
import { WeaponView } from '../../src/render/weapons';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const geometry = new Map<string, Promise<Uint8Array>>();

/** Load the shipped meshes in Node, without a browser or texture decoder. Cache
 * bytes, not live scene objects: WeaponView reparents parts and edits arm skin. */
export async function realGeometryAsset(url: string) {
  let bytes = geometry.get(url);
  if (!bytes) {
    bytes = (async () => {
      await MeshoptDecoder.ready;
      const doc = await io.read(`public/${url}`);
      for (const texture of doc.getRoot().listTextures()) texture.dispose();
      for (const extension of doc.getRoot().listExtensionsUsed())
        if (extension.extensionName === 'EXT_meshopt_compression' || extension.extensionName === 'EXT_texture_webp') extension.dispose();
      return io.writeBinary(doc);
    })();
    geometry.set(url, bytes);
  }
  const data = await bytes;
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, '');
}

export async function realViewmodel(width = 1470, height = 956) {
  const view = new WeaponView({ gltf: realGeometryAsset } as never);
  await view.assets;
  view.resize(width, height);
  const actor: ActorState = {
    id: 'holding-check', name: 'Capivara', color: '#1fb5a8', bot: false, connected: true,
    pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
    hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false,
    jumping: false, swimming: false, wetUntil: 0, emote: null, emoteUntil: 0, soaking: false,
    bounceSeq: 0, bounceProtected: false, stage: 'ground', kills: 0, deaths: 0, damage: 0, weaponLevel: 0,
    weapons: [{ id: 'pistol', rarity: 0, ammo: 12, reserve: 60, box: 0 }], slot: 0,
    consumables: { medkit: 0, bandage: 0, guarana: 0, acai: 0, rapadura: 0 },
    reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, shotHeat: 0, shotSeq: 0,
  };
  let time = 1;
  const step = (seconds: number, settings: Settings = DEFAULT_SETTINGS) => {
    for (let remaining = seconds; remaining > 1e-9;) {
      const dt = Math.min(1 / 60, remaining);
      time += dt; remaining -= dt;
      view.update(actor, dt, settings, 0, time);
    }
    view.scene.updateMatrixWorld(true);
  };
  const hold = (weapon: WeaponId, aimed = false) => {
    actor.weapons = [{ id: weapon, rarity: 0, ammo: Math.min(12, WEAPONS[weapon].magazine), reserve: 60, box: 0 }];
    actor.slot = 0; actor.ads = actor.sprint = actor.crouch = actor.swimming = actor.jumping = false;
    actor.grounded = true; actor.reloadUntil = 0; actor.velocity = { x: 0, y: 0, z: 0 };
    actor.emote = null; actor.emoteUntil = 0;
    step(1.8);
    if (aimed) { actor.ads = true; step(1); }
  };
  return { view, actor, step, hold, now: () => time, dispose: () => view.dispose() };
}
