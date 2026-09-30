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
