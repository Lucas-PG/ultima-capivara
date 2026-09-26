import { describe, expect, it } from 'vitest';
import { GameUI, modeName } from '../src/ui/ui';
import type { WorldSnapshot } from '../src/shared/types';

const actors = [
  { id: 'a', name: 'Muitas eliminações', weaponLevel: 2, kills: 20, deaths: 0, damage: 500, color: '#00aa88' },
  { id: 'b', name: 'Facão final', weaponLevel: 7, kills: 7, deaths: 3, damage: 300, color: '#ff9900' },
];
const board = (mode: string) => GameUI.prototype['scoreTable'].call({ localId: 'a', room: null } as unknown as GameUI, { config: { mode }, actors } as unknown as WorldSnapshot);

describe('Corrente progress', () => {
  it('ranks by weapon stage and spells out the final eighth stage', () => {
    const html = board('corrente');
    expect(modeName('corrente')).toBe('CORRENTE');
    expect(html.indexOf('Facão final')).toBeLessThan(html.indexOf('Muitas eliminações'));
    expect(html).toContain('<th>ARMA</th>');
    expect(html).toContain('<td>8/8</td>');
    expect(html).toContain('<td>3/8</td>');
  });
  it('retains elimination ranking for Correria', () => {
    const html = board('deathmatch');
    expect(html.indexOf('Muitas eliminações')).toBeLessThan(html.indexOf('Facão final'));
    expect(html).toContain('<th>ELIM.</th>');
    expect(html).toContain('<td>20</td>');
  });
});
