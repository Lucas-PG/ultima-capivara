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

The original internal cores are retained only for deterministic visual dressing placement. After full shells are installed, final spawn, loot and navigation data are rebuilt. Three low formations move to preserve already authored walking routes and a ground entrance: 716 by 1.118 m, 1146 by 3 m and 1149 by 0.5 m. The final reduced hull fit selects x + 3 m for 1146. One street bicycle moves 0.707 m out of real stone. The complete before/after coordinates are in [geometry-placement.json](evidence/codex-bughunt/geometry-placement.json). These are intentional local scene corrections.

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

v1/v2 use the first complete hull implementation. v3 adds the HUD and new modes. v4 uses the final reduced hulls with the complete modes UI. The final PeerJS run uses the later mode corrections through `52961fe` as well. All five modes have natural completed matches; the latest final-hull Correria repeat was interrupted at 123.35 s by the capacity restart at about 13:09 and is explicitly incomplete.

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

The local PeerJS join/reload/leave evidence will be appended after the 13:18 to 13:27 quiet window. At the restart, all our browser and preview processes ended; this was verified before quiet. Final jobs will be closed after capture. No push, PR, deployment or main-branch action is performed. Gameplay balance and network actor codec were preserved by our fixes; new round rules and mode/UI changes were authored and delivered by the modes owner.
