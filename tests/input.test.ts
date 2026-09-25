import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/input';
import { DEFAULT_SETTINGS } from '../src/settings';

afterEach(() => vi.unstubAllGlobals());

describe('local input feel', () => {
  function controller() {
    vi.stubGlobal('document', { addEventListener: () => {}, pointerLockElement: null });
    vi.stubGlobal('window', { addEventListener: () => {} });
    return new InputController({ addEventListener: () => {} } as unknown as HTMLCanvasElement, DEFAULT_SETTINGS);
  }

  it('raises the muzzle while alternating sideways recoil, then returns on release', () => {
    const input = controller();
    input.frame.fire = true;
    input.applyRecoil('m4');
    expect(input.frame.pitch).toBeCloseTo(.011);
    expect(input.frame.yaw).toBeCloseTo(-.003);
    input.applyRecoil('m4');
    expect(input.frame.pitch).toBeCloseTo(.022);
    expect(input.frame.yaw).toBeCloseTo(0);
    input.frame.fire = false;
    for (let i = 0; i < 45; i++) input.recoverRecoil(1 / 60);
    expect(input.frame.pitch).toBeLessThan(.001);
    expect(Math.abs(input.frame.yaw)).toBeLessThan(.001);
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
});
