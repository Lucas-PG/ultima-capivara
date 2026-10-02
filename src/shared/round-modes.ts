import type { ActorState, BuyItemId, RoomConfig, RoundState, WeaponId, WorldSnapshot } from './types';

export const ROUND_TARGET = 5;
export const ROUND_SECONDS = 90;
export const BUY_SECONDS = 12;
export const DUEL_READY_SECONDS = 3;
export const ROUND_BREAK_SECONDS = 4;
export const START_MONEY = 800;
export const MAX_MONEY = 16_000;
export const WIN_MONEY = 2700;
export const ELIMINATION_MONEY = 300;
export const TEAM_NAMES = ['Maré', 'Brasa'] as const;
export const TEAM_COLORS = ['#1fb5a8', '#e76f51'] as const;
export const DUEL_WEAPONS: readonly WeaponId[] = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'coco'];
export const SHOP: readonly { id: BuyItemId; price: number; description: string }[] = [
  { id: 'revolver', price: 600, description: 'Seis tiros certeiros' },
  { id: 'smg', price: 1200, description: 'Rápida nas ruas da vila' },
  { id: 'shotgun', price: 1600, description: 'Forte de pertinho' },
  { id: 'm4', price: 2900, description: 'Versátil e automática' },
  { id: 'dmr', price: 3500, description: 'Precisão com luneta' },
  { id: 'sniper', price: 4500, description: 'Potente, um tiro por vez' },
  { id: 'coco', price: 3200, description: 'Coco explosivo em arco' },
  { id: 'armor', price: 650, description: 'Completa 100 de colete' },
  { id: 'helmet', price: 350, description: 'Protege a cabeça' },
  { id: 'medkit', price: 400, description: 'Vida cheia em 5 segundos' },
];
export const isBuyItem = (id: unknown): id is BuyItemId => typeof id === 'string' && SHOP.some(item => item.id === id);
export const sameTeam = (a: Pick<ActorState, 'team'>, b: Pick<ActorState, 'team'>) => a.team !== undefined && a.team === b.team;
export function roundSpectators(snapshot: WorldSnapshot, localId: string): ActorState[] {
  const team = snapshot.actors.find(actor => actor.id === localId)?.team;
  return snapshot.config.mode === 'squads' ? snapshot.actors.filter(actor => actor.team === team) : snapshot.actors;
}
export const lossMoney = (consecutiveLosses: number) => Math.min(3400, 1900 + Math.max(0, consecutiveLosses - 1) * 500);
export const addMoney = (actor: ActorState, amount: number) => { actor.money = Math.min(MAX_MONEY, Math.max(0, (actor.money ?? 0) + amount)); };

export function roundConfig(config: RoomConfig): RoomConfig {
  if (config.mode === 'duel') return { ...config, capacity: 2 };
  if (config.mode === 'squads') { const teamSize = config.teamSize === 3 ? 3 : 2; return { ...config, teamSize, capacity: teamSize * 2 }; }
  return config;
}

/** The host draws once per round. Excluding the last gun avoids a silent repeat. */
export function drawDuelWeapon(random: () => number, previous: WeaponId | null): WeaponId {
  const pool = DUEL_WEAPONS.filter(id => id !== previous);
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}

export function purchaseBlocked(actor: ActorState, id: BuyItemId): string | null {
  const item = SHOP.find(item => item.id === id);
  if (!item) return 'Item indisponível';
  if (id === 'armor' && actor.armor >= 100 || id === 'helmet' && actor.helmet >= 60 || id === 'medkit' && actor.consumables.medkit >= 1 || actor.weapons.some(w => w.id === id)) return 'Já equipado';
  if ((actor.money ?? 0) < item.price) return 'Faltam moedas';
  return null;
}

/** Shape checks are shared by the reliable purchase path and snapshot decoder. */
export function validRound(value: unknown): value is RoundState {
  const r = value as RoundState;
  return !!r && Number.isSafeInteger(r.number) && r.number >= 1 && ['buy', 'live', 'over'].includes(r.phase) &&
    Number.isFinite(r.endsAt) && r.endsAt >= 0 && r.target === ROUND_TARGET && Array.isArray(r.score) && r.score.length === 2 &&
    r.score.every(score => Number.isInteger(score) && score >= 0 && score <= ROUND_TARGET) &&
    (r.winner === null || r.winner === 0 || r.winner === 1) && (r.weapon === null || DUEL_WEAPONS.includes(r.weapon));
}
