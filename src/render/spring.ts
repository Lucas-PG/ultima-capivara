// Exact critically damped step, stable at any display refresh rate.
export class Spring {
  value = 0;
  velocity = 0;
  reset(value = 0) { this.value = value; this.velocity = 0; }
  impulse(velocity: number) { this.velocity += velocity; }
  update(target: number, frequency: number, dt: number) {
    const step = Math.max(0, Math.min(dt, .1)), offset = this.value - target;
    const decay = Math.exp(-frequency * step), drift = this.velocity + frequency * offset;
    this.value = target + (offset + drift * step) * decay;
    this.velocity = (this.velocity - frequency * drift * step) * decay;
    return this.value;
  }
}
