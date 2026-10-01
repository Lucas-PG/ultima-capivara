// Feedback, interface and character sounds. The painted island gets a
// wooden, marimba-and-bell palette: soft mallet notes for menus, bright bells
// for confirmations, and short whistles and purrs for the capybaras.
import { band, buffer, fadeOut, grains, mix, modes, pluck, Rng, svf, tone } from './dsp';
import { click, type Mode } from './weapons';

/** Marimba-like mallet note: fundamental plus the bar's inharmonic partials. */
export function mallet(x: Float32Array, rate: number, rng: Rng, t: number, f: number, gain: number, decay = .25) {
  modes(x, rate, t, [[f, decay, gain], [f * 3.93, decay * .25, gain * .3], [f * 9.2, decay * .08, gain * .08]], .0015);
  band(x, rate, rng, { start: t, dur: .01, mode: 'bp', freq: f * 4, q: 1, attack: .0003, tau: .0015, gain: gain * .15 });
}

/** Small bell: bright inharmonic partials, long-ish ring. */
export function bell(x: Float32Array, rate: number, t: number, f: number, gain: number, decay = .5) {
  modes(x, rate, t, [[f, decay, gain], [f * 2.76, decay * .5, gain * .45], [f * 5.4, decay * .28, gain * .25], [f * 8.93, decay * .15, gain * .12]], .0008);
}

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

export type FeedbackId = 'hit' | 'head' | 'kill' | 'armor-break' | 'damage' | 'heart' | 'respawn' | 'upgrade' | 'storm-bite'
  | 'pick-weapon' | 'pick-ammo' | 'pick-armor' | 'pick-helmet' | 'pick-item' | 'rare-1' | 'rare-2' | 'rare-3' | 'chest'
  | 'use-bandage' | 'use-medkit' | 'use-guarana' | 'use-acai' | 'use-rapadura'
  | 'supply-incoming' | 'supply-land' | 'supply-open' | 'zone-warn' | 'bounce' | 'poof' | 'chute-open'
  | 'ui-hover' | 'ui-click' | 'ui-back' | 'ui-tick' | 'ui-go' | 'ui-notice' | 'thunder' | 'crackle';

export const FEEDBACK_IDS: readonly FeedbackId[] = ['hit', 'head', 'kill', 'armor-break', 'damage', 'heart', 'respawn', 'upgrade', 'storm-bite',
  'pick-weapon', 'pick-ammo', 'pick-armor', 'pick-helmet', 'pick-item', 'rare-1', 'rare-2', 'rare-3', 'chest',
  'use-bandage', 'use-medkit', 'use-guarana', 'use-acai', 'use-rapadura',
  'supply-incoming', 'supply-land', 'supply-open', 'zone-warn', 'bounce', 'poof', 'chute-open',
  'ui-hover', 'ui-click', 'ui-back', 'ui-tick', 'ui-go', 'ui-notice', 'thunder', 'crackle'];

const LENGTH: Partial<Record<FeedbackId, number>> = {
  hit: .12, head: .5, kill: .7, 'armor-break': .6, damage: .35, heart: .45, respawn: 1.1, upgrade: .6, 'storm-bite': .4,
  chest: 1.3, 'rare-3': 1.1, 'supply-incoming': 1.4, 'supply-land': 1, 'zone-warn': 2.4, 'ui-go': .7, thunder: 3.2, 'chute-open': .8,
};

function creak(x: Float32Array, rate: number, rng: Rng, t: number, dur: number, f0: number, gain: number) {
  // Stick-slip friction: an irregular pulse train through wooden resonances.
  const layer = buffer(rate, dur);
  let next = 0, i = 0;
  while (i < layer.length) {
    const u = i / layer.length, f = f0 * (1 + .35 * Math.sin(Math.PI * u)) * rng.range(.85, 1.15);
    layer[i] = (rng.next() < .5 ? 1 : -1) * Math.sin(Math.PI * u);
    next = Math.max(1, Math.round(rate / f)); i += next;
  }
  const a = layer.slice(), b = layer.slice();
  svf(a, rate, 'bp', 520, 4); svf(b, rate, 'bp', 1150, 5);
  for (let k = 0; k < layer.length; k++) layer[k] = a[k] + b[k] * .6;
  mix(x, layer, Math.round(t * rate), gain);
}

export function feedback(id: FeedbackId, rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, LENGTH[id] ?? .4);
  const metal = (t: number, list: Mode, tick: number, g: number) => click(x, rate, rng, t, list, tick, g);
  switch (id) {
    case 'hit':
      // Crisp tick above the gunfire band: short, dry, never confused with a step.
      metal(0, [[2350, .016, .7], [4700, .009, .3], [3500, .01, .2]], 5200, 1);
      break;
    case 'head':
      metal(0, [[2900, .02, .5]], 6000, .8);
      bell(x, rate, .002, 2093, .7, .22);
      bell(x, rate, .05, 2793, .35, .16);
      break;
    case 'kill':
      tone(x, rate, { start: 0, dur: .2, from: 150, to: 70, attack: .002, tau: .05, gain: .6 });
      mallet(x, rate, rng, .01, NOTE(15), .6, .3); // C6
      mallet(x, rate, rng, .09, NOTE(22), .6, .35); // G6
      bell(x, rate, .09, NOTE(27), .25, .25); // C7
      grains(x, rate, rng, .09, .25, 90, .05, .0004, u => 1 - u);
      break;
    case 'armor-break':
      band(x, rate, rng, { start: 0, dur: .15, mode: 'hp', freq: 3500, attack: .0005, tau: .025, gain: .8 });
      for (let i = 0; i < 14; i++) modes(x, rate, rng.range(0, .35), [[rng.range(3000, 8000), rng.range(.01, .04), rng.range(.05, .15) * (1 - i / 16)]]);
      tone(x, rate, { start: 0, dur: .4, from: 1320, to: 520, attack: .002, tau: .08, gain: .2, shape: 'tri' });
      break;
    case 'damage':
      // Low thump for weight, and a padded knock in the mids so it reads on small speakers too.
      tone(x, rate, { start: 0, dur: .3, from: 110, to: 50, attack: .002, tau: .05, gain: .3 });
      band(x, rate, rng, { start: 0, dur: .2, mode: 'bp', freq: 520, q: .9, attack: .001, tau: .03, gain: 1.4 });
      band(x, rate, rng, { start: .002, dur: .08, mode: 'bp', freq: 1600, attack: .0005, tau: .012, gain: .45 });
      break;
    case 'heart':
      for (const [t, g] of [[0, 1], [.17, .7]] as const) {
        tone(x, rate, { start: t, dur: .18, from: 68, to: 46, attack: .004, tau: .045, gain: g });
        band(x, rate, rng, { start: t, dur: .1, mode: 'bp', freq: 260, q: 1.2, attack: .004, tau: .025, gain: g * 1.6 });
      }
      break;
    case 'respawn': {
      const notes = [NOTE(-2), NOTE(2), NOTE(5), NOTE(9)]; // G4 B4 D5 F#5
      notes.forEach((f, i) => pluck(x, rate, rng, i * .07, f, .8, .35, .6));
      grains(x, rate, rng, .2, .6, 60, .03, .0004, u => 1 - u);
      svf(x, rate, 'hp', 150);
      break;
    }
    case 'upgrade':
      [NOTE(3), NOTE(7), NOTE(10)].forEach((f, i) => mallet(x, rate, rng, i * .08, f, .5, .25));
      break;
    case 'storm-bite':
      tone(x, rate, { start: 0, dur: .35, from: 80, to: 38, attack: .003, tau: .08, gain: .6 });
      band(x, rate, rng, { start: 0, dur: .25, mode: 'bp', freq: 420, attack: .01, tau: .05, gain: .8 });
      { const c = buffer(rate, .3); grains(c, rate, rng, .01, .15, 300, .6, .0003); svf(c, rate, 'bp', 3200, .8); mix(x, c, 0, 1); }
      break;
    case 'pick-weapon':
      band(x, rate, rng, { start: 0, dur: .08, mode: 'bp', freq: 2000, q: 1.2, attack: .01, tau: .015, gain: .5 });
      metal(.03, [[2600, .02, .4], [4100, .01, .2]], 3500, .8);
      metal(.11, [[1900, .025, .5], [3300, .012, .25]], 2800, 1);
      break;
    case 'pick-ammo':
      for (let i = 0; i < 6; i++) metal(i * .022 + rng.range(0, .01), [[rng.range(3200, 4800), .02, .25], [rng.range(6000, 7200), .01, .1]], 5000, .5);
      break;
    case 'pick-armor':
      grains(x, rate, rng, 0, .16, 1800, .5, .0004, u => Math.sin(Math.PI * u));
      svf(x, rate, 'bp', 2500, .8);
      metal(.17, [[900, .03, .4], [1800, .015, .2]], 1500, .7);
      break;
    case 'pick-helmet':
      modes(x, rate, 0, [[420, .08, .5], [1150, .05, .3], [2300, .03, .15]], .0008);
      band(x, rate, rng, { start: 0, dur: .05, mode: 'bp', freq: 1500, attack: .0005, tau: .006, gain: .3 });
      break;
    case 'pick-item':
      grains(x, rate, rng, 0, .12, 900, .4, .0005, u => 1 - u * .5);
      svf(x, rate, 'bp', 4000, .8);
      tone(x, rate, { start: .05, dur: .1, from: 700, to: 950, attack: .004, tau: .03, gain: .15 });
      break;
    case 'rare-1': [NOTE(7), NOTE(12)].forEach((f, i) => bell(x, rate, i * .06, f, .4, .3)); break;
    case 'rare-2': [NOTE(7), NOTE(11), NOTE(14)].forEach((f, i) => bell(x, rate, i * .06, f, .4, .32)); break;
    case 'rare-3': [NOTE(7), NOTE(11), NOTE(14), NOTE(19)].forEach((f, i) => bell(x, rate, i * .065, f, .4, .4)); grains(x, rate, rng, .2, .7, 50, .02, .0003, u => 1 - u); break;
    case 'chest':
      creak(x, rate, rng, 0, .38, 110, .5);
      modes(x, rate, .4, [[240, .06, .4], [610, .03, .2]], .001); // lid falls open
      [NOTE(7), NOTE(11), NOTE(14), NOTE(19)].forEach((f, i) => bell(x, rate, .45 + i * .06, f, .22, .35));
      break;
    case 'use-bandage': grains(x, rate, rng, 0, .22, 1400, .4, .0004, u => Math.sin(Math.PI * u)); svf(x, rate, 'bp', 3000, .7); [NOTE(0), NOTE(4), NOTE(7)].forEach((f, i) => mallet(x, rate, rng, .24 + i * .07, f, .3, .25)); break;
    case 'use-medkit': grains(x, rate, rng, 0, .18, 2200, .35, .0003); svf(x, rate, 'bp', 3500, .9); [NOTE(-2), NOTE(2), NOTE(5), NOTE(10)].forEach((f, i) => mallet(x, rate, rng, .2 + i * .07, f, .3, .28)); break;
    case 'use-guarana':
      metal(0, [[3200, .01, .3]], 4000, .6);
      band(x, rate, rng, { start: .01, dur: .4, mode: 'hp', freq: 3500, attack: .003, tau: .09, gain: .5 });
      tone(x, rate, { start: .12, dur: .25, from: 420, to: 1100, glide: .2, attack: .01, tau: .08, gain: .25, shape: 'tri' });
      break;
    case 'use-acai': [NOTE(12), NOTE(16), NOTE(19), NOTE(24)].forEach((f, i) => bell(x, rate, i * .06, f, .3, .3)); band(x, rate, rng, { start: 0, dur: .4, mode: 'hp', freq: 5000, attack: .08, tau: .1, gain: .1 }); break;
    case 'use-rapadura':
      for (const t of [0, .16]) { grains(x, rate, rng, t, .07, 2500, .6, .0004, u => 1 - u); }
      svf(x, rate, 'lp', 2500);
      tone(x, rate, { start: .3, dur: .12, from: 520, to: 620, attack: .02, tau: .04, gain: .1 }); // a pleased chirp
      break;
    case 'supply-incoming':
      bell(x, rate, 0, NOTE(7), .5, .45); bell(x, rate, .22, NOTE(3), .5, .6); // "bing-bong"
      tone(x, rate, { start: .1, dur: 1.2, from: 85, to: 92, attack: .4, tau: .35, gain: .08, shape: 'saw' });
      svf(x, rate, 'lp', 3000);
      break;
    case 'supply-land':
      tone(x, rate, { start: 0, dur: .5, from: 110, to: 42, attack: .002, tau: .1, gain: .9 });
      band(x, rate, rng, { start: 0, dur: .4, mode: 'lp', freq: 700, attack: .002, tau: .07, gain: .8, brown: true });
      for (let i = 0; i < 5; i++) metal(rng.range(.03, .3), [[rng.range(600, 1400), .03, .2]], 1500, .3);
      band(x, rate, rng, { start: .05, dur: .8, mode: 'lp', freq: 500, attack: .05, tau: .2, gain: .3 });
      break;
    case 'supply-open':
      metal(0, [[1600, .02, .4], [2800, .012, .2]], 2200, .7);
      creak(x, rate, rng, .04, .22, 150, .3);
      [NOTE(3), NOTE(7), NOTE(10)].forEach((f, i) => bell(x, rate, .15 + i * .07, f, .25, .3));
      break;
    case 'zone-warn': {
      // A low conch-like horn swell, the storm is moving.
      const h = buffer(rate, 2.2);
      tone(h, rate, { start: 0, dur: 2.1, from: 73.4, to: 69.3, attack: .6, tau: .7, gain: .5, shape: 'saw' });
      tone(h, rate, { start: 0, dur: 2.1, from: 110, to: 104, attack: .7, tau: .6, gain: .25, shape: 'saw' });
      svf(h, rate, 'lp', t => 300 + 900 * Math.sin(Math.PI * Math.min(1, t / 2)), 1.2);
      mix(x, h, 0, 1);
      band(x, rate, rng, { start: .2, dur: 2, mode: 'lp', freq: 180, attack: .8, tau: .5, gain: .4, brown: true });
      break;
    }
    case 'bounce':
      tone(x, rate, { start: 0, dur: .15, from: 90, to: 230, attack: .003, tau: .06, gain: .45 });
      modes(x, rate, .01, [[rng.range(620, 700), .12, .15], [1350, .06, .06]], .002); // the springs
      tone(x, rate, { start: .09, dur: .3, from: 240, to: 110, attack: .004, tau: .07, gain: .45, shape: 'tri', vibrato: [18, .05] });
      band(x, rate, rng, { start: 0, dur: .12, mode: 'lp', freq: 520, attack: .004, tau: .025, gain: .4 });
      break;
    case 'poof':
      band(x, rate, rng, { start: 0, dur: .35, mode: 'lp', freq: 700, attack: .01, tau: .07, gain: .9 });
      tone(x, rate, { start: .01, dur: .15, from: 330, to: 720, attack: .005, tau: .04, gain: .25 });
      break;
    case 'chute-open':
      band(x, rate, rng, { start: 0, dur: .5, mode: 'bp', freq: t => 300 + 900 * Math.min(1, t / .1), q: .7, attack: .02, tau: .08, gain: 1 });
      tone(x, rate, { start: .05, dur: .3, from: 120, to: 60, attack: .01, tau: .08, gain: .5 });
      band(x, rate, rng, { start: .1, dur: .6, mode: 'bp', freq: 450, q: .9, attack: .02, tau: .15, gain: .3 });
      break;
    case 'ui-hover': mallet(x, rate, rng, 0, NOTE(10), .35, .06); break;
    case 'ui-click': mallet(x, rate, rng, 0, NOTE(12), .6, .1); band(x, rate, rng, { start: 0, dur: .02, mode: 'bp', freq: 2500, attack: .0003, tau: .002, gain: .2 }); break;
    case 'ui-back': mallet(x, rate, rng, 0, NOTE(5), .6, .1); break;
    case 'ui-tick': modes(x, rate, 0, [[1180, .03, .6], [2650, .012, .25]], .0005); break; // woodblock
    case 'ui-go': {
      // Samba whistle (apito): two trilled blasts.
      for (const [t, d] of [[0, .16], [.22, .38]] as const) {
        tone(x, rate, { start: t, dur: d, from: 2950, attack: .01, tau: d * .8, gain: .35, vibrato: [32, .035] });
        band(x, rate, rng, { start: t, dur: d, mode: 'hp', freq: 4500, attack: .01, tau: d * .6, gain: .06 });
      }
      break;
    }
    case 'ui-notice': mallet(x, rate, rng, 0, NOTE(7), .4, .2); mallet(x, rate, rng, .08, NOTE(12), .35, .25); break;
    case 'thunder':
      for (let i = 0; i < 9; i++) {
        const t = .02 + 2 * (i / 9) ** 1.4 + rng.range(0, .08);
        band(x, rate, rng, { start: t, dur: .9, mode: 'lp', freq: 400 * (1 - i / 14), attack: rng.range(.02, .08), tau: rng.range(.15, .35), gain: .8 * Math.exp(-t / 1.2), brown: true });
      }
      band(x, rate, rng, { start: 0, dur: .08, mode: 'bp', freq: 1400, attack: .001, tau: .015, gain: .2 });
      break;
    case 'crackle':
      grains(x, rate, rng, 0, .25, 220, .7, .0003, u => Math.exp(-u * 2));
      svf(x, rate, 'bp', 3200, .8);
      break;
  }
  return fadeOut(x, rate, .04);
}

// ---- Capybara voices: whistles, clicks and purrs, never words.
export type VoiceId = 'hurt' | 'spot' | 'elimination' | 'wave' | 'cheer' | 'purr';
export const VOICE_IDS: readonly VoiceId[] = ['hurt', 'spot', 'elimination', 'wave', 'cheer', 'purr'];

function whistle(x: Float32Array, rate: number, rng: Rng, t: number, from: number, to: number, dur: number, gain: number) {
  const layer = buffer(rate, dur + .02);
  tone(layer, rate, { start: 0, dur, from, to, glide: dur, attack: dur * .15, tau: dur * .45, gain, vibrato: [rng.range(18, 26), .012] });
  tone(layer, rate, { start: 0, dur, from: from * 2, to: to * 2, glide: dur, attack: dur * .15, tau: dur * .35, gain: gain * .25 });
  band(layer, rate, rng, { start: 0, dur, mode: 'bp', freq: (from + to), q: 1, attack: dur * .15, tau: dur * .3, gain: gain * .08 });
  mix(x, layer, Math.round(t * rate), 1);
}

export function voice(id: VoiceId, rate: number, rng: Rng): Float32Array {
  const x = buffer(rate, id === 'purr' ? 1.4 : id === 'cheer' ? .8 : .5), j = (f: number) => f * rng.range(.93, 1.07);
  switch (id) {
    case 'hurt': whistle(x, rate, rng, 0, j(1100), j(700), .16, .8); break;
    case 'spot':
      // A short guttural alarm bark, the capybara's "hm!".
      tone(x, rate, { start: 0, dur: .12, from: j(260), to: j(210), attack: .006, tau: .035, gain: .8, shape: 'saw' });
      svf(x, rate, 'bp', 700, 1.2);
      whistle(x, rate, rng, .08, j(900), j(1150), .1, .35);
      break;
    case 'elimination': whistle(x, rate, rng, 0, j(1250), j(560), .34, .8); break;
    case 'wave': whistle(x, rate, rng, 0, j(800), j(1250), .12, .7); whistle(x, rate, rng, .14, j(1150), j(1350), .14, .6); break;
    case 'cheer': [0, .15, .3].forEach((t, i) => whistle(x, rate, rng, t, j(900 + i * 150), j(1300 + i * 150), .13, .6)); break;
    case 'purr': {
      // Capybaras purr: a soft low pulse train, content and slow.
      const pulses = Math.floor(1.3 * 24);
      for (let i = 0; i < pulses; i++) band(x, rate, rng, { start: i / 24, dur: .05, mode: 'bp', freq: j(220), q: 1.5, attack: .006, tau: .012, gain: .6 * Math.sin(Math.PI * i / pulses) });
      break;
    }
  }
  return fadeOut(x, rate, .03);
}
