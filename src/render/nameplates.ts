import * as THREE from 'three';
import '@fontsource/mochiy-pop-one/latin-400.css';
import { hasLineOfSight } from '../shared/collision';
import type { ActorState, Vec3, WorldSpec } from '../shared/types';

export const preloadNameplateFont = () => typeof document !== 'undefined' && document.fonts
  ? document.fonts.load('14px "Mochiy Pop One"').then(() => {}) : Promise.resolve();

/** Client-only targeting uses the normal combat volumes, with 0.6 degrees of slack. */
export function nameplateHit(origin: Vec3, direction: Vec3, actor: ActorState, position: Vec3): number {
  const scale = actor.crouch ? 1.3 / 1.8 : 1;
  const x = origin.x - position.x, y = origin.y - position.y, z = origin.z - position.z;
  const slack = Math.hypot(x, y, z) * Math.tan(Math.PI / 300);
  const hx = x + Math.sin(actor.yaw) * .04 * scale, hy = y - 1.6 * scale, hz = z + Math.cos(actor.yaw) * .04 * scale;
  const b = hx * direction.x + hy * direction.y + hz * direction.z;
  const c = hx * hx + hy * hy + hz * hz - (.25 * scale + slack) ** 2;
  const disc = b * b - c;
  let best = disc >= 0 && -b + Math.sqrt(disc) >= 0 ? Math.max(0, -b - Math.sqrt(disc)) : Infinity;
  let low = 0, high = Infinity;
  const a = direction.x ** 2 + direction.z ** 2, bc = x * direction.x + z * direction.z;
  const cc = x * x + z * z - (.3 * scale + slack) ** 2;
  if (a < 1e-12) { if (cc > 0) low = Infinity; }
  else {
    const d = bc * bc - a * cc;
    if (d < 0) low = Infinity;
    else { low = Math.max(0, (-bc - Math.sqrt(d)) / a); high = (-bc + Math.sqrt(d)) / a; }
  }
  if (Math.abs(direction.y) < 1e-12) { if (y < 0 || y > 1.42 * scale) low = Infinity; }
  else {
    const t0 = -y / direction.y, t1 = (1.42 * scale - y) / direction.y;
    low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
  }
  if (low <= high && Number.isFinite(low)) best = Math.min(best, low);
  return best;
}

export function nameplateFontSize(height: number, distance: number): number {
  const factor = distance <= 10 ? THREE.MathUtils.lerp(1.2, 1, THREE.MathUtils.clamp((distance - 3) / 7, 0, 1))
    : THREE.MathUtils.lerp(1, .8, THREE.MathUtils.clamp((distance - 10) / 30, 0, 1));
  const minimum = THREE.MathUtils.lerp(12, 11.2, THREE.MathUtils.clamp((height - 720) / 360, 0, 1));
  return Math.max(minimum, 14 * height / 1080 * factor);
}

/** Visibility state follows Pincel's acquire, hold and fade timings, even with reduced motion. */
export class NameplateVisibility {
  opacity = 0;
  private acquire = 0;
  private hold = 0;
  private revealed = false;
  update(aimed: boolean, visible: boolean, dt: number): number {
    const step = Math.max(0, Math.min(dt, .1));
    if (!visible) {
      this.acquire = this.hold = 0;
      if (this.opacity > 0) this.revealed = true;
      this.opacity = Math.max(0, this.opacity - step / .15);
      if (!this.opacity) this.revealed = false;
    } else if (aimed) {
      if (this.revealed) this.opacity = 1;
      else {
        const before = this.acquire;
        this.acquire += step;
        const fading = Math.max(0, this.acquire - .3) - Math.max(0, before - .3);
        this.opacity = Math.min(1, this.opacity + fading / .15);
        if (this.opacity >= 1 - 1e-8) { this.opacity = 1; this.revealed = true; }
      }
      this.hold = .3;
    } else {
      this.acquire = 0;
      // Partly revealed labels also survive brief tracking jitter.
      if (this.opacity > 0) this.revealed = true;
      const fading = Math.max(0, step - this.hold);
      this.hold = Math.max(0, this.hold - step);
      this.opacity = Math.max(0, this.opacity - fading / .15);
      if (!this.opacity) this.revealed = false;
    }
    return this.opacity;
  }
}

export class Nameplate {
  readonly sprite: THREE.Sprite;
  readonly visibility = new NameplateVisibility();
  readonly head = new THREE.Vector3();
  readonly projected = new THREE.Vector3();
  readonly bounds = { x: 0, y: 0, width: 0, height: 0 };
  readonly width: number;
  readonly height = 24;
  distance = Infinity;
  lineOfSight = false;
  private nextSightCheck = -Infinity;
  constructor(name: string, color: string) {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
    // Four samples per CSS pixel keep the outlined glyphs clean at 720 and 1080.
    const text = Array.from(name).slice(0, 14).join('') + (Array.from(name).length > 14 ? '…' : '');
    ctx.font = '56px "Mochiy Pop One"';
    this.width = Math.ceil(ctx.measureText(text).width / 4) + 20;
    canvas.width = this.width * 4; canvas.height = this.height * 4;
    ctx.scale(4, 4); ctx.font = '14px "Mochiy Pop One"';
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 4;
    ctx.strokeStyle = '#3A2418'; ctx.fillStyle = '#FFF4D6';
    ctx.strokeText(text, 16, 12); ctx.fillText(text, 16, 12);
    ctx.beginPath(); ctx.arc(7, 12, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: false, toneMapped: false, opacity: 0 }));
    // Bottom of the text card is anchored above the head, including on a pitched camera.
    this.sprite.center.set(.5, 0); this.sprite.position.y = 2.2; this.sprite.visible = false;
  }
  canSee(camera: THREE.PerspectiveCamera, world: WorldSpec | undefined, elapsed: number): boolean {
    if (elapsed >= this.nextSightCheck) {
      this.lineOfSight = world ? hasLineOfSight(camera.position, this.head, world) : true;
      this.nextSightCheck = elapsed + .1;
    }
    return this.lineOfSight;
  }
}

/** Pack existing screen rectangles upwards in a stable order, with no per-frame allocation. */
export function stackNameplate(plate: Nameplate, previous: readonly Nameplate[], count: number): number {
  let shift = 0;
  for (let pass = 0; pass < count; pass++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const other = previous[i].bounds, box = plate.bounds;
      const overlapX = Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x);
      const overlapY = Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y);
      if (overlapX > 0 && overlapY > 0) {
        const up = box.y + box.height - other.y + 2;
        box.y -= up; shift += up; moved = true;
      }
    }
    if (!moved) break;
  }
  return shift;
}
