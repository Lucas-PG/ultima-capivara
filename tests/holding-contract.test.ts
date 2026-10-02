import { describe, expect, it } from 'vitest';
import { blendCurl } from '../src/render/fp-arms';
import { handContact, newSample, sampleChoreo } from '../src/render/viewmodel-choreo';
import { M4_RELOAD_EMPTY, RELOADS } from '../src/render/viewmodel-anims';
import { heldCurl, VIEW_SPECS } from '../src/render/viewmodel-specs';
// @ts-expect-error Standalone browser/Node QA probes deliberately have no TypeScript dependency.
import { triggerInGuard } from '../tools/qa/trigger-guard.mjs';
// @ts-expect-error Standalone browser/Node QA report contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

describe('trigger guard intent', () => {
  it('rejects the original lateral contacts even when their surface gap was small', () => {
    expect(triggerInGuard('shotgun', [29.203, -9.716, -1.912])).toBe(false);
    expect(triggerInGuard('coco', [20.467, -13.934, -2.626])).toBe(false);
    expect(triggerInGuard('pistol', [0, -12, -30])).toBe(true);
    expect(triggerInGuard('pistol', [0, -60, -30])).toBe(false);
  });
  it('uses the same opening at world-character weapon scale', () => {
    const point = [3, -14, -25];
    expect(triggerInGuard('sniper', point)).toBe(true);
    expect(triggerInGuard('sniper', point.map(v => v * 1.3), 1.3)).toBe(true);
    expect(triggerInGuard('sniper', [20, -14, -25].map(v => v * 1.3), 1.3)).toBe(false);
  });
});

describe('carrying contact intent', () => {
  it('requires contact while a paw follows the same moving magazine through a blend', () => {
    expect(handContact({ a: { space: 'part', part: 'mag' }, b: { space: 'part', part: 'mag', wrist: [0, -.1, 0] }, u: .5 }, 'body')).toBe('mag');
  });
  it('exempts the approach and release, and checks the exact contact endpoint', () => {
    const a = { space: 'part' as const, part: 'mag', contact: false as const };
    const b = { space: 'part' as const, part: 'mag' };
    expect(handContact({ a, b, u: .5 }, 'body')).toBeNull();
    expect(handContact({ a, b, u: 1 }, 'body')).toBe('mag');
    expect(handContact({ a: b, b: a, u: 0 }, 'body')).toBe('mag');
  });
  it('keeps a handgun cup on the opposing paw and releases an offset clearance key', () => {
    expect(handContact(null, 'paw')).toBe('paw');
    expect(handContact({ a: { space: 'grip' }, b: { space: 'grip', offset: [-.04, 0, 0] }, u: .5 }, 'paw')).toBeNull();
  });
  it('keeps the load-bearing fingers in contact when only the trigger digit indexes', () => {
    expect(handContact({ a: { space: 'grip' }, b: { space: 'grip', curl: { index: [0, 0, 0] } }, u: .5 }, 'body')).toBe('body');
  });
});

describe('active contact audit', () => {
  it('rejects a floating palm even when wrapping fingers and the trigger both touch', async () => {
    const row = await holdingMetrics('smg', { action: 'hip', t: 0 }, {
      active: 'smg', visible: { R: true, L: false }, contacts: { R: 'body', trigger: true }, wrists: {},
    }, async ([, , , options = {}]: [string, string, boolean?, { surface?: string; region?: string }?]) => ({
      worst: options.region === 'palm' ? 4 : .2, regions: { palm: 4, wrap: .2 }, nearestSurfaceDistance: .2, summary: {}, digits: { index: { tip: [3, -14, -35] } },
    }));
    expect(row.failures).toEqual(['R body palm contact 4 mm']);
  });
  it('requires shell push and bolt catch contact while exempting the open magazine approach', () => {
    expect(handContact(sampleChoreo(M4_RELOAD_EMPTY, .72, newSample()).L, 'body')).toBeNull();
    expect(handContact(sampleChoreo(M4_RELOAD_EMPTY, .86, newSample()).L, 'body')).toBe('release');
    expect(handContact(sampleChoreo(RELOADS.shotgun!, .665, newSample()).L, 'pump')).toBe('mag');
    expect(handContact(sampleChoreo(RELOADS.shotgun!, .70, newSample()).L, 'pump')).toBe('mag');
  });
});

describe('shared trigger poses', () => {
  it('moves only the index while the paw stays wrapped around the grip', () => {
    const grip = { ...VIEW_SPECS.m4.grips.R, indexed: { index: [0, .1, 0] as const, indexSpread: -.25 },
      fired: { index: [.8, .9, .4] as const, indexSpread: .12 } };
    const original = structuredClone(grip);
    const safe = heldCurl(grip, 1), pulled = heldCurl(grip, 0, 1);
    expect(safe.index).toEqual(grip.indexed.index); expect(safe.indexSpread).toBe(-.25);
    expect(pulled.index).toEqual(grip.fired.index); expect(pulled.indexSpread).toBe(.12);
    for (const pose of [safe, pulled]) for (const digit of ['middle', 'ring', 'thumb'] as const) expect(pose[digit]).toEqual(grip.curl[digit]);
    expect(grip).toEqual(original);
  });
  it('returns the original ready pose and blends optional knuckle spread continuously', () => {
    const grip = VIEW_SPECS.pistol.grips.R;
    expect(heldCurl(grip)).toBe(grip.curl);
    const from = { ...grip.curl, indexSpread: -.2 }, to = { ...grip.curl, indexSpread: .4 };
    expect(blendCurl(from, to, .5).indexSpread).toBeCloseTo(.1, 10);
    expect(blendCurl(from, { ...grip.curl, indexSpread: undefined }, 1).indexSpread).toBe(0);
  });
  it('blends axial index rotation and removes ready roll at the safe default', () => {
    const grip = { ...VIEW_SPECS.pistol.grips.R, curl: { ...VIEW_SPECS.pistol.grips.R.curl, indexRoll: .3 },
      fired: { index: [.8, .1, .2] as const, indexRoll: -.1 } };
    expect(heldCurl(grip, 0, .5).indexRoll).toBeCloseTo(.1, 10);
    expect(heldCurl(grip, 1).indexRoll).toBe(0);
    expect(heldCurl(grip, .999).indexRoll).toBeCloseTo(.0003, 10);
    expect(blendCurl(grip.curl, { ...grip.curl, indexRoll: undefined }, 1).indexRoll).toBe(0);
  });
  it('follows authored clearance waypoints without releasing the carrying digits', () => {
    const grip = { ...VIEW_SPECS.m4.grips.R,
      indexExit: [{ index: [.4, .5, .3] as const, indexSpread: -.2, indexRoll: .1 }] };
    const middle = heldCurl(grip, .5);
    expect(middle.index).toEqual(grip.indexExit[0].index);
    expect(middle.indexSpread).toBe(-.2);
    expect(middle.indexRoll).toBe(.1);
    for (const finger of ['middle', 'ring', 'thumb'] as const) expect(middle[finger]).toEqual(grip.curl[finger]);
    expect(heldCurl(grip, 0)).toBe(grip.curl);
    expect(heldCurl(grip, 1).index).toEqual(grip.indexed?.index ?? [.05, .08, .05]);
  });
});
