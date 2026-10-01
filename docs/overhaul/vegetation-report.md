# Vegetation and ground cover pass, 2026-09-29

Branch `worktree-agent-a79a28e80df904562`, from 6f8a8ee (trees and palms in one batched mesh). The unverified WIP 3647c9b was unwound and rewritten into the commits listed at the end. Its understory builders, blade helper and bloom tiles were kept where they held up in review and rebuilt where they did not (frond halves, procedural heliconia and hibiscus SVGs, the lawn fan cards).

## What changed and why

**Foliage paintings.** Four new Codex `image_gen` paintings (no API key, account or payment) live in `tools/art/foliage-*-codex.png`: garden plants (4x4), coconut fronds, bougainvillea trails and ipe/flamboyant blooms. `tools/art/prepare-foliage-sheet.mjs` cleans each sheet in memory and `tools/art/build-foliage-atlas.mjs` packs 31 foliage tiles and 10 ground tiles. Prompts, hashes and output paths are in `docs/assets.md`. The atlas used to bleed 10 px of dark leaf outline into transparent texels, with black past that. The GPU averages those texels into the mips, so at range a crown came out at a third of its painted brightness and read as a dark blob. Now only 3 px of edge colour are bled and every other transparent texel carries the tile's mean paint.

**Palms.** Each frond is a painted frond folded along its midrib (young, old and a gap-closed far version). Fronds spring from a fibrous boot, the palm carries coconut bunches, and dead fronds hang against the trunk. Growth rings are painted on palm trunks only (`KIND.palmTrunk`).

**Broadleaf trees.** Crowns are tiered masses, each lit on top and shadowed underneath, with sky between them. The trunk forks into primary limbs, and each primary forks again into one limb per mass. Mango, jungle, almond, cashew, mangrove (prop roots kept at every LOD), flamboyant and ipe have distinct silhouettes. Ipe and flamboyant carry whole painted bloom clusters, with per-tile tints so the colours hold under the warm sun. One inland scatter tree in eight now blooms.

**Understory templates** (all in the same single-draw batch): thicket (the kit bush footprint, in wild, croton, hibiscus and bougainvillea versions), clipped hedge, banana clump, heliconia, ave-do-paraiso, croton, bromeliad, taioba, monstera, fern, reeds, mandioca, meadow drifts, planter and flower-bed plantings, and a bougainvillea wall drape.

**Planting derived from the layout** (`src/shared/vegetation-dressing.ts`). It is deterministic and render-only: no plant has collision, and gameplay never reads it.
- Kit `bush_cluster` and `hedge` pieces (zero colliders) are redrawn one to one as painted thickets and hedges, and the kit renderer skips them.
- Bougainvillea hangs from house eaves and parapets, only over solid wall and never across a door. Corner climbers rise from their own bush. Kiosk, stall and veranda posts get climbers on their side faces.
- Garden beds run along house walls (banana at corners, flowers and big-leaf plants), clear of roads, paving, doorway aprons, solids and other pieces.
- Ferns, taioba, monstera and bromeliads grow at the feet of the forest trees.
- The kit planters and flower beds get real plantings over their green blobs.
- Field-row strips carry full mandioca rows.
- Meadow drifts break up open fields.

**Ground cover.** The lawn is dense tufts of plain curved blades, each tinted with the terrain colour map's own grass blend, so fields read as grass and not as speckle. Tufts beyond 10 m use five blades instead of nine. Painted accents: wild grass along walls, roads and tree feet; dune grass in the dunes and upper beach; impatiens and wildflower patches; clover and fallen leaves draped on the heightfield. Ground cover no longer writes depth, so the ink pass stops outlining every tuft. It culls by 3D distance and builds in 0.6 s (the previous version took 1.2 to 1.3 s).

**Fairness.** Nothing on the ground is taller than 0.62 m, so grass never hides a crouched capybara (1.3 m). Bushes, bananas and floor plants now stay drawn at every range. The kit bushes used to fade at 45 m, which put a hidden player in plain view for distant viewers. Only wall drapes drop out, past 150 m.

**Shadows.** The default shadow material cut trunk, limb and fruit vertices against the atlas alpha, so trunks cast almost no shadow. The batch now has a depth material that alpha-tests leaf cards only and sways with the same wind as the colour pass.

## Evidence (`docs/overhaul/evidence/world/`)

Before/after pairs, with before at session start (6f8a8ee), same camera, medium, 1280x720:
- `veg-vila-street.jpg`
- `veg-posto-field.jpg`
- `veg-lighthouse-view.jpg`
- `veg-aerial.jpg`
- `veg-coconut-palms.jpg`
- `veg-mango-grove.jpg`
- `veg-jungle-shadows.jpg`
- `veg-kiosk-bougainvillea.jpg`
- `veg-farm-rows.jpg`
- `veg-lagoa.jpg`

`veg-species-catalogue.jpg` shows every template in the plant lab.

Wind was reviewed in frame sequences (fronds, crowns and lawn sway together). Species were reviewed at 3, 15 and 60 m, back-lit and from below.

## Performance (medium, 1280x720, Apple M2, real Chrome, renderer stats via the QA hooks)

| view | draws before | draws after | tris before | tris after |
| --- | --- | --- | --- | --- |
| vila | 176 | 173 | 1.22M | 1.36M |
| centro | 200 | 196 | 1.12M | 1.27M |
| morro | 243 | 232 | 1.08M | 1.14M |
| fazenda | 203 | 202 | 0.93M | 1.08M |
| lagoa | 123 | 124 | 0.94M | 1.12M |
| vilaStreet (pose) | 194 | 192 | 1.24M | 1.36M |
| river (pose) | 227 | 224 | 1.17M | 1.35M |
| lighthouseBalcony (pose) | 338 | 336 | 1.04M | 1.09M |
| airSW | 345 | 343 | 0.83M | 0.83M |

- Every street-level view is within budget (at most 232 draws and 1.36M triangles). Draws went slightly down, even though 763 dressing plants were added (1,215 batch instances in all).
- Low peaks at 0.81M triangles (street views 0.45M to 0.71M) and High at 1.70M (vila).
- The elevated views (lighthouse, fort wall, aerial) were already above 260 draws before this pass. The whole vegetation layer is one batch draw plus the ground cells in reach, so that overage is kit and props.
- Frame time with vsync off was 4.7 to 4.9 ms after, against 5.0 to 7.2 ms before. Other agents were loading the machine, so these are indicative only.
- Atlases: foliage 1.10 MB, ground 0.25 MB (WebP q80, lossless alpha).

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 744 passed, 96 files.
- New and updated tests cover:
  - kit bushes replaced one to one
  - dressing kept off roads, doorways and solids
  - solid wall behind every drape, a post behind every climber
  - meadows and ground cover below cover height
  - cover never hidden at range
  - the leaf-only shadow alpha test
  - every species has a builder
  - LOD silhouettes and budgets
  - atlas guard bands and download budgets
- Traversal, spawn and bot tests are unchanged and pass. Nothing in the simulation reads vegetation.

## Tools

- `tools/qa/plant-lab.html`, `plant-lab.ts`, `plant-lab.mjs`: any template under the game's lighting at 3, 15 and 60 m, back-lit, from below, in wind, or with `?defaultDepth`.
- `tools/qa/dressing-views.ts` and `tools/qa/eye-views.ts`: review cameras.
- `tools/qa/veg-fps.mjs`: frame-time probe.

## Remaining issues and notes for the structure lead

- The fazenda field rows cross a paved road at x 46 to 69, z 70. The crops skip the road, but the soil strips do not (layout).
- `kit.ts` still carries the fading path for `bush_cluster` and `hedge` (`SOFT_LANDSCAPE`), which is now dead. It can be removed with the kit.
- Trunks have no collision, by the existing design. `plantTrunkSections` matches the rendered trunks exactly (tested) if trunk colliders are ever wanted in `world.ts`.
- Plants can be authored by detail name:
  - through the existing `tree(...)` helper: `coconut`, `royal`, `mango`, `jungle`, `almond`, `cashew`, `flamboyant`, `ipe-yellow`, `ipe-pink`, `mangrove`, `banana`
  - as `grass` objects: `hibiscus`, `bougainvillea`, `heliconia`, `strelitzia`, `croton`, `fern`, `monstera`, `taro`, `bromeliad`, `reeds`, `crop`
  - new house pieces get bougainvillea only once added to `VINE_WALLS` / `POST_CLIMBERS`.
- From the plane, open fields still read as flat colour: the lawn is culled past 34 m and the meadows are too subtle to show from that height.
