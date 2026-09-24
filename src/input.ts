import type { InputFrame, PlayerAction, Settings } from './shared/types';
import { clamp, emptyInput } from './shared/math';

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
  onPause: () => void = () => {};
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
    document.addEventListener('mousedown', event => {
      if (!this.locked) return;
      if (event.button === 0) {
        if (!this.frame.fire) {
          this.frame.firePressId = ++this.actionId;
          this.onAction({
            type: 'trigger', id: this.actionId, yaw: this.frame.yaw, pitch: this.frame.pitch,
            lean: Number(this.keys.has(this.settings.bindings.leanRight)) - Number(this.keys.has(this.settings.bindings.leanLeft)),
            ads: this.settings.adsToggle ? this.adsToggled : this.adsHeld, clientTime: this.frame.clientTime,
          });
        }
        this.frame.fire = true;
      }
      if (event.button === 2) { this.adsHeld = true; this.adsToggled = !this.adsToggled; }
    }, { signal });
    document.addEventListener('mouseup', event => {
      if (event.button === 0) { this.frame.fire = false; delete this.frame.firePressId; }
      if (event.button === 2) this.adsHeld = false;
    }, { signal });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    window.addEventListener('blur', () => this.clear(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, { signal });
  }
  private key(event: KeyboardEvent, down: boolean) {
    if (!this.locked) return;
    if (event.code === 'Escape' && down) { event.preventDefault(); this.unlock(); return; }
    if (['Space', 'Tab', ...Object.values(this.settings.bindings)].includes(event.code)) event.preventDefault();
    if (down) this.keys.add(event.code); else this.keys.delete(event.code);
    if (event.code === 'Tab') this.scoreboard = down;
    if (!down || event.repeat) return;
    const binding = this.settings.bindings;
    if (event.code === binding.reload) this.onAction({ type: 'reload', id: ++this.actionId });
    if (event.code === binding.interact) this.onInteract();
    if (event.code === binding.jump) this.onAction({ type: 'jump', id: ++this.actionId });
    if (/^Digit[1-4]$/.test(event.code)) this.onAction({ type: 'slot', id: ++this.actionId, slot: Number(event.code.slice(-1)) - 1 });
    const consumables = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'] as const;
    if (/^Digit[5-9]$/.test(event.code)) this.onAction({ type: 'consume', id: ++this.actionId, item: consumables[Number(event.code.slice(-1)) - 5] });
  }
  sample(time: number): InputFrame {
    const held = (key: string) => this.locked && this.keys.has(this.settings.bindings[key]);
    this.frame.seq = ++this.sequence;
    this.frame.clientTime = time;
    this.frame.moveX = Number(held('right')) - Number(held('left'));
    this.frame.moveZ = Number(held('forward')) - Number(held('back'));
    this.frame.sprint = held('sprint'); this.frame.crouch = held('crouch'); this.frame.jump = held('jump');
    this.frame.lean = Number(held('leanRight')) - Number(held('leanLeft'));
    this.frame.ads = this.locked && (this.settings.adsToggle ? this.adsToggled : this.adsHeld);
    if (!this.locked) { this.frame.fire = false; delete this.frame.firePressId; }
    return { ...this.frame };
  }
  actionIdNext() { return ++this.actionId; }
  reset(yaw = 0) { this.sequence = 0; this.actionId = 0; this.clear(); Object.assign(this.frame, emptyInput(), { yaw }); }
  clear() { this.keys.clear(); this.frame.fire = false; delete this.frame.firePressId; this.frame.moveX = this.frame.moveZ = this.frame.lean = 0; this.adsHeld = this.adsToggled = false; this.scoreboard = false; }
  setSettings(settings: Settings) { this.settings = settings; }
  async lock() {
    try { await this.canvas.requestPointerLock(); }
    catch { this.onError('Ative esta aba e clique em Entrar na partida para capturar o mouse.'); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); this.clear(); }
  dispose() { this.abort.abort(); this.unlock(); }
}
