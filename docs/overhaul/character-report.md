# Character rebuild report (v6)

30 September 2026, branch `character-rebuild`. The player capybara, its third-person weapon
holding and its animation set were rebuilt toward `docs/art/character-benchmark/holding-reference.jpg`
and the turnaround and head sheets. Research notes: `docs/overhaul/character-research-notes.md`.
Evidence stills (real game renderer, `tools/blender/review.html`): `docs/overhaul/evidence/character/`.

## What changed and why

### The model
The rejected v5 was cross-sections voxel-unioned into a faceted block head, tube legs and a
shapeless torso, with flat vertex colour. v6 is a new pipeline:

- **A signed-distance sculpt** (`tools/blender/capy_sdf.py`, `capybara_form.py`). The head is
  lofted along its length from profile stations (flat top line, tall blunt muzzle, broad jowls
  that taper to a narrower muzzle, a small set-back chin), then gets a dark rhinarium with slanted
  nostrils, a divided upper lip and mouth groove, almond eye openings in a raised lid rim with a
  heavier upper lid and a brow pad, and small cupped ears at the back. The body is a barrel torso
  with a real belly, short thick legs in baggy rolled cargo trousers, furry shins and big
  three-toed feet with dark claws. The hands are the first-person v3 paw: `paw_sculpt.py` is
  imported and its heel, pads and digit ellipsoids are rebuilt as a smooth union (1.1x scale),
  with the same digit bones as the viewmodel. Clothes and gear (cream shirt with rolled sleeves,
  denim vest with pockets, coral scarf, belt with pouches and brass, backpack with a bedroll and
  straps, hip rag) are unioned into one watertight surface, so nothing can poke through a garment.
- **Meshing and baking** (`capybara_v6.py`): OpenVDB (bundled with Blender) polygonizes the SDF at
  2.5 mm (0.9M vertices), decimation makes the game LODs, Cycles bakes position, normals and
  occlusion, and `capybara_paint.py` paints every texel from the SDF's own material at that point:
  combed chestnut fur with clumps and lighter tips, a caramel muzzle, pebbled paw pads, a faint
  linen check, denim twill, trouser canvas, leather grain, glossy dark eyes with a brown iris. Fine
  relief becomes tangent-space normal detail blended with the baked sculpt normal.
- **Rig** (67 joints): every v4/v5 name is kept, plus `chest` (the gun rides it), `belly` (breath
  and jiggle without scaling children), `toes_L/R`, `pack` and `hipcloth`. Weights come from the
  nearest body parts of the sculpt (soft minimum), digits by chain ownership like the first-person
  arms, the vest and straps on the torso only, the shirt kept with the chest at the armhole, and
  the face on its bones: lid skin and eyeball on `blink_*` (scale closes the lids), brows, mouth
  corners, jaw and ears.
- **Close-range fur** (`src/render/capybara-fur.ts`): LOD0 draws alpha-tested fur shells (6) on
  the pelt within 6.5 m, thinning over the last 2.5 m, so the silhouette reads as fur up close.
- **Team colour**: scarf, hip rag and bedroll are neutral cloth tinted per texel from the ORM red
  channel (crisp edges, folds and a border stripe keep their light). Far characters brighten and
  get a wider rim beyond 18 m (Valorant's approach) for readability in shade.

### Third-person holding
- Guns ride the `chest` bone at the world paw's scale (1.1x, `TP_WEAPON_SCALE`), so the
  first-person grip specs stay valid in weapon space for every weapon, including the new short-gun
  part-anchored reloads.
- Long guns (rifle, heavy classes) use a bladed stance: spine and chest turn the left shoulder
  forward, neck and head turn back to the aim. The stock sits in the right shoulder and the support
  paw reaches the handguard close to the body. Pistols are held two-handed at chest height,
  the machete at the right side with a free left paw.
- The arms are bound halfway between hanging and the gun hold (upper arm about 55 degrees
  forward), which removed the armpit tearing seen with a hanging bind.
- A real bug found by a test: the mixer only writes a bone when its value changes, so the stance
  rotations on constant tracks accumulated frame after frame (the gun jittered by 7 to 14 cm).
  Spine, chest and neck are now restored to the last mixer output before posing.
- Reloads keep the gun low at the chest; hits flinch the chest (and so the gun) away from the shot.

### Animation (`capybara_clips.py`, `character_emotes.py`, 60 Hz)
Planted-foot two-bone leg IK with heel peel and toe roll. Idle: slow belly breaths, weight shifts,
an ear flick, a chew, a slow look around. Walk: the waddle rolls over the stance foot under a
steady head (the torso is shifted under the head so the face stays in its hit volume). Run: a
driving scurry with lean, counter-twist, belly jiggle; ears, pack and hip rag lag. Strafe,
backpedal, crouch idle and walk (a hunched crouch that puts the head in the crouched hit sphere),
jump, fall, land (squash and settle), death (stagger, buckle, flop onto the side), face clips
(determined, hit, stunned, victory, blink), emotes (lazy wave, samba with a clap, two-paw cheer,
sitting on the haunches, the belly-down loaf, the trampoline star), and two new in-air poses the
runtime picks from the actor's stage: a spread skydive in freefall and paws-on-the-risers under the
parachute. Swimming stays procedural in the runtime.

## Measurements

| | v5 (before) | v6 |
| --- | ---: | ---: |
| LOD0 / LOD1 / LOD2 triangles | 39,814 / 9,799 / 2,443 | 26,499 / 7,795 / 2,177 |
| Fur shells (LOD0, within 6.5 m only) | none | 28.5k triangles, one extra draw |
| Joints / clips | 61 / 25 | 67 / 27 (+ 6 faces) |
| GLB | 2.43 MB | 3.17 MB (3 WebP 2048 maps) |

Budget reasoning for 20 players at medium: LODs switch at 12 m and 28 m, so in a typical fight a
few capybaras are on LOD0, most on LOD1/LOD2; 20 characters cost roughly 150k to 250k triangles
plus at most a few fur shell draws, a draw call per character, and one shared texture set
(Overwatch's published hero budget is about 30k for LOD0 plus weapon).

Frame timing on this Apple M2 (Chrome, Metal, 1280x720, dev server, machine shared with two
Codex agents), QA plaza with 16 capybaras (the QA hook's maximum), `tools/qa/charperf.mjs`:

| Preset | p50 / p95 frame ms | Draw calls | Triangles |
| --- | --- | ---: | ---: |
| low | 16.7 / 16.7 | 89 | 0.91M |
| medium | 16.7 / 16.7 | 158 | 1.68M |
| high | 16.7 / 16.7 | 182 | 1.99M |

All presets hold 60 fps (vsync bound), so headroom beyond that was not measured.

## Tests
`npx tsc --noEmit` clean; `npx vitest run`: 103 files, 897 tests pass. Updated or added for the
new contract: texel team mask and white vertex colour, material extras, belly breathing, lids as
the hit-face indicator, the draw settling before the LOD socket check, the character style cache
key, and a new test that the crouched head sits in the crouched hit volume. The existing hit-volume,
planted-feet, loop-seam, digit-ownership, root-travel and short-gun reload tests all pass on v6.

## Tools
`tools/qa/charshots.mjs` (review stills: angle, distance, FOV, focus, LOD, clay, expression),
`charmotion.mjs` (strips for clips, emotes, death, hit, reload, air and swim), `charperf.mjs`
(crowd timing), `sculptshots.mjs` with `tools/blender/sculpt-preview.html` and `capy_preview.py`
(iterate the sculpt in seconds without Blender). No external assets were used.

## Known issues
- Under the arms at under 1 m, a few jagged texels show in the crevice between the vest armhole
  and the sleeve (the decimated surface bridges the crevice and the bake picks both sides). Not
  visible from 2 m.
- Face expressions are subtle at gameplay distance (lids, brows, ears and mouth corners only).
- Gaits are time-scaled to speed and the feet slide a little at full sprint.
- The far-distance brightening was checked in the shader and at 15 m; a clean 60 m sightline was
  not found in the review scene, so the 60 m view is judged only from emulated shots.
- The Morro statue is still built by `capybara_v4.py` (kept, with `capy_paw.py` and
  `character_surfaces.py`, only for it); `build-characters.mjs --statue` runs it first.
- `paw_sculpt.py` needed no change: it is imported as is (standalone iteration uses a small shim
  for `bpy` and `mathutils`).
