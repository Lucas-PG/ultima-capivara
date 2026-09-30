# Integration and polish

Worktree `integration`, branch `integration` (base `1a5a004`, merged with `overhaul/aaa-autonomous` at `d6d483b`). 2026-09-30.

A Codex agent started this brief. Its commits were reviewed and kept, with two exceptions: its single-worker Vitest config was reverted, and its scope flash was redone. Claude finished the remaining items and fixed the bugs found in full matches.

## Items

| # | Item | State |
|---|------|-------|
| 1 | Settings screen covers every controls option and every action | Done |
| 2 | Crosshair treated horizontal FOV as vertical | Done |
| 3 | Supply flyby sound, incoming-fire cue, music migration | Done |
| 4 | Muzzle flash inside the DMR and sniper scopes | Done |
| 5 | Stale QA poses and visual baselines | Done: 165 baselines reviewed and installed |
| 6 | Full bot matches in every mode, integration bugs fixed | Done: 11 complete rounds, 0 page errors |
| + | Walled garden at (6, 68) traps players (orchestrator addition) | Done, with a connectivity test for the whole island |

### 1. Settings and rebinding (`src/ui/ui.ts`, `src/ui/hud-logic.ts`, `src/controls.ts`)
- The "COMO VOCÊ JOGA" card is built from `CONTROL_OPTIONS`. Four toggles sit on one row and three multipliers on the next. Each control uses the model's own label, help text, min, max and step.
- The rebinding list is built from `CONTROL_ACTIONS`, grouped by `ControlGroup`, so V (quick melee) and X (previous weapon) are included. The old duplicate tables in `hud-logic.ts` are gone. `remapBinding` now re-exports `controls.rebind`.
- Mouse sensitivity now has one range, `SENSITIVITY_RANGE` in `settings.ts`. Before, it was duplicated in the loader, the settings screen and the pause menu.
- Tests (Chrome): keyboard Tab order reaches every control; each slider's Home and End keys land on the model's bounds; toggles work with Space; binding a taken key swaps the two actions; right, middle and left mouse buttons can be bound; Esc cancels a capture; settings persist after a reload; reset restores the defaults.

### 2. Crosshair (`src/ui/crosshair.ts`, `src/settings.ts`, `src/render/camera.ts`)
- `aimedFov()` is now the one lens function for both the camera and the crosshair. It converts the horizontal FOV to vertical and applies the per-weapon zoom from `ADS_ZOOM`.
- Spread now also counts crouching and swimming.
- A test compares the crosshair against an independent Three.js camera projection for 5 weapons, FOV 80, 100 and 120, 2 viewport heights, and 4 stances.

### 3. Audio (`src/audio.ts`, `src/sound/*`)
- **Supply delivery:** the Codex draft reused the drop plane's propeller loop. The Tucano carrier is actually a hot-air cargo balloon (`docs/assets.md`), so it now sounds like one: a positioned propane-burner blast (`balloon:burner`) every 2.2 to 5 s along the carrier's real path (`supplyPlanePosition`), fired more often while it climbs away. There is no sound in menus or on the results screen, or after the balloon leaves.
- **Incoming fire:** a short, bright forward report plays only when a hostile hitscan round is aimed at you and not blocked. Sideways, departing, blocked, occluded, own, melee and coconut shots do not trigger it. Offline checks: under 150 ms, under 5% energy below 200 Hz, and more than twice the spectral centroid of the far M4 body.
- **Music migration:** unversioned saves at the old 0.25 default move to 0.5. Every save now carries `musicMix: 2`, so a player who picks 0.25 again keeps it.
- Tests: 55 audio tests pass; the supply test fails on a propeller loop or a constant drone.

### 4. Scope flash (`src/ui/ui.ts`, `src/ui/style.css`)
- Local DMR and sniper shots flash for 110 ms inside the lens. It is a warm bloom rising from the bottom edge, plus the painted front flash from the VFX atlas, blurred and turned per shot. A muzzle a few centimetres from the objective shows up as bloom, not a sharp sprite; the Codex sprite version read as a sticker. Remote fire never flashes. Reduced motion lowers the intensity.
- Evidence: `evidence/integration/scope-dmr.jpg`, `scope-sniper.jpg`. The Chrome test covers both scopes: remote fire is ignored, the reticle stays on top, and the flash clears between shots.

### 5. QA poses and baselines (`tests/visual/*`, `tools/qa/*`, `tools/vfx/*`)
- Codex removed the room poses for buildings that no longer exist and retargeted the scope, mud and supply views and the VFX lab scenes (52 catalog checks).
- My fixes on top:
  - The plaza, capyFront and capySide views stood inside a bench; they are reframed.
  - The capyFront and capySide capybara must now pass `clearSpawn`.
  - Each review gets its own `matchId`, so smoke and decals from one pose no longer show up in the next. The cocoBlast smoke was showing in the plaza view.
  - Supply observers need a clear foreground for 2.5 m.
  - The results layer is cleared between poses.
  - Captures wait for the result counters to finish counting.
  - A new `results-correria` pose.
  - Review candidates use the same file names as the snapshot tool.
- Baselines: all 165 candidates were inspected by eye on labelled contact sheets (`evidence/integration/baselines-1..7.jpg`), then installed. The comparison run then passed (165/165, Chrome ANGLE Metal, 1280x720, medium). The record with hashes is `evidence/integration/approved-baselines.json`. `tests/visual/baselines/` is gitignored, so the approval is recorded, not committed.

### 6. Full matches (`tools/qa/play.mjs`)
- The driver plays through the real input layer and worker, with no health, damage or time overrides. It picks a drop point over weapon loot inside the next zone, loots, heals, reloads, fights, respawns, spectates and rematches. It now also:
  - wanders out of places the route graph does not know, such as a walled roof terrace;
  - measures page stalls instead of aborting;
  - records GPU resources, DOM size, CPU profiles (`PROFILE_AT`) and spectator framing.
- Complete rounds this session:

| Mode | Rounds | Placings | Notes |
|------|--------|----------|-------|
| Battle royale | 4 played + 1 spectated | 2nd, 21st, 12th, 2nd | Storm, 2 supply drops per round, death card, spectating, results, rematch |
| Correria | 4 (480 s clock) | 2nd, 5th, 1st, 1st | 16-40 kills, 11-16 falls; respawn, rematch |
| Corrente | 2 | 1st, 1st | Full 9-weapon ladder, 109-114 s |

- Codex also finished 1 Correria and 2 Corrente rounds.
- Page errors: 0. Stalls: 7, all recovered, lasting 19 to 27 s.

## Integration bugs found and fixed

1. **Walled yards without a gate:** 66 m2 at (5.5, 68) and 51 m2 at (14.6, -49.1). A capybara that landed in one was trapped, since jumping cannot clear the 1.35 m muro. `wallYards` now guarantees at least one `muro_portao` per yard, and the render shows the gate opening onto the lane (`evidence/integration/yard-gate.jpg`).
   - New `tests/enclosures.test.ts` maps the island on a 1 m grid. Every pocket cut off from the main network must be walked out of with the real `moveActor` (walking only, no jumps).
   - Every roof, terrace or tower top of 4 m2 or more (219 checked) must lead back down.
   - Every spawn, loot item and chest must reach the network.
   - Without the fix the test fails on both yards. `bot-island-navigation.test.ts` now expects the garden to be on the network.
2. **Supply delivery sounded like a propeller plane** instead of the balloon it is (see item 3).
3. **Pause menu:** the key list had no jump, sprint, crouch, quick melee or previous weapon. It was unreadable over the HUD (no card behind it). Sensitivity showed as "1.00" while settings show "1,00×". Now it has paper cards, the full list and the shared format. A Chrome test covers rebinding V to Z.
4. **Respawn-mode results:** in Correria and Corrente everyone "survived" the full clock, so "Tempo vivo" and the "Sobrevivente" award meant nothing. These modes now show "Quedas" (falls), and the survivor award is battle royale only. A Chrome test covers both modes.
5. **QA pollution:** effects and the results layer leaked between poses, and the plaza camera stood in a bench (item 5).
6. **Driver bugs:** trapped on a roof terrace for 4 minutes (a real, walkable-but-unrouted place); dropped straight from the plane into water; aborted rounds when a starved page was slow to screenshot.
7. **Settings layout:** seven model options in a 3-column grid left toggles and sliders interleaved. They now have their own rows, collapsing to 2 and then 1 column on narrow screens.

## Measurements
- Fresh match: 58 to 61 fps; the 4 s CPU profiles at 40 s and 230 s are about 50% idle.
- Over each long run the counts stayed flat: 872 geometries, 90 textures, 77 programs, about 2,005 scene objects, 490 to 660 DOM nodes, and 0 to 10 running animations. The heap cycled between 240 and 410 MB.
- **Frame-rate drops in long runs:** they happened whenever other agents' Chrome instances (a long-gun grip fitter and another lab) and a Blender character bake shared the GPU. Load average was 15 to 25 at those times, and the renderer and GPU processes were sampled waiting on `mach_msg`. Counts that stay flat rule out a client leak. This is not a game bug, but it should be rechecked on a quiet machine.
- **Spectator framing, 350 samples at 2 Hz over a spectated royale:**
  - watched capybara on screen in 94% of samples, and never hidden by a solid;
  - the 6% off screen are the camera squeezed within 1 m of a target backed against a wall, plus death-cam frames.

## Verification
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 1002/1002 in 110 files.
- Chrome (ANGLE Metal): the settings, pause-keys, scope and results browser tests (5/5); the visual suite (165/165 against the reviewed baselines).
- `tests/visual/character-mask.spec.ts` fails with the same numbers on `overhaul/aaa-autonomous` (skinned-face case: 46% holes). This is not caused by this branch, and nothing here touches the character mask.

## Files outside the brief's list
- `src/shared/street-life.ts`: the yard gate guarantee, requested by the orchestrator.
- `src/render/renderer.ts`: read-only QA diagnostics (`resources`, `project`).
- `src/main.ts`: the DEV-only `framing` and `resources` hooks.
- No weapon, viewmodel, arm, character, terrain or vegetation file was edited.

## Known issues
- `character-mask.spec.ts` fails on the base branch too (character or rendering owner).
- `room-upper-home-2`: bougainvillea grows through the upstairs Morro wall (`evidence/integration/known-wall-vegetation.jpg`, vegetation owner).
- The spectator camera squeezes to under 1 m when the target backs into a wall, so the body is hidden for those frames. A lift-over-the-head fallback would read better (UI owner).
- The baselines include the inherited long guns; re-approve them when the long-gun branch lands.
- No human has listened to the burner or the incoming cue yet (`tools/audio/lab.html`).
- The driver is a simple player: bots win most royales.
