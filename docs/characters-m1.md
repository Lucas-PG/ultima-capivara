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
