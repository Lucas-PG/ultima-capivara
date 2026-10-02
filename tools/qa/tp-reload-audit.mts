// Geometry-only replay of real replicated world reloads. Optional jobs JSON is
// [{ weapon, phase, empty }]; otherwise includes world keys and 0.01 phases.
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../../src/render/aircraft';
import { loadAircraftFixture } from '../../tests/helpers/aircraft-fixture';
import { AvatarView } from '../../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../../src/render/capybara';
import { worldReload } from '../../src/render/world-reload';
import { handContact, sampleChoreo, newSample } from '../../src/render/viewmodel-choreo';
import { WEAPONS } from '../../src/shared/weapons';
import type { WeaponId } from '../../src/shared/types';
import { realGeometryAsset } from '../../tests/helpers/real-viewmodel';
import { poseWorldReload, worldWristAngles } from '../../tests/helpers/thirdperson-contact';
import { installThirdPersonGripProbe } from './tp-grip-adapter.mjs';
import { worldTriggerIndices } from './world-trigger.mjs';
import { worldContactIndices } from './world-contact.mjs';
import { measureGrip } from './grip-measure.mjs';

const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
Object.assign(globalThis, { window: globalThis, document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
await preloadAircraftAsset(loadAircraftFixture, makePlane());
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
const view = new AvatarView(scene, camera); view.resize(1470, 956);
const jobs = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : Object.keys(WEAPONS).filter(w => w !== 'machete').flatMap(weapon => [true, false].flatMap(empty => [...new Set([...Array.from({ length: 101 }, (_, i) => i / 100), ...(worldReload(weapon as WeaponId, empty) ?? []).map(key => key.t)])].sort((a, b) => a - b).map(phase => ({ weapon, empty, phase }))));
const output: any[] = [];
const carrying = ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'];
try {
  for (const job of jobs) {
    const { weapon, phase, empty = true } = job as { weapon: WeaponId; phase: number; empty: boolean };
    const avatar = poseWorldReload(view, scene, weapon, phase, empty);
    Object.assign(globalThis, { capyReview: { avatar, renderer: { scene } } });
    const triggerIndices = await worldTriggerIndices(weapon);
    const contactIndices = weapon === 'm4' ? { release: await worldContactIndices(weapon, 'release') } : undefined;
    installThirdPersonGripProbe({ weaponId: weapon, triggerIndices, contactIndices });
    const wrists = worldWristAngles(avatar.body);
    const keys = worldReload(weapon, empty);
    const sample = keys && phase < 1 ? sampleChoreo(keys, phase, newSample()) : null;
    const fetch = !keys && phase < 1 ? Math.sin(Math.PI * THREE.MathUtils.clamp((phase - .15) / .6, 0, 1)) : 0;
    const contacts = { R: handContact(sample?.R ?? null, 'body'), L: fetch > 1e-6 ? null : handContact(sample?.L ?? null, weapon === 'pistol' || weapon === 'revolver' ? 'paw' : 'body') };
    const row: any = { weapon, phase, empty, wrists, contacts: {}, failures: [] };
    for (const side of ['R', 'L'] as const) {
      const m = measureGrip([weapon, side]); row[side] = m.worst; row[`${side}skin`] = m.summary;
      if (m.worst < -.5) row.failures.push(`${side} penetrates ${m.worst} mm`);
      const intent = contacts[side], surface = intent === 'mag-seat' ? 'mag' : intent;
      if (surface) {
        const part = (globalThis as any).__vmProbe.models[weapon].parts[surface];
        if (surface !== 'paw' && (!part || !part.visible)) {
          const w = wrists[side] as any;
          if (Math.abs(w.flexion) > 45.01 || w.deviation < -25.01 || w.deviation > 20.01 || Math.abs(w.pronation) > 80.01) row.failures.push(`${side} wrist outside anatomical limits`);
          continue;
        }
        const cm = measureGrip([weapon, side, surface === 'paw', { surface: surface === 'paw' ? undefined : surface, bones: side === 'R' && surface === 'body' ? carrying : undefined }]);
        const c = row.contacts[side] = { surface, gap: cm.worst, ...(intent === 'mag-seat' ? { palm: cm.regions.palm } : ['body', 'paw', 'pump', 'mag'].includes(surface) ? { palm: cm.regions.palm, wrap: cm.regions.wrap } : {}) };
        for (const key of ['gap', 'palm', 'wrap']) if (c[key] !== undefined && (!Number.isFinite(c[key]) || c[key] < -.5 || c[key] > 1.5)) row.failures.push(`${side} ${surface} ${key} ${c[key]} mm`);
      }
      const w = wrists[side] as { flexion: number; deviation: number; pronation: number };
      if (Math.abs(w.flexion) > 45.01 || w.deviation < -25.01 || w.deviation > 20.01 || Math.abs(w.pronation) > 80.01) row.failures.push(`${side} wrist outside anatomical limits`);
    }
    if (weapon === 'pistol' || weapon === 'revolver') { row.pair = measureGrip([weapon, 'L', true]).worst; if (row.pair < -.5) row.failures.push(`pair penetrates ${row.pair} mm`); }
    output.push(row);
    console.log(JSON.stringify({ weapon, phase, empty, R: row.R, L: row.L, contacts: row.contacts, wrists, failures: row.failures }));
    if (output.length % 20 === 0) await writeFile(process.argv[2], JSON.stringify(output, null, 2) + '\n');
  }
} finally { await writeFile(process.argv[2], JSON.stringify(output, null, 2) + '\n'); view.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); }
