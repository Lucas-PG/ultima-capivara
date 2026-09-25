# Capivara asset pipeline

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
