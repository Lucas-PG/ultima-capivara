# Overhaul progress

Resumable record for the creative-direction overhaul (started 2026-09-27). Newest entries first under each milestone.

## Direction

- **Keep the stack.** Three.js + TypeScript + Vite in the browser, host-authoritative simulation in a Web Worker, PeerJS/WebRTC rooms. It runs, is testable headlessly (Playwright + Vitest), and multiplayer already exists. A rewrite would spend the budget on parity instead of quality.
- **Look:** "Ilha Dourada": warm golden-hour, painted cartoon, ink outlines, chunky readable silhouettes. No realism.
- **Priority order:** what the player sees and does every second (hands, guns, inventory), then the island (water, light, places), then combat feel and bots, then multiplayer verification.

## Milestones

| # | Milestone | State |
|---|---|---|
| M1 | Hands and arsenal: inventory rules, first-person weapons and paws | done (polish items open) |
| M2 | Island look: water, light, sky, materials | water done; light/materials open |
| M3 | Places: district identity, buildings and interiors, prop placement | house variety, landmarks, Farol headland done; deeper layout work open |
| M4 | Combat feel, weapon variety, bots, audio, pacing (full matches) | weapons, ammo flow, landing grace done; bot stuck rate open |
| M5 | Multiplayer restore and verification with real clients | e2e incl. inventory; rematch gate added |

## M1 log

### Done
- **Inventory** (`src/shared/inventory.ts`, simulation `giveWeapon`/`dropHeld`/`dropGun`): four fixed boxes (1-2 long guns, 3 sidearm, 4 facão). Keys always mean the same box. Picking up a gun of a full class swaps it with the held gun of that class (or box 1) and drops the old one with its magazine and reserve. Same gun tops up ammo. G drops the held gun. Royale eliminations drop the victim's guns. Arena drops fade after 25 s; royale keeps up to 48. The F prompt names the swap ("Trocar SMG → M4"). Empty boxes show what belongs there and shake when pressed. Protocol v10 carries `box`.
- **First-person arsenal: REVERTED to production.** A code-built set (toon-weapons) was tried; the user and an A/B against production (hip and ADS, same pose) showed it was worse (flat sight pictures, odd M4 paws). Production's Blender-painted set is the default again, and the revolver and Lança-coco were authored in the same Blender pipeline (`tools/blender/weapons.py`), so all 10 guns share one style; the 8 existing guns rebuilt byte-identical (same triangles, bounds, sights). Rule going forward: every visual change gets a same-pose A/B against production before landing.
- **Tools:** `tools/qa/capture.mjs` (QA poses), `tools/qa/play.mjs` (headless live match driver), `tools/qa/viewmodel.html` (all weapons on one sheet: `?mode=hip|ads|side&weapon=`).

- **Consistency:** ground pickups and third-person guns come from the painted GLB via `build-world-weapons.mjs`, now including the two new guns.
- **HUD:** first-match coach card moved top-left, off the weapon.
- **New weapons:** Trinta-e-oito revolver (sidearm, 6 x 46 dmg, precise) and Lança-coco (primary, arcing coconut, 4.2 m line-of-sight splash, 40% self-damage). Cartoon burst effect, icons, bot tuning, chest weights, synth audio. Corrente ladder is now 10 steps.

- QA poses `ads-<weapon>` added for same-pose A/B of aiming (`QUERY=... node tools/qa/capture.mjs`).

### M3 log
- `house_medium` (unused kit piece) now used on 8 lots with its own furnished interior and painted floor. House lots count as occupied, which fixed bushes growing inside rooms. World version `ilha-v3-rio-10`.

- Landmarks the plan named but the kit never shipped are now built in code and collidable: Porto crane, Fazenda windmill (turning), Morro radio mast (`src/render/landmarks.ts`, `src/shared/landmarks.ts`). World `ilha-v3-rio-11`.
- Farol headland: rock outcrops on the lighthouse flanks.
- Interior windows: rooms had solid walls where facades show shuttered windows. Each facade window now has an inner pane on the room side (frame plus sky/horizon along the view ray), one merged mesh (`kitInteriorWindows`).

### M4 log
- Playtest driver `hunt` step (scripted aim-and-fire player). Findings fixed: guns ran dry and dry-fired (now auto-switch to a loaded gun; Correria kills restock a magazine; bots skip empty guns); BR players were shot 4-6 s after landing (bot landing grace 2.5 s -> 7 s).
- Plane and parachutes rebuilt (cartoon twin-prop with livery; striped canopy in kit colour). Coconut burst has its own sound.
- Swimming allows any sidearm (revolver swap no longer strands a swimmer).

### M5 log
- New e2e: Correria guest selects the sidearm, drops it, picks it back through the host with ammo intact.
- Local Chromium e2e now uses real Chrome with ANGLE Metal on macOS: two software-GL clients stalled 2-10 s per frame.
- Slow gate `E2E_SLOW=1`: full 5-minute Correria to results on both clients, identical results, host rematch, clean second match.

### M2 log
- **Water** (`src/render/water.ts`): new stylized shader: depth-graded mint/turquoise/teal, animated Voronoi cell highlights in patches, sky fresnel, crisp toon sun glints, shore lip plus two rolling foam bands. Low preset skips the cell layers.

### Checks
- `npx vitest run`: 718 passed.
- `npx playwright test --project=chromium --repeat-each=3`: 15/15 (5 tests incl. inventory, protocol v11).
- `scripts/bot-trials.ts 6 normal`: no regression vs baseline 514f0f9 (BR stuck 2.15 vs 2.27 per bot-minute; pre-existing weakness).
- Frame time, live Correria, headless Chrome on this Mac (Apple Silicon, 1280x720, medium preset): p50 16.7 ms, p99 16.8 ms, 310 draws, 1.42M tris.
- Live headless playtests (Chrome, Apple Silicon Mac, 1280x720): SMG, pistol, facão idle/fire/swing/reload render correctly; HUD boxes and labels correct.

### Open in M1
- Long-gun support paw is small and mostly hidden; stock still looms on rifles.
- Reload/equip animations are the old generic ones; no pump/bolt hand motion.
- The ammo card still sits over the lower-right corner of long guns at 4:3.

## Session 1 final gate (2026-09-27, branch `overhaul/m1-inventory`, not pushed)
- `npm run check` clean; `npx vitest run` 718/718; `npm run build` ok (dist 41 MB).
- `npx playwright test --project=chromium`: 5/5 (slow rematch gate skipped by default; passed separately with `E2E_SLOW=1`).
- Live Correria combat on Apple M2, real Chrome, 1280x720, medium: p50/p99 16.7/16.8 ms, 0 long tasks, 248 draws, 1.53M tris.

## Next action
1. Bots: BR roaming stuck ~1.2/bot-minute (12 seeds); improve local avoidance around kit corners.
2. Places: the grid of roads and wide empty fields between districts; add alleys, cover lines and district-specific props (Mangue stilts, Fazenda crops/fences, Porto cargo).
3. First-person polish: per-weapon reload hand motions (pump, bolt), support paw visibility on long guns.
4. Character: third-person capybara pass (not reviewed this session).
5. Terrain/lighting: large flat grass and sand areas read bare.
