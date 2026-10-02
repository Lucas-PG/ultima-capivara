# Performance experiments, 2 October 2026

Rendering baseline: b721224. HUD, gameplay, assets, shaders, presets and density stay fixed. QA tooling commit 5e04f51 adds measurement controls without changing production rendering.

Machine: Ryzen 5700X, 16 logical threads, 16 GB RAM, Radeon RX 9060 XT, Linux, Chrome with ANGLE GL/EGL. Timing runs use 1470x956 CSS pixels, deviceScaleFactor 2, CDP CPU throttle 4. Live runs pin each shipped preset's ceiling. Medium uses density 1.25 and a 2940x1912 output canvas. Each live sample includes load, free memory, density, buffer size and CPU/GPU spans. Linux thermal state is unavailable. CDP throttles the page main thread; the worker and GPU are not an M2 simulation. The faster GPU and available memory do not reproduce an M2 Air's bandwidth, thermal conditions or 8 GB memory pressure.

Raw profiles, allocation samples, full images, logs and immutable builds are outside the repository at `/home/lucas/codex-team/logs/performance`. JSON summaries and exact pixel hashes accompany this log. Identity captures use the same fixed Math.random seed 20261002, seven cameras at Low/Medium/High ceilings, with CPU throttle 1. They compare decoded RGBA bytes, including the fixed HUD.

## Profile first

Exclusive window 08:32 to 08:46. Medium Correria: render 15.48 ms/frame, avatars 2.92 ms, submission 11.17 ms, GPU 2.65 ms. Royale: render 18.57 ms/frame, avatars 4.63 ms, submission 12.60 ms, GPU 2.86 ms. Main-thread matrix traversal and material program preparation dominate; snapshot acceptance is only 0.06/0.11 ms/frame. Allocation sampling measures 433.1/529.5 KB per rendered frame, including about 90 KB/frame in `getParameters`.

These first runs contain deliberate CPU, heap and tracing interventions. Their long gaps and 1% lows must not be presented as clean gameplay hitch measurements. Royale has 21 actual actors and at most 4 ground actors within 20 m of the camera. It is not evidence of a denser live landing. Static crowd12 and plaza16 are synthetic QA workloads.

## Mask render-state isolation: rejected

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

The observer's extra hooks/readback affect execution and cannot override the original capture failure. Both production patches and their temporary tests were reverted. Rejected patch saved outside the repository. No rendering change retained.

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
| Static kit matrix traversal | World-pass matrix work is the largest measured caller | Preparing isolated cache experiment |
| Worker snapshot cloning | Acceptance cost is much smaller than rendering | Lower priority, no change yet |
| Additional shader/texture warmup | Existing preparation awaits compilation, texture uploads and mask variants; clean run has no late compilation | No additional warmup justified yet |
