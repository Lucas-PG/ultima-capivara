# Arquitetura e hospedagem V2

## Decisão

A V2 usa um navegador como autoridade da partida. **Criar sala** reserva um código no PeerServer; **Entrar** resolve esse código e conecta os navegadores. O criador é um jogador normal e também executa um Web Worker com a simulação. O site compilado é estático. Não há conta, banco de dados, matchmaking público, migração de host ou servidor de jogo dedicado.

Isso permite o fluxo automático de convite sem uma conta de infraestrutura ou cobrança por partida. Também significa que a disponibilidade depende do criador. Não é uma arquitetura de competição pública com autoridade independente: um host modificado pode trapacear.

## Rede e regras

- Simulação fixa de 60 Hz, independente da renderização; snapshots a 20 Hz.
- Movimento previsto no cliente, reconciliado com entradas confirmadas pela autoridade. A mesma função de colisão é usada em ambos.
- Avatares remotos usam histórico de até 32 amostras por ator, com interpolação de posição, yaw pelo menor arco e pitch. O atraso visual parte de 100 ms e se adapta à variação de chegada até 200 ms. Lacunas extrapolam no máximo 100 ms, depois seguram a pose; a retomada corrige a posição durante 100 ms. Morte, reaparecimento e teleporte limpam o histórico. Predição local, HUD e eventos não passam pelo buffer.
- O anfitrião mede RTT individual e compartilha a tabela do placar a cada resposta de ping. A rota ICE selecionada distingue conexão direta de retransmissão no estado do convidado. Timeout de entrada em 10 s oferece nova tentativa; reconexão automática tem prazo total de 30 s e apenas uma tentativa em curso.
- Perfis, sala, ações e eventos via canal confiável PeerJS em serialização binária, que suporta fragmentação das cargas iniciais.
- Posições quantizadas e munição em um segundo canal WebRTC negociado na mesma conexão, sem ordenação nem retransmissão. Deflate é negociado quando os dois navegadores suportam CompressionStream; há fallback sem compressão e um canal confiável com frequência menor se o canal rápido não estiver disponível. O host comprime uma vez e distribui a mesma carga aos convidados.
- Baselines de mundo e inventário versionados; snapshots incompatíveis ou atrasados são descartados. Solicitação de ressincronização tem limite de frequência.
- Inputs têm sequência, tipos e limites numéricos; ações têm identidade e deduplicação. O host decide cadência de tiro, munição, colisão, dano, pickups, tempestade e vencedor.
- Toques de salto e gatilho ficam pendentes até o próximo tick, mesmo que a tecla ou botão já tenha sido solto. O gatilho confiável carrega a mira no momento do clique e mantém os mesmos limites de cadência, munição e histórico do disparo contínuo.
- Hitscan usa histórico limitado a 200 ms. Disparo contínuo e clique confiável carregam o tempo da última pose remota realmente renderizada, separado do cursor ajustado na recepção; vistas antigas usam o tempo atual. O limite é aplicado na execução, incluindo trânsito e tick, portanto atraso visual alto mais RTT pode exceder a janela e usar a posição atual. Histórico de uma vida anterior é descartado ao morrer e reaparecer.
- Um clique confiável inédito com relógio atrasado ainda dispara com os alvos na posição atual; a idade limita apenas o rewind. Validação de tempo futuro, cadência e munição continuam no host. IDs de disparos já consumidos sobrevivem ao reaparecimento para impedir que uma cópia confiável atrasada dispare outra vez; a reconexão reinicia a sequência.
- Convidado desconectado mantém o corpo vulnerável por 30 segundos. Tokens aleatórios de recuperação ficam no sessionStorage e são rotacionados ao reconectar. Uma nova conexão invalida os canais anteriores e inicia uma nova sequência de input.
- Ao sair, o anfitrião aguarda confirmação de encerramento dos convidados por até 1 s antes de destruir as conexões. Se a mensagem se perder, a tentativa de reconexão após 500 ms encerra a sala quando a sinalização confirma que o ID do anfitrião não existe mais; falhas de rede continuam com o prazo de recuperação de 30 s.
- Pausa longa do host não avança rapidamente o relógio nem aplica rajadas acumuladas. Renderização e áudio são suspensos quando a aba fica oculta. Navegadores podem suspender ou limitar Workers; mantenha a aba do host ativa.

## Sinalização, STUN e limites

[PeerJS usa PeerServer para trocar metadados e candidatos](https://peerjs.com/client/getting-started). Esse serviço apresenta os participantes; ele não executa a simulação. [WebRTC usa ICE para encontrar uma rota e pode precisar de TURN para retransmissão](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity). Um servidor de sinalização próprio não substitui um relay TURN.

O padrão usa PeerServer Cloud e os servidores ICE padrão do PeerJS 1.5.5, incluindo STUN do Google e fallback TURN público do PeerJS. `VITE_ICE_URLS` substitui essa lista por STUN explícito. Não há SLA nem garantia de que todas as combinações de NAT, VPN e firewall conectem. Não foram embutidas credenciais privadas de relay no frontend. Para uma publicação com alcance garantido, será necessário operar um relay com credenciais temporárias ou migrar a autoridade para um servidor de jogo. Isso é uma decisão de infraestrutura posterior à revisão local, não um recurso anunciado como já disponível.

Referência sobre redução/suspensão de timers e frames: [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## Teste isolado

`npm run test:e2e` inicia Vite 5174 e PeerServer 9001. `tests/network.e2e.spec.ts` usa a página vazia `testfixtures/net.html` para verificar grandes baselines, ações, RTT, reconexão, rematch e encerramento sem renderer. `tests/network-game.e2e.spec.ts` também abre dois jogos Chromium reais: entrada pela interface, movimento por teclado, disparo, placar com RTT, recarga da página com restauração de identidade/posição/munição, encerramento e timeout visível com nova tentativa. O teste de interpolação determinística simula atraso, perda e reordenação sem depender do desempenho da GPU.

Para sinalização local manual nos padrões 127.0.0.1:9000/peerjs, execute `npm run signaling`, descomente as quatro variáveis `VITE_PEER_*` do `.env.example` em `.env.local` e reinicie o Vite. O Node não lê `.env.local`: se mudar os padrões, passe também `PEER_HOST`, `PEER_PORT` e/ou `PEER_PATH` ao comando do servidor. Por exemplo, `PEER_PORT=9010 npm run signaling` corresponde a `VITE_PEER_PORT=9010`. O servidor auxiliar atende somente localhost por padrão. Ele é uma ferramenta de desenvolvimento, sem configuração de proxy/TLS para publicação.

## Arte e desempenho

A ilha e suas colisões são determinísticas e compartilhadas. O ambiente agrupa geometria por material e células de 32 metros para descartar trechos fora da câmera; móveis e vegetação também usam lotes por célula. Pickups usam instâncias, personagens usam malha com esqueleto, e armas de primeira pessoa são renderizadas em uma cena separada. O menu usa uma imagem estática e não inicializa WebGL. A GPU só recebe frames durante uma partida visível. A renderização usa limite padrão de 60 FPS, selecionável entre 30/60 nas preferências. O parâmetro `?fps=30` ou `?fps=60` substitui o limite durante a sessão. A cadência mantém seu prazo entre frames para não descartar um frame apenas por pequenas variações no horário do requestAnimationFrame.

Não há envio de analytics. Preferências ficam no localStorage; sessão de recuperação, no sessionStorage. Os participantes da sala e o serviço de sinalização recebem os dados necessários à conexão. Como em qualquer WebRTC direto, participantes podem observar informações de rede uns dos outros.
