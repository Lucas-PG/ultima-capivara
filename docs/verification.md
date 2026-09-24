# Verificação local da V2

Data: 24/09/2026. Ambiente: macOS 27 em Apple Silicon, Node 24.21.0. Branch local `v2`; nenhuma publicação ou PR.

## Segunda revisão: vila, personagens e combate

Esta revisão responde ao feedback sobre interiores vazios, árvores defeituosas, mãos humanas, bots excessivamente precisos e limite de 30 FPS. Critérios: rotas utilizáveis com objetos detalhados, capivaras reconhecíveis, combate com tempo de reação, feedback legível e meta de 60 FPS em uma janela. A tela inicial foi preservada.

| Verificação atual | Resultado |
| --- | --- |
| TypeScript e build com Node 24.21.0 | Aprovados; `npm run build` inclui `tsc --noEmit` |
| `npm test`, Node 24.21.0 | 52 testes aprovados em quatro arquivos |
| Transporte Chromium e WebKit | Sala, início, baseline grande, ações, recuperação, rematch e encerramento aprovados, sem carregar 3D |
| Compatibilidade do mapa | `ilha-v2-2`; fixture E2E usa `WORLD_VERSION` e `PROTOCOL_VERSION` compartilhados, sem versão antiga literal |
| Build servido em `4173` | Treino Correria iniciado; assets sem respostas HTTP de erro, nenhuma exceção de página, diagnóstico de desenvolvimento ausente; troca para pistola e disparo 17 → 16 confirmados |
| Rotas e recursos | Spawns e loot válidos; corredores de entrada/saída das 15 casas da arena e colisões de mobiliário cobertos |
| Bots | Testes de aquisição, giro limitado, pausas entre rajadas e perda de linha de visão |
| Hitboxes | Cabeça/focinho, corpo e pernas orientados pelo yaw; postura agachada e histórico de orientação verificados |
| Áudio novo | Smoke de CPU com stubs Web Audio: proximidade, redução de ambiente externo dentro das casas, fonte no menu, volume zero e descarte aprovados |

Na amostra de cinco partidas com seeds diferentes, um jogador parado sobreviveu pelo menos 14,1 segundos em todas; quatro permaneceram vivos aos 15 segundos. Os 16 acertos dos bots nessa amostra foram no corpo. Isso verifica uma abertura menos punitiva, sem provar que o equilíbrio final está resolvido.

A revisão visual usou uma única janela automatizada, em 1280×720, qualidade Equilibrada. As cenas de inspeção desenham poucos frames e param. Árvores, palmeiras, oito armas, patas, capivaras, mira, praça, padaria, café e mercado foram inspecionados. Foram corrigidos atributos incompatíveis ao unir geometria, sombras com listras, placas ocultas e objetos cruzando prateleiras. Menus, azulejos, toldos, utensílios e móveis são arte local.

A medição final da praça com duas capivaras, depois do aquecimento, registrou **57,8 FPS de média e 16,8 ms no percentil 95** em cerca de três segundos: 318 chamadas de desenho e 1,17 milhão de triângulos, incluindo os passes de sombra. Uma vista mais leve registrou 59,7 FPS. A coleta usa intervalos reais de `requestAnimationFrame`, não o número ilustrativo do HUD da fixture. São amostras curtas desta máquina, com outras tarefas abertas, não uma garantia de 60 FPS ou um benchmark de partida cheia.

Na interface real durante esta revisão, movimento lateral percorreu 1,63 m em meio segundo; agachar foi confirmado, três cliques de pistola consumiram 17 → 14 cartuchos e a recarga iniciou. Uma amostra de três segundos registrou 59,4 FPS. Essa coleta precedeu o último ajuste de detalhes/iluminação. Ao pausar e estabilizar, o contador permaneceu em 3504 durante 1,1 segundo. A preferência 30/60 persistiu, e `?fps=30` seguido de ajuste de volume não alterou a preferência salva de 60 FPS.

No build final, quatro leituras consecutivas do HUD, separadas por um segundo após cinco segundos de aquecimento, mostraram 60 FPS durante treino com oito participantes. Uma captura anterior, logo após retomar e trocar de arma, mostrou 27 FPS: há quedas transitórias, e esta verificação curta não mede todos os pontos do mapa ou todas as transições.

### Limites desta revisão

- Estilo, diversão, equilíbrio, conforto e mix de som ainda precisam da avaliação do proprietário jogando. O smoke de áudio não é uma escuta crítica.
- O focinho pode cruzar visualmente uma parede quando a cápsula de movimento está encostada; tiros continuam bloqueados pela parede. A cápsula foi mantida estreita para preservar passagens e portas.
- Não foram abertas várias cenas 3D para testes de multiplayer. A validação de transporte usa páginas vazias. Sessões prolongadas, computadores diferentes, redes distintas e 8/16 pessoas reais continuam pendentes.
- A arquitetura de salas continua dependendo do navegador de quem criou a partida. Não há servidor dedicado, migração de host ou TURN operado pelo projeto.
- Firefox permanece sem validação por falha de perfil do navegador automatizado nesta máquina, descrita no registro anterior.

## Registro da primeira revisão (`a1df162`)

Os resultados abaixo são históricos e não substituem as medições da segunda revisão.

### Resultados reproduzíveis

| Verificação | Resultado |
| --- | --- |
| `npm run check` | TypeScript sem erros |
| `npm test` | 40 testes aprovados: combate, colisão, mapa, respawn, deadline/empate, toques rápidos, deduplicação de disparos, reconexão e codec |
| `npm run build` | Build de produção concluído; Worker, texturas, fontes e áudio incluídos |
| E2E Chromium | Sala, pronto, início, grandes baselines, input/ações, gatilho confiável sem duplicação, recuperação, rematch e encerramento aprovados |
| E2E WebKit | Mesmo fluxo de transporte aprovado |
| PeerServer Cloud padrão | Host e convidado, em contextos separados na mesma máquina, criaram e entraram na sala; ambos receberam dois participantes e nenhum erro |
| Lobby pela interface compilada | Criar sala, entrar por código, dois jogadores prontos e botão de iniciar habilitado; sem inicializar 3D |
| Gameplay compilado | Treino Correria, troca para pistola, clique consumindo 17 → 16 cartuchos e retorno ao início; nenhum erro de página, diagnóstico de desenvolvimento ausente |
| E2E Firefox | Não executou o jogo: o navegador automatizado encerrou ao criar o perfil |
| Banco de áudio | 14 arquivos obtidos da versão compilada e decodificados com OfflineAudioContext; nenhum arquivo vazio |
| Referência anterior | SHA-256 de `reference/legacy.html` igual ao `index.html` da branch main |

O erro do Firefox foi `Could not find profile folder`, inclusive usando outro diretório temporário. É compatível com o [problema documentado de Playwright/Firefox no macOS 27](https://github.com/microsoft/playwright/issues/42768); a causa local não foi confirmada por alteração das permissões do sistema. Firefox permanece sem validação nesta máquina. WebKit automatizado também não equivale a uma aprovação de todos os Safari reais.

### Gameplay e renderização

- Uma única janela automatizada a 30 FPS foi usada na revisão final de gameplay. Nenhum teste de transporte carrega o renderer.
- Na interface real de Correria, movimento lateral percorreu 2,41 m, agachar foi confirmado na simulação, disparo consumiu cinco munições, recarga iniciou, troca de slot funcionou e Esc liberou o mouse. Salto mantido elevou a capivara em 0,775 m na amostra.
- O smoke encontrou e corrigiu toques curtos perdidos entre frames. Após a correção, um toque rápido de Espaço elevou a capivara de 1,20 m a 1,85 m, e três cliques rápidos de pistola consumiram exatamente um cartucho cada: 17 → 16 → 15 → 14.
- Em pausa, o contador de frames permaneceu em 129 antes e depois de 1,2 segundo: nenhuma nova renderização 3D.
- Sair pela confirmação voltou ao início, encerrou a partida e liberou o renderer. Iniciar outro treino em battle royale funcionou: avião → queda → paraquedas por dois toques de Espaço, seguido de retorno ao início.
- Os oito modelos de arma foram renderizados no cenário local. Mira de sniper inspecionada com retículo, zoom e centro desobstruído.
- Modelos detalhados de pistola e M700 revisados após carregar os assets locais, incluindo posição das mãos, lente da luneta e pose de recarga. Cachoeira revisada após separar água e rocha para eliminar interseções.
- Rotação de câmera verificada em norte, leste, sul e oeste, olhando 0,4 rad para cima/baixo. O vetor vertical permaneceu positivo em todas as oito poses após corrigir a inversão do horizonte.
- Tela inicial, ilha, ambiente e primeira pessoa foram inspecionados por capturas. Capturas de QA ficam em `output/playwright/`, ignorado pelo Git.
- O mapa tem testes para todos os spawns e pickups e para colisão/pouso em telhados inclinados. Regras cobrem tiros bloqueados, headroom, semi-automáticas, recarga por cartucho, proteção e histórico de hitscan após respawn.

### Carga de simulação e protocolo

`npm run test:load` executou três cenários de 60 segundos simulados por modo, com 16 inputs humanos e cinco bots adicionais no battle royale. Não abre navegador e não simula latência de internet.

| Medida | Battle royale (21 atores) | Correria (16 atores) |
| --- | --- | --- |
| Média por tick incluindo snapshots/compressão | 1,8811 ms | 0,6166 ms |
| Maior frame rápido comprimido | 632 bytes | 567 bytes |
| Heap observado ao fim dos cenários | 38,3 MB | 51,9 MB |
| Carga de saída estimada para 15 convidados | 1,99 Mbps | 2,02 Mbps |

A carga inclui frames, baselines, inventário e eventos, antes do overhead de transporte. São medidas desta execução, com outras tarefas locais em andamento, não um benchmark isolado ou garantia por máquina. Navegadores sem compressão negociada consomem mais banda. O heap é amostrado entre cenários, não monitorado continuamente.

Essa amostra foi coletada antes dos últimos ajustes de geometria e dos comandos de toque rápido; serve como referência local, sem promessa de desempenho exato da revisão final.

### Ainda depende de revisão humana

- Aprovação do estilo visual, conforto de câmera, ritmo, equilíbrio e mix de som.
- Sessão prolongada em dois computadores reais; depois, redes/provedores distintos.
- Desempenho com 8 e 16 pessoas reais em hardware variado, perda de pacotes e diferentes NATs.
- Validação de Firefox, Safari real e áudio em fones/alto-falantes reais.

O criador ainda é a autoridade da sala; a partida depende do navegador dele. Não há migração de host, relay TURN operado pelo projeto ou servidor dedicado. A branch é uma versão para revisão local, sem certificação de conectividade universal ou operação pública.
