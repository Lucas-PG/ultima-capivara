import * as THREE from 'three';

export const CHARACTER_ATLAS_SIZE = 1024;
export const CHARACTER_FUR_TILES = [0, 1, 2, 4, 14] as const;
export type BandanaPattern = 'leaves' | 'waves' | 'diamonds';

// The 4x4 tile order matches capybara-palette.json and the Blender surface maps.
// Tile 14 stays neutral so the authored face and belly vertex colours survive.
export function createPaintedCharacterAtlas(colors: readonly number[], pattern: BandanaPattern = 'leaves'): THREE.DataTexture {
  const size = CHARACTER_ATLAS_SIZE, tileSize = size / 4;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = Math.floor(x / tileSize) + Math.floor(y / tileSize) * 4;
    const u = (x % tileSize + .5) / tileSize, v = (y % tileSize + .5) / tileSize;
    let shade = .97 + .025 * Math.sin(u * 13 + Math.sin(v * 11) * 1.2) + .018 * Math.cos(v * 23 + u * 8);
    let print = 0;
    if ((CHARACTER_FUR_TILES as readonly number[]).includes(tile)) {
      const flow = u * 182 + Math.sin(v * 15) * 2.5 + Math.sin(v * 43 + u * 9) * .9;
      const strand = Math.pow(Math.max(0, Math.sin(flow)), 8);
      const short = .45 + .55 * Math.pow(Math.max(0, Math.sin(v * 53 + u * 11)), 2);
      shade *= .91 + .14 * strand * short + .045 * Math.sin(u * 61 + v * 8);
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
    const hex = colors[tile] ?? colors[0], offset = (y * size + x) * 4;
    const painted = shade * (1 - print);
    pixels[offset] = Math.min(255, Math.round((hex >> 16 & 255) * painted + 244 * print));
    pixels[offset + 1] = Math.min(255, Math.round((hex >> 8 & 255) * painted + 232 * print));
    pixels[offset + 2] = Math.min(255, Math.round((hex & 255) * painted + 189 * print));
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = `Capivara_painted_${pattern}`; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
