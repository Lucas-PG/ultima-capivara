# Overhaul progress

Resumable record for the creative-direction overhaul (started 2026-09-27). Newest entries first under each milestone.

## Direction

- **Keep the stack.** Three.js + TypeScript + Vite in the browser, host-authoritative simulation in a Web Worker, PeerJS/WebRTC rooms. It runs, is testable headlessly (Playwright + Vitest), and multiplayer already exists. A rewrite would spend the budget on parity instead of quality.
- **Look:** "Ilha Dourada": warm golden-hour, painted cartoon, ink outlines, chunky readable silhouettes. No realism.
- **Priority order:** what the player sees and does every second (hands, guns, inventory), then the island (water, light, places), then combat feel and bots, then multiplayer verification.

## Milestones

| # | Milestone | State |
|---|---|---|
| M1 | Hands and arsenal: inventory rules, first-person weapons and paws | in progress |
| M2 | Island look: water, light, sky, materials | water done; light/materials open |
| M3 | Places: district identity, buildings and interiors, prop placement | not started |
| M4 | Combat feel, weapon variety, bots, audio, pacing (full matches) | 2 new weapons done |
| M5 | Multiplayer restore and verification with real clients | not started |

## M1 log

### Done
- **Inventory** (`src/shared/inventory.ts`, simulation `giveWeapon`/`dropHeld`/`dropGun`): four fixed boxes (1-2 long guns, 3 sidearm, 4 facão). Keys always mean the same box. Picking up a gun of a full class swaps it with the held gun of that class (or box 1) and drops the old one with its magazine and reserve. Same gun tops up ammo. G drops the held gun. Royale eliminations drop the victim's guns. Arena drops fade after 25 s; royale keeps up to 48. The F prompt names the swap ("Trocar SMG → M4"). Empty boxes show what belongs there and shake when pressed. Protocol v10 carries `box`.
- **First-person arsenal** (`src/render/toon-weapons.ts`): all 8 weapons rebuilt from code (extruded side silhouettes with bevels, ink hull outlines, rarity accent paint, legendary trim) with capybara paws wrapped around each real grip, fur forearms and rolled teal sleeves. New framing `TOON_HIP_POSES`: stock at the shoulder, gun shown from above-behind. Default set; `?weapons=painted` and `?weapons=legacy` keep the old ones for comparison.
- **Tools:** `tools/qa/capture.mjs` (QA poses), `tools/qa/play.mjs` (headless live match driver), `tools/qa/viewmodel.html` (all weapons on one sheet: `?mode=hip|ads|side&weapon=`).

- **Consistency:** ground pickups and third-person guns are baked from the same builders (`bakeToonWeapon`, paw-less, near/far detail within 2200/900 tris).
- **HUD:** first-match coach card moved top-left, off the weapon.
- **New weapons:** Trinta-e-oito revolver (sidearm, 6 x 46 dmg, precise) and Lança-coco (primary, arcing coconut, 4.2 m line-of-sight splash, 40% self-damage). Cartoon burst effect, icons, bot tuning, chest weights, synth audio. Corrente ladder is now 10 steps.

### M2 log
- **Water** (`src/render/water.ts`): new stylized shader: depth-graded mint/turquoise/teal, animated Voronoi cell highlights in patches, sky fresnel, crisp toon sun glints, shore lip plus two rolling foam bands. Low preset skips the cell layers.

### Checks
- `npx vitest run`: 717 passed (inventory, arsenal contract, coconut splash intent tests).
- `npx playwright test --project=chromium`: 4/4 (host + guest game over local PeerJS, protocol v11).
- `scripts/bot-trials.ts 6 normal`: no regression vs baseline 514f0f9 (BR stuck 2.15 vs 2.27 per bot-minute; pre-existing weakness).
- Frame time, live Correria, headless Chrome on this Mac (Apple Silicon, 1280x720, medium preset): p50 16.7 ms, p99 16.8 ms, 310 draws, 1.42M tris.
- Live headless playtests (Chrome, Apple Silicon Mac, 1280x720): SMG, pistol, facão idle/fire/swing/reload render correctly; HUD boxes and labels correct.

### Open in M1
- Long-gun support paw is small and mostly hidden; stock still looms on rifles.
- Reload/equip animations are the old generic ones; no pump/bolt hand motion.
- Third-person and world pickup models still use the old painted set (mismatch with FP).
- HUD ammo card and coach card overlap the lower-right weapon area.

## Next action
M3: break architectural repetition (use the unused `house_medium` kit piece, district signatures), then M2 light/materials, then M4 bots (BR stuck rate), then M5 multiplayer pass.
