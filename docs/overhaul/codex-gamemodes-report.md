# Rodadas: Duelo e Turma contra Turma

2 October 2026. Implemented and verified on `codex-gamemodes`. Complete modes were handed to root before 12:45 America/Sao_Paulo. No reference images or new dependencies are shipped.

## Research before implementation

- [Valve's CS:GO mode descriptions](https://blog.counter-strike.net/about/) distinguish Wingman's small 2v2 round matches and purchased equipment from Arms Race's immediate respawning and gun progression. The existing Corrente already serves the latter idea. Duelo instead gives both opponents a single host-selected gun for each fresh round. The squad mode uses elimination only, following the user's latest instruction.
- [Valve Developer Community, game modes](https://developer.valvesoftware.com/w/index.php?title=Counter-Strike%3A_Global_Offensive%2FGame_Modes&uselang=zh) describes Wingman using smaller maps or map sections and shorter rounds. Adaptation: reuse the island's bounded town arena, opposing team starts and swap ends each round. No new world geometry.
- [Counter-Strike Wiki, Money](https://counterstrike.fandom.com/wiki/Money) was read through the indexed article after direct fetch was blocked. It documents saved money, a starting bankroll, a cap, round rewards, increasing loss assistance and elimination income. This is a community source, not an assertion of current CS2 balance. Our simpler numbers are explicit game design choices below.
- [CS2 June 2023 buy-menu reference](https://www.oneesports.gg/counter-strike-2/cs2-update-mirage-buy-menu-loadout-beta/): actual 1918 by 1080 screenshot downloaded and viewed in full as `~/codex-team/refs/gamemodes/cs2-buy-real.jpg`. It places the purchase countdown over grouped weapon cards, prices on each card, money visibly outside the grid, owned items in a distinct state, and refunds on recent purchases. Adaptation: a cream-paper grid of existing painted equipment art, plain weapon descriptions, visible balance/countdown, disabled unaffordable choices and a return-purchases action during the frozen buy phase. The screenshot is a primary visual artifact of the game hosted by its capturer; third-party commentary is not used as technical authority.
- [Valve CS2 store gallery](https://store.steampowered.com/api/appdetails?appids=730): downloaded privately. Viewed the official team lineup (`cs2-official-00.jpg`), which makes team membership explicit with names/colours. It does not show buy UI. No reference images are shipped.

Some direct wiki and news/image hosts returned 403 or timeouts. The successful source URLs and retrieved HTML/Steam manifest stay with the private images. No new generated art or dependencies are needed.

## Shipped rules

Duelo: 1v1, first to 5 round wins, equal gun and ammunition per round, three seconds to prepare. Turma contra Turma: 2v2 or 3v3, first to 5, 12-second frozen buy phase, one life per round, no friendly fire. Both use 90-second rounds, a timeout or simultaneous wipe draws without a point, and four seconds to read the result. A team wins only after every opponent is eliminated.

Squad economy: $800 starting balance, $16,000 cap, $2,700 round win, $1,900 loss assistance rising by $500 per consecutive loss to $3,400, and $300 per opponent eliminated. Surviving gear carries over with fresh ammunition; eliminated capybaras return with a pistol and facão. Purchases use match currency only. All shop guns are common rarity. A carried weapon retains its ID, rarity and inventory box when ammunition is refreshed.


| Purchase | Match coins | Effect |
| --- | ---: | --- |
| Trinta-e-oito | 600 | Replaces the pistol |
| SMG | 1,200 | Primary weapon |
| Doze | 1,600 | Primary weapon |
| M4 | 2,900 | Primary weapon |
| Carabina | 3,500 | Primary weapon |
| Sniper | 4,500 | Primary weapon |
| Lança-coco | 3,200 | Primary weapon |
| Colete | 650 | Fills armor to 100 |
| Capacete | 350 | Fills helmet protection to 60 |
| Kit médico | 400 | One carried kit; the existing five-second heal |

One primary, one sidearm and the facão fit the existing inventory. New primary purchases replace the previous primary. During the buy window, **Devolver compras** restores the exact starting kit and starting balance for that round. Repeating a refund does not create coins. The host rejects unknown items, unaffordable or already-owned purchases, duplicate action IDs, stale round numbers, dead buyers and requests outside the buy phase. Friendly fire is disabled, including projectiles; self-inflicted coconut damage remains possible. Timeouts and simultaneous wipes give no round income; valid enemy eliminations still pay their elimination reward.

The arena is the existing town rectangle, x -56 to 60 and z -58 to 58. Opposing anchors sit either side of the center and choose distinct, collision-checked existing ground spawns. The teams swap sides after every round. There are no capture zones, bombs, ground loot or chests in either new mode. Death never triggers Correria's three-second respawn. A disconnected capybara keeps its vulnerable body during the existing 30-second grace period, then forfeits. A late guest replaces a bot or expired seat on the same team and watches until the next round. In-flight projectiles belonging to a replaced bot are removed so their missing owner cannot bypass team damage filtering.

Bots fill exactly one opponent in Duelo, three missing seats in 2v2 practice, or five in 3v3 practice. They target opponents, use connected town routes, keep round ammunition limits, and skip leisure/loot behavior. In the team mode they buy useful primary weapons when money also covers protection, then armor, helmet and medicine. Survivors keep their guns and save their remaining money. Team size cannot silently become the old minimum-eight-bot arena roster.

## Player interface

Five painted mode cards appear on the home screen; short desktop windows place them beside the play board. The team card exposes 2v2/3v3 practice selection. The create-room form normalizes mode capacity, hides irrelevant Correria duration, and exposes team size. Human-only rounds wait for a complete roster before starting. The lobby names Maré and Brasa alongside players.

The round ribbon appears after the global opening countdown and shows both scores, each team's living count, the current round/preparation/result and its clock. Duelo also names the shared gun. Team rounds display the balance and an explicit `Sua turma: Maré/Brasa` cue during combat. **O** opens the shop during the buy phase; **B** remains gestures and all bindings remain configurable. The shop uses existing item art and weapon thumbnails/silhouettes, Dela/Mochiy type and cream paper with brown ink. Unaffordable cards stay readable. On phones, affordable gear comes first, shelves scroll, and the balance, timer and exit controls remain visible. It closes automatically when combat begins and returns pointer lock.

A fallen teammate sees “Você volta na próxima rodada.” Team spectators can only follow their own living teammates. The map uses square ally markers. The final result uses the shared victory presentation and adds round score; every member of the winning team, including fallen teammates, receives first place.

Initial round time waits for the host's scene preparation: the worker publishes its initial countdown snapshot for asset upload, then receives a match-ID-bound readiness message before advancing. This gives the player the complete opening buy/preparation window. Battle royale, Correria and Corrente retain their original startup timing. Client prediction also respects frozen rounds, clears pending input on a new round and adopts the host's fresh spawn direction.

## Network contract

Protocol **13** adds mode identifiers `duel` and `squads`, optional `teamSize`, round state, team/money actor metadata, and reliable `buy`/`refund` requests carrying the round number and action ID. The 32-field fast actor tuple is unchanged. Team identity travels with reliable world metadata, money with reliable equipment metadata, and the small round state with fast frames. The decoder validates capacities, teams, coin limits and round shape. Existing mode payload semantics remain unchanged within protocol 13. Protocol 12 clients must reload the same build as the host; mixed-version play is rejected by the existing version gate.

## Files

- `src/shared/round-modes.ts`: shared rule numbers, shop catalog, equipment checks and spectator filtering.
- `src/shared/types.ts`, `src/network/codec.ts`, `src/network/session.ts`: explicit modes, protocol and validation.
- `src/simulation/index.ts`, `src/simulation/host.worker.ts`: authoritative round lifecycle, economy, bot behavior and initial readiness gate.
- `src/main.ts`, `src/fire-prediction.ts`, `src/controls.ts`: input/prediction, purchases, team spectators and the shop binding.
- `src/ui/round-modes.ts`, `src/ui/round-modes.css`: isolated ribbon/shop/results surfaces and responsive mode layout.
- `src/ui/ui.ts`: small home/lobby/game/death/result integration hooks on top of the HUD agent's released UI.
- `tests/round-modes.test.ts`, `tests/round-modes.e2e.spec.ts`: simulation/transport intentions and actual browser/network flows.
- `tools/qa/round-bots.mts`, `tools/qa/round-evidence.mjs`, `tools/qa/round-ui-check.mjs`: repeatable bot matches and browser evidence.

## Verification and evidence

- TypeScript and production build pass. The build retains the existing large-chunk warning.
- **118 targeted unit tests pass**: 95 across rounds/network/Corrente/fire prediction/UI, plus 23 input/input-clock tests. The 15 new rule tests cover identical guns, freeze/live/over flow, last-opponent elimination, timeout/simultaneous draws, first-to-five results, invalid and duplicate purchases, refund idempotence, capped reward/loss income, survivor equipment and fresh ammo, bot buys, dead teammate victory, disconnect forfeiture, late joins, decoder bounds, real-world spawn safety and team spectators.
- **Three actual Chrome tests pass**: Duelo practice with one bot and shared gun; 3v3 practice with five bots and buy/refund/next-round checks; a real PeerJS host and guest with host-confirmed purchase, team-only spectator after guest death, shared score and next-round reset. Cold start assertions wait for the visible arena and confirm the opening preparation/buy phase is still active.
- A final phone startup check confirms the round ribbon is hidden during the global countdown and appears during preparation; `opening-countdown.json` records both states without page errors.
- The existing **Correria guest inventory** Chrome test passes through the same local signaling server, exercising selection/drop/pickup after the protocol change.
- **26 visual/interaction checks pass**: both ribbons at 1920x1080, 1280x720, 390x844 and 844x390, each at 80%, 100% and 120% UI scale; phone shop shelves/visible exit; automatic shop close and recaptured pointer lock. Minimum effective text size across those ribbon checks is **12.012 CSS pixels**, after zoom. No compass overlaps, horizontal overflow or offscreen ribbons were detected. Results are in `evidence/codex-gamemodes/ui-scales.json`.
- Actual natural simulation with an idle human and seed 71 completed both modes without forced damage: Duelo ended **0-5 after 554.9 simulation seconds**, with four drawn rounds; 3v3 ended **5-4 after 659.2 seconds**, with one draw and **41 eliminations**. Bots upgraded to SMGs/M4s and balances stayed at or below 16,000. `natural-bots-720.jsonl` records the ending states. The browser end-to-end tests use the existing QA damage hook only to make elimination/next-round assertions deterministic; those forced outcomes are distinct from the natural bot evidence.
- The HUD agent independently viewed seven full-size menu/game/shop/result captures and the refreshed phone ribbon, and confirmed the visual family and readable persistent shop controls. Their own-team identification suggestion is implemented and independently confirmed clear. They also read all 24 ribbon scale rows and confirmed the effective 12.012-pixel minimum.

Evidence lives in `docs/overhaul/evidence/codex-gamemodes/`: mode selection and room options at desktop/phone sizes, actual live Duelo and 3v3 gameplay in four viewports, desktop/phone shop, the shared-gun ribbon, a five-win Duelo result, and scale-validation captures/JSON. `*-ui-*` captures include the final explicit team label. Reference CS screenshots remain private under `~/codex-team/refs/gamemodes`.

Commands used: `npm run check`; `npm run build`; targeted `vitest run ... --maxWorkers=1`; `BASE=http://127.0.0.1:5199 playwright test tests/round-modes.e2e.spec.ts --project=chromium --workers=1`; the existing Correria test with `PONTE_GAME_URL` pointed at that server; the three QA scripts. Chrome ran with `channel: chrome`, `--use-gl=angle` and `--use-angle=gl-egl`, at most one browser process at a time. No software-rendering fallback was selected.

## Handoff and limits

Logical commits: `b91015a` authoritative core; `4df20af` complete UI/player flow and readiness gate; `d2912b5` class-based pause selector; `dd71adf` explicit local team label; `f87d529` replaced-bot projectile cleanup; `52961fe` hides the round ribbon until the global countdown ends. HUD commits mirrored in this worktree are already owned/integrated by root and are not part of the mode cherry-pick list. The final evidence/report commit follows separately.

No incomplete mode is exposed and no new mode blocker remains in the checks above. The overall integrated build and root's full regression gates remain root's responsibility. Remote-internet latency, a deliberately slow guest GPU and non-Chromium round rendering were not separately certified by this scoped pass. Long idle-human duels can draw at 90 seconds until a bot finds an opponent; draws are intentional, visible and award no point. The existing host-authoritative networking trust model remains unchanged.

## Integration follow-ups

The 2 October slow-guest follow-up supersedes the earlier host-only opening gate: protocol 14 waits for each connected human's first prepared frame and HUD, with a fixed 30-second wall-clock cap, while preserving later-round timing. See [the loading fix report](codex-round-loading-fix-report.md) for readiness, reconnect, late-join and timing evidence.

Root's full suite found an outdated prototype-call fixture in `tests/emote-ui.test.ts`: the HUD's class-based overlay invalidation added `toggle`, but the fixture did not supply it. `8f6dcec` fixes only that fixture and verifies that opening and closing clear the overlay class correctly. All six gesture UI tests and TypeScript pass.

The full Chrome gate also exposed a test interaction race at its deliberate two-FPS rendering cap. Reproducing against the integrated root server showed the guest fully loaded, with no loading overlay, at round-one time 3.2 seconds and the buy phase ending at 15 seconds. Its received snapshot was already playing, while the last rendered HUD frame still held the countdown and a disabled shop button. Sending O at that instant was too early for the rendered UI; 11.8 seconds of buying remained, so the guest had not lost its buy window to loading. The test now waits for the scene, loading-overlay removal and enabled buy control, then requires round one, the buy phase and at least ten seconds remaining before a single O press. Host-confirmed money, team-only spectating and shared next-round assertions remain intact. Three consecutive cold-context runs pass against root's integrated server, with no runtime change.
