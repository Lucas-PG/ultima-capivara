# Long-gun overhaul

Scope: `m4`, `shotgun` (Doze), `sniper`, `dmr` (Carabina), `coco` (Lança-coco) in the `guns-long` worktree, merged with `overhaul/aaa-autonomous` (short guns, character, combat pass and world kept as reviewed). The sculpted paws and the arm solver were not changed. All captures: real Chrome, ANGLE Metal, 1280 x 720, medium preset.

This pass fixes the three defects from the orchestrator review (fingers-up support grip, firing paw hidden at hip, Lança-coco aim view blocked by the hopper) and reworks the models, framing, reloads and inspects around them.

## Review defects

1. **Support grip.** Every support paw now clamps the handguard or pump from the lower left: palm on the left flank, thumb over the top pointing forward, three digits pointing forward and curling under to the right side. Grips were fitted with `tools/qa/grip-fit.mjs` using digit intents (tips 250 to 330 degrees, bases 200 to 260 degrees, thumb on top, contact on every digit, zero penetration) at the base of the barrel, or on the pump for the Doze and the Lança-coco. To make a real wrap possible, the M4 handguard is now a full-length chunky octagon like the design sheet, and the narrow rear waists on the Carabina and sniper fore-ends were removed. With the waists, digits could only lie flat against the side.
2. **Firing paw at hip.** Each rifle's hip pose was solved so the grip sits near 70 % across and 72 % down the frame, the muzzle near centre, and the barrel receding diagonally. The back of the firing paw, knuckles and trigger digit read at the lower right. The support forearm rises diagonally from the lower-left corner. Viewmodel FOV is 56 to 60 degrees for all five guns, which keeps the paws in proportion.
3. **Lança-coco ADS.** The hopper moved from the top of the tube to its right shoulder, on brass saddle straps, below the sight line. New flip-up ladder sights sit on the tube's own top line: a notched rear ladder on the breech band and a leaf with a gold post on the bell. The aim picture is now open all round the target. The hopper livery (parrot, frond) moved with it.

Digit angles around the bore at hip (degrees; 0 right, 90 top, 180 left, 270 bottom) and worst skin clearance (mm):

| Weapon | Index / middle / ring tip | Thumb tip | Digit angle from forward (index / middle / ring / thumb) | Support worst | Firing worst |
| --- | --- | ---: | --- | ---: | ---: |
| m4 | 271 / 279 / 288 | 125 | 63 / 92 / 99 / 63 | 0.3 | 0.0 |
| shotgun | 263 / 286 / 303 | 146 | 45 / 80 / 92 / 57 | 0.7 | 1.0 |
| dmr | 254 / 271 / 275 | 130 | 59 / 90 / 100 / 63 | 1.0 | 1.1 |
| sniper | 259 / 280 / 278 | 135 | 65 / 92 / 103 / 65 | -0.3 | 1.0 |
| coco | 267 / 280 / 308 | 144 | 48 / 83 / 89 / 55 | 0.2 | 0.7 |

No digit points up or back. The digits' angles from forward (45 to 103 degrees) are what curling under looks like: base segments point forward, and the tips turn down and under. Thumb tips sit at 125 to 146 degrees, over the top-left shoulder of the grip, pointing forward (55 to 65 degrees from forward). They do not reach dead top (60 to 110 degrees) because the sculpted thumb is short against these handguard widths. Pushing it higher made the palm leave the flank.

## Per weapon

Evidence per gun: `<id>-final.jpg` (hip eye, ADS, near, below and top close-ups of the support paw), `<id>-final-grip.json` (digit angles plus per-segment clearance for both paws), `<id>-final-reload.jpg` (reload strip, eye view). Earlier sheets `<id>-before.jpg`, `<id>-after.jpg` and `<id>-reload.jpg` show the previous passes. The superseded `*-corrected-*` captures of the rejected grip were removed.

- **M4** ([sheet](evidence/guns/m4-final.jpg), [reload](evidence/guns/m4-final-reload.jpg)). Full-length octagonal navy handguard with slots all along, a continuous top rail, and the coral frond across the whole flank. Reload: the rifle rolls its magazine well toward the eye. A new fitted magazine grip holds the curved magazine body, drops it, brings the fresh one, and palm-seats it. Empty reloads add the bolt-catch slap. Release and return keys now follow the fitted grip, so a refit cannot break them.
- **Doze** ([sheet](evidence/guns/shotgun-final.jpg), [reload](evidence/guns/shotgun-final-reload.jpg)). The paw wraps the ribbed pump. The grip was fitted at full rack, so the fingertips stay clear of the receiver through the pump stroke (it was -7.7 mm before the refit). Shell-by-shell loading now cants the loading port toward the eye (a 60-degree roll), so shell, gate and thumb push read clearly.
- **Sniper** ([sheet](evidence/guns/sniper-final.jpg), [reload](evidence/guns/sniper-final-reload.jpg), [bolt cycle](evidence/guns/sniper-final-fire.jpg)). Full-width fore-end. The firing shoulder moved outward so the forearm clears the thumbhole stock during the bolt stroke (it was -15.7 mm). The reload presents the magazine well.
- **Carabina** ([sheet](evidence/guns/dmr-final.jpg), [reload](evidence/guns/dmr-final-reload.jpg)). Full-width walnut fore-end. The firing grip was refitted. The side charging-handle stroke uses an outward elbow pole and shoulder, so the forearm clears the receiver (it was -8.1 mm).
- **Lança-coco** ([sheet](evidence/guns/coco-final.jpg), [reload](evidence/guns/coco-final-reload.jpg)). Offset hopper, ladder sights and new ADS eye (`adsEye [0, .245, .084]`, pitch 0). The paw wraps the wooden pump. Each coconut is lifted from the lower left, carried over the hopper rim and dropped in, then the paw withdraws low. It no longer flies up and over the head, and the fingers clear the hopper walls (they were -6 mm).

All five long guns now have an authored two-beat inspect: lift, show the left flank (livery), then roll over to show the top and right side, then settle. Both grips hold throughout, with the trigger digit off the trigger. This replaces the generic sine tilt. Sprint poses were reviewed at the new framing and kept.

## First-person draw

`src/render/weapons.ts` timed the swap with fixed constants (0.13 s lowering, 0.3 s raising). It now takes both from `HANDLING[id].draw` in `src/shared/weapons.ts`: 40 % to lower the outgoing gun, 60 % to raise the incoming one. The gun settles exactly when the simulation allows the first shot. A new test in `tests/viewmodel.test.ts` checks that the M4 (0.32 s) and the sniper (0.40 s) are still rising two frames before their draw time and fully up just after it.

## Budgets

| Weapon | FP triangles | Packed GLB bytes | World near / far triangles |
| --- | ---: | ---: | --- |
| m4 | 22,154 | 704,484 | 2,400 / 416 |
| shotgun | 21,040 | 599,208 | 2,400 / 418 |
| sniper | 22,314 | 641,776 | 2,400 / 416 |
| dmr | 23,504 | 723,176 | 2,390 / 410 |
| coco | 25,790 | 873,732 | 2,364 / 418 |

Every packed GLB is under 1.3 MB. The Lança-coco is 3 % over the 25k guideline because of the new ladder sights and saddle straps. The world versions and atlas cells were rebuilt for the long guns only. The short-gun cells are byte-identical to the base.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: 108 files, 937 tests pass, including ADS alignment, the M4 world magazine contact (updated to the new magazine grip) and the new draw-timing test.
- Full-vertex skin clearance of both paws, sampled at hip, ADS, fire (shotgun pump rack, sniper bolt cycle), inspect and densely through every reload (M4 empty, Doze single and six-shell chain, sniper empty with bolt, Carabina empty with charge, Lança-coco empty refill). Worst sampled value is -0.4 mm (sniper firing paw late in inspect). Everything else is at -0.3 mm or better, above the -0.5 mm bar.
- Views checked from the eye and from the near, front-low, below and top orbits, plus third-person holds.

## Merge notes

- Conflicts were resolved in favour of both sides. Reload selection covers the short guns' pistol and SMG empty/tactical choreographies and this branch's M4, Carabina, sniper and Lança-coco ones. The sniper keeps its part-anchored bolt cycle (the base's procedural `boltHand` path was dropped for the sniper only).
- The two `grip-fit` tools conflicted: this branch's batch fitter stays at `tools/qa/grip-fit.mjs` and the base's single-fit CLI is kept as `tools/qa/grip-fit-short.mjs`. Having two fitters is duplication; merging them is a cleanup for later.

## Known issues

- Support thumb tips sit over the top-left shoulder (125 to 146 degrees) rather than dead top (see above).
- Inspects are shared choreographies with per-gun amplitudes, not per-weapon keyframed performances.
- `output/playwright/guns-long/` still holds the previous agent's temporary captures (gitignored). My own temporary captures live outside the repo.
