# World polish report

Branch `world-polish`, from the merged world (`8ccf401`). It covers the nine
follow-ups from the orchestrator's review of the structure and vegetation
passes. Weapons, viewmodel, arms and character code were not touched.

## Outcome

All nine follow-ups are done, with tests. Every wide view is well inside the
budget at medium (166 draws and 1.55M triangles at most). `npx tsc --noEmit`
is clean and `npx vitest run` passes 828 of 828 tests in 100 files.

## What changed and why

| # | Follow-up | Fix | Guard |
|---|---|---|---|
| 1 | Stale QA poses | The named views moved to `tests/visual/qa-views.ts` and were retargeted to real viewpoints: the quay promenades, Rua Direita in the Vila and toward the Morro, two laje roof terraces, the fazenda veranda, the baths, the sobrados, the Redentora's plinth. District views now use the authored arrivals. A view stands on the walking surface (deck, quay, roof floor), not on the terrain under it. | `tests/qa-views.test.ts` covers 42 views. It fails if the capybara's body is inside a solid, if the view floats above its floor or stands in deep water, or if any of nine rays across the view hits a solid, a trunk, a crown or a shrub within 2 m. |
| 2 | Empty Engenho lawn | See "Engenho and Palafitas" below. | Integrity, traversal and bot-route tests all pass with the new props. |
| 3 | Bots skip the Capela stair | Root cause: walking checks treated the next tread (0.285 m) as a wall, so neither 4 m grid row ran up the flight. The first fix: `walkableSegment` climbs anything within moveActor's 0.45 m step. The route graph also walks every authored `NAV_ROUTES` route at 3 m samples, so stairs and narrow paths between grid rows are covered. A second bug showed up next: a floor reached on the level (the stair's adro) counted as a building floor, which sent a bot at the top back down to leave by the foot. Such floors are now outdoor ground. | `tests/bot-capela-stair.test.ts` runs a real simulated bot from the stair foot and from Rua do Sul to a prize on the adro. The bot must climb more than 9 m between the cheek walls, never take the south path, and never jump. The test fails on the old code. |
| 4 | Farm soil strips on the road | Strips are laid either side of the farm road and never cross a road, paving, a lot or a solid. Bushes, trees and dressing keep off them. | A new `world-integrity` test checks at least 6 strips, none crossing roads, paving, lots or solids, and nothing but crops on them. |
| 5 | Dead `SOFT_LANDSCAPE` | Removed from `src/render/kit.ts`, along with its alpha-hash fade. Flower beds stay solid at every range. | `kit-asset` test rewritten for flower beds. |
| 6 | Crown at head height on the Morro roof path | This is a rule, not a one-off move. `scripts/generate-crown-profiles.ts` bakes each crown's foliage volume (lowest and highest leaf per 0.5 m ring) from the render templates into `src/shared/vegetation-crowns.json`. World placement then keeps every tree's foliage out of the band from 0.8 m to 2.5 m above every walking surface: streets and paving, routes (3 m wide), decks, wall walks and roof terraces. A tree that breaks the rule moves to the nearest clear spot, or is dropped if none exists (a few of about 300). Garden bananas skip beds under such a band. | `tests/vegetation-crowns.test.ts` has three checks. The profiles must never flatter the templates. No tree or banana breaks the rule. The real rendered leaves are checked against the walking surfaces, independently of the profiles. |
| 7 | Uniform lawns | A shared `grassAlbedo` (in `src/shared/terrain.ts`) feeds both the colour-map bake and the lawn tint. It adds tone patches a few strides across (lush hollows, bleached crowns), trodden earth along routes wherever they leave the paving (`pathWear`; the lawn thins there), and wildflower clusters (`wildflowers`). The clusters are speckled into the map and grown as flower accents. Nothing is taller than before: ground cover stays at 0.62 m or less. | In a new ground-cover test, neighbouring 5 m samples must differ in tone (they did not before). At least 60% of unpaved route samples must be worn, the paving must be free of wear, and the lawn must thin on trodden strips. |
| 8 | Wide-view perf | Re-measured with the new `tools/qa/wide-perf.mjs` on the merged world. No view is above 260, so no reduction was needed. | Table below. |
| 9 | Slow ground-cover test | The culling test reuses the shared island build instead of building a second cover, and the lawn scan tests only the roads near each cell. Nothing it asserts was weakened. | It passed under a load average of about 30 (the culling check took 39 ms, the slowest test 2.6 s). |

### Engenho and Palafitas

- **New kit pieces**, authored in `tools/blender/kit/engenho.py` and `palafitas.py`:
  - for the Engenho: ox cart `carro_boi`, cane bundles `feixe_cana`, cane-juice press `garapeira`, firewood lean-to `lenha`, trough `cocho`;
  - for the Palafitas: fish-drying rack `varal_peixe`, fish traps `covo`.
- **Engenho gable ends:** the blind stone door is replaced by a planked double door. Each end also gets two shuttered windows, a stone plinth and a round vent in the gable.
- **Kit size:** 96 pieces, 11.4 MB raw and 3.42 MB gzipped, inside the 14 MiB and 4 MiB budget.
- **The cane yard,** west of the hall under the casa-grande veranda:
  - an ox cart unloading at the mill door;
  - three cane stacks;
  - the trough, the juice press, a bench, sacks and barrels.
- **The furnace yard,** east of the hall: two firewood lean-tos by the chimney, cachaça barrels, cane, a bench over the river, and a shade mango.
- **The lane** between the hall and the terrace backs: cane stacked between the arches, sacks and barrels, and a trough in the quintal.
- **The field:** four more cane patches up the slope.
- **Palafitas:** fish racks, traps, crates and a barrel on the fishermen's shore, and traps on each house veranda.
- **Hero sightline:** the summit path up to the Redentora's plinth is now one. No tree is planted in it or relocated into it.

## Perf (medium, 1280x720, renderer stats through the QA hooks)

| View | Draws | Triangles | High draws | High triangles |
|---|---|---|---|---|
| top | 155 | 0.97M | 175 | 1.09M |
| plane | 141 | 0.87M | 158 | 1.02M |
| morro | 160 | 1.21M | 177 | 1.43M |
| east-river | 128 | 1.23M | 141 | 1.37M |
| fort-over | 141 | 1.42M | 157 | 1.66M |
| lighthouse | 152 | 1.13M | 164 | 1.34M |
| capela | 151 | 1.27M | 167 | 1.47M |
| south | 150 | 0.95M | 165 | 1.15M |
| lighthouseBalcony (pose) | 161 | 1.29M | 171 | 1.53M |
| fortWallNorth (pose) | 156 | 1.45M | 167 | 1.70M |
| morroRoofs (pose) | 166 | 1.55M | 184 | 1.84M |
| vilaStreet (pose) | 142 | 1.51M | 159 | 1.79M |
| cane-yard | 94 | 1.09M | 107 | 1.23M |
| district-engenho | 102 | 1.23M | 127 | 1.58M |
| district-palafitas | 78 | 0.82M | 87 | 0.98M |

- The views are in `tools/qa/wide-views.json`.
- A WebGL call counter confirmed that the stats equal every draw of the frame, shadow passes included.
- The 350-plus draws of the structure report predate the vegetation batching.
- The new props merge into the kit's existing cells, and the flower accents merge into the ground-cover cells, so neither adds draws.
- The terrain colour map grew from 510 KB to 605 KB, now saved as RGB without an alpha channel. The asset manifest was updated to match.

## Evidence (`docs/overhaul/evidence/world/`)

| File | Content |
|---|---|
| `polish-01-engenho.jpg` | Lane, mill yard, gable end and the brief's framing, before and after |
| `polish-02-engenho-yards.jpg` | Cart, cane, furnace yard, gable, and the district from above |
| `polish-03-palafitas.jpg` | Racks, traps, shore, and the village from above |
| `polish-04-poses.jpg` | Stale poses, before and after |
| `polish-05-farm-stair.jpg` | Farm strips and the stair arrival, before and after |
| `polish-06-crowns.jpg` | Roof terraces, clear of crowns |
| `polish-07-lawn.jpg` | Fields from the plane before and after, a trodden path, and wildflowers |

## Remaining issues

- **The brief's Engenho framing is inside a terrace house.** The camera at x -70, z 31 stands inside the solid `row_terrea` at x -72.7, so its foreground lawn is that house's footprint. No player can stand there. The views players can reach (the lane, both yards, the gable ends) are now dressed.
- **No clinic in the layout.** It became a terraced front when the structure pass laid out the fronts, so the `room-clinic` review pose has no building. `clinicSobrado` now frames the tailor's sobrado on the market largo.
- **Loot looks like navy boards.** Loot pickups resting on the ground read as flat navy boards at eye level, for example near the cane yard. This is not world code, but worth a look by whoever owns loot rendering.
- **Arena spawns may have moved.** The route graph gained about 470 nodes (3,737 in all), and supply landings and loot placement read it. All spawn, loot and supply tests pass, but arena spawn positions may differ from the previous build.
