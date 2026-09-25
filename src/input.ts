import type { InputFrame, PlayerAction, Settings } from './shared/types';
import { clamp, emptyInput } from './shared/math';
import { RECOIL } from './shared/weapons';
import type { WeaponId } from './shared/types';

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4'] as const;
const CONSUMABLE_ACTIONS = [['useBandage', 'bandage'], ['useMedkit', 'medkit'], ['useGuarana', 'guarana'], ['useAcai', 'acai'], ['useRapadura', 'rapadura']] as const;

export class InputController {
  readonly frame: InputFrame = emptyInput();
  locked = false;
  scoreboard = false;
  private keys = new Set<string>();
  private sequence = 0;
  private actionId = 0;
  private adsHeld = false;
  private adsToggled = false;
  private abort = new AbortController();
  onAction: (action: PlayerAction) => void = () => {};
  onInteract: () => void = () => {};
  // Local-only weapon inspect (Tatu's first-person animation); cancelled by any combat action there.
  onInspect: () => void = () => {};
  onPause: () => void = () => {};
  onCycle: (direction: 1 | -1) => void = () => {};
  private wheelAt = 0;
  private jumpPressedAt = -Infinity;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilShots = 0;
  private recoilRecovery = .45;
  onLock: () => void = () => {};
  onError: (message: string) => void = () => {};
  constructor(private canvas: HTMLCanvasElement, private settings: Settings) {
    const signal = this.abort.signal;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.onLock();
      else { this.clear(); this.onPause(); }
    }, { signal });
    document.addEventListener('mousemove', event => {
      if (!this.locked) return;
      const scale = .002 * this.settings.sensitivity * (this.frame.ads ? .55 : 1);
      this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw - event.movementX * scale), Math.cos(this.frame.yaw - event.movementX * scale));
      this.frame.pitch = clamp(this.frame.pitch - event.movementY * scale, -1.48, 1.48);
    }, { signal });
    document.addEventListener('keydown', event => this.key(event, true), { signal });
    document.addEventListener('keyup', event => this.key(event, false), { signal });
    // Mouse buttons are bindable like keys: 'Mouse' + event.button (0 left, 1 middle, 2 right, 3/4 side).
    document.addEventListener('mousedown', event => this.mouse(event, true), { signal });
    document.addEventListener('mouseup', event => this.mouse(event, false), { signal });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    // Mouse wheel cycles weapons (down = next), one step per notch at most every 90 ms.
    document.addEventListener('wheel', event => {
      if (!this.locked || Math.abs(event.deltaY) < 1) return;
      event.preventDefault();
      const now = performance.now();
      if (now - this.wheelAt < 90) return;
      this.wheelAt = now; this.onCycle(event.deltaY > 0 ? 1 : -1);
    }, { signal, passive: false });
    window.addEventListener('blur', () => this.clear(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, { signal });
  }
  private key(event: KeyboardEvent, down: boolean) {
    if (!this.locked) return;
    // Escape is reserved for the menu and cannot be rebound.
    if (event.code === 'Escape' && down) { event.preventDefault(); this.unlock(); return; }
    if (event.code === 'Space' || Object.values(this.settings.bindings).includes(event.code)) event.preventDefault();
    this.press(event.code, down, event.repeat);
  }
  private mouse(event: MouseEvent, down: boolean) {
    if (!this.locked) return;
    const code = `Mouse${event.button}`;
    if (Object.values(this.settings.bindings).includes(code)) event.preventDefault();
    this.press(code, down, false);
  }
  // Every action goes through its binding, whether the code is a key or a mouse button.
  private press(code: string, down: boolean, repeat: boolean) {
    const binding = this.settings.bindings;
    if (down) this.keys.add(code); else this.keys.delete(code);
    if (code === binding.scoreboard) this.scoreboard = down;
    if (code === binding.fire) {
      if (down && !this.frame.fire) {
        this.frame.firePressId = ++this.actionId;
        this.onAction({
          type: 'trigger', id: this.actionId, yaw: this.frame.yaw, pitch: this.frame.pitch,
          lean: Number(this.keys.has(binding.leanRight)) - Number(this.keys.has(binding.leanLeft)),
          ads: this.settings.adsToggle ? this.adsToggled : this.adsHeld, clientTime: this.frame.clientTime,
        });
      }
      this.frame.fire = down;
      if (!down) delete this.frame.firePressId;
    }
    if (code === binding.ads) { if (down && !repeat) this.adsToggled = !this.adsToggled; this.adsHeld = down; }
    if (!down || repeat) return;
    if (code === binding.reload) this.onAction({ type: 'reload', id: ++this.actionId });
    if (code === binding.interact) this.onInteract();
    if (code === binding.inspect) this.onInspect();
    if (code === binding.jump) { this.jumpPressedAt = performance.now(); this.onAction({ type: 'jump', id: ++this.actionId }); }
    SLOTS.forEach((action, slot) => { if (code === binding[action]) this.onAction({ type: 'slot', id: ++this.actionId, slot }); });
    for (const [action, item] of CONSUMABLE_ACTIONS) if (code === binding[action]) this.onAction({ type: 'consume', id: ++this.actionId, item });
  }
  sample(time: number): InputFrame {
    const held = (key: string) => this.locked && this.keys.has(this.settings.bindings[key]);
    this.frame.seq = ++this.sequence;
    this.frame.clientTime = time;
    this.frame.moveX = Number(held('right')) - Number(held('left'));
    this.frame.moveZ = Number(held('forward')) - Number(held('back'));
    this.frame.sprint = held('sprint'); this.frame.crouch = held('crouch'); this.frame.jump = held('jump') || this.locked && performance.now() - this.jumpPressedAt < 100;
    this.frame.lean = Number(held('leanRight')) - Number(held('leanLeft'));
    this.frame.ads = this.locked && (this.settings.adsToggle ? this.adsToggled : this.adsHeld);
    if (!this.locked) { this.frame.fire = false; delete this.frame.firePressId; }
    return { ...this.frame };
  }
  actionIdNext() { return ++this.actionId; }
  applyRecoil(weapon: WeaponId) {
    const recoil = RECOIL[weapon], scale = this.frame.ads ? .7 : 1;
    const pitch = recoil.pitch * scale, yaw = recoil.yaw * (this.recoilShots++ % 2 ? 1 : -1) * scale;
    this.frame.pitch = clamp(this.frame.pitch + pitch, -1.48, 1.48);
    this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw + yaw), Math.cos(this.frame.yaw + yaw));
    this.recoilPitch += pitch; this.recoilYaw += yaw; this.recoilRecovery = recoil.recovery;
  }
  recoverRecoil(dt: number) {
    if (this.frame.fire || dt <= 0) return;
    const fraction = 1 - Math.exp(-5 * dt / Math.max(.001, this.recoilRecovery));
    const pitch = this.recoilPitch * fraction, yaw = this.recoilYaw * fraction;
    this.frame.pitch = clamp(this.frame.pitch - pitch, -1.48, 1.48);
    this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw - yaw), Math.cos(this.frame.yaw - yaw));
    this.recoilPitch -= pitch; this.recoilYaw -= yaw;
    if (this.recoilPitch < .00001) this.recoilShots = 0;
  }
  reset(yaw = 0) { this.sequence = 0; this.actionId = 0; this.clear(); Object.assign(this.frame, emptyInput(), { yaw }); }
  clear() { this.keys.clear(); this.frame.fire = false; delete this.frame.firePressId; this.frame.moveX = this.frame.moveZ = this.frame.lean = 0; this.adsHeld = this.adsToggled = false; this.scoreboard = false; this.jumpPressedAt = -Infinity; this.recoilPitch = this.recoilYaw = this.recoilShots = 0; }
  setSettings(settings: Settings) { this.settings = settings; }
  async lock() {
    try { await this.canvas.requestPointerLock(); }
    catch { this.onError('Ative esta aba e clique em Entrar na partida para capturar o mouse.'); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); this.clear(); }
  dispose() { this.abort.abort(); this.unlock(); }
}
