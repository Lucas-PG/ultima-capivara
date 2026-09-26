import { describe, expect, it } from 'vitest';
import { GameUI } from '../src/ui/ui';

describe('HUD visibility', () => {
  it('shows and hides SVG reload progress without relying on HTMLElement.hidden', () => {
    // SVGElement supports attributes but has no HTML hidden property.
    const attributes = new Set(['hidden']);
    const ring = {
      hasAttribute: (name: string) => attributes.has(name),
      toggleAttribute: (name: string, force: boolean) => force ? attributes.add(name) : attributes.delete(name),
    };
    const ui = { el: () => ring } as unknown as GameUI;
    const show = GameUI.prototype['show'];
    show.call(ui, 'rring', true);
    expect(attributes.has('hidden')).toBe(false);
    show.call(ui, 'rring', false);
    expect(attributes.has('hidden')).toBe(true);
  });
});
