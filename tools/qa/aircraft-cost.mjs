import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadavg, freemem, cpus } from 'node:os';

// Alternating paired frames deliberately tolerate general workstation load.
// These are serialized render costs, not gameplay FPS or quiet hardware claims.
const out=process.argv[2]||'docs/overhaul/evidence/codex-plane';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=gl-egl']});
const host=()=>({at:new Date().toISOString(),load:loadavg(),freeBytes:freemem()});
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
const result={method:'Five rounds, twenty alternating old/new pairs per round; AB and BA order alternate; warmed full world and post pipeline; gl.finish after every frame; shared workstation load.',cpu:cpus()[0].model,cpuThrottle:4,chrome:browser.version(),started:host(),cases:[]};
try {
  const page=await browser.newPage({viewport:{width:1470,height:956},deviceScaleFactor:2});
  page.on('pageerror',error=>{console.error(error.message);process.exitCode=1;});
  await page.goto(`${process.env.BASE||'http://127.0.0.1:5198'}/tools/blender/aircraft-review.html`);
  await page.waitForFunction(()=>window.aircraftReview?.ready,null,{timeout:120000});
  result.gpu=await page.evaluate(()=>{
    const gl=window.aircraftReview.view.gl.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  for(const kind of ['plane','canopies-near','canopies-distance']) {
    const setup=await page.evaluate(kind=>window.aircraftReview.prepareBench(kind),kind);
    const entry={...setup,rounds:[]};
    for(let round=0;round<5;round++) {
      const beforeLoad=host();
      const samples=await page.evaluate(round=>window.aircraftReview.benchRound(round,20),round);
      entry.rounds.push({beforeLoad,afterLoad:host(),samples});
    }
    entry.summary={};
    for(const version of ['before','after']) {
      const samples=entry.rounds.flatMap(round=>round.samples[version]);
      entry.summary[version]=Object.fromEntries(['submitMs','completedMs'].map(key=>[key,{median:percentile(samples.map(s=>s[key]),.5),p90:percentile(samples.map(s=>s[key]),.9),max:Math.max(...samples.map(s=>s[key]))}]));
    }
    result.cases.push(entry); console.log(kind,JSON.stringify(entry.summary));
    await writeFile(`${out}/interleaved-cost.json`,JSON.stringify({...result,finished:host()},null,2)+'\n');
  }
} finally {await browser.close();}
