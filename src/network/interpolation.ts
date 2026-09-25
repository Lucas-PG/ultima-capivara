import type { ActorState, WorldSnapshot } from '../shared/types';

type Sample = { time: number; tick: number; actor: ActorState };
type Track = { samples: Sample[]; pose: ActorState; recovery?: { from: ActorState['pos']; at: number } };
const BASE_DELAY = .1;
const MAX_DELAY = .2;
const MAX_EXTRAPOLATION = .1;
const HISTORY = 32;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Render-only history. Authoritative state, prediction and events never use this clock. */
export class RemoteInterpolation {
  private tracks = new Map<string, Track>();
  private poses = new Map<string, ActorState>();
  private match = '';
  private latestTick = -1;
  private latestTime = 0;
  private arrival = 0;
  private jitter = 0;
  private interval = .05;
  private cursor: number | null = null;
  private renderedAt: number | null = null;
  get delay() { return Math.min(MAX_DELAY, Math.max(BASE_DELAY, this.interval + 2 * this.jitter)); }
  get time() { return this.cursor; }

  reset() {
    this.tracks.clear(); this.poses.clear(); this.match = ''; this.latestTick = -1;
    this.latestTime = this.arrival = this.jitter = 0; this.interval = .05;
    this.cursor = this.renderedAt = null;
  }

  push(snapshot: WorldSnapshot, localId: string, now: number) {
    if (snapshot.matchId !== this.match) { this.reset(); this.match = snapshot.matchId; }
    const time = snapshot.time, newest = snapshot.tick > this.latestTick;
    const catchingUp = newest && this.cursor !== null && time - this.delay > this.cursor + .1;
    if (catchingUp) this.cursor = time - this.delay;
    if (newest) {
      if (this.latestTick >= 0) {
        const elapsed = (now - this.arrival) / 1000;
        this.jitter += (Math.abs(elapsed - (time - this.latestTime)) - this.jitter) * .1;
        this.interval += (Math.min(.2, Math.max(.05, time - this.latestTime)) - this.interval) * .1;
      }
      this.latestTick = snapshot.tick; this.latestTime = time; this.arrival = now;
      const ids = new Set(snapshot.actors.map(actor => actor.id));
      for (const id of this.tracks.keys()) if (!ids.has(id) || id === localId) this.tracks.delete(id);
    }
    for (const actor of snapshot.actors) {
      if (actor.id === localId) continue;
      let track = this.tracks.get(actor.id);
      if (!track) {
        if (!newest) continue;
        track = { samples: [], pose: { ...actor, pos: { ...actor.pos }, velocity: { ...actor.velocity } } };
        this.tracks.set(actor.id, track);
      }
      const samples = track.samples, last = samples.at(-1);
      if (samples.some(sample => sample.tick === snapshot.tick)) continue;
      // Never draw a journey between lives or through a teleport. Death counts
      // also catch a respawn whose dead snapshot was lost on the fast channel.
      if (last && newest && (actor.deaths !== last.actor.deaths || actor.alive !== last.actor.alive ||
        Math.hypot(actor.pos.x - last.actor.pos.x, actor.pos.y - last.actor.pos.y, actor.pos.z - last.actor.pos.z) > 12)) { samples.length = 0; track.recovery = undefined; }
      else if (catchingUp) track.recovery = { from: { ...track.pose.pos }, at: now };
      // A late packet from the previous life must not repopulate a reset track.
      if (!newest && last && (actor.deaths !== last.actor.deaths || actor.alive !== last.actor.alive || time < samples[0].time)) continue;
      samples.push({ time, tick: snapshot.tick, actor });
      samples.sort((a, b) => a.tick - b.tick);
      if (samples.length > HISTORY) samples.splice(0, samples.length - HISTORY);
    }
  }

  sample(now: number): ReadonlyMap<string, ActorState> {
    this.poses.clear();
    if (this.latestTick < 0) return this.poses;
    const desired = this.latestTime + (now - this.arrival) / 1000 - this.delay;
    if (this.cursor === null) this.cursor = desired;
    else {
      const dt = Math.max(0, (now - this.renderedAt!) / 1000);
      // Slew rather than jumping when a late packet changes the delay. The
      // playout clock never reverses, including shuffled packets and long gaps.
      const correction = Math.max(-dt * .1, Math.min(dt * .1, desired - (this.cursor + dt)));
      this.cursor += dt + correction;
    }
    this.cursor = Math.min(this.cursor, this.latestTime + MAX_EXTRAPOLATION);
    this.renderedAt = now;
    for (const [id, track] of this.tracks) {
      const samples = track.samples;
      let a = samples[0], b = a;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].time > this.cursor) { b = samples[i]; break; }
        a = b = samples[i];
      }
      const pose = track.pose, pos = pose.pos, velocity = pose.velocity;
      Object.assign(pose, a.actor); pose.pos = pos; pose.velocity = velocity;
      const t = b.time > a.time ? Math.max(0, Math.min(1, (this.cursor - a.time) / (b.time - a.time))) : 0;
      const extra = a === b && a.actor.alive ? Math.max(0, Math.min(MAX_EXTRAPOLATION, this.cursor - a.time)) : 0;
      for (const axis of ['x', 'y', 'z'] as const) {
        pos[axis] = mix(a.actor.pos[axis], b.actor.pos[axis], t) + a.actor.velocity[axis] * extra;
        velocity[axis] = extra >= MAX_EXTRAPOLATION ? 0 : mix(a.actor.velocity[axis], b.actor.velocity[axis], t);
      }
      // After a long outage the clock catches up immediately, while the visible
      // correction takes 100 ms. It must neither jump nor remain seconds behind.
      if (track.recovery) {
        const t = Math.max(0, Math.min(1, (now - track.recovery.at) / 100));
        for (const axis of ['x', 'y', 'z'] as const) pos[axis] = mix(track.recovery.from[axis], pos[axis], t);
        if (t === 1) track.recovery = undefined;
      }
      pose.yaw = angle(a.actor.yaw, b.actor.yaw, t);
      pose.pitch = mix(a.actor.pitch, b.actor.pitch, t);
      pose.lean = mix(a.actor.lean, b.actor.lean, t);
      this.poses.set(id, pose);
    }
    return this.poses;
  }
}
