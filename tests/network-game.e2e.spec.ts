import { expect, test, type Page } from '@playwright/test';

// Override only for the explicit local smoke run on Ponte's port 5187.
const gameUrl = process.env.PONTE_GAME_URL || 'http://127.0.0.1:5174/';
const inspect = (page: Page) => page.evaluate(() => (window as any).__capivara.inspect());
const player = (page: Page, id?: string) => page.evaluate(id => {
  const state = (window as any).__capivara.inspect();
  return state.snapshot?.actors.find((actor: any) => actor.id === (id || state.room?.myId));
}, id);

function gameAddress(code?: string) {
  const url = new URL(gameUrl); url.searchParams.set('networkQa', '1');
  url.searchParams.set('networkFps', '2');
  if (code) url.searchParams.set('sala', code);
  return url.href;
}
async function controls(page: Page, action: 'activate' | 'pause' | 'fire' | 'key', code = '', down = false) {
  await page.evaluate(({ action, code, down }) => {
    const input = (window as any).__networkQA;
    if (action === 'key') input.key(code, down); else input[action]();
  }, { action, code, down });
}

async function traceInputs(page: Page, label: string, samples: unknown[]) {
  await page.exposeFunction('__inputEvidence', (batch: unknown[]) => {
    samples.push(...batch.map(sample => ({ page: label, receivedAt: Date.now(), sample })));
  });
  await page.evaluate(async () => {
    const w = window as any;
    const modules = ['/src/input.ts', '/src/network/session.ts'];
    const [{ InputController }, { RoomSession }] = await Promise.all(modules.map(path => import(/* @vite-ignore */ path)));
    const batch: unknown[] = [];
    setInterval(() => { if (batch.length) void w.__inputEvidence(batch.splice(0)); }, 250);
    const record = (stage: string, input: any, extra = {}) => batch.push({
      stage, at: performance.now(), seq: input?.seq, moveX: input?.moveX, moveZ: input?.moveZ, clientTime: input?.clientTime, ...extra,
    });
    const sample = InputController.prototype.sample;
    InputController.prototype.sample = function (this: any, time: number) {
      const frame = sample.call(this, time);
      record('sample', frame, { keys: [...this.keys], locked: this.locked, hidden: document.hidden }); return frame;
    };
    const send = RoomSession.prototype.sendInput;
    RoomSession.prototype.sendInput = function (this: any, input: any) { record('send', input); return send.call(this, input); };
    const prototype = RoomSession.prototype as any, accept = prototype.acceptInput;
    prototype.acceptInput = function (this: any, guest: any, message: any) {
      const result = accept.call(this, guest, message);
      record('receive', message.data, { guest: guest.profile.id, accepted: guest.lastInput === message.data?.seq,
        serverTime: w.__capivara.inspect().snapshot?.time }); return result;
    };
  });
}

test('two game contexts join, replicate movement and shots, show RTT, and recover the same player', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'Rendered multiplayer smoke is the Chromium gate.');
  test.setTimeout(180_000);
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1280, height: 720 } }), browser.newContext({ viewport: { width: 1280, height: 720 } })]);
  const errors: string[] = [];
  const closeProgress: unknown[] = [];
  const inputEvidence: unknown[] = [];
  try {
    for (const context of contexts) await context.addInitScript(() => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'low', master: 0, frameLimit: 60 }));
    });
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    await host.goto(gameAddress());
    await traceInputs(host, 'host', inputEvidence);
    await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Ponte Host');
    await host.getByRole('button', { name: 'Correria', exact: true }).click();
    await host.locator('[name="bots"]').uncheck();
    await host.locator('#room-form [type="submit"]').click();
    await expect(host.locator('.invite-card strong')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await host.locator('.invite-card strong').innerText();
    await guest.goto(gameAddress(code));
    await traceInputs(guest, 'guest', inputEvidence);
    await guest.locator('[name="nickname"]').fill('Ponte Guest');
    await guest.locator('#room-form [type="submit"]').click();
    await expect(guest.locator('#connection-status')).toHaveText(/Conectado/);
    await expect(host.locator('.player-row')).toHaveCount(2);
    const guestId = (await inspect(guest)).room.myId;
    await Promise.all([host.locator('[data-do="ready"]').click(), guest.locator('[data-do="ready"]').click()]);
    await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 90_000 });
    await host.locator('[data-do="start"]').click();
    for (const page of [host, guest]) {
      await expect.poll(async () => (await inspect(page)).snapshot?.phase, { timeout: 60_000 }).toBe('playing');
      await expect(page.locator('#loadingOverlay:not(.out)')).toHaveCount(0, { timeout: 60_000 });
    }
    await controls(guest, 'activate');
    const before = await player(guest);
    await controls(guest, 'key', 'KeyW', true);
    // A bounded movement window verifies real keyboard -> guest -> host Worker -> snapshot flow.
    await expect.poll(async () => {
      const actor = await player(host, guestId);
      return Math.hypot(actor.pos.x - before.pos.x, actor.pos.z - before.pos.z);
    }).toBeGreaterThan(.5);
    await controls(guest, 'key', 'KeyW', false);
    await expect.poll(async () => {
      const [authoritative, replicated] = await Promise.all([player(host, guestId), player(guest)]);
      return Math.hypot(authoritative.pos.x - replicated.pos.x, authoritative.pos.z - replicated.pos.z);
    }).toBeLessThan(.15);
    const ammo = (await player(guest)).weapons[0].ammo;
    await controls(guest, 'fire');
    await expect.poll(async () => (await player(host, guestId)).weapons[0].ammo).toBe(ammo - 1);
    await expect.poll(async () => (await player(guest)).weapons[0].ammo).toBe(ammo - 1);
    await controls(guest, 'key', 'Tab', true);
    await expect(guest.locator(`#scoreboard [data-player-ping="${guestId}"]`)).toHaveText(/^\d+ ms$/);
    const rtt = await guest.locator(`#scoreboard [data-player-ping="${guestId}"]`).innerText();
    await guest.screenshot({ path: info.outputPath('ponte-scoreboard-720.png') });
    await controls(guest, 'key', 'Tab', false);
    const position = (await player(guest)).pos;
    const recoveryAt = Date.now();
    await guest.reload();
    await guest.locator('#room-form [type="submit"]').click();
    await expect.poll(async () => (await inspect(guest)).room?.myId).toBe(guestId);
    await expect.poll(async () => (await player(guest))?.connected, { timeout: 30_000 }).toBe(true);
    const recoveryMs = Date.now() - recoveryAt;
    expect(recoveryMs).toBeLessThan(30_000);
    expect((await inspect(host)).room.players).toHaveLength(2);
    expect((await player(guest)).weapons[0].ammo).toBe(ammo - 1);
    expect(Math.hypot((await player(guest)).pos.x - position.x, (await player(guest)).pos.z - position.z)).toBeLessThan(.15);
    // State recovery precedes renderer preparation. As at initial join, wait for a
    // playable guest before testing another interaction rather than racing shader work.
    await expect.poll(async () => (await inspect(guest)).snapshot?.phase, { timeout: 60_000 }).toBe('playing');
    await expect(guest.locator('#loadingOverlay:not(.out)')).toHaveCount(0, { timeout: 60_000 });
    await guest.exposeFunction('__networkCloseProgress', (sample: unknown) => {
      closeProgress.push({ receivedAt: Date.now(), sample });
      if (closeProgress.length > 24) closeProgress.shift();
    });
    await guest.evaluate(() => {
      // Test-only heartbeat distinguishes a stalled page from a live reconnect loop.
      const w = window as any;
      const timer = setInterval(() => {
        const state = w.__capivara.inspect();
        void w.__networkCloseProgress({ at: performance.now(), room: !!state.room, status: state.network.status });
        if (!state.room) clearInterval(timer);
      }, 250);
    });
    const evidence = { guestId, rtt, recoveryMs, movementReplicationErrorLimitM: .15,
      interpolationDelayMs: (await inspect(guest)).network.interpolationDelayMs, errors };
    await info.attach('multiplayer-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    console.log('Game multiplayer evidence:', JSON.stringify(evidence));
    expect(errors).toEqual([]);
    await controls(host, 'pause');
    await host.locator('#pause-panel [data-do="leave"]').click();
    await host.locator('dialog #exit').click();
    await expect.poll(async () => (await inspect(guest)).room).toBeNull();
    await expect(guest.locator('#toast')).toContainText('O anfitrião fechou a sala.');
  } finally {
    await info.attach('input-evidence', { body: JSON.stringify(inputEvidence, null, 2), contentType: 'application/json' });
    await info.attach('host-close-progress', { body: JSON.stringify(closeProgress, null, 2), contentType: 'application/json' });
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('a silent room exposes the join timeout and its retry button recovers', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'Rendered join flow is the Chromium gate.');
  const host = await browser.newPage();
  const guest = await browser.newPage();
  try {
    await host.goto(new URL('testfixtures/net.html', gameUrl).href);
    const code = await host.evaluate(async () => {
      const moduleUrl = '/src/network/session.ts';
      const { RoomSession } = await import(moduleUrl);
      const w = window as any;
      const noop = () => {};
      w.session = new RoomSession({ room: noop, start: noop, input: noop, action: noop, player: noop,
        snapshot: noop, events: noop, error: noop, closed: noop });
      await w.session.host({ name: 'Host', color: '#1fb5a8' });
      w.acceptConnection = w.session.acceptConnection.bind(w.session);
      // A real WebRTC connection with a host that never answers the handshake.
      w.session.acceptConnection = noop;
      return w.session.state.code;
    });
    await guest.goto(gameAddress(code));
    await guest.locator('[name="nickname"]').fill('Ponte Retry');
    await guest.locator('#room-form [type="submit"]').click();
    await expect(guest.locator('#room-form [type="submit"]')).toHaveText('Conectando à sala');
    await expect(guest.locator('.form-error')).toHaveText('A sala demorou a responder. Tente novamente.', { timeout: 20_000 });
    await expect(guest.getByRole('button', { name: 'TENTAR NOVAMENTE', exact: true })).toBeEnabled();
    await guest.screenshot({ path: info.outputPath('ponte-join-timeout.png') });
    await host.evaluate(() => { const w = window as any; w.session.acceptConnection = w.acceptConnection; });
    await guest.getByRole('button', { name: 'TENTAR NOVAMENTE', exact: true }).click();
    await expect(guest.locator('#connection-status')).toHaveText(/Conectado/);
    await expect(guest.locator('.player-row')).toHaveCount(2);
  } finally { await Promise.all([host.close(), guest.close()]); }
});
