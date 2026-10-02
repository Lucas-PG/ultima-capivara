// Contact samples include every authored reload key as well as the fixed cadence between them.
import { tsImport } from 'tsx/esm/api';
const anims = await tsImport('../../src/render/viewmodel-anims.ts', import.meta.url);
const { WEAPONS } = await tsImport('../../src/shared/weapons.ts', import.meta.url);
const { weaponShotDuration } = await tsImport('../../src/shared/weapon-presentation.ts', import.meta.url);
export const HOLDING_WEAPONS = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'coco', 'machete'];
export const reloadKeys = (weapon, empty = true) => {
  const fn = { pistol: anims.pistolReload, smg: anims.smgReload, m4: anims.m4Reload, dmr: anims.dmrReload, sniper: anims.sniperReload }[weapon];
  return fn ? fn(empty) : weapon === 'coco' ? anims.cocoReload(empty ? 0 : 1) : anims.RELOADS[weapon] ?? [];
};
export function holdingStates(weapon, step = .05) {
  const rows = new Map();
  const add = (action, t, key = false) => {
    t = +t.toFixed(6); const id = `${action}:${t}`, previous = rows.get(id);
    rows.set(id, { action, t, key: key || previous?.key || false });
  };
  const run = (action, end, dt = step) => { for (let t = 0; t <= end + 1e-8; t += dt) add(action, t); };
  add('hip', 0); add('aimed', 0);
  for (const action of ['ads', 'unaim', 'walk', 'strafe', 'sprint']) run(action, .6, .1);
  run('crouch', .3); run('jump', .5, .1); run('land', .3);
  run('holster', .15, .025); run('draw', .7);
  run('inspect', 1.8, .1);
  for (const key of (anims.SHORT_INSPECTS[weapon] ?? anims.LONG_INSPECTS[weapon] ?? [])) add('inspect', key.t * 1.8, true);
  if (weapon === 'machete') for (const action of ['swing-right', 'swing-left', 'chop']) run(action, .6);
  else {
    run('fire', weapon === 'sniper' ? 1.3 : weapon === 'shotgun' ? 1.1 : Math.max(.3, weaponShotDuration(weapon) + .1));
    if (weapon === 'sniper') for (const key of anims.SNIPER_CYCLE) add('fire', key.t * weaponShotDuration(weapon), true);
    for (const empty of [true, false]) {
      const action = empty ? 'reload' : 'reload-partial', duration = WEAPONS[weapon].reload;
      run(action, duration + .1);
      for (const key of reloadKeys(weapon, empty)) add(action, key.t * duration, true);
    }
    if (weapon === 'shotgun') run('reload-chain', 2.4);
  }
  return [...rows.values()];
}
