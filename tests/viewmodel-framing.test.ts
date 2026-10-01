import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, Settings, WeaponId } from '../src/shared/types';
import { WEAPONS } from '../src/shared/weapons';
import { measureFrame, type FrameMetrics } from '../src/render/viewmodel-frame';
import { ADS_TARGET, CORRIDOR, ELBOW_BEND, FRAME_CLASS, HIP_TARGETS, NEAREST_VISIBLE, type Box, type Range } from '../src/render/viewmodel-targets';

// The first-person framing contract, measured on the real weapon and arm assets through the real
// WeaponView: where each gun sits on screen at the hip, its angles against the view, how much of the
// screen it and the arms cover, the aimed sight picture, the near plane and the weapon size setting.
// Targets: src/render/viewmodel-targets.ts (from docs/overhaul/viewmodel-research.md).

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const loaded = new Map<string, Promise<unknown>>();
// Geometry only: textures are dropped, meshopt and quantisation decoded by gltf-transform.
async function realAsset(url: string) {
  if (!loaded.has(url)) loaded.set(url, (async () => {
    await MeshoptDecoder.ready;
    const doc = await io.read(`public/${url}`);
    for (const texture of doc.getRoot().listTextures()) texture.dispose();
    for (const extension of doc.getRoot().listExtensionsUsed())
      if (extension.extensionName === 'EXT_meshopt_compression' || extension.extensionName === 'EXT_texture_webp') extension.dispose();
    const bin = await io.writeBinary(doc);
    return new GLTFLoader().parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, '');
  })());
  return loaded.get(url)!;
}

const IDS: WeaponId[] = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'coco', 'machete'];
type View = import('../src/render/weapons').WeaponView;
let view: View;
let time = 1;
const actor = { alive: true, stage: 'ground', grounded: true, swimming: false, crouch: false, lean: 0, yaw: 0, pitch: 0,
  weapons: [{ id: 'm4', rarity: 0, ammo: 30, reserve: 60, box: 0 }], slot: 0, reloadUntil: 0, ads: false, sprint: false,
  velocity: { x: 0, y: 0, z: 0 }, emote: null, emoteUntil: 0 } as unknown as ActorState;
const step = (seconds: number, settings: Settings = DEFAULT_SETTINGS) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) { time += 1 / 60; view.update(actor, 1 / 60, settings, 0, time); }
};
function hold(id: WeaponId, ads = false, settings: Settings = DEFAULT_SETTINGS) {
  actor.weapons = [{ id, rarity: 0, ammo: Math.min(12, WEAPONS[id].magazine), reserve: 60, box: 0 }];
  actor.ads = false; actor.sprint = false; actor.reloadUntil = 0; actor.velocity = { x: 0, y: 0, z: 0 };
  step(1.2, settings);
  if (ads) { actor.ads = true; step(1, settings); }
  return measureFrame(view, 192);
}
const inBox = (p: { x: number; y: number }, box: Box) => p.x >= box.x[0] && p.x <= box.x[1] && p.y >= box.y[0] && p.y <= box.y[1];
const within = (value: number, range: Range) => value >= range[0] && value <= range[1];
const point = (p: { x: number; y: number } | undefined) => p ? `${p.x.toFixed(3)}, ${p.y.toFixed(3)}` : 'none';

beforeAll(async () => {
  const { WeaponView } = await import('../src/render/weapons');
  view = new WeaponView({ gltf: realAsset } as never);
  await view.assets;
  view.resize(1280, 720);
}, 120_000);

describe('first-person framing at the hip', () => {
  const hips = new Map<WeaponId, FrameMetrics>();
  for (const id of IDS) it(`${id}: sits where the research composition puts it`, () => {
    const f = hold(id), target = HIP_TARGETS[FRAME_CLASS[id]];
    hips.set(id, f);
    expect(inBox(f.muzzle, target.muzzle), `muzzle at ${point(f.muzzle)}`).toBe(true);
    if (target.sight) expect(inBox(f.sight, target.sight), `sight at ${point(f.sight)}`).toBe(true);
    expect(inBox(f.grip, target.grip), `firing grip at ${point(f.grip)}`).toBe(true);
    if (target.support) expect(inBox(f.L!.wrist, target.support), `support wrist at ${point(f.L?.wrist)}`).toBe(true);
    expect(within(f.yaw, target.yaw), `yaw ${f.yaw.toFixed(1)}`).toBe(true);
    expect(within(f.pitch, target.pitch), `pitch ${f.pitch.toFixed(1)}`).toBe(true);
    expect(within(f.roll, target.roll), `roll ${f.roll.toFixed(1)}`).toBe(true);
    expect(within(f.coverage, target.coverage), `coverage ${(f.coverage * 100).toFixed(1)}%`).toBe(true);
    expect(f.corridor, `central band ${(f.corridor * 100).toFixed(1)}%`).toBeLessThanOrEqual(target.corridorMax);
    expect(f.reticle, 'the reticle itself is clear').toBe(0);
    // The support forearm rises from the bottom edge, never across the lower left from the side.
    if (target.supportExit) {
      const exit = f.L!.exits.bottom;
      expect(exit, 'support forearm leaves through the bottom edge').toBeDefined();
      const middle = (exit!.from + exit!.to) / 2;
      expect(within(middle, target.supportExit), `support exit centred at ${middle.toFixed(3)}`).toBe(true);
      expect(f.L!.exits.left, 'support forearm reaches the left edge').toBeUndefined();
    }
    expect(f.nearCuts).toBe(0);
    expect(f.nearestVisible).toBeGreaterThan(NEAREST_VISIBLE);
    for (const arm of [f.R, f.L]) if (arm && (id !== 'machete' || arm === f.R)) expect(within(arm.bend, ELBOW_BEND), `elbow ${arm.bend.toFixed(0)}`).toBe(true);
  });

  it('keeps the long guns pointing along the view: no barrel across the screen', () => {
    for (const id of ['smg', 'm4', 'shotgun', 'dmr', 'sniper', 'coco'] as const) {
      const f = hips.get(id) ?? hold(id);
      // The muzzle is right of the reticle and the sight further right: the bore recedes toward the centre.
      expect(f.muzzle.x, id).toBeGreaterThan(.5);
      expect(f.sight.x - f.muzzle.x, id).toBeGreaterThan(.05);
      expect(Math.abs(f.yaw), id).toBeLessThan(11);
      expect(Math.abs(f.roll), id).toBeLessThan(11);
    }
  });

  it('frames the same way on a taller window (1470 x 956)', () => {
    view.resize(1470, 956);
    try {
      for (const id of IDS) {
        const f = hold(id), target = HIP_TARGETS[FRAME_CLASS[id]];
        expect(f.nearCuts, id).toBe(0);
        expect(f.corridor, id).toBeLessThanOrEqual(target.corridorMax + .02);
        expect(f.coverage, id).toBeLessThanOrEqual(target.coverage[1] + .03);
        expect(f.muzzle.x, id).toBeGreaterThan(.48);
      }
    } finally { view.resize(1280, 720); }
  });
});

describe('aimed', () => {
  for (const id of IDS.filter(id => id !== 'machete')) it(`${id}: the sight on the reticle, the support forearm small`, () => {
    const f = hold(id, true);
    expect(Math.abs(f.sight.x - .5), `sight at ${point(f.sight)}`).toBeLessThan(ADS_TARGET.sightTolerance);
    expect(Math.abs(f.sight.y - .5), `sight at ${point(f.sight)}`).toBeLessThan(ADS_TARGET.sightTolerance);
    expect(Math.abs(f.yaw) + Math.abs(f.roll)).toBeLessThan(1);
    expect(f.L?.coverage ?? 0, 'support arm').toBeLessThan(ADS_TARGET.supportMax);
    expect(f.coverage).toBeLessThan(ADS_TARGET.coverageMax);
    expect(f.nearCuts).toBe(0);
  });
});

describe('weapon size setting', () => {
  it('scales the hip view of every gun and leaves the aimed picture exact', () => {
    for (const id of ['pistol', 'm4', 'sniper'] as const) {
      const small = hold(id, false, { ...DEFAULT_SETTINGS, weaponSize: .8 });
      const normal = hold(id);
      const large = hold(id, false, { ...DEFAULT_SETTINGS, weaponSize: 1.2 });
      // A lens change about the screen centre: every point moves along its ray from the reticle by the size.
      const reach = (f: FrameMetrics) => Math.hypot((f.muzzle.x - .5) * 16 / 9, f.muzzle.y - .5);
      // (Within the idle breathing sway, which keeps moving between the samples.)
      expect(Math.abs(reach(small) / reach(normal) - .8), id).toBeLessThan(.05);
      expect(Math.abs(reach(large) / reach(normal) - 1.2), id).toBeLessThan(.05);
      expect(small.weaponCoverage, id).toBeLessThan(normal.weaponCoverage);
      expect(large.weaponCoverage, id).toBeGreaterThan(normal.weaponCoverage);
      for (const size of [.8, 1.2]) {
        const aimed = hold(id, true, { ...DEFAULT_SETTINGS, weaponSize: size });
        expect(Math.abs(aimed.sight.x - .5) + Math.abs(aimed.sight.y - .5), `${id} aimed at size ${size}`).toBeLessThan(ADS_TARGET.sightTolerance);
      }
    }
  });
});

describe('every sampled state', () => {
  // Reload, inspect, draw and sprint sampled every 0.1 s: nothing inside the near plane or on top of the eye.
  for (const id of IDS) it(`${id}: no surface cut by the near plane`, () => {
    const worst = { near: Infinity, at: '' };
    const check = (label: string) => {
      const f = measureFrame(view, 96);
      expect(f.nearCuts, label).toBe(0);
      if (f.nearestVisible < worst.near) { worst.near = f.nearestVisible; worst.at = label; }
    };
    hold(id);
    if (id !== 'machete') {
      actor.weapons[0].ammo = 0; actor.reloadUntil = time + WEAPONS[id].reload;
      for (let t = 0; t < WEAPONS[id].reload; t += .1) { step(.1); check(`reload ${t.toFixed(1)}`); }
      actor.reloadUntil = 0; actor.weapons[0].ammo = WEAPONS[id].magazine; step(.5);
    }
    view.inspect();
    for (let t = 0; t < 1.8; t += .1) { step(.1); check(`inspect ${t.toFixed(1)}`); }
    actor.sprint = true; actor.velocity = { x: 0, y: 0, z: -7 };
    for (let t = 0; t < .6; t += .1) { step(.1); check(`sprint ${t.toFixed(1)}`); }
    actor.sprint = false; actor.velocity = { x: 0, y: 0, z: 0 };
    expect(worst.near, worst.at).toBeGreaterThan(NEAREST_VISIBLE);
  }, 60_000);
});

it('targets the central band the research measured', () => {
  expect(CORRIDOR.x[0]).toBeLessThan(.5); expect(CORRIDOR.x[1]).toBeGreaterThan(.5);
  expect(CORRIDOR.y[0]).toBeLessThan(.5); expect(CORRIDOR.y[1]).toBeGreaterThan(.5);
});
