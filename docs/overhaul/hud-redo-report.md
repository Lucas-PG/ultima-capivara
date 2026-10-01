# HUD redo: report

Branch `hud-redo` (from `overhaul/aaa-autonomous`), 1 October 2026, on the Linux machine (headless Chrome on ANGLE GL EGL, AMD RX 9060 XT). Research: `docs/overhaul/hud-research.md`. Evidence: `docs/overhaul/evidence/hud-redo/`.

The user's brief, in their words: the HUD "doesn't fit the game at all ... too big, too bulky, and too modern", and "when I get a cure, it's very small, so it's difficult to see that I have a cure". The in-match HUD was rebuilt from its markup up: new layout, new look, new feedback for heals, pickups, damage and armour, and new QA tools to prove it at every size.

**Second pass (orchestrator review).** Three asks: look at the reference games themselves, not only text; make heals readable at a glance (which ones, how many, which is selected) and make a pickup draw the eye; use the painted icon sheet. Done: I viewed official screenshots, store images, wiki uploads and trailer frames of all ten reference games and compared them with our HUD at the same screen height (section 1 and `hud-research.md`); the heal bag is about 1.5 times bigger with painted heals, big counts and the selected heal named over it, and a pickup now flies into its slot (section 5); the ten painted icons replace the drawn stickers (section 9).

## 1. Research in short

Full notes with sources in `docs/overhaul/hud-research.md`. What shaped the design:

- **Corners only, centre clear** (Fortnite, Apex, Overwatch; Game Developer on trained peripheral vision). We keep the four-corner convention but move the four weapon boxes from the bottom centre into the bottom-right cluster, freeing the whole bottom centre.
- **Temporary, essential information in the eye line** (Game Accessibility Guidelines). Heal progress, pickup prompt and elimination confirmation sit in one column right under the reticle; the pickup pop sits on the heal bag it changes.
- **Animate what must be noticed, nothing else** (Caliber: players ignore elements unless animated and highlighted). Motion only on change: a heal landing, a pickup, low health, armour breaking, a hit.
- **Too much HUD is no HUD** (Caliber), **minimal corners, loud events** (Sea of Thieves), **simpler shapes and more contrast** (Riot's interface pass), **rounded heavy type** (Fall Guys).
- **Show the heal working and where it ends** (Apex's green progress bar, the Season 23 heal icon flash at low health).
- **Shield break is its own event** (Fortnite's glass-break cue).
- Accessibility guardrails: colour never alone (XAG 103, IGDA), text floor (XAG 101 and the project's 12 px floor).

**What the reference images changed (second pass).** Side by side at 1470x956 with Fortnite (Chapter 1 in match), Rumbleverse (in match), Apex (trailer frames), Overwatch, Brawl Stars, Fall Guys, Splatoon 3, Sea of Thieves, Ratchet and Clank and Valorant (full list with sources in `hud-research.md`):

- Heals in Fortnite are hotbar slots as big as the guns (about 56 px at our screen height, counts about 18 px); Rumbleverse draws its heals as big painted food (about 90 px) on a numbered cross. Ours were 37 px with 13 px counts: the clearest shortfall. Now 53 px slots, 50 px painted art breaking out of the slot, 18 px counts, the selected heal raised in gold and named with its key.
- Fortnite lists each pickup next to the inventory; ours already popped above the bag, and now the picked heal also flies from under the reticle into its slot, which pops with a "+1" (the weapon tab that gets a new gun pops too).
- Rumbleverse and Brawl Stars use thick, segmented bars with big outlined numbers; Overwatch segments health in 25 HP chunks. Our health bar went from 14 to 19 px tall and longer, with 25-point chunks, and its number from 22 to 26 px.
- Apex tints the whole weapon card in the rarity colour; ours now does too (Comum stays paper).
- Fall Guys, Brawl Stars and Splatoon confirm the sticker language: heavy rounded type, dark outlines, few elements; Sea of Thieves and Valorant confirm that the rest can stay small and quiet. Kept as designed.

## 2. The design and why it fits the game

**Cream paper stickers.** Every plate is the same sticker: cream paper (`#fffaf0` to `#f7e6c2`), a 2.5 px warm brown ink outline (`#3a2418`, the menus' brown), a hard 3 px drop in the same brown, round corners. It is the menus' family (paper, wood brown, candy gold) at a fraction of the size, so the HUD reads as part of the cartoon island rather than a teal tech overlay. Opaque cream with a dark outline holds up on both the bright plaster and sand and the dark interiors, which translucent plates did not.

**The game's own fonts.** Numbers that must read in a split second (health, armour, ammo, clock, counts) are Dela Gothic One, the chunky display face of the menus; short labels are Mochiy Pop One. Barlow Condensed (thin, condensed, the "too modern" look) is gone from the HUD.

**Painted icons.** Heart, shield, players, crosshair, crown and clock reuse the painted icons; the heals, vest, helmet, ammo, storm and parachute are new painted icons from the same family (section 9), with the first pass's drawn SVG stickers kept as a fallback.

**Small and light.** Laid out at 1600x900 and scaled by the existing `--ui` (hudScale times "Tamanho da interface"). The design minimum text went from 13 to 14 px, which lets the scale floor drop from 0.923 to 0.858, so small windows (1280x720) get a smaller HUD without any text under the 12 px floor.

**Colour language.** Health green, warming to gold under 60 and red under 30 (the colour itself is the warning); armour teal in four segments (one açaí, two for a vest); healing green; storm purple; you and your eliminations gold; danger terra red.

## 3. Every element, before and after

| Element | Before | After |
| --- | --- | --- |
| Vitals and portrait | 340 px teal plate, Barlow numbers, azulejo tile behind | 60 px portrait sticker overlapping a 256 px card; a thick 19 px health bar in 25-point chunks with a 26 px number; armour bar (four segments) over the health bar; Dela numbers; bars scale on the compositor with a pale damage trail; health warms green, gold, red; one tag on the card: "Colete quebrou!", "Vida baixa!" or "Protegida"; helmet chip on the corner |
| Low health | coral number, bar brightness pulse, red dotted vignette | red bar and number, the card's outline pulses red, the heart beats, "Vida baixa!" tag, the suggested heal bounces, red dotted vignette kept |
| Armour breaking | nothing | on you: the armour bar shakes and a shatter streak flashes over it, "Colete quebrou!" for 1.6 s; on an opponent: a dashed turquoise ring hit marker and "QUEBROU!" by the reticle (uses the simulation's existing `armorBreak` flag) |
| Taking damage | vignette flash, arcs | the same arcs and vignette, plus a short jolt of the vitals sticker |
| Consumables | five small teal chips, 22 px icons, nothing selected | "the bag": 58 px stickers (53 px at 1470x956) with the painted heal (50 px) breaking out of the top, a key chip and a big count pill (18 px); the heal that helps most right now (never one the host would refuse) is raised in candy gold with a gold count, bounces at low health, and is named over the bag with its key and what it does ("6 Kit médico · vida cheia"); the one in use turns green and is named instead |
| Heal in progress | a thin bar and "Remendando... 2,1 s" low under the centre | under the reticle: the item in a ring that fills, "Remendando", "2,1 s · vida cheia"; on the vitals card a pulsing striped preview from current health (or armour) to where the heal ends; the heart beats; on finish "+15" (or "Vida cheia!", "+25 colete") floats off the bar and the bar flashes |
| Pickups | a muted 15 px feed line ("Pegou kit médico") among the kill feed | a heal flies from under the reticle into its slot (0.72 s, transform only), which squashes with a gold ring and a "+1"; a weapon's tab pops the same way; plus a pop above the bag: the item art in a round badge, "+1 Kit médico", "vida cheia · 2 na bolsa"; heals get a green border, a sunburst badge and 3.2 s; weapons show the gun and their rarity colour ("Doze", "Lendária · na mão"); armour, helmet and ammo say what they did; heals pop from the bag count itself, so a heal from any source shows |
| Weapon boxes | four 78x52 boxes in the bottom centre with ammo counts | four 48x32 tabs on top of the magazine card at the bottom right, the gun thumbnail, key chip, rarity stripe; the active tab is candy gold and lifted; an empty tab shows a faint silhouette |
| Magazine card | 220 px teal card, 56 px number | 192 px paper card tinted in the rarity colour (Comum stays paper): weapon name, rarity chip (only above Comum), fire mode, 36 px Dela magazine number and reserve; a rarity stripe on the left edge; red pulse under 20%; "Recarregando" chip while reloading; "R recarrega" when the magazine is empty |
| Compass | 360x50 teal ribbon | 256x30 paper tape, heading on a small ink tab under the needle, the safe zone as a gold diamond (pinned to an edge when behind) |
| Safe zone and storm | teal pills | paper pill "Refúgio a 42 m" with a gold arrow (hidden at the edge instead of reading 0 m), purple "Na tempestade −4/s" pill |
| Minimap | 224 px teal frame | 162 px, thick ink frame, district name on a paper label inside the map |
| Match strip | 3 labelled teal cells | three paper pills: players left, eliminations, clock; the clock pill turns purple with a storm cloud while the storm closes, phase dots under the time; Correria shows rank and time, Corrente rank and steps |
| Corrente ladder | teal plate | 236 px paper card, nine pips, "Próxima: Sniper" |
| Kill feed | 5 lines, portraits and distances | 3 short paper lines (2 on short windows), killer, gun silhouette, a gold "!" for a headshot, victim; your lines gold, "Você" in terra; your death in terra |
| Crosshair, hit markers | thin | crosshair unchanged (it follows the colour setting); hit marker ticks a little chunkier with a brown outline; headshot diamond, kill ring and the new armour-break ring all differ by shape as well as colour |
| Damage numbers and callouts | Barlow with dark shadow | Dela with a full brown outline: cream body hits, gold headshots, "NA CACHOLA!", "POF!", "QUEBROU!" |
| Elimination confirmation | teal pill | tilted paper sticker with a terra outline: victim portrait, "Você pegou", the name, your count in a gold coin |
| Reload ring | gold ring | unchanged design; its fill now actually shows (a CSS rule overrode the SVG attribute; now set as a style) |
| Death card | teal card | paper card, gold "#14" stamp with an ink outline, killer portrait in their kit colour, weapon, distance, what they had left; Correria's respawn ring (its number was hidden behind the ring, fixed) |
| Watch bar | teal | paper card with the watched capybara's kit colour on top, health and armour bars, previous and next keys |
| Banners and match moments | 72 px banner, big stamps | the same stamped style, a size smaller (banner 56 px, moments 22 to 34 px), moments moved below the safe pill |
| Toasts | teal chips | paper pills at the bottom centre, which the new layout keeps free (raised while watching) |
| First-run coach | teal card | tilted paper card, 300 px |
| Plane and parachute | teal pills | paper posture chip ("No avião", "Paraquedas"), outlined altitude number and hint pill |

## 4. Footprint before and after

Measured by `tools/qa/hud-boards.mjs` on every board state: the union of everything the HUD paints (boxes with a background or border, text, images), clipped to overflow containers, on a 4 px grid, as a share of the window. Same metric on both builds (the old build served from a temporary worktree of `991e876`).

| | 1280x720 | 1470x956 (the user's MacBook Air) |
| --- | --- | --- |
| Normal play | 21.7% to 12.1% | 14.3% to 9.1% |
| Mean of 16 states | 21.9% to 12.2% (44% less) | 14.5% to 9.2% (37% less) |
| Busiest (in the plane) | 30.6% to 15.4% | 20.5% to 11.6% |

All 16 states: `docs/overhaul/evidence/hud-redo/before-footprint.json` and `after-footprint.json`. At 1280x720, part of the gain comes from the lower scale floor (section 2). The first pass reached 7.9% at 1470x956; the second pass spent about 1.2 points of it on bigger heals and a thicker health bar, on purpose: the heals were the user's complaint, and the references show heals as large as the guns.

## 5. Heal and pickup feedback

A heal now announces itself four times, each where the eyes already are:

1. **Picking it up:** the painted heal appears under the reticle where you picked it up, grows, and flies in an arc into its slot in the bag (0.72 s, compositor transform only, its landing point from the fixed layout so nothing reads layout); the slot squashes with a gold ring and a green "+1"; and the pop above the bag says what it is and how many you carry ("+1 Kit médico · vida cheia · 1 na bolsa", green border, sunburst badge, 3.2 s).
2. **Knowing what you carry and which one to use:** every heal you carry is a 53 px sticker with its painted art and an 18 px count; the suggested heal (`suggestedHeal`: medkit under 50 health, bandage under 75, then rapadura or guaraná, açaí once health is safe; never one the host refuses) is raised in candy gold with a gold count, bounces when health is low, and is named over the bag with its key ("6 Kit médico · vida cheia"), plus the "Vida baixa!" tag.
3. **Using it:** the ring under the reticle with the time left and what it does, the striped preview on the bar it fills, the heart beating.
4. **Finishing:** the gain floats off the bar ("+15", "Vida cheia!", "+25 colete") and the bar flashes.

Measured on screen at 1470x956 (DPR 1, interface 100%), the user's screen size:

| | before the redo | first pass | now | Fortnite, same height | Rumbleverse, same height |
| --- | --- | --- | --- | --- | --- |
| Heal slot | 31 px chip | 37 px | 53 px | about 56 px | about 90 px art |
| Heal art | 20 px drawn icon | 29 px drawn | 50 px painted | about 40 px | about 90 px |
| Count | 15 px text in the chip | 13 px | 17.5 px in a 30x26 pill | about 18 px | none |
| Selected heal | none | gold ring | raised gold slot, gold count, named with its key | slot outline | none |
| Pickup | a 15 px feed line | a pop above the bag | a flight into the slot, slot pop with "+1", the pop | a list line by the inventory | n/a |

Evidence: `heals-before-after-1470x956.jpg` (the same pickup moment in the three builds) and `after-pickup-flight-1470x956.jpg` (the medkit mid-flight).

The heal rules are mirrored from the simulation (`HEAL_INFO`, `canUseHeal`, `healTarget` in `src/ui/hud-logic.ts`) and a test fails if the simulation's times, amounts, caps or refusals change without the HUD.

## 6. Layout at every size

`tools/qa/hud-review.mjs` now checks 11 window sizes (1280x720, 1470x956, 1600x900, 1920x1080, 2560x1440, 2560x1080 and 1280x548 for 21:9, 1024x640, 960x600, 844x390 phone landscape, 390x844 phone portrait) at interface scale 80, 100 and 120%, in the poses hud, hud-full, hud-watch and hud-corrente: 132 captures. It checks every plate, including each child of the stacked columns (every feed line and pickup pop), for overlap and for leaving the window, and it now also reports any visible HUD text drawn under 12 CSS px (computed size times every CSS zoom above it) and any number or label that spills out of its own box (added in the second pass after live play showed the health "100" clipped at 1280x720).

- **Before:** 222 faults with the extended size list (the old list of 4 sizes had 0); phones and 21:9 overlapped badly, and match-moment detail text rendered at 11.2 px (`before-layout-faults.txt`).
- **After:** **0 faults** after the second pass too (`after-layout-faults.txt`), and a Retina capture at 1470x956, DPR 2 (`after-retina-1470x956-dpr2.jpg`). Sizes sheet: `after-sizes.jpg`.
- Narrow windows (portrait phones, under 600 layout px) move the compass to the top left, put the coach and ladder under the map column, slim the vitals card and weapon tabs, wrap the bag three to a row with 52 px slots, leave the pickup card out (the flight and the slot pop still announce it) and place moments and the death card lower. Short windows (under 640 layout px tall, 21:9 laptops and landscape phones) shrink the map and the bag slots (48 px), keep two feed lines and one pickup pop.

## 7. Accessibility

- The colour-blind hit palette still swaps the marker colours (checked: the headshot callout turns cyan); every marker also differs by shape, including the new armour-break ring.
- Reduced motion (setting or OS) removes every new movement (the pickup flight, bag bounce and squash, tab pop, vitals jolt and shatter, pickup slide, heart beat, ghost pulse, number rises) and keeps fades, like the rest of the game; the slot still flashes its "+1". Board: `after-colorblind-reduced-motion-1470x956.jpg`.
- Text: the scaled HUD's design minimum is 14 px, so its smallest text is 12 px or more at every size and interface scale (static test plus the live check in the review tool). Contrast: brown ink on cream throughout; white text only on dark or saturated fills with an outline.

## 8. Performance

Rules kept: the 75 ms HUD throttle, no layout reads in the HUD code (the existing test still passes), no backdrop blur, no filters, no animated box-shadow. New: the vitals bars scale with `transform` instead of animating `width`; the bag slots are cached across ticks; all entrance motion is transform and opacity.

Measured in live practice matches at 1470x956 (`tools/qa/hud-perf.mjs`: the `hud` span around `GameUI.update`, plus the page's style and layout time from the DevTools protocol), old and new builds back to back:

| | old | new |
| --- | --- | --- |
| Correria, style recalculation per frame | 0.18 ms, 0.18 ms | 0.23 ms, 0.19 ms |
| Battle royale, style recalculation per frame | 0.19 ms, 0.21 ms | 0.33 ms, 0.21 ms |
| Layout per frame | 0.02 ms | 0.02 ms |
| `hud` span p95 | 0.3 to 1.2 ms | 1.1 to 1.2 ms |
| One full HUD tick (`tools/qa/hud-tick.mjs`, 300 ticks) | 0.7 ms median | 0.8 ms median |
| One HUD tick without the minimap | 0 to 0.1 ms | 0 to 0.1 ms |

Second pass, same probes: one HUD tick 0.8 ms median, 0.9 to 1 ms p95; Correria style 0.19 ms and layout 0.015 ms per frame; battle royale style 0.19 ms and layout 0.02 ms per frame. The pickup flight is one element animated with the Web Animations API (transform and opacity) and removed when it lands.

The two builds write the same nodes per tick (compass strip and heading, safe arrow, clocks; counted with the probe's DOM write log). The style numbers vary more between runs than between builds. The only consistent difference is about 0.1 ms per HUD tick in the minimap canvas draw (the same 480 px canvas, now shown smaller), roughly 0.01 to 0.02 ms per frame averaged over the throttle.

## 9. Assets

- Ten painted icons, `public/assets/ui/icon-bandage|medkit|guarana|acai|rapadura|vest|helmet|ammo|storm|parachute.webp` (128x128, real alpha, 4.7 to 6.4 KB, 56 KB together). The orchestrator generated the sheet on the Mac with Codex (gpt-6-astra) from my exact request (Codex hangs on this Linux machine, so I did not call it here). I cut each icon along its own alpha blob so no neighbour slivers remain, scaled it to 112 px inside a 128 px canvas like the existing set, and judged them in the HUD on cream, on the island and at 32 px: clearly better than the drawn stickers, which stay as the fallback. Provenance, prompt, hash and edits in `docs/assets.md`.
- Frames, bars, rings and the flight are CSS and inline SVG.
- Reference images of other games were collected only as a private reference outside the repository (`~/capivara-hud/refs/research/`); none is committed or shipped.
- Barlow Condensed is no longer imported by the HUD (about 45 KB of WOFF2 less); the package can be dropped at merge if nothing else uses it.

## 10. Tests

- `npx tsc --noEmit` clean, `npx vitest run --maxWorkers=6`: 115 files, 1066 tests pass, `npm run build` passes (the existing chunk-size warning only).
- `tests/ui.test.ts`, updated with intent: the 14 px scaled HUD minimum (and 13 px for overlays that never scale); the narrow layout only on portrait phone widths; the short layout only on short windows.
- New: heal table mirrored from the simulation (times, amounts, caps, refusals), heal preview end values, suggested heal (never a refused one), bag gains (none on the first tick or a reset), pickup copy (short enough for a phone), health tone thresholds; second pass: the weapon tab pop (only when a box receives a different gun) and the pickup flight's landing point in the bag (desktop row and wrapped phone rows).
- Live, second pass: a battle royale with bots from the plane to the ground with the new HUD (the driver was eliminated before it looted a heal, so the flight was judged on the real `GameUI` update and event path in the QA build, at both sizes, rather than in a bot match).
- Live: Correria with bots through the real input layer, worker and events (low health via the QA damage hook, kills, reload), and a battle royale from the plane through the parachute, looting, a bandage under the reticle, the death card and watching (`live-correria-low-health.jpg`, `live-battle-royale.jpg`).

## 11. Changes outside the HUD files

All product changes are in `src/ui/ui.ts` (HUD markup, update and events only; the settings dialog code is untouched), `src/ui/hud.css`, `src/ui/hud-logic.ts` and `src/ui/icons.ts`. Besides those:

- `src/ui/ui.ts`: a QA-only `window.__hudQA` handle (compiled out unless `VITE_QA=1`) so the board tool can drive HUD states through the real update path. `tests/visual/qa-hook.ts` was not changed.
- `tools/qa/*.mjs`: the ANGLE backend by platform (Metal on macOS, GL EGL on Linux), the exact same lines as the holding branch's commit `8cbbce0`, in the same 26 files, so the merge is clean. `perf-probe.mjs` and the other perf tools were left alone (the performance agent's files).
- New tools: `tools/qa/hud-boards.mjs` (state boards and footprint; saved settings for colour-blind and reduced motion boards), `tools/qa/hud-perf.mjs` (live HUD cost and DOM write log), `tools/qa/hud-tick.mjs` (tick micro-benchmark); `tools/qa/hud-review.mjs` extended (sizes, DPR, text floor, text spilling its box, column children).
- New assets: the ten painted icons in `public/assets/ui/`.
- **Settings for the merge:** none. "Tamanho da interface" works as before; its effective range at small windows is slightly wider because the scale floor dropped from 0.923 to 0.858.
- The dev server ran on port 5186 (5176 belonged to another agent's snapshot server).

## 12. Known issues and follow-ups

- Fonts and colours were judged through Mesa on Linux; the orchestrator re-checks on the Mac.
- The board tool sets HUD states through `GameUI` directly (the same calls a match makes); heals, pickups and armour breaks were also seen live, but not every combination of them at once.
- The minimap tick cost (about 0.1 ms per HUD tick) could drop by drawing a smaller canvas; the label and compass constants in `drawMapView` assume 480 px, so it was left for a separate change.
- The Playwright visual snapshots (`tests/visual`) differ for every HUD view and need re-approval.
- The heal flight was not caught in a bot match (the play driver does not seek heals); it was judged on the real update path in the QA build.
- Ratchet and Clank and Overwatch 2 official images hide their full in-match HUD; those two comparisons rest on small Wikipedia screenshots and trailer frames.
- Elite bots carry a star in their names in the feed (the simulation names them so; not a HUD change).
