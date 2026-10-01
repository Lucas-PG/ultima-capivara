# Third-person character readability: research notes

30 September 2026. How Overwatch 2, Fortnite, Valorant and Apex Legends keep third-person
characters readable and appealing at gameplay distances, and what that means for the capybara.
Sources were read in this pass; where a page could not be opened or only a secondary summary was
available, that is said next to the claim. Nothing here is copied art: these are principles.

## What the games do

### Overwatch / Overwatch 2 (Blizzard)
- A hero must be "immediately identifiable in the middle of battle"; each new hero is checked
  against the roster for a silhouette that is too close to another and for effects that add too
  much visual noise. Heroes differ in proportion and design language, not only in story.
  Source: Arjan Terpstra, "Designing Overwatch", Cook and Becker, 24 Oct 2022, quoting William
  Petras and Arnold Tsang (https://cookandbecker.com/en/article/378/designing-overwatch.html).
  The GDC 2017 talk "The Art of Overwatch: Evolving a Legacy" exists
  (https://gdcvault.com/play/1024268/The-Art-of-Overwatch-Evolving); only its abstract was read.
- Redesigns keep the silhouette, palette and sense of motion (Tracer's OW2 update); new shading
  was used to let faces and body language carry more emotion. Source: BlizzCon 2019 "Evolving
  the Art" recap (https://overwatch.blizzard.com/en-us/news/23189038).
- Idles carry personality on top of the role: confident heroes stand wide and square; asymmetric
  timing, overshoot and held key poses avoid a stiff, symmetric look. Source: David Gibson,
  "Animating Mei", GDC 2016, reported by 80.lv (https://80.lv/articles/david-gibson-animating-mei-in-overwatch).
- Reloads and weapons stay out of sightlines ("it's already a busy world out there"); the
  third-person rig uses cheats players never notice. Source: Matt Boehm, GDC 2017, reported by
  Inven Global (https://www.invenglobal.com/articles/1187/how-overwatchs-first-person-animation-breathed-life-into-heroes).
- Budgets (secondary source, attributed to principal tech artist Scott Goffman; the original
  forum post was not seen): about 30k triangles for a hero LOD0 plus 15k for the weapon, four
  LODs each about half the previous, 2048 textures for heroes.
  Source: https://www.gosugamers.net/overwatch/news/35188-interesting-insight-into-overwatch-tech-art.
- Enemy and friendly outlines have separate colour-blind options (9 colours).
  Source: https://ubergizmo.com/2018/09/blizzard-test-colorblind-overwatch.

### Valorant (Riot)
- The goal is accessibility over beauty; the style is "illustrative"; hands are enlarged
  "to make the weapons a more apparent graphic". Source: Tomas Franzese interviewing art director
  Moby Francke, Inverse, 6 Nov 2020 (https://inverse.com/gaming/valorant-art-style-interview-moby-francke).
- Each agent keeps a unique palette readable in game; black is avoided on large areas because it
  gives too little contrast with the environment. Source: "VALORANT Agent Insights: Fade",
  7 Jun 2022 (https://playvalorant.com/en-us/news/game-updates/valorant-agent-insights-fade/),
  read through a mirror, not the page itself.
- Character shading for clarity: a remapped half-Lambert, a rim (fresnel) weighted to up-facing
  angles and the upper body, larger and more distinct enemy fresnel, distant characters
  brightened; the low preset drops specular but keeps every gameplay-relevant term.
  Source: Brandon Wang, "VALORANT Shaders and Gameplay Clarity", Riot, 30 Jun 2020
  (https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity).

### Fortnite (Epic)
- Photo-derived textures read as noise, so surfaces were hand painted; strict parallel lines were
  removed from real objects; normal and specular maps are still used. Source: secondary summary
  of Peter Ellis, "Developing the Art of Fortnite", GDC 2018, by Erik Nordeus
  (https://blog.habrador.com/2018/08/stylized-graphics-fortnite-sea-of-thieves.html); the primary
  video was not watched.
- Stylised characters that must read as cartoons benefit from flattened lighting and outlines
  built from depth and normal buffers, tuned so they hold against the sky. Source: Unreal Fest
  talk on The Simpsons in Fortnite, reported by Inven Global
  (https://www.invenglobal.com/articles/22947/the-simpsons-comes-to-fortnite-cartoon-rendering-beyond-the-limits-of-pbr).
- No official Epic source on character proportion rules or triangle budgets was found.

### Apex Legends (Respawn)
- Every legend "must have a silhouette different from other legends" so players know at once
  what they face. Source: 80.lv, 5 May 2022, lead concept artist Cristina Ferez
  (https://80.lv/articles/apex-legends-might-slow-down-character-releases-in-the-future).
- Skins are built on ID maps and layer masks, so colour zones are defined per material region.
  Source: Adobe Substance magazine, 29 May 2019, Patrick Yeung
  (https://www.adobe.com/products/substance3d/magazine/apex-legends-texturing-battle-royale-phenomenon-2019.html).
- No published readability budgets or third-person holding rules were found.

### Animals in clothes
- Zootopia's animals wear convincing clothing while keeping animal qualities; artists posed
  against the full fur silhouette, and fur was simplified with distance to keep the groom's
  intention (baked grooms for crowds). Source: "From Armadillo to Zebra", WDAS production panel
  (https://media.disneyanimation.com/uploads/production/publication_asset/139/asset/ZootopiaProductionPanel.pdf).
- Open problems listed there included how clothes lie on an animal without human shoulders and
  trousers on short legs. Source: Michelle Robinson, SIGGRAPH blog, 21 Feb 2017
  (https://blog.siggraph.org/2017/02/the-making-of-zootopia.html/).

## What we took for the capybara

| Principle | Decision in v6 |
| --- | --- |
| Unique silhouette at 60 m (Ferez, Petras/Tsang) | Barrel torso, long blunt head with a flat top line and tiny ears, big three-toed feet, a backpack with a bedroll: the black silhouette is a capybara, not a human in a suit. |
| Big simple colour zones with visual rest | Four large blocks (chestnut fur, cream shirt, indigo denim, olive trousers) and one saturated accent. Fine detail (weave, check, grain, fur strands) lives in the texture and fades with mips. |
| Team colour must read at distance | The team colour lives on the scarf (high, near the face) and the hip rag (low, on the silhouette edge when moving); both are neutral-grey cloth tinted per texel at runtime, so the hue is exact and the folds keep their light. |
| No large black areas (Valorant) | Denim is a mid indigo, the paws a warm dark brown, not black; claws are the only near-black. |
| Enlarged hands (Francke) | The world paw is the first-person paw at 1.1x and the held weapon scales with it, so the first-person grip specs stay valid and both read at 15 m. |
| Weapon close to the body, out of sightlines, cheated rig (Boehm) | Long guns sit in a bladed stance (shoulders turned, head turned back to the aim); the stock tucks into the shoulder, the support paw reaches the handguard close to the chest. |
| Personality in idle and gait (Gibson) | Calm, heavy breathing on a belly bone, weight shifts, an ear flick and a chew; the waddle rolls over the stance foot while the head floats level; ears, pack and rag lag. |
| LOD chain about halving (Overwatch) | 26.5k / 7.8k / 2.2k triangles at 0 / 12 / 28 m, one 2048 texture set shared by every LOD and player. |
| Readability survives low settings (Riot) | The existing rim and fur sheen are kept for every preset; nothing gameplay-relevant depends on the normal map. |
| Fur as silhouette clumps, simplified with distance (Zootopia) | Clumps and strands are painted into albedo and relief; the far LOD keeps only the silhouette. |
