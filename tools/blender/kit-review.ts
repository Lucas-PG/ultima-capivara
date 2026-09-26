import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetLoader } from '../../src/render/assets';
import { createKit, type KitPlacement } from '../../src/render/kit';

const params = new URLSearchParams(location.search);
const canvas = document.querySelector('canvas')!;
const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(Math.min(devicePixelRatio, 1.5)); gl.setSize(innerWidth, innerHeight);
gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap;
gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.3;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#C8DADE');
scene.fog = new THREE.Fog('#DBDCD0', 70, 180);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 250);
camera.position.set(25, 15, 29); camera.lookAt(0, 3, 0);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 3, 0); controls.update();
scene.add(new THREE.HemisphereLight('#D7E7EF', '#B59060', 2.1));
const sun = new THREE.DirectionalLight('#FFE0AD', 4.0); sun.position.set(-30, 48, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -45;
sun.shadow.camera.right = sun.shadow.camera.top = 45; sun.shadow.camera.near = .1; sun.shadow.camera.far = 130;
sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color:'#CCBE8A', roughness:1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.035; floor.receiveShadow = true; scene.add(floor);
const layouts: Record<string, KitPlacement[]> = {
  vila: [
    { piece:'house_small',x:-7,y:0,z:0,yaw:0 }, {piece:'house_tall',x:3,y:0,z:-3,yaw:0},
    {piece:'church',x:-13,y:0,z:-17,yaw:0}, {piece:'market_hall',x:12,y:0,z:-19,yaw:0},
    {piece:'crate',x:-3,y:0,z:6,yaw:.15}, {piece:'crate',x:-1.5,y:0,z:6.3,yaw:-.1},
  ],
  forte: [{piece:'fort_wall',x:0,y:0,z:0,yaw:0},{piece:'fort_tower',x:7,y:0,z:0,yaw:0},
    {piece:'fort_wall',x:-7,y:0,z:-4,yaw:Math.PI/2},{piece:'dock_wood',x:2,y:0,z:12,yaw:0},
    {piece:'bridge_stone',x:-10,y:0,z:13,yaw:0}],
};
const placements = params.has('piece') ? [{piece:params.get('piece')!,x:0,y:0,z:0,yaw:0}] : layouts[params.get('view') || 'vila'];
const assets = new AssetLoader(gl);
const kit = createKit(scene, assets, placements, params.get('quality') || 'medium');
await kit.ready;
const draw = () => { kit.update(camera); gl.render(scene, camera); document.querySelector('#stats')!.textContent = `${gl.info.render.calls} chamadas · ${gl.info.render.triangles.toLocaleString('pt-BR')} triângulos · 1 atlas`; };
controls.addEventListener('change', draw);
window.addEventListener('resize',()=>{gl.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();draw();});
(window as unknown as { kitReview: unknown }).kitReview = { ready:true, scene, camera, gl, kit, draw, shot: (x:number,y:number,z:number,tx=0,ty=3,tz=0)=>{camera.position.set(x,y,z);controls.target.set(tx,ty,tz);controls.update();draw();} };
draw();
