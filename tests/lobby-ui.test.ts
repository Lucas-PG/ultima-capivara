import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui/ui';
import { DEFAULT_CONFIG, type RoomState } from '../src/shared/types';

const room = (): RoomState => ({ code: 'PRAIA7', myId: 'host', hostId: 'host', isHost: true, phase: 'lobby', config: { ...DEFAULT_CONFIG, capacity: 8 }, players: [{ id: 'host', name: 'Capivara', color: '#1fb5a8', ready: false, connected: true }] });
const fixture = (calm = false) => {
  vi.stubGlobal('document', { baseURI: 'https://example.test/', activeElement: null, body: { dataset: {} } });
  const roster = { scrollTop: 0 }, focus = vi.fn();
  return { room: room(), screen: 'home', lobbyCode: '', lobbyPlayers: new Map<string, boolean>(), networkStatus: '', roomLoading: null,
    root: { innerHTML: '', contains: () => false, querySelector: () => roster, querySelectorAll: () => [{ dataset: { do: 'ready' }, focus }] },
    els: new Map(), header: () => '', reducedMotion: () => calm, startButton: GameUI.prototype['startButton'],
    roster, focus,
  };
};
const render = (ui: ReturnType<typeof fixture>) => GameUI.prototype['lobby'].call(ui as unknown as GameUI);
afterEach(() => vi.unstubAllGlobals());

describe('the waiting room follows real membership and readiness', () => {
  it('animates new arrivals and readiness transitions once, retaining roster scroll on updates', () => {
    const ui = fixture(); render(ui); expect(ui.root.innerHTML.match(/ arriving/g)).toHaveLength(1);
    render(ui); expect(ui.root.innerHTML).not.toContain(' arriving');
    ui.room.players.push({ id: 'guest', name: 'Juju', color: '#e76f51', ready: false, connected: true });
    ui.roster.scrollTop = 120; render(ui);
    expect(ui.root.innerHTML.match(/ arriving/g)).toHaveLength(1); expect(ui.roster.scrollTop).toBe(120);
    ui.room.players[1].ready = true; render(ui);
    expect(ui.root.innerHTML.match(/ ready-wiggle/g)).toHaveLength(1);
    expect(ui.root.innerHTML).toContain('1 de 2 capivaras prontas');
    render(ui); expect(ui.root.innerHTML).not.toContain(' ready-wiggle');
  });
  it('keeps disconnected players out of readiness and leaves start disabled until everyone is present and ready', () => {
    const ui = fixture(); ui.room.players[0].ready = true; ui.room.players[0].connected = false; render(ui);
    expect(ui.root.innerHTML).toContain('Reconectando'); expect(ui.root.innerHTML).toContain('0 de 1 capivara pronta');
    expect(ui.root.innerHTML).toMatch(/data-do="start" disabled/);
    ui.room.players[0].connected = true; render(ui);
    expect(ui.root.innerHTML).not.toMatch(/data-do="start" disabled/);
  });
  it('shows guests who starts the match, escapes names, and respects calm mode', () => {
    const ui = fixture(true); ui.room.isHost = false; ui.room.players[0].name = '<Juju>'; render(ui);
    expect(ui.root.innerHTML).toContain('&lt;Juju&gt;'); expect(ui.root.innerHTML).not.toContain('<Juju>');
    expect(ui.root.innerHTML).toContain('dá a largada'); expect(ui.root.innerHTML).not.toContain('data-do="start"');
    ui.room.players[0].ready = true; render(ui);
    expect(ui.root.innerHTML).not.toContain(' ready-wiggle'); expect(ui.root.innerHTML).not.toContain(' arriving');
  });
  it('preserves keyboard focus across room updates', () => {
    const ui = fixture(); ui.root.contains = () => true;
    vi.stubGlobal('document', { baseURI: 'https://example.test/', activeElement: { closest: () => ({ dataset: { do: 'ready' } }) }, body: { dataset: {} } });
    render(ui); expect(ui.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('inviting friends', () => {
  it('copies just the code from the wooden sign, and a clean join URL from the link button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined), ui = { room: room(), toast: vi.fn() };
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('location', { href: 'https://example.test/capivara/?qa=1#test' });
    await GameUI.prototype['copyInvite'].call(ui as unknown as GameUI, true);
    expect(writeText).toHaveBeenLastCalledWith('PRAIA7');
    await GameUI.prototype['copyInvite'].call(ui as unknown as GameUI);
    expect(writeText).toHaveBeenLastCalledWith('https://example.test/capivara/?sala=PRAIA7');
  });
  it('offers selected text for manual copy if the clipboard is unavailable', async () => {
    const select = vi.fn(), ui = { room: room(), openModal: vi.fn(() => ({ querySelector: () => ({ select }) })) };
    vi.stubGlobal('navigator', {}); vi.stubGlobal('location', { href: 'https://example.test/' });
    await GameUI.prototype['copyInvite'].call(ui as unknown as GameUI, true);
    expect(ui.openModal).toHaveBeenCalledWith('CONVIDE SUA TURMA', expect.stringContaining('value="PRAIA7"'));
    expect(select).toHaveBeenCalled();
  });
});
