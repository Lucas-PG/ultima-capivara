# First-person weapon framing: how professional shooters hold and frame their guns

Purpose: the evidence base for re-framing how the nine capybara weapons are held in first person. It
records, per weapon class, the conventions of Apex Legends and Call of Duty (the user's references) and
of Valorant, Titanfall 2, Halo Infinite, Battlefield 6, Counter-Strike 2, Team Fortress 2, Destiny and
Overwatch, as numbers that our framing can match and our tests can check. Section 9 turns them into the
target composition per class. The rig, grip and reload research of the previous pass stays valid
(`docs/overhaul/fp-arms-research.md`, sources S1 to S35 there); this document is about framing.

## 1. Method

- **Footage.** Weapon showcase and reload compilations captured at a fixed field of view on a calm
  background, and gameplay without commentary, downloaded as short sections at 720p or 1080p (sources
  V1 to V10). Frames were extracted with ffmpeg at known times and measured on a 10 percent grid drawn
  over the frame (screen fractions from the top-left corner; the reticle is at 0.5, 0.5).
- **Stills.** The Call of Duty Wiki keeps first-person captures of every weapon held at the hip, aimed and
  in its inspect for Modern Warfare (2019) and Black Ops 6 (W1, 142 images downloaded). They are cropped
  to the gun, so they were used for grips, the aimed picture and how much of the hands shows, not for
  screen positions. Official store screenshots (Steam pages of every game above) were checked first: they
  are almost all third-person or cinematic and carry no usable first-person frames.
- **Developer sources.** Talks, docs and articles on viewmodel lenses and composition (D1 to D9), plus
  the previous pass's sources where they apply.
- All third-party images and video stay in `~/capivara-agent/refs/research/` on the build machine for
  private reference. None is in the repository; the evidence boards draw the target composition as
  guides over our own captures.
- Positions are read by eye on the grid, so treat them as +/- 0.02 of the frame. Angles are estimated
  from the receiver and barrel lines (+/- 3 degrees). Coverage is the share of the frame covered by the
  weapon and both arms (+/- 2 points). The games ran at their default or a common field of view (Call
  of Duty and Apex around 90 to 105 degrees horizontal), so the gun sizes compare across games only
  roughly; the shape of the composition compares well.

## 2. The lens: why the gun has its own field of view

- Every reference renders the gun with its own fixed lens, separate from the world field of view: the
  pose is authored against that lens [D1][D2][S1][S2 of fp-arms-research]. Counter-Strike 2 exposes it as
  `viewmodel_fov` 54 to 68, default 60 [D3]; Team Fortress 2 defaults to 54 [S5]. Source measures these
  horizontally at 4:3, which is 42 to 54 degrees vertical (60 is 47 degrees vertical).
- Call of Duty (Modern Warfare 2019 onward) exposes the same idea as "Weapon Field of View": Narrow,
  Default or Wide; Narrow makes the gun bigger and closer, Wide smaller and longer [D4]. Halo Infinite
  goes further and lets the player move each weapon class horizontally, vertically and in depth ("Weapon
  Offset") [D5]. In Apex the gun follows the world field of view: a lower field of view shrinks the
  weapon [D6]. Fortnite's first-person Ballistic mode has no field of view or weapon option [D7].
- Our previous lenses were 56 to 70 degrees vertical, wider than any Source viewmodel (at most 54
  vertical), with the guns pulled close to the eye to fill them. A wide lens with a close gun exaggerates
  perspective: the near end (stock, firing paw, support forearm) balloons while the muzzle shrinks, so
  the gun reads as pointing across the screen. That is most of what the director saw on the M4.
- **Decision**: one hip lens for every gun, 44 degrees vertical (inside Source's 42 to 54), with each gun
  placed at a natural distance (sight 0.36 to 0.55 m from the eye). While aiming the lens blends to each
  gun's previous lens, so the authored sight pictures and the scope contract stay exactly as they were.
  A "Tamanho da arma" setting scales the hip lens (0.8 to 1.2), like Call of Duty's Weapon Field of View.

## 3. Hip framing measured (16:9)

Each row is one reference frame at the hip, still or just before an action. Muzzle is the front of the
barrel or front sight; sight is the rear sight or optic; support is the support hand's wrist; exits are
where the arms leave the bottom edge (x ranges).

| Game | Weapon | Muzzle | Sight | Support paw | Arm exits (bottom) | Yaw, pitch, roll (deg) | Coverage |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| Apex [V1] | Hemlok (AR) | .57,.60 | .76,.50 | .52 to .60, .70 to 1 | support .52 to .58 | 10, 4, 8 | 20% |
| Apex [V1] | Havoc (AR) | .56,.60 | .65,.55 | .53 to .60, .80 to 1 | support .53 to .60 | 8, 4, 6 | 18% |
| Apex [V1] | C.A.R. (SMG) | .55,.60 | .72,.57 | .50 to .57, .75 to 1 | support .50 to .57 | 9, 3, 8 | 17% |
| Apex [V1] | Alternator (SMG) | .57,.58 | .66,.58 | .47 to .60, .65 to 1 | support .47 to .55 | 8, 3, 10 | 15% |
| Apex [V1] | Prowler (SMG) | .56,.52 | .66,.50 | hidden below | support .48 to .55 | 8, 5, 6 | 22% |
| Black Ops 6 [V2] | Kilo 141 (AR) | .55,.55 | .62,.57 | .50 to .55, .58 to .65 | support .30 to .45 | 6, 4, 6 | 11% |
| MW III [V3] | BAS-B (AR) | .56,.53 | .66,.62 | .46 to .52, .72 to .95 | support .40 to .50 | 6, 5, 5 | 11% |
| MW III [V3] | Lockwood 680 (pump) | .53,.62 | .58,.66 | .50, .85 to .95 (on the pump) | support .45 to .55 | 4, 2, 4 | 10% |
| MW III [V3] | revolver (two hands) | .56,.60 | .56,.62 | under the firing hand | both .48 to .68 | 1, 2, 0 | 4% |
| Valorant [V4] | Phantom (AR) | .57,.62 | .62,.62 | .55 to .62, .62 to .75 | support .50 to .55 | 8, 4, 8 | 12% |
| Valorant [V4] | Vandal (AR) | .56,.57 | .66,.58 | .54 to .60, .62 to .75 | support .50 to .58 | 9, 4, 10 | 12% |
| Valorant [V4] | Bucky (pump) | .58,.55 | .70,.58 | .53 to .65, .58 to .80 | support .48 to .62 | 8, 3, 8 | 14% |
| Valorant [V4] | Marshal (bolt) | .58,.55 | .62 to .83, .50 to .60 (scope) | .58 to .65, .62 to .82 | support .55 to .62 | 8, 3, 6 | 13% |
| Valorant [V4] | Operator (bolt) | .66,.48 | .65 to 1, .42 to .75 (scope) | .68 to .75, .70 to .85 | support .62 to .70 | 10, 3, 5 | 18% |
| Valorant [V4] | Classic (pistol, one hand) | .64,.62 | .70,.62 | none | firing .66 to .80 | 3, 2, 2 | 5% |
| Halo Infinite [V6] | Sidekick (pistol, two hands) | .62,.55 | .66,.56 | under the firing hand | both .55 to .75 | 2, 2, 0 | 8% |
| Titanfall 2 [V5] | smart pistol (two hands) | .58,.50 | .58,.52 | under the firing hand | both .47 to .70 | 1, 3, 0 | 10% |
| Valorant [V4] | melee knife | .62,.60 (tip) | | free hand at .12 to .30, .75 to 1 | free .05 to .20, grip .80 to 1 | blade 30 deg above horizontal | 6% |
| MW 2019 [W1] | knife | tip left of the grip | | free hand open at the lower left | | blade near horizontal | |

What the frames share:

- **The gun points along the view.** The muzzle sits just right of the reticle and a little below it
  (x .55 to .58, y .52 to .62); the sight is further right at about the same height or slightly lower
  (x .62 to .76, y .50 to .62). The gun is yawed inward only 4 to 10 degrees, pitched up 2 to 5 and canted
  (top toward the centre) 4 to 10. Nothing points across the screen.
- **Coverage is a budget.** Call of Duty keeps rifles near 10 to 12 percent of the frame, Valorant 12 to
  14, Apex 15 to 22 (bigger, chunkier guns, closer), pistols 4 to 10. Our build covered 23 to 26 percent
  with the long guns (M4 23.3 percent), the M1 build about 10 percent.
- **The support arm rises steeply.** The support hand holds the fore-end just right of centre, around
  x .50 to .62, and its forearm drops almost vertically to the bottom edge (exits around x .45 to .60).
  It never crosses the lower screen diagonally; the forearm and sleeve cover 3 to 6 percent.
- **The firing hand is mostly hidden** behind the receiver at the lower right (x .62 to .80, y .75 to
  1); its knuckles, back and trigger finger show at the edge of the receiver. The firing forearm leaves
  the bottom right, often only a sliver.
- **Handguns sit low and centred right**, held two-handed with the slide's top and the sights just right
  of and below the reticle (x .55 to .65, y .52 to .62), both hands at the bottom centre-right and both
  forearms leaving the bottom edge between x .45 and .75 (Call of Duty, Halo, Titanfall). Valorant's
  sidearms are one-handed further right.
- **The central band stays clear**, as Destiny describes its combat corridor [D8]: in every frame the
  area around the reticle from x .35 to .65 and y .25 to .58 holds at most the barrel's tip and the front
  sight.

## 4. Per class

**Pistol and revolver (two-handed).** Call of Duty, Halo Infinite and Titanfall 2 hold the handgun low in
the bottom centre-right with both hands: slide or rib top at y .52 to .62, the gun nearly straight
forward (yaw 0 to 4, roll 0 to 3), both paws and wrists at the bottom edge (x .45 to .75), coverage 4 to
10 percent. The support hand cups the firing hand from below and the left. Revolvers are framed like
pistols with the cylinder visible above the hands.

**SMG.** Like a short rifle but a little lower and closer: muzzle .55 to .58, sight .66 to .72 at y .50
to .58, the support hand on the fore-end or foregrip at x .47 to .60 with its forearm vertical to the
bottom edge (Apex C.A.R., Alternator, Prowler). Coverage 15 to 22 percent in Apex, about 10 in Call of
Duty.

**Assault rifle.** The central reference for the director's complaint. Muzzle x .55 to .58, y .52 to .62;
sight .62 to .76 at y .50 to .62; support hand on the handguard right of centre (x .50 to .62, y .58 to
.75) with a nearly vertical forearm; the firing hand mostly hidden at the lower right; yaw 6 to 10, pitch
3 to 5, roll 5 to 10; coverage 11 to 20 percent.

**Pump shotgun.** Like the rifle, with the support hand on the pump further forward and higher (Valorant
Bucky x .53 to .65, y .58 to .80), the receiver and stock filling the lower right, coverage 10 to 14.

**Scoped DMR and bolt sniper.** The rifle composition with the scope's eyepiece as the sight point
(x .62 to .80, y .48 to .60): the scope is the biggest object, so these guns sit a little further away
or lower (Valorant Marshal 13 percent, Operator 18). The support hand is under the fore-end.

**Launcher.** Call of Duty's PILA and JOKR and the RPG-7 [W1] sit on the shoulder further right and
lower, the tube's mouth near the reticle's lower right, the bulk at the lower right; coverage up to 20
percent. Our Lanca-coco is shouldered like a short heavy rifle with its hopper on the right, so it takes
the rifle composition with the hopper kept below the sight line.

**Melee.** Valorant holds the knife at the lower right with the blade rising diagonally toward the centre
(about 30 degrees above horizontal) and the free hand open at the lower left; Call of Duty's knife is
similar with the blade more level; the cleaver and bat rise more steeply. Slashes alternate, both
crossing the lower half of the screen; heavy attacks raise the weapon and chop down through the centre.

## 5. Aimed

- The sight is centred exactly on the reticle in every reference (iron sights aligned, optics filling a
  small part of the frame). The gun is straight: no yaw, no cant.
- What stays visible: the rear sight and receiver at the bottom centre, the support hand on the
  handguard just left of and below the sight (Call of Duty Kilo 141, M4A1, MP5, Model 680 aiming
  captures [W1]), and nothing else. The support forearm shows as a short wedge at the lower left; the
  arms cover about 3 to 6 percent, the gun 6 to 12.
- Our build's support forearm covered 9 to 11 percent of the aimed frame (the director's "large part of
  the lower left"). Target: under 6.5 percent.

## 6. Motion

- **Sprint.** Call of Duty's classic sprint [V7] rolls the rifle 30 to 45 degrees and yaws it 40 to 60
  degrees toward the left, low across the chest, muzzle pointing to the lower left; the SMG drops lower;
  Modern Warfare's tactical sprint raises the gun muzzle-up beside the face. Apex lowers and rolls the gun
  to the lower right. Pistols are carried muzzle-up or lowered close to the chest. Our sprint offsets are
  of this kind and were kept, re-checked on the new hip pose.
- **Walk and strafe.** Bob of about 1 percent of the frame per step (a figure-eight, slightly larger
  vertically), strafe roll 3 to 6 degrees toward the movement with 1 to 2 cm of lag. Ours: 1.1 cm
  lateral and 0.9 cm vertical bob, strafe roll up to 4 degrees, look lag scaled by weapon weight.
- **Crouch, jump and land.** A short dip (1 to 3 cm) and recovery with a small pitch, a lift on the jump,
  a heavier dip on landing scaled by fall speed. Ours are springs of that size.
- **Firing.** A short back kick (1 to 2 cm) with 1 to 3 degrees of muzzle climb that recovers in about
  0.1 s; heavier guns kick and roll more, aimed kick is about half [V1 to V4]. Ours are per-weapon
  springs, halved while aimed.
- **Reload and inspect readability.** The gun rolls 20 to 35 degrees and lifts slightly toward the centre
  to show the magazine well or the loading port, the support hand always visible on the part it handles;
  the reload must read as "cannot shoot" without covering the reticle [S10 of fp-arms-research]. Inspects
  show both flanks in two beats.
- **Draw and holster.** The gun rises from below the frame with a small twist in 0.3 to 0.6 s and settles
  exactly when it can fire; the holster drops it out of frame [S6 of fp-arms-research].

## 7. Hands, forearms and stylized hands

- At the hip only the support hand and forearm read clearly; the firing hand shows its back and
  knuckles at the edge of the receiver. Sleeves and cuffs are visible at the bottom edge only.
- Big or non-human hands are framed the same way: Valorant enlarges hands for readability [S13];
  Halo's armoured gauntlets and Titanfall's pilot gloves are bulky yet sit in the same positions; Overwatch
  frames Winston's gorilla hands in the same lower corners [S9]. Nobody lets a forearm cross the lower
  screen.
- First-person arms are routinely first-person-only cheats: Valve deletes and distorts viewmodel geometry
  for the one camera [S4]; Unreal scales the first-person mesh toward the camera [S1]. Our capybara
  forearm is 12 to 13 cm across at the first-person scale (a human forearm is 7 to 9 cm), so it covers
  almost twice the screen a human arm would at the same distance. **Decision**: draw the first-person
  forearm about 20 percent slimmer toward its bone axis (radius 52 mm below the elbow to 47 mm before
  the wrist, the taper and section shape kept), leaving the paw, digits, fur, colours and the rolled
  linen cuff untouched, so it still reads as the character's arm. Done at load time on the skinned mesh
  (no Blender rebuild needed; the fur shells follow it).

## 8. What the old framing got wrong (measured on our build)

| Weapon | Hip coverage | Muzzle | Yaw, pitch, roll | Support exit | Aimed support cover |
| --- | ---: | --- | --- | --- | ---: |
| M4 | 23.3% | .49,.51 | 18, 4, 21 | .16 to .38 (diagonal) | 11.0% |
| DMR | 24.4% | .49,.53 | 17, 0, 25 | .22 to .42 | 11.4% |
| Sniper | 24.0% | .48,.52 | 17, 0, 25 | .25 to .44 | 11.3% |
| Lanca-coco | 26.3% | .52,.50 | 17, 2, 13 | .28 to .45 | 4.1% |
| Doze | 19.2% | .50,.52 | 17, 0, 22 | .26 to .45 | 9.2% |

The long guns were yawed about 17 degrees across the view with 21 to 25 degrees of cant, a wide lens
(56 to 70) and close; the support forearm entered from the lower-left quarter and crossed the lower
screen. That is the "barrel pointing across the screen with a strong tilt".

## 9. Target composition (what we match)

Screen fractions at 16:9 (the reticle is .5, .5), measured on our captures by
`src/render/viewmodel-frame.ts` and enforced by `tests/viewmodel-framing.test.ts`; the numbers live in
`src/render/viewmodel-targets.ts`.

| Class (our weapons) | Muzzle | Sight | Firing grip | Support wrist | Support exit | Yaw, pitch, roll | Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Handgun (pistol, revolver) | .50 to .62, .52 to .66 | .54 to .66, .52 to .66 | .52 to .72, .72 to .95 | below the firing paw | .30 to .62 | 0 to 6, 0 to 5, 0 to 8 | 5 to 12% |
| SMG (Canarinho) | .52 to .62, .52 to .62 | .62 to .74, .52 to .62 | .60 to .76, .74 to .92 | .50 to .66, .75 to 1 | .40 to .70 | 3 to 10, 1 to 8, 3 to 10 | 9 to 16% |
| Rifle (M4) | .52 to .60, .50 to .60 | .64 to .76, .52 to .62 | .62 to .76, .74 to .90 | .46 to .58, .55 to .68 | .36 to .60 | 3 to 10, 1 to 8, 3 to 10 | 11 to 18% |
| Shotgun (Doze) | .50 to .60, .48 to .60 | .64 to .76, .52 to .62 | .62 to .76, .74 to .90 | .46 to .60, .58 to .72 | .36 to .60 | same | 11 to 18% |
| Marksman (Carabina, sniper) | .50 to .60, .48 to .60 | .64 to .78, .50 to .60 | .62 to .76, .74 to .90 | .46 to .60, .55 to .70 | .36 to .60 | same | 11 to 18% |
| Launcher (Lanca-coco) | .50 to .62, .52 to .64 | .62 to .76, .46 to .58 | .62 to .78, .80 to 1 | .48 to .62, .70 to .90 | .40 to .62 | same | 11 to 19% |
| Melee (Facao) | tip .44 to .62, .25 to .45 | | .66 to .82, .76 to .92 | free paw at the lower left | | blade diagonal up-left | 6 to 14% |

Everywhere: the central band (x .35 to .65, y .25 to .58) is at most 4 (handguns), 8 (SMG), 12 (rifle,
shotgun, launcher) or 14 (scoped) percent covered at the hip, 16 for the machete's thin blade, and the
reticle itself is clear; nothing closer than 6 cm to the eye and no surface cut open by the near plane in
any sampled pose; elbows bent between 60 and 158 degrees at the hip and aimed. Aimed: the sight on the reticle within
half a percent of the frame, the support forearm under 6.5 percent of the frame, everything under 22.

## Sources

Footage (downloaded as sections for private frame measurement; not redistributed):
- [V1] VG Weapon Animations, "Apex Legends - All Reload Animations", YouTube, https://www.youtube.com/watch?v=xP_mc1QWsWk ; and ALIATASHIFPS, "R-301 Starts Strong | Apex Legends No Commentary", https://www.youtube.com/watch?v=uyPuyLKGk4c
- [V2] Game Arsenal, "Call of Duty: Black Ops 6 - All Weapon Reload Animations", https://www.youtube.com/watch?v=7ZlkSVQFecw
- [V3] Hectorlo, "Call of Duty: Modern Warfare 3 (2023) - All Weapon Reload Animations in 18 Minutes", https://www.youtube.com/watch?v=V0pufIBFuwQ
- [V4] DESPOkills, "VALORANT Weapons Showcase (Inspect, Reload & Recoil Animations)", https://www.youtube.com/watch?v=OrFftMCi3JQ
- [V5] Hectorlo, "Titanfall 2 - All Weapon Reload Animations in 3 Minutes", https://www.youtube.com/watch?v=OUCIHsQ4Vio
- [V6] Hectorlo, "Halo Infinite - All Weapon Reload Animations in 5 Minutes", https://www.youtube.com/watch?v=VwISf3OyoE4
- [V7] Skazzy's Random Thoughts, "Call of Duty: Modern Warfare 2 vs. 3 Sprint Animations", https://www.youtube.com/watch?v=B59yuN3VVpI
- [V8] Fire Mountain, "Battlefield 6 - All Weapon Reload Animations", https://www.youtube.com/watch?v=sKPcqdPPDyg (mostly inspect and reload framing; its idle frames are motion-blurred)
- [V9] Sunie, "Apex Legends Character Gun Run/Sprint Animations (Season 5)", https://www.youtube.com/watch?v=jIQkeYhul4k (third-person only, not used for numbers)
- [V10] TacticalSloth, "Call of Duty: Black Ops 6 - All Weapons Inspect Animations", https://www.youtube.com/watch?v=FbdsxadjE7k

Stills:
- [W1] Call of Duty Wiki (Fandom), first-person captures per weapon: "<weapon> Held MW2019", "Aiming MW2019", "Inspect MW2019", "First Person BO6", "Aiming BO6", "Inspect BO6", for example https://callofduty.fandom.com/wiki/File:M4A1_Held_MW2019.png and https://callofduty.fandom.com/wiki/File:Kilo_141_First_Person_BO6.png (142 files: handguns, SMGs, rifles, shotguns, marksman and sniper rifles, launchers, knives and melee).
- Steam store pages (official screenshots) of Apex Legends, Titanfall 2, Call of Duty (Black Ops 6, Modern Warfare III), Destiny 2, Halo Infinite, Overwatch 2, Battlefield 2042 and Battlefield 6: checked, nearly all third-person or cinematic.

Developer and reference articles:
- [D1] Epic Games, First Person Rendering in Unreal Engine, https://dev.epicgames.com/documentation/en-us/unreal-engine/first-person-rendering (the first-person field of view and scale; also S1 of fp-arms-research).
- [D2] Valve Developer Community, Viewmodel, https://developer.valvesoftware.com/wiki/Viewmodel (one camera, distortion, per-weapon viewmodel lens; S4).
- [D3] csdb.gg, "How to Change FOV in CS2 (and What You Actually Can't)", https://csdb.gg/guides/cs2-fov-viewmodel/ (viewmodel_fov 54 to 68, default 60).
- [D4] GGRecon, "How To Change FOV Settings In MW2", https://www.ggrecon.com/guides/mw2-how-to-change-fov-settings/ (Weapon Field of View: Narrow, Default, Wide).
- [D5] Shacknews, "How to change weapon offset - Halo Infinite", https://www.shacknews.com/article/127821/how-to-change-weapon-offset-halo-infinite (per-class horizontal, vertical and depth offsets).
- [D6] Dexerto, "Why lowering FOV in Apex Legends could actually be better", https://www.dexerto.com/apex-legends/why-lowering-fov-in-apex-legends-could-actually-be-better-1791386/ (a lower field of view shrinks the weapon).
- [D7] Epic Games, "Fortnite goes first-person with Ballistic", https://www.fortnite.com/news/fortnite-goes-first-person-with-ballistic-a-tactical-5v5-shooter-launching-in-early-access-dec-11 , and The Spike, "Fortnite FOV settings", https://www.thespike.gg/fortnite/beginner-guides/fov-settings (no field of view setting in Ballistic).
- [D8] Mein-MMO on David Helsby's GDC 2015 talk "The Art of First Person Animation for Destiny" (the combat corridor), https://mein-mmo.de/en/warum-spielt-sich-destiny-so-gut-die-tricks-entwickler-153,33071 ; talk page https://gdcvault.com/play/1022297/The-Art-of-First-Person (abstract only).
- [D9] Matt Boehm, "The First Person Animation of Overwatch", GDC 2017 Animation Bootcamp, press reports https://www.invenglobal.com/articles/1187/how-overwatchs-first-person-animation-breathed-life-into-heroes and https://www.4gamer.net/games/280/G028066/20170228101/ (weapon tip to the reticle, weight shown by framing, Widowmaker's rifle resized off the right of the screen, the reload hand swapped for visibility).
- Ryan Duffin, "Animation Bootcamp: Giving Purpose to First-Person Animation", GDC 2013, https://gdcvault.com/play/1017633/Animation-Bootcamp-Giving-Purpose-to (abstract only).
- Activision, Modern Warfare Initial Intel: animation and authenticity (Mark Grigsby), https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Detailing-Advancements-in-Animation-and-Authenticity (hand-animated weapon handling, tactical and empty reloads).
- Respawn job listings for Apex Legends viewmodel animators, https://jobs.ea.com/en_US/careers/JobDetail/Senior-View-Model-Animator/212817 (viewmodel animation is its own discipline; no public framing breakdown found).
- Gap: no public talk or article gives viewmodel framing numbers for Apex or Call of Duty; the numbers above are our measurements of their footage.
