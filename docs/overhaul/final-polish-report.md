# Final polish and full-game review

Branch `final-polish` (worktree `.claude/worktrees/final-polish`), from `ea2c6e7`, with `overhaul/aaa-autonomous` merged twice (the character full-quality pass `cc64557`, the build fix `1d6320c`, and the progress and report commits up to `1ad630e`). 30 September 2026.

Machine: every live number below was taken while other agents shared the machine (Blender and a second Chrome for most of the day). The load average is given next to each figure.

## Known items

### 1. Bougainvillea through a Morro wall

- **Cause.** The flowers in the Morro upper room (`room-upper-home-2`) were the crown of a pink ipe standing 2.9 m from the house. The crown rule kept foliage out of the walker band over streets and terraces, but it treated rooms as places where "nothing grows" and never checked them.
- **Wider problem.** A probe over every rendered leaf found **60 plants** with leaves inside a building:
  - 12 trees;
  - kit bushes the layout pressed against walls;
  - garden beds and climber feet placed 0.5 to 0.9 m from a wall, although their real spread is up to 1.7 m;
  - drapes reaching into a neighbour's room;
  - a meadow drift inside a chapel.
- **Fix** (`src/shared/vegetation-crowns.ts`, `vegetation-dressing.ts`, `src/render/vegetation/crown-profile.ts`):
  - Every walled room is sampled at 0.25 m up to its inner wall faces, from its floor to its ceiling. Open pavilions and arcades are excluded.
  - The existing crown relocation in world placement now also moves trees whose crown enters a room.
  - Foliage profiles are baked for every species except the drapes.
  - Bushes beside a wall step out along the wall normal or shrink to 60%.
  - Kit bushes are trimmed, or left out when even trimmed they would reach a room.
  - Drapes skip a room in front of them.
- **Guard.** `tests/vegetation-crowns.test.ts` transforms every leaf of every drawn plant and tests it against every room box. It fails on the old code with the ipe and 11 other trees.
- **Evidence.** `evidence/final-polish/room-vegetation-before-after.jpg`.

### 2. Spectator camera squeezed against the target

Three separate causes, each fixed with a test (`src/render/follow-camera.ts`, `tests/spectator-camera.test.ts`):

1. **Backed against a wall.** Below 1.7 m of room behind the target, the lens now rises over the head and swings along the wall. It picks the smallest lift and swing that clear, eases there, and glides home when the view behind is open again.
2. **The main cause: the shoulder pivot.** The pivot used a thinner probe than the lens. Beside a wall on the right, it stopped where the lens probe could not move at all, and the view collapsed into the head.
   - Over 400 seeded spots within 1.15 m of the island's walls: 120 squeezed under 0.7 m before, 1 now.
3. **Foliage.** Plants have no collision, so the lens sank into crowns and bushes.
   - The lens now reads the same foliage volumes as placement.
   - Leaves are soft: the lens eases in at 6 m/s instead of snapping, which stopped the view pumping when a runner passes plants.
   - A plant the target itself stands in is ignored.
   - Over 400 seeded spots near plants: 78 lenses inside leaves before, 0 now.

Live spectated battle royale results (500 ms samples):

| Run | Build | Load | On screen | Within 1.2 m |
|---|---|---|---|---|
| Integration baseline | before this pass | not recorded | 94% | about 6% squeezed |
| After fixes 1 and 2 | this branch | 11 to 17 | 96.9% of 393 | 1.8% |
| Final (soft foliage, merged character) | this branch | 25 | 97.9% of 389 | 1.3% |

- The off-screen remainder is mostly target hops (the camera travelling at 20 to 120 m) and death-cam frames.
- Tight rooms, the narrow street by the market hall and passing lamp posts still bring the lens under 1 m for a moment.

### 3. Loot reads as flat navy boards

- **Cause.** Every pickup other than a weapon was built from primitive boxes. The armour vest was a 0.14 m navy slab, which is a board edge-on at eye height.
- **Fix** (`src/render/item-geometry.ts`, `loot.ts`). The eight pickups were rebuilt with their own silhouettes, in colours that match their HUD icons:
  - a blue padded vest wrapped round a torso, with pouches;
  - an olive helmet with goggles;
  - an ammo can with brass rounds;
  - a red-cross kit;
  - a striped bandage roll;
  - a green guarana can;
  - an acai bowl with banana and granola;
  - wrapped rapadura bricks.
- **Presentation.**
  - A rim light separates the pickups from the ground.
  - A far copy past 14 m carries a third of the triangles.
  - Pickups past 90 m are no longer drawn.
  - Loot beams thin out within 8 m, so a rare gun no longer puts a stripe over the crosshair and the prompt.
- **Cost.** All non-weapon loot on the island is 64k triangles at range, against 18k before.
- **Guard.** `tests/item-geometry.test.ts`: depth from every side, size, and budgets.
- **Evidence.** `evidence/final-polish/loot-before-after.jpg`, at 3 m and 18 m, before above.

### 4. Frame drops in long runs

- **Profile.** A complete 532 s Correria round (42 kills), profiled with 4 s CPU profiles at 60, 240 and 420 s.
- **Resource counts stayed flat:**
  - geometries 882;
  - textures 90;
  - programs 78;
  - scene objects about 2,010;
  - DOM 490 to 690 nodes;
  - heap 256 to 345 MB, cycling.
- **Garbage.** An allocation sample of live play shows 5.7 KB per frame (`tools/qa/alloc-probe.mjs`), so there is no GC-driven spike source.
- **Frame rate.** 60 fps (rAF p50 16.7 ms) through 344 s, then 50 to 66 ms from 420 s. That drop matched the load average rising to 19 to 60, when another agent's Blender and Chrome started.
- **The 420 s profile** (8.8 fps) has every function inflated, led by canvas and GPU waits (`drawMapView`, `bindVertexArray`), which is CPU and GPU starvation.
- **Verdict.** No real leak or spike was found in the game. The drops are machine contention.
- **Still to do.** Recheck on a quiet machine at the release gate.

## Full-game review

Played and captured from the menu to the results and the rematch:

- **Battle royale:** plane, big map, jump, freefall, parachute, landing, looting, storm, death card, spectating, results.
- **Correria:** a full 8-minute round with respawns.
- **Corrente:** the full 9-weapon ladder, results, rematch.
- **Menus:** home, mode cards, settings (every section), how to play, host and join modals, loading, pause, scoreboard, emote wheel.
- **First person:** all nine weapons at hip and aimed; the scopes.
- **Character and world:** the merged character (front, side, holding four classes, 1.7, 8, 15 and 58 m, spectating, the statue), supply deliveries, and results screens.

### Defects fixed

| # | Defect | Fix (commit) |
|---|---|---|
| 1 | A Corrente round opened with the camera inside a croton patch: kit bushes and beds stood on arena spawns | Dressing keeps foliage off every spawn between knee and head height; tested on drawn leaves (9d3d5a3) |
| 2 | Scoped Carabina and sniper were a 63% peephole on a black screen (director) | 90% lens at the same magnification, anodised bezel lit from the upper left, glass rim and eye-relief shadow, blurred and darkened periphery instead of black, flash and posts follow the lens, axis plates (compass, safe chip, weapon boxes) fade while scoped, settle-in skipped with reduced motion; browser test extended (27cfe17). Evidence `scope-before-after.jpg`, `scope-flash-21x9.jpg` |
| 3 | Match banner overlapped the safe-zone chip from 1920 wide and stayed small at 1440p | Banner scales with the HUD like the plates around it (117c3d3) |
| 4 | Supply delivery hard to find: faint smoke, nothing visible from a distance | A 46 m warm light column over the landing spot from the announcement to the opening, fading near the player; denser signal smoke (b90c3d3). Evidence `supply-beacon.jpg` |
| 5 | Spectator lens inside leaves, pumping past plants (found live after the first foliage fix) | Soft foliage limit (4b88a32) |
| 6 | QA: a results pose left the HUD `ended`, so later poses in a run had no HUD (director) | Cleared per pose; the real rematch rebuilds the HUD, confirmed below (3ccd012) |

### HUD at every size

- **Tool.** `tools/qa/hud-review.mjs` captures three busy HUD poses: a full battle royale loadout with a prompt, the feed, a banner and the storm; watching; the Corrente ladder. It covers 1280x720, 1600x900, 1920x1080 and 2560x1440 at interface scale 80, 100 and 120%, and reports plates that overlap or leave the window.
- **Result.** 2 faults before the banner fix, **0 of 36 combinations** after.
- **21:9.** 1280x548 was checked with the scopes.
- **Evidence.** `hud-sizes-scales.jpg`.

### Rematch HUD

`tools/qa/rematch-check.mjs` plays each mode to the results, presses "Jogar de novo" and checks that the compass, map, match strip, vitals, weapon boxes and magazine card show in the new match. Battle royale, Correria and Corrente all pass. Evidence: `rematch-hud.jpg`.

### Character (merged `cc64557`)

- **Evidence.** `character-review.jpg`: front at 2 m, side, holding the pistol, Doze and machete, and the statue.
- **Reads well:** the shirt, vest, trousers and backpack; the silhouette at 58 m; the paws on each gun.
- **Nothing to send back from these views.** The character agent's own known issues (armpit slivers, far expressions) stand.

## Defects not fixed, with the reason

- **Kit bougainvillea reads as pink hexagon blocks** at 3 to 8 m on the Vila sobrados (`defect-kit-bougainvillea.jpg`). It is baked into the kit facades (`tools/blender/kit/casario.py` `bougainvillea()`), so it needs a kit rebuild. Recommendation: drop the faceted heads from the casario facades and add those pieces to `VINE_WALLS`, so the painted vegetation drapes take their place.
- **Rocks and cliffs look smeared up close** (low texel density) at landing spots. This is also a kit rebuild.
- **Offshore islets look soft and blobby from the plane** (`src/render/island-backdrop.ts`, a vertex-coloured heightfield). The plane passes close to them for about 10 s every royale. A painted canopy texture and a bumpier silhouette would be a worthwhile art pass; not attempted here.
- **The death cam can sit inside a bush** when the player dies in one. It uses the player's own eye, as before; a near-camera foliage fade in the vegetation shader would cover it.
- **4 trees still hang over royale district spawns** (Cachoeira and Mangue). Spawns are created after the crown relocation in world placement, so the tree rule cannot see them. Arena spawns are clear; royale players arrive by parachute.

## Tests and measurements

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 113 files, 1045 tests pass after the last merge (load 37).
- `npm run build`: passes after merging the base fix.
- Browser test `tests/scope.e2e.spec.ts`: passes.
- New or extended tests:
  - leaves in rooms;
  - leaves over spawns;
  - kit bush trimming;
  - the wall and foliage camera spots on the real island;
  - low-wall lift, tall-wall swing and return;
  - soft foliage easing;
  - pickup silhouettes and budgets;
  - the scope lens size, posts, flash and axis plates.
- Live perf, 1280x720, practice Correria, 30 s, standing (`tools/qa/perf-probe.mjs`):

| Preset | Load | p50 | p95 | Frames over 33 ms | Draws | Triangles | Render CPU p50 / p95 |
|---|---|---|---|---|---|---|---|
| Low | 33 | 16.7 | 16.8 | 6 / 1200 | 120 | 1.07M | 6.6 / 15.1 ms |
| Medium | 47 | 16.7 | 16.8 | 1 / 1200 | 105 | 1.39M | 5.2 / 9.6 ms |
| High | 60 | 16.7 | 33.3 | 44 / 1200 | 170 | 1.56M | 9.5 / 24.5 ms |

- Scope blur cost at 1280, 1920 and 2560 wide: no measurable change in frame time (load 15).

## Files outside my original scope

- Vegetation placement: `src/shared/vegetation-crowns.ts`, `vegetation-dressing.ts`, `src/render/vegetation/crown-profile.ts`. This was required by item 1, and later allowed by the director.
- No weapon, viewmodel, arm or character file was touched. No Blender file was run or edited. No grip changed.

## Tools added

- `tools/qa/hud-review.mjs`
- `tools/qa/rematch-check.mjs`
- `tools/qa/perf-probe.mjs`
- `tools/qa/alloc-probe.mjs`
- The QA poses `loot-eye`, `loot-down`, `loot-far`, `hud-full`, `hud-watch` and `hud-corrente`.
