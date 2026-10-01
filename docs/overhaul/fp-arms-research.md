# First-person arms research: rigs, grips, reloads and stylized hands

Purpose: evidence base for the capybara first-person arms (one arm rig, two-bone IK to per-weapon hand targets in weapon space, keyframed reloads anchored to moving parts, separate viewmodel FOV, fur shells). Each claim about a shipped game cites a source listed at the end as [Sn]. Evidence levels differ: official docs and developer posts are primary; GDC Vault entries are often paywalled, so for those only the public abstract or a press summary was read, and that is stated. Section 7 is our own reasoning, turned into rules for this game.

## 1. Rig construction, FOV and framing

### Arms-only rig versus full body

- Most shooters render a dedicated first-person model (arms plus weapon) visible only to the owner, and a separate third-person model for everyone else. Unreal's native system formalizes this split: primitives tagged as first person are seen only by the owning camera, while a world-space representation is hidden from that camera but casts shadows, shows in reflections and is what other players see [S1].
- Valve's viewmodels are built for one camera: hidden parts are deleted, visible parts get extra detail, and the whole model is distorted to look its best from that single angle [S4]. TF2 moved from per-weapon v_models (arms baked in) to c_models: one weapon model plus a separate arms model per class, animated together [S5][S4].
- Halo 2's first-person set is authored per weapon in its own folder (ready, idle, moving, overlays, posing, put-away, reload-full, reload-empty, firing, melee, grenade), which is effectively an arms-only rig per weapon [S6].
- Full-body first person exists but is the exception: Mirror's Edge built a full-body first-person pipeline [S18], and Battlefield 3 inherited it, anchoring the camera to the animation rig instead of floating it [S17]. Press summary only; the GDC material itself was not read. Danger Close's GDC 2013 bootcamp talk frames the goal as hands, body and weapon that feel inhabited rather than a camera on a stick [S19] (abstract only).
- Overwatch rebuilt every hero's first-person animation from scratch with only the needed parts (arms, upper torso, legs for kicks). Moving the camera into the third-person rig did not work [S10].

### Viewmodel FOV and render passes

- The viewmodel is authored and animated for one specific FOV, so it stays fixed, while the world FOV is a player setting (comfort, monitor distance, motion sickness) [S2]. TF2 defaults the viewmodel to 54 degrees and exposes a slider [S5]. Valve's SDK also documents per-weapon viewmodel FOVs [S4].
- Unreal applies the first-person FOV and a first-person scale as a vertex morph after world position offset and before projection. The scale pulls geometry toward the camera so it looks unchanged but rarely intersects walls [S1].
- Two-camera pattern: render the world, clear depth, then render the viewmodel with its own camera [S2][S3]. In three.js that is `autoClear = false`, render world, `clearDepth()`, render the gun scene. Caveat from the three.js forum: `scene.background` and skyboxes get drawn by every camera, so the gun pass must not repeat them [S3]. The cheap alternative (depthTest off, high renderOrder) draws the gun over smoke and effects too [S3].
- Shadows: the free-floating arm usually does not cast into the world (it would look wrong) [S2]; Unreal instead self-shadows the first-person mesh in screen space and lets the hidden world body cast the ground shadow [S1]. Lights must reach both passes [S2].
- Unreal notes that grooms (strand hair) are not supported in its first-person path [S1]. Shell fur is a mesh technique, so it survives, but it will be seen closer than anything else in the game.

### Framing and screen composition

- Bungie's "combat corridor": keep the middle band of the screen clear during animations so players never miss information there. Destiny also places the crosshair slightly below center to give more peripheral space at the sides and top [S8] (press summary of Helsby's GDC 2015 talk [S7]).
- Overwatch: the weapon tip lines up with the reticle, weight is conveyed by where the weapon sits in the frame, with attention to empty space to its right [S10]. Widowmaker's rifle was resized so it stopped blocking the right side of the screen [S9].
- Valve accepts distortion (shortened or stretched arms, a posed weapon) because only the eye view matters [S4]. First-person poses that look stiff or odd from outside are normal [S4][S9].
- TF2 offers minimal viewmodels that lower the weapon for more visibility [S5]; Valorant keeps every skin at exactly the base gun's screen footprint [S15]. Screen area taken by arms and weapon is treated as a gameplay budget.

## 2. Hand IK, grips and per-weapon poses

- Common engine pattern: the firing hand holds the weapon via a socket with a per-weapon offset, and the support hand is IK-placed on a per-weapon target (near the grip for pistols, fore-end for rifles and shotguns), with the IK weight driven by an animation curve so it can let go during reloads [S24]. Community forum, but the same structure appears in most engines.
- Grips as data: the s&box weapon animator binds each hand to a weapon attachment bone, then saves a hand target, elbow control and finger pose as the weapon's default grip, reused by every animation [S23]. Our per-weapon targets (wrist, forward, palm, curls) are the same idea.
- Maya FPS rig (Respawn viewmodel animator Micah Reigstad): the weapon controller is parented to link locators on both hands, and a hand is attached to a moving part (magazine) by keying a parent-constraint blend to 1 on the contact frame and to 0 one frame before, so the hand snaps onto the part only while touching it [S22]. Arm IK handles lock the hand while the elbow moves; forearm twist is distributed along the forearm so wrist rotation does not candy-wrap the skin [S22].
- Bill Buckley (Gnomon course) frames the job as a character rig plus a weapon rig animated together, with precise contact points preserved when moving into the engine [S29].
- Support hand styles: the C-clamp grip puts the support hand far forward on the handguard, thumb over the top, fingers wrapped under, squeezing the rail. That gives strong recoil control and a very readable silhouette. Traditional grip cups the handguard from below. Source is a firearms blog (reference, not game data) [S31].
- Hand poses are held for long stretches and show up in screenshots, so they should be tight and asymmetric (avoid identical left and right poses) [S32] (community summary of an animator's post; the original page blocked fetching).
- Overwatch swapped Soldier: 76's reload from the right hand to the left because the right hand blocked the view [S9]. The side of the screen a hand crosses is a design decision.

## 3. Reload choreography and timing

- Empty versus tactical is standard. Halo 2 lists reload-full and reload-empty as separate slots and allows reuse [S6]. Modern Warfare (2019) authored separate tactical and empty reloads (empty adds the charge or bolt release) and ADS reloads that keep the weapon on target [S16].
- Key poses first: block 5 or more poses (start, grab magazine, seat, and so on) before any in-betweens [S22]. Buckley's course likewise starts from the idle pose and builds fire and reload on top with timed contact points [S29].
- Weight in curves: magazine insertion uses an exponential curve (slow pressure, then it snaps home), then a small decaying settle, like a bouncing ball with tiny translation. No squash or stretch for realistic work [S22].
- Anticipation and overshoot: Overwatch animators overshoot extremes and hold key poses a bit longer than usual, and offset arm timing because symmetry looks stiff [S12] (third-person talk summary, same studio as S9).
- Realism is a dial: Infinity Ward deliberately angles guns during reloads for show, because strict realism reads as boring [S21]; Modern Warfare took reference from Navy SEAL advisors and live-fire sessions [S16]. Battlefield 1's partial bolt-rifle reload ejects the chambered round and the hand catches it and puts it back [S20]: a contact that follows a moving part.
- Readability: Overwatch reloads must not cover the view yet must clearly signal you cannot shoot [S10], and each hero's reload expresses personality (Soldier's Garand-like clip, D.Va's pistol spin, Roadhog's rough shove) [S9].
- Shell-by-shell (tube shotgun): author start, a single-shell loop and an end, and let the player interrupt between shells [S27]. The same structure fits a speedloader-free revolver or our coconut hopper.
- Revolver: swing out, eject (rod push), insert (speedloader or strip), close, return to ready. Real technique reference, not game data [S33]. Every step has a moving part the support hand touches.
- Audio sync: sounds are fired from animation events placed on specific frames (Unreal's notifies, with a timeline to drag them into sync) [S26]. Battlefield 1's accurate reload was pushed by a sound designer [S20], a sign that audio and animation are co-authored.
- Typical durations (community stat pages): Valorant rifles reload in 2.5 s and equip in 1 s [S30]; community pages list the Sheriff near 2.25 s and the Operator near 3.7 s (search snippets only, not verified). Treat about 1.5 to 2.5 s for pistols and rifles, 3 s or more for bolt rifles and empty reloads, and about 0.4 to 0.6 s per shotgun shell as a starting range, then tune by feel.

## 4. Draw, holster, inspect, sprint and procedural layers

- Halo 2 set: ready comes from off screen to idle, put-away leaves the screen completely, a flavor "posing" idle plays after long idle, a moving cycle sways arms side to side with the steps [S6].
- Halo 2 also ships an overlay pose set for lag and follow-through: arms back, forward, left, right, and gun pitch left, right, up, down, blended by movement and look input so the gun trails the camera [S6]. This is authored sway.
- Halo 2 hint: start with a static idle to lock the pose on screen before anything else; tiny motions make or break first person, so always judge in engine [S6].
- Destiny lowers the weapon before a grenade throw so one throw animation serves every weapon [S8].
- Camera motion is the most sensitive layer: a static camera feels airy, a fully literal one feels jerky and causes sickness [S8]. Destiny leads melee with the head like a boxer, then counterbalances [S8].
- Overwatch: light weapons aim steady, heavy ones show inertia sway scaled to the hero's strength [S10]. Winston's first-person run is sold by exaggerated hand digging rather than head bob [S10].
- Procedural springs on top of keys: stiffness and damping springs drive bob, look sway and recoil without authored clips, and an addition mode can scale or smooth an existing animation [S28] (third-party Unity controller docs, representative of common practice).
- Modern Warfare added more sprint variants and animated fire-mode switching [S16]. Inspect animations are standard deliverables at Respawn (steamgun: fire, reload, inspect in first and third person) [S34].

## 5. Stylized and animal hands

- Valorant enlarges hands on purpose so the weapon reads as a clearer graphic [S13]. Oversized hands are a readability tool, not a flaw.
- TF2's style comes from proportions, silhouettes and weapons, with the highest contrast at chest level where the weapon is held, rim highlights instead of outlines, and interior shapes that echo the silhouette [S25]. The team up-rezzed hands for close-up shots [S25]. Hands near the camera need extra detail budget.
- Overwatch pushes limbs in first person [S11]: Cassidy's (then McCree) arm stretches on recoil, Genji's sword stretches when drawn [S9], punches stretch like rubber [S10]. Winston (a gorilla) never plants his knuckle in the first-person animation even though he appears to run on it; Reinhardt's hand passes through his other arm when seen from outside [S9]. First-person arms can cheat anatomy as long as the eye view is convincing.
- Overwatch treats each hero's physiology as part of the handling (small heroes quick and light, large heroes heavier) [S10]. For a species, the equivalent is consistent paw anatomy and weight across every weapon.
- Riot notes that first-person weapons and view arms are rarely seen from other angles, so mirroring them (left-hand mode) needs art checks [S14]. First-person art only holds up from the angles it was checked from.
- Gap: no published breakdown was found for furry or pawed first-person hands in a major shooter. Super Animal Royale and Party Animals are not first-person; Fortnite's first-person Ballistic mode carries existing outfits over [S35] but no public art breakdown was found. Rules in section 7 for fur and paws are our own reasoning.

## 6. Practical checks and tooling

- Judge in engine at the real FOV; DCC views lie [S6][S2].
- Review from outside too: Overwatch and Riot both describe first-person art seen from third-person or mirrored angles as a known source of surprises [S9][S14]. A side camera finds IK and pose errors the eye camera hides.
- Clipping has two parts: viewmodel against world (solved by the depth-cleared pass or first-person scale [S1][S3]) and paw against weapon (only solved by authored contact). The depth trick hides the first and does nothing for the second.
- Contact frames need a tool: a parent-blend switch at the contact frame [S22] or saved grip data bound to a weapon bone [S23]. Freehand hand keys drift.
- Audio events on frames, not timers, so animation timing changes keep sounds in sync [S26].

## 7. What we apply here

Our rules, derived from the findings above.

1. **Paw-to-gun proportion matches third person, then scales for the eye.** Size the first-person paw from the third-person character's paw relative to the same weapon, then allow a modest enlargement for readability, as Valorant does [S13]. Never let first-person paws imply a different animal than the one other players see [S1][S5]. Check once with first-person and third-person screenshots of the same weapon side by side.
2. **Arms enter from the lower corners and stay out of the combat corridor.** Forearms come in from bottom right (firing) and bottom left or center (support), the muzzle points at the reticle, and nothing but the barrel crosses the central band during idle, fire and most of the reload [S8][S10]. Keep the viewmodel footprint roughly constant across weapons [S15].
3. **Silhouettes at the edges read at a glance.** The cuff, forearm fur edge and paw outline must separate from the gun by value (dark bare palm skin against lighter fur and metal), like TF2's contrast where weapons are held [S25]. Keep fur shells short at the silhouette so the outline does not shimmer, and give paws more texture and shell density than the body since they sit closest to the camera [S25][S1].
4. **Firing paw shows its back to the eye.** The firing paw's back (fur side) faces the camera, digits wrap the grip, the index sits on the trigger or indexed along the frame when not firing. Palm skin shows only at edges and on the support paw. Hold poses are asymmetric [S32].
5. **Support paw wraps, not floats.** Rifles, SMG, DMR and sniper: support paw on the handguard, digits wrapped under, the abducted outer digit acting as the thumb over the top (C-clamp style) or cupping from below, but always closed around the part with palm contact [S31][S24]. Shotgun: wrapped around the pump. Pistol and revolver: support paw cups the firing paw. Coconut launcher: support paw on the hopper body or fore-grip. Machete: support paw free, in frame edge or out of frame.
6. **Grips are data, per weapon, in weapon space.** Each weapon owns its wrist, forward, palm and curl targets; animations never re-invent a grip [S23][S24]. IK support weight is a curve that goes to zero when the support paw leaves [S24].
7. **Reload contacts follow the moving part.** Any key where a paw touches a magazine, slide, bolt, pump, cylinder or shell is anchored to that part for the whole contact, with blend on at the contact frame and off one frame before release [S22]. No sliding paw on a moving part.
8. **Reloads: block poses, weight, anticipation, readable state.** Block 5 or more key poses first [S22]; seat magazines with an exponential curve and a small settle [S22]; overshoot and hold key poses slightly [S12]; empty reload adds the charge or bolt action [S16]; shotgun and hopper use start, loop, end and can be interrupted per shell [S27]; revolver shows swing out, eject, insert, close [S33]. The player must see that the gun cannot fire, without the reload covering the center [S10]. Audio cues sit on contact frames [S26].
9. **Procedural layers on top, never instead.** Sway, bob, lag and recoil springs are additive on authored poses and scaled by weapon weight [S6][S10][S28]. They must not break contacts: apply them to the whole arm-plus-weapon root, not to the hands separately.
10. **Fixed viewmodel FOV, separate pass.** Keep the depth-cleared viewmodel pass and a fixed viewmodel FOV that the poses are authored against [S2][S3]; do not redraw sky or background in that pass [S3].
11. **Review from the eye and both sides.** Every grip and reload is signed off from three cameras: the game eye at gameplay FOV, a left side camera and a right side camera, plus a top view for the support wrap. The eye camera judges framing and silhouettes; side cameras judge penetration and contact [S14][S9]. Allowed: first-person cheats that the eye cannot see (shortened upper arms, hidden shoulders) [S4][S9]. Not allowed: paw geometry passing through weapon parts, gaps between palm and grip, or digits floating off the trigger visible from the eye.

### Per-weapon grip and reload map (starting points, tune by feel)

| Weapon | Firing paw | Support paw | Reload contacts (paw anchored to) | Start duration |
| --- | --- | --- | --- | --- |
| Pistol | back of paw to eye, index on trigger | cups firing paw, outer digit along frame | magazine out, new magazine, slide release | 1.5 s tac, 1.9 s empty |
| Revolver | back of paw to eye, index on trigger | cups cylinder side | cylinder swing, ejector rod, speedloader, cylinder close | 2.4 to 2.8 s |
| SMG | back of paw to eye | wraps fore-grip or handguard | magazine, charging handle on empty | 1.8 s tac, 2.3 s empty |
| M4 | back of paw to eye | C-clamp or cupped handguard, closed | magazine, bolt catch or charging handle | 2.2 s tac, 2.7 s empty |
| Pump shotgun | back of paw to eye | wrapped on pump | each shell (loop), pump rack at end | 0.5 s per shell plus in and out |
| DMR | back of paw to eye | handguard wrap, further forward | magazine, charging handle on empty | 2.4 s tac, 2.9 s empty |
| Bolt sniper | back of paw to eye | handguard under | bolt handle (up, back, forward, down), magazine | about 3.5 s, bolt cycle about 0.8 s |
| Coconut launcher | back of paw to eye on grip | hopper body or fore-grip | hopper lid, each coconut (loop) | per item loop like the shotgun |
| Machete | wraps handle, knuckles forward | free, kept at frame edge | none | n/a |

Durations are our starting values, anchored on the published ranges in section 3 [S30][S16]; they are not measured from any game.

### Review checklist per weapon

- Eye camera at gameplay FOV: muzzle on reticle, center band clear, paws enter from lower corners, cuff and paw silhouettes readable over bright and dark backgrounds.
- Left and right side cameras: no paw or digit inside weapon geometry at idle, fire, and every reload contact frame; no visible gap between palm and grip.
- Top camera: support digits wrap under the handguard or pump, outer digit on top or along the side.
- Scrub the reload frame by frame: each contact stays locked to its moving part, audio event lands on the contact frame.
- Side-by-side with the third-person character holding the same weapon: same paw size relative to the gun, same fur color and cuff.

## Sources

- [S1] Epic Games, First Person Rendering in Unreal Engine (official docs). https://dev.epicgames.com/documentation/en-us/unreal-engine/first-person-rendering : first-person FOV and scale, anti-clipping morph, world representation, shadows, groom limitation.
- [S2] Bevy, First person view model example (official example). https://bevy.org/examples/camera/first-person-view-model/ : separate camera and render layers, fixed viewmodel FOV rationale, arm not a shadow caster, lights on both layers.
- [S3] three.js forum, Rendering a gun on another layer. https://discourse.threejs.org/t/rendering-a-gun-on-another-layer/80805 : clearDepth two-pass pattern, skybox caveat, depthTest-off tradeoff.
- [S4] Valve Developer Community, Viewmodel. https://developer.valvesoftware.com/wiki/Viewmodel (read via search index; the site blocked direct fetching) : hidden parts removed, distortion for one view angle, per-weapon FOV, c_models with arms.
- [S5] Official TF2 Wiki, Viewmodel. https://wiki.teamfortress.com/wiki/Viewmodel : default viewmodel FOV 54, minimal viewmodels.
- [S6] Microsoft/343, Halo 2 MCC modding docs, First Person Animations. https://learn.microsoft.com/en-us/halo-master-chief-collection/h2/art/animation/animationsfpanims : animation set, overlay lag poses, ready/put-away, static idle first, judge in engine.
- [S7] GDC Vault, David Helsby, The Art of First Person Animation for Destiny (2015, abstract only). https://gdcvault.com/play/1022297/The-Art-of-First-Person
- [S8] Mein-MMO, Why does Destiny play so well (press summary of S7). https://mein-mmo.de/en/warum-spielt-sich-destiny-so-gut-die-tricks-entwickler-153,33071 : combat corridor, lower crosshair, camera motion, grenade lowering, boxer head lead.
- [S9] Inven Global, How Overwatch's first-person animation breathed life into heroes (GDC 2017, Matt Boehm, press summary). https://www.invenglobal.com/articles/1187/how-overwatchs-first-person-animation-breathed-life-into-heroes : left-hand reload for visibility, Widowmaker resize, stretched limbs, Winston and Reinhardt cheats.
- [S10] 4Gamer report on the same talk (Japanese). https://www.4gamer.net/games/280/G028066/20170228101/ : rebuilt first-person animation, tip to reticle, weight by framing, inertia sway by strength, reload readability, Winston hand digging. Talk video: https://www.youtube.com/watch?v=7t0hLZd_8Z4 (not watched).
- [S11] GameAnim, First person animation in Overwatch (index entry). https://www.gameanim.com/2017/04/29/first-person-animation-overwatch
- [S12] Uppsala University game design blog, GDC Overwatch animation talk summary (David Gibson). https://babel.speldesign.uu.se/?p=113918 : overshoot, longer holds, asymmetric arm timing.
- [S13] Inverse, interview with Valorant art director Moby Francke. https://inverse.com/gaming/valorant-art-style-interview-moby-francke : hands enlarged so weapons read better.
- [S14] Riot Games, Ask VALORANT #8. https://playvalorant.com/en-us/news/game-updates/ask-valorant-8/ : first-person weapons and view arms rarely seen from other angles, left-hand view needs art testing.
- [S15] Inven Global, Riot's process of creating VALORANT guns and gun skins. https://www.invenglobal.com/articles/11213/riot-games-process-of-creating-valorant-guns-and-gun-skins : skins keep the base gun's screen space.
- [S16] Activision, Modern Warfare Initial Intel: animation and authenticity (Mark Grigsby). https://blog.activision.com/call-of-duty/2019-07/Modern-Warfare-Initial-Intel-Detailing-Advancements-in-Animation-and-Authenticity : tactical vs empty reloads, ADS reloads, SEAL reference, range sessions, sprint and fire-mode animations (the last two via search summary).
- [S17] Engadget, How Mirror's Edge gave legs to Battlefield 3. https://www.engadget.com/2012-08-13-how-mirrors-edge-gave-legs-and-more-to-battlefield-3.html : camera anchored to the animation rig.
- [S18] GDC Vault, Dahl and Lagre, Creating First Person Movement for Mirror's Edge (2009, abstract only). https://gdcvault.com/play/1012171/Creating-First-Person-Movement-for
- [S19] GDC Vault, Ryan Duffin, Giving Purpose to First-Person Animation (2013, abstract only). https://gdcvault.com/play/1017633/Animation-Bootcamp-Giving-Purpose-to : hands, bodies, weapons beyond a camera on a stick.
- [S20] Mein-MMO, Battlefield 1 reload realism. https://mein-mmo.de/en/battlefield-1-so-realistisch-wird-das-nachladen,90276 : caught chambered round, sound designer drove it.
- [S21] Engadget, Infinity Ward animator talks first-person flourishes (Chance Glasgo). https://www.engadget.com/2012-11-08-infinity-ward-animator-talks-first-person-flourishes.html : intentional unrealistic gun angles for entertainment.
- [S22] 80 Level, Studying Realistic FPS Animation in Maya and Toolbag (Micah Reigstad, Respawn). https://80.lv/articles/002mrs-004adk-studying-realistic-fps-animation-in-maya-toolbag : IK arms, forearm twist, weapon links, contact blend keys, key poses, insertion curves, settle.
- [S23] s&box animator (GitHub). https://github.com/adaster98/sbox-animator : hand targets, elbow controls, finger posing, saved default grip bound to a weapon bone.
- [S24] Unreal Engine forums, Left Hand IK. https://forums.unrealengine.com/t/left-hand-ik/350399 : socketed firing hand, IK support hand per weapon, curve-driven IK alpha (community).
- [S25] Valve, Stylization with a Purpose: The Illustrative World of Team Fortress 2 (GDC 2008 slides). https://cdn.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf : read hierarchy, contrast where weapon is held, rim highlights, silhouettes, up-rezzed hands.
- [S26] Epic Games, Animation Notifies (official docs). https://dev.epicgames.com/documentation/unreal-engine/animation-notifies-in-unreal-engine : frame-placed sound events.
- [S27] Unreal Engine forums, Looping shotgun shell reload (montages). https://forums.unrealengine.com/t/looping-shotgun-shell-reload-montages/404818 : start, loop, end with per-shell interrupt (community).
- [S28] Opsive, Ultimate Character Controller: Springs (third-party docs). https://opsive.com/support/documentation/ultimate-character-controller/animation/springs/ : spring stiffness and damping for bob, sway, recoil on top of animation.
- [S29] Gnomon Workshop, Creating First Person Shooter Animations for Games (Bill Buckley, course page). https://studio.thegnomonworkshop.com/blog/creating-first-person-shooter-animations-for-games : idle first, character plus weapon rig, contact points into engine.
- [S30] Gfinity, Valorant Phantom or Vandal (community stats). https://www.gfinityesports.com/article/valorant-episode-3-act-1-which-gun-to-use-phantom-or-vandal : 2.5 s reload, 1 s equip.
- [S31] Primary Arms blog, What is the C-clamp grip (firearms reference). https://blog.primaryarms.com/guide/what-is-the-c-clamp-grip-on-an-ar15/ : C-clamp hand placement and why it controls recoil.
- [S32] ModDB, Animation poses (Reto Colding, lead animator; read via search summary, page blocked fetching). https://www.moddb.com/news/animation-poses : long-held hand poses, screenshots, avoid twinning.
- [S33] Revolver reload handout (real-world technique, via search summary). https://www.scribd.com/document/423007080/Revolver-Reload-Hand-Out : eject, strip or speedloader, close.
- [S34] 80 Level, First-person and third-person steamgun animations (Micah Reigstad). https://80.lv/articles/first-person-third-person-steamgun-animations-made-with-maya : fire, reload, inspect delivered in both views.
- [S35] Epic Games, Fortnite goes first-person with Ballistic. https://www.fortnite.com/news/fortnite-goes-first-person-with-ballistic-a-tactical-5v5-shooter-launching-in-early-access-dec-11 : existing outfits carry into first person (no art breakdown found).
