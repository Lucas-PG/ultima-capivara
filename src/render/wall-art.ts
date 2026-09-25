import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldSpec } from '../shared/types';

// Original painted menus and ceramic patterns share one atlas and one draw per
// village cell. They remain sharp at walking distance without extra lights.
export function buildWallArt(world: WorldSpec) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  for (let index = 0; index < 2; index++) {
    ctx.save(); ctx.translate(index * 512, 0);
    ctx.fillStyle = index ? '#234f49' : '#33463b'; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#d5be83'; ctx.lineWidth = 2; ctx.strokeRect(17, 17, 478, 478);
    // Quiet chalk dust and hand-drawn border marks add texture without noise.
    for (let n = 0; n < 1600; n++) {
      ctx.fillStyle = `rgba(240,229,192,${.02 + (n % 5) * .006})`;
      ctx.fillRect((n * 73.17) % 512, (n * 131.73) % 512, 1 + n % 3, 1);
    }
    ctx.fillStyle = '#f2ddb0';
    if (index) {
      ctx.fillRect(211, 58, 80, 51);
      ctx.strokeStyle = '#f2ddb0'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(296, 77, 23, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillRect(196, 114, 120, 7);
    } else {
      ctx.beginPath(); ctx.ellipse(256, 98, 100, 45, 0, Math.PI, 0); ctx.lineTo(356, 108);
      ctx.quadraticCurveTo(256, 145, 156, 108); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#33463b'; ctx.lineWidth = 5;
      for (const offset of [-46, 0, 46]) { ctx.beginPath(); ctx.moveTo(256 + offset - 12, 82); ctx.lineTo(256 + offset + 8, 113); ctx.stroke(); }
    }
    ctx.strokeStyle = '#acbd98'; ctx.beginPath(); ctx.moveTo(65, 122); ctx.quadraticCurveTo(256, 134, 447, 122); ctx.stroke();
    for (let row = 0; row < 4; row++) {
      const y = 178 + row * 50;
      ctx.fillStyle = '#f3e8cd';
      ctx.beginPath(); ctx.arc(69, y - 8, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(91, y - 14, 244 - row * 19, 10);
      ctx.fillRect(424, y - 14, 27, 10);
      ctx.strokeStyle = '#72836a'; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(47, y + 13); ctx.lineTo(462, y + 13); ctx.stroke(); ctx.setLineDash([]);
    }
    // Small capybara seal, surrounded by two sprigs.
    ellipse(256, 416, 41, 31, '#d3aa6e'); ellipse(227, 390, 9, 12, '#d3aa6e'); ellipse(286, 390, 9, 12, '#d3aa6e');
    ellipse(256, 430, 32, 15, '#e7c68d'); ellipse(239, 407, 3, 4, '#294239'); ellipse(273, 407, 3, 4, '#294239');
    ellipse(247, 423, 2.5, 2, '#6d563d'); ellipse(265, 423, 2.5, 2, '#6d563d');
    for (const side of [-1, 1]) for (let leaf = 0; leaf < 5; leaf++) {
      ellipse(256 + side * (69 + leaf * 12), 434 - leaf * 8, 8, 3, '#a4b28b');
    }
    ctx.fillStyle = '#c8caa5'; ctx.fillRect(184, 466, 144, 5);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.FrontSide });
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const object of world.objects) {
    const role = object.detail?.split(':')[2];
    if (!object.detail?.startsWith('prop:house:') || (role !== 'bakery' && role !== 'cafe')) continue;
    const { x, y, z } = object.pos;
    const geometry = new THREE.PlaneGeometry(1.51, 1.31);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) + (role === 'cafe' ? 1 : 0)) / 2);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(x - object.scale.x / 2 + .334, y + (role === 'cafe' ? 1.77 : 1.78), z + object.scale.z * (role === 'cafe' ? .26 : .24));
    const key = `${Math.floor(x / 32)}:${Math.floor(z / 32)}`;
    const parts = buckets.get(key) || []; parts.push(geometry); buckets.set(key, parts);
  }
  const group = new THREE.Group(), geometries: THREE.BufferGeometry[] = [];
  for (const parts of buckets.values()) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!geometry) throw new Error('Cannot merge wall art');
    geometries.push(geometry); group.add(new THREE.Mesh(geometry, material));
  }
  // A restrained ceramic dado ties the service buildings together. The pattern
  // is original vector art, with no licensed game artwork in the asset bundle.
  const tileCanvas = document.createElement('canvas'); tileCanvas.width = tileCanvas.height = 256;
  const tile = tileCanvas.getContext('2d')!;
  tile.fillStyle = '#eadfc4'; tile.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    tile.save(); tile.translate(col * 128 + 64, row * 128 + 64);
    tile.strokeStyle = '#447b82'; tile.lineWidth = 3; tile.strokeRect(-60, -60, 120, 120);
    tile.strokeStyle = '#c5ac77'; tile.lineWidth = 1.5; tile.strokeRect(-55, -55, 110, 110);
    for (let petal = 0; petal < 4; petal++) {
      tile.rotate(Math.PI / 2); tile.fillStyle = (col + row) % 2 ? '#518f91' : '#456f8b';
      tile.beginPath(); tile.moveTo(0, 0); tile.bezierCurveTo(-28, -20, -24, -48, 0, -51);
      tile.bezierCurveTo(24, -48, 28, -20, 0, 0); tile.fill();
      tile.strokeStyle = '#b8cfbf'; tile.lineWidth = 2; tile.beginPath(); tile.moveTo(0, -13); tile.lineTo(0, -41); tile.stroke();
    }
    tile.fillStyle = '#d9af6d'; tile.beginPath(); tile.arc(0, 0, 8, 0, Math.PI * 2); tile.fill();
    for (const x of [-45, 45]) for (const y of [-45, 45]) {
      tile.fillStyle = '#659398'; tile.beginPath(); tile.arc(x, y, 4, 0, Math.PI * 2); tile.fill();
    }
    tile.restore();
  }
  const tileTexture = new THREE.CanvasTexture(tileCanvas); tileTexture.colorSpace = THREE.SRGBColorSpace;
  tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping; tileTexture.anisotropy = 4;
  const tileMaterial = new THREE.MeshStandardMaterial({ map: tileTexture, color: '#ffffff', roughness: .64, metalness: .02 });
  const bands = new Map<string, THREE.BufferGeometry[]>();
  const band = (x: number, y: number, z: number, width: number, rotation: number) => {
    if (width < .2) return;
    const geometry = new THREE.PlaneGeometry(width, .52), uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 1.04, uv.getY(i) * .5);
    geometry.rotateY(rotation); geometry.translate(x, y, z);
    const key = `${Math.floor(x / 32)}:${Math.floor(z / 32)}`;
    const parts = bands.get(key) || []; parts.push(geometry); bands.set(key, parts);
  };
  for (const object of world.objects) {
    if (!object.detail?.startsWith('prop:house:') || object.detail.endsWith(':home')) continue;
    const { x, y, z } = object.pos, w = object.scale.x, d = object.scale.z;
    for (const side of [-1, 1]) {
      const door = x + w * (side > 0 ? -.18 : .2), left = x - w / 2 + .22, right = x + w / 2 - .22;
      band((left + door - 1.15) / 2, y + .51, z + side * (d / 2 + .23), door - 1.15 - left, side > 0 ? 0 : Math.PI);
      band((door + 1.15 + right) / 2, y + .51, z + side * (d / 2 + .23), right - door - 1.15, side > 0 ? 0 : Math.PI);
      band(x + side * (w / 2 + .23), y + .51, z, d - .44, side * Math.PI / 2);
    }
  }
  for (const parts of bands.values()) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!geometry) throw new Error('Cannot merge ceramic bands');
    geometries.push(geometry); const mesh = new THREE.Mesh(geometry, tileMaterial); mesh.receiveShadow = true; group.add(mesh);
  }
  return { group, dispose() {
    texture.dispose(); material.dispose(); tileTexture.dispose(); tileMaterial.dispose(); geometries.forEach(g => g.dispose());
  } };
}
