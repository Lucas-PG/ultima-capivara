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
- Emote checkpoint `bb31802` is landable: check, 409 units (maxWorkers 2), build and Chromium 3/3 passed. Real host/guest selection and cancellation passed. Wheel and all five poses captured at720p, with wave/sit/wheel also at1080p. Medium720 dance held60FPS, p95 18.7ms,200draws,DPR1. Authored sit/chill and a720p wheel-hint placement refinement remain separately owned polish followups.
- Result-only checkpoint `8dd4c5e` adds authoritative `longestShot` in metres, rounded to0.1m. Counts successful ranged damage including armour, measured from the firing origin, and retains the maximum across respawns. Protected hits, melee, self damage and environmental damage do not count. Three focused statistic/replication tests,48 simulation tests and typecheck passed; combined gate pending.
- CORRENTE LANDABLE `9af2e919018f7d07b993538f6b941814967af94b`: typecheck, 433 units with two workers, production build and Chromium 3/3 in 59.7 s passed. Includes core `8cbab2f`, UI `91f31cf`, presentation `0490b87`, authoritative longestShot, water `bf3aa03`, authored 24-clip capy `d085c70` and loaf camera `43dda03`. Real host/guest movement, firing, emotes and recovery passed without page errors.
- Corrente menu, first gun, upgrade glints and final facão captured at 720p/1080p. Authored sit and chill now show grounded contact and clear the HUD at both resolutions. Medium 720p, DPR 1, 16 actors: 60 FPS, p95 17.7 ms, 242 draw calls, 1,524,802 triangles, exactly 180 draws across 180 measured RAFs. Browser and servers closed before direct release to Vitrine.
- Mud core `3a268dc` is an isolated source checkpoint: typecheck and nine focused intents passed, including all three real bath contacts, both seated poses, harm interruption/cooldown and network state. Presentation `e430968` adopted as `3e8ca49`, with pistol LOD `7702072` adopted as `7f01c58`; focused render checks pass, combined browser gate remains pending after Mapa.

## Integration contracts

- Water: `waterAt(x,z)` and `WATER_LEVEL=-0.05` in `src/shared/water.ts`. Swim constants in `shared/collision.ts`: depth 1.05 m, draft 1.1 m, speed 2.5 m/s.
- Actor: `swimming:boolean`, `wetUntil:number`. Event: `{type:'water', actor, pos, entering}`.
- Emotes: action `{type:'emote', id, emote:EmoteId|null}`. IDs wave/dance/victory/sit/chill, durations 3/8/4/12/12 seconds. `EMOTES[id].label`, `EMOTE_IDS` and `EMOTE_LOOK_EPSILON` exported from `shared/emotes.ts`. State emote/emoteUntil; a new deadline identifies a restart. Look cancellation exceeds 0.0001 radians on either axis; movement, actions, damage, swim, airborne state and expiry also cancel. Sit/chill use the 1.3 m crouched capsule. Protocol 5 carries both fields.
- Corrente: mode `corrente`, export `CORRENTE_LADDER` from shared/weapons.ts; pistol, smg, m4, shotgun, dmr, sniper, slingshot, machete. State `weaponLevel` is zero-based. Shared `isArenaMode` includes Correria and Corrente. Protocol6 adds the level at tuple index29. Each valid elimination upgrades the sole common gun; respawn keeps the stage and reload renews reserve ammo. A final actual machete elimination wins, with no clock win. Event `{type:'upgrade',actor,weapon,level}` drives feedback. Snapshot remaining counts eliminations needed by the leader,8 initially and1 on the final stage.
- Map interactions next: optional world.mudBaths `{id,x,y,z,radius}[]` and world.trampolines `{id,x,y,z,radius,impulse}[]`; y comes from Oficina generated kit contact metadata.
- Mud: required Actor `soaking:boolean`, protocol 7 flag bit 128. Exact grounded sit/chill contact and at least three seconds since harm make soaking true, including at full health. Healing is authoritative at 4 HP/s, capped at 100; damage cancels immediately. F on the exact current bath ID starts chill. Shared movement only clears invalid soaking, never heals prediction. Review poses `mudPrompt`, `mudSoak` and `mudFull` derive contact from current world metadata.

## Thermal coordination

Current queue: Vitrine celebrations, Mapa Praia/fort, Brasa mud, Brasa trampoline, Cena, then Oficina's reserved head refinement. Explicit handoff required.
While another owner runs, source work and focused single-file tests only. No build, full suite, capture, Blender or Chromium gate overlap. Close pages and stop dev servers after each owned slot.
