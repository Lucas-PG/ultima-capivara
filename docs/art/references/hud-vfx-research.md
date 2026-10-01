# HUD and VFX direction
29 September 2026. Static concepts only; no UI or effects code was changed.

## HUD
The golden-hour mockup includes health 100, armor 50, ammo 24/120, M4 name, a three-slot weapon strip, compass, two-row kill feed, small crosshair and a transient hit-marker state. North and 000 agree. Ivory type on deep teal plates, coral health, cyan armor, and restrained tile accents connect to the Brazilian setting. Values are illustrative, not claims about runtime capacities or maxima. M4 is lowered below the view; paws are intentionally out of this UI composition, so this is not a holding-pose reference.

Persistent information occupies edges. Center contains only small aiming/hit ticks with a clear gap. Armor and health have different icons as well as colors. A head portrait helps identity without taking the center. Corner decoration reaches the frame edge; text remains inset. Responsive layout, contrast measurement, color-vision tests, HUD scaling and safe-area behavior are not established by this image. The image approximates 16:9 at its generated raster size; see file audit for dimensions.

## VFX evidence
Riot describes per-weapon muzzle-flash differentiation and links it to weapon shape/use/power in [the arsenal process](https://playvalorant.com/en-gb/news/dev/how-the-valorant-arsenal-was-built/). Their [2020 skin article](https://playvalorant.com/en-gb/news/dev/the-craft-and-fantasy-of-valorant-weapon-skins/) preserves base flash shape/scale and clear ADS reticles across cosmetics. Transfer consistent visibility budgets across cosmetic variants, not another game's proprietary effects.

Riot's [VFX portfolio guidance](https://www.riotgames.com/en/portfolio-and-reel-suggestions) identifies shape, value, color and timing, with gameplay information as the primary read and painterly execution. The sheet uses clear tapered silhouettes and sparse high-value cores accordingly.

Riot's [hit-registration explanation](https://playvalorant.com/en-gb/news/dev/the-state-of-hit-registration/) distinguishes muzzle/tracer presentation from later confirmed hit feedback and describes misleading effects when targets move. Transfer the distinction between shot effect, environmental impact and confirmed hit indicator. This task does not implement or verify networking behavior.

## Original effect proposals
- Pistol: compact three-lobed flash. Revolver: stronger short star. SMG: very small forward tongue. M4/Frevo: short asymmetric prongs. DMR: narrow forward spear. Sniper: brief strong cone. Shotgun: broad short petals. Maracatu LMG: compact dense fork with gaps between pulses. Machete has no muzzle flash.
- Coco launch: cream air puff, intact green coconut. Arpao launch: faint pressure wisp and one shaft, no flame. Do not interpret the illustrated streaks as permanent glowing trails or changed projectile speed.
- Stone: localized gray puff and tiny chips. Wood: directional splinters at a notch, intact plank around it. Metal: small dent/tear and a few short angular sparks, no masonry fracture pattern. Sand: ochre soft low plume. Water: turquoise crown and rings. Match surface response, not one identical spark on everything.
- Coconut burst: green husk, white flesh, amber puff and short pale ring. Clearly a fictional tropical game effect. No photoreal fireball, persistent opaque smoke screen or unrelated damage radius inferred.
- Tracers: thin tapered ivory/gold streaks, not solid laser tubes. Hit spark: compact ivory/coral feedback shape visually distinct from material impact. The static sheet enlarges all examples for study; do not use poster pixels as world scale.

Starting animation targets, not measured game timings: muzzle bright core 1-2 frames at 60 fps, taper 2-4 frames; low-opacity residue 6-10 frames. Impact sharp phase 1-3 frames, dust/splash decay roughly 0.15-0.45 s depending on surface. Coconut burst anticipation none on impact, core 2-3 frames, debris/puff decay roughly 0.35-0.70 s. Hit-marker display roughly 0.08-0.12 s as a starting UI review value. These need gameplay review across frame rates and bright/dark backgrounds. Avoid repeated flashes merging into an opaque ADS mask. No particle system, texture atlas, alpha sprite or animation clip is claimed to have been delivered by the opaque style sheet.
