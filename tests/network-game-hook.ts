import type { InputController } from '../src/input';

/** Loaded only with VITE_QA=1 and ?networkQa=1, never by a production build. */
export function installNetworkInput(input: InputController) {
  Object.defineProperty(window, '__networkQA', { value: {
    activate() { input.locked = true; input.onLock(); },
    pause() { input.unlock(); input.locked = false; input.onPause(); },
    key(code: string, down: boolean) {
      document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    },
    fire() {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    },
    look(yaw: number, pitch: number) { input.frame.yaw = yaw; input.frame.pitch = pitch; },
  } });
}
