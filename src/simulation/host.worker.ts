import { Simulation } from './index';
import type { InputFrame, PlayerAction, PlayerProfile, RoomConfig, WorldSpec } from '../shared/types';

type Command =
  | { type: 'init'; world: WorldSpec; config: RoomConfig; players: PlayerProfile[]; matchId: string }
  | { type: 'input'; id: string; input: InputFrame }
  | { type: 'action'; id: string; action: PlayerAction }
  | { type: 'player'; profile: PlayerProfile; status: 'join' | 'disconnect' | 'reconnect' | 'expired' }
  | { type: 'stop' };

let simulation: Simulation | null = null;
let previous = performance.now();
let accumulator = 0;
let ticks = 0;

self.onmessage = ({ data }: MessageEvent<Command>) => {
  try {
    if (data.type === 'init') {
      simulation = new Simulation(data.world, data.config, data.players, data.matchId);
      previous = performance.now(); accumulator = 0; ticks = 0;
      publish();
    } else if (data.type === 'stop') simulation = null;
    else if (data.type === 'input') simulation?.input(data.id, data.input);
    else if (data.type === 'action') simulation?.action(data.id, data.action);
    else if (data.type === 'player') simulation?.player(data.profile, data.status);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'A simulação foi interrompida.' });
  }
};

function publish() {
  if (!simulation) return;
  self.postMessage({ type: 'snapshot', snapshot: simulation.snapshot(), events: simulation.drainEvents() });
}

setInterval(() => {
  const now = performance.now();
  const elapsed = (now - previous) / 1000;
  previous = now;
  if (!simulation) return;
  // A sleeping host must never fast-forward damage or empty a magazine on resume.
  if (elapsed > .5) {
    accumulator = 0;
    self.postMessage({ type: 'suspended' });
    publish();
    return;
  }
  accumulator += Math.min(elapsed, .1);
  let steps = 0;
  const started = performance.now();
  try {
    while (accumulator >= 1 / 60 && steps < 6) {
      simulation.step(1 / 60);
      accumulator -= 1 / 60;
      steps++; ticks++;
      if (ticks % 3 === 0) publish();
    }
    if (ticks % 120 === 0 && steps) self.postMessage({ type: 'metrics', tickMs: (performance.now() - started) / steps });
  } catch (error) {
    simulation = null;
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Erro na simulação.' });
  }
}, 1000 / 120);
