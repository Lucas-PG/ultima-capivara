# Short weapon overhaul

Final acceptance: pistol, SMG, revolver and machete. Branch `guns-short`. Review used real Chrome with ANGLE Metal, the medium preset and 1280 x 720 captures. The v3 paw assets, arm implementation and `arsenal_lib.py` are unchanged.

## Asset budgets

All four weapons use 1024 albedo, ORM and relief-normal maps. Every first-person model is below 25,000 triangles and 1.3 MB.

| Weapon | FP triangles | Packed GLB bytes | World static near / far | Animated near |
| --- | ---: | ---: | ---: | ---: |
| Pistol | 13,892 | 414,972 | 2,400 / 420 | 2,470 |
| SMG | 17,332 | 499,604 | 2,400 / 736 | 2,370 |
| Revolver | 23,702 | 699,256 | 2,400 / 416 | 2,540 |
| Machete | 10,490 | 390,560 | 2,400 / 420 | 2,400 |

Nearby held guns retain separate mechanical parts and their first-person pivots. Ground items and distant weapons use combined geometry. All share the existing atlas. The six unowned world geometries and every unowned decoded atlas pixel were compared with the preceding commit and remain identical.

## Pistol

The Pistola has a teal enamel slide, case-coloured frame, jacaranda scales, brass palm inlay and controls. The broader trigger and thinner guard bridge give the firing digit room. Barrel, slide, magazine and slide stop have separate mechanical roles.

The firing paw wraps the front strap and presents its back to the eye; the support paw cups it. Empty reload locks the slide, swaps the magazine, seats it with the palm and operates the release. Tactical reload retains the chambered round. The magazine contact follows its part, with outward clearance before the paw turns. Inspect releases the support paw, shows both sides, then restores the cup.

Final first-person minimum clearance: right 0.0 mm, left 0.2 mm. Seated magazine contact is 0.6 mm; ready paw-to-paw clearance is 0.1 mm. Carry, aim, sprint, firing, inspect and both reloads were reviewed from the eye and both sides. Thirty-six extra samples verify corrected reload transitions. World review includes carry, running, ground presentation, the palm seat and the late empty/tactical release beats from three cameras.

Known issues: none outstanding in the reviewed motion set.

Evidence: [before](evidence/guns/pistol-before.jpg), [model](evidence/guns/pistol-model-after.jpg), [first person](evidence/guns/pistol-motion-after.jpg), [world](evidence/guns/pistol-world-after.jpg).

## SMG

Canarinho follows the yellow receiver, green stripe and grips, blue star and triangular wire stock. The shroud slots, open front-sight hood, bolt face, controls and separate charging handle read at gameplay distance. Lower carry framing reduces stock dominance.

The support paw holds the vertical foregrip. Both reloads include magazine acquisition and a palm seat; empty reload adds the charging-handle pull and release. The support paw clears the magazine before turning. Far-side inspect releases it before the weapon rolls.

The final 55-pose pass covers carry, aim, sprint, firing, inspect and both reloads, with eye and side views. Minimum clearance is right -0.1 mm and left 0.8 mm. Trigger contact is 0.2 mm. Near-world magazines and charging parts retain their contacts; the complete late reload actions, running carry and ground model were reviewed from three cameras.

Known issues: none outstanding in the reviewed motion set.

Evidence: [before](evidence/guns/smg-before.jpg), [model](evidence/guns/smg-model-after.jpg), [first person](evidence/guns/smg-motion-after.jpg), [world](evidence/guns/smg-world-after.jpg).

## Revolver

Trinta-e-oito has a blued bull barrel and vent rib, engraved case-coloured frame, brass hardware, red front insert and porcelain capy medallions in the wood grip. Six chambers align with the bore. Cylinder, crane, ejector, rounds, cases, live cartridge tips, speedloader, hammer, trigger and latch are separate parts.

The fitted ready cup and hidden shoulder placement keep both paws readable and clear during aim. Inspect releases the support paw for the first turn. Reload opens the crane, raises the muzzle, punches the ejector, presents and seats the loader, withdraws it empty and presses the cylinder closed. Partial reload ejects the remaining live cartridges among the spent cases. The ejector contact follows the rod origin without inheriting cylinder spin, so it stays correct after firing. A dedicated elbow direction keeps the cylinder and falling cases visible. Loader and return-grip transitions clear the firing paw.

All 71 final carry and motion samples pass: right minimum -0.2 mm, left -0.3 mm, and paw-to-paw minimum 0.7 mm. Dense approach and loader checks cover the corrected transitions. Twenty-four additional ejection checks cover all six cylinder orientations. Real Chrome captures confirm the contacts and presentation. Thirty-one world captures cover carry, running, ground, opening, ejection, loading and closure from three cameras.

Known issues: none outstanding in the reviewed motion set.

Evidence: [before](evidence/guns/revolver-before.jpg), [model](evidence/guns/revolver-model-after.jpg), [first person](evidence/guns/revolver-motion-after.jpg), [reload](evidence/guns/revolver-reload-after.jpg), [world](evidence/guns/revolver-world-after.jpg).

## Machete

Facao has a swept blade, separate honed edge, capy stamp, brass bolster and pommel, three rivets, teal frond livery and three coloured ribbons. The ribbons hang with gravity and trail the swing. Carry exposes the back of the gripping paw; the free paw stays low and outside the blade path.

Camera-space slashes retain their intended arcs despite the carry roll. Cuts alternate sides, and every third attack uses a heavier chop within the existing damage and recovery timing. First- and third-person attacks share that presentation timing.

All 28 sampled carry, aim, sprint, inspect, slash and chop poses pass the full probe, with right-paw minimum clearance 0.5 mm. Eye and both side views were reviewed. World review covers both cuts, the chop, recovery and the ground item from front, side and three-quarter cameras. Avatar coverage checks gripping contact, free-paw clearance, alternating cuts and respawn reset.

Known issues: none outstanding in the reviewed motion set.

Evidence: [before](evidence/guns/machete-before.jpg), [model](evidence/guns/machete-model-after.jpg), [first person](evidence/guns/machete-motion-after.jpg), [world](evidence/guns/machete-world-after.jpg).

## Verification and integration

- `npx tsc --noEmit` passes. Full Vitest: 95 files, 735 tests pass. The inherited Vitest configuration uses a worktree-local cache and one worker. No Playwright e2e suite was run.
- First-person skin measurements use the full packed meshes, including both paws and visible moving parts. All accepted samples exceed the -0.5 mm threshold. The standalone fitting harness was checked against Chrome measurements; final acceptance also includes gameplay and side-view captures.
- The full probe uses a triangle hierarchy and closed-surface checks to distinguish penetration from distant inward-facing normals. Deliberate overlap remains detected. Restricted digit fitting is always followed by a full probe.
- Regression tests cover ADS alignment, empty versus tactical actions, magazine contacts, cylinder and loader relationships, live-round ejection and ejector contact after different shot counts.
- Held and ground weapons use the existing sky-reflection texture to retain readable steel edges. Near-world reload contacts follow the same parts with shorter travel toward the belt.
- All 17 committed JPEG evidence sheets are below 300,000 bytes. Full-resolution captures and numerical reports remain under ignored `output/playwright/guns-short/`.
- No arm defect was established. No arm asset or sculpt change was made.
- The supplied dependency directory is a symlink. Initial default cache paths were discovered and redirected through worktree-local configurations; no shared-cache cleanup was performed.
- No remote Git operation, publication, purchase or deployment was performed. The task's Chrome sessions and port 5178 dev server were stopped.
