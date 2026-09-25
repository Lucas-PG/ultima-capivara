import './ui/style.css';
import { createWorld } from './shared/world';
import { ARENA } from './shared/layout';
import { moveActor } from './shared/collision';
import { clamp } from './shared/math';
import { closestInteraction as findInteraction } from './shared/interaction';
import { WEAPONS } from './shared/weapons';
import type { ActorState, GameEvent, InputFrame, PlayerAction, PlayerProfile, RoomConfig, RoomState, WorldSnapshot, RenderFrame } from './shared/types';
import type { GameRenderer } from './render/renderer';
import { RoomSession } from './network/session';
import { RemoteInterpolation } from './network/interpolation';
import { InputController } from './input';
import { SoundEngine } from './audio';
import { loadProfile, loadSettings, saveProfile, saveSettings, loadAdapt, recordPlacement } from './settings';
import { GameUI } from './ui/ui';

const world = createWorld();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
let settings = loadSettings(), profile = loadProfile();
let savedFrameLimit = settings.frameLimit;
const requestedFps = Number(new URLSearchParams(location.search).get('fps'));
if (requestedFps === 30 || requestedFps === 60) settings.frameLimit = requestedFps;
let activeFrameLimit = settings.frameLimit;
const input = new InputController(canvas, settings);
const sound = new SoundEngine(settings, world);
const renderFrame: RenderFrame = { snapshot: null, playerId: '', input: input.frame, dt: 0, playing: true, spectateId: null };
const remoteInterpolation = new RemoteInterpolation();
let renderer: GameRenderer | null = null;
// Load the 3D island on lobby entry or Practice, then reuse it until the page closes.
// `loading` holds the loading screen until the first prepared frame.
let rendererReady: Promise<void> | null = null, loading = false, readyToReveal = false;
let rendererWarmed = false, lobbyLoad = 0;
let pageDisposed = false;
class RendererUnavailableError extends Error {}
const rendererUnavailableMessage = 'Não foi possível iniciar o gráfico 3D. Ative a aceleração de hardware e tente novamente.';
let matchPreparation: Promise<void> | null = null;
let loadFraction = 0, loadLabel = 'Desenhando a ilha';
let worker: Worker | null = null;
let snapshot: WorldSnapshot | null = null;
let room: RoomState | null = null;
let playerId = '', spectateId: string | null = null;
let practiceConfig: RoomConfig | null = null;
let predicted: ActorState | null = null;
let pending: InputFrame[] = [];
let receivedAt = 0, lastEvent = 0, match = '', playing = false;
let lastAlive = true, lastStage = '', initializedPose = false;
let accumulator = 0, lastFrame = performance.now(), lastRender = 0, renderDeadline = 0;
let fps = 0, frameCount = 0, fpsAt = performance.now();
let renderedFrames = 0;
let dirtyFrame = true;
let interaction: { id: string; name: string } | null = null;
const interactionResult = { id: '', name: '' };
let adaptRecorded = '';

const session = new RoomSession({
  room(next) {
    const returned = next?.phase === 'lobby' && (room?.phase !== 'lobby' || room.code !== next.code);
    room = next;
    if (returned) stopMatch();
    ui.setRoom(next);
    if (returned) warmLobby();
    else if (next?.phase !== 'lobby') { lobbyLoad++; ui.setRoomLoading(null); }
  },
  start(config, players, matchId) {
    if (!room) return;
    practiceConfig = null;
    if (!beginMatch(room.myId, matchId)) return;
    if (room.isHost) startWorker(config, players, matchId);
  },
  input(id, frame) { worker?.postMessage({ type: 'input', id, input: frame }); },
  action(id, action) { worker?.postMessage({ type: 'action', id, action }); },
  player(player, status) { worker?.postMessage({ type: 'player', profile: player, status }); },
  status: value => ui.setConnectionStatus(value),
  snapshot: acceptSnapshot,
  events: acceptEvents,
  error(message) { ui.toast(message, true); },
  closed(reason) { leave(); ui.toast(reason, true); },
});

const ui = new GameUI(world, settings, profile, {
  async host(p, config) { await sound.unlock(); await session.host(p, config); },
  async join(p, code) { await sound.unlock(); await session.join(code, p); },
  practice: startPractice,
  ready: value => session.ready(value),
  async start() {
    const startingRoom = room?.code;
    void sound.unlock(); ensureRenderer();
    try { await rendererReady; }
    catch (error) {
      if (!pageDisposed) ui.toast(error instanceof RendererUnavailableError ? rendererUnavailableMessage :
        'Não foi possível carregar a ilha. Recarregue a página e tente novamente.', true);
      return;
    }
    if (pageDisposed || !room?.isHost || room.code !== startingRoom) return;
    session.start(); if (playing) void input.lock();
  },
  leave,
  rematch() {
    if (practiceConfig) startPractice(practiceConfig, profile);
    else if (room?.isHost) session.resetLobby();
    else ui.toast('Quem criou a sala pode reunir a turma para a próxima partida.');
  },
  resume() { void sound.unlock(); void input.lock(); },
  spectate() { cycleSpectator(); void input.lock(); },
  settings(next) {
    if (next.frameLimit !== activeFrameLimit) {
      savedFrameLimit = next.frameLimit; activeFrameLimit = next.frameLimit; renderDeadline = 0;
    }
    settings = next; saveSettings({ ...next, frameLimit: savedFrameLimit }); input.setSettings(next); sound.setSettings(next); renderer?.setSettings(next); dirtyFrame = true;
  },
  profile(next) { profile = { ...next }; saveProfile(next.name, next.color); },
});

function ensureRenderer() {
  if (!rendererReady) {
    rendererReady = (async () => {
      const { GameRenderer } = await import('./render/renderer');
      // Let the loading screen paint before constructing the world, including
      // when the engine modules already live in the browser cache.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (pageDisposed) throw new Error('Page closed before renderer initialization');
      try { renderer = new GameRenderer(canvas, world, settings, () => { dirtyFrame = true; }, (fraction) => {
        loadFraction = fraction;
        loadLabel = fraction < .15 ? 'Desenhando a ilha' : fraction < .3 ? 'Plantando os coqueiros' :
          fraction < .45 ? 'Enchendo o mar' : fraction < .6 ? 'Escondendo os baús' :
          fraction < .75 ? 'Engraxando as armas' : fraction < .9 ? 'Chamando a turma' :
          fraction < 1 ? 'Carregando o avião' : 'Pronto!';
        ui.setLoadingProgress(fraction, loadLabel);
        if (room?.phase === 'lobby' && !rendererWarmed) ui.setRoomLoading(fraction);
      }); } catch (error) { throw new RendererUnavailableError('Renderer construction failed', { cause: error }); }
      renderer.resize();
      await renderer.warmup();
      rendererWarmed = true;
    })();
    void rendererReady.catch(() => {});
  }
  renderer?.resize();
}
function warmLobby() {
  const request = ++lobbyLoad;
  if (rendererWarmed) { ui.setRoomLoading(null); return; }
  ui.setRoomLoading(0);
  ensureRenderer();
  ui.setRoomLoading(loadFraction);
  void rendererReady!.then(() => {
    if (!pageDisposed && request === lobbyLoad) ui.setRoomLoading(null);
  }).catch(error => {
    if (pageDisposed || request !== lobbyLoad || room?.phase !== 'lobby') return;
    ui.setRoomLoading(null);
    ui.toast(error instanceof RendererUnavailableError ? rendererUnavailableMessage :
      'Não foi possível carregar a ilha. Recarregue a página e tente novamente.', true);
  });
}
function beginMatch(id: string, matchId: string) {
  stopMatch();
  ensureRenderer();
  playerId = id; match = matchId; playing = true; dirtyFrame = true;
  lastEvent = 0; initializedPose = false; lastAlive = true; lastStage = '';
  input.reset(); ui.closeModal(); ui.game(id); ui.setPaused(!input.locked);
  loading = true; readyToReveal = false; matchPreparation = null; ui.setLoading(true);
  ui.setLoadingProgress(Math.min(.98, loadFraction), loadFraction >= .98 ? 'Carregando o avião' : loadLabel);
  return true;
}
function startWorker(config: RoomConfig, players: PlayerProfile[], matchId: string) {
  void rendererReady?.then(() => {
    if (!playing || match !== matchId) return;
    startReadyWorker(config, players, matchId);
  }).catch(error => {
    if (match !== matchId || pageDisposed) return;
    leave(); ui.toast(error instanceof RendererUnavailableError ? rendererUnavailableMessage :
      'Não foi possível carregar a ilha. Recarregue a página e tente novamente.', true);
  });
}
function startReadyWorker(config: RoomConfig, players: PlayerProfile[], matchId: string) {
  worker?.terminate();
  worker = new Worker(new URL('./simulation/host.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'snapshot') {
      if (data.snapshot.matchId !== match) return;
      if (room?.isHost) session.publish(data.snapshot, data.events);
      acceptSnapshot(data.snapshot); acceptEvents(data.events);
    } else if (data.type === 'suspended') ui.toast('A partida retomou após uma pausa do navegador.');
    else if (data.type === 'error') { leave(); ui.toast(data.message, true); }
  };
  worker.onerror = () => { leave(); ui.toast('A partida foi interrompida. Volte ao início e tente novamente.', true); };
  worker.postMessage({ type: 'init', world, config, players, matchId });
}
function startPractice(config: RoomConfig, p: { name: string; color: string }) {
  void sound.unlock();
  session.leave(); room = null; ui.setRoom(null);
  // Practice only: legacy adaptive difficulty nudges the bots by recent results.
  practiceConfig = { ...config, bots: true, adapt: settings.adaptive ? loadAdapt() : 0 };
  const id = 'practice', matchId = Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
  if (!beginMatch(id, matchId)) return;
  startWorker(practiceConfig, [{ id, ...p, ready: true, connected: true }], matchId);
  void input.lock();
}
function stopMatch() {
  remoteInterpolation.reset();
  playing = false; input.unlock(); worker?.terminate(); worker = null;
  snapshot = null; predicted = null; pending = []; spectateId = null; accumulator = 0; interaction = null;
}
function leave() {
  stopMatch(); session.leave(); room = null; practiceConfig = null;
  ui.closeModal(); ui.setRoom(null); ui.home();
  // The renderer stays alive (it is disposed on pagehide) so the next match starts without reloading the island.
  loading = false; ui.setLoading(false);
}
function acceptSnapshot(next: WorldSnapshot) {
  if (next.matchId !== match || (snapshot && next.tick < snapshot.tick)) return;
  snapshot = next; receivedAt = performance.now();
  remoteInterpolation.push(next, playerId, receivedAt);
  if (loading && !matchPreparation) {
    const preparingId = match;
    matchPreparation = rendererReady!.then(() => {
      if (!playing || match !== preparingId || pageDisposed) return;
      return renderer!.prepareMatch(next);
    }).then(() => {
      if (playing && match === preparingId) { readyToReveal = true; dirtyFrame = true; }
    }).catch(error => {
      if (match !== preparingId || pageDisposed) return;
      leave(); ui.toast(error instanceof RendererUnavailableError ? rendererUnavailableMessage :
        'Não foi possível preparar a partida. Recarregue a página e tente novamente.', true);
    });
  }
  const actor = next.actors.find(a => a.id === playerId);
  if (actor) {
    if (!initializedPose || (!lastAlive && actor.alive)) {
      input.frame.yaw = actor.yaw; input.frame.pitch = actor.pitch;
      initializedPose = true; pending = [];
    }
    // Authoritative state is replayed with only unacknowledged movement inputs.
    pending = pending.filter(frame => frame.seq > actor.lastInput);
    predicted = structuredClone(actor);
    if (next.phase === 'playing') for (const frame of pending) predict(frame);
    if (!actor.alive && lastAlive && next.config.mode === 'battle-royale') {
      cycleSpectator();
    }
    if (lastStage !== actor.stage) pending = [];
    lastAlive = actor.alive; lastStage = actor.stage;
  }
  if (next.phase === 'results' && practiceConfig && settings.adaptive && adaptRecorded !== next.matchId) {
    const mine = next.results.find(r => r.id === playerId);
    if (mine) { adaptRecorded = next.matchId; recordPlacement(mine.place, next.results.length, mine.winner); }
  }
  if (next.phase === 'results') {
    playing = false; input.unlock(); worker?.terminate(); worker = null;
    ui.update(next, playerId, session.ping, false, fps, null);
  }
}
function acceptEvents(events: GameEvent[]) {
  for (const event of events) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    if (!document.hidden && ui.screen === 'game') {
      renderer?.event(event);
      sound.event(event, renderer?.cameraPosition || { x: 0, y: 0, z: 0 }, input.frame.yaw, playerId);
      ui.event(event);
    }
    if (event.type === 'shot' && event.actor === playerId && input.locked && event.weapon !== 'machete') {
      input.applyRecoil(event.weapon);
    }
    if (event.type === 'notice') ui.toast(event.text);
  }
}
function sendAction(action: PlayerAction) {
  if (!playing || !snapshot) return;
  const me = snapshot.actors.find(a => a.id === playerId);
  if (!me?.alive && snapshot.config.mode === 'battle-royale') {
    if (action.type === 'jump') cycleSpectator();
    return;
  }
  if (action.type === 'jump' && me?.stage === 'falling') action = { type: 'parachute', id: action.id };
  if (practiceConfig) worker?.postMessage({ type: 'action', id: playerId, action });
  else session.sendAction(action);
}
function predict(frame: InputFrame) {
  if (!predicted || snapshot?.phase !== 'playing') return;
  predicted.yaw = frame.yaw; predicted.pitch = frame.pitch;
  moveActor(predicted, frame, world, 1 / 60);
  if (snapshot.config.mode === 'deathmatch') {
    predicted.pos.x = clamp(predicted.pos.x, ARENA.minX + .32, ARENA.maxX - .32);
    predicted.pos.z = clamp(predicted.pos.z, ARENA.minZ + .32, ARENA.maxZ - .32);
  }
}
function cycleSpectator() {
  const alive = snapshot?.actors.filter(a => a.alive && a.id !== playerId) || [];
  const index = alive.findIndex(a => a.id === spectateId);
  spectateId = alive[(index + 1) % alive.length]?.id || null; dirtyFrame = true;
}
function closestInteraction() {
  return findInteraction(world, snapshot, predicted, interactionResult);
}
input.onAction = sendAction;
input.onCycle = direction => {
  const me = snapshot?.actors.find(a => a.id === playerId);
  if (!me || me.weapons.length < 2) return;
  const slot = (me.slot + direction + me.weapons.length) % me.weapons.length;
  sendAction({ type: 'slot', id: input.actionIdNext(), slot });
};
input.onInteract = () => { interaction = closestInteraction(); if (interaction) sendAction({ type: 'interact', id: input.actionIdNext(), target: interaction.id }); };
input.onPause = () => { if (playing) ui.setPaused(true); };
input.onLock = () => { renderDeadline = 0; lastRender = performance.now(); frameCount = 0; fpsAt = lastRender; ui.closeModal(); ui.setPaused(false); };
input.onError = message => ui.toast(message, true);
window.addEventListener('resize', () => { renderer?.resize(); dirtyFrame = true; });
window.addEventListener('pagehide', () => { pageDisposed = true; stopMatch(); session.leave(); sound.dispose(); renderer?.dispose(); });
window.addEventListener('pageshow', event => {
  // pagehide releases the match and audio hardware. A restored page must create
  // fresh resources instead of reviving references to a terminated Worker.
  if (event.persisted) location.reload();
});
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now(); accumulator = 0;
  sound.setHidden(document.hidden);
  if (document.hidden) { input.clear(); input.unlock(); }
});

// Simulation is independent of rendering. Never render the menu or a hidden tab,
// and cap frames on high-refresh displays instead of saturating the GPU.
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
  if (document.hidden || (loading && !readyToReveal)) return;
  input.recoverRecoil(dt);
  const me = snapshot?.actors.find(a => a.id === playerId) || null;
  const listener = spectateId ? snapshot?.actors.find(a => a.id === spectateId) || me : me;
  sound.update(listener, snapshot, dt, ui.screen !== 'game');
  // After the match ends the island keeps drawing behind the in-game victory overlay.
  const ended = !playing && snapshot?.phase === 'results';
  if ((!playing && !ended) || !snapshot || ui.screen !== 'game') return;
  accumulator = ended ? 0 : Math.min(accumulator + dt, .1);
  while (accumulator >= 1 / 60) {
    const time = snapshot.time + Math.min(.2, (now - receivedAt) / 1000);
    const next = input.sample(time);
    if (practiceConfig) worker?.postMessage({ type: 'input', id: playerId, input: next });
    else session.sendInput(next);
    if (snapshot.phase === 'playing') { pending.push(next); if (pending.length > 120) pending.shift(); predict(next); }
    accumulator -= 1 / 60;
  }
  const activeLimit = input.locked ? settings.frameLimit : ended ? 30 : 10;
  const interval = 1000 / activeLimit;
  if (now < renderDeadline - .5) return;
  // Keep the cadence across small rAF timing variations instead of dropping
  // every frame that arrives a fraction early. Never catch up after a stall.
  renderDeadline = Math.max(renderDeadline + interval, now + interval * .05);
  const renderDt = Math.min((now - lastRender) / 1000, .05); lastRender = now;
  if (spectateId && !snapshot.actors.some(a => a.id === spectateId && a.alive)) cycleSpectator();
  interaction = closestInteraction();
  if (input.locked || dirtyFrame || ended) {
    renderFrame.snapshot = snapshot; renderFrame.playerId = playerId; renderFrame.input = input.frame; renderFrame.dt = renderDt;
    renderFrame.remoteActors = remoteInterpolation.sample(now);
    renderFrame.spectateId = spectateId; renderFrame.predicted = predicted?.pos; renderer?.update(renderFrame);
    renderedFrames++; frameCount++; dirtyFrame = false;
    if (loading && readyToReveal) { loading = false; ui.setLoading(false); }
  }
  if (now - fpsAt >= 1000) { fps = frameCount * 1000 / (now - fpsAt); frameCount = 0; fpsAt = now; }
  ui.update(snapshot, playerId, session.ping, input.scoreboard, fps, interaction, session.latencies);
}
requestAnimationFrame(frame);
document.querySelector('#loading')?.remove();
const invitation = new URLSearchParams(location.search).get('sala');
if (invitation && /^[A-Z0-9]{6}$/i.test(invitation)) ui.roomModal('join', invitation.toUpperCase());

// A separate QA build can render deterministic scenes without starting a networked match.
if (import.meta.env.VITE_QA === '1' && new URLSearchParams(location.search).has('qa')) {
  void import('../tests/visual/qa-hook').then(({ installQa }) => installQa({
    world, ui, input, settings,
    begin: async () => {
      if (!beginMatch('practice', 'qa-seed-2026')) throw new Error('Renderer unavailable');
      playing = false;
      await rendererReady;
      loading = false; ui.setLoading(false); ui.setPaused(false);
      return renderer!;
    },
  }));
}

// Read-only diagnostics for local QA. Never exposed in the production build.
if (import.meta.env.DEV) {
  // Perf probe: frame intervals from an independent rAF loop plus long tasks.
  const intervals: number[] = [], longTasks: number[] = []; let lastTick = performance.now();
  const tick = (now: number) => { intervals.push(now - lastTick); if (intervals.length > 1200) intervals.shift(); lastTick = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  Object.defineProperty(window, '__capivara', { value: {
    inspect: () => ({ screen: ui.screen, room, snapshot, predicted, renderedFrames, renderer: renderer?.stats, pending: pending.length }),
    perf: () => {
      const sorted = [...intervals].sort((a, b) => a - b), pick = (q: number) => +(sorted[Math.floor(sorted.length * q)] ?? 0).toFixed(1);
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      return { frames: sorted.length, p50: pick(.5), p95: pick(.95), p99: pick(.99), max: +(sorted.at(-1) ?? 0).toFixed(1), over33: intervals.filter(t => t > 33.4).length,
        longTasks: [...longTasks], renderer: renderer?.stats, heapMB: heap ? Math.round(heap / 1048576) : null };
    },
    resetPerf: () => { intervals.length = 0; longTasks.length = 0; },
  } });
}
