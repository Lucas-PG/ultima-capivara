# Short weapon overhaul

Worktree: `guns-short`. QA uses port 5178, real Chrome with ANGLE Metal, the medium preset, and 1280 x 720 captures. The v3 paw assets and `arsenal_lib.py` are unchanged.

This is a checkpoint, not final acceptance. Models and mechanism tests are committed. The remaining grip and motion checks below must be completed before declaring the weapons finished.

## Asset budgets

All four first-person weapons use 1024 albedo, ORM and relief-normal maps.

| Weapon | FP triangles | Packed GLB bytes | World near / far triangles |
| --- | ---: | ---: | ---: |
| Pistol | 13,892 | 410,380 | 2,400 / 420 |
| SMG | 17,332 | 503,332 | 2,398 / 660 |
| Revolver | 23,426 | 661,676 | 2,400 / 420 |
| Machete | 10,490 | 390,560 | 2,400 / 420 |

The four world models share the existing atlas. Targeted rebuilding preserves all other weapons' geometry and decoded atlas pixels, both checked against the baseline. The SMG far LOD stops at 660 triangles under the simplifier's error limit. Animation-only revolver loaders and spent cases are omitted from static world geometry.

## Pistol

Teal enamel slide, case-coloured frame, jacaranda scales, brass palm inlay, brass controls and magazine shoe. The trigger guard has a thinner lower bridge to separate adjacent thick digits, and a broader trigger closer to the firing digit. The stationary barrel is separate from the moving slide, and the slide stop has its own pivot.

Tactical reload retains the chambered round. Empty reload locks the slide until the support-paw release. Magazine acquisition, removal and the palm seat use a target in magazine space. Inspect presents both sides.

Evidence: [before](evidence/guns/pistol-before.jpg), [model after](evidence/guns/pistol-model-after.jpg).

Remaining: settle the two-handed grip with an index on the trigger, then repeat both reloads, ADS and all carry poses with that final grip. Several numerically clear trial grips were rejected for poor anatomy or contact. No arm defect has been established.

## SMG

Canarinho now follows the yellow receiver, green stripe and grips, blue star and triangular wire-stock design. It has a slotted shroud, a separate charging handle, a bolt face, receiver hardware and an open front-sight hood around the post. The support paw holds the vertical foregrip.

The magazine path includes a palm seat and an outward clearance step before the hand rotates toward the charging handle. Empty reload pulls and releases the handle; tactical reload leaves the action closed. Inspect and hip framing have been adjusted to reduce stock dominance.

Evidence: [before](evidence/guns/smg-before.jpg), [model after](evidence/guns/smg-model-after.jpg), [first-person motion](evidence/guns/smg-motion-after.jpg).

Verified: all 55 sampled hip, ADS, sprint, inspect, empty and tactical reload poses clear both paws. Magazine contact is 0.8 mm; charging contact is 1.3 mm. The final far-side inspect releases the support paw before the turn, preventing a forearm collision with the magazine. Twelve additional samples of that departure, hold and return pass, with 0.8 mm minimum right-paw clearance and at least 1.3 mm on the left. Eye and both side views are captured. The motion sheet includes the seated magazine, charging-handle release and final inspect. Close third-person presentation review remains.

## Revolver

Trinta-e-oito has a blued bull barrel and vent rib, case-coloured engraved frame, brass details, red front insert and porcelain capy medallions in the wood grip. Six chambers align with the barrel bore. Cylinder, crane, ejector, live rounds, six spent cases, speedloader, hammer, trigger and latch are separate animation parts.

The reload sequence swings the cylinder out, raises the muzzle, punches the ejector, releases six separate cases, aligns the loader, leaves the rounds seated when the loader withdraws, and closes the cylinder with the support paw. Part relationships and loaded-round retention have automated coverage.

Evidence: [before](evidence/guns/revolver-before.jpg), [model after](evidence/guns/revolver-model-after.jpg), [reload contacts](evidence/guns/revolver-reload-after.jpg).

Verified: the fitted cylinder, ejector and speedloader contacts are installed. The cylinder contact follows the moving part origin while retaining its orientation in gun space. Digits curl after the crane opens and straighten before closing. Cases travel clear of the firing forearm, and the loader stays held until hidden. The 59-pose carry and reload pass exposed one loader-release collision; nine further samples verify its correction. Eighteen additional samples cover opening and closing. Minimum measured clearance is 0.9 mm on the right and -0.2 mm on the left, within the -0.5 mm acceptance limit. Eye, both sides and top views were reviewed. Remaining: improve the two-paw ready silhouette, then repeat the affected departure and return contacts and finish world presentation.

## Machete

Facao has a swept blade, separate honed edge, capy stamp, brass bolster and pommel, three rivets, teal frond livery and three coloured ribbons. The ribbons hang with gravity while the blade rolls and trail the swing. The free left paw stays low and clear of the blade.

The carry roll exposes the back of the gripping paw and clears the handle from the forearm. Slashes rotate in camera space so the carry roll does not distort their cutting arc. Every third attack presents a heavier chop within the existing hit and recovery timing; damage and cadence are unchanged.

Evidence: [before](evidence/guns/machete-before.jpg), [model after](evidence/guns/machete-model-after.jpg), [first-person motion](evidence/guns/machete-motion-after.jpg), [world presentation](evidence/guns/machete-world-after.jpg).

Verified: the revised elbow pole is installed. All 28 sampled hip, ADS, sprint, inspect, slash and heavy-chop poses pass the full probe, with a minimum right-paw clearance of 0.5 mm. Both paws were measured and each pose was captured from the eye, left and right. Third-person attacks now alternate cuts and use the same third-hit chop timing as first person. The free paw holds a separate ready pose outside the blade path. Thirty-four third-person samples from front, side and three-quarter cameras, plus the ground item, were reviewed. An avatar test checks alternating cuts, the higher chop windup, gripping-paw contact, free-paw clearance, recovery and respawn reset. The focused viewmodel and avatar suites pass all 50 tests.

## Verification and limitations

- TypeScript passes. The latest full Vitest run passed 95 files and 729 tests with two workers. The focused viewmodel suite passes 39 tests, including cylinder-contact orientation through the swing. No Playwright e2e suite was run.
- Held and ground weapons now use the renderer's existing sky-reflection texture at the same intensity as the first-person scene. This restores readable steel edges in world lighting without adding a texture or render pass.
- The grip solver now treats points outside its spatial-search radius as out of range, avoiding false deep penetrations against a distant triangle. Final acceptance uses the separate full-vertex probe, which also reports the struck weapon part.
- The full probe uses a triangle bounding hierarchy. A comparison with its original exhaustive calculation matched every reported minimum and penetration count for the pistol, SMG and machete right paws; the measured calculation took about one fifth of the time.
- `weapon-session.mjs` keeps browser startup costs low. `short-weapon-review.mjs` checks both paws and saves motion strips. `weapon_preview.py` frames small guns and hides reload-only props. `build-fp.mjs --pack <ids>` repacks completed exports without rebaking.
- Local Vite and Vitest configurations under ignored `output/playwright/guns-short/` redirect caches into this worktree. The provided dependency directory is a symlink; initial default cache paths were discovered and then redirected. Shared caches were not cleaned or modified deliberately.
- Third-person weapons currently use the rebuilt static LODs and shared hold rig. Complete close third-person presentation review remains outstanding.
- All committed JPEG evidence files are below 300 KB each. No remote Git operation or external publication was performed.
