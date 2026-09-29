# Facao first-person and swing research
Updated 29 September 2026. These are original proposed animation targets. No reference footage was frame-counted. Read [shared evidence](animation-research.md) and [image QA](README.md) before blocking.

## Reference findings
MW2019 and MWII combat-knife animation are candidate short-contact references, not grounds to give this much larger blade an identical wrist-only snap. MWIII's official weapons guide distinguishes weapon bash from equipped melee, and notes mobility and health/armor-dependent damage. It does not prescribe our damage, swing timing or lunge distance. BF2042 knife/takedown is a comparison lead only; an external-camera takedown cannot validate first-person framing. Valorant officially classifies Tactical Knife as melee; Riot's animation process supports readable, intentional beats. Apex heirloom and unarmed motions are style/secondary-motion leads, not a universal machete swing. Overwatch Genji's official page identifies Dragonblade as a distinct melee weapon state, while Swift Strike is a dash ability. Do not add a dash, deflect or projectile to this machete. Fortnite's third-person harvesting tools inform exaggerated anticipation, but cannot establish FP hand contacts; the Ballistic launch material does not document a comparable machete kit.

Sources read:
- [MWIII weapons guide](https://www.callofduty.com/guides/multiplayer-pre-game/call-of-duty-modern-warfare-III-campaign-play-guides-weapons-loadouts).
- [Valorant arsenal](https://playvalorant.com/en-us/arsenal/) and [Riot animation process](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/).
- [Genji abilities](https://overwatch.blizzard.com/en-us/heroes/genji/). The page also lists mode-specific upgrades; those are not the baseline machete proposal.
- [Fortnite Ballistic launch](https://www.fortnite.com/news/fortnite-goes-first-person-with-ballistic-a-tactical-5v5-shooter-launching-in-early-access-dec-11).

## Identity and contacts
Preserve broad curved worn-steel blade, bright lower cutting edge, capybara stamp near brass ferrule, wooden teal-frond handle with three rivets, brass pommel and three colored ribbons. Right paw uses a hammer grip on the wood: all THREE fingers wrap the handle, opposing thumb at its anatomical left edge. No trigger finger exception on this weapon. Left free paw has three fingers and a thumb on its anatomical right edge. Straight wrists and connected ivory-cuffed forearms; no paw touches blade or crosses its travel corridor. Ribbon attachment stays at pommel and trails the motion, never threads through fingers.

Hip: blade and right grip low-right with tip angled forward/up. Left loose balancing paw low-left. Keep the center and target readable. Avoid a permanently vertical blade splitting the crosshair lane. Focused ready: a slightly raised, compact grip with unchanged camera FOV. ADS is N/A: no sights, zoom, reticle or invented firearm posture. Tactical reload and empty reload are both N/A; no ammunition, magazine or chamber action. The requested reload filename contains the swing kit.

Sprint: proposed 0.18 s entry, blade lowered along right outside edge, left arm counter-swings without crossing the blade; 0.23 s return. No automatic sprint attack or lunge implied. Avoid aiming the tip at the player's face during bob.

## Six board poses and timing
The six cells are a kit, not one continuous six-stage attack. Cells 1-4 are one light slash; cell 5 samples a separate heavy chop; cell 6 samples inspect.

| Cell | Time | Pose and contact intent |
| --- | --- | --- |
| 1 | Light 0.00 | Idle, right hammer grip, left loose guard low-left. |
| 2 | Light 0.14 | Wind-up at upper-right, elbow leads, wrist aligned; left retracts behind blade plane. |
| 3 | Light 0.24 | Cutting edge crosses a wooden practice post near screen center from right to left. One contact point, small wood chips; no flesh target. |
| 4 | Light 0.38 | Follow-through lower-left, blade continues same arc. No teleport or reverse grip. Recover to idle by 0.68 s. |
| 5 | Heavy 0.44 | Separate overhead chop at downward contact, right wrist straight, left remains clear. Anticipate 0.00-0.30, accelerate 0.30-0.44, settle 0.44-0.65, recover by 1.05 s. |
| 6 | Inspect 0.85 | Roll the flat to show capybara stamp and handle, left remains below/clear. Keep cutting edge away from either paw. |

Inspect timeline: 0.00-0.30 lift, 0.30-0.85 present one face, 0.85-1.40 roll to other face, 1.40-1.90 return. No tossing, spinning free of the hand, or sharpening gesture. Cosmetic and cancelable.

Weight and hits: shoulder/elbow lead anticipation, blade follows a smooth arc, wrist carries rather than flops. One short contact check and small rebound, then controlled follow-through. A miss keeps momentum; do not use the same stop as a hit. Hold the contact silhouette for about two displayed frames as a starting art target, with hit registration timing left to gameplay. Ribbons lag, then overshoot once. Keep camera horizon stable and avoid full-screen blur or trails hiding the edge. No claim that these proposed timings are balanced or implemented.
