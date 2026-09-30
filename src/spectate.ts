import type { ActorState, Vec3 } from './shared/types';

// Who the eliminated player watches, and when that changes. Pure and clocked by the caller (seconds), so every
// case is testable without a renderer: the hand-off after your own elimination, cycling both ways, a watched
// capybara that falls or leaves, and the moment nobody is left to watch.

/** Seconds the camera stays on a watched capybara that just fell, so the moment reads before the view moves on. */
export const TARGET_DOWN_HOLD = 1.8;

export type SpectateHold = { victim: string; killer: string | null; until: number; reason: 'down' | 'left' };
export interface SpectateView { target: string | null; hold: SpectateHold | null; index: number; count: number }

const watchable = (actor: ActorState, localId: string) => actor.alive && actor.id !== localId;
// Friends first (people you can hear on voice), then bots, then anyone whose connection dropped; stable within each.
const rank = (actor: ActorState) => !actor.connected ? 2 : actor.bot ? 1 : 0;

/** The watch order: living capybaras other than you, people before bots, dropped connections last. */
export function spectateOrder(actors: readonly ActorState[], localId: string): ActorState[] {
  return actors.map((actor, index) => ({ actor, index })).filter(({ actor }) => watchable(actor, localId))
    .sort((a, b) => rank(a.actor) - rank(b.actor) || a.index - b.index).map(({ actor }) => actor);
}

/** The next (1) or previous (-1) capybara in the watch order, wrapping; the first one when nothing is watched yet. */
export function cycleTarget(actors: readonly ActorState[], localId: string, current: string | null, direction: 1 | -1): string | null {
  const order = spectateOrder(actors, localId);
  if (!order.length) return null;
  const index = order.findIndex(actor => actor.id === current);
  if (index < 0) return (direction > 0 ? order[0] : order[order.length - 1]).id;
  return order[(index + direction + order.length) % order.length].id;
}

/** The living capybara closest to a point (where you fell), preferring connected ones. */
export function nearestTarget(actors: readonly ActorState[], localId: string, at: Vec3 | null): string | null {
  const order = spectateOrder(actors, localId);
  if (!order.length) return null;
  if (!at) return order[0].id;
  let best = order[0], distance = Infinity;
  for (const actor of order) {
    const d = Math.hypot(actor.pos.x - at.x, actor.pos.z - at.z) + (actor.connected ? 0 : 1e4);
    if (d < distance) { distance = d; best = actor; }
  }
  return best.id;
}

export class SpectateDirector {
  target: string | null = null;
  hold: SpectateHold | null = null;
  // Kills reach the client on the reliable channel and can overtake the snapshot that shows the victim down.
  private downs = new Map<string, string | null>();

  reset() { this.target = null; this.hold = null; this.downs.clear(); }
  get active() { return this.target !== null; }

  /** After your elimination (or joining mid-match): your eliminator if still standing, else whoever is nearest. */
  begin(actors: readonly ActorState[], localId: string, killer: string | null, at: Vec3 | null) {
    this.hold = null;
    const standing = killer && actors.some(actor => actor.id === killer && watchable(actor, localId));
    this.target = standing ? killer : nearestTarget(actors, localId, at);
  }

  /** A manual switch always wins over an automatic hold. */
  cycle(actors: readonly ActorState[], localId: string, direction: 1 | -1) {
    const from = this.hold ? this.hold.victim : this.target;
    this.hold = null;
    this.target = cycleTarget(actors, localId, from, direction);
  }

  /** Remember who took the watched capybara down, whichever message arrives first. */
  kill(target: string, killer: string | null) { this.downs.set(target, killer && killer !== target ? killer : null); }

  /** Keeps the target valid. A watched capybara that falls or leaves is held on for a beat, then the view moves on
   * to its eliminator when that one is still standing, or to whoever is nearest. */
  update(actors: readonly ActorState[], localId: string, now: number): SpectateView {
    if (this.hold && now >= this.hold.until) {
      const { killer, victim } = this.hold, body = actors.find(actor => actor.id === victim);
      this.hold = null;
      this.target = killer && actors.some(actor => actor.id === killer && watchable(actor, localId)) ? killer : nearestTarget(actors, localId, body?.pos ?? null);
    }
    if (!this.hold && this.target) {
      const actor = actors.find(candidate => candidate.id === this.target);
      if (!actor) this.target = nearestTarget(actors, localId, null);
      else if (!actor.alive || !actor.connected) {
        const others = spectateOrder(actors, localId).some(other => other.id !== actor.id && other.connected);
        // A dropped friend stays on screen while nobody else is left to watch.
        if (!actor.alive || others) {
          this.hold = { victim: actor.id, killer: this.downs.get(actor.id) ?? null, until: now + TARGET_DOWN_HOLD, reason: actor.alive ? 'left' : 'down' };
        }
      }
    }
    // The kill event may land after the snapshot that started the hold.
    if (this.hold && this.downs.has(this.hold.victim)) this.hold.killer = this.downs.get(this.hold.victim)!;
    const order = spectateOrder(actors, localId), watched = this.hold ? this.hold.victim : this.target;
    return { target: watched, hold: this.hold, index: order.findIndex(actor => actor.id === watched), count: order.length };
  }
}
