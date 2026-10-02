import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvatarView } from '../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../src/render/capybara';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../src/render/aircraft';
import { PawPose } from '../src/render/fp-arms';
import { WORLD_GRIPS } from '../src/render/world-grips';
import { heldCurl } from '../src/render/viewmodel-specs';
import { worldReload } from '../src/render/world-reload';
import { handContact, sampleChoreo, newSample } from '../src/render/viewmodel-choreo';
import type { WeaponId } from '../src/shared/types';
import { loadAircraftFixture } from './helpers/aircraft-fixture';
import { realGeometryAsset } from './helpers/real-viewmodel';
import { poseWorldReload, worldWristAngles } from './helpers/thirdperson-contact';
// @ts-expect-error Browser and Node share this real-skin geometry adapter.
import { installThirdPersonGripProbe, worldIndexGuardOccupancy } from '../tools/qa/tp-grip-adapter.mjs';
// @ts-expect-error Browser and Node share the signed whole-solid skin probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Matches unchanged world-body triangles to their source part.
import { worldContactIndices } from '../tools/qa/world-contact.mjs';

let view: AvatarView, scene: THREE.Scene;
const probeWindow: { capyReview?: unknown; __tpProbeMeshes?: { geometry: THREE.BufferGeometry }[] } = {};
const carrying = ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'];
beforeAll(async () => {
  const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', probeWindow);
  await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
  await preloadAircraftAsset(loadAircraftFixture, makePlane());
  scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
  view = new AvatarView(scene, camera); view.resize(1470, 956);
});
afterAll(() => { for (const m of probeWindow.__tpProbeMeshes ?? []) m.geometry.dispose(); view?.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); vi.unstubAllGlobals(); });
const contact = (value: number, label: string) => {
  expect.soft(Number.isFinite(value), label).toBe(true);
  expect.soft(value, label).toBeGreaterThanOrEqual(-.5); expect.soft(value, label).toBeLessThanOrEqual(1.5);
};
describe('world M4 index withdrawal', () => {
  it('keeps real skin clear at dense intermediate digit poses and fully leaves the guard', () => {
    const avatar = poseWorldReload(view, scene, 'm4', 0, true);
    probeWindow.capyReview = { avatar, renderer: { scene } };
    installThirdPersonGripProbe({ weaponId: 'm4' });
    const source = avatar.body.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
    const paw = new PawPose(avatar.body, 'R', 'paw_', source.skeleton), grip = WORLD_GRIPS.m4.R;
    const segments = grip.indexExit!.length + 1;
    for (let segment = 0; segment < segments; segment++) {
      const a = heldCurl(grip, segment / segments), b = heldCurl(grip, (segment + 1) / segments);
      const distance = Math.hypot(...a.index.map((v, i) => v - b.index[i]), (a.indexSpread ?? 0) - (b.indexSpread ?? 0), (a.indexRoll ?? 0) - (b.indexRoll ?? 0));
      const steps = Math.max(4, Math.ceil(distance / .004));
      for (let step = 0; step <= steps; step++) {
        const amount = (segment + step / steps) / segments;
        paw.apply(heldCurl(grip, amount)); scene.updateMatrixWorld(true);
        expect.soft(measureGrip(['m4', 'R']).worst, `whole skin at indexed amount ${amount}`).toBeGreaterThanOrEqual(-.5);
      }
    }
    const endpoint = measureGrip(['m4', 'R', false, { bones: ['index1', 'index2', 'index3'] }]);
    contact(endpoint.worst, 'indexed digit rests beside receiver');
    expect(worldIndexGuardOccupancy('m4').inside, 'every actual index skin vertex leaves the guard').toBe(0);
  }, 60_000);
  for (const empty of [true, false]) it(`fully indexes during ${empty ? 'empty' : 'tactical'} runtime reload`, () => {
    const avatar = poseWorldReload(view, scene, 'm4', .1, empty);
    probeWindow.capyReview = { avatar, renderer: { scene } }; installThirdPersonGripProbe({ weaponId: 'm4' });
    expect(worldIndexGuardOccupancy('m4').inside).toBe(0);
  });
});

for (const empty of [true, false]) for (const phase of [.003, .01, .02, .03, .04, .05, .06, ...(empty ? [.913, .92, .93, .94, .95, .96, .97] : [.883, .89, .9, .91, .92, .93, .94])]) {
  it(`M4 index runtime ${empty ? 'empty' : 'tactical'} ${phase} retains its carrying paw`, () => {
    const avatar = poseWorldReload(view, scene, 'm4', phase, empty);
    probeWindow.capyReview = { avatar, renderer: { scene } }; installThirdPersonGripProbe({ weaponId: 'm4' });
    expect(measureGrip(['m4', 'R']).worst).toBeGreaterThanOrEqual(-.5);
    const hold = measureGrip(['m4', 'R', false, { surface: 'body', bones: carrying }]);
    contact(hold.regions.palm, 'carrying palm'); contact(hold.regions.wrap, 'carrying wrap');
    const wrist = worldWristAngles(avatar.body).R;
    expect(Math.abs(wrist.flexion)).toBeLessThanOrEqual(45);
    expect(wrist.deviation).toBeGreaterThanOrEqual(-25); expect(wrist.deviation).toBeLessThanOrEqual(20);
    expect(Math.abs(wrist.pronation)).toBeLessThanOrEqual(80);
  });
}
