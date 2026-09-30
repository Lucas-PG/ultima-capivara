# Combat feel and VFX pass (branch combat-vfx)

Goal: make shooting, moving and hitting feel good and read clearly, to a commercial stylized standard, without new load. Research with sources is in `docs/overhaul/combat-research.md`; this report records what changed, why, the numbers and the evidence.

## 1. What was wrong (measured before any change)

- **Every own-shot cue waited for the host.** Muzzle flash, viewmodel kick, recoil, gun sound, tracer and impact were all played when the host's `shot` event arrived. In practice mode that is the worker's 20 Hz publish: measured 16 to 99 ms after the click (p50 30 ms, p90 48 ms, 127 rounds, `__capivara.shotTimes()`). A network guest adds half a round trip on top.
- **The M4 won everywhere.** 26 damage at 720 rpm with 2x headshots and no falloff to 45 m: 0.25 s to kill a fresh capybara with body shots, 83 ms with two headshots, faster than the SMG at 5 m (0.42 s). Held automatics also fired slower than listed, because each interval was rounded up to whole 60 Hz ticks (650 rpm became 600).
- **No handling.** Swapping was instant (and a sniper could skip its bolt by swapping away and back), you could fire at full speed out of a sprint, every gun moved at the same speed, spread was a square (corners outside the crosshair), recoil was a constant climb with alternating yaw, and releasing the trigger dragged the view back down by the whole kick even when the player had already pulled down (so aim ended below the target).
- **VFX too small and too generic.** One four-point star for every gun's muzzle flash, stone impacts about 15 px at 7 m that faded in 0.4 s, a coconut blast smaller than its own 4.2 m damage radius, pale enemy tracers even when they passed your head, bullet marks gone after 4 s. Several review poses in `tools/vfx/scenarios.mjs` no longer matched the rebuilt island.
- No camera feedback beyond a trace of viewmodel roll; no low-health treatment in the world image.

Evidence: `docs/overhaul/evidence/combat/before-fp-m4-strip.jpg` (old flash strip).

## 2. Balance (src/shared/weapons.ts)

Design: 100 HP plus up to 100 armour plus a 60 point helmet. Body time to kill in the 0.4 to 0.6 s band for automatics (tracking and cover decide fights, you have time to react), about double with armour; headshots 1.5x on automatics, 1.8 to 2.5x on precision guns (the capybara head sphere is large, 0.29 m, so 2x on automatics turned every spray into a coin flip). Each gun owns a range: SMG up close, M4 mid, DMR long, shotgun point blank, sniper anywhere with a headshot. Numbers are ideal hits from `scripts/balance-trials.ts` (armour column: 50 vest plus 60 helmet).

| Gun | Damage | RPM | Head | Falloff (full to, zero-taper at, floor) | Body TTK bare / armour | Head TTK bare |
|---|---|---|---|---|---|---|
| Pistol | 22 | 400 | 1.8 | 20 to 60 m, 0.7 | 0.60 / 0.90 s (5 / 7 shots) | 0.30 s (3) |
| Revolver | 42 | 170 | 2.3 | 30 to 90 m, 0.75 | 0.71 / 1.06 s (3 / 4) | 0.35 s (2, head plus body) |
| SMG | 15 | 900 | 1.5 | 12 to 35 m, 0.6 | 0.40 / 0.60 s at 5 m; 0.60 s at 30 m | 0.27 s (5) |
| M4 | 18 | 650 | 1.6 | 35 to 110 m, 0.75 | 0.46 / 0.74 s to 30 m; 0.55 s at 60 m | 0.28 s (4) |
| Doze (8 pellets) | 11 | 75 | 1.5 | 6 to 30 m, 0.25 | 0.8 s (2) at 5 m | one shot point blank |
| Carabina (DMR) | 40 | 240 | 2 | 80 to 190 m, 0.85 | 0.50 / 0.75 s (3 / 4) | 0.25 s (2) |
| Sniper | 90 | 50 | 2.5 | none | 1.2 s (2) | one shot anywhere |
| Lança-coco | 90 direct, 0.85x splash over 4.2 m | 60 | - | - | two direct hits | - |
| Facão | 45 | 120 | 1.4 | melee 2.4 m | three swings, two with a head | - |

- Old versus new M4: 0.25 s to 0.46 s body. The SMG now beats it at 5 m (0.40 s) and loses past 15 m; the DMR out-trades it past 80 m.
- No common gun one-shots a fresh capybara with a body shot; only the sniper (any range) and the Doze (point blank) kill with one headshot; the revolver needs a head plus a body shot.
- Pistol reload stays 1.8 s and every other reload is unchanged, so the gun agents' authored reload timing still fits.
- Bot threat was checked with the seeded `scripts/bot-trials.ts` against a snapshot of the base commit: battle royale first 30 s mean damage to a looting human 42 (base) vs 33 (now), deaths 2/8 vs 1/8; Correria about the same. Bots keep their own aim cone and damage scale; the difference is within seed noise, so their tuning multipliers were left alone.

**Handling (`HANDLING`)**: draw time (pistol 0.26 s to sniper 0.40 s), sprint-out before the first shot (0.10 to 0.24 s; the facão swings straight out of a run), move factor (facão 1.08, pistol and SMG 1.0, M4 0.96, sniper 0.9) and aimed walking speed as a fraction of the walk (SMG 0.72 to sniper 0.45; the old flat value was 0.62).

**Spread (`SPREAD`, `shotSpread`, `spreadOffset`)**: a disc bounded by the crosshair, centre weighted (half the rounds inside half the radius). Per gun: movement cost (SMG least, sniper most), airborne cost, bloom per heat unit and heat per shot; heat cools 2.4/s, so a paced semi-automatic (twice its cadence) stays on its listed accuracy and a spray opens slowly (M4 gains +0.08 heat per round net). Crouched and still: 15% tighter hip cone. The Doze fires a fixed ring of 7 pellets around a centre pellet, turned per shot: consistent reach (Fortnite and Valorant moved to fixed patterns for the same reason).

**Recoil (`RECOIL`, `recoilKick`)**: automatics climb for their first rounds (M4 six, SMG five), then ease to 35 to 45% while the view sways sideways on a fixed sine pattern with a small random jitter: learnable, not random. Semi-automatics kick once per shot with jitter. Aimed fire scales it to 70 to 80%. In `src/input.ts`, mouse movement against the kick pays it off, so the recovery after release only returns what the player did not compensate (test: pulling down exactly the kick leaves the aim on target after recovery). The burst index resets after 250 ms without firing.

## 3. Host rules (src/simulation/index.ts, src/shared/collision.ts)

- Exact cadence: a held trigger schedules the next round from when the previous one was due, not from the tick that fired it (test: 22 to 23 rounds in 2 s at 650 rpm instead of 20).
- Swaps: a newly held gun fires after its draw, and never before its own cycle (bolt, pump) is done, because `readyAt` is kept per weapon (test: sniper, swap to pistol and back, still waits the 1.2 s bolt). Bot swaps take the same draw.
- Sprint: pulling the trigger ends a sprint (`moveActor`), the first round waits for the sprint-out, and a semi-automatic click that lands during it is held up to 0.35 s and fires with the view's current aim. The client holds its own sprint off for 320 ms after a trigger pull (`SPRINT_HOLD_MS`), so prediction and host agree.
- Quick melee: new action `melee` swings the facão at once without selecting it (even from a sprint), returns to the held gun after the swing, and that gun then takes its draw time. The swing keeps the facão's own cadence.
- Coyote time: a jump within about 0.1 s of walking off an edge still counts; a new `jumping` flag (airborne from a jump or bounce) rules out a second jump at the apex.
- Deterministic spread: human rounds draw their cone offset from `shotSeed(match, shooter, shot number)`; bots keep the legacy aim cone. Snapshots carry `shotSeq` and the `jumping` flag; shot events carry `seq`. Protocol 11 to 12.
- Shared geometry moved to `src/shared/ballistics.ts` (`shotOrigin`, `pelletDirection`, `rayCapybara`), used by both the host and the client prediction.

## 4. Own-shot prediction (src/fire-prediction.ts, src/main.ts)

`FirePredictor` mirrors the host's gating (alive, grounded, not using an item or emoting, cadence, draw timed from the swap key, sprint-out with the held click, reload with the Doze exception, ammo minus rounds still in flight, one round per click) and draws the same seeded pellets, then raycasts the world and the rendered remote capybaras. The predicted `shot` event goes to the renderer, audio, HUD crosshair bloom and recoil on the input frame (the click itself for a press, the 60 Hz input tick for a held automatic). When the host's event for that `seq` arrives it is skipped, except that its confirmed hit pairs the hit star with the host's endpoint. Hit markers, damage numbers and kill cues stay host confirmed (Valorant's split: shooter cues local, facts about the enemy from the authority). Swaps show at once through a slot intent in `LocalPresentation`.

Measured in a live practice match (medium, M2, loaded machine): 127 rounds predicted, the host's confirmation arrived p50 30 ms and p90 48 ms later, so that much latency is gone from every shot's feedback; 1 round of 128 was shown late instead (a burst edge where the input clock jittered). The new multiplayer e2e (`tests/network-game.e2e.spec.ts`, real PeerJS guest and host) checks that each of a guest's rounds was shown locally first and confirmed exactly once, and the host's ammo matches.

Fairness: aim was already client authoritative (the host trusts the reported view), so a client that knows the spread seed gains nothing an aim assist does not already give; the host still decides every hit, the 200 ms rewind cap is unchanged, and the seed cannot be chosen by the client. Recorded as a known tradeoff below.

## 5. Controls (src/controls.ts, src/input.ts, src/settings.ts)

Interface for the UI agent's settings screen:

- `CONTROL_ACTIONS` (id, Portuguese label, group, default) is the single action list; `DEFAULT_BINDINGS` and `BINDABLE_CODE` are derived from it and re-exported by `settings.ts` as before.
- `rebind(bindings, action, code)`: binds and swaps with the action that held the code (one key never triggers two actions).
- `sanitizeBindings(saved)`: save validation, unknown new actions keep their default only if the key is free.
- `CONTROL_OPTIONS` and `DEFAULT_CONTROL_OPTIONS`: `adsToggle`, `crouchToggle`, `sprintToggle`, `invertY` (booleans) and `adsSensitivity`, `scopeSensitivity` (0.3 to 2), `cameraShake` (0 to 1), each with a label, help text and range; `sanitizeControlOptions` validates saves. All are `Settings` fields now.
- New default keys: V quick melee (`melee`), X previous weapon (`lastWeapon`). Existing: Q/E lean, C crouch, Shift sprint, F interact, G drop, R reload, I inspect, 1 to 4 boxes, 5 to 9 items, B emote wheel, M map, Tab scoreboard.
- Sensitivity: the existing FOV-relative scaling stays, and the aimed or scoped multiplier is blended in by how far the gun is raised (`setAimFov(fov, ads, scoped)`).
- Toggle sprint ends on firing, aiming, crouching or stopping; toggle crouch cancels a toggled sprint.

## 6. Camera and screen feedback (src/render/combat-camera.ts, toon.ts)

Presentation only (aim never moves, so the crosshair stays true): a spring kick and FOV punch per gun on each own round (pistol about 0.1 degrees and 0.7%, sniper about 0.5 degrees and 3%, aimed fire 40% less), a damage flinch that tips the view away from the attacker's side, trauma-squared smooth shake near coconut blasts (strong within 16 m), and a short zoom pop on your elimination. Scaled by `cameraShake`; reduced motion keeps a quarter. Under 30 HP the post pass drains colour and darkens the edges (strongest near zero), under the HUD's existing low-health vignette and the audio's heartbeat. The machete keeps its existing hit stop; guns get none (research: never on guns).

## 7. VFX (src/render/effects.ts, effects-atlas.ts)

New painted cells, generated with Codex image generation on flat magenta and keyed into the empty half of the existing flipbook atlas by `tools/vfx/add-flipbook-cells.mjs` (source `docs/art/vfx/combat-sheet-a.png`, provenance in `docs/assets.md`): side-view flames for pistol, revolver, SMG, rifle, DMR, sniper and shotgun, two front bursts, smoke wisp, air puff, hit spark, water crown, sand plume, two coconut husks, blast cloud, metal spark fan (`evidence/combat/flipbook-atlas.jpg`).

- **Muzzle flashes**: a front burst plus that gun's flame laid along the barrel, 2 to 4 frames, a warm smoke puff in third person and a light barrel wisp in first person (every round for semi-automatics, every fifth for automatics). First-person flames stay short toward the aim point so they never cover the target (`body-hit-8m.jpg`); aimed bursts grow per gun until their petals frame the sights while the gun still hides the hot centre and the aim point (`ads-flash-framing.jpg`, SMG and M4 verified with depth probes). Enemy flashes have a 28 px floor so a shooter reads at range. `fp-flashes-a.jpg`, `fp-flashes-b.jpg`.
- **Tracers**: enemy rounds a quarter thicker with a 1.8 px floor, red with a pink core when they pass within 2.5 m of your head (`enemy-fire-hostile-tracer.jpg`); the sniper's streak lives longer.
- **Impacts**: a sharp 3-frame flash (sparks on metal), a popping burst twice the old size, a slower haze that outlives it, flying bits, and marks that last 5, 10 or 16 s (Low, Medium, High) in a 160-mark pool. Sand gets the painted plume, earth a darker plume, water a crown with drops and a ring. Bursts are capped on screen (80 to 90 px) so a point-blank wall hit never paints over the view (found in a live match). `impacts-a.jpg`, `impacts-b.jpg`.
- **Hits on capybaras**: a 2-frame ivory and coral spark exactly at the confirmed hit, then the existing pow, fur tufts and headshot star.
- **Coconut**: the round in flight is the painted husk with a cream launch puff; the burst is a white core, painted blast clouds sized to the splash radius, nine bouncing husk chunks, a shockwave ring racing out to 1.5x the splash radius, a dust ring and lingering smoke, then a scorch (`coco-blast-6m-strip.jpg`), plus the camera shake.
- **Storm**: violet wisps drift up along the wall within 45 m of the viewer (about 11 a second, 5 on Low) so the edge reads as a moving curtain (`storm-edge-wisps.jpg`).
- **Parachute landing**: a dust ring when a capybara touches down from the chute.
- Existing pickup, chest, heal, armour and supply effects were reviewed in the lab and kept.
- Counts scale by preset (Low 0.5x, Medium 1x, High 1.35x); everything stays in the existing pooled card, decal, tracer and casing systems (no new draw calls or materials).

**Cost** (VFX lab, 8 bots each firing 12 rounds a second at nearby surfaces, GPU-synced frame time, 1280x720): Medium p50 9.2 ms and p95 13.7 ms against 8.8 / 11.9 idle, plus six simultaneous coconut blasts p50 9.2 / p95 14.5 ms; 110 draw calls at the peak (+2). Low and High are within 0.5 ms of Medium. Live practice match (medium): p50 16.7 ms, p99 16.8 ms, 141 to 160 draw calls, 1.25 to 1.50 M triangles, no long tasks. Atlas: 149 KB to 470 KB (still one 1024x512 texture).

## 8. Verification

- `npx tsc --noEmit` clean. `npx vitest run`: 104 files, 874 tests pass (was 853); new: `tests/balance.test.ts` (roles, readable TTK, headshot rewards, handling, spread), `tests/combat-handling.test.ts` (exact cadence, draw and bolt across swaps, sprint-out with a held click, quick melee, seeded pellets match the client, coyote jump and no apex double jump), `tests/fire-prediction.test.ts` (same rounds, order and impact points as the host for a held M4; nothing predicted during draw, sprint or dry; each host event skipped once), `tests/combat-camera.test.ts` (small peaks, fast settle, off and reduced), new input tests (pattern, compensation, sprint hold, toggles, sensitivity multipliers), codec round trip of `shotSeq`.
- Playwright e2e in real Chrome (`tests/network-game.e2e.spec.ts`, chromium): the three existing multiplayer tests pass on protocol 12, plus the new guest prediction test.
- VFX lab frame strips at gameplay framing for every gun hip and aimed, seven surfaces, blasts at 6 and 14 m, enemy fire, body and head hits, chest, heal, storm (new `c-*` scenarios in `tools/vfx/scenarios.mjs`; `tools/vfx/capture.mjs` takes `BASE`).
- Live practice matches with bots through `tools/qa/play.mjs` (new `defend` step: stand, track the nearest bot, fire), with video; frame sequences extracted with ffmpeg.

## 9. Outside my files (one-line hooks) and notes for other agents

- `src/ui/tips.ts`: the tip said M4 headshots do double damage; now it names the Carabina (still true, and enforced by `tests/ui.test.ts`).
- `src/ui/hud-logic.ts`: labels and group entries for the two new actions (`melee`, `lastWeapon`), required by the existing label test. **Conflict to clean (UI agent):** `BINDING_LABELS`, `BINDING_GROUPS` and `remapBinding` there duplicate `CONTROL_ACTIONS` and `rebind` in `src/controls.ts`; the controls model should be the source.
- **UI agent**: `src/ui/crosshair.ts` passes `settings.fov` (horizontal degrees since A4) as if it were vertical, and keeps its own zoom table; use `verticalFov()` and `ADS_ZOOM` from `src/shared/weapons.ts` so the crosshair gap matches the real cone. It can also pass `crouch` to `shotSpread`. The settings screen should expose `CONTROL_OPTIONS`.
- **Gun and viewmodel agents** (no changes made to their files): the host now holds a swapped-in gun for `HANDLING[id].draw` (0.26 to 0.40 s) while the viewmodel's draw is a fixed 0.13 s holster plus 0.3 s draw; scaling the draw animation to `HANDLING.draw` would make the gun look ready exactly when it can fire. Quick melee snaps the facão in through `WeaponView.shot('machete')` and returns through a normal swap; a dedicated quick-melee swing that keeps the gun in the other paw would read better. The sprint-out (0.10 to 0.24 s) would benefit from a matching sprint-to-hip blend time per gun.

## 10. Decisions

- Kept the hitscan and projectile model, the armour model (vest absorbs everything, helmet 40% of head damage) and bot aim; changed numbers, gating and presentation.
- Deterministic spread instead of host-only randomness: without it, predicted tracers and impacts would land where the host's rounds do not. Tradeoff recorded above.
- No slide or mantle: a slide needs a third-person pose from the character rebuild and adds a movement state to predict for every client, and lean (Q/E) already covers corner play; mantle needs ledge detection the bots cannot use. Revisit after the character rebuild.
- No dynamic muzzle lights: an always-present extra point light costs a light in every lit shader; the painted burst and the viewmodel's existing flash light carry it.

## 11. Known issues

- One round in about a hundred at the edge of a held burst can still show late (the host fired one the client's jittery input clock did not), never twice.
- Scoped DMR and sniper shots show no flash inside the scope overlay (the overlay replaces the first-person scene).
- Some older lab scenarios (`impact-*`, `chest-open`, `pickup-rarity`, `storm-*` names without `c-`) use poses from before the world rebuild and frame the wrong things; the `c-*` ones replace them.
- Heal and armour effects were kept as they were; at 10 m they are small.
- No listening test of the audio with prediction: the predicted own gunshot uses the same audio path the host event used.
