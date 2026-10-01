# Review log

## Vegetation (worktree-agent-a79a28e80df904562, 27 commits, report docs/overhaul/vegetation-report.md) - 14:25
- Independent captures, 10 world poses, before (main ccae3e1) vs after, 1280x720 medium: draws down everywhere (plaza 241->176, river 309->224, vilaStreet 269->192, bathMangue 449->306), tris down 5-25%.
- Visual: PASS. Bougainvillea on posts and walls, flower beds replace green blob planters, painted coconut fronds, real lawn and meadow grass, flowering ipe/flamboyant, mangrove prop roots, trunk shadows back.
- Watch on the merged world: close crown overhang on the Morro roof path; uniform bright lawn in open fields; mangrove bath got darker; farm soil strips cross a road (structure); dead SOFT_LANDSCAPE in kit.ts; trees have no collision (pre-existing).
- Merge after the structure branch; re-run veg perf and sightline checks on the merged world.

## References (Codex xhigh) - 15:25
- Agent self-report is honest: rifle board FAIL after 5 attempts (support placement differs between panels, cropping, layout), most weapon boards PARTIAL, character turnaround PARTIAL (feet four-clawed in places), character head, HUD mockup, VFX sheet PASS; new weapon 2 and 3 sheets corrected.
- My check of rifle/pistol/shotgun/sniper boards: no longer backwards; usable for framing, presentation and reload sequencing, not as anatomy truth. Anatomy follows the rig + checklist in the gun briefs.
- Committed as JPG (40 files, 12 MB) in 5bb45b6; PNG masters and 237 MB of attempts ignored.

## Long guns (Codex, guns-long, round 1) - 20:55
- Budgets PASS (all under 25k tris and 1.3 MB). Models and liveries PASS (match the design sheets). Paw contact at hip PASS (worst gap >= 0.2 mm, ten paws).
- FAIL: support grip on all five is the rejected fingers-up flat side grip (digit angles confirm); firing paw not visible from the eye at hip; Lanca-coco ADS blocked by the hopper. Sent back with measurable targets (thumb tip 60-110 deg along the top pointing forward, finger tips 250-340 deg under), evidence required per gun.

## World polish (Claude Opus, world-polish, 15 commits) - 22:10
- Nine follow-ups done; tsc clean, vitest 828/828 (agent); wide views at most 166 draws and 1.55M tris (medium).
- Independent captures: retargeted poses PASS (Vila street, north quay, fazenda veranda, Morro roofs are real gameplay views); Engenho and Palafitas street dressing PASS.
- Open: loot reads as flat navy boards at eye level (check with the gun merge and the world-arsenal atlas); no clinic building for the room-clinic QA view; arena spawns may have shifted with the larger nav graph (spawn clearance tests pass).

## Audio (Claude Opus, audio-pass, 9 commits) - 00:05
- Agent measured the real Chrome output: the always-on hiss was three fixed 2 s white-noise loops (-54.7 dBFS over six octaves); replaced by modulated, place-based ambience (floor -67.4 dBFS, 29-45 dB movement). Own shots 18+ dB above own steps; remote shot 10+ dB above a sprinting step; steps under 13% energy below 200 Hz vs 30-62% for guns; steps stop within 120 ms vs 0.3-2.4 s gun tails. All sounds procedural (old MP3s removed). Tests fail on a replica of the old hiss.
- My checks: tsc clean, 51 audio tests pass, no leftover MP3 references, scope contained (src/sound/*, small ui/main/settings hooks). Merged (subjective sound quality still needs a human audition: tools/audio/lab.html).
- Open: no supply-plane flyby; remote gun fired toward you has no distinct cue; saved settings keep the old 0.25 music level; no per-enemy threat scoring.

## UI, spectator, HUD, menus (Claude Opus, ui-spectator, 15 commits) - 00:40
- Spectator root causes found and fixed: pointer unlock dropped rendering to 10 fps; camera stepped at 20 Hz on raw snapshots; camera inside the watched head; no target info; forward-only cycling. Now smoothed over-the-shoulder follow with wall pull-in, killer follow, two-way switching over an arc, watch bar; two real clients: camera moves in 174 of 180 frames (was frozen in 120).
- Merged with the audio pass (one main.ts conflict: kept the audio uiSound hook and the two-way spectate step). Integrated tests 881/881.
- My captures: HUD matches the mockup (compass, minimap and match strip, portrait vitals, weapon strip, ammo) and reads well; main menu at a commercial level (key art, illustrated mode cards). Evidence frames: over-the-shoulder follow and death card PASS; one two-client frame has the watched player off-shot (motion metrics cover it).
- Open: visual snapshot baselines need re-approval; no first-person spectate option; bushes can fill the spectator view briefly (trees and bushes have no collision).

## Short guns (Codex, guns-short) - 01:25
- Budgets PASS: pistol 13.9k tris / 415 KB, SMG 17.3k / 500 KB, revolver 23.7k / 699 KB, machete 10.5k / 391 KB.
- Paw contact PASS: worst -0.3 mm (revolver L), within the -0.5 mm tolerance; others -0.2 to +1.3 mm.
- Visual PASS: models and liveries match the sheets (teal pistol, yellow-green Canarinho with the blue star, engraved blued revolver, machete with Bonfim ribbons); two-handed pistol and revolver grips cup the firing paw from below-left; SMG support paw wraps the vertical foregrip; reloads readable (pistol mag drop and seat, SMG swap, revolver muzzle-up eject, speedloader, close); machete diagonal slash. Minor: the pistol sits a little far and small at hip.
- Merged cleanly; integrated tsc clean and vitest 896/896.

## Combat feel, controls and VFX (Claude Opus, combat-vfx, 12 commits) - 01:50
- Own shots predicted on the click (30-48 ms sooner); per-range balance (M4 body TTK 0.46 s, was 0.25 s); draw and sprint-out times, exact cadences, per-gun move speed, learnable recoil, fixed shotgun pattern; src/controls.ts as the single action and key model (toggles, invert Y, aimed and scoped sensitivity, camera shake, V quick melee, X previous weapon, coyote jump); protocol 12; camera kick, flinch, blast shake, low-health grey; 18 Codex-painted effect sheets. Busy fight about 0.4 ms and 2 draws; live match 16.7 ms.
- Merge: the UI and combat passes both added invert Y and aimed sensitivity; unified on the controls model (one declaration, one loader with the controls' ranges, input scaling from setAimFov), both main.ts hunks kept, UI tests adapted. Integrated tests 917/917.
- My checks: coconut blast capture (painted fireball, smoke, ground ring) and the agent's flash, impact and blast strips PASS.
- Follow-ups: settings screen must show every controls option (toggles, scope sensitivity, camera shake) and rebinding for the new keys, with the controls' slider ranges; crosshair.ts treats horizontal FOV as vertical; viewmodel draw animation should match the new draw times (after the long guns merge); no flash inside the scope; some QA lab poses no longer match the island.

## Codex quota - 02:33
- Codex hit its weekly limit at 02:30 while the long-guns agent was in its fix round (five fixes committed, 11 files in progress). Per the user's rule, ONE reset was used, the soonest-expiring (01:21 on 5 Oct), through the Codex CLI /usage menu; 2 remain (22 Oct, 29 Oct) and are not to be used. The long-guns agent resumed on its saved thread at 02:34.

## Character rebuild (Claude Opus, character-rebuild, 13 commits) - 03:15
- New sculpt with face (nose, lids, brows, mouth, ears), barrel torso, rolled cargo trousers, three-toed feet, the v3 paw imported unchanged; team colour on scarf, hip rag and bedroll; LODs 26.5k/7.8k/2.2k; guns held close for every class with both paws (a stance-offset accumulation bug moving guns 7-14 cm found and fixed); 60 Hz clips with planted feet; 16 capybaras hold 60 fps on every preset.
- My check against the holding reference: PASS as a clear step up (outfit, silhouette, blunt muzzle, close holding all match); below the reference in face expressiveness at distance and fur cleanliness up close. Merged; integrated tests 918/918.

## Switch to Codex astra (Claude weekly 93% used) - 03:20
- Remaining builds moved to Codex gpt-6-astra at max effort per the user's fallback rule, keeping Claude for reviews and the release: integration (settings for the new controls, crosshair FOV, audio follow-ups, scope flash, QA poses and visual baselines, integration bugs from full matches), bots-graphics (bots on the new island, sky, grading, fog, AO), char-polish (face, fur, foot sliding, armhole texels, statue from the new character, far LOD).

## Bots and graphics (Claude Opus takeover of a Codex start, bots-graphics, 14 commits) - 08:05
- Bots measured over 8 full matches per mode against the original: stuck time 2.2 -> 0.7 s per bot-minute (royale) and 2.7 -> 0.5 (deathmatch), longest stuck 46 -> 6 s, storm deaths 23 -> 0, water deaths 83 -> 3; strafing now spoils bot aim (Normal SMG at 10 m 86% -> 63%); rusher, anchor and flanker styles; yards and gates joined to the route network.
- Graphics (the Codex lighting draft was replaced because it washed colour out): blue sky, one shared haze warming toward the sun, warm sun and cool shadows, colour grade, daylight clouds, turquoise water, short-range shadows on Low; 16.7 ms on every preset.
- My before/after from four cameras: PASS (subtle, cleaner daylight closer to the wide-aim reference; the coast lost its orange horizon for a clear blue sky). Merged.
- Found: a walled garden near (6, 68) traps players (sent to the integration agent with a connectivity test requirement).

## Integration (Claude Opus takeover of a Codex start, integration, 41 commits) - 09:20
- Settings built from the controls model (every option and binding), crosshair FOV fixed, incoming-fire cue, music default migration, scope flash redone, QA retargets; the Tucano supply drop is a hot-air balloon, so burner sounds replace a propeller; every walled yard has a gate (two had none: (5.5, 68) and (14.6, -49.1)) with an island test that no pocket, roof, spawn or pickup traps a player; pause menu key cards; Correria and Corrente results count falls; QA effects no longer leak between poses. 165 visual baselines checked by eye and installed; 11 full rounds, 0 page errors, 58-61 fps fresh.
- My check: settings screen PASS (cohesive, all new controls present). Merged.
- Open: character-mask.spec.ts also fails on the base branch (for the character agent); frame drops in long runs under shared load (recheck on a quiet machine in the release gate); bougainvillea through a Morro wall; spectator camera squeezed against the target about 6% of the time; new sounds need a human listen.

## Long guns round 2 (Claude Opus takeover of the Codex agent, guns-long) - 10:05
- Fixes: support paws wrap from the lower left, palm on the side, fingers forward and curled under (tips 254-308 deg), pumps wrapped on the Doze and Lanca-coco; M4 handguard made full length and chunkier, Carabina and sniper fore-ends widened so a paw can wrap them; hip framing and viewmodel FOV (56-60) re-solved so the back of the firing paw and the trigger digit read at the lower right; coco hopper moved right under tall ladder sights; reload paths reworked, two-flank inspect on all five, swap timed to the combat pass's draw times (tested). Worst clearance -0.4 mm across hip, ADS, fire, inspect and full reloads.
- My round-2 renders (hip, ADS, support close-ups, all five): PASS. Accepted minor gaps: support thumbs along the upper-left edge (125-146 deg) instead of the top; Lanca-coco 25.8k triangles (3% over the guideline).
- Merged (one conflict in tests/visual/qa-hook.ts resolved: kept the integration event hook and the reload-chain motion); integrated tests 1021/1021.

## Production build fix - 11:55
- `npm run build` failed on every branch: a dead remnant of the old HUD zoom rule in src/ui/style.css (unbalanced parenthesis left by the HUD rebuild; the live rule is in hud.css). Removed the remnant: no visual change (browsers were already dropping it). Build, tsc and 1021 tests green.

## Character full-quality pass, round 1 (Claude Opus, char-polish, 15 commits) - 12:10
- Re-sculpted head and cloth, 4K painted maps, LOD0 40.5k, groomed fur shells, eight walk and crouch directions with planted feet (slip under .03 m/s median), rebuilt statue, far team rim. GLB 8.9 MB, about 200 MB of GPU texture memory.
- My review at 1920x1080 against the design sheet and the holding reference (boards in output/review/char-r2/): MERGED as a clear improvement, NOT at the bar. Round 1 raised detail density but not design: from the front the face is a dark loaf with a black disc and two beads; arms and paws are about half the target thickness, both legs sit in one olive barrel with the feet together; the scarf is a smooth tube, the hip rag reads as raw meat, the bedroll and backpack are primitives; the paint is noisy where the world and the weapons are clean; the idle is a statue (frames 0.6 s apart nearly identical); head fur and limb fur differ in colour.
- Sent back for round 2 (docs/overhaul/briefs/char-round2.prompt.txt): face, build and stance, team cloth, backpack, clothes, paint style, life (idle, aim pose, secondary motion, holds re-fitted), texture tiers for Medium and Low. The third-person paw is no longer tied to the first-person paw. Integrated tests 1037/1037, build green.

## Final polish and full-game review (Claude Opus, final-polish, 19 commits) - 13:08
- Known items: 60 plants had leaves inside buildings (the Morro "bougainvillea" was a pink ipe crown), now kept out of rooms and off arena spawns with a per-leaf test; spectator squeeze fixed at its main cause (the shoulder pivot probe), plus lift or swing at walls and soft foliage (live 97.9% on screen, 1.3% within 1.2 m); eight pickups rebuilt with their own silhouettes; long-match frame drops traced to machine contention (flat resource counts over 532 s, 5.7 KB garbage per frame).
- Director items: scopes fill 90% of the screen height inside a lit scope body over a blurred world; HUD 0 overlaps over 36 size and scale combinations (the match banner fixed); HUD complete after rematch in all three modes; QA ended-HUD leak fixed.
- My checks: evidence sheets for scope, loot, supply beacon, room vegetation and HUD sizes PASS; scope stayed within its files (no weapon, viewmodel, arm, character or Blender file). Merged (a5a7d77): tsc clean, vitest 1045/1045, build green.
- Not fixed, sent to a new world finish pass (brief docs/overhaul/briefs/world-finish.prompt.txt): kit bougainvillea as pink hexagon blocks on the town facades, smeared rocks and cliffs, blobby offshore islets from the plane, death cam inside a bush (near-camera foliage fade), four trees over royale spawns, then a street-level sweep.

## World finish (Claude Opus, world-finish, 13 commits) - 14:40
- Kit flowers: faceted bougainvillea heads removed from fronts, window boxes, pots and yard walls; painted drapes, window-box and pot plantings take their place (about one front in five stays bare). Rocks: a world-space stone layer (joints, grain, streaks, relief) fading with distance. Offshore islets rebuilt as granite domes over forest with coves, surf and palms (2 draws). Near-lens foliage fade for the local camera only (dithered). Spawns reject spots under crowns (test on every spawn). Capela do Morro is its own hill chapel; terrace end walls dressed; Campinho stand ends painted; terrain smudges near the eye broken up. Kit 11.34 MB / 3.11 MB gzip (was 11.44 / 3.42); the final kit build ran on the Linux machine.
- My checks: evidence sheets for flowers, rocks, islets, foliage fade and sweep PASS (clear improvement; balcony drapes are thinner than before, the dither fade shows a stipple in stills). Cross-machine check on the kit: same sources built on the Mac (940b0ed) and on Linux (437f6ea) render near-identically in ten town views (at most 0.14% of pixels differ by more than 3%); the only visible difference is shutter colours on one facade; Linux builds are byte-identical run to run. Merged: tsc clean, vitest 1053/1054 with 2 workers (the vegetation determinism test timed out at load 150 from a Codex task on another project and passes alone), build green.
- Remote builds: `tools/blender/remote-blender.sh` verified (M4 41 s, character Blender step 171 to 204 s against about 18 minutes on this Mac, statue 12 s, kit 28 s; peak 4.3 GB of 16 GB; maps at 4096/4096/2048).

## Character round 2 (Claude Opus, char-polish) - 15:05
- Round 2 rebuilt the design against round 1's review: golden head with a grey-brown heart nose and a philtrum groove, 3D whiskers, larger forward eyes, upright dark ears, furred neck; broad shoulders, belly and thick arms with a new third-person paw (`capy_hand.py`); two legs, wide turned-out stance; knotted bandana, pleated hip rag, blanket roll, canvas rucksack, fuller clothes; one fur family, cleaner paint; 10 s breathing idle, low-ready armed idle, aim pitch through the spine, springs on the loose gear; holds re-fitted for nine weapons (third-person guns scaled 1.3 to the bigger paw; muzzle flashes follow the scaled muzzle); High 7.05 MB / 192 MB GPU, Medium 3.83 MB / 48 MB, Low 2.80 MB / 12 MB, one file per quality setting; built on the Linux machine.
- My review with the round 1 cameras (boards `output/review/char-r2/evolution-body.jpg`, `evolution-face.jpg`): clear improvement in build, proportions, gear and life; reads well at gameplay distance. Still short of the target up close on the head: eyes that bulge out of the skull, a bulbous lower face and fur that reads as smooth vinyl (the darker crown and back barely show). Merged: tsc clean, vitest 1054/1054, build green. Next step with the user: a focused head and fur pass, and the first-person arm match.

## Character round 3 (fresh general-purpose Opus agent at max effort, char-r3x, 11 commits) - 22:35
- A first round 3 agent (high effort) was stopped by the user for regressing; this one worked from round 2 with the user's art direction (a fun cartoon capybara humanoid, references as guides). Fixes: knees bent backwards in every clip because the leg IK pole pointed backward (root cause, now forward); head rebuilt as a cartoon capybara from a Codex concept sheet (box head, blunt muzzle, cushion nose, cheeks tapering into the neck, half-lidded eyes in the skull, a smile); fur as combed locks with a darker crown, nape and back and lighter cheeks and throat, 8 shell layers of 15 mm; team colour at 60 m keeps the larger of the texel and vertex masks; support paw wraps the Lanca-coco and sniper fore-ends; statue rebuilt from the new head and validated before export. Paw and forearm colours unchanged (contract with the arms agent).
- My review at the round 1 and 2 cameras (`output/review/char-r2/evolution-body-r3.jpg`, `evolution-face-r3.jpg`): the user's three complaints are fixed and the fur reads as fur; a clear improvement, merged. Still short of the concept: small half-closed eyes that read sleepy rather than fun, the head's shaded side reads muddier brown than round 2 (a regression the agent noted), blinks look plate-like at 1 m. Sent back for a short round 4 on those.
- Merge checks: tsc clean, build green, vitest 1049/1054 at load 31 to 41 with 5 timeouts in three world and loading files, which pass alone (108/108).

## Character round 4 (same agent) - 23:45
- Eyes open by default, larger (52 mm eyeball in a 66 mm almond opening), warmer iris and bigger catchlight; blinks roll a furred lid down over the eye instead of squashing skin into a plate; a warm fill keeps the fur's shaded side golden (shaded cheek #4B300D to #864C13); paler muzzle (#E6D2AE). Forearm, paw skin, claw and cuff colours unchanged.
- My review of the boards: PASS on the face (friendlier, alive, reads at 3 and 8 m). NOT merged yet: crowd timing with 16 capybaras at load 7 to 11 is High 33.2 / 33.4 ms and Medium 16.7 / 33.4 ms p50/p95 against 16.7 / 16.7 on every preset in round 2 (suspect: the round 3 fur shells). Sent back to fix the regression without visible loss at gameplay distance.
