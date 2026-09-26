import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { DEFAULT_SETTINGS } from '../src/settings';
import { RELOAD_CUES, SUPPORT_PALM } from '../src/shared/weapon-presentation';
import { WEAPONS } from '../src/shared/weapons';
import type { ActorState, WeaponId } from '../src/shared/types';
import type { AssetLoader } from '../src/render/assets';
import type { WeaponView } from '../src/render/weapons';

let view: WeaponView;
let grips: { id: WeaponId; gripAnchors: { left?: number[] } }[];
beforeAll(async () => {
  grips = JSON.parse(await readFile('public/models/weapons/metrics.json', 'utf8')).weapons;
  const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
    createRadialGradient: () => ({ addColorStop() {} }) };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('location', { search: '' }); vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  const bytes = await readFile('public/models/weapons/painted-weapons.glb');
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const { WeaponView } = await import('../src/render/weapons');
  view = new WeaponView({ gltf: async () => gltf } as unknown as AssetLoader);
  await view.assets;
  view.camera.aspect = 16 / 9; view.camera.updateProjectionMatrix();
});
afterAll(() => { view?.dispose(); vi.unstubAllGlobals(); });

function frame(id: WeaponId, progress: number) {
  const actor = { alive: true, stage: 'ground', grounded: true, swimming: false, yaw: 0, pitch: 0,
    velocity: { x: 0, y: 0, z: 0 }, ads: false, sprint: false,
    weapons: [{ id, rarity: 0 }], slot: 0, reloadUntil: 0 } as unknown as ActorState;
  view.update(undefined, 0, DEFAULT_SETTINGS, 0, 10);
  for (let i = 0; i < 30; i++) view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, 10);
  actor.reloadUntil = 10 + WEAPONS[id].reload;
  view.update(actor, 0, DEFAULT_SETTINGS, 0, 10 + progress * WEAPONS[id].reload);
  view.scene.updateMatrixWorld(true);
  let root!: THREE.Object3D;
  view.scene.traverseVisible(object => { if (!root && object.name === id) root = object; });
  return { actor, root };
}

function vertices(root: THREE.Object3D) {
  const points: THREE.Vector3[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
  });
  return points;
}

describe('decoded first-person reload readability', () => {
  it('pivots each support paw around its exported palm centre', () => {
    for (const weapon of grips) if (weapon.gripAnchors.left)
      expect(SUPPORT_PALM[weapon.id], weapon.id).toEqual(weapon.gripAnchors.left);
  });
  it.each(['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper'] as const)('%s keeps the receiver on screen and the reaching forearm away from the lens', id => {
    const cue = RELOAD_CUES[id];
    for (const progress of [cue.grab, cue.out, cue.insert, cue.seat, cue.rack, cue.close]) {
      const { root } = frame(id, progress), inverse = root.matrixWorld.clone().invert();
      // Check the actual central receiver, excluding the long barrel and stock
      // that intentionally extend beyond the hip frame even at rest.
      const receiver = vertices(root.getObjectByName(`${id}_body`)!).filter(point => {
        const local = point.clone().applyMatrix4(inverse);
        return local.z > -.23 && local.z < .16 && local.y > -.12 && local.y < .12;
      }).map(point => point.project(view.camera));
      expect(receiver.length).toBeGreaterThan(50);
      const bounds = new THREE.Box3().setFromPoints(receiver);
      expect(bounds.min.x, `${id} receiver clears the crosshair at ${progress}`).toBeGreaterThan(.015);
      expect(bounds.max.x).toBeLessThan(.9);
      expect(bounds.min.y).toBeGreaterThan(-.8); expect(bounds.max.y).toBeLessThan(.65);
      if (progress >= cue.rack) {
        const nearest = Math.max(...vertices(root.getObjectByName('grip_l')!).map(point => point.z));
        expect(nearest, `${id} rack must not put a sleeve against the lens`).toBeLessThan(-.25);
      }
    }
  });

  it('shows a detached old magazine and a distinct replacement without losing either below the frame at the exchange beats', () => {
    for (const id of ['pistol', 'smg', 'm4', 'dmr', 'sniper'] as const) {
      const cue = RELOAD_CUES[id];
      for (const [progress, part] of [[cue.out, 'discarded-magazine'], [cue.insert, 'mag']] as const) {
        const { root } = frame(id, progress), magazine = root.getObjectByName(part)!;
        expect(magazine.visible).toBe(true);
        const points = vertices(magazine), inverse = root.matrixWorld.clone().invert();
        const top = Math.max(...points.map(point => point.clone().applyMatrix4(inverse).y));
        expect(top, `${id} ${part} clears the magazine well`).toBeLessThan(-.20);
        const projected = new THREE.Box3().setFromPoints(points.map(point => point.project(view.camera)));
        const centre = projected.getCenter(new THREE.Vector3()), size = projected.getSize(new THREE.Vector3());
        expect(centre.x).toBeGreaterThan(-.9); expect(centre.x).toBeLessThan(.9);
        expect(centre.y, `${id} ${part} remains above the lower HUD`).toBeGreaterThan(-.88);
        expect(size.x * 640, `${id} ${part} has a readable silhouette at 720p`).toBeGreaterThan(18);
        expect(size.y * 360).toBeGreaterThan(20);
      }
    }
  });

  it('restores one seated magazine and removes the discarded one on completion, cancellation and respawn', () => {
    for (const end of ['complete', 'cancel', 'respawn'] as const) {
      const { root, actor } = frame('m4', RELOAD_CUES.m4.out), mag = root.getObjectByName('mag')!, discarded = root.getObjectByName('discarded-magazine')!;
      expect(discarded.visible).toBe(true); expect(mag.visible).toBe(false);
      if (end === 'respawn') view.update(undefined, 0, DEFAULT_SETTINGS, 0, 11);
      actor.reloadUntil = 0;
      for (let i = 0; i < 60; i++) view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, end === 'complete' ? 13 : 11);
      expect(mag.visible).toBe(true); expect(discarded.visible).toBe(false);
      expect(mag.position.length()).toBe(0); expect(discarded.position.length()).toBe(0);
      expect(root.getObjectByName('grip_l')!.position.length()).toBe(0);
    }
  });

  it('carries a full-size shell into the underside loading mouth before hiding it', () => {
    const cue = RELOAD_CUES.shotgun, mouth = new THREE.Vector3(0, -.129, -.094);
    const { root } = frame('shotgun', cue.out), shell = root.getObjectByName('reload-prop')!;
    expect(shell.visible).toBe(true); expect(shell.scale.toArray()).toEqual([1, 1, 1]);
    const fetched = shell.getWorldPosition(new THREE.Vector3()).applyMatrix4(root.matrixWorld.clone().invert());
    expect(fetched.y).toBeLessThan(mouth.y - .10);
    const seated = frame('shotgun', cue.seat - .008).root;
    const entering = seated.getObjectByName('reload-prop')!;
    expect(entering.visible).toBe(true);
    const contact = entering.getWorldPosition(new THREE.Vector3()).applyMatrix4(seated.matrixWorld.clone().invert());
    expect(Math.abs(contact.x - mouth.x)).toBeLessThan(.012);
    expect(Math.abs(contact.z - mouth.z)).toBeLessThan(.018);
    expect(contact.y).toBeGreaterThan(mouth.y); expect(contact.y).toBeLessThan(mouth.y + .05);
    expect(frame('shotgun', cue.seat).root.getObjectByName('reload-prop')!.visible).toBe(false);
  });
});
