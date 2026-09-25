# Capivara e primeira pessoa, revisão r5

Candidata visual, ainda sujeita ao aceite da Pincel. A prova usa a integração local de Forja e18411d sobre v2-renan 103f7cd. O ramo visual da Forja não tem aprovação de produção.

A coroa desce cerca de 2 cm e o volume do focinho avança/desce dentro da esfera de cabeça r .25. A malha contínua recebe cavidades reais para a boca e os olhos. A abertura da boca tem aproximadamente 6.7 cm, 70% do nariz de 9.6 cm; interior vinho 6B2E2A, fundo 351917 e lábio inferior de pelagem. A borda e o interior fecham juntos no neutro. Olhos recuados sobre planos ovais evitam a dobra da pupila durante expressão. Dois ossos de cavidade acompanham apenas o tamanho assimétrico em stunned. Os olhos decodificados ficam entre z−.1421 e−.1390; o nariz chega perto de−.283, preservando cerca de 14 cm de projeção.

O Facão mantém a pose aprovada. A faixa de raridade envolve o pulso; o retângulo abaixo da mão foi removido. Palma, dedos e polegar são uma superfície unida, suavizada e decimada; almofadas e unhas permanecem separadas. A lâmina usa um atlas frio e uma pequena emissão pintada somente no fio. São dois mapas 32x32 e um material compartilhado entre as oito armas. Armas e patas não recebem o rim de personagem.

A revisão r4 autorizou compensar a pelagem após medir no pós M1. As amostras do primeiro atlas A8703F ainda tinham azul 20 nas patas. A base opt-in passa a A27C5C e a luz a C19D62 para obter a aparência B8743A/D39A47 sob a luz quente e saturação 1.12. Uma prova M1 de estúdio mediu focinho BC7534 e coroa D3964E. O atlas de lâmina usa B4D1EC, com fio D3EBFF e emissão E8EEF2 a .35. Esses são valores de entrada compensados; a aprovação é pelos pixels da produção. A pelagem procedural padrão continua B8743A e a identidade do jogador continua limitada à bandana/trim.

O defeito de tinta em polígonos internos foi isolado pela Forja na comparação de profundidade do mask com MSAA, independente da malha/atlas. A prova final deve incluir sua correção 92ae080, que verifica preenchimento e oclusão na GPU.

Verificação local: Node 24, check e 26 intents de asset/readiness capy/armas. As seis expressões e idle são avaliadas por skinning CPU em todos os LODs contra a esfera r .25. Nenhuma alteração no limite é permitida para acomodar arte. Medição provisória do Facão a 720p: 19.50% ocupado,41.09% retângulo, zero pixels no raio de 60 px da mira. A medição final por hash fica no relatório de capturas.
