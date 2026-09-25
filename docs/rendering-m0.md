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

The new path waits for assets, warms the actual canvas variant, preloads thumbnails, and caches all held weapon geometries. Reused camera/pose/tracer vectors, persistent loot counters and drop records, precomputed colours, cached propellers, and a reused render frame replace steady application-level temporary objects. The interaction lookup now scans candidates directly, reuses caller-owned result and vector storage, and uses precomputed weapon labels. Boolean line-of-sight checks preserve the full raycast tolerances without creating hit records. Seven focused tests cover selection order, range, labels, occlusion and seeded parity against the existing raycast. Event-driven actor/drop creation remains intentional. This is an audit of application render code, not a claim that Three.js or the entire game allocates no memory internally.

## Verification

Extraction: check, 61 tests and build passed. Sentinela's four 1280x720 fixed poses matched camera coordinates and render counts exactly. Normalized image MAE ranged from 0.000464 to 0.000490. Pincel independently approved all four pairs; fewer than 0.012 percent of pixels differed by more than 24/255. The additional 1920x1080 gate covered outdoor near/far and interior near/wide poses with matched camera and render counts. MAE was 0.00061 to 0.00199; Pincel attributed the relevant differences to animated loot and isolated foliage subpixels and approved the split at both resolutions.

Evidence lives in `/Users/lucas_gaspe/dev/capivara-team/reviews/forja-pre-{plaza,bakery,capyFront,capySide}.png` and the corresponding `forja-post-split-*` images. The 1080p pairs are `forja-pre-1080-*` and `forja-post-1080-*`, including `bakeryClose`.

The transition harness forces active rendering because headless pointer lock is unavailable. It asserts increasing rendered-frame counts and measures both render CPU time and independent requestAnimationFrame intervals at 1280x720 on Chrome 153 / Apple M2 Metal. The initial idle-render trace was discarded.

Performance and loading results are recorded below.

Historical active-render comparison (one run per variant, graphics preset not recorded):

| Window | Before CPU p95 / max | After CPU p95 / max | Before rAF p95 / max | After rAF p95 / max |
| --- | --- | --- | --- | --- |
| Landing, ±1 second | 2.9 / 49.3 ms | 3.9 / 5.6 ms | 16.8 / 50.0 ms | 16.7 / 16.8 ms |
| First shot | 3.4 / 7.6 ms | 5.1 / 21.7 ms | 16.8 / 216.7 ms | 16.7 / 33.3 ms |

The initial post sweep had two isolated frame-interval spikes: SMG 66.7 ms and machete 99.9 ms; render CPU maxima in those windows were 10.7 and 3.1 ms. These intervals remain part of the evidence, even if a focused repeat isolates them outside render work. Repeated sweep results follow.

Evidence: `forja-baseline-active.json` and `forja-post-active.json` in the shared reviews directory. During the delayed-rifle smoke test, the bar advanced monotonically from 29 to 100 percent, the overlay covered 1280x720 until readiness, and no console errors, page errors or failed requests occurred. The final UI uses fraction-based art-language labels below the unchanged heading, as requested by Pincel.


Historical isolated repeat, graphics preset not recorded: three sweeps across all eight weapons (24 windows, 1,444 rAF intervals) had a maximum interval of 16.8 ms and zero intervals above 50 ms. Maximum render CPU was 4.9 ms; FP equip and direct weapon handler maxima were 0.1 ms. Landing maximum render CPU / rAF was 4.5 / 16.8 ms. First-shot handler maximum was 0.6 ms and rAF maximum 16.8 ms. The trace recorded zero observed Long Tasks and no page errors. Its GC observer did not check browser support; Chromium does not expose that entry type here, so GC instrumentation is unavailable, not zero. Other Playwright GPU pages were closed for this run.

The earlier SMG/machete spikes did not recur; their attribution remains unknown. These historical sweeps are diagnostic evidence, not a preset-certified acceptance gate or a guarantee for other browsers/devices. Final evidence: `forja-post-3sweeps-active.json` in the shared reviews directory. Sentinela owns the repeatable transition harness.

### Stability and attribution, frozen source `491f655`

The 21-minute diagnostic run used Chrome 153.0.8010.53 / Apple M2 ANGLE Metal, medium, 1280x720, DPR 1, and forced active 60 fps rendering. Its unlocked preflight produced 602 renders in ten seconds. Every minute exceeded 3,000 rendered frames. BR had 21 actors; Correria had eight. BR reached results during minute four and Correria during minute eight, so ten-minute render windows are not ten minutes of live combat. Three match starts and two menu returns succeeded with zero console errors, warnings, page errors or failed requests.

Post-GC heap was 72.9 MB at the first BR start, 72.2 MB at its end, 74.0 MB at Correria start, 72.9 MB at its end, and 73.1/73.0 MB at the third BR start/end. Menu samples after the first two matches were 72.0/71.2 MB. These are a diagnostic retention trend across different actor counts, not proof of an exclusive performance gate.

The run is explicitly diagnostic-only: Pincel's Chromium work overlapped BR minutes approximately five through ten. First Correria minute also includes inter-match loading and forced GC because that driver did not reset before the segment. Preserve those samples with the limitation rather than attributing all their stalls to gameplay. BR minute one recorded 83.3 ms rAF / 89 ms Long Task; minute four recorded 50.0 ms rAF / 55 ms Long Task. The known Pincel overlap does not explain the minute-one event. Medium draw calls reached 410 in one BR sample, separate from the fixed plaza's historical 408 with preset unrecorded. Evidence: `output/m0/accepted-stability.json`, annotated with overlap and segment limitations. Earlier idle-render and contaminated preflights are excluded.

Sentinela then ran an exclusive three-minute attribution diagnostic on the same source and hardware/preset/viewport, with 3,599 / 3,602 / 3,602 rendered frames, all in BR play. One 56 ms Long Task at `2026-09-25T02:52:47.828Z` coincided with an exactly 50.0 ms rAF gap. Nearby timings were interaction lookup 0.1 ms, renderer 2.2 ms, snapshot handler 0 ms, UI at most 0.7 ms, audio at most 0.5 ms, and equip at most 0.1 ms. No rAF interval exceeded 50 ms in those three minutes. Attribution remains unknown; the interaction allocation defect is distinct, not a demonstrated cause of this event. GC observation was unsupported. Evidence: shared reviews `forja-frozen491f655-attribution.json`.

### Loading and correctness evidence

Pincel approved the standalone 50/100 percent screenshots at 1280x720, 1920x1080, 1366x768 and 2560x1080: fixed title, status below the bar, approved Portuguese labels, monotonic progress and `Pronto!` only at completion. Files: shared reviews `forja-loading-{50,100}-{resolution}.png`. The standalone overlay is superseded by Pincel's compatible UI at integration. The final main hook also corrects rematch initialization: a cached completed load resumes at 98 percent with `Carregando o avião`, then signals `Pronto!` only after match preparation.

A required-texture abort on `491f655` returned to the home screen with a reload instruction, no worker start, no exposed match HUD, and no unhandled exception. The deliberately aborted request and its browser network error are expected in that failure test. Evidence: `output/m0/accepted-readiness-failure.json`.

The pre-final merged source passed check, 79 tests and build (503 ms). Loader, disposal and avatar reconciliation received Sentinela's focused PASS. The final interaction/rematch changes and merge of integration `6596f7b` require a fresh immutable diff review and clean-checkout check/test/build/test:load before handoff; the release report records that exact hash and gate results. The merge preserves the readiness return before Brasa's new recoil recovery call.

## Integration notes

Shared-file edits are confined to `src/main.ts`: an optional progress callback, readiness gates for worker start and first render, page-exit match shutdown, and a reused render-frame object. Pincel authorized the additive `GameUI.setLoadingProgress(fraction, label?)` method and its two small CSS rules for standalone M0 validation. He subsequently implemented the same API in `v3/ui-art`; retain his UI implementation at integration and omit the optional Forja UI commit. The `main.ts` callback remains compatible. Tatu authorized the weapon loading changes. Jangada authorized only the boolean line-of-sight body change in `shared/collision.ts`; `raycastWorld`, terrain and world data remain untouched. The new `shared/interaction.ts` helper replaces the allocation-heavy main lookup without changing its selection rules.

Tatu's optional v3 character is a separate integration. Its `preloadCapybaraAsset(load?)` hook can receive `url => this.assets.gltf(url)` in renderer warmup. Include `models/capybara/capybara.glb` and its byte size in the active manifest only when `capybaraV3Enabled()` is true; preserve the no-download flag-off contract. The character update hook belongs in `avatars.ts`, not the old monolithic renderer.

Pincel's Direction A palette, lighting, sky and material overhaul is M1. This M0 work intentionally retains the existing game appearance while creating the loader and module boundaries it needs. When M1 removes photographic assets, remove their manifest entries too.

## Quality-bar disposition

The orchestrator assigned the five inherited visual defects and draw-call budget work to M1 in the shared roadmap, with the reason that M0 extraction must retain the baseline appearance for parity evidence. They remain unticked in `reviews/defects.md`: photographic sky, photographic maps/global saturation, aliased/fading outlines, non-A lighting, and distant storm bands. The fixed plaza is 408 draw calls with preset unrecorded; the later medium BR sample is 410. Batching/instancing/LOD must close this with a recorded preset. They are assigned work, not waivers.

Sentinela reviewed the loading and disposal changes: malformed required model nodes reject readiness; disposed async work cannot resume GPU uploads or reveal a match. Ten focused readiness/lifecycle/identity tests pass, including disposal during world, first-person, post, and actual-match preparation.

The orchestrator subsequently restructured the M0 stutter gate in `roadmap.md`: land on the final frozen hash, Sentinela diff PASS and Formiga's clean-checkout suite. Do not run another long exclusive M0 trace. The remaining frame spikes are explicitly assigned as the top M1 performance task, not waived or claimed fixed. M1 must record per-entry timestamps/attribution around shader compile, texture upload, GLB parse, first material use, landing/camera transitions and HUD, identify each spike's cause, fix it, and rerun the post-warmup >50 ms gate at a recorded preset.
