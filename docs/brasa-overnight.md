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
- Swimming landable integration `4afe293`: typecheck, 363 unit tests (maxWorkers 2), production build and Chromium 3/3 passed. Includes Mapa `77735a9`, Vitrine `953d842`, Cena `1920059` and `34cc6e9`.
- Waterline, remote swimmer and dry exit captures saved at 720p/1080p in shared reviews. Medium 720p warm sample: 60 FPS, p95 17.7 ms, 234 draw calls, DPR 1. Browser and servers closed before release to Oficina.
- Emote authority is the next isolated source checkpoint. Vitrine owns wheel/input/main hooks; Cena owns third-person camera and clip/procedural presentation. Oficina owns new authored clips and recreation kit metadata.

## Integration contracts

- Water: `waterAt(x,z)` and `WATER_LEVEL=-0.05` in `src/shared/water.ts`. Swim constants in `shared/collision.ts`: depth 1.05 m, draft 1.1 m, speed 2.5 m/s.
- Actor: `swimming:boolean`, `wetUntil:number`. Event: `{type:'water', actor, pos, entering}`.
- Emotes: action `{type:'emote', id, emote:EmoteId|null}`. IDs wave/dance/victory/sit/chill, durations 3/8/4/12/12 seconds. `EMOTES[id].label`, `EMOTE_IDS` and `EMOTE_LOOK_EPSILON` exported from `shared/emotes.ts`. State emote/emoteUntil; a new deadline identifies a restart. Look cancellation exceeds 0.0001 radians on either axis; movement, actions, damage, swim, airborne state and expiry also cancel. Sit/chill use the 1.3 m crouched capsule. Protocol 5 carries both fields.
- Corrente next: mode `corrente`, export `CORRENTE_LADDER` from shared/weapons.ts; pistol, smg, m4, shotgun, dmr, sniper, slingshot, machete. State weaponLevel, zero-based.
- Map interactions next: optional world.mudBaths `{id,x,y,z,radius}[]` and world.trampolines `{id,x,y,z,radius,impulse}[]`; y comes from Oficina generated kit contact metadata.

## Thermal coordination

Current queue after swimming: Oficina, Vitrine, Brasa. Explicit handoff required.
While another owner runs, source work and focused single-file tests only. No build, full suite, capture, Blender or Chromium gate overlap. Close pages and stop dev servers after each owned slot.
