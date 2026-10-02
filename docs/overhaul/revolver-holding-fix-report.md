# Trinta-e-oito first-person contact follow-up

2 October 2026. Baseline `8111d38`; source fixes `d704294`, `c5cfbf0`, `c18a448`, and `48fcd9b`. All changes are authored revolver hand poses and paths. Weapon meshes, moving-part tracks, liveries, lenses, framing, quality settings, the shared solver, and measurement bounds are unchanged.

The right paw carries the grip throughout reload. The left thumb presses the cylinder during its opening and closing travel; the fully open cylinder receives a palm and wrapping-digit hold. The hand transfers between those poses with measured clearance around the barrel, then withdraws outward before returning to the handgun support cup. Cylinder travel keeps a real cylinder contact intent. The ejector uses the palm against the rod's front cap, following the rod stroke, then clears the falling cases. The speedloader follows its part transform with palm and wrap contact through seating and withdrawal.

The hand path was checked against actual deformed shipped skin. A direct cylinder-pose blend clipped the barrel, and its replacement was refined at the failing between-key positions. The closed drum uses the manipulating thumb region, while the open drum and speedloader require separate palm and wrap contact. No detached carrying hand is marked as accepted.

| Operation | Accepted skin region | Representative contact, mm |
| --- | --- | ---: |
| Closed cylinder | Thumb distal pad | 1.216 |
| Open cylinder | Palm / wrap | 0.750 / -0.101 |
| Ejector front cap | Palm | 0.422 |
| Speedloader | Palm / wrap | 0.781 / -0.119 |

All carrying contacts retain the -0.5 to +1.5 mm interval; whole skin retains the -0.5 mm floor. Wrists retain flexion +/-45 degrees, deviation -25 to +20 degrees and roll +/-80 degrees. The 16 ready, motion, sprint and immediate-fire regressions preserve the support cup, one-handed sprint, actual trigger-front contact and guard containment.

Validation: 126 revolver checks passed: 56 cylinder, 28 ejector, 26 loader and 16 existing ready/motion checks. TypeScript passes. The full `c18a448` replay passes all 462 samples (455 active, 7 inactive), including all 276 original samples and all 68 original failures. The follow-up adds 8 authored samples and replays all affected intervals plus finer cylinder positions: 52/52 pass. Combining that replay with unchanged states gives 470 samples, 463 active, 7 inactive and zero failures. This is explicit incremental accounting, not a claim of a monolithic 470-state run.

The initial cylinder sweeps used 99 samples, then 80 halfway samples. The latter exposed four narrow failures, corrected in `48fcd9b` and rechecked at swing increments down to 0.00625. The combined 218 cylinder samples now have no failures, thumb contact 0.143 to 1.395 mm, and a -0.399 mm whole-left-skin minimum. The full state matrix has minima R -0.100, L -0.244 and paired paws -0.368 mm. [Compact numerical and capture provenance](evidence/codex-holding-fix/revolver/summary.json) records the source and replay accounting.

These results certify first-person samples only. Third-person inherits the shared reload keys, including the additional transfer points. Its separate +0.5 mm Y correction at the fully open cylinder endpoints does not certify every inherited manipulation sample; the broader third-person failures remain part of the integration report.

The before images were recaptured from `8111d38` on the current Mesa 26.2 / Chrome 150 driver, using the same RX 9060 XT ANGLE gl-egl renderer as the after images. Both captures use 1470x956, DPR 1, and medium quality. Actual eye, left and right views were inspected. The three compact boards show only the five changed contact states: [eye](evidence/codex-holding-fix/revolver/contact-eye.webp), [left side](evidence/codex-holding-fix/revolver/contact-left.webp), [right side](evidence/codex-holding-fix/revolver/contact-right.webp). Raw frames, fits, full numerical reports and unchanged draw/holster/inspect comparisons remain in `/home/lucas/codex-team/pass2/revolver`.

`tools/qa/revolver-holding-evidence.mjs` captures the selected states with one Chrome instance and closes it on completion. Numerical coverage uses the unchanged `holdingStates`, `holdingMetrics`, `measureGrip` and `fp-clearance-node.mts` tools. The operation regressions are in `tests/revolver-cylinder-contact.test.ts`, `tests/revolver-ejector-contact.test.ts`, and `tests/revolver-loader-contact.test.ts`.
