import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/simulation';
import { createWorld } from '../src/shared/world';
import { encodeFastFrame, fastPart, gearPart, packet, worldPart } from '../src/network/codec';
import type { PlayerProfile, RoomConfig } from '../src/shared/types';

const world = createWorld();
const humans: PlayerProfile[] = Array.from({ length: 16 }, (_, i) => ({ id: `human-${i}`, name: `Human ${i}`, color: '#bbbbbb', ready: true, connected: true }));
const run = async (config: RoomConfig, count: number) => {
  let peak = 0, total = 0, ticks = 0;
  const wireBytes = { frames: 0, base: 0, gear: 0, events: 0 };
  let baseUpdates = 0, gearUpdates = 0, maxFrameBytes = 0, compressionFallbacks = 0;
  for (let match = 0; match < count; match++) {
    const matchId = match.toString(16).padStart(48, '0');
    const sim = new Simulation(world, config, humans, matchId, match + 1);
    let previousWorld = '', previousGear = '', worldRev = 0, gearRev = 0;
    const started = performance.now();
    for (let tick = 0; tick < 3600; tick++) {
      for (let i = 0; i < humans.length; i++) sim.input(humans[i].id, {
        seq: tick, moveX: Math.sin(tick * .02 + i), moveZ: Math.cos(tick * .02 + i), yaw: tick * .003 + i,
        pitch: 0, sprint: tick % 100 < 50, crouch: false, jump: false, fire: tick % 30 < 8,
        ads: false, lean: 0, clientTime: tick / 60,
      });
      sim.step(1 / 60);
      if (tick % 3 === 0) {
        const snapshot = sim.snapshot(), events = sim.drainEvents();
        const base = worldPart(snapshot), gear = gearPart(snapshot);
        const worldJson = JSON.stringify(base), gearJson = JSON.stringify(gear);
        if (worldJson !== previousWorld) {
          previousWorld = worldJson; worldRev++; baseUpdates++;
          wireBytes.base += JSON.stringify(packet('base', { rev: worldRev, data: base })).length;
        }
        if (gearJson !== previousGear) {
          previousGear = gearJson; gearRev++; gearUpdates++;
          wireBytes.gear += JSON.stringify(packet('gear', { rev: gearRev, data: gear })).length;
        }
        const frame = JSON.stringify(packet('frame', { wr: worldRev, gr: gearRev, data: fastPart(snapshot) }));
        const encoded = await encodeFastFrame(frame);
        if (!encoded) throw new Error('Fast frame exceeded the wire limit');
        if (typeof encoded === 'string') compressionFallbacks++;
        const frameBytes = typeof encoded === 'string' ? new TextEncoder().encode(encoded).byteLength : encoded.byteLength;
        wireBytes.frames += frameBytes;
        maxFrameBytes = Math.max(maxFrameBytes, frameBytes);
        for (let offset = 0; offset < events.length; offset += 200)
          wireBytes.events += JSON.stringify(packet('events', { matchId, data: events.slice(offset, offset + 200) })).length;
      }
    }
    total += performance.now() - started; ticks += 3600;
    peak = Math.max(peak, process.memoryUsage().heapUsed);
  }
  const bytesPerGuest = Object.values(wireBytes).reduce((sum, bytes) => sum + bytes, 0);
  return { matches: count, actors: config.mode === 'battle-royale' ? 21 : 16,
    meanTickMs: +(total / ticks).toFixed(4), peakHeapMB: +(peak / 1024 / 1024).toFixed(1),
    maxFrameBytes, compressionFallbacks, baseUpdates, gearUpdates, wireBytesPerGuest: wireBytes,
    hostOutboundMbpsTo15Guests: +(bytesPerGuest * 15 * 8 / (ticks / 60) / 1_000_000).toFixed(2) };
};
const base: RoomConfig = { mode: 'battle-royale', capacity: 16, bots: true, difficulty: 'normal', duration: 300 };
console.log(JSON.stringify({ battleRoyale: await run(base, 3), deathmatch: await run({ ...base, mode: 'deathmatch', bots: false }, 3) }, null, 2));
