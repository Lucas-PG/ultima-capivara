import { chromium } from '@playwright/test';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
const [preset='medium', secondsArg='240', sourceHash='', url='http://127.0.0.1:4182/?timing=1'] = process.argv.slice(2);
// Run from a clean frozen checkout, served by its own local DEV Vite server.
// Headless pointer lock is replaced only for active rendering; simulation/HUD remain real.
const seconds=Number(secondsArg);
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sourceHash!==head)throw new Error('Pass the full hash of the frozen checkout used as cwd and Vite root');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw new Error('Tracked source must be clean');
const activity=process.env.FORJA_MACHINE_ACTIVITY;
if(!activity)throw new Error('FORJA_MACHINE_ACTIVITY must record Formiga timing-window agreement and concurrent activity');
const environment={cpu:cpus()[0]?.model,platform:platform(),release:release(),activity};
if(!['low','medium','high'].includes(preset)||!(seconds>0&&seconds<=480))throw new Error('preset seconds(1..480) hash url');
const out=resolve('output/m1',`trace-${sourceHash.slice(0,7)}-${preset}`);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=metal','--enable-precise-memory-info','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
await context.addInitScript(preset=>{localStorage.setItem('uc-onboarded','1');localStorage.setItem('uc-v2-settings',JSON.stringify({graphics:preset,frameLimit:60}));},preset);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(`${m.type()}: ${m.text()}`)});
await page.route('**/src/main.ts*',async route=>{
 const response=await route.fetch();let body=await response.text();
 for(const [from,to]of [['const activeLimit = input.locked ? settings.frameLimit : ended ? 30 : 10;','const activeLimit = 60;'],['if (input.locked || dirtyFrame || ended) {','if (true) {']]){
  if(!body.includes(from))throw new Error('Active-render injection mismatch');body=body.replace(from,to);
 }
 body+=`\nconst __traceCapacity=32768,__traceRaf=new Float64Array(__traceCapacity*6);let __traceCount=0,__traceLast=0,__traceArmed=false;
const __tracePhases={lobby:0,countdown:1,playing:2,results:3};
requestAnimationFrame(function traceRaf(now){
 if(__traceArmed&&__traceLast){const ms=now-__traceLast,o=(__traceCount++%__traceCapacity)*6;
 __traceRaf[o]=__traceLast;__traceRaf[o+1]=ms;__traceRaf[o+2]=snapshot?.tick??-1;__traceRaf[o+3]=renderedFrames;__traceRaf[o+4]=__tracePhases[snapshot?.phase]??-1;__traceRaf[o+5]=snapshot?.time??-1;
 if(ms>50){performance.mark('capivara:frame-spike',{startTime:__traceLast,detail:{duration:ms,tick:snapshot?.tick,renderedFrames,phase:snapshot?.phase}});performance.clearMarks('capivara:frame-spike');}}
 __traceLast=__traceArmed?now:0;requestAnimationFrame(traceRaf);
});
window.__forjaTrace={state(){return {frames:renderedFrames,phase:snapshot?.phase,tick:snapshot?.tick,actors:snapshot?.actors.length,stage:snapshot?.actors[0]?.stage,mode:snapshot?.config.mode,matchTime:snapshot?.time,loading,readyToReveal,screen:ui.screen,stats:renderer?.stats,preset:settings.graphics}},
start(){__traceCount=0;__traceLast=0;__traceArmed=true;window.__capivara.resetPerf();performance.mark('capivara:capture-start');},
finish(){__traceArmed=false;performance.mark('capivara:capture-end');const records=[];for(let i=Math.max(0,__traceCount-__traceCapacity);i<__traceCount;i++){const o=i%__traceCapacity*6;records.push({startTime:__traceRaf[o],duration:__traceRaf[o+1],tick:__traceRaf[o+2],renderedFrames:__traceRaf[o+3],phase:__traceRaf[o+4],matchTime:__traceRaf[o+5]})}return {state:this.state(),raf:records,dropped:Math.max(0,__traceCount-__traceCapacity),timings:window.__capivara.timings()}}};`;
 await route.fulfill({response,body});
});
const cdp=await context.newCDPSession(page);let started=false;
try{
 await page.goto(url);await page.locator('[data-do="practice"]').click();
 await page.waitForFunction(()=>window.__forjaTrace?.state().frames>10&&!window.__forjaTrace.state().loading,undefined,{timeout:120000});
 let before=await page.evaluate(()=>window.__forjaTrace.state());
 if(before.mode!=='battle-royale')throw new Error('Expected real BR practice match');
 await cdp.send('Tracing.start',{categories:'toplevel,toplevel.flow,devtools.timeline,v8,blink.user_timing,disabled-by-default-toplevel,disabled-by-default-v8.gc,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,disabled-by-default-v8.cpu_profiler',options:'record-continuously',transferMode:'ReturnAsStream'});started=true;
 before=await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__forjaTrace.start();done(window.__forjaTrace.state());}))));
 console.log(JSON.stringify({started:new Date().toISOString(),seconds,preset,sourceHash,before,out}));
 await new Promise(done=>setTimeout(done,seconds*1000));
 const data=await page.evaluate(()=>window.__forjaTrace.finish());
 const completed=new Promise(done=>cdp.once('Tracing.tracingComplete',done));await cdp.send('Tracing.end');started=false;
 const {stream}=await completed;const tracePath=resolve(out,'trace.json');await writeFile(tracePath,'');
 for(;;){const chunk=await cdp.send('IO.read',{handle:stream});await appendFile(tracePath,chunk.base64Encoded?Buffer.from(chunk.data,'base64'):chunk.data);if(chunk.eof)break}await cdp.send('IO.close',{handle:stream});
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('#game').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
 const durations=data.raf.map(x=>x.duration).sort((a,b)=>a-b),spikes=data.raf.filter(x=>x.duration>50);
 const summary={sourceHash,environment,protocol:{forcedHeadlessRender:true,forcedGc:false,profilerStartupExcluded:true},preset,seconds,url,browser:browser.version(),gpu,viewport:{width:1280,height:720,dpr:1},before,after:data.state,frames:data.state.frames-before.frames,rafCount:durations.length,p95:durations[Math.floor(durations.length*.95)],max:durations.at(-1),over50:spikes.length,spikes,errors,dropped:data.dropped,droppedSpans:data.timings.droppedSpans,tracePath};
 await writeFile(resolve(out,'samples.json'),JSON.stringify(data));await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 if(errors.length||!data.timings.enabled||durations.length<seconds*20||data.dropped||data.timings.droppedSpans||data.timings.droppedTasks)process.exitCode=1;
}finally{if(started)await cdp.send('Tracing.end').catch(()=>{});await browser.close()}
