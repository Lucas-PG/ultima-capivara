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
const surface = (scene, aim) => ({ scene: { weapon: 'm4', ...scene }, events: [shoot('practice', aim)], frames: strip(1, 3, 6, 10, 15, 22, 60, 230), still: 2 });
const storm = (zone, extra = {}) => ({ scene: { ...PLAZA, pitch: .05, weapon: 'm4', zone: { radius: 95, ...zone }, ...extra }, frames: strip(30), still: 0 });

export const SCENARIOS = {
  // First person: flash at the barrel tip, tracer, casing, impact and mark.
  'fp-m4-wall': { scene: { x: -41, z: 22, yaw: Math.PI, pitch: .02, weapon: 'm4' }, events: [shoot('practice', { x: -40.6, y: 2.4, z: 32 })], frames: SHOT, still: 1 },
  'fp-m4-ads': { scene: { x: -41, z: 22, yaw: Math.PI, pitch: .02, weapon: 'm4', ads: true }, events: [shoot('practice', { x: -41, y: 1.6, z: 32 })], frames: SHOT, still: 1 },
  'fp-shotgun-wall': { scene: { x: -41, z: 25, yaw: Math.PI, pitch: .02, weapon: 'shotgun' }, events: [shoot('practice', { x: -41, y: 1.5, z: 32 })], frames: SHOT, still: 1 },
  'fp-pistol-interior': { scene: { x: -76, z: 33, yaw: Math.PI / 2, pitch: 0, weapon: 'pistol' }, events: [shoot('practice', { x: -82, y: 1.5, z: 32.6 })], frames: SHOT, still: 1 },
  'fp-sniper-far': { scene: { ...PLAZA, weapon: 'sniper' }, events: [shoot('practice', { x: -41, y: 3, z: 32 })], frames: SHOT, still: 1 },
  // Third person: a bot fires past the player (red tracer), close and far.
  'tp-fire-10m': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 28, { weapon: 'm4' })] }, events: [shoot('bento', { x: -39.6, y: 1.5, z: 10 })], frames: SHOT, still: 0 },
  'tp-fire-40m': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -48, 58, { weapon: 'm4' })] }, events: [shoot('bento', { x: -40, y: 1.5, z: 10 })], frames: SHOT, still: 0 },
  'tp-casings-3m': {
    scene: { x: -41, z: 18, yaw: Math.PI, pitch: -.35, weapon: 'm4', actors: [bot('bento', -42.2, 21, { weapon: 'm4', yaw: -Math.PI / 2 })] },
    events: [shoot('bento', { x: -30, y: 1.3, z: 21 })],
    frames: [...strip(2, 8, 16), { at: 20, events: [shoot('bento', { x: -30, y: 1.3, z: 21.3 })] }, ...strip(30, 50, 80, 100)], still: 7,
  },
  // Surface-aware impacts.
  'impact-stone': surface({ x: -41, z: 25, yaw: Math.PI, pitch: 0 }, { x: -40.6, y: 1.5, z: 32 }),
  'impact-wood': surface({ x: 2, z: -91, yaw: 0, pitch: 0 }, { x: 2, y: 1.4, z: -100 }),
  'impact-metal': surface({ x: 3, z: -15, yaw: 0, pitch: 0 }, { x: 3, y: 1.2, z: -24 }),
  'impact-foliage': surface({ ...PLAZA }, { x: -41, y: 0, z: 23 }),
  'impact-sand': surface({ x: -47, z: 6, yaw: 0, pitch: -.3 }, { x: -47, y: 0, z: 1 }),
  'impact-water': surface({ x: -34, z: 26, yaw: 0, pitch: -.3 }, { x: -34, y: 0, z: 12 }),
  'impact-dirt': surface({ x: -104, z: -59, yaw: Math.PI / 2, pitch: -.3 }, { x: -110, y: 0, z: -59 }),
  // Hits and eliminations.
  'hit-body-6m': hit(6, false), 'hit-head-6m': hit(6, true), 'hit-body-30m': hit(30, false), 'hit-head-30m': hit(30, true),
  'armor-break-6m': { ...hit(6, false), events: [shoot('practice', { x: -41, y: 1.1, z: 24 }, { target: 'bento', armorBreak: true })] },
  'armor-break-fp': { scene: { ...PLAZA, weapon: 'm4', actors: [bot('bento', -41, 24)] }, events: [shoot('bento', { x: -41, y: 1.2, z: 18 }, { target: 'practice', armorBreak: true })], frames: strip(1, 3, 6, 10, 15, 20, 26, 32), still: 2 },
  'elimination-6m': elimination(6), 'elimination-30m': elimination(30),
  // Loot, chest and consumables (bakery interior).
  'pickup-rarity': {
    scene: { x: -77, z: 31.5, yaw: Math.PI, pitch: -.5, weapon: 'pistol', loot: [{ id: 'loot-122', rarity: 3 }] },
    events: [ev('pickup', { actor: 'practice', item: 'loot-122' }), call('loot', 'loot-122', { active: false })],
    frames: strip(2, 6, 10, 16, 24, 32, 40, 48), still: 2,
  },
  'chest-open': {
    scene: { x: -80, z: 33.5, yaw: Math.PI, pitch: -.45, weapon: 'pistol' },
    events: [ev('pickup', { actor: 'practice', item: 'chest-121' }), call('opened', 'chest-121')],
    frames: strip(2, 6, 10, 16, 24, 32, 40, 48), still: 2,
  },
  'heal-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'medkit' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'armor-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'acai' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'boost-tp': { scene: { ...PLAZA, actors: [bot('bento', -41, 23)] }, events: [ev('use', { actor: 'bento', item: 'guarana' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  'heal-fp': { scene: { ...PLAZA, weapon: 'm4' }, events: [ev('use', { actor: 'practice', item: 'bandage' })], frames: strip(3, 8, 14, 20, 28, 36, 44, 52), still: 3 },
  // Bot pre-attack tell.
  'alert-15m': { scene: { ...PLAZA, actors: [bot('bento', -38, 33)] }, events: [ev('alert', { actor: 'bento', target: 'practice', delay: .6 })], frames: strip(2, 5, 8, 14, 24, 36, 48, 62), still: 4 },
  'alert-40m': { scene: { ...PLAZA, actors: [bot('bento', -46, 58)] }, events: [ev('alert', { actor: 'bento', target: 'practice', delay: .6 })], frames: strip(2, 5, 8, 14, 24, 36, 48, 62), still: 4 },
  // Storm wall: 150 m and 10 m ahead from inside, and 10 m outside looking back in.
  'storm-150m': storm({ x: -41, z: 18 - 40, radius: 190 }),
  'storm-10m': storm({ x: -41, z: 18 - 85 }),
  'storm-outside': { ...storm({ x: -41, z: 18 + 105 }), events: [], frames: [{ at: 2 }, { at: 40, events: [ev('damage', { actor: '', target: 'practice', amount: 4, head: false, pos: { x: -41, y: 3, z: 18 } })] }, ...strip(44, 50, 60, 70)], still: 0 },
};
