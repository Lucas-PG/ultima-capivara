# HUD research: small, cartoon, and impossible to miss where it matters

## Victory banner follow-up, 2 October 2026

The user subsequently asked for Fortnite's winning-screen impact. I opened these actual match images at full size before changing the winner layout:

| Private file viewed | Source | Direct observation |
| --- | --- | --- |
| `fortnite-victory-official-2017.jpg`, 1280x720 | [Epic: FNBR NVIDIA ShadowPlay Highlights, 10 November 2017](https://www.fortnite.com/news/shadowplay-highlights), official `ShadowPlay_Victory` image | A wide banner occupies the upper centre. The number one extends outside its strip, the victory phrase is dominant, the island and player remain clearly visible, and next actions stay separate at the lower right. |
| `fortnite-victory.jpg`, 1280x720, opened again | [Secondary gameplay capture](https://www.game-outlet.nl/blogs/gaming/fortnite-battle-royale/) | The same broad upper banner appears over the final elimination, with very little competing information. The surviving player and surrounding battle scene carry the celebration. |

`fortnite-victory-comparison.jpg`, a contact sheet of these two images, was also opened after their full-size review. Both are older builds; they are evidence for this visual hierarchy, not a claim about Fortnite's current UI. The official 2017 gameplay trailer was located on Fortnite's verified channel, but no video frame was downloaded or used as visual evidence. The official match screenshot above provides the usable primary reference.

The resulting direction is our own broad cream-paper win banner, a protruding gold placement stamp, brown display lettering and crown, with more of our island showing. The trophy capybara and a compact paper summary sit below it. The loss layout keeps its separate own-placement hierarchy. The wording, artwork and colours remain Ultima Capivara's; no Fortnite asset or phrase is copied into the game. Actions still become available after 300 ms and calm motion remains supported.

## Organisation and match outcomes: image research, 2 October 2026

This section records the new HUD pass. These are observations from images actually opened in this run, not recollections of playing the games. It supersedes the earlier suggestion that every game puts its minimap on the right. The user specifically requested a map at the upper left, readable weapon slots, clearer personal eliminations, and stronger death and victory presentations.

Private references are in `/home/lucas/codex-team/refs/hud/`; the prior collection in `/home/lucas/capivara-hud/refs/research/` was read only. No reference image is shipped or committed. `viewed-reference-sheet.jpg` is the new contact sheet, opened after the individual images. Sources below are the pages containing the images; `downloaded.json` privately records exact image URLs. Community or press captures are identified rather than presented as official art.

| Image opened at its available full size | Source and limits | Observed detail and design consequence |
| --- | --- | --- |
| `bo6-hud.jpg`, 1920x1080 | [Official Black Ops 6 controls guide](https://www.callofduty.com/guides/blackops6/training/call-of-duty-guides-black-ops-6-multiplayer-training-controls), `BO6-CUSTOM-HUD.jpg`. A settings screenshot with the actual standard in-match HUD preview. | Map upper left, player health lower left, and a large magazine number with smaller reserve lower right. Keep those stable anchors. The preview is not evidence for exact text sizes. |
| `fortnite-gameplay-zapotron.png`, 2560x1440 | [Fortnite Wiki gameplay image](https://fortnite.fandom.com/wiki/File:Zapotron_(Gameplay)_-_Screenshot_-_Fortnite.png), prior collection, copied privately. Older Chapter 1 build. | Five large item squares form a single bottom-right row. Each item has a clear silhouette and key; the selected slot has an outline. Our four guns should read as an inventory row, not little tabs over the ammo card. |
| `apex-gameplay.jpg`, 421x237; `sheet-apex-hudframes.jpg` | [Apex Wikipedia gameplay image](https://en.wikipedia.org/wiki/Apex_Legends); [official Steam trailer source](https://store.steampowered.com/api/appdetails?appids=1172470), prior collection. Full-HUD image is small; trailer sheet has cropped counters. | Actual full HUD has the map upper left and match status upper right. Trailer crops show a broad gun silhouette beside dominant ammo. Use corner separation; do not infer sizes from small or cropped references. |
| `valorant-gameplay.jpg`, 421x237 | [Valorant Wikipedia gameplay image](https://en.wikipedia.org/wiki/Valorant), prior collection. Small source. | Upper-left map, top-centre match state, uncluttered lower health/ammo. Supports separating navigation, match state, and equipment, not a font-size recommendation. |
| `warzone-040.webp` and `warzone-041.webp`, 1920x1080 | [Official Return to Verdansk article](https://www.callofduty.com/blog/2025/03/call-of-duty-warzone-verdansk-map-return-intel-drop), images 040 and 041. | 040 groups contextual weapon details. 041 is an actual killcam: explicit killed-by name on a bottom strip, weapon silhouette and name beside it, attacker detail at right. Label the eliminator, make the name dominant, and put weapon/distance on a distinct second line. Only show data existing game events provide. |
| `apex-death-recap.jpg`, 2048x1152 | [Player-posted Apex recap](https://www.reddit.com/r/apexlegends/comments/113b8qj/apex_legends_4nniversary_playapexshop_giveaway/), linked Imgur image. Community capture. | The eliminator has a labelled identity panel separate from damage history. Our smaller recap can achieve that hierarchy without adding a damage-log system. |
| `valorant-combat-report.png`, 621x555 | [Valorant News combat-report image](https://x.com/ValorINTEL/status/1234421570845728770), cropped HITSCAN capture. Secondary, early build. | Killed-by label above a large player name; damage rows subordinate. Use an explicit pt-BR eliminator label instead of expecting the player to interpret a name under a generic death title. |
| `pubg-eliminations.jpg`, 1920x1080 | [Official PUBG console patch 13.1](https://pubg.com/en/news/1722?category=patch_notes), `06_A.jpg`. Initially saved as `pubg-victory.jpg`; inspection showed elimination feedback, so it was renamed. | Victim names below the aim, above a larger running kill total. Our personal confirmation should explicitly name the elimination and the victim. Implementation review found the local event counter can disagree with the snapshot, so the reliable total stays in the match strip. |
| `pubg-results.jpg`, 1920x1080 | [Official PUBG update 43.1](https://www.pubg.com/en/news/11057), `M1mgNA3U.jpg`. Intense Battle Royale results, not standard solo mode. | A large victory phrase and placement precede orderly stat columns. The player's row is highlighted independently of the winning team. Our results should distinguish the player's placement from the champion, including on a loss. |
| `fortnite-victory.jpg`, 1280x720; `fortnite-death.jpg`, 1024x576 | [Victory capture](https://www.game-outlet.nl/blogs/gaming/fortnite-battle-royale/), [death capture](https://mein-mmo.de/fortnite-battle-royale-leitfaden-eltern/). Secondary, older builds. | Victory gets one unmistakable banner. Death puts the eliminator on the largest coloured strip, with placement below. Take that hierarchy, not the colours or typography. |
| `overwatch-victory.jpg`, 1780x1001; `ow-screenshot.png`, 421x237 | [Overwatch 2 event capture](https://esports.gg/news/overwatch/overwatch-2-freezethaw-elimination-2024/), secondary; [earlier gameplay screenshot](https://en.wikipedia.org/wiki/Overwatch_(video_game)), prior collection. | Event capture has one dominant victory word over the live world, segmented health, and separate weapon/ammo. The small screenshot is original Overwatch, so it supports no OW2-specific claim. |
| `fallguys-shot3.png`, 1919x1079; `fallguys-winner.jpg`, 1920x1080 | [Fall Guys Wiki race capture](https://fallguysultimateknockout.fandom.com/wiki/File:Screenshot_2025-07-31_094306.png), prior collection; [Interface in Game winner capture](https://interfaceingame.com/screenshots/fall-guys-ultimate-knockout-winner/), secondary. | Race has distinct corner ribbons for goal and qualifying count. Winner capture celebrates one character with one bold label. Let our painted capybara carry victory while stats live in their own paper panel. |
| `splatoon3-turf.jpg`, 420x236; `sheet-splatoon.jpg` | [Splatoon 3 gameplay image](https://en.wikipedia.org/wiki/Splatoon_3) and [Nintendo gallery](https://www.nintendo.com/us/store/products/splatoon-3-switch/), prior collection. | Turf War clusters status icons with the timer across the top. Gallery supports bold cartoon typography and illustrated characters; most promotional images hide the HUD. |

Other sheets actually opened: `sheet-wiki.jpg`, `sheet-apex-hudframes.jpg`, `sheet-splatoon.jpg`, and `sheet-fallguys.jpg` from the prior collection, plus new `sheet-wz.jpg`. Rejected as HUD evidence: the Fall Guys Steam sheet is only a logo; `fallguys-shot1.png` is a promotional article and `fallguys-shot2.png` a trailer frame; eight Warzone guide action shots and `warzone-042.webp` hide the HUD. The Splatoon splat-message page returned 403, supplying no image. These gaps are not filled from memory.

Direction derived from the viewed images: larger upper-left map; separate upper-right match strip and public feed; broad weapon cards in one bottom-right row below the ammo readout; explicit personal elimination wording near the reticle; labelled eliminator recap; outcome-first results. Cream paper, brown outlines, painted art, Mochiy Pop One and Dela Gothic remain the family. Responsive layouts must preserve the 12 CSS px floor; references do not override it.

1 October 2026. Web research for the HUD redo (branch `hud-redo`). The user's brief: the current HUD is "too big, too bulky, and too modern" for a cartoon game, and a heal is "very small, so it's difficult to see that I have a cure". Findings carry their source; a Sources list closes the document. **[s]** means the finding was read from a search excerpt because the page could not be fetched; **(secondary)** means a guide, press or community source rather than the developer. The earlier research for the UI pass (`docs/overhaul/ui-research.md`) covers kill feeds, death cards and spectating in depth; this document only repeats what bears on the HUD's look, size and feedback.

No third-party image was saved or committed; everything here is text.

## What we take, in one list

1. **Corners only, centre clear; the four-corner convention is a trained reflex.** Health bottom left, weapon and ammo bottom right, map top right, compass top centre (Fortnite, Overwatch, Apex; Game Developer on peripheral vision). The redo keeps the convention and moves the four weapon boxes out of the bottom centre into the bottom-right cluster, so the whole bottom centre is free.
2. **Temporary, essential information goes where the eyes already are.** The Game Accessibility Guidelines say permanent elements may live at the edges, but temporary essential ones must not (loss of peripheral vision makes them invisible). So the heal in progress, the pickup prompt and the elimination confirmation sit in one column just under the reticle; the pickup pop sits right above the heal bag it changes.
3. **Animate what must be noticed, keep the rest still.** Caliber's testing: "players will ignore certain UI elements unless they're animated and highlighted". The redo spends motion only on change: a heal landing in the bag (squash and a gold ring), the pickup pop, the suggested heal bouncing at low health, the armour bar shattering, the vitals jolting on a hit. Nothing idles.
4. **Too much HUD is no HUD.** Caliber: "too many visuals in the HUD is practically the same as having none". Sea of Thieves keeps only a faint health bar and ammo counter and moves everything else into the world or into audiovisual feedback. The redo halves the footprint and drops labels the icons already carry.
5. **Cartoon type: rounded, heavy, high contrast.** Fall Guys keeps its playful type in the HUD but "turns more readable": a bold rounded sans for timers and counts, heavy weights and clear contrast over busy, bright sets (secondary). The redo uses the game's own display families: Dela Gothic One for the numbers that must read in a split second, Mochiy Pop One for short labels, brown ink on cream paper.
6. **Simplify shapes, raise contrast.** Riot's interface pass: "remove a lot of visual clutter", "increased the screen's contrast, pushed color values, and simplified our shape language". The redo uses one sticker shape (cream paper, 2.5 px brown outline, hard drop) for every plate.
7. **Test every element against light, dark and mixed backgrounds** (Caliber). Our island is bright (sand, sky, plaster) and dark (interiors, night storm), so the stickers are opaque cream with a dark outline rather than translucent plates, and floating numbers carry a full brown outline.
8. **Green means healing; colour is never alone.** Caliber colour-codes healing green; XAG 103 and the IGDA accessibility SIG say colour must never be the only channel. The redo's heal language is green (ring, pop, preview stripes) and always paired with an icon, a number and motion; the colour-blind hit palette and marker shapes stay.
9. **Show the heal working and where it will end.** Apex fills a green bar while an item is used so you know how far you are from returning to the fight (secondary), and Season 23 flashes the heal icon at low health instead of adding widgets (secondary [s]). The redo shows the heal under the reticle as the item in a filling ring with the time left and what it does, previews the end value on the health or armour bar as a pulsing striped segment, and floats the gain off the bar when it lands.
10. **Readable text floor.** XAG 101: 18 px body text at 1080p on PC (an aspirational floor for long text). Our HUD text is short labels and numbers; the project's floor is 12 CSS px at any size, and the redo raises the design minimum to 14 px so it holds at 1280x720.
11. **Shield break is its own event.** Fortnite's shield break has a distinct glass-shatter cue players learn to hunt for (secondary). The redo gives armour breaking its own feedback both ways: on you (the armour bar shatters, "Colete quebrou!" tag) and on the opponent (a dashed turquoise ring marker and "QUEBROU!" next to the reticle).
12. **Diegesis taxonomy as a tool, not a rule.** Fagerholt and Lorentzon's diegetic, non-diegetic, spatial and meta categories: our capybara game is a fast multiplayer shooter, so core numbers stay non-diegetic; low health and storm use meta screen-edge dots (cheap, already in the art style); items in the world keep their spatial glow.

## Reference images viewed (second pass, 1 October 2026)

The first pass of this research was text only. For the second pass I collected official screenshots, store images, wiki uploads and frames from official trailers of every reference game, viewed them as contact sheets and at full size, and compared them with our HUD at the same screen height (1470x956). The images are a private reference in `~/capivara-hud/refs/research/` on the build machine, never in the repository and never shipped.

| Game | Source | Moment | What I took |
| --- | --- | --- | --- |
| Fortnite | Fortnite wiki, "Zapotron (Gameplay) - Screenshot" (2560x1440, Chapter 1 in match) | looting a legendary sniper next to a chest | Heals are full hotbar slots as big as the guns (about 56 px at our screen height) with big counts (about 18 px); pickups list next to the inventory ("x5 Bandage", "x30 Pierre"); the pickup prompt is a rarity-coloured card by the item. Our bag slots grew from 37 to 55 px with 18 px counts, and every pickup gets its own pop next to the bag. |
| Fortnite | Wikipedia, "Battling in Fortnite" (small) and the wiki's "Inventory - User Interface" | fight; inventory screen | Wide health and shield bars with numbers at the bottom centre; inventory slots are plain squares with the count bottom-right. |
| Rumbleverse | Rumbleverse wiki, "UI - Rumbleverse" (1920x1080, in match) | falling into the city with a full kit | The closest match to our art: heals are big painted illustrations (roast chicken, drumstick, about 90 px at our height) on a numbered cross of slots, with small green hearts marking food as healing; thick segmented health and stamina bars with italic outlined numbers ("1600/1600"); big painted special-move art. This is the strongest argument for painted heal art that breaks out of its slot, and for thicker segmented bars. |
| Apex Legends | frames from the official "Marked Gameplay Trailer" (Steam, DASH video, ffmpeg) and Wikipedia's gameplay screenshot | holding the Nemesis; a ping wheel fight | The weapon card is tinted in the rarity colour as a whole, with a slanted outline, the magazine as the biggest number; health is a thin bar at the bottom left. We tinted the magazine card by rarity. |
| Overwatch 2 | Wikipedia, "Overwatch screenshot" (small, in match); the Overwatch wiki "HealthBarGuide" | Tracer in a fight; the health segment diagram | Health in chunky slanted 25 HP segments; ultimate charge at the centre bottom; ammo bottom right. Our health bar now shows 25-point chunks like the armour. |
| Brawl Stars | Google Play store screenshots (12, 1920 wide), in-match frames from Showdown, Gem Grab, Ranked | Showdown with three brawlers; Gem Grab with a big count | Very heavy rounded type with a dark outline, bright slanted mode ribbon ("SHOWDOWN"), health numbers over characters, big counts ("10") with a drop. Confirms Dela Gothic numbers with an ink outline over the world, and bigger counts. |
| Fall Guys | Fall Guys wiki in-match screenshot (1919x1079) | "Race to the finish!" round start | Slanted pink ribbon with the round goal at the top left, a black card with heavy white type ("QUALIFIED 0/20") at the top right; names and crowns over characters. Shape language: slanted, high contrast, few elements. Our moments keep their tilted stamps. |
| Splatoon 3 | Wikipedia Turf War and Salmon Run screenshots (small, in match); Nintendo store gallery (11 images) | Turf War; Salmon Run wave; menus | Top bar of player squid icons with the timer, comic sticker labels ("Danger!"), ink-splat shapes and bold outlined type in the menus, almost nothing else on screen. Confirms the sticker look and keeping the corners light. |
| Sea of Thieves | Steam store screenshots (13), frames from "A Pirate's Life Gameplay Trailer", Wikipedia gameplay screenshot | ship battles, islands | No HUD at all in any official image: information lives in the world. Confirms "quiet until it matters". |
| Ratchet and Clank: Rift Apart | Steam screenshots (8), frames from the launch trailer, the wiki's Rift Apart gallery (4), Wikipedia's gameplay GIF | combat, traversal | Official images hide the HUD; the GIF shows a contextual HUD that appears only for a tutorial prompt. No usable HUD detail; noted as a gap. |
| Valorant | Wikipedia gameplay screenshot (small) | holding an SMG in a corridor | Minimal corners: "100" health bottom left, "30" ammo bottom right, team portraits top centre. Confirms that the main numbers can be small if they are high contrast. |

Measured at the same screen height (956 px), before this pass: our heal slots were about 37 px with 29 px icons and 13 px counts. After: 55 px slots with 50 px painted heals and 18 px counts, the selected heal raised in gold and named over the bag ("Kit médico · vida cheia" with its key), and a picked-up heal flies from under the reticle into its slot, which pops with a "+1".

## By game

### Fortnite
- Health (green) and shield (blue) bars bottom left; items and materials bottom right; minimap top right with the storm timer and players-alive count by it; the storm timer swaps a stopwatch icon for a storm-cloud icon when the circle is closing (secondary). We copy the stopwatch to storm-cloud swap on the match strip and keep players left, eliminations and the storm clock as icon plus number under the map.
- Health is a green bar, shield blue, energy yellow-orange (secondary). Our health bar is green when healthy, gold when hurt, red under 30, so the colour itself is the warning; armour is the shield teal with four segments (açaí adds 25, a vest 50).
- Shield break plays a distinct glass-break sound that players use as a callout (secondary). See item 11 above.
- Celia Hodent (former Director of UX at Epic, Fortnite) frames game UX as usability plus "engage-ability"; usability is close to the heuristics of other industries (secondary on the framework summary). Our usability rules: clarity of each number, feedback for every change, and form that follows function.

### Apex Legends
- A green bar fills while a healing item is used, so the player knows how long until they can fight again; a Med Kit takes 8 s, a Syringe 5 s (secondary).
- Season 23: the clip counter pulses red when nearly empty and the heal icon flashes at low health, instead of new permanent widgets (secondary [s], from the earlier UI research). Our versions: the magazine number pulses red under 20% and the card asks for the reload when it is empty; the suggested heal wears a gold ring and bounces when health is low.
- Damage numbers are coloured by what they hit; Apex recoloured them in 2021 because white numbers with red borders were confused with shield tiers (earlier UI research). Our numbers: cream for body hits, gold for headshots, turquoise "QUEBROU!" for an armour break, always with a brown outline.

### Overwatch 2
- The Overwatch 2 HUD was made cleaner and sleeker: health bar and ability icons, a smaller kill feed (secondary). We take the smaller feed: three short lines, 24 px tall, the player's own lines tinted.
- Health bars are segmented into chunks (common knowledge of the game, no fetched source); our armour bar uses four segments so a 25-point açaí reads as one chunk.

### Splatoon 3
- The ink tank lives on the character's back and flashes red when empty; in swim form a tank icon shows the current capacity and disappears once full; a red light and sound mark enough ink for the sub weapon (Inkipedia, community wiki). Lessons: show a meter only when it changes, and tie status to the character. Our heal bag shows only what you carry, the posture chip appears only when it matters, and the storm chip and safe-zone pill appear only when relevant.

### Sea of Thieves
- Almost no UI outside the shops: a faint health bar and an ammo counter in the corners; heading, time and location live in world objects (compass, clock, map) and audiovisual effects carry the rest (secondary). Lesson: the corners can be quiet and small if the important changes are loud. Rare's art director described "a few simple rules" that permeate every visual (GDC 2018 talk summary); our rule is one sticker shape everywhere.

### Fall Guys
- Bold rounded type for timers, player counts and round names; heavy weights and contrast keep fast-moving information readable over bright, busy sets; rounded shapes everywhere (secondary). Our HUD follows this: rounded pills and stickers, chunky numbers, no condensed or thin fonts.

### Valorant
- Riot's interface pass aimed to "improve legibility", "remove a lot of visual clutter", and "simplified our shape language", with motion design "to boost game flow and expression" (developer article, out-of-game screens). We apply the same three moves to the HUD: fewer plates, one shape, motion only on events.

### Brawl Stars, Ratchet and Clank: Rift Apart, Rumbleverse
- Brawl Stars is widely used as the reference for cartoon health UI (asset stores sell "cartoon health" kits inspired by it) but no developer source on its HUD was found; its known traits (big rounded numbers, chunky outlined bars) match ours. Gap.
- Rift Apart: the weapon wheel can toggle or hold, D-pad quick select, HUD colours are configurable, and a "Collectible" shader colour makes bolts stand out (Sony and Insomniac accessibility notes). Lesson: pickups should stand out in the world as well as in the HUD; our loot already glows by rarity, and the HUD pop now names what you took.
- Rumbleverse: health and stamina bars plus a Super Meter filled by blue stars (GameSpot guide, secondary). No source on its art. Gap.

### Caliber (developer article, a team shooter)
- Every element is tested on light, dark and mixed backgrounds; green signifies healing; two alternative colour schemes for colour-blind players; critical information is big, less important information "smaller and dimmer"; "players will ignore certain UI elements unless they're animated and highlighted"; they removed the minimap because players stopped talking. We keep the minimap (solo battle royale, no voice) but shrank it to 162 px.

## Talks and articles

- **Fagerholt and Lorentzon, "Beyond the HUD" (Chalmers, 2009)**: diegetic, non-diegetic, spatial and meta interfaces, along the two axes of story and space (Game Developer and O'Reilly summaries).
- **Game Developer, "HUD: Barrier for Immersion, Hide the Numbers" (Max Pears)**: hide raw numbers where tension matters, ground information in the world, keep what remains integrated. We keep numbers for health, armour and ammo (a competitive shooter needs them) and remove labels instead.
- **Game Accessibility Guidelines, essential temporary information**: keep it in the eye line; peripheral vision loss hides edge elements. Applied to the heal progress, prompt and elimination column.
- **Rare at GDC 2018 (Ryan Stevenson)**: a few simple rules carried through every visual give a stylized game its unified look (summary only).
- **Riot, "Preview the future of VALORANT's interface"**: legibility, less clutter, contrast, simpler shapes, motion design.
- **Xbox Accessibility Guidelines 101 and 103** (from the earlier UI research): text size floors; at least two channels for important information.
- **Overwatch "Replay Technology" GDC 2017 and the snap-to-killer reports** (earlier research): never delay the player; ease motion; reduced motion cuts.

## Footprint, placement, hierarchy, pickups and heals, motion: the comparison

| Game | Footprint | Placement | Hierarchy | Pickups and heals | Motion |
| --- | --- | --- | --- | --- | --- |
| Fortnite | small corner bars, larger bottom-right inventory | four corners | health and shield numbers big; mats small | slot fills in the hotbar; storm icon swaps state | short pops |
| Apex | medium | health bottom left, weapons bottom right | ammo and health dominant | green progress while healing; heal icon flashes at low health | pulses only on warnings |
| Overwatch 2 | medium, trimmed in OW2 | health bottom left, abilities bottom right | health segments | n/a (no pickups beyond health packs) | cleaner, smaller feed |
| Splatoon 3 | minimal | on the character | ink tank only when it matters | tank appears while refilling | flashes when empty |
| Sea of Thieves | minimal | faint corners | health, ammo | in-world | audiovisual |
| Fall Guys | small, bold | top centre counts | timers and qualification | n/a | squishy, bouncy |
| Ultima Capivara (redo) | about half of before | corners plus one column under the reticle | health, armour, ammo in Dela Gothic | pop above the bag, coin squash and ring, suggested heal ring, heal ring under the reticle, bar preview, gain pop | only on change; reduced motion keeps fades |

## Gaps

- No developer source on Brawl Stars', Rumbleverse's or Fortnite's pickup feed was reachable; the second pass replaced most of those guesses with what the in-match images show.
- No official image shows Ratchet and Clank: Rift Apart's or Overwatch 2's full in-match HUD at a usable size; the store and press images hide it.
- I found no official source confirming an Apex "health preview" segment while healing; our preview is our own design, inspired by the green progress bar.
- The Bonn longitudinal study on HUD minimalism (2025) was behind a bot wall; only its title is recorded.

## Sources

Images viewed (private reference, not redistributed):

- https://store.steampowered.com/api/appdetails?appids=1172470 (Apex Legends: store screenshots and trailers)
- https://store.steampowered.com/api/appdetails?appids=2357570 (Overwatch: store screenshots and the S24 trailer)
- https://store.steampowered.com/api/appdetails?appids=1172620 (Sea of Thieves: store screenshots and trailers)
- https://store.steampowered.com/api/appdetails?appids=1097150 (Fall Guys: store screenshots)
- https://store.steampowered.com/api/appdetails?appids=1895880 (Ratchet and Clank: Rift Apart: store screenshots and trailer)
- https://fortnite.fandom.com/wiki/File:Zapotron_(Gameplay)_-_Screenshot_-_Fortnite.png
- https://fortnite.fandom.com/wiki/File:Inventory_-_User_Interface_-_Fortnite.png
- https://rumbleverse.fandom.com/wiki/File:UI_-_Rumbleverse.jpg
- https://overwatch.fandom.com/wiki/File:HealthBarGuide.png
- https://fallguysultimateknockout.fandom.com/wiki/File:Screenshot_2025-07-31_094306.png
- https://ratchetandclank.fandom.com/wiki/Ratchet_%26_Clank:_Rift_Apart
- https://play.google.com/store/apps/details?id=com.supercell.brawlstars
- https://www.nintendo.com/us/store/products/splatoon-3-switch/
- https://www.ea.com/games/apex-legends/news/shockwave-game-updates
- https://en.wikipedia.org/wiki/File:Battling_in_fortnite.jpg, File:Splatoon_3_Turf_War.jpg, File:Splatoon_3_Salmon_Run.jpg, File:Sea_of_Thieves_gameplay_screenshot.jpg, File:Brawl_Stars_Bounty_gameplay.png, File:Ratchet_and_Clank_-_Rift_Apart_gameplay.gif, File:Apex_Legends_gameplay_screenshot.jpg, File:Valorant_gameplay.jpg, File:Overwatch_screenshot.png

Text sources:

- https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/
- https://playcaliber.com/en/news/638/about-our-approach-to-hud-design/
- https://playvalorant.com/en-us/news/game-updates/preview-the-future-of-valorant-s-interface/
- https://www.gamedeveloper.com/design/hud-barrier-for-immersion-hide-the-numbers
- https://www.gamedeveloper.com/design/user-interface-design-in-video-games
- https://www.oreilly.com/library/view/mastering-ui-development/9781787125520/78296d1f-f5be-4af9-8ed6-b47ece9c8bda.xhtml
- https://gamedeveloper.com/art/video-how-rare-crafted-the-look-and-feel-of-i-sea-of-thieves-i-
- https://roadtovr.com/7-lessons-sea-of-thieves-can-teach-us-about-great-vr-game-design/ [s]
- https://mein-mmo.de/en/sea-of-thieves-piraten-rasseln,148063 [s]
- https://splatoonwiki.org/wiki/Ink_tank [s]
- https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-7-splatoon-3-part-1/ [s]
- https://www.gfinityesports.com/article/fortnite-beginners-guide-2021-tips-and-tricks-you-need-to-know-when-starting-out-pc-switch-xbox-one-series-s-x-ps4-ps5
- https://attackofthefanboy.com/guides/how-to-crack-an-opponents-shield-in-fortnite/ [s]
- https://www.designative.info/2019/03/28/the-ux-of-fortnite-celia-hodent/ [s]
- https://www.gdconf.com/news/games-psychology-and-ux-celia-hodent-gdc-podcast-ep-8-0 [s]
- https://twinfinite.net/guides/apex-legends-heal-how/ [s]
- https://apexlegends.wiki.gg/wiki/Regen [s]
- https://www.gfinityesports.com/article/apex-legends-season-23-patch-notes [s]
- https://gamingbolt.com/overwatch-2-vs-overwatch-1-15-new-differences-you-need-to-know [s]
- https://madegooddesigns.com/?p=9271 [s]
- https://waytoomany.games/2020/08/18/interview-with-anthony-pepper-senior-designer-behind-fall-guys/ [s]
- https://sonyinteractive.com/en/news/blog/inside-the-accessibility-features-of-ratchet-clank-rift-apart/ [s]
- https://support.insomniac.games/hc/en-us/articles/46716208107795-What-Accessibility-options-does-Ratchet-Clank-Rift-Apart-feature [s]
- https://gamespot.com/articles/rumbleverse-tips-for-beginners/1100-6506379/ [s]
- https://gfxcomet.gumroad.com/l/cartoon-health [s]
- https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md
- https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103 [s]
- https://igda-gasig.org/?p=1364
- https://shacknews.com/article/110042/how-to-change-damage-numbers-in-apex-legends
- https://upcomer.com/apex-legends-improves-colorblind-support-promises-crosshair-customization
- https://gdcvault.com/play/1024053/Replay-Technology-in-Overwatch-Kill
- https://bonndoc.ulb.uni-bonn.de/xmlui/handle/20.500.11811/14207 [s]
