// Local PeerJS join, plane/drop, reload recovery and room teardown using real input.
import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startDriver,stopDriver } from '../../tests/perf/live-driver.mjs';
const out=resolve(process.argv[2]||'docs/overhaul/evidence/codex-bughunt/peers');mkdirSync(out,{recursive:true});
const evidence={started:new Date().toISOString(),browser:{channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl'],viewport:{width:1280,height:720},graphics:'low',frameLimit:30},events:[],errors:[],completed:false};
const save=()=>writeFileSync(resolve(out,'peer-session.json'),JSON.stringify(evidence,null,2));
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl']});
let stopping=false;async function close(){if(stopping)return;stopping=true;save();await browser.close();}
process.on('SIGTERM',()=>close().finally(()=>process.exit(0)));process.on('SIGINT',()=>close().finally(()=>process.exit(0)));
evidence.browser.version=browser.version();
const contexts=await Promise.all([1,2].map(()=>browser.newContext({viewport:{width:1280,height:720}})));
for(const context of contexts)await context.addInitScript(()=>localStorage.setItem('uc-v2-settings',JSON.stringify({graphics:'low',graphicsChosen:true,renderScale:.5,frameLimit:30,master:0,reducedMotion:true})));
const [host,guest]=await Promise.all(contexts.map(context=>context.newPage()));
for(const [label,page] of [['host',host],['guest',guest]]){
 page.on('pageerror',e=>{evidence.errors.push({label,type:'pageerror',message:e.message});save();});
 page.on('console',m=>{if(m.type()==='error'){evidence.errors.push({label,type:'console',message:m.text()});save();}});
 page.on('requestfailed',r=>{evidence.errors.push({label,type:'requestfailed',url:r.url(),failure:r.failure()});save();});
 page.on('response',r=>{if(r.status()>=400){evidence.errors.push({label,type:'response',url:r.url(),status:r.status()});save();}});
}
const inspect=page=>page.evaluate(()=>{const i=window.__capivara.inspect(),s=i.snapshot,a=s?.actors.find(a=>a.id===i.room?.myId);return{screen:i.screen,room:i.room,snapshot:s?{match:s.matchId,time:s.time,phase:s.phase,actors:s.actors.map(a=>({id:a.id,bot:a.bot,alive:a.alive,connected:a.connected,stage:a.stage,pos:a.pos,hp:a.hp,kills:a.kills}))}:null,local:a?{id:a.id,pos:a.pos,stage:a.stage,connected:a.connected,alive:a.alive}:null,loading:i.renderState.loading,network:i.network,pending:i.pending,clientInput:i.clientInput,resources:window.__capivara.resources(),heapMB:window.__capivara.perf().heapMB};});
async function mark(event){const [a,b]=await Promise.all([inspect(host),inspect(guest)]);evidence.events.push({event,at:new Date().toISOString(),host:a,guest:b});save();console.log(event,JSON.stringify({host:a.local,guest:b.local,time:a.snapshot?.time,room:a.room?.players?.length}));return[a,b];}
async function ready(page){await page.waitForFunction(()=>{const i=window.__capivara?.inspect();return i?.snapshot?.phase==='playing'&&!i.renderState.loading;},null,{timeout:120000});}
async function leave(page){const i=await inspect(page);if(i.screen==='game')await page.evaluate(()=>window.__networkQA.pause());await page.locator('[data-do="leave"]:visible').first().click();if(await page.locator('#exit').isVisible())await page.locator('#exit').click();await page.waitForFunction(()=>!window.__capivara.inspect().room,null,{timeout:30000});}
const base=process.env.BASE||'http://127.0.0.1:5197';
try{
 await host.goto(`${base}/?networkQa=1&calm`);await host.locator('[data-mode="battle-royale"]').click();await host.locator('[data-do="host"]').click();await host.locator('[name="nickname"]').fill('Maré anfitriã');await host.locator('#room-form [type="submit"]').click();
 await host.waitForFunction(()=>!!window.__capivara.inspect().room?.code,null,{timeout:30000});const code=(await inspect(host)).room.code;evidence.code=code;
 await guest.goto(`${base}/?networkQa=1&calm&sala=${code}`);await guest.locator('[name="nickname"]').fill('Brasa visitante');await guest.locator('#room-form [type="submit"]').click();
 await host.waitForFunction(()=>window.__capivara.inspect().room?.players.length===2,null,{timeout:30000});const guestId=(await inspect(guest)).room.myId;evidence.guestId=guestId;await mark('joined-lobby');
 await host.locator('[data-do="ready"]').click();await guest.locator('[data-do="ready"]').click();await host.locator('[data-do="start"]').waitFor({state:'visible'});await host.waitForFunction(()=>!document.querySelector('[data-do="start"]').disabled,null,{timeout:90000});await host.locator('[data-do="start"]').click();
 await Promise.all([ready(host),ready(guest)]);await mark('plane-start');
 for(const page of [host,guest])await page.evaluate(()=>window.__networkQA.activate());
 await startDriver(host);await startDriver(guest);
 for(let i=0;i<12;i++){await guest.waitForTimeout(2000);await mark('real-input-drop');const state=await inspect(guest);if(state.local?.stage==='ground')break;}
 const landed=await inspect(guest);if(landed.local?.stage!=='ground')throw new Error('Guest did not reach the ground through plane/drop input');
 await guest.waitForTimeout(3000);await mark('guest-ground-movement');
 await stopDriver(guest);await guest.evaluate(()=>{window.__networkQA.key('KeyW',false);window.__networkQA.key('ShiftLeft',false);});
 await guest.waitForTimeout(700);const [beforeHost,beforeGuest]=await mark('before-reload');
 const authoritative=beforeHost.snapshot.actors.find(a=>a.id===guestId);evidence.settledReplicationErrorM=Math.hypot(authoritative.pos.x-beforeGuest.local.pos.x,authoritative.pos.z-beforeGuest.local.pos.z);evidence.groundMovementM=Math.hypot(landed.local.pos.x-beforeGuest.local.pos.x,landed.local.pos.z-beforeGuest.local.pos.z);
 if(evidence.settledReplicationErrorM>.2)throw new Error('Settled guest position did not converge to the authoritative position');
 await guest.screenshot({path:resolve(out,'guest-ground.png')});
 const reloadAt=Date.now();await guest.reload();await guest.locator('#room-form [type="submit"]').click();await guest.waitForFunction(id=>window.__capivara.inspect().room?.myId===id,guestId,{timeout:30000});await ready(guest);evidence.recoveryMs=Date.now()-reloadAt;const recovered=await inspect(guest);evidence.identityPreserved=recovered.local?.id===guestId;evidence.positionRecoveryM=Math.hypot(recovered.local.pos.x-beforeGuest.local.pos.x,recovered.local.pos.z-beforeGuest.local.pos.z);evidence.sameMatchAfterReload=recovered.snapshot.match===beforeGuest.snapshot.match;await mark('reloaded-same-player');
 if(!evidence.identityPreserved||!evidence.sameMatchAfterReload)throw new Error('Reload changed the guest identity or current match');
 await guest.screenshot({path:resolve(out,'guest-restored.png')});
 await guest.evaluate(()=>window.__networkQA.activate());await startDriver(guest);await guest.waitForTimeout(4000);await stopDriver(guest);await mark('resumed-real-input');
 await leave(guest);await mark('guest-left');
 await guest.locator('[data-do="join"]').click();await guest.locator('#join-code').fill(code);await guest.locator('#room-form [type="submit"]').click();await ready(guest);await mark('guest-rejoined-live-room');
 await stopDriver(host);await leave(host);await guest.waitForFunction(()=>!window.__capivara.inspect().room,null,{timeout:30000});await mark('host-closed-room');
 evidence.closedToast=await guest.locator('#toast').textContent();if(!evidence.closedToast.includes('O anfitrião fechou a sala.'))throw new Error('Guest did not receive the host closure message');await Promise.all([host.screenshot({path:resolve(out,'host-home.png')}),guest.screenshot({path:resolve(out,'guest-closed-room.png')})]);
 evidence.completed=true;evidence.finished=new Date().toISOString();
}catch(error){evidence.errors.push({type:'harness',message:error.stack});console.error(error.stack);process.exitCode=1;}finally{await close();}
