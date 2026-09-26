import { afterEach, expect, it, vi } from 'vitest';
import { installQa } from './visual/qa-hook';
import { createWorld } from '../src/shared/world';
import { WATER_LEVEL } from '../src/shared/water';
import { SWIM_DRAFT } from '../src/shared/collision';
import { emptyInput } from '../src/shared/math';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { RenderFrame } from '../src/shared/types';

afterEach(() => vi.unstubAllGlobals());

it('reviews real river flotation, a nearby swimmer and a dry wet exit using shared movement', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('document', { querySelector: () => null });
  let frame: RenderFrame | undefined;
  const renderer = { update: (next: RenderFrame) => { frame = next; }, prepareMatch: async () => {},
    cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 } };
  installQa({ world: createWorld(), settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: () => {}, setPaused: () => {}, closeEmoteWheel: () => {} } as any, begin: async () => renderer as any });
  const qa = window.__capyQA!; await qa.start();
  await qa.pose('swimWaterline');
  expect(frame!.snapshot!.actors[0]).toMatchObject({ swimming: true, grounded: false });
  expect(frame!.snapshot!.actors[0].pos.y).toBeCloseTo(WATER_LEVEL - SWIM_DRAFT);
  await qa.pose('swimRemote');
  expect(frame!.snapshot!.actors.find(actor => actor.id === 'bot-qa-swimmer')).toMatchObject({ swimming: true, grounded: false });
  await qa.pose('swimExit');
  for (const actor of frame!.snapshot!.actors) {
    expect(actor).toMatchObject({ swimming: false, grounded: true });
    expect(actor.pos.y).toBeGreaterThan(WATER_LEVEL);
    expect(actor.wetUntil).toBeGreaterThan(frame!.snapshot!.time);
  }
  for (const emote of ['wave', 'dance', 'victory', 'sit', 'chill']) {
    await qa.pose(`emote-${emote}`);
    const actor = frame!.snapshot!.actors[0];
    expect(actor.emote).toBe(emote); expect(actor.emoteUntil).toBeGreaterThan(frame!.snapshot!.time);
    expect(actor.crouch).toBe(emote === 'sit' || emote === 'chill');
  }
});
