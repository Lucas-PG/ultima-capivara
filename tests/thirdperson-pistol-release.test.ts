import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvatarView } from '../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../src/render/capybara';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../src/render/aircraft';
import { worldReload } from '../src/render/world-reload';
import { handContact, newSample, sampleChoreo } from '../src/render/viewmodel-choreo';
import { loadAircraftFixture } from './helpers/aircraft-fixture';
import { realGeometryAsset } from './helpers/real-viewmodel';
import { poseWorldReload, worldWristAngles } from './helpers/thirdperson-contact';
// @ts-expect-error Browser and Node share the shipped world-paw geometry adapter.
import { installThirdPersonGripProbe } from '../tools/qa/tp-grip-adapter.mjs';
// @ts-expect-error Measures the actual deformed skin, including the other paw.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

let view: AvatarView, scene: THREE.Scene;
const probe: { capyReview?: unknown; __tpProbeMeshes?: { geometry: THREE.BufferGeometry }[] } = {};
beforeAll(async () => {
  const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', probe);
  await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
  await preloadAircraftAsset(loadAircraftFixture, makePlane());
  scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
  view = new AvatarView(scene, camera); view.resize(1470, 956);
});
afterAll(() => { for (const mesh of probe.__tpProbeMeshes ?? []) mesh.geometry.dispose(); view?.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); vi.unstubAllGlobals(); });
const contact = (value: number, label: string) => {
  expect(Number.isFinite(value), label).toBe(true);
  expect(value, label).toBeGreaterThanOrEqual(-.5); expect(value, label).toBeLessThanOrEqual(1.5);
};
const carrying = ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'];
describe('world pistol release-lever wrist and actual skin', () => {
  for (const phase of [.775, .785, .795, .8, .805, .81, .815, .82, .825, .8275, .83, .8325, .835, .84, .85, .875, .91, .935, .96]) {
    it(`empty reload ${phase} retains natural wrists and control contact`, () => {
      const avatar = poseWorldReload(view, scene, 'pistol', phase, true);
      probe.capyReview = { avatar, renderer: { scene } };
      const adapter = installThirdPersonGripProbe({ weaponId: 'pistol' });
      expect(adapter.scale[0]).toBeCloseTo(1.3, 5);
      for (const side of ['R', 'L']) expect(measureGrip(['pistol', side]).worst, `${side} whole skin`).toBeGreaterThanOrEqual(-.5);
      expect(measureGrip(['pistol', 'L', true]).worst, 'opposing paw skin').toBeGreaterThanOrEqual(-.5);
      const sample = sampleChoreo(worldReload('pistol', true)!, phase, newSample());
      expect(handContact(sample.R, 'body'), 'the right paw continues carrying the pistol').toBe('body');
      const hold = measureGrip(['pistol', 'R', false, { surface: 'body', bones: carrying }]);
      contact(hold.regions.palm, 'right carrying palm'); contact(hold.regions.wrap, 'right carrying wrap');
      if (phase >= .81 && phase <= .825) {
        expect(handContact(sample.L, 'paw'), 'the left thumb presses the real release lever').toBe('release');
        contact(measureGrip(['pistol', 'L', false, { surface: 'release' }]).worst, 'release lever contact');
      }
      for (const [side, wrist] of Object.entries(worldWristAngles(avatar.body))) {
        expect(Math.abs(wrist.flexion), `${side} flexion`).toBeLessThanOrEqual(45.01);
        expect(wrist.deviation, `${side} deviation`).toBeGreaterThanOrEqual(-25.01);
        expect(wrist.deviation, `${side} deviation`).toBeLessThanOrEqual(20.01);
        expect(Math.abs(wrist.pronation), `${side} rotation`).toBeLessThanOrEqual(80.01);
      }
    });
  }
});
