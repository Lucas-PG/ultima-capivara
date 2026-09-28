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
- [ ] B4 Remaining polish: M4 mag swap is low in frame; shotgun/coco ADS see the stock; slingshot paw placement; scope overlay review

### C. Character
- [ ] C1 Capybara redesign and rebuild (model, face, fur, gear), LODs
- [ ] C2 Animation set and runtime blending (locomotion, aim, reload, hit, death, parachute, swim)

### D. Map and world
- [ ] D1 Macro layout review, districts with identity, landmarks, routes
- [ ] D2 Architecture variety and working interiors
- [ ] D3 Environment art (vegetation, rocks, shore, props)

### E. Graphics and water
- [ ] E1 Lighting, sky, grading, AO, fog
- [ ] E2 Water (sea, river, shore, underwater)

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

## Performance state

- Baseline: live Correria p50/p99 16.7/16.8 ms, 248 draws, 1.53M tris (from previous record).
