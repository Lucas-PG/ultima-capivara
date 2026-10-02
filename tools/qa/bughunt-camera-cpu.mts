import{performance}from'node:perf_hooks';
const folder=process.argv[2],{createWorld}=await import(`${folder}/src/shared/world.ts`),{clearDistance}=await import(`${folder}/src/render/follow-camera.ts`);
const world=createWorld(),types=['cliff_rock','cliff_rock_low','cliff_rock_tall','cliff_ledge'];
const probes=types.flatMap(type=>{const rock=world.pieces.find(p=>p.piece===type);return Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4,reach=(type==='cliff_ledge'?7:5)*(rock.scale??1),x=Math.sin(angle),z=Math.cos(angle);return{origin:{x:rock.x+x*reach,y:rock.y+1.5,z:rock.z+z*reach},dir:{x:-x,y:0,z:-z}};});});
let sum=0;for(const p of probes)clearDistance(world,p.origin,p.dir,3.2,.24);
const start=performance.now();for(let i=0;i<3200;i++){const p=probes[i%probes.length];sum+=clearDistance(world,p.origin,p.dir,3.2,.24);}
console.log(JSON.stringify({folder,probes:3200,cameraMs:performance.now()-start,allowedMean:sum/3200}));
