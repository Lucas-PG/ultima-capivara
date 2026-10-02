# Pistola and Doze contact corrections

The original pistol audit had 6 failures across 245 samples (241 active); Doze had 35 across 233 samples (228 active). Every original failed state now passes the unchanged contact contract. The full dense runs below have zero residual failures.

Pistol changes the first-person elbow pole to prevent the carrying forearm from crossing the support cup. A fitted reload hold clears the magazine sweep, staged ring motion avoids curved interpolation through the magazine, and the original grip returns before the cup closes. Doze uses a measured trigger withdrawal route and pump grip, then transfers the shell pinch onto the actual case-head thumb below the receiver. The shell enters nose-up and levels into the tube; genuine release keys move away before opening or returning.

Carrying palm and wrap remain in -0.5 to +1.5 mm, whole visible skin stays at or above -0.5 mm, and the ready/fire trigger stays inside the unchanged guard within 1.5 mm of its real front face. Wrist limits remain +/-45 degrees flexion, -25 to +20 deviation and +/-80 roll. No mesh, livery, lens, contact-measurement rule or setting changed. The pistol cup and one-handed sprint are preserved.

| Weapon | Dense states | Active | Inactive switch boundaries | Failures | R skin minimum | L skin minimum | Paw pair minimum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pistol | 1023 | 1017 | 6 | 0 | -0.484 | -0.149 | -0.058 |
| shotgun | 752 | 744 | 8 | 0 | -0.419 | -0.325 | n/a |

Distances are millimetres; positive means separated, negative means penetration. Inactive rows are weapon-switch boundaries where the requested weapon is not active, never a relaxed contact gate. Two additional original pistol key times absent from the new key list also pass.

The dense sweep uses the production `holdingMetrics` contract and actual posed skin against the shipped GLB triangles. Every action in `holdingStates` is covered at uniform 25 ms cadence, including locomotion and inspect, every authored reload key is included, and the new pistol reload transitions/magazine sweep have 5 ms checks. Doze adds 5 ms reload checks, 101 transfer samples at 1 ms, and 67 pump/shell release samples at 1 ms, all passing.

| Carrying region across active dense states | Pistol min / max | Doze min / max |
| --- | ---: | ---: |
| palm | 0.337 / 1.188 | -0.194 / 1.260 |
| wrap | -0.322 / -0.058 | -0.178 / -0.106 |

| Active ready/fire trigger front distance | Minimum | Maximum | Outside guard |
| --- | ---: | ---: | ---: |
| pistol | 0.698 | 0.963 | 0 |
| shotgun | 0.030 | 0.500 | 0 |

The existing 16 ready/movement/sprint/immediate-fire cases pass for each weapon. The pistol run passed 95 new/existing reload and ready cases; the support-release follow-up passed 42 release, ready and framing cases. The final Doze runs passed 41 new shell cases plus 54 ready, index-route and pump cases. Seven existing composition, aimed, taller-window, natural-wrist and near-plane tests pass for the affected weapons; TypeScript and the QA production build pass. Root separately integrated the third-person pistol carry adjustment required by the changed first-person elbow pole.

## Actual captures

Before is source `8111d38`; after is `0a546c8`, including `ab02594`, `5d70c3f` and shared interpolation fix `249ee8d` (root `9c4dd5c`). Both sets were captured on the current Mesa 26.2 stack, at 1470 x 956, with eye, left-side and right-side views. These are same-driver visual comparisons, not cross-driver pixel comparisons. Twenty-seven before and twenty-seven after raw frames remain private. The boards show only the changed states. A supplemental board records the two newly detected release states from `0a546c8` before to `fbff404` after, also on the same driver; these are explicitly a second correction checkpoint, not the original baseline.

[Pistola before/after](pistol-before-after.jpg) | [Doze before/after](shotgun-before-after.jpg) | [Pistol release follow-up](pistol-release-before-after.jpg)

## Exact original failures

Each numerical cell is before / after, in millimetres. R and L are minimum whole-paw skin distances. Pair is the minimum between the two paws. L contact names the actual carried surface. A free paw has no invented contact requirement; its visible skin still has the same penetration floor.

| Weapon / state | R skin | L skin | Pair | L contact before / after |
| --- | ---: | ---: | ---: | --- |
| pistol draw 0.2 s | -0.430 / -0.430 | -0.097 / -0.097 | -12.246 / -0.058 | paw -12.246 / paw -0.058 |
| pistol draw 0.25 s | -0.430 / -0.430 | -0.097 / -0.097 | -34.326 / -0.058 | paw -34.326 / paw -0.058 |
| pistol reload 0.3 s | -1.540 / -0.251 | not visible / not visible | 32.896 / 137.217 | free / free |
| pistol reload 1.15 s | -1.602 / -0.251 | -0.149 / -0.149 | 1.144 / 1.564 | mag -0.149 / mag -0.149 |
| pistol reload-partial 0.3 s | -1.540 / -0.251 | -0.149 / -0.149 | 2.836 / 3.412 | mag -0.149 / mag -0.149 |
| pistol reload-partial 1.15 s | -1.602 / -0.251 | -0.149 / -0.149 | 1.144 / 1.564 | mag -0.149 / mag -0.149 |
| shotgun holster 0.025 s | -1.705 / -0.387 | -0.196 / -0.106 | n/a | pump -0.196 / pump -0.106 |
| shotgun draw 0.25 s | -2.362 / -0.200 | -0.196 / -0.106 | n/a | pump -0.196 / pump -0.106 |
| shotgun draw 0.3 s | -0.652 / -0.248 | -0.196 / -0.106 | n/a | pump -0.196 / pump -0.106 |
| shotgun inspect 1.7 s | -3.037 / -0.281 | -0.196 / -0.106 | n/a | pump -0.196 / pump -0.106 |
| shotgun fire 0.2 s | -0.200 / -0.200 | -1.124 / -0.223 | n/a | pump -0.196 / pump -0.106 |
| shotgun fire 0.25 s | -0.200 / -0.200 | -1.124 / -0.223 | n/a | pump -0.196 / pump -0.106 |
| shotgun reload 0.25 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload 0.35 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload 0.4 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |
| shotgun reload 0.65 s | -0.200 / -0.200 | -0.605 / -0.106 | n/a | pump -0.196 / pump -0.106 |
| shotgun reload 0.264 s | -2.974 / -0.200 | 0.665 / 1.404 | n/a | mag 1.164 / mag 1.404 |
| shotgun reload 0.341 s | -0.200 / -0.200 | 2.721 / 1.404 | n/a | mag 2.721 / mag 1.404 |
| shotgun reload 0.36575 s | -0.200 / -0.200 | 4.025 / 1.404 | n/a | mag 11.380 / mag 1.404 |
| shotgun reload 0.385 s | -0.200 / -0.200 | 3.886 / 1.404 | n/a | mag 13.977 / mag 1.404 |
| shotgun reload 0.407 s | -0.200 / -0.200 | 2.539 / -0.316 | n/a | mag 5.435 / mag 1.404 |
| shotgun reload-partial 0.25 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload-partial 0.35 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload-partial 0.4 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |
| shotgun reload-partial 0.264 s | -2.974 / -0.200 | 0.665 / 1.404 | n/a | mag 1.164 / mag 1.404 |
| shotgun reload-partial 0.341 s | -0.200 / -0.200 | 2.721 / 1.404 | n/a | mag 2.721 / mag 1.404 |
| shotgun reload-partial 0.36575 s | -0.200 / -0.200 | 4.025 / 1.404 | n/a | mag 11.380 / mag 1.404 |
| shotgun reload-partial 0.385 s | -0.200 / -0.200 | 3.886 / 1.404 | n/a | mag 13.977 / mag 1.404 |
| shotgun reload-partial 0.407 s | -0.200 / -0.200 | 2.539 / -0.316 | n/a | mag 5.435 / mag 1.404 |
| shotgun reload-chain 0.25 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload-chain 0.35 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload-chain 0.4 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |
| shotgun reload-chain 0.8 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload-chain 0.9 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload-chain 0.95 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |
| shotgun reload-chain 1.35 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload-chain 1.45 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload-chain 1.5 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |
| shotgun reload-chain 1.9 s | -6.711 / -0.200 | 1.164 / -0.181 | n/a | mag 1.164 / mag -0.181 |
| shotgun reload-chain 2 s | -0.200 / -0.200 | 3.622 / 1.404 | n/a | mag 4.922 / mag 1.404 |
| shotgun reload-chain 2.05 s | -0.200 / -0.200 | 4.144 / 0.708 | n/a | mag 7.040 / mag 1.404 |

The uniform supplement detected two additional between-key overlaps in the initial correction. Both are removed by `fbff404`; the support cup now departs down/left for inspect and slightly forward into the existing one-handed sprint pose. The affected actions were re-audited for all original and uniform states, plus 1 ms sprint entry and 2.5 ms inspect departure/return.

| Additional state | Pair before / after (mm) |
| --- | ---: |
| pistol sprint 0.025 s | -1.133 / 1.164 |
| pistol inspect 0.075 s | -1.546 / 8.194 |

An additional 130 actual R-skin checks at 1 ms around pistol reload entry/return pass; their minimum is -0.498 mm. These are separate from the full-contract state count above.

## Reproduction and private evidence

`tests/pistol-motion-contact.test.ts` covers the cup departure and return, magazine sweep and new reload-hold transitions. `tests/shotgun-holding-contact.test.ts` covers trigger withdrawal and pump fire; `tests/shotgun-shell-contact.test.ts` covers shell transfer, real rear-face thumb contact and both release paths. `tools/qa/shotgun-contact-evidence.mjs` recreates the selected eye/side capture set against a QA-enabled server, default port 5194.

Private evidence root: `/home/lucas/codex-team/pass2/shotgun`. Final numerical files: `pistol-final-audit-v5.json`, `shotgun-final-audit.json`, `original-missing-audit.json`, `uniform-extra-audit.json` (with pistol sprint/inspect superseded by `pistol-release-final-audit.json` and `pistol-release-authored-audit.json`), `shell-transfers-audit-v4.json`, and `shell-release-audit.json`; baseline: `baseline-audit.json`. State lists, checkpoint runner, fit jobs/results, raw `before/` and `after/` frames, build logs and test logs remain there. Browser and preview processes were stopped after capture.
