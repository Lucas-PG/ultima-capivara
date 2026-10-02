import sharp from 'sharp';
const out=process.argv[2]||'docs/overhaul/evidence/codex-plane';
sharp.concurrency(2);
const boards=[
  ['01-exterior',[['plane-front','Aproximação'],['plane-side','Lateral e porta']]],
  ['02-rear-ground',[['plane-rear','Cauda'],['plane-ground','Visto do chão']]],
  ['03-cabin',[['plane-cabin','Cabine'],['plane-cockpit','Painel']]],
  ['04-door-canopy',[['plane-door','Porta de salto'],['chute-front','Velame e tirantes']]],
  ['05-canopy-rig',[['chute-back','Arnês e traseira'],['chute-grip','Comandos e patas']]],
  ['06-eye-live',[['chute-eye','Sob o velame'],['chute-player','Câmera real em partida']]],
  ['07-live-transition',[['plane-player','Câmera real no avião'],['fall-player','Câmera real na queda']]],
];
for(const [name,shots] of boards){
  const layers=[];
  for(const [row,[shot,label]] of shots.entries())for(const [col,version] of ['before','after'].entries()){
    const title=`${version==='before'?'ANTES b721224':'DEPOIS'} | ${label}`;
    const svg=Buffer.from(`<svg width="735" height="29"><rect width="735" height="29" fill="#143d34"/><text x="12" y="21" font-family="sans-serif" font-weight="600" font-size="17" fill="#fff2cd">${title}</text></svg>`);
    const input=await sharp(`${out}/${version}-${shot}.jpg`).resize(735,478).composite([{input:svg,top:0,left:0}]).jpeg({quality:93}).toBuffer();
    layers.push({input,left:col*735,top:row*478});
  }
  await sharp({create:{width:1470,height:956,channels:3,background:'#143d34'}}).composite(layers).jpeg({quality:91}).toFile(`${out}/board-${name}.jpg`);
}
console.log('Seven boards at 1470x956; all native captures remain alongside them.');
