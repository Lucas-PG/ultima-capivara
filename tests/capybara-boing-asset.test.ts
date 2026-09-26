import { expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

it('opens a fixed-root trampoline tuck into readable raised paws before the apex', async () => {
  const bytes = await readFile('public/models/capybara/capybara.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  let gltf;
  try {
    gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  } finally { vi.unstubAllGlobals(); }
  const clip = gltf.animations.find(clip => clip.name === 'boing')!;
  expect(clip).toBeDefined();
  expect(clip.duration).toBeCloseTo(1.05, 5);
  const mixer = new AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  const root = gltf.scene.getObjectByName('root')!;
  const rootStart = root.position.clone(), rootRotation = root.quaternion.clone();
  for (const time of [0, .12, .35, .40, .50, .85, 1.04]) {
    mixer.setTime(time); gltf.scene.updateMatrixWorld(true);
    expect(root.position.distanceTo(rootStart)).toBeLessThan(.00001);
    expect(root.quaternion.angleTo(rootRotation)).toBeLessThan(.0001);
    if (time >= .35 && time <= .50) {
      for (const side of ['L', 'R']) {
        const hand = gltf.scene.getObjectByName(`paw_${side}`)!.getWorldPosition(new Vector3());
        expect(hand.y, `${side} paw is raised by ${time}s`).toBeGreaterThan(1.4);
        expect(Math.abs(hand.x), `${side} paw clears the body silhouette`).toBeGreaterThan(.32);
      }
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
});

it('keeps the shipped raised-paw pose through the actual runtime blend after grounded warmup', async () => {
  const bytes = await readFile('public/models/capybara/capybara.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  const capy = await import('../src/render/capybara');
  let avatar;
  try {
    const source = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    await capy.preloadCapybaraAsset(async () => source);
    avatar = capy.buildCapybaraBody('#1fb5a8');
    const actor = { stage: 'ground', grounded: true, swimming: false, bounceProtected: false, bounceSeq: 0,
      velocity: { x: 0, y: 0, z: 0 }, weapons: [{ id: 'pistol' }], slot: 0, reloadUntil: 0, emote: null,
      emoteUntil: 0, yaw: 0, pitch: 0, crouch: false, sprint: false, ads: false } as any;
    for (let i = 0; i < 20; i++) capy.updateCapybaraBody(avatar.body, actor, .05, 30);
    actor.grounded = false; actor.bounceProtected = true; actor.bounceSeq = 1;
    for (let i = 0; i < 24; i++) {
      actor.velocity.y = 12 - 22 * i / 60;
      capy.updateCapybaraBody(avatar.body, actor, 1 / 60, 30 + i / 60);
    }
    avatar.body.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const hand = avatar.body.getObjectByName(`paw_${side}`)!.getWorldPosition(new Vector3());
      expect(hand.y, `${side} paw survives runtime blending`).toBeGreaterThan(1.4);
      expect(Math.abs(hand.x)).toBeGreaterThan(.32);
    }
  } finally {
    avatar?.body.skeleton.dispose(); capy.disposeCapybaraAssets(); vi.unstubAllGlobals();
  }
});
