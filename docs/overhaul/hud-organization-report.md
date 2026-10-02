# Match interface organisation and consistency

2 October 2026. Branch `codex-hud`. Baseline HUD source is unchanged from b721224. This pass follows the user's request for a professional match layout, larger weapon cards, an upper-left minimap, clear personal elimination feedback, explicit eliminator identity and improved outcomes. The expanded request covers every surrounding match screen.

## Research and baseline

[The image research log](hud-research.md#organisation-and-match-outcomes-image-research-2-october-2026) records each full-size image and contact sheet actually viewed, its source, observations and limitations. The references include actual in-match, elimination, death and result captures from Apex, Call of Duty, Fortnite, Valorant, Overwatch 2, PUBG, Splatoon 3 and Fall Guys. Third-party images remain private and are not shipped.

Baseline evidence was saved before changing HUD source. The QA source build was also frozen outside the repository so performance comparisons can use the exact original UI. Baseline layout review found zero faults across 11 sizes, 3 interface scales and 4 poses (132 combinations). The overlay audit found 10 px pause keys/quick settings and loading captions drawn at 11.2 px at 1280x720.

- [Baseline match states at 1280x720](evidence/codex-hud/before-1280x720.jpg)
- [Baseline match states at 1470x956](evidence/codex-hud/before-1470x956.jpg)
- [Additional moments at 1280x720](evidence/codex-hud/before-extra-1280x720.jpg)
- [Additional moments at 1470x956](evidence/codex-hud/before-extra-1470x956.jpg)
- [Baseline overlays at 1280x720](evidence/codex-hud/before-overlays-1280x720.jpg)
- [Baseline overlays at 1470x956](evidence/codex-hud/before-overlays-1470x956.jpg)

## Design and behaviour

Navigation occupies the upper-left corner: a larger wooden map frame, a separate district caption and its keyboard hint. Match state occupies the upper-right corner, with labelled counters above the public feed. The compass remains centred. Corrente progress and the first-run guide have a defined place in the navigation column.

Four named weapon cards form a row below the active weapon and ammunition. The cards retain fixed keys, rarity stripes and a clear selected outline. Their art is larger and their names remain visible. Portrait windows use two rows at the same text floor. Healing items, health/armour, action feedback and posture remain grouped on the left.

Personal feedback explicitly says **Eliminou**, makes the victim's name dominant, and adds weapon and distance from the kill event. The old event-local kill counter could disagree with the match snapshot after reconnecting or hiding the page. The reliable total remains in the upper-right match strip.

The death recap explicitly says **Eliminada por**. The eliminator name, portrait, weapon/distance and remaining health/armour have separate lines. The player's own placement has a labelled badge. Late join, environmental deaths, Correria respawns and automatic spectating retain their existing flow. On phones, the spectating card spans the width and its two navigation buttons sit below it, so the watched player's weapon, health and count remain inside the card.

Results distinguish the player's placement from the champion. Wins use the trophy capybara; losses use the waving capybara, the player's own placement and identity, plus a separately labelled champion in the summary. The hero is an illustration over the island and the summary is one paper panel. Following the additional Fortnite request, wins receive a broad upper-centre paper banner with a protruding gold placement stamp. The island stays more visible, while the mascot and a compact summary sit below it. The reference, observations and older-build limits are recorded in the research log. The old shared `.vcard` class made the result hero inherit the health card's background and shape; the two components now have separate selectors.

Pause actions retain the painted wooden board, with a readable paper control reference beside it on desktop and scrolling on smaller screens. The scoreboard, large map, emote wheel, loading and surrounding menus retain the existing painted family. Combat feedback clears from a full reading surface. Small-window map, emote and loading layouts are reviewed alongside the match HUD. No new artwork, rendering changes, gameplay changes, accounts or dependencies are introduced.

Compact notices have a reserved place above or between equipment cards. A compact screen shows one notice at a time and keeps an active connection error ahead of ordinary messages. Larger screens retain two notices. The short-window plane headline stays inside the central gap, and the portrait countdown clears the compass. An additional 24-case stress pass combines two notice requests with plane, countdown, coach, delivery, personal elimination and spectating states at all four capture sizes.

## Screen inventory

Each named state has its own before capture at both 1280x720 and 1470x956 in `evidence/codex-hud/`.

| Group | States checked | Baseline filename prefix |
| --- | --- | --- |
| Core equipment and combat | normal, low health/armour break/hit, pickup, heal, storm, reload/personal elimination, scope | `before-normal`, `before-fight-low`, `before-pickup`, `before-heal`, `before-storm`, `before-reload-kill`, `before-scope` |
| Movement and match start | plane, parachute, countdown, first-run coach, free fall, landing, swimming | `before-plane`, `before-parachute`, `before-countdown`, `before-coach`, `before-extra-falling`, `before-extra-landing`, `before-extra-swim` |
| Moments | delivery/toast, completed heal, Corrente upgrade, storm warning | `before-delivery`, `before-extra-heal-complete`, `before-extra-upgrade`, `before-extra-storm-warning` |
| Down and alternate modes | death, spectating, Corrente, Correria respawn | `before-death`, `before-watch`, `before-corrente`, `before-respawn` |
| Outcomes | Battle Royale win/loss, Correria result, Corrente win, rematch actions | `before-victory`, `before-result-loss`, `before-result-correria`, `before-result-corrente` |
| Match panels | scoreboard in all 3 modes, large map, pause, spectating pause, quick/full settings, leave confirmation, emote wheel | `before-scoreboard`, `before-scoreboard-correria`, `before-scoreboard-corrente`, `before-bigmap`, `before-pause`, `before-pause-watch`, `before-settings`, `before-leave`, `before-emote-wheel` |
| Surrounding flow | home, how-to, host/join dialogs, lobby, loading for all 3 modes | `before-home`, `before-how`, `before-host`, `before-join`, `before-lobby`, `before-loading`, `before-loading-correria`, `before-loading-corrente` |
| Edge states | storm/fall deaths, joining after elimination, respawn protection, weapon/helmet pickups, empty magazine/reserve, connection notice | `before-edge-*` |
| Identity and posture | maximum-width player names in personal elimination, death, spectating and results; mud, crouch, lean | `before-followup-kill-long-name`, `before-followup-death-long-name`, `before-followup-watch-long-name`, `before-followup-result-long-name`, `before-followup-mud`, `before-followup-crouch`, `before-followup-lean` |
| Online and expanded controls | host/guest rematch, guest lobby, lobby warmup, expanded bindings, settings footer, completed loading | `before-followup-result-host`, `before-followup-result-guest`, `before-flow-*` |

The final capture scripts cover 44 HUD/result states and 22 overlay/menu variants. Every state has before and after evidence at the two requested desktop sizes. Additional current captures cover 844x390 and 390x844. The new round modes have their own implementation and validation stream; their integration follows this HUD handoff.

The normal HUD occupies 17.24% of the 1280x720 window versus 12.12% before, and 12.86% of 1470x956 versus 9.09% before. This is the approximate union of painted rectangles on a 4 px grid, excluding full-screen effects and result panels. It documents the deliberate increase in map, weapon art and labels; it is not a rendering-cost measurement.

## HUD update cost

The unchanged `tools/qa/hud-tick.mjs` forces 1000 updates of the busy HUD at 1470x956. Three alternating before/after pairs ran in an exclusive Chrome window, one browser at a time, at DPR 1 with no CDP CPU throttle (1x). Baseline source is `6d82174ce5b467a5a6a80c8769c4a45821c3ecd8` with the HUD identical to b721224. The accepted measurement uses `d6d6837`; exact source hashes are included in the data. A final-source repeat is reserved for 13:18 to 13:20 and will be recorded separately.

| Variant | Median, all 3 runs | P95, all 3 runs |
| --- | --- | --- |
| Baseline with map | 0.8 ms | 0.9 ms |
| Initial redesign with broad overlay selectors, rejected | 1.4 ms | 1.5 ms |
| Corrected redesign with explicit overlay classes | 0.8 ms | 0.9 ms |
| Baseline and corrected redesign without map, one diagnostic pair | 0.0 ms | 0.1 ms |

The new broad relational CSS selectors caused extra style resolution when the existing canvas font setter ran. Open/close state now lives in explicit HUD classes. No minimap drawing or resolution changed. [Accepted timing data](evidence/codex-hud/tick-final.json) records the quiet-window timestamps, load, frequency, thermal samples and source hashes. [Rejected timing data](evidence/codex-hud/tick-rejected.json) is retained for audit. Hardware throttle counters were unavailable on this Linux host; this is not evidence that throttling was impossible.

## Validation and evidence

The QA production build includes `tsc --noEmit` and passes. The full earlier Vitest run passed 120 files and 1130 tests; the final source passes all 43 UI unit tests. The root integration stream repeats the entire project suite after all agents' changes.

Final runtime source is `2bca848`. All 176 state/size cases pass the strengthened audit. The 11 sizes, three scales (80%, 100%, 120%) and four poses (`hud`, `hud-full`, `hud-watch`, `hud-corrente`) pass with **zero faults across 132 combinations**. All nine relevant Chromium HUD, scope, results and settings tests pass. Scope assertions deliberately check the relocated map and match strip outside the lens. The 22 overlay variants at four sizes pass their font, panel and control-bound checks. Calm-motion and colour-blind captures and assertions remain green. [Validation details](evidence/codex-hud/validation.json) identify commands, source revisions and limits; [the final layout fault file](evidence/codex-hud/after-layout-faults.txt) is empty.

The state audit checks visible text at the 12 CSS px floor, weapon-label clipping, horizontal overflow and content inside the ammo, personal elimination and spectating cards. Its three new nested-content checks were first run against dc81f23 and reproduced the exact phone faults seen in full-size screenshots: a weapon outside the spectating card, a reload label over ammo, and a long victim name touching the heal hint. [The rejected cases are retained](evidence/codex-hud/nested-rejected.json). The fixes give reload its own row, make the spectating card full width, and let the personal confirmation use the available phone width. No text or evidence check was removed.

Every result button also passes Playwright's click-actionability check after scrolling and fits fully inside the viewport. These are reachability checks, not synthetic rematch requests. Separate `after-*-actions-*` captures show the reachable action area, including the guest's waiting state.

- [All 44 current states at 1280x720](evidence/codex-hud/after-1280x720.jpg) and [1470x956](evidence/codex-hud/after-1470x956.jpg).
- [All 44 phone states](evidence/codex-hud/after-compact-390x844.jpg) and [short-window states](evidence/codex-hud/after-compact-844x390.jpg).
- [22 overlay/menu variants at 1280x720](evidence/codex-hud/after-overlays-1280x720.jpg), [1470x956](evidence/codex-hud/after-overlays-1470x956.jpg), [844x390](evidence/codex-hud/after-overlays-844x390.jpg) and [390x844](evidence/codex-hud/after-overlays-390x844.jpg).
- [Winning page](evidence/codex-hud/after-victory-1280x720.jpg), [death recap](evidence/codex-hud/after-death-1280x720.jpg) and [personal elimination](evidence/codex-hud/after-reload-kill-1280x720.jpg).
- [Phone spectating](evidence/codex-hud/after-watch-390x844.jpg), [empty magazine](evidence/codex-hud/after-empty-ammo-390x844.jpg), [long victim name](evidence/codex-hud/after-kill-long-name-390x844.jpg), [win actions](evidence/codex-hud/after-victory-actions-390x844.jpg) and [guest result actions](evidence/codex-hud/after-result-long-name-actions-390x844.jpg).
- [Compact notice stress audit](evidence/codex-hud/notice-stress-audit.json), [portrait delivery plus connection error](evidence/codex-hud/notice-stress-delivery-390x844.jpg) and [short-window elimination plus connection error](evidence/codex-hud/notice-stress-kill-long-name-844x390.jpg).
- [Calm motion and colour-blind feedback at 1280x720](evidence/codex-hud/after-calm-1280x720.jpg) and [1470x956](evidence/codex-hud/after-calm-1470x956.jpg).

The visual review opened both complete desktop contact sheets in four readable sections, all four overlay contact sheets, the complete phone sheet and the compact edge cases at full size. The final notice follow-up was opened full size for the short plane headline, portrait countdown, delivery and connection error. Full-size reviews also covered normal combat, personal eliminations, death/loss/win, the long-name variants, menu/dialog controls, loading, the emote wheel and scrolled result actions. Root independently reviewed draft and final 1280x720 results and approved the visual direction. These screenshots use frozen real-render QA poses and real `GameUI` update/event paths; they are not hand-drawn mockups.

All repository evidence is our own game output. Third-party research pictures remain in the private reference directory. New round-mode screens are checked in their own stream after integration; this report's 44/22 inventory describes the three pre-existing modes.
