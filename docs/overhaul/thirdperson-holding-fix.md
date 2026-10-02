# Third-person reload follow-up

2 October 2026. Before source: `8111d38`. Completed TP source: `5ca7e46`, `ef0836f`, `ead1dc5`, `bce562c`, `2d1eb98`.

All 52 previously reported TP whole-skin penetrations are fixed. The 81 ready/movement states and their 64 required trigger contacts remain green. The broader accepted cohorts contain 1,698 actual reload states across M4, SMG, shotgun, DMR, sniper and coco. Pistol and revolver still have the specific reload failures below; this is not a blanket reload certification.

The world rig has independent magazine, floorplate and control keys. The M4 index follows its own measured route during reload entry and return, with its carrying palm and other digits retained. Its safe endpoint has no index skin vertex inside the guard and lies 1.312 mm from the receiver. The dense route minimum is -0.350 mm with the pad at its full size. FP route data cannot override this TP fit.

SMG magazine poses retain palm and wrap contact through withdrawal and insertion, then clear the part before opening. The pistol fetch passes outside the firing paw. Generic belt reaches clear the fore-end before travelling rearward, and the sniper uses a shallower reload gun tilt. Released wrists stay just inside the anatomical limits using reusable scratch vectors and quaternions. Weapon scale remains 1.3; meshes and liveries are unchanged.

## Measurements

The probe reads the actual posed world skin and moving weapon triangles. Whole-skin clearance must stay at or above -0.5 mm. Carrying palm and wrap contacts each require -0.5 through +1.5 mm. Wrist limits remain flexion ±45 degrees, deviation -25 through +20, and roll ±80. Ready trigger contact still requires the fingertip inside the real guard and within 1.5 mm of its front face. No tolerance or probe was relaxed.

| Accepted cohort | States | Whole-skin minimum, mm | Largest required contact gap, mm |
| --- | ---: | ---: | ---: |
| M4 | 748 | -0.419 | 1.267 |
| SMG | 434 | -0.429 | 1.359 |
| shotgun | 106 | -0.253 | 0.058 |
| DMR | 124 | -0.127 | 0.622 |
| sniper | 133 | -0.176 | 0.614 |
| coco | 153 | 0.041 | 0.452 |

Both empty and tactical reloads were replayed from a fresh avatar with a ready settle and advancing runtime clock. M4/SMG include 0.005 phase steps and authored/intermediate keys. The corrected M4 0.300–0.400 interval was resampled at 0.001, and 0.300–0.310 at 0.0005. Generic cohorts include authored keys and 0.025 phase steps. The final cohort combines only measurements equivalent to the completed source; the replaced historical failures remain in private raw files. See [dense numeric summary](evidence/codex-holding-fix/thirdperson/dense-summary.json).

The M4 floorplate key is a palm press after releasing the shaft, so that operation requires palm contact. Magazine carrying still requires both palm and wrap. The bolt-catch mask identifies triangles already baked into the unchanged world body. Missing finite distances during an authored free reach mean the paw is outside the probe's surface search, with full-solid containment still checked.

The regression suites cover all 52 previous rows, the two formerly rejected M4 +1.721 mm interpolation gaps, dense index travel, actual reload entry/return, the new SMG transitions, and fully-open revolver support. The ready/contact run passed 198 tests, the open-cylinder run passed four more, and the index/ready run passed 112 tests with overlapping ready coverage. TypeScript passes. The four inherited revolver endpoint crossings introduced by the FP cylinder fit at phases 0.17 and 0.835 now improve from -0.714 to -0.064 mm; open-cylinder palm and wrap also pass.

## Remaining reload limits

The following catalogue is measured against FP pistol `ab02594` and revolver `d704294`, `c5cfbf0`, `c18a448`, with TP isolation/corrections through `2d1eb98`. It precedes any subsequent pistol-specific follow-up.

| Scope | Exact examples | Remaining issue |
| --- | --- | --- |
| pistol, 49/122 sampled rows | empty 0.175 / 0.625 | R skin versus moving magazine: -5.339 / -5.188 mm |
| pistol magazine support | empty 0.42–0.71; tactical 0.17–0.71 | Palm +4.598 mm, wrap +35.002 mm; deviation reaches -34.49 degrees, roll -88.53; paired paws reach -1.704 mm at 0.67 |
| pistol slide release | empty 0.81 / 0.825 | Actual control gap +1.033 mm, but L deviation +27.63 / +27.53 degrees |
| revolver, 100/134 sampled rows | 0.12 / 0.875 / 0.88 | Closed-cylinder control gap +2.315 mm |
| revolver ejector | 0.28 / 0.30 | Control gap +2.679 mm; L flexion about +63.25, deviation -73.73, roll -92.46 degrees |
| revolver loader | 0.50–0.70 | Palm +7.684 mm, wrap +6.966 mm; early L flexion +54.44 degrees |
| revolver carrying wrist | near 0.275 | R deviation reaches +29.99 degrees |

A reduced revolver gun-rotation candidate was rejected: it improved several wrist rows but introduced a -4.259 mm support-paw crossing at phase 0.27. The completed source retains its prior gun frame. The revolver catalogue samples the common authored/0.025-phase set, not every newly added FP cylinder interpolation key.

TP draw, inspect and holster are not separate replicated actor animations. Generic long guns retain their existing belt-reach representation. No unsupported state or unimplemented mechanical reload is claimed as audited.

## Visual evidence

[Nine compact comparison boards](evidence/codex-holding-fix/thirdperson/README.md) show changed states only. Each 1470×956 board pairs before/after with both left and right cameras. The originals were freshly captured from `8111d38` and the completed poses in the same Mesa 26.2 session, Medium, DPR 1, at 1470×956. The boards only resize the captures and add labels; raw captures, failed candidates, fitting jobs and complete measurements remain in `/home/lucas/codex-team/pass2/thirdperson`.
