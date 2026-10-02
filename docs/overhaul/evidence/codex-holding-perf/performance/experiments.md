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

The observer's extra hooks/readback affect execution and cannot override the original capture failure. Both production patches and their temporary tests were reverted. Rejected patch saved outside the repository. No mask rendering change retained. Later baseline controls below reproduced the same 940 pixels with unchanged executable bytes, so those pixels cannot be attributed to the mask patch. The later explicit mask and combined gates below permit reconsideration; performance retention remains pending the final quiet run.

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
| Static kit matrix traversal | World-pass matrix work is the largest measured caller | Exact controlled camera gates pass; timing repeat in progress |
| Worker snapshot cloning | Acceptance cost is much smaller than rendering | Lower priority, no change yet |
| Additional shader/texture warmup | Existing preparation awaits compilation, texture uploads and mask variants; clean run has no late compilation | No additional warmup justified yet |

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

## Static timing results, retention pending

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
