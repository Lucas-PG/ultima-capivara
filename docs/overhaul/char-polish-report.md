# Character polish report

30 September 2026, branch `char-polish` (base 1a5a004, `overhaul/aaa-autonomous` merged in at the
end). Taken over from a Codex agent; mid-task the user widened the job to a full quality pass
("the character looks very low resolution"). Evidence: `docs/overhaul/evidence/char-polish/`
(real game renderer, `tools/blender/review.html`, 1280x720 unless noted).

## Takeover review
The previous agent left 15 uncommitted files. Kept, after checking each one:
- review tooling: open 60 m range with daylight or shade, true strafe/backpedal velocities;
- fur shells drawn after the skin without depth writes (fixes the outline tracing strands);
- the statue build moved off the v4 script into `capybara_statue.py` (rebuilt further, below);
- the direct low-surface position bake (`P_low`) for the vest armhole, and its gait test idea.
Redone: its gaits lowered the thigh bones 10 to 14 cm below the pelvis to reach long strides
(the trousers stretched at the hips), its enlarged-eye face and noise-reduced fur still read
flat, and its last clip change was never packed. Its reclip scripts and captures were scratch.

## What changed

### Sculpt (`capybara_form.py`)
- Head re-sculpted to the head sheet: a blunt snout that ends in a round tip instead of a flat
  disc, a bulbous nose under a raised leather rhinarium (own `nose` material, nostrils in its
  lower corners, philtrum groove), broad whisker pads over a set-back chin, a mouth line that
  runs back to the corner, brow ridges over lidded eyes, larger cupped ears, a thicker neck so
  the head flows into it. The snout stays inside the head hit sphere (checked for every face
  and locomotion clip). Eyes sit further forward and out, so both read from the front.
- Cloth: shirt drape under the chest, blousing over the belt, irregular twisted sleeve folds,
  a collar with points under the scarf, four placket buttons; knee, drape and crotch folds on
  the cargo trousers; brass studs on the vest and cargo pocket flaps; a framed belt buckle.
- Sewn pieces have their own ids (`denim_pocket`, `trouser_pocket`, `pouch`, `pack_flap`) so the
  painter finds their seams. A 8 mm fillet where vest meets shirt, and a tighter armhole.

### Pipeline (`capybara_v6.py`, new `capybara_maps.py`, `build-characters.mjs`)
- Bakes at 4096 (occlusion at 2048, filtered up), LOD0 40.5k triangles, head texels 2.1x and
  paw texels 1.5x denser. Albedo and normal ship at 4096, ORM (team mask, roughness, metal) at 2048.
- Painting moved out of Blender: Blender caches the bakes and exports placeholder maps;
  `capybara_maps.py` (Blender's python, no bpy) paints from the cache in chunks; the pack step
  puts the maps in. `SKIP_BLENDER=1 node tools/blender/build-characters.mjs` repaints in ~2 min.
- `prune({ keepSolidTextures: true })`: plain prune dropped the flat placeholder slots.

### Paint (`capybara_paint.py`) and final surface design (for matching the first-person arms)
- Fur: groomed locks, an anisotropic cell per lock laid along a comb field (back from the nose
  over the head, down neck, body and legs, elbow to fingers, forward over the feet), pointed at
  the tip, fine strands inside, dark roots between locks, pale tips, a tint per lock. Lock size:
  head 8.5 x 26 mm, paws 5.5 x 15 mm, body 14 x 46 mm; relief 0.7 / 0.5 / 1.3 mm into the normal
  map. Palette: base `#97552F`, tips `#C4834F`, undersides `#A2653A`, crown `#74401F`, inner
  forearm `#A8703F` (it was `#8C4E2B` / `#B7784A`, the first-person arms' values).
- Face: greyish tan muzzle `#9C8068` to `#B59A7E`, leather nose pad `#4B413D` to `#675B55`
  pebbled, nostrils `#100C0A`, mouth line `#231915`, three rows of whisker roots, dark lid margin,
  pale brow tuft `#C8925F` and under-eye crescent `#B98050`, iris `#7A4A22` to `#3A2112`, catchlight.
- Skin (pads, finger undersides, toes): `#3C302B` to `#66544A`, pebbled with creases; claws
  `#201915` to `#4E3E33`, glossy; soles `#2F2622`. Paw geometry is still the `paw_sculpt.py` v3
  paw at 1.1x (first-person grips depend on it).
- Cloth: linen `#E6D9C0` with a plaid of `#B89A76` lines every 26 mm and faint `#B2604E` threads;
  denim `#3E5276` with twill, pale worn edges and orange `#C8904C` double topstitching; cargo
  canvas `#626039` with a woven motif and `#A99466` stitching; leathers `#6A4630` / `#75502F` /
  `#7B5334` / `#5A3B26` with grain, burnished edges and `#C9AE80` stitches; brass `#C79A4E`.
  Stitches follow every hem, pocket, flap and strap edge (texel distance to another material).
- Armhole: where the arm raise stretches the armpit, and where the game mesh bridges the crevice,
  the cloth is a plain shadowed fold (no pattern to smear); UV-stretched cloth texels likewise.

### Runtime
- Gaits (`capybara.ts`, `capybara_clips.py`): eight walk and eight crouch directions; every gait
  clip plays at one shared phase advanced by distance over the blended stride, so a stance foot
  moves exactly with the actor at any speed or blend; the run follows the sprint flag (heavy guns
  sprint below 6.4 m/s); a two-bone ground clamp lifts any blended sole back onto the floor. The
  legs reach by lowering the whole body (walk 4.5 cm, run 4.5 cm plus bob), never the hips alone.
- Face poses sized for range: lids, brows (1.3 to 1.5 cm and a tilt), ears (up to 1 rad), mouth
  corners (1.6 cm) and jaw.
- Fur shells (`capybara-fur.ts`) follow the painted comb and gather strands into locks.
- Far characters (`materials.ts`) carry their team colour in the rim beyond 18 m, lit or in shade.

### Statue (`capybara_statue.py`)
Rebuilt from the current player head (snout, pad, eyes, ears), scarf, paws and feet in a soapstone
robe with deep folds, a belt line and hem; one mesh, 10,000 triangles, 55 KB, no textures.

## Measurements

| | before (1a5a004) | now |
| --- | ---: | ---: |
| LOD0 / LOD1 / LOD2 triangles | 26,499 / 7,795 / 2,177 | 40,501 / 9,497 / 2,273 |
| Fur shells (LOD0 within 6.5 m) | 28.5k tris | 40.2k tris (6,705 x 6), one draw |
| Maps | 3 x 2048 | albedo and normal 4096, ORM 2048 |
| GLB | 3.15 MB | 8.92 MB (albedo 2.5, normal 3.6, ORM 0.7 MB WebP) |
| GPU texture memory (RGBA8 + mips) | ~67 MB | ~200 MB, shared by every capybara |
| Clips | 27 + 6 faces | 38 + 6 faces |

Crowd timing, QA plaza with 16 capybaras, `tools/qa/charperf.mjs`, 1280x720, machine loaded by
other agents (load average above 20): low 16.7 / 16.7 ms p50/p95, 137 draws, 1.50M tris; medium
16.7 / 16.7 ms, 156 draws, 1.69M tris; high 16.7 / 16.8 ms, 181 draws, 2.05M tris. All vsync bound.

Planted feet (`tests/capybara-gait.test.ts`, real skinned rig, world slip of the sole while on the
ground, median / p90 m/s): walk .01 / .03, aimed walk .007 / .019, slow walk .002 / .006, strafes
.02 / .04, backpedal .008 / .02, diagonals .016 / .04, sprint .03 / .11, boosted sprint .06 / .13,
crouch .004 / .011. Before: the shipped clips played at 2.5x to reach the speed; the previous
agent's last clips were never packed.

Far read (`range-60m.jpg`): at a true 60 m on LOD2 the orange head, cream sleeves, dark vest and
olive trousers read in daylight; in shade and from behind the team rim keeps red or blue clear.

## Tests
`npx tsc --noEmit` clean; `npx vitest run`: 113 files, 1037 tests pass (on this loaded machine
some suites need `--testTimeout` above the default). New or extended: the gait test (15 cases,
planted contact measured on the rig), walk/strafe/backpedal added to the head hit volume test,
crouch directions in the crouched head test and the clip contract. `tests/visual/character-mask`
fixed (its probe planes stood below the water line the mask now suppresses) and passes against the
dev server; `npm run build` currently fails on a lightningcss minify error in `src/ui/style.css`
from the merged branch (not character code), so the preview-server run could not start.

## Holding
After the merge, all nine weapons were re-shot at the paws (`holding-paws.jpg`): the third-person
hold uses the first-person grip specs in weapon space, so the new long-gun models are held on
their new handguards and fore-ends; no paw clips through a gun in the review poses.

## Known issues
- A few sliver triangles remain in the armpit crevice; when the arm is raised they show as faint
  streaks at under 1.5 m (much reduced; a cleaner fix is retopology of that crevice).
- Facial poses read clearly at 3 m, by the eyes and ears at 8 m; at 15 m the face reads as a face
  (pad, muzzle, eye spots) but individual expressions do not.
- The GLB and texture memory grew about threefold; a KTX2/Basis path would cut GPU memory.
- The first-person arms still use `#8C4E2B` / `#B7784A` fur and their own cloth; see the surface
  design above for matching them.
- `output/characters/` keeps the build cache (bakes, rig blend) for repaint and reclip.
