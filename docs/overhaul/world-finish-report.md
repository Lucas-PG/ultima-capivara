# World finish pass

Branch `world-finish` (worktree `.claude/worktrees/world-finish`), from `a5a7d77`. 30 September 2026.
Scope: the six items of `docs/overhaul/briefs/world-finish.prompt.txt`. No character, weapon, viewmodel or first-person arm file was touched. No external assets and no Codex images were used, so `docs/assets.md` is unchanged.

All captures are 1280x720, medium preset, real Chrome (ANGLE Metal), gameplay FOV (68 degrees vertical, the default 100 horizontal) at eye height unless noted. Evidence is in `docs/overhaul/evidence/world-finish/`.

## 1. Kit bougainvillea (pink hexagon blocks)

**Cause.** The kit baked flowers as faceted orbs: bougainvillea on the terraced fronts (`casario.py`), the window flower boxes of every house and terrace, the door pots (`vaso`, `vaso_alto`, `vaso_flor`, about 130 on the streets), the flowering yard walls (`muro_flor`) and the sobrado balcony pots. One of the terrace drapes also hung across a window.

**Fix.**
- Kit pieces now keep only their wall, box or pot, and author **planting anchors** in the kit metadata (`plantings` in `src/shared/kit-pieces.json`, `Piece.plant()` in `tools/blender/kit/spec.py`): drapes, window boxes, pots and a bush.
- Terrace drapes are laid out by hand per piece (`drape()` in `casario.py`): under the eave over the windows and down the corner beside the door (`row_terrea`), over the parapet above the balcony doors and in front of the railing (`row_sobrado`), in front of both balcony railings (`row_alto`). The build asserts that no drape rectangle, at its longest trail, crosses a door or window with its frame. `row_loja` has no room for one and gets its window boxes only.
- The vegetation layer draws them (`src/shared/vegetation-dressing.ts`, section 2c):
  - about one front in five stays bare, and each drape grows at even odds on the others;
  - colours are mostly magenta and pink, with coral on one drape in four;
  - each drape is split into trails of natural width, with a shorter second layer in front so the edge reads full.
- A new `windowbox` species (`src/render/vegetation/shrubs.ts`) fills every window box (houses and terraces: about 190). Pots use the painted `pot` planting set on the kit rim. Each flowering yard wall gets a drape over the coping and a bougainvillea bush behind it.
- The footprint check for drapes now respects height, so a pot at a door no longer blocks a drape hanging from the eaves.

**Guards** (`tests/vegetation-dressing.test.ts`):
- Every anchored drape is sampled on a 7 x 6 grid over its real trail extent. Masonry must stand behind each point (for a balcony drape, below the slab). The test fails if a drape's drop is lengthened across a window, which was tried.
- Between 45 and 85 percent of the fronts are draped, and every colour variant is used.
- Every window box and pot plant sits exactly on its kit anchor.

**Evidence.** `01-kit-flowers-before-after.jpg` (sobrado at 5 m, yard wall, shop front, the praca) and `01b-drapes-on-fronts.jpg`.

## 2. Rocks and cliffs smeared up close

**Cause.** Kit rocks map one 256 px atlas tile over metres of stone. Terrain rock faces take their colour from the 2 m colour grid.

**Fix.** `src/render/stone-detail.ts` adds a shared world-space stone layer, projected on the three world planes. It is used by the terrain rock mask and by the kit's cliff rocks, which the kit build now marks with vertex alpha 0. The layer draws:
- sheet joints with chipped lips (only some joints open, and fewer on the tops, so a crown never reads as paving);
- plate tones, grain, speckle pits and rain streaks down the faces;
- lichen on the tops and faint strata;
- matching relief in the normal.

Each layer fades by its own size against the pixel footprint. Up to about 34 m, the kit rock tile gives way to its own mip mean, so its painted blotches stop smearing. The far look is unchanged; see the last row of the evidence.

**Evidence.** `02-rocks-before-after.jpg`: before is the same build with the layer switched off.

## 3. Offshore islets soft and blobby from the plane

**Fix.** `src/render/island-backdrop.ts` was rewritten.
- **Shapes.** Each of the 12 islets is one of three kinds: a bare granite sugarloaf, a forested pico with rock near the summit, or a low islet of forested hills. Some have a twin dome. Domes lean and are fluted by rain.
- **Coast.** Forested shoulders rise inland in spurs. Sand coves alternate with headland cliffs, and the seabed falls away.
- **Painting.** The shader paints, in world metres:
  - canopy crowns lit toward the sun and grouped in masses, with a few flowering ipes;
  - streaked granite with dark wet feet;
  - sand with a wet band.
- **Surf.** A surf ring breaks round every coast, with broken, rolling lines.
- **Palms.** Coconut palms stand on the coves. They are drawn by the vegetation batch, never inside a neighbouring islet.
- **Cost.** Two draws in all, about 155k triangles.

**Guards.** `tests/island-backdrop.test.ts` checks:
- two draws and a triangle bound;
- no spires (height at most 0.75 of the width);
- land and a cove on every islet;
- every palm rooted on its own ground, above the sea.

**Evidence.** `03-islets.jpg`: from the plane, a close plane pass, and from the Forte beach. The violet band in two views is the storm wall of the QA state.

## 4. Camera inside plants

**Fix.** The foliage colour pass dissolves leaves near the lens in a fine screen-space dither (`src/render/vegetation/foliage-material.ts`):
- leaves between 1.3 and 0.7 m;
- bark and limbs within 0.5 m;
- grass blades within 0.55 m (`ground-cover.ts`).

The shadow pass is untouched. Because this is the local camera's own render, what other players see is never changed.

**Checked.** First person inside a bougainvillea and a thicket, the death cam in bushes, the spectator view (`hud-watch`) and the third-person pose.

**Guard.** A test in `tests/vegetation-budget.test.ts` requires the lens fade in the colour pass and forbids it in the shadow pass.

**Evidence.** `04-near-foliage-fade.jpg`.

QA poses now accept `window.__qaStance = [x, z, yaw, pitch]` to stand anywhere (`tests/visual/qa-hook.ts`).

## 5. Trees over royale spawns

**Cause.** Spawns are chosen after the crowns are moved off the walks.

**Fix.** Spawn candidates now reject any spot with foliage between the knee and above the head, using the baked crown profiles (`src/shared/world.ts`). This covers royale district spawns, their arrivals and deathmatch spawns.

**Guard.** A new test in `tests/vegetation-crowns.test.ts` checks every rendered leaf of every tree against every spawn. It failed before the fix with a mangrove at Mangue (113.7, 59.4) and a crown at Cachoeira (-114.2, -20.7).

**Evidence.** `05-spawns.jpg`.

## 6. Sweep, district by district

All 15 district arrivals were reviewed, plus street, beco, quay, largo and rock views and the plane.

### Fixed

- **Hill chapel.** The Capela do Morro is now its own piece, `church_hill`: the same plan, doors and interior as the church, so routes and bots are unchanged. Instead of the campanile it has a scrolled frontispiece with blue trim, a bell arch with its bell and cross, an oculus and a blue barra. A test checks that it keeps the plan but not the tower.
- **Terrace end walls.** Every terrace end wall has a stone base course and a closed shuttered window per storey. The windows sit clear of the painted adverts.
- **Faceted fruit.** Shop-counter and market-stall fruit are round instead of faceted.
- **Campinho stand.** The stand's blank end walls get a club-colour barra, a stripe and a panel.
- **Terrain smudges.** At eye height, the colour map's soft grass, earth and sand blends read as smudges. Within 40 m the lookup is now warped in world space, so the blends break into painted edges.
- **Islet colour.** The islet granite was toned down, because it read as snow in the haze.
- **Evidence.** `06-sweep-fixes.jpg`.

### Listed, not fixed

- **Two churches still share a piece.** The Rosario chapel still uses the Matriz piece. Recommendation: a second dressing variant (a lower tower or a sineira), the same way as `church_hill`.
- **Balcony and parapet drapes.** They are real bougainvillea but modest in mass at 8 to 10 m. The door and window heads below cap their length. A bush in a planter on the balcony floor would add mass.
- **Hidden faceted foliage.**
  - The interior `potted_plant` (37 of them) is still faceted.
  - Faceted blobs remain under the kit planter and flower-bed plantings. They are hidden, but they cost triangles.
  - Recommendation: convert both to anchors, as was done for `vaso`.
- **Rock joints.** On a few large boulders (the Rua do Engenho outcrop) the joint network reads slightly graphic. Terrain rock is very dark where it faces away from the sun.
- **Terrain colour map.** The earth streaks on the grass slopes are broken up but still visible. The real fix is a finer map or a second detail map for earth.

## Measurements

**Kit.** 97 pieces (one new), 11.34 MB raw and 3.11 MB gzip, against 11.44 and 3.42 MB before, inside the 14 MiB and 4 MiB budget. The final build ran on the Linux build machine.

**Wide views, medium.** Renderer stats come through the QA hooks (`perf.mjs`: the wide views of `tools/qa/wide-views.json`, plus poses).
- Before is `a5a7d77` served from an archive of that commit. Load average 86 to 104 (other agents).
- After is this branch. Load average about 59.
- Frame times at these loads are not meaningful, so only draws and triangles are compared.

| View | Draws before | Draws after | Triangles before | Triangles after |
|---|---|---|---|---|
| top | 147 | 148 | 0.92M | 1.03M |
| plane | 134 | 135 | 0.82M | 0.93M |
| morro | 158 | 159 | 1.18M | 1.29M |
| fort-over | 142 | 143 | 1.42M | 1.50M |
| capela | 153 | 154 | 1.29M | 1.37M |
| plane over the islets | 30 | 32 | 0.18M | 0.30M |
| vila at eye height | 108 | 109 | 1.39M | 1.44M |
| morroRoofs (pose) | 168 | 169 | 1.55M | 1.62M |
| vilaStreet (pose) | 143 | 144 | 1.49M | 1.57M |

- Every view stays under 170 draws and 1.62M triangles, against the 260 draw and 1.8M triangle budgets.
- The extra draw is the surf ring.
- The triangles come from the islets (about 110k) and the painted plantings (window boxes, pots, drapes).

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run --maxWorkers=3`: 114 files, 1054 tests pass.
- `npm run build`: passes.
- New or extended tests:
  - kit drapes over solid wall, with variety;
  - window boxes and pots on their anchors;
  - spawns clear of leaves;
  - the lens fade;
  - the islets;
  - the hill chapel.
- Updated for the new piece: building traversal and the simulation roof list.

## Commits

`b5cd95f` spawns, `2d2e681` lens fade, `7b7438e` islets, `6700b7f` and `adfc3de` stone detail, `0ae41a8` islet tone, `524a849` terrain warp, `940b0ed` kit plantings, hill chapel and end walls, `4d5ae92` chapel test, `437f6ea` and `5c9483a` Linux kit builds.
