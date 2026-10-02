// Development-only fixed cameras through the shipped lighting, world and post pipeline.
import * as THREE from 'three';
import { GameRenderer } from '../../src/render/renderer';
import { createWorld } from '../../src/shared/world';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { emptyInput } from '../../src/shared/math';
import { makePlane as baselinePlane, makeParachute as baselineParachute } from '../qa/aircraft-baseline';
import type { AvatarView } from '../../src/render/avatars';
import type { RenderPipeline } from '../../src/render/pipeline';
import type { ActorState, RenderFrame } from '../../src/shared/types';
import { makeParachute } from '../../src/render/aircraft';

const params = new URLSearchParams(location.search), before = params.get('version') === 'before';
const renderer = new GameRenderer(document.querySelector('canvas')!, createWorld(), { ...DEFAULT_SETTINGS, graphics: 'medium', fov: 90 });
await renderer.warmup();
const view = renderer as unknown as { scene: THREE.Scene; gl: THREE.WebGLRenderer; plane: THREE.Group; pipeline: RenderPipeline; avatars: AvatarView; sun: THREE.DirectionalLight };
const plane = before ? baselinePlane() : view.plane;
if (before) { view.plane.visible = false; view.scene.add(plane); }
plane.position.set(0, 112, -20);
const actor: ActorState = {
  id: 'chute-review', name: 'Capivara', color: '#E87943', bot: false, connected: true,
  pos: { x: 0, y: 87, z: -20 }, velocity: { x: 0, y: -6.5, z: -2 }, yaw: 0, pitch: 0, lean: 0,
  hp: 100, armor: 0, helmet: 0, alive: true, grounded: false, crouch: false, sprint: false, ads: false, stage: 'parachute',
  kills: 0, deaths: 0, damage: 0, weapons: [], slot: 0, consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 },
  reloadUntil: 0, useUntil: 0, using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, heat: 0,
};
const frame: RenderFrame = { snapshot: { actors: [actor], time: 5 } as RenderFrame['snapshot'], playerId: 'camera', playing: false, input: emptyInput(), spectateId: null, dt: 1/30 };
for (let i=0;i<30;i++) view.avatars.update(frame, 0, i/30);
const avatar = view.avatars.get(actor.id)!;
avatar.label.visible = false;
if (before) {
  const chute=baselineParachute(actor.color); avatar.chute.removeFromParent(); avatar.group.add(chute); avatar.chute=chute;
}
const SHOTS: Record<string, { label: string; chute?: boolean; at: number[]; target: number[]; fov?: number }> = {
  'plane-front': { label:'Avião: aproximação e silhueta', at:[22,12,-29], target:[0,.7,0],fov:44 },
  'plane-side': { label:'Avião: lateral e porta de salto', at:[28,3.5,-1],target:[0,.5,0],fov:44 },
  'plane-rear': { label:'Avião: cauda e cabine aberta',at:[-20,8,27],target:[0,.8,1],fov:44 },
  'plane-ground': { label:'Avião: visto de baixo',at:[20,-22,-25],target:[0,.3,0],fov:44 },
  'plane-cabin': { label:'Cabine: bancos, estrutura e painel',at:[0,.15,4.0],target:[0,.0,-5.8],fov:76 },
  'plane-door': { label:'Cabine: porta, degrau e apoio',at:[5.3,.7,4.1],target:[0,-.05,-.9],fov:56 },
  'plane-cockpit': { label:'Cabine: instrumentos e comandos',at:[0,.24,-4.38],target:[0,-.15,-6.3],fov:80 },
  'chute-front': { label:'Paraquedas: frente e tirantes',chute:true,at:[4.2,3.0,-7.7],target:[0,2.2,0],fov:44 },
  'chute-back': { label:'Paraquedas: velame e arnês',chute:true,at:[-4.3,3.0,7.7],target:[0,2.2,0],fov:44 },
  'chute-eye': { label:'Paraquedas: vista do personagem',chute:true,at:[0,1.70,-.08],target:[0,4.0,-.65],fov:94 },
  'chute-grip': { label:'Paraquedas: controles junto às patas',chute:true,at:[.94,1.98,-1.32],target:[.17,1.80,-.12],fov:54 },
};
function shot(name: string, lod?: number) {
  const options = SHOTS[name]; if (!options) throw new Error(name);
  plane.visible=!options.chute; avatar.group.visible=!!options.chute; avatar.label.visible=false;
  const origin=options.chute?new THREE.Vector3().copy(actor.pos):plane.position;
  renderer.camera.fov=options.fov??48;
  renderer.camera.position.fromArray(options.at).add(origin);
  renderer.camera.lookAt(new THREE.Vector3().fromArray(options.target).add(origin)); renderer.camera.updateProjectionMatrix();
  if (options.chute && name==='chute-eye') avatar.body.visible=false; else avatar.body.visible=true;
  const direction=view.sun.position.clone().sub(view.sun.target.position).normalize();
  view.sun.target.position.copy(origin); view.sun.position.copy(origin).addScaledVector(direction,82);
  for(const root of [plane,avatar.chute])root.traverse(o=>{if(o instanceof THREE.LOD){o.autoUpdate=lod===undefined;if(lod!==undefined)o.levels.forEach((level,i)=>level.object.visible=i===lod);}});
  renderer.resize();
  const stats={drawCalls:0,triangles:0};
  view.pipeline.render(view.scene,renderer.camera,stats);
  document.getElementById('caption')!.textContent=`${before?'Antes (b721224)':'Depois'} · ${options.label}`;
  let modelDraws=0, modelTriangles=0, modelLines=0;
  (options.chute?avatar.chute:plane).traverseVisible(object=>{
    if(object instanceof THREE.Mesh){modelDraws++;modelTriangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}
    else if(object instanceof THREE.Line){modelDraws++;modelLines++;}
  });
  return {...stats,modelDraws,modelTriangles,modelLines};
}
let benchRoots: { before: THREE.Group; after: THREE.Group } | null = null;
function modelCost(root: THREE.Object3D) {
  let draws=0,triangles=0,lines=0;
  const buffers=new Set<ArrayBufferLike>();
  root.traverse(object=>{
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    for (const attribute of [...Object.values(object.geometry.attributes),object.geometry.index]) {
      if (!attribute) continue;
      buffers.add(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.buffer : attribute.array.buffer);
    }
  });
  root.traverseVisible(object=>{
    if (object instanceof THREE.Mesh) { draws++; triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3; }
    else if (object instanceof THREE.Line) { draws++; lines++; }
  });
  return {draws,triangles,lines,ownedGeometryBytes:[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0)};
}
async function prepareBench(kind: 'plane' | 'canopies-near' | 'canopies-distance') {
  if (benchRoots) { benchRoots.before.removeFromParent(); benchRoots.after.removeFromParent(); }
  plane.visible=false; avatar.group.visible=false; view.plane.visible=false;
  benchRoots={before:new THREE.Group(),after:new THREE.Group()};
  if (kind==='plane') {
    const old=baselinePlane(); old.position.copy(view.plane.position);
    benchRoots.before.add(old); benchRoots.after.add(view.plane);
    renderer.camera.position.set(22,124,-49); renderer.camera.lookAt(0,112.7,-20); renderer.camera.fov=44;
  } else {
    for(let i=0;i<16;i++) for(const version of ['before','after'] as const) {
      const chute=(version==='before'?baselineParachute:makeParachute)(['#E87943','#1FB5A8','#FFC23D','#3D6FB6'][i%4]);
      chute.position.set((i%4-1.5)*6.5,87,-20+Math.floor(i/4)*7); benchRoots[version].add(chute);
      if(kind==='canopies-near')chute.traverse(object=>{if(object instanceof THREE.LOD){object.autoUpdate=false;object.levels.forEach((level,i)=>level.object.visible=i===0);}});
    }
    renderer.camera.position.set(0,99,-58); renderer.camera.lookAt(0,90,-10); renderer.camera.fov=57;
  }
  view.scene.add(benchRoots.before,benchRoots.after); view.plane.visible=true;
  renderer.camera.updateProjectionMatrix(); renderer.resize();
  const context=view.gl.getContext(), stats={drawCalls:0,triangles:0};
  for(const version of ['before','after'] as const) {
    benchRoots.before.visible=version==='before';benchRoots.after.visible=version==='after';
    await view.gl.compileAsync(view.scene,renderer.camera);
    for(let i=0;i<8;i++){view.pipeline.render(view.scene,renderer.camera,stats);context.finish();}
  }
  const costs={} as Record<string,ReturnType<typeof modelCost>>;
  for(const version of ['before','after'] as const){benchRoots[version].visible=true;costs[version]=modelCost(benchRoots[version]);}
  return {kind,costs,density:renderer.renderDensity,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
}
async function benchRound(round: number, frames=20) {
  if(!benchRoots)throw new Error('Prepare a medição primeiro.');
  const context=view.gl.getContext(), stats={drawCalls:0,triangles:0};
  const samples={before:[] as {submitMs:number;completedMs:number}[],after:[] as {submitMs:number;completedMs:number}[]};
  for(let i=0;i<frames;i++) {
    const order=(i+round)%2?['after','before'] as const:['before','after'] as const;
    for(const version of order) {
      benchRoots.before.visible=version==='before';benchRoots.after.visible=version==='after';
      const started=performance.now();view.pipeline.render(view.scene,renderer.camera,stats);
      const submitted=performance.now();context.finish();
      samples[version].push({submitMs:submitted-started,completedMs:performance.now()-started});
    }
    if(i%4===3)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  return samples;
}
(window as any).aircraftReview={ready:true,shot,renderer,plane,avatar,view,names:Object.keys(SHOTS),prepareBench,benchRound};
shot(params.get('shot')||'plane-front');
addEventListener('beforeunload',()=>renderer.dispose());
