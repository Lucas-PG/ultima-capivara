import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController, SPRINT_HOLD_MS } from '../src/input';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, verticalFov } from '../src/settings';

afterEach(() => vi.unstubAllGlobals());

describe('local input feel', () => {
  function controller() {
    vi.stubGlobal('document', { addEventListener: () => {}, pointerLockElement: null });
    vi.stubGlobal('window', { addEventListener: () => {} });
    return new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
  }

  it('keeps reticle tracking consistent with the rendered lens throughout aiming', () => {
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn) });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
    input.locked = true;
    const base = verticalFov(DEFAULT_SETTINGS.fov), tangent = Math.tan(base * Math.PI / 360);
    for (const magnification of [1, 1.05, 1.15, 3, 5.5, 1]) {
      const fov = 2 * Math.atan(tangent / magnification) * 180 / Math.PI;
      input.frame.ads = magnification > 1; input.frame.yaw = 0;
      input.setAimFov(fov); listeners.get('mousemove')!({ movementX: 2, movementY: 0 });
      const screenMotion = Math.tan(-input.frame.yaw) / Math.tan(fov * Math.PI / 360);
      expect(screenMotion).toBeCloseTo(Math.tan(.004 * DEFAULT_SETTINGS.sensitivity) / tangent, 6);
    }
    // Pressing ADS before the lens moves must not abruptly halve mouse response.
    input.frame.ads = true; input.frame.yaw = 0;
    listeners.get('mousemove')!({ movementX: 10, movementY: 0 });
    expect(input.frame.yaw).toBeCloseTo(-.02 * DEFAULT_SETTINGS.sensitivity);
  });

  it('applies the aiming speed only while aiming and inverts vertical look on request', () => {
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn) });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const settings = { ...DEFAULT_SETTINGS, adsSensitivity: .5, invertY: true };
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, settings);
    input.locked = true;
    listeners.get('mousemove')!({ movementX: 10, movementY: 10 });
    const hipYaw = input.frame.yaw;
    expect(hipYaw).toBeCloseTo(-.02 * settings.sensitivity);
    // Mouse down (positive movementY) looks up when inverted.
    expect(input.frame.pitch).toBeGreaterThan(0);
    input.frame.yaw = 0; input.frame.ads = true; input.setAimFov(verticalFov(settings.fov), 1);
    listeners.get('mousemove')!({ movementX: 10, movementY: 0 });
    expect(input.frame.yaw).toBeCloseTo(hipYaw * .5);
  });

  it('loads the aiming comfort settings from storage, clamped and type checked', () => {
    const store = new Map([['uc-v2-settings', JSON.stringify({ adsSensitivity: 9, invertY: true, damageNumbers: 'no' })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: () => {} });
    const loaded = loadSettings();
    expect(loaded.adsSensitivity).toBe(2);
    expect(loaded.invertY).toBe(true);
    expect(loaded.damageNumbers).toBe(true);
  });

    it('climbs first, then sways along a repeatable pattern, and returns on release', () => {
    const input = controller();
    input.frame.fire = true;
    const path: { pitch: number; yaw: number }[] = [];
    for (let i = 0; i < 14; i++) { input.applyRecoil('m4', 0, .5); path.push({ pitch: input.frame.pitch, yaw: input.frame.yaw }); }
    // The opening rounds go straight up; the climb then eases while the view drifts sideways.
    expect(Math.abs(path[3].yaw - path[0].yaw)).toBeLessThan(.2 * (path[3].pitch - path[0].pitch));
    expect(path[5].pitch - path[4].pitch).toBeGreaterThan(path[12].pitch - path[11].pitch);
    expect(Math.max(...path.map(p => Math.abs(p.yaw)))).toBeGreaterThan(.004);
    // Same seed, same pattern.
    const again = controller(); again.frame.fire = true;
    for (let i = 0; i < 14; i++) again.applyRecoil('m4', 0, .5);
    expect(again.frame.pitch).toBeCloseTo(input.frame.pitch, 9);
    expect(again.frame.yaw).toBeCloseTo(input.frame.yaw, 9);
    input.frame.fire = false;
    for (let i = 0; i < 60; i++) input.recoverRecoil(1 / 60);
    expect(input.frame.pitch).toBeLessThan(.001);
    expect(Math.abs(input.frame.yaw)).toBeLessThan(.001);
  });

  it('never returns recoil the player already pulled down against', () => {
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn) });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
    input.locked = true; input.frame.fire = true;
    for (let i = 0; i < 6; i++) input.applyRecoil('m4', 0, .5);
    const kicked = input.frame.pitch;
    // Pull the mouse down by exactly the kick: the aim is back on target.
    listeners.get('mousemove')!({ movementX: 0, movementY: kicked / (.002 * DEFAULT_SETTINGS.sensitivity) });
    expect(input.frame.pitch).toBeCloseTo(0, 6);
    input.frame.fire = false;
    for (let i = 0; i < 60; i++) input.recoverRecoil(1 / 60);
    // No recovery drags the aim below the target afterwards.
    expect(input.frame.pitch).toBeCloseTo(0, 6);
  });

  it('holds the sprint off right after a trigger pull, and supports toggle sprint and crouch', () => {
    const input = controller();
    input.locked = true;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const key = (code: string, down: boolean) => (input as any).press(code, down, false);
    key('KeyW', true); key('ShiftLeft', true);
    expect(input.sample(0).sprint).toBe(true);
    key('Mouse0', true); key('Mouse0', false);
    clock.mockReturnValue(1100);
    expect(input.sample(0).sprint).toBe(false);
    clock.mockReturnValue(1000 + SPRINT_HOLD_MS + 1);
    expect(input.sample(0).sprint).toBe(true);
    key('ShiftLeft', false);
    input.setSettings({ ...DEFAULT_SETTINGS, sprintToggle: true, crouchToggle: true });
    key('ShiftLeft', true); key('ShiftLeft', false);
    expect(input.sample(0).sprint).toBe(true);
    // Crouching ends a toggled sprint and stays down after the key is released.
    key('KeyC', true); key('KeyC', false);
    const frame = input.sample(0);
    expect(frame.crouch).toBe(true); expect(frame.sprint).toBe(false);
    key('KeyC', true); key('KeyC', false);
    expect(input.sample(0).crouch).toBe(false);
    clock.mockRestore();
  });

  it('scales aimed and scoped mouse speed by the player multipliers in proportion to the aim', () => {
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn) });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const settings = { ...DEFAULT_SETTINGS, adsSensitivity: .5, scopeSensitivity: 2 };
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, settings);
    input.locked = true;
    const base = verticalFov(settings.fov);
    const turn = (ads: number, scoped: boolean) => { input.frame.yaw = 0; input.setAimFov(base, ads, scoped); listeners.get('mousemove')!({ movementX: 10, movementY: 0 }); return -input.frame.yaw; };
    expect(turn(0, false)).toBeCloseTo(.02);
    expect(turn(1, false)).toBeCloseTo(.01);
    expect(turn(.5, false)).toBeCloseTo(.015);
    expect(turn(1, true)).toBeCloseTo(.04);
  });

  it('keeps a tapped jump in sampled frames briefly after key release', () => {
    const input = controller();
    input.locked = true;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    (input as any).key({ code: DEFAULT_SETTINGS.bindings.jump, repeat: false, preventDefault: () => {} }, true);
    (input as any).key({ code: DEFAULT_SETTINGS.bindings.jump, repeat: false, preventDefault: () => {} }, false);
    clock.mockReturnValue(1090);
    expect(input.sample(0).jump).toBe(true);
    clock.mockReturnValue(1101);
    expect(input.sample(0).jump).toBe(false);
    clock.mockRestore();
  });
  it('fires weapon inspect from its remappable key only, never from interact', () => {
    const input = controller();
    input.locked = true;
    const inspect = vi.fn(), interact = vi.fn();
    input.onInspect = inspect; input.onInteract = interact;
    const press = (code: string) => (input as any).key({ code, repeat: false, preventDefault: () => {} }, true);
    expect(DEFAULT_SETTINGS.bindings.inspect).toBe('KeyI');
    press('KeyI');
    expect(inspect).toHaveBeenCalledOnce(); expect(interact).not.toHaveBeenCalled();
    press(DEFAULT_SETTINGS.bindings.interact);
    expect(inspect).toHaveBeenCalledOnce();
    input.setSettings({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings, inspect: 'KeyG' } });
    press('KeyI'); press('KeyG');
    expect(inspect).toHaveBeenCalledTimes(2);
  });
  it('drives every action through its binding, including remapped mouse buttons', () => {
    const input = controller();
    input.locked = true;
    const actions: { type: string; slot?: number; item?: string }[] = [];
    input.onAction = action => actions.push(action);
    // Keys 1-4 name fixed hotbar boxes; main.ts maps a box to the weapon carried there.
    input.onBox = box => actions.push({ type: 'slot', slot: box });
    const key = (code: string, down = true) => (input as any).key({ code, repeat: false, preventDefault: () => {} }, down);
    const mouse = (button: number, down = true) => (input as any).mouse({ button, preventDefault: () => {} }, down);
    // Defaults: left mouse fires, right aims, 1-4 boxes, G drops, 5-9 cures, Tab scoreboard.
    mouse(0); expect(input.frame.fire).toBe(true); expect(actions.at(-1)!.type).toBe('trigger'); mouse(0, false);
    mouse(2); expect(input.sample(0).ads).toBe(true); mouse(2, false);
    key('Digit3'); expect(actions.at(-1)).toMatchObject({ type: 'slot', slot: 2 });
    key('Digit8'); expect(actions.at(-1)).toMatchObject({ type: 'consume', item: 'acai' });
    key('KeyG'); expect(actions.at(-1)).toMatchObject({ type: 'drop' });
    key('Tab'); expect(input.scoreboard).toBe(true); key('Tab', false); expect(input.scoreboard).toBe(false);
    // Remapped: fire on a side button, slot 1 on Q, bandage on G, sprint held on the other side button.
    input.setSettings({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings, fire: 'Mouse3', slot1: 'KeyQ', leanLeft: 'KeyZ', useBandage: 'KeyG', drop: 'KeyX', sprint: 'Mouse4' } });
    const before = actions.length;
    mouse(0); expect(input.frame.fire).toBe(false); expect(actions.length).toBe(before);
    mouse(3); expect(input.frame.fire).toBe(true); mouse(3, false); expect(input.frame.fire).toBe(false);
    key('Digit1'); expect(actions.filter(a => a.type === 'slot').length).toBe(1);
    key('KeyQ'); expect(actions.at(-1)).toMatchObject({ type: 'slot', slot: 0 });
    key('KeyG'); expect(actions.at(-1)).toMatchObject({ type: 'consume', item: 'bandage' });
    // Sprinting resumes once the trigger pull's sprint hold has passed.
    const clock = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + SPRINT_HOLD_MS + 1);
    mouse(4); input.frame.moveZ = 1; expect(input.sample(0).sprint).toBe(true); mouse(4, false); expect(input.sample(0).sprint).toBe(false);
    clock.mockRestore();
  });

  it('holds a remapped emote wheel without firing, moving, aiming or switching weapons', () => {
    const input = controller(); input.locked = true;
    input.setSettings({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings, emote: 'KeyG' } });
    const actions = vi.fn(), opened = vi.fn(() => true), closed = vi.fn(), choice = vi.fn();
    input.onAction = actions; input.onEmoteOpen = opened; input.onEmoteClose = closed; input.onEmoteChoice = choice;
    const press = (code: string, down = true) => (input as any).press(code, down, false);
    press('KeyB'); expect(opened).not.toHaveBeenCalled();
    press('KeyG'); expect(input.emoteWheel).toBe(true);
    press('Mouse0'); press('Mouse2'); press('KeyW'); press('Space'); press('KeyR');
    expect(input.sample(0)).toMatchObject({ moveX: 0, moveZ: 0, fire: false, ads: false, jump: false });
    expect(actions).not.toHaveBeenCalled();
    press('Digit3'); expect(choice).toHaveBeenCalledWith(2); expect(closed).toHaveBeenCalledWith(true);
    expect(input.emoteWheel).toBe(false); expect(actions).not.toHaveBeenCalled();
    press('KeyG', false); expect(closed).toHaveBeenCalledOnce();
    expect(input.sample(0)).toMatchObject({ moveZ: 0, fire: false, ads: false });
    press('Mouse0', false); press('Mouse0'); expect(actions).toHaveBeenCalledOnce();
  });
  it('cancels an open emote wheel on input clear and commits only a normal release', () => {
    const input = controller(); input.locked = true; input.onEmoteOpen = () => true;
    const closed = vi.fn(); input.onEmoteClose = closed;
    const press = (down: boolean) => (input as any).press(DEFAULT_SETTINGS.bindings.emote, down, false);
    press(true); input.clear(); expect(closed).toHaveBeenCalledWith(false);
    press(false); expect(closed).toHaveBeenCalledOnce();
    press(true); press(false); expect(closed).toHaveBeenLastCalledWith(true);
    expect(closed).toHaveBeenCalledTimes(2);
  });
  it('routes pointer movement to the wheel without turning the camera', () => {
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn), pointerLockElement: null });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
    input.locked = true; input.onEmoteOpen = () => true;
    const move = vi.fn(); input.onEmoteMove = move;
    (input as any).press(DEFAULT_SETTINGS.bindings.emote, true, false);
    listeners.get('mousemove')!({ movementX: 80, movementY: -40 });
    expect(move).toHaveBeenCalledWith(80, -40); expect(input.frame.yaw).toBe(0); expect(input.frame.pitch).toBe(0);
    input.closeEmoteWheel(); listeners.get('mousemove')!({ movementX: 80, movementY: -40 });
    expect(input.frame.yaw).not.toBe(0); expect(input.frame.pitch).not.toBe(0);
  });

  it('asks the host to cancel gestures for local-only controls', () => {
    const input = controller(); input.locked = true; const cancel = vi.fn(); input.onCancelEmote = cancel;
    for (const action of ['scoreboard', 'map', 'inspect', 'interact']) (input as any).press(DEFAULT_SETTINGS.bindings[action], true, false);
    expect(cancel).toHaveBeenCalledTimes(4);
    (input as any).press(DEFAULT_SETTINGS.bindings.map, true, true);
    expect(cancel).toHaveBeenCalledTimes(4);
  });

  it('cancels the host gesture and wheel when focus leaves the game', () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), hidden: true });
    vi.stubGlobal('window', { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) });
    const input = new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
    const cancel = vi.fn(), close = vi.fn(); input.onCancelEmote = cancel; input.onEmoteClose = close; input.emoteWheel = true;
    listeners.get('blur')!(); expect(cancel).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledWith(false);
    listeners.get('visibilitychange')!(); expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('does not claim B when an existing saved action already uses it', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ bindings: { reload: 'KeyB' } }) });
    const settings = loadSettings(); expect(settings.bindings.reload).toBe('KeyB'); expect(settings.bindings.emote).toBe('');
  });

  it('keeps old saved keys, fills new actions from the defaults and rejects Escape or unknown codes', () => {
    const store = new Map<string, string>([['uc-v2-settings', JSON.stringify({ bindings: { reload: 'KeyT', fire: 'Escape', ads: 'Mouse9', jump: 'Mouse1' } })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} });
    const settings = loadSettings();
    expect(settings.bindings.reload).toBe('KeyT');
    expect(settings.bindings.jump).toBe('Mouse1');
    expect(settings.bindings.fire).toBe('Mouse0');
    expect(settings.bindings.ads).toBe('Mouse2');
    expect(settings.bindings.useRapadura).toBe('Digit9');
    expect(settings.bindings.map).toBe('KeyM');
  });
  it('leaves a newly added action unbound when an old save already uses its default key', () => {
    const store = new Map<string, string>([['uc-v2-settings', JSON.stringify({ bindings: { reload: 'KeyI' } })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} });
    const settings = loadSettings();
    expect(settings.bindings.reload).toBe('KeyI');
    expect(settings.bindings.inspect).toBe('');
    const input = controller();
    input.setSettings(settings); input.locked = true;
    const actions: { type: string }[] = [], inspect = vi.fn();
    input.onAction = action => actions.push(action); input.onInspect = inspect;
    (input as any).key({ code: 'KeyI', repeat: false, preventDefault: () => {} }, true);
    expect(actions.map(a => a.type)).toEqual(['reload']);
    expect(inspect).not.toHaveBeenCalled();
  });
});


describe('procedural music settings migration', () => {
  it('upgrades only an unversioned old default and preserves intentional volumes after saving', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
    for (const key of ['uc-settings', 'uc-v2-settings']) {
      store.clear(); store.set(key, JSON.stringify({ music: .25 }));
      expect(loadSettings().music).toBe(.5);
    }
    for (const music of [0, .1, .5, 1]) {
      store.set('uc-v2-settings', JSON.stringify({ music })); expect(loadSettings().music).toBe(music);
    }
    saveSettings({ ...DEFAULT_SETTINGS, music: .25 });
    expect(loadSettings().music).toBe(.25);
    expect(JSON.parse(store.get('uc-v2-settings')!).musicMix).toBe(2);
  });
});
