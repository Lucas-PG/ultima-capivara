# Avião e paraquedas Capivara

2 October 2026. Branch `codex-plane`, based on `codex-holding-perf` at `e53bc4b`.
Scope: aircraft and canopy artwork, their Blender pipeline, loading lifecycle,
fixtures and review tools. No simulation, flight path, flight speed, drop timing,
glide control, hitbox, player animation or camera source changed.

## Result

The original island hopper has a cream upper body, teal belly, orange nacelles and
tail, rounded wings, two animated three-blade propellers and fixed braced wheels.
The side exits are real openings with a step, handles and warning patches. Inside
are a wood floor, padded benches, belts and buckles, cabin ribs, grab lines,
pilot seats, six instruments and two yokes. Rivets, panel lines, navigation lamps,
exhausts, engine vents, a capybara emblem and Portuguese lettering complete the
near view. Fine decoration and most interior detail leave the distant LOD.

The canopy is an inflated nine-cell ram-air shape with team-colored and cream
panels, rib tapes, sixteen suspension lines, four risers, two control loops and a
teal harness with metal releases. The same `makeParachute` factory is used for all
avatars. Colors remain independent between players. Lines and controls meet the
existing airborne paw pose; no character clip was modified.

The existing game has a plane orbit camera, a drop chase camera, and first person
on the ground. These remain intact. Close cabin and eye-level under-canopy shots
are geometry review cameras, not a newly introduced first-person flight mode.
The real plane, falling and parachute cameras were also exercised in live BR.

## Research completed before modeling

The following actual images were downloaded and inspected at full size. Copies
and the source log are private at `~/codex-team/refs/plane/README.md`; no downloaded
image, mesh, texture or animation is included in the asset.

| Viewed reference | Source | Applied observation |
| --- | --- | --- |
| Fortnite Battle Bus | [Eurogamer image article](https://www.eurogamer.pl/fortnite-kiedy-powrot-na-mape-1-rozdzialu-nowy-sezon) | Bold color hierarchy, readable brackets and cable rigging; original aircraft silhouette retained. |
| Apex dropship | [Official Xbox Wire launch article](https://news.xbox.com/en-us/2019/02/04/play-apex-legends-xbox-one/) | Open jump doorway, structural ribs, seats and a clearly marked threshold. |
| PUBG transport plane | [Steam trailer still listed by SteamDB](https://steamdb.info/app/578080/screenshots/) | Transport proportions, repeated nacelles and window rhythm. Military palette rejected for this island. |
| DHC-6 Twin Otter, Phil Melia photograph | [ABPic photograph 1722516](https://abpic.co.uk/pictures/view/1722516) | High wing, twin props, braced wheels and side jump door. |
| Fortnite A Original glider | [Item image](https://4nite.site/pt/asa-delta/a-original) | Distinct cloth, structural parts, straps and hand controls. |
| Ram-air suspension diagram | [Official TAIC inquiry AO-2018-001](https://taic.org.nz/inquiry/ao-2018-001) | Lines converge into riser groups, with separate control toggles. |

The [PUBG parachute support page](https://support.pubg.com/hc/en-us/articles/115004171393-Parachute-System)
was read for control context. The [Sabre2](https://www.performancedesigns.com/sabre2)
and [Storm](https://www.performancedesigns.com/storm) product pages supplied a
nine-cell versus seven-cell comparison. The actual model is original geometry,
not a copy of either product. The official PUBG overhaul video page was found,
but playback was not reviewed and its maximum-size thumbnail returned 404.
Army Reserve cabin and GamerBraves chute image requests returned 403; Inven timed
out and Imgur returned 429. Those failed images are not claimed as viewed.

No concept generation or paid service was used. `aircraft.py` authors the forms,
paint, emblem and hardware. Blender's built-in Bfont is converted into lettering
geometry. Blender 5.0.1 runs with four threads; glTF Transform and Meshopt pack
the result. Reproduction is documented in `tools/blender/README.md`.

## Geometry, draw and download budget

The production GLB is 286,040 bytes (279.34 KiB), or 124,312 bytes (121.40 KiB)
with gzip level 9. It contains two source materials and zero image textures.
The previous assets were procedural code and had no separate model download.
The new asset is included in loading progress and awaited before avatars or
GPU upload. Missing, malformed and cancelled assets stay in the existing error
flow; no late model replacement or timed success fallback is introduced.

| Model | Before `b721224` | Near | Middle | Far |
| --- | ---: | ---: | ---: | ---: |
| Plane triangles | 4,844 | 24,760 | 11,684 | 3,360 |
| Plane color draws | 31 | 4 | 4 | 4 |
| One canopy triangles | 672 | 3,928 | 2,644 | 1,668 |
| One canopy color draws | 10, including 8 line objects | 2 | 2 | 2 |

Draws in the table count the model's color pass; shadow passes add their own
draws. Plane LOD distances are 0/70/155 m; canopy distances are 0/24/60 m, both
with 12% hysteresis. Plane build ceilings are 42k/18k/7k triangles and canopy
ceilings 6.5k/3.5k/1.8k. The build also checks a 1 MiB raw / 450 KiB gzip ceiling.

Owned geometry buffer bytes across all LODs increase from 169,008 to 759,624 for
one plane and from 1,344,512 to 2,315,264 for sixteen canopies. These are unique
typed-array backing buffer bytes in the instances, not a claim about driver
allocation. Source geometry is cached once. Instances own their cloned geometry
and materials to match the existing avatar disposal contract. There are no new
texture allocations. Visible sixteen-canopy draws decrease from 160 to 32.

## Paired cost measurement

The parent authorized alternating measurement under general workstation load.
No team-wide quiet period was requested. One Chrome 150.0.7871.186 process used
`--use-gl=angle --use-angle=gl-egl`, AMD Radeon RX 9060 XT via ANGLE/radeonsi,
Ryzen 7 5700X, 1470x956 CSS pixels, DPR 2, Medium at its full 1.25 render density,
and CDP 4x CPU throttling. Every case warmed both variants in the same page and
rendered five rounds of twenty before/after pairs, alternating AB and BA order.
The complete world and post pipeline were present. Each frame ended with
`gl.finish`; these are serialized rendering wall costs, not sustained game FPS.

| Scene | Before median / p90 ms | After median / p90 ms | Median paired difference |
| --- | ---: | ---: | ---: |
| Plane, near camera | 12.3 / 22.9 | 11.4 / 21.1 | -0.8 ms |
| Sixteen canopies, forced near LOD | 18.6 / 20.4 | 16.0 / 17.8 | -2.5 ms |
| Sixteen canopies, native distance LOD | 17.9 / 20.5 | 15.6 / 18.6 | -2.2 ms |

The forced-near case draws 62,848 canopy triangles instead of 10,752; the native
distance layout draws 34,496 instead of 10,752. Both still use 32 instead of 160
color draws. The measured trade accepts more geometry while removing many object
and line submissions. All three paired medians improve in this run.

The one-minute host load average fell from 21.84 to 18.22 during the run, with
about 8.8 to 9.0 GB free RAM. This explicitly limits absolute timings and hardware
generalization; the results do not certify 60 FPS on M2 or replace the integrated
live-game performance gate. A preliminary run was interrupted by Vite HMR after
a source edit and was discarded. Only the complete rerun is reported.
Raw samples, per-round load, geometry counts and hardware metadata are in
[interleaved-cost.json](evidence/codex-plane/interleaved-cost.json).

## Verification and evidence

- `npx tsc --noEmit`: passed.
- Full `npx vitest run --maxWorkers=4`: 124 files, 1,159 tests passed.
- `npm run build`: passed; existing large-chunk warning remains.
- Six aircraft tests verify full-scale decoded bounds, stable propeller references,
  all LOD budgets, empty doorways and solid cabin floors, canopy front/back visibility,
  independent cosmetic resources and disposal of cancelled loads. They were rerun
  after the final material-validation guard, and passed.
- Real input drove BR from plane to falling to parachute with twenty bots. Both
  before and after runs reached the three stages with no browser page errors.
  No snapshot, physics, health or camera override was used for those live captures.
  Each match had a random route, so live images are visual checks, not pixel-matched
  or performance comparisons. [Live records](evidence/codex-plane/live-cameras.json).
- Fixed review cameras use the actual world, lighting, capybara and post pipeline.
  The before model is the exact aircraft module from `b721224`; the surrounding
  renderer is the same branch as the after capture. Native images are 1470x956,
  with DPR 2 and Medium density 1.25. Full images were inspected, including cabin,
  cockpit, jump door, underside, rear, close controls and under-canopy views.
- Integrated multiplayer/browser gates and the target hardware performance gate
  remain the root agent's responsibility after cherry-pick. This report does not
  claim those integrated gates have already run.

The seven boards are also 1470x956; each contains four half-size panels. Native
captures remain beside them for full-size inspection:

1. [Front and side](evidence/codex-plane/board-01-exterior.jpg)
2. [Rear and underside](evidence/codex-plane/board-02-rear-ground.jpg)
3. [Cabin and cockpit](evidence/codex-plane/board-03-cabin.jpg)
4. [Jump door and canopy front](evidence/codex-plane/board-04-door-canopy.jpg)
5. [Canopy rear and paw controls](evidence/codex-plane/board-05-canopy-rig.jpg)
6. [Under canopy and live parachute camera](evidence/codex-plane/board-06-eye-live.jpg)
7. [Live plane and falling cameras](evidence/codex-plane/board-07-live-transition.jpg)

Review scripts close their browser in `finally`. Development server port 5198
is stopped when this branch is handed off; no Blender worker remains running.
