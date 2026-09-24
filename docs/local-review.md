# Revisão local da V2

Faça a avaliação de gameplay em uma única janela primeiro, preferencialmente com `?fps=30`. Feche a partida antes dos testes de transporte. Testes de navegador não substituem a avaliação humana do ritmo, som, conforto de câmera e equilíbrio.

## Gameplay e apresentação

- Tela inicial: layout em 1280×720, 1440×900 e tela grande; sem renderização 3D em segundo plano.
- Correria com bots: movimentar em diagonal, correr, frear, pular degraus, agachar sob cobertura e encostar em cantos. Não atravessar paredes ou tetos.
- Mira: hip fire, mira fina, recuo, troca de slot, recarga, recarga interrompida da espingarda e tiro após reaparecer.
- Confirmar munição e dano, áudio esquerdo/direito, passos, sons distintos por arma e feedback de acerto.
- Morrer: countdown de 3 segundos, proteção por 2 segundos após nascer, proteção encerrada ao disparar, inventário renovado.
- Battle royale: avião, salto, abertura de paraquedas, pouso no solo/telhado, loot perto de caixas e dentro das construções, área segura, morte permanente e espectador.
- Resultado: vencedor ou empate, placar, rematch e retorno à tela inicial.
- Configurações: volumes, sensibilidade, FOV, gráficos, redução de movimento, remapeamento e persistência após recarregar.
- Esc libera o cursor. A aba oculta não renderiza nem toca áudio. Ao voltar, o menu oferece entrada explícita na partida.

## Amigos, depois do gameplay

- Host + convidado: criar sala, entrar por código/link, alternar pronto, iniciar, mover e atirar nos dois sentidos.
- Criador da sala sai: convidado recebe encerramento claro e retorna ao início.
- Convidado perde conexão e volta em menos de 30 segundos: recupera seu ator e consegue mover, trocar arma e atirar.
- Convidado ausente por mais de 30 segundos: não permanece como competidor invulnerável.
- Convidado entra em BR já iniciado: espectador. Na Correria: nasce protegido.
- Rematch: sala permanece, todos confirmam novamente, contadores e estado de partida reiniciam.
- Testar dois computadores reais, depois redes distintas (por exemplo, banda larga e hotspot). Registrar navegador, ping, qualidade, pessoas e estabilidade.
- Avaliar 8 e 16 pessoas em hardware real antes de anunciar esses tamanhos como desempenho garantido. Os testes locais de simulação/protocolo verificam capacidade lógica, não internet doméstica ou GPU de cada participante.

## Registro

Os resultados automatizados finais e limitações observadas ficam em `docs/verification.md`. Não publique nem abra PR antes da revisão do proprietário.
