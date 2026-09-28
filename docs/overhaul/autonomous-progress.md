# Autonomous overhaul: operational record

Branch: `overhaul/aaa-autonomous` (local), started from `overhaul/m1-inventory` 7f48b7d on 2026-09-27.
M1 (`overhaul/m1-inventory`) is not touched until the whole overhaul is finished; then it is integrated, re-verified and pushed.
Previous session record: `docs/overhaul/progress.md` (kept for history).

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
- [~] C2 New run (lean, bounce, counter-twist, ear flop) and walk (waddle) clips, new TP reload; held guns ride the right paw with left-arm IK. Still open: strafe/backpedal review in motion, death and hit review, swim and parachute review

### D. Map and world
- [x] D1 Capivara Redentora on the summit (visible from the plaza and the plane); Campinho football pitch in the empty north-east field (new district, route, signs)
- [x] D2 New architecture: Morro laje houses with rooftop terraces reached by outside stairs (11), colonial sobrados around the Vila (3), veranda farmhouses on the outskirts (4); per-lot facade colours for every house; walked by the traversal tests
- [ ] D3 Environment art (vegetation, rocks, shore, props); remaining empty areas (south-east corner, west near Lagoa)

### E. Graphics and water
- [~] E1 Sun raised to ~39 degrees (one shared sun direction); remaining: sky, grading, AO, fog review
- [x] E2 Water: navy offshore falloff, green-teal rivers (masked by flow speed), caustic cells only in the shallows, broken crest strokes offshore, sparse sun sparkles near the eye, no foam bands in narrow rivers (they met mid-channel as a dashed line)

### F. Combat, audio, VFX
- [ ] F1 Shot chain feedback (hit markers, impacts, tracers, kill feedback)
- [ ] F2 Audio pass
- [ ] F3 VFX pass

### G. Gameplay, bots, UI
- [ ] G1 Bots watched in matches, fixes
- [ ] G2 Creative additions (only those that pass the fun/identity/quality/complexity test)
- [ ] G3 HUD and menus coherence

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
