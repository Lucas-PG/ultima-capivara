import { describe, expect, it } from 'vitest';
import { GameUI } from '../src/ui/ui';
import type { ActorState, WorldSnapshot } from '../src/shared/types';

const actor = (id: string, alive = true, kills = 0) => ({ id, name: id, alive, kills, deaths: alive ? 0 : 1, damage: 100, color: '#1fb5a8', weaponLevel: 0, connected: true, bot: false }) as ActorState;
const board = (actors: ActorState[], mode = 'battle-royale', online = false) => GameUI.prototype['scoreTable'].call({ localId: 'me', room: online ? {} : null, latencies: { me: 24 } } as unknown as GameUI, { config: { mode }, actors } as unknown as WorldSnapshot);

describe('the Tab scoreboard stays useful in each mode', () => {
  it('puts surviving battle royale players first and names their state', () => {
    const html = board([actor('out', false, 9), actor('me', true, 1)]);
    expect(html.indexOf('title="me"')).toBeLessThan(html.indexOf('title="out"'));
    expect(html).toContain('<th>ESTADO</th>'); expect(html).toContain('Na ilha'); expect(html).toContain('Fora');
  });
  it('keeps the complete 21-player roster in two columns with continuous ranks', () => {
    const html = board(Array.from({ length: 21 }, (_, i) => actor(`player-${i}`)));
    expect(html.match(/<tbody>/g)).toHaveLength(2); expect(html.match(/class="score-player"/g)).toHaveLength(21);
    expect(html).toContain('<span class="rank">12</span>'); expect(html).toContain('<span class="rank">21</span>');
  });
  it('retains online ping hooks, marks the local player and escapes friend names', () => {
    const me = actor('me'); me.name = '<Turma>';
    const guest = actor('guest'); guest.connected = false;
    const html = board([me, guest], 'deathmatch', true);
    expect(html).toContain('data-player-ping="me">24 ms'); expect(html).toContain('Sem conexão');
    expect(html).toContain('&lt;Turma&gt;'); expect(html).not.toContain('<Turma>'); expect(html).toContain('<small>VOCÊ</small>');
  });
});
