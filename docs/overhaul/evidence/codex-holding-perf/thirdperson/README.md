# Comparação de poses em terceira pessoa

Captura completa em 02/10/2026: **604 estados, duas câmeras por estado, 1.208 PNGs finais**. O antes usa a arte e poses do commit `b721224`. A captura nova começou no commit `2886a449cae68260f64efa3fbdac15ced3f29834`, com o ajuste de poses TP de `aa8207b`, em `http://127.0.0.1:5191` com HMR desativado. O arquivo de proveniência registra o intervalo.

A M4 foi recapturada integralmente após a correção do indicador `6220526`, no HEAD `d090ac54b3554c9d1988d167dc291d9d833ff913`, entre 13:46:11 e 13:47:43 (-03): 78 estados e 156 PNGs. Suas comparações, quadros selecionados, recortes e medidas usam `/home/lucas/codex-team/evidence/tp-final-m4-final`. As outras oito armas mantêm a captura original. A nova M4 conserva as mesmas 23 ocorrências de recarga da pata esquerda, com mínimo de -6,309 mm, e passa nas nove poses de guarda/movimento.

As capturas usam o renderizador real, o mundo e a iluminação do jogo, qualidade Média, viewport 1470x956 e DPR 1. Cada estado recria o avatar e estabiliza a pose por 1,5 s. Caminhada, passo lateral, corrida, mira e repouso são amostrados em 0,6 s; agachado em 0,3 s; salto em 0,2 s; disparo em 0,08 s. A aterrissagem é real: 0,3 s em queda a -5 m/s, depois 0,1 s com os pés no chão. Recargas vazias e táticas incluem todos os tempos de `reloadKeys`, além das amostras intermediárias do capturador.

Cada página de comparação tem 1470x956 e quatro painéis: antes/depois nas colunas, direita/esquerda nas linhas. Os painéis preservam o enquadramento completo. JPEG q84 nas páginas, q87 nos quadros nativos selecionados e q86 nos recortes de contato. Os recortes não ampliam pixels e são apenas auxiliares; os PNGs integrais de todos os estados permanecem privados.

- Originais antes: `/home/lucas/codex-team/evidence/tp-before/{arma}-{estado}-{right|left}.png`.
- Originais depois das outras oito armas: `/home/lucas/codex-team/evidence/tp-final/{arma}-{estado}-{right|left}.png`.
- Os quadros nativos selecionados incluem guarda, mira, corrida e disparo, nas duas câmeras, além da pior recarga por arma e das duas falhas iniciais da pistola.
- Nenhuma referência de terceiros é incorporada a esta pasta.

## Cobertura e ocorrências

Os **81 estados de guarda/movimento** e os **64 contatos de gatilho exigidos** passaram nesta captura. Isso não torna a recarga inteira aprovada: **52 amostras de recarga** apresentaram pele da pata esquerda abaixo do limite de -0,5 mm. Os valores e imagens dessas ocorrências permanecem registrados. O teste estrito de guarda/movimento e seu relatório separado continuam em `../thirdperson-ready.json`.

| Arma | Estados | Comparações | Nativas de guarda | Recargas abaixo de -0,5 mm | Pior valor (mm) | Pior fase |
| --- | ---: | --- | --- | ---: | ---: | --- |
| pistol | 69 | [todas as fases](pistol/README.md) | [direita](pistol/native/after-idle-right.jpg), [esquerda](pistol/native/after-idle-left.jpg) | 2 | -18.199 | [reload-0.15](pistol/018-reload-0.15.jpg) |
| revolver | 81 | [todas as fases](revolver/README.md) | [direita](revolver/native/after-idle-right.jpg), [esquerda](revolver/native/after-idle-left.jpg) | 0 | nenhum | nenhuma |
| smg | 63 | [todas as fases](smg/README.md) | [direita](smg/native/after-idle-right.jpg), [esquerda](smg/native/after-idle-left.jpg) | 3 | -3.166 | [reload-0.86](smg/034-reload-0.86.jpg) |
| m4 | 78 | [todas as fases](m4/README.md) | [direita](m4/native/after-idle-right.jpg), [esquerda](m4/native/after-idle-left.jpg) | 23 | -6.309 | [reload-0.86](m4/038-reload-0.86.jpg) |
| shotgun | 51 | [todas as fases](shotgun/README.md) | [direita](shotgun/native/after-idle-right.jpg), [esquerda](shotgun/native/after-idle-left.jpg) | 0 | nenhum | nenhuma |
| dmr | 72 | [todas as fases](dmr/README.md) | [direita](dmr/native/after-idle-right.jpg), [esquerda](dmr/native/after-idle-left.jpg) | 11 | -9.655 | [reload-partial-0.67](dmr/062-reload-partial-0.67.jpg) |
| sniper | 77 | [todas as fases](sniper/README.md) | [direita](sniper/native/after-idle-right.jpg), [esquerda](sniper/native/after-idle-left.jpg) | 5 | -15.778 | [reload-partial-0.7140000000000001](sniper/069-reload-partial-0.7140000000000001.jpg) |
| coco | 102 | [todas as fases](coco/README.md) | [direita](coco/native/after-idle-right.jpg), [esquerda](coco/native/after-idle-left.jpg) | 8 | -0.608 | [reload-0.75](coco/052-reload-0.75.jpg) |
| machete | 11 | [todas as fases](machete/README.md) | [direita](machete/native/after-idle-right.jpg), [esquerda](machete/native/after-idle-left.jpg) | 0 | nenhum | nenhuma |

## Leitura das medidas

Cada `summary.json` contém todas as fases antes/depois, com distâncias em milímetros do mundo: `Rwhole`/`Lwhole` são varreduras da pele completa contra as superfícies da arma; `Rpalm`, `Rwrap`, `Lpalm` e `Lwrap` são regiões diagnósticas dessa mesma varredura. `pair` mede a pata de suporte contra a pata direita nas armas curtas. `triggerFront` usa os triângulos reais do gatilho, e `insideGuard` verifica a ponta do indicador. As medidas são leituras geométricas, sem deslocar a pele ou a arma.

Os valores `null` de distância no JSON representam `Infinity` do capturador: nenhuma superfície de contato próxima dentro da expansão de 30 mm, comum quando a pata está livre. Não significam contato zero. O teste estrito de guarda usa a máscara específica dos dedos de sustentação e verifica separadamente a região da palma e a região de fechamento; as regiões diagnósticas aqui não substituem esse teste. A recarga desloca a pata entre superfícies e inclui períodos sem contato deliberado. Mesmo assim, os 52 valores negativos abaixo da tolerância são preservados como ocorrências de penetração, sem serem descartados por interpretação.

[`reload-penetrations.json`](reload-penetrations.json) lista arma, fase, lado, osso, profundidade e página de cada ocorrência. As duas falhas iniciais da pistola (`reload-0.14` e `reload-0.15`) também têm os quatro quadros nativos selecionados em sua pasta.

O navegador único terminou normalmente e foi fechado pelo `finally` do capturador. Não há alteração de código de jogo, geometria, textura, animação ou física nesta entrega de evidências.
