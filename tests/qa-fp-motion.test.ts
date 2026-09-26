import { afterEach, expect, it, vi } from 'vitest';
import { installQa } from './visual/qa-hook';
import { createWorld } from '../src/shared/world';
import { emptyInput } from '../src/shared/math';
import { DEFAULT_SETTINGS } from '../src/settings';
import { WEAPONS } from '../src/shared/weapons';

afterEach(() => vi.unstubAllGlobals());

it('motion strips advance the rendered clock with the reload deadline and replay both real shot directions', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('document', { querySelector: () => null });
  let last: any;
  const events: any[] = [];
  const renderer = { update: (frame: any) => { last = frame; }, prepareMatch: async () => {}, event: (event: any) => events.push(event),
    cameraPosition: { x: 0, y: 0, z: 0 }, stats: { drawCalls: 0, triangles: 0 } };
  installQa({ world: createWorld(), settings: { ...DEFAULT_SETTINGS }, input: { frame: emptyInput() } as any,
    ui: { update: () => {}, event: () => {}, setPaused: () => {}, closeEmoteWheel: () => {} } as any,
    begin: async () => renderer as any });
  const qa = window.__capyQA!; await qa.start();
  for (const weapon of ['pistol', 'shotgun', 'slingshot'] as const) {
    await qa.motion(weapon, 'reload', WEAPONS[weapon].reload * .65);
    const actor = last.snapshot.actors[0];
    expect(actor.weapons[0].id).toBe(weapon);
    expect(actor.reloadUntil - last.simulationTime).toBeCloseTo(WEAPONS[weapon].reload * .35, 7);
    expect(last.snapshot.time).toBe(last.simulationTime);
  }
  for (const [action, count] of [['hit-right', 1], ['swing-left', 2]] as const) {
    events.length = 0; await qa.motion('machete', action, .15);
    expect(events).toHaveLength(count);
    expect(events.every(event => event.type === 'shot' && event.weapon === 'machete' && event.hit === action.startsWith('hit'))).toBe(true);
    expect(last.dt).toBe(0); expect(last.playing).toBe(true);
  }
});
