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

## Round 2: design, shapes and life

Brief: `docs/overhaul/briefs/char-round2.prompt.txt`, the review boards in
`output/review/char-r2/`, the HUD portrait and the cover art. Boards (target on top, game below,
daylight review scene): `docs/overhaul/evidence/char-polish/r2-board-face.jpg`, `r2-board-body.jpg`,
`r2-board-clay.jpg`, `r2-board-hold.jpg`, `r2-board-idle.jpg`, `r2-holds-a.jpg`, `r2-holds-b.jpg`;
the round 1 state for comparison is `r2-before-body.jpg`.

### What changed
- **Face**: a golden head, taller than wide from the front, with a flat brow-to-nose line and a
  blunt front, a set-back chin and a gentle mouth line. The nose is a grey-brown leather pad shaped
  like a wide heart at the upper front of the muzzle with two dark nostrils; the philtrum is a groove,
  not a stripe. Pale buff whisker pads with three rows of whisker roots and real whisker strands on
  LOD0. Larger eyes set high but turned forward (both read in a level front view), amber iris, dark
  lid line, catchlight, brow ridge. Dark grey-brown cupped ears, upright, in the silhouette front and
  back. A thick furred neck with jowls runs into the collar. The head stays inside the head hit
  sphere in every clip (tested).
- **Build**: broad round shoulders and a round belly; thick upper arms and forearms carried out from
  the body; a new paw of its own (`tools/blender/capy_hand.py`, about 25 cm long, 17 cm across the
  knuckles: four thick digits with short blunt claws, a padded palm, bare leathery skin on the palm
  and digits, fur on the back up to the knuckles). Two separate thick legs from the crotch in a wide
  planted stance, toes turned out 12 degrees. The planted-feet test and the ground clamp follow the
  new foot contact (`metrics.footContact`).
- **Team cloth**: a bandana worn outside the neck, with a knot and two tails, inside an open shirt
  collar; a hip rag with vertical pleats and a pointed end that lies on the belt and trouser leg; a
  rolled blanket with spiral ends and two buckled straps. Detail is value only (sculpted folds,
  occlusion, weave, hem); checked in red, blue and yellow at 60 m.
- **Rucksack**: a stuffed canvas body, a top flap with two buckled straps, side pockets with flaps,
  the blanket roll on top and leather shoulder straps over the shoulders to the vest front.
- **Clothes**: shirt with an open V neck, a collar above the bandana, buttoned placket, soft sleeve
  drape and one rolled cuff band; vest with a denim collar and lapels, chest pockets with flaps and
  studs, double topstitching and the D-ring on the back yoke; trousers with waistband, fly, back
  pockets, cargo pockets with flaps and studs on both thighs, knee, seat and crotch folds, rolled
  cuffs; belt with a framed buckle, loops and two pouches with flaps and studs.
- **Paint**: large value shapes and soft gradients, micro variation under about 8 percent, clean
  seams; the plaid became a quiet weave; the pale seam streaks are gone. One fur family everywhere.
- **Life**: a 10 s idle with four breaths (chest, belly, shoulders), weight shifts from foot to foot,
  quick head turns with holds, ear flicks, three blinks and a nose twitch (new `nose` bone); an armed
  idle with the left foot forward, knees bent and the weight leaning in, the gun at low ready until the
  player moves, aims, fires or reloads (it then comes up and stays 1.4 s); the aim pitch runs through
  spine, chest and head. Springs on the bandana tails, hip rag, blanket, pack and ears react to
  speed changes, starts, stops and landings (runtime, no cloth simulation).
- **Holds**: held world weapons scale to the world paw (1.3); a small wrist offset (`tpGripOffset`)
  and softer finger curls fit the larger hand to the first-person grips. All nine weapons checked
  from two angles aimed (`r2-holds-*.jpg`) and at the paws.
- **Cost**: the character now ships in three self-contained files chosen by the quality setting at
  load (no double download): High `capybara-high.glb` (4096 maps), Medium `capybara.glb` (2048),
  Low `capybara-low.glb` (1024).
- **Rig**: 71 joints (added `scarf_L`, `scarf_R`, `bedroll`, `nose`); clips 43 plus 6 faces (eight
  walk and eight crouch directions, `idle_armed`).
- **Pipeline**: every Blender step now runs on the Linux build machine
  (`BLENDER_BIN=tools/blender/remote-blender.sh`, threads from `BLENDER_THREADS`): 204 s for the whole
  character job against about 18 minutes here. `CAPY_REUSE_BAKES=1` reuses the bake cache when only
  the rig or clips change. The shipped assets come from one Linux build.

### Measurements

| Tier | File | Download | GPU memory (3 maps, RGBA8 + mips) |
| --- | --- | ---: | ---: |
| High | capybara-high.glb | 7.05 MB | 192 MB |
| Medium (default) | capybara.glb | 3.83 MB | 48 MB |
| Low | capybara-low.glb | 2.80 MB | 12 MB |

At 50 Mbit/s these load in about 1.1 s, 0.6 s and 0.45 s. LODs: 40,866 / 9,380 / 2,168 triangles.
Statue 56 KB, 10,000 triangles. Crowd timing, QA plaza with 16 capybaras, 1280x720, quieter machine
(load average about 10): low 16.7 / 16.8 ms p50/p95, 136 draws, 1.55M triangles; medium 16.7 / 16.7,
155 draws, 1.75M; high 16.7 / 16.7, 180 draws, 2.11M (vsync bound on all three).

### Tests
`npx tsc --noEmit` clean, `npx vitest run --maxWorkers=2`: 114 files, 1054 tests pass, `npm run build`
passes. The hit-shape test now guards the contract only (head vertices inside the head sphere, the
rest on the ground in a sane envelope); new gait cases for a direction between two clips; the reaction
tests follow the world paw's grip offset; the label follows the ear tips.

### Final palette for the first-person arm match (sRGB)
Fur base `#B47C49`, tips `#CC9763`, dark (crown, nape, back) `#8E5A33`, light (cheeks, throat,
undersides, inner forearm) `#C79B6A`, muzzle buff `#CDB795`. Bare skin (palm, digits, toes)
`#4E433E` to `#6C5E57`, claws `#2A2320`, nose leather `#6A5E58`, ears `#4E403B` to `#6B5148`.
Linen `#E4D8C0` with tone-on-tone seams `#CDBFA4`; denim `#51627E` with `#C9944F` topstitching;
olive canvas `#74755A`; leathers `#6E4A31` and `#55382A`; rucksack canvas `#7E6444`; brass `#C39A52`.
Fur locks: head 10 x 30 mm, paws 8 x 22 mm, body 16 x 50 mm; shells 6 layers, 11 mm, within 6.5 m.
The paw: `capy_hand.py` (four digits, lengths 108 to 150 mm from the wrist, radii 20 to 27 mm).

### Known issues
- Stylized, not photo real: the fur reads as painted locks plus shells, not the sheet's strands.
- The support paw on the Lanca-coco and the sniper sits slightly below the fore-end in the aimed
  pose; no clipping, but the thumb does not wrap.
- At 60 m from behind in shade, the yellow team colour reads weaker than red or blue.
- The first-person arms still use the round 1 palette (see above to match).

## Round 3: knees, head and fur

Brief: `docs/overhaul/briefs/char-round3.prompt.txt`, then the user's direction during the round: a fun,
cartoonized capybara humanoid, with the references as guides rather than specs (no cheek lobes, no bead
eyes, no pig snout, fur that reads as fur, only changes that beat round 2). Worked from round 2 in small
steps; every step was compared with round 2 and the targets at the same cameras (1.1 m face front,
three-quarter, side and back; 3 m body; clay; 1.7 m legs; walk, run and crouch strips; 8, 15 and a true
60 m). Boards (target or round 2 above round 3): `docs/overhaul/evidence/char-polish/r3-board-face.jpg`,
`r3-board-clay.jpg`, `r3-board-body.jpg`, `r3-board-legs.jpg`, `r3-board-far.jpg`, `r3-board-concept.jpg`,
`r3-expressions.jpg`, `r3-holds.jpg`, `r3-support-paw.jpg`, `r3-tiers-lods.jpg`, `r3-clips.jpg`, `r3-statue.jpg`.

### What changed and why
- **Knees** (`capybara_clips.py`): the leg IK pole pointed at Blender -Y, which is game backward (the
  exporter maps game -z to Blender +Y), so every authored clip (idle, armed idle, the eight walk and
  eight crouch directions, run, jump, land, death, emotes) bent the knees backward: the "bent backwards"
  read. The pole now points forward: a soft forward knee over the foot in every gait (`r3-board-legs.jpg`).
  Planted feet, the ground clamp and the gait tests are unchanged (the IK targets are the same).
- **Head** (`capybara_form.py`, `capy_sdf.py`): rebuilt as one clean lofted box (the loft now takes a
  width at the cheeks, a quadratic across each section) capped by a convex blunt muzzle front, so there
  are no added lobes: the round 2 jowl ellipsoids ("two big balls at the base of the head") are gone and
  the cheeks taper into a thick column neck. A soft cushion nose pad with slanted slit nostrils, a wide
  gentle smile, calm half-lidded almond eyes set in the skull under a soft brow (a lid cut, not a bead on
  the surface), both visible from the front, small cupped ears at the crown corners and a crown tuft.
  Modeled toward a new head concept (`docs/art/references/capybara-head-concept-r3.jpg`, Codex image
  tool, prompt in `docs/assets.md`), matched at the concept's framing (`r3-board-concept.jpg`).
- **Fur** (`capybara_paint.py`, `capybara-fur.ts`): the painted locks were anisotropic Worley cells in
  one global frame, sheared into cells and ripples wherever the comb turns; they are now laid in
  flow-aligned coordinates per region (head radial from the nose, body and legs down, forearms elbow to
  wrist, paws along the digits, feet forward), blended like the comb. Each lock has dark roots and a
  lighter tip, renormalised to the palette so the far read keeps its colours; relief 1.3 mm (head),
  0.8 mm (paws), 2.0 mm (body) in the normal map. Value design: darker crown top, nape and backs of the
  limbs, lighter cheeks, jaw and throat, a warm buff lower muzzle, a crisp lid line along the opening
  and a soft light ring round the eye. Shells: 8 layers of 15 mm (were 6 of 11 mm), clumped into
  13 x 40 mm locks of 1.1 x 9 mm strands along the same comb frames; the lids keep their fur to the edge.
- **Face rig** (`capybara_weights.py`, `capybara_form.py`): the brow bone and its weights sit above the
  larger eye (inside it they lifted a ridge), the lid weights hug the opening, gentler brow poses; the nose
  leather rides the `nose` bone (the idle twitch now shows); the nape below the skull rides the neck.
- **Hit volume**: every LOD's head vertices stay inside the head sphere (a decimation outlier or two on
  LOD1/LOD2 is brought back inside at build time and logged); worst case over faces and locomotion
  0.293 m against the 0.302 m limit. The label follows the head crown and the two ear tips separately.
- **Far team read** (`capybara.ts`): beyond 18 m the cloth's team mask is the larger of the texel mask
  and the vertex mask (the mipmapped texel mask blurred into the fur, so a golden team colour read as
  more fur) and the cloth carries a little of its team colour as light, lit or in shade. Vivid team
  pixels at a true 60 m (1920x1080, 70 degree view, daylight and shade, front and back), round 2 to
  round 3: red 20-29 to 32-38, blue 0-2 to 3-10, yellow from behind 11-19 to 19-24, yellow from the
  front unchanged (24-40 to 22-41). `r3-board-far.jpg`.
- **Support paw** (`capybara.ts`, `TP_SUPPORT`): on the Lanca-coco and the sniper the support wrist is
  lifted onto the fore-end (10 and 12 mm in weapon space) and the digits close further, so the paw wraps
  the wood instead of sitting under it (`r3-support-paw.jpg`). The other seven holds are unchanged.
- **Statue**: rebuilt from the new head (55 KB, 10,000 triangles). The export's "Mesh ... is not valid"
  meant the glTF exporter was silently fixing degenerate faces during export; the statue and the
  character LODs are now validated before export and the log says what was fixed (the LODs lose about 93
  duplicate decimation faces; the statue is clean). The shipped geometry was already the cleaned one.
- **Pipeline**: the 4K paint runs inside Blender on the build machine too (`capybara_maps.py`), so one
  Linux build makes every shipped map. Review tools: `ads=1` (aimed), `graphics=low|medium|high`, a closer
  motion framing (`FOCUS`, `FOV`), longer screenshot timeouts; the sculpt preview meshes only the head or
  the legs in seconds. Shared contracts untouched: `capy_hand.py`, the forearm, paw skin, claw and cuff
  colours, the hit shapes, eye height, the weapon mount, the three tiers and the runtime API.

### Measurements

| | Round 2 | Round 3 |
| --- | ---: | ---: |
| LOD0 / LOD1 / LOD2 triangles | 40,866 / 9,380 / 2,168 | 40,889 / 9,405 / 2,186 |
| Fur shells (within 6.5 m) | 4,884 faces x 6 = 29.3k | 4,967 faces x 8 = 39.7k |
| High / Medium / Low GLB | 7.05 / 3.83 / 2.80 MB | 6.52 / 3.75 / 2.79 MB |
| GPU texture memory | 192 / 48 / 12 MB | unchanged |
| Statue | 56 KB, 10,000 triangles | 55 KB, 10,000 triangles |

Crowd timing, QA plaza with 16 capybaras, 1280x720, `tools/qa/charperf.mjs`, on a machine shared with
other sessions (load average 21 to 47 during the runs, so the timings are load bound; the release gate
redoes performance on a quiet machine): low 16.7 / 33.5 ms p50/p95, 136 draws, 1.55M triangles (load
21.0); medium 16.7 / 33.4 ms, 155 draws, 1.75M (load 47.4); high 33.3 / 33.4 ms, 180 draws, 2.11M (load
39.0). Draws and triangles in that pose are the same as round 2's; the extra shell triangles (about 10k
per capybara) only apply within 6.5 m.

### Tests
`npx tsc --noEmit` clean; `npx vitest run --maxWorkers=2`: 114 files, 1054 tests pass. At a load average
near 98 the default 15 s timeout failed about 20 heavy world, sound and bot tests by timeout only (none in
the character suites); the whole suite was rerun with `--testTimeout=600000` at a load of 43 to 76 and
passed, and the same suite passed at the default timeout at 18:42 under a load of 16 to 29;
`npm run build` passes. The character suites (asset contract, head and crouched hit volumes, gait,
boing, reactions, loading, readiness, team mask) pass at the default timeout. The head hit-volume tests
now count the `nose` bone as part of the head (the nose leather rides it).

### Final surface values for the first-person arm match (sRGB, unchanged from round 2)
Fur base `#B47C49`, tips `#CC9763`, dark `#8E5A33`, light and inner forearm `#C79B6A`; bare paw skin
`#4E433E` to `#6C5E57`; claws `#2A2320`; linen cuff `#E4D8C0` with tone-on-tone seams `#CDBFA4`. The
muzzle buff moved to `#D5B68C` (face only). What changed is the fur pattern, for matching the arms' look:
combed flow-aligned locks (paws 9 x 26 mm, body and forearms 20 x 62 mm), dark roots (x0.76) to light
tips (`#CC9763` at 55 percent), and 8 shells of 15 mm clumped into 13 x 40 mm locks. `capy_hand.py` is
unchanged.

### Known issues
- Stylized 3D against a painted concept: the concept's soft strand fur and its white-rimmed eyes are
  approximated by painted locks, shells and a lid line; up close the shells end in a slightly jagged
  silhouette.
- Blinks close the eye by squashing the lids (the rig's contract): at 1 m the closed lid reads as a smooth
  plate for the 0.1 s of a blink; fine from 3 m.
- The head's shaded side (away from the sun) reads browner than round 2's rounder head, which caught more
  sky light on its jowls.
- Yellow is still the weakest team colour at 60 m (its hue is close to the fur's).
- The build machine does not receive `CAPY_REUSE_BAKES` (the remote runner passes no environment), so
  every character build re-bakes (about 3.5 minutes there).

## Round 4: the face's appeal

Brief: the director's review of round 3 (`output/review/char-r2/evolution-face-r3.jpg`): small half-closed
eyes read sleepy or grumpy, the shaded side of the head read muddier than round 2 and the concept, and
blinks looked like flat plates at 1 m. Boards (concept or round 3 above round 4, same cameras):
`docs/overhaul/evidence/char-polish/r4-board-face.jpg`, `r4-board-eyes.jpg`, `r4-board-blinks.jpg`,
`r4-board-shade.jpg`.

- **Open, larger, bright eyes** (`capybara_form.py`, `capybara_paint.py`): the neutral eye is open (no
  heavy upper lid): a larger eyeball (52 mm, was 46) set a little prouder in a tall almond opening (66 mm,
  was 47) under a soft brow, a warmer and brighter iris (`#C0812F` to `#6A3C18`), a larger catchlight and
  the round 3 lid line. The half lid is now only in blinks and expressions. At 3 m the eyes and their
  highlights read clearly; at 8 m front and three-quarter they still read (round 3: barely)
  (`r4-board-eyes.jpg`, game view, 70 degrees).
- **Blinks with furred lids** (`capybara_weights.py`, `capybara_clips.py`, `capybara_v6.py`): the round 3
  blink squashed the lid skin and the eyeball toward the eye's centre line (the plate). Now the eyeball
  carries its own furred upper lid, painted over its top where the head hides it while the eye is open
  (strands, the colours of the skin round the eye, a dark lash edge), and the `socket_` bones roll the
  eyeball forward about the line through the eye corners: the lash edge and the fur slide down over the
  iris inside the opening, and no skin stretches. The `blink_*` scale stays the lid control of every clip
  and of the tests; the clips derive the roll from it (`lids_from_blink`, 1.54 rad shut), so the idle
  blinks, the half-lidded determined face, the victory squint and the hit squeeze all use the new lid.
- **Golden in shade** (`materials.ts`): a warm fill in the fur's own colour where the sun does not reach
  (the light scattered through a stylized pelt), on the world character's fur only: cloth, paw skin, claws
  and the first-person arms keep their shading. The shaded cheek went from a muddy `#4C2E0B` (round 3)
  to a golden `#864C13` at the same camera (`r4-board-shade.jpg`).
- **Paler muzzle**: the buff is paler (`#E6D2AE`, was `#D5B68C`) and covers the muzzle's sides in front
  of the eyes as well as the lips and chin, for the concept's cream muzzle against the golden head.
- Forearm, paw skin, claw and cuff colours are unchanged (the palette above). For the arm match: the
  world character now adds the warm shade fill on its fur; the first-person arms do not.

Measurements: LODs 40,889 / 9,405 / 2,184 triangles (unchanged); High / Medium / Low 6.58 / 3.78 /
2.81 MB; head vertices stay inside the head sphere in every clip (worst 0.293 m of 0.302). Crowd timing
(16 capybaras, load average 7 to 11): low 16.7 / 16.8 ms p50/p95, medium 16.7 / 33.4, high 33.2 / 33.4;
draws and triangles unchanged. Tests: `npx tsc --noEmit` clean, `npm run build` passes, `npx vitest run
--maxWorkers=2` 1050 of 1054 with 4 timeouts in four world files at a load of 6 to 23, which pass alone
(49 of 49); the character suites pass.

Known issues: seen from the front at 1 m a closed eye reads as a round furred lid inside the dark lid
ring (fine from 3 m and in motion); the eye whites of the concept are not painted (the iris fills the
opening).
