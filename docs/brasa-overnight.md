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
- MUD LANDABLE `304c8ad8f72f92eb3dbc1139df78e9274526f47a`: check, 459 units with two workers, build and Chromium 3/3 passed. Includes rio-6, core `3a268dc`, UI `03f5939`, surfaces `e430968`, audio `b77f484` and stable authored capy `d085c70`. All three real contacts heal correctly and damage interrupts soaking. Prompt, healing and full-health captures pass at 720p/1080p; nine surface comparison/Low captures have no shader errors. Exact plaza16 Medium720/DPR1: 1,557,971 triangles, 262 draws, 60 FPS, p95 17.7 ms, exactly 180 draws across 180 RAFs.
- TRAMPOLINE LANDABLE `7181990d76d4c237180f5813741d3b90b797e620`: check, 471 units with two workers, build and Chromium 3/3 passed. Real host/prediction arcs and 720p/1080p/Low/reduced-motion captures passed. Exact plaza16 remains 1,557,971 triangles / 262 draws / 60 FPS. All five original features are complete.

## Integration contracts

- Water: `waterAt(x,z)` and `WATER_LEVEL=-0.05` in `src/shared/water.ts`. Swim constants in `shared/collision.ts`: depth 1.05 m, draft 1.1 m, speed 2.5 m/s.
- Actor: `swimming:boolean`, `wetUntil:number`. Event: `{type:'water', actor, pos, entering}`.
- Emotes: action `{type:'emote', id, emote:EmoteId|null}`. IDs wave/dance/victory/sit/chill, durations 3/8/4/12/12 seconds. `EMOTES[id].label`, `EMOTE_IDS` and `EMOTE_LOOK_EPSILON` exported from `shared/emotes.ts`. State emote/emoteUntil; a new deadline identifies a restart. Look cancellation exceeds 0.0001 radians on either axis; movement, actions, damage, swim, airborne state and expiry also cancel. Sit/chill use the 1.3 m crouched capsule. Protocol 5 carries both fields.
- Corrente: mode `corrente`, export `CORRENTE_LADDER` from shared/weapons.ts; pistol, smg, m4, shotgun, dmr, sniper, slingshot, machete. State `weaponLevel` is zero-based. Shared `isArenaMode` includes Correria and Corrente. Protocol6 adds the level at tuple index29. Each valid elimination upgrades the sole common gun; respawn keeps the stage and reload renews reserve ammo. A final actual machete elimination wins, with no clock win. Event `{type:'upgrade',actor,weapon,level}` drives feedback. Snapshot remaining counts eliminations needed by the leader,8 initially and1 on the final stage.
- Map interactions next: optional world.mudBaths `{id,x,y,z,radius}[]` and world.trampolines `{id,x,y,z,radius,impulse}[]`; y comes from Oficina generated kit contact metadata.
- Mud: required Actor `soaking:boolean`, protocol 7 flag bit 128. Exact grounded sit/chill contact and at least three seconds since harm make soaking true, including at full health. Healing is authoritative at 4 HP/s, capped at 100; damage cancels immediately. F on the exact current bath ID starts chill. Shared movement only clears invalid soaking, never heals prediction. Review poses `mudPrompt`, `mudSoak` and `mudFull` derive contact from current world metadata.
- Trampolines: exact authored contact applies `TRAMPOLINE_IMPULSE=12` in shared movement. Actor `bounceSeq` increases once per launch; `bounceProtected` grants only fall immunity until dry landing or swimming. Death/respawn clears protection. Protocol 8 uses flag bit 256 and tuple index 30 for the sequence. Authoritative `{type:'bounce',id,actor,pos}` drives mat recoil, spring audio, pooled dust and foot-anchored squash/stretch. Review poses `trampolineBounce` and `trampolineAir` use five and twenty real movement ticks after contact.

## Thermal coordination

After the combined Tucano and bot gate, Brasa releases directly to Vitrine scoreboard, then Oficina boing. Explicit handoff required. Brasa capture browsers and dev servers are closed before release.
While another owner runs, source work and focused single-file tests only. No build, full suite, capture, Blender or Chromium gate overlap. Close pages and stop dev servers after each owned slot.


## Tucano and bot personality, verified 2026-09-26

The director requested this batch after accepting all five original features. Runtime checkpoint `9aebde574c2229a616ca86f5a1f44d63e2c4e7c3` passes typecheck, 529 tests across 78 files with at most two workers, production build and Chromium 3/3 in 63.1 seconds command time. The subsequent handoff commit changes documentation only. The optional golden win-streak cosmetic remains deferred because persistent network cosmetics are not a trivial extension.

- Protocol 9, world `ilha-v3-rio-6`. The coherent base includes Mapa paving `063f520`, Vitrine lobby `fc3c704`, Oficina capy `4c74f69` and Cena recessed baths `5185f29`, preserving all five previous gameplay features.
- BR has two delivery opportunities at 45 and 125 seconds after match start. A separate seeded random stream selects the largest connected navigation component, dry flat ground, multiple walk-ins, a next-zone inset and recreation exclusions. Sites with no safe candidate are skipped. The 1.25 m descent column includes the actual 3.48 m canopy with a 3.5 m allowance; an overhead obstruction regression and decoded asset bounds protect it.
- Required snapshot `supplyDrops` contains at most two `{id,pos,district,heading,announcedAt,releaseAt,landsAt,opened}` records. District is the authored district ID. Shared timestamp helpers define a five-second carrier approach and twelve-second descent from 32 m. Reconnects retain the phase and position. Prediction and compact actor packets are unchanged.
- Existing interaction opens only a landed, nearby crate with line of sight. One contested claim spills an epic or legendary gun, armour and ammo as ordinary unowned loot. Crates remain nonblocking. Incoming, landed and opened events each occur once.
- Oficina asset `01ca070` supplies the original toucan-painted cargo balloon, wood/teal crate and scalloped chute, nine LOD roots and 329,384 actual bytes. Cena presentation `0655c6e`, manifest `87376b2` and fold correction `475e0e1` are integrated. Low uses three smoke cards; reduced motion removes smoke and sway. The brief fold gathers above the crate lid without moving the root or widening the clearance.
- Vitrine UI `eba6592` supplies the map ping, off-map arrow, district announcement and landed prompt. Opening clears only that delivery's active announcement (`6a7d70a`). The legend meets the existing 13 px design minimum. No second opened announcement is added.
- Bot personality has its own seeded random stream: occasional 1.8-second wave/dance after three quiet seconds, nearby safe bath visits using actual contact healing, and one idle trampoline bounce followed by the same verified walk-in exit. Low rim entry and grounded-only stuck detection are covered on all six authored sites. Threats, harm, storm travel, reload and swimming cancel leisure. Visible human weapon range suppresses gestures, including a distant sniper sightline. Combat perception, reaction and damage tuning stay intact. Bots also open and collect supply loot.
- Twelve personality and thirteen existing bot intents pass. The full gate caught a stale guest event allowlist that had omitted water, upgrade, bounce and supply feedback. `9aebde5` fixes the receiver and makes the type map compile-exhaustive. Seven receiver regressions protect current host/match, duplicate delivery and unknown event rejection. The real PeerJS test verifies delivery descent after reconnect and one opened event despite duplicate sends.
- Four delivery phases were reviewed at 1280x720 and 1920x1080, DPR 1, plus both full maps, Low, reduced motion and clean post-announcement maps. Fourteen final evidence images have no browser/shader errors. Cena accepted the corrected fold; Vitrine accepted the UI. The incoming/descent observer happens to stand near an ordinary chest, so its generic chest prompt is valid and is not an airborne delivery interaction.
- Exact settled plaza16, Medium 1280x720/DPR 1: 1,559,995 triangles, 262 draw calls, 60.00 FPS, p95 18.6 ms, exactly 180 draws over 180 RAFs. This remains below the 1.58 million triangle cap. The Low descent view uses 809,319 triangles and 205 draw calls.

Evidence: shared reviews `A-brasa-supplyIncoming-*`, `A-brasa-supplyDescending-*`, `A-brasa-supplyLanded-*`, `A-brasa-supplyOpened-*`, `A-brasa-supplyMap-*` and `A-brasa-supply-plaza16-720.png`. Local logs are in `output/brasa/supply/`, including the original failures and their passing reruns. All capture/game browsers and ports 5174, 9001 and 5195 are closed before direct release to Vitrine. No remote Git or deployment was performed by Brasa.

## First-person motion, 2026-09-26 core rescope

Source checkpoint only until the reserved slot after Cena. Reload, melee and transition ownership was handed off by Cena; Oficina confirmed the current palm anchors and identity part roles will survive the new paw/machete geometry. Production gameplay durations, movement, network state and damage are unchanged.

- Shared presentation cues drive seven distinct reloads and their contact sounds. Magazine weapons anticipate, grasp, withdraw, insert, bump, rack and settle. The shotgun feeds one shell during each existing 0.55-second reload; the slingshot seats a stone. Original tiny procedural shell/stone props use existing materials and are prewarmed and disposed with the view.
- Quintic curves have still endpoints. The support paw rotates around its authored palm, follows the magazine, then meets the action. Normal completion reaches exact rest at the authoritative deadline; cancellation eases back. Audio receives the same estimated simulation time as the renderer, preserving the predicted local listener.
- A 0.46-second machete action alternates direction, winds up, crosses a fast arc, follows through and recovers. A confirmed contact pauses only presentation for 35 ms, still fitting the existing 0.5-second attack cadence. A two-triangle trail and pooled impact puff add feedback. Camera kick, trail and hit-stop are suppressed by reduced motion; simulation and input keep running.
- Equip/holster use eased travel below the frame. Sprint/bob and nearby-wall motion recover smoothly; the existing eased ADS and landing springs remain. Respawn/hidden views clear transient motion. Automatic firearm action cycles finish before the next legal shot.
- QA `window.__capyQA.motion(weapon, action, seconds)` replays reload, left/right swing or hit, equip, sprint, ADS and landing with a continuously advancing presentation clock. Eight-frame strips and 1080 contact stills are required before claiming landable.

Separately, test-only `f424614` fixes an exact local-double yaw assertion and arms host/guest transient-emote observation before selection. Vitrine verified it in `170898d` with check, 536 units, build and Chromium 4/4. The runtime input/transport contract was not changed.

After this visual gate, the authorized gameplay audit uses seeded bot evidence for TTK/spread, movement, storm/loot and upstairs access. Mapa owns building geometry/traversal metadata and the future rio-7 tree colliders. Brasa will not alter `collision.ts` while that geometry audit is active.
