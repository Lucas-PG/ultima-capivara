# Última Capivara: final overhaul report

Branch `overhaul/aaa-autonomous`, started from `overhaul/m1-inventory` 7f48b7d on 27 September 2026.
Goal: turn the M1 build into a cohesive stylized shooter (Overwatch, Fortnite and Valorant as the quality bar; a Brazilian tropical island where the players are capybaras), in this order of priority: first-person view and feel, weapons, character and animation, map, graphics, combat feel with audio and VFX, gameplay, then UI, bots, performance and multiplayer.

Each pass has its own detailed report in `docs/overhaul/` (measurements, evidence, tests). This document is the summary and the map to them. Review verdicts for every delegated pass are in `docs/overhaul/briefs/review-log.md`.

DRAFT NOTE: sections marked PENDING are filled in at the release gate.

## 1. Outcome

PENDING (final state, what is at the bar, what is not).

## 2. What changed, by area

### 2.1 First-person view

Before: a small blocky gun low in the corner, plain brown tubes for arms with paws baked into each gun, a 78 degree vertical field of view (fisheye), one sine bob and one recoil spring for every gun.

Now:
- One arm rig for every weapon, with inverse kinematics to authored grips in weapon space. Paws are a sculpted, baked asset (`tools/blender/paw_sculpt.py`, `fp_arms.py`): pads, plump digits with creased joints, an opposable thumb, claws, fur shells on the forearm and the back of the paw, a rolled linen cuff.
- Per-weapon framing at the hip, aimed and sprinting; look inertia, gait bob, strafe tilt, jump, land and crouch springs; per-weapon recoil springs; draw and holster.
- Every mechanism moves: slides, hammers, pump, bolts, cylinder and crane, charging handles, magazines, shells, the coconut hopper.
- Reloads are keyframed per family with paw contacts that follow the moving part: empty and tactical magazine swaps, the revolver's ejector and speedloader, shell-by-shell shotgun loading, the bolt-action cycle. Inspect on every gun.
- Grips were measured, not eyeballed: `tools/qa/grip-probe.mjs` reports the signed distance of each digit to the gun and its angle around the bore; `tools/qa/grip-fit.mjs` solves wrist, curls and thumb spread against an intent. Accepted clearances: worst -0.4 mm (long guns) and -0.3 mm (short guns) across hip, aim, fire, inspect and full reloads.
- Field of view is horizontal (default 100, range 80 to 120); the viewmodel has its own lens per weapon (56 to 60).
- Aiming: mild tangent-correct zoom per weapon, sensitivity relative to the lens, open sights where the design has them, a redrawn scope (bezel, tint, duplex and chevron reticles) with a flash inside the lens.

Reports: `guns-short-report.md`, `guns-long-report.md`. References: `docs/art/references/` (boards and research notes; guides, not anatomy truth).

### 2.2 Weapons

Nine weapons (the slingshot was removed at the user's request; no new weapons, also by request).

- New pipeline (`tools/blender/arsenal.py`, `arsenal_lib.py`, `build-fp.mjs`, `build-world-arsenal.mjs`): profile-built parts with bevels, one UV layout per weapon, Cycles bakes (material id, occlusion, edge mask, object normal, weapon-space position) composited into albedo, ORM and normal maps; wood grain; weathering; stencilled liveries from `tools/art/stencils/`.
- Each gun has an identity: teal enamel Pistola with a palm inlay; engraved Trinta-e-oito with capybara medallions; the yellow and green Canarinho SMG with the blue star; the M4 with coral palm fronds; the Doze with a side saddle; the Carabina and the bolt sniper with their scopes; the bamboo Lança-coco with its hopper; the Facão with Bonfim ribbons that trail the swing.
- Budgets held: every first-person gun under 25k triangles and 1.3 MB (the Lança-coco is 25.8k, accepted). Third-person and ground versions are built from the same models into one shared atlas.

### 2.3 Character

PENDING (round 2 in progress). State after round 1: re-sculpted head and cloth, 4K painted maps, LOD0 40.5k triangles, groomed fur shells, eight walk and crouch directions with planted feet (median sole slip under .03 m/s), rebuilt Capivara Redentora statue, team colour in the rim at range. Reports: `character-report.md`, `char-polish-report.md`.

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

- Final polish: no leaf grows inside a room any more (60 plants had leaves in buildings; a test checks every drawn leaf against every room), foliage stays off arena spawns, and pickups carry a light column when a supply drop is announced.
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

- Final polish: the spectator camera rises over or swings along walls and treats foliage as soft (live: the watched capybara on screen in 97.9% of samples, within 1.2 m in 1.3%); scopes fill 90% of the screen height inside a lit scope body over a blurred, darkened world (was a 63% lens on black); the HUD was checked at 1280x720, 1600x900, 1920x1080 and 2560x1440 at interface scales 80, 100 and 120% with zero overlaps; the HUD is complete after a rematch in every mode; the eight non-weapon pickups were rebuilt with their own silhouettes (vest, helmet, ammo can, medkit, bandage, guarana can, acai bowl, rapadura).
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
- Delegation: independent passes ran as Claude Opus agents in git worktrees, each reviewed against independent captures before merging; two passes were sent back (long guns round 1, character round 1). Codex was used for image generation only, after the user's instruction.
- Removed by user decision: the slingshot. Deferred by user decision: three proposed new weapons (`docs/art/references/new-weapons.md`).

- Character direction (user, final day): a fun, cartoonized capybara humanoid; references are guides, not specs. Round 2 was rejected (head without fur, knees reading bent backwards, two lobes at the base of the head) and rebuilt by a fresh agent from round 2 in small steps.
- First-person arms built from the third-person character's own paw at 1/1.3 scale, because third-person guns are drawn 1.3 times bigger to fit that paw: the paw-to-gun proportion matches in both views.

Rejected experiments: spiky fin fur on the arms (read as scales), a 1.18 paw scale (rejected in user review), a Codex lighting draft that washed colour out, a sprite flash inside the scope (read as a sticker), wrapping the dead HUD zoom rule instead of deleting it (it would have zoomed the reload pill twice).

## 4. Tests

PENDING (final counts). At b1c0424: `npx tsc --noEmit` clean, `npx vitest run` 1037 of 1037 in 113 files, `npm run build` green. Visual suite: 165 baselines reviewed and installed locally during integration (the baselines folder is gitignored; approvals are recorded in `evidence/integration/approved-baselines.json`).

## 5. Multiplayer

PENDING (release gate run with real clients on a quiet machine). Protocol version 12 (shot sequence numbers, jump flag).

## 6. Performance

PENDING (release gate numbers on Low, Medium and High on a quiet machine).

## 7. Assets and licences

- No external asset was downloaded for the overhaul and nothing was bought. Models are built by the Blender scripts in `tools/blender/`; audio is generated by the code in `src/sound/`.
- Painted sources (foliage sheets, weapon stencils, effect sheets, loading scenes, reference boards and concept sheets) were generated with the Codex image tool from prompts recorded in `docs/assets.md`, next to the existing records.
- Fonts come from the npm packages already in the project.

## 8. Before and after

PENDING (`docs/overhaul/evidence/final/`, same cameras as `docs/overhaul/evidence/baseline/`).

## 9. Limitations and follow-ups

PENDING (consolidated at the release gate). Known now:
- The new audio has not been heard by a person.
- Trees and bushes have no collision (by the existing design).
- Bots do not path up the Capela stair (they use the graded path) and sometimes swim under the Palafitas decks.
- All three churches share one kit piece.
- No first-person spectating.
- Remote gunfire does not change with the shooter's facing; no per-enemy threat scoring.
- KTX2 compressed textures are not used (no encoder on this machine), so GPU texture memory is higher than it could be.
- The Rosario chapel still shares the town church kit piece; a few interior potted plants keep the faceted kit foliage; balcony and parapet drapes are thin at 8 to 10 m.
- The spectator lens can still come under 1 m for a moment in tight rooms, the narrow street by the market hall and past lamp posts.
- The near-camera foliage fade is a dither, visible as a stipple in still frames.
