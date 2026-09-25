import { clamp } from '../shared/math';
import type { ActorState, Settings, WeaponId } from '../shared/types';
import { advanceAds, coolShotHeat, shotHeatGain, shotSpread } from '../shared/weapons';

export class CrosshairSpread {
  private actorId = '';
  private weapon: WeaponId | null = null;
  private adsAmount = 0;
  private heat = 0;
  private serverHeat = 0;
  private gapValue = 0;
  private lastAt = 0;
  private fadeFrom = 1;
  private fadeTo = 1;
  private fadeAt = 0;
  ticksOpacity = 1;

  onShot(weapon: WeaponId, now: number) {
    if (this.weapon !== weapon) return;
    this.heat = clamp(this.heat + shotHeatGain(weapon), 0, 1.2);
    this.lastAt = now;
  }

  gap(me: ActorState, settings: Settings, viewportHeight: number, now: number): number {
    const weapon = me.weapons[me.slot]?.id || null;
    if (me.id !== this.actorId || weapon !== this.weapon || now - this.lastAt > 1000) {
      this.reset();
      this.actorId = me.id;
      this.weapon = weapon;
      this.heat = this.serverHeat = me.shotHeat;
    }
    const dt = this.lastAt ? clamp((now - this.lastAt) / 1000, 0, .25) : 0;
    this.lastAt = now;
    if (weapon) this.adsAmount = advanceAds(weapon, this.adsAmount, me.ads, dt);
    this.heat = coolShotHeat(this.heat, dt);
    // Fresh host heat corrects local shot prediction without waiting for another trigger.
    if (me.shotHeat > this.serverHeat + .01) this.heat = me.shotHeat;
    else this.heat = Math.max(this.heat, me.shotHeat);
    this.serverHeat = me.shotHeat;

    const speed = Math.hypot(me.velocity.x, me.velocity.z);
    const spread = weapon ? shotSpread(weapon, this.adsAmount, speed, !me.grounded, this.heat) : 0;
    const height = Math.max(1, viewportHeight);
    const scale = height / 1080;
    const zoom = weapon === 'sniper' ? 5.5 : weapon === 'dmr' ? 2.9 : 1.25;
    const fov = settings.fov / (1 + this.adsAmount * (zoom - 1)) * Math.PI / 180;
    const target = clamp(Math.tan(spread * Math.PI / 180) * height / (2 * Math.tan(fov / 2)), 4 * scale, 48 * scale);
    if (!this.gapValue || target >= this.gapValue || settings.reducedMotion) this.gapValue = target;
    else this.gapValue = target + (this.gapValue - target) * Math.exp(-dt / .12);

    const opacity = weapon !== 'sniper' && weapon !== 'dmr' && this.adsAmount > .5 ? 0 : 1;
    if (settings.reducedMotion) this.ticksOpacity = opacity;
    else if (opacity !== this.fadeTo) {
      this.fadeFrom = this.ticksOpacity;
      this.fadeTo = opacity;
      this.fadeAt = now;
    }
    if (!settings.reducedMotion) this.ticksOpacity = this.fadeFrom + (this.fadeTo - this.fadeFrom) * clamp((now - this.fadeAt) / 80, 0, 1);
    return this.gapValue;
  }

  reset() {
    this.actorId = '';
    this.weapon = null;
    this.adsAmount = 0;
    this.heat = this.serverHeat = 0;
    this.gapValue = 0;
    this.lastAt = 0;
    this.fadeFrom = this.fadeTo = this.ticksOpacity = 1;
    this.fadeAt = 0;
  }
}
