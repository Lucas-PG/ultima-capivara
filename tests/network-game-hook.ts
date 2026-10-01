import type { InputController } from '../src/input';
import type { WorldSpec } from '../src/shared/types';
import { hasLineOfSight } from '../src/shared/collision';
import { navigationWaypoint, walkableSegment } from '../src/shared/navigation';
import { WEAPONS } from '../src/shared/weapons';

/** Loaded only with VITE_QA=1 and ?networkQa=1, never by a production build. */
export function installNetworkInput(input: InputController, world?: WorldSpec) {
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
    // A live-match driver in a built page (no /src imports there) routes and aims with the game's own rules.
    driver: { world, nav: { navigationWaypoint, walkableSegment }, collision: { hasLineOfSight }, weapons: { WEAPONS } },
  } });
}
