# World structure and dressing report

Branch `worktree-agent-a56837e37d02f5268`, 25 commits on top of `1b69016`.
Scope: layout, terrain, river, quays and bridges, waterfront, buildings and
kit pieces, props and street dressing, landmarks. Vegetation, weapons,
arms, character and HUD were not touched.

## Outcome

- The user's map defects are fixed and covered by automated checks:
  - bridges ending in grass;
  - gaps in the quay walls;
  - floating stairs;
  - the east-beach dock standing on sand;
  - half-sunk and hovering pieces.
- The empty areas are now purposeful places:
  - the south-east corner holds the Palafitas;
  - the ground west of the Lagoa holds the Engenho and the Capela do Morro stair;
  - the south holds the Rua da Praia.
- The town is a dense colonial street grid, with continuous terraced fronts, quintais and street life.
- Draw calls fell in every measured view: 9 to 44 percent, about 38 percent in the widest views.
- Triangles stay under 1.8M in every view, and all tests pass.
- Four wide views stay above 260 draw calls. Vegetation causes this: 122 to 173 draws in those views (see Perf).

## What changed and why

### 1. Integrity (goal 1)

| Problem found | Fix | Guard |
|---|---|---|
| Bridges crossed an oblique river, and their ends landed in grass | The river runs in straight east-going reaches at the three town bridges. The decks meet the quays square, and each deck end lands on a street at deck height. Level pads sit at the river-mouth bridge. | `world-integrity`: every bridge footing stands on the bed, and both deck ends are on a street with a step under 0.3 m |
| Gaps and wedges in the quay walls | Stones run per mitred run, with corner blocks at the bends. Stones sit flush against bridge abutments and stairs, and abutments are exactly as deep as the quays. Two stone variants alternate so overlapping stones never share a surface. | Both banks are sampled every 0.5 m at 0.6, 2.5 and 4.4 m behind the face: no gap, and the quay top level with the promenade (within 0.06 m) |
| Floating stairs | Quay stairs stand on the bed. The Capela stair is cut into its hillside. | The first tread is at most one step above its floor. The Capela test checks that every tread has ground within 0.45 m and is the walking surface. |
| Dock on sand | The piers stand over water on piles that reach the bed. | At least 60 percent of each dock is over water, and every pile reaches the bed |
| Hovering or sunk pieces | Pieces are placed from their bottom-centred base against real support (terrain or the solid below). Yard walls sit on their lowest corner. | Five samples per piece: no hover over 0.15 m, and no piece sunk by more than max(0.45 m, 35 percent of its height) |
| Found during review: two bushes inside the Capela do Rosario, and a canoe's mast through a stilt-house deck | Nothing grows under the roof of an open-floored building, and the canoe moved | New test: no tree, bush, hedge or boat stands inside an open-floored building |
| Found during review: house laundry across pavements and streets, murals and bikes pushed into neighbouring walls | Terraced houses skip that legacy dressing, and laundry is dropped if either post would stand in a street | New test: no street prop inside a wall, and no laundry post in a street |

All checks live in `tests/world-integrity.test.ts` (8 tests). The building contract and surface tests also cover the new stair, and the kit test covers the far-furniture batch.

### 2. Places and density (goal 2)

- **Town plan:**
  - Rua Direita runs from the Morro to the harbour.
  - The praca axis runs from the Matriz over the arch bridge.
  - The market has its largo and feira; Largo do Rosario is on the south bank.
  - Fronts are continuous: `frontage()` lays casario terraces (terrea, sobrado, loja, alto) between enterable houses, with becos through the blocks.
  - Facades never repeat a colour next to a neighbour.
- **River:**
  - A canalised town reach with mitred cut-stone quays, corner blocks and four landing stairs.
  - Three bridges (Matriz, Capelinha, Feira) and a timber bridge at the mouth.
  - The harbour has a straight quay, a pier, warehouse, containers, a crane and boats.
- **Palafitas (south-east):**
  - The Lagoa da Mare is a wading-deep tidal lagoon open to the sea.
  - It holds a boardwalk on piles, two junction decks and four stilt houses, plus the Bar da Mare, a lookout tower, canoes and nets.
  - A path leads down from the farm road, and the district has its own sign.
- **Engenho (west of the Lagoa):**
  - An arcaded mill hall with its moenda and copper tachos, a brick chimney, and a turning water wheel under the waterfall.
  - Cane on the hill and the casa-grande above.
  - A workers' terrace lines the new Rua do Engenho.
- **Capela do Morro:**
  - A 20 m stone stair climbs the hill's east face on the chapel's axis.
  - It has whitewashed cheek walls, lanterns at the foot and finials at the head.
  - The stair leads to a paved adro with a cruzeiro before the door.
  - The hillside is cut to the flight. The district arrival looks straight up the stair: a sightline and a vertical approach.
- **Rua da Praia (south):**
  - Both sides are built from Rua do Sul to the Rua do Farol on a terrace level with Rua do Sul (corner shop, bakery, sobrados, altos).
  - A cottage pair continues toward the beach, so the lighthouse closes the street view.
- **Quintais:**
  - Chest-high whitewashed walls enclose the yards behind the Rua Direita, Rosario, Rua da Praia and Engenho fronts.
  - The walls have gates and bougainvillea, and laundry dries inside.
  - They give cover and flanking lanes.
  - The ground behind every enterable house stays open to the lane, so back doors and bot routes keep working.
- **Street life:**
  - Pots, goods and bikes at the doors, and Portuguese shop signs.
  - Cables across the streets carry lanterns, bulbs or festa bandeirinhas; laundry hangs over the becos.
  - Cafe tables and carts on the squares, nets on the quays, harbour cargo.
  - Painted adverts cover blank terrace end walls that face a street.
- **Arrivals:** every district arrival was checked at eye height.
  - The Capela, Farol and Campinho arrivals were moved to look at their landmark instead of a wall or a grandstand end.
  - No street lamp stands in an arrival's first steps.

**New kit pieces** (89 pieces, up from 56 before the overhaul):

| Group | Pieces |
|---|---|
| Quays | quay walls (two variants), quay corner, quay stair |
| Bridges | three bridges |
| Casario rows | four rows |
| Street dressing | seven dressing pieces |
| Palafitas | six pieces |
| Engenho | three pieces |
| Capela | escadaria, cruzeiro |
| Quintal walls | four pieces |

The kit is 11.0 MB raw and 3.27 MB gzipped, inside the 14 MiB and 4 MiB budget. No external assets were used, so `docs/assets.md` is unchanged.

### 3. Playable area (goal 3): kept at its current size

- The problem was emptiness, not size, so the empty areas were filled rather than the island grown.
- Growing it would change cross-cutting systems outside this brief: the world size, shore mask, storm circle, map and minimap, water, backdrop islands and spawn distribution.
- Deathmatch spawns are still sampled with at least 13 m separation, and each spawn keeps at least 4 others out of sight. The arena gates and edge markers are tested.

## Perf (medium preset, `renderer.info` through the QA hooks)

Before is the map at `1b69016`. The same camera views were used for both measurements.

| View | Draws before | Draws after | Change | Triangles before | Triangles after |
|---|---|---|---|---|---|
| fort-over | 400 | 259 | -35% | 1.35M | 1.34M |
| east-river | 382 | 224 | -41% | 1.43M | 1.47M |
| plaza | 219 | 171 | -22% | 1.19M | 1.30M |
| river | 279 | 192 | -31% | 1.29M | 1.41M |
| morro | 494 | 312 | -37% | 1.58M | 1.52M |
| lighthouse | 449 | 277 | -38% | 1.35M | 1.42M |
| south | 326 | 210 | -36% | 1.33M | 1.45M |
| porto | 122 | 111 | -9% | 0.64M | 0.86M |
| top | 575 | 353 | -39% | 1.51M | 1.31M |
| plane | 504 | 310 | -38% | 1.18M | 1.13M |

New places:

| View | Draws | Triangles |
|---|---|---|
| Capela stair | 138 | 1.10M |
| Rua da Praia | 129 | 0.86M |
| Quintal lane | 222 | 1.62M |
| Palafitas | 86 | 0.56M |
| Engenho | 126 | 1.00M |

The highest triangle count is 1.62M, below the 1.8M limit.

**What cut the draws:**
- Room furniture and flower beds past their far distance now draw from one island-wide `BatchedMesh`, instead of one draw per room (about 110 draws saved in wide views). Each room's instance shows exactly while its own LOD is at its far level, so solids never vanish and are never doubled.
- Place signs merge into two draws instead of five each.
- Street dressing merges by 96 m quarter.

**What cut the triangles:**
- Crates, barrels, lamp posts, pots, fences, benches, boats, planters and market stalls now have real middle and far levels. Before, they drew their full mesh at any distance.
- Merged kit cells release their CPU arrays after upload.

**Remaining share:** in the four views still above 260, vegetation takes 122 to 173 draws. In the top view it is 173 of 353. The rest of the world takes 183 or fewer draws in every view. The vegetation agent's batching is expected to bring these views under budget.

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 754 of 754 pass (96 files), with `--maxWorkers=4` because the machine is heavily loaded.
- The Playwright e2e suite was not run, per the brief.

## Evidence (`docs/overhaul/evidence/world/`)

| File | Content |
|---|---|
| 01-island-top.jpg | Whole island, before and after |
| 02-town-top.jpg | Town from above, before and after |
| 03-south-east-palafitas.jpg | South-east corner before and after, the boardwalk and the lagoon |
| 04-west-engenho.jpg | West before and after, the mill yard and the water wheel |
| 05-quays-river.jpg | Continuous quays from above and at eye height |
| 06-bridges.jpg | The four bridges, each landing on a street |
| 07-streets.jpg | Praca, market and Rua do Sul, before and after |
| 08-rua-da-praia.jpg | Rua da Praia before and after |
| 09-capela-stair.jpg | The Capela arrival and door before; the stair, the view down it and the adro after |
| 10-quintais.jpg | Yard walls, lanes and laundry |
| 11-arrivals.jpg | District arrivals at eye height |
| 12-street-life.jpg | Street dressing and a wall advert |

## Remaining issues and follow-ups

- **Vegetation draw calls:** they keep four wide views above 260 draws. This is the vegetation agent's area.
- **Kit batching:** the kit still batches by 40 m cell, about 45 to 63 draws in wide views. The next step would be one `BatchedMesh` with a LOD choice per piece. It needs per-placement paint variants as separate geometries, and the interior-light shader patched for the batching matrix.
- **Bots on the Capela stair:** bots do not path up it. The 4 m nav grid treats stair treads as blockers, as it does on every stair. They reach the chapel by the graded south-east path, which the connectivity tests cover.
- **Terrace end walls:** they are still plain masonry, with a painted advert where they face a street. Corner variants of the rows with side windows would read better.
- **Terrain pad blending:** blending takes the strongest pad, so lots at different heights next to each other can leave a step. New fronts avoid it with shared terrace pads (one lot on the Rua do Farol was dropped for this). A smooth, weighted blend would lift the constraint, but it changes the whole island's terrain.
- **Shared church piece:** all three churches use the same kit piece, so the hill chapel looks like the town churches.
