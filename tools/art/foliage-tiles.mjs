// Procedural painted foliage tiles, drawn as SVG and rasterised by sharp (librsvg).
// Every tile is deterministic (seeded) and returns { svg, width, height, root }.
// Fronds, vines and garden plants now come from Codex paintings (see build-foliage-atlas.mjs);
// only the flamboyant's small blooms are still drawn here.

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const rgb = (r, g, b) => `#${hex(r)}${hex(g)}${hex(b)}`;
const parse = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const mix = (a, b, t) => { const x = parse(a), y = parse(b); return rgb(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export const shade = (c, k) => { const x = parse(c); return rgb(x[0] * k, x[1] * k, x[2] * k); };
const f = (n) => Math.round(n * 10) / 10;

/** A single five-petal bloom seen face on, with a darker throat and a stamen column. */
export function bloom({ petals = 5, outer = '#E8352B', inner = '#8C1614', tip = '#F0603A', size = 256, seed = 5, stamen = '#F6CB3C', streak = null } = {}) {
  const r = mulberry(seed), c = size / 2, rad = size * .46, body = [], defs = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * 360 + (r() - .5) * 12 - 90, w = rad * (.62 + r() * .1), h = rad * (.92 + r() * .08);
    const id = `p${i}`;
    defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${c}" cy="${c}" r="${f(h)}" gradientTransform="rotate(${f(a + 90)} ${c} ${c})">` +
      `<stop offset="0" stop-color="${inner}"/><stop offset=".32" stop-color="${outer}"/><stop offset="1" stop-color="${tip}"/></radialGradient>`);
    body.push(`<g transform="rotate(${f(a + 90)} ${c} ${c})"><path d="M${c} ${c} C${f(c - w)} ${f(c - h * .35)} ${f(c - w * .95)} ${f(c - h * 1.02)} ${c} ${f(c - h)} C${f(c + w * .95)} ${f(c - h * 1.02)} ${f(c + w)} ${f(c - h * .35)} ${c} ${c} Z" fill="url(#${id})"/>` +
      `<path d="M${c} ${f(c - h * .12)} L${c} ${f(c - h * .85)}" stroke="${inner}" stroke-opacity=".25" stroke-width="2.4" fill="none"/></g>`);
  }
  if (streak) body.push(`<g transform="rotate(-90 ${c} ${c})"><path d="M${c} ${c} C${c - 8} ${c - rad * .4} ${c - 10} ${c - rad * .7} ${c} ${c - rad * .75} C${c + 10} ${c - rad * .7} ${c + 8} ${c - rad * .4} ${c} ${c} Z" fill="${streak}" fill-opacity=".8"/></g>`);
  body.push(`<circle cx="${c}" cy="${c}" r="${f(rad * .11)}" fill="${inner}"/>`);
  body.push(`<path d="M${c} ${c} Q${f(c + rad * .3)} ${f(c - rad * .25)} ${f(c + rad * .42)} ${f(c - rad * .5)}" stroke="${stamen}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${f(c + rad * .42)}" cy="${f(c - rad * .5)}" r="6" fill="${stamen}"/>`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`,
    width: size, height: size, root: [.5, .5] };
}
