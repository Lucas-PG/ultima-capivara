// Procedural painted foliage tiles, drawn as SVG and rasterised by sharp (librsvg).
// Every tile is deterministic (seeded) and returns { svg, width, height, root }.
// Colours follow the style bible: frond A/B #5F9E3E / #9CC756, canopy #86BD4F / #5FA544 / #3F8A4A.

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

/** One side of a coconut frond. The rachis runs up the left edge (tip at the top);
 * leaflets sweep to the right. The other side is the same tile mirrored in u.
 * `solid` widens the leaflets until they merge into a blade with a serrated edge. */
export function frondHalf({ solid = false, seed = 7, width = 168, height = 1024 } = {}) {
  const r = mulberry(seed);
  const N = solid ? 20 : 23;
  const rachisX = 9;
  const defs = [], body = [];
  let gradient = 0;
  const bare = .09; // bare petiole
  for (let i = 0; i < N; i++) {
    const s = bare + (1 - bare - .015) * (i + .5) / N;      // 0 base .. 1 tip
    const y0 = height * (1 - s);
    const u = (s - bare) / (1 - bare);
    // Longest leaflets a third of the way up; short ones near the tip.
    const envelope = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, u * 1.06 + .02), .68)), .8);
    const length = (width - rachisX - 10) * (.24 + .76 * envelope) * (.93 + r() * .1) * (solid ? 1.06 : 1);
    const sweep = (33 + 24 * u + (r() - .5) * 6) * Math.PI / 180;      // angle above horizontal, toward the tip
    const dx = Math.cos(sweep), dy = -Math.sin(sweep);
    const nx = -dy, ny = dx;                                         // perpendicular (to the lower side)
    const breadth = (solid ? 52 : 38) * (.55 + .45 * envelope) * (.94 + r() * .12);
    const ax = rachisX + 2, ay = y0;
    const tx = ax + dx * length, ty = ay + dy * length;
    // Slight downward curl so the tips read as hanging.
    const curl = length * .07;
    const c1x = ax + dx * length * .42 + nx * breadth * .55, c1y = ay + dy * length * .42 + ny * breadth * .55 + curl * .3;
    const c2x = ax + dx * length * .42 - nx * breadth * .45, c2y = ay + dy * length * .42 - ny * breadth * .45 + curl * .3;
    const tipx = tx + nx * curl * .5, tipy = ty + ny * curl * .5 + curl * .6;
    const light = .92 + r() * .16;
    const dark = shade('#3F7B2E', light), mid = shade('#5F9E3E', light), tip = shade('#B7D45A', .96 + r() * .08);
    const id = `g${gradient++}`;
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(ax)}" y1="${f(ay)}" x2="${f(tipx)}" y2="${f(tipy)}">` +
      `<stop offset="0" stop-color="${dark}"/><stop offset=".42" stop-color="${mid}"/><stop offset="1" stop-color="${tip}"/></linearGradient>`);
    body.push(`<path d="M${f(ax)} ${f(ay)} Q${f(c1x)} ${f(c1y)} ${f(tipx)} ${f(tipy)} Q${f(c2x)} ${f(c2y)} ${f(ax)} ${f(ay + 2.2)} Z" fill="url(#${id})"/>`);
    // Lit midline, and a darker underside edge for the fold.
    body.push(`<path d="M${f(ax + 1)} ${f(ay + 1)} Q${f((ax + tipx) / 2 + nx * 1.6)} ${f((ay + tipy) / 2 + ny * 1.6 + curl * .2)} ${f(tipx - dx * 3)} ${f(tipy - dy * 3)}" ` +
      `stroke="#D3E68A" stroke-opacity=".5" stroke-width="${solid ? 2.4 : 1.7}" fill="none" stroke-linecap="round"/>`);
    body.push(`<path d="M${f(ax)} ${f(ay + 1.5)} Q${f(c2x)} ${f(c2y)} ${f(tipx)} ${f(tipy)}" stroke="#2F6B2C" stroke-opacity=".35" stroke-width="2.2" fill="none"/>`);
  }
  // Rachis: thick olive at the base, thin and light toward the tip.
  const rachis = `<path d="M${rachisX - 6} ${height} L${rachisX - 1.5} 0 L${rachisX + 1.5} 0 L${rachisX + 7} ${height} Z" fill="#A6AC4E"/>` +
    `<path d="M${rachisX - 1} ${height} L${rachisX - .4} 0 L${rachisX + .6} 0 L${rachisX + 2.5} ${height} Z" fill="#D7DB8A" fill-opacity=".8"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>${defs.join('')}</defs>${body.join('')}${rachis}</svg>`;
  return { svg, width, height, root: [rachisX / width, .985] };
}
