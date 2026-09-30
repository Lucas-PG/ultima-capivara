# Autonomous overhaul: operational record

Branch: `overhaul/aaa-autonomous` (local), started from `overhaul/m1-inventory` 7f48b7d on 2026-09-27.
M1 (`overhaul/m1-inventory`) is not touched until the whole overhaul is finished; then it is integrated, re-verified and pushed.
Previous session record: `docs/overhaul/progress.md` (kept for history).

## CURRENT STATE (2026-09-30 15:20): read this first

Branch `overhaul/aaa-autonomous` holds every reviewed pass (see `docs/overhaul/briefs/review-log.md` for each review): world structure, vegetation, world polish, audio, UI and spectator, combat feel and VFX, short guns, character rebuild v1, bots and graphics, integration, long guns round 2, character passes round 1 and 2, the production build fix, the final polish and the world finish passes. Tests at 552ad32: vitest 1054/1054 (run with --maxWorkers=2; the vegetation determinism test times out under heavy load and passes alone), tsc clean, `npm run build` green.
Running (Claude Opus `capivara-builder` agents, resumable with SendMessage by id):
- Character round 3 (fresh agent, user rejected round 2: head looks weird with no fur, knees read bent backwards, two balls at the base of the head; director: bulging eyes, bulbous lower face, vinyl fur): agent a3bb23fbec823678c, worktree `.claude/worktrees/char-r3`, branch `char-r3`, brief `docs/overhaul/briefs/char-round3.prompt.txt`, dev server 5178.
- First-person arms matched to the character: agent af123e441d41d524a, worktree `.claude/worktrees/fp-arms-match`, branch `fp-arms-match`, brief `docs/overhaul/briefs/fp-arms-match.prompt.txt`, dev server 5177. Contract with the character agent: `capy_hand.py` geometry and the forearm, paw skin, claw and cuff colours stay frozen; re-sync the fur look at the end if round 3 changes it.
Blender builds run on the Linux machine since 14:17 (user approval): `tools/blender/remote-blender.sh` as `BLENDER_BIN` (Tailscale host lpg-arch, `lucas@100.127.155.117`, key `~/.ssh/arch_pc`, login shell fish, Blender 5.0.1 in `~/blender/blender-5.0.1-linux-x64`, remote trees in `~/capivara-remote/`). Measured: character Blender step 171 s there vs about 18 min here (bakes 92 s vs 17 min), peak 4.3 GB of 16 GB; M4 41 s. Mac and Linux builds share geometry and grip data but place wear marks differently (UV packing); each machine is reproducible. This Mac has 8 GB of RAM and was 9.7 GB into swap; the heat watchdog (`output/agents/thermal-watch.sh`) now releases throttled PIDs when the pressure drops (it used to leave a build at background priority for good). The Linux clock is about 21 s behind (NTP off; harmless, `sudo timedatectl set-ntp true` fixes it).
Final polish was reviewed and merged at 13:08 (a5a7d77) and world finish at 14:40 (552ad32); reviews in `docs/overhaul/briefs/review-log.md`. World finish known leftovers: the Rosario chapel shares the town church piece; faceted foliage remains on interior potted plants and under planters; balcony and parapet drapes are thin at 8 to 10 m.
Environment: use `export PATH=/Users/lucas_gaspe/.local/share/fnm/node-versions/v24.20.0/installation/bin:/opt/homebrew/bin:$PATH` (Node 24 and Homebrew git and python; Apple git may be blocked by an unaccepted Xcode license). Review servers: `.claude/launch.json` (`charpolish-review` 5176, `main-review` 5179; worktrees with symlinked node_modules need `output/review/vite.review.config.ts`). Blender turns: `tools/blender/wait-for-blender.sh`. Image tools: `magick` (no PIL).
Rules: Claude Opus subagents for all delegated work (user, 2026-09-30); the user resets Claude limits themselves (they switched accounts at 11:45 after the 5-hour limit); Codex only for images; one Codex reset was used (2 left, not to be used); no new weapons.
Notes from 12:30: the final polish agent may now fix world, vegetation, loot, VFX, UI and viewmodel code defects itself (no Blender, no character files, grips re-probed if a paw or gun moves). Director findings sent to it: the scoped view is a peephole (lens 63 percent of the screen height on flat black; wanted about 90 percent with a shaded scope body) and QA poses after a `results` pose lose the HUD (`#hud.ended` is never cleared by the QA hook). A multiplayer e2e run on the main checkout at 12:04 timed out in its first test under thermal throttle (load above 40) and was stopped: rerun at the release gate on a quiet machine. `tests/visual/baselines/` is gitignored and was approved in the integration worktree only: the release gate must regenerate, review and approve the baselines on the final build. `overhaul/m1-inventory` is still at 7f48b7d (an ancestor), so the final integration is a fast-forward; the largest new file is 11.4 MB. The final report draft is committed with its release gate sections marked PENDING. Plan for the first-person arms once the character is final: repaint them to the character's fur and paw skin (`paint_skin` and `fur_mask` in `tools/blender/fp_arms.py`, no geometry or grip change), after the user has seen the character; matching the paw shape too would mean re-fitting all nine grips and is the user's call.

Release gate prepared (12:50): `output/review/m1-base` is a detached M1 worktree (7f48b7d, cloned node_modules) to run `npx playwright test -c playwright.perf.config.ts` for a same-machine before/after perf table (both use port 4186: run one after the other on a quiet machine); `output/review/final-evidence.sh` captures the baseline pose names and live shots from `BASE` and builds 12 labelled before|after sheets into `docs/overhaul/evidence/final/` (dry-run tested, about 3 MB). Gate doc chores: update `public/models/SOURCES.md` (it still says ten weapons and describes the old skin-modifier arms) after the character merge.

Remaining plan, in order:
1. Review the character round 2 (same boards, same cameras, target next to game), merge it, then show the user and decide with them how to match the first-person arms to the character (look, and possibly paw shape plus a grip refit on all nine weapons). The user wants to see the character before that step. Also check the pre-rendered capybara portraits in `public/assets/ui/` against the final character.
2. Release gate: perf on Low, Medium and High on a quiet machine; multiplayer with real clients (`npx playwright test --project=chromium`, harness on 5174 and 9001); full playtests with the defect list closed; before/after evidence against `docs/overhaul/evidence/baseline/`; `npm run check`, `npm test`, `npm run build`, Playwright visual, perf and multiplayer checks.
3. Write `docs/overhaul/final-overhaul-report.md` (changes, decisions, art direction, POV, weapons, character, world, rendering, combat, audio and VFX, gameplay, technical, tests, multiplayer, perf, assets and licences, before/after, limitations; human audition needed for the new audio).
4. Integrate into `overhaul/m1-inventory`, re-verify there, commit, push `lucas overhaul/m1-inventory` (pre-approved by the user for this final push only), then brief the user.

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
- [x] I7 Character rebuild merged 2026-09-30 (review passed; polish delegated to Codex agent `char-polish`). Remaining builds (integration, bots and graphics, character polish) run as Codex astra agents from 03:20 (Claude weekly at 93%); briefs in `docs/overhaul/briefs/*.codex.txt`.
- [~] (history) I7 Character rebuild delegated 2026-09-30 01:35 to an Opus agent (worktree `character`, brief `docs/overhaul/briefs/character.prompt.txt`; Blender turns via `tools/blender/wait-for-blender.sh`). Short guns merged 2026-09-30 (388febc, review passed).
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
