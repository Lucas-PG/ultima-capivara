import './ui/style.css';
import { createWorld } from './shared/world';
import { ARENA } from './shared/layout';
import { actorEye, hasLineOfSight, moveActor } from './shared/collision';
import { clamp, distance } from './shared/math';
import { WEAPONS } from './shared/weapons';
import { rarityOf } from './shared/rarity';
import type { ActorState, GameEvent, InputFrame, PlayerAction, PlayerProfile, RoomConfig, RoomState, WorldSnapshot } from './shared/types';
import { GameRenderer } from './render/renderer';
import { RoomSession } from './network/session';
import { InputController } from './input';
import { SoundEngine } from './audio';
import { loadProfile, loadSettings, saveProfile, saveSettings } from './settings';
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
let renderer: GameRenderer | null = null;
// One renderer for the page's lifetime, warmed up on the menu; `loading` holds the match's loading screen until the first real frame.
let rendererReady: Promise<void> | null = null, loading = false, readyToReveal = false;
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

const session = new RoomSession({
  room(next) {
    const returned = next?.phase === 'lobby' && room?.phase !== 'lobby';
    room = next;
    if (returned) stopMatch();
    ui.setRoom(next);
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
  start() {
    try { ensureRenderer(); }
    catch { ui.toast('O gráfico 3D não está disponível. Ative a aceleração de hardware antes de começar.', true); return; }
    void sound.unlock(); session.start(); if (playing) void input.lock();
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
  if (!renderer) { renderer = new GameRenderer(canvas, world, settings, () => { dirtyFrame = true; }); rendererReady = renderer.warmup(); }
  renderer.resize();
}
function beginMatch(id: string, matchId: string) {
  stopMatch();
  try { ensureRenderer(); }
  catch {
    leave();
    ui.toast('Não foi possível iniciar o gráfico 3D. Ative a aceleração de hardware e tente novamente.', true);
    return false;
  }
  playerId = id; match = matchId; playing = true; dirtyFrame = true;
  lastEvent = 0; initializedPose = false; lastAlive = true; lastStage = '';
  input.reset(); ui.closeModal(); ui.game(id); ui.setPaused(!input.locked);
  loading = true; readyToReveal = false; ui.setLoading(true);
  void rendererReady?.then(() => { if (match === matchId) { readyToReveal = true; dirtyFrame = true; } });
  return true;
}
function startWorker(config: RoomConfig, players: PlayerProfile[], matchId: string) {
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
  practiceConfig = { ...config, bots: true };
  const id = 'practice', matchId = Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
  if (!beginMatch(id, matchId)) return;
  startWorker(practiceConfig, [{ id, ...p, ready: true, connected: true }], matchId);
  void input.lock();
}
function stopMatch() {
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
      const recoil = { pistol: .014, smg: .007, m4: .011, shotgun: .042, dmr: .028, sniper: .055, slingshot: .01 }[event.weapon];
      input.frame.pitch = clamp(input.frame.pitch + recoil * (input.frame.ads ? .7 : 1), -1.48, 1.48);
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
  const me = predicted;
  if (!snapshot || !me?.alive || me.stage !== 'ground') return null;
  const eye = { ...me.pos, y: me.pos.y + actorEye(me) };
  const options: { id: string; name: string; distance: number }[] = [];
  const candidates = [
    ...snapshot.loot.filter(l => l.active).map(l => ({ ...l, name: l.weapon ? `${WEAPONS[l.weapon].name} ${rarityOf(l.rarity).name.toLowerCase()}` : ({ weapon: 'Arma', ammo: 'Munição', armor: 'Colete', helmet: 'Capacete', bandage: 'Bandagem', medkit: 'Kit médico', guarana: 'Guaraná', acai: 'Açaí', rapadura: 'Rapadura' }[l.kind] || 'Equipamento') })),
    ...world.chests.filter(c => !snapshot!.openedChests.includes(c.id)).map(c => ({ ...c, name: 'Abrir caixa de suprimentos' })),
  ];
  for (const candidate of candidates) {
    const dist = distance(me.pos, candidate);
    if (dist <= 3 && hasLineOfSight(eye, { ...candidate, y: candidate.y + .5 }, world)) options.push({ id: candidate.id, name: candidate.name, distance: dist });
  }
  options.sort((a, b) => a.distance - b.distance);
  return options[0] || null;
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
window.addEventListener('pagehide', () => { session.leave(); worker?.terminate(); sound.dispose(); renderer?.dispose(); });
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
  if (document.hidden) return;
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
    renderer?.update({ snapshot, playerId, input: input.frame, dt: renderDt, playing: true, spectateId, predicted: predicted?.pos });
    renderedFrames++; frameCount++; dirtyFrame = false;
    if (loading && readyToReveal) { loading = false; ui.setLoading(false); }
  }
  if (now - fpsAt >= 1000) { fps = frameCount * 1000 / (now - fpsAt); frameCount = 0; fpsAt = now; }
  ui.update(snapshot, playerId, session.ping, input.scoreboard, fps, interaction);
}
requestAnimationFrame(frame);
document.querySelector('#loading')?.remove();
// Build and warm the 3D island while the player is still on the menu, after the first paint.
const preload = () => { try { ensureRenderer(); } catch { /* reported when a match starts */ } };
if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 2500 }); else setTimeout(preload, 800);
const invitation = new URLSearchParams(location.search).get('sala');
if (invitation && /^[A-Z0-9]{6}$/i.test(invitation)) ui.roomModal('join', invitation.toUpperCase());

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
