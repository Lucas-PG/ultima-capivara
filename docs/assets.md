# Origem dos recursos

- `public/assets/cover-v2.png`: imagem original gerada para este projeto com a ferramenta integrada ImageGen em 24/09/2026. Não usa uma fotografia ou personagem licenciado como entrada.
- `public/assets/favicon.svg` e ícones de interface: desenho vetorial no código do projeto.
- Geometria do mapa, personagens, mãos, armas procedurais, pickups e materiais: código local em `src/render` e `src/shared/world.ts`. Modelos de armas adicionais e suas licenças estão em [public/models/SOURCES.md](../public/models/SOURCES.md).
- Áudio: gravações CC0 de disparos, passos e recargas, com síntese Web Audio para ambiente, feedback e fallback. O banco local ocupa cerca de 69 KB; origens, autores e transformações em [audio-sources.md](audio-sources.md).
- Barlow e Barlow Condensed: fontes distribuídas por Fontsource, licença SIL Open Font License; pacotes fixados no lockfile. Licenças de fontes acompanham `public/licenses/`. O build também gera `dist/licenses/dependencies.md` com os avisos das dependências incluídas.
- Menus ilustrados da padaria e do café e padrões de azulejos: arte original desenhada em Canvas em `src/render/wall-art.ts`, num atlas compartilhado. Vegetação usa geometria fechada e folhas individuais, sem o antigo atlas de cartões de folhas.
- Texturas fotográficas de superfícies, folhas históricas e céu HDR: veja [public/textures/SOURCES.md](../public/textures/SOURCES.md) para URLs e licença por recurso.

## Prompt da capa

Ferramenta: ImageGen integrada; geração nova, sem imagem de referência.

> Premium main-menu key art for Última Capivara, wide 16:9. Brazilian tropical island at golden hour, red-tiled village, turquoise lagoon, docks, palms, jungle and a purple storm. A tough, charming cinnamon capybara in the right third wears an olive canvas vest and turquoise bandana, holding a compact rifle safely pointed down. Small distant parachuting capybara. Rich painted 3D game art, tactile detail, warm ochre light and jade shadows, expressive animated-film character. Keep the left half dark and quiet for HTML title and controls. No text, UI, watermark or blood. Full-bleed cinematic depth.

A imagem é usada somente como capa estática. Nenhuma captura de gameplay é substituída pela arte da capa.

## Referências de direção de arte

A segunda revisão estudou [Esperança, da Blizzard](https://news.blizzard.com/en-us/article/23865963/voyage-to-esperanca-a-portuguese-city-built-on-tradition-brilliance-and-hope), para identidade dos bairros, interiores e sons locais; o [processo de iluminação de Overwatch](https://news.blizzard.com/en-us/article/23674944/environment-states-in-overwatch-2-behind-the-scenes-with-the-engineering-team), para contraste e custo de renderização; e [Garden Warfare, no portfólio do estúdio Mighty Canvas](https://mightycanvas.com/portfolio-items/plants-vs-zombies-garden-warfare/), para linguagem cartunesca e personagens legíveis.

As aplicações locais foram fachadas identificáveis, piso com menos contraste que os alvos, detalhes de perto, equipamento azul-esverdeado nas capivaras, foco quente no forno e paisagem sonora por local. Nenhuma imagem, modelo, textura ou áudio desses jogos foi incorporado à distribuição.

## GPU texture decoder

`public/decoders/basis/basis_transcoder.js` and `basis_transcoder.wasm` are copied unmodified from the installed Three.js 0.186.0 `examples/jsm/libs/basis` distribution for local KTX2 loading. These are software dependencies, not art assets. The upstream Basis Universal Apache 2.0 license and Three.js decoder README are included in that directory. Source: https://github.com/BinomialLLC/basis_universal . No CDN is contacted by the loader.

## Forja M1 concept prompts, 2026-09-24

Original paintovers generated with the built-in ImageGen tool. Direction A is locked. These are art-review targets, not captured gameplay or runtime textures. Pincel approved all three on 2026-09-24 as implementation targets, subject to the refinements below. Inputs are the team's local baseline captures; originals remain unchanged. Files are retained in `docs/concepts/` and copied to the shared reviews directory.

### forja-m1-sky.png

```text
Use case: style-transfer / stylized-concept. Asset type: original game rendering production paintover, F1 sky for Última Capivara, Direction A "Ilha Dourada".
Edit target: the supplied pincel-baseline-wide-hilltop.png. Preserve its elevated camera, terrain and village layout, roof and tree silhouettes and positions. Remove HUD, first-person gun, crosshair and toast for this world-only art review, filling the underlying scene consistently. This is a rendering look target, not a new map.
Output 2048x1152 landscape 16:9 or larger 16:9. Replace the entire photographic violet sky with a smooth hand-painted gradient dome: zenith #4F9FD0 through mid #9FD0E0 to warm horizon #FFD49A. Exactly 8 large stylized cumulus groups with broad clean rounded lobes, body #FFF4E2, sun-facing undersides #F6B98C, shaded undersides #C9B2D6. Painted sun disc #FFF1C9 at upper left with restrained soft glow. No photographic cloud microdetail, grain, violet streaks, storm stripes or gradient banding. Golden afternoon light from upper left, soft 3-band value shapes, lavender #6B5B95 ground shadows. Preserve Brazilian island setting; terrain #6FAE45/#8CC453, tropical canopy #86BD4F/#5FA544/#3F8A4A, terracotta roofs #D0673F, cream walls #F3E6CF; thin warm #3A2418 silhouette lines only. No cypress or pines, new buildings, people, logos or imitation of any existing game.
Add one small elegant cream #E9E4D8 technical inset in the lower right, no more than 22% width, that clearly shows the construction of one of these same cloud groups as 3 overlapping painted billboard cards, one exploded perspective and one assembled silhouette. Exact short pt-BR labels in readable clean hand-lettering: "Céu da Ilha Dourada", inset "Nuvem em 3 cartões", arrows "Frente", "Meio", "Fundo". Keep inset visually subordinate to the sky. The main scene must remain a faithful recognizable paintover of the supplied camera.
```

### forja-m1-water.png

```text
Use case: style-transfer / stylized-concept. Asset type: original water rendering production paintover sheet F2 for Última Capivara, Direction A "Ilha Dourada".
Two edit targets provided in order: (1) pincel-baseline-porto-water.png, port camera layout; (2) pincel-baseline-praia.png, beach camera layout. Output one 2048x1152 landscape 16:9 sheet with two wide stacked frames on an understated #E9E4D8 margin. Upper frame port, lower frame beach. Preserve recognizable buildings, kiosk spacing, container placement and horizon composition from each input; omit all HUD, gun, crosshair and text from game. At port, include a foreground shoreline detail inset so the material reads despite small distant water in baseline; this inset may show water around simple rocks and pier posts.
Primary subject WATER: broad flat painted turquoise depth zones, shallow #2EC4B6 through mid #1FB0AE to deep horizon #0E7C86, calm warm golden daylight from upper left. The transition to sand is soft: wet sand #D9B77A blending to dry #F2D9A0; shallow water is translucent at shoreline. Broken gently curving foam ribbons #F4FBF6 at about55% opacity along sand, rocks and timber pier posts, no hard straight seam. Sparse SMALL painted sun glint cards, simple short cream lozenges with soft edges, never a bright carpet. No photo normal maps, no photographic ripples, no glitter noise, no repeating tiny waves. Show depth and edge treatment clearly enough to implement the shader.
Supporting scenery only: hand-painted soft 3-band look, upper-left warm light, lavender #6B5B95 shadows, warm thin #3A2418 outlines. Retain Brazilian kiosks, terracotta #D0673F roofs, cream #F3E6CF walls, containers painted blue #3D6FB6/teal #2A9D8F/coral #E76F51. Sky gradient #4F9FD0/#9FD0E0/#FFD49A with large soft stylized clouds. No new landmarks, brands, logos, cypress, pines, grain or scratches.
Readable clean hand-lettered pt-BR labels only: title "Águas da Ilha Dourada"; frame labels "Porto" and "Praia"; small inset arrows "Espuma na margem", "Areia molhada", "Brilhos pintados"; three small palette swatches labeled "Raso", "Médio", "Fundo". Original artwork, no imitation of an existing game.
```

### forja-m1-storm.png

```text
Use case: style-transfer / stylized-concept. Asset type: original storm-wall rendering production paintover F3 for Última Capivara, Direction A "Ilha Dourada".
Edit target is pincel-baseline-plaza.png. Preserve recognizable Brazilian plaza, bunting, market stalls, fountain, pastel village forms and warm afternoon lighting. Omit HUD, first person gun and crosshair for this world-only concept. Output one landscape 2048x1152 16:9 production sheet, two large equally sized side-by-side landscape scene panels, with clean small cream #E9E4D8 title/callout area and a small third vignette inset. This sheet demonstrates DISTANCE FADING of one storm boundary, not different weather.
Panel A is from inside the safe zone, 150 metres from the boundary: unobstructed sunny painted sky gradient #4F9FD0 through #9FD0E0 to #FFD49A, large cream stylized clouds. Only an extremely subtle soft desaturated violet haze at the distant ground/horizon hints at the storm. Absolutely no diagonal stripes, arcs, purple sky fill, giant pillars, hard bands or visible wall high in the sky.
Panel B is standing 10 metres from that same storm boundary. A restrained translucent violet #8A4DFF curtain, around20% opacity, with sparse slow-flowing broad vertical wisps, fades gently into the sky at the top and visibly follows the ground. Warm landscape remains very legible behind the curtain; no opaque fog and no busy lines. Hint of gentle storm motion through wisps, not arrows or action streaks. Make the proximity boundary legible while preserving clear silhouettes for aiming.
Third small inset shows the outside-the-zone screen effect: translucent violet feathered vignette confined to outer edges, centre stays clear, same scene visible. Label exact pt-BR "Fora da zona: bordas suaves".
Art direction: hand-painted soft clean 3-band shading, light upper-left, lavender #6B5B95 shadows, thin warm #3A2418 outlines, no pureblack or photo texture or grain. Terracotta #D0673F, plaster #F3E6CF, foliage #86BD4F/#5FA544/#3F8A4A. No new landmarks, logos, English, franchises.
Text clean readable hand lettering: title "Tempestade com distância"; panel A "Zona segura · 150 m"; panel B "Perto da borda · 10 m"; short note under A "Só névoa no horizonte"; short note under B "Cortina violeta · 20%"; inset label as above.
```


### Pincel implementation refinements, 2026-09-24

- Sky: billboard cards must not turn or pop with camera motion. Use soft painted edges, mix lower 15 percent of the dome into fog, and use a painted sun halo without full-sky bloom.
- Water: the concept horizon drifts toward royal blue; authored water must stay shallow `#2EC4B6`, mid `#1FB0AE`, deep/horizon `#0E7C86`, then fog `#F2DCB6`. Remove invented horizon mountains; use open sea or actual island headlands.
- Storm: at 150 m show only soft horizon haze. At 10 m, the boundary surface tints only geometry behind it at about 20 percent. Foreground objects inside the safe zone retain their colours. The outside-zone vignette must leave the central 50 percent clear for aiming.
- Review implementation at hilltop, porto/praia, and storm 150 m/10 m/outside poses. Concepts are approved direction references, not evidence that the runtime implementation is complete.
