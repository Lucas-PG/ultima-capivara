import { describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui/ui';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState } from '../src/shared/types';

const fixture = () => {
  const holder = { dataset: {} as Record<string, string>, innerHTML: '' };
  return { world: { mudBaths: [{ id: 'bath-vila' }] }, snapshot: { loot: [] }, settings: DEFAULT_SETTINGS, holder,
    el: () => holder, show: vi.fn(), text: vi.fn(), style: vi.fn() };
};
const prompt = (ui: ReturnType<typeof fixture>, interaction: { id: string; name: string }, alive = true) =>
  GameUI.prototype['updatePrompt'].call(ui as unknown as GameUI, { alive, stage: 'ground' } as ActorState, interaction);

describe('mud-bath interaction wording', () => {
  it('offers sitting at an authored bath instead of picking it up', () => {
    const ui = fixture(); prompt(ui, { id: 'bath-vila', name: 'Sentar no banho de lama' });
    expect(ui.text).toHaveBeenCalledWith('promptVerb', 'Sentar');
    expect(ui.text).toHaveBeenCalledWith('promptItem', 'banho de lama');
    expect(ui.holder.innerHTML).toContain('emote-art');
  });
  it('keeps opening a chest distinct from sitting in a bath', () => {
    const ui = fixture(); prompt(ui, { id: 'chest-vila', name: 'Abrir caixa' });
    expect(ui.text).toHaveBeenCalledWith('promptVerb', 'Abrir');
    expect(ui.text).toHaveBeenCalledWith('promptItem', 'caixa de suprimentos');
  });
  it('does not offer the bath interaction after elimination', () => {
    const ui = fixture(); prompt(ui, { id: 'bath-vila', name: 'Sentar no banho de lama' }, false);
    expect(ui.show).toHaveBeenCalledWith('prompt', false);
    expect(ui.text).not.toHaveBeenCalled();
  });
});
