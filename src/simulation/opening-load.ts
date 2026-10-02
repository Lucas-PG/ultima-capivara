import type { PlayerProfile } from '../shared/types';

// A slow machine gets time to upload the arena; one stuck client can delay the
// opening by at most 30 wall-clock seconds, regardless of joins or repeated acks.
export const OPENING_LOAD_CAP_MS = 30_000;

/** One host-owned gate for the opening countdown, never for later rounds. */
export class OpeningLoadGate {
  private readonly pending = new Set<string>();
  private readonly connected = new Set<string>();
  private released = false;
  private readonly deadline: number;

  constructor(private readonly matchId: string, players: PlayerProfile[], startedAt: number) {
    this.deadline = startedAt + OPENING_LOAD_CAP_MS;
    // Room profiles are humans. The simulation's generated bots need no ack.
    for (const player of players) if (player.connected) {
      this.connected.add(player.id); this.pending.add(player.id);
    }
  }

  loaded(matchId: string, playerId: string) {
    if (!this.released && matchId === this.matchId && this.connected.has(playerId)) this.pending.delete(playerId);
  }

  player(profile: PlayerProfile, status: 'join' | 'disconnect' | 'reconnect' | 'expired') {
    if (this.released) return;
    if (status === 'disconnect' || status === 'expired' || !profile.connected) {
      this.connected.delete(profile.id); this.pending.delete(profile.id);
    } else if (status === 'reconnect' || !this.connected.has(profile.id)) {
      this.connected.add(profile.id); this.pending.add(profile.id);
    }
  }

  waiting(now: number): boolean {
    if (!this.released && (this.pending.size === 0 || now >= this.deadline)) this.released = true;
    return !this.released;
  }
}
