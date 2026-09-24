# Handoff: rodada de ajustes do Renan (branch `v2-renan`)

Base: branch `v2` do Lucas. Esta branch mistura a v2 (Vite/TS, simulação no Worker, casas detalhadas, menu principal) com o visual e a jogabilidade da v1 (`reference/legacy.html`). Estado no commit: `npm run check` sem erros, `npm test` 60 de 60.

## Feito

- **Correção do Firefox:** `AudioListener` sem `positionX` quebrava o frame antes do render (`src/audio.ts`).
- **Câmera:**
  - No avião, órbita em terceira pessoa.
  - Na queda e no paraquedas, câmera atrás da capivara.
  - Transição suave pra primeira pessoa ao pousar.
  - O avião fica orientado pela rota (`src/render/renderer.ts`).
- **Visual cartunesco** (`src/render/toon.ts`):
  - Rampa toon da v1 injetada no chunk de luz do three.
  - Contorno por profundidade e saturação no pós-processamento.
  - Tone mapping Neutral.
- **Mapa** (`src/shared/layout.ts`, `terrain.ts`, `world.ts`):
  - Relevo e layout da v1 (heightmap de 2 m, 6 colinas, lago, estradas de asfalto, Vila em fileiras) preenchidos com os prédios da v2.
  - Locais marcantes: Mercadão e cidade no Centro, Forte no norte, Farol no sudeste.
  - Morro em plataformas por coluna.
  - Cobertura da v1 espalhada.
  - Arena do Correria compartilhada em `ARENA`.
- **Chão e cores:** cores de vértice no estilo da v1, clareadas. Telhados vermelhos. Texturas fotográficas suavizadas (`world-scene.ts`).
- **Baús:** modelo novo, itens saem do baú e caem no chão, brilho da cor da raridade nas armas do chão (`src/shared/rarity.ts`).
- **Capivara em pé:**
  - Modelo novo (`src/render/capybara.ts`).
  - Primeira pessoa com cel shading e contorno (`weapons.ts`).
- **HUD, pausa e vitória no estilo da v1**, tudo em `src/ui/*`:
  - Fontes Dela Gothic One e Mochiy Pop One.
  - Miniaturas 3D no inventário (`thumbnails.ts`).
  - Minimapa com zoom e mapa inteiro na tecla M.
  - Pausa enxuta.
  - Vitória por cima do jogo rodando.
  - Botão de sair ao morrer.
  - Tela de carregamento com pré-carga do renderer no menu.
- **Menu principal e modais:** estilo cartunesco sem perder o layout do Lucas.
- **IA dos bots da v1** portada (`src/simulation/bots.ts` + `index.ts`):
  - Bots nunca entram na água.
  - Avião mais baixo, cruzando a ilha.
  - Corpo virado pra frente na queda.
- **Hitbox nos tamanhos da v1:** cabeça r .25, corpo em cilindro r .3, e menor pro jogador quando quem atira é bot.
- **Rodinha do mouse troca de arma.**
- **CSS inline da tela de boot** no `index.html`, pra não piscar a logo gigante.

## Em andamento quando parou (conferir primeiro)

1. **Ajuste automático de dificuldade** (porte de `computeDiff`/`record.adapt` da v1, só no treino). O agente parou no começo da parte B. Pode ter mexido em `types.ts`, `settings.ts` e `simulation`. Revisar e terminar:
   - campo `adapt` no `RoomConfig`, só pro treino, com o codec aceitando sem ele
   - opção "Ajuste automático" nas configurações
   - frase da v1 na pausa
2. **Cabeça e corpo desenhados do tamanho da hitbox nova** (`capybara.ts`/`poseAvatar`). Pode estar pela metade: a cabeça precisa caber numa esfera de raio ~.25 em y 1.6.
3. **Performance** (prioridade do Renan). O agente mediu e começou a mexer em `renderer.ts`, `world-scene.ts`, `vegetation.ts`, `props.ts`, `weapons.ts` e `src/render/memory.ts` (novo). Revisar o diff e medir de novo. Números vistos antes: ~700 mil–1 milhão de triângulos e ~90–220 draw calls. Ideias:
   - LOD de árvores e capivaras
   - menos luzes pontuais
   - MSAA menor no 'medium'
   - sombras mais baratas
   - zero alocação por frame
   - Suspeita da travada ao pousar: compilação de shader e carregamento dos modelos da primeira pessoa. O `warmup()` já compila, mas falta confirmar.

## Pedidos pendentes do Renan

- Performance, performance, performance (travadinhas, travada ao pousar).
- Deixar o visual ainda mais cartunesco, simples e claro. Ele aprovou a claridade atual, mas ainda achou a grama escura e "meio realista mal feita".
- Terminar os itens em andamento acima.

## Como rodar

```sh
npm ci && npm run dev   # http://127.0.0.1:5173
npm run check && npm test
```

A `v1` original continua em `reference/legacy.html` e no site (`main_website/public/lab/ultima-capivara/`).
