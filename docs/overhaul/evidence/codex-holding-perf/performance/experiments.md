# Performance experiments, 2 October 2026

Rendering baseline: b721224. HUD, gameplay, assets, shaders, presets and density stay fixed. QA tooling commit 5e04f51 adds measurement controls without changing production rendering.

Machine: Ryzen 5700X, 16 logical threads, 16 GB RAM, Radeon RX 9060 XT, Linux, Chrome with ANGLE GL/EGL. Timing runs use 1470x956 CSS pixels, deviceScaleFactor 2, CDP CPU throttle 4. Live runs pin each shipped preset's ceiling. Medium uses density 1.25 and a 2940x1912 output canvas. Each live sample includes load, free memory, density, buffer size and CPU/GPU spans. Linux thermal state is unavailable. CDP throttles the page main thread; the worker and GPU are not an M2 simulation. The faster GPU and available memory do not reproduce an M2 Air's bandwidth, thermal conditions or 8 GB memory pressure.

Raw profiles, allocation samples, full images, logs and immutable builds are outside the repository at `/home/lucas/codex-team/logs/performance`. JSON summaries and exact pixel hashes accompany this log. Identity captures use the same fixed Math.random seed 20261002, seven cameras at Low/Medium/High ceilings, with CPU throttle 1. They compare decoded RGBA bytes, including the fixed HUD.

## Profile first

Exclusive window 08:32 to 08:46. Medium Correria: render 15.48 ms/frame, avatars 2.92 ms, submission 11.17 ms, GPU 2.65 ms. Royale: render 18.57 ms/frame, avatars 4.63 ms, submission 12.60 ms, GPU 2.86 ms. Main-thread matrix traversal and material program preparation dominate; snapshot acceptance is only 0.06/0.11 ms/frame. Allocation sampling measures 433.1/529.5 KB per rendered frame, including about 90 KB/frame in `getParameters`.

These first runs contain deliberate CPU, heap and tracing interventions. Their long gaps and 1% lows must not be presented as clean gameplay hitch measurements. Royale has 21 actual actors and at most 4 ground actors within 20 m of the camera. It is not evidence of a denser live landing. Static crowd12 and plaza16 are synthetic QA workloads.

## Mask render-state isolation: initially rejected

Three caches lighting state by Scene object identity. The mask pass renders the world Scene with layer 1, excluding world lights; this causes most lit materials to rebuild their program parameters on the next world frame. Experiment v1 uses a cached read-only Scene view borrowing exactly the original children, ancestry and world matrices, without new UUIDs or random calls. V2 also preserves the original root's temporary mask fields to match baseline parent-chain observations.

| Gate | Result |
| --- | --- |
| Baseline repeat, 21 cameras | 0 changed pixels, PSNR Infinity |
| V1, 21 cameras | 940 changed pixels in Medium crowd; other 20 exact |
| V1 repeated | Same 940 changed pixels |
| V2, 21 cameras | Same 940 changed pixels |
| Maximum changed channel | 4, PSNR 87.2617 dB |
| World matrix observer | 41,408 Float64 values, exact SHA256 |
| Bone observer | 86,528 Float32 values, exact SHA256 |
| Raw world and mask targets | Exact SHA256, no GL read errors |
| Observer screenshots | 0 changed pixels |
| Shader sources | 176 before, 174 after, no new source hashes |

The observer's extra hooks/readback affect execution and cannot override the original capture failure. At 09:24 both production patches and their temporary tests were reverted. The rejected patch is saved outside the repository. Later baseline controls below reproduced the same 940 pixels with unchanged executable bytes, so those pixels cannot be attributed to the mask patch. The later explicit mask and combined gates below permit reconsideration. The final quiet result and retention decision are recorded at the end.

Window 09:01 to 09:24:16. Static paired medians at CPU throttle 4, identical draw/triangle counts and buffers:

| Preset | Camera | Before ms | V1 ms | Program lookups before/after |
| --- | --- | ---: | ---: | ---: |
| Medium | FP M4 | 10.8 | 10.0 | 31 / 14 |
| Medium | Plaza16 | 17.5 | 16.7 | 29 / 8 |
| Medium | Street | 10.3 | 9.9 | 31 / 14 |
| Medium | Crowd12 | 16.9 | 17.1 | 39 / 18 |
| Medium | Plane | 9.8 | 9.0 | 27 / 4 |
| Medium | Fight8 | 13.1 | 12.3 | 23 / 8 |
| High | FP M4 | 13.6 | 12.4 | 31 / 14 |
| High | Plaza16 | 19.9 | 19.3 | 29 / 8 |
| High | Street | 12.8 | 11.9 | 31 / 14 |
| High | Crowd12 | 19.3 | 18.4 | 39 / 18 |
| High | Plane | 11.5 | 10.6 | 27 / 4 |
| High | Fight8 | 15.9 | 15.5 | 23 / 8 |

Low data remains in the raw JSON but is excluded from clean gain claims: a roughly 2-second root geometry job overlapped the start of the after run. Medium/High have load recorded per camera (approximately 0.6 to 0.8). GPU costs remain within ordinary run variation. Most CPU medians improve, but the strict pixel gate rejects the change.

A separate clean baseline Correria has no CPU-profile, allocation or tracing interventions: 81 settled seconds, 50.5 fps, p95 33.4 ms, 1% low 24.1 fps, five intervals over 50 ms, maximum 66.6 ms, render 15.57 ms/frame, GPU 2.77 ms, mean load 1.16, exact pinned density 1.25, no page errors. No shader or program compilation appears after loading. No clean after run was claimed for the rejected patch.

## Next candidates

| Candidate | Evidence | Status |
| --- | --- | --- |
| Static kit matrix traversal | World-pass matrix work is the largest measured caller | Retained after exact controlled camera gates and final quiet timing |
| Worker snapshot cloning | Acceptance cost is much smaller than rendering | Deferred, no product change |
| Additional shader/texture warmup | Existing preparation awaits compilation, texture uploads and mask variants; clean run has no late compilation | Deferred, no demonstrated late compilation to fix |

## Baseline controls and static kit candidate

The kit finishes assembling its rooms, LOD levels and far batch before readiness resolves. Its update changes visibility and interior shader uniforms; descendant transforms stay fixed. The candidate caches only this static subtree's matrix propagation. Root, parent and manually managed world-matrix changes refresh the ordinary subtree update. It does not skip dynamic avatars, props or ground cover, change shaders or alter rendering density.

The first candidate comparison reproduced the same 940 changed pixels in Medium crowd. A newly rebuilt, unchanged baseline also reproduced those exact 940 pixels. SHA256 checks prove every executable, model, texture and CSS file matches the original baseline. Only a source map differs, with the same source contents. All three original, rebuilt and interleaved baseline boards remain outside the repository, and the accompanying pixel reports preserve their decoded RGBA hashes. Exact repeatability is therefore established for the controlled comparisons below, not for every historical capture.

| Controlled comparison | Cameras | Changed pixels | PSNR |
| --- | ---: | ---: | --- |
| Fresh unchanged baseline vs static candidate | 21 | 0 | Infinity |
| Original immutable baseline, recaptured, vs candidate repeat | 21 | 0 | Infinity |
| Original baseline vs fresh unchanged baseline | 20 exact, Medium crowd differs | 940 | 87.2617 dB for the differing image |

Quiet static timing window 11:44 to 11:55: 24 synchronized frozen frames per camera at CPU throttle 4 and each shipped ceiling. Draw and triangle counts match. Several Medium medians improve, but the first complete pair includes regressions in Low plaza16, Medium fight and High fight. These results require an interleaved repeat and do not establish a global gain.

The quiet window yielded one additional clean baseline Correria: 41 settled seconds, 50.7 fps, p95 33.4 ms, 1% low 24.2 fps, four intervals over 50 ms, maximum 50.1 ms, render 15.46 ms/frame, GPU 2.63 ms, mean load 0.75, density 1.25 throughout, no page errors or late shader compilation. No after/live comparison was completed in that window; it supplies no live improvement claim.

Root authorized frozen A-B-B-A batches under recorded general load at 12:00. One Chrome browser holds two paused QA pages, each at main-thread throttle 4; only the current batch renders. Each batch records actual density, output canvas, draw/triangle counts, GPU timing, load, free memory, CPU times and process names. This uncapped, synchronized frame test measures submission plus GPU completion. It does not measure live rAF tails or an M2 Air's 1% low.

The complete CPU suite passes: 121 files, 1,133 tests, including exact Float64 matrix checks for static caching, ancestor/root motion, reparenting, explicit descendant invalidation and manual matrix management. TSC and the QA production build pass. Candidate retention is pending decisive timing and disposal review.

## Rendering correctness handoff

The player's black-pixel investigation and prepared floating-target diagnostics moved to the render agent at 11:40. The concrete foliage fractional-power domain hypothesis, raw readback limitations and reproduction instructions are in `/home/lucas/codex-team/handoff/performance-to-render/README.md`. This performance branch changes no shader and makes no claim that the player's screenshot has been reproduced or fixed.

## Earlier static timing results

First quiet pair, 24 synchronized frames per camera. Machine load is recorded per row. Positive change means slower. Complete pass and program-churn data is in the adjacent JSON files.

| Preset | Camera | Before ms | After ms | Change | Load before/after |
| --- | --- | ---: | ---: | ---: | --- |
| low | fp-m4 | 11.0 | 10.9 | -0.9% | 0.50 / 0.63 |
| low | plaza16 | 16.5 | 20.8 | 26.1% | 0.54 / 0.63 |
| low | vilaStreet | 9.1 | 8.8 | -3.3% | 0.54 / 0.66 |
| low | crowd | 14.5 | 15.2 | 4.8% | 0.58 / 0.66 |
| low | plane | 8.6 | 8.1 | -5.8% | 0.58 / 0.69 |
| low | fight | 11.8 | 11.5 | -2.5% | 0.61 / 0.69 |
| medium | fp-m4 | 11.6 | 10.7 | -7.8% | 0.61 / 0.69 |
| medium | plaza16 | 18.3 | 16.4 | -10.4% | 0.64 / 0.71 |
| medium | vilaStreet | 10.6 | 10.4 | -1.9% | 0.64 / 0.71 |
| medium | crowd | 18.1 | 15.9 | -12.2% | 0.67 / 0.73 |
| medium | plane | 10.1 | 9.1 | -9.9% | 0.67 / 0.73 |
| medium | fight | 13.1 | 13.8 | 5.3% | 0.67 / 0.76 |
| high | fp-m4 | 13.8 | 12.8 | -7.2% | 0.70 / 0.76 |
| high | plaza16 | 20.0 | 19.7 | -1.5% | 0.72 / 0.86 |
| high | vilaStreet | 13.0 | 12.1 | -6.9% | 0.72 / 0.86 |
| high | crowd | 19.6 | 19.9 | 1.5% | 0.72 / 0.87 |
| high | plane | 11.7 | 11.2 | -4.3% | 0.74 / 0.87 |
| high | fight | 16.5 | 17.7 | 7.3% | 0.74 / 0.96 |

General-load interleaved repeat, 12:00 to 12:08, 72 frames per batch, two A-B-B-A rounds. The table reports the median of four batch medians for each variant. GPU times remain within 0.02 ms and every draw count, triangle count, density and canvas matches. Host load ranges from 6.25 to 13.4, so these mixed results require a quiet repeat before retention. Raw per-batch CPU times and process names are outside the repository; the compact summary retains the actual load, free memory and CPU busy share.

| Preset | Camera | Before ms | After ms | Change | Load range |
| --- | --- | ---: | ---: | ---: | --- |
| low | fp-m4 | 17.40 | 16.20 | -6.9% | 6.48 to 6.65 |
| low | plaza16 | 41.65 | 36.15 | -13.2% | 6.25 to 8.28 |
| low | vilaStreet | 21.60 | 22.55 | 4.4% | 8.28 to 8.74 |
| low | crowd | 28.05 | 30.20 | 7.7% | 7.91 to 8.44 |
| low | plane | 18.25 | 17.05 | -6.6% | 7.70 to 7.91 |
| low | fight | 33.65 | 31.40 | -6.7% | 7.96 to 8.69 |
| medium | fp-m4 | 25.00 | 23.65 | -5.4% | 8.23 to 8.69 |
| medium | plaza16 | 34.95 | 29.80 | -14.7% | 7.48 to 8.29 |
| medium | vilaStreet | 22.65 | 20.15 | -11.0% | 7.33 to 7.38 |
| medium | crowd | 54.55 | 48.25 | -11.5% | 7.27 to 8.50 |
| medium | plane | 30.55 | 30.65 | 0.3% | 8.94 to 10.28 |
| medium | fight | 41.15 | 42.55 | 3.4% | 10.18 to 11.40 |
| high | fp-m4 | 38.85 | 42.40 | 9.1% | 11.03 to 13.40 |
| high | plaza16 | 41.20 | 39.60 | -3.9% | 11.42 to 13.10 |
| high | vilaStreet | 25.80 | 23.65 | -8.3% | 10.49 to 11.15 |
| high | crowd | 49.55 | 40.90 | -17.5% | 9.80 to 10.21 |
| high | plane | 30.85 | 30.25 | -1.9% | 9.80 to 10.07 |
| high | fight | 41.40 | 41.90 | 1.2% | 9.99 to 12.40 |

## Final candidate verification before the quiet run

Source commits: 14b9cfa caches static kit matrices and invalidates on removal, avoiding a retained reference to a former parent. 5723746 gives the character mask its own cached Scene identity for Three light/material state. The latter uses Object.create on the original Scene, preserving children, original parent ancestry, matrix objects and inherited id/uuid, with no constructor or added Math.random calls. Three render-state and render-list caches use object identity through WeakMaps. Product scene callbacks do not read or write Scene identity; the sky callback reads only the renderer viewport and is excluded by the mask layer. Disposal replaces the weak Scene cache. Both patches keep all shaders, GPU densities, draw order inputs and game rules unchanged.

| New comparison | Result | Interpretation |
| --- | --- | --- |
| Final static candidate, first pair | Medium crowd 940 plus Medium plane 4,318; other 19 exact | Crowd matches known baseline variance; plane difference image is confined to HUD. No exact-pass claim for this pair |
| Unchanged baseline vs unchanged repeat | Medium crowd 940; other 20 exact | The same crowd difference occurs without product changes |
| Immediately preceding baseline vs final static candidate repeat | 21 exact, 0 changed pixels | Final removal-invalidation code passes controlled pixel gate |
| Explicit mask-v2 capture vs earlier unchanged baseline | 21 exact, 0 changed pixels | New mask identity proof |
| Same mask-v2 capture vs later unchanged baseline | Medium crowd 940; other 20 exact | Preserve this failure alongside the baseline repeat; do not claim global capture repeatability |
| New combined before/after pair | 21 exact, 0 changed pixels | Static and mask changes together pass controlled gate, including the fixed HUD |

The single HUD outlier did not recur in the final static repeat or combined pair. It is preserved as a failed capture, not discarded or presented as an exact pass. Raw images and difference heatmap remain outside the repository. The strict pixel reports compare every decoded pixel; they do not mask HUD, crop the image or relax the threshold. Passing images have PSNR Infinity.

The final combined build passes all 121 CPU test files and 1,135 tests, TSC and the QA production build. Regression cases cover restoration after mask success/failure, retained scene view without reparenting or random calls, exact static matrices, ancestor/root/manual matrix changes, explicit invalidation, removal, detached updates and reparenting.

Program rebuild attribution is measured separately: static-only equals baseline, while mask-only equals combined. The new counter-only diagnostic uses CPU throttle 1 and one frozen frame per timing batch, so its timing fields are deliberately excluded from performance claims. Program counters average 12 ordinary draws for each variant.

| Preset | Camera | Baseline | Static only | Mask only | Combined |
| --- | --- | ---: | ---: | ---: | ---: |
| low | fp-m4 | 29 | 29 | 12 | 12 |
| low | plaza16 | 27 | 27 | 6 | 6 |
| low | vilaStreet | 29 | 29 | 12 | 12 |
| low | crowd | 37 | 37 | 16 | 16 |
| low | plane | 27 | 27 | 4 | 4 |
| low | fight | 21 | 21 | 6 | 6 |
| medium | fp-m4 | 31 | 31 | 14 | 14 |
| medium | plaza16 | 29 | 29 | 8 | 8 |
| medium | vilaStreet | 31 | 31 | 14 | 14 |
| medium | crowd | 39 | 39 | 18 | 18 |
| medium | plane | 27 | 27 | 4 | 4 |
| medium | fight | 23 | 23 | 8 | 8 |
| high | fp-m4 | 31 | 31 | 14 | 14 |
| high | plaza16 | 29 | 29 | 8 | 8 |
| high | vilaStreet | 31 | 31 | 14 | 14 |
| high | crowd | 39 | 39 | 18 | 18 |
| high | plane | 27 | 27 | 4 | 4 |
| high | fight | 23 | 23 | 8 | 8 |

The crowd fixture requests 12 actors and capyFront adds one close review bot, for 13 snapshot actors. Plaza16 and fight8 retain 16 and 8 snapshot actors. These are synthetic stress cases; no live simulation actors, health, positions, seeds or rules are changed.

Reserved final quiet window 13:20 to 13:27. Prepared immutable combined build and sequential one-browser script measure six targeted Low/Medium/High cases using 48 frames and two A-B-B-A rounds, then clean 45-second Medium Correria and royale before/after runs with no CPU profile, heap sampler or trace. Live worker match seeds remain unmodified and runs are unseeded; bot routes and visible crowd can differ. Roughly 35 settled seconds per live run will provide short coverage, not a sustained M2 or rare-hitch guarantee. Actual stage, actor proximity, density, cadence, CPU/GPU spans and load will be recorded.

## Final quiet comparison and decision

The coordinator released the host after HUD's measurement at 13:19:33. The one-browser sequence ran from 13:19:57 to 13:26:16, finishing all six targeted static cases and all four 45-second live runs. Other browser, build, test and fitting jobs were paused for this reserved window. The orchestration exited successfully; all measurement Chrome and preview processes were verified closed before the explicit all-clear at 13:26:16. Immutable baseline and combined production bundles remain outside the repository.

Retain static kit matrix caching (14b9cfa) and independent mask render state (5723746). The combined candidate has a new 21-camera exact pixel gate, zero changed RGBA pixels including the fixed HUD, PSNR Infinity. Its full source checks pass: 121 files, 1,135 tests, TSC and QA production build. No shader, asset, density, effect, HUD, gameplay or network protocol changes belong to these optimizations.

Static measurement uses Chrome 150.0.7871.186, 1470x956 CSS pixels, DPR 2 and page CPU throttle 4. Each row has two A-B-B-A rounds with 48 frozen frames per batch, 192 frames per variant. The table is the median of each variant's four batch medians. A one-pixel read completes each GPU frame: this measures synchronized whole-frame wall cost without vsync, not a pure CPU span. GPU timer queries report the GPU share independently. The unchanged GPU share supports the inference that less CPU work explains the reduced wall cost. These six cases deliberately repeat the earlier mixed Low/High and crowded/fight cases; they do not represent every camera or sustained gameplay.

| Preset | Camera | Before wall ms | After wall ms | Change | Before / after p90 ms | GPU before / after ms | Load range |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Low | Plaza16 | 15.05 | 13.70 | -9.0% | 21.75 / 20.25 | 1.229 / 1.224 | 1.26 to 1.38 |
| Low | Crowd | 14.50 | 13.10 | -9.7% | 19.15 / 17.75 | 1.282 / 1.279 | 1.38 to 1.43 |
| Medium | Crowd | 15.95 | 15.40 | -3.4% | 20.65 / 20.20 | 2.895 / 2.897 | 1.47 to 1.52 |
| Medium | Fight8 | 13.50 | 12.20 | -9.6% | 16.75 / 14.80 | 2.686 / 2.687 | 1.56 to 1.67 |
| High | FP M4 | 13.25 | 11.95 | -9.8% | 14.70 / 13.00 | 5.292 / 5.288 | 1.67 to 1.78 |
| High | Fight8 | 15.90 | 14.70 | -7.5% | 18.80 / 17.65 | 5.403 / 5.405 | 1.88 to 1.89 |

Both individual rounds improve in every row: Low plaza -9.6/-9.2%, Low crowd -9.7/-9.6%, Medium crowd -4.9/-3.8%, Medium fight -9.2/-7.6%, High FP -12.1/-8.0%, High fight -6.4/-8.6%. Every batch preserves the same draw count, triangle count, preset ceiling and canvas as its counterpart. GPU median differences are at most 0.005 ms. There are no page errors. Host CPU busy share measured from OS CPU-time deltas ranges from 10.71 to 15.34%; free RAM ranges from 9,729 to 9,933 MB. Recorded load ranges from 1.26 to 1.89. Raw per-batch process names and CPU times accompany the full JSON outside the repository; the compact summary retains load, RAM and CPU busy share.

The same run independently rechecks ordinary program-parameter lookups after timed batches: Low plaza 27 to 6, Low crowd 37 to 16, Medium crowd 39 to 18, Medium fight 23 to 8, High FP 31 to 14 and High fight 23 to 8 per frame. The separate baseline/static-only/mask-only/combined attribution table above establishes that the mask change produces this reduction. No after-allocation KB/frame reduction is claimed because no new allocation sampler ran in this clean window.

Live matches are unseeded and driven only through ordinary inputs. Each run has 45 configured seconds, approximately 36 settled seconds after the initial 10 seconds are excluded. The Medium ceiling is exactly 1.25 throughout, output 2940x1912, DPR 2, page CPU throttle 4. Profiles, heap sampling and GC traces are all disabled. CPU timings below are the actual render and world-draw spans; GPU values are summed per-pass queries.

| Live run | Settled s | fps | p95 / p99 ms | 1% low fps | Intervals >50 ms | Max ms | Render / world CPU ms | GPU ms | Load range | Nearby ground actors max |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | --- | ---: |
| Before Correria | 36 | 44.0 | 33.4 / 33.4 | 24.0 | 2 | 50.1 | 16.97 / 12.23 | 2.76 | 1.54 to 1.78 | 3 |
| Combined Correria | 36 | 52.3 | 33.4 / 33.4 | 28.4 | 0 | 50.0 | 14.66 / 10.12 | 2.87 | 1.41 to 1.55 | 3 |
| Before royale | 36 | 35.4 | 33.4 / 50.0 | 20.0 | 3 | 50.1 | 22.39 / 15.04 | 2.60 | 1.31 to 1.53 | 3 |
| Combined royale | 36 | 37.9 | 33.4 / 50.0 | 19.1 | 10 | 66.7 | 20.82 / 13.47 | 3.00 | 1.27 to 1.34 | 3 |

Both short live runs have lower average CPU submission and render costs. Correria's observed cadence improves. Royale's 1% low and >50 ms interval count are worse in this pair; the change does not establish a tail-latency gain. Different unseeded bot routes, alive players, camera paths and GPU costs prevent assigning the precise live FPS differences solely to the optimization. P95 remains 33.4 ms. The frame intervals are quantized by the browser's display cadence, so even small changes around 50 ms can cross the strict >50 ms counter.

Correria contains 8 actors with at most 3 ground actors within 20 m. Royale contains 21 actors with at most 3 nearby ground actors, covering plane, falling, parachute and ground stages. Before/combined stage durations are approximately 2/2 seconds plane, 2/2 falling, 6/6 parachute and 34/34 ground. Stage FPS before/combined: plane 57.1/58.5, falling 46.7/52.7, parachute 53.0/58.4, ground 34.5/36.8. This provides plane/drop/landing coverage but does not prove a denser crowded landing or a longer Correria busy fight. The synthetic frozen crowd and fight cases provide separate controlled stress measurements.

No M2 Air was available. The Radeon, RAM headroom, unthrottled worker/GPU, headless browser and unavailable Linux thermal measurement limit transfer to an M2 Air 8 GB Retina. The retained changes reduce measured CPU work while preserving controlled pixels; they do not guarantee 60 fps on M2, improved rare hitches, a new memory allocation rate or sustained thermal behavior. The original shared variant-changing materials still rebuild in their remaining cases, and worker cloning remains unchanged.

| Experiment | Final decision | Evidence |
| --- | --- | --- |
| Mask facade V1 and original V2 captures | Rejected at 09:24 | Original strict capture differed; all failed comparisons remain preserved |
| Unchanged baseline controls | Retained as diagnostics | Reproduce the same 940 Medium crowd pixels with identical executable and asset bytes |
| Static kit matrix cache | Kept | Final controlled 21-camera identity plus improved combined quiet costs; root/removal/reparent tests |
| Rechecked mask V2 | Kept | Explicit new mask and combined 21-camera exact gates, 15 to 23 fewer program lookups in quiet cases |
| Worker snapshot pooling or cloning change | Deferred | Snapshot acceptance small relative to rendering; immutable retained interpolation contract |
| Additional startup shader/texture warmup | Deferred | Existing preparation covers variants and uploads; no measured late compilation in clean baseline |

Final evidence: `combined-quiet-static-summary.json`, `combined-live-clean-summary.json`, `combined-identity.json`, `program-rebuild-attribution.json` and this experiment log. All failures and limitations above remain part of the evidence. Final integration and its separate HUD, holding, plane and shader changes are verified by the coordinating root.
