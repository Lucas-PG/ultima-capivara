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
