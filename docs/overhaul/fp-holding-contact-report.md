# First-person holding contact pass

2 October 2026. Baseline: `b721224`. Completed holding source: `24116eb`, with root's pistol magazine and slide-release corrections included. This is a contact and articulation pass on the existing nine weapons. Weapon meshes, liveries, the 44 degree hip lens, per-weapon aimed lenses and composition thresholds are unchanged.

## Result and scope

The firing palms, support wraps and handgun cups were fitted against the actual deformed shipped skin. All eight firearms now place the ready index inside the unchanged trigger guard, at its front pulling surface. Facao already had a valid carrying grip. Moving-part reload contacts were corrected for the pistol magazine/slide release, M4 and DMR magazines, M4 seating/catch, SMG charging handle and sniper bolt.

The broader all-state audit still finds residual reload, inspection and index-transition faults. This report does not claim every authored animation is contact-clean. The M4 index withdrawal route remains unresolved despite a bounded five-degree-of-freedom path search; the final animation keeps its fitted index in the guard through carry transitions, avoiding the rejected colliding interpolation. The exact final sample failures are recorded alongside the evidence.

## Research actually used

Before implementation, the previous framing, arms, performance and review reports were read. All 56 private local frames were viewed on three sheets, with full-size examination of the weapon-class references. Further direct frame review covered MW/BO6, Apex, Valorant, Battlefield, Halo and Titanfall 2. Private source images and derived reference sheets remain outside the repository.

The observed rules were stable contact in weapon or moving-part coordinates, a support palm joined to the firing paw on handguns, opposed fingers and thumb around a fore-end or vertical grip, independent trigger-digit articulation, and an explicit release before manipulating a separate part. These are qualitative observations, not millimetre measurements derived from footage. Some MW inspect frames keep the index in the guard; indexing during inspect here follows the user's rule.

Primary sources checked during the work:

- [Infinity Ward: animation and authenticity](https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Detailing-Advancements-in-Animation-and-Authenticity), on physical references, weapon-specific animation and separate empty/tactical reloads.
- [Riot: how the VALORANT arsenal was built](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/), on deliberate handling and readable weapon identity.
- [Riot: the craft and fantasy of weapon skins](https://playvalorant.com/en-us/news/dev/the-craft-and-fantasy-of-valorant-weapon-skins/), on first-person expression and shared base behavior.
- [EA/DICE: gunplay and movement philosophy](https://www.ea.com/games/battlefield/news/gunplay-and-movement-philosophy), on coherent weapon and movement feedback.
- [Bungie: The Art of First-Person Animation](https://gdcvault.com/play/1022297/The-Art-of-First-Person), public GDC abstract on physicality and gameplay constraints.

## Acceptance and measurement corrections

`tools/qa/fp-clearance.mjs` and its geometry-only companion use the same `holdingMetrics` contract. The probes deform real GLB vertices through the actual skeleton. They measure contact with visible weapon triangles or the opposite handgun paw, rather than comparing wrist sockets.

A holding contact must be between -0.5 and +1.5 mm. Body, pump and opposing-paw contacts also need separate palm and wrapping-digit minima within that interval. The firing body region excludes the entire index, so touching the trigger cannot hide a floating firing palm. The canonical palm region is the palm-facing distal hand skin with bind coordinates y < -6 mm and z < -12 mm relative to the wrist. Wrapping skin uses distal segments 2/3; R body checks exclude the index. Small controls use the manipulating skin region appropriate to their authored contact, rather than requiring a full palm on a small button.

The entire visible paw has a separate -0.5 mm penetration floor against all visible weapon parts. Handgun paws also have a mutual penetration check. Free, releasing and hidden-part contacts are exempt only when the authored state calls for them. Natural wrists retain flexion +/-45 degrees, ulnar deviation 25 degrees, radial deviation 20 degrees and rotation +/-80 degrees. Existing framing and near-plane bounds were not relaxed.

Trigger readiness requires all three: whole-solid skin clearance, the distal index centroid inside the unchanged guard opening, and at most 1.5 mm nonnegative Euclidean distance to the actual front-facing trigger triangles. The previous normal-filtered signed distance mixed a side surface's sign with the front surface's distance. It remains a diagnostic only. Analytic fixtures cover side graze versus real front contact, overlapping solids in one or multiple rendered meshes, hidden parts, skinning and scale. Closed-component classification prevents a nearby decorative surface from hiding a deeper body penetration. TP wrist closure caps affect winding only and never supply contact distance.

## Ready contact measurements

Values below are actual skin distances in millimetres from the accepted fits. The final state matrix additionally checks hip, aimed, aim transitions, movement, sprint and immediate fire. A negative value denotes shallow skin overlap within the unchanged -0.5 mm floor.

| Weapon | Baseline contact fault | Accepted ready contact | Trigger front, inside guard |
| --- | --- | --- | --- |
| Pistol | R palm 4.512; L cup palm 13.549 | R palm 1.188, wrap -0.322; L cup palm 0.337, wrap -0.058 | 0.698 |
| Revolver | L cup palm 11.275 | R palm 0.950, wrap 0.495; L cup palm 0.733, wrap 0.517 | 0.168 |
| Canarinho SMG | R palm 3.119 | R palm 0.191, wrap 0.201; L palm about 1.1, wrap 0.499 | 0.182 |
| M4 | L palm 2.784 | R palm -0.249, wrap 0.202; L palm 0.486, wrap 0.497 | 0.438 |
| Doze | L pump palm 7.272 | R palm -0.194, wrap -0.178; L pump palm 0.637, wrap -0.196 | 0.030 |
| Carabina DMR | L palm 6.628 | R palm 0.266, wrap -0.081; L palm 0.663-0.727, wrap -0.151 | about 0.005 |
| Sniper | L palm 2.507 | R palm 0.878, wrap 0.788; L palm 0.532-0.544, wrap 0.321 | 0.800 |
| Lanca-coco | L pump palm 6.119 | R palm 1.149, wrap 0.500; L pump palm 0.738, wrap 0.493 | 0.192 |
| Facao | Existing R palm 0.816, wrap 1.120 passed | Same valid carrying grip | Not applicable |

Originally, the eight firearm distal-index centroids were 20-33 mm to the right of their guards, despite some old side-contact numbers appearing close. Each final ready fit is now checked for guard containment as well as front contact.

Fired index poses are separate from ready poses. Pistol and sniper trigger animation travel is 0.1 rad instead of 0.3 rad, with the unchanged trigger geometry. Pistol front contact is 0.963 mm on its pulled trigger. Other accepted fired front distances include SMG 0.510, M4 0.500, Doze 0.500, DMR 0.444, coco 0.423 and sniper 1.063 mm. The revolver support thumb received a 0.02 rad distal correction to clear the firing index while preserving its cup.

## Shared articulation and sniper withdrawal

`PawPose` now supports independent index spread, bounded axial roll and optional distal pad compression. Defaults preserve the original pose. Index roll is bounded to +/-0.65 rad and only changes index articulation. The same interface is available to FP and TP.

The sniper's uncompressed fit reached -0.537 mm at the narrow guard ceiling while making 1.089 mm front contact. Further coupled wrist/index refinements remained outside the penetration bound. The approved solution compresses only the distal index cross-section by at most 4%, with `indexPad` clamped to [0.96, 1]. Its normalized bind longitudinal axis retains its full length. No mesh asset, weapon guard or global size setting changes. Tests prove default 1 preserves the actual posed skin byte-for-byte, the radial minimum is bounded, axial length is retained and resetting restores the original skin.

The sniper's measured R elbow pole clears stock contact from wrist-weighted forearm skin. Its indexed endpoint also retains `indexPad=0.96`. A projected joint-space search found an eight-point path from ready to indexed with the palm and other digits fixed. The final unmodified full-paw audit sampled 282 edge positions at <=0.004 rad increments, with a minimum signed distance of -0.483 mm. Six intermediate points are stored as `indexExit`; shared `heldCurl` interpolates them. All 16 sniper ready/movement/sprint/immediate-fire cases pass.

A separate M4 search evaluated 2,507 actual index-skin configurations and grew 380 ready-side and 165 indexed-side nodes. It escaped the starting contact pocket but did not connect the paths; nearest tree separation was 0.18916 rad. Twenty-six independently checked partial poses passed at >=-0.485 mm, but that is not a complete exit certificate. No partial route was added. The final M4 indexed pose deliberately equals its ready pose, so the digit remains in the guard on the trigger during non-firing carry/reload/inspect states. This is an explicit animation compromise: it removes the 2.225 mm sprint-transition collision while retaining the contact, but does not satisfy the preferred safe-indexing behavior. All 16 M4 ready/movement/sprint/fire tests pass after this change. The search result is not proof that a safe route is impossible.

## Reload corrections and retained limits

Accepted changes include separate physical magazine holds for M4 and DMR, preserving attachment through empty and tactical keys; M4 floorplate seating and bolt catch; SMG charging handle; and sniper bolt at both open and closed positions. These have 32 magazine-key tests and 18 manipulation-key tests. The root's pistol changes add actual magazine seating, slide-release thumb contact and a below-cup return path, with 17 tests.

Several attempted fits were rejected and are absent from runtime data: revolver ejector pressure and speedloader, DMR charging handle, sniper magazine, shotgun shell push and coco fruit insertion. Rejection of these attempted alternatives is not itself a failure verdict on every original state; the final dense audit supplies the actual remaining failures. A fit that looked valid at one key sometimes collided when the part moved or the elbow changed. Their remaining faults are included in the dense audit. The pistol retains moving-magazine R-finger contact faults documented by the root. M4 retains its ready finger position during carry instead of withdrawing it. All-state compliance is therefore incomplete even though the ready and principal carrying contacts are substantially corrected.

The final dense audit has 2,305 sampled rows: 2,261 active, 44 inactive draw/holster rows, and 192 failures. Inactive rows are not accepted contacts.

| Weapon | Samples | Active | Inactive | Failures |
| --- | ---: | ---: | ---: | ---: |
| Pistol | 245 | 241 | 4 | 6 |
| Revolver | 276 | 271 | 5 | 68 |
| SMG | 242 | 237 | 5 | 1 |
| M4 | 254 | 249 | 5 | 0 |
| Doze | 233 | 228 | 5 | 35 |
| DMR | 273 | 268 | 5 | 8 |
| Sniper | 324 | 318 | 6 | 74 |
| Coco | 317 | 312 | 5 | 0 |
| Facao | 141 | 137 | 4 | 0 |

Exact residual examples: pistol draw at 0.2/0.25 s has opposing-paw overlap of 12.246/34.326 mm; its moving magazine clips the firing ring digit by up to 1.602 mm. Revolver cylinder contact remains 6.63-6.69 mm away, ejector contact 108.568 mm away and speedloader contact 2.517 mm away. SMG charge approach clips L by 2.265 mm. DMR charge clips R by 2.344 mm. Doze retains index transition, pump-fire and shell-loading faults, with R penetration up to 6.711 mm and shell contact gap 13.977 mm. Sniper retains 0.4/0.5 s sprint forearm-twist stock clips of 0.778/0.776 mm, inspect and bolt-transition faults, magazine gap 2.523 mm and L approach penetration up to 2.535 mm. Its accepted index route is clear; the sprint residual is separately weighted forearm skin. [Every exact failing row](evidence/codex-holding-perf/fp/fp-contact-failures.json) and [all measured rows](evidence/codex-holding-perf/fp/fp-contact-audit.json) are committed.

## Evidence and validation

The initial baseline contains 717 original renders at 1470x956: pistol 85, revolver 95, SMG 77, M4 90, Doze 59, DMR 80, sniper 98, coco 110 and Facao 23. Each weapon includes eye/aimed views, both side views, aim blend, walk/strafe, sprint, crouch, jump/land, draw/holster, firing or cuts, inspect and every authored empty/tactical reload or inspect key. Baseline source `f40ea9c` is visually equivalent to `b721224`: its optional index spread defaults to zero and its other changes are QA metadata.

Three additional authored SMG inspect times (0.108, 1.620 and 1.746 s) raise the final capture list to 720. These exact times were absent from the initial baseline list. They were subsequently captured from the preserved f40ea9c baseline source, with HMR disabled, and all720 before/after pairs now match exactly by state time. The baseline snapshot needed its original QA fixtures and atlas metrics restored plus a local Vite symlink-serving allow-list; no rendering or holding source was changed.

Final captures use the integrated immutable production QA build, not a development HMR session. An initial partial QA-build capture exposed DEV-only probe, motion and side-camera hooks; commit `5c5cd30` enables those three hooks only for explicit VITE_QA builds as well. The partial images were recaptured after rebuilding. All nine final hip, aimed and both-side views were visually reviewed. Full-size pistol and sniper eye/side renders confirmed joined cups and the index inside the guard; the sniper close board records the bounded pad change without an asset edit. Before/after boards and final measurement summaries are under [evidence/codex-holding-perf/fp](evidence/codex-holding-perf/fp/). No third-party reference images are included.

Focused validation completed before final integration: TypeScript, 16 sniper ready/movement/fire cases, 25 control/framing/shared-contract checks, 32 M4/DMR magazine-key checks, 32 handgun ready/movement/fire cases, six real-skin compression tests and the analytic probe regressions. The first full 144-case matrix passed 143 and exposed one M4 sprint-transition penetration (-2.225 mm). After the explicit M4 carry compromise, all 16 M4 cases pass unchanged, completing coverage for all 144 cases across the two runs. The root then reran all 144 integrated cases successfully. The dense per-state result is recorded in the evidence summary. Root runs the integrated repository gates separately.

Files changed in this stream: `src/render/fp-grips.json`, `fp-arms.ts`, `viewmodel-specs.ts`, `viewmodel-choreo.ts`, `weapons.ts`; actual-skin, intent, trigger, reload and framing tests; geometry/contact/state/evidence tools under `tools/qa`. The TP mesh/frame correction and TP-specific calibration belong to the root's report.
