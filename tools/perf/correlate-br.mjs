import fs from 'node:fs';
import readline from 'node:readline';
const dir=process.argv[2];
if(!dir)throw new Error('Usage: node tools/perf/correlate-br.mjs <capture-directory>');
const data=JSON.parse(fs.readFileSync(`${dir}/samples.json`));
const summary=JSON.parse(fs.readFileSync(`${dir}/summary.json`));
let offset,pid,tid,start;
const events=[],profiles=[];
for await (let line of readline.createInterface({input:fs.createReadStream(`${dir}/trace.json`),crlfDelay:Infinity})){
 if(!line.startsWith('{"args"'))continue;
 if(line.endsWith(','))line=line.slice(0,-1);
 if(line.includes('],"metadata":'))line=line.slice(0,line.indexOf('],"metadata":')); 
 const e=JSON.parse(line);
 if(e.name==='capivara:capture-start'){start=e.args.data.startTime;offset=e.ts/1000-start;pid=e.pid;tid=e.tid;}
 if(e.name==='Profile'||e.name==='ProfileChunk')profiles.push(e);
 if(e.dur>=500||e.name.startsWith('capivara:')||e.name==='RunTask')events.push(e);
}
if(offset===undefined)throw new Error('Missing clock alignment');
const main=events.filter(e=>e.pid===pid&&e.tid===tid).map(e=>({...e,t:e.ts/1000-offset,d:(e.dur??0)/1000}));
function inspect(t,d){
 const overlap=e=>e.t<t+d&&e.t+e.d>t;
 return {startTime:t,duration:d,marks:data.timings.spans.filter(s=>s.name!=='raf-gap'&&s.startTime<t+d&&s.startTime+s.duration>=t).sort((a,b)=>b.duration-a.duration).slice(0,8),
 events:main.filter(e=>e.ph==='X'&&overlap(e)).sort((a,b)=>b.d-a.d).slice(0,18).map(e=>({name:e.name,startTime:e.t,duration:e.d,args:e.args})),
 longTasks:data.timings.longTasks.filter(e=>e.startTime<t+d&&e.startTime+e.duration>t)};
}
const out={sourceHash:summary.sourceHash,preset:summary.preset,clock:{offset,pid,tid,captureStart:start},droppedSpans:data.timings.droppedSpans,droppedTasks:data.timings.droppedTasks,
 excludedBeforeCapture:summary.spikes.filter(s=>s.startTime<start),
 spikes:summary.spikes.filter(s=>s.startTime>=start).map(s=>({...s,beforeCaptureStart:s.startTime<start,...inspect(s.startTime,s.duration)})),
 longTasks:data.timings.longTasks.map(e=>({...e,...inspect(e.startTime,e.duration)}))};
fs.writeFileSync(`${dir}/correlation.json`,JSON.stringify(out,null,2));
fs.writeFileSync(`${dir}/profiles.json`,JSON.stringify(profiles));
// Overlap is evidence, not proof that a containing render call caused the stall.
// A GC nested in world-draw must not be reported as GPU time or a shader compile.
const causes=out.spikes.map(s=>({
 startTime:s.startTime,matchTime:s.matchTime??null,duration:s.duration,
 evidence:s.events.filter(e=>!/^(RunTask|FireAnimationFrame|FunctionCall|v8.callFunction|HandlePostMessage)$/.test(e.name)),
 spans:s.marks,longTasks:s.longTasks,
 disposition:s.events.some(e=>/GC|Layout|Paint|Compile|Decode|Upload/.test(e.name))
  ? 'Inspect recorded event and stack; overlapping spans alone do not establish the cause'
  : 'UNATTRIBUTED: do not infer shader, GPU, driver, GC, or scheduler cause from a generic task',
}));
fs.writeFileSync(`${dir}/attribution.json`,JSON.stringify({sourceHash:summary.sourceHash,preset:summary.preset,
 environment:summary.environment??{activity:'Historical run; exclusivity not established'},
 captureStart:start,excludedBeforeCapture:out.excludedBeforeCapture,
 loss:{spans:out.droppedSpans,tasks:out.droppedTasks,frames:summary.dropped},spikes:causes},null,2));
console.log(JSON.stringify({clock:out.clock,longTasks:out.longTasks.length,spikes:out.spikes.map(s=>({start:s.startTime,matchTime:s.matchTime,ms:s.duration,marks:s.marks.slice(0,3).map(m=>[m.name,m.duration]),events:s.events.slice(0,5).map(e=>[e.name,e.duration])}))},null,2));
