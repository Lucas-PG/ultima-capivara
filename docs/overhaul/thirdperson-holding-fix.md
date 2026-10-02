# Third-person reload follow-up

2 October 2026. Baseline: `8111d38`. This first checkpoint fixes all 52 whole-skin penetrations listed by the previous TP capture. It does not yet certify every reload frame.

The world rig now has measured TP-only magazine, seating and catch keys. The pistol fetch goes outside the firing paw; the SMG charging paw follows its actual handle. Generic long-gun belt reaches clear the fore-end before travelling rearward. Released paws keep an anatomical wrist while travelling; carrying paws retain their fitted contact frame. Weapon scale remains 1.3, with unchanged meshes and liveries.

| Weapon | Reported samples | Before minimum | After minimum | Failures |
| --- | ---: | ---: | ---: | ---: |
| pistol | 2 | -18.199 | outside probe range | 0 |
| smg | 3 | -3.166 | 0.661 | 0 |
| m4 | 23 | -6.309 | -0.071 | 0 |
| dmr | 11 | -9.655 | 92.787 | 0 |
| sniper | 5 | -15.778 | 16.373 | 0 |
| coco | 8 | -0.607 | 0.041 | 0 |

Distances are world millimetres. A missing finite nearest surface during an authored free reach means the paw is outside the 30 mm probe search, not zero distance. Both full paws are checked throughout. Carrying body, paired-paw and magazine contacts require separate palm and wrap distances from -0.5 to +1.5 mm. The M4 floorplate seating key is a palm press after releasing the magazine shaft, so it requires palm contact rather than a wrapped magazine hold. The M4 catch mask identifies triangles already baked into the unchanged world body.

The two formerly rejected M4 interpolated palm gaps at phases 0.28375 and 0.60875 now measure +0.242 mm in fitting, and pass actual runtime replay. The strict regression file covers those two phases plus all 52 previous rows. Five additional sniper midpoint regressions constrain the carrying wrist. Together with the unchanged ready suite, 140 tests pass, including all 81 ready/movement states and their 64 required trigger contacts. TypeScript also passes.

A broader dense audit is in progress and has exposed additional inherited reload contact gaps and wrist strain, particularly pistol/revolver/SMG and other carrying contacts. The sniper now keeps a shallower gun tilt during the belt reach; all 133 dense sniper samples pass. The released-wrist calculation reuses scratch vectors and quaternions to avoid per-frame allocation. These are not hidden by the 52-row result. TP draw, inspect and holster still are not separate replicated actor animations; generic long guns still use their existing belt-reach representation. No unsupported state is claimed as audited.

Before images were recaptured from 8111d38 on this session's Mesa 26.2 at 1470x956, DPR 1, Medium, two angles. Original captures, fitting jobs and dense raw measurements stay in `/home/lucas/codex-team/pass2/thirdperson`. Compact final comparison boards follow the completed dense pass.
