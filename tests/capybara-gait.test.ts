import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Vector3, type Bone } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { buildCapybaraBody, disposeCapybaraAssets, preloadCapybaraAsset, updateCapybaraBody } from '../src/render/capybara';
import type { ActorState } from '../src/shared/types';
import metrics from '../public/models/capybara/metrics.json';

beforeAll(async () => {
  const bytes = await readFile('public/models/capybara/capybara.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 16, height: 16, close() {} }));
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    await preloadCapybaraAsset(async () => gltf);
  } finally { vi.unstubAllGlobals(); }
});
afterAll(() => disposeCapybaraAssets());

// A foot on the ground must move under the body exactly as fast as the actor travels (the
// runtime owns travel), or it visibly skates. Contact is read from the real skinned rig: the
// sole's point under the toe hinge, which also stays put while the heel peels off.
describe('shipped feet stay planted while the simulated actor travels', () => {
  for (const [name, x, z, crouch, sprint] of [
    ['walk', 0, -3.9, false, false], ['heavy walk', 0, -3.5, false, false], ['aimed walk', 0, -2.3, false, false],
    ['slow walk', 0, -.6, false, false], ['backpedal', 0, 3.9, false, false], ['strafe left', -3.9, 0, false, false],
    ['strafe right', 3.9, 0, false, false], ['diagonal walk', 2.76, -2.76, false, false], ['between two headings', 1.49, -3.6, false, false], ['back diagonal', -2.76, 2.76, false, false],
    ['walk into sprint', 0, -5.2, false, true], ['sprint', 0, -6.4, false, true], ['boosted sprint', 0, -8, false, true],
    ['crouch walk', 0, -2.1, true, false], ['crouch strafe', 1.5, -1.5, true, false],
  ] as const) it(name, () => {
    const { body } = buildCapybaraBody('#E76F51');
    const actor = { velocity: { x, y: 0, z }, yaw: 0, pitch: 0, stage: 'ground', grounded: true,
      crouch, sprint, weapons: [], slot: 0, reloadUntil: 0, emoteUntil: 0, emote: null } as unknown as ActorState;
    body.updateMatrixWorld(true);
    const feet = ['L', 'R'].map((side, i) => {
      const bone = body.getObjectByName(`foot_${side}`) as Bone;
      const local = bone.worldToLocal(new Vector3().fromArray(metrics.footContact[side as 'L' | 'R']));
      return { bone, local, previous: new Vector3(), grounded: 0, slides: 0, drift: [] as number[], minY: Infinity, lifts: 0, wasUp: false };
    });
    const dt = 1 / 240;
    for (let i = 0; i < 1200; i++) {
      updateCapybaraBody(body, actor, dt, i * dt); body.updateMatrixWorld(true);
      for (const foot of feet) {
        const point = foot.bone.localToWorld(foot.local.clone());
        if (i > 240) {
          foot.minY = Math.min(foot.minY, point.y);
          const up = point.y > .02;
          if (up && !foot.wasUp) foot.lifts++;
          foot.wasUp = up;
          if (point.y < .006 && foot.previous.y < .006) {
            const slip = Math.hypot((point.x - foot.previous.x) / dt + x, (point.z - foot.previous.z) / dt + z);
            foot.grounded++; foot.drift.push(slip);
          }
        }
        foot.previous.copy(point);
      }
    }
    body.skeleton.dispose();
    for (const foot of feet) {
      foot.drift.sort((a, b) => a - b);
      const median = foot.drift[Math.floor(foot.drift.length / 2)], p90 = foot.drift[Math.floor(foot.drift.length * .9)];
      expect(foot.grounded, 'each foot must spend real time on the ground').toBeGreaterThan(80);
      expect(foot.lifts, 'each foot must also step (lift off) repeatedly').toBeGreaterThan(1);
      expect(foot.minY, 'contact cannot sink through the floor').toBeGreaterThan(-.008);
      expect(median, 'a planted foot holds still in the world').toBeLessThan(.08);
      expect(p90, 'touchdown and lift-off may not skate either').toBeLessThan(.3);
    }
  });
});
