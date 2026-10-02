# Sniper, Carabina and SMG holding follow-up

2 October 2026. Baseline `8111d38`; final scoped source `a957bbd`, including the shared index-route and trigger-intent fixes. The 83 failing rows in these three weapons now pass on the shipped, deformed skin. All original audit times were retained for verification.

| Weapon | Baseline failures / rows | Final failures / rows |
| --- | ---: | ---: |
| Sniper | 74 / 324 | 0 / 333 |
| Carabina / DMR | 8 / 273 | 0 / 273 |
| SMG | 1 / 242 | 0 / 242 |

The sniper final set is the union of all 324 original states and all 331 current states. Nine new authored times were added; the two replaced times, fire 0.92625 s and reload 2.985 s, were checked separately. The 848 final states cover ready, aim, locomotion, draw, holster, inspect, fire and both reload modes. The measurement functions, contact bounds, meshes and liveries were preserved.

## Changes and measured contacts

The sniper right elbow pole clears the stock during sprint. Its magazine paw now seats the palm and wrapping digits on the actual magazine, and its support release moves forward and down clear of that magazine. Bolt entry approaches from the right and rear; exit reverses that approach. The middle finger stays folded clear of the moving bolt while the fitted index and thumb retain control contact. The firing index withdraws before the wrist releases, then the palm reseats before the index returns along its measured route. The shared grip-key route fix also clears the inspect transition.

The Carabina charge hook moves up 3 mm and folds the middle digit around the handle. The hand retains that hook during its short outward release. The SMG charge approach moves up and rearward; its relaxed middle digit clears the receiver while the index and thumb retain the charging contact.

All distances below are millimetres. A negative distance is a shallow signed overlap; the unchanged floor is -0.5 mm. Carrying palms and wrapping digits remain within -0.5 to +1.5 mm.

| State | Measured region | Before | After |
| --- | --- | ---: | ---: |
| Sniper sprint 0.40 s | Right whole-skin minimum | -0.778 | -0.304 |
| Sniper inspect 1.70 s | Right whole-skin minimum | -2.992 | -0.304 |
| Sniper reload 1.25 s | Magazine palm | 11.512 | 0.598 |
| Sniper reload 1.25 s | Magazine wrap | 3.587 | 0.188 |
| Sniper partial reload 0.20 s | Released left skin to magazine | -2.443 | 14.496 |
| Sniper fire 0.20 s | Right whole-skin minimum | -0.610 | 0.554 |
| Sniper reload 2.65 s | Right whole-skin minimum | -3.763 | 1.205 |
| Carabina reload 2.20 s | Charging handle contact | -2.344 | 0.649 |
| SMG reload 1.60 s | Left whole-skin minimum during approach | -2.265 | 1.023 |
| SMG reload 1.65 s | Charging handle contact | 0.083 | 0.122 |

The magazine has 0.179 mm whole-skin clearance. The bolt's held contact remains 0.115 mm. Across these dense runs, wrist flexion stays within -40 to +40 degrees, deviation within -21 to +16 degrees, and pronation within -74 to +74 degrees. These remain inside the requested limits. Ready and immediate firing keep the index inside the guard on the real front trigger surface. Released manipulation hands move freely; the other carrying palm remains required and measured.

## Verification and visual review

- 121 tests pass across the eight contact, skin, control and index-route suites, including the new DMR, SMG, sniper magazine and sniper bolt regressions.
- All 48 ready tests for these three weapons pass, covering 16 states per weapon and actual trigger contact.
- All 83 viewmodel and framing tests pass after the final bolt change, including the full sampled near-plane and natural-wrist checks.
- The sniper bolt was additionally swept at 10 ms through 225 states, with zero whole-skin or held-bolt contact failures. The SMG charge approach, pull and release were swept at 5 ms through 85 states, also with zero failures.
- `npx tsc --noEmit` and `VITE_QA=1 npm run build` pass. Repository-wide integration gates are recorded in the main follow-up report.
- Fresh before and after views were captured on Mesa 26.2 at 1470 x 956, medium quality. The final eye, left and right views were reviewed: the magazine sits inside the supporting paw, the bolt hand clears its route, and the charge motions retain their intended controls. The eye framing remains readable throughout the changed states.

Only four compact comparison boards and the [contact summary](evidence/codex-holding-fix/sniper/contact-summary.json) are committed. The boards total 1.86 MB; raw captures and fitting output remain under `/home/lucas/codex-team/pass2/sniper/`.

- [Magazine grip and support release](evidence/codex-holding-fix/sniper/sniper-magazine.jpg)
- [Bolt approach and return](evidence/codex-holding-fix/sniper/sniper-bolt.jpg)
- [Sprint and inspect](evidence/codex-holding-fix/sniper/sniper-carry.jpg)
- [Carabina and SMG charging controls](evidence/codex-holding-fix/sniper/charge-controls.jpg)

No known failures remain in the original or added scoped states. Source commits are `acbf416`, `e3582fc`, `1c57c90` and `a957bbd`; the shared changes originated in `9c4dd5c` and `583b1e4`.
