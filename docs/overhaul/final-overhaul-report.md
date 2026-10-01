# Última Capivara: final overhaul report

Branch `overhaul/aaa-autonomous`, started from `overhaul/m1-inventory` 7f48b7d on 27 September 2026.
Goal: turn the M1 build into a cohesive stylized shooter (Overwatch, Fortnite and Valorant as the quality bar; a Brazilian tropical island where the players are capybaras), in this order of priority: first-person view and feel, weapons, character and animation, map, graphics, combat feel with audio and VFX, gameplay, then UI, bots, performance and multiplayer.

Each pass has its own detailed report in `docs/overhaul/` (measurements, evidence, tests). This document is the summary and the map to them. Review verdicts for every delegated pass are in `docs/overhaul/briefs/review-log.md`.

## 1. Outcome

Done and pushed to `overhaul/m1-inventory` on 1 October 2026 (a fast-forward of `overhaul/aaa-autonomous`; the M1 branch had not moved since 7f48b7d).

- Every area of the brief was rebuilt or reworked by a delegated pass, each reviewed by the orchestrator against independent captures before it was merged. Work below the bar went back: the long guns once (fingers-up support grips), the character four times (rounds 1 and 3 by the orchestrator, round 2 rejected by the user, round 4 for its fur-shell cost), and the final polish findings became a world finish pass.
- Release gate on the final build, on this machine (Apple M2, 8 GB, real Chrome with ANGLE Metal, 1280x720): type check clean, 1,057 of 1,057 unit tests, production build green; 11 of 11 browser tests including every multiplayer test with two real game clients over PeerJS and the full Correria match with rematch; 171 visual baselines regenerated, reviewed by eye and passing; the same performance test run on M1 and on the final build back to back on a quiet machine (section 6); before and after sheets from the same cameras (section 8).
- At the bar now: first person (arms that are the character's own paws, nine reworked weapons, measured grips), the world at street level and from the plane, combat feel and effects, the HUD, menus and spectating, the character's body, outfit and animation.
- Short of the bar or unheard: the new audio has not been heard by a person; Medium and High run about 43 fps (not 60) in the 16-capybara plaza scene on this M2, as M1 did (section 6); the open items in section 9.

## 2. What changed, by area

### 2.1 First-person view

Before: a small blocky gun low in the corner, plain brown tubes for arms with paws baked into each gun, a 78 degree vertical field of view (fisheye), one sine bob and one recoil spring for every gun.

Now:
- One arm rig for every weapon, with inverse kinematics to authored grips in weapon space. The arms are the third-person character's own arms: its paw (`tools/blender/capy_hand.py`, imported by `fp_arms.py`) at 1/1.3 scale, because third-person guns are drawn 1.3 times bigger to fit that paw, so the paw-to-gun proportion is the same in both views (tested); the character's forearm, rolled linen cuff, palette, combed fur and fur shells; bare leathery palm and digits, blunt claws. Built on the Linux machine: 30k triangles, 1.06 MB.
- Per-weapon framing at the hip, aimed and sprinting; look inertia, gait bob, strafe tilt, jump, land and crouch springs; per-weapon recoil springs; draw and holster.
- Every mechanism moves: slides, hammers, pump, bolts, cylinder and crane, charging handles, magazines, shells, the coconut hopper.
- Reloads are keyframed per family with paw contacts that follow the moving part: empty and tactical magazine swaps, the revolver's ejector and speedloader, shell-by-shell shotgun loading, the bolt-action cycle. Inspect on every gun.
- Grips are data (`src/render/fp-grips.json`, shared with the third-person holds) and were re-fitted to the new paw for all nine weapons in every state (hip, aimed, sprint, fire, draw, inspect, every reload); approach keys are offsets from their contact keys. Worst clearance -0.5 mm over 1,244 sampled poses. Grips were measured, not eyeballed: `tools/qa/grip-probe.mjs` reports the signed distance of each digit to the gun and its angle around the bore; `tools/qa/grip-fit.mjs` solves wrist, curls and thumb spread against an intent.
- Field of view is horizontal (default 100, range 80 to 120); the viewmodel has its own lens per weapon (56 to 60).
- Aiming: mild tangent-correct zoom per weapon, sensitivity relative to the lens, open sights where the design has them, a redrawn scope (bezel, tint, duplex and chevron reticles) with a flash inside the lens.

Reports: `guns-short-report.md`, `guns-long-report.md`, `fp-arms-report.md`, `fp-arms-research.md`. References: `docs/art/references/` (boards and research notes; guides, not anatomy truth).

### 2.2 Weapons

Nine weapons (the slingshot was removed at the user's request; no new weapons, also by request).

- New pipeline (`tools/blender/arsenal.py`, `arsenal_lib.py`, `build-fp.mjs`, `build-world-arsenal.mjs`): profile-built parts with bevels, one UV layout per weapon, Cycles bakes (material id, occlusion, edge mask, object normal, weapon-space position) composited into albedo, ORM and normal maps; wood grain; weathering; stencilled liveries from `tools/art/stencils/`.
- Each gun has an identity: teal enamel Pistola with a palm inlay; engraved Trinta-e-oito with capybara medallions; the yellow and green Canarinho SMG with the blue star; the M4 with coral palm fronds; the Doze with a side saddle; the Carabina and the bolt sniper with their scopes; the bamboo Lança-coco with its hopper; the Facão with Bonfim ribbons that trail the swing.
- Budgets held: every first-person gun under 25k triangles and 1.3 MB (the Lança-coco is 25.8k, accepted). Third-person and ground versions are built from the same models into one shared atlas.

### 2.3 Character

Four rounds after the first rebuild, each reviewed against the targets at the same cameras (boards in `output/review/char-r2/` and `docs/overhaul/evidence/char-polish/`):
- Round 1: re-sculpted head and cloth, 4K painted maps, LOD0 40.5k triangles, groomed fur shells, eight walk and crouch directions with planted feet, the rebuilt Capivara Redentora.
- Round 2: a broad build with its own big leathery paws, two legs in a wide stance, a knotted bandana, pleated hip rag, canvas rucksack and blanket roll, a breathing idle and a low-ready armed idle with springs on the loose gear, holds re-fitted for all nine weapons (third-person guns drawn 1.3 times bigger to fit the paw), and High, Medium and Low texture tiers chosen by the graphics setting at load (final files 6.3, 3.6 and 2.7 MB; 192, 48 and 12 MB of GPU memory).
- Round 3, by a fresh agent at maximum effort after the user rejected round 2: knees that bent backwards in every clip (the leg IK pole pointed backward), a cartoon capybara head without the cheek lobes, fur that reads as fur (combed locks with a darker crown, nape and back), team colour readable at 60 m, the statue rebuilt and validated.
- Round 4: open, bright eyes with catchlights, furred blinks, golden fur in shade, a paler muzzle; fur shells tiered by distance so a close crowd costs what round 2 did.
Direction from the user on the final day: a fun, cartoonized capybara humanoid; the references are guides, not specs.

Reports: `character-report.md`, `char-polish-report.md`.

### 2.4 World

Before: a 240 m island with flat fields, one repeated house template, bridges that ended in grass, gaps in the quay walls, floating stairs, empty corners.

Now:
- Integrity fixed and guarded by tests (`tests/world-integrity.test.ts`, `tests/enclosures.test.ts`): bridges land on streets, continuous mitred quays, stairs that stand on the ground, docks over water, nothing hovering or sunk, every walled yard has a gate, and no pocket, roof, spawn or pickup can trap a player.
- A dense colonial town: continuous terraced fronts, becos, quintais with whitewashed walls and gates, squares, a market largo, a harbour with a pier, crane and warehouse.
- New places where the map was empty: the Palafitas stilt village on a tidal lagoon (south-east), the Engenho with its mill hall, chimney and water wheel (west), the 20 m stone stair to the Capela do Morro, the Rua da Praia toward the lighthouse, the Campinho football pitch, the Capivara Redentora on the summit.
- Street life: shop signs in Portuguese, lanterns, bulbs and festa flags on cables, laundry over the alleys, cafe tables, carts, nets, cargo, painted adverts on end walls.
- Vegetation rebuilt from painted foliage: folded coconut fronds, tiered broadleaf crowns with forked limbs, flowering ipê and flamboyant, mangrove prop roots, bougainvillea on eaves and posts, garden beds, a real lawn, meadow and dune grass. Nothing on the ground is taller than 0.62 m, so grass never hides a crouched player, and bushes no longer fade at range.
- The kit grew from 56 to 89 pieces and stays inside its download budget.
- Pickups rebuilt as objects (vest, helmet, ammo can, medkit, bandage, guaraná can, açaí bowl, rapadura); the supply drop has a light column and signal smoke.

- Final polish: no leaf grows inside a room any more (60 plants had leaves in buildings; a test checks every drawn leaf against every room), foliage stays off arena spawns, loot beams thin out up close so they never cover the crosshair.
- World finish: the faceted bougainvillea baked into the town facades was replaced by painted plantings and drapes (doors and windows kept clear); a world-space stone layer gives rocks and cliffs joints, grain and relief up close; the offshore islets were rebuilt as granite morros over forest with coves, surf and palms; the Capela do Morro became its own hill chapel; terrace end walls and the Campinho stands were dressed; spawns reject spots under tree crowns (tested).

Reports: `world-structure-report.md`, `vegetation-report.md`, `world-polish-report.md`, `final-polish-report.md`, `world-finish-report.md`.

### 2.5 Rendering

- One aerial-perspective haze for every material and the sky, clear inside 40 m where fights happen.
- Blue sky with the sun disc on the real light direction, daylight clouds, warm key light and cool shadows, a colour grade after tone mapping.
- Water: turquoise over sand, teal lagoons and rivers, blue offshore, caustics only in the shallows, no foam bands in narrow rivers.
- Low gains a short-range sun shadow (objects no longer float); Medium and High keep contact occlusion, bloom and sun shafts.
- Draw calls fell 9 to 44 percent in the measured world views while the world got denser (batched far furniture, merged signs and street dressing, real middle and far levels for props, vegetation in one batch).

Report: `bots-graphics-report.md` (graphics half).

### 2.6 Combat feel, controls and VFX

- Your own shots are predicted on the click (flash, kick, sound, tracer, impact): 30 to 48 ms sooner in practice, more for network guests. The host still decides every hit.
- Balance by range: body time to kill 0.4 to 0.6 s for automatics (the M4 went from 0.25 s to 0.46 s), each gun owns a range, no common gun kills a fresh capybara with one body shot.
- Handling: draw times, sprint-out delay, per-gun move speed and aimed walk speed, exact cadences, a bounded centre-weighted spread, learnable recoil that pays off counter-movement, a fixed shotgun pattern.
- Controls from one model (`src/controls.ts`): every action rebindable, hold or toggle for aim, crouch and sprint, invert Y, aimed and scoped sensitivity, camera shake, quick melee (V), previous weapon (X), coyote jump. The settings screen is built from the same model.
- Camera kick, flinch, blast shake, low-health grey; 18 painted effect sheets (muzzle flashes per gun, impacts per surface, the coconut blast, tracers, marks).

Reports: `combat-report.md`, `combat-research.md`.

### 2.7 Audio

- The always-on hiss was three fixed two-second white-noise loops. They are gone: ambience is now place-based and modulated (surf in wave cycles, gusty wind, leaf flurries, harbour, waterfall, birds from real trees). Idle noise floor went from -54.7 to -67.4 dBFS.
- Gunfire and footsteps now differ on every axis: own shots are 18 dB or more above own steps, guns carry low-end energy and long tails, steps are short and light. Tests fail on a replica of the old design.
- Everything is generated in code and baked in a worker (the old MP3s are removed): guns near and far, mechanisms timed to the viewmodel, impacts per surface, movement per material, hit and kill confirms, pickups, storm, supply balloon, music (bossa nova menu loop, batucada on the drop, endgame pulse, stingers).
- Mix with a loudness hierarchy, a limiter, occlusion through walls, HRTF on High, near-miss cracks, an incoming-fire cue.
- Needs a human listen: every judgement so far is from measurements and spectrograms (`tools/audio/lab.html`).

Reports: `audio-report.md`, `audio-research.md`.

### 2.8 UI, HUD, menus and spectating

- Spectating rebuilt: a smoothed over-the-shoulder follow camera on the interpolated pose, wall pull-in, the eliminator first, both directions, a hold on a fallen target, a watch bar with the target's vitals. Verified with two real clients (the camera moved in 174 of 180 frames; before it stood still in 120).
- HUD rebuilt toward a mockup: teal plates, portrait vitals, four weapon boxes with thumbnails from the models, magazine card, compass with the safe-zone bearing, minimap with the match strip, kill feed, death card, elimination confirmation.
- Loading scenes per mode, results with a podium, a watching menu, settings that fit and scroll on short windows.

- Final polish: the spectator camera rises over or swings along walls and treats foliage as soft (live: the watched capybara on screen in 97.9% of samples, within 1.2 m in 1.3%); scopes fill 90% of the screen height inside a lit scope body over a blurred, darkened world (was a 63% lens on black); the HUD was checked at 1280x720, 1600x900, 1920x1080 and 2560x1440 at interface scales 80, 100 and 120% with zero overlaps; the HUD is complete after a rematch in every mode.
- World finish: a near-camera foliage fade, local camera only, so first person, the death cam and the spectator never sit inside a bush (other players still see the bush as before).

Reports: `ui-report.md`, `ui-research.md`, `integration-report.md`, `final-polish-report.md`.

### 2.9 Bots and gameplay

- Bots measured over 8 full matches per mode against the original: stuck time per bot-minute 2.2 to 0.7 s (royale) and 2.7 to 0.5 s (deathmatch), storm deaths 23 to 0, water deaths 83 to 3.
- Strafing now spoils bot aim on Easy and Normal; rusher, anchor and flanker styles; yards and gates are part of the route network.
- Modes unchanged in rules (battle royale, Correria, Corrente, deathmatch, practice); respawn modes count falls in the results.

Report: `bots-graphics-report.md` (bots half).

### 2.10 Build pipeline

- Blender builds run on a Linux build machine over Tailscale (`tools/blender/remote-blender.sh` as `BLENDER_BIN`): it sends changed inputs, runs Blender 5.0.1 with every thread and brings the results back. A full character build takes about 3.5 minutes there against about 18 minutes on the development Mac (texture bakes 92 s against 17 minutes); weapons take under a minute. Builds are reproducible on each machine; between machines geometry, parts and grip data are identical and only wear-mark placement differs (UV packing).
- The production build was broken by a dead CSS rule and fixed early in the final day.

## 3. Decisions

- Keep Three.js, TypeScript, Vite, the worker simulation and PeerJS. The architecture works and is tested; the weaknesses were content and presentation.
- Baked textures per weapon instead of the shared 32-colour palette: the palette could not carry light, wear or edges.
- One arm rig with IK to authored grips instead of paws baked into each gun: it is what makes reloads, pumps and bolts possible.
- Fill the island instead of growing it: the problem was emptiness, not size, and growing it would change the storm, the map, spawns and the backdrop.
- Procedural audio instead of samples: full control of loudness, spectrum and envelope, no licences to track, smaller download.
- Third-person spectating instead of first person: it needs no viewmodel for the watched player and reads better at 20 Hz snapshots.
- Client-side prediction of own shots with a seeded spread: aim was already client authoritative, the host still decides hits.
- Delegation: independent passes ran as Claude Opus agents in git worktrees, each reviewed against independent captures before merging and sent back when below the bar (section 1). Codex was used for image generation only, after the user's instruction.
- Removed by user decision: the slingshot. Deferred by user decision: three proposed new weapons (`docs/art/references/new-weapons.md`).
- Character direction (user, final day): a fun, cartoonized capybara humanoid; references are guides, not specs. Round 2 was rejected (head without fur, knees reading bent backwards, two lobes at the base of the head) and rebuilt by a fresh agent from round 2 in small steps.
- First-person arms built from the third-person character's own paw at 1/1.3 scale, because third-person guns are drawn 1.3 times bigger to fit that paw: the paw-to-gun proportion matches in both views.

Rejected experiments: spiky fin fur on the arms (read as scales), a 1.18 paw scale (rejected in user review), a Codex lighting draft that washed colour out, a sprite flash inside the scope (read as a sticker), wrapping the dead HUD zoom rule instead of deleting it (it would have zoomed the reload pill twice).

## 4. Tests

Final build (the commit pushed to M1):
- `npx tsc --noEmit`: clean. `npm run build`: green.
- `npx vitest run --maxWorkers=2`: 1,057 of 1,057 in 115 files (718 at the start of the overhaul). New suites guard the world (bridges, quays, stairs, docks, no trapped pockets, leaves out of rooms and off spawns), weapons and grips (clearances, ADS alignment, reload contacts), the character (hit volume in every clip, planted feet in 16 directions, the first-person paw equal to the world paw over 1.3), audio (no steady hiss, gunfire distinct from steps), spectating, controls, settings, HUD layout and the network protocol. Under heavy load a few world and loading suites time out at the default and pass alone.
- Browser tests (`npx playwright test --project=chromium`, real Chrome with ANGLE Metal): 11 of 11, including `E2E_SLOW=1` for the full-match rematch gate (section 5), the scope flash, results and settings flows.
- Visual (`playwright.visual.config.ts`): 171 baselines regenerated on the final build, reviewed by eye on contact sheets and passing (2 of 2 tests, including the character mask). `tests/visual/baselines/` is gitignored; the approved hashes are in `docs/overhaul/evidence/final/approved-baselines.json`.

## 5. Multiplayer

Release gate, quiet machine (load 3 to 9), two real Chrome game clients over a local PeerJS signaling server (`tests/network-game.e2e.spec.ts`, `tests/network.e2e.spec.ts`), all passing:
- two Corrente clients join, replicate movement and emotes, show the round trip time and recover the same player after a reload;
- a silent room shows the join timeout and its retry button recovers;
- a Correria guest selects, drops and picks a gun back up through the host;
- a guest sees its own rounds on the input frame (shot prediction) and the host confirms each exactly once;
- host and guest exchange the lobby, gameplay, recovery and close;
- a full Correria ends on both clients and the host starts a clean rematch (5.6 minutes, `E2E_SLOW=1`).
Protocol version 12 (shot sequence numbers, jump flag). The spectator camera was also verified with two real clients during the UI pass.

## 6. Performance

Same test, same machine, back to back on 1 October at 02:10 to 02:15 (load average 5 to 7): `tests/perf/perf.spec.ts` (16 capybaras in the QA plaza, 1280x720, 5 s of real frame intervals per preset; downloads counted through the menu and the match). M1 is the original branch (7f48b7d) in a detached worktree.

| Preset | M1 fps (p95 ms) | Final fps (p95 ms) | Draws M1 / final | Triangles M1 / final | JS heap MB M1 / final |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 25.1 (83.4, 12 frames over 50 ms) | 60.0 (16.7, none over 50 ms) | 215 / 136 | 0.76M / 1.32M | 631 / 231 |
| Medium | 44.7 (33.4) | 43.7 (33.4) | 305 / 155 | 1.60M / 1.69M | 619 / 240 |
| High | 44.1 (33.4) | 42.1 (33.4) | 334 / 182 | 1.70M / 2.02M | 643 / 237 |

- Low went from 25 to a steady 60 fps; Medium and High hold the same frame rate as M1 while drawing a far richer world and characters, with about half the draw calls; the JS heap fell by about 63% on every preset.
- Medium and High miss 60 fps in this crowded plaza scene on an M2 both before and after (about 23 ms per frame on average, frames alternating between one and two vsync intervals). Live matches measured during the passes ran at 58 to 61 fps fresh (integration pass) and 16.7 ms p50 on every preset in practice Correria (final polish pass), under shared load. A close crowd of 15 capybaras costs 5 to 8 ms of GPU for the fur shells after the round 4 fix (round 2: 7 ms).
- Download: the menu is 0.69 MB gzipped (0.64 before); a match downloads 30.1 MB on Low, 31.0 on Medium and 33.7 on High (19.7 before), mostly the kit, the weapons and the character tiers (High 6.3 MB, Medium 3.6, Low 2.7; GPU memory 192, 48 and 12 MB).
- No leak in long runs: resource counts stayed flat over a 532 s Correria round (882 geometries, 90 textures, 78 programs); about 5.7 KB of garbage per frame.

## 7. Assets and licences

- No external asset was downloaded for the overhaul and nothing was bought. Models are built by the Blender scripts in `tools/blender/`; audio is generated by the code in `src/sound/`.
- Painted sources (foliage sheets, weapon stencils, effect sheets, loading scenes, reference boards and concept sheets) were generated with the Codex image tool from prompts recorded in `docs/assets.md`, next to the existing records.
- Fonts come from the npm packages already in the project.
- Tools only, never shipped: Blender 5.0.1 for Linux (GPL, the official download from blender.org, checksum verified) on the build machine.

## 8. Before and after

Sheets in `docs/overhaul/evidence/final/` put each view of the 27 September baseline (`output/baseline`, before any change) next to the final build, same QA pose or the same scripted live sequence, 1280x720: `01-first-person` and `02-aiming` (all weapons), `03-third-person`, `04-ground-weapons`, `05-character-and-emotes`, `06-world-views`, `07-districts`, `08-interiors`, `09-effects-water-supply`, `10-hud-pause-results`, `11-live-deathmatch`, `12-live-battle-royale`. The slingshot tiles show "not in this build" (removed at the user's request). Per-pass before and after boards are in the evidence folder of each pass.

## 9. Limitations and follow-ups

Known at the release gate:
- The new audio has not been heard by a person: every judgement is from measurements and spectrograms (`tools/audio/lab.html` to audition).
- Medium and High run about 43 fps in the 16-capybara plaza scene on an M2 (as M1 did); a GPU profile of that scene is the next performance step. KTX2 texture compression (no encoder on this machine yet) would also cut GPU memory and download.
- Character: a closed eye reads as a round lid inside a dark ring from the front at 1 m; yellow is the weakest team colour at 60 m in shade; the fur is stylized (painted locks plus shells), not strand-level.
- First-person arms: during the pistol reload the two paws overlap each other for about 0.2 s (never the gun); the trigger digit rests on the trigger from outside the guard; the third-person Carabina still carries the sling the first-person model stowed; `paw_sculpt.py` is no longer used.
- Trees and bushes have no collision (by the existing design).
- Bots do not path up the Capela stair (they use the graded path) and sometimes swim under the Palafitas decks.
- No first-person spectating.
- Remote gunfire does not change with the shooter's facing; no per-enemy threat scoring.
- The Rosario chapel still shares the town church kit piece; a few interior potted plants keep the faceted kit foliage; balcony and parapet drapes are thin at 8 to 10 m.
- The spectator lens can still come under 1 m for a moment in tight rooms, the narrow street by the market hall and past lamp posts.
- The near-camera foliage fade is a dither, visible as a stipple in still frames.
