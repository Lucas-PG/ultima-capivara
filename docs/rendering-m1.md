# M1 rendering verification

## Slice 1: opt-in stall attribution

Start local Vite with `?timing=1`. Production builds leave the recorder disabled.
`window.__capivara.timings()` exports the preset, viewport/DPR, `timeOrigin`,
chronological spans, Long Tasks (start, duration and Chrome attribution), and explicit
loss counters. `resetPerf()` clears both the legacy probe and the new recording.
Export between capture windows: 262,144 numeric span slots and
256 Long Tasks are retained. Do not silently drop an overwritten segment.

Each span records phase, simulation tick and rendered-frame count at completion.
Camera mode changes mark orbit/chase/fps, including landing. The main hooks cover
snapshot handling, audio, interaction selection, HUD and render work. Render hooks
separate camera work, world/post and first person, resolution changes, async shader
warmup, first material use and newly created world shader programs. WebGL driver
hooks record texture upload/mipmap calls, compileShader and linkProgram CPU durations.
Material observation is installed on prepared world and first-person materials.

Slow spans (at least 8 ms, or rAF gaps over 33.4 ms) plus loading, GPU and transition events emit User Timing
marks/measures for CDP correlation. Browser performance buffers are immediately
cleared; the bounded numeric ring retains the records. The diagnostic mode has an
intentional observer/wrapper overhead, including argument arrays at driver calls.
Normal play installs none of those wrappers and adds no per-frame record allocation.

The glTF loader records its synchronous parse call separately from total parse
wall time, including asynchronous resource/decode waits. Texture readiness
measures request to image load callback, including network. Explicit image.decode()
then runs inside the readiness barrier, with a separate decode wall span. These are wall durations, not pure parse/decode CPU.
Driver uploads are CPU submission durations, not GPU completion time. Never label
these spans as proof of a GC, decode, or GPU stall on their own.

For an unexplained recurrence, Sentinela captures a short CDP trace with
`devtools.timeline`, `v8`, `blink.user_timing` and GC categories while this probe
runs. Correlate the trace task, decode/GC/JS stack and named spans using timeOrigin
and the rAF/LongTask start times. Preserve Chrome's `unknown` attribution when that
is all it reports. The original 83/89 ms and 50 ms events remain unresolved until a
per-entry cause is evidenced and a fix is measured.

Acceptance runs must state frozen source, preset, viewport/DPR, browser/ANGLE,
active actors, rendered-frame growth and concurrent-agent activity. Schedule
Medium and Low windows through Formiga, at most ten minutes each, then retain
per-entry causes, p95/max/>50 ms counts, draw calls and triangles. This diagnostic
slice makes no visual or frame-time improvement claim.

Shared-file changes: additive timing hooks and read-only local diagnostics in
`src/main.ts`; no gameplay or loading-readiness behavior changes.

## Slice 2: Direction A atmosphere and surface policy

The sun is #FFD9A8 at 2.7, with offset (-70,55,-30); hemisphere #B4C2EE /
#C9A66B at 1.15. The shared material ramp is the bible's soft three-band curve.
Cast sun shadows retain a 75% warm-lilac (#C9B2D6) light contribution. The
same-albedo plaza pair measures median display-luminance ratio .799, compared
with .747 before the tint adjustment; final hue approval is pending. Neutral exposure is 1.1 and display saturation 1.12.
Fog begins at 110 m and ends at 460 m, thinning with altitude on every preset.

`PaintedSky` has one gradient dome and one merged draw for eight fixed cloud
cards, slow rotational drift, a painted sun and sub-code-value dithering. Its
original Canvas cloud atlas contains tall, flat and paired silhouettes, with
fixed per-card scale/yaw variation. The lower 20% blends cool lavender into a
sun-facing peach accent. Cards stay above 12 degrees; the screen-space sun disc
and halo remain circular as the camera turns. No photographic inputs are used. The same sky supplies
the first-person PMREM. Sky and cloud resources are explicitly disposed.

World surface maps and the photo HDR are removed from the runtime manifest.
Thirty-two unused photo files are deleted, including the historical foliage
atlas. Terrain vertex colours remain Jangada's integration responsibility. His
painted terrain map, analytic road/cliff hook and signage atlas are preserved.
The compatible-material/shadow buckets from 8de215a now combine flat surfaces
within 64 m cells; the terrain shader remains separate.

`createToonMaterial(kind, parameters)` preserves the standard material/atlas API,
clamps roughness to at least .85, and sets metalness to zero. Tatu applies
`applyCharacterStyle(material)` after every clone: it preserves painted maps,
emissive maps, vertex colours and previous shader hooks while adding the .35,
power-3 #FFE2B0 rim and `toonCharacter` tag. A pre-lighting albedo mask keeps
dark eye/nose/mouth atlas regions from receiving that rim. Weapons do not receive this rim.

World depth ink uses #3A2418 at .85, fading 45 to 120 m. An explicit Neutral/sRGB
output transform writes an intermediate display-color target, then FXAA filters
the composed outlines. It does not double-convert output. Width scales from
1 px at 720p toward 1.25 px at 1080p. Frame statistics now include both post draws.
Persistent character ink and first-person AA are described in slice 3.

`StormView` is taken over from Brasa a3b846c: nearby wisps fade out between 38 and
60 m, with distant haze confined to the low horizon, and no wall at radius zero.
Brasa retains ownership of the separate outside-zone screen-feedback integration.

All screenshots, palette/shadow checks and final performance dispositions are
pending review. This document records implementation, not an art approval.

## Slice 3: persistent character ink and first-person AA

Avatar construction marks every preloaded skinned LOD on reserved layer 1 and
applies the clone-safe character material hook. A white character mask compares
its fragment depth against the actual world depth texture, discarding occluded
surfaces and fragments beyond 150 m. Only the visible silhouette receives
#2B1B12 ink; scenery retains its separate 45 to 120 m fade. No hidden-character
outline is intended. Mask rendering restores camera layers, scene background,
material override and shadow state even if rendering fails.

First person now draws to its own linear colour/depth target. Its warm ink and
output transform composite over the world before the common FXAA pass. Warmup
uses the new linear target and submits the skinned mask variants under the
loading overlay. Frame counts include world, shadows, mask, first person and all
post draws. The mask costs one additional draw per visible character skin.

The directional shadow anchor now snaps to texels in light space, keeping the
sun direction fixed as the camera moves. There are no cascades or cascade seams.
Further acne, contact and motion review still belongs to the visual gate.

Local shader smoke at Medium/1280x720 passed with the legacy character, rim,
mask and first-person composite. World-only evidence is in
`output/playwright/m1-{outline,capy}-wip.png`; these are diagnostic poses, not the
matched Pincel approval set. The standalone preview's only console error was an
unrequested favicon.ico 404, with zero shader errors or warnings. Counts were
427 calls/941,480 triangles without a remote character and 433/971,794 with one.
These counts exceed the final budget; Jangada's world batching is still required.

## Slice 4: painted water

Water depth matches the rendered 260 m terrain grid centrally and samples the
shared terrain beyond it. A padded shoreline-distance field increases depth
outward from the organic coast, avoiding a square shallow-water boundary. No
new visible terrain geometry or network asset is added. Shallow/mid/deep colours are #2EC4B6/#1FB0AE/
#0E7C86. Depth continues smoothly beyond the terrain rectangle instead of
switching colour at its border. Shore foam width uses the sampled terrain slope
so shallow beaches do not become a wide white band. The shoreline fades over
35 cm; foam stays within about one metre, at up to 55% opacity.

One instanced foam draw covers solid colliders that cross the water level,
including pier supports and rocks. Foam/glints use broad, slow variation; reduced
motion freezes their shared clock. There are no photographic or water normal
maps on the sea. All presets use the same intentional colour/edge treatment.
The previous separate shoreline/mist meshes are removed. Post ink is suppressed
on submerged geometry so the terrain depth cannot draw a hard line across foam.

Typecheck and the terrain-alignment/resource-disposal water test pass. The local
Medium/1280x720 water view has zero console errors/warnings and is retained at
`output/playwright/m1-water-fixed.png`. Final matched art and budget review is
still pending; no defect is closed by this implementation note alone.


## R2 contacts and loading

Sun shadow normalBias .12 removes the observed interior/box acne in targeted
captures. Rare loot beams stop below the lowest authored roof ceiling; outdoor
beams retain their height. The ceiling lookup is cached by loot ID.

The menu no longer creates a renderer during idle time. main.ts imports its
renderer type statically and loads the implementation only on first match. The
loading screen gets two rAF opportunities before world construction, then stays
visible through the shared warmup and per-match preparation. Remote snapshots
wait for renderer readiness too. pagehide prevents a late dynamic import from
creating a WebGL context. Subsequent matches reuse the prepared renderer. This
is a focused shared-main.ts change; production lifecycle/network QA is pending.

## Diagnostic trace disposition (01b28ae)

The 2026-09-25 04:05-04:15 UTC window is not performance certification. Medium
ran 240 seconds with p95 16.8 ms, max 350 ms and 25 gaps over 50 ms. Pincel's
Chrome captures overlapped 04:08:00-04:10:48, contaminating those minutes. Low
ran only 120 seconds: p95 16.7 ms, max 66.7 ms and one gap over 50 ms. Heavy CDP
profiling also adds observer overhead. Both runs reported zero page errors.

Trace evidence identifies layout/style tasks and V8 GC for several Medium gaps;
other long RunTasks have no attributable children. Low's single 70.473 ms task
at page time 40356.1 ms remains unknown: no child layout, GC or named JS span,
and sampled stacks contain only program/idle. Neither code timing nor an unknown
Chrome attribution proves a GPU stall. A short expanded trace on recurrence is
still required. Per-entry records are retained in the shared review handoff and
output/m1/trace-01b28ae-{medium,low}/correlation.json. HUD layout fixes owned by
Pincel must be included in the next frozen run before claiming their effect.
