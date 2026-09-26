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
  const updates: { dt: number; draw: boolean }[] = [];
  const renderer = { update: (next: RenderFrame, draw = true) => { frame = next; updates.push({ dt: next.dt, draw }); }, prepareMatch: async () => {},
    cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 } };
  installQa({ world: createWorld(), settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: () => {}, setPaused: () => {} } as any, begin: async () => renderer as any });
  const qa = window.__capyQA!; await qa.start();
  await qa.pose('swimWaterline');
  expect(updates.reduce((time, update) => time + update.dt, 0)).toBeCloseTo(1);
  expect(updates.filter(update => update.draw)).toHaveLength(1);
  expect(updates.at(-1)!.draw).toBe(true);
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

it('keeps one render loop when reviews stop, change pose and restart before a queued frame runs', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('document', { querySelector: () => null });
  const queued = new Map<number, FrameRequestCallback>();
  let nextId = 0, draws = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; queued.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  const renderer = { update: (_frame: RenderFrame, draw = true) => { if (draw) draws++; }, prepareMatch: async () => {},
    cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 } };
  installQa({ world: createWorld(), settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: () => {}, setPaused: () => {} } as any, begin: async () => renderer as any });
  const qa = window.__capyQA!; await qa.start(); await qa.pose('plaza');
  qa.loop(true);
  for (const pose of ['swimWaterline', 'swimRemote', 'swimExit']) {
    qa.loop(false); await qa.pose(pose); qa.loop(true);
    expect(queued.size).toBe(1);
  }
  draws = 0;
  for (let frame = 0; frame < 3; frame++) {
    const callbacks = [...queued.values()]; queued.clear();
    for (const callback of callbacks) callback(frame * 1000 / 60);
    expect(queued.size).toBe(1);
  }
  expect(draws).toBe(3);
  qa.loop(false); expect(queued.size).toBe(0);
});
