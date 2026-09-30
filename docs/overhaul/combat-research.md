# Combat feel research: shooting, feedback, TTK, movement, camera and VFX

Purpose: evidence base for tuning Ultima Capivara combat. Each claim about a specific game links to a source listed at the end. Where a source is community data (wikis, dataminers, press) rather than the developer, that is stated. Where no source was found, the claim is marked unverified or left out. Recommendations for our game are in section 10 and are clearly our own reasoning, not facts about other games.

## 0. Framing: what "game feel" means

- Steve Swink defines game feel as real-time control of virtual objects in a simulated space, with interactions emphasized by polish. His "real-time" threshold is a correction cycle (see, decide, act, get feedback) under roughly 100 ms. Polish, in his model, does not change the rules but makes the result "perceptually convincing" [S1].
- Martin Jonasson and Petri Purho ("Juice it or lose it", GDC Europe 2012) took a working Breakout clone and made it feel alive with tweening, squash and stretch, particles, sound and screen shake, without changing the rules [S2][S3].
- Jan Willem Nijman ("The Art of Screenshake", Vlambeer) demonstrates the same idea for a shooter: a pile of small additions (bigger bullets, muzzle flash, impact effects, knockback, camera kick, screen shake, sleep frames on hit, persistent shells and bodies) turns a flat prototype into a satisfying one [S4].
- Bungie: a Bungie animator (David Helsby) is reported as saying at GDC that camera animation is the most sensitive part of first-person feel: too static feels "airy", too literal causes motion sickness. This is secondhand press coverage; I could not locate the original talk or a dedicated Bungie "gunfeel" GDC session, so treat it as unverified in detail [S5].
- The Astronauts (Witchfire) describe their revolver feel as layers: ADS fire animation, camera shake, vertical plus horizontal kick where "horizontal resets faster than vertical", a muzzle flash that briefly disorients, separate muzzle smoke, impact decals and an impact smoke that lingers longer than muzzle smoke [S6].

Takeaway: good gunfeel is many small, well-timed layers on top of correct, responsive rules. The rules must be correct first (see Riot's "correctness bugs are much worse than clarity bugs" [S8]).

## 1. Feedback layering on a shot (0 to 100 ms)

### What is predicted and what is confirmed

- Valorant: muzzle flash and tracers are client-predicted and appear immediately. Hit VFX and hit audio are rendered only after server confirmation. The gap between tracer and hit effect equals round-trip time (Riot's example: 40 ms ping gives about 80 ms delay) [S8].
- Valorant patch 1.07 split the impact into two layers: "An additional client-predicted small spark VFX now spawns immediately at the game space location of a hit", while "Server hit VFX confirms will now spawn at the location of the hit on the character and stay attached to that position" [S9]. The earlier hit registration article explains why: with ping, enemies crouched into delayed body-shot VFX, making body hits look like headshots [S8].
- Valorant netcode: the client predicts "movement, physics, and other related systems" at a fixed 128 Hz; the server rewinds the world to what the shooter saw when they fired, and shared movement timelines make client prediction "almost always" agree with the server [S10].
- Apex Legends: "When you shoot, we know the ballistic of the weapon, so we can predict where the bullet is going locally without needing the server to tell you." Missed registrations happen when the local simulation drifts from the server [S11].
- Overwatch: Tim Ford's GDC 2017 talk covers how the game uses determinism "to achieve responsiveness and precision" in its networked ECS simulation [S12]. Dan Reed's talk describes Statescript, which "automates prediction and replication of script behavior" for weapons and abilities [S13]. Overwatch favors the shooter, with exceptions for some defensive moves, as explained in the 2016 netcode developer update (press summary) [S14].

### Why prediction matters

- Swink's under 100 ms threshold [S1] is easily blown by network latency. Apex's own numbers: a 20 Hz server costs about 5 frames of delay at 50 ms ping and 60 fps, a 60 Hz server about 3 [S11]. If the muzzle flash, kick and sound waited for the server, every shot would feel mushy.
- The pattern across Valorant, Apex and Overwatch is the same: everything that belongs to the shooter's own gun (flash, viewmodel animation, camera kick, fire sound, tracer, world impact spark) is local and instant. Anything that states a fact about the enemy (damage, hit marker, blood, kill) comes from the authority.

### Layer order (synthesis, not a measured spec)

Frame 0: fire sound, muzzle flash, viewmodel recoil animation, camera kick, tracer spawn. Frame 0 to 1: world impact spark and decal at the predicted hit point. Frame RTT: confirmed hit marker, hit sound, damage number, body-attached hit VFX. Riot's note that tracers render "at least one frame" before the shot is processed [S8] shows how tight this ordering is.

## 2. Hit confirmation

- Valorant: confirmation is the server hit VFX and hit audio, arriving one RTT after the shot [S8]. Patch 1.07 scaled headshot blood and sparks down "slightly" so players can keep tracking the target through them [S9].
- Apex Legends: damage numbers change color by what was hit. Community guides report white, blue and purple for shield tiers, red for health, and a headshot shown with a distinct color regardless of armor; the crosshair hit indicator also shows shield level [S15]. Treat exact colors as community-reported.
- Fortnite: damage numbers turn yellow on a critical (head) hit, per a community guide [S16]. In v5.0 Epic added a reticle indicator of how many shotgun pellets hit (reported via patch-note coverage) [S17].
- Overwatch 2: launched with new particle-style hit markers; some players asked for the OW1 style back [S18]. Headshots ("critical hits") deal 2x in general, per community mechanics references [S19]. In 2024 tanks got 25% reduction against critical damage [S20].
- Call of Duty (Modern Warfare II / Warzone 2): press reports distinct hit marker color and sound for armor hits, a separate sound for plate break and a screen flash on armor break for the victim [S21]. I could not verify this against official patch text.
- Kill confirmation: across these games a kill is signaled by a distinct sound, a distinct marker, and a kill feed entry. I found no developer source with exact timing values, so no timing numbers are claimed here.

## 3. Recoil design

- Deterministic patterns: Counter-Strike spray patterns are fixed, with per-bullet random spread layered on top; community analysis notes the visible view punch does not exactly match where bullets go [S22]. Apex originally had randomized recoil and switched to fixed, learnable patterns before launch. The source is Shroud's own account, not a Respawn statement [S23].
- Valorant: community analysis describes rifle sprays in phases: a tight first few bullets, then a pull-down phase, then a horizontal phase whose direction is random [S24]. Not a Riot source.
- Call of Duty (MW 2019 onward): Infinity Ward deliberately gave MW2019 guns noticeably more recoil than prior CoDs so each gun feels different [S25]. The common description of CoD recoil as "random within a directional bias" is widely repeated in the community, but I found no official source, so it is unverified.
- Apex patch commentary: the Havoc's old pattern with constant horizontal movement was "either too difficult... or far too easy", so it was changed to match other patterns [S23a].
- Visual vs aim recoil: Overwatch's Oct 2020 patch "Reduced camera shake to make recoil feel smoother" on Soldier: 76 without touching accuracy [S26], and Warzone patches tune "visual recoil" as its own stat [S27]. Visual kick and real aim displacement are separate knobs.
- Recovery: The Astronauts reset horizontal kick faster than vertical [S6]. Whether the camera returns to the original aim point after a burst varies by game; I found no developer source with specific values.

## 4. Spread and bloom

- First-shot accuracy: Fortnite 3.4 gave ARs, SMGs and pistols first-shot accuracy: "When aiming, standing still, and the weapon has not fired recently, the first shot will be 100% accurate." [S28]
- Fortnite v5.0 made shotgun spread "consistent with no random variation" and added a short lockout between firing two shotguns (the "double pump" fix) [S17].
- Bloom debate: players attacked Fortnite's random bloom as luck over skill. Epic test builds removed it, and press noted the counter-argument that without bloom, whoever sees the enemy first usually wins [S29].
- Valorant movement inaccuracy (patch 2.02, rifles): running error 3.75 to 5.0, walking 0.8 to 1.1, crouch-moving 0.3 to 0.8, to "make kills while moving with rifles more rare, especially at longer ranges, but still possible up close" [S30]. Patch 0.50 stopped players entering the walking-accuracy state during the run-to-stop transition, because it made shots look like they were fired at full speed [S31].
- Community-reported first-shot spread: Phantom 0.2 hip / 0.11 ADS, Vandal 0.25 hip / 0.157 ADS [S32]. Community data.
- CoD MWIII Tac-Stance "dramatically increases ADS movement speed while introducing bullet spread", a spread-for-mobility trade [S33].

## 5. Time to kill

### Health pools

| Game | Health model | Source |
|---|---|---|
| Valorant | 100 HP; Light Shield 25, Heavy Shield 50 (max 150); Regen Shield 25 with a 50 regen pool | [S34] |
| Apex Legends | 100 HP; shields from 50 up to 125 | [S35] |
| Overwatch 2 | Per hero. Season 9: 150 to 175 HP heroes +25, 200 to 300 HP heroes +50, tanks +75 to 100; passive regen 20 HP/s after 5 s | [S36] |
| Fortnite | 100 health plus 100 shield; Creative overshield defaults to 50 with a 6.5 s recharge delay | [S37][S38] |
| CoD | 100 HP historically; MWIII raised core multiplayer to 150 "lengthening the TTK", Hardcore unchanged | [S39][S33] |

### Weapon data points

- Valorant Vandal: 160 headshot damage at any range, a guaranteed kill. Phantom headshot falls to 140 at 15 to 30 m, yet it still kills about 78% of the time when that happens [S40]. Community-reported: Phantom 156/140/124 headshot by range band [S32]; Operator 255 head / 150 body / 120 legs [S41]; Sheriff head 159/145, body 55/50 by range [S42].
- Apex R-301: 13 body damage, 1.77x head, 810 RPM, 0.96 s TTK vs 175 HP. Flatline: 18 body, 1.78x head, 600 RPM, 0.90 s. Wingman head multiplier 2.15x, 2.5x with Skullpiercer [S35a][S43]. Wiki data.
- Fortnite 3.4: AR headshot multiplier cut from 2.5x to 2x. AR falloff starts at 50 m, 80% at 75 m, 65% at 100 m [S28]. Current-season ARs on the wiki use 1.5x to 1.75x [S44].
- Warzone (Verdansk return): the CR-56 AMAX was reported at 570 ms TTK. Game director Pete Actipis said the faster TTK means players who "aren't good at hitting straight shots" still "have an opportunity" [S45].

### What TTK does to fun

- Longer TTK raises survivability and counterplay. Blizzard's Season 9 goal was to "lessen the impacts of burst damage to allow for greater counterplay", pairing more health with bigger projectiles for "a more consistent feel to firing and landing your shots" [S46].
- Shorter TTK helps less accurate players (Raven's stated Warzone rationale [S45]). It also shifts outcomes toward who saw whom first, the same trade-off raised in the Fortnite bloom debate [S29].
- Latency interacts with TTK. Riot computed about 141 ms of raw peeker's advantage in a 64-tick, higher-latency baseline, cut to about 71 ms with their infrastructure [S10]. When TTK is shorter than reaction time plus peeker's advantage, the defender cannot respond.
- Changing TTK after launch is risky. DICE raised Battlefield V's TTK to make it "more enjoyable for new players", then reverted it: "Clearly we didn't get it right" [S47].

## 6. Movement and controls

- Sprint-to-fire: Black Ops 6 XM4 base sprint-to-fire is reported as 190 ms, and 100 ms with Assault Grip. Community wiki data [S48].
- ADS movement: Apex ADS strafe multipliers per the community wiki: pistol 1.0, SMG 0.75, AR 0.5, LMG 0.4, marksman 0.425, sniper 0.35 [S43]. A separate community test gives SMG 0.9, shotgun 0.9 and sniper 0.33 [S49]. The sources disagree on SMG and sniper; neither is official. MWIII raised base ADS strafe speed [S33].
- Slide and cancels: MWIII lets players "Cancel slide and reload animations" and "Fire immediately while sliding" [S33]. Black Ops 6 Omnimovement allows sprint, slide and dive in any direction [S50].
- Toggle vs hold and assists: Black Ops 6 offers Sprint Assist (manual, automatic, or tac-sprint only, with a 0 to 1000 ms delay), Mantle Assist, Crouch Assist and Corner Slice [S51].
- Valorant PC defaults: WASD, Shift walk, Space jump, Ctrl crouch (toggle crouch on per the guide), LMB fire, RMB alt fire / ADS (hold by default), R reload, 1/2/3 primary/secondary/melee, F use, G drop, Q/E/C/X abilities [S52][S53].
- Apex swap speed: the Quickdraw Holster hop-up raised and lowered guns faster and cut ADS time, which shows swap speed is a tunable stat [S54].
- Tagging (hit slow): Valorant 1.02 reduced standard tagging from 80% to 70%, wall-penetration tagging from 35% to 25%, and doubled the ramp-in time so it is less "jarring" and tagged players can reach cover more often [S55]. Valorant 1.07 gave shotguns past 10 m a separate "30% slow for .5s on a smooth curve" [S9].
- ADS sensitivity: CoD's default Monitor Distance Coefficient of 1.33 matches 75% of the distance from crosshair to screen edge on 16:9, the same as CS:GO, and scales scoped sensitivity from FOV [S56]. Valorant's zoom levels run 1.15x (SMGs), 1.25x (rifles), 1.5x (Guardian, Sheriff), 2.5x and 5x (Operator), 3.5x (Marshal, Outlaw) per converter data [S57].
- Coyote time and input buffering: general platformer techniques (grace frames after leaving a ledge, remembering a jump pressed just before landing) [S58]. I found no source on how the five target games use them, so their use there is unverified.

## 7. Camera feel

- Screen shake: Nijman treats shake as a core layer [S4]. Blizzard later said OW2's camera shake can be "too aggressive or jarring (often due to multiple/layered effects)" and promised to tone it down [S59]. OW has "Camera Shake: Reduced" and "HUD Shake: Off" accessibility options, according to player reports [S59].
- Flinch: Sledgehammer reduced global flinch in CoD WWII for "better consistency" in head-to-head fights [S60]. Warzone tunes per-weapon flinch resistance [S27].
- Tagging slowdown (Valorant) is covered in section 6 [S55].
- Hit stop: common in melee and action games. A hobbyist tutorial suggests about 0.1 to 0.2 s [S61]; this is not an authoritative source, and I found no FPS developer using hit stop on gunfire.
- Accessibility: the Game Accessibility Guidelines recommend avoiding, or offering options to disable, camera motion that differs from player input [S62]. CoD MWIII and BO6 offer world and weapon motion blur reduction and other visual options [S63].

## 8. VFX readability vs clutter

- Valorant skins: "Weapons will keep their base muzzle flash shape and scale". Skin tracers can only be seen in the shooter's first-person view, aiming reticles "stay clean and easily readable when you ADS", skin audio is never louder or quieter than the base, and cosmetic sounds duck under gameplay cues. Only the skin's model is visible to other players [S64].
- Valorant maps: art is "always subordinate to gameplay clarity and making sure the Agents are always clearly visible". Materials stay "similar in value", and lighting highlights the spaces where visibility matters most [S65].
- Valorant hit VFX: smaller headshot effects so players can track through them; body-attached confirms [S9].
- Overwatch: tournament spectator clients recolor effects such as shields and explosions to team colors [S66]. OW2 made projectiles larger for consistency [S36].
- Fortnite accessibility: "Visualize Sound Effects" draws icons for footsteps, gunfire, chests and more [S67].
- Effect lifetime: The Astronauts let impact smoke outlive muzzle smoke [S6]. I found no published lifetime numbers from the five target games.

## 9. Low health and damage direction

- Every target game uses directional damage indicators and some low-health screen treatment, but I found no developer articles with specific design values. Anything beyond the existence of these features is unverified.
- Related: the CoD armor-break screen flash (press-reported [S21]); OW2 passive regen after 5 s out of combat [S36]; Fortnite's shield recharge delay (Creative default 6.5 s [S38]).

## 10. Implications for Ultima Capivara

These are recommendations, derived from the evidence above plus our constraints: casual-but-skillful, stylized, 100 HP + up to 100 armor + 60-point helmet, bots in practice, host-authoritative P2P at 20 Hz snapshots.

1. **Predict all shooter-owned feedback on the input frame.** Fire sound, muzzle flash, viewmodel kick, camera kick, tracer and a small neutral world-impact spark happen locally at frame 0, as in Valorant and Apex [S8][S11]. Never wait on the host for these.
2. **Split impact feedback into predicted and confirmed layers (Valorant 1.07 model).** Instant small spark at the predicted hit point, then on host confirm the hit marker, hit sound, damage number and a body-attached hit effect [S9]. Never show a predicted hit marker, because correctness beats clarity [S8].
3. **Plan for 20 Hz honestly.** Apex ships at 20 Hz [S11], so it is viable. But snapshot interval (50 ms) plus interpolation buffer plus RTT means confirms will often arrive 100 to 200 ms after the shot. That range is our estimate, not a measurement: measure it in the build. Keep the hit sound crisp and distinct so a late confirm still reads as a result.
4. **Host-side lag compensation, favor the shooter, with a cap.** Rewind to the shooter's view time as Valorant does [S10], and cap the rewind window (value to tune) so high-ping players cannot hit targets long behind cover, the asymmetry Apex describes [S11]. Consider Overwatch-style exceptions for escape moves [S14].
5. **The host must not get a free advantage.** The host player has zero latency. Run the host's own shots through the same confirm path and timing presentation so feel is identical, and weigh this in fairness tests.
6. **TTK targets: slower than Valorant, faster than Apex at full armor.** Suggested bands: unarmored body TTK with the M4 about 0.3 to 0.4 s; full armor plus helmet about 0.7 to 0.9 s. Apex R-301 is 0.96 s vs 175 HP [S35a]; Warzone's casual-friendly 570 ms [S45] sits in the middle. Peeker's advantage at our latency will exceed Valorant's [S10], so very short TTK would punish holders. Tune in practice with bots and a TTK readout.
7. **Headshot multiplier 1.5x to 2.0x, not 2.5x.** Fortnite cut 2.5x to 2x [S28]; Apex ARs sit near 1.77x [S35a]; OW uses 2x [S19]. Keep skill reward without making every exchange a coin-flip one-tap. The helmet (60) absorbs head damage first and gives a unique break sound and flash, the way CoD signals armor break [S21].
8. **Armor feedback by color and sound.** Use Apex-style damage number and hit marker variants for armor, helmet, flesh and head [S15], with colorblind-safe palettes, plus a distinct armor-break cue for both attacker and victim.
9. **Deterministic recoil patterns, gentle.** Learnable fixed patterns like CS and Apex [S22][S23]. Put most of the kick into visual recoil (camera and viewmodel) and keep true aim displacement small and consistent, as OW did for Soldier: 76 [S26]. Horizontal recovers faster than vertical [S6]. ADS cuts recoil and spread.
10. **First-shot accuracy and mild bloom.** Adopt Fortnite 3.4's rule: aiming, still, not fired recently means a perfect first shot [S28]. Keep bloom small and fast-recovering so tap-firing is a skill, not luck [S29]. The crosshair should expand exactly with real spread, never with visual kick alone.
11. **Movement inaccuracy by class.** Follow Valorant's direction but softer for casual play: rifles, DMR and sniper get large run error, while pistol, revolver and SMG stay usable on the move [S30]. Do not let the run-to-stop transition grant walk accuracy [S31]. Start ADS move multipliers near the Apex spread: pistol 1.0, SMG about 0.8, M4 0.5, DMR about 0.4, sniper about 0.35 [S43][S49].
12. **Shotgun: fixed pellet pattern and pellet feedback.** Fixed spread, a pellet-hit indicator in the reticle, and a swap-fire lockout to block double pumps, as Fortnite v5.0 did [S17]. Add range tagging like Valorant 1.07 if pumps dominate at mid range [S9].
13. **Snipers.** Bolt sniper (5.5x): headshot kills through a full helmet; body shot does not kill full armor. Valorant's Operator 150 body vs 150 max HP is the competitive reference [S41]; we want less. DMR (2.9x): a clearly lower zoom tier, like Valorant's 2.5x to 3.5x spread [S57].
14. **Mild tagging, ramped.** If we slow on hit, keep it small and ramp it in, following Valorant's own reduction and ramp [S55]. Scope flinch should be small and consistent, the lesson of CoD WWII's flinch reduction [S60].
15. **Coconut launcher and machete.** Predict the coconut's arc and flight locally, as Overwatch predicts projectiles [S12][S13]; the host confirms the explosion and damage. Telegraph the arc and blast radius. The machete is the one place for a very short hit stop and heavier camera punch; keep any hit stop under Swink's 100 ms loop [S1] and never apply it to guns.
16. **VFX clarity rules.** Muzzle flashes keep a fixed shape and scale and must not cover the reticle in ADS [S64]. Keep headshot and blood effects small [S9]. Enemies stay readable against the tropical scene through value contrast and lighting [S65]. Enemy tracers stay thin and short-lived; impact smoke may outlive the flash [S6].
17. **Camera shake budget and accessibility.** Cap total shake so stacked sources cannot add up (Blizzard's lesson [S59]). Ship a Camera Shake slider (0 to 100%), HUD shake toggle, motion blur off, and reduced flashes from day one [S62][S63].
18. **Controls and sensitivity.** PC defaults: WASD, Space jump, Ctrl crouch, Shift sprint (a CoD-style casual choice, not Valorant's walk), RMB ADS on hold by default with a toggle option, R reload, 1 to 4 weapon slots, V or F melee. Offer toggle/hold for ADS, crouch and sprint, plus auto-sprint like BO6 [S51]. Default ADS and scope sensitivity uses the 1.33 monitor-distance coefficient, with a per-zoom multiplier override [S56].
19. **Reload and slide cancels.** Allow reload cancel by sprint, swap or melee, and allow firing out of a slide, as MWIII does [S33]. Sprint-to-fire around 150 to 200 ms for rifles, faster for pistols and SMGs, in line with the BO6 XM4 data point [S48].
20. **Practice range as the tuning lab.** Give bots a mode that shows damage numbers, TTK, hit location and recoil trace, so every number above can be checked against the targets.

## Sources

- [S1] https://en.wikipedia.org/wiki/Game_feel
- [S2] https://www.youtube.com/watch?v=Fy0aCDmgnxg
- [S3] https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-
- [S4] https://www.youtube.com/watch?v=AJdEqssNZ-U
- [S5] https://mein-mmo.de/en/warum-spielt-sich-destiny-so-gut-die-tricks-entwickler-153,33071
- [S6] https://www.theastronauts.com/2019/03/making-gun-come-to-life/
- [S8] https://playvalorant.com/en-us/news/dev/the-state-of-hit-registration/
- [S9] https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-1-07/
- [S10] https://www.riotgames.com/en/news/peeking-valorants-netcode (also https://technology.riotgames.com/node/111)
- [S11] https://www.ea.com/games/apex-legends/news/servers-netcode-developer-deep-dive
- [S12] https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and
- [S13] https://gdcvault.com/play/1024041/Networking-Scripted-Weapons-and-Abilities
- [S14] https://www.gamestar.de/artikel/overwatch-blizzard-erklaert-den-netcode-208hz-client-tickrate,3270417.html
- [S15] https://shacknews.com/article/110042/how-to-change-damage-numbers-in-apex-legends
- [S16] https://gamewith.net/fortnite/article/show/182
- [S17] https://www.dexerto.com/fortnite/fortnite-v5-0-full-patch-notes-season-5-begins-as-update-released-116455/ (official page: https://www.fortnite.com/patch-notes/v5-0, not fetchable)
- [S18] https://eu.forums.blizzard.com/de/blizzard/t/overwatch-2-hitmarkers/3429
- [S19] https://www.icy-veins.com/forums/topic/21678-overwatch-mechanics/
- [S20] https://overwatch.blizzard.com/en-us/news/patch-notes/live/2024/05
- [S21] https://twinfinite.net/2023/03/warzone-2-season-two-reloaded-brings-long-awaited-changes-to-armor-breaks/
- [S22] https://refrag.gg/blog/recoil-control-in-counter-strike-2-a-complete-guide
- [S23] https://www.pcgamesn.com/apex-legends/weapon-recoil
- [S23a] https://esports.gg/news/apex-legends/apex-legends-devs-on-how-weapons-are-balanced
- [S24] https://www.gfinityesports.com/article/valorant-project-a-control-recoil-improve-aim-better-riot-games-pc
- [S25] https://mp1st.com/news/modern-warfare-infinity-ward-says-theyre-pushing-for-player-first-system-recoil-of-alpha-guns-shown-off
- [S26] https://overwatch.blizzard.com/en-us/news/patch-notes/live/2020/10
- [S27] https://www.gfinityesports.com/article/warzone-april-19-patch-notes
- [S28] https://mp1st.com/news/fortnite-3-4-update-patch-notes-vending-machine-high-explosives-mode-more
- [S29] https://mein-mmo.de/en/fortnite-zugriff-testserver-waffen,196440
- [S30] https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-2-02/
- [S31] https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-0-50
- [S32] https://esports.gg/news/valorant/the-valorant-rifle-rundown-phantom-vs-vandal-which-is-better
- [S33] https://gamingtrend.com/news/what-multiplayer-looks-like-in-call-of-duty-modern-warfare-iii-straight-from-call-of-duty-next/
- [S34] https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-9-10
- [S35] https://apexlegends.wiki.gg/wiki/Shield
- [S35a] https://apexlegends.wiki.gg/wiki/AR
- [S36] https://overwatch.blizzard.com/en-us/news/patch-notes/live/2024/02
- [S37] https://mein-mmo.de/en/what-are-shields-in-fortnite-and-how-do-they-work,801871
- [S38] https://dev.epicgames.com/documentation/en-us/fortnite/using-the-overshield-in-fortnite-creative
- [S39] https://www.gfinityesports.com/article/call-of-duty-modern-warfare-3-health-change-reaction
- [S40] https://playvalorant.com/en-gb/news/dev/valorant-data-drop-phantom-vs-vandal/
- [S41] https://www.gamepressure.com/valorant/sniper/z0d33f
- [S42] https://liquipedia.net/valorant/Sheriff
- [S43] https://apexlegends.fandom.com/wiki/Weapon
- [S44] https://fortnite.fandom.com/wiki/Modular_Enforcer_AR
- [S45] https://insider-gaming.com/warzone-devs-address-fast-time-to-kill-concerns-on-verdansk/
- [S46] https://overwatch.blizzard.com/en-us/news/24056255/revitalizing-the-overwatch-2-experience/
- [S47] https://www.gamespot.com/articles/battlefield-5-backtracks-on-controversial-time-to-/1100-6463966/
- [S48] https://callofduty.fandom.com/wiki/Assault_Grip
- [S49] https://www.dexerto.com/apex-legends/apex-legends-strafe-ads-speed-383308/
- [S50] https://www.callofduty.com/blog/2024/08/call-of-duty-next-black-ops-6-reveal-global-systems-key-innovations-announcement
- [S51] https://news.blizzard.com/en-us/article/24135092/call-of-duty-next-black-ops-6-global-systems-revealed
- [S52] https://www.shacknews.com/article/117434/valorant-pc-controls-and-keybindings
- [S53] https://afkgaming.com/esports/guide/fns-valorant-settings-2022-crosshair-keybinds-and-video-settings
- [S54] https://techraptor.net/gaming/news/apex-legends-season-7-patch-notes-debuts-quickdraw-hop-up
- [S55] https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-1-02/
- [S56] https://mouse-sensitivity.com/forums/topic/6164-call-of-duty-modern-warfare-2019/page/12
- [S57] https://www.mouse-sensitivity.com/n/valorant/
- [S58] https://tooster.itch.io/chapter-01/devlog/560384/input-buffering-coyote-time
- [S59] https://us.forums.blizzard.com/en/overwatch/t/overwatch-2-accessibility-and-screen-shake/671231
- [S60] https://mp1st.com/news/cod-ww2-flinch-less-global-adjustments-rolled-out-sledgehammer-calls-toughness-perk-a-crutch
- [S61] https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/
- [S62] https://gameaccessibilityguidelines.com/
- [S63] https://www.callofduty.com/blog/2024/10/call-of-duty-black-ops-6-accessibility-updates-features
- [S64] https://playvalorant.com/en-gb/news/dev/the-craft-and-fantasy-of-valorant-weapon-skins/
- [S65] https://playvalorant.com/en-us/news/dev/the-art-of-valorant-map-environments
- [S66] https://80.lv/articles/comparing-team-fortress-2-and-overwatch-art-direction
- [S67] https://www.epicgames.com/help/en-US/c-Category_Fortnite/c-Fortnite_Gameplay/are-there-any-accessibility-settings-for-fortnite-a000088596
