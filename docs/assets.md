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
