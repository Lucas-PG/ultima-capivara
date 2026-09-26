import * as THREE from 'three';

// Same authored paint equations as tools/blender/weapons.py. Rebuilding the
// rarity column preserves wood grain, fur strands and cloth weave on all tiers.
export function createPaintedWeaponAtlas(colors: readonly number[], size = 1024): THREE.DataTexture {
  const width = size, height = size, columnWidth = size / 32, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const column = Math.floor(x / columnWidth), u = (x % columnWidth + .5) / columnWidth, v = (y + .5) / height;
    const brush = .96 + .028 * Math.sin(u * 13 + Math.sin(v * 17) * 1.7) + .022 * Math.cos(v * 31 + u * 7);
    let shade = brush;
    if ([2, 3, 21].includes(column)) shade *= .89 + .11 * Math.sin(u * 38 + Math.sin(v * 12) * 2 + v * 4);
    else if ([13, 14, 15, 16, 19].includes(column)) {
      const strand = Math.sin(u * 95 + Math.sin(v * 42) * 2.3 + v * 16);
      shade *= .94 + .065 * strand + .035 * Math.sin(u * 53 - v * 32);
    } else if ([17, 18].includes(column)) shade *= .95 + .04 * Math.sin(u * 90) * Math.sin(v * 210);
    else if ([4, 23].includes(column)) shade *= .94 + .045 * Math.sin(u * 80) * Math.cos(v * 120);
    else shade *= .97 + .025 * Math.sin(v * 85 + u * 8);
    const hex = colors[column] ?? colors[0], offset = (y * width + x) * 4;
    pixels[offset] = Math.min(255, Math.round((hex >> 16 & 255) * shade));
    pixels[offset + 1] = Math.min(255, Math.round((hex >> 8 & 255) * shade));
    pixels[offset + 2] = Math.min(255, Math.round((hex & 255) * shade));
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
