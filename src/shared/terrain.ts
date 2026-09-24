export function terrainHeight(x: number, z: number): number {
  const edge = Math.pow(Math.pow(Math.abs(x) / 128, 4) + Math.pow(Math.abs(z) / 128, 4), .25);
  const coast = Math.max(0, (edge - .85) / .15);
  const hill = 12 * Math.exp(-((x + 8) ** 2 / 850 + (z - 99) ** 2 / 500));
  const waterfall = 7 * Math.exp(-((x - 101) ** 2 / 300 + (z + 40) ** 2 / 650));
  return 1.2 + hill + waterfall - coast * coast * 5;
}
