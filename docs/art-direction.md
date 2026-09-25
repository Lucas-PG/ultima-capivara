# Direção de arte

Responsável: Pincel (direção de arte e UI/UX).

A fonte da verdade é a style bible do time, em `/Users/lucas_gaspe/dev/capivara-team/style-bible.md`, com paleta completa, luz, contorno, texturas, personagem, primeira pessoa, VFX, UI e o plano de UI do M1. Este arquivo só resume as regras que valem para qualquer mudança visual no repositório.

## Estado (M0, 2026-09-24)

- Direção recomendada: **A "Ilha Dourada"**, fim de tarde pintado à mão, alinhado à capa do menu (`public/assets/cover-v2.png`). Aguarda aprovação do usuário no gate do M0.
- Alternativas: B "Brinquedo de Domingo" e C "Guache Tropical". Os deltas de cada uma estão na seção 16 da style bible.
- Pranchas: `capivara-team/reviews/pincel-lookdev-{A,B,C}-board.png`. Baseline do jogo atual: `capivara-team/reviews/pincel-baseline-*.png`.

## Regras que não mudam entre direções

1. Legibilidade primeiro: personagens, saque e ameaças sempre com mais contraste e saturação que o cenário. Personagens mantêm contorno em qualquer distância.
2. Pintado, não fotografado: nada de textura fotográfica, céu HDR fotográfico, grão, arranhão ou metal PBR. Cor vem de vertex colour, cor chapada ou gradiente pintado à mão.
3. Brasileiro e quente: telha de barro, parede caiada com barrado colorido, azulejo, coqueiros, bananeiras, ipês, mar turquesa. Sem ciprestes nem pinheiros.
4. Formas grandes e macias: chanfro em toda aresta visível, nenhum detalhe menor que 3 cm no personagem ou 10 cm em prédio.
5. Sombras nunca cinza nem pretas: o tom de sombra vem da luz ambiente (lilás na direção A).
6. Capivara, não urso: focinho em bloco largo, cabeça grande sem pescoço aparente, pernas curtas, bandana. Patas marrons na primeira pessoa, nunca mãos humanas.
7. Todo texto do jogo em pt-BR, tom amigável e curto.

## Paleta-chave (direção A)

| Uso | Hex |
|---|---|
| Grama | `#6FAE45` / `#8CC453` |
| Folhagem | `#86BD4F` / `#5FA544` / `#3F8A4A` |
| Telhado | `#D0673F` |
| Parede | `#F3E6CF` |
| Mar | `#2EC4B6` → `#0E7C86` |
| Areia | `#F2D9A0` |
| Céu | `#4F9FD0` → `#FFD49A` |
| Sol / sombra | `#FFD9A8` / `#6B5B95` |
| Pelagem / bandana | `#B8743A` / `#1FB5A8` |
| Contorno | `#3A2418` |

## Processo

Toda mudança visual precisa de prints antes/depois a 1600x900 com o pós-processamento normal e aprovação da Pincel (`maestri ask "Pincel" "review <caminhos>"`) antes do merge.
