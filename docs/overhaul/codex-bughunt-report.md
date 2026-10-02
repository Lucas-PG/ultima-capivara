# Bug hunt: coastal stone, downhill footsteps and complete live sessions

Date: 2 October 2026, America/Sao_Paulo. Owner: `codex-bughunt`. Source fixes are already integrated by root: `90d7459`, `8ad717f`, `99af8bc`, `136623e`. This report and the adjacent evidence describe our own game, with no external images or private references included.

## Solid visible stone

The four coastal families had smaller internal collision boxes than their visible beveled stone chunks. A player, bot or camera could enter their outer shell. Every stone chunk now has a convex hull fitted to the stone vertices of the shipped GLB across all three LODs. Bounds remain the broad phase; the hull is the shared narrow phase for movement, headroom, spawn and loot placement, navigation, building access, bullets and line of sight, supplies, aerial landing, ricochets, audio surfaces and camera rays. The final camera pose also keeps its lens outside stone, including parachute and death poses. Hollow buildings and cave openings keep their existing individual wall pieces.

| Family | World instances | Faces per chunk |
| --- | ---: | --- |
| `cliff_rock` | 10 | 88, 106, 94, 106 |
| `cliff_rock_low` | 74 | 106, 94, 94, 106 |
| `cliff_rock_tall` | 34 | 100, 100, 100, 94 |
| `cliff_ledge` | 16 | 106, 100, 106, 100 |

There are 134 formations, 536 convex chunks and 53,528 planes. The generator exports the source bevel planes, then `fit-rock-collision.mjs` fits their offsets against the decoded final asset. The 1 cm fitting allowance covers decimation and quantization. Tests check every stone vertex and face centroid at each LOD, plus collision entry against actual triangle intersections with the authored bevel tolerance. Grass meshes are excluded from the solid stone envelope. The GLB itself is unchanged.

The original internal cores are retained only for deterministic visual dressing placement. After full shells are installed, final spawn, loot and navigation data are rebuilt. Five low formations move to preserve authored walking routes, ground entrances and room floors: 716 by 1.118 m, 1123 by 0.707 m, 1145 by 1.803 m, 1146 by 3 m and 1149 by 0.5 m. The final reduced hull fit selects x + 3 m for 1146. One street bicycle moves 0.707 m out of real stone. The complete before/after coordinates are in [geometry-placement.json](evidence/codex-bughunt/geometry-placement.json). These are intentional local scene corrections.

The geometry regression exercises all four families with real `moveActor` calls, both human and bot actors, eight approach directions and multiple rotations and scales. Each frame checks body clearance, rather than checking collider counts alone. Shape probes cover grid raycasts, line of sight, navigation, spawns and empty AABB corners. Camera probes cover 24 approaches per family and the final parachute lens. Existing real bot routes and world integrity checks also pass.

## Footsteps while descending

Every grounded transition previously triggered a landing sound. Small downhill drops therefore emitted landing pops at each tread. `StepCadence` now accumulates horizontal distance through ordinary brief contact loss, with the existing walk, sprint, crouch and swim stride distances. An actual jump or tall drop resets the stride and emits one landing. Teleports reset accumulated distance.

The real movement regression descends ten 18 cm steps and a convex ramp. Walk, sprint and crouch produce `floor(distance / stride)` steps, equal to the flat reference, with no landing sounds despite more than 15 actual airborne frames on the stairs. A separate 1.8 m ledge emits exactly one landing. Local and remote footsteps use the same cadence implementation.

## Natural live bot matches

`tools/qa/bughunt-live.mjs` drives real keyboard and mouse actions at 20 Hz through the existing QA input tools and live driver. It does not change health, damage, physics, time or bot state. Chrome uses the installed hardware channel with `--use-gl=angle --use-angle=gl-egl`, one process per run. Captures are 1280 x 720. The full samples, stage transitions, heap, renderer counters, console errors, failed requests and results are stored in each run's `live.json`.

| Recorded run | Mode | Natural result time | Human eliminations/deaths | Result |
| --- | --- | ---: | --- | --- |
| [v1](evidence/codex-bughunt/live-v1/live.json) | Correria (`deathmatch`) | 483.05 s | 51 / 11 | First place; full eight minute timer |
| [v2](evidence/codex-bughunt/live-v2/live.json) | Última Capivara (`battle-royale`) | 176.75 s | 5 / 1 | Third place, 21 entrants including 20 bots |
| v2 | Corrente | 114.10 s | 9 / 4 | Winner |
| [v3](evidence/codex-bughunt/live-v3/live.json) | Duelo | 97.00 s | 5 / 0 | 5 to 0 |
| v3 | Duelo rematch | 129.10 s | 5 / 1 | 5 to 1 |
| [v4](evidence/codex-bughunt/live-v4/live.json) | Turmas 2v2 | 242.75 s | 5 / 4 | 5 to 1 |
| v4 | Turmas 3v3 | 284.50 s | 9 / 4 | 5 to 1 |

v1/v2 use the first complete hull implementation. v3 adds the HUD and new modes. v4 uses the final reduced hulls with the complete modes UI. The final PeerJS run uses the later mode corrections through `52961fe` as well. All five modes have natural completed matches; the latest final-hull Correria repeat was interrupted at 123.35 s during the capacity restart and is explicitly incomplete; its last saved sample is 13:09:28.

Completed rounds have zero game page errors, console errors, failed requests or HTTP errors. Two early automation failures are preserved in the raw evidence: v1 selected two leave buttons after results, and v3 attempted a shop button after an authoritative money update disabled it. Both harness issues were fixed; v4 purchases and leaves completed. The live driver now selects the correct local actor in a room, excludes team allies from targets and releases movement during frozen round phases.

BR passed plane at 3.05 s, parachute at 8.05 s and ground at 18.05 s through real input. Its old sampler reported one 20 s stationary candidate near (63.17, 30.16), without a movement-command sample. The player subsequently moved and the match completed; it was not a permanent stuck state. The later sampler requires commanded walking before recording a dwell. No such dwell occurred in the completed duel or either team-size run. Every v3/v4 sampled live ground actor and camera pose was also checked against stone hulls; no body or lens penetration was recorded. This periodic live sampling supplements the every-frame geometry tests.

## Session resources

Duel and its rematch reused one renderer: 820 to 822 geometries, 71 textures and 76 to 77 programs, with 1,394 objects unchanged. Heap at first start was 225 MB, first results 220 MB, rematch start 225 MB, rematch results 204 MB and home after leave 193 MB. The complete 2v2 to 3v3 transition used 844 to 866 geometries and 77 to 83 textures, matching the larger roster and cached weapons. 2v2 results/home heap was 208/209 MB; 3v3 results/home was 218/219 MB. BR sampled a transient heap peak of 361 MB and results at 252 MB; the following Corrente round started at 222 MB and finished at 231 MB. The home screen retains the renderer by design.

These finite runs show bounded resource behavior through results, rematch, leave and mode changes. They do not establish leak freedom for unbounded sessions. Frame counters in the raw data are observations from this shared desktop, not an M2 or exclusive FPS claim.

## CPU cost and hull reduction

The first hull version had roughly twice as many planes and raised the simulation mean in a preliminary comparison. `99af8bc` removes redundant bevel normals, refits offsets against all shipped LODs and caches static horizontal plane projections. The same strict asset and movement tests stay green.

The reproducible Node harness compares immutable `b721224` and the final collision candidate, interleaved baseline/candidate/candidate/baseline/baseline/candidate. It creates the world, runs seed 37 with 21 natural bots, warms 1,800 ticks and times the next 600 ticks. It separately times 2,000 fixed line-of-sight queries and 400 navigation queries. Medians of three runs are below; source receipts are [cpu-reduced-interleaved.jsonl](evidence/codex-bughunt/cpu-reduced-interleaved.jsonl) and [cpu-summary.json](evidence/codex-bughunt/cpu-summary.json).

| Work | Baseline median | Final median |
| --- | ---: | ---: |
| World creation | 742.10 ms | 815.82 ms |
| Mean simulation tick | 0.5861 ms | 0.4568 ms |
| Tick p95 | 2.0817 ms | 1.6513 ms |
| 2,000 line-of-sight queries | 379.24 ms | 300.05 ms |
| 400 navigation queries | 7.01 ms | 11.12 ms |
| 3,200 camera distance probes | 17.55 ms | 35.59 ms |

The added camera work is about 0.0056 ms per probe, while the navigation difference is about 0.0103 ms per query. Camera clearance is shorter because visible stone now blocks the camera: mean allowed distance changes from 1.266 m to 0.855 m. See [camera-interleaved.jsonl](evidence/codex-bughunt/camera-interleaved.jsonl).

These are bounded checks under shared agent load, not an isolated hardware benchmark. The baseline and candidate have different collider counts, full collision changes bot state and events, and older unrelated geometry/performance code differs. The medians therefore do not prove a causal speedup. They do show that the corrected reduced hull implementation avoided the preliminary large mean worker cost increase in this test.

## Verification and handoff

`npm run check`, production builds and targeted Vitest runs passed for each source delivery with one Vitest worker. The final geometry consumer group passed 79 tests. Audio and real stairs/ramp cadence passed 46 tests. Validation includes `rock-collision`, `world-integrity`, `building-access`, `bot-island-navigation`, `navigation-progress`, `combat-camera`, `emote-camera`, `spectator-camera`, `audio` and `step-cadence-physics` as relevant to their commits. Root runs the integrated full gate and browser suite.

The local PeerJS check completed after the 13:26:40 all-clear. At the restart, all our browser and preview processes ended; this was verified before quiet. All final capture jobs were closed and their PIDs were confirmed absent after the check. No push, PR, deployment or main-branch action is performed. Gameplay balance and network actor codec were preserved by our fixes; new round rules and mode/UI changes were authored and delivered by the modes owner.


## Local PeerJS reload and room teardown

[peer-session.json](evidence/codex-bughunt/peers-v1/peer-session.json) records one hardware Chrome process with two isolated contexts, low graphics, 30 FPS setting, preview on 5197 and local signaling on 9017. Both players joined and readied through the actual UI. Real input progressed from plane through falling and parachute to ground, with both snapshots showing connected living players. The guest then moved 0.632 m on the ground and its settled replicated horizontal position differed from the host by 0.00326 m.

A page reload and ordinary join submission restored the same guest ID and same ongoing match in 20,170 ms, including renderer preparation. The saved position changed by 0 m. After the reload, another four seconds of real movement was accepted. Guest leave and immediate rejoin worked; host leave then cleared the room on both clients, zeroed pending inputs and displayed “O anfitrião fechou a sala.” on the guest. All page, console, failed request and HTTP error records are empty.

The guest renderer had 1,027 geometries and 123 textures before reload and the same counts after reload. Rejoin ended with 1,028 geometries and 123 textures; host and guest scene object counts matched at 3,430. Guest heap changed from 326 MB before reload to 236 MB after it and 253 MB after host closure. Shader/cache counts differ slightly after renderer reconstruction. This is one bounded session, with raw intermediate samples available for review.

Own captures: [ground](evidence/codex-bughunt/peers-v1/guest-ground.png), [restored session](evidence/codex-bughunt/peers-v1/guest-restored.png), [guest after host closure](evidence/codex-bughunt/peers-v1/guest-closed-room.png) and [host home](evidence/codex-bughunt/peers-v1/host-home.png). `tools/qa/bughunt-peers.mjs` reproduces the flow against a QA build configured for local PeerJS. Both QA scripts passed Node syntax checks and `npm run check` passed on the final local source revision. Browser, driver, preview and signaling are stopped; the [lifecycle receipt](evidence/codex-bughunt/process-lifecycle.json) records their PIDs.


## Integrated gate follow-up

The integrated suite found a real full-shell intrusion into the usable floor and stove front of home 1. Final stone placement now protects authored room floors as well as public routes and ground-level doors. Rock 1145 moves 1.803 m and rock 1123 moves 0.707 m to retain usable rooms. The original furniture-front assertion remains unchanged and passes.

The vegetation point and wall-picture checks had treated hull bounds as solids. They now query actual hull occupancy; the picture check clips the complete box against the convex halfspaces, retaining the original 15 mm overlap tolerance. Its independent regressions check an empty broadphase corner, actual intersections and a hull fully enclosed by the query box. The navigation-progress test now uses a clear, explicitly linked gate fixture because its original map position was inside visible stone after the hull correction. It still requires a waypoint more than 2 m forward and explicitly verifies all relevant clear and obstructed links before asserting the next node.

The expanded targeted set passed 87 tests across eleven files and the production build passed. The final floor sampling uses overlapping half-metre footprints and bounds spacing after piece scaling; the four directly affected test files then passed all 21 tests again, with unchanged final rock positions. The interleaved CPU table above predates this room-floor placement follow-up; a one-shot world-creation check with the added floor probes took 874.16 ms under shared load, recorded in `geometry-placement.json`. It is not a comparative timing claim. Full-match and peer captures also predate these final two local rock placement adjustments; root owns the final integrated gate. No changes were made to round rules, physics balance, damage or network actor encoding.
