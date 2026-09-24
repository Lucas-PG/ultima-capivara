import { DEFAULT_CONFIG, PLAYER_COLORS, type ActorState, type GameEvent, type Mode, type RoomConfig, type RoomState, type Settings, type WorldSnapshot, type WorldSpec } from '../shared/types';
import { terrainHeight } from '../shared/terrain';
import { WEAPONS } from '../shared/weapons';
import { DEFAULT_BINDINGS } from '../settings';
import { capybara, escapeHtml as esc, icon } from './icons';

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
  private hitTimer = 0;
  private localId = '';
  constructor(private world: WorldSpec, private settings: Settings, private profile: Profile, private callbacks: UICallbacks) {
    this.drawMapBackground(); this.home();
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
      }
    });
  }
  private header(back = false) {
    return `<header class="topbar"><button class="brand" data-do="home" aria-label="Tela inicial"><img src="./assets/favicon.svg" alt=""/><span>ÚLTIMA<br><b>CAPIVARA</b></span></button><nav>${back ? `<button class="nav-link" data-do="leave">${icon('back')} VOLTAR</button>` : '<span class="nav-link active">JOGAR</span><button class="nav-link" data-do="how">COMO JOGAR</button>'}<button class="icon-button" data-do="settings" aria-label="Configurações">${icon('settings')}</button></nav><div class="edition"><span class="live-dot"></span> EDIÇÃO ILHA <b>V2</b></div></header>`;
  }
  home() {
    this.screen = 'home'; this.lastResults = ''; document.body.dataset.screen = 'home';
    this.root.innerHTML = `${this.header()}<main class="home-content"><section class="hero-copy"><p class="eyebrow"><span></span> A ILHA É NOSSA.</p><h1>ÚLTIMA<br><em>CAPIVARA</em><span class="title-stamp">SÓ UMA<br>FICA DE PÉ.</span></h1><p class="hero-description">Chame a turma. Escolha seu lugar na ilha.<br>O resto é instinto de sobrevivência.</p><div class="hero-actions"><button class="button primary" data-do="host">${icon('plus')} CRIAR SALA ${icon('arrow')}</button><button class="button secondary" data-do="join">${icon('users')} ENTRAR</button></div><button class="practice-link" data-do="practice">${icon('crosshair')} Aquecer com os bots <span>↗</span></button><div class="hero-facts"><span>${icon('users')} ATÉ 16 AMIGOS</span><i></i><span>${icon('globe')} NO NAVEGADOR</span><i></i><span>100% GRÁTIS</span></div></section><section class="mode-section" aria-label="Escolha o modo"><div class="section-heading"><span>ESCOLHA SUA CONFUSÃO</span><small>02 MODOS DE JOGO</small></div><div class="mode-grid"><button class="mode-card royale selected" data-mode="battle-royale" aria-pressed="true"><div class="mode-art">${icon('crown')}<span class="mode-index">01</span></div><div class="mode-copy"><span class="mode-tag">BATTLE ROYALE</span><h2>ÚLTIMA DE PÉ</h2><p>Uma ilha. Uma vida. Nenhuma segunda chance.</p><span class="mode-meta">${icon('users')} ATÉ 21 BICHOS <b class="selection-mark">${icon('check')}</b></span></div></button><button class="mode-card deathmatch" data-mode="deathmatch" aria-pressed="false"><div class="mode-art">${icon('bolt')}<span class="mode-index">02</span></div><div class="mode-copy"><span class="mode-tag">COMBATE POR TEMPO</span><h2>CORRERIA</h2><p>Caiu? Volta. Mais eliminações, mais glória.</p><span class="mode-meta">${icon('clock')} 8 MINUTOS <b class="selection-mark">${icon('check')}</b></span></div></button></div></section></main><footer class="home-footer"><span>${icon('leaf')} FEITO PARA JOGAR JUNTO.</span><span>ILHA DAS CAPIVARAS <i>22° S / 43° O</i></span><button data-do="how">CONTROLES ${icon('mouse')}</button></footer>`;
  }
  private openModal(title: string, content: string) {
    this.closeModal(); const dialog = document.createElement('dialog'); dialog.className = 'modal';
    dialog.innerHTML = `<div class="modal-heading"><div><p class="eyebrow">ÚLTIMA CAPIVARA</p><h2>${title}</h2></div><button class="icon-button close-modal" aria-label="Fechar">${icon('close')}</button></div>${content}`;
    document.body.append(dialog); this.modal = dialog;
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
    this.localId = playerId; this.screen = 'game'; this.inventoryKey = ''; this.lastResults = ''; document.body.dataset.screen = 'game';
    this.root.innerHTML = `<div class="hud" id="hud"><div id="scope-overlay" class="scope-overlay" hidden><i></i><b></b><span>×</span></div><div class="match-top"><div class="match-label"><img src="./assets/favicon.svg" alt=""/><div><span id="hud-mode">ÚLTIMA DE PÉ</span><strong id="hud-objective">Prepare-se.</strong></div></div><div class="match-stats"><span>${icon('users')} <b id="hud-alive">21</b></span><span>${icon('crosshair')} <b id="hud-kills">0</b></span><span id="hud-timer">0:00</span></div></div><div class="compass" id="compass">N</div><div class="minimap"><canvas width="320" height="320" id="minimap"></canvas><div><span id="hud-district">ILHA</span><small id="hud-ping">LOCAL</small></div></div><div id="kill-feed" class="kill-feed"></div><div class="crosshair" id="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hit-marker" class="hit-marker">×</div><div class="damage-overlay" id="damage-overlay"></div><div class="storm-warning" id="storm-warning" hidden>${icon('bolt')} FORA DA ÁREA SEGURA</div><div class="center-notice" id="center-notice"></div><div class="interaction-prompt" id="interaction" hidden></div><div class="action-progress" id="action-progress" hidden><span></span><i></i></div><div class="player-vitals"><div class="player-portrait">${capybara(this.profile.color)}</div><div class="vitals-bars"><div class="health-label">${icon('heart')}<strong id="hud-health">100</strong><small id="hud-protection"></small></div><div class="meter health"><i id="health-fill"></i></div><div class="armor-line">${icon('shield')}<span class="meter armor"><i id="armor-fill"></i></span><b id="hud-armor">0</b></div></div></div><div class="consumables" id="consumables"></div><div class="weapon-panel"><div class="weapon-name"><span id="weapon-category">EQUIPAMENTO</span><strong id="weapon-name">PISTOLA</strong></div><div class="ammo-count"><b id="ammo-current">17</b><span>/ <i id="ammo-reserve">68</i></span></div><div id="weapon-slots" class="weapon-slots"></div></div><div class="hud-help"><kbd>ESC</kbd> MENU <kbd>TAB</kbd> PLACAR <kbd>F</kbd> INTERAGIR</div></div><div id="scoreboard" class="scoreboard" hidden></div><div id="pause-panel" class="pause-panel" hidden></div>`;
  }
  update(snapshot: WorldSnapshot, playerId: string, ping: number, scoreboard: boolean, fps: number, interaction: { id: string; name: string } | null) {
    this.snapshot = snapshot; this.localId = playerId;
    if (snapshot.phase === 'results') { if (this.lastResults !== snapshot.matchId) { this.lastResults = snapshot.matchId; this.results(snapshot); } return; }
    if (this.screen !== 'game') this.game(playerId);
    const me = snapshot.actors.find(a => a.id === playerId); if (!me) return;
    const now = performance.now(); if (now - this.hudTime < 75) return; this.hudTime = now;
    this.text('hud-mode', modeName(snapshot.config.mode)); this.text('hud-objective', snapshot.config.mode === 'deathmatch' ? 'MAIS ELIMINAÇÕES VENCE' : 'SEJA A ÚLTIMA DE PÉ');
    this.text('hud-alive', snapshot.actors.filter(a => a.alive).length); this.text('hud-kills', me.kills);
    this.text('hud-timer', clock(snapshot.config.mode === 'deathmatch' ? snapshot.remaining : snapshot.zone.timeLeft));
    this.text('hud-health', Math.max(0, Math.ceil(me.hp))); this.text('hud-armor', Math.ceil(me.armor));
    this.text('hud-protection', snapshot.time < me.protectionUntil ? 'PROTEGIDO' : ''); this.text('hud-ping', `${ping ? `${Math.round(ping)} ms` : 'LOCAL'} · ${Math.round(fps)} FPS`);
    this.el('health-fill').style.width = `${Math.max(0, me.hp)}%`; this.el('armor-fill').style.width = `${Math.max(0, me.armor)}%`;
    const direction = ((-me.yaw * 180 / Math.PI) % 360 + 360) % 360; this.text('compass', `· · · ${['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(direction / 45) % 8]}  ${Math.round(direction)}° · · ·`);
    const nearest = this.world.districts.reduce((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) < Math.hypot(b.x - me.pos.x, b.z - me.pos.z) ? a : b); this.text('hud-district', nearest.name.toUpperCase());
    const weapon = me.weapons[me.slot]; this.text('weapon-name', weapon ? WEAPONS[weapon.id].name : 'DESARMADO'); this.text('weapon-category', weapon ? ['COMUM', 'RARA', 'ÉPICA', 'LENDÁRIA'][weapon.rarity] || 'COMUM' : 'EQUIPAMENTO'); this.text('ammo-current', weapon?.id === 'machete' ? '∞' : weapon?.ammo ?? 0); this.text('ammo-reserve', weapon?.reserve ?? 0);
    const inventoryKey = JSON.stringify([me.weapons.map(w => [w.id, w.rarity]), me.slot, me.consumables]);
    if (this.inventoryKey !== inventoryKey) { this.inventoryKey = inventoryKey; this.el('weapon-slots').innerHTML = me.weapons.map((w, i) => `<div class="weapon-slot ${i === me.slot ? 'active' : ''}"><kbd>${i + 1}</kbd><span>${esc(WEAPONS[w.id].shortName)}</span></div>`).join(''); this.el('consumables').innerHTML = Object.entries(me.consumables).map(([, count], i) => `<span class="consumable ${count ? '' : 'empty'}"><kbd>${i + 5}</kbd><b>${['FAIXA', 'KIT', 'GUARANÁ', 'AÇAÍ', 'RAPADURA'][i]}</b><i>${count}</i></span>`).join(''); }
    const notice = this.el('center-notice');
    const noticeText = snapshot.phase === 'countdown' ? `<span>PREPARE-SE</span><strong>${Math.ceil(snapshot.countdown)}</strong><small>A ilha está esperando.</small>` : !me.alive ? snapshot.config.mode === 'deathmatch' ? `<span>VOCÊ CAIU</span><strong>${Math.max(0, Math.ceil(me.respawnAt - snapshot.time))}</strong><small>Respawn em instantes. A correria continua.</small>` : `<span>FIM DA SUA JORNADA</span><strong>BOA CAÇADA.</strong><small>Acompanhe quem continua na ilha. Espaço troca de capivara; Esc abre o menu.</small><button class="button secondary" data-do="spectate">PRÓXIMA CAPIVARA ${icon('arrow')}</button>` : me.stage === 'plane' ? `<span>ESCOLHA SEU LUGAR</span><strong>A ILHA É SUA.</strong><small><kbd>${keyName(this.settings.bindings.jump)}</kbd> SALTAR DO AVIÃO</small>` : me.stage === 'falling' ? `<small><kbd>${keyName(this.settings.bindings.jump)}</kbd> ABRIR PARAQUEDAS</small>` : '';
    if (notice.innerHTML !== noticeText) notice.innerHTML = noticeText;
    const prompt = this.el('interaction'); prompt.hidden = !interaction || !me.alive || me.stage !== 'ground'; if (interaction) prompt.innerHTML = `<kbd>${keyName(this.settings.bindings.interact)}</kbd> ${esc(interaction.name)}`;
    const progress = this.el('action-progress'), until = Math.max(me.reloadUntil, me.useUntil); progress.hidden = until <= snapshot.time;
    if (!progress.hidden) { progress.querySelector('span')!.textContent = me.useUntil > snapshot.time ? 'RECUPERANDO…' : 'RECARREGANDO…'; progress.querySelector('i')!.style.width = `${Math.min(100, (until - snapshot.time) / (weapon ? WEAPONS[weapon.id].reload : 2) * 100)}%`; }
    this.el('storm-warning').hidden = snapshot.config.mode !== 'battle-royale' || !me.alive || me.stage !== 'ground' || Math.hypot(me.pos.x - snapshot.zone.x, me.pos.z - snapshot.zone.z) <= snapshot.zone.radius;
    const scoped = me.alive && me.ads && !me.sprint && me.reloadUntil <= snapshot.time && ['sniper', 'dmr'].includes(weapon?.id || '');
    this.el('scope-overlay').hidden = !scoped;
    this.el('crosshair').hidden = !me.alive || me.stage !== 'ground' || scoped; const score = this.el('scoreboard'); score.hidden = !scoreboard;
    if (scoreboard) score.innerHTML = `<div class="scoreboard-content"><p class="eyebrow">${modeName(snapshot.config.mode)}</p><h2>A TURMA NA ILHA</h2>${this.scoreTable(snapshot)}</div>`;
    this.drawMap(snapshot, me);
  }
  private scoreTable(snapshot: WorldSnapshot) {
    const actors = [...snapshot.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return `<table class="score-table"><thead><tr><th>CAPIVARA</th><th>ELIM.</th><th>MORTES</th><th>DANO</th></tr></thead><tbody>${actors.map((a, i) => `<tr class="${a.id === this.localId ? 'you' : ''}"><td><span class="rank">${i + 1}</span><i style="background:${/^#[a-f0-9]{6}$/i.test(a.color) ? a.color : '#bd8956'}"></i>${esc(a.name)}${a.bot ? '<small>BOT</small>' : a.id === this.localId ? '<small>VOCÊ</small>' : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${Math.round(a.damage)}</td></tr>`).join('')}</tbody></table>`;
  }
  private results(snapshot: WorldSnapshot) {
    this.screen = 'results'; document.body.dataset.screen = 'results'; const winners = snapshot.results.filter(r => r.winner), won = winners.some(r => r.id === this.localId), me = snapshot.results.find(r => r.id === this.localId);
    this.root.innerHTML = `${this.header(true)}<main class="results-content"><section class="results-hero"><div class="winner-emblem">${icon(won ? 'crown' : 'flag')}</div><p class="eyebrow">${modeName(snapshot.config.mode)} · PARTIDA ENCERRADA</p><h1>${won ? 'ESSA ILHA<br><em>É SUA.</em>' : 'ATÉ A PRÓXIMA,<br><em>CAPIVARA.</em>'}</h1><p>${winners.length ? `${winners.map(w => esc(w.name)).join(' e ')} ${winners.length > 1 ? 'dividem a vitória.' : 'ficou no topo.'}` : 'Ninguém escapou. A ilha venceu desta vez.'}</p><div class="result-stats"><div><b>${me?.kills ?? 0}</b><span>ELIMINAÇÕES</span></div><div><b>${Math.round(me?.damage ?? 0)}</b><span>DANO CAUSADO</span></div><div><b>${me ? `#${me.place}` : '–'}</b><span>COLOCAÇÃO</span></div></div><button class="button primary" data-do="rematch">${icon('users')} ${this.room ? 'VOLTAR PARA A TURMA' : 'MAIS UMA PARTIDA'} ${icon('arrow')}</button><button class="text-button" data-do="leave">VOLTAR AO INÍCIO</button></section><section class="results-board"><div class="section-heading"><span>PLACAR FINAL</span><small>${snapshot.actors.length} BICHOS</small></div>${this.scoreTable(snapshot)}</section></main>`;
  }
  setPaused(paused: boolean) {
    if (this.screen !== 'game') return; const panel = this.el('pause-panel'); panel.hidden = !paused;
    if (paused) panel.innerHTML = `<div class="pause-card"><p class="eyebrow">RESPIRA, CAPIVARA.</p><h2>UMA PAUSA<br>NO SEU RITMO.</h2><p>A ilha continua viva enquanto você está no menu.</p><button class="button primary full-width" data-do="resume">${icon('play')} ENTRAR NA PARTIDA</button><button class="button secondary full-width" data-do="settings">${icon('settings')} CONFIGURAÇÕES</button><button class="text-button" data-do="leave">SAIR DA PARTIDA</button></div>`;
  }
  private confirmLeave() {
    if (this.screen === 'home') return; const dialog = this.openModal('ATÉ LOGO, CAPIVARA?', `<p>${this.room?.isHost ? 'Você criou esta sala. Ao sair, a partida termina para toda a turma.' : 'Você vai sair desta partida e voltar ao início.'}</p><div class="modal-actions"><button class="button secondary" id="stay">FICAR</button><button class="button primary" id="exit">SAIR DA PARTIDA</button></div>`);
    dialog.querySelector('#stay')!.addEventListener('click', () => this.closeModal()); dialog.querySelector('#exit')!.addEventListener('click', () => { this.closeModal(); this.callbacks.leave(); });
  }
  private settingsModal() {
    const labels = { sensitivity: 'Sensibilidade do mouse', fov: 'Campo de visão', master: 'Volume geral', effects: 'Efeitos e combate', ambience: 'Ambiente', music: 'Música' };
    const ranges = (keys: (keyof typeof labels)[]) => keys.map(key => `<label class="slider-label">${labels[key]} <output>${this.settings[key]}</output><input type="range" data-setting="${key}" min="${key === 'fov' ? 60 : key === 'sensitivity' ? .2 : 0}" max="${key === 'fov' ? 105 : key === 'sensitivity' ? 3 : 1}" step="${key === 'fov' ? 1 : .05}" value="${this.settings[key]}"/></label>`).join('');
    const dialog = this.openModal('DO SEU JEITO.', `<div class="settings-grid"><section><h3>MOUSE E IMAGEM</h3>${ranges(['sensitivity', 'fov'])}<label>Qualidade gráfica<select id="graphics"><option value="low">Leve</option><option value="medium">Equilibrada</option><option value="high">Caprichada</option></select></label><label class="check-row"><input id="reduced-motion" type="checkbox" ${this.settings.reducedMotion ? 'checked' : ''}/> Reduzir movimento da câmera</label><label class="check-row"><input id="ads-toggle" type="checkbox" ${this.settings.adsToggle ? 'checked' : ''}/> Alternar mira com um clique</label></section><section><h3>O SOM DA ILHA</h3>${ranges(['master', 'effects', 'ambience', 'music'])}</section></div><details class="bindings"><summary>PERSONALIZAR TECLAS</summary><div class="binding-grid">${Object.keys(DEFAULT_BINDINGS).map(key => `<label>${bindingLabels[key]}<button type="button" class="key-binding" data-binding="${key}">${keyName(this.settings.bindings[key])}</button></label>`).join('')}</div></details><p class="form-note">As preferências ficam salvas neste navegador.</p><button class="button primary full-width" id="save-settings">TUDO CERTO ${icon('check')}</button>`);
    dialog.querySelector<HTMLSelectElement>('#graphics')!.value = this.settings.graphics;
    dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => input.addEventListener('input', () => { const key = input.dataset.setting as keyof typeof labels; this.settings[key] = Number(input.value); input.parentElement!.querySelector('output')!.textContent = input.value; this.callbacks.settings(this.settings); }));
    dialog.querySelector('#graphics')!.addEventListener('change', event => { this.settings.graphics = (event.target as HTMLSelectElement).value as Settings['graphics']; this.callbacks.settings(this.settings); });
    dialog.querySelector('#reduced-motion')!.addEventListener('change', event => { this.settings.reducedMotion = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
    dialog.querySelector('#ads-toggle')!.addEventListener('change', event => { this.settings.adsToggle = (event.target as HTMLInputElement).checked; this.callbacks.settings(this.settings); });
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
    this.openModal('INSTINTO DE SOBREVIVÊNCIA.', `<div class="how-grid"><div>${icon('users')}<h3>CHAME A TURMA</h3><p>Crie uma sala e compartilhe o link. Quem cria mantém o jogo aberto. Sem cadastro, sem instalação.</p></div><div>${icon('crown')}<h3>ÚLTIMA DE PÉ</h3><p>Salte do avião, abra baús e encontre armas. A tempestade fecha a ilha. Sobreviva até o fim.</p></div><div>${icon('bolt')}<h3>CORRERIA</h3><p>Mais eliminações vence. Você reaparece depois de cair, pronto para voltar à luta.</p></div></div><div class="controls-grid">${[['W A S D','MOVER'],['MOUSE','OLHAR'],['M1 / M2','ATIRAR / MIRAR'],['ESPAÇO','PULAR / PARAQUEDAS'],['SHIFT','CORRER'],['C','AGACHAR'],['Q / E','ESPIAR'],['F','PEGAR / ABRIR'],['R','RECARREGAR'],['1–4','TROCAR ARMA'],['5–9','USAR CONSUMÍVEL'],['TAB','PLACAR']].map(([key, text]) => `<span><kbd>${key}</kbd> ${text}</span>`).join('')}</div>`);
  }
  event(event: GameEvent) {
    if (event.type === 'notice') this.toast(event.text);
    if (event.type === 'damage' && event.actor === this.localId) { const marker = this.root.querySelector<HTMLElement>('#hit-marker'); if (marker) { marker.style.opacity = '1'; marker.style.color = event.head ? '#f3bf5d' : '#fff5dc'; clearTimeout(this.hitTimer); this.hitTimer = window.setTimeout(() => { marker.style.opacity = '0'; }, 140); } }
    if (event.type === 'damage' && event.target === this.localId) { const overlay = this.root.querySelector<HTMLElement>('#damage-overlay'); if (overlay) { overlay.classList.remove('flash'); void overlay.offsetWidth; overlay.classList.add('flash'); } }
    if (event.type === 'kill') { const feed = this.root.querySelector('#kill-feed'); if (!feed) return; const killer = this.snapshot?.actors.find(a => a.id === event.actor)?.name || (event.weapon === 'fall' ? 'QUEDA' : 'TEMPESTADE'), victim = this.snapshot?.actors.find(a => a.id === event.target)?.name || 'Capivara'; const entry = document.createElement('div'); entry.className = `kill-entry ${event.actor === this.localId ? 'own-kill' : ''}`; entry.innerHTML = `<b>${esc(killer)}</b>${icon('crosshair')}<span>${esc(victim)}</span>`; feed.prepend(entry); while (feed.children.length > 5) feed.lastElementChild!.remove(); window.setTimeout(() => entry.remove(), 6500); }
  }
  toast(message: string, error = false) { const toast = document.querySelector<HTMLElement>('#toast')!; toast.textContent = message; toast.classList.add('visible'); toast.classList.toggle('error', error); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), error ? 7000 : 4000); }
  private el(id: string) { return this.root.querySelector<HTMLElement>(`#${id}`)!; }
  private text(id: string, value: string | number) { const element = this.el(id); if (element && element.textContent !== String(value)) element.textContent = String(value); }
  private drawMapBackground() {
    this.mapBg.width = this.mapBg.height = 320; const ctx = this.mapBg.getContext('2d')!;
    for (let y = 0; y < 320; y += 4) for (let x = 0; x < 320; x += 4) { const h = terrainHeight((x / 320 - .5) * 260, (y / 320 - .5) * 260); ctx.fillStyle = h < 0 ? '#285858' : h < .7 ? '#af9d6c' : h > 7 ? '#839170' : '#4d6f53'; ctx.fillRect(x, y, 4, 4); }
    ctx.fillStyle = '#c0ab81'; for (const b of this.world.colliders) if (b.max.y - b.min.y > .6) ctx.fillRect((b.min.x / 260 + .5) * 320, (b.min.z / 260 + .5) * 320, Math.max(1, (b.max.x - b.min.x) / 260 * 320), Math.max(1, (b.max.z - b.min.z) / 260 * 320));
    ctx.strokeStyle = '#ffffff12'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40, 320); ctx.moveTo(0, i * 40); ctx.lineTo(320, i * 40); ctx.stroke(); }
  }
  private drawMap(snapshot: WorldSnapshot, actor: ActorState) {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#minimap'); if (!canvas) return; const ctx = canvas.getContext('2d')!, scale = 320 / 260, px = (x: number) => (x + 130) * scale; ctx.drawImage(this.mapBg, 0, 0);
    if (snapshot.config.mode === 'battle-royale') { ctx.fillStyle = '#75479c80'; ctx.beginPath(); ctx.rect(0, 0, 320, 320); ctx.arc(px(snapshot.zone.x), px(snapshot.zone.z), snapshot.zone.radius * scale, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.strokeStyle = '#f2eacc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px(snapshot.zone.x), px(snapshot.zone.z), snapshot.zone.radius * scale, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.strokeStyle = '#efc365'; ctx.lineWidth = 2; ctx.strokeRect(px(-100), px(-100), 115 * scale, 115 * scale); }
    ctx.save(); ctx.translate(px(actor.pos.x), px(actor.pos.z)); ctx.rotate(-actor.yaw); ctx.fillStyle = '#fff7da'; ctx.strokeStyle = '#19312d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
