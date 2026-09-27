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
| M2 | Island look: water, light, sky, materials | not started |
| M3 | Places: district identity, buildings and interiors, prop placement | not started |
| M4 | Combat feel, weapon variety, bots, audio, pacing (full matches) | not started |
| M5 | Multiplayer restore and verification with real clients | not started |

## M1 log

### Done
- **Inventory** (`src/shared/inventory.ts`, simulation `giveWeapon`/`dropHeld`/`dropGun`): four fixed boxes (1-2 long guns, 3 sidearm, 4 facão). Keys always mean the same box. Picking up a gun of a full class swaps it with the held gun of that class (or box 1) and drops the old one with its magazine and reserve. Same gun tops up ammo. G drops the held gun. Royale eliminations drop the victim's guns. Arena drops fade after 25 s; royale keeps up to 48. The F prompt names the swap ("Trocar SMG → M4"). Empty boxes show what belongs there and shake when pressed. Protocol v10 carries `box`.
- **First-person arsenal** (`src/render/toon-weapons.ts`): all 8 weapons rebuilt from code (extruded side silhouettes with bevels, ink hull outlines, rarity accent paint, legendary trim) with capybara paws wrapped around each real grip, fur forearms and rolled teal sleeves. New framing `TOON_HIP_POSES`: stock at the shoulder, gun shown from above-behind. Default set; `?weapons=painted` and `?weapons=legacy` keep the old ones for comparison.
- **Tools:** `tools/qa/capture.mjs` (QA poses), `tools/qa/play.mjs` (headless live match driver), `tools/qa/viewmodel.html` (all weapons on one sheet: `?mode=hip|ads|side&weapon=`).

### Checks
- `npx vitest run`: 714 passed (6 new inventory intent tests, 9 arsenal contract tests).
- Live headless playtests (Chrome, Apple Silicon Mac, 1280x720): SMG, pistol, facão idle/fire/swing/reload render correctly; HUD boxes and labels correct.

### Open in M1
- Long-gun support paw is small and mostly hidden; stock still looms on rifles.
- Reload/equip animations are the old generic ones; no pump/bolt hand motion.
- Third-person and world pickup models still use the old painted set (mismatch with FP).
- Weapon variety: only 8 weapons; plan at least a throwable and one more distinct gun in M4.
- HUD ammo card and coach card overlap the lower-right weapon area.

## Next action
Finish M1 polish (support paw visibility, stock, world/TP model match), then start M2 water.
