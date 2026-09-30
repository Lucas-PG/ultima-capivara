// Movement, surfaces and gun handling. Capybara feet are soft pads with
// hoof-like nails: a step is a short low pad thump, a second paw a beat later,
// and the ground's own answer (grass rustle, sand hush, stone nail ticks, a
// hollow board). Steps stay short and quiet so they never read as gunfire.
import { band, buffer, fadeOut, grains, mix, modes, Rng, svf, tone } from './dsp';
import { click, crack, type Mode } from './weapons';

export const STEP_MATERIALS = ['grass', 'dirt', 'sand', 'stone', 'wood', 'metal', 'water'] as const;
export type StepMaterial = typeof STEP_MATERIALS[number];

function pad(x: Float32Array, rate: number, rng: Rng, t: number, weight: number) {
  // A soft knock, not a boom: low thuds are what distant gunfire sounds like, so the pad stays above 150 Hz.
  tone(x, rate, { start: t, dur: .08, from: rng.range(210, 260), to: 150, glide: .03, attack: .0015, tau: .011 * Math.sqrt(weight), gain: .16 * weight });
  band(x, rate, rng, { start: t, dur: .08, mode: 'bp', freq: rng.range(380, 460), q: .8, attack: .001, tau: .01 * Math.sqrt(weight), gain: .3 * weight });
}

function ground(x: Float32Array, rate: number, rng: Rng, t: number, material: StepMaterial, k: number) {
  const layer = buffer(rate, .25);
  switch (material) {
    case 'grass':
      grains(layer, rate, rng, 0, .09, 1200, .5, .0007, u => Math.exp(-u * 3.5));
      svf(layer, rate, 'bp', rng.range(3000, 4000), .7);
      band(layer, rate, rng, { start: .005, dur: .12, mode: 'bp', freq: 2200, q: .8, attack: .008, tau: .024, gain: .25 });
      break;
    case 'dirt':
      grains(layer, rate, rng, 0, .06, 1600, .6, .0005, u => Math.exp(-u * 3));
      svf(layer, rate, 'bp', rng.range(1600, 2100), .8);
      band(layer, rate, rng, { start: 0, dur: .1, mode: 'bp', freq: 900, q: .9, attack: .002, tau: .02, gain: .35 });
      break;
    case 'sand':
      // A soft low hush with a little grit, darker than grass.
      band(layer, rate, rng, { start: .002, dur: .15, mode: 'bp', freq: rng.range(800, 1000), q: .9, attack: .007, tau: .02, gain: .6 });
      { const grit = buffer(rate, .1); grains(grit, rate, rng, .003, .06, 700, .3, .0004, u => 1 - u); svf(grit, rate, 'bp', 1700, .9); mix(layer, grit, 0, 1); }
      break;
    case 'stone': {
      band(layer, rate, rng, { start: .004, dur: .06, mode: 'bp', freq: 2600, q: 1, attack: .001, tau: .01, gain: .18 });
      // Two or three nail ticks: tiny, bright, dry.
      const ticks = rng.int(2, 3);
      for (let i = 0; i < ticks; i++) click(layer, rate, rng, .002 + i * rng.range(.006, .012), [[rng.range(3600, 4300), .003, .4], [rng.range(5600, 6600), .002, .25]], 5200, .35);
      break;
    }
    case 'wood': {
      const f = rng.range(290, 360);
      modes(layer, rate, 0, [[f, .024, .45], [f * 2.3, .016, .3], [f * 4.4, .01, .2]], .001);
      click(layer, rate, rng, .003, [[rng.range(2900, 3400), .003, .25]], 4000, .2);
      if (k % 5 === 4) {
        // Now and then a board complains.
        tone(layer, rate, { start: .03, dur: .14, from: rng.range(160, 200), to: rng.range(130, 150), attack: .02, tau: .05, gain: .06, shape: 'saw' });
      }
      break;
    }
    case 'metal':
      modes(layer, rate, 0, [[rng.range(500, 540), .045, .2], [rng.range(1300, 1360), .035, .15], [rng.range(2650, 2780), .025, .1]], .001);
      click(layer, rate, rng, .002, [[rng.range(4200, 4800), .003, .3]], 5000, .25);
      break;
    case 'water': {
      band(layer, rate, rng, { start: 0, dur: .22, mode: 'bp', freq: rng.range(800, 1000), q: .6, attack: .008, tau: .04, gain: .7 });
      const drops = rng.int(4, 7);
      for (let i = 0; i < drops; i++) {
        const f = rng.range(600, 1500);
        tone(layer, rate, { start: rng.range(.01, .09), dur: .04, from: f, to: f * rng.range(1.3, 1.8), attack: .002, tau: .01, gain: rng.range(.04, .1) });
      }
      grains(layer, rate, rng, .01, .12, 600, .1, .0003);
      svf(layer, rate, 'hp', 250);
      break;
    }
  }
  mix(x, layer, Math.round(t * rate), 1);
}

/** One stride: front paw, then the hind paw a beat later. Landing is a single heavier touchdown. */
export function step(material: StepMaterial, landing: boolean, rate: number, rng: Rng, variant: number): Float32Array {
  const x = buffer(rate, landing ? .4 : .22);
  const soft = material === 'sand' || material === 'water' ? .6 : material === 'grass' ? .8 : 1;
  if (landing) {
    pad(x, rate, rng, 0, 2.2 * soft);
    ground(x, rate, rng, .002, material, variant);
    ground(x, rate, rng, .02, material, variant + 1);
    grains(x, rate, rng, .01, .05, 500, .06, .0004); // Gear settles.
    band(x, rate, rng, { start: .01, dur: .25, mode: 'bp', freq: 600, q: .7, attack: .01, tau: .06, gain: .2 });
    // Touchdowns keep a little weight below the steps, still well clear of a gun's sub punch.
    tone(x, rate, { start: 0, dur: .12, from: 150, to: 90, glide: .05, attack: .002, tau: .025, gain: .12 * soft });
    svf(x, rate, 'hp', 80);
  } else {
    const gap = rng.range(.035, .055);
    pad(x, rate, rng, 0, soft);
    ground(x, rate, rng, .001, material, variant);
    // The hind paw lands softer, inside the front paw's decay.
    const hind = buffer(rate, .2);
    pad(hind, rate, rng, 0, soft * .55);
    ground(hind, rate, rng, .001, material, variant + 2);
    mix(x, hind, Math.round(gap * rate), .5);
    svf(x, rate, 'hp', 160); svf(x, rate, 'hp', 160);
  }
  return fadeOut(x, rate, .02);
}

export function jump(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .26);
  band(x, rate, rng, { start: 0, dur: .25, mode: 'bp', freq: t => 450 + 1100 * Math.min(1, t / .12), q: .9, attack: .03, tau: .05, gain: .8 });
  grains(x, rate, rng, .01, .06, 400, .15, .0004);
  svf(x, rate, 'hp', 200);
  return fadeOut(x, rate, .03);
}

export function cloth(rate: number, rng: Rng, gear: boolean): Float32Array {
  const x = buffer(rate, .3);
  band(x, rate, rng, { start: 0, dur: .28, mode: 'bp', freq: rng.range(1000, 1400), q: .6, attack: .025, tau: .06, gain: .7 });
  grains(x, rate, rng, .01, .15, 300, .15, .0005);
  if (gear) for (let i = 0; i < 3; i++) click(x, rate, rng, rng.range(.01, .12), [[rng.range(2700, 3100), .01, .2], [rng.range(4200, 4700), .008, .12]], 4000, .15);
  svf(x, rate, 'hp', 300);
  return fadeOut(x, rate, .04);
}

export function swimStroke(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .5), p = rng.range(.12, .18);
  band(x, rate, rng, { start: 0, dur: .45, mode: 'bp', freq: t => 500 + 800 * Math.sin(Math.PI * Math.min(1, t / (p * 2.4))), q: .7, attack: p, tau: .1, gain: .8 });
  for (let i = 0; i < 5; i++) {
    const f = rng.range(400, 1100);
    tone(x, rate, { start: rng.range(.1, .35), dur: .05, from: f, to: f * 1.5, attack: .003, tau: .012, gain: rng.range(.03, .07) });
  }
  svf(x, rate, 'hp', 180);
  return fadeOut(x, rate, .05);
}

export function splash(rate: number, rng: Rng, entering: boolean): Float32Array {
  const x = buffer(rate, entering ? .9 : .7);
  if (entering) {
    tone(x, rate, { start: 0, dur: .3, from: 130, to: 45, attack: .003, tau: .07, gain: .6 });
    band(x, rate, rng, { start: 0, dur: .6, mode: 'lp', freq: t => 3200 - 2200 * Math.min(1, t / .4), q: .6, attack: .004, tau: .14, gain: 1 });
  } else band(x, rate, rng, { start: 0, dur: .3, mode: 'bp', freq: 1300, q: .6, attack: .01, tau: .07, gain: .6 });
  const drops = entering ? 14 : 12;
  for (let i = 0; i < drops; i++) {
    const t = entering ? rng.range(.06, .7) : rng.range(.05, .6), f = rng.range(500, 1800);
    tone(x, rate, { start: t, dur: .05, from: f, to: f * rng.range(1.2, 1.8), attack: .002, tau: .012, gain: rng.range(.03, .08) * (entering ? 1 : .8) });
  }
  svf(x, rate, 'hp', 120);
  return fadeOut(x, rate, .08);
}

export function mud(rate: number, rng: Rng, entering: boolean): Float32Array {
  const x = buffer(rate, entering ? .45 : .3);
  if (entering) {
    band(x, rate, rng, { start: 0, dur: .3, mode: 'lp', freq: 380, attack: .02, tau: .06, gain: .8, brown: true });
    tone(x, rate, { start: 0, dur: .3, from: 180, to: 58, attack: .004, tau: .06, gain: .7 });
  } else {
    const f = rng.range(130, 160);
    tone(x, rate, { start: 0, dur: .1, from: f, to: f * 1.5, attack: .004, tau: .025, gain: .6 });
    tone(x, rate, { start: .065, dur: .14, from: f * 2, to: f * .6, attack: .003, tau: .03, gain: .45 });
  }
  return fadeOut(x, rate, .03);
}

// ---- Bullet impacts on the world, heard at the impact point.
export const IMPACT_SURFACES = ['dirt', 'sand', 'foliage', 'stone', 'wood', 'metal', 'water'] as const;
export type ImpactSurface = typeof IMPACT_SURFACES[number];

export function impact(surface: ImpactSurface, rate: number, rng: Rng, variant: number): Float32Array {
  const x = buffer(rate, .45);
  switch (surface) {
    case 'dirt': case 'sand':
      band(x, rate, rng, { start: 0, dur: .15, mode: 'lp', freq: surface === 'sand' ? 1300 : 1900, attack: .0008, tau: .025, gain: 1 });
      grains(x, rate, rng, .005, .1, 900, .25, .0005, u => Math.exp(-u * 3));
      break;
    case 'foliage':
      grains(x, rate, rng, 0, .12, 1400, .5, .0006, u => Math.exp(-u * 2));
      svf(x, rate, 'bp', 3000, .7);
      band(x, rate, rng, { start: 0, dur: .15, mode: 'bp', freq: 1900, q: .8, attack: .002, tau: .035, gain: .5 });
      break;
    case 'stone':
      crack(x, rate, rng, 0, .25, 1800, .0003, .0006);
      band(x, rate, rng, { start: 0, dur: .05, mode: 'bp', freq: 2200, q: .9, attack: .0005, tau: .008, gain: .6 });
      grains(x, rate, rng, .002, .06, 1500, .35, .0003, u => Math.exp(-u * 4));
      svf(x, rate, 'lp', 7000);
      svf(x, rate, 'hp', 900);
      if (variant % 3 === 2) tone(x, rate, { start: .01, dur: .35, from: rng.range(3000, 3600), to: rng.range(1600, 2000), attack: .005, tau: .09, gain: .1, vibrato: [38, .015] }); // ricochet
      break;
    case 'wood':
      modes(x, rate, 0, [[rng.range(300, 360), .03, .6], [rng.range(640, 720), .02, .35], [1500, .012, .2]], .0006);
      grains(x, rate, rng, .002, .08, 800, .25, .0005, u => Math.exp(-u * 3));
      svf(x, rate, 'hp', 150);
      break;
    case 'metal':
      click(x, rate, rng, 0, [[rng.range(1200, 1320), .12, .35], [rng.range(2800, 3000), .08, .25], [rng.range(4000, 4300), .05, .15]], 3500, 1);
      break;
    case 'water':
      band(x, rate, rng, { start: 0, dur: .3, mode: 'bp', freq: 1300, q: .7, attack: .004, tau: .05, gain: .8 });
      for (let i = 0; i < 6; i++) { const f = rng.range(700, 1900); tone(x, rate, { start: rng.range(.02, .25), dur: .04, from: f, to: f * 1.5, attack: .002, tau: .01, gain: .07 }); }
      break;
  }
  return fadeOut(x, rate, .05);
}

/** A near miss: the supersonic crack of a round passing by, then its whistle. */
export function whiz(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .3);
  crack(x, rate, rng, 0, .9, 2800, .00018, .0004);
  const f0 = rng.range(3400, 4200);
  band(x, rate, rng, { start: 0, dur: .25, mode: 'bp', freq: t => f0 * (1 - .5 * Math.min(1, t / .09)), q: 2.2, attack: .004, tau: .035, gain: .7 });
  return fadeOut(x, rate, .03);
}

/** A capybara taking a hit, heard by others nearby: a soft padded thwack. */
export function fleshHit(rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .2);
  band(x, rate, rng, { start: 0, dur: .12, mode: 'lp', freq: 900, attack: .0006, tau: .018, gain: 1 });
  tone(x, rate, { start: 0, dur: .12, from: 190, to: 90, attack: .001, tau: .025, gain: .6 });
  return fadeOut(x, rate, .02);
}

// ---- Gun handling cues. Names match the viewmodel choreography's sfx keys.
export const FOLEY_CUES = ['mag-out', 'mag-drop', 'mag-in', 'slide-back', 'slide-home', 'bolt-open', 'bolt-back', 'bolt-home',
  'pump-back', 'pump-home', 'shell-in', 'cylinder-open', 'eject', 'speedloader', 'cylinder-close', 'coconut-in', 'grab', 'draw', 'stone', 'dry'] as const;
export type FoleyCue = typeof FOLEY_CUES[number];

function slideNoise(x: Float32Array, rate: number, rng: Rng, t: number, freq: number, dur: number, gain: number) {
  band(x, rate, rng, { start: t, dur: dur * 3, mode: 'bp', freq: tt => freq * (1 + .25 * Math.min(1, tt / dur)), q: 1.3, attack: dur * .5, tau: dur * .4, gain });
}

export function foley(cue: FoleyCue, rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, .6), j = (f: number) => f * rng.range(.97, 1.03);
  const metal = (t: number, list: Mode, tick: number, g: number) => click(x, rate, rng, t, list, tick, g);
  switch (cue) {
    case 'mag-out': metal(0, [[j(1900), .012, .3], [j(3100), .008, .15]], 2600, .7); slideNoise(x, rate, rng, .01, 900, .06, .35); break;
    case 'mag-drop': band(x, rate, rng, { start: 0, dur: .15, mode: 'bp', freq: 520, attack: .002, tau: .025, gain: .6 }); modes(x, rate, .003, [[j(260), .04, .3], [j(1150), .02, .12]]); break;
    case 'mag-in': slideNoise(x, rate, rng, 0, 1300, .04, .35); metal(.045, [[j(1500), .015, .45], [j(2600), .01, .3], [j(4200), .006, .15]], 3000, 1); tone(x, rate, { start: .045, dur: .08, from: 180, to: 90, attack: .001, tau: .015, gain: .35 }); break;
    case 'slide-back': slideNoise(x, rate, rng, 0, 2300, .06, .4); metal(.06, [[j(2600), .01, .35], [j(4100), .006, .2]], 3500, .7); break;
    case 'slide-home': metal(0, [[j(2100), .02, .45], [j(3400), .012, .3], [j(5200), .006, .15]], 3000, 1.1); tone(x, rate, { start: 0, dur: .08, from: 700, to: 380, attack: .001, tau: .015, gain: .2 }); break;
    case 'bolt-open': metal(0, [[j(1700), .015, .4], [j(2900), .01, .2]], 2400, .8); break;
    case 'bolt-back': slideNoise(x, rate, rng, 0, 1500, .07, .45); metal(.08, [[j(1300), .015, .35], [j(2400), .01, .2]], 2200, .7); break;
    case 'bolt-home': slideNoise(x, rate, rng, 0, 1600, .05, .4); metal(.06, [[j(2000), .02, .5], [j(3300), .012, .3], [j(900), .03, .2]], 2800, 1.1); break;
    case 'pump-back': slideNoise(x, rate, rng, 0, 900, .07, .6); metal(.065, [[j(1100), .02, .45], [j(2300), .012, .25]], 1800, .9); break;
    case 'pump-home': slideNoise(x, rate, rng, 0, 1100, .05, .5); metal(.05, [[j(1450), .025, .5], [j(2900), .012, .3], [j(700), .03, .25]], 2200, 1.2); break;
    case 'shell-in': metal(0, [[j(2400), .012, .3], [j(3900), .008, .2]], 3000, .6); slideNoise(x, rate, rng, .02, 1800, .04, .3); break;
    case 'cylinder-open': metal(0, [[j(2000), .02, .35], [j(3200), .012, .2]], 2600, .8); tone(x, rate, { start: 0, dur: .12, from: 900, to: 600, attack: .002, tau: .03, gain: .1, shape: 'tri' }); break;
    case 'eject':
      slideNoise(x, rate, rng, 0, 2600, .04, .3);
      for (let i = 0; i < 5; i++) metal(.1 + i * .045 + rng.range(0, .02), [[rng.range(3600, 4600), .03, .2], [rng.range(6000, 7000), .02, .1]], 5000, .35);
      break;
    case 'speedloader': slideNoise(x, rate, rng, 0, 1900, .05, .4); metal(.04, [[j(2300), .015, .35], [j(3600), .01, .2]], 3000, .8); break;
    case 'cylinder-close': metal(0, [[j(1500), .025, .5], [j(2700), .015, .3], [j(4400), .008, .15]], 2400, 1.2); tone(x, rate, { start: 0, dur: .1, from: 520, to: 300, attack: .001, tau: .02, gain: .2, shape: 'tri' }); break;
    case 'coconut-in': tone(x, rate, { start: 0, dur: .2, from: 180, to: 90, attack: .002, tau: .04, gain: .6 }); band(x, rate, rng, { start: 0, dur: .15, mode: 'lp', freq: 700, attack: .002, tau: .03, gain: .5 }); modes(x, rate, .002, [[j(420), .04, .2]]); break;
    case 'grab': band(x, rate, rng, { start: 0, dur: .12, mode: 'bp', freq: 700, q: .8, attack: .004, tau: .02, gain: .6 }); metal(.03, [[j(2200), .01, .15]], 2600, .3); break;
    case 'draw': slideNoise(x, rate, rng, 0, 1100, .1, .4); metal(.1, [[j(2000), .03, .2], [j(3100), .05, .12]], 3000, .5); break;
    case 'stone': band(x, rate, rng, { start: 0, dur: .1, mode: 'lp', freq: 900, attack: .002, tau: .02, gain: .7 }); modes(x, rate, 0, [[j(300), .03, .2], [j(1400), .01, .15]]); break;
    case 'dry': metal(0, [[j(3200), .006, .4], [j(5100), .004, .2]], 4500, .8); break;
  }
  return fadeOut(x, rate, .04);
}
