# Capivara M0: prova técnica

A versão fica atrás de `?capy=v3`. O caminho padrão continua procedural. Para
reproduzir: `npm ci && npm run assets:characters`, com Blender 5.0.1.
Use `BLENDER_BIN` para outra localização do executável.

## Entrega

- GLB Meshopt de 152.220 bytes, atlas PNG 16 x 16, um material, um skin de 22 ossos.
- LOD0: 13.998 triângulos; LOD1: 4.800; LOD2: 1.400. Trocas em 12 e 28 m.
- `idle`, com respiração, orelhas e piscada; `run`; `jump` no lugar.
- Malhas e clips compartilhados entre instâncias. AnimationMixer e pose por ator;
  os três LODs de uma instância compartilham o mesmo skeleton.
- Cabeça em repouso dentro de r 0,25 em (0; 1,6; -0,04), corpo dentro de
  r 0,30 até y 1,42. Medição após descompressão: cabeça até 0,2454 m, corpo até
  0,2994 m. Braços/patas da arma ficam fora do cilindro, como na versão anterior.
- Gerador com superfícies em anéis de quads, subdivision e decimate. Pesos
  normalizados com até quatro influências; as juntas têm mistura suave.

O script de geração verifica os budgets e grava `public/models/capybara/metrics.json`.
Os três testes em `tests/capybara-asset.test.ts` verificam o arquivo distribuído,
compressão, budgets, skin, pesos, hitboxes em repouso e dados de animação/piscada.

A geração dupla final produziu arquivos idênticos, SHA-256
`e0a0d1a2e36cc26b3f3341f5283e82d26cb65f29b463f042c8406476861892f4`.
Formiga executou `check`, os 64 testes e `build` no commit e195441: todos passaram.
Logs locais: `output/characters/reproducibility.log` e `verification.log`.
Uma amostragem de 24 frames do ciclo run no renderer encontrou y mínimo dos pés
em +0,00114 m: não atravessam o chão.

## Integração

O merge local de `v2-renan` incorporou o split 859c2fd. O hook de pose está em
`src/render/avatars.ts`; `renderer.ts` tem somente import e await de pré-carga.
`preloadCapybaraAsset(load?)` aceita o método `gltf` do loader compartilhado de
Forja, quando ele chegar. No modo isolado, usa GLTFLoader + MeshoptDecoder.
O preload não tem timeout de sucesso. Erro de download ou estrutura inválida
rejeita a promise; a construção opt-in exige asset pronto, sem fallback ou
substituição tardia. O URL respeita `import.meta.env.BASE_URL`. Cinco testes em
`tests/capybara-loading.test.ts` cobrem atraso de 16 s, erro, GLB inválido,
implantação em subdiretório e ausência de download com a flag desligada.

Dependência de integração: o novo gate de `main.ts` de Forja deve entrar junto.
Ele bloqueia update/reveal e trata a rejeição voltando ao início com mensagem de
recarga. O `main.ts` anterior deste checkout não possui esse tratamento; não
publicar o hook isoladamente. Forja confirmou esse contrato em 24/09/2026.

O skeleton procedural permanece apenas como socket compatível da arma; sua
malha vira um container vazio na construção, já após a carga. A pose do GLB é
independente. Descarte do avatar libera mixer e skeletons privados. Geometrias e
atlas compartilhados são descartados junto com o renderer.

## Evidência visual

A fixture de desenvolvimento `tools/blender/review.html?capy=v3` usa GameRenderer,
AvatarView, shaders, pós-processamento e mundo reais, com câmera fixa. Não é
incluída como uma tela do produto. `capyHitboxes` liga o overlay na partida;
a fixture também permite alterná-lo em `window.capyReview.shot`.

Capturas em `/Users/lucas_gaspe/dev/capivara-team/reviews/tatu-capy-v0-*.png`:
rodada final em 1600 x 900: frente, lado e 3/4, idle/run, 1 m e 20 m; hero 3 m, overlays e LOD2 a 30 m.
Em 1 m a lente abre para 100 graus para conter o corpo inteiro; 20/30 m usam
60 graus. A primeira rodada na área do Posto tinha obstruções em 20 m; a
rodada final coloca o ator na clareira (0, -60), com o cenário preservado.

## Review do Pincel, 24/09/2026

Os três conceitos foram revisados, com preferência do diretor por A,
Ilha Dourada. Em seguida o orquestrador travou A como direção oficial; B e C
foram descartados como direções de produção e ficam apenas no arquivo de exploração. Originais preservados em `docs/concepts/` e no diretório compartilhado
de reviews. A ferramenta gerou 1672 x 941 apesar do pedido de 1600 x 900; Pincel
revisou e aprovou os originais. Prompts integrais e data em `docs/assets.md`.

O GLB foi aprovado como prova técnica M0. **Não tem aprovação de acabamento
visual para M1**: o diretor identificou leitura de ursinho/lontra. Nesta prova
foram ajustados o pescoço contínuo, a bandana visível e o nivelamento dos pés da
corrida. A revisão visual completa seguirá o sheet A e a style bible.

A style bible publicada ao fim da rodada foi lida integralmente. As seções
3.7, 9 e 10 mantêm esse aceite técnico e formalizam as metas de M1. Também
exigem cor de jogador apenas na bandana/acabamento do colete, roughness mínimo
0,85 e rim light para legibilidade. Esses pontos entram na revisão visual M1,
sem alterar a aprovação técnica M0 já dada pelo diretor.

Plano para M1, seguindo a direção A oficialmente travada:

1. Focinho em bloco retangular arredondado, frente quase plana e proporção
   largura:altura:profundidade 1:0,8:1,1, ocupando cerca de 45% da cabeça.
2. Cabeça assentada nos ombros; bandana cobrindo a junção; pernas até 22% da
   altura, pés largos e chatos e braços curtos com pulso afinado.
3. Colete oliva e alças de couro em regiões distintas do atlas, mantendo a
   bandana turquesa e barriga creme; controlar o excesso de laranja sob a luz.
4. Orelhas pequenas no topo-trás, olhos pequenos com highlight e silhueta
   reconhecível a 30 m. Conservar as hitboxes ao ajustar proporções; o pedido de
   cabeça de 1/3 da altura é aproximado e não autoriza ampliar a esfera r 0,25.
5. No primeiro plano, reduzir a arma para 20-25% da tela, ancorá-la no canto
   inferior direito e simplificar metal/madeira para cores pintadas sem arranhão
   fotográfico. Patas animais marrons com almofadas escuras foram aprovadas.

Limitações abertas, sem dispensa do quality bar: uma paleta de pelo; sem variantes de colete/capacete;
clips adicionais e primeira pessoa final ficam para M1. Não houve mudança nas
regras da simulação ou nas hitboxes menores que favorecem o jogador contra bots.

## Quality bar publicado após a prova técnica

A auditoria registrou TATU-01 a TATU-11 abertos em
`/Users/lucas_gaspe/dev/capivara-team/reviews/defects.md`; TATU-12 e TATU-13 foram
corrigidos e verificados. A aprovação da prova técnica não equivale ao gate de
qualidade de produção. O orquestrador atribuiu TATU-01..11 explicitamente ao M1
em `roadmap.md`, como trabalho de personagem e primeira pessoa; não foram
dispensados. Os dois defeitos novos de loader ficam no M0 e foram corrigidos,
com testes de intenção. Review independente do diff solicitado à Sentinela.
A nova matriz 720p/1080p, exterior/interior e os sweeps de estabilidade/perf de
produção ainda não estão cobertos pela evidência de M0.
