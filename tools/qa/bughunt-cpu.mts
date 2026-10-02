import{performance}from'node:perf_hooks';
// Point at an immutable archived source tree, with its own package.json.
const folder=process.argv[2];
if (!folder) throw new Error('Give an immutable source directory.');
const{createWorld}=await import(`${folder}/src/shared/world.ts`),{Simulation}=await import(`${folder}/src/simulation/index.ts`),{hasLineOfSight}=await import(`${folder}/src/shared/collision.ts`),{walkableSegment}=await import(`${folder}/src/shared/navigation.ts`);
const t=performance.now(),world=createWorld(),createMs=performance.now()-t;
const config={mode:'battle-royale',capacity:16,bots:true,difficulty:'normal',duration:300};
const sim=new Simulation(world,config,[], 'benchmark', 37);
for(let i=0;i<1800;i++){sim.step(1/60);sim.drainEvents();}
const times=[];let events=0;const first=sim.snapshot();
for(let i=0;i<600;i++){const start=performance.now();sim.step(1/60);times.push(performance.now()-start);events+=sim.drainEvents().length;}
const sorted=times.slice().sort((a,b)=>a-b),end=sim.snapshot();
let rays=0;const start=performance.now();
for(let i=0;i<2000;i++){const a={x:-100+(i%10)*21,y:16,z:-90+(i%7)*27},b={x:95-(i%9)*20,y:2,z:98-(i%11)*18};rays+=hasLineOfSight(a,b,world)?1:0;}
const sightMs=performance.now()-start;
let paths=0;const navStart=performance.now();
for(let i=0;i<400;i++){const a=world.spawns[i%world.spawns.length],b=world.spawns[(i*7+3)%world.spawns.length];paths+=walkableSegment(world,a,b,false)?1:0;}
const navMs=performance.now()-navStart;
console.log(JSON.stringify({folder,createMs,tickMs:times.reduce((a,b)=>a+b,0)/times.length,p95TickMs:sorted[Math.floor(sorted.length*.95)],maxTickMs:sorted.at(-1),firstTime:first.time,endTime:end.time,phase:end.phase,actors:end.actors.length,startAlive:first.actors.filter(a=>a.alive).length,endAlive:end.actors.filter(a=>a.alive).length,events,sightMs,rays,navMs,paths,colliders:world.colliders.length,hulls:world.colliders.filter(c=>c.hull).length,heapMB:process.memoryUsage().heapUsed/1048576}));
