// Full natural rounds through the real input and worker; one persistent Chrome.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startDriver, stopDriver } from '../../tests/perf/live-driver.mjs';
const out=resolve(process.argv[2]||'docs/overhaul/evidence/codex-bughunt/live');
const modes=(process.env.MODES||'deathmatch,battle-royale,corrente').split(',');
mkdirSync(out,{recursive:true});
const errors=[],rounds=[],session=[];
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const save=()=>writeFileSync(resolve(out,'live.json'),JSON.stringify({measuredAt:new Date().toISOString(),modes,errors,rounds,session},null,2));
let stopping=false;
async function close(){if(stopping)return;stopping=true;save();await browser.close();}
process.on('SIGTERM',()=>close().finally(()=>process.exit(0)));
process.on('SIGINT',()=>close().finally(()=>process.exit(0)));
page.on('pageerror',e=>{errors.push({type:'pageerror',message:e.message,at:new Date().toISOString()});save();});
page.on('console',m=>{if(m.type()==='error'){errors.push({type:'console',message:m.text(),at:new Date().toISOString()});save();}});
page.on('requestfailed',r=>{errors.push({type:'requestfailed',url:r.url(),error:r.failure(),at:new Date().toISOString()});save();});
page.on('response',r=>{if(r.status()>=400){errors.push({type:'response',url:r.url(),status:r.status(),at:new Date().toISOString()});save();}});
await page.addInitScript(()=>localStorage.setItem('uc-v2-settings',JSON.stringify({graphics:'medium',frameLimit:60,graphicsChosen:true,reducedMotion:true})));
async function sample(){return page.evaluate(()=>{const i=window.__capivara.inspect(),s=i.snapshot,a=s?.actors.find(a=>!a.bot),hulls=window.__networkQA.driver.world.colliders.filter(c=>c.hull);const bodyInside=actor=>hulls.filter(c=>c.hull.every(([x,y,z,d])=>x*actor.pos.x+y*actor.pos.y+z*actor.pos.z<d+.32*Math.hypot(x,z)-Math.min(0,y)*(actor.crouch?1.3:1.8)-.025)).map(c=>c.id);return {screen:i.screen,match:s?.matchId,mode:s?.config.mode,time:s?.time,phase:s?.phase,remaining:s?.remaining,round:s?.round,pending:i.pending,rendered:i.renderedFrames,loading:i.renderState.loading,locked:i.clientInput.locked,input:i.clientInput,velocity:a?.velocity,pos:a?.pos,hp:a?.hp,alive:a?.alive,stage:a?.stage,kills:a?.kills,deaths:a?.deaths,level:a?.weaponLevel,money:a?.money,actors:s?.actors.length,aliveBots:s?.actors.filter(a=>a.bot&&a.alive).length,botKills:s?.actors.filter(a=>a.bot).reduce((n,a)=>n+a.kills,0),stonePenetrations:s?.actors.filter(a=>a.alive&&a.stage==='ground').flatMap(a=>bodyInside(a).map(stone=>({actor:a.id,stone,pos:a.pos}))),cameraStone:i.camera?hulls.filter(c=>c.hull.every(([x,y,z,d])=>x*i.camera.x+y*i.camera.y+z*i.camera.z<d+.15)).map(c=>c.id):[],camera:i.camera,resources:window.__capivara.resources(),perf:window.__capivara.perf(),audio:window.__capivara.audio(),results:s?.phase==='results'?s.results:undefined};});}
async function mark(event){const s=await sample();session.push({event,wall:new Date().toISOString(),...s});save();console.log(event,JSON.stringify({mode:s.mode,time:s.time,phase:s.phase,heap:s.perf.heapMB,resources:s.resources}));return s;}
async function round(mode,rematch=false){
 const teamSize=Number(mode.split(':')[1])||2;mode=mode.split(':')[0];
 const r={mode,teamSize:mode==='squads'?teamSize:undefined,rematch,started:new Date().toISOString(),samples:[],stuck:[],stageChanges:[],completed:false};rounds.push(r);save();
 const before=await sample();
 if(rematch)await page.locator('[data-do="rematch"]').click();
 else{await page.locator(`[data-mode="${mode}"]`).click();if(mode==='squads')await page.locator(`[data-team-size="${teamSize}"]`).click();await page.locator('[data-do="practice"]').click();}
 await page.waitForFunction(previous=>{const i=window.__capivara?.inspect();return i?.snapshot?.phase==='playing'&&!i.renderState.loading&&i.snapshot.matchId!==previous;},before.match||null,{timeout:120000});
 await page.evaluate(()=>window.__networkQA.activate());await startDriver(page);await mark('round-start');
 const started=Date.now();let previous=null,anchor=null,logged=-1,bought=0;
 while(Date.now()-started<1500000&&!stopping){
  const s=await sample();r.samples.push({...s,wall:new Date().toISOString()});
  if(previous?.stage!==s.stage)r.stageChanges.push({time:s.time,stage:s.stage,pos:s.pos});
  if(s.mode==='squads'&&s.round?.phase==='buy'&&s.round.number!==bought){
   bought=s.round.number;await page.keyboard.press('KeyO');
   const shop=page.getByRole('dialog',{name:'Banca da turma'});
   if(await shop.isVisible()){
    for(const name of ['Comprar M4 por 2900 moedas','Comprar Colete por 650 moedas','Comprar Capacete por 350 moedas']){
     const item=shop.getByRole('button',{name,exact:true});if(await item.count()&&await item.isEnabled()){
      // Money can update between two purchases. The host still checks every
      // real click; a newly disabled button simply stops that purchase.
      await item.click({timeout:700}).catch(()=>{});await page.waitForTimeout(150);
     }
    }
    if(await shop.isVisible())await shop.getByRole('button',{name:/Tudo pronto/}).click({timeout:700}).catch(()=>{});
   }
  }
  if(s.alive&&s.stage==='ground'&&s.input.moveZ&&(!s.round||s.round.phase==='live')){
   if(!anchor||Math.hypot(s.pos.x-anchor.x,s.pos.z-anchor.z)>1.5)anchor={...s.pos,at:s.time};
   else if(s.time-anchor.at>20){r.stuck.push({from:anchor.at,to:s.time,pos:s.pos,hp:s.hp,locked:s.locked,input:s.input,velocity:s.velocity});anchor={...s.pos,at:s.time};}
  }else anchor=null;
  if(Math.floor(s.time/30)!==logged){logged=Math.floor(s.time/30);console.log('round',JSON.stringify({mode,time:s.time,phase:s.phase,hp:s.hp,kills:s.kills,deaths:s.deaths,level:s.level,bots:s.aliveBots,heap:s.perf.heapMB,stuck:r.stuck.length}));}
  previous=s;save();
  if(s.phase==='results'){r.completed=true;r.finished=new Date().toISOString();r.result=s.results;await page.screenshot({path:resolve(out,`${mode}${mode==='squads'?`-${teamSize}v${teamSize}`:''}${rematch?'-rematch':''}-results.png`)});break;}
  await page.waitForTimeout(5000);
 }
 await stopDriver(page);await mark('round-end');
 if(!r.completed)throw new Error(`${mode} did not reach natural results in 25 minutes`);
 return r;
}
async function leave(){await page.locator('[data-do="leave"]:visible').first().click();const exit=page.locator('#exit');if(await exit.isVisible())await exit.click();await page.waitForFunction(()=>window.__capivara.inspect().screen==='home',{timeout:30000});await page.waitForTimeout(3000);await mark('leave-home');}
try{
 await page.goto(`${process.env.BASE||'http://127.0.0.1:5197'}/?networkQa=1&calm`,{waitUntil:'domcontentloaded'});
 await page.locator('[data-do="practice"]').waitFor({timeout:120000});await mark('home-start');
 for(let i=0;i<modes.length;i++){
  await round(modes[i]);
  if(process.env.REMATCH==='1'&&i===0)await round(modes[i],true);
  await leave();
 }
 await mark('session-end');
}catch(e){errors.push({type:'harness',message:e.stack,at:new Date().toISOString()});console.error(e.stack);process.exitCode=1;}finally{await close();}
