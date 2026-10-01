# First-person arms matched to the character

1 October 2026, branch `fp-arms-match` (from `overhaul/aaa-autonomous`, merged again after the
character's round 3). Brief: `docs/overhaul/briefs/fp-arms-match.prompt.txt`. Research:
`docs/overhaul/fp-arms-research.md`. Evidence: `docs/overhaul/evidence/fp-arms/`. All captures are
real Chrome with ANGLE Metal, medium preset, 1280 x 720 (boards scaled down). Blender ran only on the
Linux build machine (`tools/blender/remote-blender.sh`).

## What changed and why

### The arms are the character's arms
- **Paw**: the first-person paw is now `capy_hand.build()` itself (imported, not copied), placed at the
  wrist at `PAW_SCALE = 1 / 1.3`. Third-person guns are drawn at `TP_WEAPON_SCALE` (1.3) so the big
  world paw holds them; first-person guns are at 1.0, so the paw at 1 / 1.3 keeps the paw-to-gun
  proportion identical in both views. A test guards it: the first-person joints equal the world
  paw's joints divided by `TP_WEAPON_SCALE` (`tests/paw-asset.test.ts`). The old small sculpt
  (`paw_sculpt.py`) is no longer used by the arms.
- **Forearm and cuff**: the character's forearm sections (wide below the elbow, a broad wrist, the
  taller axis back to palm) and its rolled linen cuff (a flat band over a soft roll just past the
  elbow, the sleeve's drape and crumple) at the same scale across the arm, fused with the paw by a
  small fillet into one watertight signed-distance sculpt (`tools/blender/fp_arms.py`). The arm keeps
  the rig's lengths (upper .30, forearm .30 m), which the IK framing depends on.
- **Surface**: painted per vertex on a dense OpenVDB mesh (0.6 mm) and baked onto a 15k-triangle game
  mesh per arm with its own 2K maps, using the character's palette and rules from
  `capybara_paint.py` (imported) evaluated in world-paw coordinates: fur `#B47C49` with the lighter
  inner forearm, the round 3 combed locks (9 x 26 mm on the world paw, dark roots, light tips,
  renormalised to the palette), bare leathery skin `#4E433E` to `#6C5E57` on the palm and the digits
  past the knuckles, glossy dark claws, linen `#E4D8C0` with tone-on-tone folds. First-person extras
  for the close view: soft joint creases and palm folds in the skin tone.
- **Fur shells**: the forearm and the back of the paw grow shells like the character's
  (`capybara-fur.ts`, round 3): 15 mm at the paw scale, fine strands clumped into 13 x 40 mm locks
  combed toward the paw; the bare digits, claws and linen have none. `_FUR` drives them as before.

### Grips and choreography re-fitted to the new paw
The new paw is about 1.4 times the old one, so every grip and contact was re-fitted.
- **Grips are data**: `src/render/fp-grips.json` holds every weapon's paw grips in weapon space;
  `viewmodel-specs.ts` reads it (the world character uses the same data).
- **Firing paws** wrap the pistol grip: palm on the right of the grip, middle and ring digits round
  the front strap to the left side, the index pad on the trigger from outside the guard, the back of
  the paw to the eye. Fitted with `tools/qa/grip-fit.mjs` against a grip axis (new `axis` option:
  angles measured around the raked grip instead of the bore) from a fitted M4 grip transferred to
  each weapon by its trigger position.
- **Support paws** clamp the fore-end or pump from the lower left (palm on the left flank, thumb over
  the top pointing forward, digits forward and curling under: tips 260 to 320 degrees round the
  bore); the pistol and revolver support paw closes on the firing paw and the grip from below-left;
  the SMG paw holds its vertical foregrip; the machete free paw stays low and ducks under the cut.
- **Reload contacts** were re-fitted in their parts' frames (magazines, slide stop, charging handles,
  bolt knob, crane, ejector rod, speedloader, shells, coconut, bolt catch). Every approach and
  clearance key is now an offset from its contact key (`shift`), so a refit carries the reach with
  it; firing-paw reaches leave and return through a `FIRING_RELEASE` key (open in place, then slide)
  and arrive open.
- **Weapon change**: the DMR's slung leather strap hung where the big paws work (the firing forearm
  rises through it, the support paw meets it at the magazine); the sling is stowed and its brass
  loops kept (`arsenal.py`, rebuilt on the Linux machine, 21,200 triangles, 670,548 bytes).

## Evidence
- `paw-studio-fp-vs-tp.jpg`: the first-person paw and the world character's paw, same light, the
  camera at 1 / 1.3 the distance for the first-person paw: the same paw, the same size against a gun.
- `fp-vs-tp-board.jpg`: in game, the first-person view and a close of the firing paw (40 degree lens,
  1 / 1.3 of the distance) above the world character holding the same weapon over the shoulder and at
  the firing paw.
- `<weapon>-before.jpg` and `<weapon>-after.jpg`: hip, aimed, sprint, two inspect beats, four
  reload or action keys and the hip grip from both sides and the front, before and after.

## Clearance
CLEARANCE_TABLE

## Tests
TESTS

## Known issues
KNOWN
