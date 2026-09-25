import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/input';
import { DEFAULT_SETTINGS, loadSettings } from '../src/settings';

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
  it('drives every action through its binding, including remapped mouse buttons', () => {
    const input = controller();
    input.locked = true;
    const actions: { type: string; slot?: number; item?: string }[] = [];
    input.onAction = action => actions.push(action);
    const key = (code: string, down = true) => (input as any).key({ code, repeat: false, preventDefault: () => {} }, down);
    const mouse = (button: number, down = true) => (input as any).mouse({ button, preventDefault: () => {} }, down);
    // Defaults: left mouse fires, right aims, 1-4 slots, 5-9 cures, Tab scoreboard.
    mouse(0); expect(input.frame.fire).toBe(true); expect(actions.at(-1)!.type).toBe('trigger'); mouse(0, false);
    mouse(2); expect(input.sample(0).ads).toBe(true); mouse(2, false);
    key('Digit3'); expect(actions.at(-1)).toMatchObject({ type: 'slot', slot: 2 });
    key('Digit8'); expect(actions.at(-1)).toMatchObject({ type: 'consume', item: 'acai' });
    key('Tab'); expect(input.scoreboard).toBe(true); key('Tab', false); expect(input.scoreboard).toBe(false);
    // Remapped: fire on a side button, slot 1 on Q, bandage on G, sprint held on the other side button.
    input.setSettings({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings, fire: 'Mouse3', slot1: 'KeyQ', leanLeft: 'KeyZ', useBandage: 'KeyG', sprint: 'Mouse4' } });
    const before = actions.length;
    mouse(0); expect(input.frame.fire).toBe(false); expect(actions.length).toBe(before);
    mouse(3); expect(input.frame.fire).toBe(true); mouse(3, false); expect(input.frame.fire).toBe(false);
    key('Digit1'); expect(actions.filter(a => a.type === 'slot').length).toBe(1);
    key('KeyQ'); expect(actions.at(-1)).toMatchObject({ type: 'slot', slot: 0 });
    key('KeyG'); expect(actions.at(-1)).toMatchObject({ type: 'consume', item: 'bandage' });
    mouse(4); input.frame.moveZ = 1; expect(input.sample(0).sprint).toBe(true); mouse(4, false); expect(input.sample(0).sprint).toBe(false);
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
});
