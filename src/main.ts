import './ui/style.css';
import './ui/hud.css';
import { createWorld } from './shared/world';
import { hasLineOfSight, moveActor } from './shared/collision';
import { clamp } from './shared/math';
import { closestInteraction as findInteraction } from './shared/interaction';
import { indexOfBox, nextBoxSlot } from './shared/inventory';
import { WEAPONS } from './shared/weapons';
import { DEATH_CAM_SECONDS } from './shared/death-cam';
import type { ActorState, GameEvent, InputFrame, PlayerAction, PlayerProfile, RoomConfig, RoomState, WorldSnapshot } from './shared/types';
import { LocalPresentation, type PresentationFrame } from './render/local-presentation';
import type { GameRenderer } from './render/renderer';
import { timing } from './render/timing';
import { gpuPasses } from './render/gpu-passes';
import { RoomSession } from './network/session';
import { RemoteInterpolation, shotClientTime } from './network/interpolation';
import { InputController } from './input';
import { InputClock } from './input-clock';
import { FirePredictor, type ShotEvent } from './fire-prediction';
import { SoundEngine } from './audio';
import { loadProfile, loadSettings, saveProfile, saveSettings, loadAdapt, recordPlacement } from './settings';
import { GameUI } from './ui/ui';
import { SpectateDirector } from './spectate';
import { FramePacer, HEADROOM_DENSITY, HEADROOM_SECONDS } from './frame-pacing';

const world = createWorld();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
let settings = loadSettings(), profile = loadProfile();
let savedFrameLimit = settings.frameLimit;
const requestedFps = Number(new URLSearchParams(location.search).get('fps'));
// The network smoke still renders the real scene, but software GL must not
// monopolize the page between transport assertions. Absent from normal builds.
const networkQaFps = import.meta.env.VITE_QA === '1' &&
  new URLSearchParams(location.search).get('networkFps') === '2' ? 2 : null;
if (requestedFps === 30 || requestedFps === 60) settings.frameLimit = requestedFps;
let activeFrameLimit = settings.frameLimit;
const input = new InputController(canvas, settings);
const sound = new SoundEngine(settings, world);
const renderFrame: PresentationFrame = { snapshot: null, playerId: '', input: input.frame, dt: 0, playing: true, spectateId: null };
const localPresentation = new LocalPresentation();
const remoteInterpolation = new RemoteInterpolation();
// The local player's own rounds are shown on the input frame; the host confirms hits.
const firePredictor = new FirePredictor();
// Hotbar box held before the current one, for the previous-weapon key.
let heldBox = -1, previousBox = -1, quickMeleeAt = -Infinity;
let renderedRemoteTime: number | null = null;
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
// After your elimination the death cam frames the eliminator, then spectating follows them.
// The hand-off follows the camera's clamped clock; the wall-clock limit covers a cam that never started.
let diedAt = 0, lastKiller: string | null = null, killSeen = false, fellAt: { x: number; y: number; z: number } | null = null;
const spectator = new SpectateDirector();
let spectateAds = false;
let practiceConfig: RoomConfig | null = null;
let predicted: ActorState | null = null;
let pending: InputFrame[] = [];
let receivedAt = 0, lastEvent = 0, match = '', playing = false;
let lastAlive = true, lastStage = '', initializedPose = false;
let lastFrame = performance.now(), lastRender = 0;
const pacer = new FramePacer();
// Automatic display rate (the default "Taxa da tela" the player never picked): on a high-refresh
// screen it falls back to 60 for the session once holding the display rate costs image detail.
let displayRateCostly = false, lowDetailFor = 0;
const frameLimit = () => settings.frameLimit === 0 && !settings.frameLimitChosen && displayRateCostly ? 60 : settings.frameLimit;
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
  emote(emote) { sendAction({ type: 'emote', id: input.actionIdNext(), emote }); },
  cancelEmote() { input.closeEmoteWheel(); },
  resume() { void sound.unlock(); void input.lock(); },
  uiSound(kind) { if (kind !== 'hover') void sound.unlock(); sound.ui(kind); },
  spectate(direction = 1) { spectateStep(direction); void input.lock(); },
  settings(next) {
    if (next.frameLimit !== activeFrameLimit) {
      savedFrameLimit = next.frameLimit; activeFrameLimit = next.frameLimit; pacer.reset();
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
      renderer.onFoley = cue => sound.foley(cue);
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
    } else if (data.type === 'metrics') timing.record('worker-tick', performance.now(), data.tickMs);
    else if (data.type === 'suspended') ui.toast('A partida retomou após uma pausa do navegador.');
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
  localPresentation.clear(); renderFrame.localActor = undefined;
  remoteInterpolation.reset(); renderedRemoteTime = null;
  playing = false; input.unlock(); worker?.terminate(); worker = null;
  snapshot = null; predicted = null; pending = []; spectateId = null; inputClock.reset(); interaction = null; diedAt = 0; lastKiller = null; killSeen = false; fellAt = null;
  spectator.reset(); ui.setSpectate(null);
  firePredictor.reset(); heldBox = previousBox = -1;
}
function leave() {
  stopMatch(); session.leave(); room = null; practiceConfig = null;
  ui.closeModal(); ui.setRoom(null); ui.home();
  // The renderer stays alive (it is disposed on pagehide) so the next match starts without reloading the island.
  loading = false; ui.setLoading(false);
}
function acceptSnapshot(next: WorldSnapshot) {
  if (next.matchId !== match || (snapshot && next.tick < snapshot.tick)) return;
  timing.context(loading ? 'loading' : next.phase, next.tick, renderedFrames);
  const snapshotAt = timing.begin();
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
    firePredictor.sync(actor, performance.now() / 1000);
    // A quick melee's hop to the facão and back is not a weapon choice.
    const box = actor.weapons[actor.slot]?.box ?? -1;
    if (box !== heldBox) { if (heldBox >= 0 && performance.now() - quickMeleeAt > 1500) previousBox = heldBox; heldBox = box; }
    if (next.phase === 'playing') for (const frame of pending) predict(frame);
    localPresentation.reconcile(predicted);
    if (!actor.alive && lastAlive && next.config.mode === 'battle-royale') {
      diedAt = performance.now(); fellAt = { ...actor.pos };
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
  timing.end('snapshot', snapshotAt);
}
function acceptEvents(events: GameEvent[]) {
  for (const event of events) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    // Own rounds already shown by prediction only pair their confirmed hit with the host's endpoint.
    if (event.type === 'shot' && event.actor === playerId) noteShot(event.seq, 'confirmed');
    if (event.type === 'shot' && event.actor === playerId && firePredictor.consume(event)) { renderer?.confirmShot(event); continue; }
    if (!document.hidden && ui.screen === 'game') {
      renderer?.event(event);
      sound.event(event, renderer?.cameraPosition || { x: 0, y: 0, z: 0 }, input.frame.yaw, playerId);
      ui.event(event);
    }
    if (event.type === 'shot' && event.actor === playerId && input.locked && event.weapon !== 'machete') {
      input.applyRecoil(event.weapon, renderer?.adsAmount ?? 0);
    }
    if (event.type === 'kill' && event.target === playerId) {
      lastKiller = event.actor; killSeen = true;
      // The kill can land after the one-second fallback already started watching whoever was nearest: move to the
      // eliminator unless the player has switched by hand since.
      if (spectator.active && autoSpectateAt && performance.now() - autoSpectateAt < 5000 && snapshot) spectator.begin(snapshot.actors, playerId, event.actor, fellAt);
    }
    if (event.type === 'kill') spectator.kill(event.target, event.actor);
  }
}
function sendAction(action: PlayerAction) {
  if (!playing || !snapshot) return;
  const me = snapshot.actors.find(a => a.id === playerId);
  if (!me?.alive && snapshot.config.mode === 'battle-royale') {
    // Watching: jump or fire moves to the next capybara (and skips the rest of the death cam).
    if (action.type === 'jump' || action.type === 'trigger') spectateStep(1);
    return;
  }
  if (action.type === 'jump' && me?.stage === 'falling') action = { type: 'parachute', id: action.id };
  if (predicted) localPresentation.action(action, predicted, simulationNow());
  if (predicted && snapshot.phase === 'playing') {
    const now = performance.now() / 1000;
    if (action.type === 'slot') firePredictor.swap(action.slot, now);
    if (action.type === 'trigger') showPredicted(firePredictor.press(predicted, action.id, action.yaw, action.pitch, action.lean, now, simulationNow(), match, world, predictionTargets()));
    else if (action.type === 'melee') showPredicted(firePredictor.melee(predicted, input.frame.yaw, input.frame.pitch, now, simulationNow(), match, world, predictionTargets()));
  }
  if (action.type === 'trigger') action = { ...action, clientTime: shotClientTime(
    snapshot.time + Math.min(.2, (performance.now() - receivedAt) / 1000), renderedRemoteTime) };
  if (practiceConfig) worker?.postMessage({ type: 'action', id: playerId, action });
  else session.sendAction(action);
}
const simulationNow = () => snapshot ? snapshot.time + Math.min(.2, (performance.now() - receivedAt) / 1000) : 0;
// What the player saw and aimed at: the last rendered remote poses.
const predictionTargets = (): Iterable<ActorState> => renderFrame.remoteActors?.values() ?? snapshot?.actors ?? [];
// Dev diagnostics: when each own round was shown locally and when the host's event for it arrived.
const shotTimes = new Map<number, { predicted?: number; confirmed?: number }>();
function noteShot(seq: number | undefined, key: 'predicted' | 'confirmed') {
  if (!import.meta.env.DEV || seq === undefined) return;
  const entry = shotTimes.get(seq) ?? {}; entry[key] ??= performance.now(); shotTimes.set(seq, entry);
  if (shotTimes.size > 128) shotTimes.delete(shotTimes.keys().next().value!);
}
function showPredicted(shot: ShotEvent | null) {
  if (!shot) return;
  noteShot(shot.seq, 'predicted');
  if (!document.hidden && ui.screen === 'game') {
    renderer?.event(shot);
    sound.event(shot, renderer?.cameraPosition || { x: 0, y: 0, z: 0 }, input.frame.yaw, playerId);
    ui.event(shot);
  }
  if (input.locked && shot.weapon !== 'machete') input.applyRecoil(shot.weapon, renderer?.adsAmount ?? 0);
}
function predict(frame: InputFrame) {
  if (!predicted || snapshot?.phase !== 'playing') return;
  predicted.yaw = frame.yaw; predicted.pitch = frame.pitch;
  moveActor(predicted, frame, world, 1 / 60, 1, snapshot.config.mode);
}
// Starts watching (your eliminator, or whoever is nearest to where you fell), or steps through the others.
let autoSpectateAt = 0;
function beginSpectating(auto = true) {
  diedAt = 0; killSeen = false; autoSpectateAt = auto ? performance.now() : 0;
  if (snapshot) spectator.begin(snapshot.actors, playerId, lastKiller, fellAt);
  dirtyFrame = true;
}
function spectateStep(direction: number) {
  const me = snapshot?.actors.find(a => a.id === playerId);
  if (!snapshot || !me || me.alive || snapshot.config.mode !== 'battle-royale' || snapshot.phase !== 'playing') return;
  if (!spectator.active) beginSpectating(false);
  else { spectator.cycle(snapshot.actors, playerId, direction < 0 ? -1 : 1); autoSpectateAt = 0; }
  dirtyFrame = true;
}
function closestInteraction() {
  return findInteraction(world, snapshot, predicted, interactionResult);
}
input.onAction = sendAction;
input.onCancelEmote = () => {
  // A selection may still be travelling to the host, so a local-only control
  // cancels reliably even before its active gesture appears in a snapshot.
  if (playing && snapshot?.phase === 'playing') sendAction({ type: 'emote', id: input.actionIdNext(), emote: null });
};
input.onEmoteOpen = () => { input.onCancelEmote(); return playing && ui.openEmoteWheel(); };
input.onEmoteClose = commit => ui.closeEmoteWheel(commit);
input.onEmoteMove = (x, y) => ui.moveEmoteWheel(x, y);
input.onEmoteChoice = index => ui.selectEmote(index);
input.onInspect = () => renderer?.inspectWeapon();
input.onCycle = direction => {
  const me = snapshot?.actors.find(a => a.id === playerId);
  if (me && !me.alive) { spectateStep(direction); return; }
  if (!me || me.weapons.length < 2) return;
  // Follow the hotbar: boxes 1 to 4 in order, skipping empty boxes.
  const slot = nextBoxSlot(me.weapons, me.slot, direction);
  if (slot !== me.slot) sendAction({ type: 'slot', id: input.actionIdNext(), slot });
};
input.onBox = box => {
  const me = snapshot?.actors.find(a => a.id === playerId), slot = me ? indexOfBox(me.weapons, box) : -1;
  if (slot >= 0) sendAction({ type: 'slot', id: input.actionIdNext(), slot });
  else ui.flashEmptyBox(box);
};
input.onMelee = () => { quickMeleeAt = performance.now(); sendAction({ type: 'melee', id: input.actionIdNext() }); };
input.onLastWeapon = () => { if (previousBox >= 0) input.onBox(previousBox); };
input.onInteract = () => { interaction = closestInteraction(); if (interaction) sendAction({ type: 'interact', id: input.actionIdNext(), target: interaction.id }); };
input.onPause = () => { input.onCancelEmote(); if (playing) ui.setPaused(true); };
input.onLock = () => { pacer.reset(); lastRender = performance.now(); frameCount = 0; fpsAt = lastRender; ui.closeModal(); ui.setPaused(false); };
input.onError = message => ui.toast(message, true);
const inputClock = new InputClock(
  () => (!document.hidden || input.locked) && playing && !!snapshot && ui.screen === 'game' && (!loading || readyToReveal),
  now => {
    const time = snapshot!.time + Math.min(.2, (now - receivedAt) / 1000);
    const next = input.sample(shotClientTime(time, renderedRemoteTime));
    if (practiceConfig) worker?.postMessage({ type: 'input', id: playerId, input: next });
    else session.sendInput(next);
    if (snapshot!.phase === 'playing') {
      pending.push(next); if (pending.length > 120) pending.shift(); predict(next);
      if (predicted) {
        localPresentation.tick(predicted);
        showPredicted(firePredictor.tick(predicted, next, now / 1000, time, match, world, predictionTargets()));
      }
    }
  });
const resizeGame = () => {
  renderer?.resize(); dirtyFrame = true;
  requestAnimationFrame(() => renderer?.resize());
};
window.addEventListener('resize', resizeGame);
window.visualViewport?.addEventListener('resize', resizeGame);
document.addEventListener('fullscreenchange', resizeGame);
document.addEventListener('pointerlockchange', resizeGame);
window.addEventListener('pagehide', () => { pageDisposed = true; stopMatch(); inputClock.dispose(); session.leave(); sound.dispose(); renderer?.dispose(); });
window.addEventListener('pageshow', event => {
  // pagehide releases the match and audio hardware. A restored page must create
  // fresh resources instead of reviving references to a terminated Worker.
  if (event.persisted) location.reload();
});
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now(); inputClock.reset();
  sound.setHidden(document.hidden);
  if (document.hidden) { input.clear(); input.unlock(); }
});

// Simulation is independent of rendering. Never render the menu or a hidden tab,
// and cap frames on high-refresh displays instead of saturating the GPU.
function frame(now: number) {
  requestAnimationFrame(frame);
  pacer.tick(now);
  const dt = Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
  if (document.hidden || (loading && !readyToReveal)) return;
  timing.context(loading ? 'loading' : snapshot?.phase ?? 'menu', snapshot?.tick ?? -1, renderedFrames);
  input.refresh();
  input.recoverRecoil(dt);
  const me = snapshot?.actors.find(a => a.id === playerId) || null;
  // Immediate local contact comes from prediction; other actors use snapshots.
  const listener = spectateId ? snapshot?.actors.find(a => a.id === spectateId) || me : predicted || me;
  const audioAt = timing.begin();
  sound.update(listener, snapshot, dt, ui.screen !== 'game');
  timing.end('audio', audioAt);
  // After the match ends the island keeps drawing behind the in-game victory overlay.
  const ended = !playing && snapshot?.phase === 'results';
  if ((!playing && !ended) || !snapshot || ui.screen !== 'game') return;
  // Watching after an elimination is live play: it renders at full rate even with the mouse released.
  const watching = playing && snapshot.phase === 'playing' && !!me && !me.alive;
  const activeLimit = networkQaFps ?? (input.locked || watching ? frameLimit() : ended ? 30 : 10);
  // Keep the cadence across small rAF timing variations (see FramePacer). Never catch up after a stall.
  if (!pacer.shouldRender(now, activeLimit)) return;
  const interval = pacer.intervalMs(activeLimit);
  const frameIntervalMs = now - lastRender, renderDt = Math.min(frameIntervalMs / 1000, .05); lastRender = now;
  // Hand off once the kill has been seen and its cam has run; the events and snapshots channels may
  // arrive in either order, so a kill that never shows up still hands off after 1 s.
  if (diedAt && snapshot.phase === 'playing' && ((killSeen && !renderer?.deathCamActive) || (!killSeen && now - diedAt > 1000) || now - diedAt > DEATH_CAM_SECONDS * 1000 + 1500)) beginSpectating();
  // Right mouse steps back through the watch order (its press, not its hold).
  if (watching && input.frame.ads && !spectateAds && spectator.active) { spectator.cycle(snapshot.actors, playerId, -1); autoSpectateAt = 0; }
  spectateAds = watching && input.frame.ads;
  const view = spectator.active ? spectator.update(snapshot.actors, playerId, now / 1000) : null;
  spectateId = view?.target ?? null;
  ui.setSpectate(view);
  const interactionAt = timing.begin();
  interaction = closestInteraction();
  timing.end('interaction', interactionAt);
  if (input.locked || dirtyFrame || ended || watching || renderer?.deathCamActive) {
    renderFrame.snapshot = snapshot; renderFrame.playerId = playerId; renderFrame.input = input.frame; renderFrame.dt = renderDt; renderFrame.frameBudgetMs = interval; renderFrame.frameIntervalMs = frameIntervalMs;
    renderFrame.remoteActors = remoteInterpolation.sample(now);
    renderFrame.simulationTime = snapshot.time + Math.min(.2, (now - receivedAt) / 1000);
    renderFrame.localActor = predicted ? localPresentation.sample(predicted, input.frame, inputClock.fraction(now), renderDt, renderFrame.simulationTime) : undefined;
    renderFrame.spectateId = spectateId; renderFrame.predicted = renderFrame.localActor?.pos;
    const renderAt = timing.begin();
    renderer?.update(renderFrame);
    if (renderer) { input.setAimFov(renderer.camera.fov, renderer.adsAmount, renderer.scopeHeld); ui.frameCompass(renderer.heading); }
    timing.end('render', renderAt);
    renderedRemoteTime = remoteInterpolation.time;
    renderedFrames++; frameCount++; dirtyFrame = false;
    if (renderer && activeLimit === 0 && !settings.frameLimitChosen && pacer.displayMs < 15) {
      lowDetailFor = renderer.renderDensity < renderer.densityCeiling * HEADROOM_DENSITY ? lowDetailFor + renderDt : 0;
      if (lowDetailFor > HEADROOM_SECONDS) { displayRateCostly = true; pacer.reset(); }
    }
    // First play on a machine the preset is too rich for: step down once the lowest automatic
    // resolution has missed the frame rate for a while. A preset the player picked is never touched.
    if (renderer?.overloaded && !settings.graphicsChosen && settings.graphics !== 'low') {
      const lighter = settings.graphics === 'high' ? 'medium' : 'low';
      settings.graphics = lighter; saveSettings({ ...settings, frameLimit: savedFrameLimit }); renderer.setSettings(settings); sound.setSettings(settings);
      ui.toast(`Qualidade ajustada para ${lighter === 'low' ? 'Leve' : 'Equilibrada'} para o jogo ficar fluido. Dá para mudar em Ajustes.`);
    }
    if (loading && readyToReveal) { loading = false; ui.setLoading(false); }
  }
  if (now - fpsAt >= 1000) { fps = frameCount * 1000 / (now - fpsAt); frameCount = 0; fpsAt = now; }
  const hudAt = timing.begin();
  ui.scopeReady = renderer?.scoped ?? true;
  ui.update(snapshot, playerId, session.ping, input.scoreboard, fps, interaction, session.latencies);
  timing.end('hud', hudAt);
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

// Real networking QA drives InputController without a browser pointer-lock dependency.
if (import.meta.env.VITE_QA === '1' && new URLSearchParams(location.search).has('networkQa')) {
  void import('../tests/network-game-hook').then(({ installNetworkInput }) => installNetworkInput(input, world));
}

// Read-only diagnostics for local QA and the QA build (VITE_QA=1). Never exposed in the production build.
if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') {
  // Perf probe: frame intervals from an independent rAF loop plus long tasks.
  const intervals: number[] = [], longTasks: number[] = []; let lastTick = performance.now();
  timing.observeLongTasks();
  const tick = (now: number) => { timing.record('raf-gap', lastTick, now - lastTick); intervals.push(now - lastTick); if (intervals.length > 1200) intervals.shift(); lastTick = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) { if (longTasks.length === 256) longTasks.shift(); longTasks.push(Math.round(entry.duration)); } }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  Object.defineProperty(window, '__capivara', { value: {
    inspect: () => ({ screen: ui.screen, room, snapshot, predicted, renderedFrames, renderer: renderer?.stats, renderDensity: renderer?.renderDensity, gpuEstimate: renderer?.gpuEstimate, pending: pending.length, spectateId, spectate: { lastKiller, killSeen, diedAt, fellAt, target: spectator.target, hold: spectator.hold },
      camera: renderer ? { ...renderer.cameraPosition, fov: renderer.camera.fov } : null,
      clientInput: { ...input.frame, locked: input.locked }, renderState: { loading, readyToReveal, hidden: document.hidden },
      network: { status: session.connectionStatus, latencies: session.latencies, interpolationDelayMs: remoteInterpolation.delay * 1000 },
      remoteActors: [...(renderFrame.remoteActors?.values() ?? [])].map(actor => ({ id: actor.id, pos: { ...actor.pos }, yaw: actor.yaw })) }),
    perf: () => {
      const sorted = [...intervals].sort((a, b) => a - b), pick = (q: number) => +(sorted[Math.floor(sorted.length * q)] ?? 0).toFixed(1);
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      return { frames: sorted.length, p50: pick(.5), p95: pick(.95), p99: pick(.99), max: +(sorted.at(-1) ?? 0).toFixed(1), over33: intervals.filter(t => t > 33.4).length,
        longTasks: [...longTasks], renderer: renderer?.stats, heapMB: heap ? Math.round(heap / 1048576) : null };
    },
    timings: () => ({ ...timing.snapshot(), preset: settings.graphics, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }),
    audio: () => sound.stats(),
    resources: () => renderer?.resources ?? null,
    gpu: (reset = false) => { const summary = gpuPasses.summary(); if (reset) gpuPasses.reset(); return summary; },
    // Spectator framing: where the watched capybara's chest lands on screen, how far it is, and whether a solid hides it.
    framing: (id: string) => {
      const actor = snapshot?.actors.find(a => a.id === id), rendered = renderFrame.remoteActors?.get(id);
      if (!renderer || !actor) return null;
      const pos = rendered?.pos ?? actor.pos, chest = { x: pos.x, y: pos.y + 1.1, z: pos.z }, eye = renderer.cameraPosition;
      const ndc = renderer.project(chest);
      return { ndc: ndc.map(v => +v.toFixed(3)), distance: +Math.hypot(chest.x - eye.x, chest.y - eye.y, chest.z - eye.z).toFixed(2),
        clear: hasLineOfSight({ x: eye.x, y: eye.y, z: eye.z }, chest, world) };
    },
    shotTimes: () => [...shotTimes].map(([seq, times]) => ({ seq, ...times })),
    resetPerf: () => { intervals.length = 0; longTasks.length = 0; timing.reset(); lastTick = performance.now(); },
    // QA builds: damage an actor in a practice match (attacker null means storm or fall style damage).
    qaDamage: (target: string, amount: number, attacker: string | null = null, weapon = 'm4') => {
      if (import.meta.env.VITE_QA === '1') worker?.postMessage({ type: 'qa-damage', target, attacker, amount, weapon });
    },
  } });
}
