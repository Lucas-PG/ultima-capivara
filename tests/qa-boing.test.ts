import { afterEach, expect, it, vi } from 'vitest';
import { installQa } from './visual/qa-hook';
import { createWorld } from '../src/shared/world';
import { emptyInput } from '../src/shared/math';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, RenderFrame } from '../src/shared/types';

afterEach(() => vi.unstubAllGlobals());

it.each([['trampolineBounce', 5], ['trampolineAir', 20]] as const)('reviews %s at its real flight time without consuming the launch clip during warmup', async (pose, ticks) => {
  vi.stubGlobal('window', {}); vi.stubGlobal('document', { querySelector: () => null });
  const frames: { dt: number; time: number; actor: ActorState }[] = [];
  const event = vi.fn();
  const renderer = {
    update: (frame: RenderFrame) => {
      const actor = frame.snapshot?.actors.find(actor => actor.id === 'bot-qa-bounce');
      if (actor) frames.push({ dt: frame.dt, time: frame.snapshot!.time, actor: structuredClone(actor) });
    },
    event, prepareMatch: async () => {}, cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 },
  };
  installQa({ world: createWorld(), settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: () => {}, setPaused: () => {}, closeEmoteWheel: () => {} } as any, begin: async () => renderer as any });
  await window.__capyQA!.start(); await window.__capyQA!.pose(pose);
  const rising = frames.filter(frame => frame.actor.bounceSeq === 1);
  const warmup = frames.filter(frame => frame.actor.bounceSeq === 0);
  expect(warmup.length).toBeGreaterThan(0);
  expect(warmup.every(frame => frame.actor.grounded && frame.actor.velocity.y === 0)).toBe(true);
  expect(rising).toHaveLength(ticks);
  expect(event).toHaveBeenCalledTimes(1);
  expect(event.mock.calls[0][0]).toMatchObject({ type: 'bounce', actor: 'bot-qa-bounce' });
  expect(rising.reduce((seconds, frame) => seconds + frame.dt, 0)).toBeCloseTo(ticks / 60, 6);
  expect(rising.at(-1)!.time - warmup.at(-1)!.time).toBeCloseTo(ticks / 60, 6);
  for (let i = 1; i < rising.length; i++) {
    expect(rising[i].actor.pos.y).toBeGreaterThan(rising[i - 1].actor.pos.y);
    expect(rising[i].actor.velocity.y).toBeLessThan(rising[i - 1].actor.velocity.y);
  }
  frames.length = 0; event.mockClear();
  await window.__capyQA!.pose(pose);
  expect(frames.filter(frame => frame.actor.bounceSeq === 2)).toHaveLength(ticks);
  expect(event).toHaveBeenCalledTimes(1);
});
