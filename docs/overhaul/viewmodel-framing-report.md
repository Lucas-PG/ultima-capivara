# First-person weapon holding: re-framed from Apex and Call of Duty

1 October 2026, branch `viewmodel-framing` (from `overhaul/aaa-autonomous` at 76a3d6f), on the Linux build
machine (AMD Radeon RX 9060 XT, Google Chrome with ANGLE on GL EGL, Mesa). Brief:
`docs/overhaul/briefs/viewmodel-framing.prompt.txt`. Research: `docs/overhaul/viewmodel-research.md`.
Evidence: `docs/overhaul/evidence/viewmodel/`. Colours on this machine differ slightly from the Mac; judge
positions, angles and poses.

Two passes. The first (2e853e5) re-framed every gun from the research. The second answers the
director's review of it: the weapon size setting is gone, every forearm now runs in line with its paw
(measured and tested), the handgun support paw cups the firing paw, and the pistol sprint, the Facao's
free paw, the revolver's reload and the long inspects were fixed. "Before" is always 8cbbce0 (before
this work), "pass 1" is 2e853e5, "now" is this commit.

## 1. Summary

The user's complaint ("we're holding our guns in very weird positions") came down to three measurable
faults, the same on every long gun:

1. **The lens.** The viewmodel used 56 to 70 degree vertical lenses with the guns pulled close to fill
   them. Source's viewmodel lenses are 42 to 54 degrees vertical; a wide lens with a close gun balloons the
   near end (stock, paws, forearms) and shrinks the muzzle, so the gun reads as pointing across the screen.
2. **The angles.** The long guns were yawed about 17 degrees across the view and canted 21 to 25 degrees;
   Apex, Call of Duty and Valorant yaw 4 to 10 and cant 4 to 10.
3. **The arms.** The support shoulder sat far left, so the forearm entered from the lower-left quarter and
   crossed the lower screen; the new character forearm (12 to 13 cm across at the first-person scale)
   made that worse. Aimed, it covered 9 to 11 percent of the frame.

Pass 1 placed every weapon from a measured target composition: one 44 degree hip lens (blending back to
each gun's own lens while aiming, so the sight pictures are unchanged), the gun pointing along the view
with a small inward yaw and cant, the muzzle just right of and below the reticle, the sight right of
centre, the firing paw's back at the lower right, and a first-person forearm drawn about 20 percent
slimmer.

The director's review of pass 1 found the support paw twisted on the long guns, the handgun support paw
floating with distorted digits, and a few smaller faults; and asked for the weapon size setting to go,
since the default has to look right on its own. Pass 2:

- **No weapon size setting.** "Tamanho da arma" is removed completely; saves that still carry it load
  cleanly and drop it.
- **Natural wrists, measured.** A wrist measure (flexion and extension, radial and ulnar deviation,
  forearm rotation) for both paws, with limits from the clinical ranges of motion; a new arm solver
  places each hidden shoulder and elbow so the forearm continues the back of the paw. In pass 1, 1,895
  of 2,134 paw samples were outside the limits (the long-gun support paws bent about 130 degrees and
  turned 100 ulnar); now none is, in any sampled state, and the tests enforce it.
- **The long-gun support paw** sits lower under the rear of the fore-end, clearly below the reticle,
  its forearm short and foreshortened at the bottom edge (support arm 1.7 to 3.4 percent of the frame
  at the hip).
- **Handguns**: the support paw cups the firing paw from below and the left, in contact; the sprint
  holds the gun one-handed, low and canted so the slide's flank shows.
- **Facao**: the free paw is relaxed and open, out of frame at the hip.
- **Revolver reload and the Doze, Carabina and sniper inspects**: held further out; the biggest arm on
  screen in the revolver reload fell from 21 to 13 percent of the frame.

Every pose still passes the -0.5 mm clearance bar, nothing is cut by the near plane, and the
third-person holds (same grip data) were re-checked.

## 2. Research (summary)

Full document with sources: `docs/overhaul/viewmodel-research.md`. Measured on frames of weapon showcase
footage of Apex Legends, Black Ops 6, Modern Warfare III, Valorant, Titanfall 2, Halo Infinite and
Battlefield 6, and on the Call of Duty Wiki's first-person captures (142 stills); plus the developer
material on viewmodel lenses (Valve, Unreal, Counter-Strike 2's `viewmodel_fov` 54 to 68, Call of Duty's
Weapon Field of View setting, Halo Infinite's Weapon Offset, Destiny's combat corridor, Overwatch's GDC
talk), and for pass 2 the clinical wrist ranges of motion (AAOS; Ryu et al. 1991; Palmer et al. 1985;
Morrey et al. 1981). Third-party images and video stay on the build machine
(`~/capivara-agent/refs/research/`), none in the repository.

What the references share at the hip (16:9 screen fractions, the reticle at .5, .5):
- muzzle at x .55 to .58, y .52 to .62; sight further right, x .62 to .76, at about the same height;
- yaw 4 to 10, pitch 2 to 5, cant 4 to 10 degrees: nothing points across the screen;
- support hand under the rear of the fore-end, low (y .70 to .90), its forearm running away from the eye
  so only a short foreshortened shape shows at the bottom edge; the back of the hand continues the
  forearm, no bend or twist reads at the wrist;
- firing hand mostly hidden behind the receiver at the lower right, its back and knuckles at the edge;
- coverage: Call of Duty rifles 10 to 12 percent, Valorant 12 to 14, Apex 15 to 22, handguns 4 to 10;
- the central band around the reticle holds at most the barrel's tip and the front sight;
- handguns low in the bottom centre-right, two-handed, the support hand cupping the firing hand from
  below-left; sprinting, one-handed and canted; melee at the lower right with the blade rising diagonally
  toward the centre;
- aimed: the sight exactly on the reticle, only the rear sight, receiver and the support hand's edge
  visible, arms 3 to 6 percent.

## 3. Target composition per class

From `src/render/viewmodel-targets.ts` (the tests and the board guides read the same numbers; pass 2
moved the long-gun support paw lower):

| Class (weapons) | Muzzle | Sight | Firing grip | Support wrist | Support exit | Yaw, pitch, roll | Hip coverage | Central band |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| Handgun (pistol, revolver) | .50 to .62, .50 to .66 | .54 to .66, .48 to .66 | .52 to .72, .72 to .95 | cupping the firing paw | .30 to .66 | 0 to 6, 0 to 5, 0 to 8 | 5 to 12% | 8% |
| SMG (Canarinho) | .52 to .62, .52 to .62 | .62 to .74, .52 to .62 | .60 to .76, .74 to .92 | .50 to .66, .75 to 1 | .40 to .70 | 3 to 10, 1 to 8, 3 to 10 | 9 to 16% | 8% |
| Rifle (M4) | .52 to .60, .50 to .60 | .64 to .76, .52 to .64 | .62 to .76, .74 to .90 | .50 to .64, .72 to .90 | .40 to .66 | same | 9 to 18% | 12% |
| Shotgun (Doze) | .50 to .60, .48 to .60 | .64 to .76, .52 to .64 | .62 to .76, .74 to .90 | .50 to .64, .70 to .88 | .40 to .66 | same | 9 to 18% | 12% |
| Marksman (Carabina, sniper) | .50 to .60, .48 to .60 | .64 to .78, .52 to .66 | .62 to .76, .74 to .90 | .50 to .64, .70 to .90 | .40 to .66 | same | 9 to 18% | 14% |
| Launcher (Lanca-coco) | .50 to .62, .52 to .64 | .62 to .76, .46 to .58 | .62 to .78, .80 to 1 | .50 to .64, .75 to .95 | .40 to .66 | same | 9 to 19% | 12% |
| Melee (Facao) | tip .44 to .62, .25 to .45 | | .66 to .82, .76 to .92 | free paw relaxed, mostly out of frame | | blade diagonal | 6 to 14% | 16% |

Everywhere: the reticle itself clear at the hip; nothing within 6 cm of the eye and nothing cut by the
near plane in any sampled state; elbows bent 60 to 158 degrees; both wrists inside `WRIST_LIMITS` in
every sampled state (section 7). Aimed: the sight within 0.5 percent of the frame from the reticle, the
support arm under 6.5 percent of the frame, everything under 22.

The central band is x .35 to .65, y .25 to .58.

## 4. What changed and why

### The lens (`src/render/weapons.ts`)
- `VIEWMODEL_FOV` 58 became 44 and is now the hip lens of every gun; each gun's earlier lens is kept as
  `adsFov` and the lens blends to it by the aim amount, so every sight picture, the M4 zoom, the scope
  contract and the aimed tests are exactly as before.
- Pass 2 removed the "Tamanho da arma" setting (`weaponSize`, `WEAPON_SIZE_RANGE`, the sliders in the
  settings screen and the pause menu's quick settings, the hip lens scaling, its tests and its evidence
  images). `src/controls.ts`, `src/shared/types.ts` and `src/ui/ui.ts` are back to their 76a3d6f
  state. A saved `weaponSize` is ignored on load and absent after the next save (tested).

### The hip framing (`src/render/viewmodel-specs.ts`)
Each gun was placed from its target: its sight socket put at a chosen screen point and depth for chosen
angles, then tuned from the eye and both sides. Pass 2 lowered the long guns about 2 cm, so the support
paw sits low under the fore-end, and raised the handguns 2 cm, so the slide sits just under the reticle
and the cupping paw shows above the bottom edge.

| Weapon | Hip position (m) | Pitch, yaw, roll (rad) | Sight on screen (now) |
| --- | --- | --- | --- |
| Pistol | .056, -.085, -.393 | .035, .052, .07 | .60, .52 |
| Revolver | .059, -.10, -.422 | .035, .052, .07 | .60, .52 |
| SMG | .134, -.145, -.517 | .087, .122, .122 | .69, .57 |
| M4 | .157, -.167, -.589 | .105, .14, .14 | .70, .62 |
| Doze | .155, -.156, -.537 | .052, .122, .14 | .70, .61 |
| Carabina | .171, -.193, -.669 | .07, .14, .14 | .71, .60 |
| Sniper | .19, -.195, -.69 | .044, .122, .14 | .73, .61 |
| Lanca-coco | .188, -.255, -.669 | .087, .14, .14 | .71, .54 (hopper below the sight line) |
| Facao | .207, -.17, -.60 | .599, .419, 2.281 | grip .74, .85; tip .48, .37 |

Per-weapon data: `adsFov`; `shoulders` and `poles` (the hidden shoulders and elbow directions at the
hip) and `adsShoulders` and `adsPoles` (blended in while aiming), all solved in pass 2 with
`tools/qa/vm-arm-solve.mts` so the forearm continues its paw; `reloadShoulders` (blended in while
reloading, where a reload's reaches need the arm from elsewhere: Lanca-coco, revolver, SMG);
`choreoFrame`, `armRide`, `freePaw` (with its digit curl), `sprintFree` (the handguns' free support paw
while sprinting) and `natural` (per arm, whether the arm solver below runs; off only for the Facao's
blade arm, which rides rigidly with the blade). `framedGrips()` applies the first-person poles.

### The arms (`src/render/fp-arms.ts`)
- **The natural-arm solver** (pass 2). The two-bone IK places the paw exactly where its grip or key
  says; what it is free to choose is the hidden shoulder and the elbow direction, and those decide the
  forearm's line into the paw. With the targets' shoulders that line met the paw at up to 130 degrees
  of wrist bend. Now `Arm.solve` checks the wrist each frame (`wristAngles`, section 7) and, when the
  authored arm is outside `WRIST_SOLVE` (the limits less a margin), moves the shoulder and elbow: it
  turns the forearm direction until the paw meets it within the margins (10 iterations, the elbow bent
  45 to 158 degrees so the IK's reach clamp never changes the result), tries the forearm rotations and
  shoulder positions around it, and keeps the candidate with the least wrist strain whose elbow and upper
  arm stay out of the frame (a frustum test with the arm's 7 cm radius; a visible elbow costs, an upper
  arm much more, anything near the eye most). Strain past the hard limits outweighs a visible upper arm.
  When the authored arm is already natural it is kept as is, so authored reload arms do not move.
- `slimForearm()` (pass 1) draws the first-person forearm toward its bone axis at load: target skin
  radius 52 mm just below the elbow to 47 mm before the wrist (the character's is 60 to 65), the section
  shape and taper kept, the wrist, paw and digits untouched. Normals, maps, the fur pelt and its shells
  follow. No Blender rebuild.

### The grips (`src/render/fp-grips.json`, shared with the third person)
The support (left) grips of the pistol, revolver, M4, Doze, Carabina, sniper and Lanca-coco were refit
with the grip fitter (`tools/qa/grip-fit.mjs`, new intent terms: `wristLimits`, the solved `shoulders`,
`withPaw` for the other paw as a solid and `hiddenArm`):
- **Long guns**: the paw under the rear of the fore-end (the Doze's and Lanca-coco's on their pumps),
  palm up and to the left, thumb along the left flank pointing forward, digits curling round the far
  side, the back of the paw in line with a forearm that runs down and away from the eye.
- **Pistol and revolver**: the support paw cups the firing paw from below and the left, its palm under
  the firing paw's digits and its thumb along the frame, fitted against the firing paw as a solid
  (touching, no overlap); its digits in an even, moderate curl (no bulbous or pinched joints).
- The firing (right) grips and the Facao's are unchanged; the SMG's foregrip hold already met the limits
  once its arm was re-solved.

### Motion and choreography (`src/render/weapons.ts`, `src/render/viewmodel-anims.ts`)
- **Camera-space keys follow the gun** (pass 1). Reload and inspect keys authored in camera space move
  rigidly from the old hip (`choreoFrame`) to the new one.
- **Shoulders ride with a lowered gun.** Draw and holster drop the whole gun; the hidden shoulders ride
  with it. Pass 2: once the gun is low (smoothstep from 35 to 80 percent lowered), the arms ride rigidly
  with it, so a draw no longer folds a paw into the gun.
- **The blade's arm moves with the blade** (`armRide: 1`), and the Facao's ribbons rest tilted off the
  riding forearm.
- **Support releases** (pass 2): on the long guns the support paw releases and clears down under the
  fore-end instead of sideways (`SUPPORT_RELEASE`, `SUPPORT_CLEAR`, the Carabina's `DMR_CLEAR`, the
  SMG's `SMG_CLEAR`), which kept the wrist natural through the magazine swaps; the M4's seat reach gained
  a waypoint.
- **Revolver reload** (pass 2): the whole reload is held 10 to 15 cm further out with less tilt at the
  crane and ejector beats, the loader path and the return key moved so the support arm works from below
  and left (`reloadShoulders`).
- **Long inspects** (pass 2): the M4, Doze, Carabina, sniper and Lanca-coco inspects are held 3 to 6 cm
  further out and a little lower.
- **Doze shell loading** (pass 2): the shell hold and the thumb push were refit along the push stroke
  (two keys, `SHOTGUN_PUSH_START` and `SHOTGUN_PUSH_HAND`, plus shifted in-between keys), and the
  loading-port roll during the reload was reduced so the loading paw works from below.
- **Handgun sprint** (pass 2): one-handed; the support paw drops to a relaxed pose low at the left
  (`sprintFree`) and the gun is lowered and canted inward, muzzle forward-down, so the slide shows its
  flank instead of its edge.
- Sprint, walk, strafe, crouch, jump and land, recoil and draw amplitudes were kept (they are additive
  on the hip and already match the research ranges).

### Per weapon
- **M4, Doze, Carabina, sniper, Lanca-coco**: the rifle composition (muzzle .54 to .56, .54 to .60,
  sight .70 to .73), the support paw low under the rear of the fore-end at x .57 to .59, y .75 to .88,
  its forearm leaving the bottom edge at .50 to .62; aimed, the support arm 1.8 to 5.9 percent.
- **SMG**: the short rifle composition with the support paw on the vertical foregrip at the bottom
  centre-right; its aimed and reload arms re-solved (`adsShoulders`, `adsPoles`, `reloadShoulders`).
- **Pistol, revolver**: two-handed, low in the bottom centre-right, nearly straight (yaw 3, cant 4), the
  support paw cupping the firing paw; one-handed and canted at the sprint.
- **Facao**: the blade rises diagonally from the lower right toward the reticle's upper right with its
  flat and the back of the gripping paw toward the eye; the free paw rests relaxed and open low at the
  lower left, out of frame at the hip (it was a closed lump in frame in pass 1).

### Anatomy rules kept
The paw-on-gun rules stand: the support paw holds the fore-end from below and the left (thumb along the
side pointing forward, digits curling under and round), the firing paw shows its back with the index on
the trigger, the handguns are two-handed with a cupping support paw, and every reload contact still
follows its part. The support grips moved (above); the firing grips did not.

### The third person
The third-person holds read the same grips (`TP_WEAPON_SCALE` 1.3) and are checked from two angles in
`third-person-long-guns.jpg`, `third-person-coco-handguns.jpg` and `third-person-close.jpg`: the long-gun
support paws under the fore-end with the forearm below it, the handgun cups under the firing paw. The
first-person shoulders, poles and the arm solver are first-person only.

## 5. Evidence

`docs/overhaul/evidence/viewmodel/`: one board per weapon and resolution (`<weapon>-1280x720.jpg`,
`<weapon>-1470x956.jpg`), each state as before | pass 1 | now from the same camera, with the HUD on:
hip, aimed, sprint, walk, strafe, crouch, landing, holster, draw, firing, four reload or action keys per
weapon (empty and tactical magazine swaps, the slide stop and charging handles, the revolver crane,
ejector, speedloader and close, the shotgun shell loading and push, the bolt cycle, the coconut lift,
drop, pump and top-up, the machete slashes and chop), two inspect beats, and the hip grip from both
sides. The hip tiles carry the target composition as guides (muzzle, sight, firing and support paw
boxes, the support forearm's exit span on the bottom edge, the central band). Before captures come from
8cbbce0 and pass 1 from 2e853e5, with the same capture tool (`tools/qa/vm-evidence.mjs`,
`vm-evidence-board.mjs`).

Also: the three third-person images (section 4), `framing.json` (the measured composition before, pass 1
and now, hip and aimed with both wrists, plus every-state summaries with the worst wrist per arm) and
`clearance.json` (every sampled pose, both paws and paw against paw).

Every weapon was also judged from the eye at 1470 x 956 beside reference frames of the same class and
state (Apex, Call of Duty, Valorant) on a private board kept on the build machine, never in the
repository.

## 6. Measured before, pass 1 and now

`src/render/viewmodel-frame.ts` measured on the live viewmodel at 1280 x 720 (`tools/qa/vm-frame.mjs`).
Coverage is the weapon and both arms; support wrist is the support paw's wrist on screen (handguns:
below the bottom edge, under the cupped firing paw); support exit is where the support forearm leaves
the bottom edge. Each cell is before / pass 1 / now.

| Weapon | Hip coverage % | Central band % | Muzzle | Support wrist | Support exit | Aimed support arm % | Aimed coverage % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pistol | 11.3 / 9.9 / 9.2 | 5.1 / 0.6 / 5.9 | .58, .54 / .55, .61 / .55, .56 | .61, .86 / .50, 1.14 / .49, 1.15 | .49 to .68 / .38 to .57 / .45 to .62 | 5.8 / 5.6 / 3.9 | 11.0 / 10.8 / 8.4 |
| Revolver | 10.0 / 8.6 / 8.1 | 7.3 / 0.6 / 6.1 | .55, .53 / .54, .59 / .54, .55 | .57, .82 / .51, 1.10 / .50, 1.14 | .46 to .64 / .42 to .58 / .47 to .62 | 5.2 / 5.0 / 3.4 | 10.0 / 10.0 / 7.7 |
| SMG | 13.6 / 13.4 / 13.4 | 3.1 / 2.8 / 2.8 | .56, .57 / .58, .58 / .58, .58 | .56, .79 / .57, .91 / .57, .91 | .40 to .56 / .52 to .62 / .52 to .63 | 3.9 / 3.9 / 3.8 | 9.1 / 9.0 / 8.9 |
| M4 | 23.3 / 16.8 / 12.8 | 14.7 / 9.1 / 2.8 | .49, .51 / .55, .53 / .55, .55 | .50, .58 / .53, .59 / .58, .81 | .16 to .38 / .42 to .53 / .51 to .60 | 11.0 / 5.4 / 5.9 | 17.8 / 11.2 / 10.5 |
| Doze | 19.2 / 14.5 / 11.7 | 11.7 / 7.2 / 3.4 | .50, .52 / .54, .52 / .54, .54 | .54, .64 / .53, .67 / .57, .79 | .26 to .45 / .45 to .53 / .50 to .60 | 9.2 / 4.7 / 4.6 | 16.1 / 10.9 / 10.3 |
| Carabina | 24.4 / 13.5 / 10.7 | 22.1 / 10.2 / 6.0 | .49, .53 / .54, .55 / .54, .57 | .52, .58 / .52, .61 / .57, .75 | .22 to .42 / .43 to .53 / .51 to .59 | 11.4 / 5.5 / 4.1 | 22.4 / 16.5 / 14.8 |
| Sniper | 24.0 / 14.2 / 11.6 | 25.3 / 11.9 / 9.7 | .47, .52 / .54, .55 / .54, .57 | .54, .63 / .55, .67 / .59, .82 | .25 to .44 / .48 to .56 / .52 to .60 | 11.3 / 5.2 / 4.7 | 26.7 / 20.4 / 19.2 |
| Lanca-coco | 26.3 / 14.7 / 14.0 | 25.1 / 5.5 / 5.5 | .52, .50 / .56, .60 / .56, .60 | .54, .67 / .54, .81 / .59, .88 | .28 to .45 / .50 to .56 / .55 to .62 | 4.1 / 2.5 / 1.8 | 14.2 / 12.4 / 11.7 |
| Facao | 10.9 / 12.5 / 7.4 | 15.0 / 15.3 / 15.3 | tip .40, .26 / .48, .36 / .48, .36 | free paw .23, .95 / .17, .98 / .06, 1.39 | free paw .13 to .28 / .07 to .25 / out of frame | (no aim) | (no aim) |

The long guns now cover 10.7 to 14.0 percent (Call of Duty 10 to 12, Valorant 12 to 14), point along
the view (yaw 7 to 8, cant 7 to 8), and the support paw sits 0.25 to 0.38 of the frame below the
reticle, where pass 1 had it 0.09 to 0.31 below; its forearm leaves the bottom edge just right of
centre. The central band over the long guns dropped to 2.8 to 9.7 percent. The handguns rose a little
(slide just under the reticle, central band 6 percent, under the 8 percent limit) so the cup shows.

Every state (`framing.json`, 1,067 samples: hip, aimed and the aim transition, sprint, inspect every
0.1 s, draw every 0.05 s, fire, every reload every 0.05 s, the shell chain, the machete cuts and chop):
the closest visible surface is 8.2 cm from the eye (the M4 aimed) and nothing is cut open by the near
plane. In the revolver reload the biggest arm on screen fell from 21.2 to 13.0 percent of the frame (the
crane and ejector beats from 14.2 to 7.2), and in the inspects from 5.3 to 8.0 percent to 4.2 to 5.8
(total coverage at the worst inspect beat: M4 25.6 to 13.6, Carabina 24.1 to 18.5, Doze 18.4 to 13.4,
sniper 13.6 to 10.8, Lanca-coco 18.6 to 11.8).

## 7. Wrists

**Measure** (`wristAngles` in `src/render/fp-arms.ts`, `measureWrists` in `viewmodel-frame.ts`). From
the posed shoulder, elbow and wrist and the paw's frame (the hand bone: digits forward, palm down in its
rest), in degrees:
- *flexion* (positive toward the palm) and extension (negative): the angle between the forearm and the
  back of the paw in the plane through the forearm and the palm's normal;
- *deviation*, radial (positive, toward the thumb) and ulnar (negative): the same angle in the plane of
  the palm;
- *pronation* (positive, palm turning down) and supination (negative): the paw's turn about the forearm
  from the neutral where the palm faces the body's midline (a handshake), referenced to the plane of the
  shoulder, elbow and wrist.

**Limits** (`WRIST_LIMITS` in `src/render/viewmodel-targets.ts`, the tests read them):
- flexion and extension within 45 degrees each;
- ulnar deviation within 25, radial within 20;
- pronation and supination within 80 each.

Justification: the normal range of motion (AAOS) is 80 flexion, 70 extension, 20 radial and 30 ulnar
deviation, and 80 each of pronation and supination. The functional range of daily tasks is far smaller:
40 flexion to 40 extension and 10 radial to 30 ulnar (Ryu et al. 1991), and Palmer et al. (1985) found
5 flexion to 30 extension, 10 radial to 15 ulnar. A hold that reads relaxed stays inside the functional
range, so the bend limits sit at it (45 allows 5 degrees for the stylized paw and the reading of a
fur-covered wrist; ulnar 25 is inside Ryu's 30; radial 20 is the anatomical end, kept because a cupping
paw tips toward the thumb and the solver holds it under 16). Forearm rotation keeps the anatomical
80: a fore-end held from below needs strong supination, beyond the 50 of daily tasks (Morrey et al.
1981), and rotation shows on screen only as the paw's facing, never as a kink at the wrist. The arm
solver aims inside `WRIST_SOLVE` (flexion 40, deviation -21 to 16, rotation 74), so measured poses keep
a margin.

**Worst value per weapon** over every sampled state (`framing.json`; flexion, deviation, rotation; the
largest magnitude of each, which may come from different states), pass 1 against now. "Outside" counts
the states with any of the three past the limits.

| Weapon | States | Firing paw, pass 1 | Firing paw, now | Support or free paw, pass 1 | Support or free paw, now | Outside, pass 1 (R / L) | Outside, now |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Pistol | 103 | 150, -92, -45 | -34, -16, 74 | 140, -115, 179 | 40, -21, -74 | 103 / 103 | 0 / 0 |
| Revolver | 116 | 148, -93, -52 | 30, -17, 56 | 140, -119, -174 | 40, -21, -74 | 110 / 91 | 0 / 0 |
| SMG | 109 | -37, -89, 111 | -40, -21, 74 | 140, -119, 179 | 40, -21, -74 | 109 / 108 | 0 / 0 |
| M4 | 124 | -50, -86, -69 | 40, -21, 49 | 150, -125, -162 | -40, -21, 74 | 82 / 91 | 0 / 0 |
| Doze | 123 | 134, -100, -121 | -32, -21, 57 | -180, -119, -172 | -40, -21, 74 | 123 / 123 | 0 / 0 |
| Carabina | 127 | -49, -86, -80 | 33, -21, 49 | 161, -175, -102 | 40, -21, 74 | 118 / 111 | 0 / 0 |
| Sniper | 160 | 51, -87, -96 | -28, -21, 49 | 158, -159, -103 | -40, -21, 74 | 151 / 145 | 0 / 0 |
| Lanca-coco | 131 | -43, -86, -63 | 29, -21, 49 | 159, -119, -125 | -40, -21, 74 | 53 / 126 | 0 / 0 |
| Facao | 74 | -31, -86, -107 | 18, -21, -74 | 140, -119, 37 | -23, -21, -43 | 74 / 74 | 0 / 0 |

At the hip, now: the gun paws straight (the Doze's 10 extension and 21 ulnar the most), rotation -6 to
49 (the pistol's 49 is a pistol grip's natural pronation); the Facao's blade paw 21 ulnar and turned 74
so the blade's flat faces the eye; long-gun support paws extended 30 to 40 with 18 to 21 ulnar deviation
(the paw tipped up under the fore-end, as in the references), the SMG's foregrip paw 38 extension and 10
ulnar; handgun cups 0 to 10 extension, straight. The worst values sit at the solver's margins, inside
the limits: in reload and inspect reaches, and aimed for the handgun and SMG support paws (40 extension
and 21 ulnar, the paw tipped down under the raised gun).

## 8. Clearances

Worst signed skin clearance of each paw (and the wrist end of the forearm) to the gun over every sampled
pose, millimetres, negative inside (`tools/qa/fp-clearance.mjs`, full vertex; `clearance.json`, 1,244
samples). The bar is -0.5 mm; every weapon passes in every sample.

| Weapon | Samples | Firing paw worst (now) | Support or free paw worst (now) | Pass 1 (firing / support) |
| --- | ---: | --- | --- | --- |
| Pistol | 122 | 1.8 (reload 0.3 s, hand) | 0.1 (hip, index) | 1.8 / 0.6 |
| Revolver | 140 | 0.3 (hip, index tip) | -0.1 (hip, index tip) | 0.3 / -0.4 |
| SMG | 130 | 2.4 (hip, middle tip) | -0.4 (hip, forearm at the wrist) | 2.4 / -0.5 |
| M4 | 150 | 0.3 (hip, hand) | 0.2 (reload 2.15 s, hand) | 0.3 / 0.6 |
| Doze | 123 | -0.2 (hip, index tip) | 1.2 (reload 0.2 s, thumb tip) | -0.2 / 0.1 |
| Carabina | 154 | -0.5 (reload 2.15 s, middle tip) | 2.4 (hip, thumb tip) | -0.5 / 0.9 |
| Sniper | 191 | -0.5 (fire 0.25 s, middle tip) | 0.9 (tactical reload 0.25 s, hand) | -0.5 / 2.5 |
| Lanca-coco | 160 | 1.1 (hip, thumb tip) | 0.1 (tactical reload 1.85 s, ring tip) | 1.1 / -0.4 |
| Facao | 74 | -0.5 (slash 0.25 s, forearm by the ribbons) | free paw: no gun surface within 3 cm | -0.1 / free |

Paw against paw: every weapon is clear except the pistol's magazine seat (section 12), unchanged from
before. The handgun cup rests 1.0 mm (pistol) and 1.4 mm (revolver) from the firing paw at the hip,
aimed and firing: touching to the eye, never inside it.

Re-placing the arms broke clearances that were fixed in this pass: the handguns' sprint (the support paw
crossed the firing paw: now one-handed), the SMG's aimed forearm in the magazine and its reload reaches
(aimed and reload shoulders), the M4 and sniper release digits in the gun (release offsets), the
revolver's loader and return paths, the Doze's shell push and its inspect (refit along the stroke, its
firing shoulder), draw-time overlaps (the rigid ride when low) and the Facao's ribbons (their tilt).
Reviewed from the eye and both sides in every board and from orbits around the paws
(`tools/qa/vm-pose-views.mjs`, `vm-try.mjs`).

## 9. Tests

- `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=5`: 116 files, 1,088 tests pass; `npm run build`
  passes (its existing chunk-size warning is unchanged).
- `tests/viewmodel-framing.test.ts` (29 tests, real weapon and arm assets through the real
  `WeaponView`): every weapon's muzzle, sight, firing grip and support wrist inside its target boxes at
  the hip (the lower long-gun support box included); yaw, pitch and roll; hip coverage; the central band
  and the reticle itself clear; the support forearm leaving through the bottom edge inside its span;
  no near-plane cut, nothing within 6 cm, elbows 60 to 158 degrees; the long guns pointing along the
  view; the same framing at 1470 x 956; aimed: the sight within 0.5 percent of the reticle, no yaw or
  cant, the support arm under 6.5 percent. New in pass 2, **every sampled state** per weapon (hip, the
  aim and un-aim blends, walk, strafe, crouch, fire, sprint, inspect, holster, draw, the empty and the
  tactical reload, every 0.05 to 0.1 s): no near-plane cut, nothing within 6 cm, and both wrists inside
  `WRIST_LIMITS` (to 0.5 degree). The weapon size tests are gone.
- `tests/input.test.ts`: back to its 76a3d6f state plus "retired settings": a save carrying
  `weaponSize: 1.2` loads with its other values, and the key is gone after saving.
- `tests/paw-asset.test.ts` (pass 1): the slimmed forearm's girth, the digits and wrist untouched.
- `tests/viewmodel.test.ts` (pass 1): the SMG far-side inspect expects its free key carried with the gun.

## 10. Files touched outside the viewmodel

- `src/controls.ts`, `src/shared/types.ts`, `src/ui/ui.ts`: the pass 1 setting removed; identical to
  76a3d6f.
- `src/render/fp-grips.json`: the support grips of seven weapons (section 4); shared with the third
  person, which was re-checked.
- `tools/qa/*.mjs`: the ANGLE backend chosen by platform (Metal on macOS as before, GL EGL on Linux) in
  every QA tool except the performance tools; viewmodel tools `vm-frame`, `vm-try`, `vm-variants`,
  `vm-board`, `vm-evidence`, `vm-evidence-board`, `vm-clear-try`, `vm-guides`, and in pass 2
  `vm-arm-solve.mts` (solves shoulders and poles for a natural wrist), `vm-pose-views.mjs` (orbits around
  a paw) and the new `grip-fit.mjs` intent terms.
- Not touched: `src/render/pipeline.ts`, `src/render/renderer.ts`, `src/render/resolution.ts`,
  `tests/visual/qa-hook.ts` and the performance tools (the performance agent's files),
  `src/render/capybara.ts`, the weapon and arm assets. No Blender rebuild.
- DEV-only hooks in `src/render/weapons.ts` (stripped from production builds): `__vmMeasure`,
  `__vmWrists`, `__vmWristAngles` and `__vmActor`.

## 11. Decisions made without review

- One hip lens for every gun (44 degrees vertical) rather than per-gun hip lenses; the aimed lens keeps
  each gun's earlier value so no sight picture or scope behaviour changes.
- The coverage band for long guns now starts at 9 percent (was 11): the lower support paw and its
  foreshortened forearm take less screen, which matches Call of Duty's 10 to 12.
- Wrist limits at the functional range of motion rather than the anatomical end range (section 7), with
  forearm rotation at the anatomical 80 for the reasons given there.
- The arm solver runs at every frame on the hidden shoulder and elbow only; paws stay exactly on their
  grips and keys, and arms that already meet the limits are untouched.
- The handguns sprint one-handed (the brief asked to lower and cant the pistol; two paws crossed at that
  cant, and the references sprint one-handed).
- The Facao's free paw is out of frame at the hip (the brief allowed relaxed and open or mostly out of
  frame; it is both: open digits, out of view, so a draw or cut that shows it shows an open paw).
- The forearm slimming stays a load-time edit of the skinned mesh rather than a Blender rebuild.
- The first-person support grips were refit in the shared grip data rather than first-person copies, so
  the third person gets the same natural holds; the third-person views were checked and kept.

## 12. Known issues

- Pistol reload, paw against paw: while the support paw seats the magazine at the bottom of the grip,
  the two paws overlap up to 30.1 mm (14 samples, 1.1 to 1.3 s of the empty reload and 0.2 to 0.35 s and
  1.1 to 1.3 s of the tactical one), as before this work. It lives in the authored magazine-seat contact,
  not the framing; paw to gun stays clear. Left for a reload refit.
- Some reload reaches still show an elbow or a cuff at the frame edge for a few frames (the solver
  prefers a hidden arm but never at the cost of a wrist past the limits).
- `tools/qa/vm-frame.mjs` and `fp-clearance.mjs` sample the Facao's draw through the QA hook's `equip`
  motion, which draws the pistol for it; the Facao's own draw is checked on its boards and by the
  framing tests (which draw it through the real `WeaponView`).
- The visual baselines of the first-person poses (`tests/visual/baselines/`, not in the repository)
  change and need regenerating on the Mac.
- Measurements of the references are by eye on a grid (+/- 0.02 of the frame, +/- 3 degrees); the games
  ran at their own field of view settings.
- Colours were judged on Mesa here; the orchestrator's Mac check covers colour.
- `tools/qa/grip-fit.mjs` and `grip-fit-short.mjs` remain duplicated (from earlier passes).
