# Holding and opening-round follow-up

2 October 2026. Baseline `8111d38`, delivery branch `codex-holding-fix`. This pass fixes the 192 first-person audit failures and 52 third-person penetration findings left by the previous delivery, adds a proper M4 trigger exit, and preserves the first buy window for slow-loading guests. The user shortened the deadline to 17:20 local, with finished green work due by 17:05.

The lead's integrated replay has **zero failures across the same 2,305 first-person states**: 2,261 active and 44 inactive switch boundaries. All original failing timestamps were retained. The broader third-person audit still finds pistol and revolver reload problems, detailed below. This delivery does not claim every possible third-person reload pose passes.

## Opening buy window

Round modes now wait for every connected human's current scene before starting the opening countdown. Each client acknowledges after asset preparation, its first game frame, the HUD update and removal of the loading overlay. The worker keeps sending snapshots while simulation time stays at zero, without accumulating movement or shot debt. Generated bots need no acknowledgement. The host owns one fixed 30-second wall-clock cap; joins, reconnects and repeated acknowledgements cannot extend it. Later rounds retain their timing.

The lead's final real slow-guest test retained 11.483 seconds of the 12-second buy phase after at least eight seconds of deliberately delayed renderer loading and 2x CPU throttling. A same-match reconnect retained 11.683 seconds. Both released through room readiness rather than timeout. The original at-least-ten-seconds assertion remains. A client still loading when the cap expires can miss the buy window; ready players proceed normally.

Protocol 14 adds a reliable, match-bound readiness message. Connection identity and match ID prevent stale or replaced connections from acknowledging another player. Host and guests must reload the same build. Actor tuples and round snapshot shape are unchanged. Fresh late arrivals retain the existing spectator-until-next-round rule. See the [round-loading report](codex-round-loading-fix-report.md) and [timing receipt](evidence/codex-round-loading/startup.json).

## First-person holding

Distances use the actual deformed shipped skin against actual weapon and moving-part triangles, in millimetres. Whole-skin clearance retains the -0.5 mm floor. Carrying palms and wrapping digits require -0.5 to +1.5 mm; a control push instead requires its named control surface. Released approach and withdrawal hands still receive whole-skin collision checks. Ready trigger contact remains inside the real guard and within 1.5 mm of the trigger front. Wrist limits remain flexion +/-45 degrees, deviation -25 to +20 degrees and rotation +/-80 degrees.

Two shared fixes distinguish carrying from manipulation. Grip-key transitions now follow the authored trigger route instead of cutting directly between its endpoints. An explicitly indexed transition releases the ready-trigger requirement while retaining carrying-palm and other-digit contact. This clears sniper inspect and allows the bolt hand to withdraw its index before releasing the grip.

| Weapon | Original states | Failing before / after | Required trigger-front range after |
| --- | ---: | ---: | ---: |
| Pistola | 245 | 6 / 0 | 0.698 to 0.963 mm |
| Trinta-e-oito | 276 | 68 / 0 | 0.168 to 0.202 mm |
| Canarinho | 242 | 1 / 0 | 0.182 to 0.510 mm |
| M4 | 254 | 0 / 0 | 0.438 to 0.500 mm |
| Doze | 233 | 35 / 0 | 0.030 to 0.500 mm |
| Carabina | 273 | 8 / 0 | 0.005 to 0.444 mm |
| Sniper | 324 | 74 / 0 | 0.800 to 1.063 mm |
| Lanca-coco | 317 | 0 / 0 | 0.192 to 0.423 mm |
| Facao | 141 | 0 / 0 | No trigger |

All 613 required trigger samples in that replay remain inside the guard. The [integrated receipt](evidence/codex-holding-fix/integrated-fp-replay.json) contains per-weapon minima and every original failing row with its before/after measurements. Jobs ran separately; weapons changed later were replayed again. Unchanged weapons use measurements from equivalent final code. Additional authored and finer samples supplement this exact original list.

The **pistol** uses a corrected elbow pole so its own forearm clears the support cup during draw. At draw 0.25 s, the paw-pair overlap improves from -34.326 to -0.058 mm. A fitted reload hold and staged ring motion clear the moving magazine: right-skin clearance at reload 0.30/1.15 s improves from -1.540/-1.602 to -0.251 mm. Finer sampling found two additional cup-departure collisions. Moving the existing free sprint paw slightly forward and the inspect departure down/left fixes them while preserving the two-hand cup and one-handed sprint. The final combined set contains 1,023 states, zero failures, plus 130 separate right-skin checks at 1 ms. See the [pistol and Doze report and boards](evidence/codex-holding-fix/shotgun/README.md).

The **revolver** uses its thumb on the closed and swinging cylinder, then palm and wrap on the fully open cylinder. A measured transfer path clears the barrel, including narrow between-key collisions. The ejector palm now pushes its real front cap: the original control gap of 108.568 mm becomes 0.217 mm, with palm-to-front-cap contact +0.422 mm. The speedloader has palm +0.781 mm, wrap -0.119 mm and whole skin -0.122 mm. The combined full-state set is 470 states with zero failures; 218 finer cylinder samples also pass, with thumb contact +0.143 to +1.395 mm and left-skin minimum -0.399 mm. The [revolver report](revolver-holding-fix-report.md) records incremental replay accounting and all three viewing angles.

The **SMG** charge approach moves up and rearward. Its middle digit relaxes clear of the receiver while index and thumb retain the handle. At reload 1.60 s, left-skin clearance improves from -2.265 to +1.023 mm; held control contact is +0.122 mm. All 242 original states and 85 extra charge samples at 5 ms pass.

The **M4** previously kept its ready index inside the guard during carry. It now follows an 11-pose exit and return route. All 569 index skin vertices leave the guard at the carrying endpoint; index contact is -0.244 mm against the receiver. The carrying palm stays -0.249 mm and wrap +0.202 mm. The existing bounded distal-pad compression reaches 0.96 briefly through the narrow passage and returns to 1 at the receiver. All 1,002 route samples pass, minimum -0.483 mm. A finer runtime sweep also found an inherited partial-reload ring collision at 2.075 s. Moving one support waypoint 60 mm outward clears the seated magazine; 251 samples at 1 ms pass, minimum +0.302 mm. The final 694-state runtime matrix has zero failures. TP retains its separately measured waypoint. See the [M4 report and boards](m4-index-holding-fix.md).

The **Doze** has a measured index route and pump grip. The firing pump stroke retains whole skin -0.223 mm, palm +1.260 mm and wrap -0.106 mm. Draw 0.25 s improves from -2.362 to -0.200 mm; holster 0.025 s from -1.705 to -0.387 mm; inspect 1.70 s from -3.037 to -0.281 mm. Shell loading transfers the pinch to the real brass case-head thumb push, entering nose-up and levelling into the tube. Shell contact at reload 0.385 s improves from +13.977 to +1.404 mm. The combined 752-state set has zero failures, including finer transfer and release samples at 1 ms.

The **Carabina** charging-hook palm rises 3 mm, with the middle digit folded clear and the hook retained until withdrawal clears. Contact at reload 2.20 s improves from -2.344 to +0.649 mm. All 273 original states pass.

The **sniper** magazine grip now has palm +0.598 mm and wrap +0.188 mm, replacing +11.512/+3.587 mm gaps. The support paw releases down and forward; the firing elbow clears the stock during sprint. The bolt hand approaches and leaves from the right/rear, folds the middle digit clear and withdraws its index before the wrist releases. Sprint/inspect skin minima improve from -0.778/-2.992 to -0.304 mm; reload 2.65 s improves from -3.763 to +1.205 mm. Held bolt contact stays +0.115 mm. All 333 combined states and 225 extra bolt samples at 10 ms pass. The [sniper/Carabina/SMG report](codex-holding-fix-sniper-report.md) includes four compact boards.

**Lanca-coco and Facao** need no first-person pose change. Their complete original replays remain green. The 44 inactive rows across the full audit are real draw/holster boundaries where the requested gun is not active, not relaxed contact checks.

## Third-person holding and remaining issues

All 52 previously reported whole-skin penetrations have regressions. Independent world-space magazine, floorplate and control keys account for the coarser paw at the unchanged weapon scale 1.3. M4 and SMG hands retain their intended contacts through insertion and withdrawal. Generic belt reaches first clear the fore-end. The sniper uses a shallower reload tilt to preserve its carrying wrist. Released wrists are solved within the same anatomical limits using reused scratch objects.

| Accepted dense cohort | States | Whole-skin minimum | Largest required contact gap |
| --- | ---: | ---: | ---: |
| M4 | 748 | -0.419 mm | 1.267 mm |
| SMG | 434 | -0.429 mm | 1.359 mm |
| Doze | 106 | -0.253 mm | 0.058 mm |
| Carabina | 124 | -0.127 mm | 0.622 mm |
| Sniper | 133 | -0.176 mm | 0.614 mm |
| Lanca-coco | 153 | 0.041 mm | 0.452 mm |

These 1,698 states include empty and tactical reloads, authored keys and finer corrected intervals. Both whole paws, required contacts and wrists pass. The separate TP M4 index route has a -0.350 mm minimum, no index vertices inside the guard at carry, receiver contact +1.312 mm and no pad compression. The [TP report](thirdperson-holding-fix.md) explains cohort composition, strict measurements and nine comparison boards.

An additional **TP pistol slide-release** fit corrects left deviation from 27.632/27.533 degrees to 11.991/11.810 degrees at phases 0.810/0.825. Lever contact becomes +0.038 mm; the paw pair stays +5.314 mm apart. All 44 release/return samples at 0.005 phase steps pass. See the [release report and board](codex-holding-fix-tp-pistol-release.md).

The lead replayed the broader 256-row pistol/revolver catalogue on integrated source. **47 of 122 pistol rows and 100 of 134 revolver rows still fail.** These extend beyond the 52 penetrations specified for this follow-up. The exact remaining phases, contacts, skin and wrist values are in [the residual catalogue](evidence/codex-holding-fix/remaining-tp-reloads.json).

| Remaining scope | Representative issue |
| --- | --- |
| TP pistol moving magazine | Right skin -5.339/-5.188 mm at empty phases 0.175/0.625 |
| TP pistol magazine support | Palm +4.598 mm and wrap +35.002 mm; deviation reaches -34.49 degrees and roll -88.53; paw-pair minimum -1.704 mm at 0.67 |
| TP revolver closed cylinder | Control gap +2.315 mm at 0.12/0.875/0.88 |
| TP revolver ejector | Control gap +2.679 mm; left flexion about +63.25, deviation -73.73 and roll -92.46 degrees |
| TP revolver loader | Palm +7.684 mm and wrap +6.966 mm; early left flexion +54.44 degrees |
| TP revolver carrying wrist | Right deviation reaches +29.99 degrees near 0.275 |

Two broader candidates were rejected. A TP pistol magazine fit seated at the high pose but strained the wrist during its lowered pose and collided on approach/exit. Reducing the revolver reload rotation improved several wrists but introduced a -4.259 mm support crossing. Neither candidate is integrated. The fully open revolver endpoint correction is retained: -0.714 to -0.064 mm, with palm and wrap contact. Further inherited cylinder transfer keys are not certified by this TP catalogue.

TP draw, inspect and holster are not separate replicated actor animations in this build. Generic long guns retain their existing belt-reach representation. Unsupported animations are not claimed as audited.

## Review, evidence and team

The existing [weapon-holding research](viewmodel-research.md) remains the reference basis. This follow-up changes measured contact paths, not the style or composition. Before renders were recaptured from `8111d38` on the upgraded Mesa 26.2 driver, Chrome 150 and Radeon RX 9060 XT using ANGLE gl-egl at 1470x956. The supplementary pistol-release boards explicitly compare their immediate correction checkpoints. The lead reviewed real eye and side renders, including the final contact details at full size. An initially occluded M4 side capture was rejected and recaptured with matching cameras.

Only 23 compact comparison boards, 7,354,277 bytes total, are added. Raw screenshots, reference images, unsuccessful fits and complete measurements remain private under `~/codex-team/pass2`. No weapon model, livery, lens, composition target, quality preset, density, weapon-size setting, balance or HUD layout changes are included. The earlier HUD, mode and performance improvements remain in the baseline; this follow-up makes no new FPS claim or Mac/Metal measurement.

Six isolated agents worked under the lead. `fix_rounds` used gpt-6.1-sol at max effort on readiness and real multiplayer tests. `fix_sniper`, `fix_revolver`, `fix_shotgun`, `fix_thirdperson` and `fix_index` used gpt-6-astra at max effort on their named weapon groups, world rig, and M4 route respectively. Each had its own worktree and port. No child agent spawned agents. The lead reviewed source, resolved shared-file integration, rejected failing candidates, replayed the original failures and ran the repository gates. The requested tier-switch tools were unavailable; no unsupported tier change is claimed. All agent browsers, servers and fitting jobs were stopped before final browser verification.

## Final verification

The lead ran `npx tsc --noEmit` successfully and the complete `npx vitest run --maxWorkers=6`: **155 files and 2,083 tests passed**, including all 144 first-person and 81 third-person ready cases, framing, natural wrists, near-plane checks, round modes and networking. The production `npm run build` passed; Vite retains its existing large-chunk warning.

The first complete unit run exposed three old tests that required identical FP/TP magazine wrist positions or a fixed cylinder palm angle. They were updated to verify the independent measured world keys and cylinder transfer stability across chamber spin. Their original part visibility, empty-only chambering and LOD checks remain. The stricter new actual-skin tests retain all contact and wrist bounds. The complete suite was then rerun green.

`E2E_SLOW=1 npx playwright test --project=chromium` passed **all 20 tests**, with zero skips, in 9.7 minutes. This includes the complete five-minute Correria match and clean rematch, Corrente reconnect, guest inventory, immediate-fire confirmation, all four round-mode tests, HUD, scope and settings checks. The final opening waits were 20,655 ms for the delayed guest and 4,306 ms for the prepared reconnect; both released by readiness.

The final browser run started at 16:40:50 local on the Ryzen 7 5700X, 16 logical threads, 16 GB, RX 9060 XT, Mesa 26.2, Node 26.10.0 and Chrome 150 through ANGLE gl-egl. Load averages at start were 2.02 / 4.54 / 6.01. No other agent ran a browser or build. Only the deliberately delayed guest used 2x CPU throttling; the other cases were unthrottled. These are functional startup measurements, not an FPS comparison. The [startup receipt](evidence/codex-round-loading/startup.json) preserves both the scoped and integrated runs.

The [complete changed-file manifest](evidence/codex-holding-fix/changed-files.txt) lists all 89 files relative to `8111d38`. Runtime changes are confined to the hand data, viewmodel/world reload animation and rig integration, plus the opening-ready control path in main/session/worker/simulation. Tests, reproducible QA tools and compact reports/evidence make up the remaining changes. No assets under `public/` changed. Private gate logs and machine-load receipts remain in `~/codex-team/pass2`.

Runtime source was finalized at `7fe9039`; `6d25b31` updates the three legacy animation expectations. Scoped reports retain the worktree commit IDs used for their captures; those changes were reviewed and cherry-picked into the delivery history. All retained source is committed in small steps on `codex-holding-fix`. No push, pull request or deployment was performed.
