# Short weapon overhaul

Worktree: `guns-short`. QA uses port 5178, real Chrome with ANGLE Metal, the medium preset, and 1280 x 720 captures. The v3 paw assets and `arsenal_lib.py` are unchanged.

This is a checkpoint, not final acceptance. Models and mechanism tests are committed. The remaining grip and motion checks below must be completed before declaring the weapons finished.

## Asset budgets

All four first-person weapons use 1024 albedo, ORM and relief-normal maps.

| Weapon | FP triangles | Packed GLB bytes | World near / far triangles |
| --- | ---: | ---: | ---: |
| Pistol | 13,880 | 410,064 | 2,400 / 420 |
| SMG | 17,332 | 503,332 | 2,398 / 660 |
| Revolver | 23,426 | 661,676 | 2,400 / 420 |
| Machete | 10,490 | 390,560 | 2,400 / 420 |

The four world models share the existing atlas. Targeted rebuilding preserves all other weapons' geometry and decoded atlas pixels, both checked against the baseline. The SMG far LOD stops at 660 triangles under the simplifier's error limit. Animation-only revolver loaders and spent cases are omitted from static world geometry.

## Pistol

Teal enamel slide, case-coloured frame, jacaranda scales, brass palm inlay, brass controls and magazine shoe. The trigger guard is enlarged for the thick paw digit. The stationary barrel is separate from the moving slide, and the slide stop has its own pivot.

Tactical reload retains the chambered round. Empty reload locks the slide until the support-paw release. Magazine acquisition, removal and the palm seat use a target in magazine space. Inspect presents both sides.

Evidence: [before](evidence/guns/pistol-before.jpg), [model after](evidence/guns/pistol-model-after.jpg).

Remaining: settle the two-handed grip with an index on the trigger, then repeat both reloads, ADS and all carry poses with that final grip. Several numerically clear trial grips were rejected for poor anatomy or contact. No arm defect has been established.

## SMG

Canarinho now follows the yellow receiver, green stripe and grips, blue star and triangular wire-stock design. It has a slotted shroud, a separate charging handle, a bolt face, receiver hardware and an open front-sight hood around the post. The support paw holds the vertical foregrip.

The magazine path includes a palm seat and an outward clearance step before the hand rotates toward the charging handle. Empty reload pulls and releases the handle; tactical reload leaves the action closed. Inspect and hip framing have been adjusted to reduce stock dominance.

Evidence: [before](evidence/guns/smg-before.jpg), [model after](evidence/guns/smg-model-after.jpg).

Verified: hip and ADS skin clearances of 0.8 mm right and 1.3 mm left. Magazine contact is 0.8 mm; the final charging contact is 1.3 mm. Targeted checks of the corrected acquisition, withdrawal and handle-release transitions pass. Remaining: final motion sheets, inspect/carry review and third-person hold review.

## Revolver

Trinta-e-oito has a blued bull barrel and vent rib, case-coloured engraved frame, brass details, red front insert and porcelain capy medallions in the wood grip. Six chambers align with the barrel bore. Cylinder, crane, ejector, live rounds, six spent cases, speedloader, hammer, trigger and latch are separate animation parts.

The reload sequence swings the cylinder out, raises the muzzle, punches the ejector, releases six separate cases, aligns the loader, leaves the rounds seated when the loader withdraws, and closes the cylinder with the support paw. Part relationships and loaded-round retention have automated coverage.

Evidence: [before](evidence/guns/revolver-before.jpg), [model after](evidence/guns/revolver-model-after.jpg).

Remaining: install and visually accept final grips, fit the cylinder/ejector/loader contacts, and verify the complete reload from several angles. The current pose data is not accepted yet.

## Machete

Facao has a swept blade, separate honed edge, capy stamp, brass bolster and pommel, three rivets, teal frond livery and three coloured ribbons. The ribbons hang with gravity while the blade rolls and trail the swing. The free left paw stays low and clear of the blade.

The carry roll exposes the back of the gripping paw and clears the handle from the forearm. Slashes rotate in camera space so the carry roll does not distort their cutting arc. Every third attack presents a heavier chop within the existing hit and recovery timing; damage and cadence are unchanged.

Evidence: [before](evidence/guns/machete-before.jpg), [model after](evidence/guns/machete-model-after.jpg).

Verified: both light slash strips pass the full probe. A revised elbow pole clears the two heavy-chop samples that previously touched the pommel. Remaining: install that pole and repeat the complete carry/inspect/slash/chop pass and third-person hold review.

## Verification and limitations

- TypeScript passes. The latest full Vitest run passed 95 files and 728 tests with two workers. The focused viewmodel suite passes 37 tests. No Playwright e2e suite was run.
- The grip solver now treats points outside its spatial-search radius as out of range, avoiding false deep penetrations against a distant triangle. Final acceptance uses the separate full-vertex probe, which also reports the struck weapon part.
- `weapon-session.mjs` keeps browser startup costs low. `short-weapon-review.mjs` checks both paws and saves motion strips. `weapon_preview.py` frames small guns and hides reload-only props. `build-fp.mjs --pack <ids>` repacks completed exports without rebaking.
- Local Vite and Vitest configurations under ignored `output/playwright/guns-short/` redirect caches into this worktree. The provided dependency directory is a symlink; initial default cache paths were discovered and then redirected. Shared caches were not cleaned or modified deliberately.
- Third-person weapons currently use the rebuilt static LODs and shared hold rig. Complete close third-person presentation review remains outstanding.
- All committed JPEG evidence files are below 300 KB each. No remote Git operation or external publication was performed.
