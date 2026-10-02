import { expect, test, type Page } from '@playwright/test';

// Keep rendered multiplayer on the same configured server as the other gates.
const gameUrl = process.env.PONTE_GAME_URL || process.env.BASE || 'http://127.0.0.1:5191/';
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
    // Arm before selecting a gesture. A 3 s wave can start and finish while
    // Playwright waits behind a rendered frame, so polling only latest state
    // after several awaited key releases can miss a correctly delivered wave.
    w.__emoteEvidence = [];
    const observe = (snapshot: any) => {
      const actor = snapshot?.actors.find((a: any) => a.id === w.__observeEmoteId);
      if (!actor) return;
      const prior = w.__emoteEvidence.at(-1);
      if (prior?.emote === actor.emote && prior?.until === actor.emoteUntil) return;
      w.__emoteEvidence.push({ at: performance.now(), time: snapshot.time, tick: snapshot.tick,
        actor: actor.id, emote: actor.emote, until: actor.emoteUntil, ammo: actor.weapons[0]?.ammo });
      if (w.__emoteEvidence.length > 32) w.__emoteEvidence.shift();
    };
    const publish = prototype.publish, receiveFrame = prototype.receiveFrame;
    prototype.publish = function (this: any, ...args: any[]) {
      const result = publish.apply(this, args); observe(this.current); return result;
    };
    prototype.receiveFrame = function (this: any, ...args: any[]) {
      const snapshot = this.callbacks.snapshot;
      this.callbacks.snapshot = (value: any) => { observe(value); return snapshot(value); };
      try { return receiveFrame.apply(this, args); }
      finally { this.callbacks.snapshot = snapshot; }
    };
  });
}

test('two Corrente game contexts join, replicate movement and emotes, show RTT, and recover the same player', async ({ browser }, info) => {
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
    await host.getByRole('button', { name: 'Corrente', exact: true }).click();
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
    expect((await inspect(guest)).snapshot.config.mode).toBe('corrente');
    expect(before.weaponLevel).toBe(0);
    expect(before.weapons).toHaveLength(1);
    expect(before.weapons[0].id).toBe('pistol');
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
    // The wheel must reach the host through the existing reliable action path.
    // Numbers choose gestures without leaking a weapon-slot action afterward.
    await controls(guest, 'key', 'KeyB', true);
    await expect(guest.locator('#emoteWheel')).toBeVisible();
    const choosing = (await inspect(guest)).clientInput;
    await guest.mouse.move(700, 260);
    await controls(guest, 'fire');
    await controls(guest, 'key', 'KeyW', true);
    await guest.waitForTimeout(120);
    const frozen = (await inspect(guest)).clientInput;
    expect(frozen).toMatchObject({ fire: false, moveZ: 0 });
    // clientInput is an unquantized local double. recoverRecoil normalizes yaw
    // with atan2(sin, cos) even at zero recoil, which may differ by one ULP.
    // 1e-10 rad is far below .001 snapshot quantization and .0001 emote look cancellation.
    expect(Math.abs(frozen.yaw - choosing.yaw)).toBeLessThan(1e-10);
    expect(Math.abs(frozen.pitch - choosing.pitch)).toBeLessThan(1e-10);
    await controls(guest, 'key', 'KeyW', false);
    await Promise.all([host, guest].map(page => page.evaluate(id => {
      (window as any).__observeEmoteId = id; (window as any).__emoteEvidence = [];
    }, guestId)));
    await controls(guest, 'key', 'Digit1', true);
    await controls(guest, 'key', 'Digit1', false);
    await controls(guest, 'key', 'KeyB', false);
    const observed = (page: Page) => page.evaluate(() => (window as any).__emoteEvidence.find((sample: any) => sample.emote === 'wave'));
    await Promise.all([host, guest].map(page => expect.poll(async () => !!(await observed(page))).toBe(true)));
    const [hostWave, guestWave] = await Promise.all([observed(host), observed(guest)]);
    expect(Math.abs(hostWave.until - guestWave.until)).toBeLessThan(.02);
    expect(hostWave.ammo).toBe(ammo - 1); expect(guestWave.ammo).toBe(ammo - 1);
    await info.attach('emote-observation', { body: JSON.stringify({ hostWave, guestWave }), contentType: 'application/json' });
    expect((await player(host, guestId)).weapons[0].ammo).toBe(ammo - 1);
    await controls(guest, 'key', 'Tab', true);
    await expect(guest.locator(`#scoreboard [data-player-ping="${guestId}"]`)).toHaveText(/^\d+ ms$/);
    await expect.poll(async () => (await player(host, guestId)).emote).toBeNull();
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
    const emotes = await Promise.all(contexts.map(async context => {
      const page = context.pages()[0];
      return page ? page.evaluate(() => (window as any).__emoteEvidence || []).catch(() => []) : [];
    }));
    await info.attach('emote-history-host-guest', { body: JSON.stringify(emotes, null, 2), contentType: 'application/json' });
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

// Inventory actions are new reliable messages: the guest's box selection, drop
// and pickup must be decided by the host and replicated back unchanged.
test('a Correria guest selects, drops and picks back a gun through the host', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'Rendered multiplayer smoke is the Chromium gate.');
  test.setTimeout(180_000);
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1280, height: 720 } })));
  const errors: string[] = [];
  try {
    for (const context of contexts) await context.addInitScript(() => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'low', master: 0, frameLimit: 60 }));
    });
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    await host.goto(gameAddress());
    await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Ponte Host');
    await host.getByRole('button', { name: 'Correria', exact: true }).click();
    await host.locator('[name="bots"]').uncheck();
    await host.locator('#room-form [type="submit"]').click();
    await expect(host.locator('.invite-card strong')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await host.locator('.invite-card strong').innerText();
    await guest.goto(gameAddress(code));
    await guest.locator('[name="nickname"]').fill('Ponte Guest');
    await guest.locator('#room-form [type="submit"]').click();
    await expect(guest.locator('#connection-status')).toHaveText(/Conectado/);
    const guestId = (await inspect(guest)).room.myId;
    await Promise.all([host.locator('[data-do="ready"]').click(), guest.locator('[data-do="ready"]').click()]);
    await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 90_000 });
    await host.locator('[data-do="start"]').click();
    for (const page of [host, guest]) await expect.poll(async () => (await inspect(page)).snapshot?.phase, { timeout: 60_000 }).toBe('playing');
    await controls(guest, 'activate');
    const held = async (page: Page) => { const a = await player(page, guestId); return a.weapons[a.slot]?.id; };
    const boxes = async (page: Page) => (await player(page, guestId)).weapons.map((w: any) => `${w.box}:${w.id}`).join(' ');
    expect(await boxes(host)).toBe('0:smg 2:pistol 3:machete');
    await controls(guest, 'key', 'Digit3', true); await controls(guest, 'key', 'Digit3', false);
    await expect.poll(() => held(host)).toBe('pistol');
    await expect.poll(() => held(guest)).toBe('pistol');
    const ammo = (await player(host, guestId)).weapons[1].ammo;
    await controls(guest, 'key', 'KeyG', true); await controls(guest, 'key', 'KeyG', false);
    await expect.poll(() => boxes(host)).toBe('0:smg 3:machete');
    await expect.poll(() => boxes(guest)).toBe('0:smg 3:machete');
    const dropped = async (page: Page) => (await inspect(page)).snapshot.loot.find((l: any) => l.active && l.weapon === 'pistol' && l.ammo !== undefined);
    await expect.poll(async () => (await dropped(guest))?.ammo).toBe(ammo);
    await controls(guest, 'key', 'KeyF', true); await controls(guest, 'key', 'KeyF', false);
    await expect.poll(() => boxes(host)).toBe('0:smg 2:pistol 3:machete');
    expect((await player(host, guestId)).weapons.find((w: any) => w.id === 'pistol').ammo).toBe(ammo);
    await expect.poll(async () => !!(await dropped(host))).toBe(false);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('a guest sees its own rounds on the input frame and the host confirms each one exactly once', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'Rendered multiplayer smoke is the Chromium gate.');
  test.setTimeout(180_000);
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1280, height: 720 } })));
  const errors: string[] = [];
  try {
    for (const context of contexts) await context.addInitScript(() => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'low', master: 0, frameLimit: 60 }));
    });
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    await host.goto(gameAddress());
    await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Ponte Host');
    await host.getByRole('button', { name: 'Correria', exact: true }).click();
    await host.locator('[name="bots"]').uncheck();
    await host.locator('#room-form [type="submit"]').click();
    await expect(host.locator('.invite-card strong')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await host.locator('.invite-card strong').innerText();
    await guest.goto(gameAddress(code));
    await guest.locator('[name="nickname"]').fill('Ponte Guest');
    await guest.locator('#room-form [type="submit"]').click();
    await expect(guest.locator('#connection-status')).toHaveText(/Conectado/);
    const guestId = (await inspect(guest)).room.myId;
    await Promise.all([host.locator('[data-do="ready"]').click(), guest.locator('[data-do="ready"]').click()]);
    await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 90_000 });
    await host.locator('[data-do="start"]').click();
    for (const page of [host, guest]) await expect.poll(async () => (await inspect(page)).snapshot?.phase, { timeout: 60_000 }).toBe('playing');
    await controls(guest, 'activate');
    // Pistol (semi-automatic): one round per click, drawn first.
    await controls(guest, 'key', 'Digit3', true); await controls(guest, 'key', 'Digit3', false);
    await expect.poll(async () => { const a = await player(host, guestId); return a.weapons[a.slot]?.id; }).toBe('pistol');
    await guest.waitForTimeout(600);
    const before = (await player(host, guestId)).shotSeq;
    for (let i = 0; i < 5; i++) { await controls(guest, 'fire'); await guest.waitForTimeout(350); }
    await expect.poll(async () => (await player(host, guestId)).shotSeq).toBe(before + 5);
    await expect.poll(async () => (await player(guest, guestId)).shotSeq).toBe(before + 5);
    const times = await guest.evaluate(() => (window as any).__capivara.shotTimes()) as { seq: number; predicted?: number; confirmed?: number }[];
    const rounds = times.filter(t => t.seq > before);
    expect(rounds).toHaveLength(5);
    // Every round was shown locally first; the host's event for it arrived afterwards and was not shown again.
    for (const t of rounds) { expect(t.predicted).toBeDefined(); expect(t.confirmed).toBeDefined(); expect(t.confirmed!).toBeGreaterThanOrEqual(t.predicted!); }
    expect((await player(host, guestId)).weapons.find((w: any) => w.id === 'pistol').ammo).toBe(17 - 5);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

// Slow (a full 5-minute Correria): results reach both clients, the host's
// rematch returns the room to the lobby and a second match starts clean.
test('a full Correria ends on both clients and the host starts a clean rematch', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium' || !process.env.E2E_SLOW, 'Set E2E_SLOW=1 for the full-match rematch gate.');
  test.setTimeout(780_000);
  const step = (label: string) => console.log(`[rematch] ${new Date().toISOString().slice(11, 19)} ${label}`);
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1280, height: 720 } })));
  const errors: string[] = [];
  try {
    for (const context of contexts) await context.addInitScript(() => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'low', master: 0, frameLimit: 30 }));
    });
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
    await host.goto(gameAddress());
    await host.locator('[data-do="host"]').click();
    await host.locator('[name="nickname"]').fill('Ponte Host');
    await host.getByRole('button', { name: 'Correria', exact: true }).click();
    await host.locator('[name="duration"]').selectOption('300', { force: true });
    await host.locator('#room-form [type="submit"]').click();
    const code = await host.locator('.invite-card strong').innerText();
    await guest.goto(gameAddress(code));
    await guest.locator('[name="nickname"]').fill('Ponte Guest');
    await guest.locator('#room-form [type="submit"]').click();
    await expect(guest.locator('#connection-status')).toHaveText(/Conectado/);
    const start = async () => {
      await Promise.all([host.locator('[data-do="ready"]').click(), guest.locator('[data-do="ready"]').click()]);
      await expect(host.locator('[data-do="start"]')).toBeEnabled({ timeout: 90_000 });
      await host.locator('[data-do="start"]').click();
      for (const page of [host, guest]) await expect.poll(async () => (await inspect(page)).snapshot?.phase, { timeout: 60_000 }).toBe('playing');
    };
    await start(); step('first match playing');
    const firstMatch = (await inspect(host)).snapshot.matchId;
    for (const page of [host, guest]) await expect.poll(async () => {
      const i = await inspect(page), toast = await page.locator('#toast').innerText().catch(() => '');
      step(`${page === host ? 'host' : 'guest'} ${i.screen} ${i.snapshot?.phase} ${Math.round(i.snapshot?.remaining ?? -1)} ${toast.replace(/\s+/g, ' ').slice(0, 120)} ${errors.slice(-2).join(' | ')}`);
      return i.snapshot?.phase;
    }, { timeout: 360_000, intervals: [20_000] }).toBe('results');
    step('results on both');
    // Both see the same winners and bots were counted in the scoreboard.
    const [hostResults, guestResults] = await Promise.all([host, guest].map(async page => (await inspect(page)).snapshot.results.map((r: any) => `${r.name}:${r.kills}:${r.place}`).join('|')));
    expect(guestResults).toBe(hostResults);
    await host.locator('[data-do="rematch"]').click(); step('rematch clicked');
    for (const page of [host, guest]) await expect.poll(async () => (await inspect(page)).room?.phase, { timeout: 30_000 }).toBe('lobby');
    step('both in lobby'); await start(); step('second match playing');
    const second = await inspect(guest);
    expect(second.snapshot.matchId).not.toBe(firstMatch);
    expect(second.snapshot.actors.every((a: any) => a.kills === 0 && a.deaths === 0)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
