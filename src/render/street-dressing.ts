import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MapObject, WorldSpec } from '../shared/types';

const UP = new THREE.Vector3(0, 1, 0);
const LABELS = ['PADARIA', 'CAFÉ DA VILA', 'ATELIÊ', 'PEIXE FRESCO', 'OFICINA', 'ARMAZÉM', 'BOM DIA', 'CAPIVARAS'];

function paintedPanels() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const x = i % 4 * 256, y = Math.floor(i / 4) * 256;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = ['#F0D79E', '#6EA8A0', '#D78568', '#78AAA7'][i % 4];
    ctx.beginPath(); ctx.roundRect(8, 55, 240, 150, 19); ctx.fill();
    ctx.strokeStyle = '#F8E9BF'; ctx.lineWidth = 6; ctx.stroke();
    // Translucent brush strokes and uneven borders retain a painted surface.
    for (let j = 0; j < 20; j++) {
      ctx.strokeStyle = j % 2 ? '#fff3' : '#66441B12'; ctx.lineWidth = 2 + j % 5;
      ctx.beginPath(); ctx.moveTo(16, 61 + j * 7); ctx.quadraticCurveTo(117, 58 + j * 7, 238, 65 + j * 7); ctx.stroke();
    }
    ctx.fillStyle = '#345D56'; ctx.font = 'bold 23px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], 128, 83, 218);
    // Original capybara stencil: broad muzzle, tiny ears and a leafy island sprig.
    ctx.fillStyle = '#AD784D'; ctx.beginPath(); ctx.ellipse(128, 146, 49, 29, -.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(166, 139, 31, 22, -.08, 0, Math.PI * 2); ctx.fill();
    for (const xx of [103, 151]) { ctx.beginPath(); ctx.roundRect(xx, 161, 16, 25, 7); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(152, 117, 9, 12, -.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#714D37'; ctx.beginPath(); ctx.ellipse(153, 119, 4, 7, -.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#342E29'; ctx.beginPath(); ctx.arc(170, 132, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(190, 143, 5, 3, .2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#47725A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(54, 186); ctx.quadraticCurveTo(59, 151, 75, 139); ctx.stroke();
    ctx.fillStyle = '#6F9562';
    for (let leaf = 0; leaf < 4; leaf++) { ctx.beginPath(); ctx.ellipse(58 + leaf * 4, 174 - leaf * 9, 11, 4, leaf % 2 ? .6 : -.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

/** Small original street props, merged by material and cell. No gameplay solids. */
export function createStreetDressing(world: Pick<WorldSpec, 'objects'>) {
  const group = new THREE.Group(); group.name = 'vida-das-ruas';
  const atlas = paintedPanels();
  const materials = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84, metalness: .04, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: '#FFE2A1', emissive: '#FFB956', emissiveIntensity: .65, roughness: .4 }),
    new THREE.MeshStandardMaterial({ map: atlas, transparent: false, alphaTest: .25, roughness: 1, side: THREE.DoubleSide }),
  ];
  const buckets = new Map<string, { material: number; parts: THREE.BufferGeometry[] }>();
  let root = new THREE.Matrix4(), marker: MapObject;
  const add = (geometry: THREE.BufferGeometry, color: string, material = 0) => {
    const tint = new THREE.Color(color), positions = geometry.getAttribute('position'), values = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const wash = .94 + Math.sin(positions.getX(i) * 12 + positions.getY(i) * 8 + positions.getZ(i) * 5) * .055;
      values.set([tint.r * wash, tint.g * wash, tint.b * wash], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    geometry.applyMatrix4(root);
    const key = `${material}:${Math.floor(marker.pos.x / 48)}:${Math.floor(marker.pos.z / 48)}`;
    const bucket = buckets.get(key) ?? { material, parts: [] }; bucket.parts.push(geometry); buckets.set(key, bucket);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) =>
    add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  const orb = (x: number, y: number, z: number, radius: number, color: string, light = false) =>
    add(new THREE.SphereGeometry(radius, 8, 6).translate(x, y, z), color, light ? 1 : 0);
  const beam = (a: number[], b: number[], radius: number, color: string) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    add(new THREE.CylinderGeometry(radius * .9, radius, delta.length(), 6)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()))
      .translate(...start.add(end).multiplyScalar(.5).toArray()), color);
  };
  const cable = (points: number[][], radius: number, color: string) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(curve, 18, radius, 4, false), color);
  };
  const fabric = (x: number, y: number, z: number, width: number, height: number, color: string, phase: number) => {
    const cloth = new THREE.PlaneGeometry(width, height, 6, 6), pos = cloth.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const t = .5 - pos.getY(i) / height;
      pos.setZ(i, Math.sin(pos.getX(i) * 15 + phase) * .035 * (t + .2) + t * t * .09);
      pos.setY(i, pos.getY(i) - Math.sin((pos.getX(i) / width + .5) * Math.PI) * .045);
    }
    cloth.computeVertexNormals(); cloth.translate(x, y, z); add(cloth, color);
    beam([x - width / 2, y - height / 2 + .035, z + .04], [x + width / 2, y - height / 2 + .035, z + .04], .009, '#E8D6AB');
  };
  for (const object of world.objects) {
    if (!object.detail?.startsWith('prop:street-')) continue;
    marker = object;
    root = new THREE.Matrix4().compose(new THREE.Vector3(object.pos.x, object.pos.y, object.pos.z),
      new THREE.Quaternion().setFromAxisAngle(UP, object.rotation ?? 0), new THREE.Vector3(object.scale.x, object.scale.y, object.scale.z));
    const kind = object.detail.slice('prop:street-'.length);
    if (kind === 'laundry') {
      for (const x of [-2.8, 2.8]) {
        beam([x, 0, 0], [x, 3.5, 0], .055, '#9A7051'); orb(x, 3.53, 0, .07, '#D8B889');
      }
      cable([[-2.8, 3.38, 0], [-1.4, 3.17, 0], [0, 3.08, 0], [1.4, 3.17, 0], [2.8, 3.38, 0]], .014, '#C4AB7B');
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * .91, y = 3.1 + Math.abs(x) * .05, color = ['#DF9475', '#EFE2B8', '#6EAAA1', '#D5B75B', '#859DB7'][i];
        fabric(x, y - .39, 0, .62, .78, color, i);
        if (i % 2 === 0) for (const side of [-1, 1]) fabric(x + side * .35, y - .16, 0, .22, .28, color, i);
        for (const dx of [-.24, .24]) box(x + dx, y + .025, .035, .045, .13, .035, '#BC8956');
      }
    } else if (kind === 'lights') {
      const span = 8.2;
      for (const x of [-span / 2, span / 2]) { beam([x, 0, 0], [x, 4.25, 0], .065, '#755F49'); box(x, 3.65, 0, .14, .12, .14, '#B59868'); }
      const sag = (x: number) => 3.45 + (x / (span / 2)) ** 2 * .72;
      cable(Array.from({ length: 9 }, (_, i) => { const x = (i / 8 - .5) * span; return [x, sag(x), 0]; }), .013, '#584B38');
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * .87, y = sag(x);
        beam([x, y, 0], [x, y - .18, 0], .018, '#69573E');
        orb(x, y - .23, 0, .065, '#FFE2A1', true);
        add(new THREE.ConeGeometry(.11, .09, 8).translate(x, y - .13, 0), '#7F9D82');
      }
    } else if (kind === 'bike') {
      const paint = object.color;
      for (const x of [-.65, .65]) {
        add(new THREE.TorusGeometry(.37, .035, 6, 20).translate(x, .43, 0), '#454C43');
        add(new THREE.TorusGeometry(.32, .012, 4, 20).translate(x, .43, 0), '#B7C0AB');
        for (let spoke = 0; spoke < 8; spoke++) {
          const angle = spoke * Math.PI / 4;
          beam([x, .43, 0], [x + Math.cos(angle) * .32, .43 + Math.sin(angle) * .32, 0], .006, '#B7C0AB');
        }
      }
      for (const [a, b] of [ [[-.65,.43,0],[-.22,.87,0]], [[-.22,.87,0],[0,.4,0]], [[0,.4,0],[-.65,.43,0]],
        [[-.22,.87,0],[.42,.9,0]], [[.42,.9,0],[0,.4,0]], [[.42,.9,0],[.65,.43,0]] ]) beam(a, b, .028, paint);
      beam([-.22,.87,0],[-.27,1.06,0],.021,'#647A71'); box(-.3,1.08,0,.3,.07,.16,'#8A5D40');
      beam([.42,.9,0],[.38,1.19,0],.025,'#B6BDAB'); beam([.38,1.19,-.22],[.38,1.19,.22],.024,'#B6BDAB');
      for (const z of [-.23,.23]) beam([.38,1.19,z],[.26,1.19,z],.034,'#755B40');
      beam([0,.4,-.15],[0,.4,.15],.02,'#56645B'); box(.06,.38,.17,.16,.05,.08,'#48584D');
      beam([-.5,.42,.04],[-.48,.03,.23],.015,'#59694F');
      // Woven rear basket with a rolled ochre towel.
      box(-.68,.96,0,.38,.06,.36,'#A8814D');
      for (let i = 0; i < 5; i++) for (const z of [-.18,.18]) box(-.84+i*.08,1.08,z,.025,.24,.022,'#C1A46B');
      for (const z of [-.18,.18]) beam([-.87,1.2,z],[-.49,1.2,z],.017,'#D5B987');
      add(new THREE.CylinderGeometry(.07,.07,.3,8).rotateZ(Math.PI/2).translate(-.68,1.05,0),'#D9A46C');
    } else if (kind.startsWith('panel:')) {
      const index = Math.max(0, LABELS.indexOf(kind.slice(6))), geometry = new THREE.PlaneGeometry(1.5, 1.5);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + index % 4) / 4, (uv.getY(i) + 1 - Math.floor(index / 4)) / 2);
      add(geometry, '#FFFFFF', 2);
    } else if (kind === 'towel') {
      const cloth = new THREE.PlaneGeometry(.85, 1.7, 6, 9).rotateX(-Math.PI / 2), pos = cloth.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, .035 + Math.sin(pos.getZ(i) * 8) * .018 + (pos.getZ(i) > .55 ? .05 : 0));
      cloth.computeVertexNormals(); add(cloth, object.color);
      for (const z of [-.64,-.57,.57,.64]) box(0,.057,z,.8,.008,.035,'#F4DFB5');
      for (let i = 0; i < 11; i++) for (const z of [-.89,.89]) beam([(i-5)*.073,.033,z],[(i-5)*.073+.013,.026,z+Math.sign(z)*.08],.006,'#E8D2AD');
    }
  }
  for (const { material, parts } of buckets.values()) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere(); const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.castShadow = material === 0; mesh.receiveShadow = true; group.add(mesh);
  }
  return { group, dispose() {
    group.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    materials.forEach(material => material.dispose()); atlas.dispose(); group.removeFromParent(); group.clear();
  } };
}
