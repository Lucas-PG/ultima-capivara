# M0 rendering foundations

## Module contracts

The behaviour-preserving extraction is commit `859c2fd`. `GameRenderer` keeps the existing public camera, update, event, resize, settings, stats, position and disposal API. The `itemGeometry` export remains available from `renderer.ts` for compatibility.

| Module | Responsibility |
| --- | --- |
| `pipeline.ts` | Depth outline target, post pass, preset constants |
| `camera.ts` | Plane path, orbit/chase/first-person transitions, lean collision |
| `avatars.ts` | Bodies, poses, labels, parachutes, cached held weapon geometry |
| `effects.ts` | Tracer and impact pools |
| `loot.ts` | Instanced pickups, rarity glow, chests and drop arcs |
| `item-geometry.ts` | Ground item and chest geometry |
| `primitives.ts` | Shared plane/parachute construction helpers |

`GameRenderer` still owns scene lighting and coordinates frame order. Tatu can put character update hooks into `AvatarView.poseAvatar`. Brasa can extend `EffectsView.event` and `EffectsView.update`.

## Assets and readiness

`asset-manifest.ts` inventories the 42 currently shipped rendering resources, 7,166,477 bytes. It covers world WebP maps, HDR sky, the pistol glTF plus external buffer/images, and the M700 FBX plus maps. The manifest accepts GLB and KTX2 entries for future compressed assets. Add every external dependency when adding a model; a test checks current glTF dependencies and exact file sizes.

`AssetLoader` exposes `texture`, `hdr`, `gltf`, `fbx`, `ktx2`, `ready` and `dispose`. Model callers must clone when they need independent instances of a cached glTF scene. It configures the bundled Meshopt decoder and KTX2Loader, detects GPU texture support, and serves the Basis transcoder from `public/decoders/basis/`. The decoder files are copied unmodified from Three.js 0.186.0; their Apache 2.0 license is included. There are no runtime CDN requests.

The optional fifth `GameRenderer` constructor argument is `(fraction, label) => void`. Asset progress is measured from transfer byte callbacks where available and completed-resource byte sizes for image loads; it is not a timer. Asset transfers occupy 0 to 90 percent. Thumbnail rendering and GPU preparation occupy 90 to 98 percent. Actual match avatars are prepared before 100 percent. Match preparation reconciles changed actor names/colours and removes departed IDs before upload, preserving shared body/weapon geometry while disposing replaced instance rigs, labels and parachutes. The UI ignores regressions, clamps values, uses short Portuguese labels, and reveals only after the first real match frame.

`warmup()` awaits imported weapon setup and every tracked resource without a timeout fallback. It compiles and uploads the world against a linear offscreen target, and compiles first-person/post programs against the canvas output. It reveals every LOD/model/effect variant without changing the preset's light set. `prepareMatch(snapshot)` builds actual actor instances and uploads their labels, skeletons and meshes before match rendering. Main waits for common warmup before starting the host worker and for match preparation before rendering. Failed resources and structurally invalid required weapon models keep the match from being revealed and show a retry-by-reload message. Disposal invalidates pending asset and shader preparation; queued match work rejects without further GPU calls or a readiness signal. Page exit stops the match before releasing the renderer, preventing a late worker start.

## Stutter audit

The previous warmup raced a 15-second timeout, scanned textures repeatedly, and uploaded first-person models only to a linear offscreen target. The real first-person canvas path uses different colour/tone mapping program variants. Actor-held weapon geometries were also rebuilt on every swap, and thumbnails could start after the match UI appeared.

The new path waits for assets, warms the actual canvas variant, preloads thumbnails, and caches all held weapon geometries. Reused camera/pose/tracer vectors, persistent loot counters and drop records, precomputed colours, cached propellers, and a reused render frame replace steady application-level temporary objects. Event-driven actor/drop creation remains intentional. This is an audit of application render code, not a claim that Three.js or the entire game allocates no memory internally.

## Verification

Extraction: check, 61 tests and build passed. Sentinela's four 1280x720 fixed poses matched camera coordinates and render counts exactly. Normalized image MAE ranged from 0.000464 to 0.000490. Pincel independently approved all four pairs; fewer than 0.012 percent of pixels differed by more than 24/255. The additional 1920x1080 gate covered outdoor near/far and interior near/wide poses with matched camera and render counts. MAE was 0.00061 to 0.00199; Pincel attributed the relevant differences to animated loot and isolated foliage subpixels and approved the split at both resolutions.

Evidence lives in `/Users/lucas_gaspe/dev/capivara-team/reviews/forja-pre-{plaza,bakery,capyFront,capySide}.png` and the corresponding `forja-post-split-*` images. The 1080p pairs are `forja-pre-1080-*` and `forja-post-1080-*`, including `bakeryClose`.

The transition harness forces active rendering because headless pointer lock is unavailable. It asserts increasing rendered-frame counts and measures both render CPU time and independent requestAnimationFrame intervals at 1280x720 on Chrome 153 / Apple M2 Metal. The initial idle-render trace was discarded.

Performance and loading results are recorded below.

Initial active-render comparison (one run per variant):

| Window | Before CPU p95 / max | After CPU p95 / max | Before rAF p95 / max | After rAF p95 / max |
| --- | --- | --- | --- | --- |
| Landing, ±1 second | 2.9 / 49.3 ms | 3.9 / 5.6 ms | 16.8 / 50.0 ms | 16.7 / 16.8 ms |
| First shot | 3.4 / 7.6 ms | 5.1 / 21.7 ms | 16.8 / 216.7 ms | 16.7 / 33.3 ms |

The initial post sweep had two isolated frame-interval spikes: SMG 66.7 ms and machete 99.9 ms; render CPU maxima in those windows were 10.7 and 3.1 ms. These intervals remain part of the evidence, even if a focused repeat isolates them outside render work. Repeated sweep results follow.

Evidence: `forja-baseline-active.json` and `forja-post-active.json` in the shared reviews directory. During the delayed-rifle smoke test, the bar advanced monotonically from 29 to 100 percent, the overlay covered 1280x720 until readiness, and no console errors, page errors or failed requests occurred. The final UI uses fraction-based art-language labels below the unchanged heading, as requested by Pincel.


Final isolated repeat: three sweeps across all eight weapons (24 windows, 1,444 rAF intervals) had a maximum interval of 16.8 ms and zero intervals above 50 ms. Maximum render CPU was 4.9 ms; FP equip and direct weapon handler maxima were 0.1 ms. Landing maximum render CPU / rAF was 4.5 / 16.8 ms. First-shot handler maximum was 0.6 ms and rAF maximum 16.8 ms. The trace recorded zero Long Tasks, zero GC entries, and no page errors. Other Playwright GPU pages were closed for this run.

The earlier SMG/machete spikes did not recur; their attribution remains unknown. The acceptance threshold passes in this measured Chrome 153 / Apple M2 environment, not as a guarantee for every browser or device. Final evidence: `forja-post-3sweeps-active.json` in the shared reviews directory. Sentinela owns the repeatable transition harness.

## Integration notes

Shared-file edits are confined to `src/main.ts`: an optional progress callback, readiness gates for worker start and first render, page-exit match shutdown, and a reused render-frame object. Pincel authorized the additive `GameUI.setLoadingProgress(fraction, label?)` method and its two small CSS rules for standalone M0 validation. He subsequently implemented the same API in `v3/ui-art`; retain his UI implementation at integration and omit the optional Forja UI commit. The `main.ts` callback remains compatible. Tatu authorized the weapon loading changes.

Tatu's optional v3 character is a separate integration. Its `preloadCapybaraAsset(load?)` hook can receive `url => this.assets.gltf(url)` in renderer warmup. Include `models/capybara/capybara.glb` and its byte size in the active manifest only when `capybaraV3Enabled()` is true; preserve the no-download flag-off contract. The character update hook belongs in `avatars.ts`, not the old monolithic renderer.

Pincel's Direction A palette, lighting, sky and material overhaul is M1. This M0 work intentionally retains the existing game appearance while creating the loader and module boundaries it needs. When M1 removes photographic assets, remove their manifest entries too.

## Quality-bar disposition

The orchestrator assigned the five inherited visual defects to M1 in the shared roadmap, with the reason that M0 extraction must retain the baseline appearance for parity evidence. They remain unticked in `reviews/defects.md`: photographic sky, photographic maps/global saturation, aliased/fading outlines, non-A lighting, and distant storm bands. They are assigned work, not waivers.

Sentinela reviewed the loading and disposal changes: malformed required model nodes reject readiness; disposed async work cannot resume GPU uploads or reveal a match. Eight focused readiness/lifecycle tests pass, including disposal during world, first-person, post, and actual-match preparation. Full stability and final repository verification are recorded when complete.
