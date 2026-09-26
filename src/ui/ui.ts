import type { ConnectionStatus } from '../network/session';
import { DEFAULT_CONFIG, PLAYER_COLORS, type ActorState, type ConsumableId, type GameEvent, type MatchResult, type Mode, type RoomConfig, type RoomState, type Settings, type WeaponId, type WorldSnapshot, type WorldSpec } from '../shared/types';
import { clamp } from '../shared/math';
import { rarityOf } from '../shared/rarity';
import { ARENA } from '../shared/layout';
import { terrainHeight } from '../shared/terrain';
import { boundaryFeedback } from '../shared/bounds';
import { WEAPONS } from '../shared/weapons';
import { DEFAULT_BINDINGS, adaptNote } from '../settings';
import { CONSUMABLE_ICONS, HUD_ART, capybara, escapeHtml as esc, icon, uiArt, weaponIcon } from './icons';
import { accuracyText, BINDING_GROUPS, BINDING_LABELS, bindingOf, captureMousePress, CONSUMABLE_ACTIONS, isBindableCode, keyLabel, remapBinding, unboundActions, cleanLabel, coverImageSet, startButtonState, DEATH_CARD_SECONDS, ELIMINATED_ACTIONS, killCardParts, RESULTS_ACTIONS_DELAY, formatSurvived, hudNarrow, hudScale, leaveNeedsConfirm, loadingLabel, nextProgress, ordinal, tipBag } from './hud-logic';
import { fillTip, tipCategory, TIPS } from './tips';
import { CrosshairSpread } from './crosshair';

export interface UICallbacks {
  host(profile: Profile, config: RoomConfig): Promise<void>; join(profile: Profile, code: string): Promise<void>;
  practice(config: RoomConfig, profile: Profile): void; ready(ready: boolean): void; start(): void;
  leave(): void; rematch(): void; resume(): void; spectate(): void;
  settings(settings: Settings): void; profile(profile: Profile): void;
}
type Profile = { name: string; color: string };
export const modeName = (mode: Mode) => mode === 'battle-royale' ? 'ÚLTIMA DE PÉ' : 'CORRERIA';
const clock = (seconds: number) => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const keyName = (code: string) => keyLabel(code);
// Tiny HUD key chips show a dash for an unbound action (Settings spells out 'Sem tecla').
const chipKey = (code: string) => code ? keyLabel(code) : '–';
// HUD facts mirrored from the simulation: six storm phases, and the plane drops a human after 12 s.
const STORM_PHASES = 6, PLANE_AUTO_DROP = 12;
// Minimap zoom (metres shown across the corner map) and island texture resolution (pixels per metre).
const MINIMAP_SPAN = 84, MAP_PPM = 4;
const CONSUMABLES: ConsumableId[] = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'];
const USE_LABEL: Record<ConsumableId, string> = { bandage: 'Enfaixando…', medkit: 'Remendando…', guarana: 'Tomando guaraná…', acai: 'Tomando açaí…', rapadura: 'Mastigando rapadura…' };
const LOOT_LABEL: Record<string, string> = { ammo: 'munição', armor: 'colete', helmet: 'capacete', bandage: 'bandagem', medkit: 'kit médico', guarana: 'guaraná', acai: 'açaí', rapadura: 'rapadura' };
const DEATH_LINES = [(k: string) => `Virou comida de ${k}`, (k: string) => `${k} te mandou pro saco`, (k: string) => `Levou a pior contra ${k}`, (k: string) => `${k} não deixou nem o osso`];
const fireMode = (id: WeaponId) => id === 'machete' ? 'CORTE' : id === 'slingshot' ? 'PEDRA' : id === 'shotgun' ? 'BOMBA' : id === 'sniper' ? 'FERROLHO' : WEAPONS[id].automatic ? 'AUTO' : 'SEMI';
// Result stats the simulation may add (Brasa, M1); cards stay hidden until the fields exist.
type ResultStats = MatchResult & Partial<{ shots: number; hits: number; headshots: number; survived: number; chests: number }>;
const CROSSHAIR_COLORS: Record<Settings['crosshairColor'], string> = { white: '#ffffff', yellow: '#ffe14d', cyan: '#3fd8ff', magenta: '#ff4fd8' };
// Colour-blind palette swaps red/gold for magenta/cyan; the markers also differ by shape, never by colour alone.
const HIT_PALETTES: Record<Settings['hitPalette'], [string, string, string]> = { default: ['#ffffff', '#ffc23d', '#e5412d'], colorblind: ['#ffffff', '#3fd8ff', '#ff4fd8'] };
const ONBOARD_KEY = 'uc-onboarded';
const nextTip = tipBag(TIPS);
// Damage direction: a 40° arc on a 140 px ring around the crosshair.
const DAMAGE_ARC = '<svg viewBox="-160 -160 320 320" aria-hidden="true"><path d="M-47.9-131.6A140 140 0 0 1 47.9-131.6" fill="none" stroke="#16120e" stroke-width="16" stroke-linecap="round"/><path d="M-47.9-131.6A140 140 0 0 1 47.9-131.6" fill="none" stroke="#e5412d" stroke-width="9" stroke-linecap="round"/></svg>';

export class GameUI {
  screen: 'home' | 'lobby' | 'game' | 'results' = 'home';
  private root = document.querySelector<HTMLDivElement>('#app')!;
  private selectedMode: Mode = 'battle-royale';
  private room: RoomState | null = null;
  private snapshot: WorldSnapshot | null = null;
  private modal: HTMLDialogElement | null = null;
  private inventoryKey = '';
  private hudTime = 0;
  private mapBg = document.createElement('canvas');
  private lastResults = '';
  private toastTimer = 0;
  private lastBanner = '';
  private deathInfo: { place: number; line: string; card: string | null; until: number } | null = null;
  private lastHits = new Map<string, { actor: string; head: boolean }>();
  private useTrack: { item: ConsumableId; until: number; total: number } | null = null;
  private lastPrey: { name: string; color: string } | null = null;
  private thumbs: Map<WeaponId, string> | null = null;
  private readonly lifecycle = new AbortController();
  private mapOpen = false;
  private deathReleased = false;
  private tipTimer = 0;
  private planeDir: { x: number; z: number } | null = null;
  private lastPlane: { x: number; z: number } | null = null;
  private localId = '';
  private els = new Map<string, HTMLElement>();
  private scoreKey = '';
  private networkStatus = '';
  private latencies: Readonly<Record<string, number>> = {};
  setConnectionStatus(status: ConnectionStatus) {
    this.networkStatus = { idle: '', connecting: 'Conectando à sala', connected: 'Conectado', relay: 'Conectado por retransmissão', reconnecting: 'Reconectando à sala', closed: 'A sala fechou' }[status];
    const line = this.root.querySelector('#connection-status');
    if (line) line.textContent = this.networkStatus;
  }
  private loadProgress = 0;
  private tipIndexTimer = 0;
  private toastItems: { text: string; el: HTMLElement; timer: number; at: number }[] = [];
  private coach: { step: string; visibleAt: number | null; startPos: { x: number; z: number } | null } | null = null;
  private onboarded = false;
  private roomLoading: number | null = null;
  private pendingToasts: { message: string; error: boolean }[] = [];
  private readonly crosshairSpread = new CrosshairSpread();
  private uiAudio: AudioContext | null = null;
  private uiSoundAt = 0;
  constructor(private world: WorldSpec, private settings: Settings, private profile: Profile, private callbacks: UICallbacks) {
    try { this.onboarded = localStorage.getItem(ONBOARD_KEY) === '1'; } catch { this.onboarded = false; }
    this.applyHudPrefs(); window.addEventListener('resize', () => this.applyHudPrefs());
    window.addEventListener('pagehide', () => { this.lifecycle.abort(); void this.uiAudio?.close(); }, { once: true });
    // Quiet, original UI notes. Audio starts only on an intentional press and follows the sound settings.
    document.addEventListener('pointerover', event => {
      const button = (event.target as Element).closest('button');
      if (button && !button.contains(event.relatedTarget as Node | null) && !button.disabled) this.playUiSound(false);
    }, { signal: this.lifecycle.signal });
    document.addEventListener('click', event => {
      if ((event.target as Element).closest('button:not(:disabled)')) this.playUiSound(true);
    }, { signal: this.lifecycle.signal });
    this.drawMapBackground(); this.home();
    // The map binding (M by default) toggles the island map; it never touches pointer lock or movement input.
    document.addEventListener('keydown', event => {
      if (this.screen !== 'game' || event.repeat || event.target instanceof HTMLInputElement) return;
      if (event.code === bindingOf(this.settings.bindings, 'map')) { this.toggleMap(); if (this.coach?.step === 'storm') this.coachDone(); }
      else if (event.code === 'Escape' && this.mapOpen) this.toggleMap(false);
      else if (event.code === 'KeyH' && this.coach) this.finishOnboarding();
      else if ((event.code === 'ArrowRight' || event.code === 'ArrowLeft') && this.root.querySelector('#loadingOverlay')) this.showTip();
    });
    // The map may also sit on a mouse button (remap covers every action), so presses are matched the same way.
    document.addEventListener('mousedown', event => {
      if (this.screen === 'game' && `Mouse${event.button}` === bindingOf(this.settings.bindings, 'map')) { this.toggleMap(); if (this.coach?.step === 'storm') this.coachDone(); }
    });
    this.root.addEventListener('click', event => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-do],[data-mode]'); if (!element) return;
      if (element.dataset.mode) { this.selectedMode = element.dataset.mode as Mode; this.root.querySelectorAll<HTMLElement>('[data-mode]').forEach(c => { c.classList.toggle('selected', c.dataset.mode === this.selectedMode); c.setAttribute('aria-pressed', String(c.dataset.mode === this.selectedMode)); }); return; }
      switch (element.dataset.do) {
        case 'host': case 'join': this.roomModal(element.dataset.do); break;
        case 'practice': this.profile.name ||= 'Capivara'; this.callbacks.profile(this.profile); this.callbacks.practice({ ...DEFAULT_CONFIG, mode: this.selectedMode, bots: true }, this.profile); break;
        case 'settings': this.settingsModal(); break;
        case 'how': this.howModal(); break;
        case 'home': case 'leave': this.confirmLeave(); break;
        case 'ready': this.callbacks.ready(!this.room?.players.find(p => p.id === this.room?.myId)?.ready); break;
        case 'start': this.callbacks.start(); break;
        case 'copy': void this.copyInvite(); break;
        case 'resume': this.callbacks.resume(); break;
        case 'rematch': this.callbacks.rematch(); break;
        case 'spectate': this.callbacks.spectate(); break;
        case 'next-tip': this.showTip(); break;
        case 'skip-tutorial': this.finishOnboarding(); break;
      }
    });
  }
  private playUiSound(click: boolean) {
    const volume = this.settings.master * this.settings.effects, now = performance.now();
    if (!volume || document.hidden || (!click && (!this.uiAudio || now - this.uiSoundAt < 65))) return;
    try {
      if (!this.uiAudio) this.uiAudio = new AudioContext();
      const context = this.uiAudio;
      if (context.state === 'suspended') { if (!click) return; void context.resume(); }
      this.uiSoundAt = now;
      const tone = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
      tone.type = 'sine'; tone.frequency.setValueAtTime(click ? 740 : 520, at);
      tone.frequency.exponentialRampToValueAtTime(click ? 1100 : 660, at + .045);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume * (click ? .065 : .024), at + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .09);
      tone.connect(gain); gain.connect(context.destination); tone.start(at); tone.stop(at + .1);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    } catch { /* Unsupported or blocked audio never prevents a menu action. */ }
  }
  private header(back = false) {
    return `<header class="topbar"><button class="brand" data-do="home" aria-label="Tela inicial"><img src="./assets/favicon.svg" alt=""/><span>ÚLTIMA<br><b>CAPIVARA</b></span></button><nav>${back ? `<button class="nav-link" data-do="leave">${icon('back')} VOLTAR</button>` : '<span class="nav-link active">JOGAR</span><button class="nav-link" data-do="how">COMO JOGAR</button>'}<button class="icon-button" data-do="settings" aria-label="Configurações">${icon('settings')}</button></nav><div class="edition"><span class="live-dot"></span> EDIÇÃO ILHA <b>GRÁTIS</b></div></header>`;
  }
  home() {
    this.screen = 'home'; this.lastResults = ''; this.els.clear(); this.coach = null; document.body.dataset.screen = 'home';
    const mode = (m: Mode) => `${this.selectedMode === m ? ' selected' : ''}" aria-pressed="${this.selectedMode === m}`;
    this.root.innerHTML = `${this.header()}<div class="menu-motes" aria-hidden="true">${'<i></i>'.repeat(12)}</div>
      <main class="home-content"><section class="hero-copy"><p class="eyebrow"><span></span> A ILHA É NOSSA.</p>
      <h1>ÚLTIMA<br><em>CAPIVARA</em><span class="title-stamp">SÓ UMA<br>FICA DE PÉ.</span></h1><p class="hero-description">Sua turma. Uma ilha. Só uma fica de pé.<br>O resto é instinto de sobrevivência.</p>
      <div class="hero-actions"><button class="button primary warmup" data-do="practice">${icon('play')}<span>JOGAR AGORA<small>Treino com bots · sem esperar</small></span>${icon('arrow')}</button>
      <button class="button secondary" data-do="host">${icon('plus')} CRIAR SALA</button><button class="button secondary" data-do="join">${icon('users')} ENTRAR NA SALA</button></div>
      <div class="hero-facts"><span>${icon('users')} Até 16 amigos</span><i></i><span>${icon('globe')} No navegador</span><i></i><span>100% grátis</span></div></section>
      <section class="mode-section" aria-label="Escolha o modo"><div class="section-heading"><span>ESCOLHA SUA AVENTURA</span><small>02 MODOS DE JOGO</small></div><div class="mode-grid">
      <button class="mode-card royale${mode('battle-royale')}" data-mode="battle-royale"><div class="mode-art painted" style="--art:url(${uiArt('mode-royale')})"><span class="mode-index">01</span></div><div class="mode-copy"><span class="mode-tag">BATTLE ROYALE</span><h2>ÚLTIMA DE PÉ</h2><p>Uma ilha. Uma vida.<br>Sobreviva até o fim.</p><span class="mode-meta">${icon('users')} ATÉ 21 BICHOS <b class="selection-mark">${icon('check')}</b></span></div></button>
      <button class="mode-card deathmatch${mode('deathmatch')}" data-mode="deathmatch"><div class="mode-art painted" style="--art:url(${uiArt('mode-correria')})"><span class="mode-index">02</span></div><div class="mode-copy"><span class="mode-tag">COMBATE POR TEMPO</span><h2>CORRERIA</h2><p>Caiu? Volta pra disputa.<br>Mais eliminações, mais glória.</p><span class="mode-meta">${icon('clock')} 8 MINUTOS <b class="selection-mark">${icon('check')}</b></span></div></button>
      </div></section></main><footer class="home-footer"><span>${icon('leaf')} FEITO PARA JOGAR JUNTO.</span><span>ILHA DAS CAPIVARAS <i>22° S / 43° O</i></span><button data-do="how">CONTROLES ${icon('mouse')}</button></footer>`;
  }
  // Short <select>s become segmented toggles; the hidden select stays the source of truth for forms and listeners.
  private segmentize(root: HTMLElement) {
    root.querySelectorAll<HTMLSelectElement>('select:not(.seg-source)').forEach(select => {
      if (select.options.length > 4) return;
      const seg = document.createElement('div'); seg.className = 'seg';
      for (const option of Array.from(select.options)) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = (option.textContent || option.value).split(' · ')[0];
        button.classList.toggle('on', option.value === select.value); button.setAttribute('aria-pressed', String(option.value === select.value));
        button.addEventListener('click', () => { select.value = option.value; seg.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === button); b.setAttribute('aria-pressed', String(b === button)); }); select.dispatchEvent(new Event('change', { bubbles: true })); });
        seg.append(button);
      }
      select.classList.add('seg-source'); select.after(seg);
    });
  }
  private openModal(title: string, content: string) {
    this.closeModal(); const dialog = document.createElement('dialog'); dialog.className = 'modal';
    dialog.setAttribute('aria-labelledby', 'modal-title');
    dialog.innerHTML = `<div class="modal-heading"><div><p class="eyebrow">ÚLTIMA CAPIVARA</p><h2 id="modal-title">${title}</h2></div><button class="icon-button close-modal" aria-label="Fechar">${icon('close')}</button></div>${content}`;
    document.body.append(dialog); this.modal = dialog;
    requestAnimationFrame(() => this.segmentize(dialog));
    dialog.querySelector('.close-modal')!.addEventListener('click', () => this.closeModal());
    dialog.addEventListener('cancel', () => { this.modal = null; dialog.remove(); });
    dialog.showModal(); return dialog;
  }
  closeModal() { this.modal?.close(); this.modal?.remove(); this.modal = null; }
  private profileFields() {
    return `<div class="profile-editor"><div id="profile-avatar">${capybara(this.profile.color)}</div><div class="profile-inputs"><label for="nickname">COMO A TURMA TE CHAMA?</label><input id="nickname" name="nickname" maxlength="18" required placeholder="Seu apelido" autocomplete="nickname" value="${esc(this.profile.name)}"/><div class="color-picker" aria-label="Cor da capivara">${PLAYER_COLORS.map(color => `<button type="button" aria-label="Cor ${color}" data-color="${color}" style="--swatch:${color}" class="color-choice ${color === this.profile.color ? 'selected' : ''}"></button>`).join('')}</div></div></div>`;
  }
  roomModal(kind: 'host' | 'join', code = '') {
    const dialog = this.openModal(kind === 'host' ? 'A TURMA COMEÇA AQUI.' : 'SUA TURMA TE ESPERA.', `<form id="room-form">${this.profileFields()}${kind === 'host' ? `<div class="form-grid"><label>MODO<select name="mode"><option value="battle-royale" ${this.selectedMode === 'battle-royale' ? 'selected' : ''}>Última de pé · Battle royale</option><option value="deathmatch" ${this.selectedMode === 'deathmatch' ? 'selected' : ''}>Correria · Combate por tempo</option></select></label><label>VAGAS PARA AMIGOS<select name="capacity"><option>2</option><option>4</option><option selected>8</option><option>12</option><option>16</option></select></label><label>DURAÇÃO DA CORRERIA<select name="duration"><option value="300">5 minutos</option><option value="480" selected>8 minutos</option><option value="600">10 minutos</option></select></label><label>NÍVEL DOS BOTS<select name="difficulty"><option value="easy">Tranquilo</option><option value="normal" selected>Na medida</option><option value="hard">Sem dó</option></select></label></div><label class="check-row"><input type="checkbox" name="bots" checked/><span>Completar a turma com bots<small>21 bichos no battle royale; pelo menos 8 na Correria.</small></span></label><p class="form-note">${icon('info')} Quem cria a sala mantém esta aba aberta durante a partida.</p>` : `<label for="join-code">CÓDIGO DA SALA</label><input id="join-code" class="code-input" name="code" maxlength="6" minlength="6" required placeholder="ABC123" autocomplete="off" spellcheck="false" value="${esc(code)}"/><p class="form-note">${icon('link')} Peça o código ou o link para quem criou a sala.</p>`}<p class="form-error" role="alert"></p><button class="button primary full-width" type="submit">${kind === 'host' ? 'CRIAR MINHA SALA' : 'ENTRAR NA SALA'} ${icon('arrow')}</button></form>`);
    dialog.querySelectorAll<HTMLElement>('[data-color]').forEach(button => button.addEventListener('click', () => { this.profile.color = button.dataset.color!; dialog.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('selected', b === button)); dialog.querySelector('#profile-avatar')!.innerHTML = capybara(this.profile.color); }));
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(form);
      this.profile.name = String(data.get('nickname')).trim().slice(0, 18) || 'Capivara'; this.callbacks.profile(this.profile);
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!; button.disabled = true; button.textContent = 'Conectando à sala';
      form.querySelector('.form-error')!.textContent = '';
      try {
        if (kind === 'host') await this.callbacks.host({ ...this.profile }, { mode: data.get('mode') as Mode, capacity: Number(data.get('capacity')), duration: Number(data.get('duration')) as RoomConfig['duration'], difficulty: data.get('difficulty') as RoomConfig['difficulty'], bots: data.has('bots') });
        else await this.callbacks.join({ ...this.profile }, String(data.get('code')).trim().toUpperCase());
        this.closeModal();
      } catch (error) { form.querySelector('.form-error')!.textContent = error instanceof Error ? error.message : 'Não foi possível conectar. Tente novamente.'; button.disabled = false; button.textContent = 'TENTAR NOVAMENTE'; }
    });
  }
  setRoom(room: RoomState | null) { this.room = room; if (room) { this.localId = room.myId; if (room.phase === 'lobby') this.lobby(); } }
  private lobby() {
    const room = this.room!; this.screen = 'lobby'; this.els.clear(); document.body.dataset.screen = 'lobby';
    const me = room.players.find(p => p.id === room.myId), allReady = room.players.every(p => p.ready && p.connected);
    this.root.innerHTML = `${this.header(true)}<main class="lobby-content"><section class="lobby-intro"><p class="eyebrow">ENCONTRO MARCADO.</p><h1>SUA TURMA.<br><em>SUA ILHA.</em></h1><p>A melhor confusão começa com os amigos certos.</p><div class="invite-card"><div><span>CÓDIGO DA SALA</span><strong>${esc(room.code)}</strong></div><button class="button secondary" data-do="copy">${icon('link')} COPIAR LINK</button></div><div class="lobby-rules"><span>${icon(room.config.mode === 'battle-royale' ? 'crown' : 'bolt')} ${modeName(room.config.mode)}</span><p>${room.config.mode === 'battle-royale' ? 'Salte, encontre equipamento e fuja da tempestade. Só a última capivara de pé vence.' : `Você tem ${room.config.duration / 60} minutos. Elimine, reapareça e termine no topo.`}</p><small>${room.config.bots ? 'BOTS COMPLETAM A TURMA' : 'SOMENTE AMIGOS'} · ${room.config.capacity} VAGAS</small></div></section><section class="roster-panel"><div class="section-heading"><span>QUEM VAI PRA ILHA</span><small>${room.players.length}/${room.config.capacity}</small></div><div class="roster">${room.players.map(player => `<div class="player-row ${player.id === room.myId ? 'you' : ''}">${capybara(player.color)}<div><strong>${esc(player.name)} ${player.id === room.myId ? '<small>VOCÊ</small>' : ''}</strong><span>${player.id === room.hostId ? 'CRIADOR DA SALA' : 'NA TURMA'}</span></div><b class="ready-status ${player.ready && player.connected ? 'ready' : ''}">${!player.connected ? 'RECONECTANDO' : player.ready ? `${icon('check')} PRONTO` : 'PREPARANDO'}</b></div>`).join('')}${room.players.length < room.config.capacity ? `<div class="empty-seat">${icon('plus')} O próximo lugar pode ser do seu amigo.</div>` : ''}</div><div class="lobby-bottom"><button class="button ${me?.ready ? 'secondary' : 'primary'} full-width" data-do="ready">${icon('check')} ${me?.ready ? 'ESTOU PRONTO · CANCELAR' : 'ESTOU PRONTO'}</button>${room.isHost ? this.startButton(allReady) : '<p>Quem criou a sala começa quando a turma estiver pronta.</p>'}<small>${room.isHost ? 'Mantenha esta aba aberta enquanto a turma joga.' : 'Seu jogo está pronto. Só falta a turma.'}</small><p id="connection-status" role="status">${esc(this.networkStatus)}</p></div></section></main>`;
  }
  // Host start button: while the island warms up it is disabled, labelled and shows real progress (setRoomLoading).
  private startButton(allReady: boolean) {
    const state = startButtonState(allReady, this.roomLoading);
    const label = state.loading ? `<span class="rl-label">Carregando a ilha</span><span class="rl-bar" role="progressbar" aria-label="Carregando a ilha" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.pct}"><i style="width:${state.pct}%"></i></span>` : `${icon('play')} COMEÇAR PARTIDA`;
    return `<button class="button ${state.primary ? 'primary' : 'secondary'} full-width${state.loading ? ' room-loading' : ''}" data-do="start" ${state.disabled ? 'disabled' : ''} aria-busy="${state.loading}">${label}</button>`;
  }
  // Lobby warmup progress (Forja): a fraction shows the busy start button; null restores normal readiness.
  setRoomLoading(fraction: number | null) {
    const next = fraction === null ? null : nextProgress(this.roomLoading ?? 0, fraction);
    if (next === this.roomLoading) return;
    const wasLoading = this.roomLoading !== null; this.roomLoading = next;
    const button = this.screen === 'lobby' ? this.root.querySelector<HTMLButtonElement>('[data-do="start"]') : null;
    if (!button || !this.room) return;
    const bar = button.querySelector<HTMLElement>('.rl-bar');
    // Progress ticks update only the bar; entering or leaving the loading state rebuilds the button.
    if (next !== null && wasLoading && bar) { const pct = startButtonState(false, next).pct; bar.setAttribute('aria-valuenow', String(pct)); bar.querySelector('i')!.style.width = `${pct}%`; return; }
    button.outerHTML = this.startButton(this.room.players.every(p => p.ready && p.connected));
  }
  private async copyInvite() {
    if (!this.room) return; const url = new URL(location.href); url.search = ''; url.searchParams.set('sala', this.room.code); url.hash = '';
    try { await navigator.clipboard.writeText(url.href); this.toast('Link copiado. Chame a turma!'); }
    catch { this.openModal('CONVIDE SUA TURMA', `<label>LINK DA SALA<input readonly value="${esc(url.href)}"/></label><p>Copie o link acima ou compartilhe o código ${esc(this.room.code)}.</p>`); }
  }
  game(playerId: string) {
    this.lastBanner = ''; this.deathInfo = null; this.lastHits.clear(); this.useTrack = null; this.lastPrey = null; this.mapOpen = false; this.planeDir = null; this.lastPlane = null; this.deathReleased = false;
    if (!this.thumbs) void import('../render/thumbnails').then(m => this.lifecycle.signal.aborted ? new Map() : m.loadWeaponThumbnails(this.lifecycle.signal)).then(map => { if (!this.lifecycle.signal.aborted && map.size) { this.thumbs = map; this.inventoryKey = ''; } });
    this.localId = playerId; this.screen = 'game'; this.inventoryKey = ''; this.lastResults = ''; this.scoreKey = ''; this.els.clear(); document.body.dataset.screen = 'game';
    this.coach = this.onboarded || this.room ? null : { step: 'intro', visibleAt: null, startPos: null };
    const key = (code: string) => esc(keyName(code));
    this.root.innerHTML = `<div class="hud" id="hud"><div id="storm"></div><div id="vign"></div><div id="scope-overlay" class="scope-overlay" hidden><i></i><b></b><span>×</span></div>`
      + `<div id="topL" class="stk"><div class="cell">${icon('users')}<span class="k" id="hAliveK">Bichos na ilha</span><b id="hAlive">21</b></div><div class="cell">${icon('crosshair')}<span class="k">Presas</span><b id="hKills">0</b></div><div class="cell" id="hRankChip" hidden>${icon('crown')}<span class="k">Posição</span><b id="hRank">#1</b></div><div class="cell zone" id="hZoneChip">${icon('clock')}<span class="k" id="hZoneK">Tempestade em</span><b id="hZoneT">1:00</b><span class="dots" id="hDots" aria-hidden="true">${'<i></i>'.repeat(STORM_PHASES)}</span></div></div>`
      + `<div id="safe" class="stk" hidden>${HUD_ART.safeArrow}<span id="safeTxt"></span></div><div id="hOut" class="stk" hidden>Na tempestade! −<span id="hDps">1</span>/s</div>`
      + `<div id="mapWrap"><span class="tab" id="mapTab">Ilha</span><canvas id="minimap" width="480" height="480"></canvas><span class="net" id="hud-ping" hidden></span></div><div id="feed"></div><div id="bigmap" hidden><div class="frame"><span class="tab">Ilha inteira</span><canvas id="bigmapCanvas" width="1000" height="1000"></canvas><span class="hint"><kbd id="mapKey">${key(bindingOf(this.settings.bindings, 'map'))}</kbd> fecha o mapa</span></div></div>`
      + `<div id="banner" aria-hidden="true"></div><div id="spec" class="stk" hidden role="group" aria-label="Você foi eliminada"><div class="btns">${ELIMINATED_ACTIONS.map(a => `<button type="button" class="${a.primary ? 'go' : 'alt'}" data-do="${a.do}">${a.primary ? icon('eye') : icon('back')} ${a.label}</button>`).join('')}</div><span class="hint"><kbd>${key(this.settings.bindings.jump)}</kbd> troca de capivara enquanto assiste<span class="esc"> · <kbd>Esc</kbd> solta o mouse pra clicar</span></span></div><div id="dmQuit" class="stk" hidden><button type="button" data-do="leave">${icon('back')} Voltar ao menu</button><span><kbd>Esc</kbd> abre o menu</span></div><div id="dmgInd"></div><div id="nums"></div>`
      + `<div id="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div><svg id="rring" viewBox="0 0 64 64" hidden aria-hidden="true"><circle cx="32" cy="32" r="26" class="bg"/><circle cx="32" cy="32" r="26" class="fg" id="rringFg" pathLength="100"/></svg><div id="hitm"><i></i><i></i><i></i><i></i><b></b></div>`
      + `<div id="prompt" class="stk" hidden><kbd id="promptKey">${key(this.settings.bindings.interact)}</kbd><span class="pi" id="promptIcon"></span><span id="promptVerb">Pegar</span><b id="promptItem"></b></div><div id="reload" class="cbar" hidden><span id="reloadTxt">Recarregando</span></div><div id="use" class="cbar stk" hidden><span id="useTxt"></span><div class="bar"><div id="useBar"></div></div></div><div id="alt" hidden><b id="altTxt">0 m</b><span id="altHint"></span></div>`
      + `<div id="vitals" class="stk"><span id="prot" hidden>Protegida</span><span id="helm" hidden>${HUD_ART.helmet}<b id="helmTxt">0</b></span><div class="row arm">${HUD_ART.shield}<div class="bar seg"><i class="chip" id="armChip" style="width:0"></i><div id="armBar" style="width:0"></div></div><b id="armTxt">0</b></div><div class="row hp">${HUD_ART.heart}<div class="bar"><i class="chip" id="hpChip"></i><div id="hpBar"></div></div><b id="hpTxt">100</b></div></div>`
      + `<div id="stance" class="stk">${HUD_ART.stance}<b id="stanceTxt" hidden>Em pé</b></div>`
      + `<div id="wpnbox"><div id="ammoBox" class="stk"><div class="wrow"><span class="rar" id="wRar">Comum</span><span class="wname" id="wName">Pistola</span><span class="mode" id="wMode">SEMI</span></div><div class="ammo" id="ammo"><b id="aMag">0</b><span id="aRes"></span></div></div><div id="hotbar"></div></div>`
      + `<div id="consbar" hidden>${CONSUMABLES.map((id, i) => `<div class="cs" data-k="${id}" hidden><kbd>${esc(chipKey(bindingOf(this.settings.bindings, CONSUMABLE_ACTIONS[i])))}</kbd>${CONSUMABLE_ICONS[id]}<b>0</b></div>`).join('')}</div>`
      + `<div id="coach" class="stk" hidden><span class="ck">Primeira vez na ilha</span><p id="coachTxt"></p><span class="skip"><kbd>H</kbd> já sei jogar</span></div>`
      + `</div><div id="scoreboard" class="scoreboard" hidden></div><div id="pause-panel" class="pause-panel" hidden></div>`;
    this.applyHudPrefs();
  }
  update(snapshot: WorldSnapshot, playerId: string, ping: number, scoreboard: boolean, fps: number, interaction: { id: string; name: string } | null, latencies: Readonly<Record<string, number>> = {}) {
    this.latencies = latencies;
    this.snapshot = snapshot; this.localId = playerId;
    if (snapshot.phase === 'results') { if (this.lastResults !== snapshot.matchId) { this.lastResults = snapshot.matchId; if (this.screen !== 'game' || !this.root.querySelector('#hud')) this.game(playerId); this.victory(snapshot); } return; }
    if (this.screen !== 'game') this.game(playerId);
    const me = snapshot.actors.find(a => a.id === playerId); if (!me) return;
    const now = performance.now(); if (now - this.hudTime < 75) return; this.hudTime = now;
    const br = snapshot.config.mode === 'battle-royale', t = snapshot.time, zone = snapshot.zone, jump = keyName(this.settings.bindings.jump);
    const alive = snapshot.actors.filter(a => a.alive).length;
    this.text('hAliveK', br ? 'Bichos na ilha' : 'Na correria'); this.text('hAlive', br ? alive : snapshot.actors.length); this.text('hKills', me.kills);
    const zoneChip = this.el('hZoneChip'), finalStorm = zone.phase >= STORM_PHASES;
    this.toggle(zoneChip, 'time', !br);
    this.toggle(zoneChip, 'closing', br ? zone.shrinking || finalStorm : snapshot.remaining <= 30);
    this.text('hZoneK', br ? finalStorm ? 'Última tempestade' : zone.shrinking ? 'Tempestade avançando' : 'Tempestade em' : 'Tempo restante');
    this.text('hZoneT', br ? finalStorm ? '0:00' : clock(zone.timeLeft) : clock(snapshot.remaining));
    this.show('hDots', br);
    if (br) this.el('hDots').querySelectorAll('i').forEach((dot, i) => this.toggle(dot, 'on', i < Math.min(zone.phase + (zone.shrinking ? 1 : 0), STORM_PHASES)));
    this.show('hRankChip', !br); if (!br) this.text('hRank', `#${snapshot.actors.filter(a => a.kills > me.kills).length + 1}`);
    const outside = br && me.alive && me.stage === 'ground' && Math.hypot(me.pos.x - zone.x, me.pos.z - zone.z) > zone.radius;
    this.show('hOut', outside); if (outside) this.text('hDps', Math.round(zone.damage));
    this.toggle(this.el('storm'), 'on', outside);
    const safeDistance = Math.hypot(me.pos.x - zone.nextX, me.pos.z - zone.nextZ) - zone.nextRadius;
    const showSafe = br && me.alive && me.stage !== 'plane' && !finalStorm && safeDistance > 0 && snapshot.phase === 'playing';
    this.show('safe', showSafe);
    if (showSafe) { this.attr(this.el('safeArrow'), 'transform', `rotate(${(this.localAngle(me, zone.nextX, zone.nextZ) * 180 / Math.PI).toFixed(0)})`); this.text('safeTxt', `Refúgio a ${Math.round(safeDistance)} m`); }
    const nearest = this.world.districts.reduce((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) < Math.hypot(b.x - me.pos.x, b.z - me.pos.z) ? a : b);
    this.text('mapTab', me.stage === 'plane' ? 'Ilha' : nearest.name);
    // Only live information on the HUD: ping when online, FPS only when the player asked for it.
    const net = [this.networkStatus === 'Reconectando à sala' || this.networkStatus === 'Conectado por retransmissão' ? this.networkStatus : '', this.room && !this.room.isHost ? `${Math.round(ping)} ms` : '', this.settings.showFps ? `${Math.round(fps)} fps` : ''].filter(Boolean).join(' · ');
    this.show('hud-ping', !!net); if (net) this.text('hud-ping', net);
    const hp = Math.max(0, me.hp), vitals = this.el('vitals'), shielded = t < me.protectionUntil;
    // Each bar has a pale chip behind it that follows after a beat, so damage leaves a short trail.
    const hpWidth = `${hp.toFixed(0)}%`, armWidth = `${clamp(me.armor, 0, 100).toFixed(0)}%`;
    this.style(this.el('hpBar'), 'width', hpWidth); this.style(this.el('hpChip'), 'width', hpWidth);
    this.style(this.el('armBar'), 'width', armWidth); this.style(this.el('armChip'), 'width', armWidth);
    this.text('hpTxt', Math.ceil(hp)); this.text('armTxt', Math.ceil(me.armor));
    this.toggle(vitals, 'low', me.alive && hp < 30); this.toggle(vitals, 'boost', shielded); this.show('prot', shielded);
    this.show('helm', me.helmet > 0); if (me.helmet > 0) this.text('helmTxt', Math.ceil(me.helmet));
    this.toggle(this.el('vign'), 'low', me.alive && hp < 30);
    const weapon = me.weapons[me.slot], def = weapon ? WEAPONS[weapon.id] : null, rarity = rarityOf(weapon?.rarity);
    this.text('wName', def ? def.name : 'Desarmada'); this.text('wRar', rarity.name); this.style(this.el('ammoBox'), '--rc', rarity.color); this.show('wRar', !!weapon);
    this.text('wMode', weapon ? fireMode(weapon.id) : '–');
    const mag = this.el('aMag'), magText = String(!weapon || !def ? 0 : def.melee ? '∞' : weapon.ammo);
    // The magazine count ticks on every shot and reload; a weapon swap just changes the number.
    if (mag.textContent !== magText) { const tick = mag.dataset.slot === String(me.slot); mag.textContent = magText; mag.dataset.slot = String(me.slot); if (tick) this.restartAnimation(mag, 'tick'); } this.text('aRes', !weapon || !def || def.melee ? '' : `/ ${weapon.reserve}`);
    this.toggle(this.el('ammo'), 'low', !!weapon && !!def && !def.melee && weapon.ammo <= Math.ceil(def.magazine * .2));
    const inventoryKey = JSON.stringify([me.weapons.map(w => [w.id, w.rarity, w.ammo]), me.slot]);
    if (this.inventoryKey !== inventoryKey) {
      this.inventoryKey = inventoryKey;
      this.el('hotbar').innerHTML = [0, 1, 2, 3].map(i => { const w = me.weapons[i]; return `<div class="hs${i === me.slot ? ' on' : ''}${w ? '' : ' empty'}" style="--rc:${w ? rarityOf(w.rarity).color : '#fff4d6'}"><kbd>${esc(chipKey(bindingOf(this.settings.bindings, `slot${i + 1}`)))}</kbd>${w ? this.thumbs?.get(w.id) ? `<img src="${this.thumbs.get(w.id)}" alt="">` : weaponIcon(w.id) : ''}<i>${w ? WEAPONS[w.id].melee ? '∞' : w.ammo : ''}</i></div>`; }).join('');
    }
    // Consumables: only what you carry, each with its count; the slot key stays visible.
    let carried = 0;
    this.root.querySelectorAll<HTMLElement>('#consbar .cs').forEach(slot => {
      const id = slot.dataset.k as ConsumableId, count = me.consumables[id] || 0;
      this.textOf(slot.querySelector('b')!, count); if (slot.hidden !== count <= 0) slot.hidden = count <= 0; this.toggle(slot, 'use', me.using === id);
      if (count > 0) carried++;
    });
    this.show('consbar', carried > 0 && me.alive);
    const scoped = me.alive && me.ads && !me.sprint && me.reloadUntil <= t && ['sniper', 'dmr'].includes(weapon?.id || '');
    this.show('scope-overlay', scoped);
    const speed = Math.hypot(me.velocity.x, me.velocity.z), cross = this.el('cross');
    this.style(cross, '--g', `${this.crosshairGap(me, now).toFixed(1)}px`);
    this.style(cross, 'opacity', me.alive && me.stage === 'ground' && !scoped && !(me.sprint && speed > .5) ? '1' : '0');
    this.updatePrompt(me, interaction);
    // Reload: a ring fills around the crosshair, with a short label under it.
    const reloading = !!weapon && !!def && me.reloadUntil > t && me.alive; this.show('reload', reloading); this.show('rring', reloading);
    if (reloading) {
      this.text('reloadTxt', weapon.id === 'shotgun' ? 'Botando cartucho' : weapon.id === 'slingshot' ? 'Pegando pedra' : 'Enchendo o pente');
      this.attr(this.el('rringFg'), 'stroke-dasharray', `${(clamp(1 - (me.reloadUntil - t) / Math.max(.1, def.reload), 0, 1) * 100).toFixed(1)} 100`);
    }
    if (me.using && me.useUntil > t) {
      if (this.useTrack?.item !== me.using || this.useTrack.until !== me.useUntil) this.useTrack = { item: me.using, until: me.useUntil, total: Math.max(.1, me.useUntil - t) };
      this.text('useTxt', `${USE_LABEL[me.using]} ${(me.useUntil - t).toFixed(1).replace('.', ',')} s`); this.style(this.el('useBar'), 'width', `${(clamp(1 - (me.useUntil - t) / this.useTrack.total, 0, 1) * 100).toFixed(0)}%`);
    } else this.useTrack = null;
    this.show('use', !!this.useTrack);
    const air = me.alive && (me.stage === 'falling' || me.stage === 'parachute'); this.show('alt', air);
    if (air) { this.text('altTxt', `${Math.max(0, Math.round(me.pos.y - terrainHeight(me.pos.x, me.pos.z)))} m`); this.text('altHint', me.stage === 'falling' ? `${jump} abre o paraquedas` : 'WASD plana'); }
    this.attr(this.el('torso'), 'transform', `rotate(${(me.lean * 16).toFixed(0)} 30 56)`); this.attr(this.el('figure'), 'transform', `translate(0 ${me.crouch ? 15 : 0})`);
    // Posture chip: quiet when standing, labelled and highlighted when it matters.
    const stance = me.stage === 'plane' ? 'No avião' : me.stage === 'falling' ? 'Caindo' : me.stage === 'parachute' ? 'Paraquedas' : me.sprint && speed > .5 ? 'Correndo' : me.crouch ? 'Agachada' : Math.abs(me.lean) > .15 ? me.lean < 0 ? 'Espiando à esq.' : 'Espiando à dir.' : '';
    this.show('stanceTxt', !!stance); if (stance) this.text('stanceTxt', stance); this.toggle(this.el('stance'), 'active', !!stance);
    if (me.alive) this.deathInfo = null;
    let banner = '';
    if (snapshot.phase === 'countdown') banner = `${Math.ceil(snapshot.countdown)}<small>Prepare-se · a ilha já vai abrir</small>`;
    else if (!me.alive) {
      // During the death cam the card names the killer; afterwards BR shows the placement line, Correria the respawn timer.
      const info = this.deathInfo ||= { place: alive + 1, line: 'Fim da linha pra você', card: null, until: 0 }, carding = !!info.card && now < info.until;
      const detail = carding ? info.card! : br ? esc(info.line) : `Volta em ${Math.max(0, Math.ceil(me.respawnAt - t))} s`;
      banner = `${br ? `#${info.place}` : 'Caiu!'}<small class="${carding ? 'kc' : ''}">${detail}</small>`;
    }
    else if (me.stage === 'plane') { const left = Math.ceil(PLANE_AUTO_DROP - t); banner = `${esc(jump)} pra saltar<small>${left > 0 ? `salto automático em ${left} s` : 'saltando'}</small>`; }
    else if (me.stage === 'ground') {
      const boundary = boundaryFeedback(me.pos, this.world, snapshot.config.mode);
      if (boundary) banner = `${boundary.message}<small>Siga de volta para a área de jogo</small>`;
    }
    this.setBanner(banner);
    // Out for good: the player's own loadout and vitals leave the screen so the choice (watch or leave) is the focus.
    const out = !me.alive, hud = this.el('hud');
    // The moment the player is down (out of a battle royale, or waiting to respawn in Correria), every combat cue goes.
    if (out && !hud.classList.contains('out')) { this.el('dmgInd').replaceChildren(); this.el('nums').replaceChildren(); this.el('hitm').classList.remove('on'); }
    this.toggle(hud, 'out', out);
    const deadInRoyale = this.deadInRoyale(); this.show('spec', deadInRoyale); this.show('dmQuit', !me.alive && !br && snapshot.phase === 'playing');
    // Eliminated in battle royale: free the mouse once so the on-screen buttons can be clicked.
    if (deadInRoyale && !this.deathReleased) { this.deathReleased = true; this.el('pause-panel').hidden = true; if (document.pointerLockElement) document.exitPointerLock(); this.el('spec').querySelector<HTMLElement>('[data-do="spectate"]')?.focus({ preventScroll: true }); }
    this.toggle(this.el('spec'), 'locked', deadInRoyale && !!document.pointerLockElement);
    if (me.alive) this.deathReleased = false;
    const score = this.el('scoreboard'); this.show('scoreboard', scoreboard);
    if (scoreboard) {
      // Rebuild the table only when a row changes, never on every HUD tick.
      const key = snapshot.actors.map(a => `${a.id}:${a.kills}:${a.deaths}:${Math.round(a.damage)}:${a.alive ? 1 : 0}:${this.latencies[a.id] ?? ''}:${a.connected}`).join('|');
      if (key !== this.scoreKey) { this.scoreKey = key; score.innerHTML = `<div class="scoreboard-content"><p class="eyebrow">${modeName(snapshot.config.mode)}</p><h2>A TURMA NA ILHA</h2>${this.scoreTable(snapshot)}</div>`; }
    }
    const plane = snapshot.plane;
    if (this.lastPlane) { const dx = plane.x - this.lastPlane.x, dz = plane.z - this.lastPlane.z, len = Math.hypot(dx, dz); if (len > .05) this.planeDir = { x: dx / len, z: dz / len }; }
    this.lastPlane = { x: plane.x, z: plane.z };
    this.updateCoach(snapshot, me, interaction);
    this.drawMap(snapshot, me);
  }
  // Crosshair gap and tick fade come from Brasa's CrosshairSpread (authoritative cone, local shot heat, ADS fade).
  // The crosshair is not scaled by --ui: its gap is a real screen-space angle.
  private crosshairGap(me: ActorState, now: number): number {
    // #game is fixed to the viewport, so innerHeight equals its height without forcing a synchronous layout.
    const height = window.innerHeight;
    const gap = this.crosshairSpread.gap(me, this.settings, height, now);
    const opacity = String(this.crosshairSpread.ticksOpacity);
    this.el('cross').querySelectorAll<HTMLElement>('i:not(.d)').forEach(tick => this.style(tick, 'opacity', opacity));
    return gap;
  }
  // Interaction prompt: the item name takes its rarity colour, with a mini icon.
  private updatePrompt(me: ActorState, interaction: { id: string; name: string } | null) {
    const visible = !!interaction && me.alive && me.stage === 'ground'; this.show('prompt', visible);
    if (!visible || !interaction) return;
    const loot = this.snapshot?.loot.find(l => l.id === interaction.id), chest = !loot && interaction.name.startsWith('Abrir');
    const color = loot?.kind === 'weapon' ? rarityOf(loot.rarity).color : chest ? '#ffc23d' : '#fff4d6';
    const iconKey = loot ? `${loot.kind}:${loot.weapon || ''}` : chest ? 'chest' : 'none';
    const holder = this.el('promptIcon');
    if (holder.dataset.k !== iconKey) {
      holder.dataset.k = iconKey;
      holder.innerHTML = loot?.kind === 'weapon' ? weaponIcon(loot.weapon || 'pistol') : loot && loot.kind in CONSUMABLE_ICONS ? CONSUMABLE_ICONS[loot.kind as ConsumableId] : loot?.kind === 'armor' ? HUD_ART.shield : loot?.kind === 'helmet' ? HUD_ART.helmet : chest ? icon('box') : '';
    }
    this.text('promptVerb', chest ? 'Abrir' : 'Pegar'); this.text('promptItem', chest ? 'caixa de suprimentos' : interaction.name);
    this.style(this.el('prompt'), '--ic', color); this.text('promptKey', keyName(this.settings.bindings.interact));
  }
  private scoreTable(snapshot: WorldSnapshot) {
    const actors = [...snapshot.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return `<table class="score-table"><thead><tr><th>CAPIVARA</th><th>ELIM.</th><th>MORTES</th><th>DANO</th>${this.room ? '<th>Ping</th>' : ''}</tr></thead><tbody>${actors.map((a, i) => `<tr class="${a.id === this.localId ? 'you' : ''}"><td><span class="rank">${i + 1}</span><i style="background:${/^#[a-f0-9]{6}$/i.test(a.color) ? a.color : '#bd8956'}"></i>${esc(a.name)}${a.bot ? '<small>BOT</small>' : a.id === this.localId ? '<small>VOCÊ</small>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${Math.round(a.damage)}</td>${this.room ? `<td data-player-ping="${esc(a.id)}" style="font-variant-numeric:tabular-nums;white-space:nowrap">${a.bot ? 'Bot' : !a.connected ? 'Sem conexão' : this.latencies[a.id] === undefined ? 'A medir' : `${Math.round(this.latencies[a.id])} ms`}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  }
  // Results over the live island: a stamped placement, then stats, awards, the board and the next step.
  private victory(snapshot: WorldSnapshot) {
    const hud = this.el('hud'); hud.classList.add('ended'); this.el('pause-panel').hidden = true; this.el('scoreboard').hidden = true; this.coach = null; this.show('coach', false);
    const br = snapshot.config.mode === 'battle-royale', results = snapshot.results as ResultStats[], winners = results.filter(r => r.winner), won = winners.some(r => r.id === this.localId);
    const me = results.find(r => r.id === this.localId), place = me?.place ?? results.length, names = winners.map(w => esc(w.name)).join(' e ');
    const title = won ? br ? 'Última de pé!' : 'Dona da correria!' : br ? 'Não foi dessa vez' : winners.length ? `${names} ${winners.length > 1 ? 'levaram' : 'levou'}` : 'Ninguém levou';
    const sub = won ? br ? `Última capivara de pé entre ${results.length}` : `${winners.length > 1 ? 'Vitória dividida · ' : ''}${me?.kills ?? 0} presas` : `Você ficou em ${ordinal(place)} de ${results.length}`;
    const prey = this.lastPrey ? `<div class="vlast"><span class="pt">${capybara(this.lastPrey.color)}</span><span>Última presa: <b>${esc(this.lastPrey.name)}</b></span></div>` : '';
    const stat = (value: string | number, label: string) => `<div><b${typeof value === 'number' ? ` data-count="${value}"` : ''}>${value}</b><span>${label}</span></div>`;
    const stats = me ? [stat(me.kills, 'Eliminações'), stat(Math.round(me.damage), 'Dano'),
      me.shots !== undefined && me.hits !== undefined ? stat(accuracyText(me.hits, me.shots), 'Precisão') : '',
      me.headshots !== undefined ? stat(me.headshots, 'Na cachola') : '',
      me.survived !== undefined ? stat(formatSurvived(me.survived), 'Tempo vivo') : ''].join('') : '';
    // Awards only from simulation fields; a player gets at most two.
    const best = (field: keyof ResultStats) => { const top = Math.max(0, ...results.map(r => Number(r[field] ?? 0))); return top > 0 && Number(me?.[field] ?? 0) === top; };
    const awards = me ? ([['kills', 'Caçadora da ilha', 'mais eliminações'], ['damage', 'Mão pesada', 'mais dano'], ['headshots', 'Mira de ouro', 'mais tiros na cabeça'], ['chests', 'Rainha do baú', 'mais baús abertos'], ['survived', 'Sobrevivente', 'mais tempo viva']] as const)
      .filter(([field]) => me[field] !== undefined && best(field)).slice(0, 2).map(([field, name, why]) => `<span class="award"><img src="${uiArt(`award-${field}`)}" alt="" draggable="false"><b>${name}</b><small>${why}</small></span>`).join('') : '';
    const host = !!this.room?.isHost, guest = !!this.room && !host;
    const primary = guest ? `<span class="wait">${icon('clock')} Esperando quem criou a sala</span>` : `<button class="button primary" data-do="rematch">${icon(host ? 'users' : 'play')} ${host ? 'Reunir a turma' : 'Jogar de novo'}</button>`;
    const board = [...results].sort((x, y) => x.place - y.place || y.kills - x.kills), top = board.slice(0, 5);
    if (me && !top.includes(me)) top.push(me);
    const rows = top.map(r => `<tr class="${r.id === this.localId ? 'you' : ''}"><td><span class="rank">${r.place}</span><i style="background:${/^#[a-f0-9]{6}$/i.test(r.color) ? r.color : PLAYER_COLORS[0]}"></i>${esc(r.name)}${r.bot ? '<small>BOT</small>' : r.id === this.localId ? '<small>VOCÊ</small>' : ''}</td><td>${r.kills}</td><td>${Math.round(r.damage)}</td></tr>`).join('');
    const layer = document.createElement('div'); layer.id = 'victory'; layer.className = won ? 'won' : 'lost';
    layer.innerHTML = `<div class="vrays"></div><div class="vcard"><div class="vportrait">${capybara(me?.color ?? this.profile.color)}</div><div class="vnum">#${won ? 1 : place}</div><div class="vtitle">${title}</div><div class="vsub">${sub}</div>${prey}</div>`
      + `<div class="vpanel stk" id="vpanel" role="region" aria-label="Resultado da partida"><div class="vstats">${stats}</div>${awards ? `<div class="vawards">${awards}</div>` : ''}`
      + `<div class="vboard"><table class="score-table"><thead><tr><th>CAPIVARA</th><th>ELIM.</th><th>DANO</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `<div class="vactions">${primary}<button class="button secondary" data-do="leave">${icon('back')} Voltar ao menu</button></div></div>`
      + `<div id="confetti"></div><div id="flash"></div>`;
    hud.appendChild(layer);
    if (won && !this.reducedMotion()) {
      const confetti = layer.querySelector<HTMLElement>('#confetti')!, colors = [...PLAYER_COLORS];
      for (let i = 0; i < 70; i++) { const bit = document.createElement('i'); bit.style.left = `${Math.random() * 100}%`; bit.style.background = colors[i % colors.length]; bit.style.animationDuration = `${2.2 + Math.random() * 2}s`; bit.style.animationDelay = `${Math.random() * 1.6}s`; bit.style.rotate = `${Math.random() * 180}deg`; confetti.appendChild(bit); }
      layer.querySelector('#flash')!.classList.add('on');
    }
    // Quality bar: nothing may block input for more than 400 ms. The panel slides in under the stamp while it plays,
    // and its actions are focusable and clickable from 300 ms on.
    window.setTimeout(() => { const panel = layer.querySelector<HTMLElement>('#vpanel'); panel?.classList.add('show'); panel?.querySelector<HTMLElement>('.button')?.focus({ preventScroll: true }); if (panel && !this.reducedMotion()) this.countUp(panel); }, RESULTS_ACTIONS_DELAY);
  }
  // Paused mid-match: the first version's comic menu over the frozen island, with the quick settings inline.
  // Result stats count up from zero as the panel arrives and bounce when they land; the markup already holds the final values.
  private countUp(panel: HTMLElement) {
    const counters = [...panel.querySelectorAll<HTMLElement>('[data-count]')], start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700), eased = 1 - (1 - t) ** 3;
      counters.forEach(counter => this.textOf(counter, Math.round(Number(counter.dataset.count) * eased)));
      if (t < 1 && panel.isConnected) requestAnimationFrame(step); else counters.forEach(counter => counter.classList.add('done'));
    };
    requestAnimationFrame(step);
  }
  setPaused(paused: boolean) {
    if (this.screen !== 'game') return; const panel = this.el('pause-panel'); panel.hidden = !paused || this.deadInRoyale();
    if (panel.hidden) return;
    this.toggleMap(false);
    const snapshot = this.snapshot, online = !!this.room, alive = snapshot ? snapshot.actors.filter(a => a.alive).length : 0, b = this.settings.bindings;
    const keys = (...codes: string[]) => `<span class="keys">${codes.map(code => `<kbd class="kc">${esc(code)}</kbd>`).join('')}</span>`;
    panel.innerHTML = `<div class="mc"><div class="eyebrow stk">Partida em andamento${snapshot ? ` · ${alive} ${alive === 1 ? 'vivo' : 'vivos'}` : ''}${online && this.room ? ` · Sala ${esc(this.room.code)}` : ''}</div><h1>${online ? 'Menu' : 'Pausado'}</h1>${!online && adaptNote(this.settings) ? `<p class="adapt-note stk">${esc(adaptNote(this.settings))}</p>` : ''}`
      + `<button type="button" class="play" data-do="resume">Voltar pra ilha</button><div id="lockErr" role="status"></div>`
      + `<div class="quick stk"><span>${keys(keyName(b.forward), keyName(b.left), keyName(b.back), keyName(b.right))}andar</span><span>${keys(keyName(b.leanLeft), keyName(b.leanRight))}espiar</span><span>${keys(keyName(b.interact))}pegar</span><span>${keys(keyName(b.reload))}recarregar</span><span>${keys(...[1, 2, 3, 4].map(n => keyName(bindingOf(this.settings.bindings, `slot${n}`))), 'Roda')}armas</span><span>${keys(...CONSUMABLE_ACTIONS.map(a => keyName(bindingOf(this.settings.bindings, a))))}curas</span><span>${keys(keyName(bindingOf(this.settings.bindings, 'scoreboard')))}placar</span><span>${keys(keyName(bindingOf(this.settings.bindings, 'map')))}mapa</span></div>`
      + `<div class="set stk"><label><span>Sensibilidade <b data-out="sensitivity">${this.settings.sensitivity.toFixed(2)}</b></span><input type="range" data-quick="sensitivity" min="0.2" max="3" step="0.05" value="${this.settings.sensitivity}"></label>`
      + `<label><span>Campo de visão <b data-out="fov">${this.settings.fov}°</b></span><input type="range" data-quick="fov" min="60" max="105" step="1" value="${this.settings.fov}"></label></div>`
      + `<div class="mrow"><button type="button" class="alt" data-do="settings">Configurações</button><button type="button" class="alt" data-do="leave">Sair da partida</button></div></div>`;
    const show = (key: string, value: number) => { const out = panel.querySelector(`[data-out="${key}"]`); if (out) out.textContent = key === 'fov' ? `${value}°` : value.toFixed(2); };
    panel.querySelectorAll<HTMLInputElement>('[data-quick]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.quick as 'sensitivity' | 'fov'; this.settings[key] = Number(input.value); show(key, this.settings[key]); this.callbacks.settings(this.settings);
    }));
  }
  private confirmLeave() {
    if (this.screen === 'home') return;
    const me = this.snapshot?.actors.find(a => a.id === this.localId);
    const context = { screen: this.screen, host: !!this.room?.isHost, phase: this.snapshot?.phase, alive: me?.alive, royale: this.snapshot?.config.mode === 'battle-royale' };
    if (!leaveNeedsConfirm(this.screen === 'game' ? context : { screen: this.screen, host: !!this.room?.isHost })) { this.closeModal(); this.callbacks.leave(); return; }
    const dialog = this.openModal('ATÉ LOGO, CAPIVARA?', `<p>${this.room?.isHost ? 'Você criou esta sala. Ao sair, a partida termina para toda a turma.' : 'Você vai sair desta partida e voltar ao início.'}</p><div class="modal-actions"><button class="button secondary" id="stay">FICAR</button><button class="button primary" id="exit">SAIR DA PARTIDA</button></div>`);
    dialog.querySelector('#stay')!.addEventListener('click', () => this.closeModal()); dialog.querySelector('#exit')!.addEventListener('click', () => { this.closeModal(); this.callbacks.leave(); });
  }
  private settingsModal() {
    const labels = { sensitivity: 'Sensibilidade do mouse', fov: 'Campo de visão', master: 'Volume geral', effects: 'Efeitos e combate', ambience: 'Ambiente', music: 'Música' };
    const ranges = (keys: (keyof typeof labels)[]) => keys.map(key => `<label class="slider-label">${labels[key]} <output>${this.settings[key]}</output><input type="range" data-setting="${key}" min="${key === 'fov' ? 60 : key === 'sensitivity' ? .2 : 0}" max="${key === 'fov' ? 105 : key === 'sensitivity' ? 3 : 1}" step="${key === 'fov' ? 1 : .05}" value="${this.settings[key]}"/></label>`).join('');
    const dialog = this.openModal('DO SEU JEITO.', `<div class="settings-grid"><section><h3>MOUSE E IMAGEM</h3>${ranges(['sensitivity', 'fov'])}<label>Qualidade gráfica<select id="graphics"><option value="low">Leve</option><option value="medium">Equilibrada</option><option value="high">Caprichada</option></select></label><label>Limite de quadros<select id="frame-limit"><option value="60">60 FPS · Fluido</option><option value="30">30 FPS · Economia</option></select></label><label class="check-row"><input id="reduced-motion" type="checkbox" ${this.settings.reducedMotion ? 'checked' : ''}/> Reduzir movimento (câmera e interface)</label><label class="check-row"><input id="ads-toggle" type="checkbox" ${this.settings.adsToggle ? 'checked' : ''}/> Alternar mira com um clique</label><label class="check-row"><input id="adaptive" type="checkbox" ${this.settings.adaptive ? 'checked' : ''}/><span>Ajuste automático dos bots no treino<small>Como na v1: fica mais manso se você vem perdendo e mais bravo se vem ganhando.</small></span></label></section><section><h3>O SOM DA ILHA</h3>${ranges(['master', 'effects', 'ambience', 'music'])}</section><section><h3>INTERFACE E MIRA</h3><label class="slider-label">Tamanho da interface <output id="ui-scale-out">${Math.round(this.settings.uiScale * 100)}%</output><input type="range" id="ui-scale" min="80" max="120" step="5" value="${Math.round(this.settings.uiScale * 100)}"/></label><label>Cor da mira<select id="crosshair-color"><option value="white">Branca</option><option value="yellow">Amarela</option><option value="cyan">Ciano</option><option value="magenta">Magenta</option></select></label><label>Marcadores de acerto<select id="hit-palette"><option value="default">Padrão</option><option value="colorblind">Daltonismo</option></select></label><label class="check-row"><input id="show-fps" type="checkbox" ${this.settings.showFps ? 'checked' : ''}/> Mostrar FPS no mapa</label><button type="button" class="button secondary" id="replay-tutorial">${icon('info')} REVER O TUTORIAL</button></section></div><details class="bindings"${this.unboundCount() ? ' open' : ''}><summary>PERSONALIZAR TECLAS E MOUSE${this.unboundCount() ? ` · <span class="unbound-count">${this.unboundCount()} sem tecla</span>` : ''}</summary>${this.bindingGroups()}<p class="form-note binding-note" role="status">${this.unboundCount() ? `Algumas ações ficaram sem tecla. Clique nelas e escolha uma.` : 'Clique numa ação e aperte a nova tecla ou botão do mouse. <kbd>Esc</kbd> cancela.'}</p><button type="button" class="button secondary" id="reset-bindings">RESTAURAR PADRÃO</button></details><p class="form-note">As preferências ficam salvas neste navegador.</p><button class="button primary full-width" id="save-settings">TUDO CERTO ${icon('check')}</button>`);
    dialog.classList.add('settings-modal');
    dialog.querySelector<HTMLSelectElement>('#graphics')!.value = this.settings.graphics;
    dialog.querySelector<HTMLSelectElement>('#frame-limit')!.value = String(this.settings.frameLimit);
    dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => input.addEventListener('input', () => { const key = input.dataset.setting as keyof typeof labels; this.settings[key] = Number(input.value); input.parentElement!.querySelector('output')!.textContent = input.value; this.callbacks.settings(this.settings); }));
    dialog.querySelector('#graphics')!.addEventListener('change', event => { this.settings.graphics = (event.target as HTMLSelectElement).value as Settings['graphics']; this.callbacks.settings(this.settings); });
    dialog.querySelector('#frame-limit')!.addEventListener('change', event => { this.settings.frameLimit = Number((event.target as HTMLSelectElement).value) === 30 ? 30 : 60; this.callbacks.settings(this.settings); });
    dialog.querySelector('#reduced-motion')!.addEventListener('change', event => { this.settings.reducedMotion = (event.target as HTMLInputElement).checked; this.applyHudPrefs(); this.callbacks.settings(this.settings); });
    dialog.querySelector('#ads-toggle')!.addEventListener('change', event => { this.settings.adsToggle = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    dialog.querySelector<HTMLSelectElement>('#crosshair-color')!.value = this.settings.crosshairColor;
    dialog.querySelector<HTMLSelectElement>('#hit-palette')!.value = this.settings.hitPalette;
    const scale = dialog.querySelector<HTMLInputElement>('#ui-scale')!;
    scale.addEventListener('input', () => { this.settings.uiScale = Number(scale.value) / 100; dialog.querySelector('#ui-scale-out')!.textContent = `${scale.value}%`; this.applyHudPrefs(); this.callbacks.settings(this.settings); });
    dialog.querySelector('#crosshair-color')!.addEventListener('change', event => { this.settings.crosshairColor = (event.target as HTMLSelectElement).value as Settings['crosshairColor']; this.applyHudPrefs(); this.callbacks.settings(this.settings); });
    dialog.querySelector('#hit-palette')!.addEventListener('change', event => { this.settings.hitPalette = (event.target as HTMLSelectElement).value as Settings['hitPalette']; this.applyHudPrefs(); this.callbacks.settings(this.settings); });
    dialog.querySelector('#show-fps')!.addEventListener('change', event => { this.settings.showFps = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    dialog.querySelector('#replay-tutorial')!.addEventListener('click', event => {
      try { localStorage.removeItem(ONBOARD_KEY); } catch { /* Nothing stored. */ }
      this.onboarded = false; (event.currentTarget as HTMLButtonElement).textContent = 'TUTORIAL NA PRÓXIMA PARTIDA DE TREINO';
    });
    dialog.querySelector('#adaptive')!.addEventListener('change', event => { this.settings.adaptive = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    // Rebinding: keyboard or mouse button; Esc cancels; a code already in use swaps with the other action.
    const keyCapture = new AbortController(); dialog.addEventListener('close', () => keyCapture.abort());
    let stopCapture: (() => void) | null = null, swallowClick: HTMLButtonElement | null = null;
    const refresh = () => dialog.querySelectorAll<HTMLButtonElement>('[data-binding]').forEach(b => { const code = bindingOf(this.settings.bindings, b.dataset.binding!); b.textContent = keyName(code); b.classList.toggle('unbound', !code); b.classList.remove('capturing'); });
    const note = dialog.querySelector<HTMLElement>('.binding-note')!;
    dialog.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-binding]'); if (!button) return;
      // The left press that just bound this chip is followed by its click; that click must not reopen the capture.
      if (swallowClick === button) { swallowClick = null; return; }
      stopCapture?.(); refresh();
      const action = button.dataset.binding!;
      // The chip keeps its size (no layout shift); the status line says what to do.
      button.textContent = '?'; button.classList.add('capturing');
      note.textContent = `Aperte a nova tecla ou botão para ${BINDING_LABELS[action] ?? action}. Esc cancela.`;
      const finish = (code: string | null) => {
        stopCapture?.();
        if (code && isBindableCode(code)) {
          const before = this.settings.bindings, swapped = Object.keys(before).find(other => other !== action && before[other] === code);
          this.settings.bindings = remapBinding(before, action, code); this.callbacks.settings(this.settings);
          const left = swapped ? bindingOf(this.settings.bindings, swapped) : '';
          note.textContent = !swapped ? `${BINDING_LABELS[action]} agora é ${keyName(code)}.` : left ? `${BINDING_LABELS[action]} agora é ${keyName(code)}. ${BINDING_LABELS[swapped] ?? swapped} ficou com ${keyName(left)}.` : `${BINDING_LABELS[action]} agora é ${keyName(code)}. ${BINDING_LABELS[swapped] ?? swapped} ficou sem tecla.`;
        } else if (code) note.textContent = 'Essa tecla fica reservada. Escolha outra.';
        refresh(); this.refreshKeyHints();
      };
      const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); if (e.code === 'Escape') note.textContent = 'Troca cancelada.'; finish(e.code === 'Escape' ? null : e.code); };
      // The click that opened the capture must not bind the left button: mouse capture starts on the next press.
      // Only a press on the waiting chip binds; any other press cancels and still does its normal job (close, next row).
      const onMouse = (e: MouseEvent) => {
        const code = captureMousePress(button.contains(e.target as Node), e.button);
        if (!code) { stopCapture?.(); refresh(); note.textContent = 'Troca cancelada.'; return; }
        e.preventDefault(); e.stopPropagation(); if (e.button === 0) swallowClick = button; finish(code);
      };
      const opts = { capture: true, signal: keyCapture.signal };
      document.addEventListener('keydown', onKey, opts);
      const armMouse = window.setTimeout(() => document.addEventListener('mousedown', onMouse, opts), 0);
      stopCapture = () => { clearTimeout(armMouse); document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onMouse, true); stopCapture = null; };
    }, { signal: keyCapture.signal });
    // A binding press stops propagation, so this only sees later presses: a drag-off left no click to swallow.
    dialog.addEventListener('mousedown', () => { swallowClick = null; }, { capture: true, signal: keyCapture.signal });
    // Right-click binds Mouse2 on a chip, so chips never open the browser menu.
    dialog.addEventListener('contextmenu', event => { if ((event.target as HTMLElement).closest('[data-binding]')) event.preventDefault(); }, { signal: keyCapture.signal });
    dialog.querySelector('#reset-bindings')!.addEventListener('click', () => { stopCapture?.(); this.settings.bindings = { ...DEFAULT_BINDINGS }; this.callbacks.settings(this.settings); refresh(); this.refreshKeyHints(); note.textContent = 'Teclas de volta ao padrão.'; });
    dialog.querySelector('#save-settings')!.addEventListener('click', () => this.closeModal());
  }
  // After a remap mid-match, key chips on the HUD follow at once (the hotbar rebuilds on its next tick).
  private refreshKeyHints() {
    if (this.screen !== 'game') return;
    this.inventoryKey = '';
    this.root.querySelectorAll<HTMLElement>('#consbar .cs').forEach((slot, i) => this.textOf(slot.querySelector('kbd')!, chipKey(bindingOf(this.settings.bindings, CONSUMABLE_ACTIONS[i]))));
    const mapKey = this.root.querySelector('#mapKey'); if (mapKey) this.textOf(mapKey, keyName(bindingOf(this.settings.bindings, 'map')));
    this.text('promptKey', keyName(bindingOf(this.settings.bindings, 'interact')));
  }
  // Remap list grouped for scanning; only actions the input layer reads (DEFAULT_BINDINGS) are listed, extras go last.
  private unboundCount() { return unboundActions(this.settings.bindings, Object.keys(DEFAULT_BINDINGS)).length; }
  private bindingGroups() {
    const known = new Set(Object.keys(DEFAULT_BINDINGS)), listed = new Set(BINDING_GROUPS.flatMap(g => g.actions));
    const groups = [...BINDING_GROUPS.map(g => ({ title: g.title, actions: g.actions.filter(a => known.has(a)) })), { title: 'Outros', actions: [...known].filter(a => !listed.has(a)) }];
    return groups.filter(g => g.actions.length).map(g => `<h4 class="binding-group">${g.title}</h4><div class="binding-grid">${g.actions.map(key => `<label>${esc(BINDING_LABELS[key] ?? key)}<button type="button" class="key-binding${bindingOf(this.settings.bindings, key) ? '' : ' unbound'}" data-binding="${key}" aria-label="${esc(BINDING_LABELS[key] ?? key)}: ${bindingOf(this.settings.bindings, key) ? 'trocar tecla' : 'sem tecla, escolher uma'}">${esc(keyName(bindingOf(this.settings.bindings, key)))}</button></label>`).join('')}</div>`).join('');
  }
  // Controls reference from the live bindings, so the help never lies after a remap.
  private controlsList(): [string, string][] {
    const b = (a: string) => keyName(bindingOf(this.settings.bindings, a)), list = (...a: string[]) => a.map(b).join(' ');
    return [[list('forward', 'left', 'back', 'right'), 'MOVER'], ['MOUSE', 'OLHAR'], [`${b('fire')} / ${b('ads')}`, 'ATIRAR / MIRAR'], [b('jump'), 'PULAR / PARAQUEDAS'],
      [b('sprint'), 'CORRER'], [b('crouch'), 'AGACHAR'], [`${b('leanLeft')} / ${b('leanRight')}`, 'ESPIAR'], [b('interact'), 'PEGAR / ABRIR'], [b('reload'), 'RECARREGAR'],
      [list('slot1', 'slot2', 'slot3', 'slot4'), 'TROCAR ARMA'], [list(...CONSUMABLE_ACTIONS), 'USAR CURA'], [b('scoreboard'), 'PLACAR'], [b('map'), 'MAPA DA ILHA']];
  }
  private howModal() {
    this.openModal('INSTINTO DE SOBREVIVÊNCIA.', `<div class="how-grid"><div>${icon('users')}<h3>CHAME A TURMA</h3><p>Crie uma sala e compartilhe o link. Quem cria mantém o jogo aberto. Sem cadastro, sem instalação.</p></div><div>${icon('crown')}<h3>ÚLTIMA DE PÉ</h3><p>Salte do avião, abra baús e encontre armas. A tempestade fecha a ilha. Sobreviva até o fim.</p></div><div>${icon('bolt')}<h3>CORRERIA</h3><p>Mais eliminações vence. Você reaparece depois de cair, pronto para voltar à luta.</p></div></div><div class="controls-grid">${this.controlsList().map(([keys, text]) => `<span><kbd>${esc(keys)}</kbd> ${text}</span>`).join('')}</div>`);
  }
  event(event: GameEvent) {
    if (event.type === 'shot' && event.actor === this.localId) this.crosshairSpread.onShot(event.weapon, performance.now());
    if (event.type === 'notice') this.toast(event.text);
    if (this.screen !== 'game' || !this.root.querySelector('#hud')) return;
    const find = (id: string | null) => id ? this.snapshot?.actors.find(a => a.id === id) : undefined;
    if (event.type === 'damage') {
      this.lastHits.set(event.target, { actor: event.actor, head: event.head });
      if (event.actor === this.localId && event.target !== this.localId) {
        this.hitMarker(event.head ? 'head' : '');
        this.floater(String(Math.round(event.amount)), event.head ? 'num head' : 'num');
        if (event.head) this.floater('NA CACHOLA!', 'pop');
      }
      if (event.target === this.localId) {
        this.restartAnimation(this.el('vign'), 'hit');
        const me = find(this.localId), source = find(event.actor);
        if (me && source && source !== me) {
          const burst = document.createElement('div'); burst.className = 'di'; burst.innerHTML = DAMAGE_ARC;
          burst.style.transform = `rotate(${this.localAngle(me, source.pos.x, source.pos.z)}rad)`;
          this.el('dmgInd').appendChild(burst); window.setTimeout(() => burst.remove(), 1000);
        }
      }
    }
    if (event.type === 'kill') {
      const victim = find(event.target), killer = event.actor && event.actor !== event.target ? find(event.actor) : undefined;
      const hit = this.lastHits.get(event.target), mine = event.actor === this.localId && event.target !== this.localId, died = event.target === this.localId;
      const entry = document.createElement('div');
      entry.className = `fd${mine ? ' me' : died ? ' bad' : ''}`;
      const face = (actor: typeof victim) => `<span class="pt">${capybara(actor?.color)}</span>`, name = (actor: typeof victim) => `<b>${esc(actor?.name || 'Capivara')}</b>`;
      if (!killer || event.weapon === 'storm' || event.weapon === 'fall') entry.innerHTML = `${face(victim)}${name(victim)}<em>${event.weapon === 'fall' ? 'caiu feio' : 'levado pela tempestade'}</em>`;
      else {
        const distance = victim ? Math.round(Math.hypot(killer.pos.x - victim.pos.x, killer.pos.y - victim.pos.y, killer.pos.z - victim.pos.z)) : 0;
        entry.innerHTML = `${face(killer)}${name(killer)}<span class="wi">${weaponIcon(event.weapon)}</span><em>${distance} m${hit?.head && hit.actor === event.actor ? ' · na cachola' : ''}</em>${name(victim)}${face(victim)}`;
      }
      this.addFeed(entry);
      if (mine) { this.hitMarker('kill'); this.floater('POF!', 'pop kill'); if (victim) this.lastPrey = { name: victim.name, color: victim.color }; }
      if (died && this.snapshot) {
        const others = this.snapshot.actors.filter(a => a.alive && a.id !== this.localId).length;
        const byPlayer = !!killer && event.weapon !== 'storm' && event.weapon !== 'fall';
        const line = byPlayer ? DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)](killer!.name) : event.weapon === 'fall' ? 'O chão ganhou essa' : 'A tempestade te engoliu';
        // Kill card for the death cam: who, with what, from how far (the event's distance at the moment of the kill).
        const kill = event as typeof event & { distance?: number };
        const measured = kill.distance ?? (killer && victim ? Math.hypot(killer.pos.x - victim.pos.x, killer.pos.y - victim.pos.y, killer.pos.z - victim.pos.z) : null);
        const parts = byPlayer ? killCardParts(killer!.name, WEAPONS[event.weapon as WeaponId]?.name ?? null, measured) : null;
        const card = parts ? `<span class="kcard"><span class="pt">${capybara(killer!.color)}</span><b style="--kc:${/^#[0-9a-f]{6}$/i.test(killer!.color) ? killer!.color : PLAYER_COLORS[0]}">${esc(parts.killer)}</b> te pegou <i>·</i> <span class="wi">${weaponIcon(event.weapon as WeaponId)}</span>${esc(parts.weapon)}${parts.distance ? ` <i>·</i> ${parts.distance}` : ''}</span>` : null;
        this.deathInfo = { place: others + 1, line, card, until: performance.now() + DEATH_CARD_SECONDS * 1000 };
      }
      this.lastHits.delete(event.target);
    }
    if (event.type === 'pickup' && event.actor === this.localId) {
      if (this.coach?.step === 'loot') this.coachDone();
      const chest = event.item.startsWith('chest:') ? event.item.slice(6) as WeaponId : null, loot = this.snapshot?.loot.find(l => l.id === event.item);
      const weaponId = chest || (loot?.kind === 'weapon' ? loot.weapon || 'pistol' : null);
      const entry = document.createElement('div'); entry.className = 'fd info';
      if (weaponId && WEAPONS[weaponId]) entry.innerHTML = `Pegou ${esc(WEAPONS[weaponId].name)}${loot ? ` ${rarityOf(loot.rarity).name.toLowerCase()}` : ''}<em>${chest ? 'do baú' : ''}</em>`;
      else if (loot) entry.textContent = `Pegou ${LOOT_LABEL[loot.kind] || 'equipamento'}`;
      else return;
      this.addFeed(entry);
    }
  }
  private addFeed(entry: HTMLElement) {
    const feed = this.el('feed'); feed.prepend(entry); window.setTimeout(() => entry.remove(), 4200);
    while (feed.children.length > 6) feed.lastElementChild!.remove();
  }
  private setBanner(html: string) {
    if (html === this.lastBanner) return; this.lastBanner = html;
    // A hidden banner leaves the accessibility tree: cleared after its fade, aria-hidden right away.
    const banner = this.el('banner'); if (html) banner.innerHTML = html; banner.classList.toggle('on', !!html); banner.setAttribute('aria-hidden', String(!html));
    if (!html) window.setTimeout(() => { if (!this.lastBanner && banner.isConnected) banner.textContent = ''; }, 300);
  }
  private hitMarker(kind: '' | 'head' | 'kill') {
    const marker = this.el('hitm'); marker.classList.toggle('head', kind === 'head'); marker.classList.toggle('kill', kind === 'kill');
    this.restartAnimation(marker, 'on');
  }
  // Damage numbers and callouts float up next to the crosshair (the HUD has no camera to project world points).
  private floater(text: string, cls: string) {
    const layer = this.el('nums'), el = document.createElement('div'); el.className = cls; el.textContent = text;
    // Feedback stays right of the reticle, outside an ~8° aim cone (about 94 px at 1080p, FOV 78), stacked by kind
    // so a damage number, a headshot and a kill in the same moment never overlap each other or the target.
    const cone = Math.round(innerHeight / 1080 * 110);
    el.style.left = `calc(50% + ${cone + (cls.startsWith('pop') ? 0 : Math.round(Math.random() * 16))}px)`;
    el.style.top = `calc(50% - ${cls === 'pop kill' ? cone + 36 : cls.startsWith('pop') ? Math.round(cone * .45) : -Math.round(cone * .15)}px)`;
    el.style.rotate = `${(Math.random() * 8 - 4).toFixed(1)}deg`;
    layer.appendChild(el); window.setTimeout(() => el.remove(), 900);
    while (layer.children.length > 14) layer.firstElementChild!.remove();
  }
  private localAngle(me: ActorState, x: number, z: number) {
    const dx = x - me.pos.x, dz = z - me.pos.z;
    return Math.atan2(dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw), -dx * Math.sin(me.yaw) - dz * Math.cos(me.yaw));
  }
  // Toasts stack (at most two), drop duplicates that arrive together, and never cover the view with a red slab.
  toast(message: string, error = false) {
    if (error) { const line = this.root.querySelector('#lockErr'); if (line) line.textContent = message; }
    // Nothing is clickable during loading: hold messages until the island is on screen.
    if (this.root.querySelector('#loadingOverlay:not(.out)')) { if (!this.pendingToasts.some(t => t.message === message)) this.pendingToasts.push({ message, error }); return; }
    const host = document.querySelector<HTMLElement>('#toast')!, now = performance.now();
    if (this.toastItems.some(item => item.text === message && now - item.at < 1500)) return;
    const el = document.createElement('div'); el.className = `toast-item${error ? ' error' : ''}`; el.textContent = message;
    host.appendChild(el); requestAnimationFrame(() => el.classList.add('visible'));
    const item = { text: message, el, at: now, timer: window.setTimeout(() => this.dropToast(item), error ? 6000 : 3000) };
    this.toastItems.push(item);
    while (this.toastItems.length > 2) this.dropToast(this.toastItems[0]);
  }
  private dropToast(item: { el: HTMLElement; timer: number }) {
    clearTimeout(item.timer); this.toastItems = this.toastItems.filter(other => other !== item);
    item.el.classList.remove('visible'); window.setTimeout(() => item.el.remove(), 220);
  }
  // Cached lookups: the HUD markup is rebuilt only by game(), which clears the cache.
  private el(id: string) {
    let element = this.els.get(id);
    if (!element || !element.isConnected) { element = this.root.querySelector<HTMLElement>(`#${id}`)!; if (element) this.els.set(id, element); }
    return element;
  }
  private show(id: string, visible: boolean) { const element = this.el(id); if (element && element.hidden === visible) element.hidden = !visible; }
  private toggle(element: Element, cls: string, on: boolean) { if (element.classList.contains(cls) !== on) element.classList.toggle(cls, on); }
  private style(element: HTMLElement, prop: string, value: string) { if (element.style.getPropertyValue(prop) !== value) element.style.setProperty(prop, value); }
  private attr(element: Element | null, name: string, value: string) { if (element && element.getAttribute(name) !== value) element.setAttribute(name, value); }
  // Replays a CSS animation class without reading layout (the old offsetWidth trick forced a full layout mid-frame).
  private restartAnimation(element: HTMLElement, cls: string) {
    if (!element.classList.contains(cls)) { element.classList.add(cls); return; }
    const running = element.getAnimations();
    if (running.length) running.forEach(animation => { animation.cancel(); animation.play(); });
    else { element.classList.remove(cls); requestAnimationFrame(() => element.classList.add(cls)); }
  }
  private reducedMotion() { return this.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; }
  // Interface size and aim colours follow the settings; the HUD scales from its 1600x900 layout.
  applyHudPrefs() {
    // The cover follows the screen width (desktop vs small); both variants are tiny compared to the PNG master.
    const art = coverImageSet(innerWidth, devicePixelRatio || 1), root = document.documentElement.style;
    if (root.getPropertyValue('--cover') !== art.cover) { root.setProperty('--cover', art.cover); root.setProperty('--cover-blur', art.blur); }
    // Painted paper and wood textures, absolute against the document like the cover (non-root deploys).
    if (!root.getPropertyValue('--paper-tex')) { root.setProperty('--paper-tex', `url(${uiArt('paper-cream')})`); root.setProperty('--wood-tex', `url(${uiArt('wood-plank')})`); }
    const body = document.body.style, [hit, head, kill] = HIT_PALETTES[this.settings.hitPalette];
    const scale = hudScale(innerWidth, innerHeight, this.settings.uiScale);
    body.setProperty('--ui', String(scale)); body.setProperty('--hud-w', (innerWidth / scale).toFixed(0));
    document.body.classList.toggle('hud-narrow', hudNarrow(innerWidth, scale));
    body.setProperty('--xc', CROSSHAIR_COLORS[this.settings.crosshairColor]);
    body.setProperty('--hit', hit); body.setProperty('--hithead', head); body.setProperty('--hitkill', kill);
    document.body.classList.toggle('reduce-motion', this.settings.reducedMotion);
  }
  private text(id: string, value: string | number) { const element = this.el(id); if (element) this.textOf(element, value); }
  private textOf(element: Element, value: string | number) { if (element.textContent !== String(value)) element.textContent = String(value); }
  // Island texture for both maps, built from the world data (terrain height, colliders) at MAP_PPM pixels per metre.
  private drawMapBackground() {
    const size = this.world.size, px = Math.round(size * MAP_PPM), step = 2, ctx = this.mapBg.getContext('2d')!;
    this.mapBg.width = this.mapBg.height = px;
    for (let y = 0; y < px; y += step) for (let x = 0; x < px; x += step) {
      const h = terrainHeight((x / px - .5) * size, (y / px - .5) * size);
      ctx.fillStyle = h < -1.5 ? '#2b6b78' : h < 0 ? '#3f8c8f' : h < .7 ? '#d8c48a' : h > 7 ? '#8a9a63' : h > 3.5 ? '#6f9154' : '#5e8a4c'; ctx.fillRect(x, y, step, step);
    }
    ctx.fillStyle = '#efe2bd'; ctx.strokeStyle = '#16120e'; ctx.lineWidth = 1.5;
    for (const b of this.world.colliders) if (b.max.y - b.min.y > .6) {
      const x = (b.min.x / size + .5) * px, y = (b.min.z / size + .5) * px, w = Math.max(1.5, (b.max.x - b.min.x) * MAP_PPM), h = Math.max(1.5, (b.max.z - b.min.z) * MAP_PPM);
      ctx.fillRect(x, y, w, h); if (w > 6 && h > 6) ctx.strokeRect(x, y, w, h);
    }
    ctx.strokeStyle = 'rgba(22,18,14,.12)'; ctx.lineWidth = 1;
    for (let m = -size / 2; m <= size / 2; m += 20) { const v = (m / size + .5) * px; ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, px); ctx.moveTo(0, v); ctx.lineTo(px, v); ctx.stroke(); }
  }
  // Corner minimap: a north-up window around the player, like Fortnite. M opens the whole island.
  private drawMap(snapshot: WorldSnapshot, actor: ActorState) {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#minimap');
    if (canvas) this.drawMapView(canvas, snapshot, actor, actor.stage === 'plane' ? 160 : MINIMAP_SPAN, actor.pos.x, actor.pos.z, false);
    const big = this.root.querySelector<HTMLCanvasElement>('#bigmapCanvas');
    if (big && this.mapOpen) this.drawMapView(big, snapshot, actor, this.world.size, 0, 0, true);
  }
  private drawMapView(canvas: HTMLCanvasElement, snapshot: WorldSnapshot, actor: ActorState, span: number, cx: number, cz: number, full: boolean) {
    const ctx = canvas.getContext('2d')!, size = canvas.width, scale = size / span, half = this.world.size / 2, zone = snapshot.zone;
    const X = (x: number) => (x - cx) * scale + size / 2, Z = (z: number) => (z - cz) * scale + size / 2;
    ctx.fillStyle = '#2b6b78'; ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapBg, (cx - span / 2 + half) * MAP_PPM, (cz - span / 2 + half) * MAP_PPM, span * MAP_PPM, span * MAP_PPM, 0, 0, size, size);
    if (snapshot.config.mode === 'battle-royale') {
      ctx.fillStyle = 'rgba(138,77,255,.32)'; ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(X(zone.x), Z(zone.z), Math.max(0, zone.radius) * scale, 0, Math.PI * 2, true); ctx.fill('evenodd');
      ctx.lineWidth = full ? 4 : 3; ctx.strokeStyle = '#8a4dff'; ctx.beginPath(); ctx.arc(X(zone.x), Z(zone.z), Math.max(0, zone.radius) * scale, 0, Math.PI * 2); ctx.stroke();
      if (zone.phase < STORM_PHASES) {
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#fff4d6'; ctx.lineWidth = full ? 3 : 2.5; ctx.beginPath(); ctx.arc(X(zone.nextX), Z(zone.nextZ), zone.nextRadius * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (actor.alive && Math.hypot(actor.pos.x - zone.nextX, actor.pos.z - zone.nextZ) > zone.nextRadius) { ctx.strokeStyle = 'rgba(255,244,214,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(actor.pos.x), Z(actor.pos.z)); ctx.lineTo(X(zone.nextX), Z(zone.nextZ)); ctx.stroke(); }
      }
      if (snapshot.actors.some(a => a.stage === 'plane') && this.planeDir) {
        const p = snapshot.plane, d = this.planeDir, reach = this.world.size * 1.5;
        ctx.strokeStyle = '#ffb81c'; ctx.setLineDash([6, 6]); ctx.lineWidth = full ? 4 : 3; ctx.beginPath(); ctx.moveTo(X(p.x - d.x * reach), Z(p.z - d.z * reach)); ctx.lineTo(X(p.x + d.x * reach), Z(p.z + d.z * reach)); ctx.stroke(); ctx.setLineDash([]);
        this.planeGlyph(ctx, X(p.x), Z(p.z), Math.atan2(d.x, -d.z), full ? 16 : 11);
      }
    } else { ctx.strokeStyle = '#e5412d'; ctx.lineWidth = 3; ctx.strokeRect(X(ARENA.minX), Z(ARENA.minZ), (ARENA.maxX - ARENA.minX) * scale, (ARENA.maxZ - ARENA.minZ) * scale); }
    ctx.save(); ctx.font = `${full ? 26 : 23}px "Dela Gothic One","Arial Black",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = full ? 7 : 5; ctx.strokeStyle = '#16120e'; ctx.fillStyle = '#fff4d6';
    // Labels clamped to the edge must never overlap: a label that would collide with one already drawn is skipped.
    const placed: [number, number, number, number][] = [[X(actor.pos.x) - 18, Z(actor.pos.z) - 18, X(actor.pos.x) + 18, Z(actor.pos.z) + 18]];
    if (!full) placed.push([size / 2 - 16, 0, size / 2 + 16, 34]);
    for (const district of this.world.districts) {
      const x = X(district.x), y = Z(district.z); if (x < -60 || y < -20 || x > size + 60 || y > size + 20) continue;
      const label = district.name.toUpperCase(), w = ctx.measureText(label).width / 2 + 6, lx = clamp(x, w, size - w), ly = clamp(y, 14, size - 14);
      // Try the label in place, then nudged below or above the obstacle; skip it only if every slot collides.
      const hit = (y: number) => placed.some(o => lx - w < o[2] && lx + w > o[0] && y - 15 < o[3] && y + 15 > o[1]);
      const ty = [ly, ly + 30, ly - 30].map(y => clamp(y, 14, size - 14)).find(y => !hit(y));
      if (ty === undefined) continue;
      placed.push([lx - w, ty - 15, lx + w, ty + 15]); ctx.strokeText(label, lx, ty); ctx.fillText(label, lx, ty);
    }
    ctx.restore();
    ctx.save(); ctx.translate(X(actor.pos.x), Z(actor.pos.z)); ctx.rotate(-actor.yaw); const k = full ? 1.5 : 1.25; ctx.scale(k, k);
    ctx.fillStyle = '#ffb81c'; ctx.strokeStyle = '#16120e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
    if (!full) { ctx.strokeStyle = 'rgba(22,18,14,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, 10); ctx.stroke(); ctx.font = '14px "Dela Gothic One",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#16120e'; ctx.fillStyle = '#ffb81c'; ctx.strokeText('N', size / 2, 22); ctx.fillText('N', size / 2, 22); }
  }
  private planeGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, r: number) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#fff4d6'; ctx.strokeStyle = '#16120e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .18, -r * .2); ctx.lineTo(r, r * .15); ctx.lineTo(r * .18, r * .2); ctx.lineTo(r * .12, r * .75); ctx.lineTo(r * .4, r); ctx.lineTo(-r * .4, r); ctx.lineTo(-r * .12, r * .75); ctx.lineTo(-r * .18, r * .2); ctx.lineTo(-r, r * .15); ctx.lineTo(-r * .18, -r * .2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  private deadInRoyale() {
    const snapshot = this.snapshot, me = snapshot?.actors.find(a => a.id === this.localId);
    return !!snapshot && !!me && !me.alive && snapshot.config.mode === 'battle-royale' && snapshot.phase === 'playing';
  }
  // Loading screen (style v3): the painted arrival scene, a parachuting capybara riding real progress, and rotating tips.
  setLoading(on: boolean) {
    clearInterval(this.tipTimer); clearTimeout(this.tipIndexTimer);
    const current = this.root.querySelector<HTMLElement>('#loadingOverlay');
    if (!on) {
      if (current) { current.classList.add('out'); window.setTimeout(() => current.remove(), 350); }
      // The pause panel already asks for the click; only messages that still apply are shown.
      const pending = this.pendingToasts; this.pendingToasts = [];
      // Errors are dropped once the pointer is locked, or while the pause panel shows them in its own #lockErr line.
      for (const t of pending) if (!t.error || (!document.pointerLockElement && this.el('pause-panel')?.hidden !== false)) this.toast(t.message, t.error);
      return;
    }
    if (current || this.screen !== 'game') return;
    this.loadProgress = 0;
    const b = this.settings.bindings, mode = this.room?.config.mode ?? this.selectedMode;
    const overlay = document.createElement('div'); overlay.id = 'loadingOverlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Carregando a partida');
    overlay.innerHTML = `<div class="lbg" style="--arrival:url('${uiArt('island-arrival-v3')}')"></div>`
      + `<div class="lcard"><div class="lhead"><div><p class="eyebrow"><span></span> A AVENTURA ESTÁ CHEGANDO</p><h2>Preparando <em>a ilha</em></h2></div><b class="lpercent" aria-hidden="true">0%</b></div>`
      + `<div class="ltrack"><div class="lrider" aria-hidden="true"><img class="lcapy" src="${uiArt('capy-parachute-v3')}" alt="" draggable="false"/></div><div class="lbar" role="progressbar" aria-label="Carregamento da ilha" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>`
      + `<span class="lstatus" role="status">${loadingLabel(0)}</span></div>`
      + `<div class="ltipbox"><span class="ltip-icon" aria-hidden="true">${icon('leaf')}</span><div><b class="dica">Dica da ilha</b><p class="ltip" aria-live="polite"></p></div><button type="button" class="lnext" data-do="next-tip" aria-label="Próxima dica">${icon('arrow')}</button></div>`
      + `<div class="lfoot"><span class="lmode">${icon(mode === 'battle-royale' ? 'crown' : 'bolt')} ${mode === 'battle-royale' ? 'Última de Pé' : 'Correria'} · Ilha das Capivaras</span>`
      + `<span class="lkeys"><span><kbd>${esc([b.forward, b.left, b.back, b.right].map(keyName).join(' '))}</kbd> andar</span><span><kbd>Mouse</kbd> mirar</span><span><kbd>${esc(keyName(b.jump))}</kbd> saltar</span></span></div>`;
    this.root.appendChild(overlay);
    this.showTip(true);
    this.tipTimer = window.setInterval(() => this.showTip(), 6000);
  }
  // Real progress from the loader (Forja's contract): monotonic 0..1, short pt-BR label, "Pronto!" at 1.
  setLoadingProgress(fraction: number, label?: string) {
    const overlay = this.root.querySelector<HTMLElement>('#loadingOverlay'), bar = overlay?.querySelector<HTMLElement>('.lbar');
    if (!overlay || !bar) return;
    const next = nextProgress(this.loadProgress, fraction); if (next === this.loadProgress && bar.classList.contains('determinate')) return;
    this.loadProgress = next;
    bar.classList.add('determinate'); bar.setAttribute('aria-valuenow', String(Math.round(next * 100)));
    bar.querySelector<HTMLElement>('i')!.style.width = `${(next * 100).toFixed(1)}%`;
    overlay.style.setProperty('--progress', `${(next * 100).toFixed(1)}%`);
    this.textOf(overlay.querySelector('.lpercent')!, `${Math.round(next * 100)}%`);
    const status = overlay.querySelector('.lstatus');
    if (status) status.textContent = next >= 1 ? 'Pronto!' : label ? cleanLabel(label) || loadingLabel(next) : loadingLabel(next);
  }
  private showTip(immediate = false) {
    const line = this.root.querySelector<HTMLElement>('#loadingOverlay .ltip'); if (!line) return;
    const b = this.settings.bindings, keys = { jump: keyName(b.jump), interact: keyName(b.interact), leanLeft: keyName(b.leanLeft), leanRight: keyName(b.leanRight), reload: keyName(b.reload), crouch: keyName(b.crouch) };
    const source = nextTip(), tip = fillTip(source, keys), category = tipCategory(source), box = line.closest('.ltipbox')!;
    const reveal = () => { line.textContent = tip; this.textOf(box.querySelector('.dica')!, category.label); box.querySelector('.ltip-icon')!.innerHTML = icon(category.icon); };
    clearTimeout(this.tipIndexTimer);
    // The tip change is a fade, which reduced motion keeps.
    if (immediate) { reveal(); return; }
    line.classList.add('fade'); this.tipIndexTimer = window.setTimeout(() => { reveal(); line.classList.remove('fade'); }, 200);
  }
  // First-run coach for practice: one short card at a time; each step waits for its moment and ends on the action itself.
  private updateCoach(snapshot: WorldSnapshot, me: ActorState, interaction: { id: string; name: string } | null) {
    const coach = this.coach; if (!coach) return;
    const zone = snapshot.zone, now = performance.now(), b = this.settings.bindings;
    const ready = coach.step === 'plane' ? me.stage === 'plane' : coach.step === 'chute' ? me.stage === 'falling'
      : coach.step === 'move' ? me.stage === 'ground' && me.alive : coach.step === 'loot' ? !!interaction
      : coach.step === 'storm' ? snapshot.phase === 'playing' && me.stage === 'ground' && (zone.shrinking || Math.hypot(me.pos.x - zone.nextX, me.pos.z - zone.nextZ) > zone.nextRadius) : true;
    // Windows that closed without the card (the player already jumped or opened the chute) are simply skipped.
    const missed = (coach.step === 'plane' && me.stage !== 'plane') || (coach.step === 'chute' && (me.stage === 'parachute' || me.stage === 'ground'));
    if (missed) { this.coachDone(); return; }
    if (!ready && coach.visibleAt === null) { this.show('coach', false); return; }
    coach.visibleAt ??= now;
    const shown = now - coach.visibleAt;
    if (coach.step === 'move') coach.startPos ||= { x: me.pos.x, z: me.pos.z };
    const finished = coach.step === 'intro' ? snapshot.phase === 'playing' && shown > 4000
      : coach.step === 'move' ? !!coach.startPos && Math.hypot(me.pos.x - coach.startPos.x, me.pos.z - coach.startPos.z) > 6
      : coach.step === 'loot' || coach.step === 'storm' ? shown > 9000 : false;
    if (finished) { this.coachDone(); return; }
    const k = (code: string) => `<kbd>${esc(keyName(code))}</kbd>`, br = snapshot.config.mode === 'battle-royale';
    const text: Record<string, string> = {
      intro: br ? '<b>Objetivo:</b> ser a última capivara de pé. Pegue armas, abra baús e fuja da tempestade.' : '<b>Objetivo:</b> fazer mais eliminações até o tempo acabar. Caiu, volta.',
      plane: `${k(b.jump)} salta do avião. Aperte ${k(bindingOf(this.settings.bindings, 'map'))} e escolha onde cair.`,
      chute: `${k(b.jump)} abre o paraquedas. Segure a direção pra planar.`,
      move: `${k(b.forward)}${k(b.left)}${k(b.back)}${k(b.right)} anda, o mouse olha e ${k(b.sprint)} corre.`,
      loot: `${k(b.interact)} pega o que brilha. A cor do brilho é a raridade.`,
      storm: `A tempestade fecha a ilha. Fique dentro do círculo branco: ${k(bindingOf(this.settings.bindings, 'map'))} abre o mapa.`,
    };
    const card = this.el('coach'); this.show('coach', true);
    if (card.dataset.step !== coach.step) { card.dataset.step = coach.step; this.el('coachTxt').innerHTML = text[coach.step]; }
  }
  private coachDone() {
    const coach = this.coach; if (!coach || !this.snapshot) return;
    const order = this.snapshot.config.mode === 'battle-royale' ? ['intro', 'plane', 'chute', 'move', 'loot', 'storm'] : ['intro', 'move', 'loot'];
    const next = order[order.indexOf(coach.step) + 1];
    if (!next) { this.finishOnboarding(); return; }
    this.coach = { step: next, visibleAt: null, startPos: null }; this.show('coach', false);
  }
  private finishOnboarding() {
    this.coach = null; this.onboarded = true; this.show('coach', false);
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* Private mode: the coach simply shows again next time. */ }
  }
  toggleMap(open = !this.mapOpen) {
    if (this.screen !== 'game') return; const big = this.root.querySelector<HTMLElement>('#bigmap'); if (!big) return;
    this.mapOpen = open && !this.root.querySelector('#hud.ended'); big.hidden = !this.mapOpen; this.hudTime = 0;
  }
}
