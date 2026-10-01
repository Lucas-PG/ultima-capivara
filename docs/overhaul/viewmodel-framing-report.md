# First-person weapon holding: re-framed from Apex and Call of Duty

1 October 2026, branch `viewmodel-framing` (from `overhaul/aaa-autonomous` at 76a3d6f), on the Linux build
machine (AMD Radeon RX 9060 XT, Google Chrome with ANGLE on GL EGL, Mesa). Brief:
`docs/overhaul/briefs/viewmodel-framing.prompt.txt`. Research: `docs/overhaul/viewmodel-research.md`.
Evidence: `docs/overhaul/evidence/viewmodel/`. Colours on this machine differ slightly from the Mac; judge
positions, angles and poses.

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

Now every weapon is placed from a measured target composition: one 44 degree hip lens (blending back
to each gun's own lens while aiming, so the sight pictures are unchanged), the gun pointing along the
view with a small inward yaw and cant, the muzzle just right of and below the reticle, the sight right
of centre, the support paw on the fore-end just right of centre with its forearm rising almost
vertically from the bottom edge, the firing paw's back at the lower right. The first-person forearm is
drawn about 20 percent slimmer (fur, colours, paw and the rolled linen cuff unchanged). A "Tamanho da
arma" setting scales the hip lens from 80 to 120 percent. Every pose passes the -0.5 mm clearance bar.

## 2. Research (summary)

Full document with sources: `docs/overhaul/viewmodel-research.md`. Measured on frames of weapon showcase
footage of Apex Legends, Black Ops 6, Modern Warfare III, Valorant, Titanfall 2, Halo Infinite and
Battlefield 6, and on the Call of Duty Wiki's first-person captures (142 stills); plus the developer
material on viewmodel lenses (Valve, Unreal, Counter-Strike 2's `viewmodel_fov` 54 to 68, Call of Duty's
Weapon Field of View setting, Halo Infinite's Weapon Offset, Destiny's combat corridor, Overwatch's GDC
talk). Third-party images and video stay on the build machine (`~/capivara-agent/refs/research/`), none in
the repository.

What the references share at the hip (16:9 screen fractions, the reticle at .5, .5):
- muzzle at x .55 to .58, y .52 to .62; sight further right, x .62 to .76, at about the same height;
- yaw 4 to 10, pitch 2 to 5, cant 4 to 10 degrees: nothing points across the screen;
- support hand on the fore-end at x .50 to .62, forearm nearly vertical to the bottom edge;
- firing hand mostly hidden behind the receiver at the lower right, its back and knuckles at the edge;
- coverage: Call of Duty rifles 10 to 12 percent, Valorant 12 to 14, Apex 15 to 22, handguns 4 to 10;
- the central band around the reticle holds at most the barrel's tip and the front sight;
- handguns low in the bottom centre-right, two-handed, nearly straight; melee at the lower right with
  the blade rising diagonally toward the centre and the free hand open at the lower left;
- aimed: the sight exactly on the reticle, only the rear sight, receiver and the support hand's edge
  visible, arms 3 to 6 percent.

## 3. Target composition per class

From `src/render/viewmodel-targets.ts` (the tests and the board guides read the same numbers):

| Class (weapons) | Muzzle | Sight | Firing grip | Support wrist | Support exit | Yaw, pitch, roll | Hip coverage | Central band |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| Handgun (pistol, revolver) | .50 to .62, .52 to .66 | .54 to .66, .52 to .66 | .52 to .72, .72 to .95 | under the firing paw | .30 to .62 | 0 to 6, 0 to 5, 0 to 8 | 5 to 12% | 4% |
| SMG (Canarinho) | .52 to .62, .52 to .62 | .62 to .74, .52 to .62 | .60 to .76, .74 to .92 | .50 to .66, .75 to 1 | .40 to .70 | 3 to 10, 1 to 8, 3 to 10 | 9 to 16% | 8% |
| Rifle (M4) | .52 to .60, .50 to .60 | .64 to .76, .52 to .62 | .62 to .76, .74 to .90 | .46 to .58, .55 to .68 | .36 to .60 | same | 11 to 18% | 12% |
| Shotgun (Doze) | .50 to .60, .48 to .60 | .64 to .76, .52 to .62 | .62 to .76, .74 to .90 | .46 to .60, .58 to .72 | .36 to .60 | same | 11 to 18% | 12% |
| Marksman (Carabina, sniper) | .50 to .60, .48 to .60 | .64 to .78, .50 to .60 | .62 to .76, .74 to .90 | .46 to .60, .55 to .70 | .36 to .60 | same | 11 to 18% | 14% |
| Launcher (Lanca-coco) | .50 to .62, .52 to .64 | .62 to .76, .46 to .58 | .62 to .78, .80 to 1 | .48 to .62, .70 to .90 | .40 to .62 | same | 11 to 19% | 12% |
| Melee (Facao) | tip .44 to .62, .25 to .45 | | .66 to .82, .76 to .92 | free paw lower left | | blade diagonal | 6 to 14% | 16% |

Everywhere: the reticle itself clear at the hip; nothing within 6 cm of the eye and nothing cut by the
near plane in any sampled state; elbows bent 60 to 158 degrees. Aimed: the sight within 0.5 percent of
the frame from the reticle, the support arm under 6.5 percent of the frame, everything under 22.

The central band is x .35 to .65, y .25 to .58.

## 4. What changed and why

### The lens and the setting (`src/render/weapons.ts`)
- `VIEWMODEL_FOV` 58 became 44 and is now the hip lens of every gun; each gun's earlier lens is kept as
  `adsFov` and the lens blends to it by the aim amount, so every sight picture, the M4 zoom, the scope
  contract and the aimed tests are exactly as before.
- "Tamanho da arma" (`weaponSize`, 0.8 to 1.2, default 1.0) scales the hip lens's tangent; it fades out
  while aiming (scaled about the screen centre, where the sight sits, so aiming is identical at every
  size). It lives in the controls model (`src/controls.ts`, `WEAPON_SIZE_RANGE`, flagged as a view
  option), is shown under "NA SUA MÃO" next to "Campo de visão" in the settings screen and in the pause
  menu's quick settings, saved with the other settings and sanitised on load.

### The hip framing (`src/render/viewmodel-specs.ts`)
Each gun was placed from its target: its sight socket put at a chosen screen point and depth for chosen
angles, the hidden shoulders derived from the grips so each forearm rises from the bottom edge with a
bent elbow, then tuned from the eye and both sides (tools below).

| Weapon | Hip position (m) | Pitch, yaw, roll (rad) | Sight on screen, depth |
| --- | --- | --- | --- |
| Pistol | .056, -.107, -.393 | .035, .052, .07 | .60, .60 at .36 m |
| Revolver | .059, -.124, -.422 | .035, .052, .07 | .60, .60 at .38 m |
| SMG | .134, -.145, -.517 | .087, .122, .122 | .69, .575 at .46 m |
| M4 | .157, -.143, -.589 | .105, .14, .14 | .70, .56 at .52 m |
| Doze | .155, -.136, -.537 | .052, .122, .14 | .70, .565 at .50 m |
| Carabina | .171, -.169, -.669 | .07, .14, .14 | .71, .545 at .55 m |
| Sniper | .19, -.173, -.69 | .044, .122, .14 | .73, .565 at .56 m |
| Lanca-coco | .188, -.255, -.669 | .087, .14, .14 | .71, .545 at .56 m (hopper below the sight line) |
| Facao | .207, -.17, -.60 | .599, .419, 2.281 | grip .74, .85; tip .52, .33 |

New per-weapon data: `adsFov`, `shoulders` (hip) and `adsShoulders` (blended in while aiming, so the
support forearm hangs under the gun aimed instead of sweeping across the lower left), `poles`
(first-person elbow directions; the shared grip data keeps its own for the third person), `choreoFrame`,
`reloadShoulders`, `armRide` and `freePaw` (below). `framedGrips()` applies the first-person poles.

### The arms (`src/render/fp-arms.ts`)
- `slimForearm()` draws the first-person forearm toward its bone axis at load: target skin radius 52 mm
  just below the elbow to 47 mm before the wrist (the character's is 60 to 65), the section shape and
  taper kept, the wrist, paw and digits untouched, the cuff and upper arm scaled with the forearm below
  the cuff. Normals, maps, the fur pelt and its shells follow (the shells are built from the slimmed
  skin). Research basis: Valve and Unreal both cheat first-person geometry for the one camera; a human
  forearm is 7 to 9 cm across, the capybara's was 12 to 13 at this scale. No Blender rebuild was needed.

### Motion and choreography (`src/render/weapons.ts`, `viewmodel-anims.ts` unchanged)
- **Camera-space keys follow the gun.** Reload and inspect keys in camera space ('view') were authored
  against the old hip; they now move rigidly from that hip (`choreoFrame`) to the new one, so they keep
  their place around the gun (they were landing inside the SMG during its inspect).
- **Shoulders ride with a lowered gun.** Draw and holster drop and pitch the whole gun; the hidden
  shoulders and elbow directions now ride with it, so the forearms keep their hold (the SMG support
  forearm went 6 mm into the gun during the draw).
- **The blade's arm moves with the blade.** The Facao's firing arm rides rigidly with the blade through
  carry, cuts, the chop and the inspect (`armRide: 1`), as a one-handed weapon does; the forearm stayed
  2 to 6 mm inside the pommel otherwise.
- **Reload shoulders.** The Lanca-coco's coconut lifts reach over the tube to the hopper on its right, so
  its support arm comes from the left while reloading (`reloadShoulders`, blended in and out).
- **Machete cuts on screen.** The backhand and the chop travel toward the right; in first person their
  arcs are carried left (and the chop a little higher) so they stay on screen.
- Sprint, walk, strafe, crouch, jump and land, recoil, draw and inspect amplitudes were kept: they are
  additive on the new hip and already match the research ranges (section 6 of the research); they were
  re-checked on the new framing in the evidence.

### Per weapon
- **M4**: from 23.3 percent of the screen with the barrel across the view (yaw 18, cant 21) and the
  support forearm entering at the lower-left quarter, to the rifle composition: muzzle .55, .53, sight
  .70, .56, yaw 8, cant 7, support wrist .53, .59 with its forearm leaving the bottom at .42 to .53.
- **Doze, Carabina, sniper**: the same composition; the sniper sits a little further right so its
  scope leaves the central band; the Doze's pump paw is the support point.
- **Lanca-coco**: lower, so its front ladder leaf stays off the reticle; the hopper sits right of and
  below the sight line.
- **SMG**: the short rifle composition with the support paw on the vertical foregrip low at the bottom
  centre-right.
- **Pistol, revolver**: two-handed, low in the bottom centre-right, nearly straight (yaw 3, cant 4), the
  slide or rib just right of and below the reticle, both paws at the bottom; the support paw still cups
  the firing paw from below-left.
- **Facao**: the blade rises diagonally from the lower right toward the reticle's upper right with its
  flat and the back of the gripping paw toward the eye, and the free paw is now open at the lower left
  (Valorant's and Call of Duty's knife framing) instead of out of frame.

### Anatomy rules kept
The paw-on-gun grips (`src/render/fp-grips.json`) are unchanged, byte for byte: the support paw wraps
the fore-end from the lower left (palm on the side, thumb along the top pointing forward, digits
curling under), the firing paw shows its back with the index on the trigger, the handguns are
two-handed, and every reload contact still follows its part. Only the camera-relative framing, the arm
targets (shoulders and elbow directions) and the lens changed. The third-person holds read the same
grip data and choreography and are unaffected (no file they read changed except the first-person-only
fields added to the view specs).

## 5. Evidence

`docs/overhaul/evidence/viewmodel/`: one board per weapon and resolution (`<weapon>-1280x720.jpg`,
`<weapon>-1470x956.jpg`), each state as a before | after pair from the same camera, with the HUD on:
hip, aimed, sprint, walk, strafe, crouch, landing, draw, firing, four reload or action keys per weapon
(empty and tactical magazine swaps, the slide stop and charging handles, the revolver crane, ejector,
speedloader and close, the shotgun shell loading and push, the bolt cycle, the coconut lift, drop, pump
and top-up, the machete slashes and chop), two inspect beats, and the hip grip from both sides. The hip
tiles carry the target composition as guides (muzzle, sight, firing and support paw boxes, the support
forearm's exit span on the bottom edge, the central band). Before captures come from the commit before
this work (8cbbce0) with the same capture tool.

Also: `weapon-size.jpg` (the M4 and the pistol at 80, 100 and 120 percent), `settings-weapon-size.jpg`
(the settings screen with "Tamanho da arma"), `framing.json` (the measured composition before and after,
hip and aimed, plus every-state summaries) and `clearance.json` (every sampled pose, both paws).

## 6. Measured before and after

`src/render/viewmodel-frame.ts` measured on the live viewmodel at 1280 x 720 (`tools/qa/vm-frame.mjs`),
before (commit 8cbbce0) and after, with the same measure. Coverage is the weapon and both arms; the
central band is x .35 to .65, y .25 to .58; support exit is where the support forearm leaves the
bottom edge. Each cell is before / after.

| Weapon | Hip coverage % | Central band % | Muzzle | Yaw, pitch, roll | Support exit | Aimed support arm % | Aimed coverage % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pistol | 11.3 / 9.9 | 5.1 / 0.6 | .58, .54 / .55, .61 | 6, 2, 9 / 3, 2, 4 | .49 to .68 / .38 to .57 | 5.8 / 5.6 | 11.0 / 10.8 |
| Revolver | 10.0 / 8.6 | 7.3 / 0.6 | .55, .53 / .54, .59 | 9, 2, -4 / 3, 2, 4 | .46 to .64 / .42 to .58 | 5.2 / 5.0 | 10.0 / 10.0 |
| SMG | 13.6 / 13.4 | 3.1 / 2.8 | .56, .57 / .58, .58 | 12, 2, -5 / 7, 5, 6 | .40 to .56 / .52 to .62 | 3.9 / 3.9 | 9.1 / 9.0 |
| M4 | 23.3 / 16.8 | 14.7 / 9.1 | .49, .51 / .55, .53 | 18, 4, 21 / 8, 6, 7 | .16 to .38 / .42 to .53 | 11.0 / 5.4 | 17.8 / 11.2 |
| Doze | 19.2 / 14.5 | 11.7 / 7.2 | .50, .52 / .54, .52 | 17, 0, 22 / 7, 3, 8 | .26 to .45 / .45 to .53 | 9.2 / 4.7 | 16.1 / 10.9 |
| Carabina | 24.4 / 13.5 | 22.1 / 10.2 | .49, .53 / .54, .55 | 17, 0, 25 / 8, 4, 7 | .22 to .42 / .43 to .53 | 11.4 / 5.5 | 22.4 / 16.5 |
| Sniper | 24.0 / 14.2 | 25.3 / 11.9 | .47, .52 / .54, .55 | 17, 0, 25 / 7, 3, 8 | .25 to .44 / .48 to .56 | 11.3 / 5.2 | 26.7 / 20.4 |
| Lanca-coco | 26.3 / 14.7 | 25.1 / 5.5 | .52, .50 / .56, .60 | 17, 2, 13 / 8, 5, 7 | .28 to .45 / .50 to .56 | 4.1 / 2.5 | 14.2 / 12.4 |
| Facao | 10.9 / 12.5 | 15.0 / 15.3 | tip .40, .26 / .48, .36 | 49, 40, 112 / 24, 34, 123 | free paw .13 to .28 / .07 to .25 | 3.3 / 5.2 | (no aim) |

The long guns now cover 13.5 to 16.8 percent (Call of Duty 10 to 12, Valorant 12 to 14, Apex 15 to 22),
point along the view (yaw 7 to 8 instead of 17 to 18, cant 7 to 8 instead of 13 to 25), and the support
forearm leaves the bottom edge just left of centre instead of the lower-left quarter. Aimed, the support
arm covers about half what it did. The Facao now carries its free paw in frame (Valorant and Call of
Duty), so its coverage rose slightly; its blade is less across the centre.

Every state (`framing.json`, 1,067 samples: hip, aimed and the aim transition, sprint, inspect every
0.1 s, draw every 0.05 s, fire, every reload every 0.05 s, the shell chain, the machete cuts and chop):
the closest visible surface is 8.2 cm from the eye (the M4 aimed) and nothing is cut open by the near
plane. Elbows: 109 to 136 degrees at the hip; across all states 42 (a paw folded back toward the
shoulder in a reload) to 160 (the IK's reach limit, an arm stretched down to the belt for a magazine).

## 7. Clearances

Worst signed skin clearance of each paw (and the wrist end of the forearm) to the gun over every sampled
pose, millimetres, negative inside (`tools/qa/fp-clearance.mjs`, full vertex; `clearance.json`). The bar
is -0.5 mm; every weapon passes in every sample. Before is the previous pass's report.

| Weapon | Samples | Firing paw worst (after) | Support or free paw worst (after) | Before (firing / support) |
| --- | ---: | --- | --- | --- |
| Pistol | 122 | 1.8 (reload 0.3 s, hand) | 0.6 (reload 1.45 s, thumb) | 1.8 / 0.6 |
| Revolver | 140 | 0.3 (hip, index tip) | -0.4 (fire 0.05 s, index tip) | 0.3 / -0.4 |
| SMG | 130 | 2.4 (hip, middle tip) | -0.5 (inspect 0.3 s, wrist) | 2.4 / 0.0 |
| M4 | 150 | 0.3 (hip, hand) | 0.6 (hip, ring tip) | 0.3 / 0.6 |
| Doze | 123 | -0.2 (hip, index tip) | 0.1 (hip, index tip) | -0.2 / 0.1 |
| Carabina | 154 | -0.5 (reload 2.15 s, middle tip) | 0.9 (hip, index tip) | -0.5 / 0.9 |
| Sniper | 191 | -0.5 (fire 0.25 s, middle tip) | 2.5 (hip, index) | -0.5 / 2.5 |
| Lanca-coco | 160 | 1.1 (hip, thumb tip) | -0.4 (reload 1.45 s, ring tip) | 1.1 / -0.4 |
| Facao | 74 | -0.1 (slash 0.25 s, forearm by the ribbons) | free paw: no gun surface within 3 cm | 0.8 / 27.3 |

The paw-on-gun numbers are those of the fitted grips, which did not change; what the re-framing could
break is the forearm and the reaches, and these were fixed where it did: the SMG's aimed and draw
forearm (-1 and -6 mm, fixed by its aimed shoulder and the riding shoulders), its inspect (-1.7 mm, the
carried camera-space keys), the Lanca-coco's coconut lifts (-7.4 mm, its reload shoulders) and the
Facao's forearm on the pommel (-2 to -6 mm in every state, the riding arm; then its ribbons at -0.7 mm,
a small rest tilt of the cloth). Reviewed from the eye and both sides in every board, and from weapon
orbits with `tools/qa/vm-try.mjs` and `vm-variants.mjs`.

## 8. The setting

"Tamanho da arma" (`Settings.weaponSize`, `src/controls.ts`, range 0.8 to 1.2 in steps of 0.05, default
1.0 = the researched framing): "Menor libera mais tela; maior aproxima a arma e as patas. Mirando, fica
sempre igual." It scales the hip lens about the screen centre (every point moves along its ray from the
reticle by the factor) and fades to nothing as the aim comes up, so the aimed picture, the scopes and
the sensitivity contract never change. Shown with "Campo de visão" under "NA SUA MÃO" and in the pause
menu's quick settings; saved with the other settings, clamped and type-checked on load.

## 9. Tests

- `npx tsc --noEmit` clean; `npx vitest run --maxWorkers=6`: 116 files, 1,089 tests pass; `npm run build`
  passes (its existing chunk-size warning is unchanged).
- New `tests/viewmodel-framing.test.ts` (30 tests, real weapon and arm assets through the real
  `WeaponView`): every weapon's muzzle, sight, firing grip and support wrist inside its target boxes at
  the hip; yaw, pitch and roll in range; hip coverage in range; the central band under its limit and the
  reticle itself clear; the support forearm leaving through the bottom edge inside its span and never
  through the left edge; no near-plane cut, nothing within 6 cm, elbows 60 to 158 degrees; the long guns
  pointing along the view; the same framing on a 1470 x 956 window; aimed: the sight within 0.5 percent of
  the reticle, no yaw or cant, the support arm under 6.5 percent; the weapon size setting scales the hip
  view by its factor and leaves the aimed sight exact; reload, inspect and sprint sampled every 0.1 s
  with no near-plane cut.
- `tests/paw-asset.test.ts`: the slimmed forearm reaches its first-person girth, no vertex moves along the
  forearm or away from its axis, the digits and wrist are untouched to 0.01 mm.
- `tests/input.test.ts`: the weapon size default, label and range, persistence, clamping and bad values.
- `tests/viewmodel.test.ts`: the SMG far-side inspect now expects its free key carried with the gun.
- `tests/settings.e2e.spec.ts` (3 tests, run on this machine with Chrome on the GPU through a local
  config) passes: the new slider is reachable by keyboard, has its range and step, and is saved.

## 10. Files touched outside the viewmodel

- `src/controls.ts`: the `weaponSize` option and `WEAPON_SIZE_RANGE` (a `view` flag places it with the
  field of view).
- `src/shared/types.ts`: `Settings.weaponSize`.
- `src/ui/ui.ts`: the slider under "NA SUA MÃO" and in the pause quick settings.
- `tools/qa/*.mjs`: the ANGLE backend is chosen by platform (Metal on macOS as before, GL EGL on Linux)
  in every QA tool except the performance tools the performance agent owns; new tools `vm-frame`,
  `vm-try`, `vm-variants`, `vm-board`, `vm-evidence`, `vm-evidence-board`, `vm-clear-try`, `vm-guides`.
- Not touched: `src/render/pipeline.ts`, `src/render/renderer.ts`, `tests/visual/qa-hook.ts` and the
  performance tools (the performance agent's files), `src/render/capybara.ts`, `fp-grips.json`, the
  weapon and arm assets. No Blender rebuild.
- DEV-only hooks in `src/render/weapons.ts` (stripped from production builds): `__vmMeasure` (the
  framing measure) and `__vmActor` (state overrides for walk, strafe, crouch and draw reviews).

## 11. Decisions made without review

- One hip lens for every gun (44 degrees vertical) rather than per-gun hip lenses: the research shows
  per-game constant viewmodel lenses; per-gun lenses were the source of the inconsistent sizes.
- The aimed lens keeps each gun's earlier value so no sight picture or scope behaviour changes.
- The target coverage band (11 to 18 percent for long guns) sits between Call of Duty and Apex, for
  bigger stylized guns and big paws.
- The forearm slimming is done at load time on the skinned mesh rather than in Blender: it touches only
  positions, keeps the asset and its third-person counterpart identical, and is reversible.
- The Facao's free paw now shows at the lower left (it was out of frame), as in Valorant and Call of
  Duty; it still ducks under every cut.
- The machete forehand's follow-through briefly shows the forearm across the bottom (about 0.15 s, the
  arm moving with the blade); kept, since it reads as the cut itself.

## 12. Known issues

- Pistol reload, paw against paw: while the support paw seats the magazine at the bottom of the grip,
  the two paws overlap (before: up to 30.1 mm over 14 samples; after: up to 22.4 mm over 20 samples,
  0.95 to 1.3 s of the empty reload and the same beat of the tactical one). It lives in the authored
  magazine-seat contact, not the framing (no shoulder or elbow change clears it); paw to gun stays
  clear. Left for a reload refit.
- The visual baselines of the first-person poses (`tests/visual/baselines/`, not in the repository)
  change with this pass and need regenerating on the Mac.
- Measurements of the references are by eye on a grid (+/- 0.02 of the frame, +/- 3 degrees); the
  games ran at their own field of view settings.
- Colours were judged on Mesa here; the orchestrator's Mac check covers colour.
- `tools/qa/grip-fit.mjs` and `grip-fit-short.mjs` remain duplicated (from earlier passes).
