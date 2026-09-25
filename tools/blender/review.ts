// Development-only review fixture using the actual GameRenderer and avatar hook.
import * as THREE from 'three';
import { GameRenderer } from '../../src/render/renderer';
import { preloadCapybaraAsset, createCapybaraHitboxOverlay } from '../../src/render/capybara';
import { createWorld } from '../../src/shared/world';
import { terrainHeight } from '../../src/shared/terrain';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { emptyInput } from '../../src/shared/math';
import type { ActorState, RenderFrame } from '../../src/shared/types';

const params = new URLSearchParams(location.search);
const world = createWorld();
const renderer = new GameRenderer(document.querySelector('canvas')!, world, { ...DEFAULT_SETTINGS, fov: 60 });
await preloadCapybaraAsset();
await renderer.warmup();
const floor = terrainHeight(0, -24);
const actor: ActorState = {
  id: 'capy-review', name: 'Capivara M0', color: '#B8743A', bot: false, connected: true,
  pos: { x: 0, y: floor, z: -24 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
  hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false, stage: 'ground',
  kills: 0, deaths: 0, damage: 0, weapons: [], slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 },
  reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0,
};
// Access is confined to this dev fixture, so production renderer needs no debug API.
const view = renderer as unknown as {
  scene: THREE.Scene; gl: THREE.WebGLRenderer; postTarget: THREE.WebGLRenderTarget; postScene: THREE.Scene; postCamera: THREE.Camera;
  avatars: Map<string, { group: THREE.Group; body: THREE.SkinnedMesh; label: THREE.Sprite }>;
  updateAvatars(frame: RenderFrame): void;
};
const frame: RenderFrame = { snapshot: { actors: [actor] } as RenderFrame['snapshot'], playerId: 'camera', playing: false, input: emptyInput(), spectateId: null, dt: 1 / 30 };
view.updateAvatars(frame);
const avatar = view.avatars.get(actor.id)!;
avatar.label.visible = false;
const hitboxes = createCapybaraHitboxOverlay(); avatar.group.add(hitboxes);

function shot(options: { angle?: string; distance?: number; clip?: string; time?: number; overlay?: boolean; lod?: number } = {}) {
  const { angle = 'three-quarter', distance = 3, clip = 'idle', time = .3, overlay = false } = options;
  actor.velocity.z = clip === 'run' ? -6 : 0;
  actor.grounded = clip !== 'jump';
  for (let i = 0; i < Math.ceil(time * 30); i++) view.updateAvatars(frame);
  avatar.label.visible = false; hitboxes.visible = overlay;
  const azimuth = angle === 'side' ? Math.PI / 2 : angle === 'front' ? 0 : Math.PI / 4;
  // 1 m uses a wide lens to fit the full upright body; 20 m keeps gameplay FOV.
  renderer.camera.fov = distance === 1 ? 100 : 60;
  renderer.camera.position.set(Math.sin(azimuth) * distance, floor + .94, -24 - Math.cos(azimuth) * distance);
  renderer.camera.lookAt(0, floor + .94, -24);
  renderer.camera.updateProjectionMatrix();
  if (options.lod !== undefined) {
    const lod = avatar.body.getObjectByName('Capivara_LOD') as THREE.LOD;
    lod.autoUpdate = false; lod.levels.forEach((level, i) => { level.object.visible = i === options.lod; });
  }
  renderer.resize();
  view.gl.setRenderTarget(view.postTarget); view.gl.render(view.scene, renderer.camera);
  view.gl.setRenderTarget(null); view.gl.render(view.postScene, view.postCamera);
  document.querySelector('#caption')!.innerHTML = `<strong>CAPIVARA • M0 / ${clip.toUpperCase()}</strong><br>${angle} · ${distance} m · ${overlay ? 'hitbox cabeça r 0,25 / corpo r 0,30' : 'paleta Pincel · GLB + AnimationMixer'}<br><small>Renderer do jogo · câmera fixa de revisão${distance === 1 ? ' · FOV 100° para corpo inteiro' : ' · FOV 60°'}</small>`;
  return { name: avatar.body.name, children: avatar.body.children.length, triangles: view.gl.info.render.triangles };
}
(window as unknown as { capyReview: unknown }).capyReview = { shot, renderer, actor, avatar, ready: true };
shot({ angle: params.get('angle') || 'three-quarter', distance: Number(params.get('distance') || 3), clip: params.get('clip') || 'idle', overlay: params.has('overlay') });
