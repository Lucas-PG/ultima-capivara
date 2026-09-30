# Bots and graphics report

Branch `bots-graphics`, base 1a5a004. Taken over from a stopped Codex agent (commits 41f111c and 70624ed, plus uncommitted tooling and a lighting draft). Its navigation, recovery, peeking and storm-rotation work was reviewed and kept; its tooling was committed; its lighting draft was replaced by the pass below after renders showed it drained the warmth and saturation.

Evidence: `docs/overhaul/evidence/bots-graphics/` (before/after montages per camera, lighting metrics, match and duel audits).

## 1. Bots

### What changed and why

| Problem found (audit, trace or live match) | Change |
| --- | --- |
| Walled yards, garden gates and stilt-house decks were islands in the 4 m route graph (26 components). A bot that walked in through a 1 m gate could never plan its way out, and fanned side-step probes wiggled it on the gate posts. | `bridgeComponents` joins each small island to another component through one lattice point that walks cleanly to both (26 to 13 islands; the rest need a jump or are sealed). A clear straight walk no longer triggers side-steps. |
| Bots could land, roam or drop off roofs into places off the island-wide network. | Landings, roam goals and roof drops require `onMainNetwork`; the jittered landing is checked too. |
| Bots aimed at a target's exact current position, so strafing barely mattered (Normal SMG, 10 m: 95% hits standing, 86% strafing). | Each bot reads its target's velocity with a lag (0.28 / 0.21 / 0.15 s by difficulty, elites 25% faster). A steady circle-strafe is tracked; every reversal is aimed where the target was heading. |
| Every bot fought, chased and rotated the same way. | Three play styles from their own random stream: **rusher** (close range, long chase, rides the storm edge, hops), **anchor** (long range, hides earlier, watches a lost sighting crouched instead of chasing, rotates early), **flanker** (swings 9 m wide around a sighting). |
| Walking bots stared down their path. | Idle glances down the most open side street every 2.5 to 5.5 s; sight follows the glance, so a glance can spot a flanker. |
| A bot sniped from beyond its sight walked toward the shooter in the open. | It takes cover from the shot's origin and peeks toward it (healthy rushers charge instead). Investigating a gunshot, anchors and flankers creep the last 16 m crouched. |
| A bot knocked off a laje's outside stair pressed into the tread above its head for 136 s (seed 4). | The stair journey ends when the next point is over 1 m up and the bot is on no floor; any precise stair steering without progress for 3 s is replanned. |
| Two bots peeked the same corners at each other for 25 s in an endgame. | A healthy bot leaves a cover spot after 9 s (times the style's hold) and pushes. |

Kept from the previous agent: capsule-accurate walkable segments, deck routes in the graph, dry-route preference with swim cost, measured recovery walks, safe roof drops, peek-and-tuck from cover, retreat below 35 hp without heals, and storm rotation overriding visible fights.

### Measurements

`npx tsx scripts/bot-match-audit.ts <out> 8 normal`: 8 seeds per mode, 21 bots in royale, 8 in deathmatch, full matches at 60 Hz. Base is 1a5a004 run with the same tool.

| Normal | Base BR | After BR | Base DM | After DM |
| --- | --- | --- | --- | --- |
| Stuck s per bot-minute | 2.22 | 0.70 | 2.70 | 0.54 |
| Longest stuck (s) | 46 | 6 | 16 | 3 |
| Time swimming | 4.8% | 1.0% | 9.7% | 0.6% |
| Time outside the storm | 4.7% | 0.2% | n/a | n/a |
| Storm deaths (8 matches) | 23 | 0 | n/a | n/a |
| Deaths in water / by fall | 16 / 0 | 2 / 0 | 67 / 0 | 1 / 0 |
| Engagements per match | 58 | 71 | 144 | 142 |
| Pickups per match | 66 | 66 | 17 | 17 |
| Combat kills per match | 17 | 20 | 75 | 73 |
| Time in cover (incl. moving, peeking) | 11% | 22% | 7% | 27% |
| Worst simulation tick p99 (ms) | 10.8 | 9.2 | 5.7 | 3.3 |

Easy and Hard (3 seeds each) stay under 0.6 stuck s per bot-minute, longest 4 s, no storm or fall deaths (`bots-after-easy.json`, `bots-after-hard.json`).

Fairness against a human: `npx tsx scripts/bot-duel-audit.ts 8 <out>`, one bot against an invulnerable player on open ground, 8 seeds; tell = time to first shot, hits = hit rate, TTK = seconds to deal 100 damage while the player strafes (12 s cap). Before / after:

| Difficulty | Gun | Range | Tell (s) | Hits, still | Hits, strafing | TTK, strafing |
| --- | --- | --- | --- | --- | --- | --- |
| easy | smg | 10 m | 0.79 / 0.77 | 0.90 / 0.94 | 0.79 / 0.35 | 6.8 / 11.5 |
| easy | m4 | 20 m | 0.84 / 0.82 | 0.70 / 0.69 | 0.50 / 0.27 | 7.7 / 11.9 |
| normal | smg | 10 m | 0.54 / 0.52 | 0.95 / 0.95 | 0.86 / 0.63 | 3.2 / 4.4 |
| normal | m4 | 20 m | 0.59 / 0.57 | 0.66 / 0.67 | 0.55 / 0.42 | 4.0 / 6.7 |
| hard | smg | 10 m | 0.47 / 0.47 | 0.99 / 0.98 | 0.88 / 0.74 | 2.2 / 3.0 |
| hard | m4 | 20 m | 0.48 / 0.47 | 0.71 / 0.79 | 0.57 / 0.55 | 3.0 / 3.6 |

Standing still is punished as before; strafing is now a real counter on Easy and Normal while Hard stays dangerous. For reference, a player landing 40% of shots kills a 100 hp bot in about 1.1 s (SMG) to 1.3 s (M4).

Live: a full royale spectated through `tools/qa/play.mjs` (244 s, 204 samples at 1 Hz, worker clock): bots still (under 0.3 m/s) 15% of samples, swimming 0.6%, longest still 18 s; winner with 5 kills. A first royale was cut short by a dev-server reload.

### Tests

`tests/bot-island-navigation.test.ts` (garden gate walk-out; yards joined, sealed garden excluded, landings on the network), `tests/bots.test.ts` (circle-strafe tracked but reversals thrown, scaled by difficulty; healthy bot leaves a cover spot), `tests/bot-styles.test.ts` (styles mixed and seeded; rusher closes while anchor keeps range; anchor watches, rusher pushes; glances while still arriving; creeping on a gunshot; cover from an unseen sniper), `tests/bot-building-routes.test.ts` (journey released after being knocked off a flight). Each new test fails with its fix reverted. The celebration test now samples past its 9 s window, since a gesture may legitimately start late in it.

## 2. Graphics

### What changed and why

The day read sepia: sky horizon, fog and shadows were one warm beige (`#DBC2AE`), distant hills pinkish, clouds sunset orange under a noon sun. The reference (`wide-aim-reference.jpg`) has a saturated blue sky, a cool pale haze over distant hills, warm sunlight and cool shadows.

- **Haze (`src/render/haze.ts`)**: one aerial-perspective model for every fogged material (ShaderChunk fog) and the sky dome. Euclidean distance (no thinning at screen edges), clear for the first 40 m where duels happen, quadratic rise to 92% at 520 m so far islands keep a silhouette. The cool haze warms toward the sun, and the sky horizon uses the same function, so distant geometry dissolves into the matching part of the sky. The runtime fog range was also being overwritten every frame (110 to 460 m); it now uses the same constants.
- **Sky**: deep blue zenith to light blue, haze band at the horizon, sun disc on the real light direction (was a hard-coded mismatch), smaller halo. The painted sunset cloud atlas is lifted to daylight cream tops and soft blue-grey bases in the shader.
- **Light and grade**: warm key (`#FFDDA6`), cool sky fill, warm ground bounce; the shadow tint follows the new sun colour. Post grade after tone mapping: gentle S-curve, cool lifted shadows, warm highlights, vibrance weighted to muted colours. Same grade on every preset.
- **Water**: turquoise over sand, lagoon teal, ocean blue offshore; sky reflection and horizon take the sky and haze colours.
- **Low preset**: gains a 1024 sun shadow over 22 m. Without shadows or AO, carts, crates and players floated on flat ground. Medium and High keep contact AO, bloom and sun shafts.
- Kept from the previous agent's draft: sun disc on the light direction, softer shallow caustics and shore foam, sparser glints.

Before/after from identical cameras, all presets: `compare-{plaza,stair,vista,street,river,engenho,palafitas,sun}.jpg`. Player readability at 20, 40 and 60 m on Rua Direita: `compare-range-20-40-60m.jpg` (the capybara reads darker against a cooler street and sky; no haze inside 40 m).

### Performance

`tools/qa/lighting-review.mjs` (1280x720, Apple M2, Chrome ANGLE Metal): rAF p95 stays 16.7 to 16.8 ms on all 8 views and 3 presets before and after (no dropped vsync frames). New `__capyQA.bench()` reads GPU time with timer queries; mean over the 8 views, A/B/A runs on a machine shared with other agents (about plus or minus 1.5 ms noise):

| Preset | GPU before (ms) | GPU after (ms) | Draws before / after | Triangles (plaza) before / after |
| --- | --- | --- | --- | --- |
| Low | 3.7 | 4.4 to 5.2 | 74 / 90 | 0.83M / 1.29M |
| Medium | 8.6 | 7.9 to 8.7 | unchanged | unchanged |
| High | 8.2 | 8.1 to 10.2 | unchanged | unchanged |

Low's shadow pass is the only real cost (about 1.4 ms GPU, +16 draws); Low stays the cheapest preset. Haze and grade cost is below the noise.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: 108 files, 941 tests passed (the vegetation determinism test timed out once under machine load and passes alone, as recorded before).
- Renders judged at gameplay framing from 10 cameras and 3 presets, plus live spectator frames.

## Known issues

- World (not changed, outside scope): the garden behind the Rua do Sul row houses near (6, 68) is fully walled with no gate; a human who lands there is trapped. Bots no longer land there. Loot near the Palafitas moved slightly (two items) because the route graph now reaches more of the decks; world placement tests pass.
- Live frame-time numbers could not be measured cleanly: another agent's Chrome match and bakes kept the load average near 19, and a live deathmatch spectate timed out while loading. The controlled GPU measurements above stand in.
- Bots still sometimes swim under the Palafitas decks, and vegetation has no collision (pre-existing), so bots walk through bushes.
- Cover time is higher than before (22 to 27%, including moving and peeking); kills and engagements per match held or rose, so pacing is kept, but it is worth a human playtest.
