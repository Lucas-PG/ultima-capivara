import * as THREE from 'three';

export const CHARACTER_ATLAS_SIZE = 1024;
export const CHARACTER_FUR_TILES = [0, 1, 2, 4, 14] as const;
export type BandanaPattern = 'leaves' | 'waves' | 'diamonds';
const paintedPatterns = new Map<BandanaPattern, { shade: Float32Array; print: Float32Array }>();

// The 4x4 tile order matches capybara-palette.json and the Blender surface maps.
// Tile 14 stays neutral so the authored face and belly vertex colours survive.
function surfacePaint(pattern: BandanaPattern) {
  const cached = paintedPatterns.get(pattern);
  if (cached) return cached;
  const size = CHARACTER_ATLAS_SIZE, tileSize = size / 4;
  const painted = { shade: new Float32Array(size * size), print: new Float32Array(size * size) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = Math.floor(x / tileSize) + Math.floor(y / tileSize) * 4;
    const u = (x % tileSize + .5) / tileSize, v = (y % tileSize + .5) / tileSize;
    let shade = .97 + .025 * Math.sin(u * 13 + Math.sin(v * 11) * 1.2) + .018 * Math.cos(v * 23 + u * 8);
    let print = 0;
    if ((CHARACTER_FUR_TILES as readonly number[]).includes(tile)) {
      const fx = (u + .012 * Math.sin(v * 9)) * 78;
      const stagger = Math.sin(Math.floor(fx) * 73.13) * 39.2, fy = v * 26 + stagger - Math.floor(stagger);
      let seed = Math.sin(Math.floor(fx) * 12.9898 + Math.floor(fy) * 78.233) * 43758.5453;
      seed -= Math.floor(seed);
      const along = fy - Math.floor(fy), across = fx - Math.floor(fx) - (.23 + seed * .5 + .08 * Math.sin(along * Math.PI * 2));
      const strand = Math.exp(-Math.pow(across / .17, 2)) * Math.pow(Math.max(0, Math.sin(along * Math.PI)), 1.2);
      shade = .97 + .022 * Math.sin(u * 13 + v * 8) + strand * (seed > .42 ? .16 : -.10);
    } else if ([5, 6, 7, 13].includes(tile)) {
      shade *= .96 + .022 * Math.sin(u * 420) * Math.cos(v * 420);
      if (tile === 5 || tile === 6) {
        const a = (u * 3 + (Math.floor(v * 4) % 2) * .5) % 1 - .5, b = (v * 4) % 1 - .5;
        if (pattern === 'waves') print = Math.abs(Math.sin(u * 38 + Math.sin(v * 25) * 2)) > .96 ? .38 : 0;
        else if (pattern === 'diamonds') print = Math.abs(Math.abs(a) + Math.abs(b) - .32) < .035 ? .48 : 0;
        else {
          const stem = Math.abs(a - b * .48) < .014 && Math.abs(b) < .38;
          const leaf = Math.pow((a - b * .48 - Math.sign(b) * .065) / .115, 2) + Math.pow(((b + .5) % .22 - .11) / .075, 2) < 1;
          print = stem || (leaf && Math.abs(b) < .32) ? .43 : 0;
        }
      }
    } else if (tile === 8) shade *= .92 + .035 * Math.sin(u * 155 + Math.sin(v * 31));
    else if (tile === 15) shade *= .96 + .018 * Math.sin(u * 110) * Math.cos(v * 98);
    if ([3, 9, 10].includes(tile)) shade = 1;
    painted.shade[y * size + x] = shade * (1 - print); painted.print[y * size + x] = print;
  }
  paintedPatterns.set(pattern, painted);
  return painted;
}

export function createPaintedCharacterAtlas(colors: readonly number[], pattern: BandanaPattern = 'leaves'): THREE.DataTexture {
  const size = CHARACTER_ATLAS_SIZE, tileSize = size / 4, paint = surfacePaint(pattern);
  const pixels = new Uint8Array(size * size * 4);
  // Actor colours reuse the authored strand field; only the final tint is rebuilt.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = Math.floor(x / tileSize) + Math.floor(y / tileSize) * 4;
    const i = y * size + x, offset = i * 4, hex = colors[tile] ?? colors[0];
    const shade = paint.shade[i], print = paint.print[i];
    pixels[offset] = Math.min(255, Math.round((hex >> 16 & 255) * shade + 244 * print));
    pixels[offset + 1] = Math.min(255, Math.round((hex >> 8 & 255) * shade + 232 * print));
    pixels[offset + 2] = Math.min(255, Math.round((hex & 255) * shade + 189 * print));
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = `Capivara_painted_${pattern}`; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
