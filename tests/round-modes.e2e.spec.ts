import { expect, test, type Page } from '@playwright/test';

const inspect = (page: Page) => page.evaluate(() => (window as any).__capivara.inspect());
async function quietProfile(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('uc-onboarded', '1');
  });
}

for (const mode of ['duel', 'squads'] as const) test(`${mode} starts from the menu with the exact bot roster and round HUD`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Rendered round modes use the Chromium gate.');
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await quietProfile(page); await page.goto('/?networkQa=1');
  await page.locator(`[data-mode="${mode}"]`).click();
  if (mode === 'squads') await page.getByRole('button', { name: '3 contra 3', exact: true }).click();
  await page.locator('[data-do="practice"]').click();
  await expect.poll(async () => { const state = await inspect(page); return state.snapshot?.phase === 'playing' && !state.renderState.loading; }, { timeout: 60_000 }).toBe(true);
  expect((await inspect(page)).snapshot.round.phase).toBe('buy');
  await expect(page.locator('#round-hud')).toBeVisible();
  const initial = (await inspect(page)).snapshot;
  expect(initial.actors).toHaveLength(mode === 'duel' ? 2 : 6);
  expect(initial.actors.filter((actor: any) => actor.bot)).toHaveLength(mode === 'duel' ? 1 : 5);
  if (mode === 'duel') {
    expect(initial.actors[0].weapons[0].id).toBe(initial.actors[1].weapons[0].id);
    await expect(page.locator('.round-kit')).toContainText('para os dois');
  } else {
    await page.keyboard.press('KeyO');
    await expect(page.getByRole('dialog', { name: 'Banca da turma' })).toBeVisible();
    await page.getByRole('button', { name: 'Comprar Colete por 650 moedas', exact: true }).click();
    await expect.poll(async () => (await inspect(page)).snapshot.actors.find((a: any) => a.id === 'practice').money).toBe(150);
    await expect(page.locator('#shop-money')).toContainText('150');
    await expect(page.getByRole('button', { name: 'Comprar M4 por 2900 moedas', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Devolver compras', exact: true }).click();
    await expect.poll(async () => (await inspect(page)).snapshot.actors.find((a: any) => a.id === 'practice').money).toBe(800);
    await page.getByRole('button', { name: /Tudo pronto/ }).click();
    await expect(page.locator('.round-shop')).toHaveCount(0);
  }
  await expect.poll(async () => (await inspect(page)).snapshot.round.phase, { timeout: 20_000 }).toBe('live');
  const before = (await inspect(page)).snapshot.round.number;
  await page.evaluate(() => {
    const qa = (window as any).__capivara, snapshot = qa.inspect().snapshot;
    for (const actor of snapshot.actors) if (actor.team === 1) qa.qaDamage(actor.id, 1000, 'practice', 'pistol');
  });
  await expect.poll(async () => (await inspect(page)).snapshot.round.score[0]).toBe(1);
  await expect.poll(async () => (await inspect(page)).snapshot.round.number, { timeout: 10_000 }).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('a real guest buys through the host and receives the same team score and next round', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'PeerJS game clients use Chromium.');
  test.setTimeout(150_000);
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let releaseGuestRenderer = () => {};
  try {
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await quietProfile(host); await quietProfile(guest);
    // Hold the guest's real renderer import through lobby and match start. This
    // reproduces a slow machine without moving a readiness ack ahead of assets.
    let rendererRequested = false;
    const guestRenderer = new Promise<void>(resolve => { releaseGuestRenderer = resolve; });
    await guest.route('**/src/render/renderer.ts*', async route => {
      rendererRequested = true; await guestRenderer; await route.continue();
    });
    const guestCpu = await guestContext.newCDPSession(guest);
    await guestCpu.send('Emulation.setCPUThrottlingRate', { rate: 2 });
    await host.goto('/?networkQa=1&networkFps=2');
    await host.locator('[data-mode="squads"]').click(); await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Maré anfitriã');
    await host.getByRole('button', { name: /CRIAR MINHA SALA/ }).click();
    await expect.poll(async () => (await inspect(host)).room?.code).toMatch(/^[A-Z0-9]{6}$/);
    const code = (await inspect(host)).room.code;
    await guest.goto(`/?networkQa=1&networkFps=2&sala=${code}`);
    await guest.locator('[name="nickname"]').fill('Brasa visitante');
    await guest.locator('#room-form').getByRole('button', { name: /ENTRAR NA SALA/ }).click();
    await expect.poll(async () => (await inspect(host)).room?.players.length).toBe(2);
    await host.locator('[data-do="ready"]').click(); await guest.locator('[data-do="ready"]').click();
    await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 60_000 });
    await host.locator('[data-do="start"]').click();
    await expect.poll(async () => (await inspect(host)).renderState.sceneLoaded, { timeout: 60_000 }).toBe(true);
    await expect.poll(() => rendererRequested).toBe(true);
    const waiting = (await inspect(host)).snapshot;
    expect(waiting.phase).toBe('countdown'); expect(waiting.time).toBe(0);
    const heldAt = Date.now();
    await expect.poll(async () => {
      const state = await inspect(host);
      expect(state.snapshot.time).toBe(0);
      expect(state.snapshot.round.number).toBe(1);
      expect(state.snapshot.round.phase).toBe('buy');
      return Date.now() - heldAt;
    }, { timeout: 12_000, intervals: [500] }).toBeGreaterThanOrEqual(8_000);
    releaseGuestRenderer();
    await expect.poll(async () => {
      const state = await inspect(guest);
      return state.snapshot?.phase === 'playing' && !state.renderState.loading;
    }, { timeout: 60_000 }).toBe(true);
    await expect(guest.locator('#loadingOverlay')).toHaveCount(0);
    // At the deliberate 2 FPS cap, a received playing snapshot can precede the
    // HUD's last countdown frame. Press O once its buy control is ready.
    await expect(guest.locator('[data-open-shop]')).toBeEnabled();
    const buying = (await inspect(guest)).snapshot;
    expect(buying.round.number).toBe(1);
    expect(buying.round.phase).toBe('buy');
    expect(buying.round.endsAt - buying.time).toBeGreaterThanOrEqual(10);
    const release = (await inspect(host)).openingRelease;
    expect(release.reason).toBe('ready');
    console.log(JSON.stringify({ roundStartup: { delayedGuestMs: Date.now() - heldAt,
      hostTimeWhileLoading: waiting.time, guestBuySeconds: +(buying.round.endsAt - buying.time).toFixed(3),
      guestSceneLoaded: (await inspect(guest)).renderState.sceneLoaded,
      releaseReason: release.reason, openingWaitMs: Math.round(release.waitedMs), guestCpuThrottle: 2 } }));
    await guest.keyboard.press('KeyO'); await expect(guest.locator('.round-shop')).toBeVisible();
    await guest.getByRole('button', { name: 'Comprar Colete por 650 moedas', exact: true }).click();
    const guestId = (await inspect(guest)).room.myId;
    await expect.poll(async () => (await inspect(host)).snapshot.actors.find((a: any) => a.id === guestId)?.money).toBe(150);
    await guest.getByRole('button', { name: /Tudo pronto/ }).click();
    await expect.poll(async () => (await inspect(host)).snapshot.round.phase, { timeout: 20_000 }).toBe('live');
    await host.evaluate(id => { const qa = (window as any).__capivara; qa.qaDamage(id, 1000, qa.inspect().room.myId, 'pistol'); }, guestId);
    await expect.poll(async () => {
      const state = await inspect(guest), watched = state.snapshot.actors.find((a: any) => a.id === state.spectateId);
      return watched?.alive && watched.team === 1 && watched.id !== guestId;
    }, { timeout: 5_000 }).toBe(true);
    await expect(guest.locator('#dcLine')).toContainText('Você volta na próxima rodada');
    await expect(guest.locator('#dcRespawn')).toBeHidden();
    await host.evaluate(() => {
      const qa = (window as any).__capivara, state = qa.inspect();
      for (const actor of state.snapshot.actors) if (actor.team === 1) qa.qaDamage(actor.id, 1000, state.room.myId, 'pistol');
    });
    await expect.poll(async () => (await inspect(guest)).snapshot.round.score[0]).toBe(1);
    await expect.poll(async () => (await inspect(guest)).snapshot.round.number, { timeout: 10_000 }).toBe(2);
    const hostRound = (await inspect(host)).snapshot.round, guestRound = (await inspect(guest)).snapshot.round;
    expect(guestRound.score).toEqual(hostRound.score); expect(guestRound.phase).toBe('buy');
  } finally { releaseGuestRenderer(); await guestContext.close(); await hostContext.close(); }
});

test('a prepared guest resends readiness on a same-match reconnect during the opening wait', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'PeerJS game clients use Chromium.');
  test.setTimeout(150_000);
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await quietProfile(host); await quietProfile(guest);
    // Withhold only the host's local readiness to keep the opening wait alive
    // while the already prepared guest loses and resumes its real connection.
    await host.addInitScript(() => {
      const NativeWorker = window.Worker, pending: (() => void)[] = [];
      let hold = true;
      window.Worker = class extends NativeWorker {
        postMessage(message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
          const post = () => Array.isArray(transfer) ? super.postMessage(message, transfer) : super.postMessage(message, transfer);
          const hostId = (window as any).__capivara?.inspect().room?.myId;
          if (hold && message?.type === 'match-loaded' && message.id === hostId) pending.push(post);
          else post();
        }
      };
      (window as any).__releaseHostLoaded = () => { hold = false; pending.splice(0).forEach(post => post()); };
    });
    await host.goto('/?networkQa=1&networkFps=2');
    await host.locator('[data-mode="squads"]').click(); await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Maré anfitriã');
    await host.getByRole('button', { name: /CRIAR MINHA SALA/ }).click();
    await expect.poll(async () => (await inspect(host)).room?.code).toMatch(/^[A-Z0-9]{6}$/);
    const code = (await inspect(host)).room.code;
    await guest.goto(`/?networkQa=1&networkFps=2&sala=${code}`);
    await guest.locator('[name="nickname"]').fill('Brasa visitante');
    await guest.locator('#room-form').getByRole('button', { name: /ENTRAR NA SALA/ }).click();
    await expect.poll(async () => (await inspect(host)).room?.players.length).toBe(2);
    await guest.evaluate(async () => {
      const moduleUrl = '/src/network/session.ts', { RoomSession } = await import(moduleUrl);
      const loaded = RoomSession.prototype.matchLoaded, state = window as any;
      state.__roundLoadedAcks = 0;
      RoomSession.prototype.matchLoaded = function (matchId: string) {
        state.__roundSession = this; state.__roundLoadedAcks++;
        return loaded.call(this, matchId);
      };
    });
    await host.locator('[data-do="ready"]').click(); await guest.locator('[data-do="ready"]').click();
    await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 60_000 });
    await host.locator('[data-do="start"]').click();
    await expect.poll(async () => (await inspect(guest)).renderState.sceneLoaded, { timeout: 60_000 }).toBe(true);
    expect((await inspect(host)).snapshot.time).toBe(0);
    const before = await inspect(guest), guestId = before.room.myId;
    expect(await guest.evaluate(() => (window as any).__roundLoadedAcks)).toBe(1);
    await guest.evaluate(() => (window as any).__roundSession.hostConn.close());
    await expect.poll(async () => guest.evaluate(() => (window as any).__roundLoadedAcks), { timeout: 20_000 }).toBe(2);
    const resumed = await inspect(guest);
    expect(resumed.room.myId).toBe(guestId); expect(resumed.snapshot.matchId).toBe(before.snapshot.matchId);
    expect(resumed.renderState.sceneLoaded).toBe(true);
    expect((await inspect(host)).snapshot.time).toBe(0);
    await host.evaluate(() => (window as any).__releaseHostLoaded());
    await expect(guest.locator('[data-open-shop]')).toBeEnabled({ timeout: 10_000 });
    const buying = (await inspect(guest)).snapshot, release = (await inspect(host)).openingRelease;
    expect(release.reason).toBe('ready'); expect(buying.round.number).toBe(1);
    expect(buying.round.endsAt - buying.time).toBeGreaterThanOrEqual(10);
    console.log(JSON.stringify({ openingReconnect: { samePlayerAndMatch: true, guestReadinessAcks: 2,
      releaseReason: release.reason, openingWaitMs: Math.round(release.waitedMs),
      guestBuySeconds: +(buying.round.endsAt - buying.time).toFixed(3) } }));
  } finally { await guestContext.close(); await hostContext.close(); }
});
