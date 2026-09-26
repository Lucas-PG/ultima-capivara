import { describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui/ui';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, GameEvent, SupplyDropState, WorldSnapshot } from '../src/shared/types';

const drop: SupplyDropState = { id: 'delivery-1', pos: { x: 0, y: 0, z: 0 }, district: 'vila', heading: 0, announcedAt: 45, releaseAt: 50, landsAt: 62, opened: false };
const event = (stage: 'incoming' | 'landed' | 'opened'): GameEvent => ({ type: 'supply', id: 1, drop: drop.id, pos: drop.pos, district: drop.district, stage });
describe('Tucano delivery UI follows authoritative state', () => {
  it('announces arrival and landing with the authored district name, without a second opened announcement', () => {
    const ui = { screen: 'game', root: { querySelector: () => ({}) }, snapshot: { phase: 'playing' }, world: { districts: [{ id: 'vila', name: 'Vila' }] }, showMoment: vi.fn(), el: () => ({ dataset: { kind: 'delivery' } }), show: vi.fn() };
    for (const stage of ['incoming', 'landed', 'opened'] as const) GameUI.prototype.event.call(ui as unknown as GameUI, event(stage));
    expect(ui.showMoment).toHaveBeenCalledTimes(2);
    expect(ui.show).toHaveBeenCalledWith('matchMoment', false);
    expect(ui.showMoment).toHaveBeenNthCalledWith(1, 'Entrega do Tucano!', 'A caminho · Vila', 'delivery');
    expect(ui.showMoment).toHaveBeenNthCalledWith(2, 'Entrega no chão!', 'Vila · abra a caixa', 'delivery');
  });
  it('opening an older drop cannot erase a different delivery or a storm warning', () => {
    const ui = { screen: 'game', root: { querySelector: () => ({}) }, snapshot: { phase: 'playing' }, supplyNotice: 'delivery-2', el: () => ({ dataset: { kind: 'delivery' } }), show: vi.fn() };
    GameUI.prototype.event.call(ui as unknown as GameUI, event('opened')); expect(ui.show).not.toHaveBeenCalled();
    ui.supplyNotice = drop.id; ui.el = () => ({ dataset: { kind: 'storm' } });
    GameUI.prototype.event.call(ui as unknown as GameUI, event('opened')); expect(ui.show).not.toHaveBeenCalled();
  });
  it('does not announce stale deliveries over the result screen', () => {
    const ui = { screen: 'game', root: { querySelector: () => ({}) }, snapshot: { phase: 'results' }, showMoment: vi.fn() };
    GameUI.prototype.event.call(ui as unknown as GameUI, event('landed'));
    expect(ui.showMoment).not.toHaveBeenCalled();
  });
  it('labels the landed delivery separately from ordinary chests', () => {
    const holder = { dataset: {} as Record<string,string>, innerHTML: '' };
    const ui = { world: { mudBaths: [] }, snapshot: { time: 62, supplyDrops: [drop], loot: [] }, settings: DEFAULT_SETTINGS, el: () => holder, show: vi.fn(), text: vi.fn(), style: vi.fn() };
    GameUI.prototype['updatePrompt'].call(ui as unknown as GameUI, { alive: true, stage: 'ground' } as ActorState, { id: drop.id, name: 'Abrir entrega do Tucano' });
    expect(ui.text).toHaveBeenCalledWith('promptVerb', 'Abrir'); expect(ui.text).toHaveBeenCalledWith('promptItem', 'entrega do Tucano');
  });
  it('shows the map legend only for announced unopened battle royale deliveries', () => {
    const ui = { root: { querySelector: () => null }, show: vi.fn() }, snapshot = { config: { mode: 'battle-royale' }, time: 44, supplyDrops: [{ ...drop }] } as WorldSnapshot;
    const render = () => GameUI.prototype['drawMap'].call(ui as unknown as GameUI, snapshot, {} as ActorState);
    render(); expect(ui.show).toHaveBeenLastCalledWith('supplyLegend', false);
    snapshot.time = 45; render(); expect(ui.show).toHaveBeenLastCalledWith('supplyLegend', true);
    snapshot.supplyDrops[0].opened = true; render(); expect(ui.show).toHaveBeenLastCalledWith('supplyLegend', false);
    snapshot.supplyDrops[0].opened = false; snapshot.config.mode = 'corrente'; render(); expect(ui.show).toHaveBeenLastCalledWith('supplyLegend', false);
  });
});
