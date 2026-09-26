# Gameplay overnight handoff

Brasa owns simulation, shared movement and feature network contracts on `c/gameplay`.
The current Brasa brief and overnight request supersede the older shared gameplay freeze and 90-minute stop.

## Success criteria

- Swimming, emotes, Corrente, mud baths and trampolines each have deterministic authority, matching prediction where movement applies, and intent tests.
- Each landable feature passes typecheck, full unit suite with at most two workers, production build and Chromium multiplayer gate.
- Feature evidence at 1280x720, with swimming also checked at 1920x1080.
- No remote Git operations or deployment by Brasa.

## Current state

- Adopted Mapa water helper `3cbddff` as `2d5232f`.
- Swimming core checkpoint `39ec36a`: shared float/contact/slow movement, pistol selection and combat restrictions, bot water navigation and concealment, transition events, protocol 4 compact replication.
- Typecheck passed. Swimming 11/11 and network 19/19 focused tests passed. Full gate and presentation are pending, so this is not yet a landable feature.
- Cena owns splash/drip audio, wakes, swimmer avatar and local camera presentation. Vitrine owns the swimming stance prompt.
- Mapa is authoring quay swim exits. Oficina owns new emote clips, mud bath and trampoline geometry/metadata.

## Integration contracts

- Water: `waterAt(x,z)` and `WATER_LEVEL=-0.05` in `src/shared/water.ts`. Swim constants in `shared/collision.ts`: depth 1.05 m, draft 1.1 m, speed 2.5 m/s.
- Actor: `swimming:boolean`, `wetUntil:number`. Event: `{type:'water', actor, pos, entering}`.
- Emotes next: action `{type:'emote', id, emote:EmoteId|null}`. IDs wave/dance/victory/sit/chill, durations 3/8/4/12/12 seconds. State emote/emoteUntil. Vitrine owns remappable B wheel with captured pointer lock.
- Corrente next: mode `corrente`, export `CORRENTE_LADDER` from shared/weapons.ts; pistol, smg, m4, shotgun, dmr, sniper, slingshot, machete. State weaponLevel, zero-based.
- Map interactions next: optional world.mudBaths `{id,x,y,z,radius}[]` and world.trampolines `{id,x,y,z,radius,impulse}[]`; y comes from Oficina generated kit contact metadata.

## Thermal coordination

Queue: Cena, Vitrine, Mapa, Brasa, then Oficina. Explicit handoff required.
While another owner runs, source work and focused single-file tests only. No build, full suite, capture, Blender or Chromium gate overlap. Close pages and stop dev servers after each owned slot.
