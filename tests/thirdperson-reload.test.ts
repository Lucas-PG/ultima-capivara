import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvatarView } from '../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../src/render/capybara';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../src/render/aircraft';
import { worldReload } from '../src/render/world-reload';
import { handContact, sampleChoreo, newSample } from '../src/render/viewmodel-choreo';
import type { WeaponId } from '../src/shared/types';
import { loadAircraftFixture } from './helpers/aircraft-fixture';
import { realGeometryAsset } from './helpers/real-viewmodel';
import { poseWorldReload, worldWristAngles } from './helpers/thirdperson-contact';
import reported from '../docs/overhaul/evidence/codex-holding-perf/thirdperson/reload-penetrations.json';
// @ts-expect-error Browser and Node share this real-skin geometry adapter.
import { installThirdPersonGripProbe } from '../tools/qa/tp-grip-adapter.mjs';
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
const samples = reported.map(row => ({ weapon: row.weapon as WeaponId, phase: Number(row.state.split('-').at(-1)), empty: !row.state.startsWith('reload-partial') }));
// Keep the rifle-carrying wrist anatomical through the generic belt reach.
for (const phase of [.375, .45, .5, .55, .625]) samples.push({ weapon: 'sniper', phase, empty: true });
// The previous candidate's two interpolation gaps must be accepted independently.
for (const phase of [.28375, .60875]) samples.push({ weapon: 'm4', phase, empty: true });
describe('replicated world reload real-skin regressions', () => {
  for (const { weapon, phase, empty } of samples) it(`${weapon} ${empty ? 'empty' : 'tactical'} ${phase}: whole skin, contacts and wrists`, async () => {
    const avatar = poseWorldReload(view, scene, weapon, phase, empty);
    probeWindow.capyReview = { avatar, renderer: { scene } };
    const contactIndices = weapon === 'm4' ? { release: await worldContactIndices(weapon, 'release') } : undefined;
    const adapter = installThirdPersonGripProbe({ weaponId: weapon, contactIndices });
    for (const side of ['R', 'L']) {
      expect(adapter.vertices[side]).toBeGreaterThan(0);
      expect.soft(measureGrip([weapon, side]).worst, `${side} whole skin, world mm`).toBeGreaterThanOrEqual(-.5);
    }
    const keys = worldReload(weapon, empty), sample = keys ? sampleChoreo(keys, phase, newSample()) : null;
    const fetch = !keys ? Math.sin(Math.PI * THREE.MathUtils.clamp((phase - .15) / .6, 0, 1)) : 0;
    for (const side of ['R', 'L'] as const) {
      const intent = side === 'L' && fetch > 1e-6 ? null : handContact(sample?.[side] ?? null, side === 'L' && (weapon === 'pistol' || weapon === 'revolver') ? 'paw' : 'body');
      if (!intent) continue;
      const surface = intent === 'mag-seat' ? 'mag' : intent;
      const part = surface === 'mag' ? avatar.weapon.getObjectByName(`${weapon}_mag`) : undefined;
      if (part && !part.visible) continue;
      const m = measureGrip([weapon, side, surface === 'paw', { surface: surface === 'paw' ? undefined : surface, bones: side === 'R' && surface === 'body' ? carrying : undefined }]);
      contact(m.worst, `${side} ${surface}`);
      if (['body', 'paw', 'mag', 'pump'].includes(surface)) contact(m.regions.palm, `${side} ${surface} palm`);
      if (intent !== 'mag-seat' && ['body', 'paw', 'mag', 'pump'].includes(surface)) contact(m.regions.wrap, `${side} ${surface} wrap`);
    }
    if (weapon === 'pistol' || weapon === 'revolver') expect.soft(measureGrip([weapon, 'L', true]).worst, 'opposing paw skin').toBeGreaterThanOrEqual(-.5);
    for (const [side, wrist] of Object.entries(worldWristAngles(avatar.body))) {
      expect.soft(Math.abs(wrist.flexion), `${side} flexion`).toBeLessThanOrEqual(45.01);
      expect.soft(wrist.deviation, `${side} deviation`).toBeGreaterThanOrEqual(-25.01); expect.soft(wrist.deviation, `${side} deviation`).toBeLessThanOrEqual(20.01);
      expect.soft(Math.abs(wrist.pronation), `${side} pronation`).toBeLessThanOrEqual(80.01);
    }
  });
});
