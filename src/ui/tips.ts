// Loading-screen tips (style bible §13.1). {jump}, {interact}, {leanLeft}, {leanRight}, {reload} and {crouch}
// are replaced with the player's current key bindings. Gameplay numbers are checked in tests/ui.test.ts.
export const TIPS: readonly string[] = [
  'Capivara é o maior roedor do mundo. E o mais perigoso com uma Doze na mão.',
  'Aperte M pra ver a ilha inteira e planejar a rota antes da tempestade.',
  '{leanLeft} e {leanRight} espiam pelas quinas sem expor o corpo inteiro.',
  'Tiro na cabeça dói bem mais: na M4 é o dobro, na Sniper é 2,5 vezes.',
  'No avião, {jump} salta. Se você enrolar, o piloto te empurra em 12 segundos.',
  'O paraquedas abre sozinho perto do chão. Mas abrir antes é coisa de capivara precavida.',
  'Guaraná cura aos pouquinhos e deixa você mais rápido por 10 segundos.',
  'Açaí dá 25 de colete. Capivara bem alimentada aguenta mais bala.',
  'Bandagem cura até 75 de vida. Pra encher tudo, só o kit médico.',
  'Rapadura é rápida: 1,5 segundo e +10 de vida. Doce e tático.',
  'A Doze é rainha até uns 35 metros. Depois disso, é só barulho.',
  'Armas lendárias batem mais forte. Brilho dourado no chão? Corre.',
  'Caixas de suprimentos guardam armas, colete e lanchinho. {interact} abre.',
  'Tab mostra o placar. Olhe quem está na frente e fique de olho.',
  'Fora da área segura, a tempestade morde a cada segundo. Não vire churrasco.',
  'A tempestade fecha em 6 fases. A última é apertada de verdade.',
  'Capivaras nadam muito bem. Os bots, não: eles nunca entram na água.',
  'O Estilingão é lento, mas uma pedrada bem dada derruba muita capivara.',
  'Recarregue ({reload}) atrás de uma parede, não no meio da praça.',
  'Mirar com o botão direito deixa o tiro muito mais preciso. Do quadril, só de pertinho.',
  'O Mercadão tem muito saque. E muita gente pensando a mesma coisa.',
  'O Farol é bonito, mas lá de cima todo mundo te vê.',
  'A roda do mouse troca de arma. As teclas de 1 a 4 também.',
  'As teclas de 5 a 9 usam as curas. Treine antes de precisar.',
  'Na Correria, caiu, volta. Então vai com tudo.',
  'Na Última de Pé, é uma vida só. Pense duas vezes, atire uma.',
  'Capivara de verdade fica até 5 minutos embaixo d’água. Aqui, nem tente.',
  'Uma capivara come até 3 kg de capim por dia. Você come baús.',
  'Capivaras são tão tranquilas que outros bichos sentam nelas. Não seja esse bicho.',
  'Se o mouse fugiu, clique na tela pra voltar pra ilha.',
  'Chame a turma: crie uma sala e mande o código pros amigos.',
  'Silêncio também é estratégia. Nem todo barulho precisa de resposta.',
  'Luneta ajuda de longe, mas atrapalha de perto. Escolha a briga certa.',
  'Munição é por calibre: a M4 e a Carabina usam a mesma.',
  'A última capivara de pé leva a glória. E o topo do placar.',
  'Perdeu? Toda lenda capivara começou tomando uma rasteira.',
  '{crouch} agacha: menos alvo, mais esconderijo.',
  'No ar, segure a direção pra planar até o ponto que você escolheu.',
];

export function fillTip(tip: string, keys: Record<string, string>) {
  return tip.replace(/\{(\w+)\}/g, (match, name: string) => keys[name] ?? match);
}

export function tipCategory(tip: string) {
  if (/guaraná|açaí|bandagem|rapadura|curas|kit médico/i.test(tip)) return { label: 'Fôlego extra', icon: 'heart' };
  if (/tiro|arma|doze|sniper|mira|recarreg|luneta|munição|estiling|silêncio/i.test(tip)) return { label: 'Instinto de combate', icon: 'crosshair' };
  if (/tempestade|ilha inteira|avião|paraquedas|no ar|mercadão|farol|área segura/i.test(tip)) return { label: 'Conheça a ilha', icon: 'globe' };
  if (/turma|sala|placar|correria|última|glória/i.test(tip)) return { label: 'Jogue junto', icon: 'users' };
  return { label: 'Vida de capivara', icon: 'leaf' };
}
