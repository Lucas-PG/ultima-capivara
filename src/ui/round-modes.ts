import type { ActorState, BuyItemId, Mode, RoomConfig, WorldSnapshot } from '../shared/types';
import { isRoundMode } from '../shared/types';
import { BUY_SECONDS, ELIMINATION_MONEY, purchaseBlocked, ROUND_TARGET, SHOP, TEAM_NAMES, WIN_MONEY } from '../shared/round-modes';
import { WEAPONS } from '../shared/weapons';
import { escapeHtml as esc, icon, itemIcon, uiArt, weaponIcon } from './icons';

const money = (amount: number) => `$ ${Math.floor(amount).toLocaleString('pt-BR')}`;
const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.ceil(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
export const roundModeName = (mode: Mode) => mode === 'duel' ? 'DUELO' : 'TURMA CONTRA TURMA';
export const roundRules = (config: RoomConfig) => config.mode === 'duel' ?
  `1 contra 1. A mesma arma sorteada para os dois a cada rodada. Uma vida por rodada. Primeiro a ${ROUND_TARGET} vence!` :
  `${config.teamSize ?? 2} contra ${config.teamSize ?? 2}. Elimine toda a outra turma para levar a rodada. ${BUY_SECONDS}s para comprar. Primeira turma a ${ROUND_TARGET} vence!`;
export function roundModeCards(selected: Mode) {
  return (['duel', 'squads'] as const).map((mode, i) => `<button class="mode-card round-mode-card ${mode}${selected === mode ? ' selected' : ''}" data-mode="${mode}" aria-pressed="${selected === mode}"><div class="mode-art painted" style="--art:url(${uiArt(mode === 'duel' ? 'mode-corrente' : 'mode-correria')})"><span class="mode-index">0${i + 4}</span></div><div class="mode-copy"><span class="mode-tag">${mode === 'duel' ? '1 CONTRA 1' : '2V2 OU 3V3'}</span><h2>${roundModeName(mode)}</h2><p>${mode === 'duel' ? 'Mesma arma. Nova rodada.<br>Quem leva cinco primeiro?' : 'Uma vida por rodada.<br>Equipe sua turma e vença.'}</p><span class="mode-meta">${icon('crown')} ${ROUND_TARGET} RODADAS PARA VENCER <b class="selection-mark">${icon('check')}</b></span></div></button>`).join('');
}
export function roundResult(snapshot: WorldSnapshot, me: ActorState | undefined) {
  const round = snapshot.round;
  if (!round) return '';
  const own = me?.team ?? 0, other = own === 0 ? 1 : 0;
  return `<div class="round-result"><span>${snapshot.config.mode === 'squads' ? `Turma ${TEAM_NAMES[own]}` : 'Seu duelo'}</span><b>${round.score[own]} <small>a</small> ${round.score[other]}</b><span>Rodadas · primeiro a ${round.target}</span></div>`;
}

interface RoundCallbacks {
  buy(item: BuyItemId, round: number): void;
  refund(round: number): void;
  release(): void;
  resume(): void;
}

/** Optional mode surfaces own their DOM. The regular HUD keeps its layout and update costs. */
export class RoundModesUI {
  private hud: HTMLElement;
  private dialog: HTMLDialogElement | null = null;
  private snapshot: WorldSnapshot | null = null;
  private me: ActorState | null = null;
  private key = '';
  private shopKey = '';
  private buyKey = 'O';
  private thumbs: Map<string, string> | null = null;
  private readonly click: (event: MouseEvent) => void;
  constructor(parent: HTMLElement, private callbacks: RoundCallbacks) {
    this.hud = document.createElement('section'); this.hud.id = 'round-hud'; this.hud.hidden = true;
    this.hud.setAttribute('aria-label', 'Placar de rodadas'); parent.append(this.hud);
    this.click = event => { if ((event.target as Element).closest('[data-open-shop]')) this.open(); };
    this.hud.addEventListener('click', this.click);
  }
  get buying() { return !!this.dialog; }
  update(snapshot: WorldSnapshot, me: ActorState, buyKey: string, thumbs: Map<string, string> | null) {
    this.snapshot = snapshot; this.me = me; this.buyKey = buyKey; this.thumbs = thumbs;
    const round = snapshot.round;
    this.hud.hidden = !round || snapshot.phase !== 'playing';
    if (!round || !isRoundMode(snapshot.config.mode)) { this.close(false); return; }
    if (this.dialog && (round.phase !== 'buy' || !me.alive || snapshot.phase === 'results')) this.close(true);
    const seconds = Math.max(0, Math.ceil(round.endsAt - snapshot.time));
    const key = `${round.number}:${round.phase}:${round.score}:${seconds}:${round.weapon}:${me.money}:${buyKey}:${snapshot.phase}:` + snapshot.actors.map(a => `${a.id}:${a.name}:${a.alive}`).join('|');
    if (this.key !== key) {
      this.key = key;
      const title = round.phase === 'buy' ? snapshot.config.mode === 'duel' ? 'Prepare o duelo' : 'Hora de equipar' : round.phase === 'over' ?
        round.winner === null ? 'Empate nesta rodada' : round.winner === me.team ? 'Sua rodada!' : 'A outra turma levou' : `Rodada ${round.number}`;
      const teams = ([0, 1] as const).map(team => {
        const actors = snapshot.actors.filter(actor => actor.team === team);
        const label = snapshot.config.mode === 'duel' ? me.team === team ? 'Você' : actors[0]?.name ?? 'Capivara' : TEAM_NAMES[team];
        return `<div class="round-side side-${team}${me.team === team ? ' your-team' : ''}" aria-label="${esc(label)}${me.team === team ? ', sua turma' : ''}"><span title="${esc(label)}">${esc(label)}</span><b>${round.score[team]}</b><small>${actors.filter(actor => actor.alive).length} em pé</small></div>`;
      });
      this.hud.innerHTML = `<div class="round-score">${teams[0]}<div class="round-clock"><small>${esc(title)}</small><b>${clock(seconds)}</b><span>Até ${round.target} pontos</span></div>${teams[1]}</div>` +
        (snapshot.config.mode === 'duel' ? `<div class="round-kit">${weaponIcon(round.weapon ?? '')}<span>${esc(round.weapon ? WEAPONS[round.weapon].name : '')} para os dois</span></div>` :
          `<button class="round-wallet" data-open-shop ${round.phase !== 'buy' || snapshot.phase !== 'playing' || !me.alive ? 'disabled' : ''}><b>${money(me.money ?? 0)}</b><span>${round.phase === 'buy' ? `<kbd>${esc(buyKey || 'Clique')}</kbd> Comprar` : `Sua turma: ${TEAM_NAMES[me.team ?? 0]}`}</span></button>`);
    }
    if (this.dialog) this.updateShop();
  }
  open() {
    const s = this.snapshot, me = this.me;
    if (!s?.round || s.config.mode !== 'squads' || s.round.phase !== 'buy' || s.phase !== 'playing' || !me?.alive || this.dialog) return false;
    const dialog = document.createElement('dialog'); dialog.className = 'round-shop';
    dialog.setAttribute('aria-labelledby', 'shop-title');
    const card = (item: typeof SHOP[number]) => {
      const weapon = Object.hasOwn(WEAPONS, item.id), label = weapon ? WEAPONS[item.id as keyof typeof WEAPONS].name : item.id === 'armor' ? 'Colete' : item.id === 'helmet' ? 'Capacete' : 'Kit médico';
      const thumb = this.thumbs?.get(item.id);
      const art = weapon ? thumb ? `<img src="${thumb}" alt="" draggable="false">` : weaponIcon(item.id) : itemIcon(item.id);
      return `<button type="button" class="shop-card" data-buy="${item.id}" aria-label="Comprar ${label} por ${item.price} moedas"><span class="shop-art">${art}</span><strong>${esc(label)}</strong><small>${esc(item.description)}</small><b>${money(item.price)}</b><span class="shop-status"></span></button>`;
    };
    dialog.innerHTML = `<header><div><span class="shop-eyebrow">TURMA ${TEAM_NAMES[me.team ?? 0].toUpperCase()} · RODADA ${s.round.number}</span><h2 id="shop-title">Banca da turma</h2></div><div class="shop-balance"><small>Suas moedas</small><b id="shop-money"></b><span id="shop-timer"></span></div></header><p class="shop-rule">Uma vida por rodada. Quem fica de pé guarda o equipamento.</p><div class="shop-shelves"><section><h3>Escolha sua arma</h3><div class="shop-weapons">${SHOP.filter(item => Object.hasOwn(WEAPONS, item.id)).map(card).join('')}</div></section><section><h3>Fôlego extra</h3><div class="shop-equipment">${SHOP.filter(item => !Object.hasOwn(WEAPONS, item.id)).map(card).join('')}</div></section></div><footer><p>Vitória ${money(WIN_MONEY)} · eliminação ${money(ELIMINATION_MONEY)}<br>Derrota rende de $ 1.900 a $ 3.400.</p><div><button type="button" class="shop-refund">Devolver compras</button><button type="button" class="shop-done">Tudo pronto ${icon('check')}</button></div></footer>`;
    this.dialog = dialog; this.shopKey = ''; document.body.append(dialog);
    dialog.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLElement>('button'); if (!target || !this.snapshot?.round) return;
      if (target.dataset.buy) this.callbacks.buy(target.dataset.buy as BuyItemId, this.snapshot.round.number);
      else if (target.classList.contains('shop-refund')) this.callbacks.refund(this.snapshot.round.number);
      else if (target.classList.contains('shop-done')) this.close(true);
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(true); });
    this.callbacks.release(); dialog.showModal(); this.updateShop();
    return true;
  }
  private updateShop() {
    if (!this.dialog || !this.me || !this.snapshot?.round) return;
    const actor = this.me, round = this.snapshot.round;
    this.dialog.querySelector('#shop-timer')!.textContent = `${Math.max(0, Math.ceil(round.endsAt - this.snapshot.time))}s para comprar`;
    const key = `${actor.money}:${actor.armor}:${actor.helmet}:${actor.consumables.medkit}:${actor.weapons.map(w => w.id)}`;
    if (this.shopKey === key) return;
    this.shopKey = key;
    this.dialog.querySelector('#shop-money')!.textContent = money(actor.money ?? 0);
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button => {
      const blocked = purchaseBlocked(actor, button.dataset.buy as BuyItemId);
      button.disabled = !!blocked;
      button.classList.toggle('owned', blocked === 'Já equipado');
      button.querySelector('.shop-status')!.textContent = blocked ?? 'Comprar';
    });
  }
  close(resume = false) {
    if (!this.dialog) return;
    this.dialog.close(); this.dialog.remove(); this.dialog = null;
    if (resume) this.callbacks.resume();
  }
  dispose() { this.close(false); this.hud.removeEventListener('click', this.click); this.hud.remove(); }
}
