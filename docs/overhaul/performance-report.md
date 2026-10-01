# Performance pass

1 October 2026, branch `perf-pass` from `overhaul/aaa-autonomous` at 6d57249. Brief: `docs/overhaul/briefs/performance.prompt.txt`.

## 1. Outcome

Medium, the preset that was "very laggy", now holds 60 fps at real conditions on this MacBook Air M2 (Retina, 1470x956 at deviceScaleFactor 2, live bot matches, five minutes per run): 37.4 to 60.7 fps in Correria and 34.9 to 60.7 in the battle royale, p95 frame time 33 to 50 ms down to 16.7 to 16.8 ms, p99 83 ms down to 16.8 ms. High went from 30 to 34 fps to 59.8 and 60.0. Low stays at 60. Input to the next frame fell from 96 to 24 ms (median). Loading is not slower.

How:

1. **Resolution for Retina.** The 3D image was drawn at native Retina density (5.6 million pixels). Each preset now has a range of render densities (Low 0.5 to 0.75, Medium 0.6 to 1.25, High 0.75 to 2.0 render pixels per CSS pixel), drawn through a viewport into targets allocated once and upscaled into the native canvas (Catmull-Rom, a mild sharpen, a clamp against halos), so changing it costs nothing.
2. **A dynamic resolution that works on this hardware.** The old one ignored the slow frames it existed for. The new one is driven by the frames the display actually missed: Apple GPUs scale their clock to the load, so GPU timer queries read 10 to 13 ms at every density and a controller trusting them kept Medium at its blurry floor. It now sits at Medium's 1.25 ceiling for whole runs.
3. **Cheaper pixels and frames, same image.** Terrain layers only where painted, terrain drawn last, the lamp and sun-shaft work skipped where invisible, 8-bit SMAA and mask targets: at native density the final pipeline matches the old image at 47 to 56 dB PSNR and costs about half. CPU: animation level of detail for far and off-screen capybaras, no second matrix update, no program rebuilds from shared materials, fading clips cut to zero (924 to 537 KB of garbage a frame in a royale landing).
4. **Settings and pacing.** *Resolução 3D* (Automática, 100%, 75%, 50%), *Limite de quadros* with a new *Taxa da tela* default (one frame per refresh on any display, 60 and 30 kept), a first-play step down to a lighter preset when even the floor keeps missing, an opaque WebGL context.

Not met: the 1 percent low target of 50 fps (44.6 and 44.9 on Medium) and zero frames over 50 ms (6 and 1 per five minutes on Medium): the frames left are main-thread stalls on a laptop with 5 to 9.6 GB of swap in use, not GPU frames. Medium is not native resolution: it is a little softer at 1:1, close to native at normal viewing distance (section 8).

## 2. How it was measured

**Real play conditions.** The production build with the QA hooks (`VITE_QA=1 npm run build`, served by `vite preview`), a 1470x956 CSS viewport at deviceScaleFactor 2 (a full-screen Chrome on this MacBook Air M2, so the 3D canvas is 2940x1912 when it renders at native density), real Chrome 154 with ANGLE Metal (`ANGLE Metal Renderer: Apple M2` reported in every run), live practice matches with bots, five minutes per run. A battle royale run covers the plane, the drop, the glide and the fights on the ground; a Correria run is one long busy fight. The player is driven through the real input layer by `tests/perf/live-driver.mjs` (it routes with the game's own navigation, loots, aims and fires; no health, damage or time overrides).

**Tools** (all in `tools/qa/`, all new in this pass except where noted):

- `real-perf.mjs`: the live harness. Per second it records the display frame intervals (an independent `requestAnimationFrame` loop), the frames the game drew, the render density, the dynamic resolution's GPU estimate, CPU spans (render, avatars, camera, world update, weapon view, effects, draw submission, HUD, audio, the worker tick), long tasks, the JS heap, the machine load and the thermal pressure (`notifyutil -g com.apple.system.thermalpressurelevel`, 0 nominal, 1 moderate, 2 heavy). It can take 10 s GC traces (`TRACE_AT`), CPU profiles (`PROFILE_AT`) and allocation samples including collected garbage (`ALLOC_AT`). `real-perf-summary.mjs` turns runs into tables.
- `pass-bench.mjs`: GPU time per render pass on the QA cameras at real resolution. Each pass is timed alone on an idle GPU (timer query around the pass, after a sync on the pass's own target), so passes add up to a frame. It also runs paired A/B toggles (the frame with and without one part, five rounds, median), which survive the thermal drift of this laptop.
- `latency-probe.mjs`: input to photon, see section 10.
- `board-capture.mjs` and `board-compose.sh`: the before and after image boards.

**Headless.** At the user's request (a visible Chrome took over their screen) the runs are headless Chrome with the GPU. Representativeness was checked first with the same Medium Correria at both densities: headed 17.9 and 48.9 fps, headless 18.5 and 46.9 fps; the renderer string is ANGLE Metal in both; `requestAnimationFrame` runs at 60.00 Hz headless and 59.98 Hz headed. Every number below is headless unless it says otherwise.

**The machine, as measured.** Load average 4 to 25 during the reported runs (once above 80 when another process swapped), swap 5 to 9.6 GB in use on 8 GB of RAM, thermal pressure moderate to heavy for most of the day. Until about 09:59 the Claude app's hidden browser pane ran an old review page with the game's WebGL loop, competing for the GPU (its GPU process sat at 50 to 85 percent CPU). Everything measured before 10:00 was contended: the early static benches, the A/B tables and the first baselines. Every before and after run in section 3 was taken after 10:00 (the first full batch interleaved, before, after, before, after, so both builds saw the same conditions; the final table pairs the final build with the most recent before runs). The A/B results are paired measurements, so their differences still hold; their absolute frame times are inflated.

**Before** is the code at 9ee6e14 (the overhaul as pushed) with only harness hooks added (diagnostics in the QA build, the camera override in the QA build, the driver's module access), built from a plain copy outside the worktree.

## 3. Results at real conditions

Five-minute live runs of the final build, 1470x956 at deviceScaleFactor 2, headless Chrome ANGLE Metal. fps is frames drawn per second; frame times are display intervals; 1% low is the frame rate of the slowest 1 percent of frames; "frames over 50 ms" counts after the first 10 s. A battle royale run ends early when the match reaches its results. The after runs are 13:47 to 14:21 (Low 14:52 to 15:02, see below); the before runs 11:55 to 12:20 (Medium, Low royale) and 12:37 to 14:16 (High, Low Correria), the most recent uncontended run of each.

| Preset | Mode | Before fps | After fps | Before p95 ms | After p95 ms | Before 1% low | After 1% low | Frames over 50 ms before / after | After density (mean, range) | Main thread ms per frame before / after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Medium | Correria | 37.4 | **60.7** | 33.4 | **16.8** | 4.4 | 44.6 | 191 / 6 | 1.25 (1.15 to 1.25) | 10.0 / 3.7 |
| Medium | Battle royale | 34.9 | **60.7** | 50.0 | **16.7** | 6.1 | 44.9 | 303 / 1 | 1.23 (0.9 to 1.25) | 16.2 / 4.3 |
| High | Correria | 30.5 | **59.8** | 50.0 | **16.8** | 7.1 | 28.6 | 336 / 6 | 1.15 (0.85 to 1.55) | 13.3 / 4.7 |
| High | Battle royale | 33.7 | **60.0** | 50.0 | **16.8** | 15.6 | 29.5 | 94 / 1 | 1.27 (0.85 to 1.7) | 9.7 / 4.9 |
| Low | Correria | 60.9 | 60.7 | 16.7 | 16.7 | 58.2 | 46.2 | 1 / 4 | 0.75 (0.7 to 0.75) | 5.1 / 3.9 |
| Low | Battle royale | 60.2 | 60.1 | 16.8 | 16.8 | 27.3 | 25.9 | 11 / 17 | 0.72 (0.5 to 0.75) | 8.8 / 4.5 |

Per minute (fps): Medium Correria before 40 32 39 39 38, after 60 60 61 61 61; Medium royale before 44 36 27 34 36, after 60 61 61 61 61; High Correria before 39 31 30 27, after 59 60 60 60 60. In the royale runs the plane, the drop and the parachute ran at 61 fps on Medium after (55, 44 and 31 before); on High 57, 54 and 59 (52, 32 and 24 before). p99 on Medium went from 83 ms to 16.8 ms in both modes. The full rows, with the load and thermal pressure per run, are in `evidence/performance/sustained.json`.

Against the targets of the brief:

- **Medium**: steady 60 (every minute 60.3 to 61 fps in both modes, at its full 1.25 density nearly all the time) and p95 16.7 to 16.8 ms: met. 1% low 44.6 and 44.9 fps against the 50 target, and 6 and 1 frames over 50 ms after the first 10 s against none: not met. All but one of those frames sat in a second with a main-thread long task (the page itself stalled, not the GPU); across the two runs they are 7 frames of 33 000; the 1% low counts them with the 20 to 50 ms frames around them (18 and 48 in the two runs).
- **Low**: 60 fps at its 0.75 ceiling nearly all the time, p95 16.7 to 16.8 ms, the GPU with room to spare. Its hitches are the system's: the royale run's 17 frames over 50 ms all fell in one 20 s window (11 with long tasks), as its before run's 11 did in a few bursts. The Low after rows are a second pair of runs, 14:52 (royale, load 5.5) and 14:57 (Correria, load 5.0), thermal nominal: the first pair, 14:16 and 14:21, ran while another process held the load at 8 and then 12 to 30 (Correria 60.3 fps and royale 58.7, 16 and 47 frames over 50 ms, most with long tasks); both pairs are in `sustained.json`.
- **High**: 59.8 and 60.0 fps, p95 16.8 ms, at a density of 1.15 to 1.27 on average where it used to draw native at 30 to 34 fps. It is the preset at the edge of this GPU: 270 to 300 frames a run over 20 ms (about 1 in 60), the price of drawing as many pixels as fit.

Conditions: the after runs had load averages of 3.8 to 5.5 and thermal pressure moderate to heavy for the whole of every Medium and High run; the before runs 3.7 to 12.5, with moderate to heavy pressure for 78 to 100 percent of each. Before and after were measured at different times of the day, so single rows carry 10 to 20 percent noise; the earlier interleaved batch (10:44 to 11:28, the v2 controller, in `sustained.json`) gave the same picture: Medium Correria 36.1 to 60.5 fps, High royale 28.8 to 60.9.

The density column is the main change since that batch: the controller then kept Medium near its 0.6 floor (mean 0.67) for the same 60 fps; reading missed frames instead of GPU timers it now holds 1.25 (section 7, rows 20 to 24, and section 8 for what the floor looks like).

## 4. The old release-gate test (1280x720 at 1x)

`tests/perf/perf.spec.ts`, unchanged (16 capybaras in the QA plaza, 5 s of frames, the QA loop pins the render density at the preset's ceiling, which on a 1x screen is native for Medium and High, so this measures the same pixels as before).

| Preset | Before fps | After fps | Before p95 ms | After p95 ms | Max ms before / after | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Low | 60 | 60 | 16.7 | 16.7 | 16.8 / 16.8 | 136 | 1.32 M |
| Medium | 60 | 60 | 16.8 | 16.7 | 16.8 / 16.8 | 155 | 1.69 M |
| High | 60 | 60 | 16.7 | 16.8 | 16.8 / 16.8 | 182 | 2.02 M |

Both builds hold the 60 fps vsync cap on every preset here (14:28 and 14:34, load 6 to 8), so this test cannot tell them apart: a 1280x720 canvas at 1x is 0.9 million pixels against the 5.6 million of the Retina screen, which is how the Medium lag passed this gate. It still guards the plaza scene's draw calls and triangles (unchanged) and the download sizes (after: 1.33 MB before the menu, 750 KB compressed; 31.6 to 35.3 MB before a match). The new `tests/perf/real-conditions.spec.ts` in the same run, 40 s per preset at real conditions: Medium 59.8 fps (p95 16.8 ms, 1 frame over 50 ms, density 1.25), Low 59.9 (p95 16.8, none, 0.75), High 59.3 (p95 16.8, 1, 1.6); it passed.

## 5. Loading

Measured in every sustained run: from navigation to the menu's play button, and from the click on *Treinar* to the first frame of play (loading overlay gone).

| | Menu, mean of the 6 runs of section 3 | First playable frame, mean | Low (Correria, royale) | Medium | High |
| --- | ---: | ---: | --- | --- | --- |
| Before | 1.04 s | 5.53 s | 5.1, 5.1 s | 6.0, 5.9 s | 5.5, 5.5 s |
| After | 0.99 s | 5.55 s | 5.0, 5.8 s | 5.5, 6.0 s | 5.3, 5.6 s |

No worse, within the noise of these runs (the loaded Low royale run of 14:21 took 7.3 s). The warmup now also compiles the upscale, the scaled SMAA, and the per-kind mask and shadow materials, within the noise of these runs. Downloads are unchanged (no asset changed; the code grew by about 10 KB).

## 6. Where the time went

### GPU per pass, before

The original pipeline at native Retina density (2940x1912), Medium, GPU milliseconds per pass, each timed alone (serialized, so absolute times run high; contended run, read the shares):

| View | Shadow | World | Character mask | Atmosphere (AO, bloom, shafts) | Composite and grade | First person | First-person composite | SMAA | Frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| First person, M4 | 1.2 | 14.9 | 2.1 | 4.9 | 2.7 | 3.8 | 2.4 | 5.4 | 40.3 |
| Plaza, 16 capybaras | 1.2 | 22.9 | 1.4 | 3.5 | 3.8 | 3.4 | 2.2 | 4.3 | 44.0 |
| Close crowd | 1.9 | 31.1 | 1.8 | 4.6 | 3.5 | 5.0 | 3.5 | 6.3 | 49.7 |
| Plane view | 1.5 | 44.7 | 2.2 | 4.0 | 3.6 | 2.4 | 2.5 | 6.6 | 72.8 |
| Fight (coconut blast) | 2.6 | 36.4 | 1.7 | 5.1 | 3.6 | 5.2 | 3.1 | 6.4 | 67.4 |
| Harbour | 1.6 | 13.2 | 2.0 | 3.8 | 2.5 | 2.8 | 1.9 | 5.3 | 33.4 |

The same Medium views cost 10.5 to 16.8 ms at density 1 (a quarter of the pixels): the GPU was bound by pixels, and the world pass by fragment shading. Paired A/B at density 1 (Medium, `evidence/performance/gpu-ab.json`): replacing every world material with a flat one saved 7 to 20 ms of a 14 to 27 ms frame; the terrain alone cost 5 to 9 ms, shadows 2.4 to 5.6, trees 3 to 4, buildings about 2; characters, water, sky, street props and the first-person view were under 1 ms each.

### GPU per pass, after

The final pipeline at Medium's ceiling (density 1.25, a 1838x1195 render upscaled into the 2940x1912 canvas), GPU milliseconds per pass, each pass timed alone (12:15, calmer machine, thermal moderate), with the whole frame at Medium's floor (0.6) and at native density for comparison:

| View | Shadow | World | Mask | Atmosphere | Composite | First person | SMAA | Upscale | Frame at 1.25 | Frame at 0.6 (world) | Frame at native | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| First person, M4 | 1.3 | 9.7 | 0.1 | 1.7 | 1.0 | 3.8 | 1.0 | 1.3 | 20.3 | 14.7 (7.0) | 25.3 | 1.52 M |
| Plaza, 16 capybaras | 0.8 | 6.5 | 0.2 | 1.0 | 0.6 | 1.7 | 0.9 | 0.7 | 12.2 | 16.3 (8.9) | 22.8 | 1.69 M |
| Street | 1.9 | 11.7 | 0.2 | 1.8 | 1.1 | 2.7 | 1.1 | 1.5 | 22.1 | 14.1 (7.1) | 19.5 | 1.51 M |
| Close crowd | 1.2 | 9.1 | 0.4 | 1.3 | 0.8 | 2.3 | 1.0 | 1.0 | 16.9 | 16.2 (8.9) | 21.5 | 1.78 M |
| Plane view | 0.5 | 14.8 | 0.1 | 1.2 | 1.1 | 0.7 | 1.1 | 1.1 | 21.3 | 15.0 (10.8) | 21.4 | 0.92 M |
| Fight | 1.1 | 11.3 | 0.2 | 1.3 | 0.9 | 2.4 | 0.9 | 1.1 | 19.9 | 15.9 (8.7) | 22.2 | 1.54 M |

Two readings, both in `evidence/performance/gpu-passes.json`:

- **The same pixels cost about half.** At native density the final pipeline takes 19.5 to 25.3 ms on these views against 33 to 73 ms before (the before run was contended, so the gap is somewhat smaller than this; the paired A/B rows of the experiment log give each change's own saving). The post passes shrank the most: SMAA 4.3 to 6.6 ms became 2.0 to 2.3, the atmosphere 3.5 to 5.1 became 1.7 to 3.2.
- **Below the ceiling the frame stops following the pixels.** From 1.25 to 0.6 the pixel count falls by three quarters, but the world pass only from 6.5 to 14.8 ms to 7.0 to 10.8 ms: what is left is geometry (0.9 to 1.8 million triangles a frame, the shadow map drawing the casters again) and fixed passes (the upscale to the native canvas, about 1 to 2 ms). Serialized timing on this laptop also swings by a third with the GPU clock (the plaza is cheaper at 1.25 than at 0.6 in these two runs), which is why the per-pass table is a guide and the live runs are the result. A paired A/B of the world's parts at 0.6 (12:25) was all noise (rounds differing by up to 6 ms), so no part of the remaining fixed cost could be singled out at that density.

The live GPU timer showed the same thing from the other side: in Medium Correria it read 10 to 13 ms at every density from 0.6 to 1.15. Apple GPUs lower their clock when the frame leaves room, so a timer query measures how long the frame took at the clock the GPU chose, not how much room is left. A fixed density of 1.0 held 60.5 fps (p95 16.7 ms) while the controller that trusted those times sat at 0.6; a fixed 1.5 dropped to 53 fps (thermal heavy). That is why the dynamic resolution is now driven by missed frames (section 7, rows 20 to 24).

### CPU

Main-thread time of a drawn frame (the `render` span: avatars, camera, world update, effects and the draw submission) in the sustained runs is in the table of section 3: 3.7 ms after on Medium Correria (10.0 before), 4.3 ms over a whole royale (16.2 before); in the interleaved batch a royale landing with 21 capybaras took 8.7 ms (28.0 before, at 26 fps). A CPU profile of the Correria (6 s, `PROFILE_AT`) before the CPU work showed the animation mixer (interpolant evaluation and quaternion blends) and the scene's matrix updates on top; the mask pass updated every matrix of the scene a second time. After the animation level of detail and the skipped second update: avatars 2.8 to 1.1 ms a frame, draw submission 3.9 to 3.0. In a royale landing the main thread is the limit at moments (15 to 20 capybaras within 20 m all animate at full rate, the draw submission reaches 6 ms); in the final runs the landing still held 61 fps on Medium. The dynamic resolution recognises these frames (a slow main thread never lowers the resolution). The simulation worker ticks in 0.6 to 4.4 ms (a separate thread).

### Garbage and hitches

Allocation sampling with the collected garbage included (`ALLOC_AT`), 10 s of a royale landing on Medium:

| Source | Before, KB per frame | After |
| --- | ---: | ---: |
| Animation interpolants and actions (three) | 394 | 105 |
| Program parameter rebuilds and their cache keys (three, from shared materials) | 160 | 102 |
| Snapshot messages from the worker | 25 | 23 |
| Everything else | 345 | 307 |
| **Total** | **924** | **537** |

The shared shadow depth material had rebuilt its program parameters 26 to 32 times a frame with 12 to 16 capybaras in view (counted with the QA `programChurn` probe); after the change it rebuilds none. Four smaller shared materials still rebuild 2 to 12 times a frame (an unnamed physical material, the kit atlas used by both meshes and batches, the world arsenal and the foliage used by both instanced and plain meshes).

GC traces (10 s at 90 s and 240 s of each run): minor collections take 1 to 21 ms on the main thread after (most under 10), major ones 2 to 14 ms. The rare long stalls that remain (one to six frames of 67 to 650 ms in a five-minute run, most with a main-thread long task, some with none) came when the system was swapping or loaded by other processes: 5 to 9.6 GB of swap were in use on this 8 GB machine all day. The heap stays between 213 and 400 MB with no growth over five minutes.

## 7. Experiment log

Every change was measured before it was kept. "Same image" means a pixel comparison at the same camera against the previous build (PSNR, or the count of pixels that changed by more than 1.5 percent).

| # | Change | Before | After | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Measure resolution: Medium at forced densities, old pipeline | Native 2.0 (2940x1912): 17.9 fps live (headed), GPU 33 to 73 ms a frame on the static views | Density 1.0: 48.9 fps live; GPU 10.5 to 16.8 ms | Resolution is the first lever: per-preset density |
| 2 | Old dynamic resolution | Ignored every frame over 2.6 budgets (43 ms), so at 18 fps it never engaged; its floor was 0.85; each step reallocated every target (74 to 226 ms stalls in the runs) | Replaced (rows 3, 16, 17, 20 to 24) | Replaced |
| 3 | Render through a viewport of targets allocated once at the ceiling, upscale into a native canvas | Each resolution change stalled 74 to 226 ms; browser bilinear stretch of a lower-resolution canvas | No allocation on a change (no resolution-change stall in any after run); Catmull-Rom with sharpen and a clamp to the 2x2 range, 0.8 to 1.4 ms at 5.6 MP (serialized) | Kept on Medium and High; Low keeps the browser stretch and saves the pass |
| 4 | Upscale sharpen strength 0, 0.2, 0.35, 0.6 | | PSNR against native on the close crowd 30.7, 30.6, n/a, 30.4 dB; differences hard to see | 0.25 |
| 5 | SMAA edges and weights in 8-bit targets (were half float), character mask in one 8-bit channel | SMAA 4.3 to 6.6 ms at native | 2.7 to 4.2 ms | Kept: same image (old and new builds at native: 47 to 56 dB) |
| 6 | Terrain: evaluate each painted layer only where its mask is not zero, derivatives outside the branches | World pass at native, serialized: street 15.6, plaza 21.1, harbour 13.5, Morro 20.3, plane 29.5, beach 19.6, Capela 21.3 ms | 13.1, 16.5, 9.7, 11.9, 21.7, 12.6, 15.4 ms (the old run was hotter, part of the gap is thermal) | Kept: same image (66 to 93 dB, under 650 pixels in 5.6 M changed, all in the animated first-person fur) |
| 7 | Draw the terrain after the rest of the opaque world | | Paired A/B at density 1.25: 3.1 to 4.8 ms saved in all five views | Kept: same image |
| 8 | Skip the interior lamp's BRDF where it adds nothing | Its cost (A/B): 2.0 ms in first person, 3.5 ms in the plane view | Gone | Kept: same image |
| 9 | Skip the sun-shaft taps where their weight cannot show; skip triplanar stone projections under 0.2 percent; skip shadow taps on faces the sun cannot light | | Not isolated (part of the atmosphere pass, 1 to 3 ms, and of the stone and terrain shading) | Kept: same image |
| 10 | Animation level of detail (pose every frame within 20 m, every 2nd to 50 m, every 3rd beyond, every 4th off screen) and no second scene matrix update in the mask pass | Main-thread render 7.1 ms a frame (avatars 2.8, draw submission 3.9), 1% low 21.6 fps (Medium Correria, 30 s) | 4.5 ms (avatars 1.1, submission 3.0), 1% low 29.9 fps | Kept: the watched capybara and every one within 20 m keep full rate |
| 11 | Draw trees after the rest of the opaque world | | 2.0 to 2.7 ms slower (plaza, harbour, plane) | Rejected |
| 12 | Sort the tree batch front to back | | -0.4 to +0.3 ms (noise) | Rejected |
| 13 | Opaque WebGL context (three always creates one with alpha) and desynchronized | three's context: input to next paint p50 40, p90 72 ms (contended) | Opaque: p50 40, p90 48 ms; desynchronized: Chrome on macOS reports it off | Opaque kept (same pixels), desynchronized dropped |
| 14 | First-person fur shells, character fur shells | | Cost not measurable over noise in paired A/B | No change |
| 15 | Medium ceiling 1.25 or 1.5 | 1.5 draws 1.44 times the pixels of 1.25 (3.2 MP) | Fixed 1.5, live Medium Correria: 53 fps, p95 33 ms (thermal heavy); the final controller holds 1.25 at 60 fps for whole runs | 1.25: Medium is the balanced preset; High climbs as far as the GPU allows, up to native |
| 16 | Dynamic resolution v1 (smoothed GPU time, steps up to 30 percent) | Under GPU contention the density swung between 0.6 and 1.0 every few seconds | v2: median of recent GPU times, the queries still in flight ignored after a change, steps of at most a fifth (a third when most frames miss), a climb undone within 4 s doubles the wait before the next | v2 kept |
| 17 | GPU frame timer polled only after a query ended | Once five results were pending no query opened and none ended: the estimate froze and the density sat at its floor for the rest of the run | Results collected before opening a query | Fixed (a test fails on the old code) |
| 18 | Garbage in a royale landing (21 capybaras): clips that fade reach exactly zero weight; one shadow depth material and one mask material per kind of mesh; capybara materials per mesh kind | 924 KB of garbage a frame; the shared shadow depth material rebuilt its program parameters 26 to 32 times a frame | 537 KB a frame; no rebuilds for the depth or mask materials | Kept: 66 to 120 dB against the previous build (the residue is the thousandths of clip weight now cut to zero) |
| 19 | Frame pacing | The cap at 60 dropped a frame whenever a panel ran a little faster than 60 Hz | A display within 10 percent of the cap draws every refresh; 120 and 144 Hz hold an even 60 under the cap; "Taxa da tela" draws every refresh | Kept |
| 20 | Dynamic resolution v3: read only the part of the GPU time that follows the pixels as pixel cost, measured across each density change | v2 read all of the GPU time as pixel cost: on the calm machine Medium Correria sat at the 0.6 floor for whole runs (density mean 0.61) with GPU estimates of 9 to 12 ms | Live, five minutes: still 0.61 mean (0.6 to 0.75), 59.5 fps; the GPU estimate did not fall with the density (11.7 ms median at 0.6, 11.2 at 0.65, 10.0 at 1.15) and its swings above 15.8 ms, with no frame missed, kept stepping it down | Replaced by v4 |
| 21 | Dynamic resolution v4: missed frames decide. Down when a quarter of recent frames miss (not from a slow main thread); up one step, a probe, after a second with no miss; a probe that misses three frames within 4 s goes straight back; each drop marks the density that missed, which then waits twice as long for its next try (up to 30 s) while the steps below stay free; a GPU time over budget still vetoes a probe and sizes a drop | Fixed densities, live Medium Correria: 1.0 held 60.5 fps (p95 16.7 ms), 1.5 fell to 53 fps (p95 33 ms) | Live, calm, 168 s: density 1.25 (the ceiling) for the whole run, 60.7 fps, p95 16.7 ms, p99 16.8 ms, 1% low 42.5, 4 frames over 50 ms. Unit models with a fixed and a per-pixel cost and a timer that reads the same at every density: v3 stayed at 1.0 and 1.1 where 1.1 and 1.25 fit, v4 settles one step under the limit with under 0.5 percent of frames missed by its probes | Kept (both tests fail on v3) |
| 22 | Dynamic resolution v5: a trickle of misses (4 in the last 60 frames) costs one step | v4 on High Correria (five minutes): density 1.1 mean, 58.7 fps, but 523 frames over 20 ms, most of them 2 to 7 a second while it sat at 1.2 or 1.25 (under the quarter that triggers a drop) | Live High, 138 s: 59.0 fps, 179 frames over 20 ms (1.3 a second against 1.8), density 1.08 mean (0.75 to 1.45) | Kept (a test fails on v4) |
| 23 | Dynamic resolution v6: a frame whose own main-thread work took two budgets is not counted as a miss | v5, Medium Correria with 9 GB of swap in use: bursts of 80 to 250 ms frames, each with a 50 to 180 ms draw submission or HUD update (page faults; one 168 ms full collection), sent the density from 1.25 to 0.6 or 0.75 five times, each costing about 20 s of climbing back; density mean 1.03 | v6, Medium Correria, five minutes: density 1.25 (1.2 to 1.25) for the whole run, 60.9 fps, p95 16.7 ms, p99 16.8 ms, 1% low 58.5 fps, 2 frames over 20 ms | Kept (a test fails on v5) |
| 24 | Dynamic resolution v7: the controller reads the display's frame times (requestAnimationFrame timestamps) instead of the time between render calls | v6, High Correria: 735 frames over 20 ms in five minutes, runs of 5 to 10 a second at 1.8 for nine seconds without a step down. A probe printing both: 5 to 9 missed refreshes a second in the rAF timestamps, 0 to 2 between render calls (the main thread ran evenly while the compositor showed frames late) | High Correria, five minutes: 59.8 fps, 303 frames over 20 ms (735 on v6), density 1.15 mean (0.85 to 1.55); Medium Correria unchanged at 1.25, 60.7 fps | Kept (a renderer test fails on v6) |

## 8. The look

**At the same resolution the image is the old one.** With the new build forced to native density, 22 cameras (first person with five weapons, the plaza, a street, the Morro, the harbour, a close crowd, the plane view, a fight) match the old build at 47 to 56 dB PSNR (`evidence/performance/image-psnr.json`); the remaining differences are single pixels along edges (8-bit SMAA weights) and the fight's random particles. So every shader and pipeline change in this pass is invisible on its own.

**What changed is resolution, by preset.** Medium now draws 1.25 render pixels per CSS pixel at most (1838x1195 on this screen, 39 percent of the native pixels) and upscales into the native canvas with a Catmull-Rom filter, a mild sharpen and a clamp to the local range (no halos around the ink lines). High climbs toward native as far as the GPU allows. Low keeps 0.75 as before. Under load the automatic resolution goes lower (to 0.6 on Medium) rather than drop frames.

Boards in `evidence/performance/boards/`, captured from the final build at the same cameras as the before build: `*-full.jpg` show the whole frame (HUD included) before and after at a third of their size, `*-crop.jpg` a 640x480 region at 1:1 Retina pixels. Medium at its ceiling scores 31 to 35 dB against native. At normal viewing distance on the 13.6 inch Retina panel the two are hard to tell apart; at 1:1 the after image is a little softer on fine detail (wires, string lights, the window frames down the street) and the fur fringe of a capybara at arm's length shows a slightly coarser edge. That is the price of 60 fps on Medium on this laptop, and the reason "Resolução 3D: 100% nativa" exists for players who prefer the native image.

**At Medium's floor** (`boards/floor-*`, density 0.6, an 882x574 render upscaled to 2940x1912, 27 to 31 dB against native): seen whole, the frame still reads as the same scene with the same colours, ink lines and light; at 1:1 it is clearly softer, the string lights and power lines down the street break into dots, the window frames lose their thin bars and the fur fringe turns coarse. This is the state the earlier controllers kept Medium in for whole runs on the calm machine, and why rows 21 to 24 of the experiment log matter: the floor is now for the moments that need it.

**High** (`boards/high-*-crop.jpg`): its ceiling is native, so its captures, pinned at the ceiling like every board, match the before build (the street crop differs only in the particles). In live play on this laptop it averaged 1.15 to 1.27 render pixels per CSS pixel (up to 1.7), between Medium's ceiling and native.

## 9. Settings

The settings screen keeps its style and pt-BR labels; every option does what it says.

- **Resolução 3D** (new, under Qualidade gráfica): *Automática · mantém o jogo fluido* (default: the preset's density range, adjusted to hold the frame rate), *100% · nativa (mais pesada)*, *75%*, *50% · mais leve* (fixed shares of the screen's native resolution, never adjusted).
- **Limite de quadros**: new default *Taxa da tela · o máximo da sua tela* (one frame per display refresh; on a 60 Hz screen this is 60), then *60 FPS · Fluido* and *30 FPS · Economia*. When the player never picked a limit, a high-refresh screen falls back to 60 for the session if holding the display rate would take the render density below 85 percent of its ceiling for 3 s (the default only takes the display rate when the machine has headroom). A chosen *Taxa da tela* always keeps the display rate. Old saves that only carried the former 60 default move to the new default; 30, and any limit the player picked, stay.
- **Qualidade gráfica** keeps Leve, Equilibrada and Caprichada. On a first play where even the lowest automatic resolution keeps missing the frame rate for about 15 s of play (a main thread that is the bottleneck never counts), the game steps down one preset and says so in a toast (*Qualidade ajustada para Leve para o jogo ficar fluido. Dá para mudar em Ajustes.*). A preset or resolution the player picked is never changed.

## 10. Input latency

`tools/qa/latency-probe.mjs`: trusted mouse presses (CDP `Input.dispatchMouseEvent`) during a live Medium Correria with bots; the shot is predicted in the press handler, so the muzzle flash is in the next frame drawn. The browser's Event Timing API gives the time from the hardware timestamp of the press to the presentation of the next frame after the handler (8 ms granularity), about 95 presses per run, calm machine, headless:

| Build | fps during the run | Render density | Input to next frame, p50 | p90 | Mean | Input delay p50 (busy main thread) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before (14:26) | 45.7 | 2.0 (native) | 96 ms | 112 ms | 97 ms | 0.7 ms |
| After, final build (14:27) | 59.8 | 1.25 | **24 ms** | **32 ms** | **26 ms** | 0.3 ms |
| Before (11:29) | 44.4 | 2.0 (native) | 96 ms | 120 ms | 103 ms | 0.4 ms |
| After, three's context (alpha), 11:31 | 53.8 | 0.6 | 40 ms | 80 ms | 50 ms | 1.6 ms |
| After, opaque context, 11:30 | 59.4 | 0.6 | 24 ms | 32 ms | 29 ms | 0.4 ms |

Almost all of the before latency was frames queued behind a saturated GPU; holding the frame budget removed it, and the final build keeps it at 24 ms while drawing over four times the pixels of the 11:30 run. The opaque context (the canvas no longer blends over the page) took 16 ms off the median against three's default context in the 11:30 pair, though the load differed (10 against 7), so part of that is noise. What was tried and not kept:

- `desynchronized: true`: Chrome on macOS accepts it and reports `desynchronized: false`; no effect here.
- Coalesced and raw pointer events for mouse look: the look is read from the latest mouse state when the frame starts, and Chrome delivers frame-aligned mouse moves (with their movement summed) right before the animation frame, so every movement already lands in the next frame drawn; neither would move a change into an earlier frame, so nothing to keep.
- Sampling as late as possible: the camera already reads the mouse state at frame start and the first shot is predicted in the press handler; held fire and movement go through the 60 Hz input clock with interpolation (up to one tick, 16.7 ms, for movement), which belongs to the prediction model and was left alone.

Mouse-move latency is not reported by Event Timing; by the paths above it equals the press numbers' frame part (the move is in the next frame drawn).

## 11. High refresh rates

- `src/frame-pacing.ts` decides which display refreshes draw. 0 is the display's rate; the refresh interval is a low percentile of recent `requestAnimationFrame` deltas, never taken above 60 Hz's, so a game too slow to reach the display rate cannot raise its own budget and switch the dynamic resolution off (the bug class of the old controller). Under a cap, a display within 10 percent of it draws every refresh.
- Everything frame-rate dependent was checked. Springs are exact critically damped steps (`src/render/spring.ts`), smoothing uses `damp`, the camera rig, the viewmodel, effects and audio take the frame time, remote interpolation and the local presentation are time based, and input and prediction keep their fixed 60 Hz clock with interpolation by fraction. The dynamic resolution budgets for the cadence actually held (8.3 ms at 120 Hz with "Taxa da tela" chosen). The HUD updates once per drawn frame.
- Tests: `tests/frame-pacing.test.ts` (panels at 59.94, 60, 60.1 and 61 Hz draw every refresh under the 60 cap; an even 60 on 120 Hz and an average 60 on 144 Hz under the cap; the display rate at 120 and 144 Hz; 30 on 60 Hz; the budget never talked up by a slow game; no burst after a stall; old saves). `tests/perf/frame-rate.spec.ts`: first-person motions (M4 reload and fire, shotgun sprint, machete swing, pistol landing, sniper aim) end on the same camera and viewmodel pose at 60, 120 and 144 fps (camera within 1 cm, model matrices within 0.02), and with vsync and the frame-rate limit off (`--disable-gpu-vsync --disable-frame-rate-limit`, a stand-in for a fast high-refresh screen) the game draws 297 fps with "Taxa da tela", and holds the 60 and 30 caps.
- This MacBook Air's panel is 60 Hz, so here the option behaves like 60.

## 12. Tests and guards

New and changed tests, each tied to something that broke or must not break:

- `tests/render-resolution.test.ts` (new): the render range per preset and screen (Medium and High native on a 1x screen, never above the screen, a fixed share honoured exactly, Low without the upscale pass) and the dynamic resolution: an isolated stall ignored; the 18 fps case reacts within half a second and reaches the floor (the old controller ignored those frames); a GPU over budget reaches its fit within two seconds; a slow main thread, steady or in stall bursts, never blurs the image; a climb back to the ceiling with headroom; a stray slow GPU sample ignored; breathing stopped by growing waits; settling one step under what the GPU can draw when the timer reads the same at every density (fails on v3), and from above (fails on v3); a trickle of misses costs a step (fails on v4); probes without timer queries; a fixed resolution never moves; the lighter-preset verdict only after about 15 s of misses at the floor; a reset starts at the new ceiling; the saved setting loads and falls back.
- `tests/renderer-resolution.test.ts` (rewritten): a Retina canvas filled at native resolution while the 3D image is drawn at the preset density; a display change followed, a 1x screen kept native; a sustained slow frame rate answered with fewer pixels without reallocating or resizing the canvas; the controller fed the display's frame times, so refreshes the compositor missed count even when the render calls were evenly spaced (fails on v6).
- `tests/frame-pacing.test.ts` (new), `tests/animation-lod.test.ts` (new: the watched capybara and every one within 20 m keep full rate), `tests/gpu-frame-timer.test.ts` (new: fails on the timer that froze), `tests/character-mask.test.ts` (the skin swap and restore with a scene override), `tests/pipeline-quality.test.ts`, `tests/renderer-lifecycle.test.ts`, `tests/render-presets.test.ts` (updated for the new passes and sizes).
- `tests/perf/real-conditions.spec.ts` (new, next to the old `perf.spec.ts`, which is unchanged): 40 s of a live Correria per preset at 1470x956 and deviceScaleFactor 2 with the production QA build; Medium must hold 50 fps, p95 25 ms and at most 5 frames over 50 ms, Low 55 fps and p95 20 ms, High is reported. `tests/perf/frame-rate.spec.ts` (new): section 11. Both run with `npx playwright test -c playwright.perf.config.ts`.
- `tests/settings.e2e.spec.ts`: the Resolução 3D group, the Taxa da tela default and a saved 75 percent.

Results on the final commit:

- `npx tsc --noEmit`: clean. `npx vitest run --maxWorkers=2`: 119 files, 1090 tests passed. `npm run build`: passes (the existing chunk size warning only).
- `npx playwright test --project=chromium`: 10 passed, 1 skipped (the slow gate); `E2E_SLOW=1` full Correria with the host's rematch: passed (5.7 min).
- `npx playwright test -c playwright.perf.config.ts`: 4 passed (the old `perf.spec.ts`, `real-conditions.spec.ts`, both `frame-rate.spec.ts` tests); numbers in sections 4 and 11.
- Visual baselines regenerated on the final build (`--update-snapshots`, then a plain run: 2 passed). All 171 PNGs differ in bytes from the previous approval (`evidence/final/approved-baselines.json`); compared with those images, 168 are at 47 to 63 dB PSNR (median 50.5), no visible change; the three lowest differ in content, not rendering: `cocoBlast` (24.9 dB) in the shape of the random explosion, `loading` (31.2) and `hud-watch` (37.6) in the randomly chosen tip and elimination line. Reviewed side by side; hashes in `evidence/performance/approved-baselines.json`, the per-image comparison in `evidence/performance/baseline-review.json`.
- The character mask visual test read the mask as four bytes a pixel; the mask became one 8-bit channel in this pass, so the test page now reads it with its own layout (one byte a pixel, rows padded to four). It passes, and it still fails on an empty mask.

## 13. Known limits

- **Medium is not native.** It draws 1.25 render pixels per CSS pixel at most (39 percent of the native pixels) and upscales: close to native at normal viewing distance, a little softer at 1:1 (section 8). On this laptop it held that ceiling through every final run; a heavy moment can still take it toward the 0.6 floor for some seconds, where fine detail is visibly softer. *Resolução 3D: 100% nativa* is there for players who prefer the native image at a lower frame rate.
- **High is at the edge of this GPU.** It averages 1.15 to 1.27 render pixels per CSS pixel and misses about 1 frame in 60 while it looks for the most pixels that fit; under heavy thermal pressure it can sit at its 0.75 floor, where it looks like a sharper Medium with its richer shadows, fur and distances.
- **Crowded royale landings are the CPU's limit.** In the final royale runs the landing held 61 fps on Medium, but with 15 to 20 capybaras within 20 m the animation and the draw submission still take 8 to 12 ms of main thread (section 6): a busier landing or a slower CPU is where frames would drop first.
- **Hitches from the system.** The remaining frames over 50 ms came with main-thread long tasks; on this 8 GB laptop 5 to 9.6 GB of swap were in use all day and the worst stalls (up to 1.8 s in one check run, a 168 ms full collection in another) came with load spikes from other processes. The game's own collections are 1 to 21 ms. The 1 percent low target (50 fps) is not met in any final run (Low Correria comes closest at 46.2); those few stalls are most of the gap.
- **Low under load.** Low's GPU work fits easily, so what it shows is the machine: with another process holding the load at 12 to 30, its royale run fell to 58.7 fps with 47 frames over 50 ms; at a load of 5 it held 60.1 with 17.
- **GPU timer queries do not show headroom here.** Apple GPUs scale their clock to the load, and ANGLE Metal's queries also count queueing, so the controller reads them only as a veto (a GPU time over budget) and to size a drop. The price of steering by missed frames is the probe: at the limit, a step up that does not fit costs about three missed frames, at most once per 30 s once the waits have grown. Firefox and Safari expose no timer query and use the same path.
- **Measurement noise.** This laptop was shared, swapping and thermally throttled; single runs vary by 10 to 20 percent, and the before and after runs of the final table were taken at different times (the interleaved batch of 10:44 to 11:28 is the controlled comparison, with the v2 controller). Absolute numbers on a cool, idle machine would be higher.
- **Remaining program rebuilds:** four shared materials still rebuild their parameters 2 to 12 times a frame (section 6).
- **Not done:** texture compression (no commercially licensed KTX2 encoder was installed, and textures were not a measured bottleneck), static shadow caching, the scope overlay's backdrop blur cost (not measured).

## 14. What would come next

1. Shadow map caching: render static casters once per few metres of movement into one map and the capybaras every frame into a small second map (two maps sampled in the material); shadows cost 2.4 to 5.6 ms in the A/B at density 1.
2. Crowd animation: a cheaper path beyond 20 m (fewer bones, no foot IK or dangles), and the pose work for far capybaras moved to idle time; this is where the royale landings still drop frames.
3. The remaining garbage: snapshots as transferable typed arrays from the worker (23 KB a frame), the last four shared materials split by kind, the animation interpolants' boxing.
4. A temporal upscaler (jittered render with reprojection) would give Medium a native-looking image at its current cost; it needs motion vectors for skinned meshes and the foliage, so it is a project of its own.
5. KTX2 or Basis textures once an encoder is installed: less GPU memory (the High character alone holds 192 MB) and faster uploads on 8 GB machines.
6. Movement latency: extrapolate the local presentation instead of interpolating within the last input tick (up to 16.7 ms), a change to the prediction model to review with the combat owner.
7. Geometry: below Medium's ceiling the frame stops shrinking with the pixels (section 6), because 0.9 to 1.8 million triangles are drawn a frame and drawn again for the shadow map. Coarser levels of detail for the buildings and trees beyond 60 m and fewer distant shadow casters would help High, Low and every heavy moment; any mesh rebuild belongs on the Linux machine.
