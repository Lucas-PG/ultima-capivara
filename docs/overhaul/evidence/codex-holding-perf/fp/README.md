# First-person contact evidence

Baseline visually matches `b721224`; final immutable QA build is `6220526`, with holding data through `24116eb` and QA hooks `5c5cd30`.

The ready regression covers 144 cases. Its first run passed143; the sole M4 sprint failure was corrected by retaining its fitted ready index during carry, and all16 M4 cases then passed. This is an explicit animation compromise, not a completed safe-index withdrawal. The root subsequently reran all144 integrated cases successfully.

The dense audit samples every authored reload/inspect key plus regular motion times. It is deliberately broader than the ready regression.

| Weapon | Samples | Active | Inactive | Failed |
| --- | ---: | ---: | ---: | ---: |
| pistol | 245 | 241 | 4 | 6 |
| revolver | 276 | 271 | 5 | 68 |
| smg | 242 | 237 | 5 | 1 |
| m4 | 254 | 249 | 5 | 0 |
| shotgun | 233 | 228 | 5 | 35 |
| dmr | 273 | 268 | 5 | 8 |
| sniper | 324 | 318 | 6 | 74 |
| coco | 317 | 312 | 5 | 0 |
| machete | 141 | 137 | 4 | 0 |

Total: 2305 sampled rows, 2261 active, 44 inactive, 192 failing rows.

Inactive rows are draw/holster moments when another weapon is active. They are not counted as successful contact measurements.

[Every state measurement](fp-contact-audit.json) preserves contact regions, trigger front/guard checks, actual wrist angles and failure messages. [Exact failures](fp-contact-failures.json) additionally records the actual worst skin point and contacted part. No bound was widened.

The nine JPG boards pair matching before/after renders for every captured state, including all authored keys. The `native` directory contains selected original-resolution JPEG conversions for close review. The initial baseline has717 PNGs and the final list has720, including three added SMG inspect times. The three missing baseline times were captured from preserved f40ea9c source with HMR disabled. All720 pairs match and their source PNG SHA-256 hashes are in capture-index.json; original PNGs remain in the local QA artifact directories.

The numeric and screenshot fixtures are complementary. Screenshots use the authored key times listed in `capture-index.json`; the denser geometry audit includes additional fixed-time transition samples.

Private source-game research images are not included. See [the detailed report](../../../fp-holding-contact-report.md) for research, changes, metrics and limitations.
