# Codex holding, performance and expanded polish pass

2 October 2026. Published baseline: `b721224`. Delivery branch: `codex-holding-perf`. The orchestrator owns the push; this Linux team never pushed, opened a pull request, deployed or changed main.

**Holding acceptance is partial.** The strict ready/movement test matrix passes, but denser reload, draw, holster and inspect sweeps still find contact violations. Those are listed below and in the evidence; this delivery does not claim every requested pose passes.

This report records the original holding/performance work and the user's later additions: HUD consistency, rendering artifacts, rock collision and footsteps, aircraft/parachute art, and two round-based game modes. The last instruction sets green integration at 14:00, final gates at 14:10 and the report/DONE handoff at 14:15, before the orchestrator's 14:30 push. The credential freeze and subsequent restarts interrupted the available work window; saved worktrees and small commits preserved completed changes.

## Team and integration

| Agent | Model / effort | Work |
| --- | --- | --- |
| Lead | Session model | Shared measurement contract, independent review, world-arm implementation and calibration, pistol magazine/release, integration, final gates and handoff |
| holding | gpt-6-astra / max | First-person research, nine-weapon grips, index articulation, motion/reload contacts, baseline and final evidence |
| thirdperson | gpt-6-astra / max | Holding research, real world-skin probes, palm weights, trigger fitting and reload calibration experiments |
| performance | gpt-6.1-sol / max | Profiles, isolated exact-image CPU improvements, interleaved timing and rejected experiment log |
| hud | gpt-6-astra / max | Screenshot research, complete match/menu consistency, readable layout, death/victory/elimination, responsive and cost gates |
| render | gpt-6-astra / max | Black-pixel investigation, actual GPU finite-value regression and backend matrix; later M4 index route assistance |
| bughunt | gpt-6.1-sol / max | Full rock hulls, downhill stride cadence, complete bot matches and local multiplayer |
| plane | gpt-6-astra / max | Original Blender aircraft/canopy and measured draw reduction; later strict TP tests and evidence |
| gamemodes | gpt-6-astra / max | Same-gun Duelo and 2v2/3v3 elimination rounds, economy, shop, bots and multiplayer |

Each stream used its own `codex-*` branch and worktree under `~/codex-team/`. Later QA-only tasks used explicitly disjoint root files. Agents did not spawn children. Final timing windows paused all other browsers, builds, tests and fitting jobs. Third-party pictures remained private; repository evidence is rendered output from this game.

## Holding research and physical acceptance

The team inspected the 56 existing private frames and individual weapon captures from Modern Warfare, Black Ops 6, Apex, Valorant, Battlefield, Halo and Titanfall 2. The visual observations are distinct from developer statements. [Infinity Ward's animation account](https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Detailing-Advancements-in-Animation-and-Authenticity) supports weapon weight, physical magazine transitions and separate tactical/empty reloads. [Riot's arsenal account](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/) supports deliberate readiness cues and identity across views. [Riot's skin-animation account](https://playvalorant.com/en-us/news/dev/the-craft-and-fantasy-of-valorant-weapon-skins/) also makes clear that first-person embellishments are not automatically replicated in third person. [DICE's movement account](https://www.ea.com/games/battlefield/news/gunplay-and-movement-philosophy) treats movement and weapon feedback together. These sources do not prescribe this game's per-finger coordinates.

Pistol/revolver support palms cup the carrying paw; the other firearms carry on their actual foregrip, fore-end or pump. Opposed thumbs and wrapping digits accompany palm contact. The firing index receives separate spread/roll and ready/fired/indexed articulation. Sprint, reload and manipulation releases use explicit contact intent, rather than counting a deliberately free paw as a failed grip. The 44-degree hip lens, aimed lenses, measured composition targets, existing weapon meshes and liveries remain intact. No weapon-size control was added.

The probe measures the shipped skinned vertices, not joint-to-socket distance. It separately checks signed whole-paw penetration, carrying palm and wrapping skin, handgun paired-paw contact, trigger-guard containment and distance to the actual front-facing trigger triangles. Contact limits remain -0.5 to +1.5 mm; wrist limits remain 45 degrees flexion, -25 to +20 degrees deviation and 80 degrees roll. A trigger side graze cannot pass as front contact. Winding-only virtual wrist caps close the QA skin volume but never supply a contact surface. Analytic fixtures cover overlapping solids, trigger sides, false cap contact and shared-geometry metadata isolation.

Before fitting, selected first-person palm gaps were pistol R 4.512 mm, pistol support 13.549 mm, revolver support 11.275 mm, SMG R 3.119 mm, M4 support 2.784 mm, Doze pump 7.272 mm, Carabina support 6.628 mm, sniper support 2.507 mm and launcher support 6.119 mm. Trigger indices could sit 20 to 33 mm to the side; a small nearest distance alone had concealed that failure. The initial baseline contains 717 first-person frames at 1470x956, including the original authored reload/inspect keys and side views. Three additional SMG inspect keys bring the final matching capture list to 720. The [first-person contact report](fp-holding-contact-report.md) gives all nine before/after ready contacts, per-weapon trigger distances, manipulation fixes and rejected experiments.

### World holds

The old world rig moved wrists 8 mm backward and 10 mm out, reduced curl by 10%, and added weapon-specific support lifts. Those offsets are removed. The new solver recovers the world sculpt's actual bind-palm frame, corrects distal palm weights shared with the forearm, projects the weapon mount into both arms' reachable space, and picks a natural elbow on the two-bone circle. Scale remains 1.3. Actual world-skin calibration supplements the shared holding intent where the coarser mesh needs millimetre corrections. Handguns release the support paw when sprinting; the machete's other paw remains free.

The final independent ready/motion audit passes all 81 cases: nine weapons across idle, aimed, walk, strafe, sprint, crouch, jump, actual fall-to-land and fire. Landing is measured 0.1 s into the actual landing pulse. Required trigger samples pass 64/64 inside their guards. The strict tests also enforce palm/wrap, whole-skin, paired support, wrist angles and release clearance. The following values are world millimetres across the nine states. Handgun left-paw palm/wrap measure the opposing carrying paw; sprint releases that contact.

| Weapon | R whole min | L whole min | R palm | R wrap | L palm | L wrap | Trigger front max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pistol | 0.070 | -0.108 | 0.442 | 0.070 | 0.627 | -0.011 | 0.179 |
| revolver | -0.085 | -0.141 | 0.985 | -0.085 | 0.646 | 0.716 | 0.572 |
| smg | 0.039 | -0.135 | 0.296 | 0.039 | -0.135 | 0.151 | 0.251 |
| m4 | -0.067 | -0.087 | -0.067 | 0.387 | -0.087 | 0.089 | 0.014 |
| shotgun | -0.117 | -0.135 | -0.117 | 0.057 | -0.036 | -0.135 | 0.071 |
| dmr | -0.068 | -0.120 | -0.068 | 0.048 | 0.622 | 0.122 | 0.207 |
| sniper | -0.176 | -0.104 | -0.176 | 0.614 | -0.062 | 0.442 | 0.120 |
| coco | -0.116 | -0.288 | 0.324 | 0.325 to 0.326 | 0.452 | 0.041 | 0.116 |
| machete | -0.118 | n/a | -0.118 | -0.117 | n/a | n/a | n/a |


The full [81-state numerical audit](evidence/codex-holding-perf/thirdperson-ready.json) records every contact and wrist, including signed surface locations. The worst held-paw clearance is -0.288 mm and the largest trigger-front gap is 0.572 mm.

### Pistol manipulation and rejected fitting

The magazine-hand key follows the physical part through extraction, replacement and seating. Twelve tactical/empty carrying-key regressions verify real palm contact and natural wrists. The release key places the thumb on the actual lever, holds it through slide return, then withdraws clear. Three support-return regressions verify the paw approaches the firing paw from below. The combined pistol test file has 17 tests.

A trial that opened the lowest carrying finger throughout reload reduced four magazine collisions but introduced other clipping in 103 of 205 sampled frames. It was rejected and completely removed. Contact-valid TP magazine seeds were also rejected when later phases violated whole-weapon clearance or wrist limits. Isolated endpoint success is not presented as full-animation acceptance.

## HUD and all-screen consistency

See [the HUD report](hud-organization-report.md) and [the image-by-image research](hud-research.md#organisation-and-match-outcomes-image-research-2-october-2026). The minimap moves to the upper left, weapon slots become larger named cards below the active weapon, and the upper-right match strip/feed has a defined place. Personal elimination names the victim; the death recap names the eliminator; victory uses a broad paper banner, placement stamp and the player's own result. Pause, scoreboard, large map, emotes, loading, settings, lobby, notices and phone layouts share the cream paper, brown ink, painted art and existing fonts.

Evidence covers 44 HUD/result states and 22 overlay/menu variants before and after at 1280x720 and 1470x956, plus portrait/short-window and calm-motion/colour-blind cases. Agent gates passed 176 state cases, 132 size/scale/pose cases, 88 overlay cases, 24 notice-stress cases, 43 UI units and nine Chrome tests. The final resize follow-up preserves notice priority when a wide window becomes compact.

The unchanged 1000-update HUD timing loop was run in three exclusive alternating pairs on this Ryzen/Radeon host, Chrome GL/EGL, 1470x956, DPR 1, CPU throttle 1. Baseline and final source each measure median 0.8 ms and P95 0.9 ms in every pair. The no-map diagnostic is 0.0/0.1 ms for both. An earlier broad CSS-selector experiment regressed to 1.4/1.5 ms and was replaced by explicit overlay state classes. The final raw data includes timestamps, source hashes, machine load and process cleanup.

## Performance and rendering correctness

See [the complete experiment log](evidence/codex-holding-perf/performance/experiments.md). The machine is a Ryzen 7 5700X, 16 logical threads, 16 GB, Radeon RX 9060 XT. Controlled game timing uses Chrome GL/EGL, 1470x956, DPR 2, CDP CPU throttle 4 and the shipped density ceilings. This does not reproduce the M2 Air's GPU, bandwidth, memory pressure or thermals. Every retained number identifies load and throttle; unseeded live bot runs are coverage, not identical actor workloads.

The profile identified scene matrix traversal and material program preparation as larger main-thread costs than accepting worker snapshots. Two isolated candidates cache completed static kit matrices with correct invalidation and give the character-mask pass a separate cached Scene identity for Three's render-state cache. No shader, render density, quality preset, effect, draw order or gameplay change belongs to those performance patches. The combined controlled pixel gate reports 21/21 camera/preset images with exactly zero changed RGBA pixels and PSNR Infinity. Failed captures and unchanged-baseline variance remain in the log rather than being omitted.

For Medium, program-parameter calls per sampled frame fall from 31 to 14 in FP M4, 29 to 8 in plaza16, 39 to 18 in crowd, 27 to 4 in plane and 23 to 8 in fight. The identity-only scene change accounts for this reduction. Static matrix caching does not change those counters. The final exclusive comparison ran from 13:19:33 to 13:26:16. Both A-B-B-A rounds improved in every retained case. These are synchronized whole-frame wall times, including GPU completion, not isolated CPU spans; GPU timer changes stayed within 0.005 ms, supporting the inference that reduced CPU work accounts for the improvement. All draw counts, triangles, densities and canvas sizes matched. Machine load was 1.26 to 1.89, host CPU busy share 10.71% to 15.34%, free RAM 9,729 to 9,933 MB; CDP CPU throttle was 4 and DPR 2.

| Preset / camera | Before ms | After ms | Change |
| --- | ---: | ---: | ---: |
| Low plaza16 | 15.05 | 13.70 | -9.0% |
| Low crowd | 14.50 | 13.10 | -9.7% |
| Medium crowd | 15.95 | 15.40 | -3.4% |
| Medium fight | 13.50 | 12.20 | -9.6% |
| High FP M4 | 13.25 | 11.95 | -9.8% |
| High fight | 15.90 | 14.70 | -7.5% |

Four clean 45-second live runs had no heap sampler, profiler or trace. Correria render/world CPU means fell from 16.97/12.23 to 14.66/10.12 ms; royale from 22.39/15.04 to 20.82/13.47 ms. Observed FPS changed 44.0 to 52.3 and 35.4 to 37.9, respectively, but unseeded routes differed. Royale's tail did **not** improve: 1% low 20.0 to 19.1 FPS, intervals over 50 ms 3 to 10, maximum 50.1 to 66.7 ms. Both runs had 21 actors and at most three nearby, so this is not a crowded-landing or rare-stutter guarantee. Exact stage/load/throttle data is in [the final live table](evidence/codex-holding-perf/performance/combined-live-clean-summary.json).

[The rendering-finiteness report](rendering-finiteness-2026-10-02.md) documents a reproducible foliage fractional-power NaN and the clamp at its numerical domain boundary. A real GPU regression produces NaN before the fix and finite output after. All 21 standard images match exactly. Broader finite-output cases include actual plane/drop/glide, presets and supported backends. The player's exact screenshot artifact was not reproduced, so the report does not claim proven attribution. Native Vulkan, default Firefox and WebKit availability limits are explicit.

## Additional authorised streams

[Aircraft and canopy](codex-plane-report.md): original Blender assets replace the older shapes with painted exterior/interior detail and a rigged canopy with risers/lines. Three LODs and no new textures keep submission bounded. Plane draws fall from 31 to 4 and canopy draws from 10 to 2. Flight, drop and glide behavior stay unchanged. Complete asset attribution, own-game before/after captures and controlled cost receipts are included.

[Rock collision and footsteps](codex-bughunt-report.md): rendered beveled rock shells now have full shared convex hulls, used consistently for actors, bots, camera and line of sight. Minimal formation/bike relocations resolve genuine intersections exposed by complete collision. Reduced hulls have strict geometry coverage tests. Stride cadence follows physical downhill travel while real ledge falls still land once. Full natural bot matches and local network checks are recorded with their limits.

[Duelo and Turma contra Turma](codex-gamemodes-report.md): Duelo gives both players the same random gun each round. Teams of two or three play elimination rounds with a short buy phase, saved match currency, win/loss/elimination income, refunds, equipment purchases, sensible bot buys and team-only spectating. There are no A/B/C zones. Host validation, late joins, phase transitions and real PeerJS purchases/reset are tested. The protocol changes to 13 for these explicitly authorised new modes; hosts and guests must reload the same build. Existing performance-only work does not change the network contract.

## Final integrated validation and limits

The lead ran the integrated TypeScript check, full Vitest suite and production build. TypeScript and the normal production build pass; **1,517 tests in 138 files pass**, including all 144 first-person ready/movement samples and 81 third-person samples. The initial integrated run caught stale UI dependencies, bounding-box-only placement assertions and genuine rock intrusions in room floors. The fixes preserve the original test intentions and correct the physical intrusions.

The complete five-minute Correria host/guest test passes: both clients received identical results, returned to the lobby and began a new match with reset scores. The full normal Chromium suite also passes: **18 passed and one intentionally gated slow test skipped**. That skipped test is the separately executed five-minute Correria test above, which passed. This includes the network and new round-mode host/guest tests, scope plate clearance, settings and UI flows. The lead also reran the complete final HUD layout matrix: **132 cases, zero layout faults**, across 11 sizes (including portrait phones and 21:9), three interface scales and all four requested poses. The 12 CSS-pixel readability floor, content overflow and plate intersections passed. [Command receipts and complete gate logs](evidence/codex-holding-perf/integrated-validation/results.json) are committed alongside the evidence.

### Remaining holding work

The full motion sweep is more extensive than the ready regression matrix. It is not green, and no failed row was removed or marked as an expected failure to manufacture acceptance. Representative remaining first-person findings include pistol support-paw draw overlap, revolver cylinder/ejector/speedloader contacts, shotgun shell/pump and transition contacts, and sniper bolt/magazine transitions and forearm-to-stock clearance at intermediate sprint times. The per-weapon audit records exact times and surfaces. The launcher has no failures among its 312 active samples; five additional hidden draw/holster rows are inactive rather than accepted contacts.

The final FP audit has **2,305 rows: 2,261 active, 44 inactive and 192 failures**. These counts are contact acceptance results, separate from the green software regression suite. Every sampled row and every failed surface is available in the [full FP audit](evidence/codex-holding-perf/fp/fp-contact-audit.json) and [failure list](evidence/codex-holding-perf/fp/fp-contact-failures.json).

| Weapon | Active samples | Failed samples |
| --- | ---: | ---: |
| Pistol | 241 | 6 |
| Revolver | 271 | 68 |
| SMG | 237 | 1 |
| M4 | 249 | 0 |
| Doze | 228 | 35 |
| DMR | 268 | 8 |
| Sniper | 318 | 74 |
| Lanca-coco | 312 | 0 |
| Facao | 137 | 0 |

M4 retains its fitted index in the guard during non-firing carry, reload and inspect transitions. A collision-free withdrawal was not found within the budget; partial search paths were rejected. This is an explicit animation compromise, not a claim of successful indexing. The sniper uses a bounded 4% distal-pad articulation, preserving its bind-axis length, plus an eight-point withdrawal route whose 282 index-route samples stay above -0.483 mm. That route result does not certify unrelated forearm or reload contacts.

Third-person evidence covers 604 states from two sides at 1470x956. The ready matrix passes, but **52 reload samples** exceed the whole-skin penetration limit: pistol 2, SMG 3, M4 23, DMR 11, sniper 5 and launcher 8. Largest recorded minima include pistol -18.199 mm, M4 -6.309 mm, DMR -9.655 mm and sniper -15.778 mm. [The exact failed rows](evidence/codex-holding-perf/thirdperson/reload-penetrations.json) and the corresponding before/after boards remain in the evidence. Revolver, shotgun and machete have no whole-skin penetration flag in that TP capture, which alone does not certify all manipulation contact surfaces. TP inspect/draw/holster are not separate replicated actor states; long-gun reloads outside pistol/SMG/revolver/M4 still use the pre-existing generic belt reach. No unsupported TP animation is presented as audited.

The attempted TP magazine sequence is not integrated: its final M4 path passed 48 of 50 samples but two palm gaps measured 1.721 mm against the unchanged 1.5 mm gate. Other magazine fits failed larger clearance or wrist checks. Private fitting seeds and the QA helper remain available for the next pass.

Other limits remain explicit in their stream reports: no guarantee of zero frame spikes, no M2 hardware measurement here, no proven attribution of the player's exact black-pixel screenshot, and unavailable native browser/GPU combinations. New modes require protocol 13 on both clients.

## Evidence, files and handoff

All source and stream evidence were integrated by **13:59:34 local time**, at `224f133`. Runtime source remains `b9e6e6f`, the same tree checked by the final gates. The later commits package only evidence and this handoff. All team browsers, dev/preview servers, fitting jobs and the root PeerJS service were stopped by 14:00:09; ports 5191 to 5199 and 9001 were clear.

- [FP evidence](evidence/codex-holding-perf/fp/README.md): 720 matching before/after states, nine full-state boards, 136 selected native-size JPEGs and source PNG hashes. Three exact additional SMG baseline times were captured from the preserved baseline source. Original lossless captures remain private.
- [TP evidence](evidence/codex-holding-perf/thirdperson/README.md): 604 before/after states from two sides, 180 selected native-size frames and 48 contact crops. The M4 was recaptured after its final index correction.
- [HUD evidence](evidence/codex-hud/): match, victory, death, elimination and complete-screen comparisons at both requested sizes, plus responsive and accessibility reviews.
- [Performance experiments](evidence/codex-holding-perf/performance/experiments.md): retained and rejected trials, before/after tables, load/throttle metadata and per-camera image identity.
- [Integrated gate receipts](evidence/codex-holding-perf/integrated-validation/results.json): full logs for typecheck, unit tests, normal production build, Chromium, the full Correria match and the final HUD matrix.
- [Complete changed-file inventory](evidence/codex-holding-perf/integrated-validation/changed-files.txt): every path changed from `b721224`, including code, tests, art, tooling, documentation and own-game evidence.

The orchestrator should review the holding limitations before presenting this as a complete animation polish pass. No incomplete fitting candidate is waiting in this delivery worktree. Unaccepted experiments remain private or on their isolated branches. The branch is ready for the orchestrator's review and push; this session did not push or deploy.
