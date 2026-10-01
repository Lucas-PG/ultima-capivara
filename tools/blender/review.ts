// Development-only review fixture using the actual GameRenderer and avatar hook.
import * as THREE from 'three';
import type { WeaponView } from '../../src/render/weapons';
import type { AvatarReaction } from '../../src/render/effects';
import type { AvatarView } from '../../src/render/avatars';
import type { RenderPipeline } from '../../src/render/pipeline';
import { GameRenderer } from '../../src/render/renderer';
import { createCapybaraHitboxOverlay, setCapybaraExpression, type CapybaraExpression } from '../../src/render/capybara';
import { createWorld } from '../../src/shared/world';
import { terrainHeight } from '../../src/shared/terrain';
import { WEAPONS } from '../../src/shared/weapons';
import { EMOTES } from '../../src/shared/emotes';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { emptyInput } from '../../src/shared/math';
import type { ActorState, RenderFrame, WeaponId } from '../../src/shared/types';

const params = new URLSearchParams(location.search);
const world = createWorld();
// ?graphics=low|medium|high picks the character's texture tier (and the renderer preset).
const graphics = (['low', 'medium', 'high'] as const).find(tier => tier === params.get('graphics')) ?? DEFAULT_SETTINGS.graphics;
const renderer = new GameRenderer(document.querySelector('canvas')!, world, { ...DEFAULT_SETTINGS, graphics, fov: 60 });
await renderer.warmup();
const room = params.get('lighting') === 'interior' ? world.objects.find(object => object.detail === 'prop:house:bakery') : undefined;
const center = room ? { x: room.pos.x, z: room.pos.z + .8 } : { x: Number(params.get('x') || 0), z: Number(params.get('z') || -60) };
const floor = room ? room.pos.y + .08 : terrainHeight(center.x, center.z);
const actor: ActorState = {
  id: 'capy-review', name: params.get('name') || 'Capivara M1', color: params.get('color') || '#1FB5A8', bot: false, connected: true,
  pos: { x: center.x, y: floor, z: center.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
  hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false, stage: 'ground',
  kills: 0, deaths: 0, damage: 0, weapons: [], slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 },
  reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, heat: 0,
};
const heldWeapon = params.get('weapon');
if (heldWeapon && Object.hasOwn(WEAPONS, heldWeapon)) {
  const id = heldWeapon as WeaponId;
  actor.weapons = [{ id, rarity: 0, ammo: WEAPONS[id].magazine, reserve: 90, box: 0 }];
}
// Access is confined to this dev fixture, so production renderer needs no debug API.
const view = renderer as unknown as {
  scene: THREE.Scene; gl: THREE.WebGLRenderer; pipeline: RenderPipeline; avatars: AvatarView; weaponView: WeaponView; interiorLight: THREE.PointLight;
  sun: THREE.DirectionalLight; worldView: { group: THREE.Group }; ambientLife: { points: THREE.Points };
};
// A measured unobstructed lane for actual-distance LOD review, retaining game lighting,
// fog, shadows and post-processing. This is confined to the development fixture.
if (params.has('range')) {
  view.worldView.group.visible = false; view.ambientLife.points.visible = false;
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: '#777768', roughness: 1 }));
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.set(center.x, floor, center.z); floorMesh.receiveShadow = true;
  view.scene.add(floorMesh);
  const sunDirection = view.sun.position.clone().sub(view.sun.target.position).normalize();
  view.sun.target.position.set(center.x, floor, center.z); view.sun.position.copy(view.sun.target.position).addScaledVector(sunDirection, 80);
  if (params.get('lighting') === 'shade') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8, .15, 8), new THREE.MeshStandardMaterial({ color: '#6d746e', roughness: 1 }));
    roof.position.set(center.x + sunDirection.x * 5, floor + 1.6 + sunDirection.y * 5, center.z + sunDirection.z * 5);
    roof.castShadow = true; view.scene.add(roof);
  }
}
if (room) {
  // Same bakery lamp placement and settled intensity as GameRenderer.update().
  view.interiorLight.position.set(room.pos.x + room.scale.x / 2 - 1.95, room.pos.y + .93, room.pos.z - room.scale.z * .24);
  view.interiorLight.color.set('#ffae62'); view.interiorLight.intensity = 4.3;
}
let elapsed = 0, lastClip = '';
const frame: RenderFrame = { snapshot: { actors: [actor] } as RenderFrame['snapshot'], playerId: 'camera', playing: false, input: emptyInput(), spectateId: null, dt: 1 / 30 };
view.avatars.update(frame, 0, 0);
const avatar = view.avatars.get(actor.id)!;
avatar.label.visible = false;
const hitboxes = createCapybaraHitboxOverlay(); avatar.group.add(hitboxes);

const clay = new THREE.MeshStandardMaterial({ color: '#b9b3a8', roughness: .85 });
function shot(options: { angle?: string; distance?: number; clip?: string; time?: number; overlay?: boolean; lod?: number; expression?: CapybaraExpression | null; head?: boolean; labels?: boolean; clay?: boolean; fov?: number; focus?: number; tx?: number; tz?: number } = {}) {
  const { angle = 'three-quarter', distance = 3, clip = 'idle', time = .3, overlay = false } = options;
  setCapybaraExpression(avatar.body, options.expression || null);
  avatar.group.visible = true;
  actor.velocity.z = clip === 'run' ? -6 : clip === 'walk' ? -3.9 : clip === 'crouch_walk' ? -2.1 : 0;
  actor.velocity.x = clip === 'strafe_l' ? -3.9 : clip === 'strafe_r' ? 3.9 : 0;
  if (clip === 'backpedal') actor.velocity.z = 3.9;
  if (clip === 'run') actor.velocity.z = -6.4;
  actor.velocity.y = clip === 'jump' ? 2 : clip === 'fall' ? -5 : 0;
  actor.crouch = clip.startsWith('crouch'); actor.sprint = clip === 'run';
  actor.stage = clip === 'freefall' ? 'falling' : clip === 'parachute' ? 'parachute' : 'ground';
  // Emotes, reactions and reloads start once when the clip changes, then play on.
  if (clip !== lastClip) {
    if (lastClip === 'death') view.avatars.respawn(actor.id);
    lastClip = clip;
    actor.emote = null; actor.emoteUntil = 0; actor.reloadUntil = 0; actor.alive = true;
    if (clip in EMOTES) { actor.emote = clip as ActorState['emote']; actor.emoteUntil = elapsed + EMOTES[clip as keyof typeof EMOTES].duration; }
    if (clip === 'death') { view.avatars.react(actor.id, { kind: 'death', head: false, weapon: 'm4', from: { x: center.x + 3, y: floor + 1.4, z: center.z } }); actor.alive = false; }
    if (clip === 'hit') view.avatars.react(actor.id, { kind: 'hit', head: false, amount: 30, from: { x: center.x + 3, y: floor + 1.4, z: center.z - 1 } });
    if (clip === 'reload' && actor.weapons.length) { actor.weapons[actor.slot].ammo = 0; actor.reloadUntil = elapsed + (WEAPONS[actor.weapons[actor.slot].id].reload || 1); }
    if (clip === 'swim') actor.swimming = true; else actor.swimming = false;
  }
  actor.grounded = !['jump', 'fall', 'freefall', 'parachute'].includes(clip);
  hitboxes.visible = overlay;
  const azimuth = angle === 'side' ? Math.PI / 2 : angle === 'front' ? 0 : angle === 'back' ? Math.PI : angle === 'left' ? -Math.PI / 4 : Math.PI / 4;
  // The near paw advances toward the lens during run, requiring extra room at 1 m.
  renderer.camera.fov = options.fov ?? (options.head ? 42 : distance === 1 ? 120 : 60);
  const focusY = options.focus ?? (options.head ? 1.6 : .94);
  // Optional look-at point in character space (x right, z forward is -z), e.g. a paw on the gun.
  const [tx, tz] = [options.tx ?? 0, options.tz ?? 0];
  renderer.camera.position.set(center.x + tx + Math.sin(azimuth) * distance, floor + focusY, center.z + tz - Math.cos(azimuth) * distance);
  renderer.camera.lookAt(center.x + tx, floor + focusY, center.z + tz);
  renderer.camera.updateProjectionMatrix();
  if (options.lod !== undefined) {
    const lod = avatar.body.getObjectByName('Capivara_LOD') as THREE.LOD;
    lod.autoUpdate = false; lod.levels.forEach((level, i) => { level.object.visible = i === options.lod; });
  } else (avatar.body.getObjectByName('Capivara_LOD') as THREE.LOD).autoUpdate = true;
  renderer.resize();
  frame.dt = 1 / 30;
  for (let i = 0; i < Math.ceil(time * 30); i++) {
    frame.snapshot!.time = elapsed += 1 / 30;
    view.avatars.update(frame, 0, elapsed);
  }
  if (!options.labels) avatar.label.visible = false;
  const stats = { drawCalls: 0, triangles: 0 };
  view.scene.overrideMaterial = options.clay ? clay : null;
  view.pipeline.render(view.scene, renderer.camera, stats);
  view.scene.overrideMaterial = null;
  document.querySelector<HTMLElement>('#caption')!.hidden = params.has('clean');
  document.querySelector('#caption')!.innerHTML = `<strong>CAPIVARA • ${clip.toUpperCase()}</strong><br>${angle} · ${distance} m · ${overlay ? 'hitbox cabeça r 0,25 / corpo r 0,30' : 'paleta Pincel · rig do jogo'}<br><small>Renderer do jogo · câmera fixa de revisão · FOV ${renderer.camera.fov}° · ${room ? 'interior' : 'exterior'}</small>`;
  const lod = avatar.body.getObjectByName('Capivara_LOD') as THREE.LOD;
  return { name: avatar.body.name, children: avatar.body.children.length, triangles: stats.triangles, drawCalls: stats.drawCalls,
    distance: renderer.camera.position.distanceTo(new THREE.Vector3(center.x, floor + focusY, center.z)),
    lod: lod.levels.findIndex(level => level.object.visible), fov: renderer.camera.fov,
    lighting: params.get('lighting') || 'daylight', range: params.has('range') };
}
function advance(seconds: number, firstPerson = false) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= frame.dt) {
    frame.dt = Math.min(remaining, 1 / 60); elapsed += frame.dt;
    frame.snapshot!.time = elapsed;
    view.avatars.update(frame, 0, elapsed);
    view.weaponView.update(actor, frame.dt, DEFAULT_SETTINGS, 0, elapsed);
  }
  avatar.label.visible = false;
  avatar.group.visible = !firstPerson;
  view.pipeline.render(view.scene, renderer.camera, { drawCalls: 0, triangles: 0 }, firstPerson ? view.weaponView.scene : undefined, firstPerson ? view.weaponView.camera : undefined);
}
(window as unknown as { capyReview: unknown }).capyReview = {
  shot, advance, renderer, actor, avatar, frame, ready: true,
  get time() { return elapsed; },
  reload: (empty = true, seconds = 0, firstPerson = true) => {
    actor.stage = 'ground'; actor.alive = true; actor.grounded = true; actor.crouch = false; actor.sprint = false;
    actor.velocity = { x: 0, y: 0, z: 0 }; actor.ads = false; actor.reloadUntil = 0;
    view.weaponView.update(undefined, 0, DEFAULT_SETTINGS, 0, elapsed);
    advance(.35, firstPerson);
    actor.weapons[actor.slot].ammo = empty ? 0 : 14; actor.reloadUntil = elapsed + WEAPONS.m4.reload;
    advance(seconds, firstPerson);
  },
  react: (reaction: AvatarReaction) => view.avatars.react(actor.id, reaction),
  respawn: () => view.avatars.respawn(actor.id),
  inspect: () => view.weaponView.inspect(),
};
shot({ angle: params.get('angle') || 'three-quarter', distance: Number(params.get('distance') || 3), clip: params.get('clip') || 'idle', overlay: params.has('overlay'), head: params.has('head'), expression: params.get('expression') as CapybaraExpression | null, labels: params.has('labels'), time: params.has('labels') ? 1 : .3 });
