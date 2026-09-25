# Capivara M0

Run `npm ci && npm run assets:characters` with Blender 5.0.1 installed. Set
`BLENDER_BIN` to override `/Applications/Blender.app/Contents/MacOS/Blender`.
The deterministic script builds quad ring surfaces, subdivides once, decimates
three LODs, smooth skins them to one 22-joint armature, exports GLB and compresses
geometry plus animations with glTF Transform / Meshopt. A 16 x 16 PNG palette is
embedded; there are no remote assets, photo textures, or normal maps.

- Output: `public/models/capybara/capybara.glb` and `metrics.json`.
- Intermediate files and full Blender log: `output/characters/` (ignored).
- Axes: metres, feet at zero, forward -Z in game; +Y in Blender.
- Runtime gate: `?capy=v3`. Without the gate, no character GLB is requested.
- LOD switch distances: 12 m and 28 m, with 10% hysteresis.
- Clips: `idle` (breath, ear twitch, blink), `run`, `jump` (in place).
- Hit shapes: normal head (.0, 1.6, -.04), r .25; body r .30, y 0 to 1.42.
  The simulation's player-favouring bot hitboxes intentionally remain smaller.
  Hands holding the weapon are outside the body hit cylinder, as before.

The M0 proof follows Pincel's brief dated 2026-09-24. Direction A is now locked;
the shared style bible, sections 3.7, 9 and 10, governs M1 refinement.
M0 keeps a single approved fur palette. Cosmetic colours, clothing variants and
additional clips are M1. The model is original scripted geometry.

Integration hooks authorized by Forja: `preloadCapybaraAsset` in renderer warmup,
`updateCapybaraBody` inside AvatarView.poseAvatar in `src/render/avatars.ts`.
The renderer split was merged locally from `v2-renan` and the pose hook migrated. `preloadCapybaraAsset` accepts the shared loader's
`gltf` function so the final asset manifest/progress system can own downloads.

API references used: [Blender GLB export](https://docs.blender.org/api/main/bpy.ops.export_scene.html),
[glTF Transform meshopt](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/meshopt.ts).
