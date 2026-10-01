// Bakes the procedural sound bank off the main thread, combat sounds first.
import { bakeOrder, renderSound, type Quality } from './bank';

export interface BakeRequest { rate: number; quality: Quality }
export type BakeMessage = { type: 'sound'; id: string; variant: number; rate: number; loop: boolean; channels: Float32Array[] } | { type: 'done'; ms: number };

self.onmessage = (event: MessageEvent<BakeRequest>) => {
  const started = performance.now(), { rate, quality } = event.data;
  for (const { sound, variant } of bakeOrder(quality)) {
    const out = renderSound(sound, variant, rate, quality);
    const message: BakeMessage = { type: 'sound', ...out };
    (self as unknown as Worker).postMessage(message, out.channels.map(c => c.buffer as ArrayBuffer));
  }
  (self as unknown as Worker).postMessage({ type: 'done', ms: performance.now() - started } satisfies BakeMessage);
};
