// Review scenarios for tools/vfx/capture.mjs. Frame `at` values are 60 Hz steps.
// Aim heights are metres above the terrain at the aim point.
const strip = (...at) => at.map(n => ({ at: n }));
const shoot = (actor, aim, opts = {}) => ({ call: 'shoot', args: [actor, aim, opts] });
const call = (name, ...args) => ({ call: name, args });
const ev = (type, fields) => ({ type, ...fields });
const SHOT = strip(1, 2, 3, 5, 8, 12, 18, 26);
// Vila: open grass south of the stone house, facing north (+z).
const PLAZA = { x: -41, z: 18, yaw: Math.PI, pitch: 0 };
const bot = (id, x, z, extra = {}) => ({ id, x, z, yaw: 0, weapon: 'smg', ...extra });
const hit = (dist, head) => ({
  scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 18 + dist)] },
  events: [shoot('practice', { x: -41, y: head ? 1.6 : 1.1, z: 18 + dist }, { target: 'bento', head, amount: head ? 52 : 26 })],
  frames: strip(1, 2, 4, 6, 9, 13, 19, 27), still: 2,
});
const elimination = dist => ({
  scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 18 + dist)] },
  events: [shoot('practice', { x: -41, y: 1.1, z: 18 + dist }, { target: 'bento' }), ev('kill', { actor: 'practice', target: 'bento', weapon: 'm4' })],
  frames: [{ at: 1, patch: { bento: { alive: false } } }, ...strip(4, 8, 14, 22, 32, 46, 64)], still: 2,
});
// Along Rua Direita, with both the observer and distant actors on the street.
const FIELD = { x: -38, z: -35.5, yaw: -Math.PI / 2, pitch: -.02 };
const farAim = (dist, y) => ({ x: FIELD.x + dist, y, z: FIELD.z });
const farBot = (id, dist, extra = {}) => ({ id, x: FIELD.x + dist, z: FIELD.z, yaw: Math.PI / 2, weapon: 'smg', ...extra });
const hitFar = (dist, head) => ({
  scene: { ...FIELD, weapon: 'm4', actors: [farBot('bento', dist)] },
  events: [shoot('practice', farAim(dist, head ? 1.6 : 1.1), { target: 'bento', head, amount: head ? 52 : 26 })],
  frames: strip(1, 2, 4, 6, 9, 13, 19, 27), still: 2,
});
const surface = (scene, aim) => ({ scene: { weapon: 'm4', ...scene }, events: [shoot('practice', aim)], frames: strip(1, 3, 6, 10, 15, 22, 60, 230), still: 2 });
const storm = (zone, extra = {}) => ({ scene: { ...PLAZA, pitch: .05, weapon: 'm4', zone: { radius: 95, ...zone }, ...extra }, frames: strip(30), still: 0 });

export const SCENARIOS = {
  // First person: flash at the barrel tip, tracer, casing, impact and mark.
  'fp-m4-wall': { scene: { x: -41, z: 22, yaw: Math.PI, pitch: .02, weapon: 'm4' }, events: [shoot('practice', { x: -40.6, y: 2.4, z: 32 })], frames: SHOT, still: 1 },
  'fp-m4-ads': { scene: { x: -41, z: 22, yaw: Math.PI, pitch: .02, weapon: 'm4', ads: true }, events: [shoot('practice', { x: -41, y: 1.6, z: 32 })], frames: SHOT, still: 1 },
  'fp-shotgun-wall': { scene: { x: -41, z: 25, yaw: Math.PI, pitch: .02, weapon: 'shotgun' }, events: [shoot('practice', { x: -41, y: 1.5, z: 32 })], frames: SHOT, still: 1 },
  'fp-sniper-far': { scene: { ...PLAZA, weapon: 'sniper' }, events: [shoot('practice', { x: -41, y: 3, z: 32 })], frames: SHOT, still: 1 },
  // Third person: a bot fires past the player (red tracer), close and far.
  'tp-fire-10m': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 28, { weapon: 'm4' })] }, events: [shoot('bento', { x: -39.6, y: 1.5, z: 10 })], frames: SHOT, still: 0 },
  'tp-fire-40m': { scene: { ...FIELD, weapon: 'm4', actors: [farBot('bento', 40, { weapon: 'm4' })] }, events: [shoot('bento', farAim(-8, 1.5))], frames: SHOT, still: 0 },
  'tp-casings-3m': {
    scene: { x: -41, z: 18, yaw: Math.PI, pitch: -.35, weapon: 'm4', actors: [bot('bento', -42.2, 21, { weapon: 'm4', yaw: -Math.PI / 2 })] },
    events: [shoot('bento', { x: -30, y: 1.3, z: 21 })],
    frames: [...strip(2, 8, 16), { at: 20, events: [shoot('bento', { x: -30, y: 1.3, z: 21.3 })] }, ...strip(30, 50, 80, 100)], still: 7,
  },
  // Surface review uses the verified c-impact poses below.
  // Hits and eliminations.
  'hit-body-6m': hit(6, false), 'hit-head-6m': hit(6, true), 'hit-body-30m': hitFar(30, false), 'hit-head-30m': hitFar(30, true),
  'armor-break-6m': { ...hit(6, false), events: [shoot('practice', { x: -41, y: 1.1, z: 24 }, { target: 'bento', armorBreak: true })] },
  'armor-break-fp': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 24)] }, events: [shoot('bento', { x: -41, y: 1.2, z: 18 }, { target: 'practice', armorBreak: true })], frames: strip(1, 3, 6, 10, 15, 20, 26, 32), still: 2 },
  'elimination-6m': elimination(6),
  'elimination-30m': {
    scene: { ...FIELD, weapon: 'm4', actors: [farBot('bento', 30)] },
    events: [shoot('practice', farAim(30, 1.1), { target: 'bento' }), ev('kill', { actor: 'practice', target: 'bento', weapon: 'm4' })],
    frames: [{ at: 1, patch: { bento: { alive: false } } }, ...strip(4, 8, 14, 22, 32, 46, 64)], still: 2,
  },
  // Current fazenda veranda pickup and chest (c-chest below).
  'pickup-rarity': {
    scene: { x: 49.2, y: 5.51, z: 60, yaw: Math.PI / 2, pitch: -.6, weapon: 'pistol', loot: [{ id: 'loot-1965', rarity: 3 }] },
    events: [ev('pickup', { actor: 'practice', item: 'loot-1965' }), call('loot', 'loot-1965', { active: false })],
    frames: strip(2, 6, 10, 16, 24, 32, 40, 48), still: 2,
  },
  'heal-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'medkit' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'armor-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'acai' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'boost-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'guarana' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'heal-fp': { scene: { ...PLAZA, weapon: 'm4' }, events: [ev('use', { actor: 'practice', item: 'bandage' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  // Death cam: a bot 22 m away eliminates you; the view rises and frames it for 1.8 s.
  'death-cam': {
    scene: { ...FIELD, weapon: 'm4', actors: [farBot('bento', 22, { weapon: 'm4' })] },
    events: [ev('kill', { actor: 'bento', target: 'practice', weapon: 'm4', distance: 22 })],
    frames: [{ at: 1, patch: { practice: { alive: false } } }, ...strip(8, 16, 27, 40, 60, 80, 105)], still: 5,
  },
  // Bot pre-attack tell.
  'alert-15m': { scene: { ...PLAZA, actors: [bot('bento', -38, 33)] }, events: [ev('alert', { actor: 'bento', target: 'practice', delay: .6 })], frames: strip(2, 5, 8, 14, 24, 36, 48, 62), still: 4 },
  'alert-40m': { scene: { ...FIELD, actors: [farBot('bento', 40)] }, events: [ev('alert', { actor: 'bento', target: 'practice', delay: .6 })], frames: strip(2, 5, 8, 14, 24, 36, 48, 62), still: 4 },
  // The warmed c-storm pose below replaces the old unbuilt wall frames.
  // Combat pass (2026-09-30): poses found on the current island by a ray search, each looking straight at its surface 6 to 11 m away.
  'c-impact-stone': surface({ x: -6, z: 76.85, yaw: 4.597, pitch: -.238 }, { x: .67, y: 0, z: 77.63 }),
  'c-impact-wood': surface({ x: -70.56, z: -17.05, yaw: 5.801, pitch: -.083 }, { x: -66.39, y: .73, z: -25.01 }),
  'c-impact-metal': surface({ x: -94.05, z: 16.57, yaw: 2.442, pitch: -.172 }, { x: -99.19, y: .24, z: 22.67 }),
  'c-impact-sand': surface({ x: 97.68, z: 35.29, yaw: .886, pitch: -.321 }, { x: 92.26, y: 0, z: 30.86 }),
  'c-impact-dirt': surface({ x: 31.04, z: -54.91, yaw: 5.703, pitch: -.027 }, { x: 36.22, y: 0, z: -62.82 }),
  'c-impact-foliage': surface({ x: -47.47, z: 94.6, yaw: .654, pitch: -.042 }, { x: -54.04, y: 0, z: 86.02 }),
  'c-impact-water': surface({ x: -61.44, z: -6.01, yaw: 1.853, pitch: -.295 }, { x: -70.57, y: .35, z: -3.37 }),
  // First-person muzzle flashes per gun, hip and aimed, against the same Rosário street.
  ...Object.fromEntries(['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'dmr', 'sniper'].flatMap(weapon => [false, true].map(ads => [
    `c-fp-${weapon}${ads ? '-ads' : ''}`,
    { scene: { x: 23.3, z: 32.6, yaw: 0, pitch: -.02, weapon, ads }, events: [shoot('practice', { x: 23.3, y: 1.5, z: 12 })], frames: strip(1, 2, 3, 4, 6, 9, 14, 24), still: 0 },
  ]))),
  // Coconut blasts at 6 and 14 m, seen from the player.
  'c-coco-6m': { scene: { ...PLAZA, pitch: -.12, weapon: 'm4' }, events: [call('blastAt', -41, 24)], frames: strip(1, 2, 4, 8, 14, 22, 36, 60), still: 2 },
  'c-coco-14m': { scene: { ...PLAZA, pitch: -.05, weapon: 'm4' }, events: [call('blastAt', -41, 32)], frames: strip(1, 2, 4, 8, 14, 22, 36, 60), still: 2 },
  // An enemy 10 m away across the Vila plaza fires past the player's head (hostile tracer).
  'c-enemy-fire': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 28, { weapon: 'm4' })] }, events: [shoot('bento', { x: -40.6, y: 1.6, z: 8 })], frames: strip(1, 2, 3, 5, 8, 12, 18, 26), still: 1 },
  'c-hit-8m': { scene: { ...PLAZA, pitch: -.03, weapon: 'm4', actors: [bot('bento', -41, 26, { yaw: Math.PI })] }, events: [shoot('practice', { x: -41, y: 1.1, z: 26 }, { target: 'bento', amount: 18 })], frames: strip(1, 2, 3, 5, 8, 12, 18, 26), still: 1 },
  'c-head-8m': { scene: { ...PLAZA, pitch: -.03, weapon: 'm4', actors: [bot('bento', -41, 26, { yaw: Math.PI })] }, events: [shoot('practice', { x: -41, y: 1.6, z: 26 }, { target: 'bento', head: true, amount: 29 })], frames: strip(1, 2, 3, 5, 8, 12, 18, 26), still: 1 },
  'c-chest': { scene: { x: -35.28, z: 80.02, yaw: .785, pitch: -.42, weapon: 'pistol' }, events: [ev('pickup', { actor: 'practice', item: 'chest-1970' }), call('opened', 'chest-1970')], frames: strip(2, 6, 10, 16, 24, 32, 40, 48), still: 2 },
  // The storm wall 10 m ahead after its edge wisps have built up for two seconds.
  'c-storm': { ...storm({ x: -41, z: 18 - 85 }), frames: strip(120, 150), still: 1 },
};
