# Direction A character and first-person work

Work in progress, behind opt-in review flags. The art gate is open. M0 technical
readiness fixes remain isolated in e2be33e and 7624115. The subsequent merge
connects them to Forja's shared loader and main readiness gate.

## Character round 2

Pincel's review `pincel-capyM1-review.md` governs this round. The muzzle is fur,
with a dark nose pad only. One longitudinal quad surface joins the flattened
back of the head, cheeks, descending forehead and rounded muzzle. The head
must remain within the radius 0.25 m hit sphere. Pincel corrected the proposed
0.52 m depth to about 0.47 m to respect that constraint.

The draft has a thin cloth band, knot and two tails, olive vest, leather strap,
short legs, flat feet and four-digit paws. No external tail. The belly is an
atlas region on the torso surface. An emissive mask lights the eye glints.
Palette columns 5 and 6 remain the only player-tinted colours.

Six facial clips share the rig: neutral, determined, hit, stunned, victory and
blink. Runtime blends them additively over locomotion. The review fixture can
select each pose via `expression` and `head` query parameters. Unarmed arms
blend down at rest. Brasa's authoritative reaction API will replace the draft
HP-difference trigger so armor-only hits receive the same feedback.

Required evidence still pending: all expressions at 1 m and 3 m, front/side/
three-quarter/back, the 30 m and 60 px silhouettes, exterior/interior frames
at 720p and 1080p, gear visibility, animation transitions and foot contact.
Pincel has not approved the draft visually.

## Painted weapons

`tools/blender/weapons.py` authors eight original models using one 32 x 32
painted atlas shared with brown paws. `npm run assets:weapons` exports and
compresses the set. Painted metal, light bevels, smooth warm wood, polymer,
teal accent and rarity stripe follow bible section 10. Legendary variants
also reveal geometric gold receiver filigree.

Each weapon includes explicit muzzle, ejection and sight anchors. Pistols
have two paws at the grip; long guns have a support paw on the handguard;
the machete has only the right paw. Three fingers plus a thumb, dark pads,
short claws and an olive cuff distinguish the paws from human hands.

`PaintedWeaponSet` accepts the shared loader's GLTF function, rejects missing
parts, pre-creates rarity materials and owns source resource cleanup. The
production renderer registers the set only for `?weapons=v3`, replacing the
legacy pistol and rifle manifest entries. It prepares eight models and all
four rarity materials before readiness. The default path does not register
or download the painted set.

`tools/blender/weapon-review.html` measures occupied pixels in the transparent
first-person layer at FOV 78. Hip idle acceptance, at both 1280 x 720 and
1920 x 1080:

- Occupied pixels: 18 to 25 percent of the viewport.
- Bounding rectangle: at most 45 percent of the viewport.
- Crosshair: zero occupied pixels inside radius 60 px.
- ADS is exempt from coverage, with the sight centred.

The initial `weapon-framing.ts` poses are drafts awaiting those measurements.
They are not production framing values. Inspect, equip/unequip, reload,
sprint and camera-near clipping still require animation polish and review.
The runtime now uses these same draft hip poses at FOV 78, with sight alignment
for ADS. Tests verify a single shared download, all 32 weapon/rarity variants
in warmup, centred sights and single disposal of the shared resources.

## Verification discipline

The orchestrator removed exclusive-slot requirements for builds and visual QA.
The current character and weapon exports pass focused asset/readiness tests.
Full clean-checkout checks, Pincel screenshots and Sentinela review are still
required. No claim of completed M1 approval is made.

The relaxed-arm pose uses a shoulder-to-paw swing toward the side of the hip,
converted to the arm parent's coordinate space. A simple rotation about the
upper arm's local X axis would put the paws inside the torso. The runtime keeps
this blend private per avatar and allocates its quaternions at installation.
The source bind pose still holds a weapon; the in-game unarmed rest is animated.

## Shared loader integration

`GameRenderer` extends `ASSET_MANIFEST` only for `?capy=v3`, with the relative
path `models/capybara/capybara.glb` and the generated metrics' exact byte size.
`warmup()` injects `assets.gltf` into `preloadCapybaraAsset` before `assets.ready`,
thumbnails and GPU preparation. Errors reach Forja's existing main gate.
There is no parallel fixture preload, fallback success or timeout.

The avatar update hook lives in `AvatarView.poseAvatar`, immediately after
resetting the compatibility bones and group pose. At disposal, live and
warmup avatars detach and release their private rigs, labels and parachutes
before the generic scene traversal. `disposeCapybaraAssets` then releases only
shared character caches. Disposal during compilation uses the same single
cleanup path. Focused tests cover the optional manifest, delayed/rejected
loads, deployment base, malformed-source cleanup and disposal while warming.

## Remaining animation and cosmetic gates

The asset currently exports idle, run and jump plus the six facial clips.
Walk, crouch, fall, parachute, directional hit, death flop and emotes still
need dedicated authored motion. Runtime fall/parachute transforms and the
HP-difference face trigger are temporary opt-in implementation work. Foot
contact and remote 20 Hz interpolation require a motion review. Four headwear
options, vest-trim player colour and the authoritative reaction hookup also
remain open. These are M1 requirements, not completed acceptance items.

## Round 3 local measurements, 2026-09-25

The head now separates the fur surface from the mouth line. A continuous lip
follows the rounded jaw, while the dark inner mouth stays behind it at rest.
Four eyelid deformation bones produce squeezed chevrons on hit and happy arcs
on victory; two glint bones hide highlights when eyes close. The rig has 32
bones, one skin and one material. CPU skinning checks include every facial
extreme in all three LODs. Pincel review remains required.

The machete now has an upright wooden grip, three wrapped fingers plus the
thumb, and a broad blade face. Its pitched hip pose retains only the right
paw. `characters-m1-framing.json` records all 16 model-layer measurements at
FOV 78, with the exact asset SHA256. All eight hip poses pass at 720p/1080p:
18.30 to 19.78 percent occupied pixels, bounding rectangle at most 41.10
percent, zero occupied pixels within the 60 px crosshair radius. These numbers
precede Forja's final FP compositing and do not certify animation clipping,
HUD overlap, outline or the visual art gate.

## Landing isolation, 2026-09-25

The orchestrator permits this unfinished art to land only behind `capy=v3`
and `weapons=v3`. The default path retains its previous character material
(roughness .78, no new rim), weapon models, FOV, lighting and poses. Its only
visual changes are the fixed fur/paw palette and bandana-only player tint
from `2cae943`. Forja's later approved visual slice can style the legacy
character through the agreed idempotent material API. Tests protect the
default manifest, character material and first-person camera/light setup.

Pincel's round 3 review approves the machete grip and measured footprint,
but leaves the art gate open. Next round must narrow the nose pad, blend the
jaw, recess the far eye, clarify hit/stunned expressions, flatten the bandana
and lift the fur values. Machete wood/blade/paw values, smooth paw normals
and the loose teal finger accent also need correction.

## Round 4 candidate, not approved

The nose pad is now 9.6 cm wide, a tapered rounded shape on the furry muzzle.
The separate jaw block was removed; lower head vertices blend onto the jaw
bone, and a conforming mouth cavity opens for hit, stunned and victory.
Eye surfaces are recessed onto the head, the stunned eyes are larger and
asymmetric, and the cloth band follows the torso surface with a 3 mm offset
and 2.5 cm height. The asset remains within all three LOD and posed hitbox
checks, with 33 joints and one shared material.

The machete has a wood guard, a light blade edge (#E8EEF2), smoother paw
geometry and a teal wrist band replacing the loose finger accent. The atlas
still uses the bible's fixed fur and wood values. Its 720p hip mask covers
19.38 percent, bounding rectangle 41.10 percent, with zero crosshair pixels.
The previous complete eight-weapon footprint report belongs to round 3 and
its recorded SHA256; a new full batch is required for round 4.

`character-studio.html?runtime` applies the current game material hook and
post pipeline. Without that parameter it retains the raw form review.
`weapon-review.html?runtime` applies the current game toon ramp. Both are
local diagnostic fixtures; the in-scene exterior/interior pair is still
required, and Forja's later M1 pipeline must be checked after integration.
Current production-path captures reveal excessive rim on dark facial parts
and overly orange fur. TATU-29 tracks that material issue with Forja. The far
eye and the six expressions still require Pincel's verdict; no art gate is
closed by these technical checks.

The round 4 specular investigation found two independent contributors:
Forja's dark-albedo rim mask (`e61e439`, locally `3feb4ea`) removes the new rim
from dark atlas regions, while a dedicated 16x16 alpha mask in the GLB limits
physical specular to the eyes and nose. Mouth and fur have alpha zero.
Blender's glTF exporter reads this mask from alpha, not RGB; the asset test
checks the exported pixels as well as the clone retaining the map. The model
still shares one material. The white mouth rim is gone in
`tatu-capy-m1-r4-masked-specular.png`; saturation and final M1 lighting remain
open for the integrated Forja pipeline and Pincel's review.
