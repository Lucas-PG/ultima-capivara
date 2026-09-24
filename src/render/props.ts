import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { terrainHeight } from '../shared/terrain';
import type { WorldSpec } from '../shared/types';

// All small architecture and furniture is built once and merged by 32m cell.
// A distant room can therefore be culled without a draw call for each object.
const cube = new THREE.BoxGeometry(1, 1, 1);
const soft = new RoundedBoxGeometry(1, 1, 1, 2, .09);
const softLite = new RoundedBoxGeometry(1, 1, 1, 1, .07);
const bread = new THREE.SphereGeometry(.5, 12, 8);
const breadScores = [-.15, 0, .15].map(offset => new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(offset - .052, .229, -.092),
    new THREE.Vector3(offset, .263, 0),
    new THREE.Vector3(offset + .052, .229, .092),
  ]), 6, .008, 4, false));
const crescent = new THREE.TorusGeometry(.17, .075, 7, 14, Math.PI * 1.46).rotateX(-Math.PI / 2);
const cupShell = new THREE.CylinderGeometry(.105, .085, .18, 12, 1, true);
const cupRim = new THREE.TorusGeometry(.099, .012, 5, 12).rotateX(-Math.PI / 2);
const cupHandle = new THREE.TorusGeometry(.055, .012, 5, 10);
const panBody = new THREE.CylinderGeometry(.17, .17, .06, 12).rotateZ(Math.PI / 2);
const panInside = new THREE.CircleGeometry(.14, 12).rotateY(Math.PI / 2);
const awningCloth = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, .12, -.5, .5, .12, -.5, -.5, -.12, .5,
    .5, .12, -.5, .5, -.12, .5, -.5, -.12, .5,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0], 2));
  g.computeVertexNormals();
  return g;
})();
const awningScallop = (() => {
  const positions: number[] = [], uvs: number[] = [];
  const heights = [-.14, -.2, -.23, -.2, -.14];
  for (let i = 0; i < 4; i++) {
    const a = -.5 + i * .25, b = a + .25;
    positions.push(a, 0, 0, b, 0, 0, a, heights[i], 0,
      b, 0, 0, b, heights[i + 1], 0, a, heights[i], 0);
    uvs.push(i / 4, 1, (i + 1) / 4, 1, i / 4, 0,
      (i + 1) / 4, 1, (i + 1) / 4, 0, i / 4, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
})();
const awningStrut = (() => {
  const g = new THREE.CylinderGeometry(.035, .035, 1.08, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -.24, .96).normalize()));
  return g;
})();
const ivyLeaf = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, .12, 0, -.09, 0, 0, 0, -.12, 0,
    0, .12, 0, 0, -.12, 0, .09, 0, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([.5, 1, 0, .5, .5, 0,
    .5, 1, .5, 0, 1, .5], 2));
  g.computeVertexNormals();
  return g;
})();
const fishTail = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -.12, 0, 0, .12, 0, 0, 0, .24,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, .5], 2));
  g.computeVertexNormals();
  return g;
})();
const sideHandle = new THREE.TorusGeometry(.085, .016, 5, 10).rotateY(Math.PI / 2);
const round = new THREE.CylinderGeometry(.5, .5, 1, 10);
const tapered = new THREE.CylinderGeometry(.38, .5, 1, 10);
const ball = new THREE.IcosahedronGeometry(.5, 1);
const bud = new THREE.IcosahedronGeometry(.5, 0);
const pennant = (() => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, 0, .5, 0, 0, 0, -1, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, .5, 0], 2));
  geometry.computeVertexNormals();
  return geometry;
})();
const groundRing = new THREE.TorusGeometry(.5, .055, 5, 16).rotateX(-Math.PI / 2);
const roofPalette = ['#b9644b', '#b97655', '#8d7776', '#9e685e'];
const cream = '#f4dfad', wood = '#80563e', dark = '#523d3a', brass = '#d9aa5e';
const roles: Record<string, { name: string; accent: string; pale: string }> = {
  home: { name: '', accent: '#83a49a', pale: '#ded0b4' },
  fisher: { name: 'CASA DO PESCADOR', accent: '#5a9b9b', pale: '#b5d6c9' },
  bakery: { name: 'PADARIA CAPIVARA', accent: '#d6774f', pale: '#f5cb8e' },
  cafe: { name: 'CAFÉ DA VILA', accent: '#4e9e9b', pale: '#b5dad0' },
  workshop: { name: 'OFICINA', accent: '#b66e57', pale: '#e9b48a' },
  tailor: { name: 'ATELIÊ', accent: '#ae829f', pale: '#dfbdd0' },
  clinic: { name: 'POSTO DE SAÚDE', accent: '#70a69a', pale: '#d1e1c9' },
  fishmonger: { name: 'PEIXARIA', accent: '#4f929d', pale: '#a7d4d5' },
  kiosk: { name: 'MERCEARIA', accent: '#cd8452', pale: '#f2d093' },
};
const signRoles = Object.keys(roles).filter(role => roles[role].name);
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

export function buildProps(world: WorldSpec): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const opaque = new Map<string, THREE.BufferGeometry[]>();
  const signs = new Map<string, THREE.BufferGeometry[]>();
  let cell = '';
  const bucket = (map: Map<string, THREE.BufferGeometry[]>) => {
    if (!map.has(cell)) map.set(cell, []);
    return map.get(cell)!;
  };
  const put = (shape: THREE.BufferGeometry, color: string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, rotation = 0) => {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(sx, sy, sz)));
    const tint = new THREE.Color(color);
    const positions = g.getAttribute('position'), normals = g.getAttribute('normal');
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      const vertex = i / 3;
      const side = normals.getY(vertex) > .5 ? 1.065 : normals.getY(vertex) < -.5 ? .87 : .98;
      const grain = 1 + (hash(Math.round(positions.getX(vertex) * 27),
        Math.round((positions.getY(vertex) + positions.getZ(vertex)) * 23)) - .5) * .055;
      colors[i] = tint.r * side * grain;
      colors[i + 1] = tint.g * side * grain;
      colors[i + 2] = tint.b * side * grain;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    bucket(opaque).push(g);
  };
  const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0) =>
    put(cube, color, x, y, z, sx, sy, sz, rotation);
  const cyl = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    put(round, color, x, y, z, sx, sy, sz);
  const orb = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    put(ball, color, x, y, z, sx, sy, sz);
  const plant = (x: number, y: number, z: number, size = 1) => {
    cyl('#c47859', x, y + .2 * size, z, .38 * size, .4 * size, .38 * size);
    cyl('#e2aa72', x, y + .42 * size, z, .41 * size, .055 * size, .41 * size);
    box('#668d65', x, y + .72 * size, z, .08 * size, .58 * size, .08 * size);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, r = .26 * size;
      orb(i % 2 ? '#699d77' : '#8fb77d', x + Math.cos(a) * r, y + (.68 + i % 3 * .11) * size,
        z + Math.sin(a) * r, .53 * size, .42 * size, .32 * size);
    }
    for (let i = 0; i < 3; i++) orb('#efc881', x + (i - 1) * .17 * size, y + .96 * size,
      z + (i % 2 ? .12 : -.1) * size, .1 * size, .1 * size, .1 * size);
  };
  const lamp = (x: number, y: number, z: number) => {
    box(dark, x, y + .3, z, .08, .55, .08);
    box(brass, x, y + .06, z, .22, .08, .22);
    box('#ffe0a0', x, y - .08, z, .17, .25, .17);
    box(brass, x, y - .25, z, .21, .065, .21);
  };
  const jar = (x: number, y: number, z: number, color: string, s = 1) => {
    cyl(color, x, y + .13 * s, z, .22 * s, .26 * s, .22 * s);
    cyl(cream, x, y + .28 * s, z, .19 * s, .045 * s, .19 * s);
  };
  const loaf = (x: number, y: number, z: number, size = 1) => {
    put(bread, '#bb7b43', x, y + .14 * size, z, .56 * size, .3 * size, .35 * size);
    for (const score of breadScores) put(score, '#f2d3a0', x, y, z, size, size, size);
  };
  const pastry = (x: number, y: number, z: number, size = 1) => {
    put(crescent, '#c48a50', x, y + .13 * size, z, size, size, size, -Math.PI / 4);
    orb('#e9bc7b', x - .17 * size, y + .13 * size, z + .07 * size,
      .1 * size, .095 * size, .09 * size);
    orb('#e9bc7b', x + .12 * size, y + .13 * size, z - .12 * size,
      .1 * size, .095 * size, .09 * size);
  };
  const cup = (x: number, y: number, z: number, size = 1, color = '#f0e6d0') => {
    cyl('#d9c9a9', x, y + .014 * size, z, .32 * size, .026 * size, .32 * size);
    put(cupShell, color, x, y + .113 * size, z, size, size, size);
    put(cupRim, '#f8eed5', x, y + .205 * size, z, size, size, size);
    cyl('#5d4235', x, y + .189 * size, z, .154 * size, .016 * size, .154 * size);
    put(cupHandle, color, x + .143 * size, y + .116 * size, z, size, size, size);
  };
  const chalkboard = (x: number, y: number, z: number, accent: string) => {
    box(wood, x, y, z, .09, 1.48, 1.7);
    box('#354b45', x + .055, y, z, .02, 1.31, 1.51);
    box(accent, x + .073, y + .49, z, .016, .035, 1.18);
    for (let i = 0; i < 4; i++) {
      box('#e9d9b1', x + .074, y + .25 - i * .21,
        z + (i % 2 ? -.08 : .05), .017, .024, 1.05 - i * .12);
      box(accent, x + .075, y + .25 - i * .21, z - .61, .017, .052, .08);
    }
  };
  const sign = (label: string, x: number, y: number, z: number, w: number, h: number, rotation = 0) => {
    const index = signRoles.indexOf(label);
    if (index < 0) return;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv');
    const col = index % 4, row = Math.floor(index / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, 1 - (row + 1 - uv.getY(i)) / 2);
    g.rotateY(rotation); g.translate(x, y, z);
    bucket(signs).push(g);
  };
  const house = (x: number, y: number, z: number, w: number, d: number, role: string, paint: string) => {
    const theme = roles[role] || roles.home;
    const variant = hash(x, z), front = z + d / 2, back = z - d / 2;
    const doorX = x - w * .18;
    // Porch, tile threshold and side-wall trim make the building readable at eye level.
    box('#b29c7e', doorX, y + .08, front + .55, 2.35, .16, 1.1);
    for (let i = -2; i <= 2; i++) box('#d4bd94', doorX + i * .43, y + .169, front + .55, .035, .015, .96);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      box(cream, x + sx * (w / 2 - .1), y + 1.45, z + sz * (d / 2 - .1), .21, 2.9, .21);
    for (const side of [-1, 1]) {
      const wallZ = z + side * (d / 2 - .16);
      box('#c5ac8e', x, y + .18, wallZ, w - .25, .2, .055);
      box('#e9d1ac', x, y + 2.82, wallZ, w - .25, .09, .055);
    }
    for (const side of [-1, 1]) {
      const wx = x + side * (w / 2 - .15);
      box('#c5ac8e', wx, y + .18, z, .055, .2, d - .25);
      box('#e9d1ac', wx, y + 2.82, z, .055, .09, d - .25);
      // Interior curtains beside the two side windows.
      for (const dz of [-.62, .62]) {
        box(theme.accent, wx - side * .08, y + 1.62, z + dz, .07, 1.33, .24);
        box(theme.pale, wx - side * .09, y + 1.1, z + dz, .08, .16, .25);
      }
      box(brass, wx - side * .09, y + 2.34, z, .08, .05, 1.58);
    }
    // A readable rug defines the room, with low detail so doorways stay clear.
    box('#f1dfbb', x, y + 2.98, z, w - .38, .045, d - .38);
    for (const xx of [x - w * .27, x + w * .27]) box('#c4a37e', xx, y + 2.94, z, .15, .08, d - .45);
    for (const zz of [z - d * .27, z + d * .27]) box('#c4a37e', x, y + 2.94, zz, w - .45, .08, .15);
    if (role === 'home' || role === 'fisher' || role === 'clinic' || role === 'tailor') {
      box(role === 'clinic' ? '#d4e8d4' : theme.accent, x + .05, y + .095, z + .12, w * .37, .016, d * .36);
      box(cream, x + .05, y + .108, z + .12, w * .32, .009, d * .31);
      for (let i = -2; i <= 2; i++) box(theme.accent, x + i * w * .061, y + .116,
        z + .12, .027, .009, d * .29);
    } else {
      const tiles = role === 'bakery' ? ['#e4d0ad', '#f0dfbf', '#dfcaa8'] : ['#cbd9c9', '#e0e8d9', '#c5d5c8'];
      box(role === 'bakery' ? '#d0bea0' : '#b8c9bb', x, y + .087, z, w - .28, .014, d - .28);
      for (let iz = 0; iz < Math.floor(d - .5); iz++) for (let ix = 0; ix < Math.floor(w - .5); ix++) {
        const px = x - (Math.floor(w - .5) - 1) * .5 + ix;
        const pz = z - (Math.floor(d - .5) - 1) * .5 + iz;
        box(tiles[(ix + iz * 2) % tiles.length], px, y + .097, pz, .97, .017, .97);
      }
    }
    // Ceiling fixture, picture, and shelves add a purpose and a warm focal point.
    cyl(brass, x, y + 2.8, z, .11, .16, .11);
    put(tapered, '#ffd590', x, y + 2.58, z, .56, .34, .56);
    box(dark, x - w / 2 + .19, y + 1.75, z + d * .28, .07, .84, 1.1);
    box(theme.pale, x - w / 2 + .235, y + 1.75, z + d * .28, .025, .66, .91);
    box(theme.accent, x - w / 2 + .255, y + 1.7, z + d * .28, .016, .4, .66);
    for (let shelf = 0; shelf < 3; shelf++) {
      const yy = y + .48 + shelf * .55;
      box(wood, x + w / 2 - .37, yy, z + d * .28, .52, .065, 1.65);
      for (let n = 0; n < 4; n++) jar(x + w / 2 - .38, yy + .04,
        z + d * .28 + (n - 1.5) * .36, [theme.accent, '#e5b97b', '#b1c6aa'][n % 3], .75);
    }
    // Large room fixtures line the side walls; the central lane stays open.
    const rx = x + w * .28, rz = z + d * .11, lx = x - w * .33, lz = z - d * .17;
    if (role === 'home' || role === 'fisher' || role === 'clinic') {
      const bedding = role === 'clinic' ? '#f0e9d9' : theme.pale;
      box(wood, rx, y + .3, rz, 1.61, .45, 1.9);
      put(soft, bedding, rx, y + .55, rz, 1.52, .18, 1.77);
      put(soft, role === 'clinic' ? '#a5cec0' : theme.accent, rx, y + .66, rz + .42, 1.46, .1, .87);
      put(soft, cream, rx, y + .68, rz - .66, 1.24, .13, .35);
      box(wood, rx, y + .59, rz - .95, 1.65, 1.05, .09);
      if (role === 'fisher') for (let i = 0; i < 5; i++)
        box('#d4d2bd', rx - .65 + i * .32, y + .69, rz + .05, .035, .012, 1.24);
      if (role === 'clinic') box('#d5e8dd', rx, y + .75, rz, 1.55, .018, .52);
    } else {
      box(wood, rx, y + .46, rz, 1.32, .85, 1.38);
      put(soft, theme.pale, rx, y + .91, rz, 1.36, .075, 1.43);
      if (role === 'bakery' || role === 'cafe' || role === 'fishmonger' || role === 'kiosk') {
        for (let i = 0; i < 6; i++) {
          const gx = rx + (i % 3 - 1) * .35, gz = rz + (Math.floor(i / 3) - .5) * .56;
          if (role === 'fishmonger') {
            orb('#9fbfc0', gx, y + .99, gz, .32, .11, .17);
            orb('#d5e4d9', gx + .13, y + .99, gz, .11, .12, .12);
          } else if (role === 'bakery') i % 2 ? pastry(gx, y + 1.21, gz, .76) : loaf(gx, y + 1.21, gz, .77);
          else if (role === 'cafe') cup(gx, y + .94, gz, .72);
          else jar(gx, y + .93, gz, i % 2 ? '#b76b55' : '#dfc17d', .83);
        }
      } else if (role === 'workshop') {
        box('#5f6c6b', rx, y + .94, rz, .85, .08, .32);
        for (let i = 0; i < 3; i++) box('#bac6b5', rx + (i - 1) * .34, y + 1.02, rz, .05, .19, .34);
      } else if (role === 'tailor') {
        box('#e9e3d4', rx, y + .95, rz, .48, .24, .36);
        box(dark, rx + .16, y + 1.09, rz, .055, .22, .2);
        for (let i = 0; i < 3; i++) cyl(['#a86782', '#e0b98a', '#7caaa5'][i], rx + (i - 1) * .35,
          y + 1.01, rz + .42, .24, .15, .24);
      }
    }
    box(wood, lx, y + .45, lz, .83, .83, 1.8);
    put(soft, theme.pale, lx, y + .89, lz, .87, .065, 1.86);
    for (let i = 0; i < 3; i++) {
      const yy = y + .32 + i * .18;
      box('#674b3b', lx + .45, yy, lz, .024, .13, 1.63);
      for (const dz of [-.42, .42]) box(brass, lx + .477, yy, lz + dz, .025, .034, .13);
    }
    if (role === 'bakery' || role === 'cafe' || role === 'fishmonger' || role === 'kiosk') {
      for (let i = 0; i < 4; i++) jar(lx, y + .92, lz + (i - 1.5) * .42,
        role === 'fishmonger' ? '#a6c8c1' : '#c98460', .72);
    } else if (role === 'workshop') {
      for (let i = 0; i < 4; i++) box('#777d79', lx + .09, y + .95, lz + (i - 1.5) * .38,
        .15, .08, .04, i * .17);
    } else if (role === 'tailor') {
      for (let i = 0; i < 4; i++) cyl(['#c87f70', '#85a79d', '#e0bd8d', '#aa829e'][i],
        lx, y + 1.02, lz + (i - 1.5) * .4, .24, .17, .24);
    } else for (let i = 0; i < 3; i++) jar(lx, y + .92, lz + (i - 1) * .48, '#9aab85', .8);
    if (role === 'bakery') {
      // Clay oven in the right rear corner, with a dark firebox, brick voussoir,
      // chimney, flour sacks and kneading tools. It occupies a matching collider.
      const ox = x + w / 2 - .83, oz = z - d * .24;
      box('#a8644c', ox, y + 1.04, oz, 1.32, 2.06, 1.91);
      box('#d68c60', ox - .69, y + 1.04, oz, .085, 2.1, 1.95);
      box('#3b3430', ox - .75, y + .96, oz, .031, .92, 1.13);
      box('#d99b69', ox - .78, y + 1.53, oz, .075, .21, 1.41);
      for (const dz of [-.72, .72]) box('#e7b07c', ox - .79, y + 1.04, oz + dz, .075, 1.18, .16);
      for (let row = 0; row < 6; row++) for (let col = -1; col <= 1; col++) {
        const zz = oz + col * .58 + (row % 2 ? .15 : 0);
        if (Math.abs(zz - oz) > .91) continue;
        const yy = y + .25 + row * .29;
        if (yy < y + 1.52 && Math.abs(zz - oz) < .58) continue;
        box(row % 2 ? '#e6a675' : '#c77b57', ox - .79, yy, zz, .086, .22, .49);
      }
      box('#f2b463', ox - .77, y + .58, oz, .036, .3, .7);
      orb('#ffd283', ox - .78, y + .69, oz - .2, .14, .35, .19);
      orb('#e58d4d', ox - .79, y + .68, oz + .2, .16, .29, .17);
      box('#bb7254', ox, y + 2.43, oz, .67, .93, .68);
      box('#efbf8a', ox, y + 2.85, oz, .84, .1, .84);
      for (const [sx, sz] of [[ox - 1.1, oz - .52], [ox - 1.1, oz + .33]] as const) {
        orb('#ede0be', sx, y + .31, sz, .58, .61, .5);
        orb('#e2cfaa', sx, y + .61, sz, .31, .13, .28);
        cyl('#b79b78', sx, y + .55, sz, .3, .025, .27);
      }
      // Open bread shelves sit between the back window and doorway.
      const rackX = x - .16, rackZ = back + .35;
      for (const xx of [rackX - .68, rackX + .68]) box(wood, xx, y + 1.55, rackZ, .1, 2.2, .48);
      for (let level = 0; level < 4; level++) {
        const yy = y + .56 + level * .47;
        put(soft, '#ab7953', rackX, yy, rackZ, 1.48, .09, .55);
        for (let n = 0; n < 3; n++) {
          const bx = rackX + (n - 1) * .4;
          if ((level + n) % 3 === 0) pastry(bx, yy + .055, rackZ, .83);
          else loaf(bx, yy + .055, rackZ, .83);
        }
      }
      // A menu and hanging copper tools make the left counter an actual bakery.
      chalkboard(x - w / 2 + .24, y + 1.78, z + d * .24, '#e3ba76');
      box(wood, lx, y + 2.32, lz, .45, .07, 1.82);
      for (let i = 0; i < 4; i++) {
        const zz = lz + (i - 1.5) * .4;
        box('#bd9063', lx, y + 2.09, zz, .035, .36, .035);
        put(panBody, i % 2 ? '#b67b50' : '#d0a16a', lx, y + 1.79, zz, 1, 1, 1);
        put(panInside, '#6f5847', lx + .036, y + 1.79, zz, 1, 1, 1);
        box(brass, lx + .04, y + 2.18, zz, .08, .03, .08);
      }
      for (let i = 0; i < 5; i++) {
        const zz = lz + (i - 2) * .31;
        if (i % 2) pastry(lx + .12, y + .94, zz, .7);
        else loaf(lx + .12, y + .94, zz, .7);
      }
      // Open pastry stand with tiered trays and narrow brass uprights.
      box('#e9c99b', rx, y + 1.17, rz, 1.28, .07, 1.31);
      for (const dx of [-.55, .55]) for (const dz of [-.53, .53])
        box(brass, rx + dx, y + 1.43, rz + dz, .045, .43, .045);
      box('#d0a678', rx, y + 1.69, rz, 1.32, .07, 1.39);
      for (let i = 0; i < 6; i++) {
        const bx = rx + (i % 3 - 1) * .33, bz = rz + (Math.floor(i / 3) - .5) * .55;
        if (i % 2) pastry(bx, y + 1.73, bz, .57);
        else loaf(bx, y + 1.73, bz, .57);
      }
    }
    if (role === 'cafe') {
      chalkboard(x - w / 2 + .24, y + 1.77, z + d * .26, '#8dc1ad');
      // Compact espresso station at the service counter with copper boiler,
      // portafilter and stacked cups.
      box('#72928a', lx, y + 1.22, lz - .38, .61, .57, .57);
      cyl('#c89b6c', lx, y + 1.61, lz - .38, .35, .29, .35);
      box('#e6c58f', lx + .31, y + 1.25, lz - .38, .38, .07, .07);
      box('#414d4b', lx + .38, y + 1.04, lz - .38, .06, .34, .09);
      for (let i = 0; i < 4; i++) {
        const zz = lz + .17 + i * .26;
        cup(lx + .05, y + .94, zz, .69, i % 2 ? '#f1e8d4' : '#bad9d0');
      }
      const tx = x - w * .12, tz = z - d * .12;
      cyl(wood, tx, y + .43, tz, .13, .77, .13);
      cyl('#bf8a61', tx, y + .8, tz, 1.06, .09, 1.06);
      cyl('#e8d2a9', tx, y + .86, tz, .79, .025, .79);
      for (const dz of [-.83, .83]) {
        const cz = tz + dz;
        box(wood, tx, y + .42, cz, .65, .08, .55);
        for (const dx of [-.23, .23]) box(wood, tx + dx, y + .23, cz, .08, .46, .08);
        box(theme.accent, tx, y + .7, cz + Math.sign(dz) * .24, .65, .58, .08);
      }
      cup(tx, y + .87, tz, 1.05);
      pastry(tx + .31, y + .88, tz, .66);
      // Wall shelf of cups and coffee tins behind the counter.
      for (let level = 0; level < 2; level++) {
        const yy = y + 1.81 + level * .42;
        box(wood, lx, yy, lz + .17, .51, .065, 1.85);
        for (let i = 0; i < 5; i++) cup(lx, yy + .04,
          lz + (i - 2) * .35 + .17, .65, i % 2 ? '#eee4d0' : '#d3ae7d');
      }
      for (let i = 0; i < 4; i++) pastry(rx + (i % 2 ? .28 : -.28), y + .98,
        rz + (i < 2 ? -.29 : .29), .55);
    }
    if (role === 'workshop') {
      const wx = x + w / 2 - .24, wz = z - d * .23;
      box('#795c46', wx, y + 1.71, wz, .07, 1.48, 1.9);
      box('#d5aa73', wx - .045, y + 1.71, wz, .025, 1.36, 1.76);
      for (let i = 0; i < 7; i++) {
        const zz = wz + (i - 3) * .25;
        box('#606b6c', wx - .078, y + 2.15 - (i % 3) * .23, zz,
          .02, .31 + i % 2 * .14, .052, i * .09);
        cyl('#c6935d', lx + .04, y + 1.01, lz + (i - 3) * .24,
          .11, .17, .11);
      }
      box('#a2b6ae', rx, y + 1.02, rz, .75, .07, .46);
      box('#d2bc8c', rx - .33, y + 1.21, rz, .08, .4, .13);
      box('#586667', rx + .32, y + 1.15, rz, .14, .27, .14);
      for (let i = 0; i < 3; i++) {
        const px = x + w * .34, pz = z + d * .29 + (i - 1) * .45;
        cyl('#3f4b49', px, y + .22, pz, .52, .15, .52);
        cyl('#c6bda3', px, y + .23, pz, .18, .16, .18);
      }
    }
    if (role === 'tailor') {
      const mx = x + w * .37, mz = z - d * .27;
      cyl('#9c7055', mx, y + .7, mz, .08, 1.38, .08);
      cyl('#8b654f', mx, y + .08, mz, .57, .1, .57);
      put(soft, '#dcc4a4', mx, y + 1.45, mz, .54, .86, .42);
      orb('#dbbea0', mx, y + 2.02, mz, .32, .37, .29);
      box('#ba819b', mx, y + 1.21, mz + .25, .42, .6, .035);
      for (let i = 0; i < 3; i++) {
        const zz = z + (i - 1) * .5;
        box(['#b67d91', '#7fa59d', '#ddb781'][i], x - w / 2 + .24,
          y + 1.72, zz, .11, 1.37, .4);
        cyl('#d1aa74', lx, y + 1.01, lz + (i - 1) * .52, .21, .27, .21);
      }
      box(brass, x - w / 2 + .24, y + 2.47, z, .08, .055, 1.96);
      box('#ece6d8', rx, y + 1.17, rz, .48, .18, .38);
      box('#5a5c58', rx + .14, y + 1.32, rz, .045, .23, .19);
    }
    if (role === 'clinic') {
      const cx = x + w / 2 - .22, cz = z - d * .25;
      box('#f1e7d1', cx, y + 1.69, cz, .09, 1.28, 1.35);
      box('#8bb5a3', cx - .06, y + 1.69, cz, .02, 1.1, 1.17);
      for (let i = 0; i < 3; i++) {
        box('#e4e8d6', cx - .075, y + 1.31 + i * .36, cz, .017, .045, 1.03);
        for (const dz of [-.37, .02, .37]) jar(cx - .15, y + 1.34 + i * .36,
          cz + dz, i % 2 ? '#abc9a5' : '#d4b778', .53);
      }
      box('#e8f0df', x - w / 2 + .25, y + 2.12, z + d * .25, .06, .74, .74);
      box('#6fa991', x - w / 2 + .29, y + 2.12, z + d * .25, .025, .57, .18);
      box('#6fa991', x - w / 2 + .3, y + 2.12, z + d * .25, .025, .18, .57);
      box('#6f8277', rx, y + 1.81, rz - .71, .09, 1.4, .09);
      box('#d7e5d1', rx, y + 2.43, rz - .71, .54, .2, .5);
    }
    if (role === 'fisher' || role === 'fishmonger') {
      const nx = x + w / 2 - .22, nz = z - d * .28;
      box('#a77e5f', nx, y + 1.94, nz, .07, 1.63, 1.88);
      for (let i = -3; i <= 3; i++) {
        box('#e5d0a5', nx - .055, y + 1.25 + (i + 3) * .23, nz,
          .017, .018, 1.7);
        box('#e5d0a5', nx - .055, y + 1.95, nz + i * .26,
          .017, 1.34, .018);
      }
      for (let i = 0; i < 4; i++) orb(i % 2 ? '#e6bc70' : '#c38364',
        nx - .11, y + 1.18 + i * .36, nz - .78 + i * .47, .17, .17, .17);
      if (role === 'fishmonger') {
        box('#d6c9a2', lx, y + .98, lz, .61, .055, 1.49);
        for (let i = 0; i < 4; i++) {
          const zz = lz + (i - 1.5) * .35;
          orb('#9bc0c0', lx + .05, y + 1.05, zz, .39, .12, .22);
          orb('#d5e4d6', lx + .08, y + 1.06, zz + .16, .13, .13, .13);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const zz = z - d * .3 + i * .38;
          box('#a78159', x - w / 2 + .25, y + 1.66, zz, .07, 1.67, .035, -.11);
          orb('#dfb577', x - w / 2 + .35, y + 1.06 + i * .22, zz,
            .2, .2, .2);
        }
      }
    }
    if (role === 'kiosk') {
      const fx = x + w / 2 - .65, fz = z - d * .25;
      box('#b7d6ce', fx, y + 1.1, fz, 1.1, 2.1, 1.29);
      box('#648e90', fx - .57, y + 1.17, fz, .055, 1.86, 1.12);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const zz = fz + (col - 1) * .36;
        cyl(['#cd7656', '#e6b45f', '#779d7c'][col], fx - .61,
          y + .59 + row * .47, zz, .18, .32, .18);
      }
      for (let i = 0; i < 6; i++) jar(lx, y + .93, lz + (i - 2.5) * .3,
        i % 2 ? '#b87459' : '#d6b970', .7);
    }
    // Shop canvas and projecting pictograms make each trade legible when
    // approaching from either side of the street. Folded shutters and ivy
    // stay on plaster beside openings rather than covering the glass.
    if (theme.name) {
      const windowX = x + w * .25;
      for (let i = -4; i <= 4; i++) {
        const stripe = i % 2 ? theme.pale : theme.accent;
        put(awningCloth, stripe, windowX + i * .245, y + 2.53,
          front + .56, .247, 1, 1.08);
        put(awningScallop, stripe, windowX + i * .245,
          y + 2.4, front + 1.11, .247, 1, 1);
      }
      box(brass, windowX, y + 2.62, front + .04, 2.26, .05, .06);
      box(wood, windowX, y + 2.4, front + 1.12, 2.24, .045, .055);
      for (const dx of [-.96, .96]) put(awningStrut, wood,
        windowX + dx, y + 2.55, front + .55, 1, 1, 1);
      box(wood, doorX, y + 2.8, front + .82, 3.35, .42, .12);
      box(cream, doorX, y + 2.8, front + .886, 3.18, .35, .026);
      sign(role, doorX, y + 2.8, front + .905, 3.08, .31);
      // The courtyard approaches the rear of this row: both public entrances
      // should identify the shop without asking players to circle the arena edge.
      const rearDoor = x + w * .2;
      box(wood, rearDoor, y + 2.8, back - .82, 3.35, .42, .12);
      box(cream, rearDoor, y + 2.8, back - .886, 3.18, .35, .026);
      sign(role, rearDoor, y + 2.8, back - .905, 3.08, .31, Math.PI);
      const emblemX = doorX + 1.23, emblemZ = front + .8;
      box(wood, emblemX, y + 2.66, front + .52, .075, .075, .67);
      box(brass, emblemX, y + 2.66, emblemZ, .11, .14, .12);
      put(softLite, theme.accent, emblemX, y + 2.14, emblemZ, .12, .73, .72);
      box(cream, emblemX + .068, y + 2.14, emblemZ, .016, .62, .61);
      if (role === 'bakery') {
        orb('#c48652', emblemX + .09, y + 2.15, emblemZ, .07, .31, .42);
        for (let i = -1; i <= 1; i++) box('#f6d8a4', emblemX + .132,
          y + 2.15 + i * .1, emblemZ, .014, .025, .25, .32);
      } else if (role === 'cafe') {
        box('#f2e9cf', emblemX + .09, y + 2.1, emblemZ - .04, .07, .26, .29);
        box('#684d3e', emblemX + .135, y + 2.245, emblemZ - .04, .012, .03, .23);
        put(sideHandle, '#f2e9cf', emblemX + .126, y + 2.12,
          emblemZ + .18, 1, 1, 1);
        box(brass, emblemX + .09, y + 1.94, emblemZ - .04, .08, .03, .4);
      } else if (role === 'fisher' || role === 'fishmonger') {
        orb('#73aeb3', emblemX + .095, y + 2.16, emblemZ - .04, .075, .25, .34);
        put(fishTail, '#73aeb3', emblemX + .1, y + 2.16,
          emblemZ + .12, 1, 1, 1);
        orb('#344d4c', emblemX + .145, y + 2.22, emblemZ - .15, .018, .035, .035);
      } else if (role === 'clinic') {
        box('#78ac91', emblemX + .09, y + 2.14, emblemZ, .04, .43, .13);
        box('#78ac91', emblemX + .091, y + 2.14, emblemZ, .04, .13, .43);
      } else if (role === 'tailor') {
        for (const dz of [-.11, .11]) {
          box('#ad7594', emblemX + .095, y + 2.12, emblemZ + dz,
            .035, .39, .04, dz < 0 ? -.25 : .25);
          orb(brass, emblemX + .12, y + 2.3, emblemZ + dz, .035, .11, .1);
        }
      } else if (role === 'workshop') {
        box('#6d7770', emblemX + .09, y + 2.16, emblemZ, .05, .42, .07, -.28);
        orb('#8e9790', emblemX + .11, y + 2.33, emblemZ - .1, .05, .14, .14);
      } else {
        orb('#dcaa63', emblemX + .09, y + 2.1, emblemZ, .09, .3, .3);
        box('#739768', emblemX + .12, y + 2.35, emblemZ, .035, .16, .21, .3);
      }
    } else {
      for (let i = 0; i < 4; i++) orb(i % 2 ? '#6f9c75' : '#8bb67b',
        x + w * .25 + (i - 1.5) * .33, y + .98 + i % 2 * .12, front + .28, .38, .27, .28);
    }
    const frontWindowX = x + w * .25;
    if (!theme.name && variant > .55) for (const side of [-1, 1]) {
      const sx = frontWindowX + side * 1.03;
      box(theme.accent, sx, y + 1.53, front + .21, .44, 1.32, .085);
      box(wood, sx, y + 1.53, front + .267, .38, 1.27, .026);
      for (let slat = 0; slat < 6; slat++) box(theme.pale, sx,
        y + 1.04 + slat * .18, front + .289, .33, .026, .016);
      box(brass, sx + side * -.11, y + 1.5, front + .317, .04, .09, .026);
    }
    if (!theme.name && variant <= .75 || role === 'fisher') {
      const vineX = frontWindowX + 1.31, vineZ = front + .28;
      for (let branch = 0; branch < 3; branch++) {
        const bx = vineX + (branch - 1) * .16;
        box('#6c9069', bx, y + 1.78, vineZ, .025, 1.22, .025);
        for (let i = 0; i < 5; i++) {
          const side = (i + branch) % 2 ? 1 : -1;
          const yy = y + 1.25 + i * .26;
          box('#6c9069', bx + side * .075, yy, vineZ + .012,
            .15, .02, .02, side * .33);
          put(ivyLeaf, i % 3 ? '#84aa72' : '#b0c785',
            bx + side * .15, yy, vineZ + .02, 1.1, 1.1, 1, side * .2);
          if ((i + branch) % 4 === 0) put(bud, '#eeaa83', bx + side * .18,
            yy + .07, vineZ + .04, .08, .08, .075);
        }
      }
    }
    put(softLite, '#9b6c4b', frontWindowX, y + .87, front + .26, 1.58, .2, .4);
    for (const side of [-1, 1]) {
      const sx = frontWindowX + side * .66;
      box(wood, sx, y + .67, front + .19, .08, .28, .24);
      box(brass, sx, y + .94, front + .26, .12, .025, .4);
    }
    for (const px of [x - w / 2 + .54, x + w / 2 - .54]) plant(px, y, front + .48, .75);
    // A small roof chimney and ceramic cap give each home a unique skyline.
    const chimneyX = x + (variant > .5 ? -.28 : .27) * w;
    box(roofPalette[Math.floor(variant * roofPalette.length)], chimneyX, y + 3.67,
      z - d * .17, .74, 1.23, .72);
    box('#edc49a', chimneyX, y + 4.31, z - d * .17, .91, .11, .89);
    for (let i = 0; i < 3; i++) box(cream, chimneyX - .25 + i * .25,
      y + 3.8, z - d * .17 + .37, .06, .36, .025);
    // Colored plaster inset, wall brackets and a door lamp give close-range detail.
    box(theme.accent, doorX - 1.31, y + 1.74, front + .19, .3, .59, .08);
    box(brass, doorX - 1.31, y + 2.13, front + .29, .47, .045, .27);
    lamp(doorX - 1.31, y + 1.89, front + .47);
    box(paint, x + w / 2 + .16, y + 2.39, z - d * .28, .08, .45, 1.07);
    box(theme.accent, x + w / 2 + .21, y + 2.39, z - d * .28, .025, .31, .92);
  };
  const street = (x: number, y: number, z: number, kind: string) => {
    if (kind === 'alley') {
      // Small uneven stone sets and overhead fabric pull the two side lanes
      // into the court without creating an invisible movement obstruction.
      for (let row = -13; row <= 13; row++) for (let col = -2; col <= 2; col++) {
        const px = x + col * .56 + (row % 2 ? .25 : 0), pz = z + row * .82;
        const tint = ['#d0b48c', '#e0c99f', '#bda381', '#e8d2a9'][Math.floor(hash(col * 9, row * 13) * 4)];
        box(tint, px, terrainHeight(px, pz) + .073, pz, .5, .045, .7);
      }
      for (const end of [-1, 1]) {
        const zz = z + end * 9;
        box(wood, x, y + 3.9, zz, 5.2, .025, .025);
        for (let i = -4; i <= 4; i++) put(pennant,
          ['#c97964', '#e2bd7f', '#80a9a1'][Math.abs(i) % 3],
          x + i * .55, y + 3.87, zz, .38, .41, 1);
        for (const side of [-1, 1]) {
          const bx = x + side * 2.5;
          box('#86634c', bx, y + 2.15, zz, .1, .12, .48);
          lamp(bx - side * .1, y + 2.05, zz);
        }
      }
      return;
    }
    if (kind === 'harbor') {
      for (let row = -5; row <= 5; row++) for (let col = -12; col <= 12; col++) {
        const px = x + col, pz = z + row * 1.04;
        const tint = (row + col) % 4 === 0 ? '#bba17d' : '#d2b48d';
        box(tint, px, terrainHeight(px, pz) + .055, pz, .91, .035, .91);
      }
      for (const [dx, dz] of [[-8, -3.8], [-3, 3.6], [4, -3.7]] as const) {
        const px = x + dx, pz = z + dz, py = terrainHeight(px, pz);
        box(wood, px, py + .26, pz, 1.6, .48, 1.06);
        for (let i = 0; i < 4; i++) orb(i % 2 ? '#a6c9c5' : '#79a8af',
          px + (i % 2 ? .35 : -.35), py + .55, pz + (i < 2 ? -.2 : .2), .43, .13, .21);
        put(groundRing, '#dbbf8d', px + 1.17, py + .11, pz, .63, .63, .63);
        put(groundRing, '#ebd4a1', px + 1.17, py + .16, pz, .51, .51, .51);
      }
      // Harbor bollards and painted edge stakes lead toward the pier.
      for (const dx of [-11, -6, 0, 7]) {
        const px = x + dx, pz = z - 5.3, py = terrainHeight(px, pz);
        cyl('#668387', px, py + .4, pz, .38, .8, .38);
        cyl(cream, px, py + .78, pz, .49, .08, .49);
      }
      return;
    }
    if (kind === 'forecourt') {
      for (let row = -4; row <= 4; row++) for (let col = -9; col <= 9; col++) {
        const px = x + col, pz = z + row * 1.08;
        box((row + col) % 5 === 0 ? '#d7b58a' : '#e8d1a7', px,
          terrainHeight(px, pz) + .056, pz, .94, .037, 1.02);
      }
      for (const dx of [-5.8, 2.1]) for (const dz of [-2.9, 2.9])
        box('#f3dfb4', x + dx, terrainHeight(x + dx, z + dz) + .092,
          z + dz, 2.8, .015, .1);
      for (const dx of [-4, 4]) {
        const px = x + dx, pz = z + 4.5, py = terrainHeight(px, pz);
        box('#c46b50', px, py + .29, pz, .34, .58, .34);
        put(tapered, '#e7c48b', px, py + .65, pz, .48, .2, .48);
      }
      return;
    }
    if (kind === 'plaza') {
      // Hand-laid paving traces the court without covering its playable routes.
      const shades = ['#d8c8aa', '#e3d3b5', '#d5c4a6', '#deceb0'];
      cyl('#b9ab8e', x, y + .04, z, 17.5, .025, 17.5);
      for (let iz = -8; iz <= 8; iz++) for (let ix = -9; ix <= 9; ix++) {
        const px = x + ix * .88 + (iz % 2 ? .39 : 0), pz = z + iz * .88;
        const radius = Math.hypot(px - x, pz - z);
        if (radius < 3 || radius > 8.7 || Math.abs(px - x) > 8.7) continue;
        const v = hash(ix * 7, iz * 13), tone = shades[Math.floor(v * shades.length)];
        box(tone, px, terrainHeight(px, pz) + .064, pz, .85, .047, .85,
          (v - .5) * .012);
      }
      // The turquoise octagonal basin and its capybara sculpture are visible
      // from each approach and double as solid, waist-high combat cover.
      cyl('#987e65', x, y + .43, z, 4.6, .85, 4.6);
      cyl('#e9d0a3', x, y + .91, z, 4.85, .19, 4.85);
      cyl('#557d80', x, y + .98, z, 3.95, .045, 3.95);
      cyl('#7fc1ba', x, y + 1.01, z, 3.7, .03, 3.7);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, px = x + Math.cos(a) * 2.25, pz = z + Math.sin(a) * 2.25;
        box(i % 3 ? '#f0d8ad' : '#d2ac83', px, y + 1.04, pz, 1.13, .17, .36, -a + Math.PI / 2);
      }
      cyl('#d9b58b', x, y + 1.24, z, 1.4, .46, 1.4);
      cyl('#c68c6a', x, y + 1.57, z, .92, .28, .92);
      orb('#be8663', x, y + 2.09, z, 1.37, .9, .91);
      orb('#c89471', x, y + 2.37, z + .48, .8, .68, .68);
      orb('#dbac84', x, y + 2.26, z + .79, .65, .39, .34);
      for (const dx of [-.28, .28]) {
        orb('#a56f57', x + dx, y + 2.67, z + .26, .19, .22, .17);
        orb('#342e31', x + dx, y + 2.46, z + .76, .085, .085, .08);
      }
      orb('#7b5243', x, y + 2.25, z + .96, .12, .09, .07);
      for (const dx of [-.46, .46]) for (const dz of [-.29, .35])
        box('#ab7459', x + dx, y + 1.73, z + dz, .24, .34, .22);
      // Garden beds, clipped shrubs and warm lamps frame the fountain.
      for (const [dx, dz] of [[-6.5, -5.6], [6.6, -5.3], [6.5, 5.2], [-6.7, 5.4]] as const) {
        const px = x + dx, pz = z + dz, py = terrainHeight(px, pz);
        box('#ba825b', px, py + .25, pz, 2.2, .48, 1.1);
        box('#6c835f', px, py + .53, pz, 2.06, .08, .94);
        for (let j = 0; j < 5; j++) {
          const fx = px + (j - 2) * .38;
          orb(j % 2 ? '#8caf76' : '#608d6e', fx, py + .74, pz, .43, .42, .45);
          orb(['#f1c675', '#ec9681', '#f2dfad'][j % 3], fx + .07, py + .99,
            pz + (j % 2 ? -.1 : .1), .14, .14, .14);
        }
      }
      // Festoon lines remain above sight and movement, with cloth pennants
      // pointing players from the square toward its side alleys.
      for (const zz of [-5.2, 5.2]) {
        box('#856750', x, y + 4.14, z + zz, 17.4, .03, .03);
        for (let i = -11; i <= 11; i++) {
          const px = x + i * .71;
          put(pennant, ['#d9876c', '#e4bc73', '#7dada0', '#b488a0'][Math.abs(i) % 4],
            px, y + 4.11, z + zz, .49, .49 + Math.abs(i) * .008, 1);
          if (i % 3 === 0) orb('#ffdb99', px, y + 4.13, z + zz, .085, .085, .085);
        }
      }
      return;
    }
    if (kind === 'planter') {
      box('#c28a60', x, y + .37, z, 1.34, .73, 1.34);
      box('#e9bd84', x, y + .77, z, 1.46, .09, 1.46);
      for (const [dx, dz] of [[-.37, -.3], [.32, -.3], [-.13, .34], [.39, .3]] as const)
        plant(x + dx, y + .74, z + dz, .53);
      return;
    }
    if (kind === 'bench') {
      for (const dx of [-.9, .9]) for (const dz of [-.31, .31]) box(dark, x + dx, y + .39, z + dz, .1, .78, .12);
      box('#a96d49', x, y + .79, z, 2.08, .11, .82);
      box('#bc875a', x, y + 1.13, z - .35, 2.08, .65, .1);
      for (const dx of [-.65, .65]) box(brass, x + dx, y + .85, z + .18, .13, .02, .62);
      return;
    }
    if (kind === 'cart') {
      box(wood, x, y + .73, z, 1.77, .2, 1.05);
      box('#b98353', x, y + .96, z, 1.82, .25, 1.1);
      for (const dx of [-.69, .69]) for (const dz of [-.4, .4])
        cyl('#504848', x + dx, y + .3, z + dz, .45, .17, .45);
      box(dark, x - 1.07, y + .92, z, .13, .13, 1.1);
      for (let i = 0; i < 8; i++) orb(i % 3 ? '#dfab58' : '#82a06a',
        x + (i % 4 - 1.5) * .38, y + 1.16, z + (Math.floor(i / 4) - .5) * .44,
        .33, .27, .28);
      return;
    }
    if (kind.startsWith('stall:')) {
      const fish = kind.endsWith('fish'), fabric = fish ? '#6baeb1' : '#df936b';
      for (const dx of [-1.65, 1.65]) for (const dz of [-1.05, 1.05])
        box(wood, x + dx, y + 1.36, z + dz, .12, 2.72, .12);
      box(fabric, x, y + 2.72, z, 3.58, .09, 2.28);
      for (let i = 0; i < 7; i++) box(i % 2 ? cream : fabric,
        x + (i - 3) * .5, y + 2.56, z + 1.08, .5, .29, .08);
      box(wood, x, y + .84, z, 2.45, .14, 1.16);
      for (const dx of [-1.08, 1.08]) box(dark, x + dx, y + .43, z, .12, .84, .9);
      for (let i = 0; i < 8; i++) {
        const gx = x + (i % 4 - 1.5) * .51, gz = z + (Math.floor(i / 4) - .5) * .45;
        if (fish) {
          orb('#c4ddd3', gx, y + .99, gz, .38, .11, .18);
          orb('#77a5ad', gx + .15, y + .99, gz, .12, .12, .1);
        } else orb(i % 3 ? '#e2b761' : '#a3bb76', gx, y + 1.02, gz, .31, .31, .31);
      }
      box(fish ? '#8abcc1' : '#a9be83', x, y + 1.37, z - .98, 1.08, .46, .14);
    }
  };

  for (const object of world.objects) {
    if (!object.detail?.startsWith('prop:') && object.detail !== 'crate') continue;
    const { x, y, z } = object.pos;
    cell = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
    if (object.detail === 'crate') {
      const sx = object.scale.x, sy = object.scale.y, sz = object.scale.z;
      for (const level of [-.28, .28]) {
        box('#bc8b5d', x, y + level * sy, z + sz * .507, sx * .94, .09, .035);
        box('#bc8b5d', x + sx * .507, y + level * sy, z, .035, .09, sz * .94);
      }
      for (const dx of [-.42, .42]) box('#d0a370', x + dx * sx, y, z + sz * .51, .09, sy * .88, .035);
      for (const dz of [-.42, .42]) box('#d0a370', x + sx * .51, y, z + dz * sz, .035, sy * .88, .09);
      box('#d5a677', x, y + sy * .507, z, sx * .93, .035, sz * .93);
      continue;
    }
    const [, type, role] = object.detail.split(':');
    if (type === 'house') house(x, y, z, object.scale.x, object.scale.z, role, object.color);
    else street(x, y, z, `${type}${role ? `:${role}` : ''}`);
  }

  const disposables: { dispose(): void }[] = [];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, metalness: 0, side: THREE.DoubleSide });
  material.shadowSide = THREE.BackSide;
  disposables.push(material);
  for (const geometries of opaque.values()) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) throw new Error('Could not batch world props');
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(merged);
  }
  if (signs.size) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 152;
    const context = canvas.getContext('2d')!;
    for (let i = 0; i < signRoles.length; i++) {
      const role = signRoles[i], theme = roles[role], x = i % 4 * 512, y = Math.floor(i / 4) * 76;
      context.fillStyle = '#f8eac5'; context.fillRect(x, y, 512, 76);
      context.fillStyle = theme.accent; context.fillRect(x + 7, y + 7, 498, 62);
      context.fillStyle = '#fff6db'; context.font = `bold ${theme.name.length > 15 ? 35 : 39}px Georgia, serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(theme.name, x + 256, y + 39, 476);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    disposables.push(texture, signMaterial);
    for (const geometries of signs.values()) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!merged) throw new Error('Could not batch storefront signs');
      merged.computeBoundingSphere();
      group.add(new THREE.Mesh(merged, signMaterial));
      disposables.push(merged);
    }
  }
  return { group, dispose: () => disposables.forEach(value => value.dispose()) };
}
