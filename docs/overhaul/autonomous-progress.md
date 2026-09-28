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
- [ ] A1 Weapon asset pipeline v2 (Blender): bevelled geometry, baked AO + edge light in vertex colours, sockets (grip_r, grip_l, mag, action, muzzle, eject, sight)
- [ ] A2 Capybara FP arms: skinned, fingerless gloves, fur clumps, IK to weapon sockets, finger poses
- [ ] A3 Viewmodel animation: framing, sway/inertia, bob, sprint per class, ADS, recoil + mechanism, per-weapon reloads, draw/holster, jump/land, crouch, lean, swim, melee
- [ ] A4 FOV semantics (horizontal FOV setting, sane default) and viewmodel FOV
- [ ] A5 Weapon switching and inventory UX

### B. Weapons (hero pass for all 10)
- [ ] B1 Pistol, Revolver, SMG, M4, Doze, Lança-coco, Carbine, Sniper, Facão, Estilingão rebuilt to the new standard
- [ ] B2 Third-person and ground versions from the same source (LOD)
- [ ] B3 Per-weapon feel: recoil patterns, sounds, muzzle, tracers, handling

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

- Keep Three.js + TypeScript + Vite + worker simulation + PeerJS. The architecture works and is tested; the weaknesses are content and presentation, not the stack.

## Rejected experiments

(none yet)

## Test state

- Baseline at 7f48b7d: see `docs/overhaul/progress.md` (vitest 718/718, e2e 5/5).

## Performance state

- Baseline: live Correria p50/p99 16.7/16.8 ms, 248 draws, 1.53M tris (from previous record).
