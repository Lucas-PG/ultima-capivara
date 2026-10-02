# Capivara asset pipeline

## Aircraft and parachute (2 October 2026)

```sh
BLENDER_BIN="$HOME/blender/blender-5.0.1-linux-x64/blender" BLENDER_THREADS=4 node tools/blender/build-aircraft.mjs
```

`aircraft.py` authors the hollow island aircraft, cockpit, seats, propellers and
nine-cell canopy with lines and risers. Game coordinates are metres, +Y up and
-Z forward. Meshopt compresses the three LODs into `public/models/aircraft/aircraft.glb`.
`metrics.json` records decoded bounds, triangles, download size and attachment points.
No texture bake is needed: original vertex colors share two source materials.
Plane budgets are 42k / 18k / 7k triangles and canopy budgets 6.5k / 3.5k / 1.8k;
the build rejects a file above 1 MiB raw or 450 KiB gzip. Actual costs are in metrics.

The renderer includes the asset in progress, awaits `preloadAircraftAsset` before
avatars and GPU upload, and calls `disposeAircraftAssets` on teardown. A failure
stays in the existing loading error flow. The stable direct `propeller` groups
retain the existing spin. No movement, camera or authoritative timing changes.
Each avatar owns its canopy resources to match the existing disposal contract.
Do not bake a decoded world transform into normalized integer position buffers;
keep it on the cloned mesh, or Meshopt positions clamp and collapse the shape.

With Vite running, `tools/blender/aircraft-review.html` shows the real world lighting
and post pipeline. `?version=before` uses this project's procedural `b721224` art.
`node tools/qa/aircraft-evidence.mjs` saves native 1470x956 comparisons;
`node tools/qa/aircraft-live.mjs` checks real BR plane/drop cameras in a QA build;
`node tools/qa/aircraft-cost.mjs` measures warmed, alternating old/new frame costs
at DPR 2 with 4x CPU throttling. Each script defaults to `http://127.0.0.1:5198`,
accepts `BASE`, owns one Chrome process, and closes it on completion.

## Character v6 (current)

`npm run assets:characters` (or `tools/blender/wait-for-blender.sh && node tools/blender/build-characters.mjs`;
add `--statue` to rebuild the Morro statue with the v4 script) runs `capybara_v6.py` in Blender 5.0.1:

1. `capybara_form.py` is the sculpt: signed distance fields (`capy_sdf.py`) in game space, a
   lofted head, the v3 paw from `paw_sculpt.py` (scaled 1.1x), three-toed feet, and the clothes and
   gear as one union, so the surface is watertight and nothing pokes through a garment. It also
   defines the skeleton (the v4/v5 bone names plus chest, belly, toes, pack and hipcloth: 67 joints).
2. OpenVDB polygonizes it at 2.5 mm (about 0.9M vertices), the dense bake source.
3. The game mesh is that surface decimated to 26.5k / 7.8k / 2.2k triangles; the LODs share
   one smart-projected UV layout (head at 1.7x, eyes 2.2x texel density).
4. Cycles bakes position, object and tangent normals and occlusion; `capybara_paint.py` paints
   albedo, roughness, metal, the team mask (ORM red) and fine relief per texel, using the SDF's
   own material at each texel so borders are exact.
5. `capybara_weights.py` skins by the nearest body parts (soft minimum), digits by chain
   ownership like the first-person arms, gear and face explicitly; `_TEAM` and `_FUR` go on the
   vertices. `capybara_clips.py` and `character_emotes.py` author the clips at 60 Hz.

Iterate on the form without Blender: `python3.11 tools/blender/capy_preview.py out.ply .004`
(Blender's bundled python) and `tools/blender/sculpt-preview.html?ply=...`
(`tools/qa/sculptshots.mjs`). Review the built character in the game renderer with
`tools/blender/review.html` (`tools/qa/charshots.mjs`, `charmotion.mjs`, `charperf.mjs`).

## History

Run `npm ci && npm run assets:characters` with Blender 5.0.1 installed. Set
`BLENDER_BIN` to override `/Applications/Blender.app/Contents/MacOS/Blender`.
The deterministic script builds quad ring surfaces, subdivides once, decimates
three LODs, smooth skins them to one 35-joint armature, exports GLB and compresses
geometry plus animations with glTF Transform / Meshopt. A 16 x 16 PNG palette and eye-emission mask are
embedded; there are no remote assets, photo textures, or normal maps.

- Output: `public/models/capybara/capybara.glb` and `metrics.json`.
- Intermediate files and full Blender log: `output/characters/` (ignored).
- Axes: metres, feet at zero, forward -Z in game; +Y in Blender.
- Runtime: the GLB is required on every URL, including a normal launch.
  The procedural character and fallback poses have been removed.
- LOD switch distances: 12 m and 28 m, with 10% hysteresis.
- Clips: `idle` (breath, ear twitch, blink), `run`, `jump` (in place),
  plus six additive facial poses: neutral, determined, hit, stunned, victory, blink.
- Hit shapes: normal head (.0, 1.6, -.04), r .25; body r .30, y 0 to 1.42.
  The simulation's player-favouring bot hitboxes intentionally remain smaller.
  Hands holding the weapon are outside the body hit cylinder, as before.

The M0 proof follows Pincel's brief dated 2026-09-24. Direction A is now locked;
the shared style bible, sections 3.7, 9 and 10, governs M1 refinement.
Fur remains fixed across cosmetic colours, including legacy profile colours.
`src/render/capybara-palette.json` is shared by Blender and runtime. Atlas columns
5 and 6 hold bandana base/shadow; only these columns vary per player. Each colour
shares one 16 x 16 texture and material across actors and LODs. White atlas column 14 multiplies authored vertex colours for smooth fur values
and the conforming belly patch. The thin cloth band, vest and facial clips are M1.
The M1 visual gate remains open; see `docs/characters-m1.md`. The model is original scripted geometry.

Integration hooks authorized by Forja: `preloadCapybaraAsset` in renderer warmup,
`updateCapybaraBody` inside AvatarView.poseAvatar in `src/render/avatars.ts`.
The renderer split was merged locally from `v2-renan` and the pose hook migrated. `preloadCapybaraAsset` accepts the shared loader's
`gltf` function so the final asset manifest/progress system can own downloads.
Warmup must await the preload without a success timeout. Errors propagate and
avatar construction requires a ready asset; no asynchronous body swap.
Land together with Forja's main readiness/error gate. URLs use Vite BASE_URL.
`disposeCapybaraAssets()` releases all character caches once at renderer disposal,
after per-avatar skeletons. It also cancels late preload completion.

API references used: [Blender GLB export](https://docs.blender.org/api/main/bpy.ops.export_scene.html),
[glTF Transform meshopt](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/meshopt.ts).

The Blender process uses `--python-exit-code 1`: validation errors stop the
build before an old or missing raw GLB can be compressed.

Phase A island kit: `npm run assets:kit` generates the shared collision manifest,
compressed GLB and metrics from the same original geometry recipes. The three
house LOD budgets are 12k / 3k / 800 triangles. Preview the actual renderer at
`tools/blender/kit-review.html`; `?piece=fort_tower` isolates a piece.

Phase A painted weapons use the cover-art direction and a 25k triangle combined
weapon/arms ceiling. The first-person colour atlas is now 1024x256 with painted
material variation, a roughness atlas and baked vertex contact shading. Keep
`src/render/weapon-atlas.ts` in sync with the paint equations in `weapons.py`.

## Remote builds on the Linux machine

`tools/blender/remote-blender.sh` stands in for the Blender binary and runs the job on the Linux build
machine (Tailscale host `lpg-arch`, Ryzen 7 5700X, 16 threads, 16 GB, Blender 5.0.1 in
`~/blender/blender-5.0.1-linux-x64`): `BLENDER_BIN=$PWD/tools/blender/remote-blender.sh node tools/blender/build-fp.mjs m4`.
It sends the inputs that changed (tools/, src/shared/, public/textures/, the output/ caches and any file
named on the command line), runs one job at a time there with every thread (`-t 0`, `BLENDER_THREADS=0`),
and brings back every file the job wrote. When the machine cannot be reached it runs the local Blender.

Measured on 30 September 2026: the committed character's Blender step took 171 s there (bakes 92 s,
peak 4.3 GB) against about 18 minutes on this Mac with 3 threads; the M4 took 39 s. Builds on each machine
are reproducible (two Linux M4 builds are byte-identical). Between machines the geometry, parts, sockets
and grip data are identical; the UV packing lands differently, so wear marks and scratches fall in other
places, with the same materials, finish and amount of wear.
