# Autonomous overhaul: operational record

Branch: `overhaul/aaa-autonomous` (local), started from `overhaul/m1-inventory` 7f48b7d on 2026-09-27.
M1 (`overhaul/m1-inventory`) is not touched until the whole overhaul is finished; then it is integrated, re-verified and pushed.
Previous session record: `docs/overhaul/progress.md` (kept for history).

## PAUSED 2026-09-29 about 17:00 (user request): resume exactly from here

Everything was stopped at a graceful point: both Codex gun agents interrupted (threads saved), all dev servers stopped. The user's own Blender window (MCP add-on) was left running. On the user's go-ahead, resume in this order:

1. Restart both Codex gun agents on their saved threads, each as a background command from the repo root (they resume from their worktree state; the loop waits out capacity errors):
   - `docs/overhaul/briefs/keep-codex.sh long .claude/worktrees/guns-long 01a0edd7-92c0-7cf1-a03e-c3201f67e91d docs/overhaul/briefs/guns-long.codex.txt`
   - `docs/overhaul/briefs/keep-codex.sh short .claude/worktrees/guns-short 01a0edd7-9659-70d1-a596-9e7870be86ce docs/overhaul/briefs/guns-short.codex.txt`
   - At pause: guns-long had 12 commits since 9934dda (all five models rebuilt, M4 composition and reload, shotgun reload chain, contact tools) and 20 uncommitted files; guns-short had 9 commits (pistol, SMG, revolver, machete hero models, world models, reload mechanisms and melee handling, QA tools) and 3 uncommitted files. Uncommitted work was left in place on purpose.
2. Restart the dev server with the preview tools (`.claude/launch.json` "dev").
3. Continue the combined-world review of `overhaul/aaa-autonomous` at bca1c9a (structure merged in 0fa29c9, vegetation in bca1c9a). Merged captures at medium already showed 103 to 151 draws and 1.23M to 1.54M triangles over eight poses (was 159 to 449 draws before the world pass). Still to do:
   - look at the merged captures (town top, Palafitas, Engenho street, Lagoa west, Capela stair, plaza, river, Redentora, Morro, fort beach, fazenda, mangue, Morro roofs) and fix what they show;
   - retarget the stale QA poses in `tests/visual/qa-hook.ts` (vilaStreet now inside a new house, quayNorth and quaySouth staring at deck planks);
   - fill the empty Engenho street-level space (flat lawn between blank walls);
   - bots reach the Capela by the south path, not the new stair; farm soil strips cross a road; dead `SOFT_LANDSCAPE` in the kit renderer; trees still have no collision (pre-existing);
   - re-run the full vitest when the machine is idle: at merge 777/778, the ground-cover culling test timed out (19 s against 15 s) under load and passes alone.
4. When the gun agents report ALL WEAPONS DONE, review them rigorously and independently before merging (per weapon: design sheet next to Blender stills, in-game hip/ADS/side/left, grip-probe penetration for both paws, reload strips from the eye and two outside angles, the paw anatomy checklist, budgets and tests), send defects back, then merge both branches and regenerate the shared world-arsenal atlas once from the combined models.
5. Only after that (user decision, 2026-09-29): character rebuild, audio and VFX, HUD and menus, sky and grading, then the release gate (perf, multiplayer with real clients, playtests, report, M1 integration and push).

Delegation records: briefs, the Codex restart script and the review log are in `docs/overhaul/briefs/`. References: `docs/art/references/` (README logs the anatomy checklist per image; boards guide framing, not anatomy).

## Resume here

1. Read "Open task list" below; the first unchecked item is the next action.
2. Dev server: `.claude/launch.json` "dev" (VITE_QA=1, port 5173). QA tools: `tools/qa/capture.mjs` (named poses), `tools/qa/play.mjs` (live match driver; `VIDEO=dir` records webm; steps `down/up/mdown/mup/turn/hunt`).
3. Baseline evidence: `docs/overhaul/evidence/baseline/` (jpg), full-size captures in `output/baseline*` (gitignored).

## Baseline findings (2026-09-27, before any change)

Measured on Apple M2, real Chrome (ANGLE Metal), 1280x720, medium preset.

First person
- Weapon sits small and low in the lower-right, barrel angled across the screen; reads as a floating prop, not a held gun.
- Arms are plain brown tubes from the screen bottom; paws are static blobs baked into each weapon mesh, so nothing can move independently (reloads only slide the magazine and nudge a "support" group).
- World FOV is 78 degrees *vertical* (about 110 horizontal at 16:9): fisheye, makes everything look distant and small.
- Motion: one sine bob, spring sway, a single recoil spring for all guns. No per-class sprint, no authored draw/holster, no per-mechanism reload.
- Sniper and carbine ADS is a full black scope mask; other ADS pictures are flat.

Weapons
- Box/cylinder construction, flat 32-colour palette atlas. No baked light (AO/edges), so they look like untextured blockouts under the sun.

Character
- Boxy low-detail capybara, block head, stick arms; the rifle is held far off the body in third person.

World
- ~240 m island, 2 m heightfield, flat grass fields; houses repeat one room template (same walls, windows, furniture) with colour swaps; rocks are blocky.
- River: flat saturated cyan with large white blob "cells"; Correria spawns face into the river and walking forward drops you into it.
- Text overflow: "correnteza está forte" banner runs off both screen edges.

HUD
- Large panels (ammo card, health bar, hotbar) cover about 20% of the lower screen.

## Open task list

Priority order follows the brief: POV, weapons, character, map, graphics, combat/audio/VFX, gameplay, UI, perf, multiplayer, final review.

### A. First-person foundation
- [x] A1 Weapon asset pipeline v2 (`tools/blender/arsenal_lib.py`, `arsenal.py`, `build-fp.mjs`): profile-extruded parts with bevels, one UV layout per weapon, Cycles bakes (material id, AO, bevel-edge mask, object normal) composited into a painted albedo + ORM; moving parts with pivots; sockets muzzle/eject/sight
- [x] A2 FP arms (`tools/blender/fp_arms.py`, `src/render/fp-arms.ts`): skin-modifier forearms + 3 fingers and thumb, claws, cloth wrap, scalloped fur ruff, per-vertex AO; runtime two-bone IK with bend-plane frames, finger curls; procedural fur-strand shader
- [x] A3 Viewmodel (`src/render/weapons.ts`, `viewmodel-specs.ts`, `viewmodel-choreo.ts`, `viewmodel-anims.ts`): per-weapon hip/ADS/sprint framing, look inertia, gait bob, strafe tilt, jump/land/crouch springs, per-weapon recoil springs, slide/hammer/pump/bolt/cylinder mechanics, keyframed reloads for every family (pistol, rifle mag swaps with bolt slap/HK slap/charging handle, bolt sniper, revolver swing-out + ejector + speedloader, shell-by-shell shotgun, coco hopper refill, slingshot redraw), holster/draw
- [x] A4 FOV is horizontal degrees at 16:9 (default 100, range 80-120; old vertical saves converted); viewmodel FOV 58 vertical
- [~] A5 Wheel cycling follows hotbar box order (tested). HUD redesign of the weapon strip still open (moved to G3)

### B. Weapons (hero pass for all 10)
- [x] B1 All ten rebuilt in the v2 pipeline (pistol, revolver, SMG, M4 + red dot, Doze with side saddle, Lança-coco bamboo launcher with hopper, Carabina 3x, bolt sniper, facão, estilingão with live tubing)
- [x] B2 Third-person and ground versions simplified from the same models, one 1024 atlas (`tools/blender/build-world-arsenal.mjs`)
- [ ] B3 Per-weapon feel: sounds, muzzle, tracers, recoil patterns (visual recoil per weapon done)
- [x] B4 Polish: M4 reload lifted so the magazine swap stays in frame; per-weapon ADS eye point and pitch (Doze sights over its tall receiver down the rib to the bead, Lança-coco aims from above its hopper); scoped guns raise to the eye before the optic takes over; scope overlay redrawn with a bezel, lens tint, duplex + red dot (Sniper) and chevron (Carabina); slingshot paws reviewed, no change needed

### C. Character
- [x] C1 Character v4 (`tools/blender/capybara_v4.py`): metaball sculpt of the turnaround proportions, remeshed skin, clothing shells (shirt, vest with pouches, shorts, belt), team-masked bandana, backpack and bedroll, inset eyes with iris/pupil/glint, brows, ears, nostrils, digits and claws; baked occlusion in vertex colour; LODs 38k/8k/2.2k (far LOD drops sub-pixel parts); heat weights on the closed skin transferred to garments
- [~] C2 New run (lean, bounce, counter-twist, ear flop) and walk (waddle) clips, new TP reload; held guns ride the right paw with left-arm IK. Remaining review moved to I7 (new rig)

### I. Guns, holding and character pass (requested 2026-09-28)
Base: the isolated benchmark (`docs/art/character-benchmark/`), ported whole in 369fed9 because it was built on our exact HEAD (71c3902) and its paws, fur/cloth surfaces, M4 finish and aiming were judged better than ours in side-by-side renders. Known problems carried in: odd straight M4 magazine, support paw gripping the handguard from below with fingers pointing up, M4 reload feel, +7.6 MB of assets.
User review of the port (2026-09-28): the isolated **character is not accepted**; the paws and the M4 are better than ours but are examples to improve on, not finals (the M4 support paw still looks wrong); the other nine guns were never worked on. Codex-generated references proved useful. Target look: `docs/art/character-benchmark/holding-reference.jpg` (stocky capybara, big blunt muzzle, small ears and eyes, cream rolled-sleeve shirt, denim vest, coral scarf, backpack, belt pouches, olive cargo trousers rolled at the shin, big clawed feet) and `wide-aim-reference.jpg` (FP: both furry forearms with rolled cuffs from the lower corners, support paw wrapping the handguard from below, open irons at the centre).
- [x] I1 Port: character v5 (surface atlas, four-digit articulated paws, forearm twist joints), FP arms, M4 v2 with open irons, FOV-relative mouse sensitivity, mild tangent-correct M4 zoom, per-weapon viewmodel FOV, part-anchored reload contacts, empty/partial M4 reload, TP bind-scale fix, separate nearby TP magazine
- [x] I2 Asset budget: the arms bind the character's surface maps at runtime instead of embedding a copy (3.05 MB to 108 KB, one GPU upload); character maps WebP q85/q90 (4.48 to 2.43 MB). GPU-compressed KTX2 would cut texture memory further but needs an encoder not installed here (deferred to H1)
- [~] I3 M4: curved stylized magazine, natural support grip on the handguard, reload re-authored (weight, visibility, tactical vs empty)
  - 2026-09-29: grip measured with `tools/qa/grip-probe.mjs` (per digit signed distance to the gun, digit angles around the bore) and solved with `tools/qa/grip-fit.mjs` (pattern search over wrist, frame, curls and thumb spread against an intent: penetration, contact gaps, digit placement, wrist bend, optional stay-near-start and named targets). The 1b69016 grip measured fingertips at -111 to -147 degrees (curling to the near side) and 5.7 mm inside the gun.
  - Paw v2 (`tools/blender/capy_paw.py`): digits long enough to wrap, thumb set for opposition with a new spread (abduction) joint in `PawPose` (axes now derived from the bind geometry), slim wrist; forearm 0.30 m with a rolled two-roll cuff; shell fur on the forearm (not the paw) scaled by preset.
  - M4 v3 (`tools/blender/arsenal.py`): slimmer octagonal M-LOK handguard with flats on the sides and bottom, curved STANAG with ribs and a brass top round, continuous rail, anodised receivers, housing-plus-web stock, open notch rear sight kept (user preferred it to a ghost ring); weathering pass for every weapon (`arsenal_lib.weather`).
  - User review 2026-09-29 of the isolated build vs ours: keep the previous firing paw look (index on the trigger, visible nails), the wrist definition and the open-notch aiming; the previous support hand looked twisted. The 1.18 paw scale was rejected by this review and reverted to 1.06.
- [x] I3b Paw v3 (2026-09-29, bd9de98): metaball sculpt (pads, plump digits, creased joints, thumb) fused with the forearm, fine detail baked from a dense sculpt onto an 11k-tri game mesh with its own 2K maps (`tools/blender/paw_sculpt.py`, `fp_arms.py`, preview `paw_preview.py`); `_FUR` vertex length drives the shells (forearm and back of paw only); arms no longer borrow the character atlas. M4 grips refitted (4d3e36a); composition target is `docs/art/references/fp-rifle-board.png` once regenerated (support paw thumb-over at the rear handguard, back of the firing paw visible).
- [x] I3c Livery system (580677e): weapon-space position bake, stencilled motifs (`tools/art/stencils`, cut from a Codex sheet) per weapon in `arsenal.py` LIVERY, wood grain, calmer dark-metal edges, new palette entries. M4 wears coral palm fronds.
- [x] Slingshot removed from the game (9934dda, user request 2026-09-29).
- [~] I5 Gun pass delegated (2026-09-29) to two Opus agents in worktrees: `guns-long` (m4 composition and reload, shotgun, sniper, dmr, coco; owns arsenal_lib) and `guns-short` (pistol, smg, revolver, machete). Briefs in the session scratchpad; reports at `docs/overhaul/guns-*-report.md` in each worktree. References: design sheets `docs/art/references/weapon-*.png` (final), fp/reload boards and research notes regenerated by a Codex xhigh agent with an anatomy checklist (user rejected the first rifle boards: support paw over the muzzle, then backwards paws).
- [-] New weapons: Codex proposed Maracatu (LMG), Frevo (burst rifle), Arpao da Mare (tethered harpoon) in `docs/art/references/new-weapons.md`. User decision 2026-09-29: none for now; discuss after everything else is finished.
- [ ] I4 Shared systems for every magazine gun: empty/partial reloads and part-anchored paws (pistol, SMG, Carabina); one aiming model (tangent zoom, FOV-relative sensitivity, per-weapon lens) reviewed on all ten
- [ ] I5 The other nine weapons brought to the M4's finish (material hierarchy, wear, hardware) and regripped for the new paws: hip, ADS, sprint, reload, inspect sheets per weapon
- [ ] I6 Third-person holding on the new character for every class (rifle, pistol, heavy, melee, slingshot) incl. reload, sprint, crouch; no clipping at the camera distances players see
- [~] I7 Character rebuild delegated 2026-09-30 01:35 to an Opus agent (worktree `character`, brief `docs/overhaul/briefs/character.prompt.txt`; Blender turns via `tools/blender/wait-for-blender.sh`). Short guns merged 2026-09-30 (388febc, review passed).
- [ ] I7 Character rebuild toward the holding reference (the ported model has a faceted block head, tube legs, shapeless torso and holds guns away from the body): new sculpt keeping the rig/clip contract, face, LODs at distance, team colour readability; animation review on the rebuilt rig (walk, run, strafe, backpedal, crouch, jump, hit, death, swim, parachute, emotes); replaces C2
- [ ] I8 Concept references via Codex image generation where a design question is open (magazine, weapon family sheet, holding poses); references only, never runtime assets

### D. Map and world
- [~] D3 resumed 2026-09-29 by two Opus agents in their existing worktrees (structure: `agent-a56837e37d02f5268`, vegetation: `agent-a79a28e80df904562`), reports `docs/overhaul/world-structure-report.md` and `vegetation-report.md` there. Codex is used only for images (user rule 2026-09-29).
- [x] D1 Capivara Redentora on the summit (visible from the plaza and the plane); Campinho football pitch in the empty north-east field (new district, route, signs)
- [x] D2 New architecture: Morro laje houses with rooftop terraces reached by outside stairs (11), colonial sobrados around the Vila (3), veranda farmhouses on the outskirts (4); per-lot facade colours for every house; walked by the traversal tests
- [ ] D3 World pass. User review (2026-09-28): the map still feels boring, empty, small and predictable; not enough detail on things; bridges that do not connect; vegetation looks bad. Reference mood: `docs/art/character-benchmark/wide-aim-reference.jpg` (dense lived-in streets: bougainvillea, arches, balconies, awnings, crates, barrels, potted plants, wires and lamps, harbour and a lighthouse hill). Scope: audit and fix every bridge/route connection; vegetation rebuilt (palms, bushes, flowers, grass); street dressing density; landmarks and sightlines that break predictability; empty areas (south-east corner, west near Lagoa); evaluate growing the playable area

### E. Graphics and water
- [~] E1 Sun raised to ~39 degrees (one shared sun direction); remaining: sky, grading, AO, fog review
- [x] E2 Water: navy offshore falloff, green-teal rivers (masked by flow speed), caustic cells only in the shallows, broken crest strokes offshore, sparse sun sparkles near the eye, no foam bands in narrow rivers (they met mid-channel as a dashed line)

### F. Combat, audio, VFX
- [x] F1-F3 Combat feel, controls and VFX merged 2026-09-30 (6e2a992), review passed. Integration follow-ups listed in `docs/overhaul/briefs/review-log.md` (settings screen for the new controls, crosshair FOV, viewmodel draw timing, scope flash, QA lab poses).
- [x] F2 Audio pass merged 2026-09-30 (66f218a): the always-on hiss was three fixed white-noise loops, now place-based modulated ambience; gunfire 18+ dB over footsteps with separated spectra and envelopes; procedural banks; limiter and occlusion. Needs a human audition (`tools/audio/lab.html`). Open: plane flyby, a distinct cue for shots fired toward you, saved settings keep the old music level.
- [ ] F1 Shot chain feedback (hit markers, impacts, tracers, kill feedback)
- [ ] F2 Audio pass. User issues (2026-09-29): an always-on white-noise-like background sound on the island is very annoying (find and prove the source, then fix); gunfire sounds like footsteps, so combat cannot be read by ear (make them clearly different by loudness, spectrum and envelope, with a test; research how shooters design this). Plan: Opus agent, can run beside the Codex gun agents (light load).
- [ ] F3 VFX pass

### G. Gameplay, bots, UI
- [ ] G1 Bots watched in matches, fixes
- [ ] G2 Creative additions (only those that pass the fun/identity/quality/complexity test)
- [x] G3 HUD and menus merged 2026-09-30 (18e1dba): HUD rebuilt to the mockup, death card and kill confirmation, loading screens, menu and settings fixes. Open: visual snapshot baselines need re-approval.
- [x] G4 Death and spectator camera merged 2026-09-30 (18e1dba), verified with two real clients (user issue 2026-09-29: "very bugged, very hard to spectate after you die"): reproduce every case (after death, switching targets, target dies or leaves, water and fall deaths), fix each with a test, verify with real multiplayer clients.

### H. Release gate
- [ ] H1 Perf profiling (low/medium/high)
- [ ] H2 Multiplayer verification with real clients
- [ ] H3 Full-game playtests, defect list closed
- [ ] H4 Before/after review, final report, integrate into M1, re-verify, push

## Decisions

- New FP arsenal replaces the painted palette guns entirely (the painted GLB is no longer loaded). Baked textures per weapon (1024 albedo + ORM, WebP in GLB) instead of a shared 32-colour palette: the palette could not carry light, wear or edges.
- Arms are one rig for all weapons with IK to authored grips (weapon space), instead of paws baked into each weapon mesh: this is what makes reloads and pump/bolt work possible.
- Keep Three.js + TypeScript + Vite + worker simulation + PeerJS. The architecture works and is tested; the weaknesses are content and presentation, not the stack.

## Rejected experiments

- Spiky fin fur tufts on the FP arms (read as scales/spikes); replaced with a displaced scalloped ruff + shader strands.
- First character build at 8.5 mm voxels with AO and heat weights on the full mesh: over 11 minutes; restructured to decimate first.

## Test state

- Baseline at 7f48b7d: see `docs/overhaul/progress.md` (vitest 718/718, e2e 5/5).
- The slow e2e "full Correria ... rematch" failure (host back to home mid-match) was the e2e Vite server reloading pages when a source file was saved during the run; the e2e server now runs with HMR off (`E2E_NO_HMR`).
- e81df9b: vitest 697/697 (obsolete painted-weapon tests replaced by `tests/viewmodel.test.ts`; asset contract tests rewritten for the vertex-painted character). e2e not yet re-run.

## Performance state

- Baseline: live Correria p50/p99 16.7/16.8 ms, 248 draws, 1.53M tris (from previous record).
- 2026-09-28 live Correria (dev server): p50 16.7, p99 33.4 (17 of 1200 frames over 33 ms, mostly load), 203 draws, 1.30M tris.
- Heap, same probe (`tools/qa/heap.mjs`, QA plaza, forced GC, dev server): baseline 7f48b7d 628.5 MB, overhaul de8c3fc 544.8 MB (-84 MB; ArrayBuffer data 549 -> 468 MB). The 190 MB figure in docs/heap-budget.md came from a different probe and earlier build.
