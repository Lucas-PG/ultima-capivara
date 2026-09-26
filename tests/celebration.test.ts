import { describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui/ui';
import type { ActorState, WorldSnapshot } from '../src/shared/types';

const sample = (timeLeft = 60, shrinking = false) => ({ phase: 'playing', config: { mode: 'battle-royale' }, zone: { phase: 0, timeLeft, shrinking } }) as WorldSnapshot;
const actor = (stage = 'ground') => ({ alive: true, stage }) as ActorState;
const moments = () => ({ momentPhase: 'playing', momentStage: 'ground', firstStormBeat: 0, showMoment: vi.fn(), show: vi.fn(), settings: { bindings: { jump: 'Space' } } });
const update = (ui: ReturnType<typeof moments>, snapshot: WorldSnapshot, me = actor()) => GameUI.prototype['updateMoments'].call(ui as unknown as GameUI, snapshot, me);

describe('match celebration timing', () => {
  it('beats once per authoritative second and celebrates only the first storm close', () => {
    const ui = moments(); update(ui, sample(6)); expect(ui.showMoment).not.toHaveBeenCalled();
    update(ui, sample(5)); update(ui, sample(4.8));
    expect(ui.showMoment).toHaveBeenCalledTimes(1); expect(ui.showMoment).toHaveBeenLastCalledWith('5', expect.any(String), 'storm');
    update(ui, sample(1)); update(ui, sample(50, true)); update(ui, sample(49, true));
    expect(ui.showMoment).toHaveBeenCalledTimes(3); expect(ui.showMoment).toHaveBeenLastCalledWith('Lá vem ela!', expect.any(String), 'storm');
    const later = sample(3); later.zone.phase = 1; update(ui, later); expect(ui.showMoment).toHaveBeenCalledTimes(3);
  });
  it('stamps the match start and drop once without celebrating an ordinary parachute landing', () => {
    const ui = moments(); ui.momentPhase = 'countdown'; ui.momentStage = 'plane';
    update(ui, sample(), actor('plane')); update(ui, sample(), actor('plane'));
    expect(ui.showMoment).toHaveBeenCalledTimes(1);
    update(ui, sample(), actor('falling')); update(ui, sample(), actor('falling')); update(ui, sample(), actor('parachute')); update(ui, sample());
    expect(ui.showMoment).toHaveBeenCalledTimes(2); expect(ui.showMoment).toHaveBeenLastCalledWith('PULA!', 'Espaço abre o paraquedas', 'drop');
  });
  it('keeps later arena modes free of storm countdowns', () => {
    const ui = moments(), snapshot = sample(3); snapshot.config.mode = 'deathmatch'; update(ui, snapshot);
    expect(ui.showMoment).not.toHaveBeenCalled();
  });
});
