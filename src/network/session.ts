import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { DEFAULT_CONFIG, MAX_PLAYERS, PLAYER_COLORS, PROTOCOL_VERSION, WORLD_VERSION,
  type GameEvent, type InputFrame, type PlayerAction, type PlayerProfile, type RoomConfig,
  type RoomState, type SessionCallbacks, type WorldSnapshot } from '../shared/types';
import { decodeFastFrame, encodeFastFrame, fastPart, finiteTree, gearPart, MAX_FRAME_BYTES, packet, parseWire, plainTextTree, rebuildFrame, worldPart } from './codec';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GRACE_MS = 30_000;
const KEEPALIVE_MS = 3_000;
const INPUTS_PER_SECOND = 90;
const ACTIONS_PER_SECOND = 20;
type Profile = { name: string; color: string };
type Guest = { profile: PlayerProfile; token: string; conn: DataConnection | null; game: RTCDataChannel | null;
  expires: ReturnType<typeof setTimeout> | null; lastInput: number; actions: Set<number>; inputBudget: number;
  actionBudget: number; budgetAt: number; lastFrame: number; lastResync: number; channelId: number | null; gameReady: boolean; gameCompression: boolean };

function code() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
function validProfile(v: unknown): v is Profile {
  return !!v && typeof v === 'object' && typeof (v as Profile).name === 'string' &&
    (v as Profile).name.trim().length >= 1 && (v as Profile).name.trim().length <= 18 &&
    !/[\x00-\x1f\x7f<>]/.test((v as Profile).name) && PLAYER_COLORS.includes((v as Profile).color);
}
function validPlayer(v: unknown): v is PlayerProfile {
  const p = v as PlayerProfile;
  return validProfile(p) && typeof p.id === 'string' && /^[a-zA-Z0-9-]{1,60}$/.test(p.id) &&
    typeof p.ready === 'boolean' && typeof p.connected === 'boolean';
}
function validRoom(v: unknown): v is RoomState {
  const r = v as RoomState;
  return !!r && /^[A-HJ-NP-Z2-9]{6}$/.test(r.code) && validConfig(r.config) &&
    ['lobby', 'countdown', 'playing', 'results'].includes(r.phase) &&
    typeof r.hostId === 'string' && Array.isArray(r.players) && r.players.length >= 1 &&
    r.players.length <= r.config.capacity && r.players.every(validPlayer) &&
    new Set(r.players.map(p => p.id)).size === r.players.length && r.players.some(p => p.id === r.hostId);
}
export function validConfig(v: unknown): v is RoomConfig {
  const c = v as RoomConfig;
  return !!c && (c.mode === 'battle-royale' || c.mode === 'deathmatch') &&
    Number.isInteger(c.capacity) && c.capacity >= 1 && c.capacity <= MAX_PLAYERS &&
    typeof c.bots === 'boolean' && ['easy', 'normal', 'hard'].includes(c.difficulty) &&
    [300, 480, 600].includes(c.duration);
}
export function validInput(v: unknown): v is InputFrame {
  const i = v as InputFrame;
  return !!i && Number.isSafeInteger(i.seq) && i.seq >= 0 &&
    ['moveX', 'moveZ', 'yaw', 'pitch', 'lean', 'clientTime'].every(k => Number.isFinite((i as any)[k])) &&
    Math.abs(i.moveX) <= 1 && Math.abs(i.moveZ) <= 1 && Math.abs(i.yaw) <= Math.PI * 1000 &&
    Math.abs(i.pitch) <= Math.PI / 2 + .01 && Math.abs(i.lean) <= 1 &&
    ['sprint', 'crouch', 'jump', 'fire', 'ads'].every(k => typeof (i as any)[k] === 'boolean') &&
    (i.firePressId === undefined || Number.isSafeInteger(i.firePressId) && i.firePressId >= 0);
}
export function validAction(v: unknown): v is PlayerAction {
  const a = v as PlayerAction;
  if (!a || !Number.isSafeInteger(a.id) || a.id < 0) return false;
  switch (a.type) {
    case 'reload': case 'parachute': case 'jump': return true;
    case 'trigger': return [a.yaw, a.pitch, a.lean, a.clientTime].every(Number.isFinite) &&
      Math.abs(a.yaw) <= Math.PI * 1000 && Math.abs(a.pitch) <= Math.PI / 2 + .01 &&
      Math.abs(a.lean) <= 1 && typeof a.ads === 'boolean';
    case 'slot': return Number.isInteger(a.slot) && a.slot >= 0 && a.slot <= 3;
    case 'interact': return typeof a.target === 'string' && a.target.length >= 1 && a.target.length <= 100;
    case 'consume': return ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'].includes(a.item);
    default: return false;
  }
}
function peerOptions(): PeerOptions {
  const env = import.meta.env;
  const options: PeerOptions = {};
  if (env.VITE_PEER_HOST) {
    options.host = String(env.VITE_PEER_HOST);
    options.port = Number(env.VITE_PEER_PORT || (location.protocol === 'https:' ? 443 : 9000));
    options.secure = env.VITE_PEER_SECURE === undefined ? location.protocol === 'https:' : env.VITE_PEER_SECURE === 'true';
    options.path = String(env.VITE_PEER_PATH || '/peerjs');
  }
  // Public STUN URLs only. TURN credentials must never be embedded in a browser build.
  const stun = String(env.VITE_ICE_URLS || '').split(',').map(s => s.trim()).filter(s => /^stuns?:[^\s]+$/.test(s)).slice(0, 6);
  if (stun.length) options.config = { iceServers: [{ urls: stun }] };
  return options;
}
function storageKey(roomCode: string) { return `ultima-capivara-v2:${roomCode}`; }
function peerError(error: unknown): Error {
  const kind = (error as { type?: string } | null)?.type;
  if (kind === 'peer-unavailable') return new Error('Sala não encontrada ou anfitrião desconectado.');
  if (kind === 'unavailable-id') return new Error('Este código de sala já está em uso.');
  if (kind === 'network' || kind === 'socket-error' || kind === 'server-error') return new Error('Falha na conexão de rede. Tente novamente.');
  return new Error('Não foi possível conectar à sala.');
}
function send(conn: DataConnection | null, data: object) {
  if (!conn?.open || JSON.stringify(data).length > 512_000) return;
  try { void Promise.resolve(conn.send(data)).catch(() => {}); } catch {}
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }

export class RoomSession {
  private peer: Peer | null = null;
  private callbacks: SessionCallbacks;
  private roomValue: RoomState | null = null;
  private guests = new Map<string, Guest>();
  private hostConn: DataConnection | null = null;
  private hostGame: RTCDataChannel | null = null;
  private hostGameReady = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private current: WorldSnapshot | null = null;
  private matchId = '';
  private worldRev = 0;
  private gearRev = 0;
  private worldData: ReturnType<typeof worldPart> | null = null;
  private gearData: ReturnType<typeof gearPart> | null = null;
  private worldJson = '';
  private gearJson = '';
  private lastTick = -1;
  private lastCompressedFrame: { matchId: string; tick: number } | null = null;
  private lastEventId = 0;
  private lastResync = 0;
  private pingValue = 0;
  private localInput = -1;
  private localActions = new Set<number>();
  private closing = false;
  private joining: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private rejoinUntil = 0;
  private reconnecting = false;

  constructor(callbacks: SessionCallbacks) { this.callbacks = callbacks; }
  get state(): RoomState | null { return this.roomValue ? structuredClone(this.roomValue) : null; }
  get ping(): number { return this.pingValue; }

  private emitRoom() { this.callbacks.room(this.state); }
  private fail(message: string) { this.callbacks.error(message); }
  private makePeer(id?: string): Peer { return id ? new Peer(id, peerOptions()) : new Peer(peerOptions()); }
  private whenOpen(peer: Peer): Promise<void> {
    if (peer.open) return Promise.resolve();
    if (peer.destroyed) return Promise.reject(new Error('A conexão foi encerrada.'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); peer.off('open', onOpen); peer.off('error', onError); };
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('O servidor de conexão demorou a responder.')); }, 10_000);
      peer.on('open', onOpen);
      peer.on('error', onError);
    });
  }

  async host(profile: Profile, config: RoomConfig = DEFAULT_CONFIG): Promise<void> {
    if (this.peer || this.roomValue) throw new Error('Você já está em uma sala.');
    if (!validProfile(profile) || !validConfig(config)) throw new Error('Nome, cor ou configurações da sala inválidos.');
    this.closing = false;
    let lastError: Error = new Error('Não foi possível criar um código de sala.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const roomCode = code();
      const peer = this.makePeer(`cap2-${roomCode}`);
      this.peer = peer;
      try { await this.whenOpen(peer); }
      catch (error) {
        lastError = peerError(error); peer.destroy(); this.peer = null;
        if ((error as any)?.type === 'unavailable-id') continue;
        throw lastError;
      }
      const id = `p-${token().slice(0, 12)}`;
      this.roomValue = { code: roomCode, myId: id, hostId: id, isHost: true, phase: 'lobby',
        config: { ...config }, players: [{ id, name: profile.name.trim(), color: profile.color, ready: false, connected: true }] };
      peer.on('connection', conn => this.acceptConnection(conn));
      peer.on('error', e => { if (!this.closing) this.fail(peerError(e).message); });
      peer.on('disconnected', () => { if (!this.closing && !peer.destroyed) try { peer.reconnect(); } catch {} });
      this.heartbeat = setInterval(() => this.pingGuests(), KEEPALIVE_MS);
      this.emitRoom();
      return;
    }
    throw lastError;
  }

  async join(roomCode: string, profile: Profile): Promise<void> {
    if (this.peer || this.roomValue) throw new Error('Você já está em uma sala.');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode) || !validProfile(profile)) throw new Error('Código da sala, nome ou cor inválidos.');
    this.closing = false;
    const peer = this.makePeer(); this.peer = peer;
    try { await this.whenOpen(peer); }
    catch (error) { peer.destroy(); this.peer = null; throw peerError(error); }
    peer.on('error', e => { if (!this.closing) this.fail(peerError(e).message); });
    peer.on('disconnected', () => { if (!this.closing && !peer.destroyed) try { peer.reconnect(); } catch {} });
    this.rejoinUntil = Date.now() + GRACE_MS;
    try { await this.connectGuest(roomCode, profile); }
    catch (error) { this.leave(); throw error; }
    this.heartbeat = setInterval(() => this.pingHost(), KEEPALIVE_MS);
  }

  private connectGuest(roomCode: string, profile: Profile): Promise<void> {
    const peer = this.peer;
    if (!peer || peer.destroyed) return Promise.reject(new Error('A conexão não está disponível.'));
    // PeerJS JSON channels reject messages above one SCTP chunk; binary channels chunk world baselines.
    const conn = peer.connect(`cap2-${roomCode}`, { serialization: 'binary', reliable: true, label: 'control-v2' });
    this.hostConn = conn;
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const pending = {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (error: Error) => { clearTimeout(timeout); reject(error); },
      };
      this.joining = pending;
      timeout = setTimeout(() => { if (this.joining === pending) { this.joining = null; pending.reject(new Error('A sala demorou a responder.')); conn.close(); } }, 10_000);
      conn.on('open', () => {
        const prior = sessionStorage.getItem(storageKey(roomCode));
        let resume: string | null = null;
        try { resume = prior ? JSON.parse(prior).token : null; } catch {}
        send(conn, packet('hello', { profile, resume }));
      });
      conn.on('data', raw => this.onGuestControl(conn, raw));
      conn.on('close', () => {
        if (this.joining === pending) { this.joining = null; pending.reject(new Error('A conexão com a sala foi encerrada.')); }
        if (!this.closing && this.hostConn === conn && this.roomValue) this.scheduleReconnect(roomCode, profile);
      });
      conn.on('error', e => { if (this.joining === pending) { this.joining = null; pending.reject(peerError(e)); } });
    });
  }

  private acceptConnection(conn: DataConnection) {
    if (!this.roomValue?.isHost) { conn.close(); return; }
    let identified = false;
    const timeout = setTimeout(() => { if (!identified) conn.close(); }, 5_000);
    conn.on('data', raw => {
      const message = parseWire(raw);
      if (!message) { conn.close(); return; }
      if (!identified) {
        if (message.t !== 'hello') { conn.close(); return; }
        identified = this.admit(conn, message);
        clearTimeout(timeout);
        return;
      }
      this.onHostControl(conn, message);
    });
    conn.on('close', () => { clearTimeout(timeout); this.guestDisconnected(conn); });
    conn.on('error', () => { clearTimeout(timeout); this.guestDisconnected(conn); });
  }

  private admit(conn: DataConnection, message: Record<string, unknown>): boolean {
    const room = this.roomValue;
    if (!room || !validProfile(message.profile)) { send(conn, packet('reject', { reason: 'Nome ou cor inválidos.' })); setTimeout(() => conn.close(), 100); return false; }
    const profile = message.profile;
    let guest = typeof message.resume === 'string' ? [...this.guests.values()].find(g => g.token === message.resume) : undefined;
    const resumed = !!guest;
    if (!guest) {
      if (room.players.length >= room.config.capacity || room.players.length >= MAX_PLAYERS) {
        send(conn, packet('reject', { reason: 'A sala está cheia.' })); setTimeout(() => conn.close(), 100); return false;
      }
      const id = `p-${token().slice(0, 12)}`;
      guest = { profile: { id, name: profile.name.trim(), color: profile.color, ready: false, connected: true }, token: token(),
        conn, game: null, expires: null, lastInput: -1, actions: new Set(), inputBudget: 0, actionBudget: 0,
        budgetAt: Date.now(), lastFrame: 0, lastResync: 0, channelId: null, gameReady: false, gameCompression: false };
      this.guests.set(id, guest);
      room.players.push(guest.profile);
    } else {
      if (guest.expires) clearTimeout(guest.expires);
      guest.expires = null;
      const oldConn = guest.conn, oldGame = guest.game;
      guest.conn = conn; guest.game = null; guest.gameReady = false; guest.gameCompression = false;
      oldGame?.close(); if (oldConn && oldConn !== conn) oldConn.close();
      guest.token = token();
      guest.lastInput = -1; guest.actions.clear();
      guest.inputBudget = guest.actionBudget = 0; guest.budgetAt = Date.now();
      guest.profile.connected = true;
    }
    this.callbacks.player({ ...guest.profile }, resumed ? 'reconnect' : 'join');
    send(conn, packet('welcome', { room, id: guest.profile.id, token: guest.token, resumed }));
    if (room.phase !== 'lobby' && this.matchId) send(conn, packet('start', { config: room.config, players: room.players, matchId: this.matchId }));
    this.sendBaseline(guest);
    this.setupGame(guest);
    this.broadcastRoom();
    return true;
  }

  private guestDisconnected(conn: DataConnection) {
    const room = this.roomValue;
    if (!room?.isHost || this.closing) return;
    const guest = [...this.guests.values()].find(g => g.conn === conn);
    if (!guest) return;
    guest.conn = null; guest.game?.close(); guest.game = null; guest.gameReady = false; guest.gameCompression = false; guest.profile.connected = false;
    this.callbacks.player({ ...guest.profile }, 'disconnect');
    this.broadcastRoom();
    guest.expires = setTimeout(() => {
      if (guest.conn || !this.roomValue) return;
      this.guests.delete(guest.profile.id);
      this.roomValue.players = this.roomValue.players.filter(p => p.id !== guest.profile.id);
      this.callbacks.player({ ...guest.profile }, 'expired');
      this.broadcastRoom();
    }, GRACE_MS);
  }

  private setupGame(guest: Guest) {
    const conn = guest.conn;
    const pc = conn?.peerConnection;
    if (!conn || !pc || !pc.sctp) return;
    const max = pc.sctp.maxChannels || 65535;
    const used = conn.dataChannel?.id;
    let id = 2;
    while (id < max && id === used) id += 2;
    if (id >= max) return;
    try {
      const dc = pc.createDataChannel('game-v2', { negotiated: true, id, ordered: false, maxRetransmits: 0 });
      guest.game = dc; guest.channelId = id; guest.gameReady = false; guest.gameCompression = false;
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => send(conn, packet('game-ready', { id }));
      dc.onmessage = event => { if (guest.conn === conn && guest.game === dc) this.onHostGame(guest, event.data); };
      dc.onclose = () => { if (guest.game === dc) { guest.game = null; guest.gameReady = false; } };
      send(conn, packet('channel', { id }));
    } catch { guest.game = null; guest.channelId = null; }
  }

  private onGuestControl(conn: DataConnection, raw: unknown) {
    if (conn !== this.hostConn) return;
    const m = parseWire(raw);
    if (!m) { conn.close(); return; }
    switch (m.t) {
      case 'reject': this.joining?.reject(new Error(String(m.reason || 'Não foi possível entrar na sala.'))); this.joining = null; conn.close(); break;
      case 'welcome': {
        if (!validRoom(m.room) || typeof m.id !== 'string' || typeof m.token !== 'string' || !/^[a-f0-9]{48}$/.test(m.token)) { conn.close(); return; }
        const r = m.room as RoomState;
        if (r.code !== conn.peer.slice(5) || !r.players.some(p => p.id === m.id)) { conn.close(); return; }
        this.roomValue = { ...r, myId: m.id, isHost: false };
        try { sessionStorage.setItem(storageKey(r.code), JSON.stringify({ token: m.token })); } catch {}
        if (m.resumed === true) { this.localInput = -1; this.localActions.clear(); }
        this.rejoinUntil = Date.now() + GRACE_MS;
        this.reconnecting = false;
        this.emitRoom(); this.joining?.resolve(); this.joining = null;
        break;
      }
      case 'room': if (this.roomValue && validRoom(m.room) && (m.room as RoomState).code === this.roomValue.code) {
        const r = m.room as RoomState;
        if (r.phase === 'lobby' && this.roomValue.phase !== 'lobby') { this.matchId = ''; this.lastTick = -1; this.worldData = null; this.gearData = null; this.localInput = -1; this.localActions.clear(); }
        this.roomValue = { ...r, myId: this.roomValue.myId, isHost: false }; this.emitRoom();
      } break;
      case 'start': if (this.roomValue && validConfig(m.config) && Array.isArray(m.players) &&
        m.players.length <= MAX_PLAYERS && m.players.every(validPlayer) && typeof m.matchId === 'string' && /^[a-f0-9]{48}$/.test(m.matchId)) {
        if (m.matchId !== this.matchId) { this.localInput = -1; this.localActions.clear(); this.worldData = null; this.gearData = null; }
        this.matchId = m.matchId; this.lastTick = -1; this.lastEventId = 0;
        this.callbacks.start(m.config, m.players as PlayerProfile[], m.matchId);
      } break;
      case 'base': if (Number.isSafeInteger(m.rev) && (m.rev as number) >= 0 && m.data && finiteTree(m.data)) {
        this.worldRev = m.rev as number; this.worldData = m.data as ReturnType<typeof worldPart>;
      } break;
      case 'gear': if (Number.isSafeInteger(m.rev) && (m.rev as number) >= 0 && Array.isArray(m.data) && finiteTree(m.data)) {
        this.gearRev = m.rev as number; this.gearData = m.data as ReturnType<typeof gearPart>;
      } break;
      case 'frame': this.receiveFrame(m); break;
      case 'events': if (m.matchId === this.matchId && Array.isArray(m.data) && m.data.length <= 200 && finiteTree(m.data)) {
        const fresh = (m.data as GameEvent[]).filter(e => e && Number.isSafeInteger(e.id) && e.id > this.lastEventId &&
          ['shot', 'damage', 'kill', 'pickup', 'reload', 'respawn', 'notice'].includes(e.type) && plainTextTree(e));
        if (fresh.length) { this.lastEventId = fresh[fresh.length - 1].id; this.callbacks.events(fresh); }
      } break;
      case 'channel': if (Number.isInteger(m.id)) this.setupGuestGame(conn, m.id as number); break;
      case 'game-ready': if (m.id === this.hostGame?.id) this.hostGameReady = true; break;
      case 'pong': if (Number.isFinite(m.at)) this.pingValue = Math.max(0, Date.now() - (m.at as number)); break;
      case 'ping': if (Number.isFinite(m.at)) send(conn, packet('pong', { at: m.at })); break;
      case 'closed': this.finish(String(m.reason || 'O anfitrião fechou a sala.')); break;
    }
  }

  private setupGuestGame(conn: DataConnection, id: number) {
    const pc = conn.peerConnection;
    if (!pc?.sctp || id < 0 || id >= (pc.sctp.maxChannels || 65535) || id === conn.dataChannel?.id) return;
    try {
      this.hostGame?.close();
      const dc = pc.createDataChannel('game-v2', { negotiated: true, id, ordered: false, maxRetransmits: 0 });
      this.hostGame = dc; this.hostGameReady = false;
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => send(conn, packet('game-ready', { id, compression: typeof DecompressionStream === 'function' }));
      dc.onmessage = event => { void decodeFastFrame(event.data).then(m => {
        if (this.hostConn === conn && this.hostGame === dc && m) this.receiveFrame(m);
      }); };
      dc.onclose = () => { if (this.hostGame === dc) { this.hostGame = null; this.hostGameReady = false; } };
    } catch { this.hostGame = null; }
  }

  private receiveFrame(m: Record<string, unknown>) {
    if (!this.worldData || !this.gearData || m.wr !== this.worldRev || m.gr !== this.gearRev || !m.data) {
      if (Date.now() - this.lastResync > 1000) { send(this.hostConn, packet('resync')); this.lastResync = Date.now(); }
      return;
    }
    const f = m.data as ReturnType<typeof fastPart>;
    if (f.matchId !== this.matchId && this.matchId) return;
    if (!Number.isSafeInteger(f.tick) || f.tick <= this.lastTick || f.tick < 0) return;
    const snapshot = rebuildFrame(f, this.worldData, this.gearData);
    if (!snapshot || snapshot.protocol !== PROTOCOL_VERSION || snapshot.world !== WORLD_VERSION) return;
    this.lastTick = f.tick; this.matchId = f.matchId;
    this.callbacks.snapshot(snapshot);
  }

  private onHostControl(conn: DataConnection, m: Record<string, unknown>) {
    const guest = [...this.guests.values()].find(g => g.conn === conn);
    if (!guest || !this.roomValue) return;
    switch (m.t) {
      case 'ready': if (this.roomValue.phase === 'lobby' && typeof m.value === 'boolean') { guest.profile.ready = m.value; this.broadcastRoom(); } break;
      case 'input': this.acceptInput(guest, m); break;
      case 'action': this.acceptAction(guest, m); break;
      case 'resync': if (Date.now() - guest.lastResync > 1000) { guest.lastResync = Date.now(); this.sendBaseline(guest); } break;
      case 'ping': if (Number.isFinite(m.at)) send(conn, packet('pong', { at: m.at })); break;
      case 'pong': if (Number.isFinite(m.at)) this.pingValue = Math.max(0, Date.now() - (m.at as number)); break;
      case 'game-ready': if (m.id === guest.channelId) { guest.gameReady = true; guest.gameCompression = m.compression === true; } break;
    }
  }
  private onHostGame(guest: Guest, raw: unknown) { const m = parseWire(raw, MAX_FRAME_BYTES); if (m?.t === 'input') this.acceptInput(guest, m); }
  private budget(guest: Guest, action: boolean): boolean {
    const now = Date.now();
    if (now - guest.budgetAt >= 1000) { guest.budgetAt = now; guest.inputBudget = guest.actionBudget = 0; }
    return action ? ++guest.actionBudget <= ACTIONS_PER_SECOND : ++guest.inputBudget <= INPUTS_PER_SECOND;
  }
  private acceptInput(guest: Guest, m: Record<string, unknown>) {
    if (m.matchId !== this.matchId || !validInput(m.data) || !this.budget(guest, false) || m.data.seq <= guest.lastInput) return;
    guest.lastInput = m.data.seq; this.callbacks.input(guest.profile.id, m.data);
  }
  private acceptAction(guest: Guest, m: Record<string, unknown>) {
    if (m.matchId !== this.matchId || !validAction(m.data) || !this.budget(guest, true) || guest.actions.has(m.data.id)) return;
    guest.actions.add(m.data.id);
    if (guest.actions.size > 512) guest.actions.delete(guest.actions.values().next().value!);
    this.callbacks.action(guest.profile.id, m.data);
  }

  ready(value: boolean) {
    if (!this.roomValue || this.roomValue.phase !== 'lobby') return;
    if (this.roomValue.isHost) { this.roomValue.players[0].ready = value; this.broadcastRoom(); }
    else send(this.hostConn, packet('ready', { value }));
  }
  configure(config: RoomConfig) {
    const room = this.roomValue;
    if (!room?.isHost || room.phase !== 'lobby' || !validConfig(config) || config.capacity < room.players.length) return;
    room.config = { ...config }; this.broadcastRoom();
  }
  start() {
    const room = this.roomValue;
    if (!room?.isHost || room.phase !== 'lobby' || !room.players.every(p => p.connected && p.ready)) return;
    if (room.players.length < 2 && !room.config.bots) { this.fail('Ative os bots ou espere outro jogador.'); return; }
    this.matchId = token(); this.lastTick = -1; this.lastEventId = 0; this.localInput = -1; this.localActions.clear();
    for (const guest of this.guests.values()) { guest.actions.clear(); guest.lastInput = -1; }
    room.phase = 'countdown';
    for (const guest of this.guests.values()) send(guest.conn, packet('start', { config: room.config, players: room.players, matchId: this.matchId }));
    this.broadcastRoom();
    this.callbacks.start(room.config, room.players.map(p => ({ ...p })), this.matchId);
  }
  sendInput(input: InputFrame) {
    const room = this.roomValue;
    if (!room || !this.matchId || !validInput(input) || input.seq <= this.localInput) return;
    this.localInput = input.seq;
    if (room.isHost) this.callbacks.input(room.myId, input);
    else {
      const m = packet('input', { matchId: this.matchId, data: input });
      if (this.hostGameReady && this.hostGame?.readyState === 'open' && this.hostGame.bufferedAmount < 32_000) this.hostGame.send(JSON.stringify(m));
      else send(this.hostConn, m);
    }
  }
  sendAction(action: PlayerAction) {
    const room = this.roomValue;
    if (!room || !this.matchId || !validAction(action) || this.localActions.has(action.id)) return;
    this.localActions.add(action.id);
    if (this.localActions.size > 512) this.localActions.delete(this.localActions.values().next().value!);
    if (room.isHost) this.callbacks.action(room.myId, action);
    else send(this.hostConn, packet('action', { matchId: this.matchId, data: action }));
  }
  publish(snapshot: WorldSnapshot, events: GameEvent[]) {
    const room = this.roomValue;
    if (!room?.isHost || snapshot.protocol !== PROTOCOL_VERSION || snapshot.world !== WORLD_VERSION ||
      snapshot.matchId !== this.matchId || !finiteTree(snapshot) || !Array.isArray(events) || !finiteTree(events)) return;
    this.current = snapshot;
    if (room.phase !== snapshot.phase) { room.phase = snapshot.phase; this.broadcastRoom(); }
    const world = worldPart(snapshot), gear = gearPart(snapshot);
    const wj = JSON.stringify(world), gj = JSON.stringify(gear);
    if (wj !== this.worldJson) { this.worldData = world; this.worldJson = wj; this.worldRev++; for (const g of this.guests.values()) send(g.conn, packet('base', { rev: this.worldRev, data: world })); }
    if (gj !== this.gearJson) { this.gearData = gear; this.gearJson = gj; this.gearRev++; for (const g of this.guests.values()) send(g.conn, packet('gear', { rev: this.gearRev, data: gear })); }
    const frame = packet('frame', { wr: this.worldRev, gr: this.gearRev, data: fastPart(snapshot) });
    const wire = JSON.stringify(frame);
    if (new TextEncoder().encode(wire).byteLength <= MAX_FRAME_BYTES) {
      const compressedTargets: { guest: Guest; conn: DataConnection; game: RTCDataChannel }[] = [];
      for (const g of this.guests.values()) {
        if (!g.conn?.open) continue;
        if (g.gameReady && g.game?.readyState === 'open') {
          if (g.game.bufferedAmount >= 64_000) continue;
          if (g.gameCompression && typeof CompressionStream === 'function')
            compressedTargets.push({ guest: g, conn: g.conn, game: g.game });
          else g.game.send(wire);
        } else if (Date.now() - g.lastFrame > 150) { send(g.conn, frame); g.lastFrame = Date.now(); }
      }
      if (compressedTargets.length) {
        const matchId = snapshot.matchId, tick = snapshot.tick;
        void encodeFastFrame(wire).then(encoded => {
          if (!encoded || !this.roomValue?.isHost || this.matchId !== matchId || this.current?.matchId !== matchId ||
            (this.lastCompressedFrame?.matchId === matchId && tick <= this.lastCompressedFrame.tick)) return;
          this.lastCompressedFrame = { matchId, tick };
          const payload = typeof encoded === 'string' ? null : encoded.buffer as ArrayBuffer;
          for (const { guest, conn, game } of compressedTargets) {
            if (guest.conn === conn && guest.game === game && guest.gameReady && game.readyState === 'open' &&
              game.bufferedAmount < 64_000) {
              try {
                if (typeof encoded === 'string') game.send(encoded);
                else game.send(payload!);
              } catch {}
            }
          }
        });
      }
    }
    for (let offset = 0; offset < events.length; offset += 200) {
      const e = packet('events', { matchId: this.matchId, data: events.slice(offset, offset + 200) });
      for (const g of this.guests.values()) send(g.conn, e);
    }
  }
  private sendBaseline(guest: Guest) {
    if (!this.current) return;
    const world = this.worldData || worldPart(this.current), gear = this.gearData || gearPart(this.current);
    send(guest.conn, packet('base', { rev: this.worldRev, data: world }));
    send(guest.conn, packet('gear', { rev: this.gearRev, data: gear }));
    send(guest.conn, packet('frame', { wr: this.worldRev, gr: this.gearRev, data: fastPart(this.current) }));
  }
  resetLobby() {
    const room = this.roomValue;
    if (!room?.isHost || room.phase === 'lobby') return;
    room.phase = 'lobby'; this.current = null; this.matchId = ''; this.lastEventId = 0; this.worldData = null; this.gearData = null;
    this.worldJson = this.gearJson = ''; this.worldRev = this.gearRev = 0; this.localInput = -1; this.localActions.clear();
    this.lastCompressedFrame = null;
    room.players.forEach(p => p.ready = false); this.broadcastRoom();
  }
  private broadcastRoom() {
    const room = this.roomValue;
    if (!room) return;
    this.emitRoom();
    for (const g of this.guests.values()) send(g.conn, packet('room', { room }));
  }
  private pingGuests() { for (const g of this.guests.values()) if (g.conn?.open) send(g.conn, packet('ping', { at: Date.now() })); }
  private pingHost() { if (this.hostConn?.open) send(this.hostConn, packet('ping', { at: Date.now() })); }
  private scheduleReconnect(code: string, profile: Profile) {
    this.hostGame?.close(); this.hostGame = null; this.hostGameReady = false;
    if (this.retryTimer || this.closing) return;
    if (!this.reconnecting) { this.reconnecting = true; this.rejoinUntil = Date.now() + GRACE_MS; }
    const attempt = async () => {
      this.retryTimer = null;
      if (this.closing || Date.now() > this.rejoinUntil) { this.finish('A conexão com o anfitrião foi perdida.'); return; }
      try {
        if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
          this.peer?.destroy(); this.peer = this.makePeer(); await this.whenOpen(this.peer);
        }
        await this.connectGuest(code, profile);
      } catch { if (!this.closing) this.retryTimer = setTimeout(attempt, 1000); }
    };
    this.retryTimer = setTimeout(attempt, 500);
  }
  private finish(reason: string) { this.leave(); this.callbacks.closed(reason); }
  leave() {
    if (this.closing) return;
    this.closing = true;
    const room = this.roomValue;
    const peers = [...this.guests.values()];
    if (room?.isHost) for (const g of peers) send(g.conn, packet('closed', { reason: 'O anfitrião fechou a sala.' }));
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.joining) { this.joining.reject(new Error('Você saiu da sala.')); this.joining = null; }
    for (const g of peers) if (g.expires) clearTimeout(g.expires);
    const ownPeer = this.peer, ownConn = this.hostConn, ownGame = this.hostGame;
    const closeConnections = () => {
      for (const g of peers) { g.game?.close(); g.conn?.close(); }
      ownGame?.close(); ownConn?.close(); ownPeer?.destroy();
    };
    if (room?.isHost) setTimeout(closeConnections, 250);
    else closeConnections();
    this.guests.clear();
    this.peer = null; this.hostConn = null; this.hostGame = null; this.roomValue = null;
    this.current = null; this.matchId = ''; this.localInput = -1; this.localActions.clear();
    this.callbacks.room(null);
  }
}
