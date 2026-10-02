# World pistol release-lever follow-up

2 October 2026. Source `147df15` adds an independent TP release-lever pose and translates its approach and withdrawal keys with it. The thumb retains its fitted shape during withdrawal. First-person pistol keys, the world weapon scale of 1.3, meshes, contact bounds and wrist limits are unchanged.

The original left wrist exceeded the radial-deviation limit while pressing the release lever. The corrected pose retains real lever contact and separates the two paws.

| Empty reload phase | Left wrist deviation before | After | Lever contact before | After |
| --- | ---: | ---: | ---: | ---: |
| 0.810 | 27.632 degrees | 11.991 degrees | 1.033 mm | 0.038 mm |
| 0.825 | 27.533 degrees | 11.810 degrees | 1.033 mm | 0.038 mm |

At both held phases, the corrected whole left skin minimum is 0.038 mm and the opposing-paw minimum is 5.314 mm. The right carrying palm and wrap remain required and measured. Across 44 empty-reload samples from phase 0.750 through 0.965, spaced by 0.005, all skin, contact and wrist checks pass. The corrected held wrist flexion is about -42 degrees, within the unchanged +/-45-degree limit.

Validation passes: 19 new release and transition regressions, both original pistol reload regressions, all nine pistol ready states, TypeScript and the QA production build. Replaying all 122 original pistol rows against the same local baseline (`19fa917`) reduces failed rows from 53 to 51 with no newly failing row. This patch resolves the two release-lever findings. The lead then combined it with the independent world fetch corrections and replayed the same 122-row catalogue: 47 rows remain failing, as recorded in the [integration report](codex-holding-fix-report.md).

The magazine-carry cluster and right-paw collisions with the moving magazine remain outside this retained change. A trial vertical magazine fit seated the palm and wrap at phase 0.67, but produced excessive wrist deviation during the lowered pose and collisions on approach/exit. That candidate was rejected and its raw output remains private.

Fresh before and after 1470 x 956 world-side captures were reviewed on Mesa 26.2 at medium quality. The support wrist follows the forearm more naturally and the thumb still presses the lever. Only the [compact comparison board](evidence/codex-holding-fix/tp-pistol-release/release.jpg) is committed; raw images, candidate fits and audit rows remain under `/home/lucas/codex-team/pass2/sniper/tp-pistol/`.
