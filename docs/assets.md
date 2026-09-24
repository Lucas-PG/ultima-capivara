# Origem dos recursos

- `public/assets/cover-v2.png`: imagem original gerada para este projeto com a ferramenta integrada ImageGen em 24/09/2026. Não usa uma fotografia ou personagem licenciado como entrada.
- `public/assets/favicon.svg` e ícones de interface: desenho vetorial no código do projeto.
- Geometria do mapa, personagens, mãos, armas procedurais, pickups e materiais: código local em `src/render` e `src/shared/world.ts`. Modelos de armas adicionais e suas licenças estão em [public/models/SOURCES.md](../public/models/SOURCES.md).
- Áudio: gravações CC0 de disparos, passos e recargas, com síntese Web Audio para ambiente, feedback e fallback. O banco local ocupa cerca de 69 KB; origens, autores e transformações em [audio-sources.md](audio-sources.md).
- Barlow e Barlow Condensed: fontes distribuídas por Fontsource, licença SIL Open Font License; pacotes fixados no lockfile. Licenças de fontes acompanham `public/licenses/`. O build também gera `dist/licenses/dependencies.md` com os avisos das dependências incluídas.
- Texturas fotográficas de superfícies, folhas e céu HDR: veja [public/textures/SOURCES.md](../public/textures/SOURCES.md) para URLs e licença por recurso.

## Prompt da capa

Ferramenta: ImageGen integrada; geração nova, sem imagem de referência.

> Premium main-menu key art for Última Capivara, wide 16:9. Brazilian tropical island at golden hour, red-tiled village, turquoise lagoon, docks, palms, jungle and a purple storm. A tough, charming cinnamon capybara in the right third wears an olive canvas vest and turquoise bandana, holding a compact rifle safely pointed down. Small distant parachuting capybara. Rich painted 3D game art, tactile detail, warm ochre light and jade shadows, expressive animated-film character. Keep the left half dark and quiet for HTML title and controls. No text, UI, watermark or blood. Full-bleed cinematic depth.

A imagem é usada somente como capa estática. Nenhuma captura de gameplay é substituída pela arte da capa.
