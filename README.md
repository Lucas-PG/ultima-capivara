# Última Capivara V2

FPS de capivaras no navegador, para jogar com amigos. Esta versão está em desenvolvimento na branch **`v2`**, para revisão e testes locais. A versão anterior está preservada em `reference/legacy.html`.

## Rodar localmente

Use **Node.js 24 LTS**. Com nvm: `nvm install && nvm use`.

```sh
npm ci
npm run dev
```

Abra **http://127.0.0.1:5173/** no Chrome, Edge ou Firefox desktop. Escolha um modo e clique em **Aquecer com os bots** para jogar imediatamente, sem conexão externa. Clique em **Entrar na partida** se o navegador solicitar outra interação para capturar o mouse. `Esc` libera o mouse.

Para reduzir o uso de GPU durante a avaliação, abra **http://127.0.0.1:5173/?fps=30**. O jogo normalmente limita a renderização a 60 FPS, congela a cena no menu de pausa e não renderiza a tela inicial nem abas ocultas. Qualidade gráfica, áudio, sensibilidade, campo de visão e teclas estão em **Configurações**.

Para testar a versão compilada, sem recargas durante edições:

```sh
npm run build
npm run preview
```

Abra **http://127.0.0.1:4173/**. Não abra `index.html` diretamente pelo Finder: os módulos e o Worker precisam de um servidor HTTP.

## Jogar com amigos

1. Clique em **Criar sala**, escolha apelido, cor, modo, capacidade e bots.
2. Compartilhe o código de seis caracteres ou **Copiar link**.
3. Os convidados abrem o jogo, clicam em **Entrar** e informam o código.
4. Todos clicam em **Estou pronto**. Quem criou a sala clica em **Começar partida**.

O jogo configura a conexão automaticamente. Quem cria a sala também joga e seu navegador executa a simulação da partida. Não precisa instalar um servidor, criar conta ou configurar roteador. Essa pessoa precisa manter o computador acordado e a aba da partida em primeiro plano. Se sair, a partida termina para todos. Convidados têm até 30 segundos para reconectar; a capivara permanece vulnerável durante esse período.

**O endereço `127.0.0.1` só funciona no próprio computador.** Para testar em outro computador da mesma rede, execute `npm run dev -- --host 0.0.0.0` e use o IP local do computador que serve o site. O link de convite deve usar esse IP. Para amigos em redes diferentes, cada pessoa pode executar a mesma versão local e usar o código, ou futuramente acessar uma publicação HTTPS comum. Esta branch não foi publicada.

As salas usam o serviço público PeerJS para apresentar os navegadores e WebRTC para transportar o jogo. Redes corporativas, VPNs ou NAT restritivo podem impedir a conexão direta. A V2 não depende de um relay pago e não garante conexão em todas as redes. Veja [as decisões de hospedagem](docs/architecture.md).

## Modos

| Modo | Regras |
| --- | --- |
| **Última de pé** | Battle royale na ilha inteira. Avião, salto, paraquedas, equipamento espalhado e tempestade progressiva. Uma vida; depois, espectador. Bots completam 21 participantes quando habilitados. Quem entra após o início acompanha como espectador. |
| **Correria** | Combate na Vila, Porto e Posto. 5, 8 ou 10 minutos. SMG, pistola e facão ao nascer; respawn em 3 segundos e proteção de 2 segundos, encerrada ao atirar. Vence quem tiver mais eliminações; empate divide a vitória. Bots completam pelo menos 8 participantes quando habilitados. |

Salas comportam até **16 pessoas, incluindo quem criou a sala**. Capacidade padrão: 8. Bots têm três dificuldades.

## Controles

| Ação | Padrão |
| --- | --- |
| Mover / olhar | WASD / mouse |
| Atirar / mirar | Botão esquerdo / direito |
| Correr / agachar | Shift / C |
| Pular, saltar do avião ou abrir paraquedas | Espaço |
| Espiar pelos lados | Q / E |
| Recarregar / interagir | R / F |
| Trocar equipamento | 1 a 4 |
| Bandagem / kit médico / guaraná / açaí / rapadura | 5 / 6 / 7 / 8 / 9 |
| Placar / menu | Tab / Esc |

Controles principais podem ser remapeados. Preferências e apelido ficam neste navegador.

## Verificação

```sh
npm run check       # TypeScript
npm test            # Regras de combate, mapa e protocolo; não usa GPU
npm run build       # Compilação de produção
npm run test:load   # Simulação de partidas com 16 jogadores; apenas CPU
```

Testes de transporte isolados, sem carregar a cena 3D:

```sh
npm run test:setup
npm run test:e2e -- --project=chromium
```

A suíte inicia e encerra seus próprios servidores nas portas 5174 e 9001, com um único worker. Projetos `firefox` e `webkit` também estão configurados. Os testes não provam conectividade entre provedores de internet diferentes. O [roteiro de revisão](docs/local-review.md) cobre a avaliação manual.

## Organização

- `src/shared`: mapa determinístico, colisão, armas e protocolo.
- `src/simulation`: regras autoritativas em um Web Worker de 60 Hz.
- `src/network`: salas, validação, reconexão e snapshots WebRTC.
- `src/render`: ambiente, personagens, armas, animações e efeitos Three.js.
- `src/audio.ts`: gravações locais e síntese espacial, com controles de volume.
- `src/ui`: início, salas, HUD, configurações e resultados.
- `public`: recursos locais; [origem dos assets](docs/assets.md).
- `reference/legacy.html`: referência histórica, fora da compilação V2.

O resultado de `npm run build` está em `dist/`, com caminhos relativos. Uma publicação futura deve usar a pasta inteira, incluindo o Worker, fontes e assets. A instrução antiga de copiar um único `index.html` não se aplica à V2.
