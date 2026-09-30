import type { InputFrame, PlayerAction, Settings } from './shared/types';
import { clamp, emptyInput } from './shared/math';
import { verticalFov } from './settings';
import { RECOIL, recoilKick } from './shared/weapons';
import type { WeaponId } from './shared/types';

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4'] as const;
// Longest sprint-out (the sniper's 0.24 s) plus a margin for the input tick and transit.
export const SPRINT_HOLD_MS = 320;
const CONSUMABLE_ACTIONS = [['useBandage', 'bandage'], ['useMedkit', 'medkit'], ['useGuarana', 'guarana'], ['useAcai', 'acai'], ['useRapadura', 'rapadura']] as const;

export class InputController {
  readonly frame: InputFrame = emptyInput();
  locked = false;
  scoreboard = false;
  emoteWheel = false;
  onCancelEmote: () => void = () => {};
  onEmoteOpen: () => boolean = () => false;
  onEmoteClose: (commit: boolean) => void = () => {};
  onEmoteMove: (x: number, y: number) => void = () => {};
  onEmoteChoice: (index: number) => void = () => {};
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
  // Keys 1-4 name hotbar boxes; the owner maps a box to the carried weapon in it.
  onBox: (box: number) => void = () => {};
  private wheelAt = 0;
  private jumpPressedAt = -Infinity;
  private aimSensitivity = 1;
  private aimMultiplier = 1;
  // Recoil still owed back to the view: mouse movement against it pays it off first.
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilShots = 0;
  private recoilAt = -Infinity;
  private recoilRecovery = .45;
  private crouchToggled = false;
  private sprintToggled = false;
  private firePressedAt = -Infinity;
  // Quick melee and the previous-weapon swap are resolved by the owner (it knows the loadout).
  onMelee: () => void = () => {};
  onLastWeapon: () => void = () => {};
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
      if (this.emoteWheel) { this.onEmoteMove(event.movementX, event.movementY); return; }
      const scale = .002 * this.settings.sensitivity * this.aimSensitivity * this.aimMultiplier;
      const yaw = -event.movementX * scale, pitch = -event.movementY * scale * (this.settings.invertY ? -1 : 1);
      this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw + yaw), Math.cos(this.frame.yaw + yaw));
      this.frame.pitch = clamp(this.frame.pitch + pitch, -1.48, 1.48);
      // Pulling against the kick is compensation: that part is no longer returned on release.
      if (pitch < 0 && this.recoilPitch > 0) this.recoilPitch = Math.max(0, this.recoilPitch + pitch);
      if (yaw * this.recoilYaw < 0) this.recoilYaw = Math.abs(yaw) >= Math.abs(this.recoilYaw) ? 0 : this.recoilYaw + yaw;
    }, { signal });
    document.addEventListener('keydown', event => this.key(event, true), { signal });
    document.addEventListener('keyup', event => this.key(event, false), { signal });
    // Mouse buttons are bindable like keys: 'Mouse' + event.button (0 left, 1 middle, 2 right, 3/4 side).
    document.addEventListener('mousedown', event => this.mouse(event, true), { signal });
    document.addEventListener('mouseup', event => this.mouse(event, false), { signal });
    canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    // Mouse wheel cycles weapons (down = next), one step per notch at most every 90 ms.
    document.addEventListener('wheel', event => {
      if (!this.locked || this.emoteWheel || Math.abs(event.deltaY) < 1) return;
      event.preventDefault();
      const now = performance.now();
      if (now - this.wheelAt < 90) return;
      this.wheelAt = now; this.onCycle(event.deltaY > 0 ? 1 : -1);
    }, { signal, passive: false });
    window.addEventListener('blur', () => { this.onCancelEmote(); this.clear(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.onCancelEmote(); this.clear(); } }, { signal });
  }
  /**
   * Match movement near the reticle to the rendered lens, including ADS transitions,
   * then apply the player's aimed or scoped multiplier in proportion to how far aimed.
   */
  setAimFov(fov: number, ads = 0, scoped = false) {
    this.aimSensitivity = Number.isFinite(fov) && fov > 0 && fov < 180
      ? clamp(Math.tan(fov * Math.PI / 360) / Math.tan(verticalFov(this.settings.fov) * Math.PI / 360), .05, 1) : 1;
    const multiplier = scoped ? this.settings.scopeSensitivity : this.settings.adsSensitivity;
    this.aimMultiplier = 1 + ((Number.isFinite(multiplier) ? multiplier : 1) - 1) * clamp(ads, 0, 1);
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
    // Side buttons (3, 4) would navigate the page back or forward mid-match even when unbound.
    if (event.button >= 3 || Object.values(this.settings.bindings).includes(code)) event.preventDefault();
    this.press(code, down, false);
  }
  // Every action goes through its binding, whether the code is a key or a mouse button.
  private press(code: string, down: boolean, repeat: boolean) {
    const binding = this.settings.bindings;
    if (code === binding.emote) {
      if (down && !repeat && !this.emoteWheel) { this.clear(); this.emoteWheel = this.onEmoteOpen(); }
      else if (!down) this.closeEmoteWheel(true);
      return;
    }
    if (this.emoteWheel) {
      if (down && !repeat && /^Digit[1-5]$/.test(code)) { this.onEmoteChoice(Number(code.slice(-1)) - 1); this.closeEmoteWheel(true); }
      return;
    }
    if (down) this.keys.add(code); else this.keys.delete(code);
    if (code === binding.scoreboard) this.scoreboard = down;
    if (code === binding.fire) {
      if (down && !this.frame.fire) {
        this.firePressedAt = performance.now(); this.sprintToggled = false;
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
    if (code === binding.ads) { if (down && !repeat) { this.adsToggled = !this.adsToggled; this.sprintToggled = false; } this.adsHeld = down; }
    if (code === binding.crouch && down && !repeat) { this.crouchToggled = !this.crouchToggled; this.sprintToggled = false; }
    if (code === binding.sprint && down && !repeat) { this.sprintToggled = !this.sprintToggled; if (this.sprintToggled) this.crouchToggled = false; }
    if (!down || repeat) return;
    if ([binding.scoreboard, binding.map, binding.inspect, binding.interact].includes(code)) this.onCancelEmote();
    if (code === binding.reload) this.onAction({ type: 'reload', id: ++this.actionId });
    if (code === binding.melee) this.onMelee();
    if (code === binding.lastWeapon) this.onLastWeapon();
    if (code === binding.drop) this.onAction({ type: 'drop', id: ++this.actionId });
    if (code === binding.interact) this.onInteract();
    if (code === binding.inspect) this.onInspect();
    if (code === binding.jump) { this.jumpPressedAt = performance.now(); this.onAction({ type: 'jump', id: ++this.actionId }); }
    SLOTS.forEach((action, box) => { if (code === binding[action]) this.onBox(box); });
    for (const [action, item] of CONSUMABLE_ACTIONS) if (code === binding[action]) this.onAction({ type: 'consume', id: ++this.actionId, item });
  }
  // Refresh visual intent on every display frame without creating an input tick.
  refresh() {
    const held = (key: string) => this.locked && !this.emoteWheel && this.keys.has(this.settings.bindings[key]);
    this.frame.moveX = Number(held('right')) - Number(held('left'));
    this.frame.moveZ = Number(held('forward')) - Number(held('back'));
    const now = performance.now();
    // A toggled sprint ends when forward movement does.
    if (this.frame.moveZ <= 0) this.sprintToggled = false;
    // A trigger pull holds the sprint off long enough for the gun to come up and fire (HANDLING.sprintOut).
    const firing = this.frame.fire || now - this.firePressedAt < SPRINT_HOLD_MS;
    this.frame.crouch = this.settings.crouchToggle ? this.locked && !this.emoteWheel && this.crouchToggled : held('crouch');
    this.frame.sprint = !firing && (this.settings.sprintToggle ? this.locked && !this.emoteWheel && this.sprintToggled : held('sprint'));
    this.frame.jump = held('jump') || this.locked && now - this.jumpPressedAt < 100;
    this.frame.lean = Number(held('leanRight')) - Number(held('leanLeft'));
    this.frame.ads = this.locked && !this.emoteWheel && (this.settings.adsToggle ? this.adsToggled : this.adsHeld);
    if (!this.locked) { this.frame.fire = false; delete this.frame.firePressId; }
  }
  sample(time: number): InputFrame {
    this.refresh();
    this.frame.seq = ++this.sequence;
    this.frame.clientTime = time;
    return { ...this.frame };
  }
  actionIdNext() { return ++this.actionId; }
  /** One round's kick along the weapon's pattern; `ads` is how far aimed (0 to 1). */
  applyRecoil(weapon: WeaponId, ads = this.frame.ads ? 1 : 0, random = Math.random()) {
    const now = performance.now();
    // A pause longer than a quarter second starts the pattern over.
    if (now - this.recoilAt > 250) this.recoilShots = 0;
    this.recoilAt = now;
    const kick = recoilKick(weapon, this.recoilShots++, ads, random);
    this.frame.pitch = clamp(this.frame.pitch + kick.pitch, -1.48, 1.48);
    this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw + kick.yaw), Math.cos(this.frame.yaw + kick.yaw));
    this.recoilPitch += kick.pitch; this.recoilYaw += kick.yaw; this.recoilRecovery = RECOIL[weapon].recovery;
  }
  recoverRecoil(dt: number) {
    if (this.frame.fire || dt <= 0) return;
    const fraction = 1 - Math.exp(-5 * dt / Math.max(.001, this.recoilRecovery));
    const pitch = this.recoilPitch * fraction, yaw = this.recoilYaw * fraction;
    this.frame.pitch = clamp(this.frame.pitch - pitch, -1.48, 1.48);
    this.frame.yaw = Math.atan2(Math.sin(this.frame.yaw - yaw), Math.cos(this.frame.yaw - yaw));
    this.recoilPitch -= pitch; this.recoilYaw -= yaw;
  }
  reset(yaw = 0) { this.sequence = 0; this.actionId = 0; this.clear(); Object.assign(this.frame, emptyInput(), { yaw }); }
  closeEmoteWheel(commit = false) { if (!this.emoteWheel) return; this.emoteWheel = false; this.onEmoteClose(commit); }
  clear() { this.aimSensitivity = 1; this.closeEmoteWheel(); this.keys.clear(); this.frame.fire = false; delete this.frame.firePressId; this.frame.moveX = this.frame.moveZ = this.frame.lean = 0; this.adsHeld = this.adsToggled = false; this.crouchToggled = this.sprintToggled = false; this.scoreboard = false; this.jumpPressedAt = this.firePressedAt = -Infinity; this.recoilPitch = this.recoilYaw = this.recoilShots = 0; }
  setSettings(settings: Settings) { this.settings = settings; }
  async lock() {
    try { await this.canvas.requestPointerLock(); }
    catch { this.onError('Ative esta aba e clique em Entrar na partida para capturar o mouse.'); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); this.clear(); }
  dispose() { this.abort.abort(); this.unlock(); }
}
