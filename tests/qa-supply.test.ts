import { afterEach, expect, it, vi } from 'vitest';
import { installQa } from './visual/qa-hook';
import { createWorld } from '../src/shared/world';
import { emptyInput } from '../src/shared/math';
import { DEFAULT_SETTINGS } from '../src/settings';
import { clearSupplyLanding, supplyDropPhase, supplyDropPosition } from '../src/shared/supply-drops';
import type { RenderFrame, Vec3 } from '../src/shared/types';

afterEach(() => vi.unstubAllGlobals());

it('reviews every delivery phase at one real dry landing with a valid landed prompt and opened loot', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('document', { querySelector: () => null });
  const world = createWorld();
  let frame: RenderFrame | undefined, interaction: any = null;
  const renderer = { update: (next: RenderFrame) => { frame = next; }, prepareMatch: async () => {}, event: () => {},
    cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 } };
  installQa({ world, settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: (_s: unknown, _id: string, _a: number, _b: boolean, _c: number, target: unknown) => { interaction = target; },
      event: () => {}, setPaused: () => {}, closeEmoteWheel: () => {} } as any, begin: async () => renderer as any });
  const qa = window.__capyQA!; await qa.start();
  const positions: Vec3[] = [];
  for (const [pose, phase] of [['supplyIncoming', 'incoming'], ['supplyDescending', 'descending'], ['supplyLanded', 'landed'], ['supplyOpened', 'opened']]) {
    await qa.pose(pose);
    const snapshot = frame!.snapshot!, drop = snapshot.supplyDrops[0];
    expect(snapshot.config.mode).toBe('battle-royale'); expect(clearSupplyLanding(world, drop.pos)).toBe(true);
    expect(supplyDropPhase(drop, snapshot.time)).toBe(phase);
    if (phase === 'descending') expect(supplyDropPosition(drop, snapshot.time).y).toBeGreaterThan(drop.pos.y + 8);
    expect(interaction?.id === drop.id).toBe(phase === 'landed');
    if (phase === 'opened') expect(snapshot.loot.some(item => item.id === 'supply-qa-weapon' && item.rarity === 3)).toBe(true);
    positions.push(drop.pos);
  }
  expect(positions.every(pos => JSON.stringify(pos) === JSON.stringify(positions[0]))).toBe(true);
});
