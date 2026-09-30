# UI research: HUD, death flow and spectating in five shooters

29 September 2026. Web research for the UI, UX and spectator pass (branch `ui-spectator`). The findings below were collected from developer blogs, patch notes, GDC talks, platform guidelines and press; each carries its source, and a Sources list closes the document. Findings marked [s] were read from search excerpts because the page refused a direct fetch; (secondary) means a guide or press article rather than the developer.

## How Ultima Capivara applies it

What we took, and where we deliberately differ (see `docs/overhaul/ui-report.md` for the implementation):

- **Edges only, centre clear.** Vitals bottom left, the four weapon boxes bottom centre, magazine bottom right, compass top centre, minimap top right with the match strip (players left, eliminations, storm clock) under it as in Fortnite, kill feed below that. The centre carries only the reticle, hit feedback, damage arcs and short prompts.
- **Compass with the objective on it** (Modern Warfare): the safe zone rides the ribbon as a gold mark, pinned to an edge when it is behind you.
- **Death card with what the eliminator had left** (the TF2 freeze-cam idea, Valorant's combat report): killer portrait in their kit colour, weapon, distance and their remaining health and armour; storm and fall eliminations get their own card.
- **Never delay the player** (Overwatch kill cam talk): the death cam is 1.8 s, jump or fire skips it, and respawn modes count down from the moment of death with a ring on the card.
- **Ease, do not snap, to the killer** (Overwatch motion-sickness reports): the death cam rises over 0.45 s; with Reduced motion every camera move is a cut.
- **Spectate order** (Fortnite, Apex): your eliminator first; when the watched capybara falls the camera holds for 1.8 s on the body, then follows its eliminator, or whoever is nearest. People come before bots, dropped connections last.
- **Third person over the shoulder with a sphere cast** (Unreal spring arm): in at once when blocked, back out slowly, mouse orbit that drifts back after an idle. We chose third person over first person because snapshots carry aim at 20 Hz (a first-person view of someone else's 20 Hz aim is choppy and hides the capybara) and a stylized character game benefits from showing the character; a first-person option is noted as follow-up.
- **Spectator HUD** (Apex, Fortnite): target name, portrait, health and armour, weapon, eliminations, position in the watch order, previous and next with their keys. We never tell the watched player they are being watched (Apex anti-cheat lesson).
- **Colour is never the only channel** (XAG 103, IGDA): headshot and kill markers differ by shape as well as colour; the colour-blind palette swaps hues for the markers only instead of filtering the screen.
- **Results that keep the next step visible** (Valorant 13.06, Warzone Play Again): Jogar de novo and Voltar are focusable within 300 ms; the camera orbits the champion's celebration behind the panel.

Scope: Valorant, Apex Legends, Overwatch 2, Fortnite and Call of Duty (Warzone / Modern Warfare / Black Ops 6), plus a few supporting references (Valve Source SDK, TF2, Xbox Accessibility Guidelines, IGDA, Unreal Engine docs). Findings marked **[s]** come only from search-result excerpts, because the page blocked direct fetching. Everything else was read on the page. Findings marked **(secondary)** come from guides or press, not the developer.

---

## 1. HUD layout, scaling and colour-blind options

### Layout conventions
- **Valorant.** Minimap is top-left. Round timer, score and agent portraits are top-centre. Health, armour and abilities are bottom-centre, with the ultimate on the right of that group. Credits and weapon inventory are bottom-right. The combat report appears on the right after death. (secondary) [oneesports HUD guide]
- **Valorant, HUD refinements.** Patch 12.05 split status-effect tags into buffs on the left and debuffs on the right. Patch 11.10 added a teal healing fill to the team health bars at the top. Patch 9.10 made overheal shields easier to read in the bottom HUD. [Valorant 12.05; 11.10/9.10 [s]]
- **Fortnite.** Health (green) and shield (blue) bars are bottom-left. The item inventory and material counts are bottom-right. The minimap is top-right, with the storm timer and a players-alive counter beside it. The storm timer uses two icons: a stopwatch for "circle formed, storm not moving yet" and a storm cloud for "storm is closing now". (secondary) [Gfinity Fortnite guide]
- **Overwatch 2.** Health and portrait are bottom-left. Abilities, weapon and ammo are bottom-right. Ultimate charge is bottom-centre, and the kill feed is top-right. (secondary) [itch.io devlog; search summary [s]]
- **Modern Warfare (2019).** A 360-degree compass sits top-centre and also shows enemy-fire and objective markers. Weapon, ammo, fire mode and equipment are bottom-right. Score and timer are bottom-left. Settings include horizontal and vertical HUD margins so the HUD fits any screen. [Activision blog, MW PC controls and settings]
- **Black Ops 6.** Every HUD element can be moved or removed. There are about 10 presets (Standard, Inverted, Classic, Target Tracker, Central Command, Streamer and others), plus settings for HUD bounds, minimap shape and rotation, and compass type. The developers pitch moving ammo next to the reticle as a way to reduce eye travel. [PCGamesN; esports.gg [s]]
- **Keeping the centre clear.** The common pattern across these games is that the centre holds only the crosshair plus short-lived combat feedback. Apex Season 22 ("Shockwave") added an enemy health bar that shows only briefly after you deal damage, fades out, and needs line of sight. Apex Season 23 moved the low-ammo prompt lower, made the clip counter pulse red when nearly empty, and flashes the heal icon at low health, instead of adding new permanent widgets. [EA Shockwave patch notes; Gfinity S23 [s]]

### Colour-blind and readability
- **Valorant** changes the enemy highlight colour itself rather than filtering the whole screen: Red (default), Purple (tritanopia), Yellow (deuteranopia) and Yellow (protanopia). (secondary) [esports.gg / AFK Gaming [s]]
- **Overwatch (2018)** added nine colour-blind-friendly colours. Enemy and friendly UI can be coloured separately, and the change covers nameplates, HUD, health bars and hero outlines. [Overwatch PTR patch notes, Sept 2018]
- **Apex** has protanopia, deuteranopia and tritanopia modes. In July 2021 it recoloured damage numbers on unshielded enemies, because white numbers with red borders were easy to confuse with white or red shield tiers. [EA Accessibility; Upcomer]
- **Black Ops 6** has a High Contrast Mode where players choose the outline colours for allies and enemies, plus a dark-background option. [Blizzard News mirror of the CoD accessibility blog]
- **IGDA accessibility SIG** advises against full-screen colour-blind filters, because they bunch hues together and can hurt clarity. Instead: rely less on colour, add shapes and symbols, and let players pick colours for the specific elements that must stand apart. [IGDA GASIG]
- **Xbox Accessibility Guidelines (XAG).**
  - XAG 103: express important information through at least two channels, and never use colour as the only channel. [s]
  - XAG 101: minimum text body height of 18 px at 1080p on PC and 26 px at 1080p on TV/console, with text scalable to 200% without losing content. [XAG 103; XAG 101]
- **Fortnite** offers colour-blind modes with a strength slider, and "Visualize Sound Effects", which shows on-screen icons for footsteps, gunfire and chests. [Epic help [s]]

## 2. Hit markers, kill confirmation, damage numbers, damage direction

- **Apex feedback options.**
  - Crosshair damage feedback: an X with a shield-level indicator, a plain X, or off.
  - Damage numbers: Stacking (one combined total), Floating (one per hit), Both, or off.
  - Incoming damage: 3D arrows, 2D arrows, or both. [EA Accessibility, Apex PC features]
- **Apex damage-number colours** tell you what you are hitting: gold for headshots, white/blue/purple for the shield tier, red for raw health. [Shacknews]
- **Fortnite damage numbers.** Blue means shield, white means health, yellow means critical hit. Numbers can be Cumulative or List, and reticle feedback can be "Hit & Icons", "Hit Only" or off. Players use the colours as callouts ("he's white" means no shield left). [KeenGamer glossary; Epic help [s]]
- **Black Ops 6** has settings for hit marker visuals and "damage-based" hit markers that separate headshots from body shots. [s] [esports.gg]
- **Valorant's approach to hit feedback.** Riot separates two problems:
  - Correctness: the server scored the hit wrongly.
  - Clarity: the hit was scored correctly but the feedback misled the player. Riot treats this as the less serious problem, but it caused most player complaints.
  - The server-confirmed hit effect arrives one network round trip after the tracer. Riot's fix was to attach hit effects to the body part that was hit, so they move with the target. [Valorant dev blog, "The State of Hit Registration"]
- **Assist confirmation.** Valorant 12.05 added assist banners at the bottom of the screen, with an audio cue and the specific contribution that set up a teammate's kill. [Valorant 12.05]
- **History.** Call of Duty 4 popularised the hit marker: an X glyph with a distinct sound. It was intended for multiplayer only, where knowing your bullets landed matters for competitive and network reasons. (secondary) [PC Gamer [s]]
- **Overwatch audio.** Blizzard built its hit sound from a distorted, reversed beer-bottle pop so that hitting feels satisfying. Enemy sounds are mixed louder than allied ones so players can react faster. (secondary) [Mein-MMO [s]]

## 3. Kill feed conventions

- **What the entries show.** Overwatch (Jan 2017) added ability icons to the kill feed and a red icon for headshot kills. In May 2017 it added icons for environmental kills, colour-highlighted Mercy resurrections, and showed some assists (for example stuns and debuffs). [Overwatch patch notes Jan 2017; May 2017 [s]]
- **Removing information draws complaints.** Overwatch 2 dropped the environmental-kill icon in a push for a minimal HUD. A Reddit post asking for it back got over 2,300 upvotes. (secondary) [Dexerto]
- **Assists.** Valorant 12.05 shows the assisting agent and the ability that enabled the kill, visible to your own team only. [Valorant 12.05]
- **Timing and count.** The Source engine default is 6 seconds per entry (`hud_deathnotice_time`), with at most 4 entries on screen. Team kills get a different icon colour. [Valve Source SDK death.cpp]
- **Privacy.** Apex lets players turn obituaries (kill feed entries) off, and Streamer Mode can hide the killer's name or all enemy names. [EA Accessibility]
- **Context icons.** CS:GO added kill-feed icons for kills made while blinded, through smoke and without scope. (secondary) [AFK Gaming [s]]

## 4. Death flow: recap, kill cam, respawn timers

- **Valorant combat report.** Pops up on the right after death. It shows who killed you, the damage you dealt and received, and hit locations by body part. Press N to show or hide it (rebindable). [Riot support, UI Settings FAQ; oneesports]
- **Apex.**
  - Death Recap (a damage summary of your last fight) was added in 2019 as part of the end-of-match summary.
  - A kill replay from the killer's view shipped quietly in Mid-Season 19 (January 2024), after years of player requests. It was not in the patch notes. [TheSixthAxis, Iron Crown notes; MP1st]
- **Purpose of a kill cam (Overwatch, GDC 2017).** The kill cam exists so players understand how they died. It has to be generated and delivered within a hard respawn deadline, and it must be interruptible, so skipping it never delays the player. [GDC Vault, Philip Orwig]
- **Snap-to-killer camera.** Overwatch added a death camera that snaps quickly toward the killer, so you can tell at a glance whether they were behind or beside you. Players reported motion sickness, and Blizzard committed to adding a toggle to turn it off (January 2020). [Blizzard forums]
- **Respawn timing (Overwatch 2, Season 12).**
  - Default respawn went from 10 to 12 seconds.
  - Wave Respawn: anyone who dies within 6 seconds of a teammate joins that teammate's wave and respawns with them.
  - A solo death respawns in 10 seconds. [Overwatch patch notes Aug 2024]
- **Photosensitivity.** Valorant 10.11 added a Finisher Cam for deaths to weapons with finisher effects, to reduce flashing, visual clutter and performance problems. [Valorant 10.11]
- **Killer's remaining health.** TF2's freeze cam zooms in on the killer and shows their name, current health, nemesis or revenge status and weapon. This is the classic reference for showing how close you came to winning. [TF2 Wiki, Killcam]
- **Call of Duty kill cams.**
  - Modern Warfare II kill cams can be skipped with the action button. [s]
  - Modern Warfare III plays a kill cam after every death, and players complain about having to press skip every time. [s] [Steam community]
  - Modern Warfare II also offers a third-person "helmet cam" as an alternative. [GGRecon]
- **Respawn timers in battle royale modes.**
  - Warzone 2 Resurgence: 25 seconds for the squad's first death, longer with each further death and each circle. Kills shorten it. [oneesports]
  - Warzone's Dynamic Resurgence Timer (July 2023) shortens the timer when the squad has fewer members. [Gfinity]
  - Warzone Rebirth: respawns switch off after a late circle collapse, leading to a final free-for-all. [Blizzard News]
  - Fortnite Reload: auto-reboot takes 30 seconds, rising to 40. Each down cuts 2 seconds, each elimination 4, each team wipe 10. Reboots switch off at the end of the match. [Dexerto]
  - Apex Trios Revival: automatic respawn on a timer until the fourth ring, growing with each death and each round. [EA Shockwave notes]
  - Fortnite's classic Reboot Cards stay collectible for 90 seconds, and a Reboot Van takes 10 seconds to use. [s]

## 5. Spectator flow

- **Who you watch (Fortnite).** You auto-spectate a teammate until you are rebooted. If the whole squad is wiped, the camera moves to the player who got the kill. If that player dies, it moves to their killer. Cycle with the arrow keys or the shoulder buttons. Spectators can still ping loot and call out for teammates. (secondary) [Dexerto]
- **Who you watch (Apex).** You spectate the squad that got the kill credit. If that squad is wiped, you move to whoever wiped them. You watch a random squad only if nobody killed you (for example a ring death). (community answer) [EA forums [s]]
- **Anti-cheat.** Apex turned off its "being spectated" indicator (an eye icon with a count) in July 2019, because cheat software was hiding itself whenever someone was watching. [Respawn server patch, devtrackers]
- **Warzone Gulag.** If you lose the Gulag duel you spectate your remaining teammates until they buy you back ($4,500 at a Buy Station). Players waiting their turn can watch from a balcony. (secondary) [PC Gamer; Looper [s]]
- **Camera modes.** Overwatch cycles spectated teammates with left and right mouse, and offers two third-person camera modes plus a shoulder-swap key. [s] Modern Warfare II players often turn off the third-person helmet cam, because first person makes it easier to learn from the killer. [Twinfinite [s]; GGRecon]
- **Spectator fidelity.** Valorant 12.05 made ability targeters (for example smoke placements) visible to spectators and in replays. [Valorant 12.05]
- **Keeping the camera out of walls.** Unreal's Spring Arm is the standard technique:
  - Each frame it sweeps a sphere of size ProbeSize from the pivot toward the desired camera position, pulls the camera in when it hits geometry, and springs back when clear.
  - Optional position and rotation lag smooth the motion.
  - John Nesky's GDC 2014 talk (Journey) sums up why this matters: "Cameras are most noticeable when they fail." [Epic USpringArmComponent docs; Game Developer]

## 6. Results, rematch and loading screens

- **Valorant 13.06 end of game.** A single screen combines Performance Score, MVP, rank change, mastery and accolades. It plays automatically, but players can go at their own pace, **requeue immediately**, or return to the lobby. [Valorant 13.06]
- **Valorant 5.08 redesign.** Added a team shot with the MVP in the centre, cut decorative clutter, raised contrast, and simplified shapes. The pre-match faceoff screen uses large player banners, rank badges and a "VS". [Valorant, "Preview the future of VALORANT's interface"]
- **Warzone "Play Again".** Removed at Warzone 2 launch because of a bug, and brought back in Season 2 (February 2023) after complaints. It requeues the same squad without going back to the menu. [CharlieIntel]
- **Overwatch post-match.** A "Stay as Team" option keeps the group together after the match. [s] Play of the Game runs about 17 seconds (a 5-second intro plus 12 seconds of gameplay). [s] [Ubergizmo; Overwatch Fandom]
- **Apex post-match.** In 2019 the match summary was reworked to show battle pass progress clearly, alongside the Death Recap. [TheSixthAxis]
- **Loading screens.**
  - Game Developer's "Game Design Rules: Loading Screens" argues: always show a progress indicator, avoid spoilers, and do not use gameplay tips (they patch over a weak tutorial).
  - That conflicts with live-service practice. Fortnite turns loading screens into collectible cosmetics that hide battle pass clues, and Valorant uses a team faceoff screen. [Game Developer; esports.gg [s]]

---

## What this means for our game

1. **Fixed HUD zones.**
   - Top-left: minimap with the zone timer and "Vivos: N" (players alive) underneath.
   - Top-right: kill feed.
   - Bottom-left: health plus armour bar, with a squad list above it.
   - Bottom-right: weapon strip with ammo and reserve.
   - Top-centre: compass.
   - The centre holds only the crosshair and short-lived feedback.
2. **HUD options.** HUD scale from 75% to 150%, plus a safe-area margin slider (as in MW). Keep the smallest text at 18 px or more at 1080p when scale is 100%.
3. **Colour-blind support without filters.** Let players pick the enemy highlight colour (red, yellow or purple). Always pair colour with a shape: armour damage numbers get a small shield glyph, and headshots use a different marker shape as well as yellow.
4. **Hit feedback set.** An X hit marker with a distinct sound, a different marker and sound when armour breaks, a red X plus a "kill" sound on elimination, and stacking damage numbers (armour in blue with a glyph, health in white, headshot in yellow). Each can be switched off.
5. **Damage direction.** 2D arcs on a ring around the crosshair. Fade within about 1 second and scale opacity with damage. Never full-screen red flashes.
6. **Kill feed.**
   - At most 5 entries, about 6 seconds each.
   - Format: "Killer [weapon icon] Victim", with icons for headshot and zone death.
   - Entries involving the local player get an outlined or tinted background and stay about 2 seconds longer.
   - Add assists in respawn modes.
7. **Death card ("Eliminado por").** Appears right after death, bottom-centre or right.
   - Killer name and capybara skin, weapon, killer's remaining health and armour (the TF2 idea).
   - Your damage to them and theirs to you.
   - Distance.
   - Toggle it with a key, as Valorant does with N.
8. **Never delay the player.** In respawn modes the respawn countdown runs from the moment of death. The kill cam or death camera fits inside that time and can be skipped with Espaço or F. In battle royale the death card stays up until the player chooses "Assistir" (spectate) or "Voltar ao lobby" (back to lobby).
9. **No hard snap to the killer.** Ease the death camera toward the killer over about 0.5 to 0.8 seconds, with a "Girar câmera para o assassino" (turn camera to killer) toggle in settings, because of Overwatch's motion-sickness reports.
10. **Spectate order.** A living teammate first. If the squad is wiped, the killer. When the watched player dies, move automatically to their killer. Cycle with left and right mouse or Q/E, with the current target shown in the prompt ("Assistindo: nome").
11. **Spectator HUD.** Target name, their health and armour, weapon and ammo, squad list, "Vivos: N" and the zone timer. Do not show the watched player that they are being spectated (Apex's anti-cheat lesson).
12. **Spectator camera.** Third person over the shoulder by default, with a key to switch to first person.
    - Use a sphere cast from the head pivot to the desired camera position.
    - Pull the camera in instantly when it hits geometry, and ease it back out over about 0.3 seconds.
    - Add slight position and rotation lag.
    - Hide the target's weapon or model mesh if the camera ends up inside them.
13. **Respawn timers.** Show the countdown large, with its cause ("Renascendo em 12s", respawning in 12 s). In squad respawn modes, let teammate kills cut the timer and show those cuts visibly ("-4s"). Clearly announce the phase when respawns switch off.
14. **Results screen.** Plays automatically: placement, then personal stats, then XP, then squad MVP. Keep "Jogar de novo" (play again, same squad requeue) and "Voltar ao lobby" (back to lobby) on screen from the first second, and let players skip ahead.
15. **Loading screen.** Real progress bar, map and mode name, and squad banners. Optionally one short rotating tip as secondary text, never the main content. This resolves the conflict in section 6: Game Developer's rules apply to the main content, and live-service practice to the extras.

---

## Sources

- https://www.oneesports.gg/valorant/user-interface-valorant-hud/
- https://geniusguide.evilgeniuses.gg/p/screen-studies-valorant
- https://support.riotgames.com/en-us/valorant/gameplay/valorant-ui-settings-faq
- https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-05
- https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-10-11
- https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-06/
- https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-9-10/ [s]
- https://playvalorant.com/en-gb/news/game-updates/preview-the-future-of-valorant-s-interface/
- https://playvalorant.com/en-us/news/dev/the-state-of-hit-registration/
- https://esports.gg/guides/valorant/how-to-change-enemy-color-in-valorant/ [s]
- https://afkgaming.com/esports/guide/how-to-change-enemy-color-in-valorant [s]
- https://ea.com/able/resources/apex-legends/pc/features
- https://www.ea.com/games/apex-legends/news/shockwave-game-updates
- https://www.gfinityesports.com/article/apex-legends-season-23-patch-notes [s]
- https://shacknews.com/article/110042/how-to-change-damage-numbers-in-apex-legends
- https://upcomer.com/apex-legends-improves-colorblind-support-promises-crosshair-customization
- https://www.thesixthaxis.com/2019/08/13/apex-legends-iron-crown-event-has-arrived-with-solos-full-patch-notes-here/
- https://mp1st.com/news/apex-legends-quietly-adds-killcams
- https://forums.ea.com/discussions/apex-legends-feedback-en/re-is-it-a-cheat-when-you-end-up-spectating-a-different-team/8687478 [s]
- https://devtrackers.gg/apex-legends/p/29c54edc-server-patch-live-on-all-platforms
- https://overwatch.blizzard.com/en-us/news/patch-notes/live/2017/1/
- https://overwatch.blizzard.com/de-de/news/patch-notes/live/2017/5/ [s]
- https://overwatch.blizzard.com/en-gb/news/patch-notes/ptr/2018/09
- https://overwatch.blizzard.com/en-us/news/patch-notes/live/2024/08
- https://gdcvault.com/play/1024053/Replay-Technology-in-Overwatch-Kill
- https://us.forums.blizzard.com/en/overwatch/t/the-new-snap-to-killer-death-thing/447297
- https://www.dexerto.com/overwatch/overwatch-2-environmental-kill-icon-players-return-1976064/
- https://bushy2.itch.io/a1-skill-development/devlog/812196/other-games-uis [s]
- https://twinfinite.net/guides/how-to-spectate-in-overwatch-2/ [s]
- https://www.ubergizmo.com/2016/11/overwatch-stay-as-team-ptr/ [s]
- https://overwatch.fandom.com/wiki/Play_of_the_Game [s]
- https://mein-mmo.de/en/overwatch-bier-sound-treffer,81871/ [s]
- https://www.gfinityesports.com/article/fortnite-beginners-guide-2021-tips-and-tricks-you-need-to-know-when-starting-out-pc-switch-xbox-one-series-s-x-ps4-ps5
- https://www.epicgames.com/help/c-202300000001636/c-202300000001721/a202300000011110?lang=en-US [s]
- https://www.epicgames.com/help/c-202300000001636/c-202300000001721/are-there-any-accessibility-settings-for-fortnite-a202300000015585 [s]
- https://www.keengamer.com/articles/guides/fortnite-battle-royale-10-essential-phrases
- https://www.dexerto.com/fortnite/how-to-spectate-in-fortnite-2911488/
- https://www.dexerto.com/fortnite/how-to-play-fortnite-og-reload-2791855/
- https://fortnite.fandom.com/wiki/Rebooting [s]
- https://esports.gg/guides/fortnite/how-fortnite-battle-pass-works/ [s]
- https://blog.activision.com/call-of-duty/2019-10/Getting-Started-in-Modern-Warfare-Controls-and-Settings-PC
- https://www.pcgamesn.com/call-of-duty-black-ops-6/hud
- https://esports.gg/news/call-of-duty/how-to-change-your-hud-in-black-ops-6 [s]
- https://news.blizzard.com/en-gb/article/24151767/call-of-duty-black-ops-6-accessibility-updates-and-new-features
- https://www.ggrecon.com/guides/mw2-disable-helmet-cam/
- https://steamcommunity.com/app/1938090/discussions/0/4039229229048940096 [s]
- https://piunikaweb.com/2022/11/07/modern-warfare-2-killcam-freezing-and-ghost-perk-nerfed-too/ [s]
- https://www.oneesports.gg/call-of-duty/what-is-warzone-2-resurgence
- https://www.gfinityesports.com/article/warzone-dynamic-resurgence-timer
- https://news.blizzard.com/en-gb/article/23785636/rebirth-resurgence-solos
- https://www.charlieintel.com/call-of-duty-warzone/when-is-the-play-again-button-returning-to-warzone-2-212670/
- https://pcgamer.com/cod-warzone-gulag-redeploy-respawn-revive [s]
- https://looper.com/193421/how-does-the-gulag-work-in-call-of-duty-warzone [s]
- https://www.pcgamer.com/games/fps/hit-markers-are-an-fps-crutch/ [s]
- https://swarm.workshop.perforce.com/files/guest/knut_wikstrom/ValveSDKCodecl_dll/death.cpp
- https://afkgaming.com/csgo/news/3880-latest-csgo-update-adds-new-kill-feed-icons-multiple-changes-to-chlorine-and-more [s]
- https://wiki.teamfortress.com/wiki/Killcam
- https://igda-gasig.org/?p=1364
- https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md
- https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103 [s]
- https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/USpringArmComponent
- https://gamedeveloper.com/design/video-50-common-game-camera-mistakes----and-how-to-fix-them
- https://www.gamedeveloper.com/design/game-design-rules-loading-screens

**Gaps:**
- I found no official source for how long each game's kill cam lasts, or whether Apex or Call of Duty show the killer's remaining health.
- No official source confirms Apex's exact HUD layout.
- Game UI Database pages refused to load, so no findings come from them.