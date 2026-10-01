# HUD research: small, cartoon, and impossible to miss where it matters

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

- No developer source on Brawl Stars', Rumbleverse's or Fortnite's pickup feed was reachable; those notes rest on guides or common knowledge and are marked.
- I found no official source confirming an Apex "health preview" segment while healing; our preview is our own design, inspired by the green progress bar.
- The Bonn longitudinal study on HUD minimalism (2025) was behind a bot wall; only its title is recorded.

## Sources

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
