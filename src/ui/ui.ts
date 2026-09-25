import { DEFAULT_CONFIG, PLAYER_COLORS, type ActorState, type ConsumableId, type GameEvent, type Mode, type RoomConfig, type RoomState, type Settings, type WeaponId, type WorldSnapshot, type WorldSpec } from '../shared/types';
import { clamp } from '../shared/math';
import { rarityOf } from '../shared/rarity';
import { ARENA } from '../shared/layout';
import { terrainHeight } from '../shared/terrain';
import { WEAPONS } from '../shared/weapons';
import { DEFAULT_BINDINGS, adaptNote } from '../settings';
import { CONSUMABLE_ICONS, HUD_ART, capybara, escapeHtml as esc, icon, weaponIcon } from './icons';

export interface UICallbacks {
  host(profile: Profile, config: RoomConfig): Promise<void>; join(profile: Profile, code: string): Promise<void>;
  practice(config: RoomConfig, profile: Profile): void; ready(ready: boolean): void; start(): void;
  leave(): void; rematch(): void; resume(): void; spectate(): void;
  settings(settings: Settings): void; profile(profile: Profile): void;
}
type Profile = { name: string; color: string };
export const modeName = (mode: Mode) => mode === 'battle-royale' ? 'ÚLTIMA DE PÉ' : 'CORRERIA';
const clock = (seconds: number) => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const keyName = (code: string) => code.replace('Key', '').replace('Digit', '').replace('Left', '').replace('Right', '').replace('Space', 'Espaço').replace('Control', 'Ctrl');
// HUD facts mirrored from the simulation: six storm phases, and the plane drops a human after 12 s.
const STORM_PHASES = 6, PLANE_AUTO_DROP = 12;
// Minimap zoom (metres shown across the corner map) and island texture resolution (pixels per metre).
const MINIMAP_SPAN = 84, MAP_PPM = 4;
const CONSUMABLES: ConsumableId[] = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'];
const USE_LABEL: Record<ConsumableId, string> = { bandage: 'Enfaixando…', medkit: 'Remendando…', guarana: 'Tomando guaraná…', acai: 'Tomando açaí…', rapadura: 'Mastigando rapadura…' };
const LOOT_LABEL: Record<string, string> = { ammo: 'munição', armor: 'colete', helmet: 'capacete', bandage: 'bandagem', medkit: 'kit médico', guarana: 'guaraná', acai: 'açaí', rapadura: 'rapadura' };
const DEATH_LINES = [(k: string) => `Virou comida de ${k}`, (k: string) => `${k} te mandou pro saco`, (k: string) => `Levou a pior contra ${k}`, (k: string) => `${k} não deixou nem o osso`];
const fireMode = (id: WeaponId) => id === 'machete' ? 'CORTE' : id === 'slingshot' ? 'PEDRA' : id === 'shotgun' ? 'BOMBA' : id === 'sniper' ? 'FERROLHO' : WEAPONS[id].automatic ? 'AUTO' : 'SEMI';
const bindingLabels: Record<string, string> = { forward: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', sprint: 'Correr', jump: 'Pular / paraquedas', crouch: 'Agachar', reload: 'Recarregar', interact: 'Interagir', leanLeft: 'Espiar à esquerda', leanRight: 'Espiar à direita' };

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
  private deathInfo: { place: number; line: string } | null = null;
  private lastHits = new Map<string, { actor: string; head: boolean }>();
  private useTrack: { item: ConsumableId; until: number; total: number } | null = null;
  private lastPrey: { name: string; color: string } | null = null;
  private thumbs: Map<WeaponId, string> | null = null;
  private mapOpen = false;
  private deathReleased = false;
  private tipTimer = 0;
  private planeDir: { x: number; z: number } | null = null;
  private lastPlane: { x: number; z: number } | null = null;
  private localId = '';
  constructor(private world: WorldSpec, private settings: Settings, private profile: Profile, private callbacks: UICallbacks) {
    this.drawMapBackground(); this.home();
    // M toggles the island map over the match; it never touches pointer lock or movement input.
    document.addEventListener('keydown', event => {
      if (this.screen !== 'game' || event.repeat || event.target instanceof HTMLInputElement) return;
      if (event.code === 'KeyM') this.toggleMap(); else if (event.code === 'Escape' && this.mapOpen) this.toggleMap(false);
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
        case 'quit': if (this.room?.isHost) this.confirmLeave(); else this.callbacks.leave(); break;
      }
    });
  }
  private header(back = false) {
    return `<header class="topbar"><button class="brand" data-do="home" aria-label="Tela inicial"><img src="./assets/favicon.svg" alt=""/><span>ÚLTIMA<br><b>CAPIVARA</b></span></button><nav>${back ? `<button class="nav-link" data-do="leave">${icon('back')} VOLTAR</button>` : '<span class="nav-link active">JOGAR</span><button class="nav-link" data-do="how">COMO JOGAR</button>'}<button class="icon-button" data-do="settings" aria-label="Configurações">${icon('settings')}</button></nav><div class="edition"><span class="live-dot"></span> EDIÇÃO ILHA <b>V2</b></div></header>`;
  }
  home() {
    this.screen = 'home'; this.lastResults = ''; document.body.dataset.screen = 'home';
    this.root.innerHTML = `${this.header()}<main class="home-content"><section class="hero-copy"><div class="cover-top"><span class="issue">Edição 02</span><span class="price">Grátis</span></div><p class="eyebrow"><span></span> A ILHA É NOSSA.</p><h1>ÚLTIMA<br><em>CAPIVARA</em><span class="title-stamp">SÓ UMA<br>FICA DE PÉ.</span></h1><p class="hero-description">Chame a turma. Escolha seu lugar na ilha.<br>O resto é instinto de sobrevivência.</p><div class="hero-actions"><button class="button primary warmup" data-do="practice">${icon('crosshair')} AQUECER COM OS BOTS ${icon('arrow')}<small>Joga na hora, sem sala</small></button><button class="button secondary" data-do="host">${icon('plus')} CRIAR SALA</button><button class="button secondary" data-do="join">${icon('users')} ENTRAR</button></div><div class="hero-facts"><span>${icon('users')} ATÉ 16 AMIGOS</span><i></i><span>${icon('globe')} NO NAVEGADOR</span><i></i><span>100% GRÁTIS</span></div></section><section class="mode-section" aria-label="Escolha o modo"><div class="section-heading"><span>ESCOLHA SUA CONFUSÃO</span><small>02 MODOS DE JOGO</small></div><div class="mode-grid"><button class="mode-card royale selected" data-mode="battle-royale" aria-pressed="true"><div class="mode-art">${icon('crown')}<span class="mode-index">01</span></div><div class="mode-copy"><span class="mode-tag">BATTLE ROYALE</span><h2>ÚLTIMA DE PÉ</h2><p>Uma ilha. Uma vida. Nenhuma segunda chance.</p><span class="mode-meta">${icon('users')} ATÉ 21 BICHOS <b class="selection-mark">${icon('check')}</b></span></div></button><button class="mode-card deathmatch" data-mode="deathmatch" aria-pressed="false"><div class="mode-art">${icon('bolt')}<span class="mode-index">02</span></div><div class="mode-copy"><span class="mode-tag">COMBATE POR TEMPO</span><h2>CORRERIA</h2><p>Caiu? Volta. Mais eliminações, mais glória.</p><span class="mode-meta">${icon('clock')} 8 MINUTOS <b class="selection-mark">${icon('check')}</b></span></div></button></div></section></main><footer class="home-footer"><span>${icon('leaf')} FEITO PARA JOGAR JUNTO.</span><span>ILHA DAS CAPIVARAS <i>22° S / 43° O</i></span><button data-do="how">CONTROLES ${icon('mouse')}</button></footer>`;
  }
  // Short <select>s become sticker segmented toggles; the hidden select stays the source of truth for forms and listeners.
  private segmentize(root: HTMLElement) {
    root.querySelectorAll<HTMLSelectElement>('select:not(.seg-source)').forEach(select => {
      if (select.options.length > 4) return;
      const seg = document.createElement('div'); seg.className = 'seg';
      for (const option of Array.from(select.options)) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = (option.textContent || option.value).split(' · ')[0];
        button.classList.toggle('on', option.value === select.value);
        button.addEventListener('click', () => { select.value = option.value; seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === button)); select.dispatchEvent(new Event('change', { bubbles: true })); });
        seg.append(button);
      }
      select.classList.add('seg-source'); select.after(seg);
    });
  }
  private openModal(title: string, content: string) {
    this.closeModal(); const dialog = document.createElement('dialog'); dialog.className = 'modal';
    dialog.innerHTML = `<div class="modal-heading"><div><p class="eyebrow">ÚLTIMA CAPIVARA</p><h2>${title}</h2></div><button class="icon-button close-modal" aria-label="Fechar">${icon('close')}</button></div>${content}`;
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
      const button = form.querySelector<HTMLButtonElement>('[type="submit"]')!; button.disabled = true; button.textContent = 'CONECTANDO…';
      try {
        if (kind === 'host') await this.callbacks.host({ ...this.profile }, { mode: data.get('mode') as Mode, capacity: Number(data.get('capacity')), duration: Number(data.get('duration')) as RoomConfig['duration'], difficulty: data.get('difficulty') as RoomConfig['difficulty'], bots: data.has('bots') });
        else await this.callbacks.join({ ...this.profile }, String(data.get('code')).trim().toUpperCase());
        this.closeModal();
      } catch (error) { form.querySelector('.form-error')!.textContent = error instanceof Error ? error.message : 'Não foi possível conectar. Tente novamente.'; button.disabled = false; button.textContent = 'TENTAR NOVAMENTE'; }
    });
  }
  setRoom(room: RoomState | null) { this.room = room; if (room) { this.localId = room.myId; if (room.phase === 'lobby') this.lobby(); } }
  private lobby() {
    const room = this.room!; this.screen = 'lobby'; document.body.dataset.screen = 'lobby';
    const me = room.players.find(p => p.id === room.myId), allReady = room.players.every(p => p.ready && p.connected);
    this.root.innerHTML = `${this.header(true)}<main class="lobby-content"><section class="lobby-intro"><p class="eyebrow">ENCONTRO MARCADO.</p><h1>SUA TURMA.<br><em>SUA ILHA.</em></h1><p>A melhor confusão começa com os amigos certos.</p><div class="invite-card"><div><span>CÓDIGO DA SALA</span><strong>${esc(room.code)}</strong></div><button class="button secondary" data-do="copy">${icon('link')} COPIAR LINK</button></div><div class="lobby-rules"><span>${icon(room.config.mode === 'battle-royale' ? 'crown' : 'bolt')} ${modeName(room.config.mode)}</span><p>${room.config.mode === 'battle-royale' ? 'Salte, encontre equipamento e fuja da tempestade. Só a última capivara de pé vence.' : `Você tem ${room.config.duration / 60} minutos. Elimine, reapareça e termine no topo.`}</p><small>${room.config.bots ? 'BOTS COMPLETAM A TURMA' : 'SOMENTE AMIGOS'} · ${room.config.capacity} VAGAS</small></div></section><section class="roster-panel"><div class="section-heading"><span>QUEM VAI PRA ILHA</span><small>${room.players.length}/${room.config.capacity}</small></div><div class="roster">${room.players.map(player => `<div class="player-row ${player.id === room.myId ? 'you' : ''}">${capybara(player.color)}<div><strong>${esc(player.name)} ${player.id === room.myId ? '<small>VOCÊ</small>' : ''}</strong><span>${player.id === room.hostId ? 'CRIADOR DA SALA' : 'NA TURMA'}</span></div><b class="ready-status ${player.ready && player.connected ? 'ready' : ''}">${!player.connected ? 'RECONECTANDO' : player.ready ? `${icon('check')} PRONTO` : 'PREPARANDO'}</b></div>`).join('')}${room.players.length < room.config.capacity ? `<div class="empty-seat">${icon('plus')} O próximo lugar pode ser do seu amigo.</div>` : ''}</div><div class="lobby-bottom"><button class="button ${me?.ready ? 'secondary' : 'primary'} full-width" data-do="ready">${icon('check')} ${me?.ready ? 'ESTOU PRONTO · CANCELAR' : 'ESTOU PRONTO'}</button>${room.isHost ? `<button class="button ${allReady ? 'primary' : 'secondary'} full-width" data-do="start" ${allReady ? '' : 'disabled'}>${icon('play')} COMEÇAR PARTIDA</button>` : '<p>Quem criou a sala começa quando a turma estiver pronta.</p>'}<small>${room.isHost ? 'Mantenha esta aba aberta enquanto a turma joga.' : 'Seu jogo está pronto. Só falta a turma.'}</small></div></section></main>`;
  }
  private async copyInvite() {
    if (!this.room) return; const url = new URL(location.href); url.search = ''; url.searchParams.set('sala', this.room.code); url.hash = '';
    try { await navigator.clipboard.writeText(url.href); this.toast('Link copiado. Chame a turma!'); }
    catch { this.openModal('CONVIDE SUA TURMA', `<label>LINK DA SALA<input readonly value="${esc(url.href)}"/></label><p>Copie o link acima ou compartilhe o código ${esc(this.room.code)}.</p>`); }
  }
  game(playerId: string) {
    this.lastBanner = ''; this.deathInfo = null; this.lastHits.clear(); this.useTrack = null; this.lastPrey = null; this.mapOpen = false; this.planeDir = null; this.lastPlane = null; this.deathReleased = false;
    if (!this.thumbs) void import('../render/thumbnails').then(m => m.loadWeaponThumbnails()).then(map => { if (map.size) { this.thumbs = map; this.inventoryKey = ''; } });
    this.localId = playerId; this.screen = 'game'; this.inventoryKey = ''; this.lastResults = ''; document.body.dataset.screen = 'game';
    const key = (code: string) => esc(keyName(code));
    this.root.innerHTML = `<div class="hud" id="hud"><div id="storm"></div><div id="vign"></div><div id="scope-overlay" class="scope-overlay" hidden><i></i><b></b><span>×</span></div>`
      + `<div id="topL"><div class="stk chip" style="--r:-1.5deg"><span class="k" id="hAliveK">Bichos na ilha</span><b id="hAlive">21</b></div><div class="stk chip" style="--r:1deg"><span class="k">Presas</span><b id="hKills">0</b></div><div class="stk chip zone" id="hZoneChip" style="--r:-.8deg"><span class="k" id="hZoneK">Tempestade chega em</span><b id="hZoneT">1:00</b></div><div class="stk chip" id="hRankChip" style="--r:1.4deg" hidden><span class="k">Sua posição</span><b id="hRank">#1</b></div></div>`
      + `<div id="safe" class="stk" hidden>${HUD_ART.safeArrow}<span id="safeTxt"></span></div><div id="hOut" class="stk" hidden>Na tempestade! −<span id="hDps">1</span>/s</div>`
      + `<div id="mapWrap"><span class="tab" id="mapTab">Ilha</span><canvas id="minimap" width="480" height="480"></canvas><span class="net" id="hud-ping">LOCAL</span></div><div id="feed"></div><div id="bigmap" hidden><div class="frame"><span class="tab">Ilha inteira</span><canvas id="bigmapCanvas" width="1000" height="1000"></canvas><span class="hint"><kbd>M</kbd> fecha o mapa</span></div></div>`
      + `<div id="banner"></div><div id="spec" class="stk" hidden><div class="btns"><button type="button" class="go" data-do="spectate">Assistir a próxima capivara →</button><button type="button" class="alt" data-do="quit">Sair da partida</button></div><span class="hint"><kbd>${key(this.settings.bindings.jump)}</kbd> troca de capivara enquanto assiste</span></div><div id="dmQuit" class="stk" hidden><button type="button" data-do="quit">Sair da partida</button><span><kbd>Esc</kbd> abre o menu</span></div><div id="dmgInd"></div><div id="nums"></div>`
      + `<div id="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div><div id="hitm"><i></i><i></i><i></i><i></i></div>`
      + `<div id="prompt" class="stk lt" hidden><kbd id="promptKey">${key(this.settings.bindings.interact)}</kbd><span id="promptTxt"></span></div><div id="reload" class="cbar stk" hidden><span id="reloadTxt">Enchendo o pente…</span><div class="bar"><div id="reloadBar"></div></div></div><div id="use" class="cbar stk" hidden><span id="useTxt"></span><div class="bar"><div id="useBar"></div></div></div><div id="alt" hidden><b id="altTxt">0 m</b><span id="altHint"></span></div>`
      + `<div id="vitals" class="stk"><span id="prot" hidden>Protegida</span><span id="helm" hidden>${HUD_ART.helmet}<b id="helmTxt">0</b></span><div class="row">${HUD_ART.shield}<div class="bar seg"><div id="armBar" style="width:0"></div></div><b id="armTxt">0</b></div><div class="row">${HUD_ART.heart}<div class="bar"><div id="hpBar"></div></div><b id="hpTxt">100</b></div></div>`
      + `<div id="stance" class="stk">${HUD_ART.stance}<div class="lbl"><span class="k">Postura</span><b id="stanceTxt">Em pé</b></div></div>`
      + `<div id="wpnbox"><div id="ammoBox" class="stk"><div class="wrow"><span class="rar" id="wRar">Comum</span><span class="mode" id="wMode">SEMI</span><span class="wname" id="wName">Pistola</span></div><div class="ammo" id="ammo"><b id="aMag">0</b><span id="aRes"></span></div></div><div id="hotbar"></div></div>`
      + `<div id="consbar">${CONSUMABLES.map((id, i) => `<div class="cs zero" data-k="${id}"><kbd>${i + 5}</kbd>${CONSUMABLE_ICONS[id]}<b>0</b></div>`).join('')}</div>`
      + `</div><div id="scoreboard" class="scoreboard" hidden></div><div id="pause-panel" class="pause-panel" hidden></div>`;
  }
  update(snapshot: WorldSnapshot, playerId: string, ping: number, scoreboard: boolean, fps: number, interaction: { id: string; name: string } | null) {
    this.snapshot = snapshot; this.localId = playerId;
    if (snapshot.phase === 'results') { if (this.lastResults !== snapshot.matchId) { this.lastResults = snapshot.matchId; if (this.screen !== 'game' || !this.root.querySelector('#hud')) this.game(playerId); this.victory(snapshot); } return; }
    if (this.screen !== 'game') this.game(playerId);
    const me = snapshot.actors.find(a => a.id === playerId); if (!me) return;
    const now = performance.now(); if (now - this.hudTime < 75) return; this.hudTime = now;
    const br = snapshot.config.mode === 'battle-royale', t = snapshot.time, zone = snapshot.zone, jump = keyName(this.settings.bindings.jump);
    const alive = snapshot.actors.filter(a => a.alive).length;
    this.text('hAliveK', br ? 'Bichos na ilha' : 'Na correria'); this.text('hAlive', br ? alive : snapshot.actors.length); this.text('hKills', me.kills);
    const zoneChip = this.el('hZoneChip'), finalStorm = zone.phase >= STORM_PHASES;
    zoneChip.classList.toggle('time', !br);
    zoneChip.classList.toggle('closing', br ? zone.shrinking || finalStorm : snapshot.remaining <= 30);
    this.text('hZoneK', br ? `${finalStorm ? 'Última tempestade' : zone.shrinking ? 'Tempestade avançando' : 'Tempestade chega em'} · ${Math.min(zone.phase + 1, STORM_PHASES)}/${STORM_PHASES}` : 'Tempo restante');
    this.text('hZoneT', br ? finalStorm ? '—' : clock(zone.timeLeft) : clock(snapshot.remaining));
    this.el('hRankChip').hidden = br; if (!br) this.text('hRank', `#${snapshot.actors.filter(a => a.kills > me.kills).length + 1}`);
    const outside = br && me.alive && me.stage === 'ground' && Math.hypot(me.pos.x - zone.x, me.pos.z - zone.z) > zone.radius;
    this.el('hOut').hidden = !outside; if (outside) this.text('hDps', Math.round(zone.damage));
    this.el('storm').classList.toggle('on', outside);
    const safeDistance = Math.hypot(me.pos.x - zone.nextX, me.pos.z - zone.nextZ) - zone.nextRadius;
    const showSafe = br && me.alive && me.stage !== 'plane' && !finalStorm && safeDistance > 0 && snapshot.phase === 'playing';
    this.el('safe').hidden = !showSafe;
    if (showSafe) { this.el('safeArrow').setAttribute('transform', `rotate(${(this.localAngle(me, zone.nextX, zone.nextZ) * 180 / Math.PI).toFixed(1)})`); this.text('safeTxt', `Refúgio a ${Math.round(safeDistance)} m`); }
    const nearest = this.world.districts.reduce((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) < Math.hypot(b.x - me.pos.x, b.z - me.pos.z) ? a : b);
    this.text('mapTab', me.stage === 'plane' ? 'Ilha' : nearest.name); this.text('hud-ping', `${ping ? `${Math.round(ping)} ms` : 'Local'} · ${Math.round(fps)} fps`);
    const hp = Math.max(0, me.hp), vitals = this.el('vitals'), shielded = t < me.protectionUntil;
    this.el('hpBar').style.width = `${hp}%`; this.el('armBar').style.width = `${clamp(me.armor, 0, 100)}%`;
    this.text('hpTxt', Math.ceil(hp)); this.text('armTxt', Math.ceil(me.armor));
    vitals.classList.toggle('low', me.alive && hp < 30); vitals.classList.toggle('boost', shielded); this.el('prot').hidden = !shielded;
    this.el('helm').hidden = !(me.helmet > 0); if (me.helmet > 0) this.text('helmTxt', Math.ceil(me.helmet));
    this.el('vign').classList.toggle('low', me.alive && hp < 30);
    const weapon = me.weapons[me.slot], def = weapon ? WEAPONS[weapon.id] : null, rarity = rarityOf(weapon?.rarity);
    this.text('wName', def ? def.name : 'Desarmada'); this.text('wRar', rarity.name); this.el('wRar').style.setProperty('--rc', rarity.color); this.el('wRar').hidden = !weapon;
    this.text('wMode', weapon ? fireMode(weapon.id) : '—');
    this.text('aMag', !weapon || !def ? 0 : def.melee ? '∞' : weapon.ammo); this.text('aRes', !weapon || !def || def.melee ? '' : `/ ${weapon.reserve}`);
    this.el('ammo').classList.toggle('low', !!weapon && !!def && !def.melee && weapon.ammo <= Math.ceil(def.magazine * .2));
    const inventoryKey = JSON.stringify([me.weapons.map(w => [w.id, w.rarity, w.ammo]), me.slot]);
    if (this.inventoryKey !== inventoryKey) {
      this.inventoryKey = inventoryKey;
      this.el('hotbar').innerHTML = [0, 1, 2, 3].map(i => { const w = me.weapons[i]; return `<div class="hs${i === me.slot ? ' on' : ''}${w ? '' : ' empty'}" style="--rc:${w ? rarityOf(w.rarity).color : '#fff4d6'}"><kbd>${i + 1}</kbd>${w ? this.thumbs?.get(w.id) ? `<img src="${this.thumbs.get(w.id)}" alt="">` : weaponIcon(w.id) : ''}<i>${w ? WEAPONS[w.id].melee ? '∞' : w.ammo : ''}</i></div>`; }).join('');
    }
    this.root.querySelectorAll<HTMLElement>('#consbar .cs').forEach(slot => {
      const id = slot.dataset.k as ConsumableId, count = me.consumables[id] || 0;
      this.textOf(slot.querySelector('b')!, count); slot.classList.toggle('zero', count <= 0); slot.classList.toggle('use', me.using === id);
    });
    const scoped = me.alive && me.ads && !me.sprint && me.reloadUntil <= t && ['sniper', 'dmr'].includes(weapon?.id || '');
    this.el('scope-overlay').hidden = !scoped;
    const speed = Math.hypot(me.velocity.x, me.velocity.z), cross = this.el('cross');
    cross.style.setProperty('--g', `${(4 + (def ? me.ads ? def.adsSpread : def.spread : 1) * 3.2 + Math.min(speed, 6) * 1.1).toFixed(1)}px`);
    cross.style.opacity = me.alive && me.stage === 'ground' && !scoped && !(me.sprint && speed > .5) ? '1' : '0';
    const prompt = this.el('prompt'); prompt.hidden = !interaction || !me.alive || me.stage !== 'ground';
    if (interaction) { this.text('promptTxt', interaction.name.startsWith('Abrir') ? interaction.name : `Pegar ${interaction.name}`); this.text('promptKey', keyName(this.settings.bindings.interact)); }
    const reloading = !!weapon && !!def && me.reloadUntil > t; this.el('reload').hidden = !reloading;
    if (reloading) { this.text('reloadTxt', weapon.id === 'shotgun' ? 'Botando cartucho…' : weapon.id === 'slingshot' ? 'Pegando pedra…' : 'Enchendo o pente…'); this.el('reloadBar').style.width = `${clamp(1 - (me.reloadUntil - t) / Math.max(.1, def.reload), 0, 1) * 100}%`; }
    if (me.using && me.useUntil > t) {
      if (this.useTrack?.item !== me.using || this.useTrack.until !== me.useUntil) this.useTrack = { item: me.using, until: me.useUntil, total: Math.max(.1, me.useUntil - t) };
      this.text('useTxt', `${USE_LABEL[me.using]} ${(me.useUntil - t).toFixed(1)} s`); this.el('useBar').style.width = `${clamp(1 - (me.useUntil - t) / this.useTrack.total, 0, 1) * 100}%`;
    } else this.useTrack = null;
    this.el('use').hidden = !this.useTrack;
    const air = me.alive && (me.stage === 'falling' || me.stage === 'parachute'); this.el('alt').hidden = !air;
    if (air) { this.text('altTxt', `${Math.max(0, Math.round(me.pos.y - terrainHeight(me.pos.x, me.pos.z)))} m`); this.text('altHint', me.stage === 'falling' ? `${jump} abre o paraquedas` : 'WASD plana'); }
    this.el('torso').setAttribute('transform', `rotate(${(me.lean * 16).toFixed(1)} 30 56)`); this.el('figure').setAttribute('transform', `translate(0 ${me.crouch ? 15 : 0})`);
    this.text('stanceTxt', me.stage === 'plane' ? 'No avião' : me.stage === 'falling' ? 'Caindo' : me.stage === 'parachute' ? 'Paraquedas' : me.sprint && speed > .5 ? 'Correndo' : me.crouch ? 'Agachada' : Math.abs(me.lean) > .15 ? me.lean < 0 ? 'Espiando esq.' : 'Espiando dir.' : 'Em pé');
    if (me.alive) this.deathInfo = null;
    let banner = '';
    if (snapshot.phase === 'countdown') banner = `${Math.ceil(snapshot.countdown)}<small>Prepare-se · a ilha já vai abrir</small>`;
    else if (!me.alive && br) { const info = this.deathInfo ||= { place: alive + 1, line: 'Fim da linha pra você' }; banner = `#${info.place}<small>${esc(info.line)}</small>`; }
    else if (!me.alive) banner = `Caiu!<small>Volta em ${Math.max(0, Math.ceil(me.respawnAt - t))} s</small>`;
    else if (me.stage === 'plane') { const left = Math.ceil(PLANE_AUTO_DROP - t); banner = `${esc(jump)} pra saltar<small>${left > 0 ? `salto automático em ${left} s` : 'saltando…'}</small>`; }
    this.setBanner(banner);
    const deadInRoyale = this.deadInRoyale(); this.el('spec').hidden = !deadInRoyale; this.el('dmQuit').hidden = me.alive || br || snapshot.phase !== 'playing';
    // Eliminated in battle royale: free the mouse once so the on-screen buttons can be clicked.
    if (deadInRoyale && !this.deathReleased) { this.deathReleased = true; this.el('pause-panel').hidden = true; if (document.pointerLockElement) document.exitPointerLock(); }
    if (me.alive) this.deathReleased = false;
    const score = this.el('scoreboard'); score.hidden = !scoreboard;
    if (scoreboard) score.innerHTML = `<div class="scoreboard-content"><p class="eyebrow">${modeName(snapshot.config.mode)}</p><h2>A TURMA NA ILHA</h2>${this.scoreTable(snapshot)}</div>`;
    const plane = snapshot.plane;
    if (this.lastPlane) { const dx = plane.x - this.lastPlane.x, dz = plane.z - this.lastPlane.z, len = Math.hypot(dx, dz); if (len > .05) this.planeDir = { x: dx / len, z: dz / len }; }
    this.lastPlane = { x: plane.x, z: plane.z };
    this.drawMap(snapshot, me);
  }
  private scoreTable(snapshot: WorldSnapshot) {
    const actors = [...snapshot.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return `<table class="score-table"><thead><tr><th>CAPIVARA</th><th>ELIM.</th><th>MORTES</th><th>DANO</th></tr></thead><tbody>${actors.map((a, i) => `<tr class="${a.id === this.localId ? 'you' : ''}"><td><span class="rank">${i + 1}</span><i style="background:${/^#[a-f0-9]{6}$/i.test(a.color) ? a.color : '#bd8956'}"></i>${esc(a.name)}${a.bot ? '<small>BOT</small>' : a.id === this.localId ? '<small>VOCÊ</small>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${Math.round(a.damage)}</td></tr>`).join('')}</tbody></table>`;
  }
  // The match ends inside the live game view, like the first version: headline, last prey, confetti,
  // then the placement, stats, board and rematch buttons slide in underneath.
  private victory(snapshot: WorldSnapshot) {
    const hud = this.el('hud'); hud.classList.add('ended'); this.el('pause-panel').hidden = true; this.el('scoreboard').hidden = true;
    const br = snapshot.config.mode === 'battle-royale', winners = snapshot.results.filter(r => r.winner), won = winners.some(r => r.id === this.localId);
    const me = snapshot.results.find(r => r.id === this.localId), place = me?.place ?? snapshot.results.length, names = winners.map(w => esc(w.name)).join(' e ');
    const title = won ? br ? 'Última de pé!' : 'Dona da correria!' : br ? 'Não foi dessa vez' : winners.length ? `${names} ${winners.length > 1 ? 'levaram' : 'levou'}` : 'Ninguém levou';
    const sub = won ? br ? `Última capivara de pé · ${snapshot.actors.length} bichos` : `${winners.length > 1 ? 'Vitória dividida · ' : ''}${me?.kills ?? 0} presas · ${Math.round(me?.damage ?? 0)} de dano` : br ? `${winners.length ? `${names} ficou de pé` : 'A ilha venceu desta vez'} · ${snapshot.actors.length} bichos` : `Você fez ${me?.kills ?? 0} presas · ${Math.round(me?.damage ?? 0)} de dano`;
    const prey = this.lastPrey ? `<div class="vlast"><span class="pt">${capybara(this.lastPrey.color)}</span><span>Última presa: <b>${esc(this.lastPrey.name)}</b></span></div>` : '';
    const layer = document.createElement('div'); layer.id = 'victory'; layer.className = won ? 'won' : 'lost';
    layer.innerHTML = `<div class="vrays"></div><div class="vcard"><div class="vnum">#${won ? 1 : place}</div><div class="vtitle">${title}</div><div class="vsub">${sub}</div>${prey}</div>`
      + `<div class="vpanel stk" id="vpanel"><div class="vstats"><div><b>${me?.kills ?? 0}</b><span>Presas</span></div><div><b>${Math.round(me?.damage ?? 0)}</b><span>Dano</span></div><div><b>${me ? `#${me.place}` : '–'}</b><span>Colocação</span></div></div>`
      + `<div class="vactions"><button class="button primary" data-do="rematch">${icon('users')} ${this.room ? 'VOLTAR PARA A TURMA' : 'MAIS UMA PARTIDA'}</button><button class="button secondary" data-do="leave">VOLTAR AO INÍCIO</button></div><div class="vboard">${this.scoreTable(snapshot)}</div></div>`
      + `<div id="confetti"></div><div id="flash"></div>`;
    hud.appendChild(layer);
    if (won) {
      const confetti = layer.querySelector<HTMLElement>('#confetti')!, colors = ['#f1bf61', '#e3663f', '#7fc0d0', '#7fc48a', '#f8f0d9', '#a468ff'];
      for (let i = 0; i < 70; i++) { const bit = document.createElement('i'); bit.style.left = `${Math.random() * 100}%`; bit.style.background = colors[i % colors.length]; bit.style.animationDuration = `${2.2 + Math.random() * 2}s`; bit.style.animationDelay = `${Math.random() * 1.6}s`; bit.style.rotate = `${Math.random() * 180}deg`; confetti.appendChild(bit); }
      layer.querySelector('#flash')!.classList.add('on');
    }
    window.setTimeout(() => layer.querySelector('#vpanel')?.classList.add('show'), 2200);
  }
  // Paused mid-match: the first version's comic menu over the frozen island, with the quick settings inline.
  setPaused(paused: boolean) {
    if (this.screen !== 'game') return; const panel = this.el('pause-panel'); panel.hidden = !paused || this.deadInRoyale();
    if (panel.hidden) return;
    this.toggleMap(false);
    const snapshot = this.snapshot, online = !!this.room, alive = snapshot ? snapshot.actors.filter(a => a.alive).length : 0, b = this.settings.bindings;
    const keys = (...codes: string[]) => `<span class="keys">${codes.map(code => `<kbd class="kc">${esc(code)}</kbd>`).join('')}</span>`;
    panel.innerHTML = `<div class="mc"><div class="eyebrow stk">Partida em andamento · ${alive} ${alive === 1 ? 'vivo' : 'vivos'}${online && this.room ? ` · Sala ${esc(this.room.code)}` : ''}</div><h1>${online ? 'Menu' : 'Pausado'}</h1>${!online && adaptNote(this.settings) ? `<p class="adapt-note stk">${esc(adaptNote(this.settings))}</p>` : ''}`
      + `<button type="button" class="play" data-do="resume">Voltar pra ilha</button><div id="lockErr" role="status"></div>`
      + `<div class="quick stk"><span>${keys(keyName(b.forward), keyName(b.left), keyName(b.back), keyName(b.right))}andar</span><span>${keys(keyName(b.leanLeft), keyName(b.leanRight))}espiar</span><span>${keys(keyName(b.interact))}pegar</span><span>${keys(keyName(b.reload))}recarregar</span><span>${keys('1–4', 'Roda')}armas</span><span>${keys('5–9')}curas</span><span>${keys('Tab')}placar</span><span>${keys('M')}mapa</span></div>`
      + `<div class="set stk"><label><span>Sensibilidade <b data-out="sensitivity">${this.settings.sensitivity.toFixed(2)}</b></span><input type="range" data-quick="sensitivity" min="0.2" max="3" step="0.05" value="${this.settings.sensitivity}"></label>`
      + `<label><span>Campo de visão <b data-out="fov">${this.settings.fov}°</b></span><input type="range" data-quick="fov" min="60" max="105" step="1" value="${this.settings.fov}"></label></div>`
      + `<div class="mrow"><button type="button" class="alt" data-do="settings">Configurações</button><button type="button" class="alt" data-do="leave">Sair da partida</button></div></div>`;
    const show = (key: string, value: number) => { const out = panel.querySelector(`[data-out="${key}"]`); if (out) out.textContent = key === 'fov' ? `${value}°` : value.toFixed(2); };
    panel.querySelectorAll<HTMLInputElement>('[data-quick]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.quick as 'sensitivity' | 'fov'; this.settings[key] = Number(input.value); show(key, this.settings[key]); this.callbacks.settings(this.settings);
    }));
  }
  private confirmLeave() {
    if (this.screen === 'home') return; const dialog = this.openModal('ATÉ LOGO, CAPIVARA?', `<p>${this.room?.isHost ? 'Você criou esta sala. Ao sair, a partida termina para toda a turma.' : 'Você vai sair desta partida e voltar ao início.'}</p><div class="modal-actions"><button class="button secondary" id="stay">FICAR</button><button class="button primary" id="exit">SAIR DA PARTIDA</button></div>`);
    dialog.querySelector('#stay')!.addEventListener('click', () => this.closeModal()); dialog.querySelector('#exit')!.addEventListener('click', () => { this.closeModal(); this.callbacks.leave(); });
  }
  private settingsModal() {
    const labels = { sensitivity: 'Sensibilidade do mouse', fov: 'Campo de visão', master: 'Volume geral', effects: 'Efeitos e combate', ambience: 'Ambiente', music: 'Música' };
    const ranges = (keys: (keyof typeof labels)[]) => keys.map(key => `<label class="slider-label">${labels[key]} <output>${this.settings[key]}</output><input type="range" data-setting="${key}" min="${key === 'fov' ? 60 : key === 'sensitivity' ? .2 : 0}" max="${key === 'fov' ? 105 : key === 'sensitivity' ? 3 : 1}" step="${key === 'fov' ? 1 : .05}" value="${this.settings[key]}"/></label>`).join('');
    const dialog = this.openModal('DO SEU JEITO.', `<div class="settings-grid"><section><h3>MOUSE E IMAGEM</h3>${ranges(['sensitivity', 'fov'])}<label>Qualidade gráfica<select id="graphics"><option value="low">Leve</option><option value="medium">Equilibrada</option><option value="high">Caprichada</option></select></label><label>Limite de quadros<select id="frame-limit"><option value="60">60 FPS · Fluido</option><option value="30">30 FPS · Economia</option></select></label><label class="check-row"><input id="reduced-motion" type="checkbox" ${this.settings.reducedMotion ? 'checked' : ''}/> Reduzir movimento da câmera</label><label class="check-row"><input id="ads-toggle" type="checkbox" ${this.settings.adsToggle ? 'checked' : ''}/> Alternar mira com um clique</label><label class="check-row"><input id="adaptive" type="checkbox" ${this.settings.adaptive ? 'checked' : ''}/><span>Ajuste automático dos bots no treino<small>Como na v1: fica mais manso se você vem perdendo e mais bravo se vem ganhando.</small></span></label></section><section><h3>O SOM DA ILHA</h3>${ranges(['master', 'effects', 'ambience', 'music'])}</section></div><details class="bindings"><summary>PERSONALIZAR TECLAS</summary><div class="binding-grid">${Object.keys(DEFAULT_BINDINGS).map(key => `<label>${bindingLabels[key]}<button type="button" class="key-binding" data-binding="${key}">${keyName(this.settings.bindings[key])}</button></label>`).join('')}</div></details><p class="form-note">As preferências ficam salvas neste navegador.</p><button class="button primary full-width" id="save-settings">TUDO CERTO ${icon('check')}</button>`);
    dialog.querySelector<HTMLSelectElement>('#graphics')!.value = this.settings.graphics;
    dialog.querySelector<HTMLSelectElement>('#frame-limit')!.value = String(this.settings.frameLimit);
    dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => input.addEventListener('input', () => { const key = input.dataset.setting as keyof typeof labels; this.settings[key] = Number(input.value); input.parentElement!.querySelector('output')!.textContent = input.value; this.callbacks.settings(this.settings); }));
    dialog.querySelector('#graphics')!.addEventListener('change', event => { this.settings.graphics = (event.target as HTMLSelectElement).value as Settings['graphics']; this.callbacks.settings(this.settings); });
    dialog.querySelector('#frame-limit')!.addEventListener('change', event => { this.settings.frameLimit = Number((event.target as HTMLSelectElement).value) === 30 ? 30 : 60; this.callbacks.settings(this.settings); });
    dialog.querySelector('#reduced-motion')!.addEventListener('change', event => { this.settings.reducedMotion = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    dialog.querySelector('#ads-toggle')!.addEventListener('change', event => { this.settings.adsToggle = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    dialog.querySelector('#adaptive')!.addEventListener('change', event => { this.settings.adaptive = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    const keyCapture = new AbortController(); dialog.addEventListener('close', () => keyCapture.abort());
    dialog.querySelectorAll<HTMLButtonElement>('[data-binding]').forEach(button => button.addEventListener('click', () => {
      button.textContent = 'PRESSIONE UMA TECLA';
      const capture = (event: KeyboardEvent) => {
        event.preventDefault(); event.stopPropagation(); document.removeEventListener('keydown', capture, true);
        if (/^(Key[A-Z]|Shift(Left|Right)|Control(Left|Right)|Space|Arrow(Up|Down|Left|Right))$/.test(event.code)) { const key = button.dataset.binding!, old = this.settings.bindings[key]; for (const action in this.settings.bindings) if (this.settings.bindings[action] === event.code) this.settings.bindings[action] = old; this.settings.bindings[key] = event.code; this.callbacks.settings(this.settings); }
        dialog.querySelectorAll<HTMLButtonElement>('[data-binding]').forEach(b => { b.textContent = keyName(this.settings.bindings[b.dataset.binding!]); });
      }; document.addEventListener('keydown', capture, { capture: true, signal: keyCapture.signal });
    }));
    dialog.querySelector('#save-settings')!.addEventListener('click', () => this.closeModal());
  }
  private howModal() {
    this.openModal('INSTINTO DE SOBREVIVÊNCIA.', `<div class="how-grid"><div>${icon('users')}<h3>CHAME A TURMA</h3><p>Crie uma sala e compartilhe o link. Quem cria mantém o jogo aberto. Sem cadastro, sem instalação.</p></div><div>${icon('crown')}<h3>ÚLTIMA DE PÉ</h3><p>Salte do avião, abra baús e encontre armas. A tempestade fecha a ilha. Sobreviva até o fim.</p></div><div>${icon('bolt')}<h3>CORRERIA</h3><p>Mais eliminações vence. Você reaparece depois de cair, pronto para voltar à luta.</p></div></div><div class="controls-grid">${[['W A S D','MOVER'],['MOUSE','OLHAR'],['M1 / M2','ATIRAR / MIRAR'],['ESPAÇO','PULAR / PARAQUEDAS'],['SHIFT','CORRER'],['C','AGACHAR'],['Q / E','ESPIAR'],['F','PEGAR / ABRIR'],['R','RECARREGAR'],['1–4','TROCAR ARMA'],['5–9','USAR CONSUMÍVEL'],['TAB','PLACAR'],['M','MAPA DA ILHA']].map(([key, text]) => `<span><kbd>${key}</kbd> ${text}</span>`).join('')}</div>`);
  }
  event(event: GameEvent) {
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
        const vign = this.el('vign'); vign.classList.remove('hit'); void vign.offsetWidth; vign.classList.add('hit');
        const me = find(this.localId), source = find(event.actor);
        if (me && source && source !== me) {
          const burst = document.createElement('div'); burst.className = 'di'; burst.innerHTML = HUD_ART.burst;
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
        const line = killer && event.weapon !== 'storm' && event.weapon !== 'fall' ? DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)](killer.name) : event.weapon === 'fall' ? 'O chão ganhou essa' : 'A tempestade te engoliu';
        this.deathInfo = { place: others + 1, line };
      }
      this.lastHits.delete(event.target);
    }
    if (event.type === 'pickup' && event.actor === this.localId) {
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
    const banner = this.el('banner'); if (html) banner.innerHTML = html; banner.classList.toggle('on', !!html);
  }
  private hitMarker(kind: '' | 'head' | 'kill') {
    const marker = this.el('hitm'); marker.classList.toggle('head', kind === 'head'); marker.classList.toggle('kill', kind === 'kill');
    marker.classList.remove('on'); void marker.offsetWidth; marker.classList.add('on');
  }
  // Damage numbers and callouts float up next to the crosshair (the HUD has no camera to project world points).
  private floater(text: string, cls: string) {
    const layer = this.el('nums'), el = document.createElement('div'); el.className = cls; el.textContent = text;
    el.style.left = `calc(50% + ${Math.round(28 + Math.random() * 30) * (Math.random() < .5 ? -1 : 1)}px)`;
    el.style.top = `calc(50% - ${cls.startsWith('pop') ? 70 : 34}px)`; el.style.rotate = `${(Math.random() * 16 - 8).toFixed(1)}deg`;
    layer.appendChild(el); window.setTimeout(() => el.remove(), 900);
    while (layer.children.length > 14) layer.firstElementChild!.remove();
  }
  private localAngle(me: ActorState, x: number, z: number) {
    const dx = x - me.pos.x, dz = z - me.pos.z;
    return Math.atan2(dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw), -dx * Math.sin(me.yaw) - dz * Math.cos(me.yaw));
  }
  toast(message: string, error = false) { if (error) { const line = this.root.querySelector('#lockErr'); if (line) line.textContent = message; } const toast = document.querySelector<HTMLElement>('#toast')!; toast.textContent = message; toast.classList.add('visible'); toast.classList.toggle('error', error); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), error ? 7000 : 4000); }
  private el(id: string) { return this.root.querySelector<HTMLElement>(`#${id}`)!; }
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
    for (const district of this.world.districts) {
      const x = X(district.x), y = Z(district.z); if (x < -60 || y < -20 || x > size + 60 || y > size + 20) continue;
      const label = district.name.toUpperCase(), w = ctx.measureText(label).width / 2 + 6, lx = clamp(x, w, size - w), ly = clamp(y, 14, size - 14);
      ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly);
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
  setLoadingProgress(fraction: number, label?: string) {
    const overlay = this.root.querySelector<HTMLElement>('#loadingOverlay');
    const bar = overlay?.querySelector<HTMLElement>('.lbar');
    const fill = bar?.querySelector<HTMLElement>('i');
    if (!overlay || !bar || !fill || !Number.isFinite(fraction)) return;
    const next = Math.max(0, Math.min(1, fraction));
    if (next < Number(overlay.dataset.progress || 0)) return;
    overlay.dataset.progress = String(next);
    const percent = Math.round(next * 100);
    bar.classList.add('determinate');
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Carregamento da ilha');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(percent));
    fill.style.width = `${percent}%`;
    const status = overlay.querySelector('.lstatus');
    if (status && (label !== undefined || next === 1)) status.textContent = next === 1 ? 'Pronto!' : label!.trim().replace(/(?:\.\.\.|…)$/, '').slice(0, 28);
  }

  // Match loading screen: covers the scene until the island is loaded and the first real frame is drawn.
  setLoading(on: boolean) {
    clearInterval(this.tipTimer);
    const current = this.root.querySelector<HTMLElement>('#loadingOverlay');
    if (!on) { if (current) { current.classList.add('out'); window.setTimeout(() => current.remove(), 350); } return; }
    if (current || this.screen !== 'game') return;
    const tips = ['Aperte M pra ver a ilha inteira.', 'Q e E espiam pelas quinas.', 'Fora da área segura, a tempestade tira vida a cada segundo.', 'Caixas de suprimentos guardam armas e equipamento.', 'Tab mostra o placar da turma.', 'No avião, Espaço salta. No ar, abre o paraquedas.'];
    let tip = Math.floor(Math.random() * tips.length);
    const overlay = document.createElement('div'); overlay.id = 'loadingOverlay';
    overlay.innerHTML = `<div class="lcard stk"><div class="lcapy">${capybara(this.profile.color)}</div><h2>Carregando a ilha…</h2><div class="lbar"><i></i></div><span class="lstatus" role="status"></span><p class="ltip"><b>Dica</b> <span>${tips[tip]}</span></p></div>`;
    this.root.appendChild(overlay);
    this.tipTimer = window.setInterval(() => { tip = (tip + 1) % tips.length; const line = overlay.querySelector('.ltip span'); if (line) line.textContent = tips[tip]; }, 2600);
  }
  toggleMap(open = !this.mapOpen) {
    if (this.screen !== 'game') return; const big = this.root.querySelector<HTMLElement>('#bigmap'); if (!big) return;
    this.mapOpen = open && !this.root.querySelector('#hud.ended'); big.hidden = !this.mapOpen; this.hudTime = 0;
  }
}
