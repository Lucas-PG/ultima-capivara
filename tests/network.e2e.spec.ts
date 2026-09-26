import { expect, test } from '@playwright/test';
import type { ActorState } from '../src/shared/types';

const url = 'http://127.0.0.1:5174/testfixtures/net.html';
const config = { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 480 };

test('host and guest exchange lobby, gameplay, recovery, and close over local PeerJS', async ({ browser }) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await Promise.all([host.goto(url), guest.goto(url)]);
    const roomCode = await host.evaluate(async settings => {
      const moduleUrl = '/src/network/session.ts';
      const { RoomSession } = await import(moduleUrl);
      const w = window as any;
      w.net = { rooms: [], starts: [], inputs: [], actions: [], players: [], snapshots: [], closed: [], statuses: [] };
      w.session = new RoomSession({
        room: (v: unknown) => w.net.rooms.push(v), start: (...v: unknown[]) => w.net.starts.push(v),
        input: (...v: unknown[]) => w.net.inputs.push(v), action: (...v: unknown[]) => w.net.actions.push(v),
        player: (...v: unknown[]) => w.net.players.push(v), snapshot: (v: unknown) => w.net.snapshots.push(v),
        status: (v: unknown) => w.net.statuses.push(v), events: () => {}, error: (v: unknown) => { throw new Error(String(v)); }, closed: (v: unknown) => w.net.closed.push(v),
      });
      await w.session.host({ name: 'Host', color: '#1fb5a8' }, settings);
      return w.session.state.code as string;
    }, config);
    const guestId = await guest.evaluate(async code => {
      const moduleUrl = '/src/network/session.ts';
      const { RoomSession } = await import(moduleUrl);
      const w = window as any;
      w.net = { rooms: [], starts: [], inputs: [], actions: [], players: [], snapshots: [], closed: [], statuses: [] };
      w.session = new RoomSession({
        room: (v: unknown) => w.net.rooms.push(v), start: (...v: unknown[]) => w.net.starts.push(v),
        input: (...v: unknown[]) => w.net.inputs.push(v), action: (...v: unknown[]) => w.net.actions.push(v),
        player: (...v: unknown[]) => w.net.players.push(v), snapshot: (v: unknown) => w.net.snapshots.push(v),
        status: (v: unknown) => w.net.statuses.push(v), events: () => {}, error: (v: unknown) => { throw new Error(String(v)); }, closed: (v: unknown) => w.net.closed.push(v),
      });
      try { await w.session.join(code, { name: 'Guest', color: '#e76f51' }); }
      catch (error) { return `ERROR:${String(error)}`; }
      return w.session.state.myId as string;
    }, roomCode);
    if (guestId.startsWith('ERROR:')) throw new Error(`${guestId}; host=${JSON.stringify(await host.evaluate(() => ({
      room: (window as any).session.state, guests: [...(window as any).session.guests.values()].map((g: any) => ({
        connected: g.conn?.open, profile: g.profile,
      })),
    })))}`);
    await expect.poll(() => host.evaluate(() => (window as any).session.state.players.length)).toBe(2);
    await expect.poll(() => host.evaluate(id => (window as any).session.latencies[id], guestId)).toBeGreaterThanOrEqual(0);
    await expect.poll(() => guest.evaluate(id => (window as any).session.latencies[id], guestId)).toBeGreaterThanOrEqual(0);
    await Promise.all([host.evaluate(() => (window as any).session.ready(true)), guest.evaluate(() => (window as any).session.ready(true))]);
    await expect.poll(() => host.evaluate(() => (window as any).session.state.players.every((p: any) => p.ready))).toBe(true);
    await host.evaluate(() => (window as any).session.start());
    await expect.poll(() => guest.evaluate(() => (window as any).net.starts.length)).toBe(1);
    if (test.info().project.name === 'chromium') {
      await expect.poll(() => guest.evaluate(() => (window as any).session.hostGameReady)).toBe(true);
    }
    const firstMatch = await guest.evaluate(() => (window as any).session.matchId as string);

    await guest.evaluate(() => {
      const w = window as any;
      w.session.sendInput({ seq: 1, moveX: 1, moveZ: 0, yaw: 0, pitch: 0, sprint: false,
        crouch: false, jump: false, fire: false, ads: false, lean: 0, clientTime: Date.now() });
      w.session.sendAction({ type: 'trigger', id: 1, yaw: .4, pitch: -.1, lean: 0, ads: true, clientTime: 1 });
      w.session.sendAction({ type: 'trigger', id: 1, yaw: .4, pitch: -.1, lean: 0, ads: true, clientTime: 1 });
    });
    await expect.poll(() => host.evaluate(() => (window as any).net.inputs.length)).toBe(1);
    await expect.poll(() => host.evaluate(() => (window as any).net.actions.length)).toBe(1);
    expect(await host.evaluate(() => (window as any).net.inputs[0][0])).toBe(guestId);
    expect(await host.evaluate(() => (window as any).net.actions[0])).toEqual([
      guestId, { type: 'trigger', id: 1, yaw: .4, pitch: -.1, lean: 0, ads: true, clientTime: 1 },
    ]);
    await guest.evaluate(() => (window as any).session.sendAction({ type: 'emote', id: 2, emote: 'wave' }));
    await expect.poll(() => host.evaluate(() => (window as any).net.actions.length)).toBe(2);
    expect(await host.evaluate(() => (window as any).net.actions[1])).toEqual([guestId, { type: 'emote', id: 2, emote: 'wave' }]);
    const baselineBytes = await host.evaluate(async () => {
      const typesUrl = '/src/shared/types.ts';
      const { PROTOCOL_VERSION, WORLD_VERSION } = await import(typesUrl);
      const w = window as any;
      const s = w.session;
      const actor: ActorState = { id: s.state.myId, name: 'Host', color: '#1fb5a8', bot: false, connected: true,
        pos: { x: 1.23, y: 0, z: 2.34 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
        lean: 0, hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false,
        sprint: false, ads: false, swimming: false, wetUntil: 0, emote: 'wave', emoteUntil: 4, stage: 'ground', kills: 0, deaths: 0, damage: 0,
        weapons: [{ id: 'm4', ammo: 25, reserve: 90, rarity: 2 }, { id: 'pistol', ammo: 12, reserve: 36, rarity: 0 }],
        slot: 0, consumables: { bandage: 2, medkit: 1, guarana: 1, acai: 0, rapadura: 0 },
        reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, shotHeat: 0 };
      const actors = [actor, ...Array.from({ length: 20 }, (_, n) => ({ ...actor, id: `bot-${n}`,
        name: `Bot ${n}`, bot: true, pos: { x: n * 2, y: 0, z: -n } }))];
      const loot = Array.from({ length: 240 }, (_, n) => ({ id: `loot-${n}`, kind: 'ammo', x: n, y: 0,
        z: n, active: true, rarity: 0, respawnAt: 0 }));
      const snapshot = { protocol: PROTOCOL_VERSION, world: WORLD_VERSION, matchId: s.matchId, tick: 1, time: 1,
        phase: 'playing', config: s.state.config, countdown: 0, remaining: 479, actors,
        loot, openedChests: [], zone: { x: 0, z: 0, radius: 100, nextRadius: 90, nextX: 0,
          nextZ: 0, phase: 1, shrinking: false, timeLeft: 60, damage: 1 }, results: [],
        plane: { x: 0, y: 30, z: 0 } };
      const moduleUrl = '/src/network/codec.ts';
      const { worldPart, packet } = await import(moduleUrl);
      const bytes = new TextEncoder().encode(JSON.stringify(packet('base', { rev: 1, data: worldPart(snapshot) }))).length;
      s.publish(snapshot, []);
      return bytes;
    });
    expect(baselineBytes).toBeGreaterThan(16_300);
    await expect.poll(() => guest.evaluate(() => (window as any).net.snapshots.at(-1)?.loot.length)).toBe(240);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].pos.x)).toBe(1.23);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors.length)).toBe(21);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].weapons[0].ammo)).toBe(25);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].swimming)).toBe(false);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].wetUntil)).toBe(0);
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].emote)).toBe('wave');
    expect(await guest.evaluate(() => (window as any).net.snapshots.at(-1).actors[0].emoteUntil)).toBe(4);

    const beforeRecovery = await guest.evaluate(() => (window as any).net.snapshots.length as number);
    const recoveryStarted = Date.now();
    await guest.evaluate(() => (window as any).session.hostConn.close());
    await expect.poll(() => guest.evaluate(() => (window as any).session.hostConn?.open), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => host.evaluate(() => (window as any).net.players.some((p: any[]) => p[1] === 'reconnect'))).toBe(true);
    expect(await guest.evaluate(() => (window as any).session.state.myId)).toBe(guestId);
    expect(Date.now() - recoveryStarted).toBeLessThan(30_000);
    expect(await guest.evaluate(() => (window as any).net.statuses)).toContain('reconnecting');
    await expect.poll(() => guest.evaluate(() => (window as any).net.snapshots.length)).toBeGreaterThan(beforeRecovery);
    await guest.evaluate(() => {
      const w = window as any;
      w.session.sendInput({ seq: 1, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, sprint: false,
        crouch: false, jump: false, fire: false, ads: false, lean: 0, clientTime: Date.now() });
      w.session.sendAction({ type: 'reload', id: 1 });
    });
    await expect.poll(() => host.evaluate(() => (window as any).net.inputs.length)).toBe(2);
    await expect.poll(() => host.evaluate(() => (window as any).net.actions.length)).toBe(3);
    expect(await host.evaluate(() => (window as any).net.actions[2])).toEqual([guestId, { type: 'reload', id: 1 }]);

    await host.evaluate(() => (window as any).session.resetLobby());
    await expect.poll(() => guest.evaluate(() => (window as any).session.state.phase)).toBe('lobby');
    await Promise.all([host.evaluate(() => (window as any).session.ready(true)), guest.evaluate(() => (window as any).session.ready(true))]);
    await expect.poll(() => host.evaluate(() => (window as any).session.state.players.every((p: any) => p.ready))).toBe(true);
    await host.evaluate(() => (window as any).session.start());
    await expect.poll(() => guest.evaluate(previous => (window as any).session.matchId !== '' && (window as any).session.matchId !== previous, firstMatch)).toBe(true);
    await guest.evaluate(() => (window as any).session.sendAction({ type: 'reload', id: 1 }));
    await expect.poll(() => host.evaluate(() => (window as any).net.actions.length)).toBe(4);
    await host.evaluate(() => (window as any).session.leave());
    await expect.poll(() => guest.evaluate(() => (window as any).net.closed[0]), { timeout: 10_000 }).toBe('O anfitrião fechou a sala.');
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
  }
});
