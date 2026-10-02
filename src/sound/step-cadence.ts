import type { ActorState, Vec3 } from '../shared/types';

type Walker = Pick<ActorState, 'pos' | 'velocity' | 'grounded' | 'stage' | 'swimming' | 'crouch' | 'sprint'>;

// Walking down a tread or an uneven slope briefly loses ground contact. Keep
// that distance in the stride, and reserve touchdown sounds for jumps/drops.
// 0.5 m clears the movement solver's 0.45 m step; gravity 22 gives 4.7 m/s.
const WALK_DROP = .5;
const WALK_FALL_SPEED = 4.8;

export class StepCadence {
  private pos: Vec3;
  private grounded: boolean;
  private swimming: boolean;
  private peakY: number;
  private realFall: boolean;
  private fallSpeed = 0;
  private travelled = 0;

  constructor(actor: Walker) {
    this.pos = { ...actor.pos };
    this.grounded = actor.grounded && actor.stage === 'ground' && !actor.swimming;
    this.swimming = actor.swimming;
    this.peakY = actor.pos.y;
    this.realFall = !this.grounded && !actor.swimming && (actor.stage !== 'ground' || actor.velocity.y < -2.3);
    this.fallSpeed = Math.max(0, -actor.velocity.y);
  }

  update(actor: Walker) {
    const grounded = actor.grounded && actor.stage === 'ground' && !actor.swimming;
    const moved = Math.hypot(actor.pos.x - this.pos.x, actor.pos.z - this.pos.z);
    const jump = this.grounded && !grounded && !actor.swimming && actor.velocity.y > 1.5;
    if (this.grounded && !grounded) { this.peakY = this.pos.y; this.realFall = jump; this.fallSpeed = 0; }
    if (!this.grounded || !grounded) {
      this.peakY = Math.max(this.peakY, actor.pos.y);
      this.fallSpeed = Math.max(this.fallSpeed, -actor.velocity.y);
      this.realFall ||= jump || this.peakY - actor.pos.y > WALK_DROP || this.fallSpeed > WALK_FALL_SPEED;
    }
    const landing = !this.grounded && !this.swimming && grounded && this.realFall;
    const walking = !this.swimming && !actor.swimming && actor.stage === 'ground' && !this.realFall;
    const swimming = this.swimming && actor.swimming;
    if (moved >= 2 || landing || (!walking && !swimming)) this.travelled = 0;
    else if (Math.hypot(actor.velocity.x, actor.velocity.z) > .1) this.travelled += moved;
    const stride = actor.swimming ? 1.6 : actor.crouch ? 2.7 : actor.sprint ? 2.15 : 1.65;
    const step = !landing && (grounded || swimming) && this.travelled >= stride;
    if (step) this.travelled %= stride;
    const fallSpeed = this.fallSpeed;
    if (grounded || actor.swimming) { this.peakY = actor.pos.y; this.realFall = false; this.fallSpeed = 0; }
    this.pos.x = actor.pos.x; this.pos.y = actor.pos.y; this.pos.z = actor.pos.z;
    this.grounded = grounded; this.swimming = actor.swimming;
    return { step, landing, jump, fallSpeed };
  }
}
